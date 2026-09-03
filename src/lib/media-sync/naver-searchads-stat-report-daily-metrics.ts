import { setTimeout as delay } from "node:timers/promises";

import type { NaverSearchAdsCredentials } from "./connection-credentials";
import type {
  FetchNaverSearchAdsEntityDailyStatsInput,
  FetchNaverSearchAdsKeywordDailyStatsInput,
  NaverSearchAdsEntityDailyStatsRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsKeywordDailyStatsRecord,
  NaverSearchAdsKeywordDailyStatsResult,
} from "./naver-searchads-api";
import {
  createNaverSearchAdsStatReport,
  downloadNaverSearchAdsStatReport,
  getNaverSearchAdsStatReport,
  listNaverSearchAdsStatReports,
  type NaverSearchAdsStatReportRecord,
  type NaverSearchAdsStatReportType,
} from "./naver-searchads-stat-reports-api";

const MAX_DATE_WINDOW_DAYS = 31;
const REPORT_POLL_INTERVAL_MS = 1_000;
const MAX_REPORT_POLL_ATTEMPTS = 60;
const MAX_REPORT_BUILD_MS = 3 * 60 * 1_000;
const READY_CACHE_TTL_MS = 60 * 60 * 1_000;
const FAILED_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 4;

const AD_COLUMN_COUNT = 14;
const AD_CONVERSION_COLUMN_COUNT = 13;

const AD_ADGROUP_COLUMN = 4;
const AD_KEYWORD_COLUMN = 5;
const AD_IMPRESSION_COLUMN = 10;
const AD_CLICK_COLUMN = 11;
const AD_COST_COLUMN = 12;
const AD_SUM_RANK_COLUMN = 13;

const CONVERSION_ADGROUP_COLUMN = 4;
const CONVERSION_KEYWORD_COLUMN = 5;
const CONVERSION_COUNT_COLUMN = 12;
const CONVERSION_AMOUNT_COLUMN = 13;

type DailyMetrics = {
  impCnt: number;
  clkCnt: number;
  salesAmt: number;
  ccnt: number;
  convAmt: number;
  sumRank: number;
  hasPerformanceRow: boolean;
  hasConversionRow: boolean;
};

type DailyMetricsByEntity =
  Map<string, Map<string, DailyMetrics>>;

type DailyMetricsIndex = {
  keyword: DailyMetricsByEntity;
  adgroup: DailyMetricsByEntity;
};

type CacheEntry = {
  state: "pending" | "ready" | "failed";
  settledAt: number | null;
  promise: Promise<DailyMetricsIndex>;
};

const CACHE = new Map<string, CacheEntry>();

export type NaverSearchAdsStatReportDailyMetricsErrorCode =
  | "INVALID_INPUT"
  | "COLLECTION_ABORTED"
  | "REPORT_FAILED"
  | "REPORT_BUILD_TIMEOUT"
  | "REPORT_POLL_LIMIT_EXCEEDED"
  | "INVALID_REPORT_SCHEMA";

export class NaverSearchAdsStatReportDailyMetricsError extends Error {
  readonly code:
    NaverSearchAdsStatReportDailyMetricsErrorCode;

  constructor(
    code: NaverSearchAdsStatReportDailyMetricsErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name =
      "NaverSearchAdsStatReportDailyMetricsError";
    this.code = code;
  }
}

function normalizeIsoDate(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "INVALID_INPUT",
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const [yearText, monthText, dayText] =
    value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
  );
  const parsed = new Date(timestamp);

  if (
    !Number.isFinite(timestamp) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "INVALID_INPUT",
      `${fieldName} must be a valid calendar date.`,
    );
  }

  return value;
}

function getCurrentSeoulDate(): string {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).format(new Date());
}

function enumerateDates(input: {
  dateFrom: string;
  dateTo: string;
}): string[] {
  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );
  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  const currentSeoulDate =
    getCurrentSeoulDate();

  if (dateTo >= currentSeoulDate) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "INVALID_INPUT",
      "The StatReport fast path only handles completed historical dates; current-day data must use the exact /stats fallback.",
    );
  }

  const fromMs = Date.parse(
    `${dateFrom}T00:00:00.000Z`,
  );
  const toMs = Date.parse(
    `${dateTo}T00:00:00.000Z`,
  );

  if (fromMs > toMs) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "INVALID_INPUT",
      "dateFrom must not be after dateTo.",
    );
  }

  const result: string[] = [];

  for (
    let timestamp = fromMs;
    timestamp <= toMs;
    timestamp += 86_400_000
  ) {
    result.push(
      new Date(timestamp)
        .toISOString()
        .slice(0, 10),
    );

    if (
      result.length >
      MAX_DATE_WINDOW_DAYS
    ) {
      throw new NaverSearchAdsStatReportDailyMetricsError(
        "INVALID_INPUT",
        `The StatReport fast path supports at most ${MAX_DATE_WINDOW_DAYS} days per collector window.`,
      );
    }
  }

  return result;
}

function assertNotAborted(
  signal: AbortSignal | undefined,
): void {
  if (signal?.aborted) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "COLLECTION_ABORTED",
      "The StatReport fast path was aborted.",
    );
  }
}

function isFailureStatus(
  status: string | null,
): boolean {
  if (!status) {
    return false;
  }

  const normalized =
    status.trim().toUpperCase();

  return (
    normalized.includes("FAIL") ||
    normalized.includes("ERROR")
  );
}

async function waitForReadyReport(input: {
  credentials: NaverSearchAdsCredentials;
  statDate: string;
  reportType: NaverSearchAdsStatReportType;
  reusableReports: readonly NaverSearchAdsStatReportRecord[];
  signal?: AbortSignal;
}): Promise<{
  report: NaverSearchAdsStatReportRecord;
  reused: boolean;
}> {
  assertNotAborted(input.signal);

  const compactStatDate =
    input.statDate.replaceAll("-", "");

  const reusableReport =
    input.reusableReports
      .filter(
        (report) =>
          report.reportType ===
            input.reportType &&
          report.statDate ===
            compactStatDate &&
          Boolean(report.downloadUrl) &&
          !isFailureStatus(
            report.status,
          ),
      )
      .sort(
        (left, right) =>
          right.reportJobId -
          left.reportJobId,
      )[0];

  if (reusableReport) {
    return {
      report: reusableReport,
      reused: true,
    };
  }

  let report =
    await createNaverSearchAdsStatReport({
      credentials: input.credentials,
      statDate: input.statDate,
      reportType: input.reportType,
    });

  for (
    let attempt = 0;
    attempt <= MAX_REPORT_POLL_ATTEMPTS;
    attempt += 1
  ) {
    assertNotAborted(input.signal);

    if (report.downloadUrl) {
      return {
        report,
        reused: false,
      };
    }

    if (isFailureStatus(report.status)) {
      throw new NaverSearchAdsStatReportDailyMetricsError(
        "REPORT_FAILED",
        `Naver Search Ads ${input.reportType} StatReport entered failure status ${report.status}.`,
      );
    }

    if (
      attempt ===
      MAX_REPORT_POLL_ATTEMPTS
    ) {
      break;
    }

    await delay(
      REPORT_POLL_INTERVAL_MS,
      undefined,
      input.signal
        ? { signal: input.signal }
        : undefined,
    );

    report =
      await getNaverSearchAdsStatReport({
        credentials: input.credentials,
        reportJobId: report.reportJobId,
      });
  }

  throw new NaverSearchAdsStatReportDailyMetricsError(
    "REPORT_POLL_LIMIT_EXCEEDED",
    `Naver Search Ads ${input.reportType} StatReport did not become downloadable within the bounded poll limit.`,
  );
}

async function loadReportText(input: {
  credentials: NaverSearchAdsCredentials;
  statDate: string;
  reportType: NaverSearchAdsStatReportType;
  reusableReports: readonly NaverSearchAdsStatReportRecord[];
  signal?: AbortSignal;
}): Promise<string> {
  let ready =
    await waitForReadyReport(input);

  if (!ready.report.downloadUrl) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "REPORT_FAILED",
      `Naver Search Ads ${input.reportType} StatReport is missing its download URL.`,
    );
  }

  try {
    const downloaded =
      await downloadNaverSearchAdsStatReport({
        credentials: input.credentials,
        downloadUrl:
          ready.report.downloadUrl,
      });

    return downloaded.text;
  } catch (error) {
    assertNotAborted(input.signal);

    if (!ready.reused) {
      throw error;
    }
  }

  ready = await waitForReadyReport({
    ...input,
    reusableReports: [],
  });

  if (!ready.report.downloadUrl) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "REPORT_FAILED",
      `Naver Search Ads ${input.reportType} StatReport is missing its download URL.`,
    );
  }

  const downloaded =
    await downloadNaverSearchAdsStatReport({
      credentials: input.credentials,
      downloadUrl:
        ready.report.downloadUrl,
    });

  return downloaded.text;
}

async function loadReusableReports(input: {
  credentials: NaverSearchAdsCredentials;
  signal?: AbortSignal;
}): Promise<NaverSearchAdsStatReportRecord[]> {
  assertNotAborted(input.signal);

  try {
    return await listNaverSearchAdsStatReports({
      credentials: input.credentials,
    });
  } catch {
    assertNotAborted(input.signal);
    return [];
  }
}

function parseReportRows(input: {
  text: string;
  expectedColumns: number;
  reportType: string;
}): string[][] {
  const rows = input.text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(
      (line) => line.trim().length > 0,
    )
    .map((line) => line.split("\t"));

  for (const row of rows) {
    if (
      row.length !==
      input.expectedColumns
    ) {
      throw new NaverSearchAdsStatReportDailyMetricsError(
        "INVALID_REPORT_SCHEMA",
        `${input.reportType} StatReport expected ${input.expectedColumns} columns but received ${row.length}.`,
      );
    }
  }

  return rows;
}

function readStringColumn(
  row: readonly string[],
  oneBasedColumn: number,
): string {
  return String(
    row[oneBasedColumn - 1] ?? "",
  ).trim();
}

function readNumberColumn(
  row: readonly string[],
  oneBasedColumn: number,
): number {
  const value = Number(
    readStringColumn(
      row,
      oneBasedColumn,
    ),
  );

  if (!Number.isFinite(value)) {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "INVALID_REPORT_SCHEMA",
      `StatReport column ${oneBasedColumn} contains a non-numeric value.`,
    );
  }

  return value;
}

function createDailyMetrics(): DailyMetrics {
  return {
    impCnt: 0,
    clkCnt: 0,
    salesAmt: 0,
    ccnt: 0,
    convAmt: 0,
    sumRank: 0,
    hasPerformanceRow: false,
    hasConversionRow: false,
  };
}

function getOrCreateMetrics(input: {
  index: DailyMetricsByEntity;
  entityId: string;
  date: string;
}): DailyMetrics {
  let byDate = input.index.get(
    input.entityId,
  );

  if (!byDate) {
    byDate = new Map();
    input.index.set(
      input.entityId,
      byDate,
    );
  }

  let metrics = byDate.get(input.date);

  if (!metrics) {
    metrics = createDailyMetrics();
    byDate.set(input.date, metrics);
  }

  return metrics;
}

function aggregatePerformanceRows(input: {
  rows: readonly string[][];
  date: string;
  index: DailyMetricsIndex;
}): void {
  for (const row of input.rows) {
    const adgroupId =
      readStringColumn(
        row,
        AD_ADGROUP_COLUMN,
      );
    const keywordId =
      readStringColumn(
        row,
        AD_KEYWORD_COLUMN,
      );

    const impressions =
      readNumberColumn(
        row,
        AD_IMPRESSION_COLUMN,
      );
    const clicks =
      readNumberColumn(
        row,
        AD_CLICK_COLUMN,
      );
    const cost =
      readNumberColumn(
        row,
        AD_COST_COLUMN,
      );
    const sumRank =
      readNumberColumn(
        row,
        AD_SUM_RANK_COLUMN,
      );

    if (adgroupId.startsWith("grp-")) {
      const metrics = getOrCreateMetrics({
        index: input.index.adgroup,
        entityId: adgroupId,
        date: input.date,
      });

      metrics.impCnt += impressions;
      metrics.clkCnt += clicks;
      metrics.salesAmt += cost;
      metrics.sumRank += sumRank;
      metrics.hasPerformanceRow = true;
    }

    if (keywordId.startsWith("nkw-")) {
      const metrics = getOrCreateMetrics({
        index: input.index.keyword,
        entityId: keywordId,
        date: input.date,
      });

      metrics.impCnt += impressions;
      metrics.clkCnt += clicks;
      metrics.salesAmt += cost;
      metrics.sumRank += sumRank;
      metrics.hasPerformanceRow = true;
    }
  }
}

function aggregateConversionRows(input: {
  rows: readonly string[][];
  date: string;
  index: DailyMetricsIndex;
}): void {
  for (const row of input.rows) {
    const adgroupId =
      readStringColumn(
        row,
        CONVERSION_ADGROUP_COLUMN,
      );
    const keywordId =
      readStringColumn(
        row,
        CONVERSION_KEYWORD_COLUMN,
      );
    const conversions =
      readNumberColumn(
        row,
        CONVERSION_COUNT_COLUMN,
      );
    const revenue =
      readNumberColumn(
        row,
        CONVERSION_AMOUNT_COLUMN,
      );

    if (adgroupId.startsWith("grp-")) {
      const metrics = getOrCreateMetrics({
        index: input.index.adgroup,
        entityId: adgroupId,
        date: input.date,
      });

      metrics.ccnt += conversions;
      metrics.convAmt += revenue;
      metrics.hasConversionRow = true;
    }

    if (keywordId.startsWith("nkw-")) {
      const metrics = getOrCreateMetrics({
        index: input.index.keyword,
        entityId: keywordId,
        date: input.date,
      });

      metrics.ccnt += conversions;
      metrics.convAmt += revenue;
      metrics.hasConversionRow = true;
    }
  }
}

async function buildDailyMetricsIndex(input: {
  credentials: NaverSearchAdsCredentials;
  dateFrom: string;
  dateTo: string;
  signal?: AbortSignal;
}): Promise<DailyMetricsIndex> {
  const dates = enumerateDates({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  const index: DailyMetricsIndex = {
    keyword: new Map(),
    adgroup: new Map(),
  };

  const buildAbortController =
    new AbortController();
  let buildTimedOut = false;

  const abortFromCaller = (): void => {
    buildAbortController.abort();
  };

  input.signal?.addEventListener(
    "abort",
    abortFromCaller,
    {
      once: true,
    },
  );

  if (input.signal?.aborted) {
    abortFromCaller();
  }

  const buildTimeoutId = setTimeout(
    () => {
      buildTimedOut = true;
      buildAbortController.abort();
    },
    MAX_REPORT_BUILD_MS,
  );

  try {
    const reusableReports =
      await loadReusableReports({
        credentials: input.credentials,
        signal:
          buildAbortController.signal,
      });

    for (const date of dates) {
      assertNotAborted(
        buildAbortController.signal,
      );

      const [adText, conversionText] =
        await Promise.all([
          loadReportText({
            credentials: input.credentials,
            statDate: date,
            reportType: "AD",
            reusableReports,
            signal:
              buildAbortController.signal,
          }),
          loadReportText({
            credentials: input.credentials,
            statDate: date,
            reportType: "AD_CONVERSION",
            reusableReports,
            signal:
              buildAbortController.signal,
          }),
        ]);

      const adRows = parseReportRows({
        text: adText,
        expectedColumns: AD_COLUMN_COUNT,
        reportType: "AD",
      });

      const conversionRows = parseReportRows({
        text: conversionText,
        expectedColumns:
          AD_CONVERSION_COLUMN_COUNT,
        reportType: "AD_CONVERSION",
      });

      aggregatePerformanceRows({
        rows: adRows,
        date,
        index,
      });

      aggregateConversionRows({
        rows: conversionRows,
        date,
        index,
      });
    }
  } catch (error) {
    if (input.signal?.aborted) {
      throw new NaverSearchAdsStatReportDailyMetricsError(
        "COLLECTION_ABORTED",
        "The StatReport fast path was aborted by the collector.",
        {
          cause:
            error,
        },
      );
    }

    if (buildTimedOut) {
      throw new NaverSearchAdsStatReportDailyMetricsError(
        "REPORT_BUILD_TIMEOUT",
        `The StatReport fast path exceeded its ${MAX_REPORT_BUILD_MS}ms build budget.`,
        {
          cause:
            error,
        },
      );
    }

    throw error;
  } finally {
    clearTimeout(buildTimeoutId);
    input.signal?.removeEventListener(
      "abort",
      abortFromCaller,
    );
  }

  return index;
}

function createCacheKey(input: {
  credentials: NaverSearchAdsCredentials;
  dateFrom: string;
  dateTo: string;
}): string {
  return [
    input.credentials.customerId.trim(),
    input.dateFrom,
    input.dateTo,
  ].join("|");
}

function pruneCache(now: number): void {
  for (const [key, entry] of CACHE) {
    if (
      entry.state === "pending" ||
      entry.settledAt === null
    ) {
      continue;
    }

    const ttlMs =
      entry.state === "ready"
        ? READY_CACHE_TTL_MS
        : FAILED_CACHE_TTL_MS;

    if (
      now - entry.settledAt > ttlMs
    ) {
      CACHE.delete(key);
    }
  }

  while (
    CACHE.size >= MAX_CACHE_ENTRIES
  ) {
    let oldestKey:
      string | null = null;

    for (const [key, entry] of CACHE) {
      if (entry.state !== "pending") {
        oldestKey = key;
        break;
      }
    }

    if (oldestKey === null) {
      break;
    }

    CACHE.delete(oldestKey);
  }
}

function getDailyMetricsIndex(input: {
  credentials: NaverSearchAdsCredentials;
  dateFrom: string;
  dateTo: string;
  signal?: AbortSignal;
}): Promise<DailyMetricsIndex> {
  const dateFrom = normalizeIsoDate(
    input.dateFrom,
    "dateFrom",
  );
  const dateTo = normalizeIsoDate(
    input.dateTo,
    "dateTo",
  );

  enumerateDates({ dateFrom, dateTo });

  const key = createCacheKey({
    credentials: input.credentials,
    dateFrom,
    dateTo,
  });
  const now = Date.now();
  const cached = CACHE.get(key);

  if (cached) {
    if (
      cached.state === "pending" ||
      cached.settledAt === null
    ) {
      return cached.promise;
    }

    const ttlMs =
      cached.state === "ready"
        ? READY_CACHE_TTL_MS
        : FAILED_CACHE_TTL_MS;

    if (
      now - cached.settledAt <= ttlMs
    ) {
      return cached.promise;
    }

    CACHE.delete(key);
  }

  pruneCache(now);

  const entry: CacheEntry = {
    state: "pending",
    settledAt: null,
    promise: Promise.resolve({
      keyword: new Map(),
      adgroup: new Map(),
    }),
  };

  entry.promise = buildDailyMetricsIndex({
    credentials: input.credentials,
    dateFrom,
    dateTo,
    signal: input.signal,
  }).then(
    (index): DailyMetricsIndex => {
      entry.state = "ready";
      entry.settledAt = Date.now();
      return index;
    },
    (error: unknown): never => {
      entry.state = "failed";
      entry.settledAt = Date.now();

      const errorCode =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "UNKNOWN";

      console.warn(
        `[media-sync-worker] Naver StatReport fast path unavailable for ${dateFrom}..${dateTo}; exact /stats fallback enabled; code=${errorCode}`,
      );

      throw error;
    },
  );

  CACHE.set(key, entry);

  return entry.promise;
}

function getMetricsRecords(input: {
  index: DailyMetricsByEntity;
  entityId: string;
  dateFrom: string;
  dateTo: string;
}): Array<{
  date: string;
  metrics: DailyMetrics;
}> {
  const dates = enumerateDates({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  const byDate = input.index.get(
    input.entityId,
  );

  if (!byDate) {
    return [];
  }

  return dates.flatMap((date) => {
    const metrics = byDate.get(date);

    if (
      !metrics ||
      (!metrics.hasPerformanceRow &&
        !metrics.hasConversionRow)
    ) {
      return [];
    }

    return [
      {
        date,
        metrics,
      },
    ];
  });
}

function roundRankToOneDecimal(
  sumRank: number,
  impressions: number,
): number | null {
  if (impressions <= 0) {
    return null;
  }

  return Math.round(
    (sumRank / impressions) * 10,
  ) / 10;
}

export async function fetchNaverSearchAdsStatReportKeywordDailyStats(
  input: FetchNaverSearchAdsKeywordDailyStatsInput & {
    signal?: AbortSignal;
  },
): Promise<NaverSearchAdsKeywordDailyStatsResult> {
  const index = await getDailyMetricsIndex({
    credentials: input.credentials,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    signal: input.signal,
  });

  const records: NaverSearchAdsKeywordDailyStatsRecord[] =
    getMetricsRecords({
      index: index.keyword,
      entityId: input.keywordId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    }).map(({ date, metrics }) => ({
      keywordId: input.keywordId,
      date,
      periodStart: date,
      periodEnd: date,
      impCnt: metrics.impCnt,
      clkCnt: metrics.clkCnt,
      salesAmt: metrics.salesAmt,
      ccnt: metrics.ccnt,
      convAmt: metrics.convAmt,
      avgRnk: roundRankToOneDecimal(
        metrics.sumRank,
        metrics.impCnt,
      ),
    }));

  return {
    keywordId: input.keywordId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    records,
  };
}

export async function fetchNaverSearchAdsStatReportAdgroupDailyStats(
  input: FetchNaverSearchAdsEntityDailyStatsInput & {
    signal?: AbortSignal;
  },
): Promise<NaverSearchAdsEntityDailyStatsResult> {
  if (input.entityType !== "adgroup") {
    throw new NaverSearchAdsStatReportDailyMetricsError(
      "INVALID_INPUT",
      "The StatReport authoritative fast path only supports adgroup entities.",
    );
  }

  const index = await getDailyMetricsIndex({
    credentials: input.credentials,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    signal: input.signal,
  });

  const records: NaverSearchAdsEntityDailyStatsRecord[] =
    getMetricsRecords({
      index: index.adgroup,
      entityId: input.entityId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    }).map(({ date, metrics }) => ({
      entityId: input.entityId,
      entityType: "adgroup",
      date,
      periodStart: date,
      periodEnd: date,
      impCnt: metrics.impCnt,
      clkCnt: metrics.clkCnt,
      salesAmt: metrics.salesAmt,
      ccnt: metrics.ccnt,
      convAmt: metrics.convAmt,
    }));

  return {
    entityId: input.entityId,
    entityType: "adgroup",
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    records,
  };
}

import { createHmac } from "node:crypto";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  decryptNaverSearchAdsConnection,
  MediaConnectionsRepositoryError,
} from "../src/lib/media-sync/media-connections-repository";
import {
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsKeywordPage,
  NaverSearchAdsApiError,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsKeywordRecord,
} from "../src/lib/media-sync/naver-searchads-api";

const REPORTS_TABLE = "reports";
const MEDIA_CONNECTIONS_TABLE = "media_connections";
const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const REPORT_INGESTIONS_TABLE = "report_ingestions";
const REPORT_ROWS_TABLE = "report_rows";
const MEDIA_SYNC_STAGING_ROWS_TABLE = "media_sync_staging_rows";

const NAVER_SEARCH_ADS_PROVIDER = "naver_searchad";
const NAVER_SEARCH_ADS_API_BASE_URL = "https://api.searchad.naver.com";
const NAVER_SEARCH_ADS_STATS_URI = "/stats";
const NAVER_SEARCH_ADS_ADS_URI = "/ncc/ads";
const NAVER_SEARCH_ADS_GET_METHOD = "GET";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTIVE_JOB_STATUSES = ["pending", "processing"] as const;

const DEFAULT_REQUEST_INTERVAL_MS = 1_000;
const MIN_REQUEST_INTERVAL_MS = 250;
const MAX_REQUEST_INTERVAL_MS = 10_000;

const DEFAULT_MAX_DETAIL_ENTITIES_PER_GRAIN = 500;
const MIN_MAX_DETAIL_ENTITIES_PER_GRAIN = 1;
const MAX_MAX_DETAIL_ENTITIES_PER_GRAIN = 5_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRY_COUNT = 3;
const LIST_RECORD_SIZE = 1_000;
const MAX_LIST_PAGES = 10_000;
const MAX_DATE_WINDOW_DAYS = 31;

const STATS_FIELDS = [
  "impCnt",
  "clkCnt",
  "salesAmt",
  "ccnt",
  "convAmt",
] as const;

const EXPECTED_SEARCH_ADS_TOTAL = {
  impCnt: 7_075,
  clkCnt: 1_183,
} as const;

const EXCLUDED_DISPLAY_CAMPAIGNS = [
  {
    displayName: "ADVoost 쇼핑",
    uiCampaignId: "1316614",
    expected: {
      impCnt: 49_887,
      clkCnt: 362,
    },
    reason:
      "성과형 디스플레이 광고 캠페인이므로 Search Ads /ncc/campaigns parity 범위에서 제외",
  },
] as const;

type NaverCredentials = Awaited<
  ReturnType<typeof decryptNaverSearchAdsConnection>
>["credentials"];

type ProbeInput = {
  reportId: string;
  dateFrom: string;
  dateTo: string;
  connectionId: string | null;
  requestIntervalMs: number;
  maxDetailEntitiesPerGrain: number;
};

type TargetCampaignSpec = {
  key: string;
  displayName: string;
  campaignIds: readonly string[];
  campaignNameAliases: readonly string[];
  expected: {
    impCnt: number;
    clkCnt: number;
  };
};

const TARGET_CAMPAIGNS: readonly TargetCampaignSpec[] = [
  {
    key: "shopping_mobile",
    displayName: "Shopping MO",
    campaignIds: [
      "cmp-a001-02-000000010549559",
    ],
    campaignNameAliases: [
      "[CO] Shopping_MO_2604",
      "CO Shopping MO 2604",
    ],
    expected: {
      impCnt: 3_257,
      clkCnt: 83,
    },
  },
  {
    key: "brand_search",
    displayName: "브랜드검색",
    campaignIds: [
      "cmp-a001-04-000000005653958",
    ],
    campaignNameAliases: [
      "스노우라인_브검",
      "스노우라인 브검",
    ],
    expected: {
      impCnt: 2_742,
      clkCnt: 1_098,
    },
  },
  {
    key: "shopping_pc",
    displayName: "Shopping PC",
    campaignIds: [
      "cmp-a001-02-000000010549606",
    ],
    campaignNameAliases: [
      "[CO] Shopping_PC_2604",
      "CO Shopping PC 2604",
    ],
    expected: {
      impCnt: 1_076,
      clkCnt: 2,
    },
  },
];

type Metrics = {
  impCnt: number;
  clkCnt: number;
  salesAmt: number;
  ccnt: number;
  convAmt: number;
};

type EntityStats = {
  entityId: string;
  summary: Metrics | null;
  dataTotal: Metrics;
  dataRowCount: number;
  summaryMatchesData: boolean | null;
};

type GrainStatus =
  | "ok"
  | "empty"
  | "skipped_entity_limit"
  | "unsupported"
  | "error";

type GrainResult = {
  grain: "campaign" | "adgroup" | "keyword" | "ad";
  status: GrainStatus;
  entityCount: number;
  statsRequests: number;
  totals: Metrics | null;
  summaryDataMismatchCount: number;
  errorCode: string | null;
  matchesExpected: boolean | null;
};

type TargetProbeResult = {
  targetKey: string;
  targetName: string;
  campaignId: string;
  campaignName: string;
  campaignType: string | null;
  expected: {
    impCnt: number;
    clkCnt: number;
  };
  adgroupCount: number;
  keywordCount: number;
  adCount: number | null;
  adDiscoveryError: string | null;
  grains: GrainResult[];
  matchingGrains: string[];
  recommendedDetailGrain: string | null;
};

type ReportScope = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

type ConnectionScope = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  status: string;
  externalAccountId: string;
};

type DatabaseState = {
  report: {
    currentIngestionId: string | null;
    publishedIngestionId: string | null;
    updatedAt: string | null;
  };
  connection: {
    id: string;
    status: string;
    lastSyncAt: string | null;
    lastError: string | null;
    updatedAt: string | null;
  };
  jobs: {
    count: number;
    activeCount: number;
    latestId: string | null;
    latestStatus: string | null;
    latestUpdatedAt: string | null;
  };
  reportIngestionsCount: number;
  currentReportRowsCount: number;
  stagingRowsCount: number;
};

type UnknownRecord = Record<string, unknown>;

class LiveEntityParityProbeError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(
    code: string,
    message: string,
    options?: ErrorOptions & {
      status?: number | null;
    },
  ) {
    super(message, options);
    this.name = "LiveEntityParityProbeError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalized.length > maxLength) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${fieldName} is too long.`,
    );
  }

  return normalized;
}

function normalizeUuid(
  value: unknown,
  fieldName: string,
): string {
  const normalized = normalizeRequiredString(
    value,
    fieldName,
    36,
  );

  if (!UUID_PATTERN.test(normalized)) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalized;
}

function normalizeOptionalUuid(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  return normalizeUuid(normalized, fieldName);
}

function normalizeIsoDate(
  value: unknown,
  fieldName: string,
): string {
  const normalized = normalizeRequiredString(
    value,
    fieldName,
    10,
  );

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const parsed = new Date(
    `${normalized}T00:00:00.000Z`,
  );

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !==
      normalized
  ) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${fieldName} must be a valid date.`,
    );
  }

  return normalized;
}

function getInclusiveDateWindowDays(
  dateFrom: string,
  dateTo: string,
): number {
  const fromMs = Date.parse(
    `${dateFrom}T00:00:00.000Z`,
  );
  const toMs = Date.parse(
    `${dateTo}T00:00:00.000Z`,
  );

  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs < fromMs
  ) {
    return 0;
  }

  return (
    Math.floor(
      (toMs - fromMs) / 86_400_000,
    ) + 1
  );
}

function readIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = String(
    process.env[name] ?? fallback,
  ).trim();

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }

  return value;
}

function readProbeInput(): ProbeInput {
  const [
    reportIdArgument,
    dateFromArgument,
    dateToArgument,
    connectionIdArgument,
  ] = process.argv.slice(2);

  const reportId = normalizeUuid(
    reportIdArgument,
    "reportId",
  );
  const dateFrom = normalizeIsoDate(
    dateFromArgument,
    "dateFrom",
  );
  const dateTo = normalizeIsoDate(
    dateToArgument,
    "dateTo",
  );

  const windowDays =
    getInclusiveDateWindowDays(
      dateFrom,
      dateTo,
    );

  if (
    windowDays < 1 ||
    windowDays > MAX_DATE_WINDOW_DAYS
  ) {
    throw new LiveEntityParityProbeError(
      "INVALID_INPUT",
      `The probe date window must be between 1 and ${MAX_DATE_WINDOW_DAYS} days.`,
    );
  }

  return {
    reportId,
    dateFrom,
    dateTo,
    connectionId: normalizeOptionalUuid(
      connectionIdArgument,
      "connectionId",
    ),
    requestIntervalMs: readIntegerEnv(
      "NAVER_ENTITY_PARITY_REQUEST_INTERVAL_MS",
      DEFAULT_REQUEST_INTERVAL_MS,
      MIN_REQUEST_INTERVAL_MS,
      MAX_REQUEST_INTERVAL_MS,
    ),
    maxDetailEntitiesPerGrain:
      readIntegerEnv(
        "NAVER_ENTITY_PARITY_MAX_DETAIL_ENTITIES",
        DEFAULT_MAX_DETAIL_ENTITIES_PER_GRAIN,
        MIN_MAX_DETAIL_ENTITIES_PER_GRAIN,
        MAX_MAX_DETAIL_ENTITIES_PER_GRAIN,
      ),
  };
}

function createEmptyMetrics(): Metrics {
  return {
    impCnt: 0,
    clkCnt: 0,
    salesAmt: 0,
    ccnt: 0,
    convAmt: 0,
  };
}

function addMetrics(
  left: Metrics,
  right: Metrics,
): Metrics {
  return {
    impCnt: left.impCnt + right.impCnt,
    clkCnt: left.clkCnt + right.clkCnt,
    salesAmt:
      left.salesAmt + right.salesAmt,
    ccnt: left.ccnt + right.ccnt,
    convAmt: left.convAmt + right.convAmt,
  };
}

function roundMetric(
  value: number,
): number {
  return Math.round(value * 1_000_000) /
    1_000_000;
}

function normalizeMetrics(
  metrics: Metrics,
): Metrics {
  return {
    impCnt: roundMetric(metrics.impCnt),
    clkCnt: roundMetric(metrics.clkCnt),
    salesAmt: roundMetric(metrics.salesAmt),
    ccnt: roundMetric(metrics.ccnt),
    convAmt: roundMetric(metrics.convAmt),
  };
}

function metricsEqual(
  left: Metrics,
  right: Metrics,
): boolean {
  return (
    Math.abs(left.impCnt - right.impCnt) <
      0.000001 &&
    Math.abs(left.clkCnt - right.clkCnt) <
      0.000001 &&
    Math.abs(left.salesAmt - right.salesAmt) <
      0.000001 &&
    Math.abs(left.ccnt - right.ccnt) <
      0.000001 &&
    Math.abs(left.convAmt - right.convAmt) <
      0.000001
  );
}

function metricsMatchExpected(
  metrics: Metrics | null,
  expected: {
    impCnt: number;
    clkCnt: number;
  },
): boolean | null {
  if (!metrics) {
    return null;
  }

  return (
    Math.abs(metrics.impCnt - expected.impCnt) <
      0.000001 &&
    Math.abs(metrics.clkCnt - expected.clkCnt) <
      0.000001
  );
}

function readNullableMetric(
  record: UnknownRecord,
  fieldName: keyof Metrics,
): number {
  const value = record[fieldName];

  if (
    value === undefined ||
    value === null
  ) {
    return 0;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new LiveEntityParityProbeError(
      "INVALID_RESPONSE",
      `Naver stats field ${fieldName} is invalid.`,
    );
  }

  return value;
}

function readMetrics(
  value: unknown,
  fieldName: string,
): Metrics {
  if (!isPlainObject(value)) {
    throw new LiveEntityParityProbeError(
      "INVALID_RESPONSE",
      `${fieldName} must be an object.`,
    );
  }

  return {
    impCnt: readNullableMetric(
      value,
      "impCnt",
    ),
    clkCnt: readNullableMetric(
      value,
      "clkCnt",
    ),
    salesAmt: readNullableMetric(
      value,
      "salesAmt",
    ),
    ccnt: readNullableMetric(
      value,
      "ccnt",
    ),
    convAmt: readNullableMetric(
      value,
      "convAmt",
    ),
  };
}

function parseEntityStatsResponse(
  value: unknown,
  entityId: string,
): EntityStats {
  if (!isPlainObject(value)) {
    throw new LiveEntityParityProbeError(
      "INVALID_RESPONSE",
      "Naver stats response must be an object.",
    );
  }

  if (!isPlainObject(value.summary)) {
    throw new LiveEntityParityProbeError(
      "INVALID_RESPONSE",
      "Naver stats summary must be an object.",
    );
  }

  const summaryHasMetrics =
    STATS_FIELDS.some((fieldName) =>
      Object.prototype.hasOwnProperty.call(
        value.summary,
        fieldName,
      ),
    );

  const summary =
    summaryHasMetrics
      ? readMetrics(
          value.summary,
          "stats.summary",
        )
      : null;

  if (!Array.isArray(value.data)) {
    throw new LiveEntityParityProbeError(
      "INVALID_RESPONSE",
      "Naver stats data must be an array.",
    );
  }

  let dataTotal = createEmptyMetrics();

  for (const row of value.data) {
    dataTotal = addMetrics(
      dataTotal,
      readMetrics(row, "stats.data[]"),
    );
  }

  const normalizedSummary =
    summary
      ? normalizeMetrics(summary)
      : null;
  const normalizedDataTotal =
    normalizeMetrics(dataTotal);

  return {
    entityId,
    summary: normalizedSummary,
    dataTotal: normalizedDataTotal,
    dataRowCount: value.data.length,
    summaryMatchesData:
      normalizedSummary
        ? metricsEqual(
            normalizedSummary,
            normalizedDataTotal,
          )
        : null,
  };
}

function stableJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableJson)
      .join(",")}]`;
  }

  const record =
    value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(
          record[key],
        )}`,
    )
    .join(",")}}`;
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

function isRetryableError(
  error: unknown,
): boolean {
  if (
    error instanceof
    NaverSearchAdsApiError
  ) {
    return (
      error.code === "REQUEST_TIMEOUT" ||
      error.code === "NETWORK_ERROR" ||
      error.status === 429 ||
      (typeof error.status === "number" &&
        error.status >= 500)
    );
  }

  if (
    error instanceof
    LiveEntityParityProbeError
  ) {
    return (
      error.code === "REQUEST_TIMEOUT" ||
      error.code === "NETWORK_ERROR" ||
      error.status === 429 ||
      (typeof error.status === "number" &&
        error.status >= 500)
    );
  }

  return false;
}

function safeErrorCode(
  error: unknown,
): string {
  if (
    error instanceof
    NaverSearchAdsApiError
  ) {
    return `${error.code}${
      error.status !== null
        ? `:${error.status}`
        : ""
    }`;
  }

  if (
    error instanceof
    LiveEntityParityProbeError
  ) {
    return `${error.code}${
      error.status !== null
        ? `:${error.status}`
        : ""
    }`;
  }

  if (
    error instanceof
    MediaConnectionsRepositoryError
  ) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.name;
  }

  return "UNKNOWN_ERROR";
}

class NaverRequestScheduler {
  private lastRequestStartedAt = 0;
  private requestCount = 0;

  constructor(
    private readonly requestIntervalMs: number,
  ) {}

  get totalRequests(): number {
    return this.requestCount;
  }

  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(
      0,
      this.lastRequestStartedAt +
        this.requestIntervalMs -
        now,
    );

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.lastRequestStartedAt = Date.now();
    this.requestCount += 1;
  }

  async run<T>(
    operationName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown = null;

    for (
      let attempt = 0;
      attempt <= DEFAULT_MAX_RETRY_COUNT;
      attempt += 1
    ) {
      await this.waitForTurn();

      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (
          attempt >= DEFAULT_MAX_RETRY_COUNT ||
          !isRetryableError(error)
        ) {
          throw error;
        }

        const retryDelayMs =
          Math.min(
            10_000,
            1_000 * 2 ** attempt,
          );

        console.warn(
          `[parity-probe] retry ${operationName}`,
          {
            attempt: attempt + 1,
            errorCode: safeErrorCode(error),
            retryDelayMs,
          },
        );

        await sleep(retryDelayMs);
      }
    }

    throw lastError;
  }
}

function createNaverSearchAdsSignature(
  input: {
    timestamp: string;
    method: string;
    uri: string;
    secretKey: string;
  },
): string {
  const message = [
    input.timestamp,
    input.method,
    input.uri,
  ].join(".");

  return createHmac(
    "sha256",
    input.secretKey,
  )
    .update(message, "utf8")
    .digest("base64");
}

async function requestNaverSearchAdsJsonOnce(
  credentials: NaverCredentials,
  uri: string,
  searchParams:
    readonly (readonly [string, string])[],
): Promise<unknown> {
  const timestamp = Date.now().toString();

  const signature =
    createNaverSearchAdsSignature({
      timestamp,
      method:
        NAVER_SEARCH_ADS_GET_METHOD,
      uri,
      secretKey:
        credentials.secretKey,
    });

  const requestUrl = new URL(
    uri,
    NAVER_SEARCH_ADS_API_BASE_URL,
  );

  for (const [key, value] of searchParams) {
    requestUrl.searchParams.append(
      key,
      value,
    );
  }

  const abortController =
    new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, DEFAULT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      requestUrl,
      {
        method:
          NAVER_SEARCH_ADS_GET_METHOD,
        headers: {
          Accept: "application/json",
          "X-Timestamp": timestamp,
          "X-API-KEY":
            credentials.accessLicense,
          "X-Customer":
            credentials.customerId,
          "X-Signature": signature,
        },
        cache: "no-store",
        signal: abortController.signal,
      },
    );

    if (!response.ok) {
      if (response.body) {
        await response.body.cancel();
      }

      throw new LiveEntityParityProbeError(
        "HTTP_ERROR",
        "Naver Search Ads API returned an unsuccessful response.",
        {
          status: response.status,
        },
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new LiveEntityParityProbeError(
        "INVALID_RESPONSE",
        "Naver Search Ads API returned invalid JSON.",
        { cause: error },
      );
    }
  } catch (error) {
    if (
      error instanceof
      LiveEntityParityProbeError
    ) {
      throw error;
    }

    if (
      abortController.signal.aborted ||
      isAbortError(error)
    ) {
      throw new LiveEntityParityProbeError(
        "REQUEST_TIMEOUT",
        "Naver Search Ads API request timed out.",
      );
    }

    throw new LiveEntityParityProbeError(
      "NETWORK_ERROR",
      "Naver Search Ads API request failed.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchEntityStats(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    entityId: string;
    dateFrom: string;
    dateTo: string;
  },
): Promise<EntityStats> {
  const response =
    await input.scheduler.run(
      `stats:${input.entityId}`,
      () =>
        requestNaverSearchAdsJsonOnce(
          input.credentials,
          NAVER_SEARCH_ADS_STATS_URI,
          [
            ["id", input.entityId],
            [
              "fields",
              JSON.stringify(STATS_FIELDS),
            ],
            [
              "timeRange",
              JSON.stringify({
                since: input.dateFrom,
                until: input.dateTo,
              }),
            ],
            ["timeIncrement", "1"],
          ],
        ),
    );

  return parseEntityStatsResponse(
    response,
    input.entityId,
  );
}

function normalizeLooseName(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[\s_[\]{}()\-./\\]+/g,
      "",
    );
}

function campaignMatchesTarget(
  campaign: NaverSearchAdsCampaignRecord,
  target: TargetCampaignSpec,
): boolean {
  if (
    target.campaignIds.includes(
      campaign.id,
    )
  ) {
    return true;
  }

  const normalizedCampaignName =
    normalizeLooseName(campaign.name);

  return target.campaignNameAliases.some(
    (alias) => {
      const normalizedAlias =
        normalizeLooseName(alias);

      return (
        normalizedCampaignName ===
          normalizedAlias ||
        normalizedCampaignName.includes(
          normalizedAlias,
        ) ||
        normalizedAlias.includes(
          normalizedCampaignName,
        )
      );
    },
  );
}

function resolveTargetCampaign(
  campaigns:
    readonly NaverSearchAdsCampaignRecord[],
  target: TargetCampaignSpec,
): NaverSearchAdsCampaignRecord | null {
  const matches = campaigns.filter(
    (campaign) =>
      campaignMatchesTarget(
        campaign,
        target,
      ),
  );

  if (matches.length === 1) {
    return matches[0];
  }

  const candidates = campaigns
    .filter((campaign) => {
      const normalized =
        normalizeLooseName(campaign.name);

      return (
        normalized.includes("shopping") ||
        normalized.includes("쇼핑") ||
        normalized.includes("브검") ||
        normalized.includes("브랜드")
      );
    })
    .slice(0, 30)
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      campaignType:
        campaign.campaignType,
    }));

  console.error(
    `[parity-probe] target resolution failed: ${target.displayName}`,
    {
      matchCount: matches.length,
      requestedCampaignIds:
        target.campaignIds,
      candidates,
    },
  );

  return null;
}

async function fetchAllCampaigns(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
  },
): Promise<NaverSearchAdsCampaignRecord[]> {
  const all: NaverSearchAdsCampaignRecord[] =
    [];
  const seenBaseSearchIds =
    new Set<string>();
  let baseSearchId: string | null = null;

  for (
    let pageIndex = 0;
    pageIndex < MAX_LIST_PAGES;
    pageIndex += 1
  ) {
    const page = await input.scheduler.run(
      `campaign-page:${pageIndex}`,
      () =>
        fetchNaverSearchAdsCampaignPage({
          credentials:
            input.credentials,
          baseSearchId,
          recordSize:
            LIST_RECORD_SIZE,
          selector: "NEXT",
        }),
    );

    all.push(...page.records);

    if (
      page.records.length <
        LIST_RECORD_SIZE ||
      !page.nextBaseSearchId
    ) {
      return all;
    }

    if (
      seenBaseSearchIds.has(
        page.nextBaseSearchId,
      )
    ) {
      throw new LiveEntityParityProbeError(
        "PAGINATION_LOOP",
        "Campaign pagination repeated a baseSearchId.",
      );
    }

    seenBaseSearchIds.add(
      page.nextBaseSearchId,
    );
    baseSearchId =
      page.nextBaseSearchId;
  }

  throw new LiveEntityParityProbeError(
    "PAGINATION_LIMIT",
    "Campaign pagination exceeded the safety page limit.",
  );
}

async function fetchAllAdgroups(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    campaignId: string;
  },
): Promise<NaverSearchAdsAdgroupRecord[]> {
  const all: NaverSearchAdsAdgroupRecord[] =
    [];
  const seenBaseSearchIds =
    new Set<string>();
  let baseSearchId: string | null = null;

  for (
    let pageIndex = 0;
    pageIndex < MAX_LIST_PAGES;
    pageIndex += 1
  ) {
    const page = await input.scheduler.run(
      `adgroup-page:${input.campaignId}:${pageIndex}`,
      () =>
        fetchNaverSearchAdsAdgroupPage({
          credentials:
            input.credentials,
          campaignId:
            input.campaignId,
          baseSearchId,
          recordSize:
            LIST_RECORD_SIZE,
          selector: "NEXT",
        }),
    );

    all.push(...page.records);

    if (
      page.records.length <
        LIST_RECORD_SIZE ||
      !page.nextBaseSearchId
    ) {
      return all;
    }

    if (
      seenBaseSearchIds.has(
        page.nextBaseSearchId,
      )
    ) {
      throw new LiveEntityParityProbeError(
        "PAGINATION_LOOP",
        "Adgroup pagination repeated a baseSearchId.",
      );
    }

    seenBaseSearchIds.add(
      page.nextBaseSearchId,
    );
    baseSearchId =
      page.nextBaseSearchId;
  }

  throw new LiveEntityParityProbeError(
    "PAGINATION_LIMIT",
    "Adgroup pagination exceeded the safety page limit.",
  );
}

async function fetchAllKeywordsForAdgroup(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    adgroupId: string;
  },
): Promise<NaverSearchAdsKeywordRecord[]> {
  const all: NaverSearchAdsKeywordRecord[] =
    [];
  const seenBaseSearchIds =
    new Set<string>();
  let baseSearchId: string | null = null;

  for (
    let pageIndex = 0;
    pageIndex < MAX_LIST_PAGES;
    pageIndex += 1
  ) {
    const page = await input.scheduler.run(
      `keyword-page:${input.adgroupId}:${pageIndex}`,
      () =>
        fetchNaverSearchAdsKeywordPage({
          credentials:
            input.credentials,
          adgroupId:
            input.adgroupId,
          baseSearchId,
          recordSize:
            LIST_RECORD_SIZE,
          selector: "NEXT",
        }),
    );

    all.push(...page.records);

    if (
      page.records.length <
        LIST_RECORD_SIZE ||
      !page.nextBaseSearchId
    ) {
      return all;
    }

    if (
      seenBaseSearchIds.has(
        page.nextBaseSearchId,
      )
    ) {
      throw new LiveEntityParityProbeError(
        "PAGINATION_LOOP",
        "Keyword pagination repeated a baseSearchId.",
      );
    }

    seenBaseSearchIds.add(
      page.nextBaseSearchId,
    );
    baseSearchId =
      page.nextBaseSearchId;
  }

  throw new LiveEntityParityProbeError(
    "PAGINATION_LIMIT",
    "Keyword pagination exceeded the safety page limit.",
  );
}

async function fetchAllKeywords(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    adgroups:
      readonly NaverSearchAdsAdgroupRecord[];
  },
): Promise<NaverSearchAdsKeywordRecord[]> {
  const all: NaverSearchAdsKeywordRecord[] =
    [];

  for (
    let index = 0;
    index < input.adgroups.length;
    index += 1
  ) {
    const adgroup =
      input.adgroups[index];

    const records =
      await fetchAllKeywordsForAdgroup({
        scheduler: input.scheduler,
        credentials:
          input.credentials,
        adgroupId: adgroup.id,
      });

    all.push(...records);
  }

  return all;
}

type AdRecord = {
  id: string;
  adgroupId: string;
};

function parseAdRecords(
  value: unknown,
  adgroupId: string,
): AdRecord[] {
  if (!Array.isArray(value)) {
    throw new LiveEntityParityProbeError(
      "INVALID_RESPONSE",
      "Naver ad list response must be an array.",
    );
  }

  return value.map((item) => {
    if (!isPlainObject(item)) {
      throw new LiveEntityParityProbeError(
        "INVALID_RESPONSE",
        "Naver ad record must be an object.",
      );
    }

    const id =
      normalizeRequiredString(
        item.nccAdId,
        "nccAdId",
        200,
      );

    const responseAdgroupId =
      normalizeRequiredString(
        item.nccAdgroupId,
        "nccAdgroupId",
        200,
      );

    if (
      responseAdgroupId !==
      adgroupId
    ) {
      throw new LiveEntityParityProbeError(
        "INVALID_RESPONSE",
        "Naver ad response contains a different adgroup ID.",
      );
    }

    return {
      id,
      adgroupId:
        responseAdgroupId,
    };
  });
}

async function fetchAllAdsForAdgroup(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    adgroupId: string;
  },
): Promise<AdRecord[]> {
  const all: AdRecord[] = [];
  const seenBaseSearchIds =
    new Set<string>();
  let baseSearchId: string | null = null;

  for (
    let pageIndex = 0;
    pageIndex < MAX_LIST_PAGES;
    pageIndex += 1
  ) {
    const searchParams:
      Array<readonly [string, string]> = [
      ["nccAdgroupId", input.adgroupId],
      [
        "recordSize",
        LIST_RECORD_SIZE.toString(),
      ],
      ["selector", "NEXT"],
    ];

    if (baseSearchId) {
      searchParams.push([
        "baseSearchId",
        baseSearchId,
      ]);
    }

    const response =
      await input.scheduler.run(
        `ad-page:${input.adgroupId}:${pageIndex}`,
        () =>
          requestNaverSearchAdsJsonOnce(
            input.credentials,
            NAVER_SEARCH_ADS_ADS_URI,
            searchParams,
          ),
      );

    const records = parseAdRecords(
      response,
      input.adgroupId,
    );

    all.push(...records);

    if (
      records.length <
      LIST_RECORD_SIZE
    ) {
      return all;
    }

    const nextBaseSearchId =
      records[records.length - 1]
        ?.id ?? null;

    if (!nextBaseSearchId) {
      return all;
    }

    if (
      seenBaseSearchIds.has(
        nextBaseSearchId,
      )
    ) {
      throw new LiveEntityParityProbeError(
        "PAGINATION_LOOP",
        "Ad pagination repeated a baseSearchId.",
      );
    }

    seenBaseSearchIds.add(
      nextBaseSearchId,
    );
    baseSearchId =
      nextBaseSearchId;
  }

  throw new LiveEntityParityProbeError(
    "PAGINATION_LIMIT",
    "Ad pagination exceeded the safety page limit.",
  );
}

async function fetchAllAds(
  input: {
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    adgroups:
      readonly NaverSearchAdsAdgroupRecord[];
  },
): Promise<AdRecord[]> {
  const all: AdRecord[] = [];

  for (const adgroup of input.adgroups) {
    const records =
      await fetchAllAdsForAdgroup({
        scheduler: input.scheduler,
        credentials:
          input.credentials,
        adgroupId: adgroup.id,
      });

    all.push(...records);
  }

  return all;
}

function createUnavailableGrainResult(
  grain: GrainResult["grain"],
  status: Exclude<
    GrainStatus,
    "ok" | "empty"
  >,
  entityCount: number,
  errorCode: string | null,
): GrainResult {
  return {
    grain,
    status,
    entityCount,
    statsRequests: 0,
    totals: null,
    summaryDataMismatchCount: 0,
    errorCode,
    matchesExpected: null,
  };
}

async function aggregateEntityStats(
  input: {
    grain: GrainResult["grain"];
    entityIds: readonly string[];
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    dateFrom: string;
    dateTo: string;
    expected: {
      impCnt: number;
      clkCnt: number;
    };
    maxEntities: number | null;
  },
): Promise<GrainResult> {
  if (input.entityIds.length === 0) {
    const totals =
      createEmptyMetrics();

    return {
      grain: input.grain,
      status: "empty",
      entityCount: 0,
      statsRequests: 0,
      totals,
      summaryDataMismatchCount: 0,
      errorCode: null,
      matchesExpected:
        metricsMatchExpected(
          totals,
          input.expected,
        ),
    };
  }

  if (
    input.maxEntities !== null &&
    input.entityIds.length >
      input.maxEntities
  ) {
    return createUnavailableGrainResult(
      input.grain,
      "skipped_entity_limit",
      input.entityIds.length,
      `ENTITY_COUNT_EXCEEDS_LIMIT:${input.maxEntities}`,
    );
  }

  let totals = createEmptyMetrics();
  let summaryDataMismatchCount = 0;

  for (
    let index = 0;
    index < input.entityIds.length;
    index += 1
  ) {
    const entityId =
      input.entityIds[index];

    const stats = await fetchEntityStats({
      scheduler: input.scheduler,
      credentials: input.credentials,
      entityId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    totals = addMetrics(
      totals,
      stats.dataTotal,
    );

    if (
      stats.summaryMatchesData === false
    ) {
      summaryDataMismatchCount += 1;
    }

    if (
      input.entityIds.length >= 50 &&
      (index + 1) % 50 === 0
    ) {
      console.log(
        `[parity-probe] ${input.grain} stats progress`,
        {
          completed: index + 1,
          total:
            input.entityIds.length,
        },
      );
    }
  }

  totals = normalizeMetrics(totals);

  return {
    grain: input.grain,
    status: "ok",
    entityCount:
      input.entityIds.length,
    statsRequests:
      input.entityIds.length,
    totals,
    summaryDataMismatchCount,
    errorCode: null,
    matchesExpected:
      metricsMatchExpected(
        totals,
        input.expected,
      ),
  };
}

function chooseRecommendedDetailGrain(
  grains: readonly GrainResult[],
): string | null {
  const preference = [
    "keyword",
    "ad",
    "adgroup",
    "campaign",
  ] as const;

  for (const grainName of preference) {
    const grain = grains.find(
      (item) =>
        item.grain === grainName,
    );

    if (
      grain?.matchesExpected === true
    ) {
      return grainName;
    }
  }

  return null;
}

async function readReportScope(
  reportId: string,
): Promise<ReportScope> {
  const supabase = getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(REPORTS_TABLE)
      .select(
        "id, workspace_id, advertiser_id, current_ingestion_id, published_ingestion_id",
      )
      .eq("id", reportId)
      .maybeSingle();

  if (error || !data) {
    throw new LiveEntityParityProbeError(
      "REPORT_SCOPE_READ_FAILED",
      "Report scope could not be loaded.",
      {
        cause: error ?? undefined,
      },
    );
  }

  return {
    reportId: normalizeUuid(
      data.id,
      "report.id",
    ),
    workspaceId: normalizeUuid(
      data.workspace_id,
      "report.workspace_id",
    ),
    advertiserId: normalizeUuid(
      data.advertiser_id,
      "report.advertiser_id",
    ),
    currentIngestionId:
      typeof data.current_ingestion_id ===
        "string"
        ? data.current_ingestion_id
        : null,
    publishedIngestionId:
      typeof data.published_ingestion_id ===
        "string"
        ? data.published_ingestion_id
        : null,
  };
}

async function resolveConnectionScope(
  input: {
    reportScope: ReportScope;
    requestedConnectionId:
      string | null;
  },
): Promise<ConnectionScope> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, status, provider, external_account_id",
    )
    .eq(
      "workspace_id",
      input.reportScope.workspaceId,
    )
    .eq(
      "advertiser_id",
      input.reportScope.advertiserId,
    )
    .eq(
      "provider",
      NAVER_SEARCH_ADS_PROVIDER,
    )
    .eq("status", "active");

  if (input.requestedConnectionId) {
    query = query.eq(
      "id",
      input.requestedConnectionId,
    );
  }

  const { data, error } =
    await query.order(
      "created_at",
      { ascending: true },
    );

  if (error) {
    throw new LiveEntityParityProbeError(
      "CONNECTION_SCOPE_READ_FAILED",
      "Media connection scope could not be loaded.",
      { cause: error },
    );
  }

  const records =
    Array.isArray(data) ? data : [];

  if (records.length !== 1) {
    throw new LiveEntityParityProbeError(
      "CONNECTION_SCOPE_NOT_UNIQUE",
      `Expected exactly one active Naver connection, found ${records.length}.`,
    );
  }

  const record = records[0];

  return {
    connectionId: normalizeUuid(
      record.id,
      "connection.id",
    ),
    workspaceId: normalizeUuid(
      record.workspace_id,
      "connection.workspace_id",
    ),
    advertiserId: normalizeUuid(
      record.advertiser_id,
      "connection.advertiser_id",
    ),
    status: normalizeRequiredString(
      record.status,
      "connection.status",
      100,
    ),
    externalAccountId:
      normalizeRequiredString(
        record.external_account_id,
        "connection.external_account_id",
        300,
      ),
  };
}

async function assertNoActiveJob(
  reportId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id, status")
      .eq("report_id", reportId)
      .in(
        "status",
        [...ACTIVE_JOB_STATUSES],
      )
      .limit(1);

  if (error) {
    throw new LiveEntityParityProbeError(
      "ACTIVE_JOB_CHECK_FAILED",
      "Active job state could not be checked.",
      { cause: error },
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new LiveEntityParityProbeError(
      "ACTIVE_JOB_EXISTS",
      "The report has an active media sync job.",
    );
  }
}

type ExactCountFilter =
  | {
      kind: "eq";
      column: string;
      value: string;
    }
  | {
      kind: "in";
      column: string;
      values: readonly string[];
    };

async function readExactCount(
  table: string,
  filter: ExactCountFilter,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const base = supabase
    .from(table)
    .select("id", {
      count: "exact",
      head: true,
    });

  const result =
    filter.kind === "eq"
      ? await base.eq(
          filter.column,
          filter.value,
        )
      : await base.in(
          filter.column,
          [...filter.values],
        );

  if (
    result.error ||
    typeof result.count !== "number"
  ) {
    throw new LiveEntityParityProbeError(
      "DATABASE_STATE_READ_FAILED",
      `Count could not be loaded from ${table}.`,
      {
        cause:
          result.error ?? undefined,
      },
    );
  }

  return result.count;
}

async function readDatabaseState(
  input: {
    reportScope: ReportScope;
    connectionScope: ConnectionScope;
  },
): Promise<DatabaseState> {
  const supabase = getSupabaseAdmin();

  const [
    reportResult,
    connectionResult,
    jobsResult,
    reportIngestionsCount,
    currentReportRowsCount,
  ] = await Promise.all([
    supabase
      .from(REPORTS_TABLE)
      .select(
        "current_ingestion_id, published_ingestion_id, updated_at",
      )
      .eq(
        "id",
        input.reportScope.reportId,
      )
      .maybeSingle(),

    supabase
      .from(MEDIA_CONNECTIONS_TABLE)
      .select(
        "id, status, last_sync_at, last_error, updated_at",
      )
      .eq(
        "id",
        input.connectionScope.connectionId,
      )
      .maybeSingle(),

    supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select(
        "id, status, created_at, updated_at",
      )
      .eq(
        "report_id",
        input.reportScope.reportId,
      )
      .order(
        "created_at",
        { ascending: false },
      ),

    readExactCount(
      REPORT_INGESTIONS_TABLE,
      {
        kind: "eq",
        column: "report_id",
        value:
          input.reportScope.reportId,
      },
    ),

    input.reportScope
      .currentIngestionId
      ? readExactCount(
          REPORT_ROWS_TABLE,
          {
            kind: "eq",
            column: "ingestion_id",
            value:
              input.reportScope
                .currentIngestionId,
          },
        )
      : Promise.resolve(0),
  ]);

  if (
    reportResult.error ||
    !reportResult.data
  ) {
    throw new LiveEntityParityProbeError(
      "DATABASE_STATE_READ_FAILED",
      "Report state could not be loaded.",
      {
        cause:
          reportResult.error ?? undefined,
      },
    );
  }

  if (
    connectionResult.error ||
    !connectionResult.data
  ) {
    throw new LiveEntityParityProbeError(
      "DATABASE_STATE_READ_FAILED",
      "Connection state could not be loaded.",
      {
        cause:
          connectionResult.error ??
          undefined,
      },
    );
  }

  if (jobsResult.error) {
    throw new LiveEntityParityProbeError(
      "DATABASE_STATE_READ_FAILED",
      "Job state could not be loaded.",
      { cause: jobsResult.error },
    );
  }

  const jobs = Array.isArray(
    jobsResult.data,
  )
    ? jobsResult.data
    : [];

  const jobIds = jobs
    .map((job) =>
      typeof job.id === "string"
        ? job.id
        : "",
    )
    .filter(Boolean);

  const stagingRowsCount =
    jobIds.length > 0
      ? await readExactCount(
          MEDIA_SYNC_STAGING_ROWS_TABLE,
          {
            kind: "in",
            column: "job_id",
            values: jobIds,
          },
        )
      : 0;

  const latestJob =
    jobs[0] ?? null;

  return {
    report: {
      currentIngestionId:
        reportResult.data
          .current_ingestion_id ??
        null,
      publishedIngestionId:
        reportResult.data
          .published_ingestion_id ??
        null,
      updatedAt:
        reportResult.data.updated_at ??
        null,
    },
    connection: {
      id:
        connectionResult.data.id,
      status:
        connectionResult.data.status,
      lastSyncAt:
        connectionResult.data
          .last_sync_at ?? null,
      lastError:
        connectionResult.data
          .last_error ?? null,
      updatedAt:
        connectionResult.data
          .updated_at ?? null,
    },
    jobs: {
      count: jobs.length,
      activeCount:
        jobs.filter((job) =>
          ACTIVE_JOB_STATUSES.includes(
            job.status as
              (typeof ACTIVE_JOB_STATUSES)[number],
          ),
        ).length,
      latestId:
        latestJob?.id ?? null,
      latestStatus:
        latestJob?.status ?? null,
      latestUpdatedAt:
        latestJob?.updated_at ?? null,
    },
    reportIngestionsCount,
    currentReportRowsCount,
    stagingRowsCount,
  };
}

function databaseStatesMatch(
  before: DatabaseState,
  after: DatabaseState,
): boolean {
  return stableJson(before) ===
    stableJson(after);
}

function printProbeHeader(
  input: {
    probeInput: ProbeInput;
    reportScope: ReportScope;
    connectionScope: ConnectionScope;
  },
): void {
  console.log(
    "Naver entity parity live probe:",
    "READ_ONLY",
  );
  console.log(
    "report ID:",
    input.reportScope.reportId,
  );
  console.log(
    "connection ID:",
    input.connectionScope.connectionId,
  );
  console.log(
    "date range:",
    `${input.probeInput.dateFrom} ~ ${input.probeInput.dateTo}`,
  );
  console.log(
    "request interval ms:",
    input.probeInput.requestIntervalMs,
  );
  console.log(
    "detail entity safety limit:",
    input.probeInput
      .maxDetailEntitiesPerGrain,
  );
  console.log(
    "creates media_sync_jobs:",
    false,
  );
  console.log(
    "writes staging:",
    false,
  );
  console.log(
    "creates report_ingestions:",
    false,
  );
  console.log(
    "writes report_rows:",
    false,
  );
  console.log(
    "changes report pointers:",
    false,
  );
}

function printTargetResult(
  result: TargetProbeResult,
): void {
  console.log("");
  console.log(
    `=== ${result.targetName} ===`,
  );
  console.log(
    "campaign:",
    JSON.stringify({
      id: result.campaignId,
      name: result.campaignName,
      campaignType:
        result.campaignType,
      adgroupCount:
        result.adgroupCount,
      keywordCount:
        result.keywordCount,
      adCount: result.adCount,
      adDiscoveryError:
        result.adDiscoveryError,
    }),
  );

  console.table(
    result.grains.map((grain) => ({
      grain: grain.grain,
      status: grain.status,
      entity_count:
        grain.entityCount,
      stats_requests:
        grain.statsRequests,
      impressions:
        grain.totals?.impCnt ?? null,
      clicks:
        grain.totals?.clkCnt ?? null,
      cost:
        grain.totals?.salesAmt ?? null,
      conversions:
        grain.totals?.ccnt ?? null,
      revenue:
        grain.totals?.convAmt ?? null,
      expected_impressions:
        result.expected.impCnt,
      expected_clicks:
        result.expected.clkCnt,
      matches_ui:
        grain.matchesExpected,
      summary_data_mismatches:
        grain.summaryDataMismatchCount,
      error:
        grain.errorCode,
    })),
  );

  console.log(
    "matching grains:",
    result.matchingGrains,
  );
  console.log(
    "recommended detail grain:",
    result.recommendedDetailGrain,
  );
}

async function probeTargetCampaign(
  input: {
    target: TargetCampaignSpec;
    campaign:
      NaverSearchAdsCampaignRecord;
    scheduler: NaverRequestScheduler;
    credentials: NaverCredentials;
    probeInput: ProbeInput;
  },
): Promise<TargetProbeResult> {
  console.log("");
  console.log(
    `[parity-probe] probing ${input.target.displayName}`,
    {
      campaignId:
        input.campaign.id,
      campaignName:
        input.campaign.name,
      campaignType:
        input.campaign.campaignType,
    },
  );

  const adgroups =
    await fetchAllAdgroups({
      scheduler: input.scheduler,
      credentials: input.credentials,
      campaignId:
        input.campaign.id,
    });

  const keywords =
    await fetchAllKeywords({
      scheduler: input.scheduler,
      credentials: input.credentials,
      adgroups,
    });

  let ads: AdRecord[] | null = null;
  let adDiscoveryError:
    string | null = null;

  try {
    ads = await fetchAllAds({
      scheduler: input.scheduler,
      credentials: input.credentials,
      adgroups,
    });
  } catch (error) {
    adDiscoveryError =
      safeErrorCode(error);

    console.warn(
      `[parity-probe] ad discovery unavailable for ${input.target.displayName}`,
      adDiscoveryError,
    );
  }

  const grains: GrainResult[] = [];

  grains.push(
    await aggregateEntityStats({
      grain: "campaign",
      entityIds: [
        input.campaign.id,
      ],
      scheduler: input.scheduler,
      credentials: input.credentials,
      dateFrom:
        input.probeInput.dateFrom,
      dateTo:
        input.probeInput.dateTo,
      expected:
        input.target.expected,
      maxEntities: null,
    }),
  );

  grains.push(
    await aggregateEntityStats({
      grain: "adgroup",
      entityIds: adgroups.map(
        (adgroup) => adgroup.id,
      ),
      scheduler: input.scheduler,
      credentials: input.credentials,
      dateFrom:
        input.probeInput.dateFrom,
      dateTo:
        input.probeInput.dateTo,
      expected:
        input.target.expected,
      maxEntities: null,
    }),
  );

  grains.push(
    await aggregateEntityStats({
      grain: "keyword",
      entityIds: keywords.map(
        (keyword) => keyword.id,
      ),
      scheduler: input.scheduler,
      credentials: input.credentials,
      dateFrom:
        input.probeInput.dateFrom,
      dateTo:
        input.probeInput.dateTo,
      expected:
        input.target.expected,
      maxEntities:
        input.probeInput
          .maxDetailEntitiesPerGrain,
    }),
  );

  if (ads === null) {
    grains.push(
      createUnavailableGrainResult(
        "ad",
        "unsupported",
        0,
        adDiscoveryError,
      ),
    );
  } else {
    grains.push(
      await aggregateEntityStats({
        grain: "ad",
        entityIds: ads.map(
          (ad) => ad.id,
        ),
        scheduler:
          input.scheduler,
        credentials:
          input.credentials,
        dateFrom:
          input.probeInput.dateFrom,
        dateTo:
          input.probeInput.dateTo,
        expected:
          input.target.expected,
        maxEntities:
          input.probeInput
            .maxDetailEntitiesPerGrain,
      }),
    );
  }

  const matchingGrains = grains
    .filter(
      (grain) =>
        grain.matchesExpected === true,
    )
    .map((grain) => grain.grain);

  return {
    targetKey: input.target.key,
    targetName:
      input.target.displayName,
    campaignId:
      input.campaign.id,
    campaignName:
      input.campaign.name,
    campaignType:
      input.campaign.campaignType,
    expected:
      input.target.expected,
    adgroupCount:
      adgroups.length,
    keywordCount:
      keywords.length,
    adCount:
      ads?.length ?? null,
    adDiscoveryError,
    grains,
    matchingGrains,
    recommendedDetailGrain:
      chooseRecommendedDetailGrain(
        grains,
      ),
  };
}

async function main(): Promise<void> {
  const probeInput = readProbeInput();

  await assertNoActiveJob(
    probeInput.reportId,
  );

  const reportScope =
    await readReportScope(
      probeInput.reportId,
    );

  const connectionScope =
    await resolveConnectionScope({
      reportScope,
      requestedConnectionId:
        probeInput.connectionId,
    });

  if (
    connectionScope.workspaceId !==
      reportScope.workspaceId ||
    connectionScope.advertiserId !==
      reportScope.advertiserId
  ) {
    throw new LiveEntityParityProbeError(
      "SCOPE_MISMATCH",
      "Connection scope does not match report scope.",
    );
  }

  const decrypted =
    await decryptNaverSearchAdsConnection({
      connectionId:
        connectionScope.connectionId,
      workspaceId:
        reportScope.workspaceId,
      advertiserId:
        reportScope.advertiserId,
    });

  if (
    decrypted.credentials.customerId !==
    connectionScope.externalAccountId
  ) {
    throw new LiveEntityParityProbeError(
      "CREDENTIAL_SCOPE_MISMATCH",
      "Credential customerId does not match the connection account.",
    );
  }

  printProbeHeader({
    probeInput,
    reportScope,
    connectionScope,
  });

  const databaseStateBefore =
    await readDatabaseState({
      reportScope,
      connectionScope,
    });

  console.log(
    "database state before:",
    JSON.stringify(
      databaseStateBefore,
    ),
  );

  const scheduler =
    new NaverRequestScheduler(
      probeInput.requestIntervalMs,
    );

  let results:
    TargetProbeResult[] = [];
  let runError: unknown = null;

  try {
    const campaigns =
      await fetchAllCampaigns({
        scheduler,
        credentials:
          decrypted.credentials,
      });

    console.log(
      "campaigns discovered:",
      campaigns.length,
    );

    console.log(
      "excluded display campaigns:",
      EXCLUDED_DISPLAY_CAMPAIGNS,
    );

    const targetResolutions =
      TARGET_CAMPAIGNS.map(
        (target) => ({
          target,
          campaign:
            resolveTargetCampaign(
              campaigns,
              target,
            ),
        }),
      );

    const unresolvedTargets =
      targetResolutions.filter(
        (item) =>
          item.campaign === null,
      );

    const resolvedTargets =
      targetResolutions.filter(
        (item): item is {
          target: TargetCampaignSpec;
          campaign:
            NaverSearchAdsCampaignRecord;
        } => item.campaign !== null,
      );

    console.table(
      targetResolutions.map(
        ({ target, campaign }) => ({
          target:
            target.displayName,
          resolution:
            campaign ? "resolved" : "unresolved",
          campaign_id:
            campaign?.id ?? null,
          campaign_name:
            campaign?.name ?? null,
          campaign_type:
            campaign?.campaignType ?? null,
          expected_impressions:
            target.expected.impCnt,
          expected_clicks:
            target.expected.clkCnt,
        }),
      ),
    );

    for (
      const {
        target,
        campaign,
      } of resolvedTargets
    ) {
      const result =
        await probeTargetCampaign({
          target,
          campaign,
          scheduler,
          credentials:
            decrypted.credentials,
          probeInput,
        });

      results.push(result);
      printTargetResult(result);
    }

    if (unresolvedTargets.length > 0) {
      console.error(
        "unresolved Search Ads targets:",
        unresolvedTargets.map(
          ({ target }) => ({
            key: target.key,
            displayName:
              target.displayName,
            campaignIds:
              target.campaignIds,
          }),
        ),
      );
    }
  } catch (error) {
    runError = error;
  }

  const databaseStateAfter =
    await readDatabaseState({
      reportScope,
      connectionScope,
    });

  const databaseUnchanged =
    databaseStatesMatch(
      databaseStateBefore,
      databaseStateAfter,
    );

  console.log("");
  console.log(
    "database state after:",
    JSON.stringify(
      databaseStateAfter,
    ),
  );
  console.log(
    "database unchanged:",
    databaseUnchanged,
  );
  console.log(
    "total Naver API requests:",
    scheduler.totalRequests,
  );

  if (!databaseUnchanged) {
    process.exitCode = 1;

    if (runError === null) {
      runError =
        new LiveEntityParityProbeError(
          "DATABASE_CHANGED",
          "Database state changed during the read-only probe.",
        );
    }
  }

  if (runError !== null) {
    throw runError;
  }

  const campaignGrains =
    results.map((result) => {
      const campaignGrain =
        result.grains.find(
          (grain) =>
            grain.grain ===
            "campaign",
        );

      if (
        !campaignGrain ||
        !campaignGrain.totals
      ) {
        throw new LiveEntityParityProbeError(
          "CAMPAIGN_STATS_MISSING",
          `Campaign stats are missing for ${result.targetName}.`,
        );
      }

      return {
        result,
        grain: campaignGrain,
      };
    });

  const actualAccountCampaignTotal =
    campaignGrains.reduce(
      (total, item) =>
        addMetrics(
          total,
          item.grain.totals ??
            createEmptyMetrics(),
        ),
      createEmptyMetrics(),
    );

  const campaignParityPassed =
    campaignGrains.every(
      (item) =>
        item.grain
          .matchesExpected === true,
    );

  const accountCampaignParityPassed =
    actualAccountCampaignTotal.impCnt ===
      EXPECTED_SEARCH_ADS_TOTAL.impCnt &&
    actualAccountCampaignTotal.clkCnt ===
      EXPECTED_SEARCH_ADS_TOTAL.clkCnt;

  console.log("");
  console.log("=== FINAL PARITY ===");

  console.table(
    results.map((result) => {
      const campaign =
        result.grains.find(
          (grain) =>
            grain.grain ===
            "campaign",
        );

      const keyword =
        result.grains.find(
          (grain) =>
            grain.grain ===
            "keyword",
        );

      return {
        target: result.targetName,
        expected_impressions:
          result.expected.impCnt,
        campaign_impressions:
          campaign?.totals
            ?.impCnt ?? null,
        keyword_impressions:
          keyword?.totals
            ?.impCnt ?? null,
        expected_clicks:
          result.expected.clkCnt,
        campaign_clicks:
          campaign?.totals
            ?.clkCnt ?? null,
        keyword_clicks:
          keyword?.totals
            ?.clkCnt ?? null,
        campaign_matches_ui:
          campaign
            ?.matchesExpected ??
          null,
        keyword_matches_ui:
          keyword
            ?.matchesExpected ??
          null,
        recommended_detail_grain:
          result.recommendedDetailGrain,
      };
    }),
  );

  console.log(
    "expected Search Ads total:",
    EXPECTED_SEARCH_ADS_TOTAL,
  );
  console.log(
    "campaign-level Search Ads total:",
    {
      impCnt:
        actualAccountCampaignTotal.impCnt,
      clkCnt:
        actualAccountCampaignTotal.clkCnt,
    },
  );
  console.log(
    "all target campaign stats match UI:",
    campaignParityPassed,
  );
  console.log(
    "campaign-level Search Ads total matches UI:",
    accountCampaignParityPassed,
  );
  console.log(
    "database unchanged:",
    databaseUnchanged,
  );
  console.log(
    "ADVoost display campaign excluded from Search Ads parity:",
    true,
  );

  const verificationPassed =
    databaseUnchanged &&
    results.length ===
      TARGET_CAMPAIGNS.length &&
    campaignParityPassed &&
    accountCampaignParityPassed;

  console.log(
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    "Naver entity parity live probe failed:",
    safeErrorCode(error),
  );

  if (
    error instanceof
      LiveEntityParityProbeError ||
    error instanceof
      NaverSearchAdsApiError ||
    error instanceof
      MediaConnectionsRepositoryError
  ) {
    process.exitCode = 1;
    return;
  }

  process.exitCode = 1;
});

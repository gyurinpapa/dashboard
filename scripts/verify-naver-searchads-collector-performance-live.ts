// scripts/verify-naver-searchads-collector-performance-live.ts

import { performance } from "node:perf_hooks";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  decryptNaverSearchAdsConnection,
} from "../src/lib/media-sync/media-connections-repository";
import {
  collectNaverKeywordDailyStats,
  type NaverKeywordStatsCollectorProgressEvent,
  type NaverKeywordStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";
import {
  collectNaverAuthoritativeEntityDailyStats,
  type NaverAuthoritativeEntityStatsCollectorProgressEvent,
  type NaverAuthoritativeEntityStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  fetchNaverSearchAdsAdPage,
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsEntityDailyStats,
  fetchNaverSearchAdsKeywordDailyStats,
  fetchNaverSearchAdsKeywordPage,
} from "../src/lib/media-sync/naver-searchads-api";

const REPORTS_TABLE = "reports";

const DATE_WINDOW_INDEX = 0;

const REQUEST_INTERVAL_MS = 1_000;
const MAX_RETRY_COUNT = 3;

const MAX_KEYWORD_STATS_PER_RUN = 100;
const MAX_KEYWORD_STATS_REQUESTS_PER_RUN = 50;
const MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN = 20;

const MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN = 100;
const MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN = 50;
const MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN = 20;

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  dateFrom: string;
  dateTo: string;
};

type ReportPointers = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

type ApiOperation =
  | "campaign_page"
  | "adgroup_page"
  | "keyword_page"
  | "ad_page"
  | "keyword_stats"
  | "entity_stats";

type ApiMeasurement = {
  calls: number;
  failures: number;
  totalMs: number;
  maxMs: number;
};

type MetricTotal = {
  rows: number;
  impressions: number;
  clicks: number;
};

type ProgressSnapshot = {
  stage: string;
  campaignPagesRead: number;
  campaignsRead: number;
  adgroupPagesRead: number;
  adgroupsRead: number;
  entityPagesRead: number;
  discovered: number;
  completed: number;
  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;
  retryCount: number;
};

function normalizeRequiredArgument(
  value: unknown,
  name: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(`${name} argument is required.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${name} argument must not be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${name} argument is too long.`);
  }

  return normalized;
}

function readInput(): VerificationInput {
  const [
    reportId,
    connectionId,
    workspaceId,
    advertiserId,
    dateFrom,
    dateTo,
  ] = process.argv.slice(2);

  return {
    reportId:
      normalizeRequiredArgument(reportId, "reportId"),
    connectionId:
      normalizeRequiredArgument(connectionId, "connectionId"),
    workspaceId:
      normalizeRequiredArgument(workspaceId, "workspaceId"),
    advertiserId:
      normalizeRequiredArgument(advertiserId, "advertiserId"),
    dateFrom:
      normalizeRequiredArgument(dateFrom, "dateFrom", 10),
    dateTo:
      normalizeRequiredArgument(dateTo, "dateTo", 10),
  };
}

async function readReportPointers(
  reportId: string,
): Promise<ReportPointers> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select("current_ingestion_id, published_ingestion_id")
    .eq("id", reportId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "COLLECTOR_PERFORMANCE_REPORT_POINTER_READ_FAILED",
    );
  }

  return {
    currentIngestionId:
      data.current_ingestion_id ?? null,
    publishedIngestionId:
      data.published_ingestion_id ?? null,
  };
}

function pointersMatch(
  before: ReportPointers,
  after: ReportPointers,
): boolean {
  return (
    before.currentIngestionId ===
      after.currentIngestionId &&
    before.publishedIngestionId ===
      after.publishedIngestionId
  );
}

function createMeasurements(): Record<
  ApiOperation,
  ApiMeasurement
> {
  return {
    campaign_page: {
      calls: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    },
    adgroup_page: {
      calls: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    },
    keyword_page: {
      calls: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    },
    ad_page: {
      calls: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    },
    keyword_stats: {
      calls: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    },
    entity_stats: {
      calls: 0,
      failures: 0,
      totalMs: 0,
      maxMs: 0,
    },
  };
}

async function measureCall<T>(
  measurements: Record<ApiOperation, ApiMeasurement>,
  operation: ApiOperation,
  call: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const measurement = measurements[operation];

  measurement.calls += 1;

  try {
    return await call();
  } catch (error) {
    measurement.failures += 1;
    throw error;
  } finally {
    const elapsedMs =
      performance.now() - startedAt;

    measurement.totalMs += elapsedMs;
    measurement.maxMs = Math.max(
      measurement.maxMs,
      elapsedMs,
    );
  }
}

function addStatsRecords(
  total: MetricTotal,
  records: readonly {
    impCnt: number | null;
    clkCnt: number | null;
  }[],
): void {
  for (const record of records) {
    total.rows += 1;
    total.impressions +=
      Number(record.impCnt ?? 0);
    total.clicks +=
      Number(record.clkCnt ?? 0);
  }
}

function summarizeProgress(
  event:
    | NaverKeywordStatsCollectorProgressEvent
    | NaverAuthoritativeEntityStatsCollectorProgressEvent,
): ProgressSnapshot {
  return {
    stage: event.stage,
    campaignPagesRead:
      event.campaignPagesRead,
    campaignsRead:
      event.campaignsRead,
    adgroupPagesRead:
      event.adgroupPagesRead,
    adgroupsRead:
      event.adgroupsRead,
    entityPagesRead:
      "keywordPagesRead" in event
        ? event.keywordPagesRead
        : event.entityPagesRead,
    discovered:
      "keywordsDiscoveredInRun" in event
        ? event.keywordsDiscoveredInRun
        : event.entitiesDiscoveredInRun,
    completed:
      "keywordsCompletedInRun" in event
        ? event.keywordsCompletedInRun
        : event.entitiesCompletedInRun,
    statsRequestsAttempted:
      event.statsRequestsAttempted,
    statsRequestsSucceeded:
      event.statsRequestsSucceeded,
    retryCount:
      event.retryCount,
  };
}

function printMeasurements(
  label: string,
  measurements: Record<ApiOperation, ApiMeasurement>,
): void {
  console.log(`${label} API measurements:`);

  for (
    const [operation, value]
    of Object.entries(measurements)
  ) {
    if (value.calls === 0) {
      continue;
    }

    console.log(
      `  ${operation}:`,
      JSON.stringify({
        calls:
          value.calls,
        failures:
          value.failures,
        totalMs:
          Math.round(value.totalMs),
        averageMs:
          Math.round(
            value.totalMs /
              value.calls,
          ),
        maxMs:
          Math.round(value.maxMs),
      }),
    );
  }
}

function findSlowestOperation(
  keywordMeasurements: Record<
    ApiOperation,
    ApiMeasurement
  >,
  authoritativeMeasurements: Record<
    ApiOperation,
    ApiMeasurement
  >,
): {
  phase: string;
  totalMs: number;
} {
  const candidates: {
    phase: string;
    totalMs: number;
  }[] = [];

  for (
    const [operation, measurement]
    of Object.entries(
      keywordMeasurements,
    )
  ) {
    if (measurement.calls > 0) {
      candidates.push({
        phase:
          `keyword:${operation}`,
        totalMs:
          measurement.totalMs,
      });
    }
  }

  for (
    const [operation, measurement]
    of Object.entries(
      authoritativeMeasurements,
    )
  ) {
    if (measurement.calls > 0) {
      candidates.push({
        phase:
          `authoritative:${operation}`,
        totalMs:
          measurement.totalMs,
      });
    }
  }

  return (
    candidates.sort(
      (left, right) =>
        right.totalMs -
        left.totalMs,
    )[0] ?? {
      phase: "none",
      totalMs: 0,
    }
  );
}

async function main(): Promise<void> {
  const input = readInput();

  console.log(
    "NAVER SEARCH ADS COLLECTOR PERFORMANCE LIVE",
  );
  console.log("read-only:", true);
  console.log(
    "date range:",
    `${input.dateFrom}..${input.dateTo}`,
  );
  console.log(
    "bounded keyword stats / requests / discovery pages:",
    `${MAX_KEYWORD_STATS_PER_RUN} / ${MAX_KEYWORD_STATS_REQUESTS_PER_RUN} / ${MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN}`,
  );
  console.log(
    "bounded authoritative stats / requests / discovery pages:",
    `${MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN} / ${MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN} / ${MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN}`,
  );

  const pointersBefore =
    await readReportPointers(
      input.reportId,
    );

  const decrypted =
    await decryptNaverSearchAdsConnection({
      connectionId:
        input.connectionId,
      workspaceId:
        input.workspaceId,
      advertiserId:
        input.advertiserId,
    });

  const keywordMeasurements =
    createMeasurements();

  const authoritativeMeasurements =
    createMeasurements();

  const keywordTotals: MetricTotal = {
    rows: 0,
    impressions: 0,
    clicks: 0,
  };

  const authoritativeTotalsByType =
    new Map<string, MetricTotal>();

  const keywordRetries:
    NaverKeywordStatsCollectorRetryEvent[] =
    [];

  const authoritativeRetries:
    NaverAuthoritativeEntityStatsCollectorRetryEvent[] =
    [];

  let keywordLastProgress:
    ProgressSnapshot | null =
    null;

  let authoritativeLastProgress:
    ProgressSnapshot | null =
    null;

  const keywordStartedAt =
    performance.now();

  const keywordResult =
    await collectNaverKeywordDailyStats({
      credentials:
        decrypted.credentials,
      cursor:
        createNaverKeywordStatsCursor({
          dateWindow: {
            index:
              DATE_WINDOW_INDEX,
            dateFrom:
              input.dateFrom,
            dateTo:
              input.dateTo,
          },
        }),
      requestIntervalMs:
        REQUEST_INTERVAL_MS,
      maxRetryCount:
        MAX_RETRY_COUNT,
      maxKeywordStatsPerRun:
        MAX_KEYWORD_STATS_PER_RUN,
      maxStatsRequestsPerRun:
        MAX_KEYWORD_STATS_REQUESTS_PER_RUN,
      maxKeywordDiscoveryPagesPerRun:
        MAX_KEYWORD_DISCOVERY_PAGES_PER_RUN,
      onKeywordStats:
        async (item) => {
          addStatsRecords(
            keywordTotals,
            item.stats.records,
          );
        },
      onRetry:
        async (event) => {
          keywordRetries.push(event);
        },
      onProgress:
        async (event) => {
          keywordLastProgress =
            summarizeProgress(event);
        },
      dependencies: {
        fetchCampaignPage:
          (apiInput) =>
            measureCall(
              keywordMeasurements,
              "campaign_page",
              () =>
                fetchNaverSearchAdsCampaignPage(
                  apiInput,
                ),
            ),
        fetchAdgroupPage:
          (apiInput) =>
            measureCall(
              keywordMeasurements,
              "adgroup_page",
              () =>
                fetchNaverSearchAdsAdgroupPage(
                  apiInput,
                ),
            ),
        fetchKeywordPage:
          (apiInput) =>
            measureCall(
              keywordMeasurements,
              "keyword_page",
              () =>
                fetchNaverSearchAdsKeywordPage(
                  apiInput,
                ),
            ),
        fetchKeywordDailyStats:
          (apiInput) =>
            measureCall(
              keywordMeasurements,
              "keyword_stats",
              () =>
                fetchNaverSearchAdsKeywordDailyStats(
                  apiInput,
                ),
            ),
      },
    });

  const keywordElapsedMs =
    performance.now() -
    keywordStartedAt;

  const authoritativeStartedAt =
    performance.now();

  const authoritativeResult =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials:
        decrypted.credentials,
      cursor:
        createNaverAuthoritativeEntityStatsCursor({
          dateWindow: {
            index:
              DATE_WINDOW_INDEX,
            dateFrom:
              input.dateFrom,
            dateTo:
              input.dateTo,
          },
        }),
      requestIntervalMs:
        REQUEST_INTERVAL_MS,
      maxRetryCount:
        MAX_RETRY_COUNT,
      maxEntityStatsPerRun:
        MAX_AUTHORITATIVE_ENTITY_STATS_PER_RUN,
      maxStatsRequestsPerRun:
        MAX_AUTHORITATIVE_STATS_REQUESTS_PER_RUN,
      maxDiscoveryPagesPerRun:
        MAX_AUTHORITATIVE_DISCOVERY_PAGES_PER_RUN,
      onEntityStats:
        async (item) => {
          const campaignType =
            item.campaign.campaignType ??
            "UNKNOWN";

          const total =
            authoritativeTotalsByType.get(
              campaignType,
            ) ?? {
              rows: 0,
              impressions: 0,
              clicks: 0,
            };

          addStatsRecords(
            total,
            item.stats.records,
          );

          authoritativeTotalsByType.set(
            campaignType,
            total,
          );
        },
      onRetry:
        async (event) => {
          authoritativeRetries.push(
            event,
          );
        },
      onProgress:
        async (event) => {
          authoritativeLastProgress =
            summarizeProgress(event);
        },
      dependencies: {
        fetchCampaignPage:
          (apiInput) =>
            measureCall(
              authoritativeMeasurements,
              "campaign_page",
              () =>
                fetchNaverSearchAdsCampaignPage(
                  apiInput,
                ),
            ),
        fetchAdgroupPage:
          (apiInput) =>
            measureCall(
              authoritativeMeasurements,
              "adgroup_page",
              () =>
                fetchNaverSearchAdsAdgroupPage(
                  apiInput,
                ),
            ),
        fetchAdPage:
          (apiInput) =>
            measureCall(
              authoritativeMeasurements,
              "ad_page",
              () =>
                fetchNaverSearchAdsAdPage(
                  apiInput,
                ),
            ),
        fetchEntityDailyStats:
          (apiInput) =>
            measureCall(
              authoritativeMeasurements,
              "entity_stats",
              () =>
                fetchNaverSearchAdsEntityDailyStats(
                  apiInput,
                ),
            ),
      },
    });

  const authoritativeElapsedMs =
    performance.now() -
    authoritativeStartedAt;

  const pointersAfter =
    await readReportPointers(
      input.reportId,
    );

  const reportPointersUnchanged =
    pointersMatch(
      pointersBefore,
      pointersAfter,
    );

  const slowest =
    findSlowestOperation(
      keywordMeasurements,
      authoritativeMeasurements,
    );

  console.log(
    "keyword collector result:",
    JSON.stringify({
      status:
        keywordResult.status,
      partialReason:
        keywordResult.partialReason,
      elapsedMs:
        Math.round(
          keywordElapsedMs,
        ),
      campaignPagesRead:
        keywordResult.campaignPagesRead,
      campaignsRead:
        keywordResult.campaignsRead,
      adgroupPagesRead:
        keywordResult.adgroupPagesRead,
      adgroupsRead:
        keywordResult.adgroupsRead,
      keywordPagesRead:
        keywordResult.keywordPagesRead,
      keywordsDiscoveredInRun:
        keywordResult.keywordsDiscoveredInRun,
      keywordsCompletedInRun:
        keywordResult.keywordsCompletedInRun,
      statsRequestsAttempted:
        keywordResult.statsRequestsAttempted,
      statsRequestsSucceeded:
        keywordResult.statsRequestsSucceeded,
      retryCount:
        keywordResult.retryCount,
      callbackRows:
        keywordTotals.rows,
      impressions:
        keywordTotals.impressions,
      clicks:
        keywordTotals.clicks,
      lastProgress:
        keywordLastProgress,
    }),
  );

  printMeasurements(
    "keyword",
    keywordMeasurements,
  );

  console.log(
    "keyword retry events:",
    keywordRetries.length,
  );

  console.log(
    "authoritative collector result:",
    JSON.stringify({
      status:
        authoritativeResult.status,
      partialReason:
        authoritativeResult.partialReason,
      elapsedMs:
        Math.round(
          authoritativeElapsedMs,
        ),
      campaignPagesRead:
        authoritativeResult.campaignPagesRead,
      campaignsRead:
        authoritativeResult.campaignsRead,
      adgroupPagesRead:
        authoritativeResult.adgroupPagesRead,
      adgroupsRead:
        authoritativeResult.adgroupsRead,
      entityPagesRead:
        authoritativeResult.entityPagesRead,
      entitiesDiscoveredInRun:
        authoritativeResult.entitiesDiscoveredInRun,
      entitiesCompletedInRun:
        authoritativeResult.entitiesCompletedInRun,
      statsRequestsAttempted:
        authoritativeResult.statsRequestsAttempted,
      statsRequestsSucceeded:
        authoritativeResult.statsRequestsSucceeded,
      retryCount:
        authoritativeResult.retryCount,
      lastProgress:
        authoritativeLastProgress,
    }),
  );

  printMeasurements(
    "authoritative",
    authoritativeMeasurements,
  );

  console.log(
    "authoritative campaign type totals:",
    JSON.stringify(
      Object.fromEntries(
        authoritativeTotalsByType,
      ),
    ),
  );

  console.log(
    "authoritative retry events:",
    authoritativeRetries.length,
  );

  console.log(
    "slowest measured API phase:",
    JSON.stringify({
      phase:
        slowest.phase,
      totalMs:
        Math.round(
          slowest.totalMs,
        ),
    }),
  );

  console.log(
    "report pointers unchanged:",
    reportPointersUnchanged,
  );

  const passed =
    keywordResult.statsRequestsSucceeded >
      0 &&
    authoritativeResult
      .statsRequestsSucceeded > 0 &&
    reportPointersUnchanged;

  console.log(
    "collector performance verification passed:",
    passed,
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

void main();

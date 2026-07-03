import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  NaverSearchAdsApiError,
} from "../src/lib/media-sync/naver-searchads-api";
import {
  collectNaverKeywordDailyStats,
  NaverKeywordStatsCollectorError,
  type NaverKeywordStatsCollectorResult,
  type NaverKeywordStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
  type NaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const REPORTS_TABLE = "reports";
const REPORT_ROWS_TABLE = "report_rows";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PENDING_STATUS =
  "pending" as const;

const PROCESSING_STATUS =
  "processing" as const;

const ACTIVE_JOB_STATUSES = [
  PENDING_STATUS,
  PROCESSING_STATUS,
] as const;

const REQUEST_INTERVAL_MS = 1_000;
const KEYWORD_CHUNK_SIZE = 100;
const CHUNK_PAUSE_MS = 10_000;
const MAX_RETRY_COUNT = 3;

const COLLECTOR_WRITES_DATABASE = false;
const COLLECTOR_CONVERTS_CANONICAL_ROWS = false;
const COLLECTOR_CREATES_SNAPSHOT = false;
const COLLECTOR_WRITES_REPORT_ROWS = false;
const COLLECTOR_UPDATES_JOB_PROGRESS = false;
const COLLECTOR_COMPLETES_JOB = false;

const ESTIMATED_SET_ENTRY_OVERHEAD_BYTES = 48;

const RETRY_CATEGORIES = [
  "rate_limit",
  "server_error",
  "network_error",
] as const;

type RetryCategory =
  (typeof RETRY_CATEGORIES)[number];

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};

type VerificationFixture = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
};

type ReportState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
  reportRowsCount: number;
};

type RetryMeasurements = {
  eventCount: number;
  categoryCounts: Record<RetryCategory, number>;
  httpStatusCounts: Map<string, number>;
  operationCounts: Map<string, number>;
};

type CallbackMeasurements = {
  callbackCount: number;
  totalStatsRecords: number;
  totalRequestAttemptCount: number;
  duplicateKeywordDetected: boolean;
  cursorAdvanceValid: boolean;
  keywordIndexAdvanceValid: boolean;
  keywordIdentityValid: boolean;
  callbackIntervalsMs: number[];
  seenKeywordIds: Set<string>;
  keywordIdUtf8Bytes: number;
  lastCallbackAtMs: number | null;
};

type VerificationRuntime = {
  claimMatchesFixture: boolean;
  contextMatchesFixture: boolean;
  collectorResult: NaverKeywordStatsCollectorResult | null;
  collectorElapsedMs: number;
  reportDataUnchangedAfterCollection: boolean;
  cleanupCompleted: boolean;
  reportDataUnchangedAfterCleanup: boolean;
};

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${argumentName} argument is required.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function readVerificationInput(): VerificationInput {
  const [
    reportIdArgument,
    connectionIdArgument,
    workspaceIdArgument,
    advertiserIdArgument,
    createdByArgument,
    dateFromArgument,
    dateToArgument,
  ] = process.argv.slice(2);

  return {
    reportId: normalizeRequiredArgument(
      reportIdArgument,
      "reportId",
    ),
    connectionId:
      normalizeRequiredArgument(
        connectionIdArgument,
        "connectionId",
      ),
    workspaceId:
      normalizeRequiredArgument(
        workspaceIdArgument,
        "workspaceId",
      ),
    advertiserId:
      normalizeRequiredArgument(
        advertiserIdArgument,
        "advertiserId",
      ),
    createdBy:
      normalizeRequiredArgument(
        createdByArgument,
        "createdBy",
      ),
    dateFrom:
      normalizeRequiredArgument(
        dateFromArgument,
        "dateFrom",
        10,
      ),
    dateTo:
      normalizeRequiredArgument(
        dateToArgument,
        "dateTo",
        10,
      ),
  };
}

function createRetryMeasurements(): RetryMeasurements {
  return {
    eventCount: 0,
    categoryCounts: {
      rate_limit: 0,
      server_error: 0,
      network_error: 0,
    },
    httpStatusCounts:
      new Map<string, number>(),
    operationCounts:
      new Map<string, number>(),
  };
}

function createCallbackMeasurements(): CallbackMeasurements {
  return {
    callbackCount: 0,
    totalStatsRecords: 0,
    totalRequestAttemptCount: 0,
    duplicateKeywordDetected: false,
    cursorAdvanceValid: true,
    keywordIndexAdvanceValid: true,
    keywordIdentityValid: true,
    callbackIntervalsMs: [],
    seenKeywordIds: new Set<string>(),
    keywordIdUtf8Bytes: 0,
    lastCallbackAtMs: null,
  };
}

function incrementMapCount(
  map: Map<string, number>,
  key: string,
): void {
  map.set(
    key,
    (map.get(key) ?? 0) + 1,
  );
}

function mapToSortedRecord(
  map: Map<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(
      ([left], [right]) =>
        left.localeCompare(right),
    ),
  );
}

function getElapsedMilliseconds(
  startedAt: bigint,
): number {
  return Number(
    process.hrtime.bigint() - startedAt,
  ) / 1_000_000;
}

function roundToTwoDecimals(
  value: number,
): number {
  return Math.round(value * 100) / 100;
}

function calculateAverage(
  values: readonly number[],
): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce(
    (sum, value) => sum + value,
    0,
  ) / values.length;
}

function calculatePercentile(
  values: readonly number[],
  percentile: number,
): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort(
    (left, right) => left - right,
  );

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(
      0,
      Math.ceil(
        percentile * sortedValues.length,
      ) - 1,
    ),
  );

  return roundToTwoDecimals(
    sortedValues[index] ?? 0,
  );
}

function estimateKeywordIdSetBytes(
  measurements: CallbackMeasurements,
): number {
  return (
    measurements.keywordIdUtf8Bytes +
    measurements.seenKeywordIds.size *
      ESTIMATED_SET_ENTRY_OVERHEAD_BYTES
  );
}

function formatCursorForLog(
  cursor: NaverKeywordStatsCursor,
): Record<string, unknown> {
  return {
    version: cursor.version,
    dateWindowIndex:
      cursor.dateWindowIndex,
    dateFrom: cursor.dateFrom,
    dateTo: cursor.dateTo,
    campaignBaseSearchId:
      cursor.campaignBaseSearchId,
    campaignId: cursor.campaignId,
    adgroupBaseSearchId:
      cursor.adgroupBaseSearchId,
    adgroupId: cursor.adgroupId,
    keywordBaseSearchId:
      cursor.keywordBaseSearchId,
    keywordChunkIndex:
      cursor.keywordChunkIndex,
    keywordIndexInChunk:
      cursor.keywordIndexInChunk,
    lastCompletedKeywordId:
      cursor.lastCompletedKeywordId,
    completedKeywordCount:
      cursor.completedKeywordCount,
    discoveredKeywordCount:
      cursor.discoveredKeywordCount,
  };
}

function printExecutionNotice(): void {
  console.log(
    "live collector verification mode:",
    "read-only collection with one temporary media_sync_jobs fixture",
  );
  console.log(
    "exact total keyword count is unknown until hierarchy traversal completes:",
    true,
  );
  console.log(
    "estimated duration for 1,000 keywords:",
    "approximately 18 minutes or longer",
  );
  console.log(
    "estimated duration for 10,000 keywords:",
    "approximately 3 hours or longer",
  );
  console.log(
    "retries may increase total duration:",
    true,
  );
  console.log(
    "verification runs in the foreground terminal:",
    true,
  );
  console.log(
    "configured stats concurrency:",
    1,
  );
  console.log(
    "configured minimum request interval ms:",
    REQUEST_INTERVAL_MS,
  );
  console.log(
    "configured keyword chunk size:",
    KEYWORD_CHUNK_SIZE,
  );
  console.log(
    "configured chunk pause ms:",
    CHUNK_PAUSE_MS,
  );
  console.log(
    "configured maximum retry count:",
    MAX_RETRY_COUNT,
  );
}

async function assertNoExistingPendingNaverJob(): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("status", PENDING_STATUS)
    .eq("provider", NAVER_PROVIDER)
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_QUEUE_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_PENDING_NAVER_JOB_ALREADY_EXISTS",
    );
  }
}

async function assertNoExistingActiveJobForReport(
  reportId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id, status")
    .eq("report_id", reportId)
    .in(
      "status",
      [...ACTIVE_JOB_STATUSES],
    )
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_ALREADY_EXISTS",
    );
  }
}

async function readReportState(
  reportId: string,
): Promise<ReportState> {
  const supabase = getSupabaseAdmin();

  const reportResult = await supabase
    .from(REPORTS_TABLE)
    .select(
      "current_ingestion_id, published_ingestion_id",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (reportResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_STATE_READ_FAILED",
    );
  }

  if (!reportResult.data) {
    throw new Error(
      "VERIFICATION_REPORT_NOT_FOUND",
    );
  }

  const rowsResult = await supabase
    .from(REPORT_ROWS_TABLE)
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("report_id", reportId);

  if (rowsResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_ROWS_COUNT_FAILED",
    );
  }

  return {
    currentIngestionId:
      reportResult.data
        .current_ingestion_id ?? null,
    publishedIngestionId:
      reportResult.data
        .published_ingestion_id ?? null,
    reportRowsCount:
      rowsResult.count ?? 0,
  };
}

function reportStateMatches(
  before: ReportState,
  after: ReportState,
): boolean {
  return (
    before.currentIngestionId ===
      after.currentIngestionId &&
    before.publishedIngestionId ===
      after.publishedIngestionId &&
    before.reportRowsCount ===
      after.reportRowsCount
  );
}

async function deleteVerificationJob(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", fixture.jobId)
    .eq("report_id", fixture.reportId)
    .eq(
      "workspace_id",
      fixture.workspaceId,
    )
    .eq(
      "advertiser_id",
      fixture.advertiserId,
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
    );
  }

  return data?.id === fixture.jobId;
}

async function verifyJobDeleted(
  jobId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return data === null;
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const deleted =
    await deleteVerificationJob(fixture);

  if (!deleted) {
    return false;
  }

  return verifyJobDeleted(
    fixture.jobId,
  );
}

function validateCursorAdvance(input: {
  cursorBefore: NaverKeywordStatsCursor;
  cursorAfter: NaverKeywordStatsCursor;
  keywordId: string;
}): {
  completedCountValid: boolean;
  keywordIdentityValid: boolean;
  keywordIndexValid: boolean;
} {
  const completedCountValid =
    input.cursorBefore.completedKeywordCount + 1 ===
    input.cursorAfter.completedKeywordCount;

  const keywordIdentityValid =
    input.cursorAfter.lastCompletedKeywordId ===
    input.keywordId;

  const keywordIndexValid =
    input.cursorAfter.keywordIndexInChunk ===
      input.cursorBefore.keywordIndexInChunk + 1 &&
    input.cursorAfter.keywordChunkIndex ===
      input.cursorBefore.keywordChunkIndex;

  return {
    completedCountValid,
    keywordIdentityValid,
    keywordIndexValid,
  };
}

function captureRetryEvent(
  measurements: RetryMeasurements,
  event: NaverKeywordStatsCollectorRetryEvent,
): void {
  measurements.eventCount += 1;
  measurements.categoryCounts[
    event.category
  ] += 1;

  incrementMapCount(
    measurements.httpStatusCounts,
    event.httpStatus === null
      ? "null"
      : String(event.httpStatus),
  );

  incrementMapCount(
    measurements.operationCounts,
    event.operation,
  );

  console.log(
    [
      "collector retry event",
      `operation=${event.operation}`,
      `category=${event.category}`,
      `retryCount=${event.retryCount}`,
      `delayMs=${event.delayMs}`,
      `status=${event.httpStatus ?? "null"}`,
      `errorCode=${event.errorCode}`,
      `keywordId=${event.keywordId ?? "null"}`,
    ].join(" "),
  );
}

function captureKeywordCallback(input: {
  measurements: CallbackMeasurements;
  keywordId: string;
  statsKeywordId: string;
  statsRecordCount: number;
  cursorBefore: NaverKeywordStatsCursor;
  cursorAfter: NaverKeywordStatsCursor;
  requestAttemptCount: number;
}): void {
  const nowMs = Date.now();

  if (
    input.measurements.lastCallbackAtMs !==
    null
  ) {
    input.measurements.callbackIntervalsMs.push(
      nowMs -
        input.measurements.lastCallbackAtMs,
    );
  }

  input.measurements.lastCallbackAtMs =
    nowMs;

  const cursorValidation =
    validateCursorAdvance({
      cursorBefore: input.cursorBefore,
      cursorAfter: input.cursorAfter,
      keywordId: input.keywordId,
    });

  if (!cursorValidation.completedCountValid) {
    input.measurements.cursorAdvanceValid =
      false;
  }

  if (!cursorValidation.keywordIndexValid) {
    input.measurements.keywordIndexAdvanceValid =
      false;
  }

  if (
    !cursorValidation.keywordIdentityValid ||
    input.statsKeywordId !== input.keywordId
  ) {
    input.measurements.keywordIdentityValid =
      false;
  }

  if (
    input.measurements.seenKeywordIds.has(
      input.keywordId,
    )
  ) {
    input.measurements.duplicateKeywordDetected =
      true;
  } else {
    input.measurements.seenKeywordIds.add(
      input.keywordId,
    );
    input.measurements.keywordIdUtf8Bytes +=
      Buffer.byteLength(
        input.keywordId,
        "utf8",
      );
  }

  if (
    !Number.isInteger(
      input.requestAttemptCount,
    ) ||
    input.requestAttemptCount < 1
  ) {
    throw new Error(
      "VERIFICATION_INVALID_REQUEST_ATTEMPT_COUNT",
    );
  }

  input.measurements.callbackCount += 1;
  input.measurements.totalStatsRecords +=
    input.statsRecordCount;
  input.measurements.totalRequestAttemptCount +=
    input.requestAttemptCount;

  if (
    input.measurements.callbackCount % 100 ===
    0
  ) {
    console.log(
      "collector callbacks completed:",
      input.measurements.callbackCount,
    );
  }
}

function printCollectorMeasurements(input: {
  result: NaverKeywordStatsCollectorResult;
  callbackMeasurements: CallbackMeasurements;
  retryMeasurements: RetryMeasurements;
  collectorElapsedMs: number;
  startCursor: NaverKeywordStatsCursor;
}): void {
  const averageKeywordElapsedMs =
    input.callbackMeasurements.callbackCount > 0
      ? input.collectorElapsedMs /
        input.callbackMeasurements.callbackCount
      : 0;

  const estimatedSetBytes =
    estimateKeywordIdSetBytes(
      input.callbackMeasurements,
    );

  console.log(
    "collector completed:",
    input.result.completed,
  );
  console.log(
    "collector total elapsed ms:",
    roundToTwoDecimals(
      input.collectorElapsedMs,
    ),
  );
  console.log(
    "keyword callback count:",
    input.callbackMeasurements.callbackCount,
  );
  console.log(
    "total stats records:",
    input.callbackMeasurements.totalStatsRecords,
  );
  console.log(
    "stats requests attempted:",
    input.result.statsRequestsAttempted,
  );
  console.log(
    "stats requests succeeded:",
    input.result.statsRequestsSucceeded,
  );
  console.log(
    "callback request attempt count total:",
    input.callbackMeasurements
      .totalRequestAttemptCount,
  );
  console.log(
    "retry count:",
    input.result.retryCount,
  );
  console.log(
    "retry event count:",
    input.retryMeasurements.eventCount,
  );
  console.log(
    "retry category counts:",
    JSON.stringify(
      input.retryMeasurements.categoryCounts,
    ),
  );
  console.log(
    "retry HTTP status counts:",
    JSON.stringify(
      mapToSortedRecord(
        input.retryMeasurements
          .httpStatusCounts,
      ),
    ),
  );
  console.log(
    "retry operation counts:",
    JSON.stringify(
      mapToSortedRecord(
        input.retryMeasurements
          .operationCounts,
      ),
    ),
  );
  console.log(
    "campaign pages read:",
    input.result.campaignPagesRead,
  );
  console.log(
    "campaigns read:",
    input.result.campaignsRead,
  );
  console.log(
    "adgroup pages read:",
    input.result.adgroupPagesRead,
  );
  console.log(
    "adgroups read:",
    input.result.adgroupsRead,
  );
  console.log(
    "keyword pages read:",
    input.result.keywordPagesRead,
  );
  console.log(
    "keywords discovered in run:",
    input.result.keywordsDiscoveredInRun,
  );
  console.log(
    "keywords completed in run:",
    input.result.keywordsCompletedInRun,
  );
  console.log(
    "average elapsed ms per completed keyword:",
    roundToTwoDecimals(
      averageKeywordElapsedMs,
    ),
  );
  console.log(
    "callback interval average ms:",
    roundToTwoDecimals(
      calculateAverage(
        input.callbackMeasurements
          .callbackIntervalsMs,
      ),
    ),
  );
  console.log(
    "callback interval p50 ms:",
    calculatePercentile(
      input.callbackMeasurements
        .callbackIntervalsMs,
      0.5,
    ),
  );
  console.log(
    "callback interval p95 ms:",
    calculatePercentile(
      input.callbackMeasurements
        .callbackIntervalsMs,
      0.95,
    ),
  );
  console.log(
    "callback keyword ID duplicate detected:",
    input.callbackMeasurements
      .duplicateKeywordDetected,
  );
  console.log(
    "callback cursor completed count advance valid:",
    input.callbackMeasurements
      .cursorAdvanceValid,
  );
  console.log(
    "callback cursor keyword index advance valid:",
    input.callbackMeasurements
      .keywordIndexAdvanceValid,
  );
  console.log(
    "callback keyword identity valid:",
    input.callbackMeasurements
      .keywordIdentityValid,
  );
  console.log(
    "keyword ID Set size:",
    input.callbackMeasurements
      .seenKeywordIds.size,
  );
  console.log(
    "keyword ID Set estimated bytes:",
    estimatedSetBytes,
  );
  console.log(
    "keyword ID Set is verification-only:",
    true,
  );
  console.log(
    "start cursor completed keyword count:",
    input.startCursor.completedKeywordCount,
  );
  console.log(
    "final cursor completed keyword count:",
    input.result.cursor.completedKeywordCount,
  );
  console.log(
    "final cursor:",
    JSON.stringify(
      formatCursorForLog(
        input.result.cursor,
      ),
    ),
  );
  console.log(
    "collector writes database:",
    COLLECTOR_WRITES_DATABASE,
  );
  console.log(
    "collector converts canonical rows:",
    COLLECTOR_CONVERTS_CANONICAL_ROWS,
  );
  console.log(
    "collector creates snapshot:",
    COLLECTOR_CREATES_SNAPSHOT,
  );
  console.log(
    "collector writes report_rows:",
    COLLECTOR_WRITES_REPORT_ROWS,
  );
  console.log(
    "collector updates job progress:",
    COLLECTOR_UPDATES_JOB_PROGRESS,
  );
  console.log(
    "collector completes job:",
    COLLECTOR_COMPLETES_JOB,
  );
}

function isCollectorContractValid(input: {
  result: NaverKeywordStatsCollectorResult;
  callbackMeasurements: CallbackMeasurements;
  retryMeasurements: RetryMeasurements;
  startCursor: NaverKeywordStatsCursor;
}): boolean {
  const completedKeywordDelta =
    input.result.cursor.completedKeywordCount -
    input.startCursor.completedKeywordCount;

  return (
    input.result.completed === true &&
    input.callbackMeasurements.callbackCount > 0 &&
    !input.callbackMeasurements
      .duplicateKeywordDetected &&
    input.callbackMeasurements
      .cursorAdvanceValid &&
    input.callbackMeasurements
      .keywordIndexAdvanceValid &&
    input.callbackMeasurements
      .keywordIdentityValid &&
    input.result.keywordsCompletedInRun ===
      input.callbackMeasurements.callbackCount &&
    input.result.statsRequestsSucceeded ===
      input.callbackMeasurements.callbackCount &&
    input.result.statsRequestsAttempted >=
      input.result.statsRequestsSucceeded &&
    input.callbackMeasurements
      .totalRequestAttemptCount ===
      input.result.statsRequestsAttempted &&
    completedKeywordDelta ===
      input.callbackMeasurements.callbackCount &&
    input.callbackMeasurements.seenKeywordIds.size ===
      input.callbackMeasurements.callbackCount &&
    input.result.retryCount ===
      input.retryMeasurements.eventCount
  );
}

function printCollectorError(
  error: NaverKeywordStatsCollectorError,
): void {
  console.error(
    "Naver live collector verification failed:",
    error.code,
  );
  console.error(
    "collector error cursor:",
    JSON.stringify(
      formatCursorForLog(error.cursor),
    ),
  );

  if (error.failureState) {
    console.error(
      "collector failure state:",
      JSON.stringify({
        keywordId:
          error.failureState.keywordId,
        httpStatus:
          error.failureState.httpStatus,
        errorCode:
          error.failureState.errorCode,
        retryCount:
          error.failureState.retryCount,
        failedAt:
          error.failureState.failedAt,
        cursor:
          formatCursorForLog(
            error.failureState.cursor,
          ),
      }),
    );
  }
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  let fixture: VerificationFixture | null =
    null;
  let reportStateBefore: ReportState | null =
    null;
  let runError: unknown = null;

  const callbackMeasurements =
    createCallbackMeasurements();
  const retryMeasurements =
    createRetryMeasurements();

  const startCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
    });

  const runtime: VerificationRuntime = {
    claimMatchesFixture: false,
    contextMatchesFixture: false,
    collectorResult: null,
    collectorElapsedMs: 0,
    reportDataUnchangedAfterCollection:
      false,
    cleanupCompleted: false,
    reportDataUnchangedAfterCleanup: false,
  };

  printExecutionNotice();

  try {
    await assertNoExistingPendingNaverJob();

    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    reportStateBefore =
      await readReportState(
        input.reportId,
      );

    console.log(
      "existing pending Naver jobs:",
      0,
    );
    console.log(
      "existing active jobs for report:",
      0,
    );

    const pendingJob =
      await createPendingMediaSyncJob({
        reportId: input.reportId,
        connectionId:
          input.connectionId,
        workspaceId:
          input.workspaceId,
        advertiserId:
          input.advertiserId,
        createdBy: input.createdBy,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        dataLevel: "keyword",
        mode: "snapshot_replace",
      });

    fixture = {
      jobId: pendingJob.id,
      reportId: pendingJob.report_id,
      workspaceId:
        pendingJob.workspace_id,
      advertiserId:
        pendingJob.advertiser_id,
    };

    const claimedJob =
      await claimNextNaverMediaSyncJob();

    runtime.claimMatchesFixture =
      claimedJob !== null &&
      claimedJob.id === pendingJob.id &&
      claimedJob.status ===
        PROCESSING_STATUS &&
      claimedJob.provider ===
        NAVER_PROVIDER;

    console.log(
      "claim matches fixture:",
      runtime.claimMatchesFixture,
    );

    if (!claimedJob) {
      throw new Error(
        "VERIFICATION_CLAIM_RETURNED_NULL",
      );
    }

    const context =
      await loadNaverMediaSyncWorkerContext(
        claimedJob,
      );

    runtime.contextMatchesFixture =
      context.job.id === pendingJob.id &&
      context.connection.id ===
        input.connectionId &&
      context.connection.workspaceId ===
        input.workspaceId &&
      context.connection.advertiserId ===
        input.advertiserId &&
      context.credentials.customerId ===
        context.connection.externalAccountId;

    console.log(
      "worker context matches fixture:",
      runtime.contextMatchesFixture,
    );

    const collectorStartedAt =
      process.hrtime.bigint();

    runtime.collectorResult =
      await collectNaverKeywordDailyStats({
        credentials: context.credentials,
        cursor: startCursor,
        requestIntervalMs:
          REQUEST_INTERVAL_MS,
        keywordChunkSize:
          KEYWORD_CHUNK_SIZE,
        chunkPauseMs:
          CHUNK_PAUSE_MS,
        maxRetryCount:
          MAX_RETRY_COUNT,
        onRetry: async (event) => {
          captureRetryEvent(
            retryMeasurements,
            event,
          );
        },
        onKeywordStats: async (item) => {
          captureKeywordCallback({
            measurements:
              callbackMeasurements,
            keywordId: item.keyword.id,
            statsKeywordId:
              item.stats.keywordId,
            statsRecordCount:
              item.stats.records.length,
            cursorBefore:
              item.cursorBefore,
            cursorAfter:
              item.cursorAfter,
            requestAttemptCount:
              item.requestAttemptCount,
          });
        },
      });

    runtime.collectorElapsedMs =
      getElapsedMilliseconds(
        collectorStartedAt,
      );

    printCollectorMeasurements({
      result: runtime.collectorResult,
      callbackMeasurements,
      retryMeasurements,
      collectorElapsedMs:
        runtime.collectorElapsedMs,
      startCursor,
    });
  } catch (error) {
    runError = error;
  } finally {
    if (
      reportStateBefore !== null
    ) {
      try {
        const reportStateAfterCollection =
          await readReportState(
            input.reportId,
          );

        runtime.reportDataUnchangedAfterCollection =
          reportStateMatches(
            reportStateBefore,
            reportStateAfterCollection,
          );

        console.log(
          "report pointers and rows unchanged after collection:",
          runtime.reportDataUnchangedAfterCollection,
        );
      } catch (error) {
        if (runError === null) {
          runError = error;
        }

        console.error(
          "report state comparison after collection failed:",
          "REPORT_STATE_ERROR",
        );
      }
    }

    if (fixture !== null) {
      try {
        runtime.cleanupCompleted =
          await cleanupFixture(
            fixture,
          );

        console.log(
          "verification fixture deleted:",
          runtime.cleanupCompleted,
        );

        if (!runtime.cleanupCompleted) {
          process.exitCode = 1;
        }
      } catch (error) {
        if (runError === null) {
          runError = error;
        }

        console.error(
          "verification fixture cleanup failed:",
          "CLEANUP_ERROR",
        );
        process.exitCode = 1;
      }
    } else {
      console.log(
        "verification fixture deleted:",
        false,
      );
    }

    if (
      reportStateBefore !== null
    ) {
      try {
        const reportStateAfterCleanup =
          await readReportState(
            input.reportId,
          );

        runtime.reportDataUnchangedAfterCleanup =
          reportStateMatches(
            reportStateBefore,
            reportStateAfterCleanup,
          );

        console.log(
          "report data unchanged after cleanup:",
          runtime.reportDataUnchangedAfterCleanup,
        );
      } catch (error) {
        if (runError === null) {
          runError = error;
        }

        console.error(
          "report state comparison after cleanup failed:",
          "REPORT_STATE_ERROR",
        );
      }
    }
  }

  if (runError !== null) {
    throw runError;
  }

  if (runtime.collectorResult === null) {
    throw new Error(
      "VERIFICATION_COLLECTOR_RESULT_MISSING",
    );
  }

  const collectorContractValid =
    isCollectorContractValid({
      result: runtime.collectorResult,
      callbackMeasurements,
      retryMeasurements,
      startCursor,
    });

  console.log(
    "collector contract valid:",
    collectorContractValid,
  );

  const verificationPassed =
    runtime.claimMatchesFixture &&
    runtime.contextMatchesFixture &&
    collectorContractValid &&
    runtime.reportDataUnchangedAfterCollection &&
    runtime.cleanupCompleted &&
    runtime.reportDataUnchangedAfterCleanup &&
    COLLECTOR_WRITES_DATABASE === false &&
    COLLECTOR_CONVERTS_CANONICAL_ROWS === false &&
    COLLECTOR_CREATES_SNAPSHOT === false &&
    COLLECTOR_WRITES_REPORT_ROWS === false &&
    COLLECTOR_UPDATES_JOB_PROGRESS === false &&
    COLLECTOR_COMPLETES_JOB === false;

  console.log(
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof
    NaverKeywordStatsCollectorError
  ) {
    printCollectorError(error);
    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    NaverSearchAdsApiError
  ) {
    console.error(
      "Naver live collector verification failed:",
      error.code,
      error.status ?? "",
    );
    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "Naver live collector verification failed:",
      error.code,
    );
    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncJobsRepositoryError
  ) {
    console.error(
      "Naver live collector verification failed:",
      error.code,
    );
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver live collector verification failed:",
      error.message.startsWith(
        "VERIFICATION_",
      )
        ? error.message
        : error.name,
    );
    process.exitCode = 1;
    return;
  }

  console.error(
    "Naver live collector verification failed:",
    "UNKNOWN_ERROR",
  );
  process.exitCode = 1;
});

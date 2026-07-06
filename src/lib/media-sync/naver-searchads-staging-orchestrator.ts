import type {
  NaverSearchAdsCredentials,
} from "./connection-credentials";
import {
  createMediaCanonicalRowBatchBuffer,
  type MediaCanonicalRowBatchFlushContext,
  type MediaCanonicalRowBatchBufferState,
} from "./media-canonical-row-batch-buffer";
import {
  appendMediaSyncStagingBatch,
  type AppendMediaSyncStagingBatchResult,
} from "./media-sync-staging-repository";
import {
  assertMediaSyncStagingComplete,
  type MediaSyncStagingSummary,
} from "./media-sync-staging-summary-repository";
import {
  convertNaverKeywordDailyStatsToCanonicalRows,
} from "./naver-searchads-canonical-row";
import {
  collectNaverKeywordDailyStats,
  type NaverKeywordStatsCollectorDependencies,
  type NaverKeywordStatsCollectorProgressCallback,
  type NaverKeywordStatsCollectorResult,
  type NaverKeywordStatsCollectorRetryCallback,
} from "./naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
  normalizeNaverKeywordStatsCursor,
  type NaverKeywordStatsCursor,
} from "./naver-searchads-keyword-stats-state";
import type {
  MediaSyncJobRecord,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DEFAULT_DATE_WINDOW_INDEX = 0;

const DEFAULT_STAGING_BATCH_SIZE = 1_000;

const DEFAULT_REQUEST_INTERVAL_MS = 1_000;

const DEFAULT_KEYWORD_CHUNK_SIZE = 100;

const DEFAULT_CHUNK_PAUSE_MS = 10_000;

const DEFAULT_MAX_RETRY_COUNT = 3;

const MAX_STAGING_BATCH_SIZE = 10_000;

const MAX_KEYWORD_STATS_PER_RUN = 1_000_000;

const MAX_STATS_REQUESTS_PER_RUN = 1_000_000;

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

export type NaverSearchAdsStagingOrchestratorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "CREDENTIAL_SCOPE_MISMATCH";

export class NaverSearchAdsStagingOrchestratorError
  extends Error {
  readonly code:
    NaverSearchAdsStagingOrchestratorErrorCode;

  constructor(
    code:
      NaverSearchAdsStagingOrchestratorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsStagingOrchestratorError";

    this.code =
      code;
  }
}

export type NaverSearchAdsStagingOrchestratorInput = {
  job: MediaSyncJobRecord;

  credentials:
    NaverSearchAdsCredentials;

  dateWindowIndex?: number;

  stagingBatchSize?: number;

  requestIntervalMs?: number;

  keywordChunkSize?: number;

  chunkPauseMs?: number;

  maxRetryCount?: number;

  maxKeywordStatsPerRun?: number;

  maxStatsRequestsPerRun?: number;

  signal?: AbortSignal;

  onRetry?:
    NaverKeywordStatsCollectorRetryCallback;

  onCollectorProgress?:
    NaverKeywordStatsCollectorProgressCallback;

  dependencies?: Partial<
    NaverKeywordStatsCollectorDependencies
  >;
};

export type NaverSearchAdsStagingAppendTotals = {
  flushCount: number;

  submittedRows: number;

  insertedRows: number;

  duplicateRows: number;

  maximumBatchSize: number;

  firstRowIndex: number | null;

  lastRowIndex: number | null;
};

export type NaverSearchAdsStagingPartialSummary = {
  isComplete: false;

  totalRows: number;

  expectedRows: number;

  insertedRows: number;

  duplicateRows: number;
};

export type NaverSearchAdsStagingCheckpointSeed = {
  insertedRows: number;

  rawRows: number;

  normalizedRows: number;

  failedRows: number;

  collector: {
    discoveredKeywords: number;

    completedKeywords: number;

    statsRequestsAttempted: number;

    statsRequestsSucceeded: number;

    retryCount: number;
  };
};

export type NaverSearchAdsStagingOrchestratorResultBase = {
  jobId: string;

  dateWindowIndex: number;

  collector:
    NaverKeywordStatsCollectorResult;

  /**
   * 현재 run에서 새로 canonical 변환된 row 수.
   * resume 시에는 전체 누적 row 수가 아니라 이번 loop의 증가분이다.
   */
  runCanonicalRowCount: number;

  /**
   * staging 전체 누적 row 수.
   * completed 검증과 checkpoint payload 기준값이다.
   */
  canonicalRowCount: number;

  callbackCount: number;

  checkpointSeed:
    NaverSearchAdsStagingCheckpointSeed;

  buffer:
    MediaCanonicalRowBatchBufferState;

  append:
    NaverSearchAdsStagingAppendTotals;
};

export type NaverSearchAdsStagingOrchestratorCompletedResult =
  NaverSearchAdsStagingOrchestratorResultBase & {
    status: "completed";

    isComplete: true;

    summary:
      MediaSyncStagingSummary;
  };

export type NaverSearchAdsStagingOrchestratorPartialResult =
  NaverSearchAdsStagingOrchestratorResultBase & {
    status: "partial";

    isComplete: false;

    summary:
      NaverSearchAdsStagingPartialSummary;
  };

export type NaverSearchAdsStagingOrchestratorResult =
  | NaverSearchAdsStagingOrchestratorCompletedResult
  | NaverSearchAdsStagingOrchestratorPartialResult;

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function normalizePositiveInteger(
  value: unknown,
  fieldName: string,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} must be an integer between 1 and ${maximum}.`,
    );
  }

  return value;
}

function normalizeOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
  maximum: number,
): number | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return normalizePositiveInteger(
    value,
    fieldName,
    maximum,
  );
}

function readNonNegativeInteger(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_JOB",
      "A media sync job record is required.",
    );
  }

  normalizeRequiredString(
    value.id,
    "job.id",
    200,
  );

  normalizeRequiredString(
    value.report_id,
    "job.report_id",
    200,
  );

  normalizeRequiredString(
    value.workspace_id,
    "job.workspace_id",
    200,
  );

  normalizeRequiredString(
    value.advertiser_id,
    "job.advertiser_id",
    200,
  );

  normalizeRequiredString(
    value.connection_id,
    "job.connection_id",
    200,
  );

  normalizeRequiredString(
    value.external_account_id,
    "job.external_account_id",
    500,
  );

  normalizeRequiredString(
    value.date_from,
    "job.date_from",
    10,
  );

  normalizeRequiredString(
    value.date_to,
    "job.date_to",
    10,
  );

  if (
    value.provider !==
    NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads staging orchestration is supported.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "JOB_NOT_PROCESSING",
      "The media sync job must already be processing.",
    );
  }

  const startedAt =
    value.started_at;

  const attemptCount =
    value.attempt_count;

  if (
    typeof startedAt !== "string" ||
    !startedAt.trim() ||
    typeof attemptCount !== "number" ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 1
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_JOB",
      "The processing media sync job has an invalid claim state.",
    );
  }
}

function validateCredentials(
  credentials: unknown,
  expectedCustomerId: string,
): asserts credentials is NaverSearchAdsCredentials {
  if (!isPlainObject(credentials)) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      "Naver Search Ads credentials are required.",
    );
  }

  const customerId =
    normalizeRequiredString(
      credentials.customerId,
      "credentials.customerId",
      500,
    );

  normalizeRequiredString(
    credentials.accessLicense,
    "credentials.accessLicense",
    5_000,
  );

  normalizeRequiredString(
    credentials.secretKey,
    "credentials.secretKey",
    5_000,
  );

  if (
    customerId !==
    expectedCustomerId
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "CREDENTIAL_SCOPE_MISMATCH",
      "The Naver credential customerId does not match the media sync job.",
    );
  }
}

function createEmptyAppendTotals():
  NaverSearchAdsStagingAppendTotals {
  return {
    flushCount:
      0,

    submittedRows:
      0,

    insertedRows:
      0,

    duplicateRows:
      0,

    maximumBatchSize:
      0,

    firstRowIndex:
      null,

    lastRowIndex:
      null,
  };
}

function accumulateAppendResult(input: {
  totals:
    NaverSearchAdsStagingAppendTotals;

  rowsLength: number;

  flushContext:
    MediaCanonicalRowBatchFlushContext;

  result:
    AppendMediaSyncStagingBatchResult;
}): void {
  input.totals.flushCount +=
    1;

  input.totals.submittedRows +=
    input.result.submittedRows;

  input.totals.insertedRows +=
    input.result.insertedRows;

  input.totals.duplicateRows +=
    input.result.duplicateRows;

  input.totals.maximumBatchSize =
    Math.max(
      input.totals.maximumBatchSize,
      input.rowsLength,
    );

  if (
    input.totals.firstRowIndex ===
    null
  ) {
    input.totals.firstRowIndex =
      input.flushContext.rowStartIndex;
  }

  input.totals.lastRowIndex =
    input.flushContext.rowEndIndex;
}

function getProcessingCheckpoint(
  job: MediaSyncJobRecord,
): UnknownRecord | null {
  const errorDetail =
    job.error_detail;

  if (!isPlainObject(errorDetail)) {
    return null;
  }

  const checkpoint =
    errorDetail[PROCESSING_CHECKPOINT_KEY];

  if (!isPlainObject(checkpoint)) {
    return null;
  }

  return checkpoint;
}

function getCheckpointCollector(
  checkpoint: UnknownRecord | null,
): UnknownRecord | null {
  if (!checkpoint) {
    return null;
  }

  const collector =
    checkpoint.collector;

  if (!isPlainObject(collector)) {
    return null;
  }

  return collector;
}

function getCheckpointCursor(
  checkpoint: UnknownRecord | null,
): NaverKeywordStatsCursor | null {
  const collector =
    getCheckpointCollector(
      checkpoint,
    );

  if (!collector) {
    return null;
  }

  const cursor =
    collector.cursor;

  if (!isPlainObject(cursor)) {
    return null;
  }

  try {
    return normalizeNaverKeywordStatsCursor(
      cursor,
    );
  } catch (error) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_JOB",
      "The saved media sync processing checkpoint contains an invalid collector cursor.",
      { cause: error },
    );
  }
}

function getCheckpointSeed(
  checkpoint: UnknownRecord | null,
): NaverSearchAdsStagingCheckpointSeed {
  const collector =
    getCheckpointCollector(
      checkpoint,
    );

  return {
    insertedRows:
      readNonNegativeInteger(
        checkpoint?.inserted_rows,
      ) ?? 0,

    rawRows:
      readNonNegativeInteger(
        checkpoint?.raw_rows,
      ) ?? 0,

    normalizedRows:
      readNonNegativeInteger(
        checkpoint?.normalized_rows,
      ) ?? 0,

    failedRows:
      readNonNegativeInteger(
        checkpoint?.failed_rows,
      ) ?? 0,

    collector: {
      discoveredKeywords:
        readNonNegativeInteger(
          collector?.discovered_keywords,
        ) ?? 0,

      completedKeywords:
        readNonNegativeInteger(
          collector?.completed_keywords,
        ) ?? 0,

      statsRequestsAttempted:
        readNonNegativeInteger(
          collector?.stats_requests_attempted,
        ) ?? 0,

      statsRequestsSucceeded:
        readNonNegativeInteger(
          collector?.stats_requests_succeeded,
        ) ?? 0,

      retryCount:
        readNonNegativeInteger(
          collector?.retry_count,
        ) ?? 0,
    },
  };
}

function createFreshCursor(input: {
  dateWindowIndex: number;
  job: MediaSyncJobRecord;
}): NaverKeywordStatsCursor {
  return createNaverKeywordStatsCursor({
    dateWindow: {
      index:
        input.dateWindowIndex,

      dateFrom:
        input.job.date_from,

      dateTo:
        input.job.date_to,
    },
  });
}

function resolveStartCursor(input: {
  job: MediaSyncJobRecord;
  dateWindowIndex: number;
}): NaverKeywordStatsCursor {
  const checkpoint =
    getProcessingCheckpoint(
      input.job,
    );

  const checkpointCursor =
    getCheckpointCursor(
      checkpoint,
    );

  if (!checkpointCursor) {
    return createFreshCursor({
      job:
        input.job,

      dateWindowIndex:
        input.dateWindowIndex,
    });
  }

  if (
    checkpointCursor.dateWindowIndex !==
      input.dateWindowIndex ||
    checkpointCursor.dateFrom !==
      input.job.date_from ||
    checkpointCursor.dateTo !==
      input.job.date_to
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_JOB",
      "The saved media sync processing checkpoint does not match the current job date window.",
    );
  }

  return checkpointCursor;
}

function createPartialSummary(input: {
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
}): NaverSearchAdsStagingPartialSummary {
  return {
    isComplete:
      false,

    totalRows:
      input.totalRows,

    expectedRows:
      input.totalRows,

    insertedRows:
      input.insertedRows,

    duplicateRows:
      input.duplicateRows,
  };
}

export async function runNaverSearchAdsStagingOrchestrator(
  input:
    NaverSearchAdsStagingOrchestratorInput,
): Promise<
  NaverSearchAdsStagingOrchestratorResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      "Naver staging orchestration input is required.",
    );
  }

  validateJob(
    input.job,
  );

  validateCredentials(
    input.credentials,
    input.job.external_account_id,
  );

  const dateWindowIndex =
    input.dateWindowIndex === undefined
      ? DEFAULT_DATE_WINDOW_INDEX
      : normalizeNonNegativeInteger(
          input.dateWindowIndex,
          "dateWindowIndex",
        );

  const stagingBatchSize =
    input.stagingBatchSize === undefined
      ? DEFAULT_STAGING_BATCH_SIZE
      : normalizePositiveInteger(
          input.stagingBatchSize,
          "stagingBatchSize",
          MAX_STAGING_BATCH_SIZE,
        );

  const requestIntervalMs =
    input.requestIntervalMs === undefined
      ? DEFAULT_REQUEST_INTERVAL_MS
      : normalizeNonNegativeInteger(
          input.requestIntervalMs,
          "requestIntervalMs",
        );

  const keywordChunkSize =
    input.keywordChunkSize === undefined
      ? DEFAULT_KEYWORD_CHUNK_SIZE
      : normalizePositiveInteger(
          input.keywordChunkSize,
          "keywordChunkSize",
          100,
        );

  const chunkPauseMs =
    input.chunkPauseMs === undefined
      ? DEFAULT_CHUNK_PAUSE_MS
      : normalizeNonNegativeInteger(
          input.chunkPauseMs,
          "chunkPauseMs",
        );

  const maxRetryCount =
    input.maxRetryCount === undefined
      ? DEFAULT_MAX_RETRY_COUNT
      : normalizePositiveInteger(
          input.maxRetryCount,
          "maxRetryCount",
          10,
        );

  const maxKeywordStatsPerRun =
    normalizeOptionalPositiveInteger(
      input.maxKeywordStatsPerRun,
      "maxKeywordStatsPerRun",
      MAX_KEYWORD_STATS_PER_RUN,
    );

  const maxStatsRequestsPerRun =
    normalizeOptionalPositiveInteger(
      input.maxStatsRequestsPerRun,
      "maxStatsRequestsPerRun",
      MAX_STATS_REQUESTS_PER_RUN,
    );

  const checkpoint =
    getProcessingCheckpoint(
      input.job,
    );

  const checkpointSeed =
    getCheckpointSeed(
      checkpoint,
    );

  let callbackCount =
    0;

  let runCanonicalRowCount =
    0;

  const appendTotals =
    createEmptyAppendTotals();

  const batchBuffer =
    createMediaCanonicalRowBatchBuffer({
      maxBatchSize:
        stagingBatchSize,

      onFlush:
        async (
          rows,
          flushContext,
        ): Promise<void> => {
          const absoluteFlushContext:
            MediaCanonicalRowBatchFlushContext = {
              ...flushContext,

              rowStartIndex:
                checkpointSeed.insertedRows +
                flushContext.rowStartIndex,

              rowEndIndex:
                checkpointSeed.insertedRows +
                flushContext.rowEndIndex,
            };

          const appendResult =
            await appendMediaSyncStagingBatch({
              job:
                input.job,

              rows,

              rowStartIndex:
                absoluteFlushContext.rowStartIndex,

              dateWindowIndex,
            });

          accumulateAppendResult({
            totals:
              appendTotals,

            rowsLength:
              rows.length,

            flushContext:
              absoluteFlushContext,

            result:
              appendResult,
          });
        },
    });

  const startCursor =
    resolveStartCursor({
      job:
        input.job,

      dateWindowIndex,
    });

  /*
   * collector가 예외로 중단되면 이 호출이 throw되며,
   * 아래 flushRemaining과 complete 검증은 실행되지 않는다.
   *
   * collector가 partial을 반환하면 실패가 아니므로,
   * 현재 buffer를 flush한 뒤 complete 검증 없이 checkpoint 저장 대상으로 반환한다.
   */
  const collectorResult =
    await collectNaverKeywordDailyStats({
      credentials:
        input.credentials,

      cursor:
        startCursor,

      requestIntervalMs,

      keywordChunkSize,

      chunkPauseMs,

      maxRetryCount,

      maxKeywordStatsPerRun,

      maxStatsRequestsPerRun,

      signal:
        input.signal,

      onRetry:
        input.onRetry,

      onProgress:
        input.onCollectorProgress,

      dependencies:
        input.dependencies,

      onKeywordStats:
        async (
          item,
        ): Promise<void> => {
          const canonicalRows =
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                input.job.external_account_id,

              campaign:
                item.campaign,

              adgroup:
                item.adgroup,

              keyword:
                item.keyword,

              stats:
                item.stats,
            });

          await batchBuffer.pushMany(
            canonicalRows,
          );

          callbackCount +=
            1;

          runCanonicalRowCount +=
            canonicalRows.length;
        },
    });

  /*
   * completed/partial 모두 정상 반환이므로,
   * 마지막 메모리 buffer는 반드시 staging에 저장한다.
   */
  await batchBuffer.flushRemaining();

  const bufferState =
    batchBuffer.getState();

  if (
    bufferState.pendingRowCount !==
      0 ||
    bufferState.acceptedRowCount !==
      runCanonicalRowCount ||
    bufferState.flushedRowCount !==
      runCanonicalRowCount ||
    appendTotals.submittedRows !==
      runCanonicalRowCount
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      "The staging pipeline contains inconsistent buffer or append counts.",
    );
  }

  const canonicalRowCount =
    checkpointSeed.insertedRows +
    runCanonicalRowCount;

  const baseResult:
    NaverSearchAdsStagingOrchestratorResultBase = {
      jobId:
        input.job.id,

      dateWindowIndex,

      collector:
        collectorResult,

      runCanonicalRowCount,

      canonicalRowCount,

      callbackCount,

      checkpointSeed,

      buffer:
        bufferState,

      append:
        appendTotals,
    };

  if (
    collectorResult.status ===
    "partial"
  ) {
    return {
      ...baseResult,

      status:
        "partial",

      isComplete:
        false,

      summary:
        createPartialSummary({
          totalRows:
            canonicalRowCount,

          insertedRows:
            checkpointSeed.insertedRows +
            appendTotals.insertedRows,

          duplicateRows:
            appendTotals.duplicateRows,
        }),
    };
  }

  const summary =
    await assertMediaSyncStagingComplete({
      job:
        input.job,

      expectedRows:
        canonicalRowCount,
    });

  return {
    ...baseResult,

    status:
      "completed",

    isComplete:
      true,

    summary,
  };
}
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
  type NaverKeywordStatsCollectorResult,
  type NaverKeywordStatsCollectorRetryCallback,
} from "./naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
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

  signal?: AbortSignal;

  onRetry?:
    NaverKeywordStatsCollectorRetryCallback;

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

export type NaverSearchAdsStagingOrchestratorResult = {
  jobId: string;

  dateWindowIndex: number;

  collector:
    NaverKeywordStatsCollectorResult;

  canonicalRowCount: number;

  callbackCount: number;

  buffer:
    MediaCanonicalRowBatchBufferState;

  append:
    NaverSearchAdsStagingAppendTotals;

  summary:
    MediaSyncStagingSummary;
};

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

  let callbackCount =
    0;

  let canonicalRowCount =
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
          const appendResult =
            await appendMediaSyncStagingBatch({
              job:
                input.job,

              rows,

              rowStartIndex:
                flushContext.rowStartIndex,

              dateWindowIndex,
            });

          accumulateAppendResult({
            totals:
              appendTotals,

            rowsLength:
              rows.length,

            flushContext,

            result:
              appendResult,
          });
        },
    });

  const startCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index:
          dateWindowIndex,

        dateFrom:
          input.job.date_from,

        dateTo:
          input.job.date_to,
      },
    });

  /*
   * collector가 예외로 중단되면 이 호출이 throw되며,
   * 아래 flushRemaining과 complete 검증은 실행되지 않는다.
   *
   * 이미 성공적으로 flush된 staging batch는 그대로 남아
   * 상위 worker가 재시도·실패 처리·cleanup 정책을 결정할 수 있다.
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

      signal:
        input.signal,

      onRetry:
        input.onRetry,

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

          canonicalRowCount +=
            canonicalRows.length;
        },
    });

  /*
   * 전체 collector가 정상 완료된 경우에만
   * 마지막 partial batch를 저장한다.
   */
  await batchBuffer.flushRemaining();

  const bufferState =
    batchBuffer.getState();

  if (
    bufferState.pendingRowCount !==
      0 ||
    bufferState.acceptedRowCount !==
      canonicalRowCount ||
    bufferState.flushedRowCount !==
      canonicalRowCount ||
    appendTotals.submittedRows !==
      canonicalRowCount
  ) {
    throw new NaverSearchAdsStagingOrchestratorError(
      "INVALID_INPUT",
      "The completed staging pipeline contains inconsistent buffer or append counts.",
    );
  }

  const summary =
    await assertMediaSyncStagingComplete({
      job:
        input.job,

      expectedRows:
        canonicalRowCount,
    });

  return {
    jobId:
      input.job.id,

    dateWindowIndex,

    collector:
      collectorResult,

    canonicalRowCount,

    callbackCount,

    buffer:
      bufferState,

    append:
      appendTotals,

    summary,
  };
}
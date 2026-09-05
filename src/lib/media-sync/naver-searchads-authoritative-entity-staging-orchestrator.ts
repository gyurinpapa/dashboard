import type {
  NaverSearchAdsCredentials,
} from "./connection-credentials";
import {
  createMediaCanonicalRowBatchBuffer,
  type MediaCanonicalRowBatchBufferState,
  type MediaCanonicalRowBatchFlushContext,
} from "./media-canonical-row-batch-buffer";
import {
  appendMediaSyncStagingBatch,
  type AppendMediaSyncStagingBatchResult,
  type MediaSyncStagingRepositoryDependencies,
} from "./media-sync-staging-repository";
import {
  convertNaverAuthoritativeEntityCollectorItemToCanonicalRows,
} from "./naver-searchads-authoritative-entity-canonical-adapter";
import {
  collectNaverAuthoritativeEntityDailyStats,
  type NaverAuthoritativeEntityStatsCollectorDependencies,
  type NaverAuthoritativeEntityStatsCollectorProgressEvent,
  type NaverAuthoritativeEntityStatsCollectorResult,
  type NaverAuthoritativeEntityStatsCollectorRetryEvent,
} from "./naver-searchads-authoritative-entity-stats-collector";
import {
  createNaverAuthoritativeEntityStatsCursor,
  normalizeNaverAuthoritativeEntityStatsCursor,
  type NaverAuthoritativeEntityStatsCursor,
} from "./naver-searchads-authoritative-entity-stats-state";
import type {
  NaverSearchAdsCanonicalDimensions,
} from "./naver-searchads-canonical-row";
import {
  isValidMediaSyncDateRange,
  type MediaSyncJobRecord,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DEFAULT_DATE_WINDOW_INDEX =
  0;

const DEFAULT_STAGING_BATCH_SIZE =
  1_000;

const DEFAULT_REQUEST_INTERVAL_MS =
  1_000;

const DEFAULT_MAX_RETRY_COUNT =
  3;

const MAX_STAGING_BATCH_SIZE =
  10_000;

const MAX_ENTITY_STATS_PER_RUN =
  1_000_000;

const MAX_STATS_REQUESTS_PER_RUN =
  1_000_000;

const MAX_DISCOVERY_PAGES_PER_RUN =
  1_000_000;

export type NaverSearchAdsAuthoritativeEntityStagingOrchestratorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "CREDENTIAL_SCOPE_MISMATCH"
  | "CURSOR_SCOPE_MISMATCH"
  | "PIPELINE_COUNT_MISMATCH";

export class NaverSearchAdsAuthoritativeEntityStagingOrchestratorError
  extends Error {
  readonly code:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorErrorCode;

  constructor(
    code:
      NaverSearchAdsAuthoritativeEntityStagingOrchestratorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsAuthoritativeEntityStagingOrchestratorError";

    this.code =
      code;
  }
}

export type NaverSearchAdsAuthoritativeEntityStagingOrchestratorInput = {
  job:
    MediaSyncJobRecord;

  credentials:
    NaverSearchAdsCredentials;

  /**
   * Staging row_index의 절대 시작값.
   *
   * fresh run은 0을 사용하고,
   * partial resume은 직전 결과의 nextRowIndex를 사용한다.
   */
  rowStartIndex:
    number;

  /**
   * Optional in-process authority gate for overlapped collection.
   *
   * Collection and canonical buffering may start immediately, but no
   * authoritative staging row is written until this promise resolves
   * to the exact absolute rowStartIndex established by the completed
   * keyword checkpoint.
   *
   * Existing callers omit this field and retain the exact current
   * synchronous rowStartIndex behavior.
   */
  deferredRowStartIndex?:
    Promise<number>;

  dateWindowIndex?:
    number;

  cursor?:
    NaverAuthoritativeEntityStatsCursor;

  stagingBatchSize?:
    number;

  requestIntervalMs?:
    number;

  maxRetryCount?:
    number;

  maxEntityStatsPerRun?:
    number;

  maxStatsRequestsPerRun?:
    number;

  maxDiscoveryPagesPerRun?:
    number;

  deadlineAtMs?:
    number;

  dimensions?:
    NaverSearchAdsCanonicalDimensions;

  signal?:
    AbortSignal;

  onRetry?: (
    event:
      NaverAuthoritativeEntityStatsCollectorRetryEvent,
  ) => void | Promise<void>;

  onCollectorProgress?: (
    event:
      NaverAuthoritativeEntityStatsCollectorProgressEvent,
  ) => void | Promise<void>;

  collectorDependencies?: Partial<
    NaverAuthoritativeEntityStatsCollectorDependencies
  >;

  stagingRepositoryDependencies?:
    MediaSyncStagingRepositoryDependencies;
};

export type NaverSearchAdsAuthoritativeEntityStagingAppendTotals = {
  flushCount:
    number;

  submittedRows:
    number;

  insertedRows:
    number;

  duplicateRows:
    number;

  maximumBatchSize:
    number;

  firstRowIndex:
    number | null;

  lastRowIndex:
    number | null;
};

export type NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult = {
  status:
    NaverAuthoritativeEntityStatsCollectorResult["status"];

  isComplete:
    boolean;

  jobId:
    string;

  dateWindowIndex:
    number;

  rowStartIndex:
    number;

  nextRowIndex:
    number;

  collector:
    NaverAuthoritativeEntityStatsCollectorResult;

  runCanonicalRowCount:
    number;

  callbackCount:
    number;

  buffer:
    MediaCanonicalRowBatchBufferState;

  append:
    NaverSearchAdsAuthoritativeEntityStagingAppendTotals;
};

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(
      value,
    );

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength =
    2_000,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
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
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
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
    !Number.isSafeInteger(
      value,
    ) ||
    value < 1 ||
    value > maximum
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
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

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
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

  if (
    value.provider !==
    NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads authoritative entity staging orchestration is supported.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "JOB_NOT_PROCESSING",
      "The media sync job must already be processing.",
    );
  }

  if (
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_JOB",
      "The media sync job contains an invalid date range.",
    );
  }

  if (
    typeof value.started_at !==
      "string" ||
    !value.started_at.trim() ||
    typeof value.attempt_count !==
      "number" ||
    !Number.isInteger(
      value.attempt_count,
    ) ||
    value.attempt_count < 1
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
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
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
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
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "CREDENTIAL_SCOPE_MISMATCH",
      "The Naver credential customerId does not match the media sync job.",
    );
  }
}

function resolveStartCursor(input: {
  cursor:
    NaverAuthoritativeEntityStatsCursor | undefined;
  dateWindowIndex:
    number;
  job:
    MediaSyncJobRecord;
}): NaverAuthoritativeEntityStatsCursor {
  if (!input.cursor) {
    return createNaverAuthoritativeEntityStatsCursor({
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

  let normalizedCursor:
    NaverAuthoritativeEntityStatsCursor;

  try {
    normalizedCursor =
      normalizeNaverAuthoritativeEntityStatsCursor(
        input.cursor,
      );
  } catch (error) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_INPUT",
      "The authoritative entity staging cursor is invalid.",
      {
        cause:
          error,
      },
    );
  }

  if (
    normalizedCursor.dateWindowIndex !==
      input.dateWindowIndex ||
    normalizedCursor.dateFrom !==
      input.job.date_from ||
    normalizedCursor.dateTo !==
      input.job.date_to
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "CURSOR_SCOPE_MISMATCH",
      "The authoritative entity staging cursor does not match the job date window.",
    );
  }

  return normalizedCursor;
}

function createEmptyAppendTotals():
  NaverSearchAdsAuthoritativeEntityStagingAppendTotals {
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

function createAbsoluteFlushContext(input: {
  rowStartIndex:
    number;
  flushContext:
    MediaCanonicalRowBatchFlushContext;
}): MediaCanonicalRowBatchFlushContext {
  if (
    input.rowStartIndex >
    Number.MAX_SAFE_INTEGER -
      input.flushContext.rowEndIndex
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_INPUT",
      "The authoritative staging row index range exceeds the safe integer limit.",
    );
  }

  return {
    ...input.flushContext,

    rowStartIndex:
      input.rowStartIndex +
      input.flushContext.rowStartIndex,

    rowEndIndex:
      input.rowStartIndex +
      input.flushContext.rowEndIndex,
  };
}

function accumulateAppendResult(input: {
  totals:
    NaverSearchAdsAuthoritativeEntityStagingAppendTotals;

  rowsLength:
    number;

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

export async function runNaverSearchAdsAuthoritativeEntityStagingOrchestrator(
  input:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorInput,
): Promise<
  NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_INPUT",
      "Naver authoritative entity staging orchestration input is required.",
    );
  }

  validateJob(
    input.job,
  );

  validateCredentials(
    input.credentials,
    input.job.external_account_id,
  );

  const immediateRowStartIndex =
    normalizeNonNegativeInteger(
      input.rowStartIndex,
      "rowStartIndex",
    );

  let rowStartIndexAuthority:
    Promise<number> |
    null =
      null;

  const resolveRowStartIndex =
    (): Promise<number> => {
      if (!rowStartIndexAuthority) {
        rowStartIndexAuthority =
          input.deferredRowStartIndex
            ? input.deferredRowStartIndex.then(
                (
                  value,
                ) =>
                  normalizeNonNegativeInteger(
                    value,
                    "deferredRowStartIndex",
                  ),
              )
            : Promise.resolve(
                immediateRowStartIndex,
              );
      }

      return rowStartIndexAuthority;
    };

  const dateWindowIndex =
    input.dateWindowIndex ===
    undefined
      ? DEFAULT_DATE_WINDOW_INDEX
      : normalizeNonNegativeInteger(
          input.dateWindowIndex,
          "dateWindowIndex",
        );

  const stagingBatchSize =
    input.stagingBatchSize ===
    undefined
      ? DEFAULT_STAGING_BATCH_SIZE
      : normalizePositiveInteger(
          input.stagingBatchSize,
          "stagingBatchSize",
          MAX_STAGING_BATCH_SIZE,
        );

  const requestIntervalMs =
    input.requestIntervalMs ===
    undefined
      ? DEFAULT_REQUEST_INTERVAL_MS
      : normalizeNonNegativeInteger(
          input.requestIntervalMs,
          "requestIntervalMs",
        );

  const maxRetryCount =
    input.maxRetryCount ===
    undefined
      ? DEFAULT_MAX_RETRY_COUNT
      : normalizePositiveInteger(
          input.maxRetryCount,
          "maxRetryCount",
          10,
        );

  const maxEntityStatsPerRun =
    normalizeOptionalPositiveInteger(
      input.maxEntityStatsPerRun,
      "maxEntityStatsPerRun",
      MAX_ENTITY_STATS_PER_RUN,
    );

  const maxStatsRequestsPerRun =
    normalizeOptionalPositiveInteger(
      input.maxStatsRequestsPerRun,
      "maxStatsRequestsPerRun",
      MAX_STATS_REQUESTS_PER_RUN,
    );

  const maxDiscoveryPagesPerRun =
    normalizeOptionalPositiveInteger(
      input.maxDiscoveryPagesPerRun,
      "maxDiscoveryPagesPerRun",
      MAX_DISCOVERY_PAGES_PER_RUN,
    );

  const startCursor =
    resolveStartCursor({
      cursor:
        input.cursor,
      dateWindowIndex,
      job:
        input.job,
    });

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
          /*
           * This await is the bounded backpressure seam.
           *
           * Until keyword staging has established its final row boundary,
           * a full authoritative canonical batch remains buffered and the
           * collector consumer does not return. Because the collector
           * advances its cursor only after the consumer resolves, cursor
           * authority cannot outrun confirmed staging.
           */
          const resolvedRowStartIndex =
            await resolveRowStartIndex();

          const absoluteFlushContext =
            createAbsoluteFlushContext({
              rowStartIndex:
                resolvedRowStartIndex,
              flushContext,
            });

          const appendResult =
            await appendMediaSyncStagingBatch(
              {
                job:
                  input.job,

                rows,

                rowStartIndex:
                  absoluteFlushContext.rowStartIndex,

                dateWindowIndex,
              },
              input.stagingRepositoryDependencies,
            );

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

  const collectorResult =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials:
        input.credentials,

      cursor:
        startCursor,

      requestIntervalMs,

      maxRetryCount,

      maxEntityStatsPerRun,

      maxStatsRequestsPerRun,

      maxDiscoveryPagesPerRun,

      deadlineAtMs:
        input.deadlineAtMs,

      signal:
        input.signal,

      onRetry:
        input.onRetry,

      onProgress:
        input.onCollectorProgress,

      dependencies:
        input.collectorDependencies,

      onEntityStats:
        async (
          item,
        ): Promise<void> => {
          const canonicalRows =
            convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
              externalAccountId:
                input.job.external_account_id,

              item,

              dimensions:
                input.dimensions,
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
   * completed와 partial은 모두 정상 반환이다.
   * 현재 run에서 canonical 변환된 마지막 행까지 staging append를 확정한다.
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
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "PIPELINE_COUNT_MISMATCH",
      "The authoritative entity staging pipeline contains inconsistent buffer or append counts.",
    );
  }

  /*
   * Resolve the same authority even when the final batch contains fewer
   * rows than stagingBatchSize. This keeps the result rowStartIndex and
   * nextRowIndex bound to the exact keyword-completed boundary.
   */
  const rowStartIndex =
    await resolveRowStartIndex();

  if (
    rowStartIndex >
    Number.MAX_SAFE_INTEGER -
      runCanonicalRowCount
  ) {
    throw new NaverSearchAdsAuthoritativeEntityStagingOrchestratorError(
      "INVALID_INPUT",
      "The authoritative staging next row index exceeds the safe integer limit.",
    );
  }

  return {
    status:
      collectorResult.status,

    isComplete:
      collectorResult.isComplete,

    jobId:
      input.job.id,

    dateWindowIndex,

    rowStartIndex,

    nextRowIndex:
      rowStartIndex +
      runCanonicalRowCount,

    collector:
      collectorResult,

    runCanonicalRowCount,

    callbackCount,

    buffer:
      bufferState,

    append:
      appendTotals,
  };
}

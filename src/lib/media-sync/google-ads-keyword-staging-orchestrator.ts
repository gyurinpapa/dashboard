import {
  collectGoogleAdsKeywordStatsPage,
  type GoogleAdsKeywordStatsCollectorDependencies,
  type GoogleAdsKeywordStatsCollectorOptions,
  type GoogleAdsKeywordStatsPageCollectionResult,
  type GoogleAdsKeywordStatsPageCursor,
} from "./google-ads-keyword-stats-collector";
import {
  appendMediaSyncStagingBatch,
  type AppendMediaSyncStagingBatchResult,
  type MediaSyncStagingRepositoryDependencies,
} from "./media-sync-staging-repository";
import {
  isValidYmd,
  type MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DEFAULT_DATE_WINDOW_INDEX =
  0;

export type GoogleAdsKeywordStagingOrchestratorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "CHECKPOINT_SCOPE_MISMATCH"
  | "INVALID_COUNTS"
  | "INVALID_APPEND_RESULT";

export class GoogleAdsKeywordStagingOrchestratorError
  extends Error {
  readonly code:
    GoogleAdsKeywordStagingOrchestratorErrorCode;

  constructor(
    code:
      GoogleAdsKeywordStagingOrchestratorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsKeywordStagingOrchestratorError";

    this.code =
      code;
  }
}

export type GoogleAdsKeywordStagingCursor =
  Readonly<{
    version: 1;
    externalAccountId: string;
    dateWindowIndex: number;
    dateFrom: string;
    dateTo: string;
    page:
      GoogleAdsKeywordStatsPageCursor;
  }>;

export type GoogleAdsKeywordStagingCheckpoint =
  Readonly<{
    version: 1;
    dateWindowIndex: number;
    nextRowIndex: number;
    totalRows: number;
    failedRows: 0;
    complete: boolean;
    cursor:
      GoogleAdsKeywordStagingCursor |
      null;
  }>;

export type GoogleAdsKeywordStagingOrchestratorInput =
  Readonly<{
    job:
      MediaSyncJobRecord;

    accessToken:
      string;

    developerToken:
      string;

    loginCustomerId?:
      unknown;

    dateWindowIndex?:
      number;

    cursor?:
      unknown;

    collectorDependencies?:
      GoogleAdsKeywordStatsCollectorDependencies;

    collectorOptions?:
      GoogleAdsKeywordStatsCollectorOptions;

    stagingRepositoryDependencies?:
      MediaSyncStagingRepositoryDependencies;
  }>;

export type GoogleAdsKeywordStagingOrchestratorResult =
  Readonly<{
    jobId: string;

    dateWindowIndex: number;

    rowStartIndex: number;

    nextRowIndex: number;

    runCanonicalRowCount: number;

    canonicalRowCount: number;

    status:
      | "partial"
      | "completed";

    isComplete: boolean;

    collector:
      GoogleAdsKeywordStatsPageCollectionResult;

    append:
      AppendMediaSyncStagingBatchResult;

    checkpoint:
      GoogleAdsKeywordStagingCheckpoint;
  }>;

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
    Object.getPrototypeOf(
      value,
    );

  return (
    prototype ===
      Object.prototype ||
    prototype === null
  );
}

function requireNonNegativeInteger(
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
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_COUNTS",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function normalizeDateWindowIndex(
  value: unknown,
): number {
  if (value === undefined) {
    return DEFAULT_DATE_WINDOW_INDEX;
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_INPUT",
      "dateWindowIndex must be a non-negative safe integer.",
    );
  }

  return value;
}

function validateJob(
  job: MediaSyncJobRecord,
): {
  rowStartIndex: number;
} {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_JOB",
      "A media sync job is required.",
    );
  }

  if (
    job.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "UNSUPPORTED_PROVIDER",
      "The media sync job is not a Google Ads job.",
    );
  }

  if (
    job.status !==
    PROCESSING_STATUS
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "JOB_NOT_PROCESSING",
      "The Google Ads media sync job must be processing.",
    );
  }

  if (
    typeof job.external_account_id !==
      "string" ||
    !job.external_account_id.trim()
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_JOB",
      "The Google Ads media sync job has no external account id.",
    );
  }

  if (
    typeof job.date_from !==
      "string" ||
    typeof job.date_to !==
      "string" ||
    !isValidYmd(
      job.date_from,
    ) ||
    !isValidYmd(
      job.date_to,
    ) ||
    job.date_from >
      job.date_to
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_JOB",
      "The Google Ads media sync job has an invalid date range.",
    );
  }

  const rawRows =
    requireNonNegativeInteger(
      job.raw_rows,
      "job.raw_rows",
    );

  const normalizedRows =
    requireNonNegativeInteger(
      job.normalized_rows,
      "job.normalized_rows",
    );

  const insertedRows =
    requireNonNegativeInteger(
      job.inserted_rows,
      "job.inserted_rows",
    );

  const failedRows =
    requireNonNegativeInteger(
      job.failed_rows,
      "job.failed_rows",
    );

  if (
    rawRows !==
      insertedRows ||
    normalizedRows !==
      insertedRows ||
    failedRows !==
      0
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_COUNTS",
      "The Google Ads processing job row counts are inconsistent.",
    );
  }

  return {
    rowStartIndex:
      insertedRows,
  };
}

function resolveCollectorCursor(input: {
  cursor: unknown;
  job: MediaSyncJobRecord;
  dateWindowIndex: number;
}):
  | GoogleAdsKeywordStatsPageCursor
  | null {
  if (
    input.cursor ===
      undefined ||
    input.cursor ===
      null
  ) {
    return null;
  }

  if (
    !isPlainObject(
      input.cursor,
    )
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_INPUT",
      "Google Ads staging cursor must be an object.",
    );
  }

  const cursor =
    input.cursor;

  if (
    cursor.version !==
      1 ||
    cursor.externalAccountId !==
      input.job.external_account_id ||
    cursor.dateWindowIndex !==
      input.dateWindowIndex ||
    cursor.dateFrom !==
      input.job.date_from ||
    cursor.dateTo !==
      input.job.date_to
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "CHECKPOINT_SCOPE_MISMATCH",
      "The Google Ads staging cursor does not match the current job scope.",
    );
  }

  if (
    !isPlainObject(
      cursor.page,
    )
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_INPUT",
      "The Google Ads staging cursor page state is invalid.",
    );
  }

  return (
    cursor.page as
      unknown as
      GoogleAdsKeywordStatsPageCursor
  );
}

function createEmptyAppendResult():
  AppendMediaSyncStagingBatchResult {
  return {
    submittedRows:
      0,
    insertedRows:
      0,
    duplicateRows:
      0,
    firstRowIndex:
      null,
    lastRowIndex:
      null,
  };
}

function validateAppendBoundary(input: {
  result:
    AppendMediaSyncStagingBatchResult;
  rowStartIndex: number;
  rowCount: number;
}): void {
  if (
    input.result.submittedRows !==
      input.rowCount ||
    input.result.insertedRows +
        input.result.duplicateRows !==
      input.rowCount
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_APPEND_RESULT",
      "The Google Ads staging append row counts are inconsistent.",
    );
  }

  if (
    input.rowCount ===
      0
  ) {
    if (
      input.result.firstRowIndex !==
        null ||
      input.result.lastRowIndex !==
        null
    ) {
      throw new GoogleAdsKeywordStagingOrchestratorError(
        "INVALID_APPEND_RESULT",
        "An empty Google Ads staging append returned row indexes.",
      );
    }

    return;
  }

  if (
    input.result.firstRowIndex !==
      input.rowStartIndex ||
    input.result.lastRowIndex !==
      input.rowStartIndex +
        input.rowCount -
        1
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_APPEND_RESULT",
      "The Google Ads staging append row boundary is inconsistent.",
    );
  }
}

export async function runGoogleAdsKeywordStagingOrchestrator(
  input:
    GoogleAdsKeywordStagingOrchestratorInput,
): Promise<
  GoogleAdsKeywordStagingOrchestratorResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsKeywordStagingOrchestratorError(
      "INVALID_INPUT",
      "Google Ads staging orchestration input is required.",
    );
  }

  const {
    rowStartIndex,
  } =
    validateJob(
      input.job,
    );

  const dateWindowIndex =
    normalizeDateWindowIndex(
      input.dateWindowIndex,
    );

  const collectorCursor =
    resolveCollectorCursor({
      cursor:
        input.cursor,
      job:
        input.job,
      dateWindowIndex,
    });

  /*
   * One orchestration invocation owns exactly one Search page.
   * The target account/date scope is derived from the claimed job,
   * not accepted independently from the caller.
   */
  const collector =
    await collectGoogleAdsKeywordStatsPage(
      {
        accessToken:
          input.accessToken,
        developerToken:
          input.developerToken,
        targetCustomerId:
          input.job.external_account_id,
        loginCustomerId:
          input.loginCustomerId,
        startDate:
          input.job.date_from,
        endDate:
          input.job.date_to,
        cursor:
          collectorCursor,
      },
      input.collectorDependencies,
      input.collectorOptions,
    );

  const runCanonicalRowCount =
    collector.rows.length;

  const append =
    runCanonicalRowCount ===
      0
      ? createEmptyAppendResult()
      : await appendMediaSyncStagingBatch(
          {
            job:
              input.job,
            rows:
              collector.rows,
            rowStartIndex,
            dateWindowIndex,
          },
          input.stagingRepositoryDependencies,
        );

  validateAppendBoundary({
    result:
      append,
    rowStartIndex,
    rowCount:
      runCanonicalRowCount,
  });

  const nextRowIndex =
    rowStartIndex +
    runCanonicalRowCount;

  const nextCursor:
    GoogleAdsKeywordStagingCursor |
    null =
    collector.cursor
      ? Object.freeze({
          version:
            1 as const,
          externalAccountId:
            input.job.external_account_id,
          dateWindowIndex,
          dateFrom:
            input.job.date_from,
          dateTo:
            input.job.date_to,
          page:
            collector.cursor,
        })
      : null;

  const checkpoint:
    GoogleAdsKeywordStagingCheckpoint =
    Object.freeze({
      version:
        1 as const,
      dateWindowIndex,
      nextRowIndex,
      totalRows:
        nextRowIndex,
      failedRows:
        0 as const,
      complete:
        collector.isComplete,
      cursor:
        nextCursor,
    });

  return Object.freeze({
    jobId:
      input.job.id,
    dateWindowIndex,
    rowStartIndex,
    nextRowIndex,
    runCanonicalRowCount,
    canonicalRowCount:
      nextRowIndex,
    status:
      collector.status,
    isComplete:
      collector.isComplete,
    collector,
    append,
    checkpoint,
  });
}

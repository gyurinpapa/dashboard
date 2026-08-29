import {
  collectGoogleAdsDemandGenAdStatsPage,
  type GoogleAdsDemandGenAdStatsCollectorDependencies,
  type GoogleAdsDemandGenAdStatsCollectorOptions,
  type GoogleAdsDemandGenAdStatsPageCollectionResult,
  type GoogleAdsDemandGenAdStatsPageCursor,
} from "./google-ads-demand-gen-ad-stats-collector";
import {
  appendMediaSyncStagingBatch,
  type AppendMediaSyncStagingBatchResult,
  type MediaSyncStagingRepositoryDependencies,
} from "./media-sync-staging-repository";
import {
  isValidMediaSyncDateRange,
  type MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const PROCESSING_STATUS =
  "processing" as const;

type UnknownRecord =
  Record<string, unknown>;

type MediaSyncJobWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?: unknown;
  }>;

export type GoogleAdsAllDataDemandGenStagingOrchestratorErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_CURSOR"
  | "INVALID_APPEND_RESULT";

export class GoogleAdsAllDataDemandGenStagingOrchestratorError
  extends Error {
  readonly code:
    GoogleAdsAllDataDemandGenStagingOrchestratorErrorCode;

  constructor(
    code:
      GoogleAdsAllDataDemandGenStagingOrchestratorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataDemandGenStagingOrchestratorError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataDemandGenStagingCursor =
  Readonly<{
    version: 1;
    externalAccountId: string;
    dateWindowIndex: number;
    dateFrom: string;
    dateTo: string;
    expectedRowStartIndex: number;
    page:
      GoogleAdsDemandGenAdStatsPageCursor;
  }>;

export type GoogleAdsAllDataDemandGenStagingCheckpoint =
  Readonly<{
    version: 1;
    dateWindowIndex: number;
    nextRowIndex: number;
    totalRows: number;
    failedRows: 0;
    complete: boolean;
    cursor:
      GoogleAdsAllDataDemandGenStagingCursor |
      null;
  }>;

export type GoogleAdsAllDataDemandGenStagingOrchestratorInput =
  Readonly<{
    job:
      MediaSyncJobRecord;

    accessToken:
      string;

    developerToken:
      string;

    loginCustomerId?:
      unknown;

    dateWindowIndex:
      number;

    cursor?:
      unknown;

    collectorDependencies?:
      GoogleAdsDemandGenAdStatsCollectorDependencies;

    collectorOptions?:
      GoogleAdsDemandGenAdStatsCollectorOptions;

    stagingRepositoryDependencies?:
      MediaSyncStagingRepositoryDependencies;
  }>;

export type GoogleAdsAllDataDemandGenStagingOrchestratorDependencies =
  Readonly<{
    collectPage?:
      typeof collectGoogleAdsDemandGenAdStatsPage;

    appendBatch?:
      typeof appendMediaSyncStagingBatch;
  }>;

export type GoogleAdsAllDataDemandGenStagingOrchestratorResult =
  Readonly<{
    jobId: string;
    dateWindowIndex: number;

    rowStartIndex: number;
    nextRowIndex: number;

    runCanonicalRowCount: number;

    status:
      | "partial"
      | "completed";

    isComplete: boolean;

    collector:
      GoogleAdsDemandGenAdStatsPageCollectionResult;

    append:
      AppendMediaSyncStagingBatchResult;

    checkpoint:
      GoogleAdsAllDataDemandGenStagingCheckpoint;
  }>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength =
    2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
  errorCode:
    GoogleAdsAllDataDemandGenStagingOrchestratorErrorCode =
      "INVALID_INPUT",
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      errorCode,
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function validateJob(
  job:
    MediaSyncJobRecord,
): Readonly<{
  jobId: string;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
  rowStartIndex: number;
}> {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      "The ALL-DATA Demand Gen staging job is required.",
    );
  }

  const typedJob =
    job as
      MediaSyncJobWithExecutionContract;

  const jobId =
    normalizeRequiredString(
      typedJob.id,
      "job.id",
      500,
    );

  normalizeRequiredString(
    typedJob.report_id,
    "job.report_id",
    500,
  );

  normalizeRequiredString(
    typedJob.workspace_id,
    "job.workspace_id",
    500,
  );

  normalizeRequiredString(
    typedJob.connection_id,
    "job.connection_id",
    500,
  );

  const externalAccountId =
    normalizeRequiredString(
      typedJob.external_account_id,
      "job.external_account_id",
      500,
    );

  if (
    typedJob.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      "ALL-DATA Demand Gen staging requires a Google Ads job.",
    );
  }

  if (
    typedJob.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      "ALL-DATA Demand Gen staging requires the Google Ads ALL-DATA execution contract.",
    );
  }

  if (
    typedJob.status !==
      PROCESSING_STATUS
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      "ALL-DATA Demand Gen staging requires a processing job.",
    );
  }

  const dateFrom =
    normalizeRequiredString(
      typedJob.date_from,
      "job.date_from",
      10,
    );

  const dateTo =
    normalizeRequiredString(
      typedJob.date_to,
      "job.date_to",
      10,
    );

  if (
    !isValidMediaSyncDateRange(
      dateFrom,
      dateTo,
    )
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      "ALL-DATA Demand Gen staging job date range is invalid.",
    );
  }

  if (
    typeof typedJob.started_at !==
      "string" ||
    !typedJob.started_at.trim() ||
    typeof typedJob.attempt_count !==
      "number" ||
    !Number.isInteger(
      typedJob.attempt_count,
    ) ||
    typedJob.attempt_count < 1
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_JOB",
      "ALL-DATA Demand Gen staging job claim state is invalid.",
    );
  }

  const rowStartIndex =
    normalizeNonNegativeInteger(
      typedJob.inserted_rows,
      "job.inserted_rows",
      "INVALID_JOB",
    );

  return Object.freeze({
    jobId,
    externalAccountId,
    dateFrom,
    dateTo,
    rowStartIndex,
  });
}

function normalizeDateWindowIndex(
  value: unknown,
): number {
  return normalizeNonNegativeInteger(
    value,
    "dateWindowIndex",
  );
}

function resolveCollectorCursor(
  input: Readonly<{
    cursor: unknown;
    externalAccountId: string;
    dateWindowIndex: number;
    dateFrom: string;
    dateTo: string;
    rowStartIndex: number;
  }>,
):
  | GoogleAdsDemandGenAdStatsPageCursor
  | undefined {
  if (
    input.cursor === undefined ||
    input.cursor === null
  ) {
    return undefined;
  }

  if (
    !isPlainObject(
      input.cursor,
    )
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_CURSOR",
      "ALL-DATA Demand Gen staging cursor must be an object.",
    );
  }

  const cursor =
    input.cursor;

  if (
    cursor.version !== 1 ||
    cursor.externalAccountId !==
      input.externalAccountId ||
    cursor.dateWindowIndex !==
      input.dateWindowIndex ||
    cursor.dateFrom !==
      input.dateFrom ||
    cursor.dateTo !==
      input.dateTo
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_CURSOR",
      "ALL-DATA Demand Gen staging cursor scope does not match the claimed job.",
    );
  }

  if (
    cursor.expectedRowStartIndex !==
      input.rowStartIndex
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_CURSOR",
      "ALL-DATA Demand Gen staging cursor row boundary does not match job.inserted_rows.",
    );
  }

  if (
    !isPlainObject(
      cursor.page,
    )
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_CURSOR",
      "ALL-DATA Demand Gen staging cursor page is invalid.",
    );
  }

  return cursor.page as
    GoogleAdsDemandGenAdStatsPageCursor;
}

function createEmptyAppendResult():
  AppendMediaSyncStagingBatchResult {
  return Object.freeze({
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
  });
}

function validateAppendBoundary(
  input: Readonly<{
    result:
      AppendMediaSyncStagingBatchResult;
    rowStartIndex:
      number;
    rowCount:
      number;
  }>,
): void {
  if (
    input.result.submittedRows !==
      input.rowCount
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_APPEND_RESULT",
      "ALL-DATA Demand Gen staging append submitted-row count does not match the page.",
    );
  }

  if (
    input.rowCount === 0
  ) {
    if (
      input.result.firstRowIndex !==
        null ||
      input.result.lastRowIndex !==
        null
    ) {
      throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
        "INVALID_APPEND_RESULT",
        "Empty ALL-DATA Demand Gen staging append returned a row-index boundary.",
      );
    }

    return;
  }

  const expectedLastRowIndex =
    input.rowStartIndex +
    input.rowCount -
    1;

  if (
    input.result.firstRowIndex !==
      input.rowStartIndex ||
    input.result.lastRowIndex !==
      expectedLastRowIndex
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_APPEND_RESULT",
      "ALL-DATA Demand Gen staging append row-index boundary is invalid.",
    );
  }
}

export async function runGoogleAdsAllDataDemandGenStagingOrchestrator(
  input:
    GoogleAdsAllDataDemandGenStagingOrchestratorInput,
  dependencies:
    GoogleAdsAllDataDemandGenStagingOrchestratorDependencies = {},
): Promise<
  GoogleAdsAllDataDemandGenStagingOrchestratorResult
> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsAllDataDemandGenStagingOrchestratorError(
      "INVALID_INPUT",
      "ALL-DATA Demand Gen staging orchestration input is required.",
    );
  }

  const job =
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
      externalAccountId:
        job.externalAccountId,
      dateWindowIndex,
      dateFrom:
        job.dateFrom,
      dateTo:
        job.dateTo,
      rowStartIndex:
        job.rowStartIndex,
    });

  const collectPage =
    dependencies.collectPage ??
    collectGoogleAdsDemandGenAdStatsPage;

  const appendBatch =
    dependencies.appendBatch ??
    appendMediaSyncStagingBatch;

  const collector =
    await collectPage(
      {
        accessToken:
          input.accessToken,
        developerToken:
          input.developerToken,
        targetCustomerId:
          job.externalAccountId,
        loginCustomerId:
          input.loginCustomerId,
        startDate:
          job.dateFrom,
        endDate:
          job.dateTo,
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
      : await appendBatch(
          {
            job:
              input.job,
            rows:
              collector.rows,
            rowStartIndex:
              job.rowStartIndex,
            dateWindowIndex,
          },
          input.stagingRepositoryDependencies,
        );

  validateAppendBoundary({
    result:
      append,
    rowStartIndex:
      job.rowStartIndex,
    rowCount:
      runCanonicalRowCount,
  });

  const nextRowIndex =
    job.rowStartIndex +
    runCanonicalRowCount;

  const nextCursor:
    GoogleAdsAllDataDemandGenStagingCursor |
    null =
      collector.cursor
        ? Object.freeze({
            version:
              1 as const,
            externalAccountId:
              job.externalAccountId,
            dateWindowIndex,
            dateFrom:
              job.dateFrom,
            dateTo:
              job.dateTo,
            expectedRowStartIndex:
              nextRowIndex,
            page:
              collector.cursor,
          })
        : null;

  const checkpoint:
    GoogleAdsAllDataDemandGenStagingCheckpoint =
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
      job.jobId,
    dateWindowIndex,

    rowStartIndex:
      job.rowStartIndex,

    nextRowIndex,

    runCanonicalRowCount,

    status:
      collector.status,

    isComplete:
      collector.isComplete,

    collector,

    append,

    checkpoint,
  });
}

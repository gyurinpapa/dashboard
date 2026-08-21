import { getSupabaseAdmin } from "../supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import type {
  MediaSyncStagingSummary,
} from "./media-sync-staging-summary-repository";
import {
  isValidMediaSyncDateRange,
  type MediaSyncJobRecord,
} from "./types";

const PREPARE_MEDIA_SYNC_SNAPSHOT_MATERIALIZATION_RPC =
  "prepare_media_sync_snapshot_materialization";

const MATERIALIZE_MEDIA_SYNC_SNAPSHOT_BATCH_RPC =
  "materialize_media_sync_snapshot_batch";

const COMPLETE_MEDIA_SYNC_SNAPSHOT_MATERIALIZATION_RPC =
  "complete_media_sync_snapshot_materialization";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DEFAULT_MATERIALIZATION_BATCH_SIZE =
  2_000;

const MIN_MATERIALIZATION_BATCH_SIZE =
  1;

const MAX_MATERIALIZATION_BATCH_SIZE =
  5_000;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MediaSyncSnapshotMaterializationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "STAGING_INCOMPLETE"
  | "EMPTY_STAGING"
  | "MATERIALIZATION_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncSnapshotMaterializationError
  extends Error {
  readonly code:
    MediaSyncSnapshotMaterializationErrorCode;

  constructor(
    code:
      MediaSyncSnapshotMaterializationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaSyncSnapshotMaterializationError";

    this.code = code;
  }
}

export type MaterializeMediaSyncSnapshotInput = {
  job: MediaSyncJobRecord;
  summary: MediaSyncStagingSummary;

  /**
   * Projection target report.
   *
   * Omitted:
   * - legacy / primary behavior remains job.report_id.
   *
   * Provided:
   * - the same canonical job can materialize an additional report projection.
   */
  targetReportId?: string;

  /**
   * 한 RPC가 처리하는 report_rows 최대 개수.
   *
   * 기본값: 2,000
   * 허용 범위: 1~5,000
   */
  batchSize?: number;
};

export type MediaSyncSnapshotMaterializationResult = {
  job: MediaSyncJobRecord;
  snapshotIngestionId: string;
  rowCount: number;
  stagingFingerprint: string;
  materializedFingerprint: string;
  idempotent: boolean;
};

type UnknownRecord =
  Record<string, unknown>;

type MaterializationScope = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;
  provider:
    | typeof NAVER_PROVIDER
    | typeof GOOGLE_ADS_PROVIDER;
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
  expectedRows: number;
};

type PrepareMaterializationRpcRecord = {
  job: unknown;
  snapshot_ingestion_id: unknown;
  expected_rows: unknown;
  next_row_index: unknown;
  idempotent: unknown;
};

type PrepareMaterializationResult = {
  job: MediaSyncJobRecord;
  snapshotIngestionId: string;
  expectedRows: number;
  nextRowIndex: number;
  idempotent: boolean;
};

type MaterializationBatchRpcRecord = {
  job: unknown;
  snapshot_ingestion_id: unknown;
  batch_start: unknown;
  batch_end_exclusive: unknown;
  expected_batch_rows: unknown;
  inserted_rows: unknown;
  materialized_batch_rows: unknown;
  next_row_index: unknown;
  complete: unknown;
  idempotent: unknown;
};

type MaterializationBatchResult = {
  job: MediaSyncJobRecord;
  snapshotIngestionId: string;
  batchStart: number;
  batchEndExclusive: number;
  expectedBatchRows: number;
  insertedRows: number;
  materializedBatchRows: number;
  nextRowIndex: number;
  complete: boolean;
  idempotent: boolean;
};

type CompleteMaterializationRpcRecord = {
  job: unknown;
  snapshot_ingestion_id: unknown;
  row_count: unknown;
  staging_fingerprint: unknown;
  materialized_fingerprint: unknown;
  idempotent: unknown;
};

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
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeUuid(
  value: unknown,
  fieldName: string,
): string {
  const normalizedValue =
    normalizeRequiredString(
      value,
      fieldName,
      36,
    );

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalizedValue;
}

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < 0
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return numberValue;
}

function normalizePositiveInteger(
  value: unknown,
  fieldName: string,
): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue <= 0
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a positive safe integer.`,
    );
  }

  return numberValue;
}

function normalizeBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a boolean.`,
    );
  }

  return value;
}

function normalizeBatchSize(
  value: unknown,
): number {
  if (
    value === undefined ||
    value === null
  ) {
    return DEFAULT_MATERIALIZATION_BATCH_SIZE;
  }

  const numberValue =
    Number(value);

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue <
      MIN_MATERIALIZATION_BATCH_SIZE ||
    numberValue >
      MAX_MATERIALIZATION_BATCH_SIZE
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      `batchSize must be an integer between ${MIN_MATERIALIZATION_BATCH_SIZE} and ${MAX_MATERIALIZATION_BATCH_SIZE}.`,
    );
  }

  return numberValue;
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_JOB",
      "A media sync job record is required.",
    );
  }

  normalizeUuid(
    value.id,
    "job.id",
  );

  normalizeUuid(
    value.report_id,
    "job.report_id",
  );

  normalizeUuid(
    value.workspace_id,
    "job.workspace_id",
  );

  normalizeUuid(
    value.advertiser_id,
    "job.advertiser_id",
  );

  normalizeUuid(
    value.connection_id,
    "job.connection_id",
  );

  normalizeRequiredString(
    value.external_account_id,
    "job.external_account_id",
    500,
  );

  if (
    value.provider !== NAVER_PROVIDER &&
    value.provider !== GOOGLE_ADS_PROVIDER
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads or Google Ads snapshot materialization is supported.",
    );
  }

  if (value.status !== PROCESSING_STATUS) {
    throw new MediaSyncSnapshotMaterializationError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing before snapshot materialization.",
    );
  }

  if (
    value.mode !== "snapshot_replace" ||
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_JOB",
      "The media sync job contains an invalid materialization scope.",
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
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_JOB",
      "The media sync job contains an invalid processing claim state.",
    );
  }
}

function validateCompleteSummary(
  job: MediaSyncJobRecord,
  value: unknown,
): asserts value is MediaSyncStagingSummary {
  if (!isPlainObject(value)) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      "A complete staging summary is required.",
    );
  }

  if (
    value.jobId !== job.id ||
    value.isComplete !== true
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "STAGING_INCOMPLETE",
      "The staging summary is not complete for this media sync job.",
    );
  }

  const expectedRows =
    normalizeNonNegativeInteger(
      value.expectedRows,
      "summary.expectedRows",
    );

  const totalRows =
    normalizeNonNegativeInteger(
      value.totalRows,
      "summary.totalRows",
    );

  if (
    expectedRows !== totalRows ||
    totalRows !== job.inserted_rows ||
    totalRows !== job.normalized_rows ||
    job.failed_rows !== 0
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "STAGING_INCOMPLETE",
      "The staging summary does not match the processing checkpoint counts.",
    );
  }

  if (totalRows === 0) {
    throw new MediaSyncSnapshotMaterializationError(
      "EMPTY_STAGING",
      "Zero-row staging snapshots are not materialized.",
    );
  }
}

function buildMaterializationScope(
  input: MaterializeMediaSyncSnapshotInput,
): MaterializationScope {
  return {
    jobId:
      input.job.id,

    reportId:
      normalizeUuid(
        input.targetReportId ??
          input.job.report_id,
        "targetReportId",
      ),

    workspaceId:
      input.job.workspace_id,

    advertiserId:
      input.job.advertiser_id,

    connectionId:
      input.job.connection_id,

    provider:
      input.job.provider ===
        GOOGLE_ADS_PROVIDER
        ? GOOGLE_ADS_PROVIDER
        : NAVER_PROVIDER,

    externalAccountId:
      input.job.external_account_id,

    dateFrom:
      input.job.date_from,

    dateTo:
      input.job.date_to,

    expectedRows:
      input.summary.totalRows,
  };
}

function buildBasePayload(
  scope: MaterializationScope,
): Record<string, unknown> {
  return {
    job_id:
      scope.jobId,

    report_id:
      scope.reportId,

    workspace_id:
      scope.workspaceId,

    advertiser_id:
      scope.advertiserId,

    connection_id:
      scope.connectionId,

    provider:
      scope.provider,

    external_account_id:
      scope.externalAccountId,

    date_from:
      scope.dateFrom,

    date_to:
      scope.dateTo,

    expected_rows:
      scope.expectedRows,
  };
}

function mapRpcError(
  error: unknown,
): MediaSyncSnapshotMaterializationError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("MSMM_INVALID_INPUT")) {
    return new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      "The snapshot materialization input is invalid.",
      { cause: error },
    );
  }

  if (
    message.includes("MSMM_JOB_NOT_FOUND") ||
    message.includes("MSMM_REPORT_NOT_FOUND") ||
    message.includes("MSMM_CONNECTION_NOT_FOUND")
  ) {
    return new MediaSyncSnapshotMaterializationError(
      "INVALID_JOB",
      "The snapshot materialization scope could not be loaded.",
      { cause: error },
    );
  }

  if (message.includes("MSMM_JOB_NOT_PROCESSING")) {
    return new MediaSyncSnapshotMaterializationError(
      "JOB_NOT_PROCESSING",
      "The media sync job is no longer processing.",
      { cause: error },
    );
  }

  if (message.includes("MSMM_UNSUPPORTED_PROVIDER")) {
    return new MediaSyncSnapshotMaterializationError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported.",
      { cause: error },
    );
  }

  if (message.includes("MSMM_SCOPE_MISMATCH")) {
    return new MediaSyncSnapshotMaterializationError(
      "SCOPE_MISMATCH",
      "The snapshot materialization scope does not match the database state.",
      { cause: error },
    );
  }

  if (message.includes("MSMM_STAGING_INCOMPLETE")) {
    return new MediaSyncSnapshotMaterializationError(
      "STAGING_INCOMPLETE",
      "The media sync staging rows are not complete.",
      { cause: error },
    );
  }

  if (message.includes("MSMM_EMPTY_STAGING")) {
    return new MediaSyncSnapshotMaterializationError(
      "EMPTY_STAGING",
      "Zero-row staging snapshots are not materialized.",
      { cause: error },
    );
  }

  if (
    message.includes("MSMM_MATERIALIZATION_CONFLICT") ||
    message.includes("MSMM_POINTER_CHANGED") ||
    message.includes("MSMM_JOB_STATE_CHANGED")
  ) {
    return new MediaSyncSnapshotMaterializationError(
      "MATERIALIZATION_CONFLICT",
      "The existing snapshot materialization conflicts with the complete staging rows.",
      { cause: error },
    );
  }

  return new MediaSyncSnapshotMaterializationError(
    "DATABASE_ERROR",
    "The media sync snapshot could not be materialized.",
    { cause: error },
  );
}

function parseSingleRpcRecord(
  value: unknown,
  operationName: string,
): UnknownRecord {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      `The ${operationName} RPC returned an invalid result.`,
    );
  }

  return value[0];
}

function parseJob(
  value: unknown,
  operationName: string,
): MediaSyncJobRecord {
  try {
    return parseMediaSyncJobRecord(
      value,
    );
  } catch (error) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      `The ${operationName} RPC returned an invalid media sync job.`,
      { cause: error },
    );
  }
}

function validateReturnedJobScope(
  updatedJob: MediaSyncJobRecord,
  inputJob: MediaSyncJobRecord,
  targetReportId: string,
  snapshotIngestionId: string,
  operationName: string,
): void {
  const isPrimaryProjection =
    targetReportId ===
    inputJob.report_id;

  const compatibilityMirrorChanged =
    isPrimaryProjection
      ? updatedJob.snapshot_ingestion_id !==
        snapshotIngestionId
      : (
        updatedJob.previous_ingestion_id !==
          inputJob.previous_ingestion_id ||
        updatedJob.snapshot_ingestion_id !==
          inputJob.snapshot_ingestion_id
      );

  if (
    updatedJob.id !== inputJob.id ||
    updatedJob.report_id !==
      inputJob.report_id ||
    updatedJob.workspace_id !==
      inputJob.workspace_id ||
    updatedJob.advertiser_id !==
      inputJob.advertiser_id ||
    updatedJob.connection_id !==
      inputJob.connection_id ||
    updatedJob.provider !==
      inputJob.provider ||
    updatedJob.external_account_id !==
      inputJob.external_account_id ||
    updatedJob.date_from !==
      inputJob.date_from ||
    updatedJob.date_to !==
      inputJob.date_to ||
    updatedJob.mode !==
      inputJob.mode ||
    updatedJob.status !==
      PROCESSING_STATUS ||
    updatedJob.progress !==
      inputJob.progress ||
    updatedJob.finished_at !==
      inputJob.finished_at ||
    updatedJob.error !==
      inputJob.error ||
    JSON.stringify(
      updatedJob.error_detail,
    ) !==
      JSON.stringify(
        inputJob.error_detail,
      ) ||
    compatibilityMirrorChanged
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      `The ${operationName} result violates the media sync job contract.`,
    );
  }
}

function parsePrepareResult(
  value: unknown,
  input: MaterializeMediaSyncSnapshotInput,
  scope: MaterializationScope,
): PrepareMaterializationResult {
  const record =
    parseSingleRpcRecord(
      value,
      "snapshot materialization preparation",
    ) as PrepareMaterializationRpcRecord;

  const updatedJob =
    parseJob(
      record.job,
      "snapshot materialization preparation",
    );

  const snapshotIngestionId =
    normalizeUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const expectedRows =
    normalizePositiveInteger(
      record.expected_rows,
      "expected_rows",
    );

  const nextRowIndex =
    normalizeNonNegativeInteger(
      record.next_row_index,
      "next_row_index",
    );

  const idempotent =
    normalizeBoolean(
      record.idempotent,
      "idempotent",
    );

  validateReturnedJobScope(
    updatedJob,
    input.job,
    scope.reportId,
    snapshotIngestionId,
    "snapshot materialization preparation",
  );

  if (
    expectedRows !==
      input.summary.totalRows ||
    nextRowIndex >
      expectedRows
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization preparation result violates the repository contract.",
    );
  }

  return {
    job:
      updatedJob,

    snapshotIngestionId,

    expectedRows,

    nextRowIndex,

    idempotent,
  };
}

function parseBatchResult(
  value: unknown,
  input: {
    originalJob: MediaSyncJobRecord;
    targetReportId: string;
    snapshotIngestionId: string;
    expectedRows: number;
    requestedBatchStart: number;
    requestedBatchSize: number;
  },
): MaterializationBatchResult {
  const record =
    parseSingleRpcRecord(
      value,
      "snapshot materialization batch",
    ) as MaterializationBatchRpcRecord;

  const updatedJob =
    parseJob(
      record.job,
      "snapshot materialization batch",
    );

  const snapshotIngestionId =
    normalizeUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const batchStart =
    normalizeNonNegativeInteger(
      record.batch_start,
      "batch_start",
    );

  const batchEndExclusive =
    normalizePositiveInteger(
      record.batch_end_exclusive,
      "batch_end_exclusive",
    );

  const expectedBatchRows =
    normalizePositiveInteger(
      record.expected_batch_rows,
      "expected_batch_rows",
    );

  const insertedRows =
    normalizeNonNegativeInteger(
      record.inserted_rows,
      "inserted_rows",
    );

  const materializedBatchRows =
    normalizePositiveInteger(
      record.materialized_batch_rows,
      "materialized_batch_rows",
    );

  const nextRowIndex =
    normalizeNonNegativeInteger(
      record.next_row_index,
      "next_row_index",
    );

  const complete =
    normalizeBoolean(
      record.complete,
      "complete",
    );

  const idempotent =
    normalizeBoolean(
      record.idempotent,
      "idempotent",
    );

  validateReturnedJobScope(
    updatedJob,
    input.originalJob,
    input.targetReportId,
    snapshotIngestionId,
    "snapshot materialization batch",
  );

  const expectedBatchEndExclusive =
    Math.min(
      input.requestedBatchStart +
        input.requestedBatchSize,
      input.expectedRows,
    );

  const expectedRequestedBatchRows =
    expectedBatchEndExclusive -
    input.requestedBatchStart;

  if (
    snapshotIngestionId !==
      input.snapshotIngestionId ||
    batchStart !==
      input.requestedBatchStart ||
    batchEndExclusive !==
      expectedBatchEndExclusive ||
    expectedBatchRows !==
      expectedRequestedBatchRows ||
    materializedBatchRows !==
      expectedBatchRows ||
    insertedRows >
      expectedBatchRows ||
    nextRowIndex >
      input.expectedRows ||
    complete !==
      (
        nextRowIndex >=
        input.expectedRows
      )
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization batch result violates the repository contract.",
    );
  }

  if (
    idempotent &&
    insertedRows !== 0
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "An idempotent materialization batch unexpectedly inserted rows.",
    );
  }

  return {
    job:
      updatedJob,

    snapshotIngestionId,

    batchStart,

    batchEndExclusive,

    expectedBatchRows,

    insertedRows,

    materializedBatchRows,

    nextRowIndex,

    complete,

    idempotent,
  };
}

function parseCompleteResult(
  value: unknown,
  input: MaterializeMediaSyncSnapshotInput,
  scope: MaterializationScope,
  snapshotIngestionId: string,
): MediaSyncSnapshotMaterializationResult {
  const record =
    parseSingleRpcRecord(
      value,
      "snapshot materialization completion",
    ) as CompleteMaterializationRpcRecord;

  const updatedJob =
    parseJob(
      record.job,
      "snapshot materialization completion",
    );

  const returnedSnapshotIngestionId =
    normalizeUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const rowCount =
    normalizePositiveInteger(
      record.row_count,
      "row_count",
    );

  const stagingFingerprint =
    normalizeRequiredString(
      record.staging_fingerprint,
      "staging_fingerprint",
      64,
    );

  const materializedFingerprint =
    normalizeRequiredString(
      record.materialized_fingerprint,
      "materialized_fingerprint",
      64,
    );

  const idempotent =
    normalizeBoolean(
      record.idempotent,
      "idempotent",
    );

  if (
    !SHA256_PATTERN.test(
      stagingFingerprint,
    ) ||
    !SHA256_PATTERN.test(
      materializedFingerprint,
    )
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization completion RPC returned an invalid fingerprint.",
    );
  }

  validateReturnedJobScope(
    updatedJob,
    input.job,
    scope.reportId,
    returnedSnapshotIngestionId,
    "snapshot materialization completion",
  );

  if (
    returnedSnapshotIngestionId !==
      snapshotIngestionId ||
    rowCount !==
      input.summary.totalRows ||
    stagingFingerprint !==
      materializedFingerprint
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization completion result violates the repository contract.",
    );
  }

  return {
    job:
      updatedJob,

    snapshotIngestionId:
      returnedSnapshotIngestionId,

    rowCount,

    stagingFingerprint,

    materializedFingerprint,

    idempotent,
  };
}

async function callMaterializationRpc(
  rpcName: string,
  payload: Record<string, unknown>,
  operationName: string,
): Promise<unknown> {
  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase.rpc(
        rpcName,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new MediaSyncSnapshotMaterializationError(
      "DATABASE_ERROR",
      `The ${operationName} repository operation could not access the database.`,
      { cause: error },
    );
  }

  const {
    data,
    error,
  } = result;

  if (error) {
    throw mapRpcError(
      error,
    );
  }

  return data;
}

async function prepareMaterialization(
  input: MaterializeMediaSyncSnapshotInput,
  scope: MaterializationScope,
): Promise<PrepareMaterializationResult> {
  const data =
    await callMaterializationRpc(
      PREPARE_MEDIA_SYNC_SNAPSHOT_MATERIALIZATION_RPC,
      buildBasePayload(
        scope,
      ),
      "snapshot materialization preparation",
    );

  return parsePrepareResult(
    data,
    input,
    scope,
  );
}

async function materializeBatch(
  input: {
    originalInput:
      MaterializeMediaSyncSnapshotInput;

    scope:
      MaterializationScope;

    snapshotIngestionId:
      string;

    batchStart:
      number;

    batchSize:
      number;
  },
): Promise<MaterializationBatchResult> {
  const payload = {
    ...buildBasePayload(
      input.scope,
    ),

    snapshot_ingestion_id:
      input.snapshotIngestionId,

    batch_start:
      input.batchStart,

    batch_size:
      input.batchSize,
  };

  const data =
    await callMaterializationRpc(
      MATERIALIZE_MEDIA_SYNC_SNAPSHOT_BATCH_RPC,
      payload,
      "snapshot materialization batch",
    );

  return parseBatchResult(
    data,
    {
      originalJob:
        input.originalInput.job,

      targetReportId:
        input.scope.reportId,

      snapshotIngestionId:
        input.snapshotIngestionId,

      expectedRows:
        input.scope.expectedRows,

      requestedBatchStart:
        input.batchStart,

      requestedBatchSize:
        input.batchSize,
    },
  );
}

async function completeMaterialization(
  input: MaterializeMediaSyncSnapshotInput,
  scope: MaterializationScope,
  snapshotIngestionId: string,
): Promise<MediaSyncSnapshotMaterializationResult> {
  const payload = {
    ...buildBasePayload(
      scope,
    ),

    snapshot_ingestion_id:
      snapshotIngestionId,
  };

  const data =
    await callMaterializationRpc(
      COMPLETE_MEDIA_SYNC_SNAPSHOT_MATERIALIZATION_RPC,
      payload,
      "snapshot materialization completion",
    );

  return parseCompleteResult(
    data,
    input,
    scope,
    snapshotIngestionId,
  );
}

export async function materializeMediaSyncSnapshot(
  input: MaterializeMediaSyncSnapshotInput,
): Promise<MediaSyncSnapshotMaterializationResult> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      "Snapshot materialization input is required.",
    );
  }

  validateJob(
    input.job,
  );

  validateCompleteSummary(
    input.job,
    input.summary,
  );

  const batchSize =
    normalizeBatchSize(
      input.batchSize,
    );

  const scope =
    buildMaterializationScope(
      input,
    );

  console.log(
    "[media-sync-materialization] prepare:start",
    {
      jobId:
        scope.jobId,
      reportId:
        scope.reportId,
      expectedRows:
        scope.expectedRows,
      batchSize,
    },
  );

  let preparation:
    PrepareMaterializationResult;

  try {
    preparation =
      await prepareMaterialization(
        input,
        scope,
      );
  } catch (error) {
    console.error(
      "[media-sync-materialization] prepare:failed",
      {
        jobId:
          scope.jobId,
        reportId:
          scope.reportId,
        expectedRows:
          scope.expectedRows,
      },
      error,
    );

    throw error;
  }

  console.log(
    "[media-sync-materialization] prepare:done",
    {
      jobId:
        scope.jobId,
      snapshotIngestionId:
        preparation.snapshotIngestionId,
      expectedRows:
        preparation.expectedRows,
      nextRowIndex:
        preparation.nextRowIndex,
      idempotent:
        preparation.idempotent,
    },
  );

  /*
   * Exact retry safety:
   *
   * A completed snapshot preparation may return nextRowIndex === expectedRows.
   * Restart from row 0 when preparation is idempotent so every bounded batch
   * revalidates existing report_rows against staging without inserting
   * duplicates.
   */
  let nextRowIndex =
    preparation.idempotent
      ? 0
      : preparation.nextRowIndex;

  let everyExecutedBatchWasIdempotent =
    true;

  let executedBatchCount =
    0;

  while (
    nextRowIndex <
    scope.expectedRows
  ) {
    const batchStart =
      nextRowIndex;

    const batchEndExclusive =
      Math.min(
        batchStart + batchSize,
        scope.expectedRows,
      );

    console.log(
      "[media-sync-materialization] batch:start",
      {
        jobId:
          scope.jobId,
        snapshotIngestionId:
          preparation.snapshotIngestionId,
        batchStart,
        batchEndExclusive,
        expectedRows:
          scope.expectedRows,
      },
    );

    let batch:
      MaterializationBatchResult;

    try {
      batch =
        await materializeBatch({
          originalInput:
            input,

          scope,

          snapshotIngestionId:
            preparation.snapshotIngestionId,

          batchStart,

          batchSize,
        });
    } catch (error) {
      console.error(
        "[media-sync-materialization] batch:failed",
        {
          jobId:
            scope.jobId,
          snapshotIngestionId:
            preparation.snapshotIngestionId,
          batchStart,
          batchEndExclusive,
          expectedRows:
            scope.expectedRows,
        },
        error,
      );

      throw error;
    }

    console.log(
      "[media-sync-materialization] batch:done",
      {
        jobId:
          scope.jobId,
        snapshotIngestionId:
          preparation.snapshotIngestionId,
        batchStart:
          batch.batchStart,
        batchEndExclusive:
          batch.batchEndExclusive,
        insertedRows:
          batch.insertedRows,
        materializedBatchRows:
          batch.materializedBatchRows,
        nextRowIndex:
          batch.nextRowIndex,
        complete:
          batch.complete,
        idempotent:
          batch.idempotent,
      },
    );

    executedBatchCount += 1;

    if (!batch.idempotent) {
      everyExecutedBatchWasIdempotent =
        false;
    }

    if (
      batch.nextRowIndex <=
        batchStart &&
      !batch.complete
    ) {
      throw new MediaSyncSnapshotMaterializationError(
        "INVALID_DATABASE_RESULT",
        "The bounded materialization batch did not advance the next row index.",
      );
    }

    nextRowIndex =
      batch.nextRowIndex;
  }

  console.log(
    "[media-sync-materialization] complete:start",
    {
      jobId:
        scope.jobId,
      reportId:
        scope.reportId,
      snapshotIngestionId:
        preparation.snapshotIngestionId,
      expectedRows:
        scope.expectedRows,
    },
  );

  let completion:
    MediaSyncSnapshotMaterializationResult;

  try {
    completion =
      await completeMaterialization(
        input,
        scope,
        preparation.snapshotIngestionId,
      );
  } catch (error) {
    console.error(
      "[media-sync-materialization] complete:failed",
      {
        jobId:
          scope.jobId,
        reportId:
          scope.reportId,
        snapshotIngestionId:
          preparation.snapshotIngestionId,
        expectedRows:
          scope.expectedRows,
      },
      error,
    );

    throw error;
  }

  console.log(
    "[media-sync-materialization] complete:done",
    {
      jobId:
        scope.jobId,
      snapshotIngestionId:
        completion.snapshotIngestionId,
      rowCount:
        completion.rowCount,
      idempotent:
        completion.idempotent,
    },
  );

  const idempotent =
    preparation.idempotent &&
    (
      executedBatchCount === 0 ||
      everyExecutedBatchWasIdempotent
    ) &&
    completion.idempotent;

  return {
    ...completion,
    idempotent,
  };
}

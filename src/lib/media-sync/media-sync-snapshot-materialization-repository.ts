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

const MATERIALIZE_MEDIA_SYNC_SNAPSHOT_RPC =
  "materialize_media_sync_snapshot";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

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

type MaterializationRpcRecord = {
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

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_JOB",
      "A media sync job record is required.",
    );
  }

  normalizeUuid(value.id, "job.id");
  normalizeUuid(value.report_id, "job.report_id");
  normalizeUuid(value.workspace_id, "job.workspace_id");
  normalizeUuid(value.advertiser_id, "job.advertiser_id");
  normalizeUuid(value.connection_id, "job.connection_id");

  normalizeRequiredString(
    value.external_account_id,
    "job.external_account_id",
    500,
  );

  if (value.provider !== NAVER_PROVIDER) {
    throw new MediaSyncSnapshotMaterializationError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads snapshot materialization is supported at this stage.",
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

function parseRpcResult(
  value: unknown,
  input: MaterializeMediaSyncSnapshotInput,
): MediaSyncSnapshotMaterializationResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as MaterializationRpcRecord;

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        record.job,
      );
  } catch (error) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

  const snapshotIngestionId =
    normalizeUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const rowCount =
    normalizeNonNegativeInteger(
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

  if (
    !SHA256_PATTERN.test(stagingFingerprint) ||
    !SHA256_PATTERN.test(materializedFingerprint)
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization RPC returned an invalid fingerprint.",
    );
  }

  if (typeof record.idempotent !== "boolean") {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization RPC returned an invalid idempotent flag.",
    );
  }

  if (
    updatedJob.id !== input.job.id ||
    updatedJob.report_id !== input.job.report_id ||
    updatedJob.workspace_id !== input.job.workspace_id ||
    updatedJob.advertiser_id !== input.job.advertiser_id ||
    updatedJob.connection_id !== input.job.connection_id ||
    updatedJob.provider !== input.job.provider ||
    updatedJob.external_account_id !== input.job.external_account_id ||
    updatedJob.status !== PROCESSING_STATUS ||
    updatedJob.progress !== input.job.progress ||
    updatedJob.finished_at !== input.job.finished_at ||
    updatedJob.error !== input.job.error ||
    JSON.stringify(updatedJob.error_detail) !==
      JSON.stringify(input.job.error_detail) ||
    updatedJob.snapshot_ingestion_id !== snapshotIngestionId ||
    rowCount !== input.summary.totalRows ||
    stagingFingerprint !== materializedFingerprint
  ) {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot materialization result violates the repository contract.",
    );
  }

  return {
    job: updatedJob,
    snapshotIngestionId,
    rowCount,
    stagingFingerprint,
    materializedFingerprint,
    idempotent: record.idempotent,
  };
}

export async function materializeMediaSyncSnapshot(
  input: MaterializeMediaSyncSnapshotInput,
): Promise<MediaSyncSnapshotMaterializationResult> {
  if (!input || typeof input !== "object") {
    throw new MediaSyncSnapshotMaterializationError(
      "INVALID_INPUT",
      "Snapshot materialization input is required.",
    );
  }

  validateJob(input.job);
  validateCompleteSummary(
    input.job,
    input.summary,
  );

  const payload = {
    job_id: input.job.id,
    report_id: input.job.report_id,
    workspace_id: input.job.workspace_id,
    advertiser_id: input.job.advertiser_id,
    connection_id: input.job.connection_id,
    provider: input.job.provider,
    external_account_id: input.job.external_account_id,
    date_from: input.job.date_from,
    date_to: input.job.date_to,
    expected_rows: input.summary.totalRows,
  };

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase.rpc(
        MATERIALIZE_MEDIA_SYNC_SNAPSHOT_RPC,
        {
          p_payload: payload,
        },
      );
  } catch (error) {
    throw new MediaSyncSnapshotMaterializationError(
      "DATABASE_ERROR",
      "The snapshot materialization repository could not access the database.",
      { cause: error },
    );
  }

  const { data, error } =
    result;

  if (error) {
    throw mapRpcError(error);
  }

  return parseRpcResult(
    data,
    input,
  );
}

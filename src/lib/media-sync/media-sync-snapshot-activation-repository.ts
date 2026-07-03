import { getSupabaseAdmin } from "../supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import {
  isValidMediaSyncDateRange,
  type MediaSyncJobRecord,
} from "./types";

const ACTIVATE_MEDIA_SYNC_SNAPSHOT_RPC =
  "activate_media_sync_snapshot";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/;

export type MediaSyncSnapshotActivationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "SNAPSHOT_NOT_MATERIALIZED"
  | "SNAPSHOT_INVALID"
  | "ACTIVATION_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncSnapshotActivationError
  extends Error {
  readonly code:
    MediaSyncSnapshotActivationErrorCode;

  constructor(
    code:
      MediaSyncSnapshotActivationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaSyncSnapshotActivationError";

    this.code = code;
  }
}

export type ActivateMediaSyncSnapshotInput = {
  job: MediaSyncJobRecord;
  expectedRows: number;
};

export type MediaSyncSnapshotActivationResult = {
  job: MediaSyncJobRecord;
  previousIngestionId: string | null;
  snapshotIngestionId: string;
  currentIngestionId: string;
  publishedIngestionId: string | null;
  rowCount: number;
  stagingFingerprint: string;
  materializedFingerprint: string;
  idempotent: boolean;
};

type UnknownRecord =
  Record<string, unknown>;

type ActivationRpcRecord = {
  job: unknown;
  previous_ingestion_id: unknown;
  snapshot_ingestion_id: unknown;
  current_ingestion_id: unknown;
  published_ingestion_id: unknown;
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
    throw new MediaSyncSnapshotActivationError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new MediaSyncSnapshotActivationError(
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
    throw new MediaSyncSnapshotActivationError(
      "INVALID_INPUT",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalizedValue;
}

function normalizeNullableUuid(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }

  return normalizeUuid(
    value,
    fieldName,
  );
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
    throw new MediaSyncSnapshotActivationError(
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
    throw new MediaSyncSnapshotActivationError(
      "INVALID_JOB",
      "A materialized media sync job record is required.",
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
    throw new MediaSyncSnapshotActivationError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads snapshot activation is supported at this stage.",
    );
  }

  if (value.status !== PROCESSING_STATUS) {
    throw new MediaSyncSnapshotActivationError(
      "JOB_NOT_PROCESSING",
      "The media sync job must remain processing before snapshot activation.",
    );
  }

  if (
    value.mode !== "snapshot_replace" ||
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_JOB",
      "The media sync job contains an invalid activation scope.",
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
    throw new MediaSyncSnapshotActivationError(
      "INVALID_JOB",
      "The media sync job contains an invalid processing claim state.",
    );
  }

  if (
    value.previous_ingestion_id !== null
  ) {
    normalizeUuid(
      value.previous_ingestion_id,
      "job.previous_ingestion_id",
    );
  }

  if (value.snapshot_ingestion_id === null) {
    throw new MediaSyncSnapshotActivationError(
      "SNAPSHOT_NOT_MATERIALIZED",
      "The media sync job does not have a materialized snapshot.",
    );
  }

  normalizeUuid(
    value.snapshot_ingestion_id,
    "job.snapshot_ingestion_id",
  );
}

function validateExpectedRows(
  job: MediaSyncJobRecord,
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_INPUT",
      "expectedRows must be a positive safe integer.",
    );
  }

  if (
    job.inserted_rows !== value ||
    job.normalized_rows !== value ||
    job.failed_rows !== 0
  ) {
    throw new MediaSyncSnapshotActivationError(
      "SNAPSHOT_INVALID",
      "The activation row count does not match the processing checkpoint.",
    );
  }

  return value;
}

function mapRpcError(
  error: unknown,
): MediaSyncSnapshotActivationError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("MSA_INVALID_INPUT")) {
    return new MediaSyncSnapshotActivationError(
      "INVALID_INPUT",
      "The snapshot activation input is invalid.",
      { cause: error },
    );
  }

  if (
    message.includes("MSA_JOB_NOT_FOUND") ||
    message.includes("MSA_REPORT_NOT_FOUND")
  ) {
    return new MediaSyncSnapshotActivationError(
      "INVALID_JOB",
      "The snapshot activation scope could not be loaded.",
      { cause: error },
    );
  }

  if (message.includes("MSA_JOB_NOT_PROCESSING")) {
    return new MediaSyncSnapshotActivationError(
      "JOB_NOT_PROCESSING",
      "The media sync job is no longer processing.",
      { cause: error },
    );
  }

  if (message.includes("MSA_UNSUPPORTED_PROVIDER")) {
    return new MediaSyncSnapshotActivationError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported.",
      { cause: error },
    );
  }

  if (message.includes("MSA_SCOPE_MISMATCH")) {
    return new MediaSyncSnapshotActivationError(
      "SCOPE_MISMATCH",
      "The snapshot activation scope does not match the database state.",
      { cause: error },
    );
  }

  if (message.includes("MSA_SNAPSHOT_NOT_MATERIALIZED")) {
    return new MediaSyncSnapshotActivationError(
      "SNAPSHOT_NOT_MATERIALIZED",
      "The materialized snapshot could not be found.",
      { cause: error },
    );
  }

  if (
    message.includes("MSA_SNAPSHOT_INVALID") ||
    message.includes("MSA_JOB_STATE_CHANGED")
  ) {
    return new MediaSyncSnapshotActivationError(
      "SNAPSHOT_INVALID",
      "The materialized snapshot failed independent activation verification.",
      { cause: error },
    );
  }

  if (message.includes("MSA_ACTIVATION_CONFLICT")) {
    return new MediaSyncSnapshotActivationError(
      "ACTIVATION_CONFLICT",
      "The report current ingestion pointer changed after this job was created.",
      { cause: error },
    );
  }

  return new MediaSyncSnapshotActivationError(
    "DATABASE_ERROR",
    "The media sync snapshot could not be activated.",
    { cause: error },
  );
}

function parseRpcResult(
  value: unknown,
  input: ActivateMediaSyncSnapshotInput,
): MediaSyncSnapshotActivationResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot activation RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as ActivationRpcRecord;

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        record.job,
      );
  } catch (error) {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot activation RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

  const previousIngestionId =
    normalizeNullableUuid(
      record.previous_ingestion_id,
      "previous_ingestion_id",
    );

  const snapshotIngestionId =
    normalizeUuid(
      record.snapshot_ingestion_id,
      "snapshot_ingestion_id",
    );

  const currentIngestionId =
    normalizeUuid(
      record.current_ingestion_id,
      "current_ingestion_id",
    );

  const publishedIngestionId =
    normalizeNullableUuid(
      record.published_ingestion_id,
      "published_ingestion_id",
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
    throw new MediaSyncSnapshotActivationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot activation RPC returned an invalid fingerprint.",
    );
  }

  if (typeof record.idempotent !== "boolean") {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot activation RPC returned an invalid idempotent flag.",
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
    updatedJob.previous_ingestion_id !== previousIngestionId ||
    updatedJob.snapshot_ingestion_id !== snapshotIngestionId ||
    previousIngestionId !== input.job.previous_ingestion_id ||
    snapshotIngestionId !== input.job.snapshot_ingestion_id ||
    currentIngestionId !== snapshotIngestionId ||
    rowCount !== input.expectedRows ||
    stagingFingerprint !== materializedFingerprint
  ) {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_DATABASE_RESULT",
      "The snapshot activation result violates the repository contract.",
    );
  }

  return {
    job: updatedJob,
    previousIngestionId,
    snapshotIngestionId,
    currentIngestionId,
    publishedIngestionId,
    rowCount,
    stagingFingerprint,
    materializedFingerprint,
    idempotent: record.idempotent,
  };
}

export async function activateMediaSyncSnapshot(
  input: ActivateMediaSyncSnapshotInput,
): Promise<MediaSyncSnapshotActivationResult> {
  if (!input || typeof input !== "object") {
    throw new MediaSyncSnapshotActivationError(
      "INVALID_INPUT",
      "Snapshot activation input is required.",
    );
  }

  validateJob(input.job);

  const expectedRows =
    validateExpectedRows(
      input.job,
      input.expectedRows,
    );

  const payload = {
    job_id: input.job.id,
    report_id: input.job.report_id,
    workspace_id: input.job.workspace_id,
    advertiser_id: input.job.advertiser_id,
    connection_id: input.job.connection_id,
    provider: input.job.provider,
    external_account_id:
      input.job.external_account_id,
    date_from: input.job.date_from,
    date_to: input.job.date_to,
    previous_ingestion_id:
      input.job.previous_ingestion_id,
    snapshot_ingestion_id:
      input.job.snapshot_ingestion_id,
    expected_rows: expectedRows,
  };

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase.rpc(
        ACTIVATE_MEDIA_SYNC_SNAPSHOT_RPC,
        {
          p_payload: payload,
        },
      );
  } catch (error) {
    throw new MediaSyncSnapshotActivationError(
      "DATABASE_ERROR",
      "The snapshot activation repository could not access the database.",
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

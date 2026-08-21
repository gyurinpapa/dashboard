import { getSupabaseAdmin } from "../supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import {
  isValidMediaSyncDateRange,
  type MediaSyncJobRecord,
} from "./types";

const FINALIZE_MEDIA_SYNC_JOB_RPC =
  "finalize_media_sync_job";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DONE_STATUS =
  "done" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHA256_PATTERN =
  /^[0-9a-f]{64}$/;

export type MediaSyncFinalizationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "SNAPSHOT_NOT_ACTIVE"
  | "SNAPSHOT_INVALID"
  | "FINALIZATION_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncFinalizationError extends Error {
  readonly code:
    MediaSyncFinalizationErrorCode;

  constructor(
    code:
      MediaSyncFinalizationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaSyncFinalizationError";

    this.code = code;
  }
}

export type FinalizeMediaSyncJobInput = {
  job: MediaSyncJobRecord;
  expectedRows: number;
};

export type MediaSyncFinalizationResult = {
  job: MediaSyncJobRecord;
  snapshotIngestionId: string;
  currentIngestionId: string;
  publishedIngestionId: string | null;
  rowCount: number;
  stagingFingerprint: string;
  materializedFingerprint: string;
  finishedAt: string;
  connectionId: string;
  connectionLastSyncAt: string;
  connectionUpdated: boolean;
  idempotent: boolean;
};

type UnknownRecord =
  Record<string, unknown>;

type FinalizationRpcRecord = {
  job: unknown;
  snapshot_ingestion_id: unknown;
  current_ingestion_id: unknown;
  published_ingestion_id: unknown;
  row_count: unknown;
  staging_fingerprint: unknown;
  materialized_fingerprint: unknown;
  finished_at: unknown;
  connection_id: unknown;
  connection_last_sync_at: unknown;
  connection_updated: unknown;
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
    throw new MediaSyncFinalizationError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new MediaSyncFinalizationError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new MediaSyncFinalizationError(
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
    throw new MediaSyncFinalizationError(
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

function normalizePositiveInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new MediaSyncFinalizationError(
      "INVALID_INPUT",
      `${fieldName} must be a positive safe integer.`,
    );
  }

  return value;
}

function normalizeResultInteger(
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
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return numberValue;
}

function normalizeTimestamp(
  value: unknown,
  fieldName: string,
): string {
  const timestamp =
    normalizeRequiredString(
      value,
      fieldName,
      100,
    );

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a valid timestamp.`,
    );
  }

  return timestamp;
}

function stableJson(value: unknown): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record =
    value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncFinalizationError(
      "INVALID_JOB",
      "An activated media sync job record is required.",
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

  if (
    value.provider !== NAVER_PROVIDER &&
    value.provider !== GOOGLE_ADS_PROVIDER
  ) {
    throw new MediaSyncFinalizationError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads or Google Ads sync finalization is supported.",
    );
  }

  if (
    value.status !== PROCESSING_STATUS &&
    value.status !== DONE_STATUS
  ) {
    throw new MediaSyncFinalizationError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing or already done before finalization.",
    );
  }

  if (
    value.mode !== "snapshot_replace" ||
    !isValidMediaSyncDateRange(
      value.date_from,
      value.date_to,
    )
  ) {
    throw new MediaSyncFinalizationError(
      "INVALID_JOB",
      "The media sync job contains an invalid finalization scope.",
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
    throw new MediaSyncFinalizationError(
      "SNAPSHOT_NOT_ACTIVE",
      "The media sync job does not have a materialized snapshot.",
    );
  }

  normalizeUuid(
    value.snapshot_ingestion_id,
    "job.snapshot_ingestion_id",
  );

  if (value.status === PROCESSING_STATUS) {
    const startedAt =
      value.started_at;

    const attemptCount =
      value.attempt_count;

    if (
      typeof startedAt !== "string" ||
      !startedAt.trim() ||
      typeof attemptCount !== "number" ||
      !Number.isInteger(attemptCount) ||
      attemptCount < 1 ||
      value.finished_at !== null
    ) {
      throw new MediaSyncFinalizationError(
        "INVALID_JOB",
        "The processing media sync job contains an invalid claim state.",
      );
    }
  }

  if (value.status === DONE_STATUS) {
    if (
      value.progress !== 100 ||
      typeof value.finished_at !== "string" ||
      !value.finished_at.trim() ||
      value.error !== null
    ) {
      throw new MediaSyncFinalizationError(
        "FINALIZATION_CONFLICT",
        "The completed media sync job is not an exact finalization candidate.",
      );
    }
  }
}

function validateExpectedRows(
  job: MediaSyncJobRecord,
  value: unknown,
): number {
  const expectedRows =
    normalizePositiveInteger(
      value,
      "expectedRows",
    );

  if (
    job.inserted_rows !== expectedRows ||
    job.normalized_rows !== expectedRows ||
    job.failed_rows !== 0
  ) {
    throw new MediaSyncFinalizationError(
      "SNAPSHOT_INVALID",
      "The finalization row count does not match the processing checkpoint.",
    );
  }

  return expectedRows;
}

function mapRpcError(
  error: unknown,
): MediaSyncFinalizationError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("MSF_INVALID_INPUT")) {
    return new MediaSyncFinalizationError(
      "INVALID_INPUT",
      "The sync finalization input is invalid.",
      { cause: error },
    );
  }

  if (
    message.includes("MSF_JOB_NOT_FOUND") ||
    message.includes("MSF_REPORT_NOT_FOUND") ||
    message.includes("MSF_CONNECTION_NOT_FOUND")
  ) {
    return new MediaSyncFinalizationError(
      "INVALID_JOB",
      "The sync finalization scope could not be loaded.",
      { cause: error },
    );
  }

  if (message.includes("MSF_JOB_NOT_PROCESSING")) {
    return new MediaSyncFinalizationError(
      "JOB_NOT_PROCESSING",
      "The media sync job is not processing or exactly done.",
      { cause: error },
    );
  }

  if (message.includes("MSF_UNSUPPORTED_PROVIDER")) {
    return new MediaSyncFinalizationError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported.",
      { cause: error },
    );
  }

  if (message.includes("MSF_SCOPE_MISMATCH")) {
    return new MediaSyncFinalizationError(
      "SCOPE_MISMATCH",
      "The sync finalization scope does not match the database state.",
      { cause: error },
    );
  }

  if (message.includes("MSF_SNAPSHOT_NOT_ACTIVE")) {
    return new MediaSyncFinalizationError(
      "SNAPSHOT_NOT_ACTIVE",
      "The media sync snapshot is not the active current report snapshot.",
      { cause: error },
    );
  }

  if (message.includes("MSF_SNAPSHOT_INVALID")) {
    return new MediaSyncFinalizationError(
      "SNAPSHOT_INVALID",
      "The active current snapshot failed finalization verification.",
      { cause: error },
    );
  }

  if (message.includes("MSF_FINALIZATION_CONFLICT")) {
    return new MediaSyncFinalizationError(
      "FINALIZATION_CONFLICT",
      "The sync finalization state changed or conflicts with a later operation.",
      { cause: error },
    );
  }

  return new MediaSyncFinalizationError(
    "DATABASE_ERROR",
    "The media sync job could not be finalized.",
    { cause: error },
  );
}

function parseRpcResult(
  value: unknown,
  input: FinalizeMediaSyncJobInput,
): MediaSyncFinalizationResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as FinalizationRpcRecord;

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        record.job,
      );
  } catch (error) {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

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
    normalizeResultInteger(
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
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization RPC returned an invalid fingerprint.",
    );
  }

  const finishedAt =
    normalizeTimestamp(
      record.finished_at,
      "finished_at",
    );

  const connectionId =
    normalizeUuid(
      record.connection_id,
      "connection_id",
    );

  const connectionLastSyncAt =
    normalizeTimestamp(
      record.connection_last_sync_at,
      "connection_last_sync_at",
    );

  if (typeof record.connection_updated !== "boolean") {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization RPC returned an invalid connectionUpdated flag.",
    );
  }

  if (typeof record.idempotent !== "boolean") {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization RPC returned an invalid idempotent flag.",
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
    updatedJob.status !== DONE_STATUS ||
    updatedJob.progress !== 100 ||
    updatedJob.finished_at !== finishedAt ||
    updatedJob.error !== null ||
    stableJson(updatedJob.error_detail) !==
      stableJson(input.job.error_detail) ||
    updatedJob.previous_ingestion_id !== input.job.previous_ingestion_id ||
    updatedJob.snapshot_ingestion_id !== snapshotIngestionId ||
    snapshotIngestionId !== input.job.snapshot_ingestion_id ||
    currentIngestionId !== snapshotIngestionId ||
    connectionId !== input.job.connection_id ||
    rowCount !== input.expectedRows ||
    stagingFingerprint !== materializedFingerprint
  ) {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization result violates the repository contract.",
    );
  }

  if (
    input.job.status === DONE_STATUS &&
    record.idempotent !== true
  ) {
    throw new MediaSyncFinalizationError(
      "INVALID_DATABASE_RESULT",
      "The sync finalization retry was not reported as idempotent.",
    );
  }

  return {
    job: updatedJob,
    snapshotIngestionId,
    currentIngestionId,
    publishedIngestionId,
    rowCount,
    stagingFingerprint,
    materializedFingerprint,
    finishedAt,
    connectionId,
    connectionLastSyncAt,
    connectionUpdated: record.connection_updated,
    idempotent: record.idempotent,
  };
}

export async function finalizeMediaSyncJob(
  input: FinalizeMediaSyncJobInput,
): Promise<MediaSyncFinalizationResult> {
  if (!input || typeof input !== "object") {
    throw new MediaSyncFinalizationError(
      "INVALID_INPUT",
      "Sync finalization input is required.",
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
        FINALIZE_MEDIA_SYNC_JOB_RPC,
        {
          p_payload: payload,
        },
      );
  } catch (error) {
    throw new MediaSyncFinalizationError(
      "DATABASE_ERROR",
      "The sync finalization repository could not access the database.",
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

import { getSupabaseAdmin } from "../supabase/admin";
import {
  getMediaConnectionRecord,
  MediaConnectionsRepositoryError,
} from "./media-connections-repository";
import {
  isMediaProvider,
  isMediaSyncDataLevel,
  isMediaSyncJobStatus,
  isMediaSyncMode,
  isValidMediaSyncDateRange,
  type JsonObject,
  type JsonValue,
  type MediaProvider,
  type MediaSyncDataLevel,
  type MediaSyncJobRecord,
  type MediaSyncJobStatus,
  type MediaSyncMode,
  type SafeMediaSyncJob,
} from "./types";

const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const REPORTS_TABLE = "reports";

const MEDIA_SYNC_JOB_PENDING_STATUS =
  "pending" as const;

const MEDIA_SYNC_JOB_PROCESSING_STATUS =
  "processing" as const;

const MEDIA_SYNC_JOB_FAILED_STATUS =
  "failed" as const;

const MEDIA_SYNC_JOB_MODE =
  "snapshot_replace" as const;

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const DEFAULT_STALE_PROCESSING_JOB_MS =
  60 * 60 * 1_000;

const MIN_STALE_PROCESSING_JOB_MS =
  5 * 60 * 1_000;

const MAX_STALE_PROCESSING_JOB_MS =
  24 * 60 * 60 * 1_000;

const DEFAULT_STALE_PROCESSING_JOB_LIMIT =
  20;

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";

export type MediaSyncJobsRepositoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_RECORD"
  | "REPORT_NOT_FOUND"
  | "REPORT_SCOPE_MISMATCH"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_SCOPE_MISMATCH"
  | "CONNECTION_NOT_ACTIVE"
  | "ACTIVE_JOB_ALREADY_EXISTS"
  | "DATABASE_ERROR";

export class MediaSyncJobsRepositoryError extends Error {
  readonly code: MediaSyncJobsRepositoryErrorCode;

  constructor(
    code: MediaSyncJobsRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaSyncJobsRepositoryError";
    this.code = code;
  }
}

export type CreatePendingMediaSyncJobInput = {
  reportId: string;
  connectionId: string;

  workspaceId: string;
  advertiserId: string;

  createdBy: string;

  dateFrom: string;
  dateTo: string;

  dataLevel: MediaSyncDataLevel;
  mode: MediaSyncMode;
};

export type ListRecentMediaSyncJobsForReportInput = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  limit?: number;
};

export type RecoverStaleProcessingMediaSyncJobsForReportInput = {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  staleMs?: number;
  now?: Date;
  limit?: number;
};

export type RecoverStaleProcessingNaverMediaSyncJobsInput = {
  staleMs?: number;
  now?: Date;
  limit?: number;
};

type UnknownRecord = Record<string, unknown>;

type ReportScopeRecord = {
  id: string;
  workspace_id: string;
  advertiser_id: string;
  current_ingestion_id: string | null;
};

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string {
  if (typeof value !== "string") {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      `Database field ${fieldName} has an invalid value.`,
    );
  }

  return value;
}

function requireNullableString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      `Database field ${fieldName} has an invalid value.`,
    );
  }

  return value;
}

function requireNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  const numberValue = Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 0
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      `Database field ${fieldName} has an invalid value.`,
    );
  }

  return numberValue;
}

function requireProgress(
  value: unknown,
): number {
  const progress = requireNonNegativeInteger(
    value,
    "progress",
  );

  if (progress > 100) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Database field progress has an invalid value.",
    );
  }

  return progress;
}

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function isJsonValue(
  value: unknown,
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((item) =>
      isJsonValue(item),
    );
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(
      (nestedValue) =>
        isJsonValue(nestedValue),
    );
  }

  return false;
}

function requireNullableJsonObject(
  value: unknown,
): JsonObject | null {
  if (value === null) {
    return null;
  }

  if (!isPlainObject(value)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Database field error_detail has an invalid value.",
    );
  }

  for (const nestedValue of Object.values(value)) {
    if (!isJsonValue(nestedValue)) {
      throw new MediaSyncJobsRepositoryError(
        "INVALID_RECORD",
        "Database field error_detail contains an invalid value.",
      );
    }
  }

  return value as JsonObject;
}

function parseReportScopeRecord(
  value: unknown,
): ReportScopeRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Report database result is invalid.",
    );
  }

  return {
    id: requireString(
      value.id,
      "report.id",
    ),
    workspace_id: requireString(
      value.workspace_id,
      "report.workspace_id",
    ),
    advertiser_id: requireString(
      value.advertiser_id,
      "report.advertiser_id",
    ),
    current_ingestion_id:
      requireNullableString(
        value.current_ingestion_id,
        "report.current_ingestion_id",
      ),
  };
}

export function parseMediaSyncJobRecord(
  value: unknown,
): MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Media sync job database result is invalid.",
    );
  }

  if (!isMediaProvider(value.provider)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Media sync job contains an invalid provider.",
    );
  }

  if (!isMediaSyncDataLevel(value.data_level)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Media sync job contains an invalid data level.",
    );
  }

  if (!isMediaSyncMode(value.mode)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Media sync job contains an invalid mode.",
    );
  }

  if (!isMediaSyncJobStatus(value.status)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Media sync job contains an invalid status.",
    );
  }

  return {
    id: requireString(value.id, "id"),

    workspace_id: requireString(
      value.workspace_id,
      "workspace_id",
    ),
    advertiser_id: requireString(
      value.advertiser_id,
      "advertiser_id",
    ),
    report_id: requireString(
      value.report_id,
      "report_id",
    ),
    connection_id: requireString(
      value.connection_id,
      "connection_id",
    ),

    provider: value.provider,
    external_account_id: requireString(
      value.external_account_id,
      "external_account_id",
    ),

    date_from: requireString(
      value.date_from,
      "date_from",
    ),
    date_to: requireString(
      value.date_to,
      "date_to",
    ),

    data_level: value.data_level,
    mode: value.mode,

    status: value.status,
    progress: requireProgress(
      value.progress,
    ),

    raw_rows: requireNonNegativeInteger(
      value.raw_rows,
      "raw_rows",
    ),
    normalized_rows:
      requireNonNegativeInteger(
        value.normalized_rows,
        "normalized_rows",
      ),
    inserted_rows:
      requireNonNegativeInteger(
        value.inserted_rows,
        "inserted_rows",
      ),
    failed_rows:
      requireNonNegativeInteger(
        value.failed_rows,
        "failed_rows",
      ),

    previous_ingestion_id:
      requireNullableString(
        value.previous_ingestion_id,
        "previous_ingestion_id",
      ),
    snapshot_ingestion_id:
      requireNullableString(
        value.snapshot_ingestion_id,
        "snapshot_ingestion_id",
      ),

    attempt_count:
      requireNonNegativeInteger(
        value.attempt_count,
        "attempt_count",
      ),
    error: requireNullableString(
      value.error,
      "error",
    ),
    error_detail:
      requireNullableJsonObject(
        value.error_detail,
      ),

    created_by: requireString(
      value.created_by,
      "created_by",
    ),
    created_at: requireString(
      value.created_at,
      "created_at",
    ),
    started_at: requireNullableString(
      value.started_at,
      "started_at",
    ),
    finished_at: requireNullableString(
      value.finished_at,
      "finished_at",
    ),
    updated_at: requireString(
      value.updated_at,
      "updated_at",
    ),
  };
}

function toSafeMediaSyncJob(
  record: MediaSyncJobRecord,
): SafeMediaSyncJob {
  return {
    ...record,
    error_detail: record.error_detail,
  };
}

function isUniqueViolation(
  error: unknown,
): boolean {
  return (
    isPlainObject(error) &&
    error.code ===
      POSTGRES_UNIQUE_VIOLATION_CODE
  );
}

function wrapDatabaseError(
  message: string,
  error: unknown,
): MediaSyncJobsRepositoryError {
  return new MediaSyncJobsRepositoryError(
    "DATABASE_ERROR",
    message,
    { cause: error },
  );
}

async function requireScopedReport(input: {
  reportId: string;
  workspaceId: string;
  advertiserId: string;
}): Promise<ReportScopeRecord> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select(
      "id, workspace_id, advertiser_id, current_ingestion_id",
    )
    .eq("id", input.reportId)
    .eq("workspace_id", input.workspaceId)
    .eq("advertiser_id", input.advertiserId)
    .maybeSingle();

  if (error) {
    throw wrapDatabaseError(
      "Report scope could not be loaded.",
      error,
    );
  }

  if (!data) {
    throw new MediaSyncJobsRepositoryError(
      "REPORT_NOT_FOUND",
      "Report was not found in the requested scope.",
    );
  }

  const report =
    parseReportScopeRecord(data);

  if (
    report.id !== input.reportId ||
    report.workspace_id !==
      input.workspaceId ||
    report.advertiser_id !==
      input.advertiserId
  ) {
    throw new MediaSyncJobsRepositoryError(
      "REPORT_SCOPE_MISMATCH",
      "Report does not match the requested scope.",
    );
  }

  return report;
}


function normalizeStaleProcessingJobMs(
  value: unknown,
): number {
  if (value === undefined || value === null) {
    return DEFAULT_STALE_PROCESSING_JOB_MS;
  }

  const numericValue = Number(value);

  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < MIN_STALE_PROCESSING_JOB_MS ||
    numericValue > MAX_STALE_PROCESSING_JOB_MS
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      `staleMs must be an integer between ${MIN_STALE_PROCESSING_JOB_MS} and ${MAX_STALE_PROCESSING_JOB_MS}.`,
    );
  }

  return numericValue;
}

function normalizeRecoveryLimit(
  value: unknown,
): number {
  const numericValue = Number(
    value ?? DEFAULT_STALE_PROCESSING_JOB_LIMIT,
  );

  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < 1
  ) {
    return DEFAULT_STALE_PROCESSING_JOB_LIMIT;
  }

  return Math.min(
    numericValue,
    DEFAULT_STALE_PROCESSING_JOB_LIMIT,
  );
}

function buildStaleProcessingJobCutoff(input: {
  staleMs: number;
  now?: Date;
}): string {
  const now =
    input.now instanceof Date &&
    Number.isFinite(input.now.getTime())
      ? input.now
      : new Date();

  return new Date(
    now.getTime() - input.staleMs,
  ).toISOString();
}

function buildStaleProcessingErrorDetail(input: {
  staleMs: number;
  cutoff: string;
}): JsonObject {
  return {
    code: "STALE_PROCESSING_JOB",
    message:
      "Media sync processing job exceeded the stale processing threshold and was recovered automatically.",
    stage: "stale_recovery",
    source: "automatic_recovery",
    stale_ms: input.staleMs,
    cutoff: input.cutoff,
    recovered_at: new Date().toISOString(),
  };
}

async function recoverStaleProcessingJobsByIds(input: {
  ids: string[];
  staleMs: number;
  cutoff: string;
}): Promise<SafeMediaSyncJob[]> {
  if (input.ids.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .update({
      status:
        MEDIA_SYNC_JOB_FAILED_STATUS satisfies MediaSyncJobStatus,
      progress: 0,
      error: "STALE_PROCESSING_JOB",
      error_detail:
        buildStaleProcessingErrorDetail({
          staleMs: input.staleMs,
          cutoff: input.cutoff,
        }),
      finished_at: now,
      updated_at: now,
    })
    .in("id", input.ids)
    .eq("status", MEDIA_SYNC_JOB_PROCESSING_STATUS)
    .select("*");

  if (error) {
    throw wrapDatabaseError(
      "Stale media sync processing jobs could not be recovered.",
      error,
    );
  }

  return (data ?? []).map((record) =>
    toSafeMediaSyncJob(
      parseMediaSyncJobRecord(record),
    ),
  );
}

export async function recoverStaleProcessingMediaSyncJobsForReport(
  input: RecoverStaleProcessingMediaSyncJobsForReportInput,
): Promise<SafeMediaSyncJob[]> {
  const reportId = normalizeRequiredString(
    input.reportId,
    "reportId",
    200,
  );

  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );

  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );

  const staleMs =
    normalizeStaleProcessingJobMs(
      input.staleMs,
    );

  const limit =
    normalizeRecoveryLimit(input.limit);

  await requireScopedReport({
    reportId,
    workspaceId,
    advertiserId,
  });

  const cutoff =
    buildStaleProcessingJobCutoff({
      staleMs,
      now: input.now,
    });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("report_id", reportId)
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .eq("status", MEDIA_SYNC_JOB_PROCESSING_STATUS)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw wrapDatabaseError(
      "Stale media sync processing jobs could not be loaded.",
      error,
    );
  }

  const ids = (data ?? [])
    .map((record) =>
      isPlainObject(record) &&
      typeof record.id === "string"
        ? record.id
        : null,
    )
    .filter(
      (id): id is string =>
        Boolean(id),
    );

  return recoverStaleProcessingJobsByIds({
    ids,
    staleMs,
    cutoff,
  });
}

export async function recoverStaleProcessingNaverMediaSyncJobs(
  input: RecoverStaleProcessingNaverMediaSyncJobsInput = {},
): Promise<SafeMediaSyncJob[]> {
  const staleMs =
    normalizeStaleProcessingJobMs(
      input.staleMs,
    );

  const limit =
    normalizeRecoveryLimit(input.limit);

  const cutoff =
    buildStaleProcessingJobCutoff({
      staleMs,
      now: input.now,
    });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("provider", NAVER_SEARCH_ADS_PROVIDER)
    .eq("status", MEDIA_SYNC_JOB_PROCESSING_STATUS)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw wrapDatabaseError(
      "Stale Naver media sync processing jobs could not be loaded.",
      error,
    );
  }

  const ids = (data ?? [])
    .map((record) =>
      isPlainObject(record) &&
      typeof record.id === "string"
        ? record.id
        : null,
    )
    .filter(
      (id): id is string =>
        Boolean(id),
    );

  return recoverStaleProcessingJobsByIds({
    ids,
    staleMs,
    cutoff,
  });
}


export async function createPendingMediaSyncJob(
  input: CreatePendingMediaSyncJobInput,
): Promise<SafeMediaSyncJob> {
  const reportId = normalizeRequiredString(
    input.reportId,
    "reportId",
    200,
  );

  const connectionId =
    normalizeRequiredString(
      input.connectionId,
      "connectionId",
      200,
    );

  const workspaceId =
    normalizeRequiredString(
      input.workspaceId,
      "workspaceId",
      200,
    );

  const advertiserId =
    normalizeRequiredString(
      input.advertiserId,
      "advertiserId",
      200,
    );

  const createdBy = normalizeRequiredString(
    input.createdBy,
    "createdBy",
    200,
  );

  const dateFrom = normalizeRequiredString(
    input.dateFrom,
    "dateFrom",
    10,
  );

  const dateTo = normalizeRequiredString(
    input.dateTo,
    "dateTo",
    10,
  );

  if (
    !isValidMediaSyncDateRange(
      dateFrom,
      dateTo,
    )
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      "dateFrom and dateTo must form a valid YYYY-MM-DD date range.",
    );
  }

  if (
    !isMediaSyncDataLevel(
      input.dataLevel,
    )
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      "dataLevel is invalid.",
    );
  }

  if (!isMediaSyncMode(input.mode)) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      "mode is invalid.",
    );
  }

  if (input.mode !== MEDIA_SYNC_JOB_MODE) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_INPUT",
      "Only snapshot_replace mode is supported.",
    );
  }

  const report = await requireScopedReport({
    reportId,
    workspaceId,
    advertiserId,
  });

  let connection;

  try {
    connection =
      await getMediaConnectionRecord({
        connectionId,
        workspaceId,
        advertiserId,
      });
  } catch (error) {
    if (
      error instanceof
      MediaConnectionsRepositoryError
    ) {
      throw new MediaSyncJobsRepositoryError(
        error.code ===
          "CONNECTION_NOT_FOUND"
          ? "CONNECTION_NOT_FOUND"
          : "DATABASE_ERROR",
        "Media connection scope could not be loaded.",
        { cause: error },
      );
    }

    throw error;
  }

  if (!connection) {
    throw new MediaSyncJobsRepositoryError(
      "CONNECTION_NOT_FOUND",
      "Media connection was not found in the requested scope.",
    );
  }

  if (
    connection.workspace_id !== workspaceId ||
    connection.advertiser_id !==
      advertiserId ||
    connection.id !== connectionId
  ) {
    throw new MediaSyncJobsRepositoryError(
      "CONNECTION_SCOPE_MISMATCH",
      "Media connection does not match the requested scope.",
    );
  }

  if (connection.status !== "active") {
    throw new MediaSyncJobsRepositoryError(
      "CONNECTION_NOT_ACTIVE",
      "Media connection is not active.",
    );
  }

  // Stage 8 / Macro 3: request-driven job creation never mutates an existing
  // processing job. Stale processing recovery is owned exclusively by the
  // Railway media sync worker before it claims the next pending job.
  const insertRecord = {
    workspace_id: workspaceId,
    advertiser_id: advertiserId,
    report_id: report.id,
    connection_id: connection.id,

    provider:
      connection.provider satisfies MediaProvider,
    external_account_id:
      connection.external_account_id,

    date_from: dateFrom,
    date_to: dateTo,

    data_level:
      input.dataLevel satisfies MediaSyncDataLevel,
    mode:
      MEDIA_SYNC_JOB_MODE satisfies MediaSyncMode,

    status:
      MEDIA_SYNC_JOB_PENDING_STATUS satisfies MediaSyncJobStatus,

    previous_ingestion_id:
      report.current_ingestion_id,

    created_by: createdBy,
  };

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .insert(insertRecord)
    .select("*")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new MediaSyncJobsRepositoryError(
        "ACTIVE_JOB_ALREADY_EXISTS",
        "An active media sync job already exists for this report.",
        { cause: error },
      );
    }

    throw wrapDatabaseError(
      "Pending media sync job could not be created.",
      error,
    );
  }

  const record =
    parseMediaSyncJobRecord(data);

  if (
    record.report_id !== reportId ||
    record.connection_id !==
      connectionId ||
    record.workspace_id !==
      workspaceId ||
    record.advertiser_id !==
      advertiserId ||
    record.provider !==
      connection.provider ||
    record.external_account_id !==
      connection.external_account_id ||
    record.created_by !== createdBy
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Created media sync job does not match the requested scope.",
    );
  }

  if (
    record.status !==
      MEDIA_SYNC_JOB_PENDING_STATUS ||
    record.mode !== MEDIA_SYNC_JOB_MODE ||
    record.progress !== 0 ||
    record.raw_rows !== 0 ||
    record.normalized_rows !== 0 ||
    record.inserted_rows !== 0 ||
    record.failed_rows !== 0 ||
    record.attempt_count !== 0 ||
    record.snapshot_ingestion_id !==
      null ||
    record.started_at !== null ||
    record.finished_at !== null ||
    record.error !== null ||
    record.error_detail !== null
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Created media sync job contains unexpected initial values.",
    );
  }

  if (
    record.previous_ingestion_id !==
    report.current_ingestion_id
  ) {
    throw new MediaSyncJobsRepositoryError(
      "INVALID_RECORD",
      "Created media sync job does not preserve the report current ingestion reference.",
    );
  }

  return toSafeMediaSyncJob(record);
}

export async function listRecentMediaSyncJobsForReport(
  input: ListRecentMediaSyncJobsForReportInput,
): Promise<SafeMediaSyncJob[]> {
  const reportId = normalizeRequiredString(
    input.reportId,
    "reportId",
    200,
  );

  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );

  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );

  const parsedLimit = Number(input.limit ?? 5);
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 20)
      : 5;

  await requireScopedReport({
    reportId,
    workspaceId,
    advertiserId,
  });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("*")
    .eq("report_id", reportId)
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw wrapDatabaseError(
      "Recent media sync jobs could not be loaded.",
      error,
    );
  }

  return (data ?? []).map((record) =>
    toSafeMediaSyncJob(
      parseMediaSyncJobRecord(record),
    ),
  );
}

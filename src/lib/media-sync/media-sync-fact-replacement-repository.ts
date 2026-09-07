import { getSupabaseAdmin } from "../supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import type {
  MediaSyncJobRecord,
} from "./types";

const REPLACE_NAVER_FACT_DATE_RPC =
  "replace_naver_searchads_fact_date";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const SNAPSHOT_REPLACE_MODE =
  "snapshot_replace" as const;

const PROCESSING_STATUS =
  "processing" as const;

const TRANSIENT_MAX_ATTEMPTS =
  3;

const TRANSIENT_RETRY_DELAY_MS =
  500;

const POSTGRES_STATEMENT_TIMEOUT_CODE =
  "57014" as const;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

export type NaverFactReplacementErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "MODE_MISMATCH"
  | "INVALID_JOB_STATE"
  | "DATE_SCOPE_MISMATCH"
  | "SCOPE_MISMATCH"
  | "CHECKPOINT_NOT_COMPLETED"
  | "RECONCILIATION_NOT_COMPLETED"
  | "RECONCILIATION_INVALID"
  | "RECONCILIATION_CONFLICT"
  | "STAGING_CHANGED"
  | "DATE_STAGING_INVALID"
  | "STALE_JOB"
  | "INSERT_COUNT_MISMATCH"
  | "POSTCHECK_FAILED"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class NaverFactReplacementError
  extends Error {
  readonly code:
    NaverFactReplacementErrorCode;

  constructor(
    code:
      NaverFactReplacementErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name =
      "NaverFactReplacementError";
    this.code = code;
  }
}

export type NaverFactReplacementDependencies = {
  invokeRpc?: (
    functionName: string,
    args: {
      p_payload:
        Record<string, unknown>;
    },
  ) => Promise<{
    data: unknown;
    error: unknown;
  }>;

  wait?: (
    delayMs: number,
  ) => Promise<void>;
};

export type ReplaceNaverFactDateInput = {
  job: MediaSyncJobRecord;
  date: string;
  dependencies?:
    NaverFactReplacementDependencies;
};

export type NaverFactReplacementResult = {
  job: MediaSyncJobRecord;
  scopeDate: string;
  sourceRows: number;
  deletedRows: number;
  insertedRows: number;
  factRows: number;
};

type UnknownRecord =
  Record<string, unknown>;

type FactReplacementRpcRecord = {
  job: unknown;
  scope_date: unknown;
  source_rows: unknown;
  deleted_rows: unknown;
  inserted_rows: unknown;
  fact_rows: unknown;
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

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new NaverFactReplacementError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function normalizeDate(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !DATE_PATTERN.test(value)
  ) {
    throw new NaverFactReplacementError(
      "INVALID_INPUT",
      `${fieldName} must be YYYY-MM-DD.`,
    );
  }

  const [
    yearText,
    monthText,
    dayText,
  ] = value.split("-");

  const year =
    Number(yearText);
  const month =
    Number(monthText);
  const day =
    Number(dayText);

  const utcMs =
    Date.UTC(
      year,
      month - 1,
      day,
    );

  const date =
    new Date(utcMs);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new NaverFactReplacementError(
      "INVALID_INPUT",
      `${fieldName} is not a valid calendar date.`,
    );
  }

  return value;
}

function validateJob(
  job: MediaSyncJobRecord,
): void {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new NaverFactReplacementError(
      "INVALID_INPUT",
      "A media sync job is required.",
    );
  }

  if (job.provider !== NAVER_PROVIDER) {
    throw new NaverFactReplacementError(
      "UNSUPPORTED_PROVIDER",
      "Fact replacement supports only Naver Search Ads.",
    );
  }

  if (job.mode !== SNAPSHOT_REPLACE_MODE) {
    throw new NaverFactReplacementError(
      "MODE_MISMATCH",
      "The Naver fact replacement job must remain snapshot_replace.",
    );
  }

  if (job.status !== PROCESSING_STATUS) {
    throw new NaverFactReplacementError(
      "JOB_NOT_PROCESSING",
      "The Naver fact replacement job must remain processing.",
    );
  }

  if (
    job.snapshot_ingestion_id !== null ||
    job.finished_at !== null ||
    job.failed_rows !== 0
  ) {
    throw new NaverFactReplacementError(
      "INVALID_JOB_STATE",
      "The Naver fact replacement boundary has already passed.",
    );
  }

  normalizeDate(
    job.date_from,
    "job.date_from",
  );

  normalizeDate(
    job.date_to,
    "job.date_to",
  );

  if (job.date_to < job.date_from) {
    throw new NaverFactReplacementError(
      "INVALID_JOB",
      "The Naver fact replacement job date window is invalid.",
    );
  }
}

function validateScopeDate(
  job: MediaSyncJobRecord,
  value: unknown,
): string {
  const date =
    normalizeDate(
      value,
      "date",
    );

  if (
    date < job.date_from ||
    date > job.date_to
  ) {
    throw new NaverFactReplacementError(
      "DATE_SCOPE_MISMATCH",
      "The Naver fact replacement date is outside the job window.",
    );
  }

  return date;
}

function mapRpcError(
  error: unknown,
): NaverFactReplacementError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("MSFR_INVALID_INPUT")) {
    return new NaverFactReplacementError(
      "INVALID_INPUT",
      "The Naver fact replacement input is invalid.",
      { cause: error },
    );
  }

  if (
    message.includes("MSFR_JOB_NOT_FOUND") ||
    message.includes("MSFR_CONNECTION_NOT_FOUND")
  ) {
    return new NaverFactReplacementError(
      "INVALID_JOB",
      "The Naver fact replacement scope could not be loaded.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_JOB_NOT_PROCESSING")) {
    return new NaverFactReplacementError(
      "JOB_NOT_PROCESSING",
      "The Naver fact replacement job is not processing.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_UNSUPPORTED_PROVIDER")) {
    return new NaverFactReplacementError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported for fact replacement.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_MODE_MISMATCH")) {
    return new NaverFactReplacementError(
      "MODE_MISMATCH",
      "The media sync mode is not eligible for fact replacement.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_INVALID_JOB_STATE")) {
    return new NaverFactReplacementError(
      "INVALID_JOB_STATE",
      "The Naver fact replacement boundary has already passed.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_DATE_SCOPE_MISMATCH")) {
    return new NaverFactReplacementError(
      "DATE_SCOPE_MISMATCH",
      "The fact replacement date is outside the job window.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_SCOPE_MISMATCH")) {
    return new NaverFactReplacementError(
      "SCOPE_MISMATCH",
      "The active connection does not match the Naver fact replacement job.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_CHECKPOINT_NOT_COMPLETED")) {
    return new NaverFactReplacementError(
      "CHECKPOINT_NOT_COMPLETED",
      "The Naver staging checkpoint is not complete.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_RECONCILIATION_NOT_COMPLETED")) {
    return new NaverFactReplacementError(
      "RECONCILIATION_NOT_COMPLETED",
      "The Naver cross-grain reconciliation authority is missing.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_RECONCILIATION_INVALID")) {
    return new NaverFactReplacementError(
      "RECONCILIATION_INVALID",
      "The Naver reconciliation counts are invalid.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_RECONCILIATION_CONFLICT")) {
    return new NaverFactReplacementError(
      "RECONCILIATION_CONFLICT",
      "The reconciled Naver staging authority changed.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_STAGING_CHANGED")) {
    return new NaverFactReplacementError(
      "STAGING_CHANGED",
      "The reconciled Naver staging boundary changed.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_DATE_STAGING_INVALID")) {
    return new NaverFactReplacementError(
      "DATE_STAGING_INVALID",
      "The Naver date staging partition failed canonical validation.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_STALE_JOB")) {
    return new NaverFactReplacementError(
      "STALE_JOB",
      "A newer job already owns the canonical Naver date.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_INSERT_COUNT_MISMATCH")) {
    return new NaverFactReplacementError(
      "INSERT_COUNT_MISMATCH",
      "The inserted Naver fact count does not match the authoritative date rows.",
      { cause: error },
    );
  }

  if (message.includes("MSFR_POSTCHECK_FAILED")) {
    return new NaverFactReplacementError(
      "POSTCHECK_FAILED",
      "The canonical Naver fact count failed the postcheck.",
      { cause: error },
    );
  }

  return new NaverFactReplacementError(
    "DATABASE_ERROR",
    "The Naver fact replacement RPC failed.",
    { cause: error },
  );
}

function readTransientFailure(
  error: unknown,
): {
  code: string;
  message: string;
} {
  const record =
    error !== null &&
    typeof error === "object"
      ? error as Record<string, unknown>
      : null;

  const code =
    record &&
    typeof record.code === "string"
      ? record.code
      : "";

  const message = [
    error instanceof Error
      ? error.message
      : "",
    record &&
    typeof record.message === "string"
      ? record.message
      : "",
    record &&
    typeof record.details === "string"
      ? record.details
      : "",
    record &&
    typeof record.hint === "string"
      ? record.hint
      : "",
  ]
    .join(" ")
    .toLowerCase();

  return {
    code,
    message,
  };
}

function isRetryableFailure(
  error: unknown,
): boolean {
  const {
    code,
    message,
  } =
    readTransientFailure(
      error,
    );

  return (
    (
      code ===
        POSTGRES_STATEMENT_TIMEOUT_CODE &&
      message.includes(
        "statement timeout",
      )
    ) ||
    message.includes(
      "upstream request timeout",
    )
  );
}

async function waitForRetry(
  dependencies:
    NaverFactReplacementDependencies |
    undefined,
): Promise<void> {
  if (dependencies?.wait) {
    await dependencies.wait(
      TRANSIENT_RETRY_DELAY_MS,
    );

    return;
  }

  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        TRANSIENT_RETRY_DELAY_MS,
      );
    },
  );
}

async function callRpcWithTransientRetry(
  payload:
    Record<string, unknown>,
  dependencies?:
    NaverFactReplacementDependencies,
): Promise<unknown> {
  for (
    let attempt = 0;
    attempt < TRANSIENT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    let result: {
      data: unknown;
      error: unknown;
    };

    try {
      if (dependencies?.invokeRpc) {
        result =
          await dependencies.invokeRpc(
            REPLACE_NAVER_FACT_DATE_RPC,
            {
              p_payload:
                payload,
            },
          );
      } else {
        const supabase =
          getSupabaseAdmin();

        result =
          await supabase.rpc(
            REPLACE_NAVER_FACT_DATE_RPC,
            {
              p_payload:
                payload,
            },
          );
      }
    } catch (error) {
      if (
        attempt <
          TRANSIENT_MAX_ATTEMPTS - 1 &&
        isRetryableFailure(error)
      ) {
        await waitForRetry(
          dependencies,
        );

        continue;
      }

      throw new NaverFactReplacementError(
        "DATABASE_ERROR",
        "The Naver fact replacement repository could not access the database.",
        { cause: error },
      );
    }

    if (result.error) {
      if (
        attempt <
          TRANSIENT_MAX_ATTEMPTS - 1 &&
        isRetryableFailure(
          result.error,
        )
      ) {
        await waitForRetry(
          dependencies,
        );

        continue;
      }

      throw mapRpcError(
        result.error,
      );
    }

    return result.data;
  }

  throw new NaverFactReplacementError(
    "DATABASE_ERROR",
    "The Naver fact replacement transient retry loop terminated unexpectedly.",
  );
}

function parseRpcResult(
  value: unknown,
  input: ReplaceNaverFactDateInput,
  requestedDate: string,
): NaverFactReplacementResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new NaverFactReplacementError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact replacement RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as FactReplacementRpcRecord;

  let returnedJob:
    MediaSyncJobRecord;

  try {
    returnedJob =
      parseMediaSyncJobRecord(
        record.job,
      );
  } catch (error) {
    throw new NaverFactReplacementError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact replacement RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

  const scopeDate =
    normalizeDate(
      record.scope_date,
      "scope_date",
    );

  const sourceRows =
    normalizeNonNegativeInteger(
      record.source_rows,
      "source_rows",
    );

  const deletedRows =
    normalizeNonNegativeInteger(
      record.deleted_rows,
      "deleted_rows",
    );

  const insertedRows =
    normalizeNonNegativeInteger(
      record.inserted_rows,
      "inserted_rows",
    );

  const factRows =
    normalizeNonNegativeInteger(
      record.fact_rows,
      "fact_rows",
    );

  if (
    returnedJob.id !== input.job.id ||
    returnedJob.report_id !== input.job.report_id ||
    returnedJob.workspace_id !== input.job.workspace_id ||
    returnedJob.advertiser_id !== input.job.advertiser_id ||
    returnedJob.connection_id !== input.job.connection_id ||
    returnedJob.provider !== input.job.provider ||
    returnedJob.external_account_id !== input.job.external_account_id ||
    returnedJob.date_from !== input.job.date_from ||
    returnedJob.date_to !== input.job.date_to ||
    returnedJob.mode !== input.job.mode ||
    returnedJob.status !== PROCESSING_STATUS ||
    returnedJob.snapshot_ingestion_id !== null ||
    returnedJob.finished_at !== null ||
    returnedJob.failed_rows !== 0 ||
    returnedJob.raw_rows !== input.job.raw_rows ||
    returnedJob.normalized_rows !== input.job.normalized_rows ||
    returnedJob.inserted_rows !== input.job.inserted_rows ||
    scopeDate !== requestedDate ||
    insertedRows !== sourceRows ||
    factRows !== sourceRows
  ) {
    throw new NaverFactReplacementError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact replacement result violates the repository contract.",
    );
  }

  return {
    job:
      returnedJob,
    scopeDate,
    sourceRows,
    deletedRows,
    insertedRows,
    factRows,
  };
}

export async function replaceNaverFactDate(
  input: ReplaceNaverFactDateInput,
): Promise<NaverFactReplacementResult> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverFactReplacementError(
      "INVALID_INPUT",
      "Naver fact replacement input is required.",
    );
  }

  validateJob(
    input.job,
  );

  const date =
    validateScopeDate(
      input.job,
      input.date,
    );

  const payload = {
    job_id:
      input.job.id,
    date,
  };

  const data =
    await callRpcWithTransientRetry(
      payload,
      input.dependencies,
    );

  return parseRpcResult(
    data,
    input,
    date,
  );
}

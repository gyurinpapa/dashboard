import { getSupabaseAdmin } from "../supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import type {
  MediaSyncJobRecord,
} from "./types";

const COMPLETE_NAVER_FACT_ONLY_JOB_RPC =
  "complete_naver_searchads_fact_only_job";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const SNAPSHOT_REPLACE_MODE =
  "snapshot_replace" as const;

const PROCESSING_STATUS=
  "processing" as const;

const DONE_STATUS =
  "done" as const;

const TRANSIENT_MAX_ATTEMPTS =
  3;

const TRANSIENT_RETRY_DELAY_MS =
  500;

const POSTGRES_STATEMENT_TIMEOUT_CODE =
  "57014" as const;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

export type NaverFactOnlyCompletionErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SNAPSHOT_EXISTS"
  | "DATE_WINDOW_INVALID"
  | "JOB_COUNT_CONFLICT"
  | "PARTITION_AUTHORITY_CONFLICT"
  | "FACT_AUTHORITY_CONFLICT"
  | "COMPLETION_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class NaverFactOnlyCompletionError
  extends Error {
  readonly code:
    NaverFactOnlyCompletionErrorCode;

  constructor(
    code:
      NaverFactOnlyCompletionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name =
      "NaverFactOnlyCompletionError";
    this.code = code;
  }
}

export type NaverFactOnlyCompletionDependencies = {
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

export type CompleteNaverFactOnlyJobInput = {
  job: MediaSyncJobRecord;
  dependencies?:
    NaverFactOnlyCompletionDependencies;
};

export type NaverFactOnlyCompletionResult = {
  job: MediaSyncJobRecord;
  coveredDates: number;
  partitionRows: number;
  factRows: number;
  idempotent: boolean;
};

type UnknownRecord =
  Record<string, unknown>;

type FactOnlyCompletionRpcRecord = {
  job: unknown;
  covered_dates: unknown;
  partition_rows: unknown;
  fact_rows: unknown;
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

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function parseDateToUtcMs(
  value: string,
): number | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
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
    return null;
  }

  return utcMs;
}

function getExpectedDateCount(
  job: MediaSyncJobRecord,
): number {
  const fromMs =
    parseDateToUtcMs(job.date_from);
  const toMs =
    parseDateToUtcMs(job.date_to);

  if (
    fromMs === null ||
    toMs === null ||
    toMs < fromMs
  ) {
    throw new NaverFactOnlyCompletionError(
      "DATE_WINDOW_INVALID",
      "The Naver fact-only completion job date window is invalid.",
    );
  }

  const days =
    Math.floor(
      (toMs - fromMs) /
        86_400_000,
    ) + 1;

  if (
    !Number.isSafeInteger(days) ||
    days <= 0
  ) {
    throw new NaverFactOnlyCompletionError(
      "DATE_WINDOW_INVALID",
      "The Naver fact-only completion date count is invalid.",
    );
  }

  return days;
}

function validateJob(
  job: MediaSyncJobRecord,
): void {
  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_INPUT",
      "A media sync job is required.",
    );
  }

  if (job.provider !== NAVER_PROVIDER) {
    throw new NaverFactOnlyCompletionError(
      "UNSUPPORTED_PROVIDER",
      "Fact-only completion supports only Naver Search Ads.",
    );
  }

  if (job.mode !== SNAPSHOT_REPLACE_MODE) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_JOB",
      "The Naver fact-only completion job must remain snapshot_replace.",
    );
  }

  if (
    job.status !== PROCESSING_STATUS&&
    job.status !== DONE_STATUS
  ) {
    throw new NaverFactOnlyCompletionError(
      "JOB_NOT_PROCESSING",
      "The Naver fact-only completion job must be processing or exactly done.",
    );
  }

  if (job.snapshot_ingestion_id !== null) {
    throw new NaverFactOnlyCompletionError(
      "SNAPSHOT_EXISTS",
      "A snapshot-backed job cannot use fact-only completion.",
    );
  }

  if (job.failed_rows !== 0) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_JOB",
      "The Naver fact-only completion job contains failed rows.",
    );
  }

  if (
    job.raw_rows !== job.inserted_rows ||
    job.normalized_rows !==
      job.inserted_rows
  ) {
    throw new NaverFactOnlyCompletionError(
      "JOB_COUNT_CONFLICT",
      "The reconciled Naver job row counts do not match.",
    );
  }

  if (
    job.status === PROCESSING_STATUS&&
    job.finished_at !== null
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_JOB",
      "A processing fact-only job must not already be finished.",
    );
  }

  if (
    job.status === DONE_STATUS &&
    (
      job.progress !== 100 ||
      job.finished_at === null ||
      job.error !== null
    )
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_JOB",
      "A completed fact-only job has an invalid terminal state.",
    );
  }

  getExpectedDateCount(job);
}

function mapRpcError(
  error: unknown,
): NaverFactOnlyCompletionError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (message.includes("MSFC_INVALID_INPUT")) {
    return new NaverFactOnlyCompletionError(
      "INVALID_INPUT",
      "The Naver fact-only completion input is invalid.",
      { cause: error },
    );
  }

  if (message.includes("MSFC_JOB_NOT_FOUND")) {
    return new NaverFactOnlyCompletionError(
      "INVALID_JOB",
      "The Naver fact-only completion job could not be loaded.",
      { cause: error },
    );
  }

  if (message.includes("MSFC_UNSUPPORTED_JOB")) {
    return new NaverFactOnlyCompletionError(
      "UNSUPPORTED_PROVIDER",
      "The media sync job is not eligible for Naver fact-only completion.",
      { cause: error },
    );
  }

  if (message.includes("MSFC_SNAPSHOT_EXISTS")) {
    return new NaverFactOnlyCompletionError(
      "SNAPSHOT_EXISTS",
      "The media sync job already owns a snapshot.",
      { cause: error },
    );
  }

  if (
    message.includes("MSFC_JOB_NOT_PROCESSING") ||
    message.includes("MSFC_INVALID_JOB_STATE")
  ) {
    return new NaverFactOnlyCompletionError(
      "JOB_NOT_PROCESSING",
      "The media sync job is not eligible for fact-only completion.",
      { cause: error },
    );
  }

  if (message.includes("MSFC_DATE_WINDOW_INVALID")) {
    return new NaverFactOnlyCompletionError(
      "DATE_WINDOW_INVALID",
      "The media sync job date window is invalid.",
      { cause: error },
    );
  }

  if (message.includes("MSFC_JOB_COUNT_CONFLICT")) {
    return new NaverFactOnlyCompletionError(
      "JOB_COUNT_CONFLICT",
      "The reconciled media sync job counts changed.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSFC_PARTITION_AUTHORITY_CONFLICT",
    )
  ) {
    return new NaverFactOnlyCompletionError(
      "PARTITION_AUTHORITY_CONFLICT",
      "The canonical fact partition authority is incomplete or stale.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSFC_FACT_AUTHORITY_CONFLICT",
    )
  ) {
    return new NaverFactOnlyCompletionError(
      "FACT_AUTHORITY_CONFLICT",
      "The canonical facts do not match the completed chunk.",
      { cause: error },
    );
  }

  if (
    message.includes("MSFC_COMPLETION_CONFLICT") ||
    message.includes("MSFC_POSTCONDITION_FAILED")
  ) {
    return new NaverFactOnlyCompletionError(
      "COMPLETION_CONFLICT",
      "The fact-only completion state changed or violated its postcondition.",
      { cause: error },
    );
  }

  return new NaverFactOnlyCompletionError(
    "DATABASE_ERROR",
    "The Naver fact-only completion RPC failed.",
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
    readTransientFailure(error);

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
    NaverFactOnlyCompletionDependencies |
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
    NaverFactOnlyCompletionDependencies,
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
            COMPLETE_NAVER_FACT_ONLY_JOB_RPC,
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
            COMPLETE_NAVER_FACT_ONLY_JOB_RPC,
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

      throw new NaverFactOnlyCompletionError(
        "DATABASE_ERROR",
        "The Naver fact-only completion repository could not access the database.",
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

  throw new NaverFactOnlyCompletionError(
    "DATABASE_ERROR",
    "The Naver fact-only completion transient retry loop terminated unexpectedly.",
  );
}

function parseRpcResult(
  value: unknown,
  input: CompleteNaverFactOnlyJobInput,
): NaverFactOnlyCompletionResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isPlainObject(value[0])
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact-only completion RPC returned an invalid result.",
    );
  }

  const record =
    value[0] as FactOnlyCompletionRpcRecord;

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        record.job,
      );
  } catch (error) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact-only completion RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

  const coveredDates =
    normalizeNonNegativeInteger(
      record.covered_dates,
      "covered_dates",
    );

  const partitionRows =
    normalizeNonNegativeInteger(
      record.partition_rows,
      "partition_rows",
    );

  const factRows =
    normalizeNonNegativeInteger(
      record.fact_rows,
      "fact_rows",
    );

  if (typeof record.idempotent !== "boolean") {
    throw new NaverFactOnlyCompletionError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact-only completion RPC returned an invalid idempotent flag.",
    );
  }

  const expectedDates =
    getExpectedDateCount(
      input.job,
    );

  if (
    updatedJob.id !== input.job.id ||
    updatedJob.report_id !==
      input.job.report_id ||
    updatedJob.workspace_id !==
      input.job.workspace_id ||
    updatedJob.advertiser_id !==
      input.job.advertiser_id ||
    updatedJob.connection_id !==
      input.job.connection_id ||
    updatedJob.provider !==
      input.job.provider ||
    updatedJob.external_account_id !==
      input.job.external_account_id ||
    updatedJob.date_from !==
      input.job.date_from ||
    updatedJob.date_to !==
      input.job.date_to ||
    updatedJob.mode !== input.job.mode ||
    updatedJob.status !== DONE_STATUS ||
    updatedJob.progress !== 100 ||
    updatedJob.finished_at === null ||
    updatedJob.snapshot_ingestion_id !==
      null ||
    updatedJob.failed_rows !== 0 ||
    updatedJob.error !== null ||
    updatedJob.previous_ingestion_id !==
      input.job.previous_ingestion_id ||
    updatedJob.raw_rows !==
      input.job.raw_rows ||
    updatedJob.normalized_rows !==
      input.job.normalized_rows ||
    updatedJob.inserted_rows !==
      input.job.inserted_rows ||
    coveredDates !== expectedDates ||
    partitionRows !==
      input.job.inserted_rows ||
    factRows !==
      input.job.inserted_rows
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact-only completion result violates the repository contract.",
    );
  }

  if (
    input.job.status === DONE_STATUS &&
    record.idempotent !== true
  ) {
    throw new NaverFactOnlyCompletionError(
      "INVALID_DATABASE_RESULT",
      "The Naver fact-only completion retry was not reported as idempotent.",
    );
  }

  return {
    job:
      updatedJob,
    coveredDates,
    partitionRows,
    factRows,
    idempotent:
      record.idempotent,
  };
}

export async function completeNaverFactOnlyJob(
  input: CompleteNaverFactOnlyJobInput,
): Promise<NaverFactOnlyCompletionResult> {
  if (!input || typeof input !== "object") {
    throw new NaverFactOnlyCompletionError(
      "INVALID_INPUT",
      "Naver fact-only completion input is required.",
    );
  }

  validateJob(
    input.job,
  );

  const payload = {
    job_id:
      input.job.id,
  };

  const data =
    await callRpcWithTransientRetry(
      payload,
      input.dependencies,
    );

  return parseRpcResult(
    data,
    input,
  );
}

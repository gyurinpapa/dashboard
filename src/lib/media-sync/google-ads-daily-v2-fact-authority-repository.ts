import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";

import type {
  MediaSyncJobRecord,
} from "./types";

const REPLACE_GOOGLE_ADS_DAILY_V2_FACT_DATE_RPC =
  "replace_google_ads_daily_v2_fact_date" as const;

const COMPLETE_GOOGLE_ADS_DAILY_V2_FACT_ONLY_JOB_RPC =
  "complete_google_ads_daily_v2_fact_only_job" as const;

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const DAILY_REPORT_V2_AUTOMATION_CONTRACT =
  "daily_report_v2" as const;

const SNAPSHOT_REPLACE_MODE =
  "snapshot_replace" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DONE_STATUS =
  "done" as const;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const TRANSIENT_MAX_ATTEMPTS =
  3;

const TRANSIENT_RETRY_DELAY_MS =
  500;

const POSTGRES_STATEMENT_TIMEOUT_CODE =
  "57014" as const;

type UnknownRecord =
  Record<string, unknown>;

export type GoogleAdsDailyV2FactAuthorityJobRecord =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract:
      typeof GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT;

    automation_contract:
      typeof DAILY_REPORT_V2_AUTOMATION_CONTRACT;
  }>;

export type GoogleAdsDailyV2FactAuthorityErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "JOB_NOT_COMPLETABLE"
  | "UNSUPPORTED_PROVIDER"
  | "EXECUTION_CONTRACT_MISMATCH"
  | "AUTOMATION_CONTRACT_MISMATCH"
  | "MODE_MISMATCH"
  | "DATE_SCOPE_MISMATCH"
  | "INVALID_JOB_STATE"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class GoogleAdsDailyV2FactAuthorityError
  extends Error {
  readonly code:
    GoogleAdsDailyV2FactAuthorityErrorCode;

  constructor(
    code:
      GoogleAdsDailyV2FactAuthorityErrorCode,
    message:
      string,
    options?:
      ErrorOptions,
  ) {
    super(
      message,
      {
        cause:
          options?.cause,
      },
    );

    this.name =
      "GoogleAdsDailyV2FactAuthorityError";

    this.code =
      code;
  }
}

export type GoogleAdsDailyV2FactAuthorityRpcResult =
  Readonly<{
    data:
      unknown;

    error:
      unknown;
  }>;

export type GoogleAdsDailyV2FactAuthorityRpcInvoker =
  (
    functionName:
      | typeof REPLACE_GOOGLE_ADS_DAILY_V2_FACT_DATE_RPC
      | typeof COMPLETE_GOOGLE_ADS_DAILY_V2_FACT_ONLY_JOB_RPC,

    args:
      Readonly<{
        p_payload:
          Readonly<
            Record<string, unknown>
          >;
      }>,
  ) => Promise<
    GoogleAdsDailyV2FactAuthorityRpcResult
  >;

export type GoogleAdsDailyV2FactAuthorityWait =
  (
    delayMs:
      number,
  ) => Promise<void>;

export type GoogleAdsDailyV2FactAuthorityDependencies =
  Readonly<{
    invokeRpc?:
      GoogleAdsDailyV2FactAuthorityRpcInvoker;

    wait?:
      GoogleAdsDailyV2FactAuthorityWait;
  }>;

export type ReplaceGoogleAdsDailyV2FactDateInput =
  Readonly<{
    job:
      MediaSyncJobRecord;

    date:
      string;
  }>;

export type GoogleAdsDailyV2FactReplacementResult =
  Readonly<{
    job:
      GoogleAdsDailyV2FactAuthorityJobRecord;

    scopeDate:
      string;

    sourceRows:
      number;

    deletedRows:
      number;

    insertedRows:
      number;

    factRows:
      number;
  }>;

export type CompleteGoogleAdsDailyV2FactOnlyJobInput =
  Readonly<{
    job:
      MediaSyncJobRecord;
  }>;

export type GoogleAdsDailyV2FactOnlyCompletionResult =
  Readonly<{
    job:
      GoogleAdsDailyV2FactAuthorityJobRecord;

    coveredDates:
      number;

    partitionRows:
      number;

    factRows:
      number;

    idempotent:
      boolean;
  }>;

function isPlainObject(
  value:
    unknown,
): value is UnknownRecord {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function isValidYmd(
  value:
    string,
): boolean {
  if (
    !DATE_PATTERN.test(
      value,
    )
  ) {
    return false;
  }

  const [
    yearText,
    monthText,
    dayText,
  ] =
    value.split("-");

  const year =
    Number(
      yearText,
    );

  const month =
    Number(
      monthText,
    );

  const day =
    Number(
      dayText,
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  );
}

function requireNonNegativeInteger(
  value:
    unknown,
  fieldName:
    string,
): number {
  const normalized =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string"
        ? Number(
            value,
          )
        : Number.NaN;

  if (
    !Number.isSafeInteger(
      normalized,
    ) ||
    normalized <
      0
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return normalized;
}

function requireBoolean(
  value:
    unknown,
  fieldName:
    string,
): boolean {
  if (
    typeof value !==
      "boolean"
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be boolean.`,
    );
  }

  return value;
}

function assertExactDayJobScope(
  job:
    MediaSyncJobRecord,
): void {
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
    job.date_from !==
      job.date_to
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "DATE_SCOPE_MISMATCH",
      "Google Daily Report V2 fact authority requires one exact calendar date.",
    );
  }
}

function readExecutionContract(
  job:
    MediaSyncJobRecord,
): unknown {
  return (
    job as
      MediaSyncJobRecord &
      Readonly<{
        execution_contract?:
          unknown;
      }>
  ).execution_contract;
}

function readAutomationContract(
  job:
    MediaSyncJobRecord,
): unknown {
  return (
    job as
      MediaSyncJobRecord &
      Readonly<{
        automation_contract?:
          unknown;
      }>
  ).automation_contract;
}

function validateCommonJobAuthority(
  job:
    MediaSyncJobRecord,
): void {
  if (
    !job ||
    typeof job !==
      "object"
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_JOB",
      "A Google Ads Daily Report V2 job is required.",
    );
  }

  if (
    job.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads jobs may use the Google Daily Report V2 fact authority.",
    );
  }

  if (
    readExecutionContract(
      job,
    ) !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "EXECUTION_CONTRACT_MISMATCH",
      "The Google Ads job must use google_all_data_v1.",
    );
  }

  if (
    readAutomationContract(
      job,
    ) !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "AUTOMATION_CONTRACT_MISMATCH",
      "The Google Ads job must use daily_report_v2 automation authority.",
    );
  }

  if (
    job.mode !==
      SNAPSHOT_REPLACE_MODE
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "MODE_MISMATCH",
      "The Google Ads job must use snapshot_replace.",
    );
  }

  assertExactDayJobScope(
    job,
  );

  if (
    job.snapshot_ingestion_id !==
      null ||
    job.failed_rows !==
      0
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_JOB_STATE",
      "The Google Ads Daily Report V2 job is outside the fact-only boundary.",
    );
  }
}

function validateReplacementJob(
  job:
    MediaSyncJobRecord,
): void {
  validateCommonJobAuthority(
    job,
  );

  if (
    job.status !==
      PROCESSING_STATUS ||
    job.finished_at !==
      null
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "JOB_NOT_PROCESSING",
      "Google Daily Report V2 fact replacement requires a processing job.",
    );
  }
}

function validateCompletionJob(
  job:
    MediaSyncJobRecord,
): void {
  validateCommonJobAuthority(
    job,
  );

  if (
    job.status !==
      PROCESSING_STATUS &&
    job.status !==
      DONE_STATUS
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "JOB_NOT_COMPLETABLE",
      "Google Daily Report V2 fact-only completion requires a processing or done job.",
    );
  }

  if (
    job.status ===
      PROCESSING_STATUS &&
    job.finished_at !==
      null
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_JOB_STATE",
      "A processing Google Daily Report V2 job cannot already be finished.",
    );
  }

  if (
    job.status ===
      DONE_STATUS &&
    (
      job.progress !==
        100 ||
      job.finished_at ===
        null ||
      job.error !==
        null
    )
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_JOB_STATE",
      "An already-done Google Daily Report V2 job violates the idempotent completion contract.",
    );
  }
}

function assertSameJobScope(
  before:
    MediaSyncJobRecord,
  after:
    GoogleAdsDailyV2FactAuthorityJobRecord,
): void {
  if (
    after.id !==
      before.id ||
    after.report_id !==
      before.report_id ||
    after.workspace_id !==
      before.workspace_id ||
    after.advertiser_id !==
      before.advertiser_id ||
    after.connection_id !==
      before.connection_id ||
    after.provider !==
      before.provider ||
    after.external_account_id !==
      before.external_account_id ||
    after.date_from !==
      before.date_from ||
    after.date_to !==
      before.date_to ||
    after.data_level !==
      before.data_level ||
    after.mode !==
      before.mode ||
    after.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT ||
    after.automation_contract !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 fact RPC returned a job with changed scope.",
    );
  }
}

function parseAuthorityJob(
  value:
    unknown,
): GoogleAdsDailyV2FactAuthorityJobRecord {
  if (
    !isPlainObject(
      value,
    ) ||
    value.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT ||
    value.automation_contract !==
      DAILY_REPORT_V2_AUTOMATION_CONTRACT
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 fact RPC returned an invalid routing authority.",
    );
  }

  let parsed:
    MediaSyncJobRecord;

  try {
    parsed =
      parseMediaSyncJobRecord(
        value,
      );
  } catch (error) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 fact RPC returned an invalid job.",
      {
        cause:
          error,
      },
    );
  }

  return {
    ...parsed,

    execution_contract:
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,

    automation_contract:
      DAILY_REPORT_V2_AUTOMATION_CONTRACT,
  };
}

function readRpcErrorText(
  error:
    unknown,
): string {
  if (
    !isPlainObject(
      error,
    )
  ) {
    return "";
  }

  return [
    error.code,
    error.postgres_code,
    error.message,
    error.details,
    error.hint,
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value ===
          "string",
    )
    .join(" ")
    .toLowerCase();
}

function isRetryableRpcFailure(
  error:
    unknown,
): boolean {
  const text =
    readRpcErrorText(
      error,
    );

  return (
    text.includes(
      POSTGRES_STATEMENT_TIMEOUT_CODE,
    ) &&
      text.includes(
        "statement timeout",
      )
  ) ||
    text.includes(
      "upstream request timeout",
    );
}

async function defaultWait(
  delayMs:
    number,
): Promise<void> {
  await new Promise<void>(
    resolve => {
      setTimeout(
        resolve,
        delayMs,
      );
    },
  );
}

async function defaultInvokeRpc(
  functionName:
    | typeof REPLACE_GOOGLE_ADS_DAILY_V2_FACT_DATE_RPC
    | typeof COMPLETE_GOOGLE_ADS_DAILY_V2_FACT_ONLY_JOB_RPC,

  args:
    Readonly<{
      p_payload:
        Readonly<
          Record<string, unknown>
        >;
    }>,
): Promise<
  GoogleAdsDailyV2FactAuthorityRpcResult
> {
  const {
    getSupabaseAdmin,
  } =
    await import(
      "../supabase/admin"
    );

  const supabase =
    getSupabaseAdmin();

  const result =
    await supabase.rpc(
      functionName,
      {
        p_payload:
          args.p_payload,
      },
    );

  return {
    data:
      result.data,

    error:
      result.error,
  };
}

async function invokeRpcWithTransientRetry(
  functionName:
    | typeof REPLACE_GOOGLE_ADS_DAILY_V2_FACT_DATE_RPC
    | typeof COMPLETE_GOOGLE_ADS_DAILY_V2_FACT_ONLY_JOB_RPC,

  payload:
    Readonly<
      Record<string, unknown>
    >,

  dependencies:
    GoogleAdsDailyV2FactAuthorityDependencies,
): Promise<unknown> {
  const invokeRpc =
    dependencies.invokeRpc ??
    defaultInvokeRpc;

  const wait =
    dependencies.wait ??
    defaultWait;

  for (
    let attempt =
      0;
    attempt <
      TRANSIENT_MAX_ATTEMPTS;
    attempt +=
      1
  ) {
    let result:
      GoogleAdsDailyV2FactAuthorityRpcResult;

    try {
      result =
        await invokeRpc(
          functionName,
          {
            p_payload:
              payload,
          },
        );
    } catch (error) {
      if (
        attempt <
          TRANSIENT_MAX_ATTEMPTS -
            1 &&
        isRetryableRpcFailure(
          error,
        )
      ) {
        await wait(
          TRANSIENT_RETRY_DELAY_MS,
        );

        continue;
      }

      throw new GoogleAdsDailyV2FactAuthorityError(
        "DATABASE_ERROR",
        "The Google Daily Report V2 fact RPC could not access the database.",
        {
          cause:
            error,
        },
      );
    }

    if (
      result.error
    ) {
      if (
        attempt <
          TRANSIENT_MAX_ATTEMPTS -
            1 &&
        isRetryableRpcFailure(
          result.error,
        )
      ) {
        await wait(
          TRANSIENT_RETRY_DELAY_MS,
        );

        continue;
      }

      throw new GoogleAdsDailyV2FactAuthorityError(
        "DATABASE_ERROR",
        "The Google Daily Report V2 fact RPC failed.",
        {
          cause:
            result.error,
        },
      );
    }

    return result.data;
  }

  throw new GoogleAdsDailyV2FactAuthorityError(
    "DATABASE_ERROR",
    "The Google Daily Report V2 fact RPC retry loop ended unexpectedly.",
  );
}

function parseReplacementResult(
  value:
    unknown,
  input:
    ReplaceGoogleAdsDailyV2FactDateInput,
): GoogleAdsDailyV2FactReplacementResult {
  if (
    !Array.isArray(
      value,
    ) ||
    value.length !==
      1 ||
    !isPlainObject(
      value[0],
    )
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 replacement RPC returned an invalid result.",
    );
  }

  const row =
    value[0];

  const returnedJob =
    parseAuthorityJob(
      row.job,
    );

  assertSameJobScope(
    input.job,
    returnedJob,
  );

  const scopeDate =
    typeof row.scope_date ===
      "string"
      ? row.scope_date
      : "";

  if (
    scopeDate !==
      input.date ||
    returnedJob.status !==
      PROCESSING_STATUS ||
    returnedJob.snapshot_ingestion_id !==
      null ||
    returnedJob.finished_at !==
      null ||
    returnedJob.failed_rows !==
      0
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 replacement result violates the processing contract.",
    );
  }

  const sourceRows =
    requireNonNegativeInteger(
      row.source_rows,
      "source_rows",
    );

  const deletedRows =
    requireNonNegativeInteger(
      row.deleted_rows,
      "deleted_rows",
    );

  const insertedRows =
    requireNonNegativeInteger(
      row.inserted_rows,
      "inserted_rows",
    );

  const factRows =
    requireNonNegativeInteger(
      row.fact_rows,
      "fact_rows",
    );

  if (
    sourceRows !==
      input.job.inserted_rows ||
    insertedRows !==
      sourceRows ||
    factRows !==
      sourceRows
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 replacement row counts are inconsistent.",
    );
  }

  return Object.freeze({
    job:
      returnedJob,

    scopeDate,

    sourceRows,

    deletedRows,

    insertedRows,

    factRows,
  });
}

function parseCompletionResult(
  value:
    unknown,
  input:
    CompleteGoogleAdsDailyV2FactOnlyJobInput,
): GoogleAdsDailyV2FactOnlyCompletionResult {
  if (
    !Array.isArray(
      value,
    ) ||
    value.length !==
      1 ||
    !isPlainObject(
      value[0],
    )
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 completion RPC returned an invalid result.",
    );
  }

  const row =
    value[0];

  const returnedJob =
    parseAuthorityJob(
      row.job,
    );

  assertSameJobScope(
    input.job,
    returnedJob,
  );

  const coveredDates =
    requireNonNegativeInteger(
      row.covered_dates,
      "covered_dates",
    );

  const partitionRows =
    requireNonNegativeInteger(
      row.partition_rows,
      "partition_rows",
    );

  const factRows =
    requireNonNegativeInteger(
      row.fact_rows,
      "fact_rows",
    );

  const idempotent =
    requireBoolean(
      row.idempotent,
      "idempotent",
    );

  if (
    coveredDates !==
      1 ||
    partitionRows !==
      returnedJob.inserted_rows ||
    factRows !==
      returnedJob.inserted_rows ||
    returnedJob.status !==
      DONE_STATUS ||
    returnedJob.progress !==
      100 ||
    returnedJob.finished_at ===
      null ||
    returnedJob.snapshot_ingestion_id !==
      null ||
    returnedJob.failed_rows !==
      0 ||
    returnedJob.error !==
      null
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_DATABASE_RESULT",
      "The Google Daily Report V2 fact-only completion result violates the durable completion contract.",
    );
  }

  return Object.freeze({
    job:
      returnedJob,

    coveredDates,

    partitionRows,

    factRows,

    idempotent,
  });
}

export async function replaceGoogleAdsDailyV2FactDate(
  input:
    ReplaceGoogleAdsDailyV2FactDateInput,
  dependencies:
    GoogleAdsDailyV2FactAuthorityDependencies = {},
): Promise<
  GoogleAdsDailyV2FactReplacementResult
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_INPUT",
      "Google Daily Report V2 fact replacement input is required.",
    );
  }

  validateReplacementJob(
    input.job,
  );

  if (
    typeof input.date !==
      "string" ||
    !isValidYmd(
      input.date,
    ) ||
    input.date !==
      input.job.date_from
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "DATE_SCOPE_MISMATCH",
      "The requested Google fact date must exactly match the one-day job.",
    );
  }

  const data =
    await invokeRpcWithTransientRetry(
      REPLACE_GOOGLE_ADS_DAILY_V2_FACT_DATE_RPC,
      {
        job_id:
          input.job.id,

        date:
          input.date,
      },
      dependencies,
    );

  return parseReplacementResult(
    data,
    input,
  );
}

export async function completeGoogleAdsDailyV2FactOnlyJob(
  input:
    CompleteGoogleAdsDailyV2FactOnlyJobInput,
  dependencies:
    GoogleAdsDailyV2FactAuthorityDependencies = {},
): Promise<
  GoogleAdsDailyV2FactOnlyCompletionResult
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsDailyV2FactAuthorityError(
      "INVALID_INPUT",
      "Google Daily Report V2 fact-only completion input is required.",
    );
  }

  validateCompletionJob(
    input.job,
  );

  const data =
    await invokeRpcWithTransientRetry(
      COMPLETE_GOOGLE_ADS_DAILY_V2_FACT_ONLY_JOB_RPC,
      {
        job_id:
          input.job.id,
      },
      dependencies,
    );

  return parseCompletionResult(
    data,
    input,
  );
}

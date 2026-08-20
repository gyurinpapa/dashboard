import type {
  GoogleAdsKeywordStagingOrchestratorResult,
} from "./google-ads-keyword-staging-orchestrator";
import type {
  JsonObject,
  JsonValue,
  MediaSyncJobRecord,
} from "./types";

const SAVE_GOOGLE_CHECKPOINT_RPC =
  "save_google_ads_keyword_processing_checkpoint";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

const FORBIDDEN_SECRET_KEY_PATTERN =
  /secret|token|credential|ciphertext|authorization|password|api[_-]?key/i;

export type GoogleAdsKeywordProcessingCheckpointErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "INVALID_COUNTS"
  | "CHECKPOINT_REGRESSION"
  | "CHECKPOINT_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class GoogleAdsKeywordProcessingCheckpointError
  extends Error {
  readonly code:
    GoogleAdsKeywordProcessingCheckpointErrorCode;

  constructor(
    code:
      GoogleAdsKeywordProcessingCheckpointErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsKeywordProcessingCheckpointError";

    this.code =
      code;
  }
}

export type GoogleAdsKeywordCheckpointRpcInvoker =
  (
    functionName: string,
    args: Readonly<{
      p_payload: JsonObject;
    }>,
  ) => Promise<Readonly<{
    data: unknown;
    error: unknown;
  }>>;

export type GoogleAdsKeywordCheckpointJobParser =
  (
    value: unknown,
  ) =>
    | MediaSyncJobRecord
    | Promise<MediaSyncJobRecord>;

export type GoogleAdsKeywordProcessingCheckpointDependencies =
  Readonly<{
    invokeRpc?:
      GoogleAdsKeywordCheckpointRpcInvoker;

    parseJob?:
      GoogleAdsKeywordCheckpointJobParser;
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

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value.trim();
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
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function assertSafeJsonValue(
  value: unknown,
  path: string,
  visited: Set<object>,
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new GoogleAdsKeywordProcessingCheckpointError(
        "INVALID_INPUT",
        `${path} contains a non-finite number.`,
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      throw new GoogleAdsKeywordProcessingCheckpointError(
        "INVALID_INPUT",
        `${path} contains a circular value.`,
      );
    }

    visited.add(value);

    try {
      value.forEach(
        (
          nestedValue,
          index,
        ) => {
          assertSafeJsonValue(
            nestedValue,
            `${path}[${index}]`,
            visited,
          );
        },
      );
    } finally {
      visited.delete(value);
    }

    return;
  }

  if (!isPlainObject(value)) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      `${path} contains a non-JSON value.`,
    );
  }

  if (visited.has(value)) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      `${path} contains a circular value.`,
    );
  }

  visited.add(value);

  try {
    for (
      const [
        key,
        nestedValue,
      ] of Object.entries(value)
    ) {
      if (
        FORBIDDEN_SECRET_KEY_PATTERN.test(
          key,
        )
      ) {
        throw new GoogleAdsKeywordProcessingCheckpointError(
          "INVALID_INPUT",
          `${path} contains a forbidden secret field.`,
        );
      }

      assertSafeJsonValue(
        nestedValue,
        `${path}.${key}`,
        visited,
      );
    }
  } finally {
    visited.delete(value);
  }
}

function toSafeJsonObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (!isPlainObject(value)) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      `${fieldName} must be a JSON object.`,
    );
  }

  assertSafeJsonValue(
    value,
    fieldName,
    new Set<object>(),
  );

  return value as JsonObject;
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_JOB",
      "A media sync job is required.",
    );
  }

  for (
    const [
      fieldName,
      fieldValue,
    ] of [
      [
        "job.id",
        value.id,
      ],
      [
        "job.report_id",
        value.report_id,
      ],
      [
        "job.workspace_id",
        value.workspace_id,
      ],
      [
        "job.advertiser_id",
        value.advertiser_id,
      ],
      [
        "job.connection_id",
        value.connection_id,
      ],
      [
        "job.external_account_id",
        value.external_account_id,
      ],
      [
        "job.date_from",
        value.date_from,
      ],
      [
        "job.date_to",
        value.date_to,
      ],
    ] as const
  ) {
    normalizeRequiredString(
      fieldValue,
      fieldName,
    );
  }

  if (
    value.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads keyword checkpoints are supported.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The Google Ads media sync job must be processing.",
    );
  }

  requireNonNegativeInteger(
    value.raw_rows,
    "job.raw_rows",
  );

  requireNonNegativeInteger(
    value.normalized_rows,
    "job.normalized_rows",
  );

  requireNonNegativeInteger(
    value.inserted_rows,
    "job.inserted_rows",
  );

  requireNonNegativeInteger(
    value.failed_rows,
    "job.failed_rows",
  );

  if (
    value.raw_rows !==
      value.inserted_rows ||
    value.normalized_rows !==
      value.inserted_rows ||
    value.failed_rows !==
      0
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads job row counts are inconsistent.",
    );
  }
}

function validateResult(
  job: MediaSyncJobRecord,
  result: unknown,
): asserts result is
  GoogleAdsKeywordStagingOrchestratorResult {
  if (!isPlainObject(result)) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      "A Google Ads staging orchestrator result is required.",
    );
  }

  if (
    result.jobId !==
      job.id
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The Google Ads orchestrator result does not match the job.",
    );
  }

  if (
    result.status !==
      "partial" &&
    result.status !==
      "completed"
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      "The Google Ads orchestrator result status is invalid.",
    );
  }

  if (
    result.isComplete !==
      (
        result.status ===
        "completed"
      )
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads orchestrator completion flags are inconsistent.",
    );
  }

  const nextRowIndex =
    requireNonNegativeInteger(
      result.nextRowIndex,
      "result.nextRowIndex",
    );

  const canonicalRowCount =
    requireNonNegativeInteger(
      result.canonicalRowCount,
      "result.canonicalRowCount",
    );

  const dateWindowIndex =
    requireNonNegativeInteger(
      result.dateWindowIndex,
      "result.dateWindowIndex",
    );

  if (
    !isPlainObject(
      result.checkpoint,
    ) ||
    result.checkpoint.version !==
      1 ||
    result.checkpoint.dateWindowIndex !==
      dateWindowIndex ||
    result.checkpoint.nextRowIndex !==
      nextRowIndex ||
    result.checkpoint.totalRows !==
      canonicalRowCount ||
    result.checkpoint.totalRows !==
      nextRowIndex ||
    result.checkpoint.failedRows !==
      0 ||
    result.checkpoint.complete !==
      result.isComplete
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads checkpoint candidate is inconsistent.",
    );
  }

  if (
    nextRowIndex <
    job.inserted_rows
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "CHECKPOINT_REGRESSION",
      "The Google Ads checkpoint cannot move behind the saved job row count.",
    );
  }

  if (
    !isPlainObject(
      result.collector,
    )
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      "The Google Ads page collector result is required.",
    );
  }

  const completedPageCount =
    requireNonNegativeInteger(
      result.collector.completedPageCount,
      "result.collector.completedPageCount",
    );

  if (completedPageCount < 1) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads completed page count must be at least one.",
    );
  }

  if (
    result.collector.isComplete !==
      result.isComplete ||
    result.collector.status !==
      result.status
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads collector completion flags are inconsistent.",
    );
  }

  const cursor =
    result.checkpoint.cursor;

  if (result.isComplete) {
    if (cursor !== null) {
      throw new GoogleAdsKeywordProcessingCheckpointError(
        "INVALID_COUNTS",
        "A completed Google Ads checkpoint must not retain a page cursor.",
      );
    }

    return;
  }

  if (!isPlainObject(cursor)) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      "A partial Google Ads checkpoint requires a scoped page cursor.",
    );
  }

  if (
    cursor.version !==
      1 ||
    cursor.externalAccountId !==
      job.external_account_id ||
    cursor.dateWindowIndex !==
      dateWindowIndex ||
    cursor.dateFrom !==
      job.date_from ||
    cursor.dateTo !==
      job.date_to
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The Google Ads checkpoint cursor does not match the job scope.",
    );
  }

  if (
    !isPlainObject(
      cursor.page,
    ) ||
    cursor.page.version !==
      1 ||
    cursor.page.pageIndex !==
      completedPageCount
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads page cursor boundary is inconsistent.",
    );
  }

  normalizeRequiredString(
    cursor.page.page,
    "checkpoint.cursor.page.page",
  );
}

function readRpcErrorMessage(
  error: unknown,
): string {
  if (
    isPlainObject(error) &&
    typeof error.message ===
      "string"
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "";
}

function mapRpcError(
  error: unknown,
): GoogleAdsKeywordProcessingCheckpointError {
  const message =
    readRpcErrorMessage(
      error,
    );

  if (
    message.includes(
      "MSC_INVALID_INPUT",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      "The Google Ads checkpoint payload was rejected.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_JOB_NOT_PROCESSING",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The Google Ads media sync job is not processing.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_UNSUPPORTED_PROVIDER",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "The Google Ads checkpoint provider was rejected.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_SCOPE_MISMATCH",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The Google Ads checkpoint scope does not match the job.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_INVALID_COUNTS",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_COUNTS",
      "The Google Ads checkpoint counts are inconsistent.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_CHECKPOINT_REGRESSION",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "CHECKPOINT_REGRESSION",
      "The Google Ads checkpoint cannot move backwards.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_CHECKPOINT_CONFLICT",
    )
  ) {
    return new GoogleAdsKeywordProcessingCheckpointError(
      "CHECKPOINT_CONFLICT",
      "The existing processing checkpoint is incompatible with the Google Ads contract.",
      {
        cause:
          error,
      },
    );
  }

  return new GoogleAdsKeywordProcessingCheckpointError(
    "DATABASE_ERROR",
    "The Google Ads checkpoint RPC failed.",
    {
      cause:
        error,
    },
  );
}

async function defaultInvokeRpc(
  functionName: string,
  args: Readonly<{
    p_payload: JsonObject;
  }>,
): Promise<Readonly<{
  data: unknown;
  error: unknown;
}>> {
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

async function defaultParseJob(
  value: unknown,
): Promise<MediaSyncJobRecord> {
  const {
    parseMediaSyncJobRecord,
  } =
    await import(
      "./media-sync-jobs-repository"
    );

  return parseMediaSyncJobRecord(
    value,
  );
}

export async function saveGoogleAdsKeywordProcessingCheckpoint(
  input: Readonly<{
    job:
      MediaSyncJobRecord;

    result:
      GoogleAdsKeywordStagingOrchestratorResult;
  }>,
  dependencies:
    GoogleAdsKeywordProcessingCheckpointDependencies = {},
): Promise<MediaSyncJobRecord> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_INPUT",
      "Google Ads checkpoint input is required.",
    );
  }

  validateJob(
    input.job,
  );

  validateResult(
    input.job,
    input.result,
  );

  const checkpoint =
    input.result.checkpoint;

  const collector =
    input.result.collector;

  const cursor =
    checkpoint.cursor ===
      null
      ? null
      : toSafeJsonObject(
          checkpoint.cursor,
          "checkpoint.cursor",
        );

  const payload =
    {
      job_id:
        input.job.id,

      report_id:
        input.job.report_id,

      workspace_id:
        input.job.workspace_id,

      advertiser_id:
        input.job.advertiser_id,

      connection_id:
        input.job.connection_id,

      provider:
        input.job.provider,

      external_account_id:
        input.job.external_account_id,

      date_from:
        input.job.date_from,

      date_to:
        input.job.date_to,

      raw_rows:
        checkpoint.totalRows,

      normalized_rows:
        checkpoint.totalRows,

      inserted_rows:
        checkpoint.nextRowIndex,

      failed_rows:
        checkpoint.failedRows,

      collector: {
        google_version:
          1,

        phase:
          "keyword",

        date_window_index:
          checkpoint.dateWindowIndex,

        next_row_index:
          checkpoint.nextRowIndex,

        completed_page_count:
          collector.completedPageCount,

        complete:
          checkpoint.complete,

        cursor,
      },
    } as JsonObject;

  assertSafeJsonValue(
    payload,
    "checkpoint.payload",
    new Set<object>(),
  );

  const invokeRpc =
    dependencies.invokeRpc ??
    defaultInvokeRpc;

  let rpcResult:
    Readonly<{
      data: unknown;
      error: unknown;
    }>;

  try {
    rpcResult =
      await invokeRpc(
        SAVE_GOOGLE_CHECKPOINT_RPC,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "DATABASE_ERROR",
      "The Google Ads checkpoint repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  if (rpcResult.error) {
    throw mapRpcError(
      rpcResult.error,
    );
  }

  if (
    !Array.isArray(
      rpcResult.data,
    ) ||
    rpcResult.data.length !==
      1
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads checkpoint RPC returned an invalid result.",
    );
  }

  const parseJob =
    dependencies.parseJob ??
    defaultParseJob;

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      await parseJob(
        rpcResult.data[0],
      );
  } catch (error) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads checkpoint RPC returned an invalid media sync job.",
      {
        cause:
          error,
      },
    );
  }

  if (
    updatedJob.id !==
      input.job.id ||
    updatedJob.report_id !==
      input.job.report_id ||
    updatedJob.workspace_id !==
      input.job.workspace_id ||
    updatedJob.advertiser_id !==
      input.job.advertiser_id ||
    updatedJob.connection_id !==
      input.job.connection_id ||
    updatedJob.provider !==
      GOOGLE_ADS_PROVIDER ||
    updatedJob.external_account_id !==
      input.job.external_account_id ||
    updatedJob.date_from !==
      input.job.date_from ||
    updatedJob.date_to !==
      input.job.date_to ||
    updatedJob.status !==
      PROCESSING_STATUS ||
    updatedJob.snapshot_ingestion_id !==
      input.job.snapshot_ingestion_id ||
    updatedJob.finished_at !==
      input.job.finished_at ||
    updatedJob.raw_rows !==
      checkpoint.totalRows ||
    updatedJob.normalized_rows !==
      checkpoint.totalRows ||
    updatedJob.inserted_rows !==
      checkpoint.nextRowIndex ||
    updatedJob.failed_rows !==
      0
  ) {
    throw new GoogleAdsKeywordProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The saved Google Ads checkpoint job contains unexpected values.",
    );
  }

  return updatedJob;
}

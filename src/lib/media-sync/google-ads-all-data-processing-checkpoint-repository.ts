import {
  resolveGoogleAdsAllDataProductCompletionBoundary,
  validateGoogleAdsAllDataProductRoutingState,
  type GoogleAdsAllDataProductRoutingState,
} from "./google-ads-all-data-product-routing";
import {
  readGoogleAdsAllDataProcessingCheckpoint,
  type GoogleAdsAllDataProcessingCheckpointCursor,
  type GoogleAdsAllDataProcessingCheckpointPhase,
} from "./google-ads-all-data-processing-checkpoint";
import type {
  MediaSyncJobRecord,
} from "./types";

const SAVE_GOOGLE_ADS_ALL_DATA_CHECKPOINT_RPC =
  "save_google_ads_all_data_processing_checkpoint" as const;

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const PROCESSING_STATUS =
  "processing" as const;

type UnknownRecord =
  Record<string, unknown>;

export type GoogleAdsAllDataCheckpointJobRecord =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract:
      typeof GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT;
  }>;

export type GoogleAdsAllDataProcessingCheckpointRepositoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_COUNTS"
  | "SCOPE_MISMATCH"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "CHECKPOINT_REGRESSION"
  | "CHECKPOINT_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class GoogleAdsAllDataProcessingCheckpointRepositoryError
  extends Error {
  readonly code:
    GoogleAdsAllDataProcessingCheckpointRepositoryErrorCode;

  constructor(
    code:
      GoogleAdsAllDataProcessingCheckpointRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataProcessingCheckpointRepositoryError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataCheckpointRpcResult =
  Readonly<{
    data: unknown;
    error: unknown;
  }>;

export type GoogleAdsAllDataCheckpointRpcInvoker =
  (
    functionName: string,
    args: Readonly<{
      p_payload:
        Record<string, unknown>;
    }>,
  ) => Promise<
    GoogleAdsAllDataCheckpointRpcResult
  >;

export type GoogleAdsAllDataCheckpointJobParser =
  (
    value: unknown,
  ) =>
    | GoogleAdsAllDataCheckpointJobRecord
    | Promise<GoogleAdsAllDataCheckpointJobRecord>;

export type GoogleAdsAllDataProcessingCheckpointDependencies =
  Readonly<{
    invokeRpc?:
      GoogleAdsAllDataCheckpointRpcInvoker;

    parseJob?:
      GoogleAdsAllDataCheckpointJobParser;
  }>;

type MediaSyncJobWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?: unknown;
  }>;

export type GoogleAdsAllDataCheckpointStagingPhase =
  | "keyword"
  | "search_ad"
  | "demand_gen_ad";

export type GoogleAdsAllDataCheckpointStagingResult =
  Readonly<{
    jobId:
      string;

    dateWindowIndex:
      number;

    phaseRun:
      GoogleAdsAllDataCheckpointStagingPhase;

    nextPhase:
      GoogleAdsAllDataCheckpointStagingPhase |
      null;

    rowStartIndex:
      number;

    nextRowIndex:
      number;

    runCanonicalRowCount:
      number;

    status:
      | "partial"
      | "completed";

    isComplete:
      boolean;

    apiPageExecutionCount:
      1;

    stageResult:
      unknown;

    checkpoint:
      Readonly<{
        version: 1;

        phaseRun:
          GoogleAdsAllDataCheckpointStagingPhase;

        nextPhase:
          GoogleAdsAllDataCheckpointStagingPhase |
          null;

        nextRowIndex:
          number;

        totalRows:
          number;

        failedRows:
          0;

        complete:
          boolean;

        cursor:
          GoogleAdsAllDataProcessingCheckpointCursor |
          null;
      }>;
  }>;

type ValidatedResult =
  Readonly<{
    dateWindowIndex: number;
    nextRowIndex: number;
    phase:
      GoogleAdsAllDataProcessingCheckpointPhase;
    complete: boolean;
    cursor:
      GoogleAdsAllDataProcessingCheckpointCursor |
      null;
  }>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function requireNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_COUNTS",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function validateJob(
  job:
    MediaSyncJobRecord,
): GoogleAdsAllDataCheckpointJobRecord {
  if (
    !job ||
    typeof job !==
      "object"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_JOB",
      "A Google Ads ALL-DATA processing job is required.",
    );
  }

  const typedJob =
    job as
      MediaSyncJobWithExecutionContract;

  if (
    typedJob.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads ALL-DATA checkpoints are supported.",
    );
  }

  if (
    typedJob.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_JOB",
      "The Google Ads job does not use google_all_data_v1.",
    );
  }

  if (
    typedJob.status !==
      PROCESSING_STATUS
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "JOB_NOT_PROCESSING",
      "The Google Ads ALL-DATA job is not processing.",
    );
  }

  if (
    typeof typedJob.id !==
      "string" ||
    !typedJob.id.trim() ||
    typeof typedJob.report_id !==
      "string" ||
    !typedJob.report_id.trim() ||
    typeof typedJob.workspace_id !==
      "string" ||
    !typedJob.workspace_id.trim() ||
    typeof typedJob.connection_id !==
      "string" ||
    !typedJob.connection_id.trim() ||
    typeof typedJob.external_account_id !==
      "string" ||
    !typedJob.external_account_id.trim() ||
    typeof typedJob.date_from !==
      "string" ||
    !typedJob.date_from.trim() ||
    typeof typedJob.date_to !==
      "string" ||
    !typedJob.date_to.trim()
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA job scope is invalid.",
    );
  }

  requireNonNegativeInteger(
    typedJob.raw_rows,
    "job.raw_rows",
  );

  requireNonNegativeInteger(
    typedJob.normalized_rows,
    "job.normalized_rows",
  );

  requireNonNegativeInteger(
    typedJob.inserted_rows,
    "job.inserted_rows",
  );

  requireNonNegativeInteger(
    typedJob.failed_rows,
    "job.failed_rows",
  );

  return typedJob as
    GoogleAdsAllDataCheckpointJobRecord;
}

function toSafeJsonObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (
    !isPlainObject(
      value,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must be an object.`,
    );
  }

  let serialized:
    string;

  try {
    serialized =
      JSON.stringify(
        value,
      );
  } catch (error) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_INPUT",
      `${fieldName} is not JSON serializable.`,
      {
        cause:
          error,
      },
    );
  }

  const parsed =
    JSON.parse(
      serialized,
    ) as unknown;

  if (
    !isPlainObject(
      parsed,
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_INPUT",
      `${fieldName} is not a JSON object.`,
    );
  }

  return parsed;
}

function validateResult(
  job:
    GoogleAdsAllDataCheckpointJobRecord,
  result:
    GoogleAdsAllDataCheckpointStagingResult,
): ValidatedResult {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_INPUT",
      "The Google Ads ALL-DATA staging result is required.",
    );
  }

  const dateWindowIndex =
    requireNonNegativeInteger(
      result.dateWindowIndex,
      "result.dateWindowIndex",
    );

  const rowStartIndex =
    requireNonNegativeInteger(
      result.rowStartIndex,
      "result.rowStartIndex",
    );

  const nextRowIndex =
    requireNonNegativeInteger(
      result.nextRowIndex,
      "result.nextRowIndex",
    );

  const runCanonicalRowCount =
    requireNonNegativeInteger(
      result.runCanonicalRowCount,
      "result.runCanonicalRowCount",
    );

  if (
    result.jobId !==
      job.id ||
    rowStartIndex !==
      job.inserted_rows ||
    nextRowIndex !==
      rowStartIndex +
        runCanonicalRowCount ||
    result.apiPageExecutionCount !==
      1
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "SCOPE_MISMATCH",
      "The Google Ads ALL-DATA staging result does not match the job row boundary.",
    );
  }

  const checkpoint =
    result.checkpoint;

  if (
    !checkpoint ||
    typeof checkpoint !==
      "object" ||
    checkpoint.version !==
      1 ||
    checkpoint.phaseRun !==
      result.phaseRun ||
    checkpoint.nextPhase !==
      result.nextPhase ||
    checkpoint.nextRowIndex !==
      nextRowIndex ||
    checkpoint.totalRows !==
      nextRowIndex ||
    checkpoint.failedRows !==
      0 ||
    checkpoint.complete !==
      result.isComplete
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_COUNTS",
      "The Google Ads ALL-DATA checkpoint candidate is inconsistent.",
    );
  }

  if (
    result.isComplete
  ) {
    if (
      result.status !==
        "completed" ||
      result.nextPhase !==
        null ||
      checkpoint.cursor !==
        null
    ) {
      throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
        "INVALID_INPUT",
        "A completed Google Ads ALL-DATA result has an invalid terminal checkpoint.",
      );
    }

    return Object.freeze({
      dateWindowIndex,
      nextRowIndex,

      phase:
        "completed" as const,

      complete:
        true,

      cursor:
        null,
    });
  }

  if (
    result.status !==
      "partial" ||
    (
      result.nextPhase !==
        "keyword" &&
      result.nextPhase !==
        "search_ad" &&
      result.nextPhase !==
        "demand_gen_ad"
    ) ||
    !checkpoint.cursor
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_INPUT",
      "A partial Google Ads ALL-DATA result requires a durable next phase cursor.",
    );
  }

  const cursor =
    checkpoint.cursor;

  if (
    cursor.version !==
      1 ||
    cursor.phase !==
      result.nextPhase ||
    cursor.externalAccountId !==
      job.external_account_id ||
    cursor.dateWindowIndex !==
      dateWindowIndex ||
    cursor.dateFrom !==
      job.date_from ||
    cursor.dateTo !==
      job.date_to ||
    cursor.expectedRowStartIndex !==
      nextRowIndex
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "SCOPE_MISMATCH",
      "The Google Ads ALL-DATA checkpoint cursor does not match the durable job boundary.",
    );
  }

  return Object.freeze({
    dateWindowIndex,
    nextRowIndex,

    phase:
      result.nextPhase,

    complete:
      false,

    cursor,
  });
}

function stableJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !==
      "object"
  ) {
    return (
      JSON.stringify(
        value,
      ) ??
      "undefined"
    );
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return `[${value
      .map(
        stableJson,
      )
      .join(",")}]`;
  }

  const record =
    value as
      Record<
        string,
        unknown
      >;

  return `{${Object.keys(
    record,
  )
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(
          key,
        )}:${stableJson(
          record[key],
        )}`,
    )
    .join(",")}}`;
}

function readRpcErrorMessage(
  error: unknown,
): string {
  if (
    isPlainObject(
      error,
    ) &&
    typeof error.message ===
      "string"
  ) {
    return error.message;
  }

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "";
}

function mapRpcError(
  error: unknown,
): GoogleAdsAllDataProcessingCheckpointRepositoryError {
  const message =
    readRpcErrorMessage(
      error,
    );

  const mappings:
    ReadonlyArray<
      readonly [
        string,
        GoogleAdsAllDataProcessingCheckpointRepositoryErrorCode,
        string,
      ]
    > = [
      [
        "MSC_INVALID_INPUT",
        "INVALID_INPUT",
        "The Google Ads ALL-DATA checkpoint payload was rejected.",
      ],
      [
        "MSC_JOB_NOT_PROCESSING",
        "JOB_NOT_PROCESSING",
        "The Google Ads ALL-DATA job is not processing.",
      ],
      [
        "MSC_UNSUPPORTED_PROVIDER",
        "UNSUPPORTED_PROVIDER",
        "The Google Ads ALL-DATA provider was rejected.",
      ],
      [
        "MSC_SCOPE_MISMATCH",
        "SCOPE_MISMATCH",
        "The Google Ads ALL-DATA checkpoint scope does not match the job.",
      ],
      [
        "MSC_INVALID_COUNTS",
        "INVALID_COUNTS",
        "The Google Ads ALL-DATA checkpoint counts are inconsistent.",
      ],
      [
        "MSC_CHECKPOINT_REGRESSION",
        "CHECKPOINT_REGRESSION",
        "The Google Ads ALL-DATA checkpoint cannot move backwards.",
      ],
      [
        "MSC_CHECKPOINT_CONFLICT",
        "CHECKPOINT_CONFLICT",
        "The existing checkpoint is incompatible with google_all_data_v1.",
      ],
    ];

  for (
    const [
      token,
      code,
      mappedMessage,
    ] of mappings
  ) {
    if (
      message.includes(
        token,
      )
    ) {
      return new GoogleAdsAllDataProcessingCheckpointRepositoryError(
        code,
        mappedMessage,
        {
          cause:
            error,
        },
      );
    }
  }

  return new GoogleAdsAllDataProcessingCheckpointRepositoryError(
    "DATABASE_ERROR",
    "The Google Ads ALL-DATA checkpoint RPC failed.",
    {
      cause:
        error,
    },
  );
}

async function defaultInvokeRpc(
  functionName: string,
  args: Readonly<{
    p_payload:
      Record<string, unknown>;
  }>,
): Promise<
  GoogleAdsAllDataCheckpointRpcResult
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

async function defaultParseJob(
  value: unknown,
): Promise<
  GoogleAdsAllDataCheckpointJobRecord
> {
  const {
    parseMediaSyncJobRecord,
  } =
    await import(
      "./media-sync-jobs-repository"
    );

  if (
    !isPlainObject(
      value,
    ) ||
    value.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The saved Google Ads ALL-DATA job lost its execution contract.",
    );
  }

  const parsed =
    parseMediaSyncJobRecord(
      value,
    );

  return {
    ...parsed,

    execution_contract:
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,
  };
}

export async function saveGoogleAdsAllDataProcessingCheckpoint(
  input: Readonly<{
    job:
      MediaSyncJobRecord;

    result:
      GoogleAdsAllDataCheckpointStagingResult;

    routing?:
      GoogleAdsAllDataProductRoutingState;
  }>,
  dependencies:
    GoogleAdsAllDataProcessingCheckpointDependencies = {},
): Promise<
  GoogleAdsAllDataCheckpointJobRecord
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA checkpoint input is required.",
    );
  }

  const job =
    validateJob(
      input.job,
    );

  const validated =
    validateResult(
      job,
      input.result,
    );

  const routing =
    input.routing ===
    undefined
      ? null
      : validateGoogleAdsAllDataProductRoutingState(
          input.routing,
        );

  const completionBoundary =
    routing ===
      null
      ? null
      : resolveGoogleAdsAllDataProductCompletionBoundary({
          stagingComplete:
            validated.complete,

          routing,
        });

  const checkpointComplete =
    completionBoundary?.globalComplete ??
    validated.complete;

  const atProductBoundary =
    completionBoundary?.atProductBoundary ??
    false;

  const checkpointPhase:
    GoogleAdsAllDataProcessingCheckpointPhase =
    atProductBoundary
      ? "product_boundary"
      : validated.phase;

  const cursor =
    atProductBoundary
      ? null
      : validated.cursor ===
          null
        ? null
        : toSafeJsonObject(
            validated.cursor,
            "checkpoint.cursor",
          );

  const payload:
    Record<string, unknown> = {
      job_id:
        job.id,

      report_id:
        job.report_id,

      workspace_id:
        job.workspace_id,

      advertiser_id:
        job.advertiser_id,

      connection_id:
        job.connection_id,

      provider:
        job.provider,

      execution_contract:
        GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,

      external_account_id:
        job.external_account_id,

      date_from:
        job.date_from,

      date_to:
        job.date_to,

      raw_rows:
        validated.nextRowIndex,

      normalized_rows:
        validated.nextRowIndex,

      inserted_rows:
        validated.nextRowIndex,

      failed_rows:
        0,

      collector: {
        google_version:
          1,

        all_data_version:
          1,

        ...(
          routing ===
          null
            ? {}
            : {
                product_route: [
                  ...routing.route,
                ],
                product_index:
                  routing.productIndex,
                product_family:
                  routing.productFamily,
              }
        ),

        phase:
          checkpointPhase,

        date_window_index:
          validated.dateWindowIndex,

        next_row_index:
          validated.nextRowIndex,

        complete:
          checkpointComplete,

        cursor,
      },
    };

  const invokeRpc =
    dependencies.invokeRpc ??
    defaultInvokeRpc;

  let rpcResult:
    GoogleAdsAllDataCheckpointRpcResult;

  try {
    rpcResult =
      await invokeRpc(
        SAVE_GOOGLE_ADS_ALL_DATA_CHECKPOINT_RPC,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "DATABASE_ERROR",
      "The Google Ads ALL-DATA checkpoint repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  if (
    rpcResult.error
  ) {
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
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA checkpoint RPC returned an invalid result.",
    );
  }

  const parseJob =
    dependencies.parseJob ??
    defaultParseJob;

  let updatedJob:
    GoogleAdsAllDataCheckpointJobRecord;

  try {
    updatedJob =
      await parseJob(
        rpcResult.data[0],
      );
  } catch (error) {
    if (
      error instanceof
        GoogleAdsAllDataProcessingCheckpointRepositoryError
    ) {
      throw error;
    }

    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA checkpoint RPC returned an invalid job.",
      {
        cause:
          error,
      },
    );
  }

  if (
    updatedJob.id !==
      job.id ||
    updatedJob.report_id !==
      job.report_id ||
    updatedJob.workspace_id !==
      job.workspace_id ||
    updatedJob.advertiser_id !==
      job.advertiser_id ||
    updatedJob.connection_id !==
      job.connection_id ||
    updatedJob.provider !==
      GOOGLE_ADS_PROVIDER ||
    updatedJob.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT ||
    updatedJob.external_account_id !==
      job.external_account_id ||
    updatedJob.date_from !==
      job.date_from ||
    updatedJob.date_to !==
      job.date_to ||
    updatedJob.status !==
      PROCESSING_STATUS ||
    updatedJob.snapshot_ingestion_id !==
      job.snapshot_ingestion_id ||
    updatedJob.finished_at !==
      job.finished_at ||
    updatedJob.raw_rows !==
      validated.nextRowIndex ||
    updatedJob.normalized_rows !==
      validated.nextRowIndex ||
    updatedJob.inserted_rows !==
      validated.nextRowIndex ||
    updatedJob.failed_rows !==
      0
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The saved Google Ads ALL-DATA checkpoint job contains unexpected values.",
    );
  }

  const savedCheckpoint =
    readGoogleAdsAllDataProcessingCheckpoint(
      updatedJob,
    );

  if (
    !savedCheckpoint.hasCheckpoint ||
    savedCheckpoint.dateWindowIndex !==
      validated.dateWindowIndex ||
    savedCheckpoint.phase !==
      checkpointPhase ||
    savedCheckpoint.nextRowIndex !==
      validated.nextRowIndex ||
    savedCheckpoint.complete !==
      checkpointComplete ||
    stableJson(
      savedCheckpoint.cursor,
    ) !==
      stableJson(
        validated.cursor,
      )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The durable Google Ads ALL-DATA checkpoint does not match the requested state.",
    );
  }

  const savedRouting =
    savedCheckpoint.routing ??
    null;

  if (
    (
      routing ===
      null
    ) !==
      (
        savedRouting ===
        null
      ) ||
    (
      routing !==
        null &&
      savedRouting !==
        null &&
      JSON.stringify(
        savedRouting,
      ) !==
        JSON.stringify(
          routing,
        )
    )
  ) {
    throw new GoogleAdsAllDataProcessingCheckpointRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The durable Google Ads ALL-DATA product routing state does not match the requested state.",
    );
  }

  return updatedJob;
}

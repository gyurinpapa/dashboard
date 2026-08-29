import {
  validateGoogleAdsAllDataProductRoutingState,
  type GoogleAdsAllDataProductRoutingState,
} from "./google-ads-all-data-product-routing";
import {
  readGoogleAdsAllDataProcessingCheckpoint,
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

export type GoogleAdsAllDataProductRoutingBootstrapJobRecord =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract:
      typeof GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT;
  }>;

export type GoogleAdsAllDataProductRoutingBootstrapRepositoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_COUNTS"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "ROUTING_CONFLICT"
  | "CHECKPOINT_CONFLICT"
  | "CHECKPOINT_REGRESSION"
  | "SCOPE_MISMATCH"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class GoogleAdsAllDataProductRoutingBootstrapRepositoryError
  extends Error {
  readonly code:
    GoogleAdsAllDataProductRoutingBootstrapRepositoryErrorCode;

  constructor(
    code:
      GoogleAdsAllDataProductRoutingBootstrapRepositoryErrorCode,
    message: string,
    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataProductRoutingBootstrapRepositoryError";

    this.code =
      code;
  }
}

export type GoogleAdsAllDataProductRoutingBootstrapRpcResult =
  Readonly<{
    data: unknown;
    error: unknown;
  }>;

export type GoogleAdsAllDataProductRoutingBootstrapRpcInvoker =
  (
    functionName:
      string,
    args:
      Readonly<{
        p_payload:
          Record<string, unknown>;
      }>,
  ) => Promise<
    GoogleAdsAllDataProductRoutingBootstrapRpcResult
  >;

export type GoogleAdsAllDataProductRoutingBootstrapJobParser =
  (
    value:
      unknown,
  ) =>
    | GoogleAdsAllDataProductRoutingBootstrapJobRecord
    | Promise<
        GoogleAdsAllDataProductRoutingBootstrapJobRecord
      >;

export type GoogleAdsAllDataProductRoutingBootstrapDependencies =
  Readonly<{
    invokeRpc?:
      GoogleAdsAllDataProductRoutingBootstrapRpcInvoker;

    parseJob?:
      GoogleAdsAllDataProductRoutingBootstrapJobParser;
  }>;

type MediaSyncJobWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?:
      unknown;
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

function validateFreshJob(
  value:
    MediaSyncJobRecord,
): GoogleAdsAllDataProductRoutingBootstrapJobRecord {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_JOB",
      "A fresh Google Ads ALL-DATA processing job is required.",
    );
  }

  const job =
    value as
      MediaSyncJobWithExecutionContract;

  if (
    job.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads ALL-DATA jobs support product-route bootstrap persistence.",
    );
  }

  if (
    job.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_JOB",
      "The Google Ads job does not use google_all_data_v1.",
    );
  }

  if (
    job.status !==
      PROCESSING_STATUS
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "JOB_NOT_PROCESSING",
      "The Google Ads ALL-DATA job is not processing.",
    );
  }

  if (
    job.raw_rows !==
      0 ||
    job.normalized_rows !==
      0 ||
    job.inserted_rows !==
      0 ||
    job.failed_rows !==
      0
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_COUNTS",
      "A product-route bootstrap may only be persisted before the first staging row.",
    );
  }

  const checkpoint =
    readGoogleAdsAllDataProcessingCheckpoint(
      value,
    );

  if (
    checkpoint.hasCheckpoint
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "CHECKPOINT_CONFLICT",
      "A product-route bootstrap cannot overwrite an existing durable checkpoint.",
    );
  }

  return job as
    GoogleAdsAllDataProductRoutingBootstrapJobRecord;
}

function validateBootstrapRouting(
  value:
    GoogleAdsAllDataProductRoutingState,
): GoogleAdsAllDataProductRoutingState {
  const routing =
    validateGoogleAdsAllDataProductRoutingState(
      value,
    );

  if (
    routing.complete ||
    routing.route.length ===
      0 ||
    routing.productIndex !==
      0 ||
    routing.productFamily ===
      null ||
    routing.productFamily !==
      routing.route[0]
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "ROUTING_CONFLICT",
      "A fresh product-route bootstrap must point to the first incomplete canonical product.",
    );
  }

  return routing;
}

function mapRpcError(
  error:
    unknown,
): GoogleAdsAllDataProductRoutingBootstrapRepositoryError {
  const message =
    isPlainObject(
      error,
    ) &&
    typeof error.message ===
      "string"
      ? error.message
      : "";

  const mappings:
    ReadonlyArray<
      readonly [
        string,
        GoogleAdsAllDataProductRoutingBootstrapRepositoryErrorCode,
      ]
    > = [
      [
        "MSC_JOB_NOT_PROCESSING",
        "JOB_NOT_PROCESSING",
      ],
      [
        "MSC_UNSUPPORTED_PROVIDER",
        "UNSUPPORTED_PROVIDER",
      ],
      [
        "MSC_INVALID_COUNTS",
        "INVALID_COUNTS",
      ],
      [
        "MSC_SCOPE_MISMATCH",
        "SCOPE_MISMATCH",
      ],
      [
        "MSC_CHECKPOINT_REGRESSION",
        "CHECKPOINT_REGRESSION",
      ],
      [
        "MSC_CHECKPOINT_CONFLICT",
        "CHECKPOINT_CONFLICT",
      ],
      [
        "MSC_INVALID_INPUT",
        "INVALID_INPUT",
      ],
    ];

  for (
    const [
      marker,
      code,
    ]
    of mappings
  ) {
    if (
      message.includes(
        marker,
      )
    ) {
      return new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
        code,
        "The Google Ads ALL-DATA product-route bootstrap RPC rejected the requested checkpoint.",
        {
          cause:
            error,
        },
      );
    }
  }

  return new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
    "DATABASE_ERROR",
    "The Google Ads ALL-DATA product-route bootstrap RPC failed.",
    {
      cause:
        error,
    },
  );
}

async function defaultInvokeRpc(
  functionName:
    string,
  args:
    Readonly<{
      p_payload:
        Record<string, unknown>;
    }>,
): Promise<
  GoogleAdsAllDataProductRoutingBootstrapRpcResult
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
  value:
    unknown,
): Promise<
  GoogleAdsAllDataProductRoutingBootstrapJobRecord
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
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The persisted Google Ads ALL-DATA bootstrap job lost its execution contract.",
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

function assertSameScope(
  before:
    GoogleAdsAllDataProductRoutingBootstrapJobRecord,
  after:
    GoogleAdsAllDataProductRoutingBootstrapJobRecord,
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
      before.date_to
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "SCOPE_MISMATCH",
      "The persisted Google Ads ALL-DATA bootstrap job changed scope.",
    );
  }

  if (
    after.status !==
      PROCESSING_STATUS ||
    after.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT ||
    after.raw_rows !==
      0 ||
    after.normalized_rows !==
      0 ||
    after.inserted_rows !==
      0 ||
    after.failed_rows !==
      0
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The persisted Google Ads ALL-DATA bootstrap job contains unexpected state.",
    );
  }
}

export async function saveGoogleAdsAllDataProductRoutingBootstrap(
  input:
    Readonly<{
      job:
        MediaSyncJobRecord;

      routing:
        GoogleAdsAllDataProductRoutingState;
    }>,
  dependencies:
    GoogleAdsAllDataProductRoutingBootstrapDependencies = {},
): Promise<
  GoogleAdsAllDataProductRoutingBootstrapJobRecord
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_INPUT",
      "Google Ads ALL-DATA product-route bootstrap input is required.",
    );
  }

  const job =
    validateFreshJob(
      input.job,
    );

  const routing =
    validateBootstrapRouting(
      input.routing,
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
        0,

      normalized_rows:
        0,

      inserted_rows:
        0,

      failed_rows:
        0,

      collector: {
        google_version:
          1,

        all_data_version:
          1,

        product_route: [
          ...routing.route,
        ],

        product_index:
          routing.productIndex,

        product_family:
          routing.productFamily,

        phase:
          "product_boundary",

        date_window_index:
          0,

        next_row_index:
          0,

        complete:
          false,

        cursor:
          null,
      },
    };

  const invokeRpc =
    dependencies.invokeRpc ??
    defaultInvokeRpc;

  let rpcResult:
    GoogleAdsAllDataProductRoutingBootstrapRpcResult;

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
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "DATABASE_ERROR",
      "The Google Ads ALL-DATA product-route bootstrap repository could not access the database.",
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
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA product-route bootstrap RPC returned an invalid result.",
    );
  }

  const parseJob =
    dependencies.parseJob ??
    defaultParseJob;

  let updatedJob:
    GoogleAdsAllDataProductRoutingBootstrapJobRecord;

  try {
    updatedJob =
      await parseJob(
        rpcResult.data[0],
      );
  } catch (error) {
    if (
      error instanceof
        GoogleAdsAllDataProductRoutingBootstrapRepositoryError
    ) {
      throw error;
    }

    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The Google Ads ALL-DATA product-route bootstrap job could not be parsed.",
      {
        cause:
          error,
      },
    );
  }

  assertSameScope(
    job,
    updatedJob,
  );

  const saved =
    readGoogleAdsAllDataProcessingCheckpoint(
      updatedJob,
    );

  if (
    !saved.hasCheckpoint ||
    saved.phase !==
      "product_boundary" ||
    saved.dateWindowIndex !==
      0 ||
    saved.nextRowIndex !==
      0 ||
    saved.complete ||
    saved.cursor !==
      null ||
    saved.routing ===
      null ||
    JSON.stringify(
      saved.routing,
    ) !==
      JSON.stringify(
        routing,
      )
  ) {
    throw new GoogleAdsAllDataProductRoutingBootstrapRepositoryError(
      "INVALID_DATABASE_RESULT",
      "The durable Google Ads ALL-DATA product-route bootstrap does not match the requested routing state.",
    );
  }

  return updatedJob;
}

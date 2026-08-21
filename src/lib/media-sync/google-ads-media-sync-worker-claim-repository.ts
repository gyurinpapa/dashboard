import type {
  MediaSyncJobRecord,
} from "./types";

const CLAIM_NEXT_GOOGLE_ADS_MEDIA_SYNC_JOB_RPC =
  "claim_next_google_ads_media_sync_job";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const CLAIMED_JOB_STATUS =
  "processing" as const;

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

export type GoogleAdsMediaSyncWorkerClaimRepositoryErrorCode =
  | "INVALID_RECORD"
  | "DATABASE_ERROR"
  | "CLAIM_ERROR";

export class GoogleAdsMediaSyncWorkerClaimRepositoryError
  extends Error {
  readonly code:
    GoogleAdsMediaSyncWorkerClaimRepositoryErrorCode;

  constructor(
    code:
      GoogleAdsMediaSyncWorkerClaimRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsMediaSyncWorkerClaimRepositoryError";

    this.code =
      code;
  }
}

export type GoogleAdsMediaSyncJobRecordParser =
  (
    value: unknown,
  ) =>
    | MediaSyncJobRecord
    | Promise<MediaSyncJobRecord>;

export type GoogleAdsMediaSyncWorkerClaimRepositoryDependencies =
  Readonly<{
    invokeRpc?: (
      rpcName: string,
    ) => Promise<{
      data: unknown;
      error: unknown;
    }>;
    parseJobRecord?:
      GoogleAdsMediaSyncJobRecordParser;
  }>;

async function parseDefaultMediaSyncJobRecord(
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

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasOnlyProcessingCheckpoint(
  errorDetail: unknown,
): boolean {
  if (errorDetail === null) {
    return true;
  }

  if (!isPlainObject(errorDetail)) {
    return false;
  }

  const keys =
    Object.keys(
      errorDetail,
    );

  if (keys.length === 0) {
    return true;
  }

  return (
    keys.length === 1 &&
    keys[0] ===
      PROCESSING_CHECKPOINT_KEY &&
    errorDetail[
      PROCESSING_CHECKPOINT_KEY
    ] !== undefined &&
    errorDetail[
      PROCESSING_CHECKPOINT_KEY
    ] !== null
  );
}

async function parseClaimedGoogleAdsJob(
  value: unknown,
  parseJobRecord:
    GoogleAdsMediaSyncJobRecordParser,
): Promise<MediaSyncJobRecord> {
  let job:
    MediaSyncJobRecord;

  try {
    job =
      await parseJobRecord(
        value,
      );
  } catch (error) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job record is invalid.",
      {
        cause:
          error,
      },
    );
  }

  if (
    job.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job has an unexpected provider.",
    );
  }

  if (
    job.status !==
    CLAIMED_JOB_STATUS
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job has an unexpected status.",
    );
  }

  if (
    job.started_at ===
    null
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job has no started_at value.",
    );
  }

  if (
    job.attempt_count <
    1
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job has an invalid attempt_count value.",
    );
  }

  if (
    job.error !==
    null
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job still contains an error value.",
    );
  }

  if (
    !hasOnlyProcessingCheckpoint(
      job.error_detail,
    )
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The claimed Google Ads media sync job contains error_detail that is not a resume checkpoint.",
    );
  }

  return job;
}

async function invokeDefaultClaimRpc(): Promise<{
  data: unknown;
  error: unknown;
}> {
  const {
    getSupabaseAdmin,
  } =
    await import(
      "../supabase/admin"
    );

  const supabase =
    getSupabaseAdmin();

  return await supabase.rpc(
    CLAIM_NEXT_GOOGLE_ADS_MEDIA_SYNC_JOB_RPC,
  );
}

export async function claimNextGoogleAdsMediaSyncJob(
  dependencies:
    GoogleAdsMediaSyncWorkerClaimRepositoryDependencies = {},
): Promise<
  MediaSyncJobRecord |
  null
> {
  const invokeRpc =
    dependencies.invokeRpc ??
    (async (
      rpcName:
        string,
    ) => {
      if (
        rpcName !==
        CLAIM_NEXT_GOOGLE_ADS_MEDIA_SYNC_JOB_RPC
      ) {
        throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
          "CLAIM_ERROR",
          "Unexpected Google Ads media sync claim RPC.",
        );
      }

      return await invokeDefaultClaimRpc();
    });

  const parseJobRecord =
    dependencies.parseJobRecord ??
    parseDefaultMediaSyncJobRecord;

  let result: {
    data: unknown;
    error: unknown;
  };

  try {
    result =
      await invokeRpc(
        CLAIM_NEXT_GOOGLE_ADS_MEDIA_SYNC_JOB_RPC,
      );
  } catch (error) {
    if (
      error instanceof
      GoogleAdsMediaSyncWorkerClaimRepositoryError
    ) {
      throw error;
    }

    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "DATABASE_ERROR",
      "The Google Ads media sync worker repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  if (
    result.error
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "CLAIM_ERROR",
      "The next Google Ads media sync job could not be claimed.",
      {
        cause:
          result.error,
      },
    );
  }

  const data =
    result.data;

  if (
    data ===
    null
  ) {
    return null;
  }

  if (
    !Array.isArray(
      data,
    )
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The Google Ads media sync claim RPC returned an invalid result.",
    );
  }

  if (
    data.length ===
    0
  ) {
    return null;
  }

  if (
    data.length !==
    1
  ) {
    throw new GoogleAdsMediaSyncWorkerClaimRepositoryError(
      "INVALID_RECORD",
      "The Google Ads media sync claim RPC returned more than one job.",
    );
  }

  return await parseClaimedGoogleAdsJob(
    data[0],
    parseJobRecord,
  );
}

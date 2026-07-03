import { getSupabaseAdmin } from "../supabase/admin";
import {
  decryptNaverSearchAdsConnection,
  MediaConnectionsRepositoryError,
} from "./media-connections-repository";
import {
  MediaSyncJobsRepositoryError,
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import type {
  MediaSyncJobRecord,
} from "./types";
import type {
  NaverSearchAdsCredentials,
} from "./connection-credentials";

const CLAIM_NEXT_NAVER_MEDIA_SYNC_JOB_RPC =
  "claim_next_naver_media_sync_job";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const CLAIMED_JOB_STATUS =
  "processing" as const;

const ACTIVE_CONNECTION_STATUS =
  "active" as const;

export type MediaSyncWorkerRepositoryErrorCode =
  | "INVALID_RECORD"
  | "DATABASE_ERROR"
  | "CLAIM_ERROR"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_SCOPE_MISMATCH"
  | "CONNECTION_NOT_ACTIVE"
  | "CREDENTIAL_ERROR";

export class MediaSyncWorkerRepositoryError extends Error {
  readonly code: MediaSyncWorkerRepositoryErrorCode;

  constructor(
    code: MediaSyncWorkerRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaSyncWorkerRepositoryError";
    this.code = code;
  }
}

export type NaverMediaSyncWorkerConnectionContext = {
  id: string;
  workspaceId: string;
  advertiserId: string;
  provider: typeof NAVER_SEARCH_ADS_PROVIDER;
  externalAccountId: string;
};

export type NaverMediaSyncWorkerContext = {
  job: MediaSyncJobRecord;
  connection: NaverMediaSyncWorkerConnectionContext;
  credentials: NaverSearchAdsCredentials;
};

function wrapClaimError(
  error: unknown,
): MediaSyncWorkerRepositoryError {
  return new MediaSyncWorkerRepositoryError(
    "CLAIM_ERROR",
    "The next media sync job could not be claimed.",
    { cause: error },
  );
}

function wrapDatabaseError(
  error: unknown,
): MediaSyncWorkerRepositoryError {
  return new MediaSyncWorkerRepositoryError(
    "DATABASE_ERROR",
    "The media sync worker repository could not access the database.",
    { cause: error },
  );
}

function parseClaimedJob(
  value: unknown,
): MediaSyncJobRecord {
  let record: MediaSyncJobRecord;

  try {
    record =
      parseMediaSyncJobRecord(value);
  } catch (error) {
    if (
      error instanceof
        MediaSyncJobsRepositoryError &&
      error.code === "INVALID_RECORD"
    ) {
      throw new MediaSyncWorkerRepositoryError(
        "INVALID_RECORD",
        "The claimed media sync job record is invalid.",
        { cause: error },
      );
    }

    throw error;
  }

  if (
    record.provider !==
    NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The claimed media sync job has an unexpected provider.",
    );
  }

  if (
    record.status !== CLAIMED_JOB_STATUS
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The claimed media sync job has an unexpected status.",
    );
  }

  if (record.started_at === null) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The claimed media sync job has no started_at value.",
    );
  }

  if (record.attempt_count < 1) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The claimed media sync job has an invalid attempt_count value.",
    );
  }

  if (record.error !== null) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The claimed media sync job still contains an error value.",
    );
  }

  if (record.error_detail !== null) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The claimed media sync job still contains error_detail.",
    );
  }

  return record;
}

function validateProcessingNaverJob(
  job: MediaSyncJobRecord,
): void {
  if (
    job.provider !==
    NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads jobs are supported at this stage.",
    );
  }

  if (job.status !== CLAIMED_JOB_STATUS) {
    throw new MediaSyncWorkerRepositoryError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing before its worker context can be loaded.",
    );
  }

  if (job.started_at === null) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The processing media sync job has no started_at value.",
    );
  }

  if (job.attempt_count < 1) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The processing media sync job has an invalid attempt_count value.",
    );
  }
}

export async function claimNextNaverMediaSyncJob(): Promise<
  MediaSyncJobRecord | null
> {
  const supabase = getSupabaseAdmin();

  let result;

  try {
    result = await supabase.rpc(
      CLAIM_NEXT_NAVER_MEDIA_SYNC_JOB_RPC,
    );
  } catch (error) {
    throw wrapDatabaseError(error);
  }

  const { data, error } = result;

  if (error) {
    throw wrapClaimError(error);
  }

  if (data === null) {
    return null;
  }

  if (!Array.isArray(data)) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The media sync claim RPC returned an invalid result.",
    );
  }

  if (data.length === 0) {
    return null;
  }

  if (data.length !== 1) {
    throw new MediaSyncWorkerRepositoryError(
      "INVALID_RECORD",
      "The media sync claim RPC returned more than one job.",
    );
  }

  return parseClaimedJob(data[0]);
}

export async function loadNaverMediaSyncWorkerContext(
  job: MediaSyncJobRecord,
): Promise<NaverMediaSyncWorkerContext> {
  validateProcessingNaverJob(job);

  let decryptedConnection;

  try {
    decryptedConnection =
      await decryptNaverSearchAdsConnection({
        connectionId: job.connection_id,
        workspaceId: job.workspace_id,
        advertiserId: job.advertiser_id,
      });
  } catch (error) {
    if (
      error instanceof
      MediaConnectionsRepositoryError
    ) {
      if (
        error.code ===
        "CONNECTION_NOT_FOUND"
      ) {
        throw new MediaSyncWorkerRepositoryError(
          "CONNECTION_NOT_FOUND",
          "The media connection for the claimed job was not found.",
          { cause: error },
        );
      }

      if (
        error.code ===
          "UNSUPPORTED_PROVIDER" ||
        error.code ===
          "DECRYPTION_ERROR"
      ) {
        throw new MediaSyncWorkerRepositoryError(
          "CREDENTIAL_ERROR",
          "The media connection credentials could not be loaded.",
          { cause: error },
        );
      }

      if (error.code === "DATABASE_ERROR") {
        throw new MediaSyncWorkerRepositoryError(
          "DATABASE_ERROR",
          "The media connection for the claimed job could not be loaded.",
          { cause: error },
        );
      }

      throw new MediaSyncWorkerRepositoryError(
        "CREDENTIAL_ERROR",
        "The media connection credentials could not be loaded.",
        { cause: error },
      );
    }

    throw new MediaSyncWorkerRepositoryError(
      "CREDENTIAL_ERROR",
      "The media connection credentials could not be loaded.",
      { cause: error },
    );
  }

  const {
    connection,
    credentials,
  } = decryptedConnection;

  if (
    connection.id !== job.connection_id ||
    connection.workspace_id !==
      job.workspace_id ||
    connection.advertiser_id !==
      job.advertiser_id
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "CONNECTION_SCOPE_MISMATCH",
      "The media connection does not match the claimed job scope.",
    );
  }

  if (
    connection.provider !==
      NAVER_SEARCH_ADS_PROVIDER ||
    job.provider !==
      NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "The claimed job and media connection must both use Naver Search Ads.",
    );
  }

  if (
    connection.external_account_id !==
    job.external_account_id
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "CONNECTION_SCOPE_MISMATCH",
      "The media connection account does not match the claimed job account.",
    );
  }

  if (
    connection.status !==
    ACTIVE_CONNECTION_STATUS
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "CONNECTION_NOT_ACTIVE",
      "The media connection for the claimed job is not active.",
    );
  }

  if (
    credentials.customerId !==
    connection.external_account_id
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "CREDENTIAL_ERROR",
      "The decrypted credential customer ID does not match the media connection account.",
    );
  }

  if (
    credentials.customerId !==
    job.external_account_id
  ) {
    throw new MediaSyncWorkerRepositoryError(
      "CREDENTIAL_ERROR",
      "The decrypted credential customer ID does not match the claimed job account.",
    );
  }

  return {
    job,
    connection: {
      id: connection.id,
      workspaceId:
        connection.workspace_id,
      advertiserId:
        connection.advertiser_id,
      provider:
        NAVER_SEARCH_ADS_PROVIDER,
      externalAccountId:
        connection.external_account_id,
    },
    credentials: {
      customerId:
        credentials.customerId,
      accessLicense:
        credentials.accessLicense,
      secretKey:
        credentials.secretKey,
    },
  };
}
import type {
  GoogleAdsKeywordProcessingOrchestratorResult,
} from "./google-ads-keyword-processing-orchestrator";
import type {
  MediaConnectionRecord,
  MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const ACTIVE_CONNECTION_STATUS =
  "active" as const;

const PROCESSING_JOB_STATUS =
  "processing" as const;

const KEYWORD_DATA_LEVEL =
  "keyword" as const;

const SNAPSHOT_REPLACE_MODE =
  "snapshot_replace" as const;

const GOOGLE_ADS_CREDENTIAL_VERSION =
  1 as const;

const GOOGLE_ADS_CUSTOMER_ID_PATTERN =
  /^\d{10}$/u;

export type GoogleAdsMediaSyncRuntimeAdapterErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_CONNECTION"
  | "INVALID_CREDENTIALS"
  | "INVALID_OAUTH_CONFIG"
  | "INVALID_ACCESS_TOKEN";

export class GoogleAdsMediaSyncRuntimeAdapterError
  extends Error {
  readonly code:
    GoogleAdsMediaSyncRuntimeAdapterErrorCode;

  constructor(
    code:
      GoogleAdsMediaSyncRuntimeAdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsMediaSyncRuntimeAdapterError";

    this.code =
      code;
  }
}

export type GoogleAdsRuntimeConnectionLoadInput =
  Readonly<{
    connectionId: string;
    workspaceId: string;
    advertiserId: string;
  }>;

export type GoogleAdsRuntimeCredentialContext =
  Readonly<{
    connectionId: string;
    workspaceId: string;
    advertiserId: string;
    provider: typeof GOOGLE_ADS_PROVIDER;
    externalAccountId: string;
  }>;

export type GoogleAdsRuntimeCredentials =
  Readonly<{
    refreshToken: string;
    loginCustomerId: string | null;
  }>;

export type GoogleAdsRuntimeOAuthConfig =
  Readonly<{
    developerToken: string;
    clientId: string;
    clientSecret: string;
  }>;

export type GoogleAdsRuntimeAccessToken =
  Readonly<{
    accessToken: string;
  }>;

export type GoogleAdsRuntimeRefreshInput =
  Readonly<{
    config: Readonly<{
      clientId: string;
      clientSecret: string;
    }>;
    refreshToken: string;
  }>;

export type GoogleAdsRuntimeProcessingInput =
  Readonly<{
    job: MediaSyncJobRecord;
    accessToken: string;
    developerToken: string;
    loginCustomerId: string | null;
    dateWindowIndex?: number;
    cursor?: unknown;
  }>;

export type GoogleAdsMediaSyncRuntimeAdapterDependencies =
  Readonly<{
    loadConnection?: (
      input:
        GoogleAdsRuntimeConnectionLoadInput,
    ) => Promise<MediaConnectionRecord>;

    decryptCredentials?: (
      credentialCiphertext: string,
      context:
        GoogleAdsRuntimeCredentialContext,
    ) =>
      | GoogleAdsRuntimeCredentials
      | Promise<GoogleAdsRuntimeCredentials>;

    readOAuthConfig?: () =>
      | GoogleAdsRuntimeOAuthConfig
      | Promise<GoogleAdsRuntimeOAuthConfig>;

    refreshAccessToken?: (
      input:
        GoogleAdsRuntimeRefreshInput,
    ) => Promise<GoogleAdsRuntimeAccessToken>;

    runProcessing?: (
      input:
        GoogleAdsRuntimeProcessingInput,
    ) => Promise<
      GoogleAdsKeywordProcessingOrchestratorResult
    >;
  }>;

export type ProcessClaimedGoogleAdsKeywordJobInput =
  Readonly<{
    job: MediaSyncJobRecord;

    /**
     * Durable resume coordinates are supplied by the worker
     * from the already-persisted Google processing checkpoint.
     *
     * This adapter deliberately does not invent or reinterpret
     * the checkpoint JSON contract.
     */
    dateWindowIndex?: number;
    cursor?: unknown;
  }>;

function requireExactNonEmptyString(
  value: unknown,
  code:
    GoogleAdsMediaSyncRuntimeAdapterErrorCode,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      code,
      `${fieldName} is invalid.`,
    );
  }

  return value;
}

function requireNonNegativeSafeInteger(
  value: unknown,
  code:
    GoogleAdsMediaSyncRuntimeAdapterErrorCode,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      code,
      `${fieldName} is invalid.`,
    );
  }

  return value;
}

function isValidYmd(
  value: unknown,
): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
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
    Number(yearText);

  const month =
    Number(monthText);

  const day =
    Number(dayText);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function assertClaimedGoogleAdsJob(
  input:
    ProcessClaimedGoogleAdsKeywordJobInput,
): void {
  const job =
    input.job;

  if (
    !job ||
    typeof job !== "object"
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_INPUT",
      "A claimed Google Ads media sync job is required.",
    );
  }

  if (
    job.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The claimed media sync job is not a Google Ads job.",
    );
  }

  if (
    job.status !==
    PROCESSING_JOB_STATUS
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads media sync job is not processing.",
    );
  }

  if (
    job.data_level !==
    KEYWORD_DATA_LEVEL
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads media sync job is not a keyword job.",
    );
  }

  if (
    job.mode !==
    SNAPSHOT_REPLACE_MODE
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads media sync job has an unsupported mode.",
    );
  }

  requireExactNonEmptyString(
    job.id,
    "INVALID_JOB",
    "job.id",
  );

  requireExactNonEmptyString(
    job.connection_id,
    "INVALID_JOB",
    "job.connection_id",
  );

  requireExactNonEmptyString(
    job.workspace_id,
    "INVALID_JOB",
    "job.workspace_id",
  );

  requireExactNonEmptyString(
    job.advertiser_id,
    "INVALID_JOB",
    "job.advertiser_id",
  );

  requireExactNonEmptyString(
    job.report_id,
    "INVALID_JOB",
    "job.report_id",
  );

  const externalAccountId =
    requireExactNonEmptyString(
      job.external_account_id,
      "INVALID_JOB",
      "job.external_account_id",
    );

  if (
    !GOOGLE_ADS_CUSTOMER_ID_PATTERN.test(
      externalAccountId,
    )
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads media sync job has an invalid external account ID.",
    );
  }

  if (
    !isValidYmd(
      job.date_from,
    ) ||
    !isValidYmd(
      job.date_to,
    ) ||
    job.date_from >
      job.date_to
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads media sync job has an invalid date range.",
    );
  }

  requireNonNegativeSafeInteger(
    job.raw_rows,
    "INVALID_JOB",
    "job.raw_rows",
  );

  requireNonNegativeSafeInteger(
    job.normalized_rows,
    "INVALID_JOB",
    "job.normalized_rows",
  );

  requireNonNegativeSafeInteger(
    job.inserted_rows,
    "INVALID_JOB",
    "job.inserted_rows",
  );

  const failedRows =
    requireNonNegativeSafeInteger(
      job.failed_rows,
      "INVALID_JOB",
      "job.failed_rows",
    );

  if (
    failedRows !== 0
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads media sync job contains failed rows.",
    );
  }

  if (
    !Number.isSafeInteger(
      job.attempt_count,
    ) ||
    job.attempt_count < 1 ||
    job.started_at === null ||
    job.error !== null
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_JOB",
      "The claimed Google Ads media sync job lifecycle is invalid.",
    );
  }

  if (
    input.dateWindowIndex !==
      undefined &&
    (
      !Number.isSafeInteger(
        input.dateWindowIndex,
      ) ||
      input.dateWindowIndex < 0
    )
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_INPUT",
      "dateWindowIndex is invalid.",
    );
  }
}

function assertConnectionAuthority(
  connection:
    MediaConnectionRecord,
  job:
    MediaSyncJobRecord,
): string {
  if (
    connection.id !==
      job.connection_id ||
    connection.workspace_id !==
      job.workspace_id ||
    connection.advertiser_id !==
      job.advertiser_id
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection scope does not match the claimed job.",
    );
  }

  if (
    connection.provider !==
    GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The claimed job connection is not a Google Ads connection.",
    );
  }

  if (
    connection.status !==
    ACTIVE_CONNECTION_STATUS
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection is not active.",
    );
  }

  if (
    connection.external_account_id !==
    job.external_account_id
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection account does not match the claimed job.",
    );
  }

  if (
    connection.credential_version !==
    GOOGLE_ADS_CREDENTIAL_VERSION
  ) {
    throw new GoogleAdsMediaSyncRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection credential version is unsupported.",
    );
  }

  return requireExactNonEmptyString(
    connection.credential_ciphertext,
    "INVALID_CONNECTION",
    "connection.credential_ciphertext",
  );
}

function assertRuntimeCredentials(
  credentials:
    GoogleAdsRuntimeCredentials,
): GoogleAdsRuntimeCredentials {
  const refreshToken =
    requireExactNonEmptyString(
      credentials?.refreshToken,
      "INVALID_CREDENTIALS",
      "Google Ads refresh credential",
    );

  let loginCustomerId:
    string | null =
      null;

  if (
    credentials.loginCustomerId !==
    null
  ) {
    loginCustomerId =
      requireExactNonEmptyString(
        credentials.loginCustomerId,
        "INVALID_CREDENTIALS",
        "Google Ads login customer ID",
      );

    if (
      !GOOGLE_ADS_CUSTOMER_ID_PATTERN.test(
        loginCustomerId,
      )
    ) {
      throw new GoogleAdsMediaSyncRuntimeAdapterError(
        "INVALID_CREDENTIALS",
        "The Google Ads login customer ID is invalid.",
      );
    }
  }

  return {
    refreshToken,
    loginCustomerId,
  };
}

function assertOAuthConfig(
  config:
    GoogleAdsRuntimeOAuthConfig,
): GoogleAdsRuntimeOAuthConfig {
  return {
    developerToken:
      requireExactNonEmptyString(
        config?.developerToken,
        "INVALID_OAUTH_CONFIG",
        "Google Ads developer token configuration",
      ),

    clientId:
      requireExactNonEmptyString(
        config?.clientId,
        "INVALID_OAUTH_CONFIG",
        "Google Ads OAuth client ID configuration",
      ),

    clientSecret:
      requireExactNonEmptyString(
        config?.clientSecret,
        "INVALID_OAUTH_CONFIG",
        "Google Ads OAuth client secret configuration",
      ),
  };
}

function assertAccessToken(
  token:
    GoogleAdsRuntimeAccessToken,
): GoogleAdsRuntimeAccessToken {
  return {
    accessToken:
      requireExactNonEmptyString(
        token?.accessToken,
        "INVALID_ACCESS_TOKEN",
        "Google Ads access token",
      ),
  };
}

async function loadDefaultConnection(
  input:
    GoogleAdsRuntimeConnectionLoadInput,
): Promise<MediaConnectionRecord> {
  const {
    requireMediaConnectionRecord,
  } =
    await import(
      "./media-connections-repository"
    );

  return await requireMediaConnectionRecord(
    input,
  );
}

async function decryptDefaultCredentials(
  credentialCiphertext:
    string,
  context:
    GoogleAdsRuntimeCredentialContext,
): Promise<GoogleAdsRuntimeCredentials> {
  const {
    decryptGoogleAdsCredentials,
  } =
    await import(
      "./google-ads-credentials"
    );

  const credentials =
    decryptGoogleAdsCredentials(
      credentialCiphertext,
      context,
    );

  return {
    refreshToken:
      credentials.refresh_token,
    loginCustomerId:
      credentials.login_customer_id,
  };
}

async function readDefaultOAuthConfig():
  Promise<GoogleAdsRuntimeOAuthConfig> {
  const {
    readGoogleAdsOAuthConfig,
  } =
    await import(
      "./google-ads-oauth-config"
    );

  const config =
    readGoogleAdsOAuthConfig();

  return {
    developerToken:
      config.developerToken,
    clientId:
      config.clientId,
    clientSecret:
      config.clientSecret,
  };
}

async function refreshDefaultAccessToken(
  input:
    GoogleAdsRuntimeRefreshInput,
): Promise<GoogleAdsRuntimeAccessToken> {
  const {
    refreshGoogleAdsAccessToken,
  } =
    await import(
      "./google-ads-access-token-refresh"
    );

  const refreshed =
    await refreshGoogleAdsAccessToken({
      config:
        input.config,
      refreshToken:
        input.refreshToken,
    });

  return {
    accessToken:
      refreshed.accessToken,
  };
}

async function runDefaultProcessing(
  input:
    GoogleAdsRuntimeProcessingInput,
): Promise<
  GoogleAdsKeywordProcessingOrchestratorResult
> {
  const {
    runGoogleAdsKeywordProcessingOrchestrator,
  } =
    await import(
      "./google-ads-keyword-processing-orchestrator"
    );

  return await runGoogleAdsKeywordProcessingOrchestrator(
    input,
  );
}

export async function processClaimedGoogleAdsKeywordJob(
  input:
    ProcessClaimedGoogleAdsKeywordJobInput,
  dependencies:
    GoogleAdsMediaSyncRuntimeAdapterDependencies = {},
): Promise<
  GoogleAdsKeywordProcessingOrchestratorResult
> {
  assertClaimedGoogleAdsJob(
    input,
  );

  const loadConnection =
    dependencies.loadConnection ??
    loadDefaultConnection;

  const decryptCredentials =
    dependencies.decryptCredentials ??
    decryptDefaultCredentials;

  const readOAuthConfig =
    dependencies.readOAuthConfig ??
    readDefaultOAuthConfig;

  const refreshAccessToken =
    dependencies.refreshAccessToken ??
    refreshDefaultAccessToken;

  const runProcessing =
    dependencies.runProcessing ??
    runDefaultProcessing;

  const job =
    input.job;

  const connection =
    await loadConnection({
      connectionId:
        job.connection_id,
      workspaceId:
        job.workspace_id,
      advertiserId:
        job.advertiser_id,
    });

  const credentialCiphertext =
    assertConnectionAuthority(
      connection,
      job,
    );

  const credentialContext:
    GoogleAdsRuntimeCredentialContext = {
      connectionId:
        connection.id,
      workspaceId:
        connection.workspace_id,
      advertiserId:
        connection.advertiser_id,
      provider:
        GOOGLE_ADS_PROVIDER,
      externalAccountId:
        connection.external_account_id,
    };

  const credentials =
    assertRuntimeCredentials(
      await decryptCredentials(
        credentialCiphertext,
        credentialContext,
      ),
    );

  const oauthConfig =
    assertOAuthConfig(
      await readOAuthConfig(),
    );

  const refreshed =
    assertAccessToken(
      await refreshAccessToken({
        config: {
          clientId:
            oauthConfig.clientId,
          clientSecret:
            oauthConfig.clientSecret,
        },
        refreshToken:
          credentials.refreshToken,
      }),
    );

  const processingInput:
    GoogleAdsRuntimeProcessingInput = {
      job,

      accessToken:
        refreshed.accessToken,

      developerToken:
        oauthConfig.developerToken,

      loginCustomerId:
        credentials.loginCustomerId,

      ...(
        input.dateWindowIndex ===
        undefined
          ? {}
          : {
              dateWindowIndex:
                input.dateWindowIndex,
            }
      ),

      ...(
        input.cursor ===
        undefined
          ? {}
          : {
              cursor:
                input.cursor,
            }
      ),
    };

  return await runProcessing(
    processingInput,
  );
}

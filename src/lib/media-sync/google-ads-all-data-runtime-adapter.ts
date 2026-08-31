import {
  collectGoogleAdsAccountInventory,
} from "./google-ads-account-inventory";
import {
  buildGoogleAdsAllDataExecutableProductRoute,
  validateGoogleAdsAllDataProductRoutingState,
} from "./google-ads-all-data-product-routing";
import {
  saveGoogleAdsAllDataProductRoutingBootstrap,
} from "./google-ads-all-data-product-routing-bootstrap-repository";
import {
  readGoogleAdsAllDataProcessingCheckpoint,
  type GoogleAdsAllDataProcessingCheckpointState,
} from "./google-ads-all-data-processing-checkpoint";
import type {
  GoogleAdsAllDataProcessingOrchestratorDependencies,
  GoogleAdsAllDataProcessingOrchestratorInput,
  GoogleAdsAllDataProcessingOrchestratorResult,
} from "./google-ads-all-data-processing-orchestrator";
import type {
  MediaConnectionRecord,
  MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const ACTIVE_CONNECTION_STATUS =
  "active" as const;

const PROCESSING_JOB_STATUS =
  "processing" as const;

const SNAPSHOT_REPLACE_MODE =
  "snapshot_replace" as const;

const GOOGLE_ADS_CREDENTIAL_VERSION =
  1 as const;

const GOOGLE_ADS_CUSTOMER_ID_PATTERN =
  /^\d{10}$/u;

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/u;

export type GoogleAdsAllDataRuntimeAdapterErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_CONNECTION"
  | "INVALID_CREDENTIALS"
  | "INVALID_OAUTH_CONFIG"
  | "INVALID_ACCESS_TOKEN"
  | "COMPLETED_CHECKPOINT";

export class GoogleAdsAllDataRuntimeAdapterError
  extends Error {
  readonly code:
    GoogleAdsAllDataRuntimeAdapterErrorCode;

  constructor(
    code:
      GoogleAdsAllDataRuntimeAdapterErrorCode,
    message:
      string,
    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataRuntimeAdapterError";

    this.code =
      code;
  }
}

export type ProcessClaimedGoogleAdsAllDataJobInput =
  Readonly<{
    job:
      MediaSyncJobRecord &
      Readonly<{
        execution_contract?:
          unknown;
      }>;

    executionContract:
      "google_all_data_v1";
  }>;

export type GoogleAdsAllDataRuntimeConnectionLoadInput =
  Readonly<{
    connectionId:
      string;

    workspaceId:
      string;

    advertiserId:
      string;
  }>;

export type GoogleAdsAllDataRuntimeCredentialContext =
  Readonly<{
    connectionId:
      string;

    workspaceId:
      string;

    advertiserId:
      string;

    provider:
      "google_ads";

    externalAccountId:
      string;
  }>;

export type GoogleAdsAllDataRuntimeCredentials =
  Readonly<{
    refreshToken:
      string;

    loginCustomerId:
      string |
      null;
  }>;

export type GoogleAdsAllDataRuntimeOAuthConfig =
  Readonly<{
    developerToken:
      string;

    clientId:
      string;

    clientSecret:
      string;
  }>;

export type GoogleAdsAllDataRuntimeAccessToken =
  Readonly<{
    accessToken:
      string;
  }>;

export type GoogleAdsAllDataRuntimeRefreshInput =
  Readonly<{
    config:
      Readonly<{
        clientId:
          string;

        clientSecret:
          string;
      }>;

    refreshToken:
      string;
  }>;

export type GoogleAdsAllDataRuntimeAdapterDependencies =
  Readonly<{
    readCheckpoint?:
      (
        job:
          MediaSyncJobRecord,
      ) =>
        GoogleAdsAllDataProcessingCheckpointState;

    loadConnection?:
      (
        input:
          GoogleAdsAllDataRuntimeConnectionLoadInput,
      ) =>
        Promise<
          MediaConnectionRecord
        >;

    decryptCredentials?:
      (
        credentialCiphertext:
          string,
        context:
          GoogleAdsAllDataRuntimeCredentialContext,
      ) =>
        | GoogleAdsAllDataRuntimeCredentials
        | Promise<
            GoogleAdsAllDataRuntimeCredentials
          >;

    readOAuthConfig?:
      () =>
        | GoogleAdsAllDataRuntimeOAuthConfig
        | Promise<
            GoogleAdsAllDataRuntimeOAuthConfig
          >;

    refreshAccessToken?:
      (
        input:
          GoogleAdsAllDataRuntimeRefreshInput,
      ) =>
        Promise<
          GoogleAdsAllDataRuntimeAccessToken
        >;

    collectAccountInventory?:
      typeof collectGoogleAdsAccountInventory;

    saveProductRoutingBootstrap?:
      typeof saveGoogleAdsAllDataProductRoutingBootstrap;

    runProcessing?:
      (
        input:
          GoogleAdsAllDataProcessingOrchestratorInput,
        dependencies?:
          GoogleAdsAllDataProcessingOrchestratorDependencies,
      ) =>
        Promise<
          GoogleAdsAllDataProcessingOrchestratorResult
        >;

    processingDependencies?:
      GoogleAdsAllDataProcessingOrchestratorDependencies;
  }>;

function requireExactNonEmptyString(
  value:
    unknown,
  code:
    GoogleAdsAllDataRuntimeAdapterErrorCode,
  fieldName:
    string,
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      code,
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value;
}

function requireNonNegativeSafeInteger(
  value:
    unknown,
  code:
    GoogleAdsAllDataRuntimeAdapterErrorCode,
  fieldName:
    string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    (
      value as number
    ) < 0
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      code,
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value as number;
}

function isValidYmd(
  value:
    unknown,
): value is string {
  if (
    typeof value !==
      "string" ||
    !YMD_PATTERN.test(
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

function assertClaimedGoogleAdsAllDataJob(
  input:
    ProcessClaimedGoogleAdsAllDataJobInput,
): void {
  const job =
    input.job;

  if (
    !job ||
    typeof job !==
      "object"
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_INPUT",
      "A claimed Google Ads ALL-DATA media sync job is required.",
    );
  }

  if (
    input.executionContract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT ||
    job.execution_contract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The claimed Google Ads job does not use the ALL-DATA execution contract.",
    );
  }

  if (
    job.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The claimed media sync job is not a Google Ads job.",
    );
  }

  if (
    job.status !==
      PROCESSING_JOB_STATUS
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA media sync job is not processing.",
    );
  }

  if (
    job.mode !==
      SNAPSHOT_REPLACE_MODE
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA media sync job has an unsupported mode.",
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
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA job has an invalid external account ID.",
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
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA job has an invalid date range.",
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
    failedRows !==
      0
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA job contains failed rows.",
    );
  }

  if (
    !Number.isSafeInteger(
      job.attempt_count,
    ) ||
    job.attempt_count <
      1 ||
    job.started_at ===
      null ||
    job.error !==
      null
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_JOB",
      "The claimed Google Ads ALL-DATA job lifecycle is invalid.",
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
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection scope does not match the claimed ALL-DATA job.",
    );
  }

  if (
    connection.provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The claimed ALL-DATA job connection is not a Google Ads connection.",
    );
  }

  if (
    connection.status !==
      ACTIVE_CONNECTION_STATUS
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection is not active.",
    );
  }

  if (
    connection.external_account_id !==
      job.external_account_id
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_CONNECTION",
      "The Google Ads media connection account does not match the claimed ALL-DATA job.",
    );
  }

  if (
    connection.credential_version !==
      GOOGLE_ADS_CREDENTIAL_VERSION
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
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
    GoogleAdsAllDataRuntimeCredentials,
): GoogleAdsAllDataRuntimeCredentials {
  const refreshToken =
    requireExactNonEmptyString(
      credentials?.refreshToken,
      "INVALID_CREDENTIALS",
      "Google Ads refresh credential",
    );

  let loginCustomerId:
    string |
    null =
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
      throw new GoogleAdsAllDataRuntimeAdapterError(
        "INVALID_CREDENTIALS",
        "The Google Ads login customer ID is invalid.",
      );
    }
  }

  return Object.freeze({
    refreshToken,
    loginCustomerId,
  });
}

function assertOAuthConfig(
  config:
    GoogleAdsAllDataRuntimeOAuthConfig,
): GoogleAdsAllDataRuntimeOAuthConfig {
  return Object.freeze({
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
  });
}

function assertAccessToken(
  token:
    GoogleAdsAllDataRuntimeAccessToken,
): GoogleAdsAllDataRuntimeAccessToken {
  return Object.freeze({
    accessToken:
      requireExactNonEmptyString(
        token?.accessToken,
        "INVALID_ACCESS_TOKEN",
        "Google Ads access token",
      ),
  });
}

async function loadDefaultConnection(
  input:
    GoogleAdsAllDataRuntimeConnectionLoadInput,
): Promise<
  MediaConnectionRecord
> {
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
    GoogleAdsAllDataRuntimeCredentialContext,
): Promise<
  GoogleAdsAllDataRuntimeCredentials
> {
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
  Promise<
    GoogleAdsAllDataRuntimeOAuthConfig
  > {
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
    GoogleAdsAllDataRuntimeRefreshInput,
): Promise<
  GoogleAdsAllDataRuntimeAccessToken
> {
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
    GoogleAdsAllDataProcessingOrchestratorInput,
  dependencies?:
    GoogleAdsAllDataProcessingOrchestratorDependencies,
): Promise<
  GoogleAdsAllDataProcessingOrchestratorResult
> {
  const {
    runGoogleAdsAllDataProcessingOrchestrator,
  } =
    await import(
      "./google-ads-all-data-processing-orchestrator"
    );

  return await runGoogleAdsAllDataProcessingOrchestrator(
    input,
    dependencies,
  );
}

function resolveResumeCoordinates(
  state:
    GoogleAdsAllDataProcessingCheckpointState,
): Readonly<{
  dateWindowIndex:
    number;

  cursor?:
    unknown;
}> {
  if (
    state.complete
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "COMPLETED_CHECKPOINT",
      "A completed Google Ads ALL-DATA checkpoint cannot re-enter page processing.",
    );
  }

  const routing =
    state.routing ??
    null;

  if (
    !state.hasCheckpoint
  ) {
    if (
      state.dateWindowIndex !==
        null ||
      state.cursor !==
        null ||
      state.nextRowIndex !==
        0 ||
      routing !==
        null
    ) {
      throw new GoogleAdsAllDataRuntimeAdapterError(
        "INVALID_INPUT",
        "A fresh Google Ads ALL-DATA checkpoint state is inconsistent.",
      );
    }

    return Object.freeze({
      dateWindowIndex:
        0,
    });
  }

  if (
    state.phase ===
      "product_boundary"
  ) {
    if (
      state.dateWindowIndex !==
        0 ||
      (
        routing?.productIndex ===
          0 &&
        state.nextRowIndex !==
          0
      ) ||
      state.cursor !==
        null ||
      routing ===
        null ||
      routing.complete ||
      !(
        (
          routing.productFamily ===
            "search" &&
          routing.productIndex ===
            0
        ) ||
        routing.productFamily ===
          "demand_gen"
      )
    ) {
      throw new GoogleAdsAllDataRuntimeAdapterError(
        "INVALID_INPUT",
        "Only durable SEARCH or DEMAND_GEN product boundaries may enter the current Google Ads ALL-DATA page-processing runtime.",
      );
    }

    return Object.freeze({
      dateWindowIndex:
        0,
    });
  }

  if (
    !Number.isSafeInteger(
      state.dateWindowIndex,
    ) ||
    (
      state.dateWindowIndex as number
    ) < 0 ||
    state.cursor ===
      null
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_INPUT",
      "The durable Google Ads ALL-DATA resume checkpoint is incomplete.",
    );
  }

  return Object.freeze({
    dateWindowIndex:
      state.dateWindowIndex as number,

    cursor:
      state.cursor,
  });
}

export async function processClaimedGoogleAdsAllDataJob(
  input:
    ProcessClaimedGoogleAdsAllDataJobInput,
  dependencies:
    GoogleAdsAllDataRuntimeAdapterDependencies = {},
): Promise<
  GoogleAdsAllDataProcessingOrchestratorResult
> {
  assertClaimedGoogleAdsAllDataJob(
    input,
  );

  const readCheckpoint =
    dependencies.readCheckpoint ??
    readGoogleAdsAllDataProcessingCheckpoint;

  /*
   * Durable resume authority must be validated before
   * connection lookup, credential decryption, OAuth config
   * access, token refresh, or Google Ads page processing.
   */
  const checkpointState =
    readCheckpoint(
      input.job,
    );

  const resume =
    resolveResumeCoordinates(
      checkpointState,
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

  const collectAccountInventory =
    dependencies.collectAccountInventory ??
    collectGoogleAdsAccountInventory;

  const saveProductRoutingBootstrap =
    dependencies.saveProductRoutingBootstrap ??
    saveGoogleAdsAllDataProductRoutingBootstrap;

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
    GoogleAdsAllDataRuntimeCredentialContext = {
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

  let processingJob:
    MediaSyncJobRecord =
      job;

  let routing =
    checkpointState.routing ??
    null;

  if (
    !checkpointState.hasCheckpoint
  ) {
    const inventory =
      await collectAccountInventory({
        accessToken:
          refreshed.accessToken,

        developerToken:
          oauthConfig.developerToken,

        targetCustomerId:
          job.external_account_id,

        loginCustomerId:
          credentials.loginCustomerId,
      });

    const route =
      buildGoogleAdsAllDataExecutableProductRoute(
        inventory.supportedCampaigns.map(
          campaign =>
            campaign.productFamily,
        ),
      );

    if (
      route.length ===
        0
    ) {
      throw new GoogleAdsAllDataRuntimeAdapterError(
        "INVALID_INPUT",
        "The Google Ads account inventory did not contain a supported ALL-DATA product.",
      );
    }

    const initialRouting =
      validateGoogleAdsAllDataProductRoutingState({
        route,

        productIndex:
          0,

        productFamily:
          route[0],

        complete:
          false,
      });

    const bootstrapJob =
      await saveProductRoutingBootstrap({
        job,

        routing:
          initialRouting,
      });

    const durableBootstrap =
      readGoogleAdsAllDataProcessingCheckpoint(
        bootstrapJob,
      );

    const durableRouting =
      durableBootstrap.routing ??
      null;

    if (
      !durableBootstrap.hasCheckpoint ||
      durableBootstrap.phase !==
        "product_boundary" ||
      durableBootstrap.dateWindowIndex !==
        0 ||
      durableBootstrap.nextRowIndex !==
        0 ||
      durableBootstrap.complete ||
      durableBootstrap.cursor !==
        null ||
      durableRouting ===
        null ||
      JSON.stringify(
        durableRouting,
      ) !==
        JSON.stringify(
          initialRouting,
        )
    ) {
      throw new GoogleAdsAllDataRuntimeAdapterError(
        "INVALID_INPUT",
        "The durable Google Ads ALL-DATA product-route bootstrap does not match the discovered account inventory.",
      );
    }

    processingJob =
      bootstrapJob;

    routing =
      durableRouting;
  }

  if (
    routing !==
      null &&
    (
      routing.complete ||
      (
        routing.productFamily !==
          "search" &&
        routing.productFamily !==
          "demand_gen"
      )
    )
  ) {
    throw new GoogleAdsAllDataRuntimeAdapterError(
      "INVALID_INPUT",
      "The current Google Ads ALL-DATA runtime can only execute SEARCH or DEMAND_GEN products.",
    );
  }

  const processingInput:
    GoogleAdsAllDataProcessingOrchestratorInput = {
      job:
        processingJob,

      accessToken:
        refreshed.accessToken,

      developerToken:
        oauthConfig.developerToken,

      loginCustomerId:
        credentials.loginCustomerId,

      dateWindowIndex:
        resume.dateWindowIndex,

      ...(
        resume.cursor ===
          undefined
          ? {}
          : {
              cursor:
                resume.cursor,
            }
      ),

      ...(
        routing ===
          null
          ? {}
          : {
              routing,
            }
      ),
    };

  return await runProcessing(
    processingInput,
    dependencies.processingDependencies,
  );
}

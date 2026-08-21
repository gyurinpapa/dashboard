import assert from "node:assert/strict";

import {
  GoogleAdsMediaSyncRuntimeAdapterError,
  processClaimedGoogleAdsKeywordJob,
  type GoogleAdsMediaSyncRuntimeAdapterDependencies,
  type GoogleAdsRuntimeConnectionLoadInput,
  type GoogleAdsRuntimeCredentialContext,
  type GoogleAdsRuntimeProcessingInput,
  type GoogleAdsRuntimeRefreshInput,
} from "../src/lib/media-sync/google-ads-media-sync-runtime-adapter";
import type {
  GoogleAdsKeywordProcessingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-keyword-processing-orchestrator";
import type {
  MediaConnectionRecord,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";

const ADVERTISER_ID =
  "33333333-3333-4333-8333-333333333333";

const REPORT_ID =
  "44444444-4444-4444-8444-444444444444";

const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";

const CREATED_BY =
  "66666666-6666-4666-8666-666666666666";

const EXTERNAL_ACCOUNT_ID =
  "1234567890";

const LOGIN_CUSTOMER_ID =
  "9876543210";

const CIPHERTEXT_SENTINEL =
  "fixture-ciphertext-sentinel";

const REFRESH_TOKEN_SENTINEL =
  "fixture-refresh-token-sentinel";

const ACCESS_TOKEN_SENTINEL =
  "fixture-access-token-sentinel";

const DEVELOPER_TOKEN_SENTINEL =
  "fixture-developer-token-sentinel";

const CLIENT_ID_SENTINEL =
  "fixture-client-id.apps.googleusercontent.com";

const CLIENT_SECRET_SENTINEL =
  "fixture-client-secret-sentinel";

const RESUME_CURSOR =
  Object.freeze({
    version:
      1,
    externalAccountId:
      EXTERNAL_ACCOUNT_ID,
    dateWindowIndex:
      7,
    dateFrom:
      "2026-05-01",
    dateTo:
      "2026-05-02",
    page: {
      version:
        1,
      pageIndex:
        3,
      page:
        "fixture-page-token",
    },
  });

function makeJob(
  overrides:
    Partial<MediaSyncJobRecord> = {},
): MediaSyncJobRecord {
  return {
    id:
      JOB_ID,

    workspace_id:
      WORKSPACE_ID,

    advertiser_id:
      ADVERTISER_ID,

    report_id:
      REPORT_ID,

    connection_id:
      CONNECTION_ID,

    provider:
      "google_ads",

    external_account_id:
      EXTERNAL_ACCOUNT_ID,

    date_from:
      "2026-05-01",

    date_to:
      "2026-05-02",

    data_level:
      "keyword",

    mode:
      "snapshot_replace",

    status:
      "processing",

    progress:
      0,

    raw_rows:
      0,

    normalized_rows:
      0,

    inserted_rows:
      0,

    failed_rows:
      0,

    previous_ingestion_id:
      null,

    snapshot_ingestion_id:
      null,

    attempt_count:
      1,

    error:
      null,

    error_detail:
      null,

    created_by:
      CREATED_BY,

    created_at:
      "2026-08-21T00:00:00.000Z",

    started_at:
      "2026-08-21T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-21T00:00:01.000Z",

    ...overrides,
  };
}

function makeConnection(
  overrides:
    Partial<MediaConnectionRecord> = {},
): MediaConnectionRecord {
  return {
    id:
      CONNECTION_ID,

    workspace_id:
      WORKSPACE_ID,

    advertiser_id:
      ADVERTISER_ID,

    provider:
      "google_ads",

    external_account_id:
      EXTERNAL_ACCOUNT_ID,

    external_account_name:
      "Fixture Google Ads Account",

    credential_ciphertext:
      CIPHERTEXT_SENTINEL,

    credential_version:
      1,

    status:
      "active",

    connected_at:
      "2026-08-20T00:00:00.000Z",

    last_verified_at:
      "2026-08-20T00:00:00.000Z",

    last_sync_at:
      null,

    last_error:
      null,

    meta: {},

    created_by:
      CREATED_BY,

    created_at:
      "2026-08-20T00:00:00.000Z",

    updated_at:
      "2026-08-20T00:00:00.000Z",

    ...overrides,
  };
}

type HarnessOptions =
  Readonly<{
    connection?:
      MediaConnectionRecord;

    decryptError?:
      Error;

    refreshError?:
      Error;

    processingError?:
      Error;
  }>;

function createHarness(
  options:
    HarnessOptions = {},
): {
  calls: string[];

  captured: {
    loadInput:
      GoogleAdsRuntimeConnectionLoadInput |
      null;

    credentialCiphertext:
      string |
      null;

    credentialContext:
      GoogleAdsRuntimeCredentialContext |
      null;

    refreshInput:
      GoogleAdsRuntimeRefreshInput |
      null;

    processingInput:
      GoogleAdsRuntimeProcessingInput |
      null;
  };

  processingResult:
    GoogleAdsKeywordProcessingOrchestratorResult;

  dependencies:
    GoogleAdsMediaSyncRuntimeAdapterDependencies;
} {
  const calls:
    string[] =
      [];

  const captured = {
    loadInput:
      null as
        GoogleAdsRuntimeConnectionLoadInput |
        null,

    credentialCiphertext:
      null as
        string |
        null,

    credentialContext:
      null as
        GoogleAdsRuntimeCredentialContext |
        null,

    refreshInput:
      null as
        GoogleAdsRuntimeRefreshInput |
        null,

    processingInput:
      null as
        GoogleAdsRuntimeProcessingInput |
        null,
  };

  const processingResult = {
    fixture:
      "google-runtime-processing-result",
  } as unknown as
    GoogleAdsKeywordProcessingOrchestratorResult;

  const dependencies:
    GoogleAdsMediaSyncRuntimeAdapterDependencies = {
      loadConnection:
        async (
          input,
        ) => {
          calls.push(
            "loadConnection",
          );

          captured.loadInput =
            input;

          return (
            options.connection ??
            makeConnection()
          );
        },

      decryptCredentials:
        async (
          credentialCiphertext,
          context,
        ) => {
          calls.push(
            "decryptCredentials",
          );

          captured.credentialCiphertext =
            credentialCiphertext;

          captured.credentialContext =
            context;

          if (
            options.decryptError
          ) {
            throw options.decryptError;
          }

          return {
            refreshToken:
              REFRESH_TOKEN_SENTINEL,

            loginCustomerId:
              LOGIN_CUSTOMER_ID,
          };
        },

      readOAuthConfig:
        async () => {
          calls.push(
            "readOAuthConfig",
          );

          return {
            developerToken:
              DEVELOPER_TOKEN_SENTINEL,

            clientId:
              CLIENT_ID_SENTINEL,

            clientSecret:
              CLIENT_SECRET_SENTINEL,
          };
        },

      refreshAccessToken:
        async (
          input,
        ) => {
          calls.push(
            "refreshAccessToken",
          );

          captured.refreshInput =
            input;

          if (
            options.refreshError
          ) {
            throw options.refreshError;
          }

          return {
            accessToken:
              ACCESS_TOKEN_SENTINEL,
          };
        },

      runProcessing:
        async (
          input,
        ) => {
          calls.push(
            "runProcessing",
          );

          captured.processingInput =
            input;

          if (
            options.processingError
          ) {
            throw options.processingError;
          }

          return processingResult;
        },
    };

  return {
    calls,
    captured,
    processingResult,
    dependencies,
  };
}

async function expectAdapterError(
  run:
    () => Promise<unknown>,
  code:
    GoogleAdsMediaSyncRuntimeAdapterError["code"],
): Promise<void> {
  await assert.rejects(
    run,
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsMediaSyncRuntimeAdapterError &&
      error.code ===
        code,
  );
}

function assertNoCredentialLeak(
  value: unknown,
): void {
  const serialized =
    JSON.stringify(
      value,
    );

  for (
    const secret of [
      CIPHERTEXT_SENTINEL,
      REFRESH_TOKEN_SENTINEL,
      ACCESS_TOKEN_SENTINEL,
      DEVELOPER_TOKEN_SENTINEL,
      CLIENT_SECRET_SENTINEL,
    ]
  ) {
    assert.equal(
      serialized.includes(
        secret,
      ),
      false,
      `Secret material leaked: ${secret}`,
    );
  }
}

async function main():
  Promise<void> {
  {
    const harness =
      createHarness();

    const job =
      makeJob({
        raw_rows:
          25,
        normalized_rows:
          25,
        inserted_rows:
          25,
      });

    const result =
      await processClaimedGoogleAdsKeywordJob(
        {
          job,

          dateWindowIndex:
            7,

          cursor:
            RESUME_CURSOR,
        },
        harness.dependencies,
      );

    assert.equal(
      result,
      harness.processingResult,
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
        "decryptCredentials",
        "readOAuthConfig",
        "refreshAccessToken",
        "runProcessing",
      ],
    );

    assert.deepEqual(
      harness.captured.loadInput,
      {
        connectionId:
          CONNECTION_ID,
        workspaceId:
          WORKSPACE_ID,
        advertiserId:
          ADVERTISER_ID,
      },
    );

    assert.equal(
      harness.captured.credentialCiphertext,
      CIPHERTEXT_SENTINEL,
    );

    assert.deepEqual(
      harness.captured.credentialContext,
      {
        connectionId:
          CONNECTION_ID,
        workspaceId:
          WORKSPACE_ID,
        advertiserId:
          ADVERTISER_ID,
        provider:
          "google_ads",
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
      },
    );

    assert.deepEqual(
      harness.captured.refreshInput,
      {
        config: {
          clientId:
            CLIENT_ID_SENTINEL,
          clientSecret:
            CLIENT_SECRET_SENTINEL,
        },
        refreshToken:
          REFRESH_TOKEN_SENTINEL,
      },
    );

    assert.deepEqual(
      harness.captured.processingInput,
      {
        job,
        accessToken:
          ACCESS_TOKEN_SENTINEL,
        developerToken:
          DEVELOPER_TOKEN_SENTINEL,
        loginCustomerId:
          LOGIN_CUSTOMER_ID,
        dateWindowIndex:
          7,
        cursor:
          RESUME_CURSOR,
      },
    );

    assertNoCredentialLeak(
      result,
    );

    console.log(
      "PASS: claimed Google job loads exact connection scope, decrypts, refreshes, and forwards the durable resume coordinates",
    );
  }

  {
    const harness =
      createHarness();

    await processClaimedGoogleAdsKeywordJob(
      {
        job:
          makeJob(),
      },
      harness.dependencies,
    );

    assert.ok(
      harness.captured.processingInput,
    );

    assert.equal(
      "dateWindowIndex" in
        harness.captured.processingInput,
      false,
    );

    assert.equal(
      "cursor" in
        harness.captured.processingInput,
      false,
    );

    console.log(
      "PASS: fresh Google job does not fabricate resume coordinates",
    );
  }

  {
    const harness =
      createHarness();

    await expectAdapterError(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob({
                provider:
                  "naver_searchad",
              }),
          },
          harness.dependencies,
        ),
      "INVALID_JOB",
    );

    assert.deepEqual(
      harness.calls,
      [],
    );

    console.log(
      "PASS: non-Google job fails before connection, credential, token, or processing work",
    );
  }

  {
    const harness =
      createHarness({
        connection:
          makeConnection({
            status:
              "disconnected",
          }),
      });

    await expectAdapterError(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob(),
          },
          harness.dependencies,
        ),
      "INVALID_CONNECTION",
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
      ],
    );

    console.log(
      "PASS: inactive Google connection fails before credential decryption",
    );
  }

  {
    const harness =
      createHarness({
        connection:
          makeConnection({
            external_account_id:
              "1112223334",
          }),
      });

    await expectAdapterError(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob(),
          },
          harness.dependencies,
        ),
      "INVALID_CONNECTION",
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
      ],
    );

    console.log(
      "PASS: Google connection account scope mismatch fails before credential decryption",
    );
  }

  {
    const harness =
      createHarness({
        connection:
          makeConnection({
            credential_version:
              2,
          }),
      });

    await expectAdapterError(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob(),
          },
          harness.dependencies,
        ),
      "INVALID_CONNECTION",
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
      ],
    );

    console.log(
      "PASS: unsupported Google credential version fails closed",
    );
  }

  {
    const decryptFailure =
      new Error(
        "FIXTURE_DECRYPT_FAILURE",
      );

    const harness =
      createHarness({
        decryptError:
          decryptFailure,
      });

    await assert.rejects(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob(),
          },
          harness.dependencies,
        ),
      (
        error:
          unknown,
      ) =>
        error ===
        decryptFailure,
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
        "decryptCredentials",
      ],
    );

    console.log(
      "PASS: credential decryption failure prevents OAuth config, refresh, and processing",
    );
  }

  {
    const refreshFailure =
      new Error(
        "FIXTURE_REFRESH_FAILURE",
      );

    const harness =
      createHarness({
        refreshError:
          refreshFailure,
      });

    await assert.rejects(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob(),
          },
          harness.dependencies,
        ),
      (
        error:
          unknown,
      ) =>
        error ===
        refreshFailure,
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
        "decryptCredentials",
        "readOAuthConfig",
        "refreshAccessToken",
      ],
    );

    console.log(
      "PASS: access-token refresh failure prevents Google keyword processing",
    );
  }

  {
    const processingFailure =
      new Error(
        "FIXTURE_PROCESSING_FAILURE",
      );

    const harness =
      createHarness({
        processingError:
          processingFailure,
      });

    await assert.rejects(
      () =>
        processClaimedGoogleAdsKeywordJob(
          {
            job:
              makeJob(),
          },
          harness.dependencies,
        ),
      (
        error:
          unknown,
      ) =>
        error ===
        processingFailure,
    );

    assert.deepEqual(
      harness.calls,
      [
        "loadConnection",
        "decryptCredentials",
        "readOAuthConfig",
        "refreshAccessToken",
        "runProcessing",
      ],
    );

    console.log(
      "PASS: processing errors propagate without a false runtime success",
    );
  }

  console.log(
    "GOOGLE_ADS_MEDIA_SYNC_RUNTIME_ADAPTER_FIXTURE=PASS",
  );

  console.log(
    "REAL_CONNECTION_LOAD_CALLS=0",
  );

  console.log(
    "REAL_CREDENTIAL_DECRYPT_CALLS=0",
  );

  console.log(
    "REAL_TOKEN_REFRESH_CALLS=0",
  );

  console.log(
    "REAL_GOOGLE_PROCESSING_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "WORKER_RUNTIME_CHANGES=0",
  );

  console.log(
    "NAVER_RUNTIME_CHANGES=0",
  );
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

import assert from "node:assert/strict";

import {
  buildGoogleAdsAllDataExecutableProductRoute,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";

import {
  processClaimedGoogleAdsAllDataJob,
  type GoogleAdsAllDataRuntimeAdapterDependencies,
} from "../src/lib/media-sync/google-ads-all-data-runtime-adapter";

const ACCOUNT_ID =
  "1234567890";

const executable =
  buildGoogleAdsAllDataExecutableProductRoute([
    "performance_max",
    "display",
    "search",
  ]);

assert.deepEqual(
  executable,
  [
    "search",
    "display",
    "performance_max",
  ],
);

const routing = {
  route: [
    "performance_max",
  ],
  productIndex:
    0,
  productFamily:
    "performance_max",
  complete:
    false,
} as const;

const job = {
  id:
    "11111111-1111-4111-8111-111111111111",
  workspace_id:
    "22222222-2222-4222-8222-222222222222",
  advertiser_id:
    "33333333-3333-4333-8333-333333333333",
  report_id:
    "44444444-4444-4444-8444-444444444444",
  connection_id:
    "55555555-5555-4555-8555-555555555555",

  provider:
    "google_ads",

  external_account_id:
    ACCOUNT_ID,

  date_from:
    "2026-05-01",
  date_to:
    "2026-05-01",

  data_level:
    "keyword",

  mode:
    "snapshot_replace",

  status:
    "processing",

  progress:
    50,

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
    "66666666-6666-4666-8666-666666666666",

  created_at:
    "2026-09-14T00:00:00.000Z",

  started_at:
    "2026-09-14T00:00:01.000Z",

  finished_at:
    null,

  updated_at:
    "2026-09-14T00:00:01.000Z",

  execution_contract:
    "google_all_data_v1",
} as any;

let inventoryCalls =
  0;

let bootstrapCalls =
  0;

let capturedProcessingInput:
  any = null;

const processingResult =
  Object.freeze({
    fixture:
      true,
  }) as any;

const dependencies:
  GoogleAdsAllDataRuntimeAdapterDependencies = {
    readCheckpoint:
      () =>
        ({
          hasCheckpoint:
            true,

          dateWindowIndex:
            0,

          phase:
            "product_boundary",

          cursor:
            null,

          routing,

          nextRowIndex:
            0,

          complete:
            false,
        } as any),

    loadConnection:
      async () =>
        ({
          id:
            job.connection_id,

          workspace_id:
            job.workspace_id,

          advertiser_id:
            job.advertiser_id,

          provider:
            "google_ads",

          external_account_id:
            ACCOUNT_ID,

          external_account_name:
            "Fixture",

          credential_ciphertext:
            "fixture-ciphertext",

          credential_version:
            1,

          status:
            "active",

          connected_at:
            "2026-09-14T00:00:00.000Z",

          last_verified_at:
            null,

          last_sync_at:
            null,

          last_error:
            null,

          meta:
            {},

          created_by:
            job.created_by,

          created_at:
            job.created_at,

          updated_at:
            job.updated_at,
        } as any),

    decryptCredentials:
      async () => ({
        refreshToken:
          "fixture-refresh-token",

        loginCustomerId:
          null,
      }),

    readOAuthConfig:
      async () => ({
        developerToken:
          "fixture-developer-token",

        clientId:
          "fixture-client-id",

        clientSecret:
          "fixture-client-secret",
      }),

    refreshAccessToken:
      async () => ({
        accessToken:
          "fixture-access-token",
      }),

    collectAccountInventory:
      async () => {
        inventoryCalls +=
          1;

        throw new Error(
          "PMAX_DURABLE_BOUNDARY_MUST_NOT_REFETCH_INVENTORY",
        );
      },

    saveProductRoutingBootstrap:
      async () => {
        bootstrapCalls +=
          1;

        throw new Error(
          "PMAX_DURABLE_BOUNDARY_MUST_NOT_REBOOTSTRAP",
        );
      },

    runProcessing:
      async input => {
        capturedProcessingInput =
          input;

        return processingResult;
      },
  };

async function main(): Promise<void> {
  const result =
    await processClaimedGoogleAdsAllDataJob(
    {
      job,
      executionContract:
        "google_all_data_v1",
    },
    dependencies,
  );

assert.strictEqual(
  result,
  processingResult,
);

assert.equal(
  inventoryCalls,
  0,
);

assert.equal(
  bootstrapCalls,
  0,
);

assert.equal(
  capturedProcessingInput.dateWindowIndex,
  0,
);

assert.equal(
  Object.prototype.hasOwnProperty.call(
    capturedProcessingInput,
    "cursor",
  ),
  false,
);

assert.deepEqual(
  capturedProcessingInput.routing,
  routing,
);

console.log(
  "PMAX_EXECUTABLE_ROUTE=PASS",
);

console.log(
  "PMAX_DURABLE_RUNTIME_BOUNDARY=PASS",
);

console.log(
  "PMAX_RUNTIME_INVENTORY_REFETCH=0",
);

  console.log(
    "PMAX_RUNTIME_REBOOTSTRAP=0",
  );
}

void main().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);

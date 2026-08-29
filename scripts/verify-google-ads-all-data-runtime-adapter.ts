import assert from "node:assert/strict";

import {
  GoogleAdsAllDataRuntimeAdapterError,
  processClaimedGoogleAdsAllDataJob,
  type GoogleAdsAllDataRuntimeAdapterDependencies,
  type ProcessClaimedGoogleAdsAllDataJobInput,
} from "../src/lib/media-sync/google-ads-all-data-runtime-adapter";
import {
  readGoogleAdsAllDataProcessingCheckpoint,
  type GoogleAdsAllDataProcessingCheckpointState,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";
import type {
  GoogleAdsAllDataProcessingOrchestratorInput,
  GoogleAdsAllDataProcessingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";
import type {
  GoogleAdsAllDataSearchStagingCursor,
} from "../src/lib/media-sync/google-ads-all-data-search-staging-orchestrator";
import type {
  MediaConnectionRecord,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const ACCOUNT_ID =
  "1234567890";

const DATE =
  "2026-05-01";

function createJob():
  ProcessClaimedGoogleAdsAllDataJobInput["job"] {
  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    report_id:
      "22222222-2222-4222-8222-222222222222",

    workspace_id:
      "33333333-3333-4333-8333-333333333333",

    advertiser_id:
      "44444444-4444-4444-8444-444444444444",

    connection_id:
      "55555555-5555-4555-8555-555555555555",

    provider:
      "google_ads",

    external_account_id:
      ACCOUNT_ID,

    date_from:
      DATE,

    date_to:
      DATE,

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
      "2026-08-28T00:00:00.000Z",

    started_at:
      "2026-08-28T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-28T00:00:01.000Z",

    execution_contract:
      "google_all_data_v1",
  } as unknown as
    ProcessClaimedGoogleAdsAllDataJobInput["job"];
}

function createConnection():
  MediaConnectionRecord {
  return {
    id:
      "55555555-5555-4555-8555-555555555555",

    workspace_id:
      "33333333-3333-4333-8333-333333333333",

    advertiser_id:
      "44444444-4444-4444-8444-444444444444",

    provider:
      "google_ads",

    external_account_id:
      ACCOUNT_ID,

    status:
      "active",

    credential_version:
      1,

    credential_ciphertext:
      "fixture-ciphertext",
  } as unknown as
    MediaConnectionRecord;
}

const freshCheckpoint:
  GoogleAdsAllDataProcessingCheckpointState = {
    hasCheckpoint:
      false,

    dateWindowIndex:
      null,

    phase:
      null,

    cursor:
      null,

    nextRowIndex:
      0,

    complete:
      false,
  };

const resumeCursor =
  Object.freeze({
    version:
      1,

    phase:
      "search_ad",

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      2,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      9,

    phaseCursor:
      null,
  }) as
    GoogleAdsAllDataSearchStagingCursor;

const partialCheckpoint:
  GoogleAdsAllDataProcessingCheckpointState = {
    hasCheckpoint:
      true,

    dateWindowIndex:
      2,

    phase:
      "search_ad",

    cursor:
      resumeCursor,

    nextRowIndex:
      9,

    complete:
      false,
  };

const completedCheckpoint:
  GoogleAdsAllDataProcessingCheckpointState = {
    hasCheckpoint:
      true,

    dateWindowIndex:
      2,

    phase:
      "completed",

    cursor:
      null,

    nextRowIndex:
      9,

    complete:
      true,
  };

const processingResult =
  Object.freeze({
    fixture:
      true,
  }) as unknown as
    GoogleAdsAllDataProcessingOrchestratorResult;

function createRuntimeBootstrapJob(
  job:
    ProcessClaimedGoogleAdsAllDataJobInput["job"],
  routing:
    NonNullable<
      GoogleAdsAllDataProcessingOrchestratorInput["routing"]
    >,
): ProcessClaimedGoogleAdsAllDataJobInput["job"] {
  return {
    ...job,

    raw_rows:
      0,

    normalized_rows:
      0,

    inserted_rows:
      0,

    failed_rows:
      0,

    error:
      null,

    error_detail: {
      processing_checkpoint: {
        version:
          1,

        saved_at:
          "2026-08-29T00:00:00.000Z",

        execution_contract:
          "google_all_data_v1",

        date_window_index:
          0,

        next_row_index:
          0,

        raw_rows:
          0,

        normalized_rows:
          0,

        inserted_rows:
          0,

        failed_rows:
          0,

        complete:
          false,

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
      },
    },
  } as unknown as
    ProcessClaimedGoogleAdsAllDataJobInput["job"];
}

function createCommonDependencies(
  order:
    string[],
  runProcessing:
    (
      input:
        GoogleAdsAllDataProcessingOrchestratorInput,
    ) => Promise<
      GoogleAdsAllDataProcessingOrchestratorResult
    >,
): GoogleAdsAllDataRuntimeAdapterDependencies {
  return {
    loadConnection:
      async () => {
        order.push(
          "connection",
        );

        return createConnection();
      },

    decryptCredentials:
      async () => {
        order.push(
          "decrypt",
        );

        return {
          refreshToken:
            "fixture-refresh-token",

          loginCustomerId:
            null,
        };
      },

    readOAuthConfig:
      async () => {
        order.push(
          "oauth",
        );

        return {
          developerToken:
            "fixture-developer-token",

          clientId:
            "fixture-client-id",

          clientSecret:
            "fixture-client-secret",
        };
      },

    refreshAccessToken:
      async () => {
        order.push(
          "refresh",
        );

        return {
          accessToken:
            "fixture-access-token",
        };
      },

    collectAccountInventory:
      async () => {
        order.push(
          "inventory",
        );

        const searchCampaign = {
          campaignId:
            "1001",

          campaignName:
            "Search",

          campaignType:
            "SEARCH" as const,

          campaignStatus:
            "ENABLED",

          supported:
            true as const,

          productFamily:
            "search" as const,

          authoritativeGrain:
            "ad" as const,
        };

        return {
          campaigns: [
            searchCampaign,
          ],

          supportedCampaigns: [
            searchCampaign,
          ],

          unsupportedCampaigns: [],

          pageCount:
            1,

          requestCount:
            1,

          retryCount:
            0,
        };
      },

    saveProductRoutingBootstrap:
      async input => {
        order.push(
          "bootstrap",
        );

        return createRuntimeBootstrapJob(
          input.job,
          input.routing,
        ) as any;
      },

    runProcessing:
      async (
        input,
      ) => {
        order.push(
          "processing",
        );

        return await runProcessing(
          input,
        );
      },
  };
}

async function verifyFreshResume():
  Promise<void> {
  const order:
    string[] = [];

  let refreshCalls =
    0;

  let processingCalls =
    0;

  const dependencies =
    createCommonDependencies(
      order,
      async (
        processingInput,
      ) => {
        processingCalls +=
          1;

        assert.equal(
          processingInput.dateWindowIndex,
          0,
        );

        assert.equal(
          Object.prototype.hasOwnProperty.call(
            processingInput,
            "cursor",
          ),
          false,
        );

        return processingResult;
      },
    );

  const wrappedDependencies:
    GoogleAdsAllDataRuntimeAdapterDependencies = {
      ...dependencies,

      readCheckpoint:
        () => {
          order.push(
            "checkpoint",
          );

          return freshCheckpoint;
        },

      refreshAccessToken:
        async () => {
          order.push(
            "refresh",
          );

          refreshCalls +=
            1;

          return {
            accessToken:
              "fixture-access-token",
          };
        },
    };

  const result =
    await processClaimedGoogleAdsAllDataJob(
      {
        job:
          createJob(),

        executionContract:
          "google_all_data_v1",
      },
      wrappedDependencies,
    );

  assert.strictEqual(
    result,
    processingResult,
  );

  assert.deepEqual(
    order,
    [
      "checkpoint",
      "connection",
      "decrypt",
      "oauth",
      "refresh",
      "inventory",
      "bootstrap",
      "processing",
    ],
  );

  assert.equal(
    refreshCalls,
    1,
  );

  assert.equal(
    processingCalls,
    1,
  );

  console.log(
    "ALL_DATA_RUNTIME_FRESH_RESUME_INDEX_ZERO=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_FRESH_CURSOR_UNDEFINED=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_CHECKPOINT_BEFORE_CREDENTIAL_IO=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_TOKEN_REFRESH_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_PROCESSING_EXACTLY_ONCE=PASS",
  );
}

async function verifyPartialResume():
  Promise<void> {
  const order:
    string[] = [];

  const dependencies =
    createCommonDependencies(
      order,
      async (
        processingInput,
      ) => {
        assert.equal(
          processingInput.dateWindowIndex,
          2,
        );

        assert.strictEqual(
          processingInput.cursor,
          resumeCursor,
        );

        return processingResult;
      },
    );

  await processClaimedGoogleAdsAllDataJob(
    {
      job: {
        ...createJob(),

        raw_rows:
          9,

        normalized_rows:
          9,

        inserted_rows:
          9,
      } as MediaSyncJobRecord &
        Readonly<{
          execution_contract?:
            unknown;
        }>,

      executionContract:
        "google_all_data_v1",
    },
    {
      ...dependencies,

      readCheckpoint:
        () => {
          order.push(
            "checkpoint",
          );

          return partialCheckpoint;
        },
    },
  );

  assert.deepEqual(
    order,
    [
      "checkpoint",
      "connection",
      "decrypt",
      "oauth",
      "refresh",
      "processing",
    ],
  );

  console.log(
    "ALL_DATA_RUNTIME_PARTIAL_DATE_WINDOW_FROM_CHECKPOINT=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_PARTIAL_CURSOR_EXACT_FROM_CHECKPOINT=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_PAGE_REFETCH_PATH=NO",
  );
}


async function verifyDemandGenDurableBoundaryResume():
  Promise<void> {
  const routing = {
    route: [
      "search",
      "demand_gen",
    ],

    productIndex:
      1,

    productFamily:
      "demand_gen",

    complete:
      false,
  } as NonNullable<
    GoogleAdsAllDataProcessingOrchestratorInput[
      "routing"
    ]
  >;

  const job =
    createRuntimeBootstrapJob(
      createJob(),
      routing,
    );

  const order:
    string[] = [];

  let inventoryCalls =
    0;

  let bootstrapCalls =
    0;

  let processingCalls =
    0;

  const dependencies =
    createCommonDependencies(
      order,
      async processingInput => {
        processingCalls +=
          1;

        assert.equal(
          processingInput.dateWindowIndex,
          0,
        );

        assert.equal(
          Object.prototype.hasOwnProperty.call(
            processingInput,
            "cursor",
          ),
          false,
        );

        assert.deepEqual(
          processingInput.routing,
          routing,
        );

        return processingResult;
      },
    );

  const result =
    await processClaimedGoogleAdsAllDataJob(
      {
        job,

        executionContract:
          "google_all_data_v1",
      },
      {
        ...dependencies,

        readCheckpoint:
          value => {
            order.push(
              "checkpoint",
            );

            return readGoogleAdsAllDataProcessingCheckpoint(
              value,
            );
          },

        collectAccountInventory:
          async () => {
            inventoryCalls +=
              1;

            throw new Error(
              "DEMAND_GEN_DURABLE_ROUTE_MUST_NOT_REFETCH_INVENTORY",
            );
          },

        saveProductRoutingBootstrap:
          async () => {
            bootstrapCalls +=
              1;

            throw new Error(
              "DEMAND_GEN_DURABLE_ROUTE_MUST_NOT_REBOOTSTRAP",
            );
          },
      },
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
    processingCalls,
    1,
  );

  assert.deepEqual(
    order,
    [
      "checkpoint",
      "connection",
      "decrypt",
      "oauth",
      "refresh",
      "processing",
    ],
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_DURABLE_BOUNDARY_REENTRY=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_INVENTORY_RECALLS=0",
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_REBOOTSTRAP_WRITES=0",
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_PROCESSING_EXACTLY_ONCE=PASS",
  );
}

async function verifyCompletedFailClosed():
  Promise<void> {
  let connectionCalls =
    0;

  let refreshCalls =
    0;

  let processingCalls =
    0;

  await assert.rejects(
    () =>
      processClaimedGoogleAdsAllDataJob(
        {
          job:
            createJob(),

          executionContract:
            "google_all_data_v1",
        },
        {
          readCheckpoint:
            () =>
              completedCheckpoint,

          loadConnection:
            async () => {
              connectionCalls +=
                1;

              return createConnection();
            },

          refreshAccessToken:
            async () => {
              refreshCalls +=
                1;

              return {
                accessToken:
                  "should-not-run",
              };
            },

          runProcessing:
            async () => {
              processingCalls +=
                1;

              return processingResult;
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataRuntimeAdapterError &&
      error.code ===
        "COMPLETED_CHECKPOINT",
  );

  assert.equal(
    connectionCalls,
    0,
  );

  assert.equal(
    refreshCalls,
    0,
  );

  assert.equal(
    processingCalls,
    0,
  );

  console.log(
    "ALL_DATA_RUNTIME_COMPLETED_FAILS_BEFORE_CONNECTION=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_COMPLETED_FAILS_BEFORE_TOKEN_REFRESH=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_COMPLETED_FAILS_BEFORE_PROCESSING=PASS",
  );
}

async function verifyConnectionAuthority():
  Promise<void> {
  let decryptCalls =
    0;

  let refreshCalls =
    0;

  let processingCalls =
    0;

  await assert.rejects(
    () =>
      processClaimedGoogleAdsAllDataJob(
        {
          job:
            createJob(),

          executionContract:
            "google_all_data_v1",
        },
        {
          readCheckpoint:
            () =>
              freshCheckpoint,

          loadConnection:
            async () => ({
              ...createConnection(),

              workspace_id:
                "77777777-7777-4777-8777-777777777777",
            }),

          decryptCredentials:
            async () => {
              decryptCalls +=
                1;

              return {
                refreshToken:
                  "should-not-run",

                loginCustomerId:
                  null,
              };
            },

          refreshAccessToken:
            async () => {
              refreshCalls +=
                1;

              return {
                accessToken:
                  "should-not-run",
              };
            },

          runProcessing:
            async () => {
              processingCalls +=
                1;

              return processingResult;
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataRuntimeAdapterError &&
      error.code ===
        "INVALID_CONNECTION",
  );

  assert.equal(
    decryptCalls,
    0,
  );

  assert.equal(
    refreshCalls,
    0,
  );

  assert.equal(
    processingCalls,
    0,
  );

  console.log(
    "ALL_DATA_RUNTIME_CONNECTION_SCOPE_FAIL_CLOSED=PASS",
  );
}

async function verifyExecutionContract():
  Promise<void> {
  let checkpointCalls =
    0;

  const invalidInput =
    {
      job: {
        ...createJob(),

        execution_contract:
          undefined,
      },

      executionContract:
        "google_all_data_v1",
    } as unknown as
      ProcessClaimedGoogleAdsAllDataJobInput;

  await assert.rejects(
    () =>
      processClaimedGoogleAdsAllDataJob(
        invalidInput,
        {
          readCheckpoint:
            () => {
              checkpointCalls +=
                1;

              return freshCheckpoint;
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataRuntimeAdapterError &&
      error.code ===
        "INVALID_JOB",
  );

  assert.equal(
    checkpointCalls,
    0,
  );

  console.log(
    "ALL_DATA_RUNTIME_EXECUTION_CONTRACT_FAILS_BEFORE_CHECKPOINT=PASS",
  );
}

async function main():
  Promise<void> {
  await verifyFreshResume();

  await verifyPartialResume();
  await verifyDemandGenDurableBoundaryResume();

  await verifyCompletedFailClosed();

  await verifyConnectionAuthority();

  await verifyExecutionContract();

  console.log(
    "GOOGLE_ADS_ALL_DATA_RUNTIME_ADAPTER_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );
}

main().catch(
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

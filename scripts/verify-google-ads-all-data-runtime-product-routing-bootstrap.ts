import assert from "node:assert/strict";

import {
  validateGoogleAdsAllDataProductRoutingState,
  type GoogleAdsAllDataProductRoutingState,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";
import {
  readGoogleAdsAllDataProcessingCheckpoint,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";
import {
  GoogleAdsAllDataRuntimeAdapterError,
  processClaimedGoogleAdsAllDataJob,
  type ProcessClaimedGoogleAdsAllDataJobInput,
} from "../src/lib/media-sync/google-ads-all-data-runtime-adapter";
import type {
  GoogleAdsAllDataProcessingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";
import {
  GoogleAdsAllDataWorkerHandlerError,
  processGoogleAdsAllDataWorkerHandler,
  type GoogleAdsAllDataWorkerJobRecord,
} from "../src/lib/media-sync/google-ads-all-data-worker-handler";
import type {
  MediaConnectionRecord,
} from "../src/lib/media-sync/types";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const REPORT_ID =
  "22222222-2222-4222-8222-222222222222";

const WORKSPACE_ID =
  "33333333-3333-4333-8333-333333333333";

const ADVERTISER_ID =
  "44444444-4444-4444-8444-444444444444";

const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";

const ACCOUNT_ID =
  "1234567890";

const DATE =
  "2026-05-01";

function createJob():
  ProcessClaimedGoogleAdsAllDataJobInput["job"] {
  return {
    id:
      JOB_ID,

    report_id:
      REPORT_ID,

    workspace_id:
      WORKSPACE_ID,

    advertiser_id:
      ADVERTISER_ID,

    connection_id:
      CONNECTION_ID,

    provider:
      "google_ads",

    external_account_id:
      ACCOUNT_ID,

    status:
      "processing",

    mode:
      "snapshot_replace",

    date_from:
      DATE,

    date_to:
      DATE,

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

    progress:
      0,

    error:
      null,

    error_detail:
      null,

    created_by:
      "66666666-6666-4666-8666-666666666666",

    created_at:
      "2026-08-29T00:00:00.000Z",

    started_at:
      "2026-08-29T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-29T00:00:01.000Z",

    execution_contract:
      "google_all_data_v1",
  } as unknown as
    ProcessClaimedGoogleAdsAllDataJobInput["job"];
}

function createConnection():
  MediaConnectionRecord {
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
      ACCOUNT_ID,

    status:
      "active",

    credential_ciphertext:
      "fixture-ciphertext",

    credential_version:
      1,
  } as unknown as
    MediaConnectionRecord;
}

function createBootstrapJob(
  job:
    ProcessClaimedGoogleAdsAllDataJobInput["job"],
  routing:
    GoogleAdsAllDataProductRoutingState,
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

const demandGenCampaign = {
  campaignId:
    "1002",

  campaignName:
    "Demand Gen",

  campaignType:
    "DEMAND_GEN" as const,

  campaignStatus:
    "ENABLED",

  supported:
    true as const,

  productFamily:
    "demand_gen" as const,

  authoritativeGrain:
    "ad" as const,
};

const inventoryResult = {
  campaigns: [
    searchCampaign,
    demandGenCampaign,
  ],

  supportedCampaigns: [
    searchCampaign,
    demandGenCampaign,
  ],

  unsupportedCampaigns: [],

  pageCount:
    1,

  requestCount:
    1,

  retryCount:
    0,
};

const processingResult =
  Object.freeze({
    fixture:
      true,
  }) as unknown as
    GoogleAdsAllDataProcessingOrchestratorResult;

function runtimeBaseDependencies(
  order:
    string[],
) {
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
  };
}

async function verifyFreshInventoryBootstrap():
  Promise<void> {
  const order:
    string[] = [];

  let inventoryCalls =
    0;

  let bootstrapCalls =
    0;

  let processingCalls =
    0;

  const result =
    await processClaimedGoogleAdsAllDataJob(
      {
        job:
          createJob(),

        executionContract:
          "google_all_data_v1",
      },
      {
        ...runtimeBaseDependencies(
          order,
        ),

        readCheckpoint:
          job => {
            order.push(
              "checkpoint",
            );

            return readGoogleAdsAllDataProcessingCheckpoint(
              job,
            );
          },

        collectAccountInventory:
          async input => {
            order.push(
              "inventory",
            );

            inventoryCalls +=
              1;

            assert.equal(
              input.targetCustomerId,
              ACCOUNT_ID,
            );

            return inventoryResult;
          },

        saveProductRoutingBootstrap:
          async input => {
            order.push(
              "bootstrap",
            );

            bootstrapCalls +=
              1;

            assert.deepEqual(
              input.routing.route,
              [
                "search",
                "demand_gen",
              ],
            );

            assert.equal(
              input.routing.productIndex,
              0,
            );

            assert.equal(
              input.routing.productFamily,
              "search",
            );

            return createBootstrapJob(
              input.job,
              input.routing,
            ) as any;
          },

        runProcessing:
          async input => {
            order.push(
              "processing",
            );

            processingCalls +=
              1;

            assert.equal(
              input.dateWindowIndex,
              0,
            );

            assert.equal(
              Object.prototype.hasOwnProperty.call(
                input,
                "cursor",
              ),
              false,
            );

            assert.deepEqual(
              input.routing?.route,
              [
                "search",
                "demand_gen",
              ],
            );

            assert.equal(
              input.routing?.productFamily,
              "search",
            );

            const persisted =
              readGoogleAdsAllDataProcessingCheckpoint(
                input.job,
              );

            assert.equal(
              persisted.phase,
              "product_boundary",
            );

            assert.equal(
              persisted.nextRowIndex,
              0,
            );

            assert.equal(
              persisted.cursor,
              null,
            );

            return processingResult;
          },
      },
    );

  assert.strictEqual(
    result,
    processingResult,
  );

  assert.equal(
    inventoryCalls,
    1,
  );

  assert.equal(
    bootstrapCalls,
    1,
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
      "inventory",
      "bootstrap",
      "processing",
    ],
  );

  console.log(
    "ALL_DATA_RUNTIME_FRESH_INVENTORY_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_FRESH_CANONICAL_ROUTE=SEARCH_DEMAND_GEN",
  );

  console.log(
    "ALL_DATA_RUNTIME_BOOTSTRAP_BEFORE_SEARCH_PROCESSING=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_BOOTSTRAP_DURABLE_BEFORE_FIRST_PAGE=PASS",
  );
}

async function verifyBootstrapResumeSkipsInventory():
  Promise<void> {
  const order:
    string[] = [];

  const routing =
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "search",
        "demand_gen",
      ],

      productIndex:
        0,

      productFamily:
        "search",

      complete:
        false,
    });

  const job =
    createBootstrapJob(
      createJob(),
      routing,
    );

  let inventoryCalls =
    0;

  let bootstrapCalls =
    0;

  let processingCalls =
    0;

  await processClaimedGoogleAdsAllDataJob(
    {
      job,

      executionContract:
        "google_all_data_v1",
    },
    {
      ...runtimeBaseDependencies(
        order,
      ),

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

          return inventoryResult;
        },

      saveProductRoutingBootstrap:
        async () => {
          bootstrapCalls +=
            1;

          throw new Error(
            "bootstrap-should-not-run",
          );
        },

      runProcessing:
        async input => {
          order.push(
            "processing",
          );

          processingCalls +=
            1;

          assert.equal(
            input.dateWindowIndex,
            0,
          );

          assert.equal(
            Object.prototype.hasOwnProperty.call(
              input,
              "cursor",
            ),
            false,
          );

          assert.deepEqual(
            input.routing,
            routing,
          );

          return processingResult;
        },
    },
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
    "ALL_DATA_RUNTIME_BOOTSTRAP_RESUME_INVENTORY_CALLS=0",
  );

  console.log(
    "ALL_DATA_RUNTIME_BOOTSTRAP_RESUME_BOOTSTRAP_WRITES=0",
  );

  console.log(
    "ALL_DATA_RUNTIME_BOOTSTRAP_RESUME_DURABLE_ROUTE_REUSED=PASS",
  );
}


async function verifyFreshDemandGenRouteBootstrapsAndProcesses():
  Promise<void> {
  const order:
    string[] = [];

  let inventoryCalls =
    0;

  let bootstrapCalls =
    0;

  let processingCalls =
    0;

  let durableJob:
    ProcessClaimedGoogleAdsAllDataJobInput["job"] |
    null =
      null;

  const result =
    await processClaimedGoogleAdsAllDataJob(
      {
        job:
          createJob(),

        executionContract:
          "google_all_data_v1",
      },
      {
        ...runtimeBaseDependencies(
          order,
        ),

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
            order.push(
              "inventory",
            );

            inventoryCalls +=
              1;

            return {
              campaigns: [
                demandGenCampaign,
              ],

              supportedCampaigns: [
                demandGenCampaign,
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

            bootstrapCalls +=
              1;

            assert.deepEqual(
              input.routing.route,
              [
                "demand_gen",
              ],
            );

            assert.equal(
              input.routing.productIndex,
              0,
            );

            assert.equal(
              input.routing.productFamily,
              "demand_gen",
            );

            durableJob =
              createBootstrapJob(
                input.job,
                input.routing,
              );

            return durableJob as any;
          },

        runProcessing:
          async input => {
            order.push(
              "processing",
            );

            processingCalls +=
              1;

            assert.deepEqual(
              input.routing?.route,
              [
                "demand_gen",
              ],
            );

            assert.equal(
              input.routing?.productFamily,
              "demand_gen",
            );

            const persisted =
              readGoogleAdsAllDataProcessingCheckpoint(
                input.job,
              );

            assert.equal(
              persisted.phase,
              "product_boundary",
            );

            return processingResult;
          },
      },
    );

  assert.strictEqual(
    result,
    processingResult,
  );

  assert.equal(
    inventoryCalls,
    1,
  );

  assert.equal(
    bootstrapCalls,
    1,
  );

  assert.equal(
    processingCalls,
    1,
  );

  assert.ok(
    durableJob,
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

  console.log(
    "ALL_DATA_RUNTIME_FRESH_DEMAND_GEN_ROUTE_BOOTSTRAP=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_FRESH_DEMAND_GEN_BOOTSTRAP_BEFORE_PROCESSING=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_FRESH_DEMAND_GEN_PROCESSING_EXACTLY_ONCE=PASS",
  );
}


async function verifyDemandGenBoundaryRetryReentersProcessing():
  Promise<void> {
  const order:
    string[] = [];

  const routing =
    validateGoogleAdsAllDataProductRoutingState({
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
    });

  const job =
    createBootstrapJob(
      createJob(),
      routing,
    );

  let inventoryCalls =
    0;

  let bootstrapCalls =
    0;

  let processingCalls =
    0;

  const result =
    await processClaimedGoogleAdsAllDataJob(
      {
        job,

        executionContract:
          "google_all_data_v1",
      },
      {
        ...runtimeBaseDependencies(
          order,
        ),

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
              "DURABLE_DEMAND_GEN_MUST_NOT_REFETCH_INVENTORY",
            );
          },

        saveProductRoutingBootstrap:
          async () => {
            bootstrapCalls +=
              1;

            throw new Error(
              "DURABLE_DEMAND_GEN_MUST_NOT_REBOOTSTRAP",
            );
          },

        runProcessing:
          async input => {
            order.push(
              "processing",
            );

            processingCalls +=
              1;

            assert.deepEqual(
              input.routing,
              routing,
            );

            return processingResult;
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

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_BOUNDARY_RETRY_REENTRY=PASS",
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_BOUNDARY_RETRY_INVENTORY_CALLS=0",
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_BOUNDARY_RETRY_BOOTSTRAP_WRITES=0",
  );

  console.log(
    "ALL_DATA_RUNTIME_DEMAND_GEN_BOUNDARY_RETRY_PROCESSING_CALLS=1",
  );
}

async function verifyFutureProductBoundaryRetriesFailBeforeIo():
  Promise<void> {
  const cases = [
    {
      label:
        "DISPLAY",

      productIndex:
        2,

      productFamily:
        "display" as const,
    },
    {
      label:
        "PERFORMANCE_MAX",

      productIndex:
        3,

      productFamily:
        "performance_max" as const,
    },
  ];

  for (
    const testCase
    of cases
  ) {
    const routing =
      validateGoogleAdsAllDataProductRoutingState({
        route: [
          "search",
          "demand_gen",
          "display",
          "performance_max",
        ],

        productIndex:
          testCase.productIndex,

        productFamily:
          testCase.productFamily,

        complete:
          false,
      });

    const job =
      createBootstrapJob(
        createJob(),
        routing,
      );

    let connectionCalls =
      0;

    let inventoryCalls =
      0;

    let processingCalls =
      0;

    await assert.rejects(
      () =>
        processClaimedGoogleAdsAllDataJob(
          {
            job,

            executionContract:
              "google_all_data_v1",
          },
          {
            readCheckpoint:
              value =>
                readGoogleAdsAllDataProcessingCheckpoint(
                  value,
                ),

            loadConnection:
              async () => {
                connectionCalls +=
                  1;

                return createConnection();
              },

            collectAccountInventory:
              async () => {
                inventoryCalls +=
                  1;

                return inventoryResult;
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
          "INVALID_INPUT",
    );

    assert.equal(
      connectionCalls,
      0,
    );

    assert.equal(
      inventoryCalls,
      0,
    );

    assert.equal(
      processingCalls,
      0,
    );

    console.log(
      `ALL_DATA_RUNTIME_${testCase.label}_BOUNDARY_BLOCKED_BEFORE_IO=PASS`,
    );
  }
}


async function verifyHandlerBoundaryAuthority():
  Promise<void> {
  const searchRouting =
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "search",
        "demand_gen",
      ],

      productIndex:
        0,

      productFamily:
        "search",

      complete:
        false,
    });

  const searchJob =
    createBootstrapJob(
      createJob(),
      searchRouting,
    );

  let searchRuntimeCalls =
    0;

  await assert.rejects(
    () =>
      processGoogleAdsAllDataWorkerHandler(
        {
          job:
            searchJob as
              GoogleAdsAllDataWorkerJobRecord,

          executionContract:
            "google_all_data_v1",
        },
        {
          readCheckpoint:
            value =>
              readGoogleAdsAllDataProcessingCheckpoint(
                value,
              ),

          processRuntime:
            async () => {
              searchRuntimeCalls +=
                1;

              throw new Error(
                "fixture-runtime-stop",
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataWorkerHandlerError &&
      error.code ===
        "PROCESSING_FAILED",
  );

  assert.equal(
    searchRuntimeCalls,
    1,
  );

  console.log(
    "ALL_DATA_HANDLER_INITIAL_SEARCH_BOUNDARY_RUNTIME_ENTRY=PASS",
  );

  const demandRouting =
    validateGoogleAdsAllDataProductRoutingState({
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
    });

  const demandJob =
    createBootstrapJob(
      createJob(),
      demandRouting,
    );

  let demandRuntimeCalls =
    0;

  await assert.rejects(
    () =>
      processGoogleAdsAllDataWorkerHandler(
        {
          job:
            demandJob as
              GoogleAdsAllDataWorkerJobRecord,

          executionContract:
            "google_all_data_v1",
        },
        {
          readCheckpoint:
            value =>
              readGoogleAdsAllDataProcessingCheckpoint(
                value,
              ),

          processRuntime:
            async () => {
              demandRuntimeCalls +=
                1;

              throw new Error(
                "fixture-demand-gen-runtime-stop",
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataWorkerHandlerError &&
      error.code ===
        "PROCESSING_FAILED",
  );

  assert.equal(
    demandRuntimeCalls,
    1,
  );

  console.log(
    "ALL_DATA_HANDLER_DEMAND_GEN_BOUNDARY_RUNTIME_ENTRY=PASS",
  );
}

async function main():
  Promise<void> {
  await verifyFreshInventoryBootstrap();

  await verifyBootstrapResumeSkipsInventory();

  await verifyFreshDemandGenRouteBootstrapsAndProcesses();

  await verifyDemandGenBoundaryRetryReentersProcessing();
  await verifyFutureProductBoundaryRetriesFailBeforeIo();

  await verifyHandlerBoundaryAuthority();

  console.log(
    "GOOGLE_ADS_ALL_DATA_RUNTIME_PRODUCT_ROUTING_BOOTSTRAP_FIXTURE=PASS",
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

void main().catch(
  error => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

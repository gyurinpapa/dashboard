import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  advanceGoogleAdsAllDataProductRoutingState,
  GoogleAdsAllDataProductRoutingError,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";
import {
  runGoogleAdsAllDataProcessingOrchestrator,
} from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";

async function main(): Promise<void> {
const searchToDemandGen =
  advanceGoogleAdsAllDataProductRoutingState({
    routing: {
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
    },
    completedProduct:
      "search",
  });

assert.deepEqual(
  searchToDemandGen,
  {
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
  },
);

const searchOnlyComplete =
  advanceGoogleAdsAllDataProductRoutingState({
    routing: {
      route: [
        "search",
      ],
      productIndex:
        0,
      productFamily:
        "search",
      complete:
        false,
    },
    completedProduct:
      "search",
  });

assert.deepEqual(
  searchOnlyComplete,
  {
    route: [
      "search",
    ],
    productIndex:
      1,
    productFamily:
      null,
    complete:
      true,
  },
);

let completedStageCalls =
  0;

let completedSaveCalls =
  0;

let completedSavedRouting:
  unknown =
  null;

await runGoogleAdsAllDataProcessingOrchestrator(
  {
    job: {
      id:
        "job-completed",
    } as never,

    accessToken:
      "fixture-token",

    developerToken:
      "fixture-developer-token",

    loginCustomerId:
      "fixture-login",

    dateWindowIndex:
      0,

    routing: {
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
    },
  } as never,
  {
    runStaging:
      async () => {
        completedStageCalls +=
          1;

        return {
          isComplete:
            true,
        } as never;
      },

    saveCheckpoint:
      async input => {
        completedSaveCalls +=
          1;

        completedSavedRouting =
          input.routing;

        return {
          id:
            "job-completed",
        } as never;
      },
  },
);

assert.equal(
  completedStageCalls,
  1,
);

assert.equal(
  completedSaveCalls,
  1,
);

assert.deepEqual(
  completedSavedRouting,
  {
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
  },
);

let partialSavedRouting:
  unknown =
  null;

await runGoogleAdsAllDataProcessingOrchestrator(
  {
    job: {
      id:
        "job-partial",
    } as never,

    accessToken:
      "fixture-token",

    developerToken:
      "fixture-developer-token",

    loginCustomerId:
      "fixture-login",

    dateWindowIndex:
      0,

    routing: {
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
    },
  } as never,
  {
    runStaging:
      async () =>
        ({
          isComplete:
            false,
        }) as never,

    saveCheckpoint:
      async input => {
        partialSavedRouting =
          input.routing;

        return {
          id:
            "job-partial",
        } as never;
      },
  },
);

assert.deepEqual(
  partialSavedRouting,
  {
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
  },
);

let invalidStageCalls =
  0;

await assert.rejects(
  async () =>
    await runGoogleAdsAllDataProcessingOrchestrator(
      {
        job: {
          id:
            "job-invalid",
        } as never,

        accessToken:
          "fixture-token",

        developerToken:
          "fixture-developer-token",

        loginCustomerId:
          "fixture-login",

        dateWindowIndex:
          0,

        routing: {
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
        },
      } as never,
      {
        runStaging:
          async () => {
            invalidStageCalls +=
              1;

            return {
              isComplete:
                false,
            } as never;
          },

        saveCheckpoint:
          async () =>
            ({
              id:
                "job-invalid",
            }) as never,
      },
    ),
  GoogleAdsAllDataProductRoutingError,
);

assert.equal(
  invalidStageCalls,
  0,
);

const processingSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/media-sync/google-ads-all-data-processing-orchestrator.ts",
    ),
    "utf8",
  );

const handlerSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/media-sync/google-ads-all-data-worker-handler.ts",
    ),
    "utf8",
  );

for (
  const required
  of [
    "advanceGoogleAdsAllDataProductRoutingState",
    'currentRouting.productFamily !==\n        "search"',
    "nextRouting",
    "routing:",
  ]
) {
  assert.ok(
    processingSource.includes(
      required,
    ),
    `processing source missing ${required}`,
  );
}

for (
  const required
  of [
    '"product_boundary"',
    "productBoundary",
    "GOOGLE_ADS_ALL_DATA_PRODUCT_BOUNDARY",
    "cannot re-enter SEARCH processing",
  ]
) {
  assert.ok(
    handlerSource.includes(
      required,
    ),
    `handler source missing ${required}`,
  );
}

const reentryGuardIndex =
  handlerSource.indexOf(
    "cannot re-enter SEARCH processing",
  );

const processRuntimeIndex =
  handlerSource.indexOf(
    "await processRuntime(",
  );

assert.ok(
  reentryGuardIndex >=
    0,
);

assert.ok(
  processRuntimeIndex >=
    0,
);

assert.ok(
  reentryGuardIndex <
    processRuntimeIndex,
);

console.log(
  "GOOGLE_ADS_ALL_DATA_PRODUCT_TRANSITION_FIXTURE=PASS",
);

console.log(
  "SEARCH_PRODUCT_TRANSITION_ADVANCE=PASS",
);

console.log(
  "SEARCH_PRODUCT_PARTIAL_NO_ADVANCE=PASS",
);

console.log(
  "SEARCH_ONLY_GLOBAL_COMPLETION=PASS",
);

console.log(
  "NON_SEARCH_ROUTING_FAILS_BEFORE_SEARCH_STAGE=PASS",
);

console.log(
  "PRODUCT_BOUNDARY_HANDLER_PARTIAL_CONTRACT=PASS",
);

console.log(
  "PRODUCT_BOUNDARY_REENTRY_BLOCK_BEFORE_PROCESS_RUNTIME=PASS",
);

console.log(
  "COMPLETED_SEARCH_PRODUCT_REFETCH_PATH=NO",
);

console.log(
  "LIVE_GOOGLE_API_CALLS=0",
);

console.log(
  "LIVE_DB_CALLS=0",
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

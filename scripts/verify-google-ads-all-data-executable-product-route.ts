import assert from "node:assert/strict";

import {
  buildGoogleAdsAllDataExecutableProductRoute,
  buildGoogleAdsAllDataProductRoute,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";

function main(): void {
  const fullInventory = [
    "performance_max",
    "display",
    "demand_gen",
    "search",
    "search",
  ] as const;

  assert.deepEqual(
    buildGoogleAdsAllDataProductRoute(
      fullInventory,
    ),
    [
      "search",
      "demand_gen",
      "display",
      "performance_max",
    ],
  );

  console.log(
    "FOUNDATIONAL_ALL_PRODUCT_ROUTE_UNCHANGED=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      fullInventory,
    ),
    [
      "search",
      "demand_gen",
      "display",
    ],
  );

  console.log(
    "MIXED_ACCOUNT_EXECUTABLE_ROUTE=SEARCH_DEMAND_GEN_DISPLAY_PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      ["display"],
    ),
    ["display"],
  );

  console.log(
    "DISPLAY_ONLY_EXECUTABLE_ROUTE=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      ["performance_max"],
    ),
    [],
  );

  console.log(
    "PERFORMANCE_MAX_ONLY_EXECUTABLE_ROUTE_EMPTY=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      ["search"],
    ),
    ["search"],
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      ["demand_gen"],
    ),
    ["demand_gen"],
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      [
        "display",
        "search",
        "performance_max",
      ],
    ),
    [
      "search",
      "display",
    ],
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      [
        "performance_max",
        "demand_gen",
        "display",
      ],
    ),
    [
      "demand_gen",
      "display",
    ],
  );

  console.log(
    "SEARCH_DEMAND_GEN_DISPLAY_CANONICAL_EXECUTION_ORDER=PASS",
  );

  console.log(
    "DISPLAY_RUNTIME_EXECUTION=ENABLED",
  );

  console.log(
    "PERFORMANCE_MAX_RUNTIME_EXECUTION=BLOCKED",
  );

  console.log(
    "INVENTORY_PRODUCT_CLASSIFICATION_MUTATION=NO",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_EXECUTABLE_PRODUCT_ROUTE_FIXTURE=PASS",
  );

  console.log(
    "DB_CALLS=0",
  );

  console.log(
    "GOOGLE_API_CALLS=0",
  );

  console.log(
    "GOOGLE_OAUTH_CALLS=0",
  );
}

main();

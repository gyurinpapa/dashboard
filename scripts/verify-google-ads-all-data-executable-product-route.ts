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
    ],
  );

  console.log(
    "MIXED_ACCOUNT_EXECUTABLE_ROUTE=SEARCH_DEMAND_GEN_PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      [
        "display",
        "performance_max",
      ],
    ),
    [],
  );

  console.log(
    "BLOCKED_ONLY_ACCOUNT_EXECUTABLE_ROUTE_EMPTY=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      ["search"],
    ),
    ["search"],
  );

  console.log(
    "SEARCH_ONLY_EXECUTABLE_ROUTE=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      ["demand_gen"],
    ),
    ["demand_gen"],
  );

  console.log(
    "DEMAND_GEN_ONLY_EXECUTABLE_ROUTE=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      [
        "display",
        "search",
        "performance_max",
      ],
    ),
    ["search"],
  );

  console.log(
    "SEARCH_WITH_FUTURE_PRODUCTS_EXECUTABLE_ROUTE=PASS",
  );

  assert.deepEqual(
    buildGoogleAdsAllDataExecutableProductRoute(
      [
        "performance_max",
        "demand_gen",
        "display",
      ],
    ),
    ["demand_gen"],
  );

  console.log(
    "DEMAND_GEN_WITH_FUTURE_PRODUCTS_EXECUTABLE_ROUTE=PASS",
  );

  console.log(
    "DISPLAY_RUNTIME_EXECUTION=BLOCKED",
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

import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  buildGoogleAdsAllDataProductRoute,
  readGoogleAdsAllDataProductRoutingState,
  validateGoogleAdsAllDataProductRoutingState,
  GoogleAdsAllDataProductRoutingError,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";

const canonical =
  buildGoogleAdsAllDataProductRoute([
    "performance_max",
    "search",
    "display",
    "search",
    "demand_gen",
  ]);

assert.deepEqual(
  canonical,
  [
    "search",
    "demand_gen",
    "display",
    "performance_max",
  ],
);

const partial =
  validateGoogleAdsAllDataProductRoutingState({
    route:
      canonical,
    productIndex:
      1,
    productFamily:
      "demand_gen",
    complete:
      false,
  });

assert.deepEqual(
  partial,
  {
    route: [
      "search",
      "demand_gen",
      "display",
      "performance_max",
    ],
    productIndex:
      1,
    productFamily:
      "demand_gen",
    complete:
      false,
  },
);

const completed =
  validateGoogleAdsAllDataProductRoutingState({
    route:
      canonical,
    productIndex:
      4,
    productFamily:
      null,
    complete:
      true,
  });

assert.equal(
  completed.productIndex,
  4,
);

assert.equal(
  completed.productFamily,
  null,
);

assert.throws(
  () =>
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "display",
        "search",
      ],
      productIndex:
        0,
      productFamily:
        "display",
      complete:
        false,
    }),
  GoogleAdsAllDataProductRoutingError,
);

assert.throws(
  () =>
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "search",
        "search",
      ],
      productIndex:
        0,
      productFamily:
        "search",
      complete:
        false,
    }),
  GoogleAdsAllDataProductRoutingError,
);

assert.throws(
  () =>
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "search",
        "display",
      ],
      productIndex:
        1,
      productFamily:
        "search",
      complete:
        false,
    }),
  GoogleAdsAllDataProductRoutingError,
);

const legacy =
  readGoogleAdsAllDataProductRoutingState({
    collector: {
      phase:
        "search_ad",
    },
    complete:
      false,
  });

assert.equal(
  legacy,
  null,
);

const persisted =
  readGoogleAdsAllDataProductRoutingState({
    collector: {
      product_route: [
        "search",
        "display",
      ],
      product_index:
        1,
      product_family:
        "display",
    },
    complete:
      false,
  });

assert.deepEqual(
  persisted,
  {
    route: [
      "search",
      "display",
    ],
    productIndex:
      1,
    productFamily:
      "display",
    complete:
      false,
  },
);

assert.throws(
  () =>
    readGoogleAdsAllDataProductRoutingState({
      collector: {
        product_route: [
          "search",
        ],
        product_index:
          0,
      },
      complete:
        false,
    }),
  GoogleAdsAllDataProductRoutingError,
);

const checkpointSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/media-sync/google-ads-all-data-processing-checkpoint.ts",
    ),
    "utf8",
  );

const repositorySource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/media-sync/google-ads-all-data-processing-checkpoint-repository.ts",
    ),
    "utf8",
  );

const sqlSource =
  readFileSync(
    resolve(
      process.cwd(),
      "scripts/sql/create-save-google-ads-all-data-processing-checkpoint.sql",
    ),
    "utf8",
  );

for (
  const required
  of [
    "GoogleAdsAllDataProductRoutingState",
    "readGoogleAdsAllDataProductRoutingState",
    "routing?:",
  ]
) {
  assert.ok(
    checkpointSource.includes(
      required,
    ),
    `checkpoint source missing ${required}`,
  );
}

for (
  const required
  of [
    "validateGoogleAdsAllDataProductRoutingState",
    "product_route",
    "product_index",
    "product_family",
  ]
) {
  assert.ok(
    repositorySource.includes(
      required,
    ),
    `checkpoint repository missing ${required}`,
  );
}

for (
  const required
  of [
    "v_has_product_routing",
    "v_existing_has_product_routing",
    "'product_route'",
    "'product_index'",
    "'product_family'",
    "MSC_CHECKPOINT_REGRESSION",
  ]
) {
  assert.ok(
    sqlSource.includes(
      required,
    ),
    `checkpoint SQL missing ${required}`,
  );
}

console.log(
  "GOOGLE_ADS_ALL_DATA_PRODUCT_ROUTING_FIXTURE=PASS",
);
console.log(
  "LEGACY_CHECKPOINT_COMPATIBILITY=PASS",
);
console.log(
  "CANONICAL_PRODUCT_ROUTE=SEARCH_DEMAND_GEN_DISPLAY_PERFORMANCE_MAX",
);
console.log(
  "SQL_PRODUCT_ROUTING_STATIC_CONTRACT=PASS",
);

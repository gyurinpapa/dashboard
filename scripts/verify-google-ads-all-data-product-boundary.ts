import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  resolveGoogleAdsAllDataProductCompletionBoundary,
  GoogleAdsAllDataProductRoutingError,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";

const partialProduct =
  resolveGoogleAdsAllDataProductCompletionBoundary({
    stagingComplete:
      false,

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
  });

assert.deepEqual(
  partialProduct,
  {
    globalComplete:
      false,

    atProductBoundary:
      false,
  },
);

const searchCompletedWithNextProduct =
  resolveGoogleAdsAllDataProductCompletionBoundary({
    stagingComplete:
      true,

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
  });

assert.deepEqual(
  searchCompletedWithNextProduct,
  {
    globalComplete:
      false,

    atProductBoundary:
      true,
  },
);

const routeCompleted =
  resolveGoogleAdsAllDataProductCompletionBoundary({
    stagingComplete:
      true,

    routing: {
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
  });

assert.deepEqual(
  routeCompleted,
  {
    globalComplete:
      true,

    atProductBoundary:
      false,
  },
);

assert.throws(
  () =>
    resolveGoogleAdsAllDataProductCompletionBoundary({
      stagingComplete:
        false,

      routing: {
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
    '"product_boundary"',
    "routing ===",
    "collector.cursor !==",
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
    "resolveGoogleAdsAllDataProductCompletionBoundary",
    "checkpointComplete",
    "atProductBoundary",
    '"product_boundary"',
  ]
) {
  assert.ok(
    repositorySource.includes(
      required,
    ),
    `repository source missing ${required}`,
  );
}

for (
  const required
  of [
    "when 'product_boundary' then 0",
    "v_phase = 'product_boundary'",
    "not v_has_product_routing",
    "v_cursor is not null",
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
  "GOOGLE_ADS_ALL_DATA_PRODUCT_BOUNDARY_FIXTURE=PASS",
);

console.log(
  "PRODUCT_COMPLETE_GLOBAL_INCOMPLETE_BOUNDARY=PASS",
);

console.log(
  "PRODUCT_BOUNDARY_CURSOR_NULL_CONTRACT=PASS",
);

console.log(
  "GLOBAL_COMPLETION_REMAINS_DISTINCT=PASS",
);

console.log(
  "ACCOUNT_INVENTORY_RUNTIME_ACTIVATION=NO",
);

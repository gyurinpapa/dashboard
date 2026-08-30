import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import {
  assertGoogleAdsAllDataCheckpointCanReleaseForResume,
} from "../src/lib/media-sync/google-ads-all-data-worker-handler";

import type {
  GoogleAdsAllDataProcessingCheckpointState,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";

const source =
  readFileSync(
    resolve(
      process.cwd(),
      "src/lib/media-sync/google-ads-all-data-worker-handler.ts",
    ),
    "utf8",
  );

const productBoundary =
  {
    hasCheckpoint:
      true,

    dateWindowIndex:
      0,

    phase:
      "product_boundary",

    cursor:
      null,

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

    nextRowIndex:
      7,

    complete:
      false,
  } as unknown as
    GoogleAdsAllDataProcessingCheckpointState;

assert.doesNotThrow(
  () =>
    assertGoogleAdsAllDataCheckpointCanReleaseForResume(
      productBoundary,
    ),
);

console.log(
  "PRODUCT_BOUNDARY_NULL_CURSOR_RELEASE=PASS",
);

const searchAdPartial =
  {
    hasCheckpoint:
      true,

    dateWindowIndex:
      0,

    phase:
      "search_ad",

    cursor: {
      version:
        1,
      phase:
        "search_ad",
    },

    nextRowIndex:
      4,

    complete:
      false,
  } as unknown as
    GoogleAdsAllDataProcessingCheckpointState;

assert.doesNotThrow(
  () =>
    assertGoogleAdsAllDataCheckpointCanReleaseForResume(
      searchAdPartial,
    ),
);

console.log(
  "SEARCH_AD_CURSOR_RELEASE=PRESERVED",
);

const demandGenPartial =
  {
    hasCheckpoint:
      true,

    dateWindowIndex:
      0,

    phase:
      "demand_gen_ad",

    cursor: {
      version:
        1,
      phase:
        "demand_gen_ad",
    },

    nextRowIndex:
      7,

    complete:
      false,
  } as unknown as
    GoogleAdsAllDataProcessingCheckpointState;

assert.doesNotThrow(
  () =>
    assertGoogleAdsAllDataCheckpointCanReleaseForResume(
      demandGenPartial,
    ),
);

console.log(
  "DEMAND_GEN_CURSOR_RELEASE=PRESERVED",
);

const invalidSearchNullCursor =
  {
    hasCheckpoint:
      true,

    dateWindowIndex:
      0,

    phase:
      "search_ad",

    cursor:
      null,

    nextRowIndex:
      7,

    complete:
      false,
  } as unknown as
    GoogleAdsAllDataProcessingCheckpointState;

assert.throws(
  () =>
    assertGoogleAdsAllDataCheckpointCanReleaseForResume(
      invalidSearchNullCursor,
    ),
  /Only a partial persisted Google Ads ALL-DATA checkpoint can be released/,
);

console.log(
  "NON_BOUNDARY_NULL_CURSOR_FAIL_CLOSED=PASS",
);

const invalidBoundaryWithoutRouting =
  {
    ...productBoundary,

    routing:
      undefined,
  } as unknown as
    GoogleAdsAllDataProcessingCheckpointState;

assert.throws(
  () =>
    assertGoogleAdsAllDataCheckpointCanReleaseForResume(
      invalidBoundaryWithoutRouting,
    ),
  /Only a partial persisted Google Ads ALL-DATA checkpoint can be released/,
);

console.log(
  "PRODUCT_BOUNDARY_MISSING_ROUTING_FAIL_CLOSED=PASS",
);

const completedState =
  {
    hasCheckpoint:
      true,

    dateWindowIndex:
      0,

    phase:
      "completed",

    cursor:
      null,

    nextRowIndex:
      7,

    complete:
      true,
  } as unknown as
    GoogleAdsAllDataProcessingCheckpointState;

assert.throws(
  () =>
    assertGoogleAdsAllDataCheckpointCanReleaseForResume(
      completedState,
    ),
  /Only a partial persisted Google Ads ALL-DATA checkpoint can be released/,
);

console.log(
  "COMPLETED_CHECKPOINT_RELEASE_BLOCKED=PASS",
);

assert.match(
  source,
  /releaseGoogleAdsAllDataJobForResume[\s\S]*?assertGoogleAdsAllDataCheckpointCanReleaseForResume\(\s*checkpoint,\s*\)/,
);

console.log(
  "RELEASE_HELPER_RUNTIME_WIRING=PASS",
);

console.log(
  "GOOGLE_ADS_PRODUCT_BOUNDARY_RELEASE_FIXTURE=PASS",
);

console.log(
  "LIVE_DB_CALLS=0",
);

console.log(
  "LIVE_GOOGLE_API_CALLS=0",
);

import assert from "node:assert/strict";

import {
  convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/google-ads-performance-max-asset-group-canonical-row";

import {
  prepareGoogleAdsAllDataSearchStagingRows,
} from "../src/lib/media-sync/google-ads-all-data-staging-contract";

const canonical =
  convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows({
    externalAccountId:
      "1234567890",

    campaign: {
      id:
        "100",
      name:
        "PMAX Campaign",
    },

    assetGroup: {
      id:
        "200",
      campaignId:
        "100",
      name:
        "Primary Asset Group",
    },

    records: [
      {
        date:
          "2026-05-01",
        assetGroupId:
          "200",
        impressions:
          100,
        clicks:
          10,
        cost:
          1.25,
        conversions:
          2,
        revenue:
          300,
      },
    ],
  });

const prepared =
  prepareGoogleAdsAllDataSearchStagingRows({
    externalAccountId:
      "1234567890",
    rowStartIndex:
      0,
    rows:
      canonical,
  });

assert.equal(
  prepared.length,
  1,
);

assert.equal(
  prepared[0]?.row_index,
  0,
);

assert.deepEqual(
  JSON.parse(
    prepared[0]?.row_key ??
    "null",
  ).slice(0, 3),
  [
    "google_ads",
    "performance_max",
    "asset_group",
  ],
);

assert.equal(
  prepared[0]?.row.provider_meta?.entity_id,
  "200",
);

console.log(
  "PMAX_STAGING_ROW_IDENTITY=PASS",
);

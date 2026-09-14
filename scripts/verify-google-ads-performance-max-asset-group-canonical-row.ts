import assert from "node:assert/strict";

import {
  GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL_REASON,
  convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/google-ads-performance-max-asset-group-canonical-row";

const rows =
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

assert.equal(
  rows.length,
  1,
);

const row =
  rows[0];

assert.equal(
  row.row_level,
  "creative",
);

assert.equal(
  row.data_level,
  "creative",
);

assert.equal(
  row.row_level_reason,
  GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL_REASON,
);

assert.equal(
  row.external_group_id,
  "200",
);

assert.equal(
  row.external_creative_id,
  "200",
);

assert.deepEqual(
  row.provider_meta,
  {
    provider:
      "google_ads",
    campaign_type:
      "PERFORMANCE_MAX",
    product_family:
      "performance_max",
    authoritative_grain:
      "asset_group",
    entity_type:
      "asset_group",
    entity_id:
      "200",
  },
);

console.log(
  "PMAX_CANONICAL_ROW=PASS",
);

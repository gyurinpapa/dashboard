import assert from "node:assert/strict";

import {
  convertGoogleAdsDisplayAdDailyStatsToCanonicalRows,
  GOOGLE_ADS_DISPLAY_AD_ROW_LEVEL_REASON,
} from "../src/lib/media-sync/google-ads-display-ad-canonical-row";

import {
  GoogleAdsAllDataStagingContractError,
  prepareGoogleAdsAllDataSearchStagingRows,
} from "../src/lib/media-sync/google-ads-all-data-staging-contract";

const externalAccountId =
  "1234567890";

const rows =
  convertGoogleAdsDisplayAdDailyStatsToCanonicalRows({
    externalAccountId,

    campaign: {
      id: "101",
      name: "Display Campaign",
    },

    adGroup: {
      id: "201",
      campaignId: "101",
      name: "Display Ad Group",
    },

    ad: {
      id: "301",
      adGroupId: "201",
    },

    records: [
      {
        date: "2026-08-25",
        adId: "301",
        impressions: 100,
        clicks: 10,
        cost: 25,
        conversions: 2,
        revenue: 80,
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
  row.row_level_reason,
  GOOGLE_ADS_DISPLAY_AD_ROW_LEVEL_REASON,
);

const meta =
  row.provider_meta as
    Record<string, unknown>;

assert.equal(
  meta.campaign_type,
  "DISPLAY",
);

assert.equal(
  meta.product_family,
  "display",
);

assert.equal(
  meta.authoritative_grain,
  "ad",
);

assert.equal(
  meta.entity_type,
  "ad",
);

assert.equal(
  meta.entity_id,
  "301",
);

const prepared =
  prepareGoogleAdsAllDataSearchStagingRows({
    externalAccountId,
    rowStartIndex: 7,
    rows,
  });

assert.equal(
  prepared.length,
  1,
);

assert.equal(
  prepared[0].row_index,
  7,
);

assert.deepEqual(
  JSON.parse(
    prepared[0].row_key,
  ),
  [
    "google_ads",
    "display",
    "ad",
    externalAccountId,
    "101",
    "201",
    "301",
    "2026-08-25",
  ],
);

const malformed = {
  ...row,

  provider_meta: {
    ...meta,
    product_family:
      "demand_gen",
  },
};

assert.throws(
  () => {
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId,
      rowStartIndex: 7,
      rows: [
        malformed as typeof row,
      ],
    });
  },
  (
    error:
      unknown,
  ) =>
    error instanceof
      GoogleAdsAllDataStagingContractError &&
    error.code ===
      "INVALID_AUTHORITY_METADATA",
);

console.log(
  "DISPLAY_SHARED_STAGING_CONTRACT=PASS",
);

console.log(
  "DISPLAY_SHARED_STAGING_FAIL_CLOSED=PASS",
);

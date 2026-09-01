import assert from "node:assert/strict";

import {
  GOOGLE_ADS_DISPLAY_AD_ROW_LEVEL_REASON,
  GoogleAdsDisplayAdCanonicalRowError,
  convertGoogleAdsDisplayAdDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/google-ads-display-ad-canonical-row";

function expectError(
  fn: () => unknown,
  code:
    GoogleAdsDisplayAdCanonicalRowError["code"],
): void {
  try {
    fn();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsDisplayAdCanonicalRowError,
    );

    assert.equal(
      error.code,
      code,
    );

    return;
  }

  assert.fail(
    `Expected GoogleAdsDisplayAdCanonicalRowError ${code}`,
  );
}

const baseInput = {
  externalAccountId:
    "1234567890",

  campaign: {
    id:
      "1001",
    name:
      "Search Campaign",
  },

  adGroup: {
    id:
      "2001",
    campaignId:
      "1001",
    name:
      "Search Ad Group",
  },

  ad: {
    id:
      "3001",
    adGroupId:
      "2001",
  },

  records: [
    {
      date:
        "2026-08-24",
      adId:
        "3001",
      impressions:
        100,
      clicks:
        10,
      cost:
        12_345,
      conversions:
        2,
      revenue:
        40_000,
    },

    {
      date:
        "2026-08-25",
      adId:
        "3001",
      impressions:
        200,
      clicks:
        20,
      cost:
        23_456,
      conversions:
        3,
      revenue:
        60_000,
    },
  ],
} as const;

function verifyCanonicalRows(): void {
  const rows =
    convertGoogleAdsDisplayAdDailyStatsToCanonicalRows(
      baseInput,
    );

  assert.equal(
    rows.length,
    2,
  );

  const first =
    rows[0];

  assert.ok(
    first,
  );

  assert.equal(
    first.date,
    "2026-08-24",
  );

  assert.equal(
    first.row_level,
    "creative",
  );

  assert.equal(
    first.data_level,
    "creative",
  );

  assert.equal(
    first.row_level_reason,
    GOOGLE_ADS_DISPLAY_AD_ROW_LEVEL_REASON,
  );

  assert.equal(
    first.provider,
    "google_ads",
  );

  assert.equal(
    first.ingestion_source,
    "api",
  );

  assert.equal(
    first.external_account_id,
    "1234567890",
  );

  assert.equal(
    first.external_campaign_id,
    "1001",
  );

  assert.equal(
    first.external_group_id,
    "2001",
  );

  assert.equal(
    first.external_creative_id,
    "3001",
  );

  assert.equal(
    first.creative,
    "3001",
  );

  assert.equal(
    first.creative_name,
    "3001",
  );

  assert.deepEqual(
    first.provider_meta,
    {
      provider:
        "google_ads",
      campaign_type:
        "DISPLAY",
      product_family:
        "display",
      authoritative_grain:
        "ad",
      entity_type:
        "ad",
      entity_id:
        "3001",
    },
  );

  assert.equal(
    first.impressions,
    100,
  );

  assert.equal(
    first.clicks,
    10,
  );

  assert.equal(
    first.cost,
    12_345,
  );

  assert.equal(
    first.conversions,
    2,
  );

  assert.equal(
    first.revenue,
    40_000,
  );

  assert.equal(
    "external_keyword_id" in first,
    false,
  );

  console.log(
    "DISPLAY_AD_CANONICAL_ROW_LEVEL=PASS",
  );

  console.log(
    "DISPLAY_AD_EXTERNAL_HIERARCHY=PASS",
  );

  console.log(
    "DISPLAY_AD_AUTHORITY_PROVIDER_META=PASS",
  );

  console.log(
    "DISPLAY_AD_METRICS_PRESERVED=PASS",
  );

  console.log(
    "DISPLAY_AD_NAME_DOES_NOT_REQUIRE_AD_NAME_FIELD=PASS",
  );

  console.log(
    "DISPLAY_AD_HAS_NO_KEYWORD_ID=PASS",
  );
}

function verifyFailures(): void {
  expectError(
    () =>
      convertGoogleAdsDisplayAdDailyStatsToCanonicalRows({
        ...baseInput,

        adGroup: {
          ...baseInput.adGroup,
          campaignId:
            "different-campaign",
        },
      }),
    "SCOPE_MISMATCH",
  );

  expectError(
    () =>
      convertGoogleAdsDisplayAdDailyStatsToCanonicalRows({
        ...baseInput,

        ad: {
          ...baseInput.ad,
          adGroupId:
            "different-ad-group",
        },
      }),
    "SCOPE_MISMATCH",
  );

  expectError(
    () =>
      convertGoogleAdsDisplayAdDailyStatsToCanonicalRows({
        ...baseInput,

        records: [
          {
            ...baseInput.records[0],
            adId:
              "different-ad",
          },
        ],
      }),
    "SCOPE_MISMATCH",
  );

  expectError(
    () =>
      convertGoogleAdsDisplayAdDailyStatsToCanonicalRows({
        ...baseInput,

        records: [
          baseInput.records[0],
          {
            ...baseInput.records[0],
          },
        ],
      }),
    "DUPLICATE_DATE",
  );

  expectError(
    () =>
      convertGoogleAdsDisplayAdDailyStatsToCanonicalRows({
        ...baseInput,

        records: [
          {
            ...baseInput.records[0],
            cost:
              -1,
          },
        ],
      }),
    "INVALID_STATS_RECORD",
  );

  console.log(
    "DISPLAY_AD_HIERARCHY_FAIL_CLOSED=PASS",
  );

  console.log(
    "DISPLAY_AD_RECORD_SCOPE_FAIL_CLOSED=PASS",
  );

  console.log(
    "DISPLAY_AD_DUPLICATE_DATE_FAIL_CLOSED=PASS",
  );

  console.log(
    "DISPLAY_AD_INVALID_METRIC_FAIL_CLOSED=PASS",
  );
}

verifyCanonicalRows();
verifyFailures();

console.log(
  "GOOGLE_ADS_DISPLAY_AD_CANONICAL_FIXTURE=PASS",
);

console.log(
  "LIVE_GOOGLE_ADS_API_CALLS=0",
);

console.log(
  "DB_WRITES=0",
);

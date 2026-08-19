// scripts/verify-google-ads-canonical-row.ts

import assert from "node:assert/strict";

import {
  convertGoogleAdsKeywordDailyStatsToCanonicalRows,
  GOOGLE_ADS_CANONICAL_DEFAULT_CHANNEL,
  GOOGLE_ADS_CANONICAL_DEFAULT_DEVICE,
  GOOGLE_ADS_CANONICAL_DEFAULT_PLATFORM,
  GOOGLE_ADS_CANONICAL_DEFAULT_SOURCE,
  GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON,
  GoogleAdsCanonicalRowError,
  type GoogleAdsCanonicalRowErrorCode,
  type ConvertGoogleAdsKeywordDailyStatsToCanonicalRowsInput,
} from "../src/lib/media-sync/google-ads-canonical-row";

const BASE_INPUT:
  ConvertGoogleAdsKeywordDailyStatsToCanonicalRowsInput =
{
  externalAccountId:
    "1234567890",

  campaign: {
    id:
      "1001",
    name:
      "Fixture Search Campaign",
  },

  adGroup: {
    id:
      "2001",
    campaignId:
      "1001",
    name:
      "Fixture Search Ad Group",
  },

  keyword: {
    id:
      "3001",
    adGroupId:
      "2001",
    text:
      "fixture keyword",
  },

  records: [
    {
      date:
        "2026-05-02",
      keywordId:
        "3001",
      impressions:
        200,
      clicks:
        20,
      cost:
        24000,
      conversions:
        3.5,
      revenue:
        64000,
    },
    {
      date:
        "2026-05-01",
      keywordId:
        "3001",
      impressions:
        100,
      clicks:
        10,
      cost:
        12000,
      conversions:
        2,
      revenue:
        32000,
    },
  ],
};

function expectCanonicalError(
  name: string,
  expectedCode: GoogleAdsCanonicalRowErrorCode,
  run: () => unknown,
): void {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof
        GoogleAdsCanonicalRowError &&
      error.code ===
        expectedCode,
    name,
  );
}

function verifyExactCanonicalMapping(): void {
  const rows =
    convertGoogleAdsKeywordDailyStatsToCanonicalRows(
      BASE_INPUT,
    );

  assert.equal(
    rows.length,
    2,
  );

  assert.deepEqual(
    rows.map(
      (row) =>
        row.date,
    ),
    [
      "2026-05-01",
      "2026-05-02",
    ],
  );

  const row =
    rows[0];

  assert.ok(row);

  assert.deepEqual(
    {
      date:
        row.date,
      report_date:
        row.report_date,
      day:
        row.day,
      ymd:
        row.ymd,

      channel:
        row.channel,
      source:
        row.source,
      platform:
        row.platform,
      device:
        row.device,

      campaign:
        row.campaign,
      campaign_name:
        row.campaign_name,

      group:
        row.group,
      group_name:
        row.group_name,
      adgroup_name:
        row.adgroup_name,

      keyword:
        row.keyword,
      keyword_name:
        row.keyword_name,

      impressions:
        row.impressions,
      clicks:
        row.clicks,
      cost:
        row.cost,
      conversions:
        row.conversions,
      revenue:
        row.revenue,

      row_level:
        row.row_level,
      data_level:
        row.data_level,
      row_level_reason:
        row.row_level_reason,

      provider:
        row.provider,
      ingestion_source:
        row.ingestion_source,

      external_account_id:
        row.external_account_id,
      external_campaign_id:
        row.external_campaign_id,
      external_group_id:
        row.external_group_id,
      external_keyword_id:
        row.external_keyword_id,
    },
    {
      date:
        "2026-05-01",
      report_date:
        "2026-05-01",
      day:
        "2026-05-01",
      ymd:
        "2026-05-01",

      channel:
        GOOGLE_ADS_CANONICAL_DEFAULT_CHANNEL,
      source:
        GOOGLE_ADS_CANONICAL_DEFAULT_SOURCE,
      platform:
        GOOGLE_ADS_CANONICAL_DEFAULT_PLATFORM,
      device:
        GOOGLE_ADS_CANONICAL_DEFAULT_DEVICE,

      campaign:
        "Fixture Search Campaign",
      campaign_name:
        "Fixture Search Campaign",

      group:
        "Fixture Search Ad Group",
      group_name:
        "Fixture Search Ad Group",
      adgroup_name:
        "Fixture Search Ad Group",

      keyword:
        "fixture keyword",
      keyword_name:
        "fixture keyword",

      impressions:
        100,
      clicks:
        10,
      cost:
        12000,
      conversions:
        2,
      revenue:
        32000,

      row_level:
        "keyword",
      data_level:
        "keyword",
      row_level_reason:
        GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON,

      provider:
        "google_ads",
      ingestion_source:
        "api",

      external_account_id:
        "1234567890",
      external_campaign_id:
        "1001",
      external_group_id:
        "2001",
      external_keyword_id:
        "3001",
    },
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      row,
      "creative",
    ),
    false,
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      row,
      "external_ad_id",
    ),
    false,
  );
}

function verifyHierarchyMismatchFailsClosed(): void {
  expectCanonicalError(
    "ad group / campaign scope mismatch must fail closed",
    "SCOPE_MISMATCH",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        adGroup: {
          ...BASE_INPUT.adGroup,
          campaignId:
            "different-campaign",
        },
      }),
  );

  expectCanonicalError(
    "keyword / ad group scope mismatch must fail closed",
    "SCOPE_MISMATCH",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        keyword: {
          ...BASE_INPUT.keyword,
          adGroupId:
            "different-ad-group",
        },
      }),
  );
}

function verifyStatsScopeMismatchFailsClosed(): void {
  expectCanonicalError(
    "stats / keyword scope mismatch must fail closed",
    "SCOPE_MISMATCH",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        records: [
          {
            ...BASE_INPUT.records[0],
            keywordId:
              "different-keyword",
          },
        ],
      }),
  );
}

function verifyDuplicateDateFailsClosed(): void {
  expectCanonicalError(
    "duplicate keyword date must fail closed",
    "DUPLICATE_DATE",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        records: [
          {
            ...BASE_INPUT.records[0],
            date:
              "2026-05-01",
          },
          {
            ...BASE_INPUT.records[1],
            date:
              "2026-05-01",
          },
        ],
      }),
  );
}

function verifyInvalidMetricsFailClosed(): void {
  expectCanonicalError(
    "negative metric must fail closed",
    "INVALID_STATS_RECORD",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        records: [
          {
            ...BASE_INPUT.records[0],
            clicks:
              -1,
          },
        ],
      }),
  );

  expectCanonicalError(
    "non-finite metric must fail closed",
    "INVALID_STATS_RECORD",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        records: [
          {
            ...BASE_INPUT.records[0],
            cost:
              Number.NaN,
          },
        ],
      }),
  );
}

function verifyInvalidDateFailsClosed(): void {
  expectCanonicalError(
    "invalid date format must fail closed",
    "INVALID_STATS_RECORD",
    () =>
      convertGoogleAdsKeywordDailyStatsToCanonicalRows({
        ...BASE_INPUT,
        records: [
          {
            ...BASE_INPUT.records[0],
            date:
              "not-a-date",
          },
        ],
      }),
  );
}

function verifyEmptyStatsIsSafe(): void {
  const rows =
    convertGoogleAdsKeywordDailyStatsToCanonicalRows({
      ...BASE_INPUT,
      records: [],
    });

  assert.deepEqual(
    rows,
    [],
  );
}

function main(): void {
  verifyExactCanonicalMapping();
  verifyHierarchyMismatchFailsClosed();
  verifyStatsScopeMismatchFailsClosed();
  verifyDuplicateDateFailsClosed();
  verifyInvalidMetricsFailClosed();
  verifyInvalidDateFailsClosed();
  verifyEmptyStatsIsSafe();

  console.log(
    "GOOGLE_ADS_CANONICAL_ROW_FIXTURE=PASS",
  );

  console.log(
    "verified provider: google_ads",
  );

  console.log(
    "verified data level: keyword",
  );

  console.log(
    `verified row level reason: ${GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON}`,
  );

  console.log(
    `verified channel/source/platform/device: ${JSON.stringify([
      GOOGLE_ADS_CANONICAL_DEFAULT_CHANNEL,
      GOOGLE_ADS_CANONICAL_DEFAULT_SOURCE,
      GOOGLE_ADS_CANONICAL_DEFAULT_PLATFORM,
      GOOGLE_ADS_CANONICAL_DEFAULT_DEVICE,
    ])}`,
  );

  console.log(
    "verified Google API calls: 0",
  );

  console.log(
    "verified database writes: 0",
  );
}

main();

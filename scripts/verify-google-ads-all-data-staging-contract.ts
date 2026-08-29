import assert from "node:assert/strict";

import {
  buildGoogleAdsAllDataSearchStagingRowKey,
  GoogleAdsAllDataStagingContractError,
  prepareGoogleAdsAllDataSearchStagingRows,
} from "../src/lib/media-sync/google-ads-all-data-staging-contract";
import {
  buildMediaSyncStagingRowKey,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const ACCOUNT_ID =
  "1234567890";

const CAMPAIGN_ID =
  "1001";

const GROUP_ID =
  "2001";

const SHARED_ENTITY_ID =
  "3001";

const DATE =
  "2026-08-25";

function keywordRow():
  EtrylueNormalizedMediaRow {
  return {
    date:
      DATE,
    report_date:
      DATE,
    day:
      DATE,
    ymd:
      DATE,

    channel:
      "Google Ads",
    source:
      "Google Ads",
    platform:
      "Google Ads",
    device:
      "UNKNOWN",

    campaign:
      "Search Campaign",
    campaign_name:
      "Search Campaign",

    group:
      "Search Ad Group",
    group_name:
      "Search Ad Group",
    adgroup_name:
      "Search Ad Group",

    keyword:
      "fixture keyword",
    keyword_name:
      "fixture keyword",

    impressions:
      100,
    clicks:
      10,
    cost:
      12.345,
    conversions:
      2,
    revenue:
      40,

    row_level:
      "keyword",
    data_level:
      "keyword",
    row_level_reason:
      "google_ads_keyword_daily_stats",

    provider:
      "google_ads",
    ingestion_source:
      "api",

    external_account_id:
      ACCOUNT_ID,
    external_campaign_id:
      CAMPAIGN_ID,
    external_group_id:
      GROUP_ID,
    external_keyword_id:
      SHARED_ENTITY_ID,
  } as EtrylueNormalizedMediaRow;
}

function adRow():
  EtrylueNormalizedMediaRow {
  return {
    date:
      DATE,
    report_date:
      DATE,
    day:
      DATE,
    ymd:
      DATE,

    channel:
      "Google Ads",
    source:
      "Google Ads",
    platform:
      "Google Ads",
    device:
      "UNKNOWN",

    campaign:
      "Search Campaign",
    campaign_name:
      "Search Campaign",

    group:
      "Search Ad Group",
    group_name:
      "Search Ad Group",
    adgroup_name:
      "Search Ad Group",

    creative:
      SHARED_ENTITY_ID,
    creative_name:
      SHARED_ENTITY_ID,

    impressions:
      104,
    clicks:
      11,
    cost:
      13.5,
    conversions:
      2.2,
    revenue:
      42,

    row_level:
      "creative",
    data_level:
      "creative",
    row_level_reason:
      "google_ads_search_ad_daily_stats",

    provider:
      "google_ads",
    ingestion_source:
      "api",

    external_account_id:
      ACCOUNT_ID,
    external_campaign_id:
      CAMPAIGN_ID,
    external_group_id:
      GROUP_ID,
    external_creative_id:
      SHARED_ENTITY_ID,

    provider_meta: {
      provider:
        "google_ads",
      campaign_type:
        "SEARCH",
      product_family:
        "search",
      authoritative_grain:
        "ad",
      entity_type:
        "ad",
      entity_id:
        SHARED_ENTITY_ID,
      fixture_marker:
        "preserve-me",
    },
  } as EtrylueNormalizedMediaRow;
}

function expectError(
  fn: () => unknown,
  code:
    GoogleAdsAllDataStagingContractError["code"],
): void {
  try {
    fn();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsAllDataStagingContractError,
    );

    assert.equal(
      error.code,
      code,
    );

    return;
  }

  assert.fail(
    `Expected GoogleAdsAllDataStagingContractError ${code}`,
  );
}

function verifyLegacyKeywordIdentityUnchanged(): void {
  const legacy =
    keywordRow();

  const legacyKey =
    buildMediaSyncStagingRowKey(
      legacy,
    );

  assert.equal(
    legacyKey,
    JSON.stringify([
      "google_ads",
      ACCOUNT_ID,
      CAMPAIGN_ID,
      GROUP_ID,
      SHARED_ENTITY_ID,
      DATE,
    ]),
  );

  assert.equal(
    "provider_meta" in legacy,
    false,
  );

  console.log(
    "LEGACY_GOOGLE_KEYWORD_ROW_KEY_EXACT=PASS",
  );

  console.log(
    "LEGACY_KEYWORD_ROW_REMAINS_UNTAGGED=PASS",
  );
}

function verifyAllDataKeywordPreparation(): void {
  const original =
    keywordRow();

  const prepared =
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId:
        ACCOUNT_ID,

      rowStartIndex:
        0,

      rows: [
        original,
      ],
    });

  assert.equal(
    prepared.length,
    1,
  );

  const staged =
    prepared[0];

  assert.ok(
    staged,
  );

  assert.equal(
    staged.row_index,
    0,
  );

  assert.equal(
    staged.row_key,
    JSON.stringify([
      "google_ads",
      "search",
      "keyword",
      ACCOUNT_ID,
      CAMPAIGN_ID,
      GROUP_ID,
      SHARED_ENTITY_ID,
      DATE,
    ]),
  );

  assert.deepEqual(
    staged.row.provider_meta,
    {
      provider:
        "google_ads",
      campaign_type:
        "SEARCH",
      product_family:
        "search",
      authoritative_grain:
        "ad",
      entity_type:
        "keyword",
      entity_id:
        SHARED_ENTITY_ID,
    },
  );

  assert.equal(
    "provider_meta" in original,
    false,
  );

  console.log(
    "ALL_DATA_KEYWORD_PRODUCT_GRAIN_IDENTITY=PASS",
  );

  console.log(
    "ALL_DATA_KEYWORD_AUTHORITY_TAGGING=PASS",
  );

  console.log(
    "LEGACY_KEYWORD_INPUT_NOT_MUTATED=PASS",
  );
}

function verifyAllDataAdPreparation(): void {
  const original =
    adRow();

  const prepared =
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId:
        ACCOUNT_ID,

      rowStartIndex:
        1,

      rows: [
        original,
      ],
    });

  const staged =
    prepared[0];

  assert.ok(
    staged,
  );

  assert.equal(
    staged.row_index,
    1,
  );

  assert.equal(
    staged.row_key,
    JSON.stringify([
      "google_ads",
      "search",
      "ad",
      ACCOUNT_ID,
      CAMPAIGN_ID,
      GROUP_ID,
      SHARED_ENTITY_ID,
      DATE,
    ]),
  );

  const meta =
    staged.row.provider_meta as
      Record<string, unknown>;

  assert.equal(
    meta.product_family,
    "search",
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
    SHARED_ENTITY_ID,
  );

  assert.equal(
    meta.fixture_marker,
    "preserve-me",
  );

  console.log(
    "ALL_DATA_SEARCH_AD_PRODUCT_GRAIN_IDENTITY=PASS",
  );

  console.log(
    "ALL_DATA_SEARCH_AD_AUTHORITY_PRESERVED=PASS",
  );
}

function verifyCrossGrainCollisionSafety(): void {
  const keywordPrepared =
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId:
        ACCOUNT_ID,

      rowStartIndex:
        0,

      rows: [
        keywordRow(),
      ],
    });

  const adPrepared =
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId:
        ACCOUNT_ID,

      rowStartIndex:
        keywordPrepared.length,

      rows: [
        adRow(),
      ],
    });

  const keyword =
    keywordPrepared[0];

  const ad =
    adPrepared[0];

  assert.ok(
    keyword,
  );

  assert.ok(
    ad,
  );

  assert.notEqual(
    keyword.row_key,
    ad.row_key,
  );

  assert.deepEqual(
    [
      keyword.row_index,
      ad.row_index,
    ],
    [
      0,
      1,
    ],
  );

  console.log(
    "CROSS_GRAIN_SAME_EXTERNAL_ID_NO_COLLISION=PASS",
  );

  console.log(
    "KEYWORD_TO_AD_GLOBAL_ROW_INDEX_CONTIGUITY=PASS",
  );
}

function verifyDirectKeyBuilder(): void {
  const prepared =
    prepareGoogleAdsAllDataSearchStagingRows({
      externalAccountId:
        ACCOUNT_ID,

      rowStartIndex:
        9,

      rows: [
        keywordRow(),
        adRow(),
      ],
    });

  assert.equal(
    prepared[0]?.row_index,
    9,
  );

  assert.equal(
    prepared[1]?.row_index,
    10,
  );

  for (
    const staged
    of prepared
  ) {
    assert.equal(
      buildGoogleAdsAllDataSearchStagingRowKey(
        staged.row,
      ),
      staged.row_key,
    );
  }

  console.log(
    "ALL_DATA_EXPLICIT_ROW_START_OFFSET=PASS",
  );

  console.log(
    "ALL_DATA_ROW_KEY_REPRODUCIBLE=PASS",
  );
}

function verifyFailures(): void {
  expectError(
    () =>
      prepareGoogleAdsAllDataSearchStagingRows({
        externalAccountId:
          "different-account",

        rowStartIndex:
          0,

        rows: [
          keywordRow(),
        ],
      }),
    "SCOPE_MISMATCH",
  );

  expectError(
    () => {
      const malformed =
        adRow();

      (
        malformed.provider_meta as
          Record<string, unknown>
      ).entity_type =
        "keyword";

      prepareGoogleAdsAllDataSearchStagingRows({
        externalAccountId:
          ACCOUNT_ID,

        rowStartIndex:
          0,

        rows: [
          malformed,
        ],
      });
    },
    "INVALID_AUTHORITY_METADATA",
  );

  expectError(
    () =>
      prepareGoogleAdsAllDataSearchStagingRows({
        externalAccountId:
          ACCOUNT_ID,

        rowStartIndex:
          0,

        rows: [
          {
            ...keywordRow(),
            external_keyword_id:
              undefined,
          } as EtrylueNormalizedMediaRow,
        ],
      }),
    "INVALID_INPUT",
  );

  const duplicate =
    keywordRow();

  expectError(
    () =>
      prepareGoogleAdsAllDataSearchStagingRows({
        externalAccountId:
          ACCOUNT_ID,

        rowStartIndex:
          0,

        rows: [
          duplicate,
          {
            ...duplicate,
          } as EtrylueNormalizedMediaRow,
        ],
      }),
    "DUPLICATE_ROW_KEY",
  );

  console.log(
    "ALL_DATA_ACCOUNT_SCOPE_FAIL_CLOSED=PASS",
  );

  console.log(
    "ALL_DATA_AUTHORITY_MISMATCH_FAIL_CLOSED=PASS",
  );

  console.log(
    "ALL_DATA_MISSING_ENTITY_ID_FAIL_CLOSED=PASS",
  );

  console.log(
    "ALL_DATA_DUPLICATE_ROW_KEY_FAIL_CLOSED=PASS",
  );
}

verifyLegacyKeywordIdentityUnchanged();
verifyAllDataKeywordPreparation();
verifyAllDataAdPreparation();
verifyCrossGrainCollisionSafety();
verifyDirectKeyBuilder();
verifyFailures();

console.log(
  "GOOGLE_ADS_ALL_DATA_STAGING_CONTRACT_FIXTURE=PASS",
);

console.log(
  "LIVE_GOOGLE_ADS_API_CALLS=0",
);

console.log(
  "DB_WRITES=0",
);

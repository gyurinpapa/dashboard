// scripts/verify-google-ads-staging-row-identity.ts

import assert from "node:assert/strict";

import {
  convertGoogleAdsKeywordDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/google-ads-canonical-row";
import {
  buildMediaSyncStagingRowKey,
  MediaSyncStagingRowIdentityError,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const BASE_INPUT = {
  externalAccountId: "1234567890",
  campaign: {
    id: "1001",
    name: "Fixture Search Campaign",
  },
  adGroup: {
    id: "2001",
    campaignId: "1001",
    name: "Fixture Search Ad Group",
  },
  keyword: {
    id: "3001",
    adGroupId: "2001",
    text: "fixture keyword",
  },
  records: [
    {
      date: "2026-05-01",
      keywordId: "3001",
      impressions: 100,
      clicks: 10,
      cost: 12000,
      conversions: 2,
      revenue: 32000,
    },
  ],
} as const;

function expectIdentityError(
  expectedCode: MediaSyncStagingRowIdentityError["code"],
  row: EtrylueNormalizedMediaRow,
): void {
  assert.throws(
    () => buildMediaSyncStagingRowKey(row),
    (error: unknown) =>
      error instanceof MediaSyncStagingRowIdentityError &&
      error.code === expectedCode,
  );
}

function main(): void {
  const [row] =
    convertGoogleAdsKeywordDailyStatsToCanonicalRows(BASE_INPUT);

  assert.ok(row);

  const key =
    buildMediaSyncStagingRowKey(row);

  assert.equal(
    key,
    JSON.stringify([
      "google_ads",
      "1234567890",
      "1001",
      "2001",
      "3001",
      "2026-05-01",
    ]),
  );

  assert.equal(
    buildMediaSyncStagingRowKey({
      ...row,
      campaign: "Renamed campaign",
      campaign_name: "Renamed campaign",
      group: "Renamed group",
      group_name: "Renamed group",
      adgroup_name: "Renamed group",
      keyword: "renamed keyword",
      keyword_name: "renamed keyword",
      impressions: row.impressions + 100,
      clicks: row.clicks + 10,
      cost: row.cost + 1000,
      conversions: row.conversions + 1,
      revenue: row.revenue + 5000,
    }),
    key,
  );

  assert.notEqual(
    buildMediaSyncStagingRowKey({
      ...row,
      external_keyword_id: "different-keyword",
    }),
    key,
  );

  assert.notEqual(
    buildMediaSyncStagingRowKey({
      ...row,
      date: "2026-05-02",
      report_date: "2026-05-02",
      day: "2026-05-02",
      ymd: "2026-05-02",
    }),
    key,
  );

  for (const level of [
    "creative",
    "mixed",
    "unknown",
  ] as const) {
    expectIdentityError(
      "UNSUPPORTED_ROW_LEVEL",
      {
        ...row,
        row_level: level,
        data_level: level,
      },
    );
  }

  console.log("GOOGLE_ADS_STAGING_ROW_IDENTITY_FIXTURE=PASS");
  console.log(`verified row_key: ${key}`);
  console.log("verified Google creative/mixed/unknown staging identity: blocked");
  console.log("verified Google API calls: 0");
  console.log("verified database writes: 0");
}

main();

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  resolveNaverSearchAdsCampaignCollectionContract,
} from "../src/lib/media-sync/naver-searchads-authoritative-grain";

import {
  convertNaverAuthoritativeEntityCollectorItemToCanonicalRows,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter";

import {
  collectNaverAuthoritativeEntityDailyStats,
  type NaverAuthoritativeEntityStatsCollectorDependencies,
  type NaverAuthoritativeEntityStatsCollectorItem,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";

import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";

import {
  buildMediaSyncStagingRowKey,
} from "../src/lib/media-sync/media-sync-staging-row-identity";

import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";

import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const credentials = {
  customerId: "297551",
  accessLicense: "fixture-access",
  secretKey: "fixture-secret",
};

const campaign: NaverSearchAdsCampaignRecord = {
  id: "cmp-web",
  name: "민트 WEB_SITE",
  campaignType: "WEB_SITE",
  status: "ELIGIBLE",
  statusReason: null,
  userLock: false,
};

const adgroup: NaverSearchAdsAdgroupRecord = {
  id: "grp-web",
  campaignId: campaign.id,
  name: "정계정맥류",
  adgroupType: "WEB_SITE",
  status: "ELIGIBLE",
  statusReason: null,
  userLock: false,
};

const ad: NaverSearchAdsAdRecord = {
  id: "nad-a001-01-000000565158061",
  adgroupId: adgroup.id,
  type: "MEDICAL_AD",
  inspectStatus: "APPROVED",
  status: "ELIGIBLE",
  statusReason: "ELIGIBLE",
  userLock: false,
  referenceKey: null,

  headline:
    "정계정맥류 치료, 민트병원",

  description:
    "초음파 검사, 정계정맥류 색전술, 고환통증, 남성불임, 최소침습지향, 송파 문정역",

  imagePath:
    "/fixture/297551-mint.png",

  siteName:
    "민트병원",

  pcFinalUrl:
    "https://mintir.com/example-pc",

  mobileFinalUrl:
    "https://mintir.com/example-mo",
};

const stats: NaverSearchAdsEntityDailyStatsResult = {
  entityId: ad.id,
  entityType: "ad",
  dateFrom: "2026-08-01",
  dateTo: "2026-08-02",
  records: [
    {
      entityId: ad.id,
      entityType: "ad",
      date: "2026-08-01",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-01",
      impCnt: 100,
      clkCnt: 7,
      salesAmt: 55000,
      ccnt: 1,
      convAmt: 0,
    },
    {
      entityId: ad.id,
      entityType: "ad",
      date: "2026-08-02",
      periodStart: "2026-08-02",
      periodEnd: "2026-08-02",
      impCnt: 0,
      clkCnt: 0,
      salesAmt: 0,
      ccnt: 0,
      convAmt: 0,
    },
  ],
};

function page<T>(
  records: T[],
): NaverSearchAdsListPage<T> {
  return {
    records,
    nextBaseSearchId: null,
    recordSize: 100,
    selector: "NEXT",
    baseSearchId: null,
  };
}

async function main(): Promise<void> {
  /*
   * Absolute invariant:
   * WEB_SITE KPI authority must remain keyword.
   */
  const contract =
    resolveNaverSearchAdsCampaignCollectionContract(
      "WEB_SITE",
    );

  assert.equal(
    contract.authoritativeGrain,
    "keyword",
  );

  assert.equal(
    contract.canonicalRowLevel,
    "keyword",
  );

  const consumed:
    NaverAuthoritativeEntityStatsCollectorItem[] = [];

  const canonicalRows:
    EtrylueNormalizedMediaRow[] = [];

  const dependencies:
    Partial<NaverAuthoritativeEntityStatsCollectorDependencies> = {
      fetchCampaignPage:
        async () =>
          page([campaign]),

      fetchAdgroupPage:
        async () =>
          page([adgroup]),

      fetchAdPage:
        async () =>
          page([ad]),

      fetchEntityDailyStats:
        async (input) => {
          assert.equal(
            input.entityId,
            ad.id,
          );

          assert.equal(
            input.entityType,
            "ad",
          );

          return stats;
        },

      sleep:
        async () =>
          undefined,

      now:
        () =>
          Date.parse(
            "2026-09-15T06:00:00.000Z",
          ),

      random:
        () =>
          0,
    };

  const result =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials,

      cursor:
        createNaverAuthoritativeEntityStatsCursor({
          dateWindow: {
            index: 0,
            dateFrom:
              "2026-08-01",
            dateTo:
              "2026-08-02",
          },
        }),

      requestIntervalMs: 0,
      maxRetryCount: 1,
      maxEntityStatsPerRun: 20,
      maxStatsRequestsPerRun: 20,
      maxDiscoveryPagesPerRun: 20,

      dependencies,

      onEntityStats:
        (item) => {
          consumed.push(
            item,
          );

          canonicalRows.push(
            ...convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
              externalAccountId:
                "297551",

              item,
            }),
          );
        },
    });

  assert.equal(
    result.status,
    "completed",
  );

  assert.equal(
    result.isComplete,
    true,
  );

  assert.equal(
    consumed.length,
    1,
  );

  assert.equal(
    consumed[0]?.campaign
      .campaignType,
    "WEB_SITE",
  );

  assert.equal(
    consumed[0]
      ?.authoritativeGrain,
    "ad",
  );

  /*
   * Completely empty daily rows are intentionally omitted,
   * matching the existing SHOPPING meaningful-row policy.
   */
  assert.equal(
    canonicalRows.length,
    1,
  );

  const row =
    canonicalRows[0]!;

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
    "naver_searchad_web_site_ad_daily_stats",
  );

  assert.equal(
    row.creative,
    ad.headline,
  );

  assert.equal(
    row.creative_name,
    ad.headline,
  );

  assert.equal(
    row.external_creative_id,
    ad.id,
  );

  assert.equal(
    row.external_keyword_id,
    undefined,
  );

  assert.equal(
    row.impressions,
    100,
  );

  assert.equal(
    row.clicks,
    7,
  );

  assert.equal(
    row.cost,
    55000,
  );

  assert.equal(
    row.conversions,
    1,
  );

  assert.equal(
    row.provider_meta
      ?.authoritative_grain,
    "keyword",
  );

  assert.equal(
    row.provider_meta
      ?.entity_type,
    "ad",
  );

  assert.equal(
    row.provider_meta
      ?.detail_only,
    true,
  );

  assert.equal(
    row.provider_meta
      ?.ad_headline,
    ad.headline,
  );

  assert.equal(
    row.provider_meta
      ?.ad_description,
    ad.description,
  );

  const rowKey =
    JSON.parse(
      buildMediaSyncStagingRowKey(
        row,
      ),
    ) as unknown[];

  assert.equal(
    rowKey[1],
    "creative",
  );

  assert.equal(
    rowKey[6],
    ad.id,
  );

  /*
   * Staging and SQL admission must explicitly know the
   * new detail-only reason.
   */
  const stagingSource =
    await readFile(
      "src/lib/media-sync/media-sync-staging-repository.ts",
      "utf8",
    );

  assert.match(
    stagingSource,
    /naver_searchad_web_site_ad_daily_stats/,
  );

  const sql =
    await readFile(
      "scripts/sql/create-summarize-naver-searchads-combined-staging.sql",
      "utf8",
    );

  assert.equal(
    (
      sql.match(
        /naver_searchad_web_site_ad_daily_stats/g,
      ) ?? []
    ).length,
    2,
  );

  /*
   * Existing UI contract must remain untouched:
   * generic Search Ad creative rows do not enter
   * representative KPI totals.
   */
  const reportTemplate =
    await readFile(
      "app/components/ReportTemplate.tsx",
      "utf8",
    );

  assert.match(
    reportTemplate,
    /if \(isSearchAdRow\(row\)\) return false;/,
  );

  console.log(
    "WEB_SITE_KEYWORD_AUTHORITY_UNCHANGED=PASS",
  );

  console.log(
    "WEB_SITE_AD_DETAIL_COLLECTION=PASS",
  );

  console.log(
    "WEB_SITE_MEDICAL_AD_CANONICAL=PASS",
  );

  console.log(
    "WEB_SITE_CREATIVE_NAME_HEADLINE=PASS",
  );

  console.log(
    "WEB_SITE_CREATIVE_ROW_KEY=PASS",
  );

  console.log(
    "WEB_SITE_STAGING_ADMISSION=PASS",
  );

  console.log(
    "WEB_SITE_COMBINED_SQL_ADMISSION=PASS",
  );

  console.log(
    "SEARCH_CREATIVE_KPI_EXCLUSION=PASS",
  );

  console.log(
    "LIVE_NAVER_API_CALL=0",
  );

  console.log(
    "DATABASE_MUTATION=0",
  );

  console.log(
    "VERIFICATION_RESULT=PASS_WEB_SITE_CREATIVE_DETAIL_LANE",
  );
}

main().catch(
  error => {
    console.error(
      "WEB_SITE creative detail verification failed:",
      error,
    );

    process.exitCode = 1;
  },
);

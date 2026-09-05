import { isDeepStrictEqual } from "node:util";

import {
  convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows,
  convertNaverKeywordDailyStatsToCanonicalRows,
  convertNaverShoppingAdDailyStatsToCanonicalRows,
  NaverSearchAdsCanonicalRowError,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsEntityDailyStatsRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
} from "../src/lib/media-sync/naver-searchads-api";

type VerificationCase = {
  name: string;
  run: () => void;
};

const EXTERNAL_ACCOUNT_ID =
  "customer-001";

const SHOPPING_CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id: "cmp-shopping-001",
    name: "쇼핑검색 캠페인",
    campaignType: "SHOPPING",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const SHOPPING_ADGROUP:
  NaverSearchAdsAdgroupRecord = {
    id: "grp-shopping-001",
    campaignId:
      SHOPPING_CAMPAIGN.id,
    name: "쇼핑검색 광고그룹",
    adgroupType: "SHOPPING",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const SHOPPING_AD:
  NaverSearchAdsAdRecord = {
    id: "ad-shopping-001",
    adgroupId:
      SHOPPING_ADGROUP.id,
    type: "SHOPPING_PRODUCT_AD",
    inspectStatus: "APPROVED",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
    referenceKey:
      "shopping-product-reference-001",
  };

const SHOPPING_STATS:
  NaverSearchAdsEntityDailyStatsResult = {
    entityId:
      SHOPPING_AD.id,
    entityType: "ad",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-02",
    records: [
      {
        entityId:
          SHOPPING_AD.id,
        entityType: "ad",
        date: "2026-05-02",
        periodStart: "2026-05-02",
        periodEnd: "2026-05-02",
        impCnt: null,
        clkCnt: null,
        salesAmt: null,
        ccnt: null,
        convAmt: null,
      },
      {
        entityId:
          SHOPPING_AD.id,
        entityType: "ad",
        date: "2026-05-01",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-01",
        impCnt: 3257,
        clkCnt: 83,
        salesAmt: 42000,
        ccnt: 7,
        convAmt: 210000,
      },
    ],
  };

const BRAND_SEARCH_CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id: "cmp-brand-search-001",
    name: "브랜드검색 캠페인",
    campaignType: "BRAND_SEARCH",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const BRAND_SEARCH_ADGROUP:
  NaverSearchAdsAdgroupRecord = {
    id: "grp-brand-search-001",
    campaignId:
      BRAND_SEARCH_CAMPAIGN.id,
    name: "브랜드검색 광고그룹",
    adgroupType: "BRAND_SEARCH",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const BRAND_SEARCH_STATS:
  NaverSearchAdsEntityDailyStatsResult = {
    entityId:
      BRAND_SEARCH_ADGROUP.id,
    entityType: "adgroup",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-02",
    records: [
      {
        entityId:
          BRAND_SEARCH_ADGROUP.id,
        entityType: "adgroup",
        date: "2026-05-02",
        periodStart: "2026-05-02",
        periodEnd: "2026-05-02",
        impCnt: 1300,
        clkCnt: 520,
        salesAmt: 110000,
        ccnt: 14,
        convAmt: 650000,
      },
      {
        entityId:
          BRAND_SEARCH_ADGROUP.id,
        entityType: "adgroup",
        date: "2026-05-01",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-01",
        impCnt: 1442,
        clkCnt: 578,
        salesAmt: 120000,
        ccnt: 16,
        convAmt: 740000,
      },
    ],
  };

const KEYWORD_CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id: "cmp-keyword-001",
    name: "웹사이트 검색 캠페인",
    campaignType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const KEYWORD_ADGROUP:
  NaverSearchAdsAdgroupRecord = {
    id: "grp-keyword-001",
    campaignId:
      KEYWORD_CAMPAIGN.id,
    name: "웹사이트 검색 광고그룹",
    adgroupType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const KEYWORD:
  NaverSearchAdsKeywordRecord = {
    id: "kwd-001",
    adgroupId:
      KEYWORD_ADGROUP.id,
    keyword: "테스트 키워드",
    inspectStatus: "APPROVED",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
    bidAmount: 500,
    useGroupBidAmount: false,
  };

const KEYWORD_STATS:
  NaverSearchAdsKeywordDailyStatsResult = {
    keywordId:
      KEYWORD.id,
    dateFrom: "2026-05-01",
    dateTo: "2026-05-02",
    records: [
      {
        keywordId:
          KEYWORD.id,
        date: "2026-05-02",
        periodStart: "2026-05-02",
        periodEnd: "2026-05-02",
        impCnt: null,
        clkCnt: null,
        salesAmt: null,
        ccnt: null,
        convAmt: null,
        avgRnk: null,
      },
      {
        keywordId:
          KEYWORD.id,
        date: "2026-05-01",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-01",
        impCnt: 1000,
        clkCnt: 50,
        salesAmt: 25000,
        ccnt: 4,
        convAmt: 120000,
        avgRnk: 2.3,
      },
    ],
  };

const EXPECTED_KEYWORD_ROWS = [
  {
    date: "2026-05-01",
    report_date: "2026-05-01",
    day: "2026-05-01",
    ymd: "2026-05-01",
    channel: "검색광고",
    source: "네이버 검색광고",
    platform: "네이버",
    device: "",
    campaign:
      KEYWORD_CAMPAIGN.name,
    campaign_name:
      KEYWORD_CAMPAIGN.name,
    group:
      KEYWORD_ADGROUP.name,
    group_name:
      KEYWORD_ADGROUP.name,
    adgroup_name:
      KEYWORD_ADGROUP.name,
    keyword:
      KEYWORD.keyword,
    keyword_name:
      KEYWORD.keyword,
    impressions: 1000,
    clicks: 50,
    cost: 25000,
    conversions: 4,
    revenue: 120000,
    rank: 2.3,
    row_level: "keyword",
    data_level: "keyword",
    row_level_reason:
      "naver_searchad_registered_keyword_daily_stats",
    provider: "naver_searchad",
    ingestion_source: "api",
    external_account_id:
      EXTERNAL_ACCOUNT_ID,
    external_campaign_id:
      KEYWORD_CAMPAIGN.id,
    external_group_id:
      KEYWORD_ADGROUP.id,
    external_keyword_id:
      KEYWORD.id,
    provider_meta: {
      provider: "naver_searchad",
      period_start: "2026-05-01",
      period_end: "2026-05-01",
      campaign_type:
        KEYWORD_CAMPAIGN.campaignType,
      campaign_status:
        KEYWORD_CAMPAIGN.status,
      campaign_status_reason:
        KEYWORD_CAMPAIGN.statusReason,
      campaign_user_lock:
        KEYWORD_CAMPAIGN.userLock,
      adgroup_type:
        KEYWORD_ADGROUP.adgroupType,
      adgroup_status:
        KEYWORD_ADGROUP.status,
      adgroup_status_reason:
        KEYWORD_ADGROUP.statusReason,
      adgroup_user_lock:
        KEYWORD_ADGROUP.userLock,
      keyword_inspect_status:
        KEYWORD.inspectStatus,
      keyword_status:
        KEYWORD.status,
      keyword_status_reason:
        KEYWORD.statusReason,
      keyword_user_lock:
        KEYWORD.userLock,
      keyword_bid_amount:
        KEYWORD.bidAmount,
      keyword_use_group_bid_amount:
        KEYWORD.useGroupBidAmount,
    },
  },
  {
    date: "2026-05-02",
    report_date: "2026-05-02",
    day: "2026-05-02",
    ymd: "2026-05-02",
    channel: "검색광고",
    source: "네이버 검색광고",
    platform: "네이버",
    device: "",
    campaign:
      KEYWORD_CAMPAIGN.name,
    campaign_name:
      KEYWORD_CAMPAIGN.name,
    group:
      KEYWORD_ADGROUP.name,
    group_name:
      KEYWORD_ADGROUP.name,
    adgroup_name:
      KEYWORD_ADGROUP.name,
    keyword:
      KEYWORD.keyword,
    keyword_name:
      KEYWORD.keyword,
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
    rank: 0,
    row_level: "keyword",
    data_level: "keyword",
    row_level_reason:
      "naver_searchad_registered_keyword_daily_stats",
    provider: "naver_searchad",
    ingestion_source: "api",
    external_account_id:
      EXTERNAL_ACCOUNT_ID,
    external_campaign_id:
      KEYWORD_CAMPAIGN.id,
    external_group_id:
      KEYWORD_ADGROUP.id,
    external_keyword_id:
      KEYWORD.id,
    provider_meta: {
      provider: "naver_searchad",
      period_start: "2026-05-02",
      period_end: "2026-05-02",
      campaign_type:
        KEYWORD_CAMPAIGN.campaignType,
      campaign_status:
        KEYWORD_CAMPAIGN.status,
      campaign_status_reason:
        KEYWORD_CAMPAIGN.statusReason,
      campaign_user_lock:
        KEYWORD_CAMPAIGN.userLock,
      adgroup_type:
        KEYWORD_ADGROUP.adgroupType,
      adgroup_status:
        KEYWORD_ADGROUP.status,
      adgroup_status_reason:
        KEYWORD_ADGROUP.statusReason,
      adgroup_user_lock:
        KEYWORD_ADGROUP.userLock,
      keyword_inspect_status:
        KEYWORD.inspectStatus,
      keyword_status:
        KEYWORD.status,
      keyword_status_reason:
        KEYWORD.statusReason,
      keyword_user_lock:
        KEYWORD.userLock,
      keyword_bid_amount:
        KEYWORD.bidAmount,
      keyword_use_group_bid_amount:
        KEYWORD.useGroupBidAmount,
    },
  },
];

function cloneFixture<T>(
  value: T,
): T {
  return structuredClone(value);
}

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (!isDeepStrictEqual(
    actual,
    expected,
  )) {
    throw new Error(
      `${message}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
    );
  }
}

function expectCanonicalError(
  expectedCode:
    NaverSearchAdsCanonicalRowError["code"],
  callback: () => void,
): void {
  try {
    callback();
  } catch (error) {
    assertTrue(
      error instanceof
        NaverSearchAdsCanonicalRowError,
      "Expected NaverSearchAdsCanonicalRowError.",
    );

    assertEqual(
      error.code,
      expectedCode,
      "Unexpected canonical error code",
    );

    return;
  }

  throw new Error(
    `Expected canonical conversion to throw ${expectedCode}.`,
  );
}

function getFirstRecord(
  stats: NaverSearchAdsEntityDailyStatsResult,
): NaverSearchAdsEntityDailyStatsRecord {
  const record =
    stats.records[0];

  assertTrue(
    record !== undefined,
    "Fixture stats record is missing.",
  );

  return record;
}

const verificationCases:
  VerificationCase[] = [
    {
      name:
        "maps SHOPPING ad daily stats to creative canonical rows",
      run: () => {
        const rows =
          convertNaverShoppingAdDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                SHOPPING_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                SHOPPING_ADGROUP,
              ),
            ad:
              cloneFixture(
                SHOPPING_AD,
              ),
            stats:
              cloneFixture(
                SHOPPING_STATS,
              ),
          });

        assertEqual(
          rows.length,
          1,
          "SHOPPING all-zero metric row must be omitted",
        );

        assertDeepEqual(
          rows.map(
            (row) => row.date,
          ),
          [
            "2026-05-01",
          ],
          "SHOPPING all-zero date must be omitted",
        );

        const firstRow =
          rows[0];

        assertTrue(
          firstRow !== undefined,
          "SHOPPING first row is missing.",
        );

        assertEqual(
          firstRow.row_level,
          "creative",
          "SHOPPING row_level mismatch",
        );
        assertEqual(
          firstRow.data_level,
          "creative",
          "SHOPPING data_level mismatch",
        );
        assertEqual(
          firstRow.row_level_reason,
          "naver_searchad_shopping_ad_daily_stats",
          "SHOPPING row_level_reason mismatch",
        );
        assertEqual(
          firstRow.campaign,
          SHOPPING_CAMPAIGN.name,
          "SHOPPING campaign mismatch",
        );
        assertEqual(
          firstRow.group,
          SHOPPING_ADGROUP.name,
          "SHOPPING group mismatch",
        );
        assertEqual(
          firstRow.adgroup_name,
          SHOPPING_ADGROUP.name,
          "SHOPPING adgroup_name mismatch",
        );
        assertEqual(
          firstRow.keyword,
          "",
          "SHOPPING keyword must be empty",
        );
        assertEqual(
          firstRow.keyword_name,
          "",
          "SHOPPING keyword_name must be empty",
        );
        assertEqual(
          firstRow.creative,
          SHOPPING_AD.referenceKey,
          "SHOPPING creative mismatch",
        );
        assertEqual(
          firstRow.creative_name,
          SHOPPING_AD.referenceKey,
          "SHOPPING creative_name mismatch",
        );
        assertEqual(
          firstRow.external_campaign_id,
          SHOPPING_CAMPAIGN.id,
          "SHOPPING external_campaign_id mismatch",
        );
        assertEqual(
          firstRow.external_group_id,
          SHOPPING_ADGROUP.id,
          "SHOPPING external_group_id mismatch",
        );
        assertEqual(
          firstRow.external_creative_id,
          SHOPPING_AD.id,
          "SHOPPING external_creative_id mismatch",
        );
        assertTrue(
          !("external_keyword_id" in firstRow),
          "SHOPPING must not store external_keyword_id.",
        );
        assertTrue(
          !("external_ad_id" in firstRow),
          "SHOPPING must not emit a second ad identifier field.",
        );
        assertEqual(
          firstRow.impressions,
          3257,
          "SHOPPING impressions mismatch",
        );
        assertEqual(
          firstRow.clicks,
          83,
          "SHOPPING clicks mismatch",
        );
        assertEqual(
          firstRow.cost,
          42000,
          "SHOPPING cost mismatch",
        );
        assertEqual(
          firstRow.conversions,
          7,
          "SHOPPING conversions mismatch",
        );
        assertEqual(
          firstRow.revenue,
          210000,
          "SHOPPING revenue mismatch",
        );
        assertEqual(
          firstRow.provider,
          "naver_searchad",
          "SHOPPING provider mismatch",
        );
        assertEqual(
          firstRow.ingestion_source,
          "api",
          "SHOPPING ingestion_source mismatch",
        );
        assertEqual(
          firstRow.provider_meta?.authoritative_grain,
          "ad",
          "SHOPPING provider_meta grain mismatch",
        );

      },
    },
    {
      name:
        "preserves SHOPPING zero-impression rows when another metric is non-zero",
      run: () => {
        const stats =
          cloneFixture(
            SHOPPING_STATS,
          );

        const metricRow =
          getFirstRecord(
            stats,
          );

        metricRow.impCnt = 0;
        metricRow.clkCnt = 1;
        metricRow.salesAmt = 0;
        metricRow.ccnt = 0;
        metricRow.convAmt = 0;

        const rows =
          convertNaverShoppingAdDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                SHOPPING_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                SHOPPING_ADGROUP,
              ),
            ad:
              cloneFixture(
                SHOPPING_AD,
              ),
            stats,
          });

        assertEqual(
          rows.length,
          2,
          "SHOPPING meaningful zero-impression row must be preserved",
        );

        const preserved =
          rows.find(
            (row) =>
              row.date === metricRow.date,
          );

        assertEqual(
          preserved?.impressions,
          0,
          "SHOPPING preserved row impressions mismatch",
        );

        assertEqual(
          preserved?.clicks,
          1,
          "SHOPPING preserved row clicks mismatch",
        );
      },
    },
    {
      name:
        "uses the SHOPPING ad ID when referenceKey is unavailable",
      run: () => {
        const rows =
          convertNaverShoppingAdDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                SHOPPING_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                SHOPPING_ADGROUP,
              ),
            ad: {
              ...cloneFixture(
                SHOPPING_AD,
              ),
              referenceKey: null,
            },
            stats:
              cloneFixture(
                SHOPPING_STATS,
              ),
          });

        const firstRow =
          rows[0];

        assertTrue(
          firstRow !== undefined,
          "SHOPPING fallback row is missing.",
        );
        assertEqual(
          firstRow.creative,
          SHOPPING_AD.id,
          "SHOPPING fallback creative mismatch",
        );
        assertEqual(
          firstRow.creative_name,
          SHOPPING_AD.id,
          "SHOPPING fallback creative_name mismatch",
        );
      },
    },
    {
      name:
        "rejects SHOPPING campaign and adgroup scope mismatch",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup: {
                ...cloneFixture(
                  SHOPPING_ADGROUP,
                ),
                campaignId:
                  "different-campaign",
              },
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats:
                cloneFixture(
                  SHOPPING_STATS,
                ),
            });
          },
        );
      },
    },
    {
      name:
        "rejects SHOPPING ad and adgroup scope mismatch",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad: {
                ...cloneFixture(
                  SHOPPING_AD,
                ),
                adgroupId:
                  "different-adgroup",
              },
              stats:
                cloneFixture(
                  SHOPPING_STATS,
                ),
            });
          },
        );
      },
    },
    {
      name:
        "rejects invalid SHOPPING result entityType and entityId",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats: {
                ...cloneFixture(
                  SHOPPING_STATS,
                ),
                entityType: "adgroup",
              },
            });
          },
        );

        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats: {
                ...cloneFixture(
                  SHOPPING_STATS,
                ),
                entityId:
                  "different-ad",
              },
            });
          },
        );
      },
    },
    {
      name:
        "rejects duplicate SHOPPING ad dates",
      run: () => {
        const stats =
          cloneFixture(
            SHOPPING_STATS,
          );

        stats.records.push(
          cloneFixture(
            getFirstRecord(stats),
          ),
        );

        expectCanonicalError(
          "DUPLICATE_DATE",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats,
            });
          },
        );
      },
    },
    {
      name:
        "maps BRAND_SEARCH adgroup daily stats to mixed canonical rows",
      run: () => {
        const rows =
          convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                BRAND_SEARCH_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                BRAND_SEARCH_ADGROUP,
              ),
            stats:
              cloneFixture(
                BRAND_SEARCH_STATS,
              ),
          });

        assertEqual(
          rows.length,
          2,
          "BRAND_SEARCH canonical row count mismatch",
        );
        assertDeepEqual(
          rows.map(
            (row) => row.date,
          ),
          [
            "2026-05-01",
            "2026-05-02",
          ],
          "BRAND_SEARCH rows must be sorted by date",
        );

        const firstRow =
          rows[0];

        assertTrue(
          firstRow !== undefined,
          "BRAND_SEARCH first row is missing.",
        );
        assertEqual(
          firstRow.row_level,
          "mixed",
          "BRAND_SEARCH row_level mismatch",
        );
        assertEqual(
          firstRow.data_level,
          "mixed",
          "BRAND_SEARCH data_level mismatch",
        );
        assertEqual(
          firstRow.row_level_reason,
          "naver_searchad_brand_search_adgroup_daily_stats",
          "BRAND_SEARCH row_level_reason mismatch",
        );
        assertEqual(
          firstRow.campaign,
          BRAND_SEARCH_CAMPAIGN.name,
          "BRAND_SEARCH campaign mismatch",
        );
        assertEqual(
          firstRow.group,
          BRAND_SEARCH_ADGROUP.name,
          "BRAND_SEARCH group mismatch",
        );
        assertEqual(
          firstRow.adgroup_name,
          BRAND_SEARCH_ADGROUP.name,
          "BRAND_SEARCH adgroup_name mismatch",
        );
        assertEqual(
          firstRow.keyword,
          "",
          "BRAND_SEARCH keyword must be empty",
        );
        assertEqual(
          firstRow.keyword_name,
          "",
          "BRAND_SEARCH keyword_name must be empty",
        );
        assertEqual(
          firstRow.creative,
          "",
          "BRAND_SEARCH creative must be empty",
        );
        assertEqual(
          firstRow.creative_name,
          "",
          "BRAND_SEARCH creative_name must be empty",
        );
        assertEqual(
          firstRow.external_campaign_id,
          BRAND_SEARCH_CAMPAIGN.id,
          "BRAND_SEARCH external_campaign_id mismatch",
        );
        assertEqual(
          firstRow.external_group_id,
          BRAND_SEARCH_ADGROUP.id,
          "BRAND_SEARCH external_group_id mismatch",
        );
        assertTrue(
          !("external_keyword_id" in firstRow),
          "BRAND_SEARCH must not store external_keyword_id.",
        );
        assertTrue(
          !("external_creative_id" in firstRow),
          "BRAND_SEARCH must not store external_creative_id.",
        );
        assertTrue(
          !("external_ad_id" in firstRow),
          "BRAND_SEARCH must not store external_ad_id.",
        );
        assertEqual(
          firstRow.impressions,
          1442,
          "BRAND_SEARCH impressions mismatch",
        );
        assertEqual(
          firstRow.clicks,
          578,
          "BRAND_SEARCH clicks mismatch",
        );
        assertEqual(
          firstRow.cost,
          120000,
          "BRAND_SEARCH cost mismatch",
        );
        assertEqual(
          firstRow.conversions,
          16,
          "BRAND_SEARCH conversions mismatch",
        );
        assertEqual(
          firstRow.revenue,
          740000,
          "BRAND_SEARCH revenue mismatch",
        );
        assertEqual(
          firstRow.provider_meta?.authoritative_grain,
          "adgroup",
          "BRAND_SEARCH provider_meta grain mismatch",
        );
      },
    },
    {
      name:
        "rejects BRAND_SEARCH campaign and adgroup scope mismatch",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
              adgroup: {
                ...cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
                campaignId:
                  "different-campaign",
              },
              stats:
                cloneFixture(
                  BRAND_SEARCH_STATS,
                ),
            });
          },
        );
      },
    },
    {
      name:
        "rejects invalid BRAND_SEARCH result entityType and entityId",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
              stats: {
                ...cloneFixture(
                  BRAND_SEARCH_STATS,
                ),
                entityType: "ad",
              },
            });
          },
        );

        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
              stats: {
                ...cloneFixture(
                  BRAND_SEARCH_STATS,
                ),
                entityId:
                  "different-adgroup",
              },
            });
          },
        );
      },
    },
    {
      name:
        "rejects duplicate BRAND_SEARCH adgroup dates",
      run: () => {
        const stats =
          cloneFixture(
            BRAND_SEARCH_STATS,
          );

        stats.records.push(
          cloneFixture(
            getFirstRecord(stats),
          ),
        );

        expectCanonicalError(
          "DUPLICATE_DATE",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
              stats,
            });
          },
        );
      },
    },
    {
      name:
        "rejects record-level entity scope mismatches",
      run: () => {
        const shoppingStats =
          cloneFixture(
            SHOPPING_STATS,
          );
        getFirstRecord(
          shoppingStats,
        ).entityId =
          "different-ad";

        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats:
                shoppingStats,
            });
          },
        );

        const brandStats =
          cloneFixture(
            BRAND_SEARCH_STATS,
          );
        getFirstRecord(
          brandStats,
        ).entityType = "ad";

        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
              stats:
                brandStats,
            });
          },
        );
      },
    },
    {
      name:
        "rejects the wrong campaign type for each authoritative converter",
      run: () => {
        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign: {
                ...cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
                campaignType:
                  "WEB_SITE",
              },
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats:
                cloneFixture(
                  SHOPPING_STATS,
                ),
            });
          },
        );

        expectCanonicalError(
          "SCOPE_MISMATCH",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign: {
                ...cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
                campaignType:
                  "WEB_SITE",
              },
              adgroup:
                cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
              stats:
                cloneFixture(
                  BRAND_SEARCH_STATS,
                ),
            });
          },
        );
      },
    },
    {
      name:
        "rejects negative NaN and infinite entity metrics",
      run: () => {
        for (
          const invalidMetric
          of [
            -1,
            Number.NaN,
            Number.POSITIVE_INFINITY,
          ]
        ) {
          const shoppingStats =
            cloneFixture(
              SHOPPING_STATS,
            );
          getFirstRecord(
            shoppingStats,
          ).salesAmt =
            invalidMetric;

          expectCanonicalError(
            "INVALID_STATS_RECORD",
            () => {
              convertNaverShoppingAdDailyStatsToCanonicalRows({
                externalAccountId:
                  EXTERNAL_ACCOUNT_ID,
                campaign:
                  cloneFixture(
                    SHOPPING_CAMPAIGN,
                  ),
                adgroup:
                  cloneFixture(
                    SHOPPING_ADGROUP,
                  ),
                ad:
                  cloneFixture(
                    SHOPPING_AD,
                  ),
                stats:
                  shoppingStats,
              });
            },
          );

          const brandStats =
            cloneFixture(
              BRAND_SEARCH_STATS,
            );
          getFirstRecord(
            brandStats,
          ).convAmt =
            invalidMetric;

          expectCanonicalError(
            "INVALID_STATS_RECORD",
            () => {
              convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
                externalAccountId:
                  EXTERNAL_ACCOUNT_ID,
                campaign:
                  cloneFixture(
                    BRAND_SEARCH_CAMPAIGN,
                  ),
                adgroup:
                  cloneFixture(
                    BRAND_SEARCH_ADGROUP,
                  ),
                stats:
                  brandStats,
              });
            },
          );
        }
      },
    },
    {
      name:
        "omits only completely empty BRAND_SEARCH rows",
      run: () => {
        const allZeroStats =
          cloneFixture(
            BRAND_SEARCH_STATS,
          );

        const allZeroRecord =
          getFirstRecord(
            allZeroStats,
          );

        allZeroRecord.impCnt = 0;
        allZeroRecord.clkCnt = 0;
        allZeroRecord.salesAmt = 0;
        allZeroRecord.ccnt = 0;
        allZeroRecord.convAmt = 0;

        const omittedRows =
          convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                BRAND_SEARCH_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                BRAND_SEARCH_ADGROUP,
              ),
            stats:
              allZeroStats,
          });

        assertEqual(
          omittedRows.length,
          1,
          "BRAND_SEARCH completely empty row must be omitted",
        );

        assertTrue(
          !omittedRows.some(
            (row) =>
              row.date ===
              allZeroRecord.date,
          ),
          "BRAND_SEARCH omitted zero row must not remain",
        );

        const meaningfulStats =
          cloneFixture(
            BRAND_SEARCH_STATS,
          );

        const meaningfulRecord =
          getFirstRecord(
            meaningfulStats,
          );

        meaningfulRecord.impCnt = 0;

        const preservedRows =
          convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                BRAND_SEARCH_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                BRAND_SEARCH_ADGROUP,
              ),
            stats:
              meaningfulStats,
          });

        assertEqual(
          preservedRows.length,
          2,
          "BRAND_SEARCH meaningful zero-impression row must be preserved",
        );

        const preserved =
          preservedRows.find(
            (row) =>
              row.date ===
              meaningfulRecord.date,
          );

        assertEqual(
          preserved?.impressions,
          0,
          "BRAND_SEARCH preserved row impressions mismatch",
        );

        assertEqual(
          preserved?.clicks,
          meaningfulRecord.clkCnt,
          "BRAND_SEARCH preserved row clicks changed",
        );
      },
    },
    {
      name:
        "rejects out-of-range and multi-day entity records",
      run: () => {
        const outOfRangeStats =
          cloneFixture(
            SHOPPING_STATS,
          );
        const outOfRangeRecord =
          getFirstRecord(
            outOfRangeStats,
          );
        outOfRangeRecord.date =
          "2026-05-03";
        outOfRangeRecord.periodStart =
          "2026-05-03";
        outOfRangeRecord.periodEnd =
          "2026-05-03";

        expectCanonicalError(
          "INVALID_STATS_RECORD",
          () => {
            convertNaverShoppingAdDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  SHOPPING_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  SHOPPING_ADGROUP,
                ),
              ad:
                cloneFixture(
                  SHOPPING_AD,
                ),
              stats:
                outOfRangeStats,
            });
          },
        );

        const multiDayStats =
          cloneFixture(
            BRAND_SEARCH_STATS,
          );
        getFirstRecord(
          multiDayStats,
        ).periodEnd =
          "2026-05-03";

        expectCanonicalError(
          "INVALID_STATS_RECORD",
          () => {
            convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                cloneFixture(
                  BRAND_SEARCH_CAMPAIGN,
                ),
              adgroup:
                cloneFixture(
                  BRAND_SEARCH_ADGROUP,
                ),
              stats:
                multiDayStats,
            });
          },
        );
      },
    },
    {
      name:
        "does not mutate SHOPPING or BRAND_SEARCH inputs",
      run: () => {
        const shoppingInput = {
          externalAccountId:
            EXTERNAL_ACCOUNT_ID,
          campaign:
            cloneFixture(
              SHOPPING_CAMPAIGN,
            ),
          adgroup:
            cloneFixture(
              SHOPPING_ADGROUP,
            ),
          ad:
            cloneFixture(
              SHOPPING_AD,
            ),
          stats:
            cloneFixture(
              SHOPPING_STATS,
            ),
        };

        const brandInput = {
          externalAccountId:
            EXTERNAL_ACCOUNT_ID,
          campaign:
            cloneFixture(
              BRAND_SEARCH_CAMPAIGN,
            ),
          adgroup:
            cloneFixture(
              BRAND_SEARCH_ADGROUP,
            ),
          stats:
            cloneFixture(
              BRAND_SEARCH_STATS,
            ),
        };

        const shoppingBefore =
          structuredClone(
            shoppingInput,
          );
        const brandBefore =
          structuredClone(
            brandInput,
          );

        convertNaverShoppingAdDailyStatsToCanonicalRows(
          shoppingInput,
        );
        convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows(
          brandInput,
        );

        assertDeepEqual(
          shoppingInput,
          shoppingBefore,
          "SHOPPING converter mutated its input",
        );
        assertDeepEqual(
          brandInput,
          brandBefore,
          "BRAND_SEARCH converter mutated its input",
        );
      },
    },
    {
      name:
        "keeps the existing keyword canonical output exactly unchanged",
      run: () => {
        const rows =
          convertNaverKeywordDailyStatsToCanonicalRows({
            externalAccountId:
              EXTERNAL_ACCOUNT_ID,
            campaign:
              cloneFixture(
                KEYWORD_CAMPAIGN,
              ),
            adgroup:
              cloneFixture(
                KEYWORD_ADGROUP,
              ),
            keyword:
              cloneFixture(
                KEYWORD,
              ),
            stats:
              cloneFixture(
                KEYWORD_STATS,
              ),
          });

        assertDeepEqual(
          rows,
          EXPECTED_KEYWORD_ROWS,
          "Existing keyword canonical output changed",
        );

        const firstRow =
          rows[0];

        assertTrue(
          firstRow !== undefined,
          "Keyword regression row is missing.",
        );
        assertEqual(
          firstRow.row_level,
          "keyword",
          "Keyword row_level changed",
        );
        assertEqual(
          firstRow.external_keyword_id,
          KEYWORD.id,
          "Keyword external_keyword_id changed",
        );
        assertEqual(
          firstRow.rank,
          2.3,
          "Keyword avgRnk to rank mapping changed",
        );
        assertDeepEqual(
          firstRow.provider_meta,
          EXPECTED_KEYWORD_ROWS[0]?.provider_meta,
          "Keyword provider_meta changed",
        );
      },
    },
  ];

function main(): void {
  let passedCount = 0;
  let failedCount = 0;

  for (
    const verificationCase
    of verificationCases
  ) {
    try {
      verificationCase.run();
      passedCount += 1;

      console.log(
        `verification case passed: ${verificationCase.name}`,
      );
    } catch (error) {
      failedCount += 1;

      console.error(
        `verification case failed: ${verificationCase.name}`,
      );
      console.error(
        error instanceof Error
          ? {
              name:
                error.name,
              message:
                error.message,
            }
          : {
              value:
                String(error),
            },
      );
    }
  }

  const verificationPassed =
    failedCount === 0 &&
    passedCount ===
      verificationCases.length;

  console.log(
    `verification tests attempted: ${verificationCases.length}`,
  );
  console.log(
    `verification tests passed: ${passedCount}`,
  );
  console.log(
    `verification tests failed: ${failedCount}`,
  );
  console.log(
    `verified SHOPPING canonical grain: creative`,
  );
  console.log(
    `verified BRAND_SEARCH canonical grain: mixed`,
  );
  console.log(
    `verified one authoritative entity per row: ${verificationPassed}`,
  );
  console.log(
    `verified existing keyword canonical output unchanged: ${verificationPassed}`,
  );
  console.log(
    `verified input objects unchanged: ${verificationPassed}`,
  );
  console.log(
    `fixture uses real Naver API: false`,
  );
  console.log(
    `fixture uses database: false`,
  );
  console.log(
    `fixture writes staging: false`,
  );
  console.log(
    `fixture writes report_rows: false`,
  );
  console.log(
    `fixture changes report pointers: false`,
  );
  console.log(
    `verification passed: ${verificationPassed}`,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main();

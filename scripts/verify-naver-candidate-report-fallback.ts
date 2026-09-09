import {
  deepStrictEqual,
  equal,
} from "node:assert/strict";

import type {
  NaverSearchAdsCredentials,
} from "../src/lib/media-sync/connection-credentials";

import type {
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";

import {
  collectNaverKeywordDailyStats,
  type NaverKeywordStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";

import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";

const credentials: NaverSearchAdsCredentials = {
  customerId: "verification-customer",
  accessLicense: "verification-access-license",
  secretKey: "verification-secret",
};

const campaign: NaverSearchAdsCampaignRecord = {
  id: "cmp-a001-01-000000000000001",
  name: "Verification Campaign",
  campaignType: "WEB_SITE",
  status: "ELIGIBLE",
  statusReason: null,
  userLock: false,
};

const adgroup: NaverSearchAdsAdgroupRecord = {
  id: "grp-a001-01-000000000000001",
  campaignId: campaign.id,
  name: "Verification Adgroup",
  adgroupType: "WEB_SITE",
  status: "ELIGIBLE",
  statusReason: null,
  userLock: false,
};

const keyword: NaverSearchAdsKeywordRecord = {
  id: "nkw-a001-01-000000000000001",
  adgroupId: adgroup.id,
  keyword: "verification keyword",
  inspectStatus: "APPROVED",
  status: "ELIGIBLE",
  statusReason: null,
  userLock: false,
  bidAmount: 100,
  useGroupBidAmount: false,
};

function createPage<T extends { id: string }>(
  records: T[],
  input: {
    recordSize: number;
    baseSearchId?: string | null;
  },
): NaverSearchAdsListPage<T> {
  return {
    records,
    recordSize: input.recordSize,
    selector: "NEXT",
    baseSearchId: input.baseSearchId ?? null,
    nextBaseSearchId: null,
  };
}

function createStatsResult(
  keywordId: string,
  dateFrom: string,
  dateTo: string,
): NaverSearchAdsKeywordDailyStatsResult {
  return {
    keywordId,
    dateFrom,
    dateTo,
    records: [
      {
        keywordId,
        date: dateFrom,
        periodStart: dateFrom,
        periodEnd: dateFrom,
        impCnt: 10,
        clkCnt: 1,
        salesAmt: 100,
        ccnt: 1,
        convAmt: 200,
        avgRnk: 2,
      },
    ],
  };
}

async function main(): Promise<void> {
  let candidateCalls = 0;
  let batchStatReportCalls = 0;
  let singleStatReportCalls = 0;
  let exactStatsCalls = 0;

  const dependencies:
    NaverKeywordStatsCollectorDependencies = {
      fetchCampaignPage:
        async (input) =>
          createPage(
            [campaign],
            {
              recordSize:
                input.recordSize ?? 100,
              baseSearchId:
                input.baseSearchId ?? null,
            },
          ),

      fetchAdgroupPage:
        async (input) =>
          createPage(
            input.campaignId === campaign.id
              ? [adgroup]
              : [],
            {
              recordSize:
                input.recordSize ?? 100,
              baseSearchId:
                input.baseSearchId ?? null,
            },
          ),

      fetchKeywordPage:
        async (input) =>
          createPage(
            input.adgroupId === adgroup.id
              ? [keyword]
              : [],
            {
              recordSize:
                input.recordSize ?? 100,
              baseSearchId:
                input.baseSearchId ?? null,
            },
          ),

      fetchStatReportKeywordCandidates:
        async () => {
          candidateCalls += 1;

          throw new Error(
            "REPORT_POLL_LIMIT_EXCEEDED_FOR_VERIFICATION",
          );
        },

      fetchStatReportKeywordDailyStatsBatch:
        async () => {
          batchStatReportCalls += 1;

          throw new Error(
            "STAT_REPORT_BATCH_UNAVAILABLE_FOR_VERIFICATION",
          );
        },

      fetchStatReportKeywordDailyStats:
        async () => {
          singleStatReportCalls += 1;

          throw new Error(
            "STAT_REPORT_SINGLE_UNAVAILABLE_FOR_VERIFICATION",
          );
        },

      fetchKeywordDailyStats:
        async (input) => {
          exactStatsCalls += 1;

          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },

      sleep:
        async () => undefined,

      now:
        () => 1_000_000,

      random:
        () => 0,
    };

  const consumedKeywordIds: string[] = [];

  const result =
    await collectNaverKeywordDailyStats({
      credentials,
      cursor:
        createNaverKeywordStatsCursor({
          dateWindow: {
            index: 0,
            dateFrom: "2026-08-01",
            dateTo: "2026-08-31",
          },
        }),
      requestIntervalMs: 0,
      chunkPauseMs: 0,
      dependencies,
      onKeywordStats:
        async (item) => {
          consumedKeywordIds.push(
            item.keyword.id,
          );
        },
    });

  equal(
    result.status,
    "completed",
    "candidate StatReport failure must fall through to hierarchy/exact stats instead of returning partial",
  );

  equal(
    result.isComplete,
    true,
  );

  equal(
    result.partialReason,
    null,
  );

  equal(
    candidateCalls,
    1,
  );

  equal(
    batchStatReportCalls,
    1,
  );

  equal(
    singleStatReportCalls,
    1,
  );

  equal(
    exactStatsCalls,
    1,
  );

  deepStrictEqual(
    consumedKeywordIds,
    [keyword.id],
  );

  equal(
    result.cursor.completedKeywordCount,
    1,
  );

  console.log(
    JSON.stringify({
      verification: "PASS",
      scenario:
        "candidate_report_unavailable_falls_back_to_exact_stats",
      collector_status:
        result.status,
      candidate_calls:
        candidateCalls,
      batch_stat_report_calls:
        batchStatReportCalls,
      single_stat_report_calls:
        singleStatReportCalls,
      exact_stats_calls:
        exactStatsCalls,
      consumed_keywords:
        consumedKeywordIds.length,
      database_calls: 0,
      naver_api_calls: 0,
      production_mutations: 0,
    }),
  );
}

void main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);

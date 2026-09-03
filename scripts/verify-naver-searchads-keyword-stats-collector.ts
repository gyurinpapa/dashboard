import {
  deepStrictEqual,
  equal,
  ok,
  rejects,
} from "node:assert/strict";

import type { NaverSearchAdsCredentials } from "../src/lib/media-sync/connection-credentials";
import {
  NaverSearchAdsApiError,
  type FetchNaverSearchAdsAdgroupPageInput,
  type FetchNaverSearchAdsCampaignPageInput,
  type FetchNaverSearchAdsKeywordDailyStatsInput,
  type FetchNaverSearchAdsKeywordPageInput,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsKeywordDailyStatsResult,
  type NaverSearchAdsKeywordRecord,
  type NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import {
  NaverKeywordStatsCollectorError,
  collectNaverKeywordDailyStats,
  type NaverKeywordStatsCollectorDependencies,
  type NaverKeywordStatsCollectorItem,
  type NaverKeywordStatsCollectorRetryEvent,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
  markNaverKeywordStatsKeywordCompleted,
  setNaverKeywordStatsAdgroupPosition,
  setNaverKeywordStatsCampaignPosition,
  setNaverKeywordStatsDiscoveredCount,
  setNaverKeywordStatsKeywordPagePosition,
  type NaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";

type AsyncVerificationTest = {
  name: string;
  run: () => Promise<void>;
};

type VerificationResult = {
  name: string;
  passed: boolean;
  error: string | null;
};

type FakeClock = {
  now: number;
  sleeps: number[];
};

const FAKE_CREDENTIALS:
  NaverSearchAdsCredentials = {
    customerId:
      "verification-customer",

    accessLicense:
      "verification-access-license",

    secretKey:
      "verification-secret",
  };

function createInitialCursor(): NaverKeywordStatsCursor {
  return createNaverKeywordStatsCursor({
    dateWindow: {
      index: 0,
      dateFrom: "2026-06-01",
      dateTo: "2026-06-24",
    },
  });
}

function createCampaign(
  id: string,
): NaverSearchAdsCampaignRecord {
  return {
    id,
    name:
      `Campaign ${id}`,

    campaignType:
      "WEB_SITE",

    status:
      "ELIGIBLE",

    statusReason:
      null,

    userLock:
      false,
  };
}

function createAdgroup(
  id: string,
  campaignId: string,
): NaverSearchAdsAdgroupRecord {
  return {
    id,
    campaignId,

    name:
      `Adgroup ${id}`,

    adgroupType:
      "WEB_SITE",

    status:
      "ELIGIBLE",

    statusReason:
      null,

    userLock:
      false,
  };
}

function createKeyword(
  id: string,
  adgroupId: string,
): NaverSearchAdsKeywordRecord {
  return {
    id,
    adgroupId,

    keyword:
      `keyword-${id}`,

    inspectStatus:
      "APPROVED",

    status:
      "ELIGIBLE",

    statusReason:
      null,

    userLock:
      false,

    bidAmount:
      100,

    useGroupBidAmount:
      false,
  };
}

function createStatsResult(
  keywordId: string,
  dateFrom = "2026-06-01",
  dateTo = "2026-06-24",
): NaverSearchAdsKeywordDailyStatsResult {
  return {
    keywordId,
    dateFrom,
    dateTo,

    records: [
      {
        keywordId,

        date:
          dateFrom,

        periodStart:
          dateFrom,

        periodEnd:
          dateFrom,

        impCnt:
          10,

        clkCnt:
          1,

        salesAmt:
          100,

        ccnt:
          1,

        convAmt:
          200,

        avgRnk:
          2,
      },
    ],
  };
}

function createListPage<T extends { id: string }>(
  records: T[],
  input?: {
    recordSize?: number;
    baseSearchId?: string | null;
    nextBaseSearchId?: string | null;
  },
): NaverSearchAdsListPage<T> {
  const recordSize =
    input?.recordSize ?? 100;

  return {
    records,

    recordSize,

    selector:
      "NEXT",

    baseSearchId:
      input?.baseSearchId ?? null,

    nextBaseSearchId:
      input?.nextBaseSearchId ??
      (
        records.length > 0
          ? records[
              records.length - 1
            ]?.id ?? null
          : null
      ),
  };
}

function createFakeClock(
  initialNow = 1_000_000,
): FakeClock {
  return {
    now:
      initialNow,

    sleeps:
      [],
  };
}

function createBaseDependencies(input: {
  clock?: FakeClock;

  campaigns?: NaverSearchAdsCampaignRecord[];
  adgroups?: NaverSearchAdsAdgroupRecord[];
  keywords?: NaverSearchAdsKeywordRecord[];

  fetchKeywordDailyStats?: (
    input: FetchNaverSearchAdsKeywordDailyStatsInput,
  ) => Promise<NaverSearchAdsKeywordDailyStatsResult>;
  fetchStatReportKeywordDailyStats?: NonNullable<
    NaverKeywordStatsCollectorDependencies["fetchStatReportKeywordDailyStats"]
  >;
  fetchStatReportKeywordDailyStatsBatch?: NonNullable<
    NaverKeywordStatsCollectorDependencies["fetchStatReportKeywordDailyStatsBatch"]
  >;
}): NaverKeywordStatsCollectorDependencies {
  const clock =
    input.clock ??
    createFakeClock();

  const campaigns =
    input.campaigns ??
    [
      createCampaign(
        "campaign-1",
      ),
    ];

  const adgroups =
    input.adgroups ??
    [
      createAdgroup(
        "adgroup-1",
        "campaign-1",
      ),
    ];

  const keywords =
    input.keywords ??
    [
      createKeyword(
        "keyword-1",
        "adgroup-1",
      ),
    ];

  return {
    fetchCampaignPage:
      async (
        pageInput:
          FetchNaverSearchAdsCampaignPageInput,
      ): Promise<
        NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
      > => {
        return createListPage(
          campaigns,
          {
            recordSize:
              pageInput.recordSize ?? 100,

            baseSearchId:
              pageInput.baseSearchId ?? null,
          },
        );
      },

    fetchAdgroupPage:
      async (
        pageInput:
          FetchNaverSearchAdsAdgroupPageInput,
      ): Promise<
        NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord>
      > => {
        const matchedAdgroups =
          adgroups.filter(
            (adgroup) =>
              adgroup.campaignId ===
              pageInput.campaignId,
          );

        return createListPage(
          matchedAdgroups,
          {
            recordSize:
              pageInput.recordSize ?? 100,

            baseSearchId:
              pageInput.baseSearchId ?? null,
          },
        );
      },

    fetchKeywordPage:
      async (
        pageInput:
          FetchNaverSearchAdsKeywordPageInput,
      ): Promise<
        NaverSearchAdsListPage<NaverSearchAdsKeywordRecord>
      > => {
        const matchedKeywords =
          keywords.filter(
            (keyword) =>
              keyword.adgroupId ===
              pageInput.adgroupId,
          );

        return createListPage(
          matchedKeywords,
          {
            recordSize:
              pageInput.recordSize ?? 100,

            baseSearchId:
              pageInput.baseSearchId ?? null,
          },
        );
      },

    fetchKeywordDailyStats:
      input.fetchKeywordDailyStats ??
      (
        async (
          statsInput:
            FetchNaverSearchAdsKeywordDailyStatsInput,
        ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          return createStatsResult(
            statsInput.keywordId,
            statsInput.dateFrom,
            statsInput.dateTo,
          );
        }
      ),

    fetchStatReportKeywordDailyStats:
      input.fetchStatReportKeywordDailyStats ??
      (
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          throw new Error(
            "STAT_REPORT_UNAVAILABLE_FOR_VERIFICATION",
          );
        }
      ),

    fetchStatReportKeywordDailyStatsBatch:
      input.fetchStatReportKeywordDailyStatsBatch,

    sleep:
      async (
        milliseconds: number,
      ): Promise<void> => {
        clock.sleeps.push(
          milliseconds,
        );

        clock.now +=
          milliseconds;
      },

    now:
      () =>
        clock.now,

    random:
      () =>
        0,
  };
}

function createOneHierarchyDependencies(input: {
  clock?: FakeClock;
  keywords: NaverSearchAdsKeywordRecord[];

  fetchKeywordDailyStats?: (
    input: FetchNaverSearchAdsKeywordDailyStatsInput,
  ) => Promise<NaverSearchAdsKeywordDailyStatsResult>;
  fetchStatReportKeywordDailyStats?: NonNullable<
    NaverKeywordStatsCollectorDependencies["fetchStatReportKeywordDailyStats"]
  >;
  fetchStatReportKeywordDailyStatsBatch?: NonNullable<
    NaverKeywordStatsCollectorDependencies["fetchStatReportKeywordDailyStatsBatch"]
  >;
}): NaverKeywordStatsCollectorDependencies {
  return createBaseDependencies({
    clock:
      input.clock,

    campaigns: [
      createCampaign(
        "campaign-1",
      ),
    ],

    adgroups: [
      createAdgroup(
        "adgroup-1",
        "campaign-1",
      ),
    ],

    keywords:
      input.keywords,

    fetchKeywordDailyStats:
      input.fetchKeywordDailyStats,

    fetchStatReportKeywordDailyStats:
      input.fetchStatReportKeywordDailyStats,

    fetchStatReportKeywordDailyStatsBatch:
      input.fetchStatReportKeywordDailyStatsBatch,
  });
}

async function verifyStatReportBatchesWholeFastPage(): Promise<void> {
  const keywords = Array.from(
    { length: 1_000 },
    (_, index) =>
      createKeyword(
        `keyword-batch-${index + 1}`,
        "adgroup-1",
      ),
  );
  const consumedKeywordIds: string[] = [];
  const requestedKeywordPageSizes: number[] = [];
  let batchCalls = 0;
  let exactStatsCalls = 0;
  let singleStatReportCalls = 0;

  const dependencies =
    createOneHierarchyDependencies({
      keywords,
      fetchKeywordDailyStats:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          exactStatsCalls += 1;
          throw new Error(
            "EXACT_STATS_MUST_NOT_RUN_ON_BATCH_SUCCESS",
          );
        },
      fetchStatReportKeywordDailyStats:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          singleStatReportCalls += 1;
          throw new Error(
            "SINGLE_STAT_REPORT_LOOKUP_MUST_NOT_RUN",
          );
        },
      fetchStatReportKeywordDailyStatsBatch:
        async (input) => {
          batchCalls += 1;
          equal(input.keywordIds.length, 1_000);

          return input.keywordIds.map(
            (keywordId) =>
              createStatsResult(
                keywordId,
                input.dateFrom,
                input.dateTo,
              ),
          );
        },
    });

  dependencies.fetchKeywordPage =
    async (input) => {
      requestedKeywordPageSizes.push(
        input.recordSize ?? 0,
      );

      if (
        input.baseSearchId === null ||
        input.baseSearchId === undefined
      ) {
        return createListPage(
          keywords,
          {
            recordSize:
              input.recordSize ?? 100,
            baseSearchId:
              null,
            nextBaseSearchId:
              keywords[keywords.length - 1]?.id ?? null,
          },
        );
      }

      return createListPage(
        [],
        {
          recordSize:
            input.recordSize ?? 100,
          baseSearchId:
            input.baseSearchId,
          nextBaseSearchId:
            null,
        },
      );
    };

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,
      cursor:
        createInitialCursor(),
      requestIntervalMs:
        0,
      keywordChunkSize:
        1_000,
      chunkPauseMs:
        0,
      dependencies,
      onKeywordStats:
        async (item): Promise<void> => {
          consumedKeywordIds.push(
            item.keyword.id,
          );
        },
    });

  equal(result.status, "completed");
  deepStrictEqual(
    requestedKeywordPageSizes,
    [1_000, 1_000],
  );
  equal(batchCalls, 1);
  equal(singleStatReportCalls, 0);
  equal(exactStatsCalls, 0);
  equal(result.statsRequestsAttempted, 1_000);
  equal(result.statsRequestsSucceeded, 1_000);
  deepStrictEqual(
    consumedKeywordIds,
    keywords.map((keyword) => keyword.id),
  );
}

async function verifyBoundedFallbackAndOrder(): Promise<void> {
  const clock =
    createFakeClock();

  const keywords =
    Array.from(
      {
        length: 5,
      },
      (_, index) =>
        createKeyword(
          `keyword-${index + 1}`,
          "adgroup-1",
        ),
    );

  const requestStartTimes:
    number[] = [];

  let activeRequests = 0;
  let maxActiveRequests = 0;

  const consumedKeywordIds:
    string[] = [];

  const dependencies =
    createOneHierarchyDependencies({
      clock,
      keywords,

      fetchKeywordDailyStats:
        async (
          input:
            FetchNaverSearchAdsKeywordDailyStatsInput,
        ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          requestStartTimes.push(
            clock.now,
          );

          activeRequests += 1;
          maxActiveRequests =
            Math.max(
              maxActiveRequests,
              activeRequests,
            );

          await new Promise<void>(
            (resolve) => {
              setTimeout(resolve, 0);
            },
          );

          activeRequests -= 1;

          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },
    });

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,

      cursor:
        createInitialCursor(),

      keywordChunkSize:
        2,

      requestIntervalMs:
        1_000,

      chunkPauseMs:
        10,

      dependencies,

      onKeywordStats:
        async (
          item:
            NaverKeywordStatsCollectorItem,
        ): Promise<void> => {
          consumedKeywordIds.push(
            item.keyword.id,
          );
        },
    });

  equal(
    result.completed,
    true,
  );

  equal(
    result.keywordsCompletedInRun,
    5,
  );

  equal(
    result.statsRequestsAttempted,
    5,
  );

  equal(
    result.statsRequestsSucceeded,
    5,
  );

  deepStrictEqual(
    consumedKeywordIds,
    [
      "keyword-1",
      "keyword-2",
      "keyword-3",
      "keyword-4",
      "keyword-5",
    ],
  );

  equal(
    requestStartTimes.length,
    5,
  );

  ok(
    maxActiveRequests > 1 &&
    maxActiveRequests <= 4,
  );

  for (
    let index = 1;
    index < requestStartTimes.length;
    index += 1
  ) {
    const previousStart =
      requestStartTimes[index - 1];

    const currentStart =
      requestStartTimes[index];

    ok(
      previousStart !== undefined &&
      currentStart !== undefined,
    );

    ok(
      currentStart -
        previousStart >=
        250,
    );
  }

  const chunkPauseCount =
    clock.sleeps.filter(
      (milliseconds) =>
        milliseconds === 10,
    ).length;

  equal(
    chunkPauseCount,
    0,
  );
}

async function verifyStatReportDoesNotConsumeExactFallbackBudget(): Promise<void> {
  const keywords = Array.from(
    { length: 5 },
    (_, index) =>
      createKeyword(
        `keyword-fast-${index + 1}`,
        "adgroup-1",
      ),
  );
  const consumedKeywordIds: string[] = [];
  let exactStatsCalls = 0;

  const dependencies =
    createOneHierarchyDependencies({
      keywords,
      fetchKeywordDailyStats:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          exactStatsCalls += 1;
          throw new Error(
            "EXACT_STATS_MUST_NOT_RUN_WHILE_STAT_REPORT_IS_READY",
          );
        },
      fetchStatReportKeywordDailyStats:
        async (input): Promise<NaverSearchAdsKeywordDailyStatsResult> =>
          createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          ),
    });

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,
      cursor:
        createInitialCursor(),
      requestIntervalMs:
        0,
      keywordChunkSize:
        5,
      chunkPauseMs:
        0,
      maxKeywordStatsPerRun:
        2,
      maxStatsRequestsPerRun:
        2,
      dependencies,
      onKeywordStats:
        async (item): Promise<void> => {
          consumedKeywordIds.push(
            item.keyword.id,
          );
        },
    });

  equal(result.status, "completed");
  equal(result.keywordsCompletedInRun, 5);
  equal(result.statsRequestsAttempted, 5);
  equal(result.statsRequestsSucceeded, 5);
  equal(exactStatsCalls, 0);
  deepStrictEqual(
    consumedKeywordIds,
    keywords.map((keyword) => keyword.id),
  );
}

async function verifyStatReportFailurePreservesExactFallbackBudget(): Promise<void> {
  const keywords = Array.from(
    { length: 5 },
    (_, index) =>
      createKeyword(
        `keyword-fallback-${index + 1}`,
        "adgroup-1",
      ),
  );
  let exactStatsCalls = 0;

  const dependencies =
    createOneHierarchyDependencies({
      keywords,
      fetchKeywordDailyStats:
        async (input): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          exactStatsCalls += 1;
          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },
      fetchStatReportKeywordDailyStats:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          throw new Error(
            "SYNTHETIC_STAT_REPORT_UNAVAILABLE",
          );
        },
    });

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,
      cursor:
        createInitialCursor(),
      requestIntervalMs:
        0,
      keywordChunkSize:
        5,
      chunkPauseMs:
        0,
      maxKeywordStatsPerRun:
        2,
      dependencies,
      onKeywordStats:
        async (): Promise<void> => undefined,
    });

  equal(result.status, "partial");
  equal(
    result.partialReason,
    "max_keyword_stats_per_run_reached",
  );
  equal(result.keywordsCompletedInRun, 2);
  equal(exactStatsCalls, 2);
}

async function verifyKeywordPagination(): Promise<void> {
  const campaign =
    createCampaign(
      "campaign-1",
    );

  const adgroup =
    createAdgroup(
      "adgroup-1",
      campaign.id,
    );

  const firstPageKeywords =
    Array.from(
      {
        length: 1_000,
      },
      (_, index) =>
        createKeyword(
          `keyword-${index + 1}`,
          adgroup.id,
        ),
    );

  const secondPageKeyword =
    createKeyword(
      "keyword-1001",
      adgroup.id,
    );

  let keywordPageCalls = 0;

  const dependencies:
    NaverKeywordStatsCollectorDependencies = {
      fetchCampaignPage:
        async (
          input:
            FetchNaverSearchAdsCampaignPageInput,
        ): Promise<
          NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
        > => {
          return createListPage(
            [
              campaign,
            ],
            {
              recordSize:
                input.recordSize ?? 100,

              baseSearchId:
                input.baseSearchId ?? null,
            },
          );
        },

      fetchAdgroupPage:
        async (
          input:
            FetchNaverSearchAdsAdgroupPageInput,
        ): Promise<
          NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord>
        > => {
          return createListPage(
            [
              adgroup,
            ],
            {
              recordSize:
                input.recordSize ?? 100,

              baseSearchId:
                input.baseSearchId ?? null,
            },
          );
        },

      fetchKeywordPage:
        async (
          input:
            FetchNaverSearchAdsKeywordPageInput,
        ): Promise<
          NaverSearchAdsListPage<NaverSearchAdsKeywordRecord>
        > => {
          keywordPageCalls += 1;

          if (
            input.baseSearchId ===
            null ||
            input.baseSearchId ===
            undefined
          ) {
            return createListPage(
              firstPageKeywords,
              {
                recordSize:
                  1_000,

                baseSearchId:
                  null,

                nextBaseSearchId:
                  "keyword-1000",
              },
            );
          }

          equal(
            input.baseSearchId,
            "keyword-1000",
          );

          return createListPage(
            [
              secondPageKeyword,
            ],
            {
              recordSize:
                1_000,

              baseSearchId:
                "keyword-1000",

              nextBaseSearchId:
                "keyword-1001",
            },
          );
        },

      fetchKeywordDailyStats:
        async (
          input:
            FetchNaverSearchAdsKeywordDailyStatsInput,
        ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },

      fetchStatReportKeywordDailyStats:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          throw new Error(
            "STAT_REPORT_UNAVAILABLE_FOR_VERIFICATION",
          );
        },

      fetchStatReportKeywordDailyStatsBatch:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult[]> => {
          throw new Error(
            "STAT_REPORT_UNAVAILABLE_FOR_VERIFICATION",
          );
        },

      sleep:
        async (): Promise<void> => {
          return;
        },

      now:
        () =>
          1_000_000,

      random:
        () =>
          0,
    };

  const consumedKeywordIds:
    string[] = [];

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,

      cursor:
        createInitialCursor(),

      requestIntervalMs:
        0,

      keywordChunkSize:
        100,

      chunkPauseMs:
        0,

      dependencies,

      onKeywordStats:
        async (
          item:
            NaverKeywordStatsCollectorItem,
        ): Promise<void> => {
          consumedKeywordIds.push(
            item.keyword.id,
          );
        },
    });

  equal(
    keywordPageCalls,
    2,
  );

  equal(
    result.keywordPagesRead,
    2,
  );

  equal(
    result.keywordsCompletedInRun,
    1_001,
  );

  equal(
    consumedKeywordIds.length,
    1_001,
  );

  equal(
    consumedKeywordIds[0],
    "keyword-1",
  );

  equal(
    consumedKeywordIds[1_000],
    "keyword-1001",
  );
}

async function verifyRateLimitRetry(): Promise<void> {
  const keyword =
    createKeyword(
      "keyword-1",
      "adgroup-1",
    );

  const clock =
    createFakeClock();

  let statsAttempts = 0;

  const retryEvents:
    NaverKeywordStatsCollectorRetryEvent[] = [];

  const dependencies =
    createOneHierarchyDependencies({
      clock,

      keywords: [
        keyword,
      ],

      fetchKeywordDailyStats:
        async (
          input:
            FetchNaverSearchAdsKeywordDailyStatsInput,
        ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          statsAttempts += 1;

          if (statsAttempts === 1) {
            throw new NaverSearchAdsApiError(
              "HTTP_ERROR",
              "Synthetic rate limit.",
              {
                status: 429,
              },
            );
          }

          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },
    });

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,

      cursor:
        createInitialCursor(),

      requestIntervalMs:
        0,

      chunkPauseMs:
        0,

      dependencies,

      onRetry:
        async (
          event:
            NaverKeywordStatsCollectorRetryEvent,
        ): Promise<void> => {
          retryEvents.push(
            event,
          );
        },

      onKeywordStats:
        async (): Promise<void> => {
          return;
        },
    });

  equal(
    statsAttempts,
    2,
  );

  equal(
    result.retryCount,
    1,
  );

  equal(
    result.statsRequestsAttempted,
    2,
  );

  equal(
    result.statsRequestsSucceeded,
    1,
  );

  equal(
    retryEvents.length,
    1,
  );

  equal(
    retryEvents[0]?.category,
    "rate_limit",
  );

  equal(
    retryEvents[0]?.delayMs,
    60_000,
  );

  ok(
    clock.sleeps.includes(
      60_000,
    ),
  );
}

async function verifyServerRetry(): Promise<void> {
  const keyword =
    createKeyword(
      "keyword-1",
      "adgroup-1",
    );

  const clock =
    createFakeClock();

  let statsAttempts = 0;

  const dependencies =
    createOneHierarchyDependencies({
      clock,

      keywords: [
        keyword,
      ],

      fetchKeywordDailyStats:
        async (
          input:
            FetchNaverSearchAdsKeywordDailyStatsInput,
        ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          statsAttempts += 1;

          if (statsAttempts === 1) {
            throw new NaverSearchAdsApiError(
              "HTTP_ERROR",
              "Synthetic server error.",
              {
                status: 503,
              },
            );
          }

          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },
    });

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,

      cursor:
        createInitialCursor(),

      requestIntervalMs:
        0,

      chunkPauseMs:
        0,

      dependencies,

      onKeywordStats:
        async (): Promise<void> => {
          return;
        },
    });

  equal(
    statsAttempts,
    2,
  );

  equal(
    result.retryCount,
    1,
  );

  ok(
    clock.sleeps.includes(
      2_000,
    ),
  );
}

async function verifyConsumerFailurePreservesCursor(): Promise<void> {
  const keyword =
    createKeyword(
      "keyword-1",
      "adgroup-1",
    );

  const dependencies =
    createOneHierarchyDependencies({
      keywords: [
        keyword,
      ],
    });

  await rejects(
    () =>
      collectNaverKeywordDailyStats({
        credentials:
          FAKE_CREDENTIALS,

        cursor:
          createInitialCursor(),

        requestIntervalMs:
          0,

        chunkPauseMs:
          0,

        dependencies,

        onKeywordStats:
          async (): Promise<void> => {
            throw new Error(
              "Synthetic consumer failure.",
            );
          },
      }),

    (error: unknown): boolean => {
      return (
        error instanceof
          NaverKeywordStatsCollectorError &&
        error.code ===
          "CONSUMER_FAILED" &&
        error.cursor.completedKeywordCount ===
          0 &&
        error.cursor.lastCompletedKeywordId ===
          null
      );
    },
  );
}

function createResumeCursor(): NaverKeywordStatsCursor {
  let cursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: "2026-06-01",
        dateTo: "2026-06-24",
      },

      completedKeywordCount:
        1,

      discoveredKeywordCount:
        3,
    });

  cursor =
    setNaverKeywordStatsCampaignPosition(
      cursor,
      {
        campaignBaseSearchId:
          null,

        campaignId:
          "campaign-1",
      },
    );

  cursor =
    setNaverKeywordStatsAdgroupPosition(
      cursor,
      {
        adgroupBaseSearchId:
          null,

        adgroupId:
          "adgroup-1",
      },
    );

  cursor =
    setNaverKeywordStatsKeywordPagePosition(
      cursor,
      {
        keywordBaseSearchId:
          null,
      },
    );

  cursor =
    markNaverKeywordStatsKeywordCompleted({
      cursor,

      keywordId:
        "keyword-2",

      keywordIndexInChunk:
        1,
    });

  return cursor;
}

async function verifyResumeStartsAfterCompletedKeyword(): Promise<void> {
  const keywords = [
    createKeyword(
      "keyword-1",
      "adgroup-1",
    ),
    createKeyword(
      "keyword-2",
      "adgroup-1",
    ),
    createKeyword(
      "keyword-3",
      "adgroup-1",
    ),
  ];

  const requestedKeywordIds:
    string[] = [];

  const consumedKeywordIds:
    string[] = [];

  const dependencies =
    createOneHierarchyDependencies({
      keywords,

      fetchKeywordDailyStats:
        async (
          input:
            FetchNaverSearchAdsKeywordDailyStatsInput,
        ): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          requestedKeywordIds.push(
            input.keywordId,
          );

          return createStatsResult(
            input.keywordId,
            input.dateFrom,
            input.dateTo,
          );
        },
    });

  const result =
    await collectNaverKeywordDailyStats({
      credentials:
        FAKE_CREDENTIALS,

      cursor:
        createResumeCursor(),

      requestIntervalMs:
        0,

      keywordChunkSize:
        3,

      chunkPauseMs:
        0,

      dependencies,

      onKeywordStats:
        async (
          item:
            NaverKeywordStatsCollectorItem,
        ): Promise<void> => {
          consumedKeywordIds.push(
            item.keyword.id,
          );
        },
    });

  deepStrictEqual(
    requestedKeywordIds,
    [
      "keyword-3",
    ],
  );

  deepStrictEqual(
    consumedKeywordIds,
    [
      "keyword-3",
    ],
  );

  equal(
    result.keywordsCompletedInRun,
    1,
  );

  equal(
    result.cursor.completedKeywordCount,
    3,
  );

  equal(
    result.cursor.lastCompletedKeywordId,
    "keyword-3",
  );
}

async function verifyRetryExhaustionPreservesFailureState(): Promise<void> {
  const keyword =
    createKeyword(
      "keyword-1",
      "adgroup-1",
    );

  const dependencies =
    createOneHierarchyDependencies({
      keywords: [
        keyword,
      ],

      fetchKeywordDailyStats:
        async (): Promise<NaverSearchAdsKeywordDailyStatsResult> => {
          throw new NaverSearchAdsApiError(
            "HTTP_ERROR",
            "Synthetic persistent server error.",
            {
              status: 500,
            },
          );
        },
    });

  await rejects(
    () =>
      collectNaverKeywordDailyStats({
        credentials:
          FAKE_CREDENTIALS,

        cursor:
          createInitialCursor(),

        requestIntervalMs:
          0,

        chunkPauseMs:
          0,

        maxRetryCount:
          3,

        dependencies,

        onKeywordStats:
          async (): Promise<void> => {
            return;
          },
      }),

    (error: unknown): boolean => {
      return (
        error instanceof
          NaverKeywordStatsCollectorError &&
        error.code ===
          "RETRY_EXHAUSTED" &&
        error.cursor.completedKeywordCount ===
          0 &&
        error.failureState !== null &&
        error.failureState.keywordId ===
          "keyword-1" &&
        error.failureState.httpStatus ===
          500 &&
        error.failureState.retryCount ===
          3
      );
    },
  );
}

const tests:
  AsyncVerificationTest[] = [
    {
      name:
        "StatReport batches one full 1000-keyword WEB_SITE page",

      run:
        verifyStatReportBatchesWholeFastPage,
    },
    {
      name:
        "StatReport hits bypass exact fallback run budgets",

      run:
        verifyStatReportDoesNotConsumeExactFallbackBudget,
    },
    {
      name:
        "StatReport failure keeps exact fallback run budgets",

      run:
        verifyStatReportFailurePreservesExactFallbackBudget,
    },
    {
      name:
        "collector bounds WEB_SITE fallback starts and preserves consumer order",

      run:
        verifyBoundedFallbackAndOrder,
    },
    {
      name:
        "collector traverses multiple keyword pages",

      run:
        verifyKeywordPagination,
    },
    {
      name:
        "collector retries HTTP 429 using conservative delay",

      run:
        verifyRateLimitRetry,
    },
    {
      name:
        "collector retries HTTP 5xx using server delay",

      run:
        verifyServerRetry,
    },
    {
      name:
        "consumer failure preserves pre-completion cursor",

      run:
        verifyConsumerFailurePreservesCursor,
    },
    {
      name:
        "resume starts after the last completed keyword",

      run:
        verifyResumeStartsAfterCompletedKeyword,
    },
    {
      name:
        "retry exhaustion preserves cursor and failure state",

      run:
        verifyRetryExhaustionPreservesFailureState,
    },
  ];

async function runVerificationTests(): Promise<
  VerificationResult[]
> {
  const results:
    VerificationResult[] = [];

  for (const test of tests) {
    try {
      await test.run();

      results.push({
        name:
          test.name,

        passed:
          true,

        error:
          null,
      });

      console.log(
        `PASS: ${test.name}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "UNKNOWN_ERROR";

      results.push({
        name:
          test.name,

        passed:
          false,

        error:
          errorMessage,
      });

      console.error(
        `FAIL: ${test.name}`,
      );

      console.error(
        `  ${errorMessage}`,
      );
    }
  }

  return results;
}

async function main(): Promise<void> {
  console.log(
    "Naver keyword stats collector verification started.",
  );

  console.log(
    "verification uses real Naver API:",
    false,
  );

  console.log(
    "verification uses database:",
    false,
  );

  console.log(
    "verification modifies report data:",
    false,
  );

  const results =
    await runVerificationTests();

  const passedCount =
    results.filter(
      (result) =>
        result.passed,
    ).length;

  const failedResults =
    results.filter(
      (result) =>
        !result.passed,
    );

  console.log(
    "verification tests attempted:",
    results.length,
  );

  console.log(
    "verification tests passed:",
    passedCount,
  );

  console.log(
    "verification tests failed:",
    failedResults.length,
  );

  if (
    failedResults.length > 0
  ) {
    console.error(
      "failed verification tests:",
    );

    for (
      const failedResult
      of failedResults
    ) {
      console.error(
        `- ${failedResult.name}: ${failedResult.error ?? "UNKNOWN_ERROR"}`,
      );
    }
  }

  const verificationPassed =
    results.length > 0 &&
    failedResults.length === 0;

  console.log(
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "UNKNOWN_ERROR";

  console.error(
    "Naver keyword stats collector verification failed:",
    errorMessage,
  );

  process.exitCode = 1;
});

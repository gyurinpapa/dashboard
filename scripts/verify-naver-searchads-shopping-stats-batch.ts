import {
  deepStrictEqual,
  equal,
  rejects,
} from "node:assert/strict";

import type { NaverSearchAdsCredentials } from "../src/lib/media-sync/connection-credentials";
import {
  collectNaverAuthoritativeEntityDailyStats,
  type NaverAuthoritativeEntityStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  convertNaverShoppingAdDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import {
  fetchNaverSearchAdsEntityDailyStatsBatch,
  NaverSearchAdsApiError,
  type NaverSearchAdsAdRecord,
  type NaverSearchAdsEntityDailyStatsBatchResult,
  type NaverSearchAdsEntityDailyStatsResult,
  type NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";

const CREDENTIALS: NaverSearchAdsCredentials = {
  customerId: "shopping-batch-customer",
  accessLicense: "verification-access-license",
  secretKey: "verification-secret-key",
};

const DATE = "2026-05-01";

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(value),
    {
      status,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

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

function stats(
  entityId: string,
): NaverSearchAdsEntityDailyStatsResult {
  return {
    entityId,
    entityType: "ad",
    dateFrom: DATE,
    dateTo: DATE,
    records: [
      {
        entityId,
        entityType: "ad",
        date: DATE,
        periodStart: DATE,
        periodEnd: DATE,
        impCnt: 10,
        clkCnt: 2,
        salesAmt: 300,
        ccnt: 1,
        convAmt: 400,
      },
    ],
  };
}

async function verifyApiBatchContract(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (
    input: string | URL | Request,
  ): Promise<Response> => {
    requestCount += 1;
    const url = new URL(
      input instanceof Request
        ? input.url
        : input.toString(),
    );

    equal(url.pathname, "/stats");
    deepStrictEqual(
      url.searchParams.getAll("ids"),
      ["ad-1", "ad-2"],
    );
    equal(
      url.searchParams.has("timeIncrement"),
      false,
    );

    return jsonResponse({
      compTm: "202609021945",
      cycleBaseTm: "202609021940",
      data: [
        {
          id: "ad-2",
          impCnt: 20,
          clkCnt: 4,
          salesAmt: 600,
          ccnt: 2,
          convAmt: 800,
        },
        {
          id: "ad-1",
          impCnt: 10,
          clkCnt: 2,
          salesAmt: 300,
          ccnt: 1,
          convAmt: 400,
        },
      ],
    });
  };

  try {
    const result =
      await fetchNaverSearchAdsEntityDailyStatsBatch({
        credentials: CREDENTIALS,
        entityIds: ["ad-1", "ad-2"],
        entityType: "ad",
        dateFrom: DATE,
        dateTo: DATE,
      });

    equal(requestCount, 1);
    deepStrictEqual(
      result.results.map(
        (item) => item.entityId,
      ),
      ["ad-1", "ad-2"],
    );
    equal(
      result.results[0]?.records[0]?.impCnt,
      10,
    );
    equal(
      result.results[1]?.records[0]?.convAmt,
      800,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyMultiDayBatchContract(): Promise<void> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (
    input: string | URL | Request,
  ): Promise<Response> => {
    const url = new URL(
      input instanceof Request
        ? input.url
        : input.toString(),
    );

    equal(
      url.searchParams.get("timeIncrement"),
      "1",
    );

    return jsonResponse({
      compTm: "202609021945",
      cycleBaseTm: "202609021940",
      data: ["ad-1", "ad-2"].map(
        (id, entityIndex) => ({
          id,
          data: [0, 1].map((dayIndex) => ({
            dateStart:
              dayIndex === 0
                ? "2026-05-01"
                : "2026-05-02",
            dateEnd:
              dayIndex === 0
                ? "2026-05-01"
                : "2026-05-02",
            impCnt:
              10 + entityIndex + dayIndex,
            clkCnt: 1,
            salesAmt: 100,
            ccnt: 0,
            convAmt: 0,
          })),
        }),
      ),
    });
  };

  try {
    const result =
      await fetchNaverSearchAdsEntityDailyStatsBatch({
        credentials: CREDENTIALS,
        entityIds: ["ad-1", "ad-2"],
        entityType: "ad",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-02",
      });

    equal(result.results.length, 2);
    equal(
      result.results[0]?.records.length,
      2,
    );
    equal(
      result.results[1]?.records[1]?.date,
      "2026-05-02",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOmittedZeroMetricIdsContract(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (): Promise<Response> => {
    requestCount += 1;

    return jsonResponse({
      compTm: "202609030148",
      cycleBaseTm: "202609030145",
      data: [
        {
          id: "ad-positive",
          data: [
            {
              dateStart: "2026-05-01",
              dateEnd: "2026-05-01",
              impCnt: 11,
              clkCnt: 2,
              salesAmt: 300,
              ccnt: 1,
              convAmt: 400,
            },
            {
              dateStart: "2026-05-02",
              dateEnd: "2026-05-02",
              impCnt: 12,
              clkCnt: 3,
              salesAmt: 500,
              ccnt: 2,
              convAmt: 700,
            },
          ],
        },
        {
          id: "ad-empty-shape",
          data: [],
        },
      ],
    });
  };

  try {
    const result =
      await fetchNaverSearchAdsEntityDailyStatsBatch({
        credentials: CREDENTIALS,
        entityIds: [
          "ad-omitted-zero",
          "ad-positive",
          "ad-empty-shape",
        ],
        entityType: "ad",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-02",
      });

    equal(requestCount, 1);
    deepStrictEqual(
      result.results.map(
        (item) => item.entityId,
      ),
      [
        "ad-omitted-zero",
        "ad-positive",
        "ad-empty-shape",
      ],
    );
    deepStrictEqual(
      result.results[0]?.records,
      ["2026-05-01", "2026-05-02"].map(
        (date) => ({
          entityId: "ad-omitted-zero",
          entityType: "ad",
          date,
          periodStart: date,
          periodEnd: date,
          impCnt: 0,
          clkCnt: 0,
          salesAmt: 0,
          ccnt: 0,
          convAmt: 0,
        }),
      ),
    );
    equal(
      result.results[1]?.records[1]?.convAmt,
      700,
    );
    deepStrictEqual(
      result.results[2]?.records.map(
        (record) => record.date,
      ),
      ["2026-05-01", "2026-05-02"],
    );
    equal(
      result.results[2]?.records.every(
        (record) =>
          record.impCnt === 0 &&
          record.clkCnt === 0 &&
          record.salesAmt === 0 &&
          record.ccnt === 0 &&
          record.convAmt === 0,
      ),
      true,
    );

    const zeroRows =
      convertNaverShoppingAdDailyStatsToCanonicalRows({
        externalAccountId: "shopping-batch-customer",
        campaign: {
          id: "cmp-shopping",
          name: "Shopping",
          campaignType: "SHOPPING",
          status: "ELIGIBLE",
          statusReason: null,
          userLock: false,
        },
        adgroup: {
          id: "grp-shopping",
          campaignId: "cmp-shopping",
          name: "Shopping Group",
          adgroupType: "SHOPPING_PRODUCT_AD",
          status: "ELIGIBLE",
          statusReason: null,
          userLock: false,
        },
        ad: {
          id: "ad-omitted-zero",
          adgroupId: "grp-shopping",
          type: "SHOPPING_PRODUCT_AD",
          inspectStatus: "APPROVED",
          status: "ELIGIBLE",
          statusReason: null,
          userLock: false,
          referenceKey: "zero-product",
        },
        stats: result.results[0]!,
      });

    deepStrictEqual(
      zeroRows.map((row) => ({
        date: row.date,
        impressions: row.impressions,
        clicks: row.clicks,
        cost: row.cost,
        conversions: row.conversions,
        revenue: row.revenue,
      })),
      ["2026-05-01", "2026-05-02"].map(
        (date) => ({
          date,
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
        }),
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyUnexpectedBatchIdFailsClosed(): Promise<void> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (): Promise<Response> =>
    jsonResponse({
      compTm: "202609030148",
      cycleBaseTm: "202609030145",
      data: [
        {
          id: "ad-unexpected",
          impCnt: 0,
          clkCnt: 0,
          salesAmt: 0,
          ccnt: 0,
          convAmt: 0,
        },
      ],
    });

  try {
    await rejects(
      () =>
        fetchNaverSearchAdsEntityDailyStatsBatch({
          credentials: CREDENTIALS,
          entityIds: ["ad-1", "ad-2"],
          entityType: "ad",
          dateFrom: DATE,
          dateTo: DATE,
        }),
      (error: unknown) =>
        error instanceof NaverSearchAdsApiError &&
        error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function buildCollectorDependencies(input: {
  ads: NaverSearchAdsAdRecord[];
  fetchBatch:
    NaverAuthoritativeEntityStatsCollectorDependencies["fetchEntityDailyStatsBatch"];
  onSingleRequest: () => void;
}): Partial<NaverAuthoritativeEntityStatsCollectorDependencies> {
  let now = Date.parse(
    "2026-09-02T00:00:00.000Z",
  );

  return {
    fetchCampaignPage: async () =>
      page([
        {
          id: "cmp-shopping",
          name: "Shopping",
          campaignType: "SHOPPING",
          status: "ELIGIBLE",
          statusReason: null,
          userLock: false,
        },
      ]),
    fetchAdgroupPage: async () =>
      page([
        {
          id: "grp-shopping",
          campaignId: "cmp-shopping",
          name: "Shopping Group",
          adgroupType:
            "SHOPPING_PRODUCT_AD",
          status: "ELIGIBLE",
          statusReason: null,
          userLock: false,
        },
      ]),
    fetchAdPage: async () =>
      page(input.ads),
    fetchEntityDailyStatsBatch:
      input.fetchBatch,
    fetchEntityDailyStats: async (
      request,
    ) => {
      input.onSingleRequest();
      return stats(request.entityId);
    },
    sleep: async () => undefined,
    now: () => {
      now += 250;
      return now;
    },
    random: () => 0,
  };
}

function ads(count: number): NaverSearchAdsAdRecord[] {
  return Array.from(
    { length: count },
    (_, index) => ({
      id: `ad-${index + 1}`,
      adgroupId: "grp-shopping",
      type: "SHOPPING_PRODUCT_AD",
      inspectStatus: "APPROVED",
      status: "ELIGIBLE",
      statusReason: null,
      userLock: false,
      referenceKey:
        `product-${index + 1}`,
    }),
  );
}

async function verifyCollectorBatchAndTail(): Promise<void> {
  let batchRequests = 0;
  let singleRequests = 0;
  const consumedIds: string[] = [];
  const inputAds = ads(6);

  const result =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials: CREDENTIALS,
      cursor:
        createNaverAuthoritativeEntityStatsCursor({
          dateWindow: {
            index: 0,
            dateFrom: DATE,
            dateTo: DATE,
          },
        }),
      requestIntervalMs: 0,
      dependencies:
        buildCollectorDependencies({
          ads: inputAds,
          fetchBatch: async (
            request,
          ): Promise<NaverSearchAdsEntityDailyStatsBatchResult> => {
            batchRequests += 1;
            return {
              entityType: "ad",
              dateFrom: request.dateFrom,
              dateTo: request.dateTo,
              results:
                request.entityIds.map(stats),
            };
          },
          onSingleRequest: () => {
            singleRequests += 1;
          },
        }),
      onEntityStats: (item) => {
        consumedIds.push(item.entity.id);
      },
    });

  equal(result.status, "completed");
  equal(batchRequests, 1);
  equal(singleRequests, 1);
  equal(result.statsRequestsAttempted, 2);
  equal(result.statsRequestsSucceeded, 2);
  deepStrictEqual(
    consumedIds,
    inputAds.map((ad) => ad.id),
  );
}

async function verifyCollectorFallback(): Promise<void> {
  let batchRequests = 0;
  let singleRequests = 0;
  const consumedIds: string[] = [];
  const inputAds = ads(3);

  const result =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials: CREDENTIALS,
      cursor:
        createNaverAuthoritativeEntityStatsCursor({
          dateWindow: {
            index: 0,
            dateFrom: DATE,
            dateTo: DATE,
          },
        }),
      requestIntervalMs: 0,
      dependencies:
        buildCollectorDependencies({
          ads: inputAds,
          fetchBatch: async () => {
            batchRequests += 1;
            throw new NaverSearchAdsApiError(
              "INVALID_RESPONSE",
              "Synthetic unsupported batch shape.",
            );
          },
          onSingleRequest: () => {
            singleRequests += 1;
          },
        }),
      onEntityStats: (item) => {
        consumedIds.push(item.entity.id);
      },
    });

  equal(result.status, "completed");
  equal(batchRequests, 1);
  equal(singleRequests, 3);
  equal(result.statsRequestsAttempted, 4);
  equal(result.statsRequestsSucceeded, 3);
  deepStrictEqual(
    consumedIds,
    inputAds.map((ad) => ad.id),
  );
}

async function verifyCrossAdgroupAndCampaignBatch(): Promise<void> {
  const campaigns = ["cmp-shopping-1", "cmp-shopping-2"].map(
    (id, index) => ({
      id,
      name: `Shopping ${index + 1}`,
      campaignType: "SHOPPING",
      status: "ELIGIBLE",
      statusReason: null,
      userLock: false,
    }),
  );
  const adgroupsByCampaign = new Map(
    campaigns.map((campaign) => [
      campaign.id,
      Array.from({ length: 3 }, (_, index) => ({
        id: `${campaign.id}-group-${index + 1}`,
        campaignId: campaign.id,
        name: `Group ${index + 1}`,
        adgroupType: "SHOPPING_PRODUCT_AD",
        status: "ELIGIBLE",
        statusReason: null,
        userLock: false,
      })),
    ]),
  );
  const allAdIds = campaigns.flatMap(
    (campaign) =>
      (adgroupsByCampaign.get(campaign.id) ?? []).map(
        (adgroup) => `${adgroup.id}-ad`,
      ),
  );
  const batchScopes: string[][] = [];
  const consumedIds: string[] = [];
  let singleRequests = 0;
  let now = Date.parse("2026-09-03T00:00:00.000Z");

  const result = await collectNaverAuthoritativeEntityDailyStats({
    credentials: CREDENTIALS,
    cursor: createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: DATE,
        dateTo: DATE,
      },
    }),
    requestIntervalMs: 0,
    dependencies: {
      fetchCampaignPage: async () => page(campaigns),
      fetchAdgroupPage: async (request) =>
        page(adgroupsByCampaign.get(request.campaignId) ?? []),
      fetchAdPage: async (request) =>
        page([
          {
            id: `${request.adgroupId}-ad`,
            adgroupId: request.adgroupId,
            type: "SHOPPING_PRODUCT_AD",
            inspectStatus: "APPROVED",
            status: "ELIGIBLE",
            statusReason: null,
            userLock: false,
            referenceKey: `${request.adgroupId}-product`,
          },
        ]),
      fetchEntityDailyStatsBatch: async (request) => {
        batchScopes.push([...request.entityIds]);
        return {
          entityType: "ad",
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
          results: request.entityIds.map(stats),
        };
      },
      fetchEntityDailyStats: async (request) => {
        singleRequests += 1;
        return stats(request.entityId);
      },
      sleep: async () => undefined,
      now: () => {
        now += 250;
        return now;
      },
      random: () => 0,
    },
    onEntityStats: (item) => {
      consumedIds.push(item.entity.id);
    },
  });

  equal(result.status, "completed");
  deepStrictEqual(batchScopes, [allAdIds.slice(0, 5)]);
  equal(singleRequests, 1);
  equal(result.statsRequestsAttempted, 2);
  equal(result.statsRequestsSucceeded, 2);
  deepStrictEqual(consumedIds, allAdIds);
  equal(result.cursor.campaignId, null);
  equal(result.cursor.adgroupId, null);
  equal(result.cursor.completedEntityCount, 6);
}

async function verifyCrossAdgroupBoundedResume(): Promise<void> {
  const campaign = {
    id: "cmp-shopping-resume",
    name: "Shopping Resume",
    campaignType: "SHOPPING",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };
  const adgroups = Array.from({ length: 7 }, (_, index) => ({
    id: `grp-resume-${index + 1}`,
    campaignId: campaign.id,
    name: `Resume Group ${index + 1}`,
    adgroupType: "SHOPPING_PRODUCT_AD",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  }));
  const expectedIds = adgroups.map(
    (adgroup) => `${adgroup.id}-ad`,
  );
  const consumedIds: string[] = [];
  const batchScopes: string[][] = [];
  let activeAdPageRequests = 0;
  let firstRunMaxActiveAdPages = 0;
  let secondRunMaxActiveAdPages = 0;
  let runPhase: "first" | "second" = "first";
  let now = Date.parse("2026-09-03T00:10:00.000Z");
  const dependencies: Partial<NaverAuthoritativeEntityStatsCollectorDependencies> = {
    fetchCampaignPage: async () => page([campaign]),
    fetchAdgroupPage: async () => page(adgroups),
    fetchAdPage: async (request) => {
      activeAdPageRequests += 1;

      if (runPhase === "first") {
        firstRunMaxActiveAdPages = Math.max(
          firstRunMaxActiveAdPages,
          activeAdPageRequests,
        );
      } else {
        secondRunMaxActiveAdPages = Math.max(
          secondRunMaxActiveAdPages,
          activeAdPageRequests,
        );
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      activeAdPageRequests -= 1;

      return page([
        {
          id: `${request.adgroupId}-ad`,
          adgroupId: request.adgroupId,
          type: "SHOPPING_PRODUCT_AD",
          inspectStatus: "APPROVED",
          status: "ELIGIBLE",
          statusReason: null,
          userLock: false,
          referenceKey: `${request.adgroupId}-product`,
        },
      ]);
    },
    fetchEntityDailyStatsBatch: async (request) => {
      batchScopes.push([...request.entityIds]);
      return {
        entityType: "ad",
        dateFrom: request.dateFrom,
        dateTo: request.dateTo,
        results: request.entityIds.map(stats),
      };
    },
    fetchEntityDailyStats: async (request) => stats(request.entityId),
    sleep: async () => undefined,
    now: () => {
      now += 250;
      return now;
    },
    random: () => 0,
  };

  const first = await collectNaverAuthoritativeEntityDailyStats({
    credentials: CREDENTIALS,
    cursor: createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: DATE,
        dateTo: DATE,
      },
    }),
    requestIntervalMs: 0,
    maxEntityStatsPerRun: 4,
    dependencies,
    onEntityStats: (item) => {
      consumedIds.push(item.entity.id);
    },
  });

  equal(first.status, "partial");
  equal(first.partialReason, "max_entity_stats_per_run_reached");
  equal(first.cursor.adgroupId, "grp-resume-4");
  equal(first.cursor.lastCompletedEntityId, "grp-resume-4-ad");
  deepStrictEqual(consumedIds, expectedIds.slice(0, 4));
  equal(firstRunMaxActiveAdPages, 4);

  runPhase = "second";

  const second = await collectNaverAuthoritativeEntityDailyStats({
    credentials: CREDENTIALS,
    cursor: first.cursor,
    requestIntervalMs: 0,
    maxEntityStatsPerRun: 4,
    dependencies,
    onEntityStats: (item) => {
      consumedIds.push(item.entity.id);
    },
  });

  equal(second.status, "completed");
  deepStrictEqual(consumedIds, expectedIds);
  deepStrictEqual(batchScopes, [
    expectedIds.slice(0, 4),
    expectedIds.slice(4),
  ]);
  equal(new Set(consumedIds).size, expectedIds.length);
  equal(second.cursor.completedEntityCount, 7);
  equal(second.cursor.campaignId, null);
  equal(secondRunMaxActiveAdPages, 1);
}

async function verifyBatchInputGuard(): Promise<void> {
  await rejects(
    () =>
      fetchNaverSearchAdsEntityDailyStatsBatch({
        credentials: CREDENTIALS,
        entityIds: ["ad-1"],
        entityType: "ad",
        dateFrom: DATE,
        dateTo: DATE,
      }),
    (error: unknown) =>
      error instanceof NaverSearchAdsApiError &&
      error.code === "INVALID_INPUT",
  );
}

async function main(): Promise<void> {
  console.log(
    "Naver Shopping stats batch verification started.",
  );
  console.log(
    "verification uses real Naver API: false",
  );
  console.log(
    "verification uses database: false",
  );
  console.log(
    "verification mutates jobs: false",
  );

  await verifyApiBatchContract();
  console.log(
    "PASS: one-day batch response matches the production diagnostic contract",
  );

  await verifyMultiDayBatchContract();
  console.log(
    "PASS: multi-day batch responses require explicit daily records",
  );

  await verifyOmittedZeroMetricIdsContract();
  console.log(
    "PASS: omitted and empty zero-metric IDs preserve one zero row per requested date",
  );

  await verifyUnexpectedBatchIdFailsClosed();
  console.log(
    "PASS: unexpected batch entity IDs remain fail-closed",
  );

  await verifyCollectorBatchAndTail();
  console.log(
    "PASS: collector uses one five-ID batch and a safe single tail",
  );

  await verifyCollectorFallback();
  console.log(
    "PASS: invalid batch contract disables batching and falls back to singles",
  );

  await verifyCrossAdgroupAndCampaignBatch();
  console.log(
    "PASS: Shopping batches cross adgroup and campaign boundaries without changing row order",
  );

  await verifyCrossAdgroupBoundedResume();
  console.log(
    "PASS: Shopping hierarchy pages prefetch four-wide and resume serially without duplicates",
  );

  await verifyBatchInputGuard();
  console.log(
    "PASS: batch size is fail-closed outside two to five IDs",
  );

  console.log(
    "NAVER_SEARCHADS_SHOPPING_STATS_BATCH_VERIFICATION=PASS",
  );
}

main().catch((error: unknown) => {
  console.error(
    "NAVER_SEARCHADS_SHOPPING_STATS_BATCH_VERIFICATION=FAIL",
  );
  console.error(error);
  process.exitCode = 1;
});

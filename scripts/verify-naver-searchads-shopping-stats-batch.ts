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

  await verifyCollectorBatchAndTail();
  console.log(
    "PASS: collector uses one five-ID batch and a safe single tail",
  );

  await verifyCollectorFallback();
  console.log(
    "PASS: invalid batch contract disables batching and falls back to singles",
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

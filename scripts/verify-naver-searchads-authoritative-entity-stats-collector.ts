import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  collectNaverAuthoritativeEntityDailyStats,
  NaverAuthoritativeEntityStatsCollectorError,
  type NaverAuthoritativeEntityStatsCollectorDependencies,
  type NaverAuthoritativeEntityStatsCollectorItem,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  createNaverAuthoritativeEntityStatsCursor,
  normalizeNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  NaverSearchAdsApiError,
  type NaverSearchAdsAdRecord,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsEntityDailyStatsResult,
  type NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";

const credentials = {
  customerId: "123456",
  accessLicense: "fixture-access-license",
  secretKey: "fixture-secret-key",
};

const campaigns: NaverSearchAdsCampaignRecord[] = [
  {
    id: "cmp-web",
    name: "Powerlink",
    campaignType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  },
  {
    id: "cmp-shopping",
    name: "Shopping MO",
    campaignType: "SHOPPING",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  },
  {
    id: "cmp-brand",
    name: "Brand Search",
    campaignType: "BRAND_SEARCH",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  },
];

const shoppingAdgroups: NaverSearchAdsAdgroupRecord[] = [
  {
    id: "grp-shopping",
    campaignId: "cmp-shopping",
    name: "Shopping Group",
    adgroupType: "SHOPPING_PRODUCT_AD",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  },
];

const brandAdgroups: NaverSearchAdsAdgroupRecord[] = [
  {
    id: "grp-brand-1",
    campaignId: "cmp-brand",
    name: "Brand Group 1",
    adgroupType: "BRAND_SEARCH",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  },
  {
    id: "grp-brand-2",
    campaignId: "cmp-brand",
    name: "Brand Group 2",
    adgroupType: "BRAND_SEARCH",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  },
];

const shoppingAds: NaverSearchAdsAdRecord[] = [
  {
    id: "ad-shopping-1",
    adgroupId: "grp-shopping",
    type: "SHOPPING_PRODUCT_AD",
    inspectStatus: "APPROVED",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
    referenceKey: "product-1",
  },
  {
    id: "ad-shopping-2",
    adgroupId: "grp-shopping",
    type: "SHOPPING_PRODUCT_AD",
    inspectStatus: "APPROVED",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
    referenceKey: "product-2",
  },
  {
    id: "ad-shopping-3",
    adgroupId: "grp-shopping",
    type: "SHOPPING_PRODUCT_AD",
    inspectStatus: "APPROVED",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
    referenceKey: "product-3",
  },
];

function page<T>(records: T[]): NaverSearchAdsListPage<T> {
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
  entityType: "adgroup" | "ad",
): NaverSearchAdsEntityDailyStatsResult {
  return {
    entityId,
    entityType,
    dateFrom: "2026-05-01",
    dateTo: "2026-05-02",
    records: [
      {
        entityId,
        entityType,
        date: "2026-05-01",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-01",
        impCnt: 10,
        clkCnt: 1,
        salesAmt: 100,
        ccnt: 0,
        convAmt: 0,
      },
      {
        entityId,
        entityType,
        date: "2026-05-02",
        periodStart: "2026-05-02",
        periodEnd: "2026-05-02",
        impCnt: 20,
        clkCnt: 2,
        salesAmt: 200,
        ccnt: 1,
        convAmt: 500,
      },
    ],
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const keywordCollectorPath =
    "src/lib/media-sync/naver-searchads-keyword-stats-collector.ts";
  const keywordCollectorBefore = await readFile(keywordCollectorPath, "utf8");

  let now = Date.parse("2026-07-13T00:00:00.000Z");
  const attempts = new Map<string, number>();
  const retryEvents: string[] = [];
  const consumed: NaverAuthoritativeEntityStatsCollectorItem[] = [];

  const dependencies: Partial<NaverAuthoritativeEntityStatsCollectorDependencies> = {
    fetchCampaignPage: async () => page(campaigns),
    fetchAdgroupPage: async (input) =>
      page(
        input.campaignId === "cmp-shopping"
          ? shoppingAdgroups
          : input.campaignId === "cmp-brand"
            ? brandAdgroups
            : [],
      ),
    fetchAdPage: async (input) =>
      page(input.adgroupId === "grp-shopping" ? shoppingAds : []),
    fetchEntityDailyStats: async (input) => {
      const attempt = (attempts.get(input.entityId) ?? 0) + 1;
      attempts.set(input.entityId, attempt);

      if (input.entityId === "grp-brand-1" && attempt === 1) {
        throw new NaverSearchAdsApiError(
          "HTTP_ERROR",
          "Fixture rate limit.",
          { status: 429 },
        );
      }

      return stats(input.entityId, input.entityType as "adgroup" | "ad");
    },
    fetchStatReportAdgroupDailyStats: async () => {
      throw new Error(
        "STAT_REPORT_UNAVAILABLE_FOR_VERIFICATION",
      );
    },
    sleep: async () => undefined,
    now: () => {
      now += 1_000;
      return now;
    },
    random: () => 0,
  };

  const initialCursor = createNaverAuthoritativeEntityStatsCursor({
    dateWindow: {
      index: 0,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
    },
  });

  const first = await collectNaverAuthoritativeEntityDailyStats({
    credentials,
    cursor: initialCursor,
    requestIntervalMs: 0,
    maxEntityStatsPerRun: 2,
    maxStatsRequestsPerRun: 20,
    maxDiscoveryPagesPerRun: 20,
    dependencies,
    onRetry: (event) => {
      retryEvents.push(`${event.operation}:${event.entityId}:${event.category}`);
    },
    onEntityStats: (item) => {
      consumed.push(item);
    },
  });

  assert.equal(first.status, "partial");
  assert.equal(first.partialReason, "max_entity_stats_per_run_reached");
  assert.equal(first.entitiesCompletedInRun, 2);
  assert.equal(consumed.length, 2);
  assert.deepEqual(
    consumed.map((item) => item.entity.id),
    ["ad-shopping-1", "ad-shopping-2"],
  );

  const persistedCursor = normalizeNaverAuthoritativeEntityStatsCursor(
    JSON.parse(JSON.stringify(first.cursor)),
  );

  const second = await collectNaverAuthoritativeEntityDailyStats({
    credentials,
    cursor: persistedCursor,
    requestIntervalMs: 0,
    maxEntityStatsPerRun: 20,
    maxStatsRequestsPerRun: 20,
    maxDiscoveryPagesPerRun: 20,
    dependencies,
    onRetry: (event) => {
      retryEvents.push(`${event.operation}:${event.entityId}:${event.category}`);
    },
    onEntityStats: (item) => {
      consumed.push(item);
    },
  });

  assert.equal(second.status, "completed");
  assert.equal(second.isComplete, true);
  assert.equal(second.partialReason, null);
  assert.deepEqual(
    consumed.map((item) => item.entity.id),
    [
      "ad-shopping-1",
      "ad-shopping-2",
      "ad-shopping-3",
      "grp-brand-1",
      "grp-brand-2",
    ],
  );
  assert.equal(new Set(consumed.map((item) => item.entity.id)).size, 5);
  assert.deepEqual(
    consumed.map((item) => item.authoritativeGrain),
    ["ad", "ad", "ad", "adgroup", "adgroup"],
  );
  assert.ok(
    retryEvents.includes("entity_stats:grp-brand-1:rate_limit"),
  );
  assert.equal(attempts.get("grp-brand-1"), 2);
  assert.equal(second.cursor.completedEntityCount, 5);
  assert.equal(second.cursor.discoveredEntityCount, 5);

  const requestLimited = await collectNaverAuthoritativeEntityDailyStats({
    credentials,
    cursor: initialCursor,
    requestIntervalMs: 0,
    maxEntityStatsPerRun: 20,
    maxStatsRequestsPerRun: 1,
    maxDiscoveryPagesPerRun: 20,
    dependencies: {
      ...dependencies,
      fetchEntityDailyStats: async (input) =>
        stats(input.entityId, input.entityType as "adgroup" | "ad"),
    },
    onEntityStats: () => undefined,
  });

  assert.equal(requestLimited.status, "partial");
  assert.equal(
    requestLimited.partialReason,
    "max_stats_requests_per_run_reached",
  );

  await assert.rejects(
    () =>
      collectNaverAuthoritativeEntityDailyStats({
        credentials,
        cursor: initialCursor,
        requestIntervalMs: 0,
        dependencies: {
          ...dependencies,
          fetchCampaignPage: async () =>
            page([
              {
                ...campaigns[0]!,
                id: "cmp-unknown",
                campaignType: "UNKNOWN",
              },
            ]),
        },
        onEntityStats: () => undefined,
      }),
    (error: unknown) =>
      error instanceof NaverAuthoritativeEntityStatsCollectorError &&
      error.code === "UNSUPPORTED_CAMPAIGN_TYPE",
  );

  const keywordCollectorAfter = await readFile(keywordCollectorPath, "utf8");
  assert.equal(hash(keywordCollectorAfter), hash(keywordCollectorBefore));

  console.log("verified SHOPPING authoritative grain: ad");
  console.log("verified BRAND_SEARCH authoritative grain: adgroup");
  console.log("verified WEB_SITE remains owned by keyword collector: true");
  console.log("verified bounded partial result: true");
  console.log("verified exact cursor resume without duplicate entities: true");
  console.log("verified stats request bound: true");
  console.log("verified 429 retry and resume contract: true");
  console.log("verified unknown campaign type fails closed: true");
  console.log("verified keyword collector byte hash unchanged: true");
  console.log("fixture uses real Naver API: false");
  console.log("fixture uses database: false");
  console.log("fixture writes staging: false");
  console.log("fixture writes report_rows: false");
  console.log("fixture changes report pointers: false");
  console.log("verification passed: true");
}

main().catch((error: unknown) => {
  console.error(
    "Naver authoritative entity collector fixture failed.",
    error,
  );
  process.exitCode = 1;
});

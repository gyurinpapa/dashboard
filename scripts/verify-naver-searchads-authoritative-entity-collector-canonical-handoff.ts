import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  collectNaverAuthoritativeEntityDailyStats,
  type NaverAuthoritativeEntityStatsCollectorDependencies,
  type NaverAuthoritativeEntityStatsCollectorItem,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  createNaverAuthoritativeEntityStatsCursor,
  normalizeNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  convertNaverAuthoritativeEntityCollectorItemToCanonicalRows,
  NaverSearchAdsAuthoritativeEntityCanonicalAdapterError,
  type NaverSearchAdsAuthoritativeEntityCanonicalAdapterErrorCode,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter";
import {
  NaverSearchAdsApiError,
  type NaverSearchAdsAdRecord,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsEntityDailyStatsResult,
  type NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const EXTERNAL_ACCOUNT_ID =
  "123456";

const credentials = {
  customerId:
    EXTERNAL_ACCOUNT_ID,
  accessLicense:
    "fixture-access-license",
  secretKey:
    "fixture-secret-key",
};

const campaigns:
  NaverSearchAdsCampaignRecord[] = [
    {
      id:
        "cmp-web",
      name:
        "Powerlink",
      campaignType:
        "WEB_SITE",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "cmp-shopping",
      name:
        "Shopping MO",
      campaignType:
        "SHOPPING",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "cmp-brand",
      name:
        "Brand Search",
      campaignType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const shoppingAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "grp-shopping",
      campaignId:
        "cmp-shopping",
      name:
        "Shopping Group",
      adgroupType:
        "SHOPPING_PRODUCT_AD",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const brandAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "grp-brand-1",
      campaignId:
        "cmp-brand",
      name:
        "Brand Group 1",
      adgroupType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "grp-brand-2",
      campaignId:
        "cmp-brand",
      name:
        "Brand Group 2",
      adgroupType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const shoppingAds:
  NaverSearchAdsAdRecord[] = [
    {
      id:
        "ad-shopping-1",
      adgroupId:
        "grp-shopping",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "product-1",
    },
    {
      id:
        "ad-shopping-2",
      adgroupId:
        "grp-shopping",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "product-2",
    },
    {
      id:
        "ad-shopping-3",
      adgroupId:
        "grp-shopping",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "product-3",
    },
  ];

function page<T>(
  records: T[],
): NaverSearchAdsListPage<T> {
  return {
    records,
    nextBaseSearchId:
      null,
    recordSize:
      100,
    selector:
      "NEXT",
    baseSearchId:
      null,
  };
}

function stats(
  entityId: string,
  entityType:
    | "adgroup"
    | "ad",
): NaverSearchAdsEntityDailyStatsResult {
  return {
    entityId,
    entityType,
    dateFrom:
      "2026-05-01",
    dateTo:
      "2026-05-02",
    records: [
      {
        entityId,
        entityType,
        date:
          "2026-05-02",
        periodStart:
          "2026-05-02",
        periodEnd:
          "2026-05-02",
        impCnt:
          20,
        clkCnt:
          2,
        salesAmt:
          200,
        ccnt:
          1,
        convAmt:
          500,
      },
      {
        entityId,
        entityType,
        date:
          "2026-05-01",
        periodStart:
          "2026-05-01",
        periodEnd:
          "2026-05-01",
        impCnt:
          10,
        clkCnt:
          1,
        salesAmt:
          100,
        ccnt:
          0,
        convAmt:
          0,
      },
    ],
  };
}

function hash(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}

function expectAdapterError(
  expectedCode:
    NaverSearchAdsAuthoritativeEntityCanonicalAdapterErrorCode,
  callback: () => void,
): void {
  try {
    callback();
  } catch (error) {
    assert.ok(
      error instanceof
        NaverSearchAdsAuthoritativeEntityCanonicalAdapterError,
      "Expected NaverSearchAdsAuthoritativeEntityCanonicalAdapterError.",
    );

    assert.equal(
      error.code,
      expectedCode,
      "Unexpected authoritative entity canonical adapter error code.",
    );

    return;
  }

  throw new Error(
    `Expected authoritative entity canonical adapter to throw ${expectedCode}.`,
  );
}

function buildCollectorItem(input: {
  campaign:
    NaverSearchAdsCampaignRecord;
  adgroup:
    NaverSearchAdsAdgroupRecord;
  entity:
    | NaverSearchAdsAdgroupRecord
    | NaverSearchAdsAdRecord;
  authoritativeGrain:
    | "adgroup"
    | "ad";
  stats:
    NaverSearchAdsEntityDailyStatsResult;
}): NaverAuthoritativeEntityStatsCollectorItem {
  const cursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          "2026-05-01",
        dateTo:
          "2026-05-02",
      },
    });

  return {
    campaign:
      input.campaign,
    adgroup:
      input.adgroup,
    entity:
      input.entity,
    authoritativeGrain:
      input.authoritativeGrain,
    stats:
      input.stats,
    cursorBefore:
      cursor,
    cursorAfter: {
      ...cursor,
    },
    requestAttemptCount:
      1,
  };
}

function verifyPureAdapterContract(): void {
  const shoppingCampaign =
    campaigns.find(
      (
        campaign,
      ) =>
        campaign.id ===
        "cmp-shopping",
    );

  const brandCampaign =
    campaigns.find(
      (
        campaign,
      ) =>
        campaign.id ===
        "cmp-brand",
    );

  const webCampaign =
    campaigns.find(
      (
        campaign,
      ) =>
        campaign.id ===
        "cmp-web",
    );

  const shoppingAdgroup =
    shoppingAdgroups[0];

  const shoppingAd =
    shoppingAds[0];

  const brandPlaceholder =
    brandAdgroups[0];

  const brandEntity =
    brandAdgroups[1];

  assert.ok(
    shoppingCampaign,
    "SHOPPING fixture campaign is missing.",
  );

  assert.ok(
    brandCampaign,
    "BRAND_SEARCH fixture campaign is missing.",
  );

  assert.ok(
    webCampaign,
    "WEB_SITE fixture campaign is missing.",
  );

  assert.ok(
    shoppingAdgroup,
    "SHOPPING fixture adgroup is missing.",
  );

  assert.ok(
    shoppingAd,
    "SHOPPING fixture ad is missing.",
  );

  assert.ok(
    brandPlaceholder,
    "BRAND_SEARCH placeholder fixture is missing.",
  );

  assert.ok(
    brandEntity,
    "BRAND_SEARCH entity fixture is missing.",
  );

  const shoppingItem =
    buildCollectorItem({
      campaign:
        shoppingCampaign,
      adgroup:
        shoppingAdgroup,
      entity:
        shoppingAd,
      authoritativeGrain:
        "ad",
      stats:
        stats(
          shoppingAd.id,
          "ad",
        ),
    });

  const shoppingBefore =
    JSON.stringify(
      shoppingItem,
    );

  const shoppingRows =
    convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
      externalAccountId:
        EXTERNAL_ACCOUNT_ID,
      item:
        shoppingItem,
    });

  assert.equal(
    shoppingRows.length,
    2,
  );

  assert.ok(
    shoppingRows.every(
      (
        row,
      ) =>
        row.row_level ===
          "creative" &&
        row.data_level ===
          "creative",
    ),
    "SHOPPING adapter did not return creative canonical rows.",
  );

  assert.equal(
    JSON.stringify(
      shoppingItem,
    ),
    shoppingBefore,
    "SHOPPING adapter mutated its collector item.",
  );

  const brandItem =
    buildCollectorItem({
      campaign:
        brandCampaign,
      adgroup:
        brandPlaceholder,
      entity:
        brandEntity,
      authoritativeGrain:
        "adgroup",
      stats:
        stats(
          brandEntity.id,
          "adgroup",
        ),
    });

  const brandBefore =
    JSON.stringify(
      brandItem,
    );

  const brandRows =
    convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
      externalAccountId:
        EXTERNAL_ACCOUNT_ID,
      item:
        brandItem,
    });

  assert.equal(
    brandRows.length,
    2,
  );

  assert.ok(
    brandRows.every(
      (
        row,
      ) =>
        row.row_level ===
          "mixed" &&
        row.data_level ===
          "mixed" &&
        row.external_group_id ===
          brandEntity.id &&
        row.group ===
          brandEntity.name,
    ),
    "BRAND_SEARCH adapter did not use the actual adgroup entity.",
  );

  assert.equal(
    JSON.stringify(
      brandItem,
    ),
    brandBefore,
    "BRAND_SEARCH adapter mutated its collector item.",
  );

  expectAdapterError(
    "UNSUPPORTED_CAMPAIGN_TYPE",
    () => {
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              webCampaign,
            adgroup:
              shoppingAdgroup,
            entity:
              shoppingAd,
            authoritativeGrain:
              "ad",
            stats:
              stats(
                shoppingAd.id,
                "ad",
              ),
          }),
      });
    },
  );

  expectAdapterError(
    "UNSUPPORTED_CAMPAIGN_TYPE",
    () => {
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign: {
              ...shoppingCampaign,
              campaignType:
                "PLACE",
            },
            adgroup:
              shoppingAdgroup,
            entity:
              shoppingAd,
            authoritativeGrain:
              "ad",
            stats:
              stats(
                shoppingAd.id,
                "ad",
              ),
          }),
      });
    },
  );

  expectAdapterError(
    "AUTHORITATIVE_GRAIN_MISMATCH",
    () => {
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              shoppingCampaign,
            adgroup:
              shoppingAdgroup,
            entity:
              shoppingAdgroup,
            authoritativeGrain:
              "adgroup",
            stats:
              stats(
                shoppingAdgroup.id,
                "adgroup",
              ),
          }),
      });
    },
  );

  expectAdapterError(
    "AUTHORITATIVE_GRAIN_MISMATCH",
    () => {
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              brandCampaign,
            adgroup:
              brandPlaceholder,
            entity:
              shoppingAd,
            authoritativeGrain:
              "ad",
            stats:
              stats(
                shoppingAd.id,
                "ad",
              ),
          }),
      });
    },
  );

  expectAdapterError(
    "ENTITY_SHAPE_MISMATCH",
    () => {
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              shoppingCampaign,
            adgroup:
              shoppingAdgroup,
            entity:
              shoppingAdgroup,
            authoritativeGrain:
              "ad",
            stats:
              stats(
                shoppingAdgroup.id,
                "ad",
              ),
          }),
      });
    },
  );

  expectAdapterError(
    "ENTITY_SHAPE_MISMATCH",
    () => {
      convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
        externalAccountId:
          EXTERNAL_ACCOUNT_ID,
        item:
          buildCollectorItem({
            campaign:
              brandCampaign,
            adgroup:
              brandPlaceholder,
            entity:
              shoppingAd,
            authoritativeGrain:
              "adgroup",
            stats:
              stats(
                shoppingAd.id,
                "adgroup",
              ),
          }),
      });
    },
  );
}

function authoritativeRowKey(
  row:
    EtrylueNormalizedMediaRow,
): string {
  const entityId =
    row.row_level ===
    "creative"
      ? String(
          row[
            "external_creative_id"
          ] ?? "",
        )
      : String(
          row.external_group_id ??
            "",
        );

  assert.notEqual(
    entityId,
    "",
    "Authoritative canonical row is missing its entity ID.",
  );

  return [
    row.row_level,
    entityId,
    row.date,
  ].join(
    ":",
  );
}

async function main(): Promise<void> {
  const collectorPath =
    "src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector.ts";

  const canonicalPath =
    "src/lib/media-sync/naver-searchads-canonical-row.ts";

  const adapterPath =
    "src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter.ts";

  const keywordCollectorPath =
    "src/lib/media-sync/naver-searchads-keyword-stats-collector.ts";

  const [
    collectorBefore,
    canonicalBefore,
    adapterBefore,
    keywordCollectorBefore,
  ] =
    await Promise.all([
      readFile(
        collectorPath,
        "utf8",
      ),
      readFile(
        canonicalPath,
        "utf8",
      ),
      readFile(
        adapterPath,
        "utf8",
      ),
      readFile(
        keywordCollectorPath,
        "utf8",
      ),
    ]);

  verifyPureAdapterContract();

  const fixtureBefore =
    JSON.stringify({
      campaigns,
      shoppingAdgroups,
      brandAdgroups,
      shoppingAds,
    });

  let now =
    Date.parse(
      "2026-07-13T00:00:00.000Z",
    );

  const attempts =
    new Map<
      string,
      number
    >();

  const retryEvents:
    string[] = [];

  const progressStages:
    string[] = [];

  const consumedEntityIds:
    string[] = [];

  const canonicalRows:
    EtrylueNormalizedMediaRow[] = [];

  const dependencies:
    Partial<NaverAuthoritativeEntityStatsCollectorDependencies> = {
      fetchCampaignPage:
        async () =>
          page(
            campaigns,
          ),

      fetchAdgroupPage:
        async (
          input,
        ) =>
          page(
            input.campaignId ===
              "cmp-shopping"
              ? shoppingAdgroups
              : input.campaignId ===
                  "cmp-brand"
                ? brandAdgroups
                : [],
          ),

      fetchAdPage:
        async (
          input,
        ) =>
          page(
            input.adgroupId ===
              "grp-shopping"
              ? shoppingAds
              : [],
          ),

      fetchEntityDailyStats:
        async (
          input,
        ) => {
          const attempt =
            (
              attempts.get(
                input.entityId,
              ) ?? 0
            ) + 1;

          attempts.set(
            input.entityId,
            attempt,
          );

          if (
            input.entityId ===
              "grp-brand-1" &&
            attempt === 1
          ) {
            throw new NaverSearchAdsApiError(
              "HTTP_ERROR",
              "Fixture rate limit.",
              {
                status:
                  429,
              },
            );
          }

          assert.ok(
            input.entityType ===
              "ad" ||
              input.entityType ===
                "adgroup",
            "Authoritative collector requested a non-authoritative entity type.",
          );

          return stats(
            input.entityId,
            input.entityType,
          );
        },

      sleep:
        async () =>
          undefined,

      now:
        () => {
          now +=
            1_000;

          return now;
        },

      random:
        () =>
          0,
    };

  const consume =
    (
      item:
        NaverAuthoritativeEntityStatsCollectorItem,
    ): void => {
      const rows =
        convertNaverAuthoritativeEntityCollectorItemToCanonicalRows({
          externalAccountId:
            EXTERNAL_ACCOUNT_ID,
          item,
        });

      consumedEntityIds.push(
        item.entity.id,
      );

      canonicalRows.push(
        ...rows,
      );
    };

  const initialCursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          "2026-05-01",
        dateTo:
          "2026-05-02",
      },
    });

  const first =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials,
      cursor:
        initialCursor,
      requestIntervalMs:
        0,
      maxEntityStatsPerRun:
        2,
      maxStatsRequestsPerRun:
        20,
      maxDiscoveryPagesPerRun:
        20,
      dependencies,
      onRetry:
        (
          event,
        ) => {
          retryEvents.push(
            [
              event.operation,
              event.entityId,
              event.category,
            ].join(
              ":",
            ),
          );
        },
      onProgress:
        (
          event,
        ) => {
          progressStages.push(
            event.stage,
          );
        },
      onEntityStats:
        consume,
    });

  assert.equal(
    first.status,
    "partial",
  );

  assert.equal(
    first.partialReason,
    "max_entity_stats_per_run_reached",
  );

  assert.equal(
    first.entitiesCompletedInRun,
    2,
  );

  assert.deepEqual(
    consumedEntityIds,
    [
      "ad-shopping-1",
      "ad-shopping-2",
    ],
  );

  assert.equal(
    canonicalRows.length,
    4,
    "The bounded first run must emit two days for each of two SHOPPING ads.",
  );

  const persistedCursor =
    normalizeNaverAuthoritativeEntityStatsCursor(
      JSON.parse(
        JSON.stringify(
          first.cursor,
        ),
      ),
    );

  const second =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials,
      cursor:
        persistedCursor,
      requestIntervalMs:
        0,
      maxEntityStatsPerRun:
        20,
      maxStatsRequestsPerRun:
        20,
      maxDiscoveryPagesPerRun:
        20,
      dependencies,
      onRetry:
        (
          event,
        ) => {
          retryEvents.push(
            [
              event.operation,
              event.entityId,
              event.category,
            ].join(
              ":",
            ),
          );
        },
      onProgress:
        (
          event,
        ) => {
          progressStages.push(
            event.stage,
          );
        },
      onEntityStats:
        consume,
    });

  assert.equal(
    second.status,
    "completed",
  );

  assert.equal(
    second.isComplete,
    true,
  );

  assert.equal(
    second.partialReason,
    null,
  );

  assert.deepEqual(
    consumedEntityIds,
    [
      "ad-shopping-1",
      "ad-shopping-2",
      "ad-shopping-3",
      "grp-brand-1",
      "grp-brand-2",
    ],
  );

  assert.equal(
    new Set(
      consumedEntityIds,
    ).size,
    5,
    "Partial resume emitted a duplicate authoritative entity.",
  );

  assert.equal(
    second.cursor.completedEntityCount,
    5,
  );

  assert.equal(
    second.cursor.discoveredEntityCount,
    5,
  );

  assert.ok(
    progressStages.includes(
      "campaign:skipped_keyword_collector",
    ),
    "WEB_SITE campaign was not left to the keyword collector.",
  );

  assert.ok(
    retryEvents.includes(
      "entity_stats:grp-brand-1:rate_limit",
    ),
    "Expected BRAND_SEARCH 429 retry event is missing.",
  );

  assert.equal(
    attempts.get(
      "grp-brand-1",
    ),
    2,
    "BRAND_SEARCH retry count mismatch.",
  );

  assert.equal(
    canonicalRows.length,
    10,
    "Canonical row count must equal five authoritative entities times two dates.",
  );

  const creativeRows =
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "creative",
    );

  const mixedRows =
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "mixed",
    );

  assert.equal(
    creativeRows.length,
    6,
  );

  assert.equal(
    mixedRows.length,
    4,
  );

  assert.equal(
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "keyword",
    ).length,
    0,
    "Authoritative entity collector emitted keyword canonical rows.",
  );

  for (
    const row
    of creativeRows
  ) {
    assert.equal(
      row.data_level,
      "creative",
    );

    assert.equal(
      row.row_level_reason,
      "naver_searchad_shopping_ad_daily_stats",
    );

    assert.equal(
      row.provider,
      "naver_searchad",
    );

    assert.equal(
      row.ingestion_source,
      "api",
    );

    assert.equal(
      row.external_account_id,
      EXTERNAL_ACCOUNT_ID,
    );

    assert.equal(
      row.external_keyword_id,
      undefined,
    );

    assert.notEqual(
      String(
        row[
          "external_creative_id"
        ] ?? "",
      ),
      "",
    );

    assert.equal(
      row.provider_meta?.[
        "authoritative_grain"
      ],
      "ad",
    );
  }

  for (
    const row
    of mixedRows
  ) {
    assert.equal(
      row.data_level,
      "mixed",
    );

    assert.equal(
      row.row_level_reason,
      "naver_searchad_brand_search_adgroup_daily_stats",
    );

    assert.equal(
      row.provider,
      "naver_searchad",
    );

    assert.equal(
      row.ingestion_source,
      "api",
    );

    assert.equal(
      row.external_account_id,
      EXTERNAL_ACCOUNT_ID,
    );

    assert.equal(
      row.external_keyword_id,
      undefined,
    );

    assert.equal(
      row[
        "external_creative_id"
      ],
      undefined,
    );

    assert.notEqual(
      row.external_group_id,
      undefined,
    );

    assert.equal(
      row.provider_meta?.[
        "authoritative_grain"
      ],
      "adgroup",
    );
  }

  const authoritativeKeys =
    canonicalRows.map(
      authoritativeRowKey,
    );

  assert.equal(
    new Set(
      authoritativeKeys,
    ).size,
    canonicalRows.length,
    "Partial resume or retry produced duplicate authoritative canonical rows.",
  );

  const totals =
    canonicalRows.reduce(
      (
        result,
        row,
      ) => ({
        impressions:
          result.impressions +
          row.impressions,
        clicks:
          result.clicks +
          row.clicks,
        cost:
          result.cost +
          row.cost,
        conversions:
          result.conversions +
          row.conversions,
        revenue:
          result.revenue +
          row.revenue,
      }),
      {
        impressions:
          0,
        clicks:
          0,
        cost:
          0,
        conversions:
          0,
        revenue:
          0,
      },
    );

  assert.deepEqual(
    totals,
    {
      impressions:
        150,
      clicks:
        15,
      cost:
        1_500,
      conversions:
        5,
      revenue:
        2_500,
    },
  );

  assert.equal(
    JSON.stringify({
      campaigns,
      shoppingAdgroups,
      brandAdgroups,
      shoppingAds,
    }),
    fixtureBefore,
    "Collector-to-canonical fixture mutated hierarchy inputs.",
  );

  const [
    collectorAfter,
    canonicalAfter,
    adapterAfter,
    keywordCollectorAfter,
  ] =
    await Promise.all([
      readFile(
        collectorPath,
        "utf8",
      ),
      readFile(
        canonicalPath,
        "utf8",
      ),
      readFile(
        adapterPath,
        "utf8",
      ),
      readFile(
        keywordCollectorPath,
        "utf8",
      ),
    ]);

  assert.equal(
    hash(
      collectorAfter,
    ),
    hash(
      collectorBefore,
    ),
    "Authoritative entity collector source changed during verification.",
  );

  assert.equal(
    hash(
      canonicalAfter,
    ),
    hash(
      canonicalBefore,
    ),
    "Canonical converter source changed during verification.",
  );

  assert.equal(
    hash(
      adapterAfter,
    ),
    hash(
      adapterBefore,
    ),
    "Authoritative entity canonical adapter source changed during verification.",
  );

  assert.equal(
    hash(
      keywordCollectorAfter,
    ),
    hash(
      keywordCollectorBefore,
    ),
    "Keyword collector source changed during verification.",
  );

  console.log(
    "verified pure adapter SHOPPING routing to creative canonical rows: true",
  );

  console.log(
    "verified pure adapter BRAND_SEARCH routing uses the actual adgroup entity: true",
  );

  console.log(
    "verified pure adapter rejects WEB_SITE and unknown campaign types: true",
  );

  console.log(
    "verified pure adapter rejects campaign/grain mismatches: true",
  );

  console.log(
    "verified pure adapter rejects entity shape mismatches: true",
  );

  console.log(
    "verified collector SHOPPING handoff to creative canonical rows: true",
  );

  console.log(
    "verified collector BRAND_SEARCH handoff to mixed canonical rows: true",
  );

  console.log(
    "verified WEB_SITE remains owned by keyword collector: true",
  );

  console.log(
    "verified bounded partial/resume without duplicate canonical rows: true",
  );

  console.log(
    "verified 429 retry does not duplicate canonical rows: true",
  );

  console.log(
    "verified one authoritative grain per campaign: true",
  );

  console.log(
    "verified cross-grain duplicate canonical rows: 0",
  );

  console.log(
    "verified canonical metric totals: 150 / 15 / 1500 / 5 / 2500",
  );

  console.log(
    "verified collector, canonical converter, adapter, and keyword collector source hashes unchanged: true",
  );

  console.log(
    "verified collector, adapter, and canonical inputs unchanged: true",
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
  );

  console.log(
    "fixture writes staging: false",
  );

  console.log(
    "fixture writes report_rows: false",
  );

  console.log(
    "fixture changes report pointers: false",
  );

  console.log(
    "verification passed: true",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "Naver authoritative entity collector-to-canonical handoff fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);

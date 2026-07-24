// scripts/verify-naver-searchads-power-contents-keyword-boundary.ts
//
// Pure DI fixture.
// - no real Naver API requests
// - no database connection
// - no database writes
// - verifies POWER_CONTENTS remains in the registered-keyword path
// - verifies the authoritative ad/adgroup collector explicitly skips it

import assert from "node:assert/strict";

import {
  collectNaverAuthoritativeEntityDailyStats,
  type NaverAuthoritativeEntityStatsCollectorDependencies,
  type NaverAuthoritativeEntityStatsCollectorProgressStage,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  resolveNaverSearchAdsCampaignCollectionContract,
} from "../src/lib/media-sync/naver-searchads-authoritative-grain";
import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import type {
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";

const credentials = {
  customerId:
    "fixture-customer-id",
  accessLicense:
    "fixture-access-license",
  secretKey:
    "fixture-secret-key",
};

const campaign:
  NaverSearchAdsCampaignRecord = {
    id:
      "cmp-power-contents",
    name:
      "Power Contents",
    campaignType:
      "POWER_CONTENTS",
    status:
      "ELIGIBLE",
    statusReason:
      null,
    userLock:
      false,
  };

function page<T>(
  records:
    readonly T[],
): NaverSearchAdsListPage<T> {
  return {
    records:
      [...records],
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

async function main(): Promise<void> {
  const contract =
    resolveNaverSearchAdsCampaignCollectionContract(
      "POWER_CONTENTS",
    );

  assert.deepEqual(
    contract,
    {
      provider:
        "naver_searchad",
      status:
        "collect",
      campaignType:
        "POWER_CONTENTS",
      authoritativeGrain:
        "keyword",
      canonicalRowLevel:
        "keyword",
      canonicalDataLevel:
        "keyword",
      rowLevelReason:
        "naver_searchad_registered_keyword_daily_stats",
    },
  );

  let campaignPageCalls =
    0;

  let adgroupPageCalls =
    0;

  let adPageCalls =
    0;

  let entityStatsCalls =
    0;

  let entityConsumerCalls =
    0;

  let now =
    Date.parse(
      "2026-07-21T00:00:00.000Z",
    );

  const progressStages:
    NaverAuthoritativeEntityStatsCollectorProgressStage[] = [];

  const dependencies:
    Partial<NaverAuthoritativeEntityStatsCollectorDependencies> = {
      fetchCampaignPage:
        async () => {
          campaignPageCalls +=
            1;

          return page([
            campaign,
          ]);
        },

      fetchAdgroupPage:
        async () => {
          adgroupPageCalls +=
            1;

          throw new Error(
            "POWER_CONTENTS must not enter authoritative adgroup discovery.",
          );
        },

      fetchAdPage:
        async () => {
          adPageCalls +=
            1;

          throw new Error(
            "POWER_CONTENTS must not enter authoritative ad discovery.",
          );
        },

      fetchEntityDailyStats:
        async () => {
          entityStatsCalls +=
            1;

          throw new Error(
            "POWER_CONTENTS must not request authoritative entity stats.",
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

  const result =
    await collectNaverAuthoritativeEntityDailyStats({
      credentials,

      cursor:
        createNaverAuthoritativeEntityStatsCursor({
          dateWindow: {
            index:
              0,
            dateFrom:
              "2026-05-01",
            dateTo:
              "2026-05-02",
          },
        }),

      requestIntervalMs:
        0,

      maxEntityStatsPerRun:
        10,

      maxStatsRequestsPerRun:
        10,

      maxDiscoveryPagesPerRun:
        10,

      dependencies,

      onProgress:
        (
          event,
        ) => {
          progressStages.push(
            event.stage,
          );
        },

      onEntityStats:
        () => {
          entityConsumerCalls +=
            1;
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
    result.partialReason,
    null,
  );

  assert.equal(
    result.campaignPagesRead,
    1,
  );

  assert.equal(
    result.campaignsRead,
    1,
  );

  assert.equal(
    result.adgroupPagesRead,
    0,
  );

  assert.equal(
    result.adgroupsRead,
    0,
  );

  assert.equal(
    result.entityPagesRead,
    0,
  );

  assert.equal(
    result.entitiesDiscoveredInRun,
    0,
  );

  assert.equal(
    result.entitiesCompletedInRun,
    0,
  );

  assert.equal(
    result.statsRequestsAttempted,
    0,
  );

  assert.equal(
    result.statsRequestsSucceeded,
    0,
  );

  assert.equal(
    campaignPageCalls,
    1,
  );

  assert.equal(
    adgroupPageCalls,
    0,
  );

  assert.equal(
    adPageCalls,
    0,
  );

  assert.equal(
    entityStatsCalls,
    0,
  );

  assert.equal(
    entityConsumerCalls,
    0,
  );

  assert.ok(
    progressStages.includes(
      "campaign:skipped_keyword_collector",
    ),
  );

  assert.ok(
    progressStages.includes(
      "collector:done",
    ),
  );

  console.log(
    "POWER_CONTENTS campaign contract resolved: true",
  );

  console.log(
    "POWER_CONTENTS authoritative grain: keyword",
  );

  console.log(
    "registered-keyword row contract preserved: true",
  );

  console.log(
    "authoritative adgroup discovery called: false",
  );

  console.log(
    "authoritative ad discovery called: false",
  );

  console.log(
    "authoritative entity stats called: false",
  );

  console.log(
    "authoritative entity consumer called: false",
  );

  console.log(
    "campaign:skipped_keyword_collector observed: true",
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
      "POWER_CONTENTS keyword-boundary verification failed:",
      error,
    );

    process.exitCode =
      1;
  },
);
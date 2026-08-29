import assert from "node:assert/strict";

import {
  GoogleAdsAllDataDemandGenStagingOrchestratorError,
  runGoogleAdsAllDataDemandGenStagingOrchestrator,
  type GoogleAdsAllDataDemandGenStagingOrchestratorDependencies,
} from "../src/lib/media-sync/google-ads-all-data-demand-gen-staging-orchestrator";
import type {
  GoogleAdsDemandGenAdStatsPageCollectionResult,
} from "../src/lib/media-sync/google-ads-demand-gen-ad-stats-collector";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE =
  "2026-05-01";

const ACCOUNT_ID =
  "1234567890";

const ALL_DATA_CONTRACT =
  "google_all_data_v1";

function createJob(
  insertedRows:
    number,
  executionContract:
    unknown =
      ALL_DATA_CONTRACT,
): MediaSyncJobRecord {
  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    report_id:
      "22222222-2222-4222-8222-222222222222",

    workspace_id:
      "33333333-3333-4333-8333-333333333333",

    advertiser_id:
      "44444444-4444-4444-8444-444444444444",

    connection_id:
      "55555555-5555-4555-8555-555555555555",

    provider:
      "google_ads",

    external_account_id:
      ACCOUNT_ID,

    date_from:
      DATE,

    date_to:
      DATE,

    data_level:
      "keyword",

    mode:
      "snapshot_replace",

    status:
      "processing",

    progress:
      50,

    raw_rows:
      insertedRows,

    normalized_rows:
      insertedRows,

    inserted_rows:
      insertedRows,

    failed_rows:
      0,

    previous_ingestion_id:
      null,

    snapshot_ingestion_id:
      null,

    attempt_count:
      1,

    error:
      null,

    error_detail:
      null,

    created_by:
      "66666666-6666-4666-8666-666666666666",

    created_at:
      "2026-08-27T00:00:00.000Z",

    started_at:
      "2026-08-27T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-27T00:00:01.000Z",

    execution_contract:
      executionContract,
  } as unknown as
    MediaSyncJobRecord;
}

function createAdRow(
  adId:
    string,
): EtrylueNormalizedMediaRow {
  return {
    date:
      DATE,

    report_date:
      DATE,

    day:
      DATE,

    ymd:
      DATE,

    channel:
      "검샣��괃�곃�",

    source:
      "Google Ads",

    platform:
      "Google",

    device:
      "",

    campaign:
      "Fixture Search Campaign",

    campaign_name:
      "Fixture Search Campaign",

    group:
      "Fixture Search Ad Group",

    group_name:
      "Fixture Search Ad Group",

    adgroup_name:
      "Fixture Search Ad Group",

    creative:
      adId,

    creative_name:
      adId,

    impressions:
      100,

    clicks:
      10,

    cost:
      1000,

    conversions:
      2,

    revenue:
      3000,

    row_level:
      "creative",

    data_level:
      "creative",

    row_level_reason:
      "google_ads_demand_gen_ad_daily_stats",

    provider:
      "google_ads",

    ingestion_source:
      "api",

    external_account_id:
      ACCOUNT_ID,

    external_campaign_id:
      "1001",

    external_group_id:
      "2001",

    external_creative_id:
      adId,

    provider_meta: {
      provider:
        "google_ads",

      campaign_type:
        "DEMAND_GEN",

      product_family:
        "demand_gen",

      authoritative_grain:
        "ad",

      entity_type:
        "ad",

      entity_id:
        adId,
    },
  };
}

function partialPage(
  row:
    EtrylueNormalizedMediaRow,
): GoogleAdsDemandGenAdStatsPageCollectionResult {
  return Object.freeze({
    rows:
      Object.freeze([
        row,
      ]),

    status:
      "partial",

    isComplete:
      false,

    cursor:
      Object.freeze({
        version:
          1 as const,

        pageIndex:
          1,

        page:
          "search-ad-page-2",
      }),

    pageCount:
      1 as const,

    completedPageCount:
      1,

    requestCount:
      1,

    retryCount:
      0,
  });
}

function completedPage(
  row:
    EtrylueNormalizedMediaRow,
): GoogleAdsDemandGenAdStatsPageCollectionResult {
  return Object.freeze({
    rows:
      Object.freeze([
        row,
      ]),

    status:
      "completed",

    isComplete:
      true,

    cursor:
      null,

    pageCount:
      1 as const,

    completedPageCount:
      2,

    requestCount:
      1,

    retryCount:
      0,
  });
}

async function main():
  Promise<void> {
  let collectorCalls =
    0;

  let appendCalls =
    0;

  const receivedCursors:
    unknown[] = [];

  const appendStarts:
    number[] = [];

  const dependencies:
    GoogleAdsAllDataDemandGenStagingOrchestratorDependencies = {
      collectPage:
        async (
          input,
        ) => {
          collectorCalls +=
            1;

          receivedCursors.push(
            input.cursor,
          );

          if (
            collectorCalls ===
            1
          ) {
            assert.equal(
              input.cursor,
              undefined,
            );

            return partialPage(
              createAdRow(
                "4001",
              ),
            );
          }

          assert.deepEqual(
            input.cursor,
            {
              version:
                1,

              pageIndex:
                1,

              page:
                "search-ad-page-2",
            },
          );

          return completedPage(
            createAdRow(
              "4002",
            ),
          );
        },

      appendBatch:
        async (
          input,
        ) => {
          appendCalls +=
            1;

          appendStarts.push(
            input.rowStartIndex,
          );

          assert.equal(
            input.rows.length,
            1,
          );

          return {
            submittedRows:
              1,

            insertedRows:
              1,

            duplicateRows:
              0,

            firstRowIndex:
              input.rowStartIndex,

            lastRowIndex:
              input.rowStartIndex,
          };
        },
    };

  const first =
    await runGoogleAdsAllDataDemandGenStagingOrchestrator(
      {
        job:
          createJob(
            5,
          ),

        accessToken:
          "fixture-access-token",

        developerToken:
          "fixture-developer-token",

        dateWindowIndex:
          0,
      },
      dependencies,
    );

  assert.equal(
    first.rowStartIndex,
    5,
  );

  assert.equal(
    first.nextRowIndex,
    6,
  );

  assert.equal(
    first.runCanonicalRowCount,
    1,
  );

  assert.equal(
    first.isComplete,
    false,
  );

  assert.ok(
    first.checkpoint.cursor,
  );

  assert.equal(
    first.checkpoint.cursor
      .expectedRowStartIndex,
    6,
  );

  assert.deepEqual(
    appendStarts,
    [
      5,
    ],
  );

  console.log(
    "DEMAND_GEN_AD_ROW_START_FROM_JOB_INSERTED_ROWS=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_PARTIAL_CURSOR_PRESERVED=PASS",
  );

  const collectorCallsBeforeStale =
    collectorCalls;

  const appendCallsBeforeStale =
    appendCalls;

  await assert.rejects(
    () =>
      runGoogleAdsAllDataDemandGenStagingOrchestrator(
        {
          job:
            createJob(
              5,
            ),

          accessToken:
            "fixture-access-token",

          developerToken:
            "fixture-developer-token",

          dateWindowIndex:
            0,

          cursor:
            first.checkpoint.cursor,
        },
        dependencies,
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataDemandGenStagingOrchestratorError &&
      error.code ===
        "INVALID_CURSOR",
  );

  assert.equal(
    collectorCalls,
    collectorCallsBeforeStale,
  );

  assert.equal(
    appendCalls,
    appendCallsBeforeStale,
  );

  console.log(
    "DEMAND_GEN_AD_STALE_ROW_BOUNDARY_FAILS_BEFORE_API=PASS",
  );

  const second =
    await runGoogleAdsAllDataDemandGenStagingOrchestrator(
      {
        job:
          createJob(
            6,
          ),

        accessToken:
          "fixture-access-token",

        developerToken:
          "fixture-developer-token",

        dateWindowIndex:
          0,

        cursor:
          first.checkpoint.cursor,
      },
      dependencies,
    );

  assert.equal(
    second.rowStartIndex,
    6,
  );

  assert.equal(
    second.nextRowIndex,
    7,
  );

  assert.equal(
    second.isComplete,
    true,
  );

  assert.equal(
    second.checkpoint.cursor,
    null,
  );

  assert.deepEqual(
    appendStarts,
    [
      5,
      6,
    ],
  );

  assert.equal(
    collectorCalls,
    2,
  );

  assert.equal(
    appendCalls,
    2,
  );

  assert.deepEqual(
    receivedCursors[1],
    {
      version:
        1,

      pageIndex:
        1,

      page:
        "search-ad-page-2",
    },
  );

  console.log(
    "DEMAND_GEN_AD_EXACT_CURSOR_RESUME=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_GLOBAL_ROW_INDEX_CONTINUITY=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_ONE_PAGE_PER_INVOCATION=PASS",
  );

  const collectorBeforeLegacy =
    collectorCalls;

  const appendBeforeLegacy =
    appendCalls;

  await assert.rejects(
    () =>
      runGoogleAdsAllDataDemandGenStagingOrchestrator(
        {
          job:
            createJob(
              7,
              null,
            ),

          accessToken:
            "fixture-access-token",

          developerToken:
            "fixture-developer-token",

          dateWindowIndex:
            0,
        },
        dependencies,
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataDemandGenStagingOrchestratorError &&
      error.code ===
        "INVALID_JOB",
  );

  assert.equal(
    collectorCalls,
    collectorBeforeLegacy,
  );

  assert.equal(
    appendCalls,
    appendBeforeLegacy,
  );

  console.log(
    "DEMAND_GEN_AD_LEGACY_JOB_FAILS_BEFORE_API=PASS",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_DEMAND_GEN_STAGING_ORCHESTRATOR_FIXTURE=PASS",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

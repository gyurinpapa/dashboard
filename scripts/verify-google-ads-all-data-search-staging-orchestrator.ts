import assert from "node:assert/strict";

import {
  GoogleAdsAllDataSearchStagingOrchestratorError,
  runGoogleAdsAllDataSearchStagingOrchestrator,
  type GoogleAdsAllDataSearchStagingOrchestratorDependencies,
} from "../src/lib/media-sync/google-ads-all-data-search-staging-orchestrator";
import type {
  GoogleAdsKeywordStagingCursor,
  GoogleAdsKeywordStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-keyword-staging-orchestrator";
import type {
  GoogleAdsSearchAdStagingCursor,
  GoogleAdsSearchAdStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-search-ad-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE =
  "2026-05-01";

const ACCOUNT_ID =
  "1234567890";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

function createJob(
  insertedRows:
    number,
  executionContract:
    unknown =
      "google_all_data_v1",
): MediaSyncJobRecord {
  return {
    id:
      JOB_ID,

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

function keywordCursor(
  pageIndex:
    number,
  page:
    string,
): GoogleAdsKeywordStagingCursor {
  return Object.freeze({
    version:
      1 as const,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    page:
      Object.freeze({
        version:
          1 as const,

        pageIndex,

        page,
      }),
  });
}

function searchAdCursor(
  expectedRowStartIndex:
    number,
  pageIndex:
    number,
  page:
    string,
): GoogleAdsSearchAdStagingCursor {
  return Object.freeze({
    version:
      1 as const,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex,

    page:
      Object.freeze({
        version:
          1 as const,

        pageIndex,

        page,
      }),
  });
}

function keywordResult(
  input: {
    rowStartIndex:
      number;

    complete:
      boolean;

    cursor:
      GoogleAdsKeywordStagingCursor |
      null;
  },
): GoogleAdsKeywordStagingOrchestratorResult {
  const nextRowIndex =
    input.rowStartIndex +
    1;

  return {
    jobId:
      JOB_ID,

    dateWindowIndex:
      0,

    rowStartIndex:
      input.rowStartIndex,

    nextRowIndex,

    runCanonicalRowCount:
      1,

    canonicalRowCount:
      nextRowIndex,

    status:
      input.complete
        ? "completed"
        : "partial",

    isComplete:
      input.complete,

    collector:
      {},

    append:
      {},

    checkpoint: {
      version:
        1,

      dateWindowIndex:
        0,

      nextRowIndex,

      totalRows:
        nextRowIndex,

      failedRows:
        0,

      complete:
        input.complete,

      cursor:
        input.cursor,
    },
  } as unknown as
    GoogleAdsKeywordStagingOrchestratorResult;
}

function adResult(
  input: {
    rowStartIndex:
      number;

    complete:
      boolean;

    cursor:
      GoogleAdsSearchAdStagingCursor |
      null;
  },
): GoogleAdsSearchAdStagingOrchestratorResult {
  const nextRowIndex =
    input.rowStartIndex +
    1;

  return {
    jobId:
      JOB_ID,

    dateWindowIndex:
      0,

    rowStartIndex:
      input.rowStartIndex,

    nextRowIndex,

    runCanonicalRowCount:
      1,

    status:
      input.complete
        ? "completed"
        : "partial",

    isComplete:
      input.complete,

    collector:
      {},

    append:
      {},

    checkpoint: {
      version:
        1,

      dateWindowIndex:
        0,

      nextRowIndex,

      totalRows:
        nextRowIndex,

      failedRows:
        0,

      complete:
        input.complete,

      cursor:
        input.cursor,
    },
  } as unknown as
    GoogleAdsSearchAdStagingOrchestratorResult;
}

async function main():
  Promise<void> {
  let keywordCalls =
    0;

  let searchAdCalls =
    0;

  const keywordInputCursors:
    unknown[] = [];

  const searchAdInputCursors:
    unknown[] = [];

  const dependencies:
    GoogleAdsAllDataSearchStagingOrchestratorDependencies = {
      runKeywordStage:
        async (
          input,
        ) => {
          keywordCalls +=
            1;

          keywordInputCursors.push(
            input.cursor,
          );

          if (
            keywordCalls ===
            1
          ) {
            assert.equal(
              input.cursor,
              undefined,
            );

            assert.equal(
              input.job.inserted_rows,
              0,
            );

            return keywordResult({
              rowStartIndex:
                0,

              complete:
                false,

              cursor:
                keywordCursor(
                  1,
                  "keyword-page-2",
                ),
            });
          }

          assert.equal(
            keywordCalls,
            2,
          );

          assert.equal(
            input.job.inserted_rows,
            1,
          );

          assert.deepEqual(
            input.cursor,
            keywordCursor(
              1,
              "keyword-page-2",
            ),
          );

          return keywordResult({
            rowStartIndex:
              1,

            complete:
              true,

            cursor:
              null,
          });
        },

      runSearchAdStage:
        async (
          input,
        ) => {
          searchAdCalls +=
            1;

          searchAdInputCursors.push(
            input.cursor,
          );

          if (
            searchAdCalls ===
            1
          ) {
            assert.equal(
              input.job.inserted_rows,
              2,
            );

            assert.equal(
              input.cursor,
              null,
            );

            return adResult({
              rowStartIndex:
                2,

              complete:
                false,

              cursor:
                searchAdCursor(
                  3,
                  1,
                  "search-ad-page-2",
                ),
            });
          }

          assert.equal(
            searchAdCalls,
            2,
          );

          assert.equal(
            input.job.inserted_rows,
            3,
          );

          assert.deepEqual(
            input.cursor,
            searchAdCursor(
              3,
              1,
              "search-ad-page-2",
            ),
          );

          return adResult({
            rowStartIndex:
              3,

            complete:
              true,

            cursor:
              null,
          });
        },
    };

  const first =
    await runGoogleAdsAllDataSearchStagingOrchestrator(
      {
        job:
          createJob(
            0,
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
    first.phaseRun,
    "keyword",
  );

  assert.equal(
    first.nextPhase,
    "keyword",
  );

  assert.equal(
    first.nextRowIndex,
    1,
  );

  assert.equal(
    first.apiPageExecutionCount,
    1,
  );

  assert.equal(
    keywordCalls,
    1,
  );

  assert.equal(
    searchAdCalls,
    0,
  );

  assert.ok(
    first.checkpoint.cursor,
  );

  assert.equal(
    first.checkpoint.cursor
      .expectedRowStartIndex,
    1,
  );

  console.log(
    "COMBINED_KEYWORD_PARTIAL=PASS",
  );

  const second =
    await runGoogleAdsAllDataSearchStagingOrchestrator(
      {
        job:
          createJob(
            1,
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
    second.phaseRun,
    "keyword",
  );

  assert.equal(
    second.nextPhase,
    "search_ad",
  );

  assert.equal(
    second.nextRowIndex,
    2,
  );

  assert.equal(
    second.isComplete,
    false,
  );

  assert.ok(
    second.checkpoint.cursor,
  );

  assert.equal(
    second.checkpoint.cursor
      .phase,
    "search_ad",
  );

  assert.equal(
    second.checkpoint.cursor
      .phaseCursor,
    null,
  );

  assert.equal(
    second.checkpoint.cursor
      .expectedRowStartIndex,
    2,
  );

  assert.equal(
    keywordCalls,
    2,
  );

  assert.equal(
    searchAdCalls,
    0,
  );

  console.log(
    "COMBINED_KEYWORD_COMPLETION_TRANSITIONS_ONLY=PASS",
  );

  console.log(
    "COMBINED_KEYWORD_COMPLETION_DOES_NOT_CALL_SEARCH_AD=PASS",
  );

  const searchAdCallsBeforeStale =
    searchAdCalls;

  await assert.rejects(
    () =>
      runGoogleAdsAllDataSearchStagingOrchestrator(
        {
          job:
            createJob(
              1,
            ),

          accessToken:
            "fixture-access-token",

          developerToken:
            "fixture-developer-token",

          dateWindowIndex:
            0,

          cursor:
            second.checkpoint.cursor,
        },
        dependencies,
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataSearchStagingOrchestratorError &&
      error.code ===
        "INVALID_CURSOR",
  );

  assert.equal(
    searchAdCalls,
    searchAdCallsBeforeStale,
  );

  console.log(
    "COMBINED_PHASE_BOUNDARY_STALE_FAILS_BEFORE_API=PASS",
  );

  const third =
    await runGoogleAdsAllDataSearchStagingOrchestrator(
      {
        job:
          createJob(
            2,
          ),

        accessToken:
          "fixture-access-token",

        developerToken:
          "fixture-developer-token",

        dateWindowIndex:
          0,

        cursor:
          second.checkpoint.cursor,
      },
      dependencies,
    );

  assert.equal(
    third.phaseRun,
    "search_ad",
  );

  assert.equal(
    third.nextPhase,
    "search_ad",
  );

  assert.equal(
    third.nextRowIndex,
    3,
  );

  assert.equal(
    third.isComplete,
    false,
  );

  assert.equal(
    keywordCalls,
    2,
  );

  assert.equal(
    searchAdCalls,
    1,
  );

  assert.ok(
    third.checkpoint.cursor,
  );

  assert.equal(
    third.checkpoint.cursor
      .expectedRowStartIndex,
    3,
  );

  console.log(
    "COMBINED_SEARCH_AD_PARTIAL=PASS",
  );

  const fourth =
    await runGoogleAdsAllDataSearchStagingOrchestrator(
      {
        job:
          createJob(
            3,
          ),

        accessToken:
          "fixture-access-token",

        developerToken:
          "fixture-developer-token",

        dateWindowIndex:
          0,

        cursor:
          third.checkpoint.cursor,
      },
      dependencies,
    );

  assert.equal(
    fourth.phaseRun,
    "search_ad",
  );

  assert.equal(
    fourth.nextPhase,
    null,
  );

  assert.equal(
    fourth.nextRowIndex,
    4,
  );

  assert.equal(
    fourth.status,
    "completed",
  );

  assert.equal(
    fourth.isComplete,
    true,
  );

  assert.equal(
    fourth.checkpoint.cursor,
    null,
  );

  assert.equal(
    keywordCalls,
    2,
  );

  assert.equal(
    searchAdCalls,
    2,
  );

  assert.deepEqual(
    keywordInputCursors,
    [
      undefined,
      keywordCursor(
        1,
        "keyword-page-2",
      ),
    ],
  );

  assert.deepEqual(
    searchAdInputCursors,
    [
      null,
      searchAdCursor(
        3,
        1,
        "search-ad-page-2",
      ),
    ],
  );

  console.log(
    "COMBINED_SEARCH_AD_COMPLETE=PASS",
  );

  console.log(
    "COMBINED_GLOBAL_ROW_INDEX_0_TO_3_CONTIGUOUS=PASS",
  );

  console.log(
    "COMBINED_EXACT_NESTED_CURSOR_RESUME=PASS",
  );

  console.log(
    "COMBINED_ONE_STAGE_PAGE_PER_INVOCATION=PASS",
  );

  const callsBeforeLegacy =
    keywordCalls +
    searchAdCalls;

  await assert.rejects(
    () =>
      runGoogleAdsAllDataSearchStagingOrchestrator(
        {
          job:
            createJob(
              4,
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
        GoogleAdsAllDataSearchStagingOrchestratorError &&
      error.code ===
        "INVALID_JOB",
  );

  assert.equal(
    keywordCalls +
    searchAdCalls,
    callsBeforeLegacy,
  );

  console.log(
    "COMBINED_LEGACY_JOB_FAILS_BEFORE_STAGE=PASS",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_SEARCH_STAGING_ORCHESTRATOR_FIXTURE=PASS",
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

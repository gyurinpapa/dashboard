import assert from "node:assert/strict";
import fs from "node:fs";

import {
  GoogleAdsAllDataProcessingCheckpointRepositoryError,
  saveGoogleAdsAllDataProcessingCheckpoint,
  type GoogleAdsAllDataCheckpointJobRecord,
  type GoogleAdsAllDataProcessingCheckpointDependencies,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint-repository";
import type {
  GoogleAdsAllDataSearchStagingCursor,
  GoogleAdsAllDataSearchStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-all-data-search-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE =
  "2026-05-01";

const ACCOUNT_ID =
  "1234567890";

const RPC_NAME =
  "save_google_ads_all_data_processing_checkpoint";

function createJob(
  insertedRows:
    number,
  executionContract:
    unknown =
      "google_all_data_v1",
): GoogleAdsAllDataCheckpointJobRecord {
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
      "2026-08-28T00:00:00.000Z",

    started_at:
      "2026-08-28T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-28T00:00:01.000Z",

    execution_contract:
      executionContract,
  } as unknown as
    GoogleAdsAllDataCheckpointJobRecord;
}

function keywordNestedCursor(
  expectedPage:
    number,
): Record<string, unknown> {
  return {
    version:
      1,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    page: {
      version:
        1,

      pageIndex:
        expectedPage,

      page:
        `keyword-page-${expectedPage + 1}`,
    },
  };
}

function outerCursor(
  input: Readonly<{
    phase:
      "keyword" |
      "search_ad";

    nextRowIndex:
      number;

    phaseCursor:
      unknown;
  }>,
): GoogleAdsAllDataSearchStagingCursor {
  return {
    version:
      1,

    phase:
      input.phase,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      input.nextRowIndex,

    phaseCursor:
      input.phaseCursor,
  } as GoogleAdsAllDataSearchStagingCursor;
}

function createResult(
  input: Readonly<{
    rowStartIndex:
      number;

    runRows:
      number;

    phaseRun:
      "keyword" |
      "search_ad";

    nextPhase:
      "keyword" |
      "search_ad" |
      null;

    cursor:
      GoogleAdsAllDataSearchStagingCursor |
      null;

    complete:
      boolean;
  }>,
): GoogleAdsAllDataSearchStagingOrchestratorResult {
  const nextRowIndex =
    input.rowStartIndex +
    input.runRows;

  return {
    jobId:
      "11111111-1111-4111-8111-111111111111",

    dateWindowIndex:
      0,

    phaseRun:
      input.phaseRun,

    nextPhase:
      input.nextPhase,

    rowStartIndex:
      input.rowStartIndex,

    nextRowIndex,

    runCanonicalRowCount:
      input.runRows,

    status:
      input.complete
        ? "completed"
        : "partial",

    isComplete:
      input.complete,

    apiPageExecutionCount:
      1,

    stageResult:
      {} as never,

    checkpoint: {
      version:
        1,

      phaseRun:
        input.phaseRun,

      nextPhase:
        input.nextPhase,

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
  };
}

function buildReturnedJob(
  job:
    GoogleAdsAllDataCheckpointJobRecord,
  payload:
    Record<string, unknown>,
): GoogleAdsAllDataCheckpointJobRecord {
  const collector =
    payload.collector as
      Record<string, unknown>;

  return {
    ...job,

    raw_rows:
      payload.raw_rows as number,

    normalized_rows:
      payload.normalized_rows as number,

    inserted_rows:
      payload.inserted_rows as number,

    failed_rows:
      0,

    error:
      null,

    error_detail: {
      processing_checkpoint: {
        version:
          1,

        saved_at:
          "2026-08-28T00:01:00.000Z",

        execution_contract:
          "google_all_data_v1",

        date_window_index:
          collector.date_window_index,

        next_row_index:
          collector.next_row_index,

        raw_rows:
          payload.raw_rows,

        normalized_rows:
          payload.normalized_rows,

        inserted_rows:
          payload.inserted_rows,

        failed_rows:
          0,

        complete:
          collector.complete,

        collector: {
          google_version:
            1,

          all_data_version:
            1,

          phase:
            collector.phase,

          date_window_index:
            collector.date_window_index,

          next_row_index:
            collector.next_row_index,

          complete:
            collector.complete,

          cursor:
            collector.cursor,
        },
      },
    },
  } as GoogleAdsAllDataCheckpointJobRecord;
}

function dependenciesFor(
  job:
    GoogleAdsAllDataCheckpointJobRecord,
  captured: {
    calls: number;
    functionName:
      string | null;
    payload:
      Record<string, unknown> |
      null;
  },
): GoogleAdsAllDataProcessingCheckpointDependencies {
  return {
    invokeRpc:
      async (
        functionName,
        args,
      ) => {
        captured.calls +=
          1;

        captured.functionName =
          functionName;

        captured.payload =
          args.p_payload;

        return {
          data: [
            buildReturnedJob(
              job,
              args.p_payload,
            ),
          ],

          error:
            null,
        };
      },

    parseJob:
      async (
        value,
      ) =>
        value as
          GoogleAdsAllDataCheckpointJobRecord,
  };
}

async function main():
  Promise<void> {

  const demandGenJob =
    createJob(
      0,
    );

  const demandGenNestedCursor = {
    version:
      1,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      1,

    page: {
      version:
        1,

      pageIndex:
        1,

      page:
        "demand-gen-page-2",
    },
  };

  const demandGenOuterCursor = {
    version:
      1,

    phase:
      "demand_gen_ad",

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      1,

    phaseCursor:
      demandGenNestedCursor,
  };

  const demandGenResult = {
    jobId:
      "11111111-1111-4111-8111-111111111111",

    dateWindowIndex:
      0,

    phaseRun:
      "demand_gen_ad",

    nextPhase:
      "demand_gen_ad",

    rowStartIndex:
      0,

    nextRowIndex:
      1,

    runCanonicalRowCount:
      1,

    status:
      "partial",

    isComplete:
      false,

    apiPageExecutionCount:
      1,

    stageResult: {},

    checkpoint: {
      version:
        1,

      phaseRun:
        "demand_gen_ad",

      nextPhase:
        "demand_gen_ad",

      nextRowIndex:
        1,

      totalRows:
        1,

      failedRows:
        0,

      complete:
        false,

      cursor:
        demandGenOuterCursor,
    },
  };

  const demandGenCaptured = {
    calls:
      0,

    functionName:
      null as string | null,

    payload:
      null as
        Record<string, unknown> |
        null,
  };

  await saveGoogleAdsAllDataProcessingCheckpoint(
    {
      job:
        demandGenJob,

      result:
        demandGenResult as never,
    },
    dependenciesFor(
      demandGenJob,
      demandGenCaptured,
    ),
  );

  assert.equal(
    demandGenCaptured.calls,
    1,
  );

  assert.equal(
    demandGenCaptured.functionName,
    RPC_NAME,
  );

  assert.ok(
    demandGenCaptured.payload,
  );

  const demandGenCollector =
    demandGenCaptured.payload
      .collector as
        Record<string, unknown>;

  assert.equal(
    demandGenCollector.phase,
    "demand_gen_ad",
  );

  assert.equal(
    demandGenCollector.next_row_index,
    1,
  );

  assert.deepEqual(
    demandGenCollector.cursor,
    demandGenOuterCursor,
  );

  console.log(
    "ALL_DATA_SAVER_DEMAND_GEN_PARTIAL=PASS",
  );

  console.log(
    "ALL_DATA_SAVER_DEMAND_GEN_RPC_NAME=PASS",
  );

  console.log(
    "ALL_DATA_SAVER_DEMAND_GEN_CURSOR_PRESERVED=PASS",
  );


  const firstJob =
    createJob(
      0,
    );

  const firstCursor =
    outerCursor({
      phase:
        "keyword",

      nextRowIndex:
        1,

      phaseCursor:
        keywordNestedCursor(
          1,
        ),
    });

  const firstResult =
    createResult({
      rowStartIndex:
        0,

      runRows:
        1,

      phaseRun:
        "keyword",

      nextPhase:
        "keyword",

      cursor:
        firstCursor,

      complete:
        false,
    });

  const firstCaptured = {
    calls:
      0,

    functionName:
      null as string | null,

    payload:
      null as
        Record<string, unknown> |
        null,
  };

  const firstSaved =
    await saveGoogleAdsAllDataProcessingCheckpoint(
      {
        job:
          firstJob,

        result:
          firstResult,
      },
      dependenciesFor(
        firstJob,
        firstCaptured,
      ),
    );

  assert.equal(
    firstCaptured.calls,
    1,
  );

  assert.equal(
    firstCaptured.functionName,
    RPC_NAME,
  );

  assert.ok(
    firstCaptured.payload,
  );

  const firstPayload =
    firstCaptured.payload;

  assert.equal(
    firstPayload.execution_contract,
    "google_all_data_v1",
  );

  assert.equal(
    firstPayload.raw_rows,
    1,
  );

  assert.equal(
    firstPayload.normalized_rows,
    1,
  );

  assert.equal(
    firstPayload.inserted_rows,
    1,
  );

  const firstCollector =
    firstPayload.collector as
      Record<string, unknown>;

  assert.equal(
    firstCollector.phase,
    "keyword",
  );

  assert.equal(
    firstCollector.next_row_index,
    1,
  );

  assert.deepEqual(
    firstCollector.cursor,
    firstCursor,
  );

  assert.equal(
    firstSaved.inserted_rows,
    1,
  );

  console.log(
    "ALL_DATA_SAVER_KEYWORD_PARTIAL=PASS",
  );

  console.log(
    "ALL_DATA_SAVER_RPC_NAME=PASS",
  );

  console.log(
    "ALL_DATA_SAVER_ATOMIC_COUNT_PAYLOAD=PASS",
  );

  const transitionJob =
    buildReturnedJob(
      firstJob,
      firstPayload,
    );

  const transitionCursor =
    outerCursor({
      phase:
        "search_ad",

      nextRowIndex:
        1,

      phaseCursor:
        null,
    });

  const transitionResult =
    createResult({
      rowStartIndex:
        1,

      runRows:
        0,

      phaseRun:
        "keyword",

      nextPhase:
        "search_ad",

      cursor:
        transitionCursor,

      complete:
        false,
    });

  const transitionCaptured = {
    calls:
      0,

    functionName:
      null as string | null,

    payload:
      null as
        Record<string, unknown> |
        null,
  };

  await saveGoogleAdsAllDataProcessingCheckpoint(
    {
      job:
        transitionJob,

      result:
        transitionResult,
    },
    dependenciesFor(
      transitionJob,
      transitionCaptured,
    ),
  );

  assert.ok(
    transitionCaptured.payload,
  );

  const transitionCollector =
    transitionCaptured.payload
      .collector as
        Record<string, unknown>;

  assert.equal(
    transitionCaptured.payload
      .inserted_rows,
    1,
  );

  assert.equal(
    transitionCollector.phase,
    "search_ad",
  );

  assert.equal(
    transitionCollector.next_row_index,
    1,
  );

  assert.deepEqual(
    transitionCollector.cursor,
    transitionCursor,
  );

  console.log(
    "ALL_DATA_SAVER_ZERO_ROW_PHASE_ADVANCE=PASS",
  );

  const completeJob =
    buildReturnedJob(
      transitionJob,
      transitionCaptured.payload,
    );

  const completeResult =
    createResult({
      rowStartIndex:
        1,

      runRows:
        1,

      phaseRun:
        "search_ad",

      nextPhase:
        null,

      cursor:
        null,

      complete:
        true,
    });

  const completeCaptured = {
    calls:
      0,

    functionName:
      null as string | null,

    payload:
      null as
        Record<string, unknown> |
        null,
  };

  const completeSaved =
    await saveGoogleAdsAllDataProcessingCheckpoint(
      {
        job:
          completeJob,

        result:
          completeResult,
      },
      dependenciesFor(
        completeJob,
        completeCaptured,
      ),
    );

  assert.ok(
    completeCaptured.payload,
  );

  const completeCollector =
    completeCaptured.payload
      .collector as
        Record<string, unknown>;

  assert.equal(
    completeCollector.phase,
    "completed",
  );

  assert.equal(
    completeCollector.complete,
    true,
  );

  assert.equal(
    completeCollector.cursor,
    null,
  );

  assert.equal(
    completeSaved.inserted_rows,
    2,
  );

  console.log(
    "ALL_DATA_SAVER_COMPLETED_PHASE=PASS",
  );

  const invalidCalls = {
    calls:
      0,

    functionName:
      null as string | null,

    payload:
      null as
        Record<string, unknown> |
        null,
  };

  await assert.rejects(
    () =>
      saveGoogleAdsAllDataProcessingCheckpoint(
        {
          job:
            createJob(
              5,
            ),

          result:
            createResult({
              rowStartIndex:
                4,

              runRows:
                1,

              phaseRun:
                "search_ad",

              nextPhase:
                "search_ad",

              cursor:
                outerCursor({
                  phase:
                    "search_ad",

                  nextRowIndex:
                    5,

                  phaseCursor:
                    null,
                }),

              complete:
                false,
            }),
        },
        dependenciesFor(
          createJob(
            5,
          ),
          invalidCalls,
        ),
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataProcessingCheckpointRepositoryError &&
      error.code ===
        "SCOPE_MISMATCH",
  );

  assert.equal(
    invalidCalls.calls,
    0,
  );

  console.log(
    "ALL_DATA_SAVER_STALE_ROW_BOUNDARY_FAILS_BEFORE_RPC=PASS",
  );

  const legacyCalls = {
    calls:
      0,

    functionName:
      null as string | null,

    payload:
      null as
        Record<string, unknown> |
        null,
  };

  const legacyJob =
    createJob(
      0,
      null,
    ) as unknown as
      MediaSyncJobRecord;

  await assert.rejects(
    () =>
      saveGoogleAdsAllDataProcessingCheckpoint(
        {
          job:
            legacyJob,

          result:
            firstResult,
        },
        {
          invokeRpc:
            async () => {
              legacyCalls.calls +=
                1;

              return {
                data:
                  null,

                error:
                  null,
              };
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataProcessingCheckpointRepositoryError &&
      error.code ===
        "INVALID_JOB",
  );

  assert.equal(
    legacyCalls.calls,
    0,
  );

  console.log(
    "ALL_DATA_SAVER_LEGACY_JOB_FAILS_BEFORE_RPC=PASS",
  );

  const sql =
    fs.readFileSync(
      "scripts/sql/create-save-google-ads-all-data-processing-checkpoint.sql",
      "utf8",
    );

  assert.match(
    sql,
    /create or replace function public\.save_google_ads_all_data_processing_checkpoint/,
  );

  assert.match(
    sql,
    /for update;/i,
  );

  assert.match(
    sql,
    /google_all_data_v1/,
  );

  assert.match(
    sql,
    /all_data_version/,
  );

  assert.match(
    sql,
    /v_phase_rank/,
  );

  assert.match(
    sql,
    /MSC_CHECKPOINT_REGRESSION/,
  );

  assert.match(
    sql,
    /MSC_CHECKPOINT_CONFLICT/,
  );

  assert.match(
    sql,
    /jsonb_set\(/,
  );

  assert.match(
    sql,
    /'\{processing_checkpoint\}'/,
  );

  assert.match(
    sql,
    /and execution_contract\s*=\s*'google_all_data_v1'/,
  );

  assert.match(
    sql,
    /grant execute[\s\S]*to service_role;/i,
  );

  assert.doesNotMatch(
    sql,
    /\balter\s+table\b/i,
  );

  assert.doesNotMatch(
    sql,
    /\bdrop\s+(table|function)\b/i,
  );

  assert.doesNotMatch(
    sql,
    /create or replace function public\.save_google_ads_keyword_processing_checkpoint/,
  );

  assert.doesNotMatch(
    sql,
    /create or replace function public\.save_naver_searchads_combined_processing_checkpoint/,
  );


  assert.match(
    sql,
    /'demand_gen_ad'/,
  );

  assert.equal(
    (
      sql.match(
        /when 'demand_gen_ad' then 1/g,
      ) ??
      []
    ).length,
    2,
  );

  assert.doesNotMatch(
    sql,
    /when 'demand_gen_ad' then 3/,
  );

  assert.match(
    sql,
    /elsif v_phase = 'demand_gen_ad' then[\s\S]*?jsonb_typeof\([\s\S]*?v_phase_cursor/,
  );

  console.log(
    "ALL_DATA_SQL_DEMAND_GEN_PHASE_PRESENT=PASS",
  );

  console.log(
    "ALL_DATA_SQL_DEMAND_GEN_PRODUCT_LOCAL_RANK=PASS",
  );

  console.log(
    "ALL_DATA_SQL_DEMAND_GEN_GLOBAL_SEARCH_CHAIN_RANK=NONE_PASS",
  );

  console.log(
    "ALL_DATA_SQL_DEMAND_GEN_CURSOR_OBJECT_CONTRACT=PASS",
  );

  console.log(
    "ALL_DATA_SQL_NEW_RPC_ONLY=PASS",
  );

  console.log(
    "ALL_DATA_SQL_ROW_LOCK=PASS",
  );

  console.log(
    "ALL_DATA_SQL_PHASE_REGRESSION_GUARD=PASS",
  );

  console.log(
    "ALL_DATA_SQL_ATOMIC_CHECKPOINT_UPDATE=PASS",
  );

  console.log(
    "ALL_DATA_SQL_SERVICE_ROLE_ONLY=PASS",
  );

  console.log(
    "ALL_DATA_SQL_SCHEMA_CHANGE=NO",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_PROCESSING_CHECKPOINT_REPOSITORY_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "GOOGLE_API_CALLS=0",
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

import assert from "node:assert/strict";

import {
  runGoogleAdsAllDataProcessingOrchestrator,
  type GoogleAdsAllDataProcessingOrchestratorInput,
} from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";
import type {
  GoogleAdsAllDataCheckpointJobRecord,
  GoogleAdsAllDataProcessingCheckpointDependencies,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint-repository";
import type {
  GoogleAdsAllDataSearchStagingCursor,
  GoogleAdsAllDataSearchStagingOrchestratorDependencies,
  GoogleAdsAllDataSearchStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-all-data-search-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE =
  "2026-05-01";

const ACCOUNT_ID =
  "1234567890";

function createJob(
  insertedRows:
    number,
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
      "2026-08-28T00:00:00.000Z",

    started_at:
      "2026-08-28T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-28T00:00:01.000Z",

    execution_contract:
      "google_all_data_v1",
  } as unknown as
    MediaSyncJobRecord;
}

function createCursor(
  nextRowIndex:
    number,
): GoogleAdsAllDataSearchStagingCursor {
  return {
    version:
      1,

    phase:
      "keyword",

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      nextRowIndex,

    phaseCursor: {
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
          1,

        page:
          "keyword-page-2",
      },
    },
  } as GoogleAdsAllDataSearchStagingCursor;
}

function createStagingResult(
  input: Readonly<{
    rowStartIndex:
      number;

    runRows:
      number;
  }>,
): GoogleAdsAllDataSearchStagingOrchestratorResult {
  const nextRowIndex =
    input.rowStartIndex +
    input.runRows;

  const cursor =
    createCursor(
      nextRowIndex,
    );

  return {
    jobId:
      "11111111-1111-4111-8111-111111111111",

    dateWindowIndex:
      0,

    phaseRun:
      "keyword",

    nextPhase:
      "keyword",

    rowStartIndex:
      input.rowStartIndex,

    nextRowIndex,

    runCanonicalRowCount:
      input.runRows,

    status:
      "partial",

    isComplete:
      false,

    apiPageExecutionCount:
      1,

    stageResult:
      {} as never,

    checkpoint: {
      version:
        1,

      phaseRun:
        "keyword",

      nextPhase:
        "keyword",

      nextRowIndex,

      totalRows:
        nextRowIndex,

      failedRows:
        0,

      complete:
        false,

      cursor,
    },
  };
}

function createSavedJob(
  job:
    MediaSyncJobRecord,
  nextRowIndex:
    number,
): GoogleAdsAllDataCheckpointJobRecord {
  return {
    ...job,

    raw_rows:
      nextRowIndex,

    normalized_rows:
      nextRowIndex,

    inserted_rows:
      nextRowIndex,

    failed_rows:
      0,

    execution_contract:
      "google_all_data_v1",
  } as unknown as
    GoogleAdsAllDataCheckpointJobRecord;
}


async function verifyDemandGenDispatch():
  Promise<void> {
  const input:
    GoogleAdsAllDataProcessingOrchestratorInput = {
      job:
        createJob(
          0,
        ),

      accessToken:
        "fixture-access-token",

      developerToken:
        "fixture-developer-token",

      loginCustomerId:
        null,

      dateWindowIndex:
        0,

      cursor:
        undefined,

      routing: {
        route: [
          "search",
          "demand_gen",
        ],

        productIndex:
          1,

        productFamily:
          "demand_gen",

        complete:
          false,
      } as NonNullable<
        GoogleAdsAllDataProcessingOrchestratorInput[
          "routing"
        ]
      >,
    };

  const rawCursor = {
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

    expectedRowStartIndex:
      1,

    page: {
      version:
        1 as const,

      pageIndex:
        1,

      page:
        "demand-gen-page-2",
    },
  };

  const rawDemandGenResult = {
    jobId:
      "11111111-1111-4111-8111-111111111111",

    dateWindowIndex:
      0,

    rowStartIndex:
      0,

    nextRowIndex:
      1,

    runCanonicalRowCount:
      1,

    status:
      "partial" as const,

    isComplete:
      false,

    collector: {
      pageCount:
        1,
    },

    append: {},

    checkpoint: {
      version:
        1 as const,

      dateWindowIndex:
        0,

      nextRowIndex:
        1,

      totalRows:
        1,

      failedRows:
        0,

      complete:
        false,

      cursor:
        rawCursor,
    },
  };

  const savedJob =
    createSavedJob(
      input.job,
      1,
    );

  let searchCalls =
    0;

  let demandGenCalls =
    0;

  let saveCalls =
    0;

  const result =
    await runGoogleAdsAllDataProcessingOrchestrator(
      input,
      {
        runStaging:
          async () => {
            searchCalls +=
              1;

            throw new Error(
              "SEARCH_MUST_NOT_RUN_FOR_DEMAND_GEN",
            );
          },

        runDemandGenStaging:
          async receivedInput => {
            demandGenCalls +=
              1;

            assert.equal(
              receivedInput.dateWindowIndex,
              0,
            );

            assert.equal(
              receivedInput.cursor,
              undefined,
            );

            return rawDemandGenResult as never;
          },

        saveCheckpoint:
          async saveInput => {
            saveCalls +=
              1;

            assert.equal(
              saveInput.result.phaseRun,
              "demand_gen_ad",
            );

            assert.equal(
              saveInput.result.nextPhase,
              "demand_gen_ad",
            );

            assert.equal(
              saveInput.result.apiPageExecutionCount,
              1,
            );

            assert.strictEqual(
              saveInput.result.stageResult,
              rawDemandGenResult,
            );

            assert.equal(
              saveInput.result.checkpoint.cursor
                ?.phase,
              "demand_gen_ad",
            );

            assert.strictEqual(
              saveInput.result.checkpoint.cursor
                ?.phaseCursor,
              rawCursor,
            );

            assert.equal(
              saveInput.routing?.productFamily,
              "demand_gen",
            );

            assert.equal(
              saveInput.routing?.productIndex,
              1,
            );

            return savedJob;
          },
      },
    );

  assert.equal(
    searchCalls,
    0,
  );

  assert.equal(
    demandGenCalls,
    1,
  );

  assert.equal(
    saveCalls,
    1,
  );

  assert.equal(
    result.staging.phaseRun,
    "demand_gen_ad",
  );

  assert.strictEqual(
    result.staging.stageResult,
    rawDemandGenResult,
  );

  console.log(
    "ALL_DATA_PROCESSING_DEMAND_GEN_DISPATCH=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_DEMAND_GEN_SEARCH_CALLS=0",
  );

  console.log(
    "ALL_DATA_PROCESSING_DEMAND_GEN_RUNNER_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_DEMAND_GEN_COMMON_ENVELOPE=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_DEMAND_GEN_OUTER_CURSOR=PASS",
  );
}

async function main():
  Promise<void> {
  await verifyDemandGenDispatch();

  const input:
    GoogleAdsAllDataProcessingOrchestratorInput = {
      job:
        createJob(
          0,
        ),

      accessToken:
        "fixture-access-token",

      developerToken:
        "fixture-developer-token",

      loginCustomerId:
        null,

      dateWindowIndex:
        0,

      cursor:
        undefined,
    };

  const stagingResult =
    createStagingResult({
      rowStartIndex:
        0,

      runRows:
        1,
    });

  const savedJob =
    createSavedJob(
      input.job,
      1,
    );

  const stagingDependencies:
    GoogleAdsAllDataSearchStagingOrchestratorDependencies = {};

  const checkpointDependencies:
    GoogleAdsAllDataProcessingCheckpointDependencies = {};

  const order:
    string[] = [];

  let stageCalls =
    0;

  let saveCalls =
    0;

  const result =
    await runGoogleAdsAllDataProcessingOrchestrator(
      input,
      {
        runStaging:
          async (
            receivedInput,
            receivedDependencies,
          ) => {
            stageCalls +=
              1;

            order.push(
              "stage",
            );

            assert.strictEqual(
              receivedInput,
              input,
            );

            assert.strictEqual(
              receivedDependencies,
              stagingDependencies,
            );

            return stagingResult;
          },

        saveCheckpoint:
          async (
            saveInput,
            receivedDependencies,
          ) => {
            saveCalls +=
              1;

            order.push(
              "save",
            );

            assert.strictEqual(
              saveInput.job,
              input.job,
            );

            assert.strictEqual(
              saveInput.result,
              stagingResult,
            );

            assert.strictEqual(
              receivedDependencies,
              checkpointDependencies,
            );

            return savedJob;
          },

        stagingDependencies,

        checkpointDependencies,
      },
    );

  assert.equal(
    stageCalls,
    1,
  );

  assert.equal(
    saveCalls,
    1,
  );

  assert.deepEqual(
    order,
    [
      "stage",
      "save",
    ],
  );

  assert.strictEqual(
    result.staging,
    stagingResult,
  );

  assert.strictEqual(
    result.job,
    savedJob,
  );

  console.log(
    "ALL_DATA_PROCESSING_STAGE_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_SAVE_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_STAGE_BEFORE_SAVE=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_EXACT_STAGING_RESULT_SAVED=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_FRESH_SAVED_JOB_RETURNED=PASS",
  );

  const saveFailure =
    new Error(
      "fixture-save-failure",
    );

  let saveFailureStageCalls =
    0;

  let saveFailureSaveCalls =
    0;

  await assert.rejects(
    () =>
      runGoogleAdsAllDataProcessingOrchestrator(
        input,
        {
          runStaging:
            async () => {
              saveFailureStageCalls +=
                1;

              return stagingResult;
            },

          saveCheckpoint:
            async () => {
              saveFailureSaveCalls +=
                1;

              throw saveFailure;
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error ===
        saveFailure,
  );

  assert.equal(
    saveFailureStageCalls,
    1,
  );

  assert.equal(
    saveFailureSaveCalls,
    1,
  );

  console.log(
    "ALL_DATA_PROCESSING_SAVE_FAILURE_PROPAGATES=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_SAVE_FAILURE_NO_SECOND_STAGE=PASS",
  );

  const stagingFailure =
    new Error(
      "fixture-staging-failure",
    );

  let stagingFailureStageCalls =
    0;

  let stagingFailureSaveCalls =
    0;

  await assert.rejects(
    () =>
      runGoogleAdsAllDataProcessingOrchestrator(
        input,
        {
          runStaging:
            async () => {
              stagingFailureStageCalls +=
                1;

              throw stagingFailure;
            },

          saveCheckpoint:
            async () => {
              stagingFailureSaveCalls +=
                1;

              return savedJob;
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error ===
        stagingFailure,
  );

  assert.equal(
    stagingFailureStageCalls,
    1,
  );

  assert.equal(
    stagingFailureSaveCalls,
    0,
  );

  console.log(
    "ALL_DATA_PROCESSING_STAGE_FAILURE_PROPAGATES=PASS",
  );

  console.log(
    "ALL_DATA_PROCESSING_STAGE_FAILURE_SKIPS_SAVE=PASS",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_PROCESSING_ORCHESTRATOR_FIXTURE=PASS",
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

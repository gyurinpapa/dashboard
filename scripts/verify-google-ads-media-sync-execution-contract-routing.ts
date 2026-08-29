import assert from "node:assert/strict";

import {
  GoogleAdsMediaSyncWorkerOrchestrationError,
  processNextGoogleAdsMediaSyncJob,
} from "../src/lib/media-sync/google-ads-media-sync-worker-orchestration-repository";

import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const BASE_JOB: MediaSyncJobRecord = {
  id:
    "11111111-1111-4111-8111-111111111111",

  workspace_id:
    "22222222-2222-4222-8222-222222222222",

  advertiser_id:
    "33333333-3333-4333-8333-333333333333",

  report_id:
    "44444444-4444-4444-8444-444444444444",

  connection_id:
    "55555555-5555-4555-8555-555555555555",

  provider:
    "google_ads",

  external_account_id:
    "1234567890",

  date_from:
    "2026-05-01",

  date_to:
    "2026-05-02",

  data_level:
    "keyword",

  mode:
    "snapshot_replace",

  status:
    "processing",

  progress:
    0,

  raw_rows:
    0,

  normalized_rows:
    0,

  inserted_rows:
    0,

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
    "2026-05-03T00:00:00.000Z",

  started_at:
    "2026-05-03T00:00:01.000Z",

  finished_at:
    null,

  updated_at:
    "2026-05-03T00:00:01.000Z",
};

const ALL_DATA_JOB = {
  ...BASE_JOB,

  execution_contract:
    "google_all_data_v1" as const,
};

async function expectOrchestrationError(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsMediaSyncWorkerOrchestrationError,
    );

    assert.equal(
      error.code,
      code,
    );

    return;
  }

  assert.fail(
    `Expected orchestration error ${code}`,
  );
}

async function main(): Promise<void> {
  let allDataCalls =
    0;

  let legacyCheckpointCalls =
    0;

  let legacyProcessingCalls =
    0;

  let markFailedCalls =
    0;

  const syntheticAllDataResult = {
    synthetic:
      "google-all-data-routing",
  } as never;

  const routed =
    await processNextGoogleAdsMediaSyncJob({
      dependencies: {
        claimNext:
          async () =>
            ALL_DATA_JOB,

        processAllDataClaimed:
          async input => {
            allDataCalls +=
              1;

            assert.equal(
              input.job.id,
              BASE_JOB.id,
            );

            assert.equal(
              input.executionContract,
              "google_all_data_v1",
            );

            return syntheticAllDataResult;
          },

        readCheckpoint:
          () => {
            legacyCheckpointCalls +=
              1;

            throw new Error(
              "ALL_DATA_MUST_NOT_READ_LEGACY_CHECKPOINT",
            );
          },

        processClaimed:
          async () => {
            legacyProcessingCalls +=
              1;

            throw new Error(
              "ALL_DATA_MUST_NOT_ENTER_KEYWORD_PROCESSING",
            );
          },

        markFailed:
          async () => {
            markFailedCalls +=
              1;
          },
      },
    });

  assert.equal(
    routed,
    syntheticAllDataResult,
  );

  assert.equal(
    allDataCalls,
    1,
  );

  assert.equal(
    legacyCheckpointCalls,
    0,
  );

  assert.equal(
    legacyProcessingCalls,
    0,
  );

  assert.equal(
    markFailedCalls,
    0,
  );

  console.log(
    "ALL_DATA_OUTER_HANDLER_ROUTED=PASS",
  );

  console.log(
    "ALL_DATA_LEGACY_CHECKPOINT_BYPASS=PASS",
  );

  console.log(
    "ALL_DATA_KEYWORD_PROCESSOR_BYPASS=PASS",
  );

  let legacyAllDataCalls =
    0;

  let legacyReadCheckpointCalls =
    0;

  let legacyMarkFailedCalls =
    0;

  await expectOrchestrationError(
    () =>
      processNextGoogleAdsMediaSyncJob({
        dependencies: {
          claimNext:
            async () =>
              BASE_JOB,

          processAllDataClaimed:
            async () => {
              legacyAllDataCalls +=
                1;

              return syntheticAllDataResult;
            },

          readCheckpoint:
            () => {
              legacyReadCheckpointCalls +=
                1;

              throw new Error(
                "LEGACY_CHECKPOINT_BOUNDARY_SENTINEL",
              );
            },

          markFailed:
            async () => {
              legacyMarkFailedCalls +=
                1;
            },
        },
      }),

    "INVALID_CHECKPOINT",
  );

  assert.equal(
    legacyAllDataCalls,
    0,
  );

  assert.equal(
    legacyReadCheckpointCalls,
    1,
  );

  assert.equal(
    legacyMarkFailedCalls,
    1,
  );

  console.log(
    "LEGACY_MISSING_CONTRACT_SKIPS_ALL_DATA_HANDLER=PASS",
  );

  console.log(
    "LEGACY_MISSING_CONTRACT_ENTERS_EXISTING_CHECKPOINT_PATH=PASS",
  );

  let unavailableLegacyCheckpointCalls =
    0;

  let unavailableMarkFailedCalls =
    0;

  await expectOrchestrationError(
    () =>
      processNextGoogleAdsMediaSyncJob({
        dependencies: {
          claimNext:
            async () =>
              ALL_DATA_JOB,

          readCheckpoint:
            () => {
              unavailableLegacyCheckpointCalls +=
                1;

              throw new Error(
                "UNAVAILABLE_ALL_DATA_MUST_NOT_ENTER_LEGACY",
              );
            },

          markFailed:
            async () => {
              unavailableMarkFailedCalls +=
                1;
            },
        },
      }),

    "PROCESSING_FAILED",
  );

  assert.equal(
    unavailableLegacyCheckpointCalls,
    0,
  );

  assert.equal(
    unavailableMarkFailedCalls,
    1,
  );

  console.log(
    "ALL_DATA_WITHOUT_HANDLER_FAILS_CLOSED=PASS",
  );

  console.log(
    "ALL_DATA_FAIL_CLOSED_BEFORE_LEGACY_CHECKPOINT=PASS",
  );

  console.log(
    "GOOGLE_ADS_EXECUTION_CONTRACT_ROUTING_FIXTURE=PASS",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );
}

void main();

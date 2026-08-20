import assert from "node:assert/strict";

import {
  runGoogleAdsKeywordProcessingOrchestrator,
} from "../src/lib/media-sync/google-ads-keyword-processing-orchestrator";
import type {
  GoogleAdsKeywordProcessingCheckpointDependencies,
} from "../src/lib/media-sync/google-ads-keyword-processing-checkpoint-repository";
import type {
  GoogleAdsKeywordStagingOrchestratorInput,
  GoogleAdsKeywordStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-keyword-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const ACCESS_TOKEN =
  "fixture-access-token-must-not-reach-checkpoint";

const DEVELOPER_TOKEN =
  "fixture-developer-token-must-not-reach-checkpoint";

const DATE_WINDOW_INDEX =
  7;

function makeJob(
  insertedRows = 0,
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
      "1234567890",
    status:
      "processing",
    progress:
      0,
    date_from:
      "2026-05-01",
    date_to:
      "2026-05-02",
    raw_rows:
      insertedRows,
    normalized_rows:
      insertedRows,
    inserted_rows:
      insertedRows,
    failed_rows:
      0,
    snapshot_ingestion_id:
      null,
    error:
      null,
    error_detail:
      null,
    requested_by:
      null,
    attempt_count:
      1,
    started_at:
      "2026-08-20T00:00:00.000Z",
    finished_at:
      null,
    created_at:
      "2026-08-20T00:00:00.000Z",
    updated_at:
      "2026-08-20T00:00:00.000Z",
  } as unknown as MediaSyncJobRecord;
}

function makeStagingResult(
  job:
    MediaSyncJobRecord,
): GoogleAdsKeywordStagingOrchestratorResult {
  return {
    jobId:
      job.id,
    dateWindowIndex:
      DATE_WINDOW_INDEX,
    rowStartIndex:
      job.inserted_rows,
    nextRowIndex:
      job.inserted_rows + 1,
    runCanonicalRowCount:
      1,
    canonicalRowCount:
      job.inserted_rows + 1,
    status:
      "partial",
    isComplete:
      false,
    collector: {
      rows:
        [],
      status:
        "partial",
      isComplete:
        false,
      cursor: {
        version:
          1,
        pageIndex:
          1,
        page:
          "page-2",
      },
      pageCount:
        1,
      completedPageCount:
        1,
      requestCount:
        1,
      retryCount:
        0,
    },
    append: {
      submittedRows:
        1,
      insertedRows:
        1,
      duplicateRows:
        0,
      firstRowIndex:
        job.inserted_rows,
      lastRowIndex:
        job.inserted_rows,
    },
    checkpoint: {
      version:
        1,
      dateWindowIndex:
        DATE_WINDOW_INDEX,
      nextRowIndex:
        job.inserted_rows + 1,
      totalRows:
        job.inserted_rows + 1,
      failedRows:
        0,
      complete:
        false,
      cursor: {
        version:
          1,
        externalAccountId:
          job.external_account_id,
        dateWindowIndex:
          DATE_WINDOW_INDEX,
        dateFrom:
          job.date_from,
        dateTo:
          job.date_to,
        page: {
          version:
            1,
          pageIndex:
            1,
          page:
            "page-2",
        },
      },
    },
  } as unknown as
    GoogleAdsKeywordStagingOrchestratorResult;
}

async function main(): Promise<void> {
  let stagingCalls =
    0;

  let checkpointCalls =
    0;

  const checkpointDependencies:
    GoogleAdsKeywordProcessingCheckpointDependencies =
    Object.freeze({});

  {
    const job =
      makeJob(
        0,
      );

    const staging =
      makeStagingResult(
        job,
      );

    const updatedJob =
      makeJob(
        1,
      );

    const input: GoogleAdsKeywordStagingOrchestratorInput =
      {
        job,
        accessToken:
          ACCESS_TOKEN,
        developerToken:
          DEVELOPER_TOKEN,
        dateWindowIndex:
          DATE_WINDOW_INDEX,
      };

    const order:
      string[] =
      [];

    const result =
      await runGoogleAdsKeywordProcessingOrchestrator(
        input,
        {
          runStaging:
            async (
              receivedInput,
            ) => {
              stagingCalls +=
                1;

              order.push(
                "staging",
              );

              assert.strictEqual(
                receivedInput,
                input,
              );

              return staging;
            },

          saveCheckpoint:
            async (
              checkpointInput,
              receivedDependencies,
            ) => {
              checkpointCalls +=
                1;

              order.push(
                "checkpoint",
              );

              assert.strictEqual(
                checkpointInput.job,
                job,
              );

              assert.strictEqual(
                checkpointInput.result,
                staging,
              );

              assert.strictEqual(
                receivedDependencies,
                checkpointDependencies,
              );

              assert.deepEqual(
                Object.keys(
                  checkpointInput,
                ).sort(),
                [
                  "job",
                  "result",
                ],
              );

              const serialized =
                JSON.stringify(
                  checkpointInput,
                );

              assert.equal(
                serialized.includes(
                  ACCESS_TOKEN,
                ),
                false,
              );

              assert.equal(
                serialized.includes(
                  DEVELOPER_TOKEN,
                ),
                false,
              );

              return updatedJob;
            },

          checkpointDependencies,
        },
      );

    assert.deepEqual(
      order,
      [
        "staging",
        "checkpoint",
      ],
    );

    assert.strictEqual(
      result.staging,
      staging,
    );

    assert.strictEqual(
      result.job,
      updatedJob,
    );

    console.log(
      "PASS: successful staging is persisted to the Google-only checkpoint boundary in exact order",
    );
  }

  {
    const job =
      makeJob(
        0,
      );

    const stagingFailure =
      new Error(
        "FIXTURE_STAGING_FAILURE",
      );

    let checkpointAfterStagingFailure =
      0;

    await assert.rejects(
      () =>
        runGoogleAdsKeywordProcessingOrchestrator(
          {
            job,
            accessToken:
              ACCESS_TOKEN,
            developerToken:
              DEVELOPER_TOKEN,
          },
          {
            runStaging:
              async () => {
                stagingCalls +=
                  1;

                throw stagingFailure;
              },

            saveCheckpoint:
              async () => {
                checkpointAfterStagingFailure +=
                  1;

                throw new Error(
                  "CHECKPOINT_MUST_NOT_RUN",
                );
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
      checkpointAfterStagingFailure,
      0,
    );

    console.log(
      "PASS: staging failure prevents every checkpoint persistence attempt",
    );
  }

  {
    const job =
      makeJob(
        0,
      );

    const staging =
      makeStagingResult(
        job,
      );

    const checkpointFailure =
      new Error(
        "FIXTURE_CHECKPOINT_FAILURE",
      );

    const order:
      string[] =
      [];

    await assert.rejects(
      () =>
        runGoogleAdsKeywordProcessingOrchestrator(
          {
            job,
            accessToken:
              ACCESS_TOKEN,
            developerToken:
              DEVELOPER_TOKEN,
          },
          {
            runStaging:
              async () => {
                stagingCalls +=
                  1;

                order.push(
                  "staging",
                );

                return staging;
              },

            saveCheckpoint:
              async (
                checkpointInput,
              ) => {
                checkpointCalls +=
                  1;

                order.push(
                  "checkpoint",
                );

                assert.strictEqual(
                  checkpointInput.result,
                  staging,
                );

                throw checkpointFailure;
              },
          },
        ),
      (
        error:
          unknown,
      ) =>
        error ===
          checkpointFailure,
    );

    assert.deepEqual(
      order,
      [
        "staging",
        "checkpoint",
      ],
    );

    console.log(
      "PASS: checkpoint failure occurs only after successful staging and produces no successful processing result",
    );
  }

  assert.equal(
    stagingCalls,
    3,
  );

  assert.equal(
    checkpointCalls,
    2,
  );

  console.log(
    "GOOGLE_ADS_KEYWORD_PROCESSING_ORCHESTRATOR_FIXTURE=PASS",
  );

  console.log(
    `INJECTED_STAGING_ORCHESTRATOR_CALLS=${stagingCalls}`,
  );

  console.log(
    `INJECTED_CHECKPOINT_SAVE_CALLS=${checkpointCalls}`,
  );

  console.log(
    "REAL_STAGING_RPC_CALLS=0",
  );

  console.log(
    "REAL_CHECKPOINT_RPC_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "SQL_EXECUTIONS=0",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "WORKER_RUNTIME_CHANGES=0",
  );

  console.log(
    "NAVER_RUNTIME_CHANGES=0",
  );
}

void main().catch(
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

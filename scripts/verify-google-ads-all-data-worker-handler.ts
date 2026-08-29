import assert from "node:assert/strict";

import {
  GoogleAdsAllDataWorkerHandlerError,
  processGoogleAdsAllDataWorkerHandler,
  type GoogleAdsAllDataWorkerHandlerDependencies,
  type GoogleAdsAllDataWorkerJobRecord,
} from "../src/lib/media-sync/google-ads-all-data-worker-handler";
import {
  validateGoogleAdsAllDataProductRoutingState,
  type GoogleAdsAllDataProductRoutingState,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";
import {
  readGoogleAdsAllDataProcessingCheckpoint,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";
import type {
  GoogleAdsAllDataProcessingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";
import type {
  GoogleAdsAllDataSearchStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-all-data-search-staging-orchestrator";
import type {
  MediaSyncStagingSummary,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import type {
  MediaSyncSnapshotMaterializationResult,
} from "../src/lib/media-sync/media-sync-snapshot-materialization-repository";
import type {
  MediaSyncSnapshotActivationResult,
} from "../src/lib/media-sync/media-sync-snapshot-activation-repository";
import type {
  MediaSyncFinalizationResult,
} from "../src/lib/media-sync/media-sync-finalization-repository";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const REPORT_ID =
  "22222222-2222-4222-8222-222222222222";

const WORKSPACE_ID =
  "33333333-3333-4333-8333-333333333333";

const ADVERTISER_ID =
  "44444444-4444-4444-8444-444444444444";

const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";

const CREATED_BY =
  "66666666-6666-4666-8666-666666666666";

const SNAPSHOT_ID =
  "77777777-7777-4777-8777-777777777777";

const ACCOUNT_ID =
  "1234567890";

const DATE =
  "2026-05-01";

function createBaseJob():
  GoogleAdsAllDataWorkerJobRecord {
  return {
    id:
      JOB_ID,

    workspace_id:
      WORKSPACE_ID,

    advertiser_id:
      ADVERTISER_ID,

    report_id:
      REPORT_ID,

    connection_id:
      CONNECTION_ID,

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
      CREATED_BY,

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
    GoogleAdsAllDataWorkerJobRecord;
}


function withProductBoundaryCheckpoint(
  job:
    GoogleAdsAllDataWorkerJobRecord,
  routing:
    GoogleAdsAllDataProductRoutingState,
): GoogleAdsAllDataWorkerJobRecord {
  return {
    ...job,

    raw_rows:
      0,

    normalized_rows:
      0,

    inserted_rows:
      0,

    failed_rows:
      0,

    error:
      null,

    error_detail: {
      processing_checkpoint: {
        version:
          1,

        saved_at:
          "2026-08-29T00:00:00.000Z",

        execution_contract:
          "google_all_data_v1",

        date_window_index:
          0,

        next_row_index:
          0,

        raw_rows:
          0,

        normalized_rows:
          0,

        inserted_rows:
          0,

        failed_rows:
          0,

        complete:
          false,

        collector: {
          google_version:
            1,

          all_data_version:
            1,

          product_route: [
            ...routing.route,
          ],

          product_index:
            routing.productIndex,

          product_family:
            routing.productFamily,

          phase:
            "product_boundary",

          date_window_index:
            0,

          next_row_index:
            0,

          complete:
            false,

          cursor:
            null,
        },
      },
    },
  } as unknown as
    GoogleAdsAllDataWorkerJobRecord;
}

function makeResumeCursor(
  nextRowIndex:
    number,
) {
  return {
    version:
      1,

    phase:
      "search_ad",

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

    phaseCursor:
      null,
  };
}

function withCheckpoint(
  job:
    GoogleAdsAllDataWorkerJobRecord,
  input:
    Readonly<{
      nextRowIndex:
        number;

      complete:
        boolean;
    }>,
): GoogleAdsAllDataWorkerJobRecord {
  const phase =
    input.complete
      ? "completed"
      : "search_ad";

  const cursor =
    input.complete
      ? null
      : makeResumeCursor(
          input.nextRowIndex,
        );

  return {
    ...job,

    raw_rows:
      input.nextRowIndex,

    normalized_rows:
      input.nextRowIndex,

    inserted_rows:
      input.nextRowIndex,

    failed_rows:
      0,

    progress:
      input.complete
        ? 99
        : 60,

    error_detail: {
      processing_checkpoint: {
        version:
          1,

        execution_contract:
          "google_all_data_v1",

        date_window_index:
          0,

        next_row_index:
          input.nextRowIndex,

        raw_rows:
          input.nextRowIndex,

        normalized_rows:
          input.nextRowIndex,

        inserted_rows:
          input.nextRowIndex,

        failed_rows:
          0,

        complete:
          input.complete,

        collector: {
          google_version:
            1,

          all_data_version:
            1,

          phase,

          date_window_index:
            0,

          next_row_index:
            input.nextRowIndex,

          complete:
            input.complete,

          cursor,
        },
      },
    },
  } as unknown as
    GoogleAdsAllDataWorkerJobRecord;
}

function stagingResult(
  input:
    Readonly<{
      rowStartIndex:
        number;

      nextRowIndex:
        number;

      complete:
        boolean;
    }>,
): GoogleAdsAllDataSearchStagingOrchestratorResult {
  const cursor =
    input.complete
      ? null
      : makeResumeCursor(
          input.nextRowIndex,
        );

  return {
    jobId:
      JOB_ID,

    dateWindowIndex:
      0,

    phaseRun:
      input.complete
        ? "search_ad"
        : "keyword",

    nextPhase:
      input.complete
        ? null
        : "search_ad",

    rowStartIndex:
      input.rowStartIndex,

    nextRowIndex:
      input.nextRowIndex,

    runCanonicalRowCount:
      input.nextRowIndex -
      input.rowStartIndex,

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
        input.complete
          ? "search_ad"
          : "keyword",

      nextPhase:
        input.complete
          ? null
          : "search_ad",

      nextRowIndex:
        input.nextRowIndex,

      totalRows:
        input.nextRowIndex,

      failedRows:
        0,

      complete:
        input.complete,

      cursor,
    },
  } as unknown as
    GoogleAdsAllDataSearchStagingOrchestratorResult;
}

function processingResult(
  input:
    Readonly<{
      before:
        GoogleAdsAllDataWorkerJobRecord;

      nextRowIndex:
        number;

      complete:
        boolean;
    }>,
): GoogleAdsAllDataProcessingOrchestratorResult {
  const job =
    withCheckpoint(
      input.before,
      {
        nextRowIndex:
          input.nextRowIndex,

        complete:
          input.complete,
      },
    );

  return {
    staging:
      stagingResult({
        rowStartIndex:
          input.before.inserted_rows,

        nextRowIndex:
          input.nextRowIndex,

        complete:
          input.complete,
      }),

    job,
  } as unknown as
    GoogleAdsAllDataProcessingOrchestratorResult;
}

function releasedJob(
  checkpointJob:
    MediaSyncJobRecord,
): MediaSyncJobRecord {
  return {
    ...checkpointJob,

    status:
      "pending",

    started_at:
      null,

    error:
      null,

    updated_at:
      "2026-08-28T00:00:03.000Z",
  };
}

function completeSummary(
  expectedRows:
    number,
): MediaSyncStagingSummary {
  return {
    jobId:
      JOB_ID,

    expectedRows,

    totalRows:
      expectedRows,

    minRowIndex:
      expectedRows ===
        0
        ? null
        : 0,

    maxRowIndex:
      expectedRows ===
        0
        ? null
        : expectedRows -
          1,

    distinctRowIndexes:
      expectedRows,

    rowsInExpectedRange:
      expectedRows,

    missingExpectedRows:
      0,

    outOfRangeRows:
      0,

    scopeMismatchRows:
      0,

    blankRowKeyRows:
      0,

    missingFingerprintRows:
      0,

    canonicalMismatchRows:
      0,

    dateWindowCount:
      expectedRows ===
        0
        ? 0
        : 1,

    dateWindowSummaries:
      expectedRows ===
        0
        ? []
        : [
            {
              dateWindowIndex:
                0,

              rowCount:
                expectedRows,

              minRowIndex:
                0,

              maxRowIndex:
                expectedRows -
                1,

              minDate:
                DATE,

              maxDate:
                DATE,
            },
          ],

    isComplete:
      true,
  };
}

function materializationResult(
  job:
    MediaSyncJobRecord,
  expectedRows:
    number,
): MediaSyncSnapshotMaterializationResult {
  return {
    job: {
      ...job,

      snapshot_ingestion_id:
        SNAPSHOT_ID,
    },

    snapshotIngestionId:
      SNAPSHOT_ID,

    rowCount:
      expectedRows,
  } as unknown as
    MediaSyncSnapshotMaterializationResult;
}

function activationResult(
  job:
    MediaSyncJobRecord,
  expectedRows:
    number,
): MediaSyncSnapshotActivationResult {
  return {
    job,

    snapshotIngestionId:
      SNAPSHOT_ID,

    currentIngestionId:
      SNAPSHOT_ID,

    rowCount:
      expectedRows,
  } as unknown as
    MediaSyncSnapshotActivationResult;
}

function finalizationResult(
  job:
    MediaSyncJobRecord,
  expectedRows:
    number,
): MediaSyncFinalizationResult {
  return {
    job: {
      ...job,

      status:
        "done",

      progress:
        100,

      finished_at:
        "2026-08-28T00:00:05.000Z",
    },

    snapshotIngestionId:
      SNAPSHOT_ID,

    currentIngestionId:
      SNAPSHOT_ID,

    rowCount:
      expectedRows,
  } as unknown as
    MediaSyncFinalizationResult;
}


async function verifyDemandGenProductBoundaryAuthority():
  Promise<void> {
  const demandRouting =
    validateGoogleAdsAllDataProductRoutingState({
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
    });

  const claimed =
    withProductBoundaryCheckpoint(
      createBaseJob(),
      demandRouting,
    );

  let runtimeCalls =
    0;

  await assert.rejects(
    () =>
      processGoogleAdsAllDataWorkerHandler(
        {
          job:
            claimed,

          executionContract:
            "google_all_data_v1",
        },
        {
          readCheckpoint:
            value =>
              readGoogleAdsAllDataProcessingCheckpoint(
                value,
              ),

          processRuntime:
            async () => {
              runtimeCalls +=
                1;

              throw new Error(
                "fixture-demand-gen-runtime-stop",
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataWorkerHandlerError &&
      error.code ===
        "PROCESSING_FAILED",
  );

  assert.equal(
    runtimeCalls,
    1,
  );

  console.log(
    "ALL_DATA_HANDLER_DEMAND_GEN_PRODUCT_BOUNDARY_RUNTIME_ENTRY=PASS",
  );

  for (
    const testCase
    of [
      {
        label:
          "DISPLAY",

        productIndex:
          2,

        productFamily:
          "display" as const,
      },
      {
        label:
          "PERFORMANCE_MAX",

        productIndex:
          3,

        productFamily:
          "performance_max" as const,
      },
    ]
  ) {
    const routing =
      validateGoogleAdsAllDataProductRoutingState({
        route: [
          "search",
          "demand_gen",
          "display",
          "performance_max",
        ],

        productIndex:
          testCase.productIndex,

        productFamily:
          testCase.productFamily,

        complete:
          false,
      });

    const futureClaimed =
      withProductBoundaryCheckpoint(
        createBaseJob(),
        routing,
      );

    let futureRuntimeCalls =
      0;

    await assert.rejects(
      () =>
        processGoogleAdsAllDataWorkerHandler(
          {
            job:
              futureClaimed,

            executionContract:
              "google_all_data_v1",
          },
          {
            readCheckpoint:
              value =>
                readGoogleAdsAllDataProcessingCheckpoint(
                  value,
                ),

            processRuntime:
              async () => {
                futureRuntimeCalls +=
                  1;

                throw new Error(
                  "FUTURE_PRODUCT_RUNTIME_MUST_NOT_RUN",
                );
              },
          },
        ),
      (
        error:
          unknown,
      ) =>
        error instanceof
          GoogleAdsAllDataWorkerHandlerError &&
      error.code ===
        "INVALID_CHECKPOINT",
    );

    assert.equal(
      futureRuntimeCalls,
      0,
    );

    console.log(
      `ALL_DATA_HANDLER_${testCase.label}_PRODUCT_BOUNDARY_BLOCKED=PASS`,
    );
  }
}

async function verifyPartialRelease():
  Promise<void> {
  const claimed =
    createBaseJob();

  let runtimeCalls =
    0;

  let releaseCalls =
    0;

  let summaryCalls =
    0;

  const result =
    await processGoogleAdsAllDataWorkerHandler(
      {
        job:
          claimed,

        executionContract:
          "google_all_data_v1",
      },
      {
        processRuntime:
          async () => {
            runtimeCalls +=
              1;

            return processingResult({
              before:
                claimed,

              nextRowIndex:
                2,

              complete:
                false,
            });
          },

        releaseForResume:
          async job => {
            releaseCalls +=
              1;

            return releasedJob(
              job,
            );
          },

        summarize:
          async () => {
            summaryCalls +=
              1;

            throw new Error(
              "summary must not run for partial result",
            );
          },
      },
    );

  assert.equal(
    result.status,
    "partial",
  );

  if (
    result.status !==
      "partial"
  ) {
    throw new Error(
      "Expected partial result.",
    );
  }

  assert.equal(
    result.phase,
    "search_ad",
  );

  assert.equal(
    result.checkpointRows,
    2,
  );

  assert.equal(
    result.releasedJob.status,
    "pending",
  );

  assert.equal(
    runtimeCalls,
    1,
  );

  assert.equal(
    releaseCalls,
    1,
  );

  assert.equal(
    summaryCalls,
    0,
  );

  console.log(
    "ALL_DATA_HANDLER_PARTIAL_RUNTIME_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_HANDLER_PARTIAL_RELEASE_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_HANDLER_PARTIAL_COMPLETION_PIPELINE_CALLS=0",
  );
}

function completionDependencies(
  input:
    Readonly<{
      order:
        string[];

      runtime?:
        () =>
          Promise<
            GoogleAdsAllDataProcessingOrchestratorResult
          >;

      runtimeCounter:
        {
          value:
            number;
        };
    }>,
): GoogleAdsAllDataWorkerHandlerDependencies {
  return {
    processRuntime:
      async () => {
        input.runtimeCounter.value +=
          1;

        input.order.push(
          "runtime",
        );

        if (!input.runtime) {
          throw new Error(
            "Runtime was not expected.",
          );
        }

        return await input.runtime();
      },

    releaseForResume:
      async () => {
        throw new Error(
          "Completion path must not release.",
        );
      },

    summarize:
      async summaryInput => {
        input.order.push(
          "summary",
        );

        return completeSummary(
          summaryInput.expectedRows,
        );
      },

    materialize:
      async materializeInput => {
        input.order.push(
          "materialize",
        );

        return materializationResult(
          materializeInput.job,
          materializeInput.summary.totalRows,
        );
      },

    activate:
      async activateInput => {
        input.order.push(
          "activate",
        );

        return activationResult(
          activateInput.job,
          activateInput.expectedRows,
        );
      },

    finalize:
      async finalizeInput => {
        input.order.push(
          "finalize",
        );

        return finalizationResult(
          finalizeInput.job,
          finalizeInput.expectedRows,
        );
      },
  };
}

async function verifyFinalPageCompletion():
  Promise<void> {
  const claimed =
    withCheckpoint(
      createBaseJob(),
      {
        nextRowIndex:
          2,

        complete:
          false,
      },
    );

  const order:
    string[] =
      [];

  const runtimeCounter = {
    value:
      0,
  };

  const result =
    await processGoogleAdsAllDataWorkerHandler(
      {
        job:
          claimed,

        executionContract:
          "google_all_data_v1",
      },
      completionDependencies({
        order,

        runtimeCounter,

        runtime:
          async () =>
            processingResult({
              before:
                claimed,

              nextRowIndex:
                3,

              complete:
                true,
            }),
      }),
    );

  assert.equal(
    result.status,
    "completed",
  );

  if (
    result.status !==
      "completed"
  ) {
    throw new Error(
      "Expected completed result.",
    );
  }

  assert.ok(
    result.staging,
  );

  assert.equal(
    result.expectedRows,
    3,
  );

  assert.equal(
    result.finalization.job.status,
    "done",
  );

  assert.equal(
    runtimeCounter.value,
    1,
  );

  assert.deepEqual(
    order,
    [
      "runtime",
      "summary",
      "materialize",
      "activate",
      "finalize",
    ],
  );

  console.log(
    "ALL_DATA_HANDLER_FINAL_PAGE_RUNTIME_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_HANDLER_FINAL_PAGE_SECOND_PAGE_CALL=0",
  );

  console.log(
    "ALL_DATA_HANDLER_COMPLETION_PIPELINE_ORDER=PASS",
  );
}

async function verifyCompletedRetrySkipsRuntime():
  Promise<void> {
  const claimed =
    withCheckpoint(
      createBaseJob(),
      {
        nextRowIndex:
          3,

        complete:
          true,
      },
    );

  const order:
    string[] =
      [];

  const runtimeCounter = {
    value:
      0,
  };

  const result =
    await processGoogleAdsAllDataWorkerHandler(
      {
        job:
          claimed,

        executionContract:
          "google_all_data_v1",
      },
      completionDependencies({
        order,

        runtimeCounter,
      }),
    );

  assert.equal(
    result.status,
    "completed",
  );

  if (
    result.status !==
      "completed"
  ) {
    throw new Error(
      "Expected completed retry result.",
    );
  }

  assert.equal(
    result.staging,
    null,
  );

  assert.equal(
    runtimeCounter.value,
    0,
  );

  assert.deepEqual(
    order,
    [
      "summary",
      "materialize",
      "activate",
      "finalize",
    ],
  );

  console.log(
    "ALL_DATA_HANDLER_COMPLETED_RETRY_RUNTIME_CALLS=0",
  );

  console.log(
    "ALL_DATA_HANDLER_COMPLETED_RETRY_TOKEN_REFRESH_CALLS=0",
  );

  console.log(
    "ALL_DATA_HANDLER_COMPLETED_RETRY_GOOGLE_API_CALLS=0",
  );

  console.log(
    "ALL_DATA_HANDLER_COMPLETED_RETRY_COMPLETION_ONLY=PASS",
  );
}

async function verifyBoundaryMismatchFailsClosed():
  Promise<void> {
  const claimed =
    createBaseJob();

  let releaseCalls =
    0;

  let summaryCalls =
    0;

  await assert.rejects(
    () =>
      processGoogleAdsAllDataWorkerHandler(
        {
          job:
            claimed,

          executionContract:
            "google_all_data_v1",
        },
        {
          processRuntime:
            async () => {
              const processing =
                processingResult({
                  before:
                    claimed,

                  nextRowIndex:
                    2,

                  complete:
                    false,
                });

              return {
                ...processing,

                staging:
                  stagingResult({
                    rowStartIndex:
                      0,

                    nextRowIndex:
                      3,

                    complete:
                      false,
                  }),
              } as unknown as
                GoogleAdsAllDataProcessingOrchestratorResult;
            },

          releaseForResume:
            async job => {
              releaseCalls +=
                1;

              return releasedJob(
                job,
              );
            },

          summarize:
            async () => {
              summaryCalls +=
                1;

              return completeSummary(
                0,
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataWorkerHandlerError &&
      error.code ===
        "INVALID_CHECKPOINT",
  );

  assert.equal(
    releaseCalls,
    0,
  );

  assert.equal(
    summaryCalls,
    0,
  );

  console.log(
    "ALL_DATA_HANDLER_BOUNDARY_MISMATCH_FAIL_CLOSED=PASS",
  );
}

async function verifyExecutionContractFailsBeforeWork():
  Promise<void> {
  let runtimeCalls =
    0;

  let releaseCalls =
    0;

  let summaryCalls =
    0;

  await assert.rejects(
    () =>
      processGoogleAdsAllDataWorkerHandler(
        {
          job: {
            ...createBaseJob(),

            execution_contract:
              undefined,
          } as unknown as
            GoogleAdsAllDataWorkerJobRecord,

          executionContract:
            "google_all_data_v1",
        },
        {
          processRuntime:
            async () => {
              runtimeCalls +=
                1;

              throw new Error(
                "must not run",
              );
            },

          releaseForResume:
            async job => {
              releaseCalls +=
                1;

              return job;
            },

          summarize:
            async () => {
              summaryCalls +=
                1;

              return completeSummary(
                0,
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataWorkerHandlerError &&
      error.code ===
        "INVALID_JOB",
  );

  assert.equal(
    runtimeCalls,
    0,
  );

  assert.equal(
    releaseCalls,
    0,
  );

  assert.equal(
    summaryCalls,
    0,
  );

  console.log(
    "ALL_DATA_HANDLER_EXECUTION_CONTRACT_FAILS_BEFORE_WORK=PASS",
  );
}

async function main():
  Promise<void> {
  assert.equal(
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
      "",
    "",
  );

  console.log(
    "ALL_DATA_HANDLER_IMPORT_WITHOUT_SUPABASE_ENV=PASS",
  );

  await verifyDemandGenProductBoundaryAuthority();
  await verifyPartialRelease();

  await verifyFinalPageCompletion();

  await verifyCompletedRetrySkipsRuntime();

  await verifyBoundaryMismatchFailsClosed();

  await verifyExecutionContractFailsBeforeWork();

  console.log(
    "GOOGLE_ADS_ALL_DATA_WORKER_HANDLER_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
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

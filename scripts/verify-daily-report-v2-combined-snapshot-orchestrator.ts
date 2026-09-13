import assert from "node:assert/strict";

import {
  runDailyReportV2CombinedSnapshotOrchestratorOnce,
  type DailyReportV2CombinedSnapshotOrchestratorDependencies,
} from "../src/lib/media-sync/daily-report-v2-combined-snapshot-orchestrator";

import type {
  DailyReportV2CombinedSnapshotRun,
} from "../src/lib/media-sync/daily-report-v2-combined-snapshot-repository";

const REPORT_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const WORKSPACE_ID =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ADVERTISER_ID =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CREATED_BY =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const RUN_ID =
  "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const INGESTION_ID =
  "ffffffff-ffff-4fff-8fff-ffffffffffff";

const START_DATE =
  "2026-09-01";

const THROUGH_DATE =
  "2026-09-12";

const orchestrationInput =
  Object.freeze({
    reportId:
      REPORT_ID,
    workspaceId:
      WORKSPACE_ID,
    advertiserId:
      ADVERTISER_ID,
    createdBy:
      CREATED_BY,
    startDate:
      START_DATE,
    throughDate:
      THROUGH_DATE,
  });

function snapshotRun(
  expectedRows:
    number,
  status:
    DailyReportV2CombinedSnapshotRun["status"],
): DailyReportV2CombinedSnapshotRun {
  return Object.freeze({
    runId:
      RUN_ID,
    reportId:
      REPORT_ID,
    previousIngestionId:
      null,
    snapshotIngestionId:
      INGESTION_ID,
    startDate:
      START_DATE,
    throughDate:
      THROUGH_DATE,
    participants:
      Object.freeze([
        Object.freeze({
          connectionId:
            "11111111-1111-4111-8111-111111111111",
          provider:
            "naver_searchad" as const,
          externalAccountId:
            "naver-account",
          expectedRows,
        }),
      ]),
    participantCount:
      1,
    expectedRows,
    status,
    idempotent:
      false,
  });
}

async function boundedFirstBatch() {
  let materializeCalls =
    0;

  const dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies =
      {
        prepare:
          async () =>
            snapshotRun(
              9000,
              "prepared",
            ),

        loadCheckpoint:
          async () => ({
            snapshotIngestionId:
              INGESTION_ID,
            reportId:
              REPORT_ID,
            expectedRows:
              9000,
            nextRowIndex:
              0,
            ingestionStatus:
              "processing",
          }),

        materializeBatch:
          async (
            input,
          ) => {
            materializeCalls +=
              1;

            assert.equal(
              input.batchStart,
              0,
            );

            assert.equal(
              input.batchSize,
              5000,
            );

            return {
              runId:
                RUN_ID,
              reportId:
                REPORT_ID,
              snapshotIngestionId:
                INGESTION_ID,
              expectedRows:
                9000,
              batchStart:
                0,
              batchEndExclusive:
                5000,
              expectedBatchRows:
                5000,
              insertedRows:
                5000,
              materializedBatchRows:
                5000,
              nextRowIndex:
                5000,
              complete:
                false,
              status:
                "materializing",
              idempotent:
                false,
            };
          },

        complete:
          async () => {
            throw new Error(
              "incomplete batch must not complete",
            );
          },

        activate:
          async () => {
            throw new Error(
              "incomplete batch must not activate",
            );
          },
      };

  const result =
    await runDailyReportV2CombinedSnapshotOrchestratorOnce(
      orchestrationInput,
      dependencies,
    );

  assert.equal(
    result.action,
    "materialized_batch",
  );

  assert.equal(
    result.nextRowIndex,
    5000,
  );

  assert.equal(
    materializeCalls,
    1,
  );
}

async function finalBatchCompletesAndActivates() {
  let materializeCalls =
    0;

  let completeCalls =
    0;

  let activateCalls =
    0;

  const dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies =
      {
        prepare:
          async () =>
            snapshotRun(
              9000,
              "materializing",
            ),

        loadCheckpoint:
          async () => ({
            snapshotIngestionId:
              INGESTION_ID,
            reportId:
              REPORT_ID,
            expectedRows:
              9000,
            nextRowIndex:
              5000,
            ingestionStatus:
              "processing",
          }),

        materializeBatch:
          async (
            input,
          ) => {
            materializeCalls +=
              1;

            assert.equal(
              input.batchStart,
              5000,
            );

            assert.equal(
              input.batchSize,
              5000,
            );

            return {
              runId:
                RUN_ID,
              reportId:
                REPORT_ID,
              snapshotIngestionId:
                INGESTION_ID,
              expectedRows:
                9000,
              batchStart:
                5000,
              batchEndExclusive:
                9000,
              expectedBatchRows:
                4000,
              insertedRows:
                4000,
              materializedBatchRows:
                4000,
              nextRowIndex:
                9000,
              complete:
                true,
              status:
                "materializing",
              idempotent:
                false,
            };
          },

        complete:
          async () => {
            completeCalls +=
              1;

            return {
              runId:
                RUN_ID,
              reportId:
                REPORT_ID,
              snapshotIngestionId:
                INGESTION_ID,
              rowCount:
                9000,
              sourceFingerprint:
                "a".repeat(
                  64,
                ),
              status:
                "ready",
              idempotent:
                false,
            };
          },

        activate:
          async () => {
            activateCalls +=
              1;

            return {
              runId:
                RUN_ID,
              reportId:
                REPORT_ID,
              previousIngestionId:
                null,
              snapshotIngestionId:
                INGESTION_ID,
              currentIngestionId:
                INGESTION_ID,
              publishedIngestionId:
                null,
              rowCount:
                9000,
              sourceFingerprint:
                "a".repeat(
                  64,
                ),
              status:
                "activated",
              idempotent:
                false,
            };
          },
      };

  const result =
    await runDailyReportV2CombinedSnapshotOrchestratorOnce(
      orchestrationInput,
      dependencies,
    );

  assert.equal(
    result.action,
    "activated",
  );

  assert.equal(
    materializeCalls,
    1,
  );

  assert.equal(
    completeCalls,
    1,
  );

  assert.equal(
    activateCalls,
    1,
  );
}

async function crashAfterFinalBatchResumes() {
  let materializeCalls =
    0;

  let completeCalls =
    0;

  const dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies =
      {
        prepare:
          async () =>
            snapshotRun(
              9000,
              "materializing",
            ),

        loadCheckpoint:
          async () => ({
            snapshotIngestionId:
              INGESTION_ID,
            reportId:
              REPORT_ID,
            expectedRows:
              9000,
            nextRowIndex:
              9000,
            ingestionStatus:
              "processing",
          }),

        materializeBatch:
          async () => {
            materializeCalls +=
              1;

            throw new Error(
              "fully checkpointed run must not rematerialize",
            );
          },

        complete:
          async () => {
            completeCalls +=
              1;

            return {
              runId:
                RUN_ID,
              reportId:
                REPORT_ID,
              snapshotIngestionId:
                INGESTION_ID,
              rowCount:
                9000,
              sourceFingerprint:
                "b".repeat(
                  64,
                ),
              status:
                "ready",
              idempotent:
                false,
            };
          },

        activate:
          async () => ({
            runId:
              RUN_ID,
            reportId:
              REPORT_ID,
            previousIngestionId:
              null,
            snapshotIngestionId:
              INGESTION_ID,
            currentIngestionId:
              INGESTION_ID,
            publishedIngestionId:
              null,
            rowCount:
              9000,
            sourceFingerprint:
              "b".repeat(
                64,
              ),
            status:
              "activated",
            idempotent:
              false,
          }),
      };

  const result =
    await runDailyReportV2CombinedSnapshotOrchestratorOnce(
      orchestrationInput,
      dependencies,
    );

  assert.equal(
    result.action,
    "activated",
  );

  assert.equal(
    materializeCalls,
    0,
  );

  assert.equal(
    completeCalls,
    1,
  );
}

async function zeroRowPath() {
  let checkpointCalls =
    0;

  let materializeCalls =
    0;

  const dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies =
      {
        prepare:
          async () =>
            snapshotRun(
              0,
              "prepared",
            ),

        loadCheckpoint:
          async () => {
            checkpointCalls +=
              1;

            throw new Error(
              "zero-row run must not load materialization checkpoint",
            );
          },

        materializeBatch:
          async () => {
            materializeCalls +=
              1;

            throw new Error(
              "zero-row run must not materialize",
            );
          },

        complete:
          async () => ({
            runId:
              RUN_ID,
            reportId:
              REPORT_ID,
            snapshotIngestionId:
              INGESTION_ID,
            rowCount:
              0,
            sourceFingerprint:
              "c".repeat(
                64,
              ),
            status:
              "ready",
            idempotent:
              false,
          }),

        activate:
          async () => ({
            runId:
              RUN_ID,
            reportId:
              REPORT_ID,
            previousIngestionId:
              null,
            snapshotIngestionId:
              INGESTION_ID,
            currentIngestionId:
              INGESTION_ID,
            publishedIngestionId:
              null,
            rowCount:
              0,
            sourceFingerprint:
              "c".repeat(
                64,
              ),
            status:
              "activated",
            idempotent:
              false,
          }),
      };

  const result =
    await runDailyReportV2CombinedSnapshotOrchestratorOnce(
      orchestrationInput,
      dependencies,
    );

  assert.equal(
    result.action,
    "activated",
  );

  assert.equal(
    checkpointCalls,
    0,
  );

  assert.equal(
    materializeCalls,
    0,
  );
}

async function readyActivatesOnly() {
  let checkpointCalls =
    0;

  let completeCalls =
    0;

  const dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies =
      {
        prepare:
          async () =>
            snapshotRun(
              9000,
              "ready",
            ),

        loadCheckpoint:
          async () => {
            checkpointCalls +=
              1;

            throw new Error(
              "ready run must not load checkpoint",
            );
          },

        materializeBatch:
          async () => {
            throw new Error(
              "ready run must not materialize",
            );
          },

        complete:
          async () => {
            completeCalls +=
              1;

            throw new Error(
              "ready run must not complete again",
            );
          },

        activate:
          async () => ({
            runId:
              RUN_ID,
            reportId:
              REPORT_ID,
            previousIngestionId:
              null,
            snapshotIngestionId:
              INGESTION_ID,
            currentIngestionId:
              INGESTION_ID,
            publishedIngestionId:
              null,
            rowCount:
              9000,
            sourceFingerprint:
              "d".repeat(
                64,
              ),
            status:
              "activated",
            idempotent:
              false,
          }),
      };

  const result =
    await runDailyReportV2CombinedSnapshotOrchestratorOnce(
      orchestrationInput,
      dependencies,
    );

  assert.equal(
    result.action,
    "activated",
  );

  assert.equal(
    checkpointCalls,
    0,
  );

  assert.equal(
    completeCalls,
    0,
  );
}

async function activatedIsDone() {
  let downstreamCalls =
    0;

  const dependencies:
    DailyReportV2CombinedSnapshotOrchestratorDependencies =
      {
        prepare:
          async () =>
            snapshotRun(
              9000,
              "activated",
            ),

        loadCheckpoint:
          async () => {
            downstreamCalls +=
              1;
            throw new Error("unexpected");
          },

        materializeBatch:
          async () => {
            downstreamCalls +=
              1;
            throw new Error("unexpected");
          },

        complete:
          async () => {
            downstreamCalls +=
              1;
            throw new Error("unexpected");
          },

        activate:
          async () => {
            downstreamCalls +=
              1;
            throw new Error("unexpected");
          },
      };

  const result =
    await runDailyReportV2CombinedSnapshotOrchestratorOnce(
      orchestrationInput,
      dependencies,
    );

  assert.equal(
    result.action,
    "already_activated",
  );

  assert.equal(
    downstreamCalls,
    0,
  );
}

async function main() {
  await boundedFirstBatch();
  await finalBatchCompletesAndActivates();
  await crashAfterFinalBatchResumes();
  await zeroRowPath();
  await readyActivatesOnly();
  await activatedIsDone();

  console.log(
    "D10K5_BATCH_SIZE_5000=PASS",
  );

  console.log(
    "D10K5_ONE_ADVANCING_BATCH_PER_INVOCATION=PASS",
  );

  console.log(
    "D10K5_DURABLE_ROW_COUNT_RESUME=PASS",
  );

  console.log(
    "D10K5_CRASH_AFTER_FINAL_BATCH_RESUME=PASS",
  );

  console.log(
    "D10K5_ZERO_ROW_COMPLETE_ACTIVATE=PASS",
  );

  console.log(
    "D10K5_READY_ACTIVATE_ONLY=PASS",
  );

  console.log(
    "D10K5_ALREADY_ACTIVATED_IDEMPOTENT_DONE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "LIVE_PROVIDER_API_CALLS=0",
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

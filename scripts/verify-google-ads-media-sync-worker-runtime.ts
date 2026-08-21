import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

import {
  readGoogleAdsMediaSyncProcessingCheckpoint,
} from "../src/lib/media-sync/google-ads-media-sync-processing-checkpoint";
import {
  GoogleAdsMediaSyncWorkerOrchestrationError,
  processNextGoogleAdsMediaSyncJob,
} from "../src/lib/media-sync/google-ads-media-sync-worker-orchestration-repository";

import type {
  GoogleAdsKeywordStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-keyword-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const SNAPSHOT_ID =
  "66666666-6666-4666-8666-666666666666";

function checkpoint(
  rows: number,
  kind:
    "partial" |
    "completed",
  dateWindowIndex = 0,
) {
  const complete =
    kind === "completed";

  return {
    version: 1,
    saved_at:
      "2026-08-21T00:00:00.000Z",
    date_window_index:
      dateWindowIndex,
    next_row_index:
      rows,
    raw_rows:
      rows,
    normalized_rows:
      rows,
    inserted_rows:
      rows,
    failed_rows:
      0,
    complete,
    collector: {
      google_version:
        1,
      phase:
        "keyword",
      completed_page_count:
        Math.max(1, rows),
      cursor:
        complete
          ? null
          : {
              version:
                1,
              externalAccountId:
                "1234567890",
              dateWindowIndex,
              dateFrom:
                "2026-05-01",
              dateTo:
                "2026-05-02",
              page: {
                version:
                  1,
                pageIndex:
                  Math.max(1, rows),
                page:
                  `page-${Math.max(1, rows) + 1}`,
              },
            },
    },
  };
}

function makeJob(
  input: Readonly<{
    status?:
      "pending" |
      "processing" |
      "done";
    rows?: number;
    checkpointKind?:
      "none" |
      "partial" |
      "completed";
    dateWindowIndex?: number;
    snapshotIngestionId?:
      string |
      null;
  }> = {},
): MediaSyncJobRecord {
  const status =
    input.status ??
    "processing";

  const rows =
    input.rows ??
    0;

  const checkpointKind =
    input.checkpointKind ??
    "none";

  const errorDetail =
    checkpointKind === "none"
      ? null
      : {
          processing_checkpoint:
            checkpoint(
              rows,
              checkpointKind,
              input.dateWindowIndex ?? 0,
            ),
        };

  return {
    id:
      JOB_ID,
    workspace_id:
      "33333333-3333-4333-8333-333333333333",
    advertiser_id:
      "44444444-4444-4444-8444-444444444444",
    report_id:
      "22222222-2222-4222-8222-222222222222",
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
    status,
    progress:
      status === "done"
        ? 100
        : 0,
    raw_rows:
      rows,
    normalized_rows:
      rows,
    inserted_rows:
      rows,
    failed_rows:
      0,
    previous_ingestion_id:
      null,
    snapshot_ingestion_id:
      input.snapshotIngestionId ??
      null,
    attempt_count:
      1,
    error:
      null,
    error_detail:
      errorDetail as never,
    created_by:
      "77777777-7777-4777-8777-777777777777",
    created_at:
      "2026-08-21T00:00:00.000Z",
    started_at:
      status === "pending"
        ? null
        : "2026-08-21T00:00:01.000Z",
    finished_at:
      status === "done"
        ? "2026-08-21T00:05:00.000Z"
        : null,
    updated_at:
      "2026-08-21T00:00:01.000Z",
  };
}

function makeStaging(
  status:
    "partial" |
    "completed",
  rows: number,
  dateWindowIndex = 0,
): GoogleAdsKeywordStagingOrchestratorResult {
  const complete =
    status === "completed";

  const cursor =
    complete
      ? null
      : {
          version:
            1 as const,
          externalAccountId:
            "1234567890",
          dateWindowIndex,
          dateFrom:
            "2026-05-01",
          dateTo:
            "2026-05-02",
          page: {
            version:
              1 as const,
            pageIndex:
              Math.max(1, rows),
            page:
              `page-${Math.max(1, rows) + 1}`,
          },
        };

  return {
    jobId:
      JOB_ID,
    dateWindowIndex,
    rowStartIndex:
      Math.max(0, rows - 1),
    nextRowIndex:
      rows,
    runCanonicalRowCount:
      1,
    canonicalRowCount:
      rows,
    status,
    isComplete:
      complete,
    collector: {
      completedPageCount:
        Math.max(1, rows),
    } as never,
    append: {
      submittedRows:
        1,
      insertedRows:
        1,
      duplicateRows:
        0,
      firstRowIndex:
        Math.max(0, rows - 1),
      lastRowIndex:
        rows - 1,
    } as never,
    checkpoint: {
      version:
        1,
      dateWindowIndex,
      nextRowIndex:
        rows,
      totalRows:
        rows,
      failedRows:
        0,
      complete,
      cursor,
    },
  };
}

function makeSummary(
  rows: number,
) {
  return {
    jobId:
      JOB_ID,
    expectedRows:
      rows,
    totalRows:
      rows,
    minRowIndex:
      rows > 0 ? 0 : null,
    maxRowIndex:
      rows > 0 ? rows - 1 : null,
    distinctRowIndexes:
      rows,
    rowsInExpectedRange:
      rows,
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
      rows > 0 ? 1 : 0,
    dateWindowSummaries:
      [],
    isComplete:
      true,
  };
}

async function main(): Promise<void> {
  {
    const state =
      readGoogleAdsMediaSyncProcessingCheckpoint(
        makeJob(),
      );

    assert.equal(
      state.hasCheckpoint,
      false,
    );

    assert.equal(
      state.dateWindowIndex,
      null,
    );

    console.log(
      "PASS: fresh Google job has no fabricated resume authority",
    );
  }

  {
    const state =
      readGoogleAdsMediaSyncProcessingCheckpoint(
        makeJob({
          rows: 3,
          checkpointKind:
            "partial",
          dateWindowIndex:
            4,
        }),
      );

    assert.equal(
      state.hasCheckpoint,
      true,
    );
    assert.equal(
      state.dateWindowIndex,
      4,
    );
    assert.equal(
      state.nextRowIndex,
      3,
    );
    assert.equal(
      state.complete,
      false,
    );
    assert.equal(
      state.cursor?.page.page,
      "page-4",
    );

    console.log(
      "PASS: partial Google checkpoint restores exact durable cursor",
    );
  }

  {
    let laterCalls =
      0;

    const result =
      await processNextGoogleAdsMediaSyncJob({
        dependencies: {
          claimNext:
            async () => null,
          processClaimed:
            async () => {
              laterCalls += 1;
              throw new Error("MUST_NOT_RUN");
            },
        },
      });

    assert.equal(result, null);
    assert.equal(laterCalls, 0);

    console.log(
      "PASS: no Google job returns null without downstream work",
    );
  }

  {
    const claimed =
      makeJob();
    const checkpointJob =
      makeJob({
        rows: 1,
        checkpointKind:
          "partial",
      });
    const releasedJob = {
      ...checkpointJob,
      status:
        "pending",
      started_at:
        null,
    } as MediaSyncJobRecord;

    let capturedDateWindowIndex:
      unknown = "unset";
    let capturedCursor:
      unknown = "unset";
    let completionCalls =
      0;
    let markFailedCalls =
      0;

    const result =
      await processNextGoogleAdsMediaSyncJob({
        dependencies: {
          claimNext:
            async () => claimed,
          processClaimed:
            async input => {
              capturedDateWindowIndex =
                input.dateWindowIndex;
              capturedCursor =
                input.cursor;

              return {
                staging:
                  makeStaging(
                    "partial",
                    1,
                  ),
                job:
                  checkpointJob,
              };
            },
          releaseForResume:
            async () => releasedJob,
          summarize:
            async () => {
              completionCalls += 1;
              return makeSummary(1);
            },
          markFailed:
            async () => {
              markFailedCalls += 1;
            },
        },
      });

    assert.equal(
      capturedDateWindowIndex,
      undefined,
    );
    assert.equal(
      capturedCursor,
      undefined,
    );
    assert.equal(
      completionCalls,
      0,
    );
    assert.equal(
      markFailedCalls,
      0,
    );
    assert.equal(
      result?.status,
      "partial",
    );

    console.log(
      "PASS: fresh bounded Google page persists checkpoint and releases without completion",
    );
  }

  {
    const claimed =
      makeJob({
        rows: 3,
        checkpointKind:
          "partial",
        dateWindowIndex:
          4,
      });
    const checkpointJob =
      makeJob({
        rows: 4,
        checkpointKind:
          "partial",
        dateWindowIndex:
          4,
      });
    const releasedJob = {
      ...checkpointJob,
      status:
        "pending",
      started_at:
        null,
    } as MediaSyncJobRecord;

    let capturedDateWindowIndex:
      unknown;
    let capturedCursor:
      unknown;

    const result =
      await processNextGoogleAdsMediaSyncJob({
        dependencies: {
          claimNext:
            async () => claimed,
          processClaimed:
            async input => {
              capturedDateWindowIndex =
                input.dateWindowIndex;
              capturedCursor =
                input.cursor;

              return {
                staging:
                  makeStaging(
                    "partial",
                    4,
                    4,
                  ),
                job:
                  checkpointJob,
              };
            },
          releaseForResume:
            async () => releasedJob,
          markFailed:
            async () => {},
        },
      });

    assert.equal(
      capturedDateWindowIndex,
      4,
    );
    assert.ok(
      capturedCursor &&
      typeof capturedCursor === "object",
    );
    assert.equal(
      result?.status,
      "partial",
    );

    console.log(
      "PASS: resumed Google page receives exact persisted cursor",
    );
  }

  {
    const completed =
      makeJob({
        rows: 2,
        checkpointKind:
          "completed",
      });
    const materialized =
      makeJob({
        rows: 2,
        checkpointKind:
          "completed",
        snapshotIngestionId:
          SNAPSHOT_ID,
      });
    const done = {
      ...materialized,
      status:
        "done",
      progress:
        100,
      finished_at:
        "2026-08-21T00:05:00.000Z",
    } as MediaSyncJobRecord;

    const lifecycle:
      string[] = [];
    let processCalls =
      0;
    let markFailedCalls =
      0;

    const result =
      await processNextGoogleAdsMediaSyncJob({
        dependencies: {
          claimNext:
            async () => completed,
          processClaimed:
            async () => {
              processCalls += 1;
              throw new Error("MUST_NOT_REPLAY");
            },
          summarize:
            async () => {
              lifecycle.push("summary");
              return makeSummary(2);
            },
          materialize:
            async () => {
              lifecycle.push("materialize");
              return {
                job:
                  materialized,
                snapshotIngestionId:
                  SNAPSHOT_ID,
                rowCount:
                  2,
                stagingFingerprint:
                  "a".repeat(64),
                materializedFingerprint:
                  "a".repeat(64),
                idempotent:
                  false,
              };
            },
          activate:
            async () => {
              lifecycle.push("activate");
              return {
                job:
                  materialized,
                previousIngestionId:
                  null,
                snapshotIngestionId:
                  SNAPSHOT_ID,
                currentIngestionId:
                  SNAPSHOT_ID,
                publishedIngestionId:
                  null,
                rowCount:
                  2,
                stagingFingerprint:
                  "a".repeat(64),
                materializedFingerprint:
                  "a".repeat(64),
                idempotent:
                  false,
              };
            },
          finalize:
            async () => {
              lifecycle.push("finalize");
              return {
                job:
                  done,
                snapshotIngestionId:
                  SNAPSHOT_ID,
                currentIngestionId:
                  SNAPSHOT_ID,
                publishedIngestionId:
                  null,
                rowCount:
                  2,
                stagingFingerprint:
                  "a".repeat(64),
                materializedFingerprint:
                  "a".repeat(64),
                finishedAt:
                  "2026-08-21T00:05:00.000Z",
                connectionId:
                  done.connection_id,
                connectionLastSyncAt:
                  "2026-08-21T00:05:00.000Z",
                connectionUpdated:
                  true,
                idempotent:
                  false,
              };
            },
          markFailed:
            async () => {
              markFailedCalls += 1;
            },
        },
      });

    assert.equal(processCalls, 0);
    assert.deepEqual(
      lifecycle,
      [
        "summary",
        "materialize",
        "activate",
        "finalize",
      ],
    );
    assert.equal(markFailedCalls, 0);
    assert.equal(
      result?.status,
      "completed",
    );

    console.log(
      "PASS: completed persisted checkpoint skips page replay and completes exact lifecycle",
    );
  }

  {
    const malformed = {
      ...makeJob({
        rows: 1,
        checkpointKind:
          "partial",
      }),
      error_detail: {
        processing_checkpoint: {
          version: 1,
          date_window_index: 0,
          next_row_index: 99,
          raw_rows: 1,
          normalized_rows: 1,
          inserted_rows: 1,
          failed_rows: 0,
          complete: false,
          collector: {
            google_version: 1,
            phase: "keyword",
            completed_page_count: 1,
            cursor: null,
          },
        },
      } as never,
    } as MediaSyncJobRecord;

    let processingCalls = 0;
    let markFailedCalls = 0;

    await assert.rejects(
      () =>
        processNextGoogleAdsMediaSyncJob({
          dependencies: {
            claimNext:
              async () => malformed,
            processClaimed:
              async () => {
                processingCalls += 1;
                throw new Error("MUST_NOT_RUN");
              },
            markFailed:
              async () => {
                markFailedCalls += 1;
              },
          },
        }),
    );

    assert.equal(processingCalls, 0);
    assert.equal(markFailedCalls, 1);

    console.log(
      "PASS: malformed checkpoint fails closed before Google processing",
    );
  }

  {
    const completed =
      makeJob({
        rows: 2,
        checkpointKind:
          "completed",
      });
    const materialized =
      makeJob({
        rows: 2,
        checkpointKind:
          "completed",
        snapshotIngestionId:
          SNAPSHOT_ID,
      });

    let markFailedCalls = 0;

    await assert.rejects(
      () =>
        processNextGoogleAdsMediaSyncJob({
          dependencies: {
            claimNext:
              async () => completed,
            summarize:
              async () => makeSummary(2),
            materialize:
              async () => ({
                job: materialized,
                snapshotIngestionId:
                  SNAPSHOT_ID,
                rowCount: 2,
                stagingFingerprint:
                  "a".repeat(64),
                materializedFingerprint:
                  "a".repeat(64),
                idempotent: false,
              }),
            activate:
              async () => {
                throw new Error(
                  "FIXTURE_ACTIVATION_FAILURE",
                );
              },
            markFailed:
              async () => {
                markFailedCalls += 1;
              },
          },
        }),
      (error: unknown) =>
        error instanceof
          GoogleAdsMediaSyncWorkerOrchestrationError &&
        error.code ===
          "ACTIVATION_FAILED",
    );

    assert.equal(markFailedCalls, 0);

    console.log(
      "PASS: activation-stage failure remains processing for operator diagnosis",
    );
  }

  {
    const worker =
      readFileSync(
        "scripts/media-sync-worker.ts",
        "utf8",
      );
    const capability =
      readFileSync(
        "src/lib/media-sync/media-provider-sync-capabilities.ts",
        "utf8",
      );
    const summary =
      readFileSync(
        "src/lib/media-sync/media-sync-staging-summary-repository.ts",
        "utf8",
      );

    const workerStart =
      worker.indexOf(
        "async function processSingleJob(",
      );
    const workerEnd =
      worker.indexOf(
        "async function runSingleMode(",
        workerStart,
      );
    const workerBlock =
      worker.slice(
        workerStart,
        workerEnd,
      );

    assert.ok(
      workerBlock.indexOf(
        "processNextNaverMediaSyncJob",
      ) <
      workerBlock.indexOf(
        "processNextGoogleAdsMediaSyncJob",
      ),
    );
    assert.match(
      worker,
      /const GOOGLE_ADS_ENABLED_ENV\s*=\s*\n\s*"MEDIA_SYNC_WORKER_GOOGLE_ADS_ENABLED";/,
    );
    assert.match(
      workerBlock,
      /readBooleanEnv\(\s*GOOGLE_ADS_ENABLED_ENV,\s*\)/,
    );
    assert.match(
      capability,
      /google_ads:\s*\{[\s\S]*?syncRuntimeEnabled:\s*false/,
    );

    const combinedStart =
      summary.indexOf(
        "export async function getNaverSearchAdsCombinedStagingSummary(",
      );
    const combinedProbe =
      summary.slice(
        combinedStart,
        combinedStart + 3000,
      );

    assert.match(
      combinedProbe,
      /validateJob\(input\.job\);/,
    );
    assert.doesNotMatch(
      combinedProbe,
      /allowGoogleAds/,
    );

    console.log(
      "PASS: Naver remains first/strict and Google Production gates remain disabled",
    );
  }

  console.log();
  console.log(
    "GOOGLE_ADS_MEDIA_SYNC_WORKER_RUNTIME_FIXTURE=PASS",
  );
  console.log("REAL_DB_CALLS=0");
  console.log("REAL_GOOGLE_CLAIM_RPC_CALLS=0");
  console.log("REAL_GOOGLE_API_CALLS=0");
  console.log("REAL_GOOGLE_OAUTH_CALLS=0");
  console.log("REAL_MATERIALIZATION_CALLS=0");
  console.log("REAL_ACTIVATION_CALLS=0");
  console.log("REAL_FINALIZATION_CALLS=0");
  console.log("NAVER_RUNTIME_CALLS=0");
}

void main().catch(
  error => {
    console.error(
      "GOOGLE_ADS_MEDIA_SYNC_WORKER_RUNTIME_FIXTURE=FAIL",
    );
    console.error(error);
    process.exitCode = 1;
  },
);

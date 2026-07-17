import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE_FROM =
  "2026-05-01";

const DATE_TO =
  "2026-05-02";

const EXTERNAL_ACCOUNT_ID =
  "123456";

const SNAPSHOT_INGESTION_ID =
  "77777777-7777-4777-8777-777777777777";

const PREVIOUS_INGESTION_ID =
  "88888888-8888-4888-8888-888888888888";

const PUBLISHED_INGESTION_ID =
  "99999999-9999-4999-8999-999999999999";

const credentials = {
  customerId:
    EXTERNAL_ACCOUNT_ID,
  accessLicense:
    "fixture-access-license",
  secretKey:
    "fixture-secret-key",
};

const INITIAL_JOB:
  MediaSyncJobRecord = {
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
      "naver_searchad",
    external_account_id:
      EXTERNAL_ACCOUNT_ID,

    date_from:
      DATE_FROM,
    date_to:
      DATE_TO,

    data_level:
      "mixed",
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
      PREVIOUS_INGESTION_ID,
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
      "2026-07-14T00:00:00.000Z",
    started_at:
      "2026-07-14T00:00:01.000Z",
    finished_at:
      null,
    updated_at:
      "2026-07-14T00:00:01.000Z",
  };

type UnknownRecord =
  Record<string, unknown>;

type CapturedCheckpointPayload = {
  phase:
    string;
  nextRowIndex:
    number;
  payload:
    UnknownRecord;
};

function hash(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}

function requireRecord(
  value: unknown,
  message: string,
): UnknownRecord {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      message,
    );
  }

  return value as
    UnknownRecord;
}

function cloneJob(
  job:
    MediaSyncJobRecord,
  overrides:
    Partial<MediaSyncJobRecord> = {},
): MediaSyncJobRecord {
  return {
    ...job,
    ...overrides,
    error_detail:
      overrides.error_detail ===
      undefined
        ? job.error_detail
        : overrides.error_detail,
  };
}

function createBufferState(
  rowCount: number,
  batchSize: number,
) {
  return {
    maxBatchSize:
      batchSize,
    pendingRowCount:
      0,
    acceptedRowCount:
      rowCount,
    flushedBatchCount:
      rowCount === 0
        ? 0
        : Math.ceil(
            rowCount /
            batchSize,
          ),
    flushedRowCount:
      rowCount,
    busy:
      false,
  };
}

function createAppendTotals(input: {
  rowStartIndex:
    number;
  rowCount:
    number;
  batchSize:
    number;
}) {
  return {
    flushCount:
      input.rowCount ===
      0
        ? 0
        : Math.ceil(
            input.rowCount /
            input.batchSize,
          ),
    submittedRows:
      input.rowCount,
    insertedRows:
      input.rowCount,
    duplicateRows:
      0,
    maximumBatchSize:
      Math.min(
        input.rowCount,
        input.batchSize,
      ),
    firstRowIndex:
      input.rowCount ===
      0
        ? null
        : input.rowStartIndex,
    lastRowIndex:
      input.rowCount ===
      0
        ? null
        : input.rowStartIndex +
          input.rowCount -
          1,
  };
}

function createPartialSummary(
  totalRows: number,
) {
  return {
    isComplete:
      false,
    totalRows,
    expectedRows:
      totalRows,
    insertedRows:
      totalRows,
    duplicateRows:
      0,
  };
}

function createCompleteSummary(
  jobId: string,
  totalRows: number,
) {
  return {
    jobId,
    expectedRows:
      totalRows,
    totalRows,
    minRowIndex:
      totalRows === 0
        ? null
        : 0,
    maxRowIndex:
      totalRows === 0
        ? null
        : totalRows - 1,
    distinctRowIndexes:
      totalRows,
    rowsInExpectedRange:
      totalRows,
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
      1,
    dateWindowSummaries: [
      {
        dateWindowIndex:
          0,
        rowCount:
          totalRows,
        minRowIndex:
          totalRows === 0
            ? 0
            : 0,
        maxRowIndex:
          totalRows === 0
            ? 0
            : totalRows - 1,
        minDate:
          DATE_FROM,
        maxDate:
          DATE_TO,
      },
    ],
    isComplete:
      true,
  };
}

function createKeywordResult(input: {
  status:
    "partial" |
    "completed";
  runRows:
    number;
  totalRows:
    number;
  seedRows:
    number;
  seedKeywords:
    number;
  runKeywords:
    number;
  cursor:
    UnknownRecord;
}) {
  const isComplete =
    input.status ===
    "completed";

  return {
    status:
      input.status,
    isComplete,
    jobId:
      INITIAL_JOB.id,
    dateWindowIndex:
      0,
    collector: {
      status:
        input.status,
      completed:
        isComplete,
      isComplete,
      partialReason:
        isComplete
          ? null
          : "max_keyword_stats_per_run_reached",
      cursor:
        input.cursor,
      campaignPagesRead:
        1,
      campaignsRead:
        1,
      adgroupPagesRead:
        1,
      adgroupsRead:
        1,
      keywordPagesRead:
        1,
      keywordsDiscoveredInRun:
        input.runKeywords,
      keywordsCompletedInRun:
        input.runKeywords,
      statsRequestsAttempted:
        input.runKeywords,
      statsRequestsSucceeded:
        input.runKeywords,
      retryCount:
        0,
    },
    runCanonicalRowCount:
      input.runRows,
    canonicalRowCount:
      input.totalRows,
    callbackCount:
      input.runKeywords,
    checkpointSeed: {
      insertedRows:
        input.seedRows,
      rawRows:
        input.seedRows,
      normalizedRows:
        input.seedRows,
      failedRows:
        0,
      collector: {
        discoveredKeywords:
          input.seedKeywords,
        completedKeywords:
          input.seedKeywords,
        statsRequestsAttempted:
          input.seedKeywords,
        statsRequestsSucceeded:
          input.seedKeywords,
        retryCount:
          0,
      },
    },
    buffer:
      createBufferState(
        input.runRows,
        3,
      ),
    append:
      createAppendTotals({
        rowStartIndex:
          input.seedRows,
        rowCount:
          input.runRows,
        batchSize:
          3,
      }),
    summary:
      isComplete
        ? createCompleteSummary(
            INITIAL_JOB.id,
            input.totalRows,
          )
        : createPartialSummary(
            input.totalRows,
          ),
  };
}

function createAuthoritativeResult(input: {
  status:
    "partial" |
    "completed";
  rowStartIndex:
    number;
  runRows:
    number;
  runEntities:
    number;
  cursor:
    UnknownRecord;
}) {
  const isComplete =
    input.status ===
    "completed";

  return {
    status:
      input.status,
    isComplete,
    jobId:
      INITIAL_JOB.id,
    dateWindowIndex:
      0,
    rowStartIndex:
      input.rowStartIndex,
    nextRowIndex:
      input.rowStartIndex +
      input.runRows,
    collector: {
      status:
        input.status,
      completed:
        isComplete,
      isComplete,
      partialReason:
        isComplete
          ? null
          : "max_entity_stats_per_run_reached",
      cursor:
        input.cursor,
      campaignPagesRead:
        1,
      campaignsRead:
        3,
      adgroupPagesRead:
        2,
      adgroupsRead:
        3,
      entityPagesRead:
        1,
      entitiesDiscoveredInRun:
        input.runEntities,
      entitiesCompletedInRun:
        input.runEntities,
      statsRequestsAttempted:
        input.runEntities,
      statsRequestsSucceeded:
        input.runEntities,
      retryCount:
        0,
    },
    runCanonicalRowCount:
      input.runRows,
    callbackCount:
      input.runEntities,
    buffer:
      createBufferState(
        input.runRows,
        3,
      ),
    append:
      createAppendTotals({
        rowStartIndex:
          input.rowStartIndex,
        rowCount:
          input.runRows,
        batchSize:
          3,
      }),
  };
}

async function main(): Promise<void> {
  /*
   * The production worker imports DB repositories that initialize the
   * Supabase client at module load. Fixture-only non-secret placeholders
   * allow module construction; every DB operation is still dependency-injected.
   */
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "fixture-service-role-key";

  const {
    processClaimedNaverMediaSyncJob,
  } =
    await import(
      "../src/lib/media-sync/media-sync-worker-orchestration-repository"
    );

  const sourcePaths = [
    "src/lib/media-sync/media-sync-worker-orchestration-repository.ts",
    "src/lib/media-sync/media-sync-combined-processing-checkpoint-repository.ts",
    "src/lib/media-sync/media-sync-processing-checkpoint-repository.ts",
    "src/lib/media-sync/naver-searchads-staging-orchestrator.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator.ts",
    "scripts/media-sync-worker.ts",
  ] as const;

  const sourceBefore =
    await Promise.all(
      sourcePaths.map(
        (
          path,
        ) =>
          readFile(
            path,
            "utf8",
          ),
      ),
    );

  const keywordCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          DATE_FROM,
        dateTo:
          DATE_TO,
      },
    }) as unknown as
      UnknownRecord;

  const authoritativeCursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          DATE_FROM,
        dateTo:
          DATE_TO,
      },
    }) as unknown as
      UnknownRecord;

  let keywordRunCount =
    0;

  let authoritativeRunCount =
    0;

  let releaseCount =
    0;

  let summaryCount =
    0;

  let materializationCount =
    0;

  let activationCount =
    0;

  let finalizationCount =
    0;

  let currentIngestionId =
    PREVIOUS_INGESTION_ID;

  let publishedIngestionId =
    PUBLISHED_INGESTION_ID;

  const capturedCheckpoints:
    CapturedCheckpointPayload[] = [];

  const saveCheckpointRpc =
    async (
      functionName: string,
      args: {
        p_payload: unknown;
      },
    ) => {
      assert.equal(
        functionName,
        "save_naver_searchads_combined_processing_checkpoint",
      );

      const payload =
        requireRecord(
          args.p_payload,
          "Checkpoint payload must be an object.",
        );

      const collector =
        requireRecord(
          payload.collector,
          "Checkpoint collector payload must be an object.",
        );

      const phase =
        String(
          collector.phase ??
          "",
        );

      const nextRowIndex =
        Number(
          collector.next_row_index,
        );

      capturedCheckpoints.push({
        phase,
        nextRowIndex,
        payload,
      });

      const previousJob =
        activeCheckpointJob;

      const updatedJob =
        cloneJob(
          previousJob,
          {
            raw_rows:
              Number(
                payload.raw_rows,
              ),
            normalized_rows:
              Number(
                payload.normalized_rows,
              ),
            inserted_rows:
              Number(
                payload.inserted_rows,
              ),
            failed_rows:
              Number(
                payload.failed_rows,
              ),
            error_detail: {
              processing_checkpoint: {
                raw_rows:
                  Number(
                    payload.raw_rows,
                  ),
                normalized_rows:
                  Number(
                    payload.normalized_rows,
                  ),
                inserted_rows:
                  Number(
                    payload.inserted_rows,
                  ),
                failed_rows:
                  Number(
                    payload.failed_rows,
                  ),
                collector:
                  collector as never,
              },
            },
            updated_at:
              new Date(
                Date.parse(
                  previousJob.updated_at,
                ) +
                1_000,
              ).toISOString(),
          },
        );

      activeCheckpointJob =
        updatedJob;

      return {
        data: [
          updatedJob,
        ],
        error:
          null,
      };
    };

  let activeCheckpointJob =
    cloneJob(
      INITIAL_JOB,
    );

  const orchestrationDependencies = {
    loadContext:
      async (
        job:
          MediaSyncJobRecord,
      ) => ({
        job,
        connection: {
          id:
            job.connection_id,
          workspaceId:
            job.workspace_id,
          advertiserId:
            job.advertiser_id,
          provider:
            "naver_searchad" as const,
          externalAccountId:
            job.external_account_id,
        },
        credentials,
      }),

    runKeywordStaging:
      async (
        input:
          UnknownRecord,
      ) => {
        keywordRunCount +=
          1;

        const job =
          input.job as
            MediaSyncJobRecord;

        assert.equal(
          job.id,
          INITIAL_JOB.id,
        );

        if (
          keywordRunCount ===
          1
        ) {
          return createKeywordResult({
            status:
              "partial",
            runRows:
              2,
            totalRows:
              2,
            seedRows:
              0,
            seedKeywords:
              0,
            runKeywords:
              1,
            cursor:
              keywordCursor,
          });
        }

        if (
          keywordRunCount ===
          2
        ) {
          return createKeywordResult({
            status:
              "completed",
            runRows:
              2,
            totalRows:
              4,
            seedRows:
              2,
            seedKeywords:
              1,
            runKeywords:
              1,
            cursor:
              keywordCursor,
          });
        }

        throw new Error(
          "Keyword staging ran after completion.",
        );
      },

    runAuthoritativeStaging:
      async (
        input:
          UnknownRecord,
      ) => {
        authoritativeRunCount +=
          1;

        const rowStartIndex =
          Number(
            input.rowStartIndex,
          );

        if (
          authoritativeRunCount ===
          1
        ) {
          assert.equal(
            rowStartIndex,
            4,
            "The authoritative phase did not start at keyword nextRowIndex.",
          );

          return createAuthoritativeResult({
            status:
              "partial",
            rowStartIndex,
            runRows:
              4,
            runEntities:
              2,
            cursor:
              authoritativeCursor,
          });
        }

        if (
          authoritativeRunCount ===
          2
        ) {
          assert.equal(
            rowStartIndex,
            8,
            "The resumed authoritative phase did not use checkpoint nextRowIndex.",
          );

          return createAuthoritativeResult({
            status:
              "completed",
            rowStartIndex,
            runRows:
              6,
            runEntities:
              3,
            cursor:
              authoritativeCursor,
          });
        }

        throw new Error(
          "Authoritative staging ran after completion.",
        );
      },

    releaseForResume:
      async (
        job:
          MediaSyncJobRecord,
      ) => {
        releaseCount +=
          1;

        return cloneJob(
          job,
          {
            status:
              "pending",
            started_at:
              null,
            error:
              null,
            updated_at:
              new Date(
                Date.parse(
                  job.updated_at,
                ) +
                1_000,
              ).toISOString(),
          },
        );
      },

    assertStagingComplete:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          expectedRows:
            number;
        },
      ) => {
        summaryCount +=
          1;

        assert.equal(
          input.expectedRows,
          14,
        );

        assert.equal(
          input.job.inserted_rows,
          14,
        );

        return createCompleteSummary(
          input.job.id,
          14,
        );
      },

    materialize:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          summary:
            ReturnType<
              typeof createCompleteSummary
            >;
        },
      ) => {
        materializationCount +=
          1;

        assert.equal(
          summaryCount,
          1,
          "Materialization ran before combined staging summary.",
        );

        assert.equal(
          input.summary.totalRows,
          14,
        );

        return {
          job:
            cloneJob(
              input.job,
              {
                snapshot_ingestion_id:
                  SNAPSHOT_INGESTION_ID,
              },
            ),
          snapshotIngestionId:
            SNAPSHOT_INGESTION_ID,
          rowCount:
            14,
          stagingFingerprint:
            "a".repeat(
              64,
            ),
          materializedFingerprint:
            "a".repeat(
              64,
            ),
          idempotent:
            false,
        };
      },

    activate:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          expectedRows:
            number;
        },
      ) => {
        activationCount +=
          1;

        assert.equal(
          materializationCount,
          1,
        );

        assert.equal(
          input.expectedRows,
          14,
        );

        currentIngestionId =
          SNAPSHOT_INGESTION_ID;

        return {
          job:
            input.job,
          previousIngestionId:
            PREVIOUS_INGESTION_ID,
          snapshotIngestionId:
            SNAPSHOT_INGESTION_ID,
          currentIngestionId:
            currentIngestionId,
          publishedIngestionId:
            publishedIngestionId,
          rowCount:
            14,
          stagingFingerprint:
            "a".repeat(
              64,
            ),
          materializedFingerprint:
            "a".repeat(
              64,
            ),
          idempotent:
            false,
        };
      },

    finalize:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          expectedRows:
            number;
        },
      ) => {
        finalizationCount +=
          1;

        assert.equal(
          activationCount,
          1,
        );

        assert.equal(
          publishedIngestionId,
          PUBLISHED_INGESTION_ID,
          "published_ingestion_id changed before finalization.",
        );

        const finishedAt =
          "2026-07-14T00:10:00.000Z";

        return {
          job:
            cloneJob(
              input.job,
              {
                status:
                  "done",
                progress:
                  100,
                finished_at:
                  finishedAt,
              },
            ),
          snapshotIngestionId:
            SNAPSHOT_INGESTION_ID,
          currentIngestionId:
            currentIngestionId,
          publishedIngestionId:
            publishedIngestionId,
          rowCount:
            14,
          stagingFingerprint:
            "a".repeat(
              64,
            ),
          materializedFingerprint:
            "a".repeat(
              64,
            ),
          finishedAt,
          connectionId:
            input.job.connection_id,
          connectionLastSyncAt:
            finishedAt,
          connectionUpdated:
            true,
          idempotent:
            false,
        };
      },
  };

  const runOptions = {
    jobTimeoutMs:
      60_000,
    orchestrationDependencies:
      orchestrationDependencies as never,
    combinedCheckpointDependencies: {
      invokeRpc:
        saveCheckpointRpc,
    },
  };

  const firstResult =
    await processClaimedNaverMediaSyncJob(
      activeCheckpointJob,
      runOptions,
    );

  assert.equal(
    firstResult.status,
    "partial",
  );

  assert.equal(
    firstResult.status ===
      "partial"
      ? firstResult.phase
      : null,
    "keyword",
  );

  assert.equal(
    firstResult.expectedRows,
    2,
  );

  assert.equal(
    releaseCount,
    1,
  );

  assert.equal(
    authoritativeRunCount,
    0,
  );

  assert.equal(
    materializationCount,
    0,
  );

  activeCheckpointJob =
    cloneJob(
      firstResult.status ===
      "partial"
        ? firstResult.releasedJob
        : activeCheckpointJob,
      {
        status:
          "processing",
        started_at:
          "2026-07-14T00:01:00.000Z",
        attempt_count:
          2,
      },
    );

  const secondResult =
    await processClaimedNaverMediaSyncJob(
      activeCheckpointJob,
      runOptions,
    );

  assert.equal(
    secondResult.status,
    "partial",
  );

  assert.equal(
    secondResult.status ===
      "partial"
      ? secondResult.phase
      : null,
    "authoritative",
  );

  assert.equal(
    secondResult.expectedRows,
    8,
  );

  assert.equal(
    keywordRunCount,
    2,
  );

  assert.equal(
    authoritativeRunCount,
    1,
  );

  assert.equal(
    releaseCount,
    2,
  );

  assert.equal(
    materializationCount,
    0,
    "Materialization ran before authoritative completion.",
  );

  activeCheckpointJob =
    cloneJob(
      secondResult.status ===
      "partial"
        ? secondResult.releasedJob
        : activeCheckpointJob,
      {
        status:
          "processing",
        started_at:
          "2026-07-14T00:02:00.000Z",
        attempt_count:
          3,
      },
    );

  const thirdResult =
    await processClaimedNaverMediaSyncJob(
      activeCheckpointJob,
      runOptions,
    );

  assert.equal(
    thirdResult.status,
    "completed",
  );

  assert.equal(
    keywordRunCount,
    2,
    "Keyword staging reran after its completed checkpoint.",
  );

  assert.equal(
    authoritativeRunCount,
    2,
  );

  assert.equal(
    summaryCount,
    1,
  );

  assert.equal(
    materializationCount,
    1,
  );

  assert.equal(
    activationCount,
    1,
  );

  assert.equal(
    finalizationCount,
    1,
  );

  assert.equal(
    thirdResult.expectedRows,
    14,
  );

  assert.equal(
    thirdResult.staging.summary.totalRows,
    14,
  );

  assert.equal(
    thirdResult.staging.canonicalRowCount,
    14,
  );

  assert.equal(
    currentIngestionId,
    SNAPSHOT_INGESTION_ID,
  );

  assert.equal(
    publishedIngestionId,
    PUBLISHED_INGESTION_ID,
    "published_ingestion_id changed during combined worker orchestration.",
  );

  assert.deepEqual(
    capturedCheckpoints.map(
      (
        checkpoint,
      ) =>
        checkpoint.phase,
    ),
    [
      "keyword",
      "authoritative",
      "authoritative",
      "completed",
    ],
  );

  assert.deepEqual(
    capturedCheckpoints.map(
      (
        checkpoint,
      ) =>
        checkpoint.nextRowIndex,
    ),
    [
      2,
      4,
      8,
      14,
    ],
  );

  for (
    const captured
    of capturedCheckpoints
  ) {
    const collector =
      requireRecord(
        captured.payload.collector,
        "Captured collector payload is invalid.",
      );

    const keyword =
      requireRecord(
        collector.keyword,
        "Captured keyword checkpoint is invalid.",
      );

    const authoritative =
      requireRecord(
        collector.authoritative,
        "Captured authoritative checkpoint is invalid.",
      );

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        keyword,
        "cursor",
      ),
      "Keyword cursor is missing from combined checkpoint.",
    );

    assert.ok(
      Object.prototype.hasOwnProperty.call(
        authoritative,
        "cursor",
      ),
      "Authoritative cursor is missing from combined checkpoint.",
    );
  }

  const sourceAfter =
    await Promise.all(
      sourcePaths.map(
        (
          path,
        ) =>
          readFile(
            path,
            "utf8",
          ),
      ),
    );

  assert.deepEqual(
    sourceAfter.map(
      hash,
    ),
    sourceBefore.map(
      hash,
    ),
    "Worker orchestration verification changed source files.",
  );

  console.log(
    "verified worker keyword phase partial checkpoint and pending release: true",
  );

  console.log(
    "verified worker keyword completion transitions to authoritative phase without materialization: true",
  );

  console.log(
    "verified worker authoritative partial checkpoint and pending release: true",
  );

  console.log(
    "verified keyword and authoritative cursors are stored separately: true",
  );

  console.log(
    "verified combined nextRowIndex sequence: 2 / 4 / 8 / 14",
  );

  console.log(
    "verified keyword phase does not rerun after authoritative checkpoint: true",
  );

  console.log(
    "verified materialization calls before authoritative completion: 0",
  );

  console.log(
    "verified materialization calls after combined completion: 1",
  );

  console.log(
    "verified activation calls after materialization: 1",
  );

  console.log(
    "verified finalization calls after activation: 1",
  );

  console.log(
    "verified current_ingestion_id changes only after activation: true",
  );

  console.log(
    "verified published_ingestion_id remains unchanged: true",
  );

  console.log(
    "verified combined completed staging rows: 14",
  );

  console.log(
    "fixture uses worker orchestration dependency injection: true",
  );

  console.log(
    "fixture uses injected checkpoint RPC mock: true",
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
  );

  console.log(
    "fixture writes staging: false",
  );

  console.log(
    "fixture writes report_rows: false",
  );

  console.log(
    "fixture changes report pointers in database: false",
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
      "Media sync worker combined staging orchestration fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);

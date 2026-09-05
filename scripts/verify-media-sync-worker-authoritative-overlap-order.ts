import assert from "node:assert/strict";

import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";

import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";

import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

type UnknownRecord =
  Record<string, unknown>;

const DATE_FROM =
  "2026-05-01";

const DATE_TO =
  "2026-05-01";

const EXTERNAL_ACCOUNT_ID =
  "fixture-overlap-customer";

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
      "66666666-6666-4666-8666-666666666666",

    snapshot_ingestion_id:
      null,

    attempt_count:
      1,

    error:
      null,

    error_detail:
      null,

    created_by:
      "77777777-7777-4777-8777-777777777777",

    created_at:
      "2026-09-05T00:00:00.000Z",

    started_at:
      "2026-09-05T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-09-05T00:00:01.000Z",
  };

const credentials = {
  customerId:
    EXTERNAL_ACCOUNT_ID,

  accessLicense:
    "fixture-access-license",

  secretKey:
    "fixture-secret-key",
};

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
  rowCount:
    number,
) {
  return {
    maxBatchSize:
      1_000,

    pendingRowCount:
      0,

    acceptedRowCount:
      rowCount,

    flushedBatchCount:
      rowCount > 0
        ? 1
        : 0,

    flushedRowCount:
      rowCount,

    busy:
      false,
  };
}

function createAppendTotals(
  rowStartIndex:
    number,
  rowCount:
    number,
) {
  return {
    flushCount:
      rowCount > 0
        ? 1
        : 0,

    submittedRows:
      rowCount,

    insertedRows:
      rowCount,

    duplicateRows:
      0,

    maximumBatchSize:
      rowCount,

    firstRowIndex:
      rowCount > 0
        ? rowStartIndex
        : null,

    lastRowIndex:
      rowCount > 0
        ? rowStartIndex +
          rowCount -
          1
        : null,
  };
}

function createKeywordCursor() {
  return createNaverKeywordStatsCursor({
    dateWindow: {
      index:
        0,

      dateFrom:
        DATE_FROM,

      dateTo:
        DATE_TO,
    },
  });
}

function createAuthoritativeCursor() {
  return createNaverAuthoritativeEntityStatsCursor({
    dateWindow: {
      index:
        0,

      dateFrom:
        DATE_FROM,

      dateTo:
        DATE_TO,
    },
  });
}

function createKeywordResult(
  status:
    "completed" |
    "partial",
  rowCount:
    number,
) {
  const complete =
    status ===
    "completed";

  return {
    status,

    isComplete:
      complete,

    jobId:
      INITIAL_JOB.id,

    dateWindowIndex:
      0,

    collector: {
      status,

      completed:
        complete,

      isComplete:
        complete,

      partialReason:
        complete
          ? null
          : "max_keyword_stats_per_run_reached",

      cursor:
        createKeywordCursor(),

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
        1,

      keywordsCompletedInRun:
        1,

      statsRequestsAttempted:
        1,

      statsRequestsSucceeded:
        1,

      retryCount:
        0,
    },

    runCanonicalRowCount:
      rowCount,

    canonicalRowCount:
      rowCount,

    callbackCount:
      1,

    checkpointSeed: {
      insertedRows:
        0,

      rawRows:
        0,

      normalizedRows:
        0,

      failedRows:
        0,

      collector: {
        discoveredKeywords:
          0,

        completedKeywords:
          0,

        statsRequestsAttempted:
          0,

        statsRequestsSucceeded:
          0,

        retryCount:
          0,
      },
    },

    buffer:
      createBufferState(
        rowCount,
      ),

    append:
      createAppendTotals(
        0,
        rowCount,
      ),

    summary: {
      isComplete:
        complete,

      totalRows:
        rowCount,

      expectedRows:
        rowCount,

      insertedRows:
        rowCount,

      duplicateRows:
        0,
    },
  };
}

function createAuthoritativeResult(
  rowStartIndex:
    number,
  rowCount:
    number,
) {
  return {
    status:
      "partial" as const,

    isComplete:
      false,

    jobId:
      INITIAL_JOB.id,

    dateWindowIndex:
      0,

    rowStartIndex,

    nextRowIndex:
      rowStartIndex +
      rowCount,

    collector: {
      status:
        "partial" as const,

      completed:
        false,

      isComplete:
        false,

      partialReason:
        "max_entity_stats_per_run_reached",

      cursor:
        createAuthoritativeCursor(),

      campaignPagesRead:
        1,

      campaignsRead:
        2,

      adgroupPagesRead:
        1,

      adgroupsRead:
        1,

      entityPagesRead:
        1,

      entitiesDiscoveredInRun:
        1,

      entitiesCompletedInRun:
        1,

      statsRequestsAttempted:
        1,

      statsRequestsSucceeded:
        1,

      retryCount:
        0,
    },

    runCanonicalRowCount:
      rowCount,

    callbackCount:
      1,

    buffer:
      createBufferState(
        rowCount,
      ),

    append:
      createAppendTotals(
        rowStartIndex,
        rowCount,
      ),
  };
}

function requireDeferredRowStart(
  input:
    UnknownRecord,
): Promise<number> {
  const value =
    input.deferredRowStartIndex;

  assert.ok(
    value instanceof Promise,
    "Authoritative overlap did not receive deferredRowStartIndex.",
  );

  return value as
    Promise<number>;
}

async function runSuccessfulOverlapCase(
  processClaimedNaverMediaSyncJob:
    (
      job:
        MediaSyncJobRecord,
      options:
        UnknownRecord,
    ) => Promise<UnknownRecord>,
): Promise<void> {
  const events:
    string[] = [];

  let keywordCompleted =
    false;

  let keywordCheckpointSaved =
    false;

  let authoritativeGateReleased =
    false;

  let authoritativeResolvedRowStart:
    number |
    null =
      null;

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

    runAuthoritativeStaging:
      async (
        input:
          UnknownRecord,
      ) => {
        events.push(
          "authoritative:invoked",
        );

        assert.equal(
          keywordCompleted,
          false,
          "Authoritative collection was not started until after keyword completion.",
        );

        /*
         * Simulate useful authoritative API/read work before the
         * keyword phase is finished.
         */
        await Promise.resolve();

        events.push(
          "authoritative:collection-progress",
        );

        const deferredRowStart =
          requireDeferredRowStart(
            input,
          );

        const resolved =
          await deferredRowStart;

        authoritativeResolvedRowStart =
          resolved;

        authoritativeGateReleased =
          true;

        events.push(
          `authoritative:gate-released:${resolved}`,
        );

        assert.equal(
          keywordCheckpointSaved,
          true,
          "Authoritative staging authority opened before the keyword checkpoint was saved.",
        );

        assert.equal(
          resolved,
          4,
          "Deferred authoritative rowStartIndex did not equal the completed keyword boundary.",
        );

        return createAuthoritativeResult(
          resolved,
          2,
        );
      },

    runKeywordStaging:
      async () => {
        events.push(
          "keyword:invoked",
        );

        /*
         * Give the already-started authoritative promise one
         * microtask to perform collection work.
         */
        await Promise.resolve();

        assert.ok(
          events.includes(
            "authoritative:collection-progress",
          ),
          "Authoritative collection did not overlap keyword execution.",
        );

        assert.equal(
          authoritativeGateReleased,
          false,
          "Authoritative staging gate opened before keyword completion.",
        );

        keywordCompleted =
          true;

        events.push(
          "keyword:completed",
        );

        return createKeywordResult(
          "completed",
          4,
        );
      },

    saveCombinedCheckpoint:
      async (
        input:
          UnknownRecord,
      ) => {
        const checkpoint =
          input.checkpoint as
            UnknownRecord;

        const totalRows =
          Number(
            checkpoint.totalRows,
          );

        const phase =
          String(
            checkpoint.phase,
          );

        if (
          phase ===
            "authoritative" &&
          totalRows ===
            4
        ) {
          keywordCheckpointSaved =
            true;

          events.push(
            "checkpoint:keyword-saved",
          );
        } else {
          events.push(
            `checkpoint:${phase}:${totalRows}`,
          );
        }

        return cloneJob(
          input.job as
            MediaSyncJobRecord,
          {
            raw_rows:
              totalRows,

            normalized_rows:
              totalRows,

            inserted_rows:
              totalRows,

            failed_rows:
              0,
          },
        );
      },

    releaseForResume:
      async (
        job:
          MediaSyncJobRecord,
      ) => {
        events.push(
          "release:authoritative-partial",
        );

        return cloneJob(
          job,
          {
            status:
              "pending",

            started_at:
              null,
          },
        );
      },
  };

  const result =
    await processClaimedNaverMediaSyncJob(
      cloneJob(
        INITIAL_JOB,
      ),
      {
        enableAuthoritativeOverlap:
          true,

        orchestrationDependencies:
          orchestrationDependencies as
            never,
      },
    );

  assert.equal(
    result.status,
    "partial",
  );

  assert.equal(
    result.phase,
    "authoritative",
  );

  assert.equal(
    authoritativeResolvedRowStart,
    4,
  );

  const authoritativeProgressIndex =
    events.indexOf(
      "authoritative:collection-progress",
    );

  const keywordCompletedIndex =
    events.indexOf(
      "keyword:completed",
    );

  const keywordCheckpointIndex =
    events.indexOf(
      "checkpoint:keyword-saved",
    );

  const gateReleaseIndex =
    events.indexOf(
      "authoritative:gate-released:4",
    );

  assert.ok(
    authoritativeProgressIndex >=
      0 &&
    keywordCompletedIndex >=
      0 &&
    authoritativeProgressIndex <
      keywordCompletedIndex,
    "Authoritative collection did not start before keyword completion.",
  );

  assert.ok(
    keywordCheckpointIndex >=
      0 &&
    gateReleaseIndex >=
      0 &&
    keywordCheckpointIndex <
      gateReleaseIndex,
    "Authoritative row-start authority opened before keyword checkpoint persistence.",
  );

  console.log(
    "verified authoritative collection overlaps keyword execution: true",
  );

  console.log(
    "verified keyword checkpoint precedes authoritative staging gate release: true",
  );

  console.log(
    "verified deferred authoritative rowStartIndex: 4",
  );

  console.log(
    "successful overlap event order:",
    events.join(
      " -> ",
    ),
  );
}

async function runKeywordPartialCancellationCase(
  processClaimedNaverMediaSyncJob:
    (
      job:
        MediaSyncJobRecord,
      options:
        UnknownRecord,
    ) => Promise<UnknownRecord>,
): Promise<void> {
  const events:
    string[] = [];

  let gateUnexpectedlyReleased =
    false;

  let overlapCancelled =
    false;

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

    runAuthoritativeStaging:
      async (
        input:
          UnknownRecord,
      ) => {
        events.push(
          "authoritative:invoked",
        );

        await Promise.resolve();

        events.push(
          "authoritative:collection-progress",
        );

        try {
          const resolved =
            await requireDeferredRowStart(
              input,
            );

          gateUnexpectedlyReleased =
            true;

          events.push(
            `authoritative:unexpected-gate:${resolved}`,
          );

          return createAuthoritativeResult(
            resolved,
            2,
          );
        } catch (error) {
          overlapCancelled =
            true;

          events.push(
            "authoritative:cancelled-before-staging",
          );

          throw error;
        }
      },

    runKeywordStaging:
      async () => {
        events.push(
          "keyword:invoked",
        );

        await Promise.resolve();

        assert.ok(
          events.includes(
            "authoritative:collection-progress",
          ),
          "Authoritative speculative collection did not start in the partial case.",
        );

        events.push(
          "keyword:partial",
        );

        return createKeywordResult(
          "partial",
          2,
        );
      },

    saveCombinedCheckpoint:
      async (
        input:
          UnknownRecord,
      ) => {
        const checkpoint =
          input.checkpoint as
            UnknownRecord;

        const totalRows =
          Number(
            checkpoint.totalRows,
          );

        events.push(
          `checkpoint:keyword-partial:${totalRows}`,
        );

        return cloneJob(
          input.job as
            MediaSyncJobRecord,
          {
            raw_rows:
              totalRows,

            normalized_rows:
              totalRows,

            inserted_rows:
              totalRows,

            failed_rows:
              0,
          },
        );
      },

    releaseForResume:
      async (
        job:
          MediaSyncJobRecord,
      ) => {
        events.push(
          "release:keyword-partial",
        );

        return cloneJob(
          job,
          {
            status:
              "pending",

            started_at:
              null,
          },
        );
      },
  };

  const result =
    await processClaimedNaverMediaSyncJob(
      cloneJob(
        INITIAL_JOB,
      ),
      {
        enableAuthoritativeOverlap:
          true,

        orchestrationDependencies:
          orchestrationDependencies as
            never,
      },
    );

  assert.equal(
    result.status,
    "partial",
  );

  assert.equal(
    result.phase,
    "keyword",
  );

  assert.equal(
    gateUnexpectedlyReleased,
    false,
    "Keyword partial incorrectly opened authoritative staging authority.",
  );

  assert.equal(
    overlapCancelled,
    true,
    "Keyword partial did not cancel the speculative authoritative operation.",
  );

  assert.ok(
    events.includes(
      "authoritative:cancelled-before-staging",
    ),
    "Authoritative overlap cancellation was not observed.",
  );

  console.log(
    "verified keyword partial cancels authoritative overlap before staging authority: true",
  );

  console.log(
    "verified keyword partial authoritative staging writes represented by gate releases: 0",
  );

  console.log(
    "keyword partial event order:",
    events.join(
      " -> ",
    ),
  );
}

async function main():
  Promise<void> {
  /*
   * Production repositories initialize Supabase modules at import
   * time. These are non-secret fixture placeholders only.
   * All runtime operations used below are dependency-injected.
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

  await runSuccessfulOverlapCase(
    processClaimedNaverMediaSyncJob as
      never,
  );

  await runKeywordPartialCancellationCase(
    processClaimedNaverMediaSyncJob as
      never,
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
  );

  console.log(
    "fixture creates jobs: false",
  );

  console.log(
    "fixture mutates report pointers: false",
  );

  console.log(
    "NAVER_AUTHORITATIVE_OVERLAP_ORDER_VERIFICATION=PASS",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "Naver authoritative overlap order fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);

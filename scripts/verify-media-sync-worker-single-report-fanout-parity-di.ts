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

const RAW_COMPLETED_ROWS =
  14;

const RECONCILED_ROWS =
  12;

const RECONCILED_EXCLUDED_ROWS =
  RAW_COMPLETED_ROWS -
  RECONCILED_ROWS;

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
    "src/lib/media-sync/media-sync-report-fanout-repository.ts",
    "src/lib/media-sync/media-sync-snapshot-materialization-repository.ts",
    "src/lib/media-sync/media-sync-snapshot-activation-repository.ts",
    "src/lib/media-sync/media-sync-combined-processing-checkpoint-repository.ts",
    "src/lib/media-sync/media-sync-processing-checkpoint-repository.ts",
    "src/lib/media-sync/naver-searchads-brand-search-cross-grain-reconciliation-repository.ts",
    "src/lib/media-sync/naver-searchads-staging-orchestrator.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator.ts",
    "scripts/sql/create-reconcile-naver-searchads-brand-search-cross-grain-staging.sql",
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

  let reconciliationCount =
    0;

  let summaryCount =
    0;

  const completedLifecycleOrder:
    string[] = [];

  let fanoutTargetLoadCount =
    0;

  let projectionAuthorityLoadCount =
    0;

  let materializationCount =
    0;

  let activationCount =
    0;

  let finalizationCount =
    0;

  const currentIngestionByReportId =
    new Map<string, string>([
      [
        INITIAL_JOB.report_id,
        PREVIOUS_INGESTION_ID,
      ],
    ]);

  const publishedIngestionByReportId =
    new Map<string, string>([
      [
        INITIAL_JOB.report_id,
        PUBLISHED_INGESTION_ID,
      ],
    ]);

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

    reconcileStaging:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          expectedRows:
            number;
        },
      ) => {
        reconciliationCount +=
          1;

        completedLifecycleOrder.push(
          "reconciliation",
        );

        assert.equal(
          input.expectedRows,
          RAW_COMPLETED_ROWS,
        );

        assert.equal(
          input.job.inserted_rows,
          RAW_COMPLETED_ROWS,
        );

        const errorDetail =
          requireRecord(
            input.job.error_detail,
            "Completed job error_detail must be an object before reconciliation.",
          );

        const processingCheckpoint =
          requireRecord(
            errorDetail.processing_checkpoint,
            "Completed processing checkpoint must be an object before reconciliation.",
          );

        const collector =
          requireRecord(
            processingCheckpoint.collector,
            "Completed collector checkpoint must be an object before reconciliation.",
          );

        const reconciledCheckpoint = {
          ...processingCheckpoint,
          raw_rows:
            RECONCILED_ROWS,
          normalized_rows:
            RECONCILED_ROWS,
          inserted_rows:
            RECONCILED_ROWS,
          failed_rows:
            0,
          collector: {
            ...collector,
            next_row_index:
              RECONCILED_ROWS,
          },
          reconciliation: {
            kind:
              "brand_search_cross_grain_dedup_v1",
            version:
              1,
            source_rows:
              RAW_COMPLETED_ROWS,
            excluded_rows:
              RECONCILED_EXCLUDED_ROWS,
            retained_rows:
              RECONCILED_ROWS,
            mixed_campaign_count:
              1,
            matched_campaign_count:
              1,
            excluded_impressions:
              10,
            excluded_clicks:
              2,
            excluded_cost:
              0,
            excluded_conversions:
              1,
            excluded_revenue:
              100,
            applied_at:
              "2026-07-14T00:09:00.000Z",
          },
        };

        const reconciledJob =
          cloneJob(
            input.job,
            {
              raw_rows:
                RECONCILED_ROWS,
              normalized_rows:
                RECONCILED_ROWS,
              inserted_rows:
                RECONCILED_ROWS,
              failed_rows:
                0,
              error_detail: {
                ...errorDetail,
                processing_checkpoint:
                  reconciledCheckpoint as never,
              },
              updated_at:
                "2026-07-14T00:09:00.000Z",
            },
          );

        activeCheckpointJob =
          reconciledJob;

        return {
          kind:
            "brand_search_cross_grain_dedup_v1" as const,
          version:
            1 as const,
          changed:
            true,
          alreadyReconciled:
            false,
          sourceRows:
            RAW_COMPLETED_ROWS,
          excludedRows:
            RECONCILED_EXCLUDED_ROWS,
          retainedRows:
            RECONCILED_ROWS,
          mixedCampaignCount:
            1,
          matchedCampaignCount:
            1,
          remainingOverlapRows:
            0,
          excludedImpressions:
            10,
          excludedClicks:
            2,
          excludedCost:
            0,
          excludedConversions:
            1,
          excludedRevenue:
            100,
          job:
            reconciledJob,
          checkpoint: {
            version:
              1 as const,
            phase:
              "completed" as const,
            dateWindowIndex:
              0,
            nextRowIndex:
              RECONCILED_ROWS,
            totalRows:
              RECONCILED_ROWS,
            failedRows:
              0,
            keyword: {
              complete:
                true,
              cursor:
                keywordCursor as never,
              counts: {
                discovered:
                  2,
                completed:
                  2,
                statsRequestsAttempted:
                  2,
                statsRequestsSucceeded:
                  2,
                retryCount:
                  0,
              },
            },
            authoritative: {
              complete:
                true,
              cursor:
                authoritativeCursor as never,
              counts: {
                discovered:
                  5,
                completed:
                  5,
                statsRequestsAttempted:
                  5,
                statsRequestsSucceeded:
                  5,
                retryCount:
                  0,
              },
            },
          },
        };
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

        completedLifecycleOrder.push(
          "summary",
        );

        assert.equal(
          reconciliationCount,
          1,
          "Combined summary ran before reconciliation.",
        );

        assert.equal(
          input.expectedRows,
          RECONCILED_ROWS,
        );

        assert.equal(
          input.job.inserted_rows,
          RECONCILED_ROWS,
        );

        return createCompleteSummary(
          input.job.id,
          RECONCILED_ROWS,
        );
      },

    loadFanoutTargets:
      async (
        job:
          MediaSyncJobRecord,
      ) => {
        fanoutTargetLoadCount +=
          1;

        completedLifecycleOrder.push(
          `targets:${fanoutTargetLoadCount}`,
        );

        assert.equal(
          job.id,
          INITIAL_JOB.id,
        );

        assert.equal(
          job.report_id,
          INITIAL_JOB.report_id,
        );

        return [
          {
            reportId:
              INITIAL_JOB.report_id,
            primary:
              true,
          },
        ];
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
          targetReportId?:
            string;
        },
      ) => {
        materializationCount +=
          1;

        const targetReportId =
          input.targetReportId ??
          input.job.report_id;

        completedLifecycleOrder.push(
          `materialization:${targetReportId}`,
        );

        assert.equal(
          summaryCount,
          1,
          "Materialization ran before combined staging summary.",
        );

        assert.equal(
          fanoutTargetLoadCount,
          1,
          "Materialization started before the initial fanout target freeze.",
        );

        assert.equal(
          materializationCount,
          1,
          "A one-report mapping must materialize exactly once.",
        );

        assert.equal(
          targetReportId,
          INITIAL_JOB.report_id,
          "A one-report mapping materialized an unexpected report.",
        );

        assert.equal(
          input.summary.totalRows,
          RECONCILED_ROWS,
        );

        assert.equal(
          input.job.snapshot_ingestion_id,
          null,
          "The primary job snapshot mirror was already populated before materialization.",
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
            RECONCILED_ROWS,
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

    loadProjectionAuthority:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          reportId:
            string;
          snapshotIngestionId:
            string;
        },
      ) => {
        projectionAuthorityLoadCount +=
          1;

        completedLifecycleOrder.push(
          `projection:${input.reportId}`,
        );

        assert.equal(
          fanoutTargetLoadCount,
          2,
          "Projection authority loaded before the pre-activation fanout target revalidation.",
        );

        assert.equal(
          materializationCount,
          1,
          "Projection authority loaded before the primary report was materialized.",
        );

        assert.equal(
          projectionAuthorityLoadCount,
          1,
          "A one-report mapping must load exactly one projection authority.",
        );

        assert.equal(
          input.job.snapshot_ingestion_id,
          SNAPSHOT_INGESTION_ID,
          "Projection loading lost the primary job snapshot mirror.",
        );

        assert.equal(
          input.reportId,
          INITIAL_JOB.report_id,
        );

        assert.equal(
          input.snapshotIngestionId,
          SNAPSHOT_INGESTION_ID,
        );

        return {
          reportId:
            INITIAL_JOB.report_id,
          previousIngestionId:
            PREVIOUS_INGESTION_ID,
          snapshotIngestionId:
            SNAPSHOT_INGESTION_ID,
        };
      },

    activate:
      async (
        input: {
          job:
            MediaSyncJobRecord;
          expectedRows:
            number;
          projection?: {
            reportId:
              string;
            previousIngestionId:
              string | null;
            snapshotIngestionId:
              string;
          };
        },
      ) => {
        activationCount +=
          1;

        const projection =
          input.projection;

        assert.ok(
          projection,
          "Fanout activation must use exact projection authority.",
        );

        completedLifecycleOrder.push(
          `activation:${projection.reportId}`,
        );

        assert.equal(
          projectionAuthorityLoadCount,
          1,
          "Activation started before the primary projection authority was loaded.",
        );

        assert.equal(
          activationCount,
          1,
          "A one-report mapping must activate exactly once.",
        );

        assert.equal(
          input.expectedRows,
          RECONCILED_ROWS,
        );

        assert.equal(
          input.job.snapshot_ingestion_id,
          SNAPSHOT_INGESTION_ID,
          "Activation changed the primary compatibility snapshot mirror.",
        );

        assert.equal(
          projection.reportId,
          INITIAL_JOB.report_id,
        );

        assert.equal(
          projection.previousIngestionId,
          PREVIOUS_INGESTION_ID,
        );

        assert.equal(
          projection.snapshotIngestionId,
          SNAPSHOT_INGESTION_ID,
        );

        currentIngestionByReportId.set(
          INITIAL_JOB.report_id,
          SNAPSHOT_INGESTION_ID,
        );

        return {
          job:
            input.job,
          previousIngestionId:
            PREVIOUS_INGESTION_ID,
          snapshotIngestionId:
            SNAPSHOT_INGESTION_ID,
          currentIngestionId:
            SNAPSHOT_INGESTION_ID,
          publishedIngestionId:
            PUBLISHED_INGESTION_ID,
          rowCount:
            RECONCILED_ROWS,
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

        completedLifecycleOrder.push(
          "finalization",
        );

        assert.equal(
          fanoutTargetLoadCount,
          3,
          "Finalization started before the final fanout target revalidation.",
        );

        assert.equal(
          activationCount,
          1,
          "A one-report execution finalized before its primary projection was activated.",
        );

        assert.equal(
          finalizationCount,
          1,
          "Execution finalization ran more than once.",
        );

        assert.equal(
          input.job.report_id,
          INITIAL_JOB.report_id,
          "Execution finalization must remain primary-report scoped.",
        );

        assert.equal(
          input.job.snapshot_ingestion_id,
          SNAPSHOT_INGESTION_ID,
          "Execution finalization lost the primary compatibility snapshot mirror.",
        );

        assert.equal(
          input.expectedRows,
          RECONCILED_ROWS,
        );

        assert.equal(
          currentIngestionByReportId.get(
            INITIAL_JOB.report_id,
          ),
          SNAPSHOT_INGESTION_ID,
        );

        assert.equal(
          publishedIngestionByReportId.get(
            INITIAL_JOB.report_id,
          ),
          PUBLISHED_INGESTION_ID,
          "Primary published_ingestion_id changed before finalization.",
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
            SNAPSHOT_INGESTION_ID,
          publishedIngestionId:
            PUBLISHED_INGESTION_ID,
          rowCount:
            RECONCILED_ROWS,
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
    reconciliationCount,
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
    reconciliationCount,
    0,
    "Reconciliation ran before authoritative completion.",
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
    reconciliationCount,
    1,
  );

  assert.equal(
    summaryCount,
    1,
  );

  assert.equal(
    fanoutTargetLoadCount,
    3,
  );

  assert.equal(
    projectionAuthorityLoadCount,
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
    RECONCILED_ROWS,
  );

  assert.equal(
    thirdResult.staging.summary.totalRows,
    RECONCILED_ROWS,
  );

  assert.equal(
    thirdResult.staging.canonicalRowCount,
    RECONCILED_ROWS,
  );

  assert.equal(
    thirdResult.status === "completed"
      ? thirdResult.reconciliation.sourceRows
      : null,
    RAW_COMPLETED_ROWS,
  );

  assert.equal(
    thirdResult.status === "completed"
      ? thirdResult.reconciliation.excludedRows
      : null,
    RECONCILED_EXCLUDED_ROWS,
  );

  assert.equal(
    thirdResult.status === "completed"
      ? thirdResult.reconciliation.retainedRows
      : null,
    RECONCILED_ROWS,
  );

  if (thirdResult.status !== "completed") {
    throw new Error(
      "Expected completed full-fanout result.",
    );
  }

  assert.equal(
    thirdResult.reportId,
    INITIAL_JOB.report_id,
    "Legacy top-level reportId must remain the primary report.",
  );

  assert.equal(
    thirdResult.snapshotIngestionId,
    SNAPSHOT_INGESTION_ID,
    "Legacy top-level snapshotIngestionId must remain the primary snapshot.",
  );

  assert.equal(
    thirdResult.materialization.snapshotIngestionId,
    SNAPSHOT_INGESTION_ID,
    "Legacy top-level materialization must remain the primary projection result.",
  );

  assert.equal(
    thirdResult.activation.snapshotIngestionId,
    SNAPSHOT_INGESTION_ID,
    "Legacy top-level activation must remain the primary projection result.",
  );

  if (!thirdResult.fanout) {
    throw new Error(
      "Completed result is missing the additive fanout array.",
    );
  }

  assert.deepEqual(
    thirdResult.fanout.map(
      (entry) => ({
        reportId:
          entry.reportId,
        primary:
          entry.primary,
        snapshotIngestionId:
          entry.materialization.snapshotIngestionId,
        currentIngestionId:
          entry.activation.currentIngestionId,
      }),
    ),
    [
      {
        reportId:
          INITIAL_JOB.report_id,
        primary:
          true,
        snapshotIngestionId:
          SNAPSHOT_INGESTION_ID,
        currentIngestionId:
          SNAPSHOT_INGESTION_ID,
      },
    ],
  );

  assert.deepEqual(
    completedLifecycleOrder,
    [
      "reconciliation",
      "summary",
      "targets:1",
      `materialization:${INITIAL_JOB.report_id}`,
      "targets:2",
      `projection:${INITIAL_JOB.report_id}`,
      `activation:${INITIAL_JOB.report_id}`,
      "targets:3",
      "finalization",
    ],
  );

  assert.equal(
    currentIngestionByReportId.get(
      INITIAL_JOB.report_id,
    ),
    SNAPSHOT_INGESTION_ID,
  );


  assert.equal(
    publishedIngestionByReportId.get(
      INITIAL_JOB.report_id,
    ),
    PUBLISHED_INGESTION_ID,
    "Primary published_ingestion_id changed during combined worker orchestration.",
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
    "verified reconciliation and materialization calls before authoritative completion: 0 / 0",
  );

  console.log(
    "verified reconciliation calls after raw combined completion: 1",
  );

  console.log(
    "verified reconciliation rows: 14 raw / 2 excluded / 12 retained",
  );

  console.log(
    "verified completed lifecycle order: reconciliation / summary / targets / primary materialization / target revalidation / primary projection authority / primary activation / target revalidation / finalization",
  );

  console.log(
    "verified materialization calls after reconciled combined completion: 1",
  );

  console.log(
    "verified activation calls after materialization: 1",
  );

  console.log(
    "verified finalization calls after activation: 1",
  );

  console.log(
    "verified primary current_ingestion_id transition parity: true",
  );

  console.log(
    "verified primary published_ingestion_id remains unchanged: true",
  );

  console.log(
    "verified fanout target loads: 3",
  );

  console.log(
    "verified projection authority loads: 1",
  );

  console.log(
    "verified primary legacy top-level result compatibility: true",
  );

  console.log(
    "verified one-report lifecycle preserves primary-only activation semantics: true",
  );

  console.log(
    "verified raw completed checkpoint rows: 14",
  );

  console.log(
    "verified reconciled combined staging rows: 12",
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
    "MACRO4_B3_SINGLE_REPORT_FANOUT_PARITY_PASS=true",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "Media sync worker single-report fanout parity fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);

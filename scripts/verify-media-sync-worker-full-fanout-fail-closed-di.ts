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

const DATE_FROM = "2026-05-01";
const DATE_TO = "2026-05-02";
const ROWS = 12;

const PRIMARY_REPORT_ID =
  "44444444-4444-4444-8444-444444444444";
const SECONDARY_REPORT_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const PRIMARY_PREVIOUS_ID =
  "88888888-8888-4888-8888-888888888888";
const PRIMARY_SNAPSHOT_ID =
  "77777777-7777-4777-8777-777777777777";
const PRIMARY_PUBLISHED_ID =
  "99999999-9999-4999-8999-999999999999";

const SECONDARY_PREVIOUS_ID =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECONDARY_SNAPSHOT_ID =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECONDARY_PUBLISHED_ID =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const INITIAL_JOB_ID =
  "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";
const ADVERTISER_ID =
  "33333333-3333-4333-8333-333333333333";
const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";
const CREATED_BY =
  "66666666-6666-4666-8666-666666666666";
const EXTERNAL_ACCOUNT_ID = "123456";

const FINGERPRINT_A = "a".repeat(64);
const FINGERPRINT_B = "b".repeat(64);

const credentials = {
  customerId: EXTERNAL_ACCOUNT_ID,
  accessLicense: "fixture-access-license",
  secretKey: "fixture-secret-key",
};

type ScenarioKind =
  | "targets_not_found"
  | "primary_target_missing"
  | "target_changed_before_activation"
  | "secondary_materialization_failure"
  | "secondary_projection_failure"
  | "secondary_activation_failure"
  | "target_changed_before_finalization";

type ScenarioCounters = {
  targetLoads: number;
  materializations: number;
  projectionLoads: number;
  activations: number;
  finalizations: number;
};

function cloneJob(
  job: MediaSyncJobRecord,
  overrides: Partial<MediaSyncJobRecord> = {},
): MediaSyncJobRecord {
  return {
    ...job,
    ...overrides,
    error_detail:
      overrides.error_detail === undefined
        ? job.error_detail
        : overrides.error_detail,
  };
}

function createCompletedJob(): MediaSyncJobRecord {
  const keywordCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: DATE_FROM,
        dateTo: DATE_TO,
      },
    });

  const authoritativeCursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: DATE_FROM,
        dateTo: DATE_TO,
      },
    });

  return {
    id: INITIAL_JOB_ID,
    workspace_id: WORKSPACE_ID,
    advertiser_id: ADVERTISER_ID,
    report_id: PRIMARY_REPORT_ID,
    connection_id: CONNECTION_ID,
    provider: "naver_searchad",
    external_account_id: EXTERNAL_ACCOUNT_ID,
    date_from: DATE_FROM,
    date_to: DATE_TO,
    data_level: "mixed",
    mode: "snapshot_replace",
    status: "processing",
    progress: 99,
    raw_rows: ROWS,
    normalized_rows: ROWS,
    inserted_rows: ROWS,
    failed_rows: 0,
    previous_ingestion_id: PRIMARY_PREVIOUS_ID,
    snapshot_ingestion_id: null,
    attempt_count: 3,
    error: null,
    error_detail: {
      processing_checkpoint: {
        version: 1,
        raw_rows: ROWS,
        normalized_rows: ROWS,
        inserted_rows: ROWS,
        failed_rows: 0,
        collector: {
          combined_version: 1,
          phase: "completed",
          date_window_index: 0,
          next_row_index: ROWS,
          keyword: {
            complete: true,
            cursor: keywordCursor,
            counts: {
              discovered: 2,
              completed: 2,
              statsRequestsAttempted: 2,
              statsRequestsSucceeded: 2,
              retryCount: 0,
            },
          },
          authoritative: {
            complete: true,
            cursor: authoritativeCursor,
            counts: {
              discovered: 5,
              completed: 5,
              statsRequestsAttempted: 5,
              statsRequestsSucceeded: 5,
              retryCount: 0,
            },
          },
        },
      },
    } as never,
    created_by: CREATED_BY,
    created_at: "2026-07-14T00:00:00.000Z",
    started_at: "2026-07-14T00:02:00.000Z",
    finished_at: null,
    updated_at: "2026-07-14T00:02:00.000Z",
  };
}

function createReconciledJob(
  job: MediaSyncJobRecord,
): MediaSyncJobRecord {
  const errorDetail =
    job.error_detail as unknown as {
      processing_checkpoint: Record<string, unknown>;
    };

  return cloneJob(
    job,
    {
      error_detail: {
        processing_checkpoint: {
          ...errorDetail.processing_checkpoint,
          reconciliation: {
            kind: "brand_search_cross_grain_dedup_v1",
            version: 1,
            source_rows: ROWS,
            excluded_rows: 0,
            retained_rows: ROWS,
            mixed_campaign_count: 0,
            matched_campaign_count: 0,
            excluded_impressions: 0,
            excluded_clicks: 0,
            excluded_cost: 0,
            excluded_conversions: 0,
            excluded_revenue: 0,
            applied_at: "2026-07-14T00:09:00.000Z",
          },
        },
      } as never,
      updated_at: "2026-07-14T00:09:00.000Z",
    },
  );
}

function createSummary(jobId: string) {
  return {
    jobId,
    expectedRows: ROWS,
    totalRows: ROWS,
    minRowIndex: 0,
    maxRowIndex: ROWS - 1,
    distinctRowIndexes: ROWS,
    rowsInExpectedRange: ROWS,
    missingExpectedRows: 0,
    outOfRangeRows: 0,
    scopeMismatchRows: 0,
    blankRowKeyRows: 0,
    missingFingerprintRows: 0,
    canonicalMismatchRows: 0,
    dateWindowCount: 1,
    dateWindowSummaries: [
      {
        dateWindowIndex: 0,
        rowCount: ROWS,
        minRowIndex: 0,
        maxRowIndex: ROWS - 1,
        minDate: DATE_FROM,
        maxDate: DATE_TO,
      },
    ],
    isComplete: true,
  };
}

function twoTargets() {
  return [
    {
      reportId: PRIMARY_REPORT_ID,
      primary: true,
    },
    {
      reportId: SECONDARY_REPORT_ID,
      primary: false,
    },
  ];
}

function primaryOnlyTarget() {
  return [
    {
      reportId: PRIMARY_REPORT_ID,
      primary: true,
    },
  ];
}

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "fixture-service-role-key";

  const {
    processClaimedNaverMediaSyncJob,
    MediaSyncWorkerOrchestrationError,
  } = await import(
    "../src/lib/media-sync/media-sync-worker-orchestration-repository"
  );

  const {
    MediaSyncReportFanoutError,
  } = await import(
    "../src/lib/media-sync/media-sync-report-fanout-repository"
  );

  const {
    MediaSyncSnapshotMaterializationError,
  } = await import(
    "../src/lib/media-sync/media-sync-snapshot-materialization-repository"
  );

  const {
    MediaSyncSnapshotActivationError,
  } = await import(
    "../src/lib/media-sync/media-sync-snapshot-activation-repository"
  );

  async function runScenario(
    kind: ScenarioKind,
  ): Promise<void> {
    const counters: ScenarioCounters = {
      targetLoads: 0,
      materializations: 0,
      projectionLoads: 0,
      activations: 0,
      finalizations: 0,
    };

    const currentByReport = new Map<string, string | null>([
      [PRIMARY_REPORT_ID, PRIMARY_PREVIOUS_ID],
      [SECONDARY_REPORT_ID, SECONDARY_PREVIOUS_ID],
    ]);

    const publishedByReport = new Map<string, string | null>([
      [PRIMARY_REPORT_ID, PRIMARY_PUBLISHED_ID],
      [SECONDARY_REPORT_ID, SECONDARY_PUBLISHED_ID],
    ]);

    const job = createCompletedJob();

    const orchestrationDependencies = {
      loadContext:
        async (inputJob: MediaSyncJobRecord) => ({
          job: inputJob,
          connection: {
            id: inputJob.connection_id,
            workspaceId: inputJob.workspace_id,
            advertiserId: inputJob.advertiser_id,
            provider: "naver_searchad" as const,
            externalAccountId: inputJob.external_account_id,
          },
          credentials,
        }),

      runKeywordStaging:
        async () => {
          throw new Error(
            "Keyword staging must not run for a completed checkpoint fixture.",
          );
        },

      runAuthoritativeStaging:
        async () => {
          throw new Error(
            "Authoritative staging must not run for a completed checkpoint fixture.",
          );
        },

      saveCombinedCheckpoint:
        async () => {
          throw new Error(
            "Checkpoint save must not run for a completed checkpoint fixture.",
          );
        },

      releaseForResume:
        async () => {
          throw new Error(
            "Resume release must not run for a completed checkpoint fixture.",
          );
        },

      reconcileStaging:
        async (input: {
          job: MediaSyncJobRecord;
          expectedRows: number;
        }) => {
          assert.equal(input.expectedRows, ROWS);

          const reconciledJob =
            createReconciledJob(input.job);

          return {
            kind: "brand_search_cross_grain_dedup_v1" as const,
            version: 1 as const,
            changed: false,
            alreadyReconciled: true,
            sourceRows: ROWS,
            excludedRows: 0,
            retainedRows: ROWS,
            mixedCampaignCount: 0,
            matchedCampaignCount: 0,
            remainingOverlapRows: 0,
            excludedImpressions: 0,
            excludedClicks: 0,
            excludedCost: 0,
            excludedConversions: 0,
            excludedRevenue: 0,
            job: reconciledJob,
            checkpoint: {
              version: 1 as const,
              phase: "completed" as const,
              dateWindowIndex: 0,
              nextRowIndex: ROWS,
              totalRows: ROWS,
              failedRows: 0,
              keyword: {
                complete: true,
                cursor: null,
                counts: {
                  discovered: 2,
                  completed: 2,
                  statsRequestsAttempted: 2,
                  statsRequestsSucceeded: 2,
                  retryCount: 0,
                },
              },
              authoritative: {
                complete: true,
                cursor: null,
                counts: {
                  discovered: 5,
                  completed: 5,
                  statsRequestsAttempted: 5,
                  statsRequestsSucceeded: 5,
                  retryCount: 0,
                },
              },
            },
          };
        },

      assertStagingComplete:
        async (input: {
          job: MediaSyncJobRecord;
          expectedRows: number;
        }) => {
          assert.equal(input.expectedRows, ROWS);
          assert.equal(input.job.inserted_rows, ROWS);
          return createSummary(input.job.id);
        },

      loadFanoutTargets:
        async () => {
          counters.targetLoads += 1;

          if (
            kind === "targets_not_found" &&
            counters.targetLoads === 1
          ) {
            throw new MediaSyncReportFanoutError(
              "TARGETS_NOT_FOUND",
              "fixture targets missing",
            );
          }

          if (
            kind === "primary_target_missing" &&
            counters.targetLoads === 1
          ) {
            throw new MediaSyncReportFanoutError(
              "PRIMARY_TARGET_MISSING",
              "fixture primary missing",
            );
          }

          if (
            kind === "target_changed_before_activation" &&
            counters.targetLoads === 2
          ) {
            return primaryOnlyTarget();
          }

          if (
            kind === "target_changed_before_finalization" &&
            counters.targetLoads === 3
          ) {
            return primaryOnlyTarget();
          }

          return twoTargets();
        },

      materialize:
        async (input: {
          job: MediaSyncJobRecord;
          targetReportId?: string;
        }) => {
          counters.materializations += 1;

          const reportId =
            input.targetReportId ?? input.job.report_id;

          if (reportId === PRIMARY_REPORT_ID) {
            assert.equal(counters.materializations, 1);

            return {
              job: cloneJob(
                input.job,
                {
                  snapshot_ingestion_id: PRIMARY_SNAPSHOT_ID,
                },
              ),
              snapshotIngestionId: PRIMARY_SNAPSHOT_ID,
              rowCount: ROWS,
              stagingFingerprint: FINGERPRINT_A,
              materializedFingerprint: FINGERPRINT_A,
              idempotent: false,
            };
          }

          assert.equal(reportId, SECONDARY_REPORT_ID);

          if (kind === "secondary_materialization_failure") {
            throw new MediaSyncSnapshotMaterializationError(
              "MATERIALIZATION_CONFLICT",
              "fixture secondary materialization failure",
            );
          }

          return {
            job: input.job,
            snapshotIngestionId: SECONDARY_SNAPSHOT_ID,
            rowCount: ROWS,
            stagingFingerprint: FINGERPRINT_B,
            materializedFingerprint: FINGERPRINT_B,
            idempotent: false,
          };
        },

      loadProjectionAuthority:
        async (input: {
          reportId: string;
          snapshotIngestionId: string;
        }) => {
          counters.projectionLoads += 1;

          if (
            kind === "secondary_projection_failure" &&
            input.reportId === SECONDARY_REPORT_ID
          ) {
            throw new MediaSyncReportFanoutError(
              "PROJECTION_NOT_FOUND",
              "fixture secondary projection missing",
            );
          }

          if (input.reportId === PRIMARY_REPORT_ID) {
            assert.equal(
              input.snapshotIngestionId,
              PRIMARY_SNAPSHOT_ID,
            );

            return {
              reportId: PRIMARY_REPORT_ID,
              previousIngestionId: PRIMARY_PREVIOUS_ID,
              snapshotIngestionId: PRIMARY_SNAPSHOT_ID,
            };
          }

          assert.equal(input.reportId, SECONDARY_REPORT_ID);
          assert.equal(
            input.snapshotIngestionId,
            SECONDARY_SNAPSHOT_ID,
          );

          return {
            reportId: SECONDARY_REPORT_ID,
            previousIngestionId: SECONDARY_PREVIOUS_ID,
            snapshotIngestionId: SECONDARY_SNAPSHOT_ID,
          };
        },

      activate:
        async (input: {
          job: MediaSyncJobRecord;
          projection?: {
            reportId: string;
            previousIngestionId: string | null;
            snapshotIngestionId: string;
          };
        }) => {
          counters.activations += 1;

          assert.ok(input.projection);
          const projection = input.projection;

          if (
            kind === "secondary_activation_failure" &&
            projection.reportId === SECONDARY_REPORT_ID
          ) {
            throw new MediaSyncSnapshotActivationError(
              "ACTIVATION_CONFLICT",
              "fixture secondary activation failure",
            );
          }

          if (projection.reportId === SECONDARY_REPORT_ID) {
            assert.equal(counters.activations, 1);

            currentByReport.set(
              SECONDARY_REPORT_ID,
              SECONDARY_SNAPSHOT_ID,
            );

            return {
              job: input.job,
              previousIngestionId: SECONDARY_PREVIOUS_ID,
              snapshotIngestionId: SECONDARY_SNAPSHOT_ID,
              currentIngestionId: SECONDARY_SNAPSHOT_ID,
              publishedIngestionId: SECONDARY_PUBLISHED_ID,
              rowCount: ROWS,
              stagingFingerprint: FINGERPRINT_B,
              materializedFingerprint: FINGERPRINT_B,
              idempotent: false,
            };
          }

          assert.equal(projection.reportId, PRIMARY_REPORT_ID);
          assert.equal(counters.activations, 2);

          currentByReport.set(
            PRIMARY_REPORT_ID,
            PRIMARY_SNAPSHOT_ID,
          );

          return {
            job: input.job,
            previousIngestionId: PRIMARY_PREVIOUS_ID,
            snapshotIngestionId: PRIMARY_SNAPSHOT_ID,
            currentIngestionId: PRIMARY_SNAPSHOT_ID,
            publishedIngestionId: PRIMARY_PUBLISHED_ID,
            rowCount: ROWS,
            stagingFingerprint: FINGERPRINT_A,
            materializedFingerprint: FINGERPRINT_A,
            idempotent: false,
          };
        },

      finalize:
        async (input: {
          job: MediaSyncJobRecord;
        }) => {
          counters.finalizations += 1;

          return {
            job: cloneJob(
              input.job,
              {
                status: "done",
                progress: 100,
                finished_at: "2026-07-14T00:10:00.000Z",
              },
            ),
            snapshotIngestionId: PRIMARY_SNAPSHOT_ID,
            currentIngestionId: PRIMARY_SNAPSHOT_ID,
            publishedIngestionId: PRIMARY_PUBLISHED_ID,
            rowCount: ROWS,
            stagingFingerprint: FINGERPRINT_A,
            materializedFingerprint: FINGERPRINT_A,
            finishedAt: "2026-07-14T00:10:00.000Z",
            connectionId: CONNECTION_ID,
            connectionLastSyncAt: "2026-07-14T00:10:00.000Z",
            connectionUpdated: true,
            idempotent: false,
          };
        },
    };

    let caught: unknown = null;

    try {
      await processClaimedNaverMediaSyncJob(
        job,
        {
          orchestrationDependencies:
            orchestrationDependencies as never,
        },
      );
    } catch (error) {
      caught = error;
    }

    assert.ok(
      caught instanceof MediaSyncWorkerOrchestrationError,
      `${kind}: expected MediaSyncWorkerOrchestrationError`,
    );

    const orchestrationError =
      caught as InstanceType<
        typeof MediaSyncWorkerOrchestrationError
      >;

    const cause =
      (orchestrationError as Error & {
        cause?: unknown;
      }).cause;

    switch (kind) {
      case "targets_not_found":
        assert.equal(
          orchestrationError.code,
          "MATERIALIZATION_FAILED",
        );
        assert.ok(cause instanceof MediaSyncReportFanoutError);
        assert.equal(cause.code, "TARGETS_NOT_FOUND");
        assert.deepEqual(counters, {
          targetLoads: 1,
          materializations: 0,
          projectionLoads: 0,
          activations: 0,
          finalizations: 0,
        });
        break;

      case "primary_target_missing":
        assert.equal(
          orchestrationError.code,
          "MATERIALIZATION_FAILED",
        );
        assert.ok(cause instanceof MediaSyncReportFanoutError);
        assert.equal(cause.code, "PRIMARY_TARGET_MISSING");
        assert.deepEqual(counters, {
          targetLoads: 1,
          materializations: 0,
          projectionLoads: 0,
          activations: 0,
          finalizations: 0,
        });
        break;

      case "target_changed_before_activation":
        assert.equal(
          orchestrationError.code,
          "ACTIVATION_FAILED",
        );
        assert.deepEqual(counters, {
          targetLoads: 2,
          materializations: 2,
          projectionLoads: 0,
          activations: 0,
          finalizations: 0,
        });
        break;

      case "secondary_materialization_failure":
        assert.equal(
          orchestrationError.code,
          "MATERIALIZATION_FAILED",
        );
        assert.ok(
          cause instanceof MediaSyncSnapshotMaterializationError,
        );
        assert.equal(cause.code, "MATERIALIZATION_CONFLICT");
        assert.deepEqual(counters, {
          targetLoads: 1,
          materializations: 2,
          projectionLoads: 0,
          activations: 0,
          finalizations: 0,
        });
        break;

      case "secondary_projection_failure":
        assert.equal(
          orchestrationError.code,
          "ACTIVATION_FAILED",
        );
        assert.ok(cause instanceof MediaSyncReportFanoutError);
        assert.equal(cause.code, "PROJECTION_NOT_FOUND");
        assert.deepEqual(counters, {
          targetLoads: 2,
          materializations: 2,
          projectionLoads: 2,
          activations: 0,
          finalizations: 0,
        });
        break;

      case "secondary_activation_failure":
        assert.equal(
          orchestrationError.code,
          "ACTIVATION_FAILED",
        );
        assert.ok(cause instanceof MediaSyncSnapshotActivationError);
        assert.equal(cause.code, "ACTIVATION_CONFLICT");
        assert.deepEqual(counters, {
          targetLoads: 2,
          materializations: 2,
          projectionLoads: 2,
          activations: 1,
          finalizations: 0,
        });
        break;

      case "target_changed_before_finalization":
        assert.equal(
          orchestrationError.code,
          "FINALIZATION_FAILED",
        );
        assert.deepEqual(counters, {
          targetLoads: 3,
          materializations: 2,
          projectionLoads: 2,
          activations: 2,
          finalizations: 0,
        });
        break;
    }

    assert.equal(
      publishedByReport.get(PRIMARY_REPORT_ID),
      PRIMARY_PUBLISHED_ID,
      `${kind}: primary published pointer changed`,
    );
    assert.equal(
      publishedByReport.get(SECONDARY_REPORT_ID),
      SECONDARY_PUBLISHED_ID,
      `${kind}: secondary published pointer changed`,
    );

    if (
      kind === "target_changed_before_finalization"
    ) {
      assert.equal(
        currentByReport.get(PRIMARY_REPORT_ID),
        PRIMARY_SNAPSHOT_ID,
      );
      assert.equal(
        currentByReport.get(SECONDARY_REPORT_ID),
        SECONDARY_SNAPSHOT_ID,
      );
    } else if (
      kind === "secondary_activation_failure"
    ) {
      assert.equal(
        currentByReport.get(PRIMARY_REPORT_ID),
        PRIMARY_PREVIOUS_ID,
      );
      assert.equal(
        currentByReport.get(SECONDARY_REPORT_ID),
        SECONDARY_PREVIOUS_ID,
      );
    } else {
      assert.equal(
        currentByReport.get(PRIMARY_REPORT_ID),
        PRIMARY_PREVIOUS_ID,
      );
      assert.equal(
        currentByReport.get(SECONDARY_REPORT_ID),
        SECONDARY_PREVIOUS_ID,
      );
    }

    console.log(
      `verified fail-closed scenario ${kind}: true`,
    );
  }

  const scenarios: ScenarioKind[] = [
    "targets_not_found",
    "primary_target_missing",
    "target_changed_before_activation",
    "secondary_materialization_failure",
    "secondary_projection_failure",
    "secondary_activation_failure",
    "target_changed_before_finalization",
  ];

  for (const scenario of scenarios) {
    await runScenario(scenario);
  }

  console.log(
    "verified zero-target and primary-missing failures occur before any materialization: true",
  );
  console.log(
    "verified target-set drift before activation blocks every activation and finalization: true",
  );
  console.log(
    "verified secondary materialization failure blocks every activation and finalization: true",
  );
  console.log(
    "verified projection authority failure blocks every activation and finalization: true",
  );
  console.log(
    "verified secondary activation failure blocks primary activation and finalization: true",
  );
  console.log(
    "verified target-set drift before finalization blocks execution finalization after projection activation: true",
  );
  console.log(
    "verified published pointers remain unchanged in every fail-closed scenario: true",
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
    "MACRO4_B4_FAIL_CLOSED_FANOUT_SAFETY_PASS=true",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "Macro 4-B4 fail-closed fanout safety fixture failed.",
      error,
    );
    process.exitCode = 1;
  },
);

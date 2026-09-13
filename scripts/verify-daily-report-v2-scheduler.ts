import assert from "node:assert/strict";

import type {
  DailyReportV2ContiguousCoverage,
  DailyReportV2ParticipantCoverage,
} from "../src/lib/media-sync/daily-report-v2-contiguous-coverage-repository";
import {
  buildDailyReportV2DeterministicJobId,
  DailyReportV2SchedulerError,
  runDailyReportV2SchedulerOnce,
  type DailyReportV2SchedulerCandidate,
} from "../src/lib/media-sync/daily-report-v2-scheduler";
import type {
  SafeMediaSyncJob,
} from "../src/lib/media-sync/types";

const WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";

const ADVERTISER_ID =
  "33333333-3333-4333-8333-333333333333";

const CREATED_BY =
  "44444444-4444-4444-8444-444444444444";

const REPORT_A =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const REPORT_B =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const CONNECTION_NAVER =
  "55555555-5555-4555-8555-555555555555";

const CONNECTION_GOOGLE =
  "66666666-6666-4666-8666-666666666666";

const NOW =
  new Date(
    "2026-09-13T00:30:00.000Z",
  );

const TARGET_DATE =
  "2026-09-12";

function candidate(
  reportId:
    string,
): DailyReportV2SchedulerCandidate {
  return {
    reportId,
    workspaceId:
      WORKSPACE_ID,
    advertiserId:
      ADVERTISER_ID,
    createdBy:
      CREATED_BY,
    startDate:
      "2026-09-01",
  };
}

function participant(
  input: {
    provider:
      "naver_searchad" |
      "google_ads";
    connectionId:
      string;
    externalAccountId:
      string;
    firstMissingDate:
      string | null;
    completedThrough:
      string | null;
    targetCovered:
      boolean;
  },
): DailyReportV2ParticipantCoverage {
  return {
    connectionId:
      input.connectionId,
    provider:
      input.provider,
    externalAccountId:
      input.externalAccountId,
    connectionStatus:
      "active",
    startDate:
      "2026-09-01",
    throughDate:
      TARGET_DATE,
    completedThrough:
      input.completedThrough,
    firstMissingDate:
      input.firstMissingDate,
    contiguousDates:
      0,
    contiguousRows:
      0,
    targetCovered:
      input.targetCovered,
  };
}

function coverage(
  input: {
    reportId:
      string;
    participant:
      DailyReportV2ParticipantCoverage;
    firstMissingDate:
      string | null;
    completedThrough:
      string | null;
    targetCovered:
      boolean;
  },
): DailyReportV2ContiguousCoverage {
  return {
    reportId:
      input.reportId,
    workspaceId:
      WORKSPACE_ID,
    advertiserId:
      ADVERTISER_ID,
    startDate:
      "2026-09-01",
    throughDate:
      TARGET_DATE,
    participants: [
      input.participant,
    ],
    completedThrough:
      input.completedThrough,
    firstMissingDate:
      input.firstMissingDate,
    targetCovered:
      input.targetCovered,
  };
}

function job(
  input: {
    id:
      string;
    reportId:
      string;
    connectionId:
      string;
    provider:
      "naver_searchad" |
      "google_ads";
    externalAccountId:
      string;
    date:
      string;
    status:
      "pending" |
      "processing" |
      "done" |
      "failed";
  },
): SafeMediaSyncJob {
  return {
    id:
      input.id,
    workspace_id:
      WORKSPACE_ID,
    advertiser_id:
      ADVERTISER_ID,
    report_id:
      input.reportId,
    connection_id:
      input.connectionId,
    provider:
      input.provider,
    external_account_id:
      input.externalAccountId,
    date_from:
      input.date,
    date_to:
      input.date,
    data_level:
      "keyword",
    mode:
      "snapshot_replace",
    status:
      input.status,
    progress:
      input.status ===
        "done"
        ? 100
        : 0,
    raw_rows:
      0,
    normalized_rows:
      0,
    inserted_rows:
      0,
    failed_rows:
      input.status ===
        "failed"
        ? 1
        : 0,
    previous_ingestion_id:
      null,
    snapshot_ingestion_id:
      null,
    attempt_count:
      0,
    error:
      input.status ===
        "failed"
        ? "fixture"
        : null,
    error_detail:
      null,
    automation_contract:
      "daily_report_v2",
    sync_segment_progress:
      null,
    created_by:
      CREATED_BY,
    created_at:
      "2026-09-13T00:00:00.000Z",
    started_at:
      null,
    finished_at:
      input.status ===
        "done" ||
      input.status ===
        "failed"
        ? "2026-09-13T00:01:00.000Z"
        : null,
    updated_at:
      "2026-09-13T00:00:00.000Z",
  };
}

async function main() {
  const naverId =
    buildDailyReportV2DeterministicJobId({
      reportId:
        REPORT_B,
      connectionId:
        CONNECTION_NAVER,
      provider:
        "naver_searchad",
      date:
        "2026-09-09",
    });

  const naverIdReplay =
    buildDailyReportV2DeterministicJobId({
      reportId:
        REPORT_B,
      connectionId:
        CONNECTION_NAVER,
      provider:
        "naver_searchad",
      date:
        "2026-09-09",
    });

  const googleDifferentId =
    buildDailyReportV2DeterministicJobId({
      reportId:
        REPORT_B,
      connectionId:
        CONNECTION_NAVER,
      provider:
        "google_ads",
      date:
        "2026-09-09",
    });

  assert.equal(
    naverId,
    naverIdReplay,
  );

  assert.notEqual(
    naverId,
    googleDifferentId,
  );

  assert.match(
    naverId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  const createCalls:
    Array<
      Record<
        string,
        unknown
      >
    > =
      [];

  const result =
    await runDailyReportV2SchedulerOnce({
      now:
        NOW,
      dependencies: {
        listCandidates:
          async () => [
            candidate(
              REPORT_A,
            ),
            candidate(
              REPORT_B,
            ),
          ],

        listActiveJobsForReport:
          async () => [],

        loadCoverage:
          async (
            input,
          ) =>
            input.reportId ===
              REPORT_A
              ? coverage({
                  reportId:
                    REPORT_A,
                  participant:
                    participant({
                      provider:
                        "google_ads",
                      connectionId:
                        CONNECTION_GOOGLE,
                      externalAccountId:
                        "google-account",
                      firstMissingDate:
                        "2026-09-10",
                      completedThrough:
                        "2026-09-09",
                      targetCovered:
                        false,
                    }),
                  firstMissingDate:
                    "2026-09-10",
                  completedThrough:
                    "2026-09-09",
                  targetCovered:
                    false,
                })
              : coverage({
                  reportId:
                    REPORT_B,
                  participant:
                    participant({
                      provider:
                        "naver_searchad",
                      connectionId:
                        CONNECTION_NAVER,
                      externalAccountId:
                        "naver-account",
                      firstMissingDate:
                        "2026-09-09",
                      completedThrough:
                        "2026-09-08",
                      targetCovered:
                        false,
                    }),
                  firstMissingDate:
                    "2026-09-09",
                  completedThrough:
                    "2026-09-08",
                  targetCovered:
                    false,
                }),

        loadExactJob:
          async () =>
            null,

        createJob:
          async (
            input,
          ) => {
            createCalls.push(
              input,
            );

            return job({
              id:
                input.jobId,
              reportId:
                input.reportId,
              connectionId:
                input.connectionId,
              provider:
                input.connectionId ===
                  CONNECTION_NAVER
                  ? "naver_searchad"
                  : "google_ads",
              externalAccountId:
                input.connectionId ===
                  CONNECTION_NAVER
                  ? "naver-account"
                  : "google-account",
              date:
                input.dateFrom,
              status:
                "pending",
            });
          },
      },
    });

  assert.equal(
    result.targetDate,
    TARGET_DATE,
  );

  assert.equal(
    result.action,
    "created_or_replayed",
  );

  assert.equal(
    result.reportId,
    REPORT_B,
  );

  assert.equal(
    result.provider,
    "naver_searchad",
  );

  assert.equal(
    result.date,
    "2026-09-09",
  );

  assert.equal(
    createCalls.length,
    1,
  );

  assert.deepEqual(
    createCalls[0],
    {
      reportId:
        REPORT_B,
      jobId:
        naverId,
      connectionId:
        CONNECTION_NAVER,
      workspaceId:
        WORKSPACE_ID,
      advertiserId:
        ADVERTISER_ID,
      createdBy:
        CREATED_BY,
      dateFrom:
        "2026-09-09",
      dateTo:
        "2026-09-09",
      dataLevel:
        "keyword",
      mode:
        "snapshot_replace",
    },
  );

  const activeSkipCalls:
    string[] =
      [];

  const activeSkip =
    await runDailyReportV2SchedulerOnce({
      now:
        NOW,
      dependencies: {
        listCandidates:
          async () => [
            candidate(
              REPORT_A,
            ),
            candidate(
              REPORT_B,
            ),
          ],

        listActiveJobsForReport:
          async (
            input,
          ) => {
            activeSkipCalls.push(
              input.reportId,
            );

            if (
              input.reportId ===
                REPORT_B
            ) {
              return [
                job({
                  id:
                    "77777777-7777-4777-8777-777777777777",
                  reportId:
                    REPORT_B,
                  connectionId:
                    CONNECTION_NAVER,
                  provider:
                    "naver_searchad",
                  externalAccountId:
                    "naver-account",
                  date:
                    "2026-09-09",
                  status:
                    "processing",
                }),
              ];
            }

            return [];
          },

        loadCoverage:
          async (
            input,
          ) =>
            input.reportId ===
              REPORT_A
              ? coverage({
                  reportId:
                    REPORT_A,
                  participant:
                    participant({
                      provider:
                        "google_ads",
                      connectionId:
                        CONNECTION_GOOGLE,
                      externalAccountId:
                        "google-account",
                      firstMissingDate:
                        "2026-09-10",
                      completedThrough:
                        "2026-09-09",
                      targetCovered:
                        false,
                    }),
                  firstMissingDate:
                    "2026-09-10",
                  completedThrough:
                    "2026-09-09",
                  targetCovered:
                    false,
                })
              : (() => {
                  throw new Error(
                    "active report coverage must not be loaded",
                  );
                })(),

        loadExactJob:
          async () =>
            null,

        createJob:
          async (
            input,
          ) =>
            job({
              id:
                input.jobId,
              reportId:
                input.reportId,
              connectionId:
                input.connectionId,
              provider:
                "google_ads",
              externalAccountId:
                "google-account",
              date:
                input.dateFrom,
              status:
                "pending",
            }),
      },
    });

  assert.equal(
    activeSkip.action,
    "created_or_replayed",
  );

  assert.equal(
    activeSkip.reportId,
    REPORT_A,
  );

  assert.ok(
    activeSkipCalls.includes(
      REPORT_B,
    ),
  );

  const selectedJobId =
    buildDailyReportV2DeterministicJobId({
      reportId:
        REPORT_B,
      connectionId:
        CONNECTION_NAVER,
      provider:
        "naver_searchad",
      date:
        "2026-09-09",
    });

  await assert.rejects(
    () =>
      runDailyReportV2SchedulerOnce({
        now:
          NOW,
        dependencies: {
          listCandidates:
            async () => [
              candidate(
                REPORT_B,
              ),
            ],

          listActiveJobsForReport:
            async () => [],

          loadCoverage:
            async () =>
              coverage({
                reportId:
                  REPORT_B,
                participant:
                  participant({
                    provider:
                      "naver_searchad",
                    connectionId:
                      CONNECTION_NAVER,
                    externalAccountId:
                      "naver-account",
                    firstMissingDate:
                      "2026-09-09",
                    completedThrough:
                      "2026-09-08",
                    targetCovered:
                      false,
                  }),
                firstMissingDate:
                  "2026-09-09",
                completedThrough:
                  "2026-09-08",
                targetCovered:
                  false,
              }),

          loadExactJob:
            async () =>
              job({
                id:
                  selectedJobId,
                reportId:
                  REPORT_B,
                connectionId:
                  CONNECTION_NAVER,
                provider:
                  "naver_searchad",
                externalAccountId:
                  "naver-account",
                date:
                  "2026-09-09",
                status:
                  "failed",
              }),

          createJob:
            async () => {
              throw new Error(
                "failed exact job must block create",
              );
            },
        },
      }),
    (
      error,
    ) =>
      error instanceof
        DailyReportV2SchedulerError &&
      error.code ===
        "EXACT_JOB_FAILED",
  );

  await assert.rejects(
    () =>
      runDailyReportV2SchedulerOnce({
        now:
          NOW,
        dependencies: {
          listCandidates:
            async () => [
              candidate(
                REPORT_B,
              ),
            ],

          listActiveJobsForReport:
            async () => [],

          loadCoverage:
            async () =>
              coverage({
                reportId:
                  REPORT_B,
                participant:
                  participant({
                    provider:
                      "naver_searchad",
                    connectionId:
                      CONNECTION_NAVER,
                    externalAccountId:
                      "naver-account",
                    firstMissingDate:
                      "2026-09-09",
                    completedThrough:
                      "2026-09-08",
                    targetCovered:
                      false,
                  }),
                firstMissingDate:
                  "2026-09-09",
                completedThrough:
                  "2026-09-08",
                targetCovered:
                  false,
              }),

          loadExactJob:
            async () =>
              job({
                id:
                  selectedJobId,
                reportId:
                  REPORT_B,
                connectionId:
                  CONNECTION_NAVER,
                provider:
                  "naver_searchad",
                externalAccountId:
                  "naver-account",
                date:
                  "2026-09-09",
                status:
                  "done",
              }),

          createJob:
            async () => {
              throw new Error(
                "done-with-missing-partition must block create",
              );
            },
        },
      }),
    (
      error,
    ) =>
      error instanceof
        DailyReportV2SchedulerError &&
      error.code ===
        "CONTINUITY_INVALID",
  );

  let activeGateCount =
    0;

  let jitCreateCalls =
    0;

  const jitResult =
    await runDailyReportV2SchedulerOnce({
      now:
        NOW,
      dependencies: {
        listCandidates:
          async () => [
            candidate(
              REPORT_B,
            ),
          ],

        listActiveJobsForReport:
          async () => {
            activeGateCount +=
              1;

            return activeGateCount ===
              1
              ? []
              : [
                  job({
                    id:
                      "88888888-8888-4888-8888-888888888888",
                    reportId:
                      REPORT_B,
                    connectionId:
                      CONNECTION_NAVER,
                    provider:
                      "naver_searchad",
                    externalAccountId:
                      "naver-account",
                    date:
                      "2026-09-09",
                    status:
                      "processing",
                  }),
                ];
          },

        loadCoverage:
          async () =>
            coverage({
              reportId:
                REPORT_B,
              participant:
                participant({
                  provider:
                    "naver_searchad",
                  connectionId:
                    CONNECTION_NAVER,
                  externalAccountId:
                    "naver-account",
                  firstMissingDate:
                    "2026-09-09",
                  completedThrough:
                    "2026-09-08",
                  targetCovered:
                    false,
                }),
              firstMissingDate:
                "2026-09-09",
              completedThrough:
                "2026-09-08",
              targetCovered:
                false,
            }),

        loadExactJob:
          async () =>
            null,

        createJob:
          async () => {
            jitCreateCalls +=
              1;

            throw new Error(
              "JIT active gate must block create",
            );
          },
      },
    });

  assert.equal(
    jitResult.action,
    "noop_active_report_job",
  );

  assert.equal(
    jitCreateCalls,
    0,
  );

  console.log(
    "D10G_TARGET_PREVIOUS_COMPLETED_SEOUL_DATE=PASS",
  );

  console.log(
    "D10G_DETERMINISTIC_ID_INCLUDES_PROVIDER=PASS",
  );

  console.log(
    "D10G_ONE_JOB_PER_RUN=PASS",
  );

  console.log(
    "D10G_OLDEST_GAP_FIRST=PASS",
  );

  console.log(
    "D10G_ACTIVE_REPORT_SKIPPED=PASS",
  );

  console.log(
    "D10G_FAILED_EXACT_JOB_HARD_BLOCK=PASS",
  );

  console.log(
    "D10G_DONE_WITH_MISSING_PARTITION_FAIL_CLOSED=PASS",
  );

  console.log(
    "D10G_JIT_ACTIVE_GATE=PASS",
  );

  console.log(
    "D10G_EXACT_DAY_KEYWORD_SNAPSHOT_REPLACE=PASS",
  );

  console.log(
    "D10G_OFFLINE_SEMANTIC_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "LIVE_PROVIDER_API_CALLS=0",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

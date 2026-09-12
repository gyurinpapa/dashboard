import assert from "node:assert/strict";

import {
  NaverDailyReportSchedulerError,
  runNaverDailyReportSchedulerOnce,
  type NaverDailyReportCandidate,
} from "../src/lib/media-sync/naver-searchads-daily-report-scheduler";

function candidate(
  input: {
    reportId: string;
    connectionId?: string;
    periodStart?: string;
    periodEnd?: string;
  },
): NaverDailyReportCandidate {
  return {
    reportId:
      input.reportId,
    connectionId:
      input.connectionId ??
      `${input.reportId}-connection`,
    workspaceId:
      "workspace-1",
    advertiserId:
      "advertiser-1",
    createdBy:
      "user-1",
    periodStart:
      input.periodStart ??
      "2026-09-01",
    periodEnd:
      input.periodEnd ??
      "2026-09-30",
  };
}

function job(
  input: {
    id: string;
    reportId: string;
    connectionId: string;
    date: string;
    status:
      | "pending"
      | "processing"
      | "done"
      | "failed";
  },
) {
  return {
    id:
      input.id,
    workspace_id:
      "workspace-1",
    advertiser_id:
      "advertiser-1",
    report_id:
      input.reportId,
    connection_id:
      input.connectionId,
    provider:
      "naver_searchad",
    external_account_id:
      "account-1",
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
      input.status === "done"
        ? 100
        : 0,
    raw_rows: 0,
    normalized_rows: 0,
    inserted_rows: 0,
    failed_rows: 0,
    previous_ingestion_id: null,
    snapshot_ingestion_id: null,
    attempt_count: 0,
    error: null,
    error_detail: null,
    created_by:
      "user-1",
    created_at:
      "2026-09-12T00:00:00.000Z",
    started_at: null,
    finished_at: null,
    updated_at:
      "2026-09-12T00:00:00.000Z",
  } as any;
}

const NOW =
  new Date(
    "2026-09-12T02:00:00.000Z",
  );

async function verifyInitialActiveGate() {
  let candidateCalls = 0;
  let createCalls = 0;

  const result =
    await runNaverDailyReportSchedulerOnce({
      now: NOW,
      dependencies: {
        listActiveNaverJobs:
          async () => [
            job({
              id: "active-1",
              reportId: "existing",
              connectionId: "existing-connection",
              date: "2026-09-11",
              status: "processing",
            }),
          ],

        listCandidates:
          async () => {
            candidateCalls += 1;
            return [];
          },

        loadPartitionCoverage:
          async () => [],

        loadExactJob:
          async () => null,

        createJob:
          async () => {
            createCalls += 1;
            throw new Error(
              "CREATE_MUST_NOT_RUN"
            );
          },
      },
    });

  assert.equal(
    result.action,
    "noop_active_naver_job",
  );
  assert.equal(
    candidateCalls,
    0,
  );
  assert.equal(
    createCalls,
    0,
  );

  console.log(
    "INITIAL_ACTIVE_GATE=PASS",
  );
}

async function verifyEarliestMissingSelection() {
  let activeCalls = 0;
  let createCalls = 0;
  let selectedDate = "";
  let selectedReport = "";

  const candidates = [
    candidate({
      reportId: "report-b",
    }),
    candidate({
      reportId: "report-a",
    }),
  ];

  const result =
    await runNaverDailyReportSchedulerOnce({
      now: NOW,
      dependencies: {
        listActiveNaverJobs:
          async () => {
            activeCalls += 1;
            return [];
          },

        listCandidates:
          async () =>
            candidates,

        loadPartitionCoverage:
          async (input) => {
            if (
              input.connectionId ===
              "report-a-connection"
            ) {
              return [
                "2026-09-01",
              ];
            }

            return [
              "2026-09-01",
              "2026-09-02",
            ];
          },

        buildJobId:
          ({ reportId, date }) =>
            `${reportId}:${date}`,

        loadExactJob:
          async () => null,

        createJob:
          async (input) => {
            createCalls += 1;
            selectedDate =
              input.date;
            selectedReport =
              input.reportId;

            return job({
              id:
                `${input.reportId}:${input.date}`,
              reportId:
                input.reportId,
              connectionId:
                input.connectionId,
              date:
                input.date,
              status:
                "pending",
            });
          },
      },
    });

  assert.equal(
    activeCalls,
    2,
  );
  assert.equal(
    createCalls,
    1,
  );
  assert.equal(
    selectedReport,
    "report-a",
  );
  assert.equal(
    selectedDate,
    "2026-09-02",
  );
  assert.equal(
    result.action,
    "created_or_replayed",
  );
  assert.equal(
    result.reportId,
    "report-a",
  );
  assert.equal(
    result.date,
    "2026-09-02",
  );

  console.log(
    "EARLIEST_MISSING_SELECTION=PASS",
  );
  console.log(
    "ONE_JOB_PER_INVOCATION=PASS",
  );
  console.log(
    "JIT_ACTIVE_GATE_CALLS=2",
  );
}

async function verifyTieBreakByReportId() {
  let createdReport = "";

  const result =
    await runNaverDailyReportSchedulerOnce({
      now: NOW,
      dependencies: {
        listActiveNaverJobs:
          async () => [],

        listCandidates:
          async () => [
            candidate({
              reportId: "report-z",
            }),
            candidate({
              reportId: "report-a",
            }),
          ],

        loadPartitionCoverage:
          async () => [],

        buildJobId:
          ({ reportId, date }) =>
            `${reportId}:${date}`,

        loadExactJob:
          async () => null,

        createJob:
          async (input) => {
            createdReport =
              input.reportId;

            return job({
              id:
                `${input.reportId}:${input.date}`,
              reportId:
                input.reportId,
              connectionId:
                input.connectionId,
              date:
                input.date,
              status:
                "pending",
            });
          },
      },
    });

  assert.equal(
    createdReport,
    "report-a",
  );
  assert.equal(
    result.date,
    "2026-09-01",
  );

  console.log(
    "DETERMINISTIC_REPORT_TIEBREAK=PASS",
  );
}

async function verifyAllCovered() {
  let createCalls = 0;

  const coverage = Array.from(
    { length: 11 },
    (_, index) => {
      const day =
        String(index + 1)
          .padStart(2, "0");

      return `2026-09-${day}`;
    },
  );

  const result =
    await runNaverDailyReportSchedulerOnce({
      now: NOW,
      dependencies: {
        listActiveNaverJobs:
          async () => [],

        listCandidates:
          async () => [
            candidate({
              reportId: "report-covered",
            }),
          ],

        loadPartitionCoverage:
          async () =>
            coverage,

        loadExactJob:
          async () => null,

        createJob:
          async () => {
            createCalls += 1;
            throw new Error(
              "CREATE_MUST_NOT_RUN"
            );
          },
      },
    });

  assert.equal(
    result.action,
    "noop_all_covered",
  );
  assert.equal(
    createCalls,
    0,
  );

  console.log(
    "ALL_COVERED_NOOP=PASS",
  );
}

async function verifyExactPendingNoop() {
  let createCalls = 0;

  const report =
    candidate({
      reportId: "report-existing",
    });

  const result =
    await runNaverDailyReportSchedulerOnce({
      now: NOW,
      dependencies: {
        listActiveNaverJobs:
          async () => [],

        listCandidates:
          async () => [
            report,
          ],

        loadPartitionCoverage:
          async () => [],

        buildJobId:
          ({ reportId, date }) =>
            `${reportId}:${date}`,

        loadExactJob:
          async (jobId) =>
            job({
              id:
                jobId,
              reportId:
                report.reportId,
              connectionId:
                report.connectionId,
              date:
                "2026-09-01",
              status:
                "pending",
            }),

        createJob:
          async () => {
            createCalls += 1;
            throw new Error(
              "CREATE_MUST_NOT_RUN"
            );
          },
      },
    });

  assert.equal(
    result.action,
    "noop_existing_active",
  );
  assert.equal(
    result.status,
    "pending",
  );
  assert.equal(
    createCalls,
    0,
  );

  console.log(
    "EXACT_PENDING_NOOP=PASS",
  );
}

async function verifyExactFailedBlocksRetry() {
  const report =
    candidate({
      reportId: "report-failed",
    });

  await assert.rejects(
    () =>
      runNaverDailyReportSchedulerOnce({
        now: NOW,
        dependencies: {
          listActiveNaverJobs:
            async () => [],

          listCandidates:
            async () => [
              report,
            ],

          loadPartitionCoverage:
            async () => [],

          buildJobId:
            ({ reportId, date }) =>
              `${reportId}:${date}`,

          loadExactJob:
            async (jobId) =>
              job({
                id:
                  jobId,
                reportId:
                  report.reportId,
                connectionId:
                  report.connectionId,
                date:
                  "2026-09-01",
                status:
                  "failed",
              }),

          createJob:
            async () => {
              throw new Error(
                "CREATE_MUST_NOT_RUN"
              );
            },
        },
      }),

    (error: unknown) =>
      error instanceof
        NaverDailyReportSchedulerError &&
      error.code ===
        "EXACT_JOB_FAILED",
  );

  console.log(
    "FAILED_JOB_NO_AUTO_RETRY=PASS",
  );
}

async function verifyJitRaceGate() {
  let activeCalls = 0;
  let createCalls = 0;

  const result =
    await runNaverDailyReportSchedulerOnce({
      now: NOW,
      dependencies: {
        listActiveNaverJobs:
          async () => {
            activeCalls += 1;

            if (
              activeCalls === 1
            ) {
              return [];
            }

            return [
              job({
                id: "raced-job",
                reportId:
                  "other-report",
                connectionId:
                  "other-connection",
                date:
                  "2026-09-11",
                status:
                  "pending",
              }),
            ];
          },

        listCandidates:
          async () => [
            candidate({
              reportId:
                "report-race",
            }),
          ],

        loadPartitionCoverage:
          async () => [],

        buildJobId:
          ({ reportId, date }) =>
            `${reportId}:${date}`,

        loadExactJob:
          async () => null,

        createJob:
          async () => {
            createCalls += 1;
            throw new Error(
              "CREATE_MUST_NOT_RUN"
            );
          },
      },
    });

  assert.equal(
    activeCalls,
    2,
  );
  assert.equal(
    createCalls,
    0,
  );
  assert.equal(
    result.action,
    "noop_active_naver_job",
  );

  console.log(
    "JIT_ACTIVE_RACE_GATE=PASS",
  );
}

async function verifyDuplicateCandidateFailsClosed() {
  await assert.rejects(
    () =>
      runNaverDailyReportSchedulerOnce({
        now: NOW,
        dependencies: {
          listActiveNaverJobs:
            async () => [],

          listCandidates:
            async () => [
              candidate({
                reportId:
                  "report-duplicate",
              }),
              candidate({
                reportId:
                  "report-duplicate",
                connectionId:
                  "another-connection",
              }),
            ],

          loadPartitionCoverage:
            async () => [],

          loadExactJob:
            async () => null,
        },
      }),

    (error: unknown) =>
      error instanceof
        NaverDailyReportSchedulerError &&
      error.code ===
        "DUPLICATE_CANDIDATE",
  );

  console.log(
    "DUPLICATE_REPORT_FAIL_CLOSED=PASS",
  );
}

async function main() {
  await verifyInitialActiveGate();
  await verifyEarliestMissingSelection();
  await verifyTieBreakByReportId();
  await verifyAllCovered();
  await verifyExactPendingNoop();
  await verifyExactFailedBlocksRetry();
  await verifyJitRaceGate();
  await verifyDuplicateCandidateFailsClosed();

  console.log(
    "STAGE_C2_CORE_VERIFICATION=PASS",
  );
  console.log(
    "DATABASE_CALLS=0",
  );
  console.log(
    "NAVER_API_CALLS=0",
  );
  console.log(
    "JOB_CREATION_REAL=0",
  );
}

void main();

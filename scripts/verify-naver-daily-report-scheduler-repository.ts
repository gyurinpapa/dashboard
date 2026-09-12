import assert from "node:assert/strict";

import {
  NaverDailyReportSchedulerRepositoryError,
  createNaverDailyReportSchedulerDatabaseDependencies,
} from "../src/lib/media-sync/naver-searchads-daily-report-scheduler-repository";
import {
  runNaverDailyReportSchedulerOnce,
} from "../src/lib/media-sync/naver-searchads-daily-report-scheduler";

function reportRow(
  id: string,
) {
  return {
    id,
    workspace_id:
      "workspace-1",
    advertiser_id:
      "advertiser-1",
    created_by:
      "user-1",
    status:
      "draft",
    draft_period_start:
      "2026-09-01",
    draft_period_end:
      "2026-09-30",
    period_start: null,
    period_end: null,
    meta: {
      data_source: {
        kind: "api",
        data_level:
          "keyword",
        mode:
          "snapshot_replace",
      },
      media_sync: {
        auto_sync: {
          enabled: true,
          contract:
            "naver_daily_report_v1",
        },
      },
    },
  };
}

function connection(
  id: string,
) {
  return {
    id,
    workspace_id:
      "workspace-1",
    advertiser_id:
      "advertiser-1",
    provider:
      "naver_searchad",
    external_account_id:
      `account-${id}`,
    external_account_name:
      "Naver",
    status:
      "active",
    has_credentials: true,
    connected_at: null,
    last_verified_at:
      "2026-09-01T00:00:00.000Z",
    last_sync_at: null,
    last_error: null,
    meta: {},
    created_by:
      "user-1",
    created_at:
      "2026-09-01T00:00:00.000Z",
    updated_at:
      "2026-09-01T00:00:00.000Z",
  } as any;
}

function job(
  input: {
    id: string;
    reportId: string;
    connectionId: string;
    date: string;
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
      `account-${input.connectionId}`,
    date_from:
      input.date,
    date_to:
      input.date,
    data_level:
      "keyword",
    mode:
      "snapshot_replace",
    status:
      "pending",
    progress: 0,
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

async function verifyCandidateDiscovery() {
  const deps =
    createNaverDailyReportSchedulerDatabaseDependencies({
      listReportRows:
        async () => [
          reportRow(
            "report-a",
          ),
        ],

      listReportConnectionIds:
        async () => [
          "connection-a",
        ],

      getSafeConnection:
        async ({ connectionId }) =>
          connection(
            connectionId,
          ),

      listActiveNaverJobs:
        async () => [],

      listPartitionDates:
        async () => [],

      loadExactJob:
        async () => null,
    });

  const candidates =
    await deps
      .listCandidates({
        targetDate:
          "2026-09-11",
      });

  assert.equal(
    candidates.length,
    1,
  );

  assert.deepEqual(
    candidates[0],
    {
      reportId:
        "report-a",
      connectionId:
        "connection-a",
      workspaceId:
        "workspace-1",
      advertiserId:
        "advertiser-1",
      createdBy:
        "user-1",
      periodStart:
        "2026-09-01",
      periodEnd:
        "2026-09-30",
    },
  );

  console.log(
    "DB_ADAPTER_CANDIDATE_DISCOVERY=PASS",
  );
}

async function verifyMappingFailClosed() {
  const deps =
    createNaverDailyReportSchedulerDatabaseDependencies({
      listReportRows:
        async () => [
          reportRow(
            "report-a",
          ),
        ],

      listReportConnectionIds:
        async () => [
          "connection-a",
          "connection-b",
        ],

      getSafeConnection:
        async () =>
          connection(
            "connection-a",
          ),

      listActiveNaverJobs:
        async () => [],

      listPartitionDates:
        async () => [],

      loadExactJob:
        async () => null,
    });

  await assert.rejects(
    () =>
      deps.listCandidates({
        targetDate:
          "2026-09-11",
      }),

    (error: unknown) =>
      error instanceof
        NaverDailyReportSchedulerRepositoryError &&
      error.code ===
        "INVALID_MAPPING",
  );

  console.log(
    "DB_ADAPTER_MULTI_MAPPING_FAIL_CLOSED=PASS",
  );
}

async function verifyUnverifiedFailClosed() {
  const deps =
    createNaverDailyReportSchedulerDatabaseDependencies({
      listReportRows:
        async () => [
          reportRow(
            "report-a",
          ),
        ],

      listReportConnectionIds:
        async () => [
          "connection-a",
        ],

      getSafeConnection:
        async ({ connectionId }) => ({
          ...connection(
            connectionId,
          ),
          last_verified_at:
            null,
          last_sync_at:
            null,
        }),

      listActiveNaverJobs:
        async () => [],

      listPartitionDates:
        async () => [],

      loadExactJob:
        async () => null,
    });

  await assert.rejects(
    () =>
      deps.listCandidates({
        targetDate:
          "2026-09-11",
      }),

    (error: unknown) =>
      error instanceof
        NaverDailyReportSchedulerRepositoryError &&
      error.code ===
        "INVALID_CONNECTION",
  );

  console.log(
    "DB_ADAPTER_UNVERIFIED_FAIL_CLOSED=PASS",
  );
}

async function verifyCoverageScope() {
  const captured = {
    externalAccountId: "",
  };

  const deps =
    createNaverDailyReportSchedulerDatabaseDependencies({
      listReportRows:
        async () => [],

      listReportConnectionIds:
        async () => [],

      getSafeConnection:
        async ({ connectionId }) =>
          connection(
            connectionId,
          ),

      listActiveNaverJobs:
        async () => [],

      listPartitionDates:
        async (input) => {
          captured.externalAccountId =
            input.externalAccountId;

          return [
            "2026-09-01",
            "2026-09-02",
          ];
        },

      loadExactJob:
        async () => null,
    });

  const dates =
    await deps
      .loadPartitionCoverage({
        connectionId:
          "connection-a",
        workspaceId:
          "workspace-1",
        advertiserId:
          "advertiser-1",
        dateFrom:
          "2026-09-01",
        dateTo:
          "2026-09-11",
      });

  assert.deepEqual(
    dates,
    [
      "2026-09-01",
      "2026-09-02",
    ],
  );

  assert.equal(
    captured.externalAccountId,
    "account-connection-a",
  );

  console.log(
    "DB_ADAPTER_FACT_SCOPE=PASS",
  );
}

async function verifyCoreIntegration() {
  let created = 0;

  const adapter =
    createNaverDailyReportSchedulerDatabaseDependencies({
      listReportRows:
        async () => [
          reportRow(
            "report-a",
          ),
        ],

      listReportConnectionIds:
        async () => [
          "connection-a",
        ],

      getSafeConnection:
        async ({ connectionId }) =>
          connection(
            connectionId,
          ),

      listActiveNaverJobs:
        async () => [],

      listPartitionDates:
        async () => [
          "2026-09-01",
        ],

      loadExactJob:
        async () => null,
    });

  const result =
    await runNaverDailyReportSchedulerOnce({
      now:
        new Date(
          "2026-09-12T02:00:00.000Z",
        ),

      dependencies: {
        ...adapter,

        buildJobId:
          ({ reportId, date }) =>
            `${reportId}:${date}`,

        createJob:
          async (input) => {
            created += 1;

            return job({
              id:
                `${input.reportId}:${input.date}`,
              reportId:
                input.reportId,
              connectionId:
                input.connectionId,
              date:
                input.date,
            });
          },
      },
    });

  assert.equal(
    created,
    1,
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
    "DB_ADAPTER_CORE_INTEGRATION=PASS",
  );
}

async function main() {
  await verifyCandidateDiscovery();
  await verifyMappingFailClosed();
  await verifyUnverifiedFailClosed();
  await verifyCoverageScope();
  await verifyCoreIntegration();

  console.log(
    "STAGE_C2_DB_ADAPTER_VERIFICATION=PASS",
  );
  console.log(
    "DATABASE_CALLS_REAL=0",
  );
  console.log(
    "NAVER_API_CALLS=0",
  );
  console.log(
    "JOB_CREATION_REAL=0",
  );
}

void main();

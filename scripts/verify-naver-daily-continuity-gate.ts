import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import type {
  SafeMediaSyncJob,
} from "../src/lib/media-sync/types";

const ROOT =
  resolve(
    process.cwd(),
  );

const REPORT_ID =
  "abde01b5-b6cf-4a10-871f-a6654b604b82";

const CONNECTION_ID =
  "2a7018f7-1a83-4450-bdb9-e5326f7e38e6";

const WORKSPACE_ID =
  "c0b64993-d19a-42f2-9d09-6ac6f530575c";

const ADVERTISER_ID =
  "a48db67d-aa0b-404f-86cd-6844c14db009";

const CREATED_BY =
  "36936aa5-155e-4b3a-aa1f-ffc9d885ee15";

const CONTINUITY_START_DATE =
  "2026-09-01";

const TARGET_DATE =
  "2026-09-09";

const JOB_ID =
  "aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee";

const NOW_AT_2026_09_10_05_KST =
  new Date(
    "2026-09-09T20:00:00.000Z",
  );

process.env.NEXT_PUBLIC_SUPABASE_URL ??=
  "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  "local-verifier-service-role-key";

function datesThrough(
  day: number,
): string[] {
  return Array.from(
    {
      length:
        day,
    },
    (_, index) =>
      `2026-09-${String(
        index + 1,
      ).padStart(
        2,
        "0",
      )}`,
  );
}

function makeJob(
  input: {
    id?: string;
    status?:
      | "pending"
      | "processing"
      | "done"
      | "failed";
    date?: string;
  } = {},
): SafeMediaSyncJob {
  const status =
    input.status ??
    "pending";

  const date =
    input.date ??
    TARGET_DATE;

  return {
    id:
      input.id ??
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
      "naver_searchad",
    external_account_id:
      "2382522",
    date_from:
      date,
    date_to:
      date,
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
      status === "failed"
        ? "synthetic failed job"
        : null,
    error_detail:
      null,
    created_by:
      CREATED_BY,
    created_at:
      "2026-09-09T20:00:00.000Z",
    started_at:
      null,
    finished_at:
      status === "done"
        ? "2026-09-09T20:01:00.000Z"
        : null,
    updated_at:
      "2026-09-09T20:00:00.000Z",
  } as SafeMediaSyncJob;
}

async function main(): Promise<void> {
  const {
    getPreviousCompletedSeoulCalendarDate,
    NaverDailySchedulerError,
    runNaverDailySchedulerOnce,
  } =
    await import(
      "../src/lib/media-sync/naver-searchads-daily-scheduler"
    );

  const config = {
    reportId:
      REPORT_ID,
    connectionId:
      CONNECTION_ID,
    workspaceId:
      WORKSPACE_ID,
    advertiserId:
      ADVERTISER_ID,
    createdBy:
      CREATED_BY,
    continuityStartDate:
      CONTINUITY_START_DATE,
  };

  assert.equal(
    getPreviousCompletedSeoulCalendarDate(
      NOW_AT_2026_09_10_05_KST,
    ),
    TARGET_DATE,
  );

  {
    let exactCalls = 0;
    let activeCalls = 0;
    let createCalls = 0;

    const result =
      await runNaverDailySchedulerOnce({
        config,
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () =>
              datesThrough(9),
          loadExactJob:
            async () => {
              exactCalls += 1;
              return null;
            },
          listActiveNaverJobs:
            async () => {
              activeCalls += 1;
              return [];
            },
          createJob:
            async () => {
              createCalls += 1;
              return makeJob();
            },
        },
      });

    assert.equal(
      result.action,
      "noop_target_already_covered",
    );
    assert.equal(
      result.status,
      "done",
    );
    assert.equal(
      exactCalls,
      0,
    );
    assert.equal(
      activeCalls,
      0,
    );
    assert.equal(
      createCalls,
      0,
    );
  }

  {
    let createCalls = 0;
    let capturedDate:
      string | null = null;

    const result =
      await runNaverDailySchedulerOnce({
        config,
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () =>
              datesThrough(8),
          loadExactJob:
            async () =>
              null,
          listActiveNaverJobs:
            async () =>
              [],
          createJob:
            async (input) => {
              createCalls += 1;
              capturedDate =
                input.date;
              return makeJob();
            },
        },
      });

    assert.equal(
      result.action,
      "created_or_replayed",
    );
    assert.equal(
      result.status,
      "pending",
    );
    assert.equal(
      createCalls,
      1,
    );
    assert.equal(
      capturedDate,
      TARGET_DATE,
    );
  }

  {
    let activeCalls = 0;
    let createCalls = 0;

    await assert.rejects(
      () =>
        runNaverDailySchedulerOnce({
          config,
          now:
            NOW_AT_2026_09_10_05_KST,
          dependencies: {
            buildJobId:
              async () =>
                JOB_ID,
            loadPartitionCoverage:
              async () =>
                datesThrough(8)
                  .filter(
                    (date) =>
                      date !==
                      "2026-09-05",
                  ),
            loadExactJob:
              async () =>
                null,
            listActiveNaverJobs:
              async () => {
                activeCalls += 1;
                return [];
              },
            createJob:
              async () => {
                createCalls += 1;
                return makeJob();
              },
          },
        }),
      (error: unknown) =>
        error instanceof
          NaverDailySchedulerError &&
        error.code ===
          "BLOCK_HISTORY_GAP",
    );

    assert.equal(
      activeCalls,
      0,
    );
    assert.equal(
      createCalls,
      0,
    );
  }

  await assert.rejects(
    () =>
      runNaverDailySchedulerOnce({
        config,
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () =>
              datesThrough(8),
          loadExactJob:
            async () =>
              makeJob({
                status:
                  "failed",
              }),
          listActiveNaverJobs:
            async () =>
              [],
          createJob:
            async () =>
              makeJob(),
        },
      }),
    (error: unknown) =>
      error instanceof
        NaverDailySchedulerError &&
      error.code ===
        "EXACT_JOB_FAILED",
  );

  await assert.rejects(
    () =>
      runNaverDailySchedulerOnce({
        config,
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () =>
              datesThrough(8),
          loadExactJob:
            async () =>
              null,
          listActiveNaverJobs:
            async () => [
              makeJob({
                id:
                  "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
                status:
                  "processing",
                date:
                  "2026-09-08",
              }),
            ],
          createJob:
            async () =>
              makeJob(),
        },
      }),
    (error: unknown) =>
      error instanceof
        NaverDailySchedulerError &&
      error.code ===
        "OTHER_ACTIVE_NAVER_JOB",
  );

  await assert.rejects(
    () =>
      runNaverDailySchedulerOnce({
        config,
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () => [
              ...datesThrough(8),
              "2026-09-05",
            ],
          loadExactJob:
            async () =>
              null,
          listActiveNaverJobs:
            async () =>
              [],
          createJob:
            async () =>
              makeJob(),
        },
      }),
    (error: unknown) =>
      error instanceof
        NaverDailySchedulerError &&
      error.code ===
        "CONTINUITY_INVALID",
  );

  await assert.rejects(
    () =>
      runNaverDailySchedulerOnce({
        config,
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () =>
              datesThrough(8),
          loadExactJob:
            async () =>
              makeJob({
                status:
                  "done",
              }),
          listActiveNaverJobs:
            async () =>
              [],
          createJob:
            async () =>
              makeJob(),
        },
      }),
    (error: unknown) =>
      error instanceof
        NaverDailySchedulerError &&
      error.code ===
        "CONTINUITY_INVALID",
  );

  await assert.rejects(
    () =>
      runNaverDailySchedulerOnce({
        config: {
          ...config,
          continuityStartDate:
            "2026-09-10",
        },
        now:
          NOW_AT_2026_09_10_05_KST,
        dependencies: {
          buildJobId:
            async () =>
              JOB_ID,
          loadPartitionCoverage:
            async () =>
              [],
          loadExactJob:
            async () =>
              null,
          listActiveNaverJobs:
            async () =>
              [],
          createJob:
            async () =>
              makeJob(),
        },
      }),
    (error: unknown) =>
      error instanceof
        NaverDailySchedulerError &&
      error.code ===
        "INVALID_INPUT",
  );

  const schedulerSource =
    readFileSync(
      resolve(
        ROOT,
        "src/lib/media-sync/naver-searchads-daily-scheduler.ts",
      ),
      "utf8",
    );

  const runnerSource =
    readFileSync(
      resolve(
        ROOT,
        "scripts/naver-searchads-daily-scheduler.ts",
      ),
      "utf8",
    );

  assert.match(
    schedulerSource,
    /media_sync_fact_partitions/,
    "Daily continuity must read canonical fact partitions.",
  );

  assert.doesNotMatch(
    schedulerSource,
    /media_sync_fact_rows/,
    "Daily continuity must not full-scan canonical fact rows.",
  );

  assert.match(
    schedulerSource,
    /BLOCK_HISTORY_GAP/,
    "Historical gaps must fail closed before daily creation.",
  );

  assert.match(
    schedulerSource,
    /noop_target_already_covered/,
    "Already-covered targets must be a no-op.",
  );

  assert.match(
    runnerSource,
    /NAVER_DAILY_SCHEDULER_CONTINUITY_START_DATE/,
    "Runtime wiring must require an explicit continuity anchor.",
  );

  assert.doesNotMatch(
    schedulerSource,
    /\.from\(\s*["']reports["']\s*\)[\s\S]*?\.update\(|meta[\s\S]*?\.update\(/,
    "Daily continuity must not mutate stored report period metadata.",
  );

  console.log(
    JSON.stringify({
      verification:
        "PASS",
      target_date:
        TARGET_DATE,
      continuity_start_date:
        CONTINUITY_START_DATE,
      target_covered_action:
        "noop_target_already_covered",
      history_gap_action:
        "BLOCK_HISTORY_GAP",
      exact_failed_retry:
        false,
      fact_rows_scan:
        false,
      database_calls:
        0,
      naver_api_calls:
        0,
      production_mutations:
        0,
    }),
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "Naver daily continuity gate verification failed",
      error,
    );
    process.exitCode =
      1;
  },
);

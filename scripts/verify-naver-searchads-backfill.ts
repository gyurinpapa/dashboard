import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

const ROOT = resolve(process.cwd());

const REPORT_ID =
  "abde01b5-b6cf-4a10-871f-a6654b604b82";
const CONNECTION_ID =
  "2a7018f7-1a83-4450-bdb9-e5326f7e38e6";
const WORKSPACE_ID =
  "c0b64993-d19a-42f2-9d09-6ac6f530575c";
const ADVERTISER_ID =
  "a48db67d-aa0b-404f-86cd-6844c14db009";
const CREATED_BY =
  "backfill-verifier";

process.env.NEXT_PUBLIC_SUPABASE_URL ??=
  "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  "local-verifier-service-role-key";

async function main(): Promise<void> {
  const {
    buildNaverSearchAdsBackfillRequest,
    createNaverSearchAdsBackfillJob,
    NAVER_BACKFILL_MAX_DAYS,
  } = await import(
    "../src/lib/media-sync/naver-searchads-backfill"
  );

  const request =
    buildNaverSearchAdsBackfillRequest({
      reportId: REPORT_ID,
      connectionId: CONNECTION_ID,
      workspaceId: WORKSPACE_ID,
      advertiserId: ADVERTISER_ID,
      createdBy: CREATED_BY,
      dateFrom: "2026-09-02",
      dateTo: "2026-09-08",
    });

  assert.equal(NAVER_BACKFILL_MAX_DAYS, 7);
  assert.equal(request.reportId, REPORT_ID);
  assert.equal(request.connectionId, CONNECTION_ID);
  assert.equal(request.workspaceId, WORKSPACE_ID);
  assert.equal(request.advertiserId, ADVERTISER_ID);
  assert.equal(request.createdBy, CREATED_BY);
  assert.equal(request.dateFrom, "2026-09-02");
  assert.equal(request.dateTo, "2026-09-08");
  assert.equal(request.dataLevel, "keyword");
  assert.equal(request.mode, "snapshot_replace");

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      request,
      "jobId",
    ),
    false,
    "Backfill must preserve repository/database-generated random identity.",
  );

  assert.throws(
    () =>
      buildNaverSearchAdsBackfillRequest({
        reportId: REPORT_ID,
        connectionId: CONNECTION_ID,
        workspaceId: WORKSPACE_ID,
        advertiserId: ADVERTISER_ID,
        createdBy: CREATED_BY,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-08",
      }),
    /between 1 and 7 calendar days/,
  );

  assert.throws(
    () =>
      buildNaverSearchAdsBackfillRequest({
        reportId: REPORT_ID,
        connectionId: CONNECTION_ID,
        workspaceId: WORKSPACE_ID,
        advertiserId: ADVERTISER_ID,
        createdBy: CREATED_BY,
        dateFrom: "2026-09-08",
        dateTo: "2026-09-02",
      }),
    /valid YYYY-MM-DD range/,
  );

  let createCalls = 0;
  let capturedRequest:
    typeof request | null = null;

  const pendingJob = {
    id: "11111111-2222-4333-8444-555555555555",
    workspace_id: WORKSPACE_ID,
    advertiser_id: ADVERTISER_ID,
    report_id: REPORT_ID,
    connection_id: CONNECTION_ID,
    provider: "naver_searchad" as const,
    external_account_id: "2382522",
    date_from: "2026-09-02",
    date_to: "2026-09-08",
    data_level: "keyword" as const,
    mode: "snapshot_replace" as const,
    status: "pending" as const,
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
    created_by: CREATED_BY,
    created_at: "2026-09-09T00:00:00.000Z",
    started_at: null,
    finished_at: null,
    updated_at: "2026-09-09T00:00:00.000Z",
  };

  const result =
    await createNaverSearchAdsBackfillJob(
      {
        reportId: REPORT_ID,
        connectionId: CONNECTION_ID,
        workspaceId: WORKSPACE_ID,
        advertiserId: ADVERTISER_ID,
        createdBy: CREATED_BY,
        dateFrom: "2026-09-02",
        dateTo: "2026-09-08",
      },
      {
        createPendingJob:
          async (input) => {
            createCalls += 1;
            capturedRequest = input;
            return pendingJob;
          },
      },
    );

  assert.equal(createCalls, 1);
  assert.deepEqual(capturedRequest, request);
  assert.equal(result, pendingJob);

  await assert.rejects(
    () =>
      createNaverSearchAdsBackfillJob(
        {
          reportId: REPORT_ID,
          connectionId: CONNECTION_ID,
          workspaceId: WORKSPACE_ID,
          advertiserId: ADVERTISER_ID,
          createdBy: CREATED_BY,
          dateFrom: "2026-09-02",
          dateTo: "2026-09-08",
        },
        {
          createPendingJob:
            async () => ({
              ...pendingJob,
              status: "processing" as const,
            }),
        },
      ),
    /must be pending/,
  );

  const repository = readFileSync(
    resolve(
      ROOT,
      "src/lib/media-sync/media-sync-jobs-repository.ts",
    ),
    "utf8",
  );

  const publicRoute = readFileSync(
    resolve(
      ROOT,
      "app/api/reports/[id]/media-sync-jobs/route.ts",
    ),
    "utf8",
  );

  const backfillSource = readFileSync(
    resolve(
      ROOT,
      "src/lib/media-sync/naver-searchads-backfill.ts",
    ),
    "utf8",
  );

  assert.match(
    repository,
    /"ACTIVE_JOB_ALREADY_EXISTS"/,
    "Existing active-job collision protection must remain authoritative.",
  );

  assert.doesNotMatch(
    backfillSource,
    /naver-searchads-daily-incremental|NAVER_DAILY_INCREMENTAL_CONTRACT|buildNaverDailyIncrementalJobId/,
    "Backfill must stay separate from deterministic daily identity.",
  );

  assert.doesNotMatch(
    publicRoute,
    /naver-searchads-backfill/,
    "Backfill helper must not be exposed through the public media-sync route.",
  );

  assert.doesNotMatch(
    backfillSource,
    /\.update\(|failed\s*[^=]*=\s*["']pending["']/,
    "Backfill creator must not mutate existing jobs or reset failed jobs.",
  );

  console.log(
    JSON.stringify({
      verification: "PASS",
      backfill_window: "2026-09-02..2026-09-08",
      backfill_days: 7,
      deterministic_job_id: false,
      public_route_changed: false,
      database_calls: 0,
      naver_api_calls: 0,
      production_mutations: 0,
    }),
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "Naver backfill creator verification failed",
      error,
    );
    process.exitCode = 1;
  },
);

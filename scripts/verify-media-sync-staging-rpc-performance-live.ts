// scripts/verify-media-sync-staging-rpc-performance-live.ts

import { performance } from "node:perf_hooks";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  claimNextNaverMediaSyncJob,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
} from "../src/lib/media-sync/media-sync-staging-repository";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const MEDIA_SYNC_JOBS_TABLE = "media_sync_jobs";
const MEDIA_SYNC_STAGING_ROWS_TABLE = "media_sync_staging_rows";
const REPORTS_TABLE = "reports";

const NAVER_PROVIDER = "naver_searchad" as const;
const PENDING_STATUS = "pending" as const;
const PROCESSING_STATUS = "processing" as const;

const BATCH_SIZE = 100;
const BASELINE_ROWS = 40_000;
const FINAL_APPEND_ROWS = 100;
const TOTAL_ROWS = BASELINE_ROWS + FINAL_APPEND_ROWS;
const CLEANUP_DELETE_BATCH_SIZE = 100;
const MAX_ACCEPTABLE_FINAL_APPEND_MS = 10_000;

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
};

type VerificationFixture = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
};

type ReportState = {
  currentIngestionId: string | null;
  publishedIngestionId: string | null;
};

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(`${argumentName} argument is required.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${argumentName} argument must not be empty.`);
  }

  if (normalized.length > maxLength) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalized;
}

function readVerificationInput(): VerificationInput {
  const [
    reportId,
    connectionId,
    workspaceId,
    advertiserId,
    createdBy,
    dateFrom,
    dateTo,
  ] = process.argv.slice(2);

  return {
    reportId: normalizeRequiredArgument(reportId, "reportId"),
    connectionId: normalizeRequiredArgument(connectionId, "connectionId"),
    workspaceId: normalizeRequiredArgument(workspaceId, "workspaceId"),
    advertiserId: normalizeRequiredArgument(advertiserId, "advertiserId"),
    createdBy: normalizeRequiredArgument(createdBy, "createdBy"),
    dateFrom: normalizeRequiredArgument(dateFrom, "dateFrom", 10),
    dateTo: normalizeRequiredArgument(dateTo, "dateTo", 10),
  };
}

async function assertNoPendingNaverJob(): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("provider", NAVER_PROVIDER)
    .eq("status", PENDING_STATUS)
    .limit(1);

  if (error) {
    throw new Error("PERFORMANCE_PENDING_QUEUE_CHECK_FAILED");
  }

  if (Array.isArray(data) && data.length > 0) {
    throw new Error("PERFORMANCE_PENDING_NAVER_JOB_ALREADY_EXISTS");
  }
}

async function assertNoActiveJobForReport(
  reportId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id, status")
    .eq("report_id", reportId)
    .in("status", [PENDING_STATUS, PROCESSING_STATUS])
    .limit(1);

  if (error) {
    throw new Error("PERFORMANCE_ACTIVE_JOB_CHECK_FAILED");
  }

  if (Array.isArray(data) && data.length > 0) {
    throw new Error("PERFORMANCE_REPORT_ACTIVE_JOB_ALREADY_EXISTS");
  }
}

async function readReportState(
  reportId: string,
): Promise<ReportState> {
  const supabase = getSupabaseAdmin();

  const reportResult = await supabase
    .from(REPORTS_TABLE)
    .select("current_ingestion_id, published_ingestion_id")
    .eq("id", reportId)
    .maybeSingle();

  if (reportResult.error || !reportResult.data) {
    throw new Error("PERFORMANCE_REPORT_STATE_READ_FAILED");
  }

  return {
    currentIngestionId:
      reportResult.data.current_ingestion_id ?? null,
    publishedIngestionId:
      reportResult.data.published_ingestion_id ?? null,
  };
}

function reportStateMatches(
  before: ReportState,
  after: ReportState,
): boolean {
  return (
    before.currentIngestionId === after.currentIngestionId &&
    before.publishedIngestionId === after.publishedIngestionId
  );
}

function createCanonicalRow(input: {
  externalAccountId: string;
  dateFrom: string;
  index: number;
}): EtrylueNormalizedMediaRow {
  const id = String(input.index).padStart(8, "0");

  return {
    date: input.dateFrom,
    report_date: input.dateFrom,
    day: input.dateFrom,
    ymd: input.dateFrom,

    channel: "검색광고",
    source: "네이버 검색광고",
    platform: "네이버",
    device: "",

    campaign: `performance-campaign-${id}`,
    campaign_name: `performance-campaign-${id}`,

    group: `performance-group-${id}`,
    group_name: `performance-group-${id}`,
    adgroup_name: `performance-group-${id}`,

    keyword: `performance-keyword-${id}`,
    keyword_name: `performance-keyword-${id}`,

    impressions: input.index + 1,
    clicks: input.index % 100,
    cost: input.index + 100,
    conversions: 0,
    revenue: 0,

    row_level: "keyword",
    data_level: "keyword",
    row_level_reason: "verification_fixture",

    provider: NAVER_PROVIDER,
    ingestion_source: "api",

    external_account_id: input.externalAccountId,
    external_campaign_id: `performance-campaign-id-${id}`,
    external_group_id: `performance-group-id-${id}`,
    external_keyword_id: `performance-keyword-id-${id}`,

    provider_meta: {
      fixture: true,
      fixture_type: "staging_rpc_performance",
      fixture_index: input.index,
    },
  };
}

function createBatch(input: {
  externalAccountId: string;
  dateFrom: string;
  rowStartIndex: number;
  rowCount: number;
}): EtrylueNormalizedMediaRow[] {
  return Array.from(
    { length: input.rowCount },
    (_, offset) =>
      createCanonicalRow({
        externalAccountId: input.externalAccountId,
        dateFrom: input.dateFrom,
        index: input.rowStartIndex + offset,
      }),
  );
}

async function readStagingCount(
  jobId: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { count, error } = await supabase
    .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("job_id", jobId);

  if (error) {
    throw new Error("PERFORMANCE_STAGING_COUNT_FAILED");
  }

  return count ?? 0;
}

async function expectRepositoryError(
  operation: () => Promise<unknown>,
  expectedCode: MediaSyncStagingRepositoryError["code"],
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      error instanceof MediaSyncStagingRepositoryError &&
      error.code === expectedCode
    );
  }
}

async function deleteStagingRowsInBatches(
  jobId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  while (true) {
    const { data, error } = await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .select("row_index")
      .eq("job_id", jobId)
      .order("row_index", { ascending: true })
      .limit(CLEANUP_DELETE_BATCH_SIZE);

    if (error) {
      throw new Error("PERFORMANCE_STAGING_CLEANUP_READ_FAILED");
    }

    if (!Array.isArray(data) || data.length === 0) {
      return;
    }

    const firstRowIndex = Number(data[0]?.row_index);
    const lastRowIndex = Number(
      data[data.length - 1]?.row_index,
    );

    if (
      !Number.isSafeInteger(firstRowIndex) ||
      !Number.isSafeInteger(lastRowIndex) ||
      firstRowIndex < 0 ||
      lastRowIndex < firstRowIndex
    ) {
      throw new Error(
        "PERFORMANCE_STAGING_CLEANUP_INVALID_RANGE",
      );
    }

    const deleteResult = await supabase
      .from(MEDIA_SYNC_STAGING_ROWS_TABLE)
      .delete()
      .eq("job_id", jobId)
      .gte("row_index", firstRowIndex)
      .lte("row_index", lastRowIndex);

    if (deleteResult.error) {
      throw new Error(
        "PERFORMANCE_STAGING_CLEANUP_DELETE_FAILED",
      );
    }
  }
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  await deleteStagingRowsInBatches(
    fixture.jobId,
  );

  const deleteJobResult = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", fixture.jobId)
    .eq("report_id", fixture.reportId)
    .eq("workspace_id", fixture.workspaceId)
    .eq("advertiser_id", fixture.advertiserId);

  if (deleteJobResult.error) {
    throw new Error("PERFORMANCE_JOB_CLEANUP_FAILED");
  }

  const remainingRows = await readStagingCount(
    fixture.jobId,
  );

  const jobCheck = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("id", fixture.jobId)
    .maybeSingle();

  if (jobCheck.error) {
    throw new Error("PERFORMANCE_JOB_CLEANUP_CHECK_FAILED");
  }

  return (
    remainingRows === 0 &&
    jobCheck.data === null
  );
}

async function appendBaselineRows(
  job: MediaSyncJobRecord,
): Promise<{
  totalElapsedMs: number;
  maxBatchElapsedMs: number;
}> {
  const startedAt = performance.now();
  let maxBatchElapsedMs = 0;

  for (
    let rowStartIndex = 0;
    rowStartIndex < BASELINE_ROWS;
    rowStartIndex += BATCH_SIZE
  ) {
    const rows = createBatch({
      externalAccountId: job.external_account_id,
      dateFrom: job.date_from,
      rowStartIndex,
      rowCount: BATCH_SIZE,
    });

    const batchStartedAt = performance.now();

    const result = await appendMediaSyncStagingBatch({
      job,
      rows,
      rowStartIndex,
      dateWindowIndex: 0,
    });

    const batchElapsedMs =
      performance.now() - batchStartedAt;

    maxBatchElapsedMs = Math.max(
      maxBatchElapsedMs,
      batchElapsedMs,
    );

    if (
      result.submittedRows !== BATCH_SIZE ||
      result.insertedRows !== BATCH_SIZE ||
      result.duplicateRows !== 0 ||
      result.firstRowIndex !== rowStartIndex ||
      result.lastRowIndex !==
        rowStartIndex + BATCH_SIZE - 1
    ) {
      throw new Error(
        `PERFORMANCE_BASELINE_APPEND_RESULT_MISMATCH:${rowStartIndex}`,
      );
    }

    const completedRows =
      rowStartIndex + BATCH_SIZE;

    if (
      completedRows % 5_000 === 0 ||
      completedRows === BASELINE_ROWS
    ) {
      console.log(
        "baseline staging progress:",
        JSON.stringify({
          completedRows,
          batchElapsedMs:
            Math.round(batchElapsedMs),
          maxBatchElapsedMs:
            Math.round(maxBatchElapsedMs),
        }),
      );
    }
  }

  return {
    totalElapsedMs:
      performance.now() - startedAt,
    maxBatchElapsedMs,
  };
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  let fixture: VerificationFixture | null = null;
  let reportStateBefore: ReportState | null = null;
  let cleanupCompleted = false;
  let verificationPassed = false;

  console.log(
    "STAGING RPC PERFORMANCE LIVE FIXTURE",
  );
  console.log(
    "Railway worker must be disabled before this fixture:",
    true,
  );
  console.log(
    "fixture baseline / final rows:",
    `${BASELINE_ROWS} / ${FINAL_APPEND_ROWS}`,
  );

  try {
    await assertNoPendingNaverJob();
    await assertNoActiveJobForReport(
      input.reportId,
    );

    reportStateBefore = await readReportState(
      input.reportId,
    );

    const pendingJob =
      await createPendingMediaSyncJob({
        reportId: input.reportId,
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        advertiserId: input.advertiserId,
        createdBy: input.createdBy,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        dataLevel: "keyword",
        mode: "snapshot_replace",
      });

    fixture = {
      jobId: pendingJob.id,
      reportId: pendingJob.report_id,
      workspaceId: pendingJob.workspace_id,
      advertiserId: pendingJob.advertiser_id,
    };

    const claimedJob =
      await claimNextNaverMediaSyncJob();

    if (
      !claimedJob ||
      claimedJob.id !== pendingJob.id ||
      claimedJob.status !== PROCESSING_STATUS
    ) {
      throw new Error(
        "PERFORMANCE_FIXTURE_CLAIM_MISMATCH",
      );
    }

    console.log(
      "fixture job claimed locally:",
      claimedJob.id,
    );

    const baseline =
      await appendBaselineRows(
        claimedJob,
      );

    const baselineCount =
      await readStagingCount(
        claimedJob.id,
      );

    const finalRows = createBatch({
      externalAccountId:
        claimedJob.external_account_id,
      dateFrom:
        claimedJob.date_from,
      rowStartIndex:
        BASELINE_ROWS,
      rowCount:
        FINAL_APPEND_ROWS,
    });

    const finalAppendStartedAt =
      performance.now();

    const finalAppend =
      await appendMediaSyncStagingBatch({
        job: claimedJob,
        rows: finalRows,
        rowStartIndex: BASELINE_ROWS,
        dateWindowIndex: 0,
      });

    const finalAppendElapsedMs =
      performance.now() -
      finalAppendStartedAt;

    const finalCount =
      await readStagingCount(
        claimedJob.id,
      );

    const finalAppendMatches =
      finalAppend.submittedRows ===
        FINAL_APPEND_ROWS &&
      finalAppend.insertedRows ===
        FINAL_APPEND_ROWS &&
      finalAppend.duplicateRows === 0 &&
      finalAppend.firstRowIndex ===
        BASELINE_ROWS &&
      finalAppend.lastRowIndex ===
        TOTAL_ROWS - 1;

    const duplicateStartedAt =
      performance.now();

    const duplicateAppend =
      await appendMediaSyncStagingBatch({
        job: claimedJob,
        rows: finalRows,
        rowStartIndex: BASELINE_ROWS,
        dateWindowIndex: 0,
      });

    const duplicateElapsedMs =
      performance.now() -
      duplicateStartedAt;

    const duplicateAccepted =
      duplicateAppend.submittedRows ===
        FINAL_APPEND_ROWS &&
      duplicateAppend.insertedRows === 0 &&
      duplicateAppend.duplicateRows ===
        FINAL_APPEND_ROWS &&
      duplicateAppend.firstRowIndex ===
        BASELINE_ROWS &&
      duplicateAppend.lastRowIndex ===
        TOTAL_ROWS - 1;

    const conflictRows =
      finalRows.map(
        (row, index) =>
          index === 0
            ? {
                ...row,
                cost:
                  row.cost + 1,
              }
            : row,
      );

    const conflictDetected =
      await expectRepositoryError(
        () =>
          appendMediaSyncStagingBatch({
            job: claimedJob,
            rows: conflictRows,
            rowStartIndex:
              BASELINE_ROWS,
            dateWindowIndex: 0,
          }),
        "DUPLICATE_CONFLICT",
      );

    const countAfterConflict =
      await readStagingCount(
        claimedJob.id,
      );

    const reportStateDuring =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedDuring =
      reportStateMatches(
        reportStateBefore,
        reportStateDuring,
      );

    const performanceWithinLimit =
      finalAppendElapsedMs <=
        MAX_ACCEPTABLE_FINAL_APPEND_MS;

    verificationPassed =
      baselineCount ===
        BASELINE_ROWS &&
      finalCount ===
        TOTAL_ROWS &&
      countAfterConflict ===
        TOTAL_ROWS &&
      finalAppendMatches &&
      duplicateAccepted &&
      conflictDetected &&
      reportUnchangedDuring &&
      performanceWithinLimit;

    console.log(
      "baseline rows stored:",
      baselineCount,
    );
    console.log(
      "baseline total elapsed ms:",
      Math.round(
        baseline.totalElapsedMs,
      ),
    );
    console.log(
      "baseline max batch elapsed ms:",
      Math.round(
        baseline.maxBatchElapsedMs,
      ),
    );
    console.log(
      "final 100-row append elapsed ms:",
      Math.round(
        finalAppendElapsedMs,
      ),
    );
    console.log(
      "final append result valid:",
      finalAppendMatches,
    );
    console.log(
      "exact duplicate retry elapsed ms:",
      Math.round(
        duplicateElapsedMs,
      ),
    );
    console.log(
      "exact duplicate retry accepted:",
      duplicateAccepted,
    );
    console.log(
      "fingerprint conflict blocked:",
      conflictDetected,
    );
    console.log(
      "conflict left row count unchanged:",
      countAfterConflict ===
        TOTAL_ROWS,
    );
    console.log(
      "source report pointers and rows unchanged:",
      reportUnchangedDuring,
    );
    console.log(
      "final append below 10 seconds:",
      performanceWithinLimit,
    );
  } catch (error) {
    console.error(
      "staging RPC performance verification failed:",
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            cause:
              error.cause instanceof Error
                ? {
                    name:
                      error.cause.name,
                    message:
                      error.cause.message,
                  }
                : error.cause ?? null,
          }
        : {
            value: String(error),
          },
    );
  } finally {
    if (fixture) {
      try {
        cleanupCompleted =
          await cleanupFixture(
            fixture,
          );
      } catch (cleanupError) {
        console.error(
          "performance fixture cleanup failed:",
          cleanupError instanceof Error
            ? {
                name:
                  cleanupError.name,
                message:
                  cleanupError.message,
              }
            : {
                value:
                  String(cleanupError),
              },
        );
      }
    }

    let finalReportStateUnchanged =
      false;

    if (reportStateBefore) {
      try {
        const reportStateAfter =
          await readReportState(
            input.reportId,
          );

        finalReportStateUnchanged =
          reportStateMatches(
            reportStateBefore,
            reportStateAfter,
          );
      } catch {
        finalReportStateUnchanged =
          false;
      }
    }

    const finalPassed =
      verificationPassed &&
      cleanupCompleted &&
      finalReportStateUnchanged;

    console.log(
      "fixture cleanup completed:",
      cleanupCompleted,
    );
    console.log(
      "final source report unchanged:",
      finalReportStateUnchanged,
    );
    console.log(
      "staging RPC performance verification passed:",
      finalPassed,
    );

    if (!finalPassed) {
      process.exitCode = 1;
    }
  }
}

void main();

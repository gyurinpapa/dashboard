import { setTimeout as delay } from "node:timers/promises";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import {
  createNaverSearchAdsStatReport,
  getNaverSearchAdsStatReport,
  NaverSearchAdsStatReportApiError,
  probeNaverSearchAdsStatReportDownload,
  type NaverSearchAdsStatReportRecord,
} from "../src/lib/media-sync/naver-searchads-stat-reports-api";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const REPORTS_TABLE = "reports";
const REPORT_ROWS_TABLE = "report_rows";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PENDING_STATUS =
  "pending" as const;

const PROCESSING_STATUS =
  "processing" as const;

const ACTIVE_JOB_STATUSES = [
  PENDING_STATUS,
  PROCESSING_STATUS,
] as const;

const STAT_REPORT_TYPE = "AD" as const;
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 40;

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
  reportRowsCount: number;
};

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
  maxLength = 200,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${argumentName} argument is required.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function readVerificationInput(): VerificationInput {
  const [
    reportIdArgument,
    connectionIdArgument,
    workspaceIdArgument,
    advertiserIdArgument,
    createdByArgument,
    dateFromArgument,
    dateToArgument,
  ] = process.argv.slice(2);

  return {
    reportId: normalizeRequiredArgument(
      reportIdArgument,
      "reportId",
    ),
    connectionId:
      normalizeRequiredArgument(
        connectionIdArgument,
        "connectionId",
      ),
    workspaceId:
      normalizeRequiredArgument(
        workspaceIdArgument,
        "workspaceId",
      ),
    advertiserId:
      normalizeRequiredArgument(
        advertiserIdArgument,
        "advertiserId",
      ),
    createdBy:
      normalizeRequiredArgument(
        createdByArgument,
        "createdBy",
      ),
    dateFrom:
      normalizeRequiredArgument(
        dateFromArgument,
        "dateFrom",
        10,
      ),
    dateTo:
      normalizeRequiredArgument(
        dateToArgument,
        "dateTo",
        10,
      ),
  };
}

async function assertNoExistingPendingNaverJob(): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("status", PENDING_STATUS)
    .eq("provider", NAVER_PROVIDER)
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_PENDING_QUEUE_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_PENDING_NAVER_JOB_ALREADY_EXISTS",
    );
  }
}

async function assertNoExistingActiveJobForReport(
  reportId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id, status")
    .eq("report_id", reportId)
    .in(
      "status",
      [...ACTIVE_JOB_STATUSES],
    )
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_CHECK_FAILED",
    );
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_ALREADY_EXISTS",
    );
  }
}

async function readReportState(
  reportId: string,
): Promise<ReportState> {
  const supabase = getSupabaseAdmin();

  const reportResult = await supabase
    .from(REPORTS_TABLE)
    .select(
      "current_ingestion_id, published_ingestion_id",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (reportResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_STATE_READ_FAILED",
    );
  }

  if (!reportResult.data) {
    throw new Error(
      "VERIFICATION_REPORT_NOT_FOUND",
    );
  }

  const rowsResult = await supabase
    .from(REPORT_ROWS_TABLE)
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("report_id", reportId);

  if (rowsResult.error) {
    throw new Error(
      "VERIFICATION_REPORT_ROWS_COUNT_FAILED",
    );
  }

  return {
    currentIngestionId:
      reportResult.data
        .current_ingestion_id ?? null,
    publishedIngestionId:
      reportResult.data
        .published_ingestion_id ?? null,
    reportRowsCount:
      rowsResult.count ?? 0,
  };
}

function reportStateMatches(
  before: ReportState,
  after: ReportState,
): boolean {
  return (
    before.currentIngestionId ===
      after.currentIngestionId &&
    before.publishedIngestionId ===
      after.publishedIngestionId &&
    before.reportRowsCount ===
      after.reportRowsCount
  );
}

async function deleteVerificationJob(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", fixture.jobId)
    .eq("report_id", fixture.reportId)
    .eq("workspace_id", fixture.workspaceId)
    .eq("advertiser_id", fixture.advertiserId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
    );
  }

  return data?.id === fixture.jobId;
}

async function verifyJobDeleted(
  jobId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return data === null;
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const deleted =
    await deleteVerificationJob(fixture);

  if (!deleted) {
    return false;
  }

  return verifyJobDeleted(fixture.jobId);
}

function isRemoteReportFailureStatus(
  status: string | null,
): boolean {
  if (!status) {
    return false;
  }

  const normalizedStatus =
    status.trim().toUpperCase();

  return (
    normalizedStatus.includes("FAIL") ||
    normalizedStatus.includes("ERROR")
  );
}

async function waitForDownloadUrl(input: {
  credentials: Parameters<
    typeof getNaverSearchAdsStatReport
  >[0]["credentials"];
  createdReport: NaverSearchAdsStatReportRecord;
}): Promise<{
  report: NaverSearchAdsStatReportRecord;
  pollAttempts: number;
}> {
  let currentReport = input.createdReport;

  for (
    let attempt = 1;
    attempt <= MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    if (currentReport.downloadUrl) {
      return {
        report: currentReport,
        pollAttempts: attempt - 1,
      };
    }

    if (
      isRemoteReportFailureStatus(
        currentReport.status,
      )
    ) {
      throw new Error(
        "VERIFICATION_STAT_REPORT_REMOTE_FAILED",
      );
    }

    await delay(POLL_INTERVAL_MS);

    currentReport =
      await getNaverSearchAdsStatReport({
        credentials: input.credentials,
        reportJobId:
          input.createdReport.reportJobId,
      });

    console.log(
      "stat report poll attempt:",
      attempt,
    );
    console.log(
      "stat report poll status:",
      currentReport.status,
    );
    console.log(
      "stat report poll has download URL:",
      Boolean(currentReport.downloadUrl),
    );
  }

  throw new Error(
    "VERIFICATION_STAT_REPORT_POLL_LIMIT_EXCEEDED",
  );
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  let fixture: VerificationFixture | null =
    null;

  let cleanupCompleted = false;

  try {
    await assertNoExistingPendingNaverJob();

    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    const reportStateBefore =
      await readReportState(input.reportId);

    console.log(
      "existing pending Naver jobs:",
      0,
    );
    console.log(
      "existing active jobs for report:",
      0,
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

    const claimMatchesFixture =
      claimedJob !== null &&
      claimedJob.id === pendingJob.id &&
      claimedJob.status ===
        PROCESSING_STATUS &&
      claimedJob.provider === NAVER_PROVIDER;

    console.log(
      "claim matches fixture:",
      claimMatchesFixture,
    );

    if (!claimedJob) {
      throw new Error(
        "VERIFICATION_CLAIM_RETURNED_NULL",
      );
    }

    const context =
      await loadNaverMediaSyncWorkerContext(
        claimedJob,
      );

    const contextMatchesFixture =
      context.job.id === pendingJob.id &&
      context.connection.id ===
        input.connectionId &&
      context.connection.workspaceId ===
        input.workspaceId &&
      context.connection.advertiserId ===
        input.advertiserId &&
      context.credentials.customerId ===
        context.connection.externalAccountId;

    console.log(
      "worker context matches fixture:",
      contextMatchesFixture,
    );

    const createdReport =
      await createNaverSearchAdsStatReport({
        credentials: context.credentials,
        reportType: STAT_REPORT_TYPE,
        statDate: input.dateTo,
      });

    const createScopePreserved =
      Number.isSafeInteger(
        createdReport.reportJobId,
      ) &&
      createdReport.reportJobId > 0;

    console.log(
      "stat report create succeeded:",
      true,
    );
    console.log(
      "stat report create scope preserved:",
      createScopePreserved,
    );
    console.log(
      "stat report type:",
      createdReport.reportType ?? "null",
    );
    console.log(
      "stat report date:",
      createdReport.statDate ?? "null",
    );
    console.log(
      "stat report initial status:",
      createdReport.status ?? "null",
    );
    console.log(
      "stat report initial has download URL:",
      Boolean(createdReport.downloadUrl),
    );

    const readyResult =
      await waitForDownloadUrl({
        credentials: context.credentials,
        createdReport,
      });

    const lookupScopePreserved =
      readyResult.report.reportJobId ===
        createdReport.reportJobId &&
      readyResult.report.reportType ===
        STAT_REPORT_TYPE &&
      readyResult.report.statDate ===
        input.dateTo.replaceAll("-", "");

    console.log(
      "stat report lookup succeeded:",
      true,
    );
    console.log(
      "stat report lookup scope preserved:",
      lookupScopePreserved,
    );
    console.log(
      "stat report final status:",
      readyResult.report.status ?? "null",
    );
    console.log(
      "stat report poll attempts:",
      readyResult.pollAttempts,
    );
    console.log(
      "stat report download URL acquired:",
      Boolean(readyResult.report.downloadUrl),
    );

    if (!readyResult.report.downloadUrl) {
      throw new Error(
        "VERIFICATION_STAT_REPORT_DOWNLOAD_URL_MISSING",
      );
    }

    const downloadProbe =
      await probeNaverSearchAdsStatReportDownload({
        credentials:
          context.credentials,
        downloadUrl:
          readyResult.report.downloadUrl,
      });

    const officialDownloadScopePreserved =
      downloadProbe.host ===
        "api.searchad.naver.com" &&
      downloadProbe.pathname ===
        "/report-download";

    console.log(
      "stat report download probe succeeded:",
      true,
    );
    console.log(
      "stat report download official scope preserved:",
      officialDownloadScopePreserved,
    );
    console.log(
      "stat report download HTTP status:",
      downloadProbe.status,
    );
    console.log(
      "stat report download has fileversion:",
      downloadProbe.hasFileVersion,
    );
    console.log(
      "stat report download content type:",
      downloadProbe.contentType ?? "null",
    );
    console.log(
      "stat report download content disposition:",
      downloadProbe.contentDisposition ??
        "null",
    );
    console.log(
      "stat report download bytes sampled:",
      downloadProbe.bytesRead,
    );
    console.log(
      "stat report download delimiter:",
      downloadProbe.delimiter,
    );
    console.log(
      "stat report header column count:",
      downloadProbe.headerColumnCount,
    );
    console.log(
      "stat report header columns:",
      downloadProbe.headerColumns.join(" | "),
    );
    console.log(
      "stat report remote delete attempted:",
      false,
    );

    const reportStateAfterRequest =
      await readReportState(input.reportId);

    const reportDataUnchanged =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterRequest,
      );

    console.log(
      "report pointers and rows unchanged:",
      reportDataUnchanged,
    );

    cleanupCompleted =
      await cleanupFixture(fixture);

    console.log(
      "verification fixture deleted:",
      cleanupCompleted,
    );

    const reportStateAfterCleanup =
      await readReportState(input.reportId);

    const reportDataStillUnchanged =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterCleanup,
      );

    console.log(
      "report data unchanged after cleanup:",
      reportDataStillUnchanged,
    );

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      createScopePreserved &&
      lookupScopePreserved &&
      officialDownloadScopePreserved &&
      downloadProbe.status === 200 &&
      downloadProbe.headerColumnCount > 0 &&
      reportDataUnchanged &&
      cleanupCompleted &&
      reportDataStillUnchanged;

    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (fixture && !cleanupCompleted) {
      try {
        const emergencyCleanupCompleted =
          await cleanupFixture(fixture);

        console.log(
          "emergency cleanup completed:",
          emergencyCleanupCompleted,
        );

        if (!emergencyCleanupCompleted) {
          process.exitCode = 1;
        }
      } catch {
        console.error(
          "emergency cleanup failed:",
          "CLEANUP_ERROR",
        );

        process.exitCode = 1;
      }
    }
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof
    NaverSearchAdsStatReportApiError
  ) {
    console.error(
      "Naver stat report contract verification failed:",
      error.code,
      error.status ?? "",
      error.message,
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "Naver stat report contract verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncJobsRepositoryError
  ) {
    console.error(
      "Naver stat report contract verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver stat report contract verification failed:",
      error.message.startsWith(
        "VERIFICATION_",
      )
        ? error.message
        : error.name,
    );

    process.exitCode = 1;
    return;
  }

  console.error(
    "Naver stat report contract verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});

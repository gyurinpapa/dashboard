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
  probeNaverSearchAdsStatReportDownload,
  NaverSearchAdsStatReportApiError,
  type NaverSearchAdsStatReportRecord,
  type NaverSearchAdsStatReportType,
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

const REPORT_TYPES: readonly NaverSearchAdsStatReportType[] =
  [
    "AD",
    "AD_DETAIL",
    "EXPKEYWORD",
    "SHOPPINGKEYWORD_DETAIL",
  ];

const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1_000;

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

type ReportTypeComparisonResult = {
  reportType: NaverSearchAdsStatReportType;
  created: boolean;
  built: boolean;
  downloaded: boolean;
  httpStatus: number | null;
  delimiter: string | null;
  firstRowColumnCount: number;
  firstRowColumns: string[];
  unsupportedHttp400: boolean;
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
    reportId,
    connectionId,
    workspaceId,
    advertiserId,
    createdBy,
    dateFrom,
    dateTo,
  ] = process.argv.slice(2);

  return {
    reportId:
      normalizeRequiredArgument(
        reportId,
        "reportId",
      ),
    connectionId:
      normalizeRequiredArgument(
        connectionId,
        "connectionId",
      ),
    workspaceId:
      normalizeRequiredArgument(
        workspaceId,
        "workspaceId",
      ),
    advertiserId:
      normalizeRequiredArgument(
        advertiserId,
        "advertiserId",
      ),
    createdBy:
      normalizeRequiredArgument(
        createdBy,
        "createdBy",
      ),
    dateFrom:
      normalizeRequiredArgument(
        dateFrom,
        "dateFrom",
        10,
      ),
    dateTo:
      normalizeRequiredArgument(
        dateTo,
        "dateTo",
        10,
      ),
  };
}

async function delay(
  milliseconds: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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
      reportResult.data.current_ingestion_id ??
      null,
    publishedIngestionId:
      reportResult.data.published_ingestion_id ??
      null,
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

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const deleteResult = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", fixture.jobId)
    .eq("report_id", fixture.reportId)
    .eq("workspace_id", fixture.workspaceId)
    .eq("advertiser_id", fixture.advertiserId)
    .select("id")
    .maybeSingle();

  if (deleteResult.error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
    );
  }

  if (
    deleteResult.data?.id !== fixture.jobId
  ) {
    return false;
  }

  const verifyResult = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("id")
    .eq("id", fixture.jobId)
    .maybeSingle();

  if (verifyResult.error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return verifyResult.data === null;
}

function isRemoteFailureStatus(
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
  reportType: NaverSearchAdsStatReportType;
}): Promise<NaverSearchAdsStatReportRecord> {
  let currentReport =
    input.createdReport;

  for (
    let attempt = 1;
    attempt <= MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    if (currentReport.downloadUrl) {
      return currentReport;
    }

    if (
      isRemoteFailureStatus(
        currentReport.status,
      )
    ) {
      throw new Error(
        `VERIFICATION_REMOTE_REPORT_FAILED_${input.reportType}`,
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
      `${input.reportType} poll attempt:`,
      attempt,
    );
    console.log(
      `${input.reportType} poll status:`,
      currentReport.status ?? "null",
    );
  }

  throw new Error(
    `VERIFICATION_POLL_LIMIT_EXCEEDED_${input.reportType}`,
  );
}

function sanitizeFirstRowColumns(
  columns: readonly string[],
): string[] {
  return columns
    .slice(0, 100)
    .map((value) =>
      value
        .replace(/[\r\n\t]/g, " ")
        .slice(0, 160),
    );
}

async function compareReportType(input: {
  credentials: Parameters<
    typeof createNaverSearchAdsStatReport
  >[0]["credentials"];
  reportType: NaverSearchAdsStatReportType;
  statDate: string;
}): Promise<ReportTypeComparisonResult> {
  try {
    const createdReport =
      await createNaverSearchAdsStatReport({
        credentials: input.credentials,
        reportType: input.reportType,
        statDate: input.statDate,
      });

    console.log(
      `${input.reportType} create succeeded:`,
      true,
    );
    console.log(
      `${input.reportType} initial status:`,
      createdReport.status ?? "null",
    );

    const readyReport =
      await waitForDownloadUrl({
        credentials: input.credentials,
        createdReport,
        reportType: input.reportType,
      });

    if (!readyReport.downloadUrl) {
      throw new Error(
        `VERIFICATION_DOWNLOAD_URL_MISSING_${input.reportType}`,
      );
    }

    const downloadProbe =
      await probeNaverSearchAdsStatReportDownload({
        credentials: input.credentials,
        downloadUrl:
          readyReport.downloadUrl,
      });

    const firstRowColumns =
      sanitizeFirstRowColumns(
        downloadProbe.firstRowColumns,
      );

    console.log(
      `${input.reportType} final status:`,
      readyReport.status ?? "null",
    );
    console.log(
      `${input.reportType} download HTTP status:`,
      downloadProbe.status,
    );
    console.log(
      `${input.reportType} delimiter:`,
      downloadProbe.delimiter,
    );
    console.log(
      `${input.reportType} first row column count:`,
      downloadProbe.firstRowColumnCount,
    );
    console.log(
      `${input.reportType} first row columns:`,
      firstRowColumns.join(" | "),
    );

    return {
      reportType: input.reportType,
      created: true,
      built:
        readyReport.status
          ?.trim()
          .toUpperCase() === "BUILT",
      downloaded:
        downloadProbe.status === 200,
      httpStatus:
        downloadProbe.status,
      delimiter:
        downloadProbe.delimiter,
      firstRowColumnCount:
        downloadProbe.firstRowColumnCount,
      firstRowColumns,
      unsupportedHttp400: false,
    };
  } catch (error) {
    if (
      error instanceof
        NaverSearchAdsStatReportApiError &&
      error.code === "HTTP_ERROR" &&
      error.status === 400
    ) {
      console.log(
        `${input.reportType} HTTP 400:`,
        true,
      );
      console.log(
        `${input.reportType} HTTP 400 detail:`,
        error.message,
      );

      return {
        reportType: input.reportType,
        created: false,
        built: false,
        downloaded: false,
        httpStatus: 400,
        delimiter: null,
        firstRowColumnCount: 0,
        firstRowColumns: [],
        unsupportedHttp400: true,
      };
    }

    throw error;
  }
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  let fixture:
    | VerificationFixture
    | null = null;
  let cleanupCompleted = false;

  try {
    await assertNoExistingPendingNaverJob();
    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    const reportStateBefore =
      await readReportState(
        input.reportId,
      );

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
      workspaceId:
        pendingJob.workspace_id,
      advertiserId:
        pendingJob.advertiser_id,
    };

    const claimedJob =
      await claimNextNaverMediaSyncJob();

    const claimMatchesFixture =
      claimedJob !== null &&
      claimedJob.id === pendingJob.id &&
      claimedJob.status ===
        PROCESSING_STATUS &&
      claimedJob.provider ===
        NAVER_PROVIDER;

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

    const comparisonResults:
      ReportTypeComparisonResult[] = [];

    for (const reportType of REPORT_TYPES) {
      console.log(
        "comparison report type:",
        reportType,
      );

      const result =
        await compareReportType({
          credentials:
            context.credentials,
          reportType,
          statDate: input.dateTo,
        });

      comparisonResults.push(result);
    }

    console.log(
      "comparison summary:",
      JSON.stringify(
        comparisonResults.map(
          (result) => ({
            reportType:
              result.reportType,
            built: result.built,
            downloaded:
              result.downloaded,
            firstRowColumnCount:
              result.firstRowColumnCount,
            unsupportedHttp400:
              result.unsupportedHttp400,
          }),
        ),
      ),
    );

    const reportStateAfterRequest =
      await readReportState(
        input.reportId,
      );

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
      await readReportState(
        input.reportId,
      );

    const reportDataStillUnchanged =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterCleanup,
      );

    console.log(
      "report data unchanged after cleanup:",
      reportDataStillUnchanged,
    );

    const adResult =
      comparisonResults.find(
        (result) =>
          result.reportType === "AD",
      );

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      Boolean(
        adResult?.built &&
        adResult.downloaded &&
        adResult.firstRowColumnCount > 0,
      ) &&
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
    if (
      fixture &&
      !cleanupCompleted
    ) {
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
      "Naver stat report type comparison failed:",
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
      "Naver stat report type comparison failed:",
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
      "Naver stat report type comparison failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver stat report type comparison failed:",
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
    "Naver stat report type comparison failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});

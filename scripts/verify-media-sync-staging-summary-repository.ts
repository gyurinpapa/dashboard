import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  assertMediaSyncStagingComplete,
  getMediaSyncStagingSummary,
  MediaSyncStagingSummaryError,
} from "../src/lib/media-sync/media-sync-staging-summary-repository";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const MEDIA_SYNC_STAGING_ROWS_TABLE =
  "media_sync_staging_rows";

const REPORTS_TABLE =
  "reports";

const REPORT_ROWS_TABLE =
  "report_rows";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeUuidArgument(
  value: unknown,
  argumentName: string,
): string {
  const normalizedValue =
    normalizeRequiredArgument(
      value,
      argumentName,
      36,
    );

  if (
    !UUID_PATTERN.test(
      normalizedValue,
    )
  ) {
    throw new Error(
      `VERIFICATION_INVALID_${argumentName.toUpperCase()}_UUID`,
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
    reportId:
      normalizeUuidArgument(
        reportIdArgument,
        "reportId",
      ),

    connectionId:
      normalizeUuidArgument(
        connectionIdArgument,
        "connectionId",
      ),

    workspaceId:
      normalizeUuidArgument(
        workspaceIdArgument,
        "workspaceId",
      ),

    advertiserId:
      normalizeUuidArgument(
        advertiserIdArgument,
        "advertiserId",
      ),

    createdBy:
      normalizeUuidArgument(
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
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
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
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
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
  const supabase =
    getSupabaseAdmin();

  const reportResult =
    await supabase
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

  const rowsResult =
    await supabase
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
        .current_ingestion_id ??
      null,

    publishedIngestionId:
      reportResult.data
        .published_ingestion_id ??
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

function createCanonicalFixtureRows(input: {
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
}): EtrylueNormalizedMediaRow[] {
  const dates = [
    input.dateFrom,
    input.dateTo,
    input.dateTo,
  ];

  return dates.map(
    (
      date,
      index,
    ): EtrylueNormalizedMediaRow => {
      const suffix =
        String(index + 1);

      return {
        date,
        report_date: date,
        day: date,
        ymd: date,

        channel:
          "검색광고",

        source:
          "네이버 검색광고",

        platform:
          "네이버",

        device:
          "",

        campaign:
          `summary-fixture-campaign-${suffix}`,

        campaign_name:
          `summary-fixture-campaign-${suffix}`,

        group:
          `summary-fixture-group-${suffix}`,

        group_name:
          `summary-fixture-group-${suffix}`,

        adgroup_name:
          `summary-fixture-group-${suffix}`,

        keyword:
          `summary-fixture-keyword-${suffix}`,

        keyword_name:
          `summary-fixture-keyword-${suffix}`,

        impressions:
          100 + index,

        clicks:
          10 + index,

        cost:
          1_000 + index,

        conversions:
          1 + index,

        revenue:
          2_000 + index,

        rank:
          1 + index,

        row_level:
          "keyword",

        data_level:
          "keyword",

        row_level_reason:
          "staging_summary_verification_fixture",

        provider:
          NAVER_PROVIDER,

        ingestion_source:
          "api",

        external_account_id:
          input.externalAccountId,

        external_campaign_id:
          `summary-fixture-campaign-id-${suffix}`,

        external_group_id:
          `summary-fixture-group-id-${suffix}`,

        external_keyword_id:
          `summary-fixture-keyword-id-${suffix}`,

        provider_meta: {
          fixture: true,
          fixture_index:
            index,
          verification:
            "staging_summary",
        },
      };
    },
  );
}

async function expectIncompleteError(
  operation: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      error instanceof
        MediaSyncStagingSummaryError &&
      error.code ===
        "STAGING_INCOMPLETE" &&
      error.summary !== null &&
      error.summary.isComplete ===
        false
    );
  }
}

async function readStagingRowCount(
  jobId: string,
): Promise<number> {
  const supabase =
    getSupabaseAdmin();

  const { count, error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("job_id", jobId);

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_COUNT_FAILED",
    );
  }

  return count ?? 0;
}

async function deleteStagingFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const { error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .delete()
      .eq(
        "job_id",
        fixture.jobId,
      )
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "advertiser_id",
        fixture.advertiserId,
      );

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_DELETE_FAILED",
    );
  }

  return (
    await readStagingRowCount(
      fixture.jobId,
    )
  ) === 0;
}

async function deleteJobFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .delete()
      .eq(
        "id",
        fixture.jobId,
      )
      .eq(
        "report_id",
        fixture.reportId,
      )
      .eq(
        "workspace_id",
        fixture.workspaceId,
      )
      .eq(
        "advertiser_id",
        fixture.advertiserId,
      )
      .select("id")
      .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
    );
  }

  if (
    data?.id !==
    fixture.jobId
  ) {
    return false;
  }

  const checkResult =
    await supabase
      .from(MEDIA_SYNC_JOBS_TABLE)
      .select("id")
      .eq(
        "id",
        fixture.jobId,
      )
      .maybeSingle();

  if (checkResult.error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_CHECK_FAILED",
    );
  }

  return checkResult.data === null;
}

async function cleanupFixture(
  fixture: VerificationFixture,
): Promise<boolean> {
  const stagingDeleted =
    await deleteStagingFixture(
      fixture,
    );

  const jobDeleted =
    await deleteJobFixture(
      fixture,
    );

  return (
    stagingDeleted &&
    jobDeleted
  );
}

async function main(): Promise<void> {
  const input =
    readVerificationInput();

  let fixture:
    VerificationFixture | null =
    null;

  let reportStateBefore:
    ReportState | null =
    null;

  let cleanupCompleted =
    false;

  try {
    await assertNoExistingPendingNaverJob();

    await assertNoExistingActiveJobForReport(
      input.reportId,
    );

    reportStateBefore =
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
        reportId:
          input.reportId,

        connectionId:
          input.connectionId,

        workspaceId:
          input.workspaceId,

        advertiserId:
          input.advertiserId,

        createdBy:
          input.createdBy,

        dateFrom:
          input.dateFrom,

        dateTo:
          input.dateTo,

        dataLevel:
          "keyword",

        mode:
          "snapshot_replace",
      });

    fixture = {
      jobId:
        pendingJob.id,

      reportId:
        pendingJob.report_id,

      workspaceId:
        pendingJob.workspace_id,

      advertiserId:
        pendingJob.advertiser_id,
    };

    const claimedJob =
      await claimNextNaverMediaSyncJob();

    const claimMatchesFixture =
      claimedJob !== null &&
      claimedJob.id ===
        pendingJob.id &&
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
      context.job.id ===
        claimedJob.id &&
      context.connection.id ===
        claimedJob.connection_id &&
      context.connection.workspaceId ===
        claimedJob.workspace_id &&
      context.connection.advertiserId ===
        claimedJob.advertiser_id &&
      context.connection.externalAccountId ===
        claimedJob.external_account_id &&
      context.credentials.customerId ===
        claimedJob.external_account_id;

    console.log(
      "worker context matches fixture:",
      contextMatchesFixture,
    );

    const canonicalRows =
      createCanonicalFixtureRows({
        externalAccountId:
          claimedJob.external_account_id,

        dateFrom:
          claimedJob.date_from,

        dateTo:
          claimedJob.date_to,
      });

    const partialAppend =
      await appendMediaSyncStagingBatch({
        job:
          claimedJob,

        rows:
          canonicalRows.slice(1),

        rowStartIndex:
          1,

        dateWindowIndex:
          1,
      });

    const partialAppendMatches =
      partialAppend.submittedRows ===
        2 &&
      partialAppend.insertedRows ===
        2 &&
      partialAppend.duplicateRows ===
        0 &&
      partialAppend.firstRowIndex ===
        1 &&
      partialAppend.lastRowIndex ===
        2;

    console.log(
      "partial append matches:",
      partialAppendMatches,
    );

    const incompleteSummary =
      await getMediaSyncStagingSummary({
        job:
          claimedJob,

        expectedRows:
          3,
      });

    const incompleteSummaryMatches =
      incompleteSummary.isComplete ===
        false &&
      incompleteSummary.totalRows ===
        2 &&
      incompleteSummary.minRowIndex ===
        1 &&
      incompleteSummary.maxRowIndex ===
        2 &&
      incompleteSummary.distinctRowIndexes ===
        2 &&
      incompleteSummary.rowsInExpectedRange ===
        2 &&
      incompleteSummary.missingExpectedRows ===
        1 &&
      incompleteSummary.outOfRangeRows ===
        0 &&
      incompleteSummary.scopeMismatchRows ===
        0 &&
      incompleteSummary.blankRowKeyRows ===
        0 &&
      incompleteSummary.missingFingerprintRows ===
        0 &&
      incompleteSummary.canonicalMismatchRows ===
        0 &&
      incompleteSummary.dateWindowCount ===
        1 &&
      incompleteSummary.dateWindowSummaries.length ===
        1 &&
      incompleteSummary.dateWindowSummaries[0]
        ?.dateWindowIndex === 1 &&
      incompleteSummary.dateWindowSummaries[0]
        ?.rowCount === 2;

    console.log(
      "incomplete summary matches:",
      incompleteSummaryMatches,
    );

    const incompleteAssertionRejected =
      await expectIncompleteError(
        () =>
          assertMediaSyncStagingComplete({
            job:
              claimedJob,

            expectedRows:
              3,
          }),
      );

    console.log(
      "incomplete staging rejected:",
      incompleteAssertionRejected,
    );

    const missingRowAppend =
      await appendMediaSyncStagingBatch({
        job:
          claimedJob,

        rows:
          canonicalRows.slice(0, 1),

        rowStartIndex:
          0,

        dateWindowIndex:
          0,
      });

    const missingRowAppendMatches =
      missingRowAppend.submittedRows ===
        1 &&
      missingRowAppend.insertedRows ===
        1 &&
      missingRowAppend.duplicateRows ===
        0 &&
      missingRowAppend.firstRowIndex ===
        0 &&
      missingRowAppend.lastRowIndex ===
        0;

    console.log(
      "missing row append matches:",
      missingRowAppendMatches,
    );

    const completeSummary =
      await getMediaSyncStagingSummary({
        job:
          claimedJob,

        expectedRows:
          3,
      });

    const windowZero =
      completeSummary
        .dateWindowSummaries[0];

    const windowOne =
      completeSummary
        .dateWindowSummaries[1];

    const completeSummaryMatches =
      completeSummary.isComplete ===
        true &&
      completeSummary.totalRows ===
        3 &&
      completeSummary.minRowIndex ===
        0 &&
      completeSummary.maxRowIndex ===
        2 &&
      completeSummary.distinctRowIndexes ===
        3 &&
      completeSummary.rowsInExpectedRange ===
        3 &&
      completeSummary.missingExpectedRows ===
        0 &&
      completeSummary.outOfRangeRows ===
        0 &&
      completeSummary.scopeMismatchRows ===
        0 &&
      completeSummary.blankRowKeyRows ===
        0 &&
      completeSummary.missingFingerprintRows ===
        0 &&
      completeSummary.canonicalMismatchRows ===
        0 &&
      completeSummary.dateWindowCount ===
        2 &&
      completeSummary.dateWindowSummaries.length ===
        2 &&
      windowZero?.dateWindowIndex ===
        0 &&
      windowZero.rowCount ===
        1 &&
      windowZero.minRowIndex ===
        0 &&
      windowZero.maxRowIndex ===
        0 &&
      windowOne?.dateWindowIndex ===
        1 &&
      windowOne.rowCount ===
        2 &&
      windowOne.minRowIndex ===
        1 &&
      windowOne.maxRowIndex ===
        2;

    console.log(
      "complete summary matches:",
      completeSummaryMatches,
    );

    const assertedCompleteSummary =
      await assertMediaSyncStagingComplete({
        job:
          claimedJob,

        expectedRows:
          3,
      });

    const completeAssertionAccepted =
      assertedCompleteSummary.isComplete ===
        true &&
      assertedCompleteSummary.totalRows ===
        3;

    console.log(
      "complete staging accepted:",
      completeAssertionAccepted,
    );

    const expectedCountMismatchSummary =
      await getMediaSyncStagingSummary({
        job:
          claimedJob,

        expectedRows:
          4,
      });

    const expectedCountMismatchDetected =
      expectedCountMismatchSummary
        .isComplete === false &&
      expectedCountMismatchSummary
        .totalRows === 3 &&
      expectedCountMismatchSummary
        .missingExpectedRows === 1 &&
      expectedCountMismatchSummary
        .outOfRangeRows === 0;

    console.log(
      "expected row count mismatch detected:",
      expectedCountMismatchDetected,
    );

    const wrongExpectedCountRejected =
      await expectIncompleteError(
        () =>
          assertMediaSyncStagingComplete({
            job:
              claimedJob,

            expectedRows:
              4,
          }),
      );

    console.log(
      "wrong expected count rejected:",
      wrongExpectedCountRejected,
    );

    const storedRowCount =
      await readStagingRowCount(
        claimedJob.id,
      );

    const storedRowCountMatches =
      storedRowCount === 3;

    console.log(
      "stored staging row count matches:",
      storedRowCountMatches,
    );

    const reportStateAfterVerification =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedBeforeCleanup =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterVerification,
      );

    console.log(
      "report pointers and report_rows unchanged:",
      reportUnchangedBeforeCleanup,
    );

    cleanupCompleted =
      await cleanupFixture(
        fixture,
      );

    console.log(
      "staging and job fixture cleanup completed:",
      cleanupCompleted,
    );

    const reportStateAfterCleanup =
      await readReportState(
        input.reportId,
      );

    const reportUnchangedAfterCleanup =
      reportStateMatches(
        reportStateBefore,
        reportStateAfterCleanup,
      );

    console.log(
      "report unchanged after cleanup:",
      reportUnchangedAfterCleanup,
    );

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      partialAppendMatches &&
      incompleteSummaryMatches &&
      incompleteAssertionRejected &&
      missingRowAppendMatches &&
      completeSummaryMatches &&
      completeAssertionAccepted &&
      expectedCountMismatchDetected &&
      wrongExpectedCountRejected &&
      storedRowCountMatches &&
      reportUnchangedBeforeCleanup &&
      cleanupCompleted &&
      reportUnchangedAfterCleanup;

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
          await cleanupFixture(
            fixture,
          );

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

    if (
      reportStateBefore !== null
    ) {
      try {
        const finalReportState =
          await readReportState(
            input.reportId,
          );

        const finalReportUnchanged =
          reportStateMatches(
            reportStateBefore,
            finalReportState,
          );

        console.log(
          "final report state unchanged:",
          finalReportUnchanged,
        );

        if (!finalReportUnchanged) {
          process.exitCode = 1;
        }
      } catch {
        console.error(
          "final report state check failed:",
          "VERIFICATION_REPORT_STATE_FINAL_CHECK_FAILED",
        );

        process.exitCode = 1;
      }
    }
  }
}

function readSafeErrorDiagnostic(
  value: unknown,
): Record<string, string | null> {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {
      name: null,
      code: null,
      message: null,
      details: null,
      hint: null,
    };
  }

  const record =
    value as Record<string, unknown>;

  return {
    name:
      typeof record.name === "string"
        ? record.name
        : null,

    code:
      typeof record.code === "string"
        ? record.code
        : null,

    message:
      typeof record.message === "string"
        ? record.message
        : null,

    details:
      typeof record.details === "string"
        ? record.details
        : null,

    hint:
      typeof record.hint === "string"
        ? record.hint
        : null,
  };
}

main().catch((error: unknown) => {
  if (
    error instanceof
      MediaSyncStagingSummaryError ||
    error instanceof
      MediaSyncStagingRepositoryError ||
    error instanceof
      MediaSyncJobsRepositoryError ||
    error instanceof
      MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "media sync staging summary verification failed:",
      error.code,
    );

    console.error(
      "repository error diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error,
        ),
      ),
    );

    console.error(
      "repository cause diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error.cause,
        ),
      ),
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "media sync staging summary verification failed:",
      error.message.startsWith(
        "VERIFICATION_",
      )
        ? error.message
        : error.name,
    );

    console.error(
      "error diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error,
        ),
      ),
    );

    console.error(
      "error cause diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(
          error.cause,
        ),
      ),
    );

    process.exitCode = 1;
    return;
  }

  console.error(
    "media sync staging summary verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
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
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
} from "../src/lib/media-sync/media-sync-staging-repository";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
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

type StagingStoredRow = {
  id: string;
  job_id: string;
  report_id: string;
  workspace_id: string;
  advertiser_id: string;
  connection_id: string;
  provider: string;
  external_account_id: string;
  date_window_index: number;
  date_from: string;
  date_to: string;
  row_index: number;
  row_key: string;
  date: string;
  channel: string | null;
  device: string | null;
  source: string | null;
  row: EtrylueNormalizedMediaRow;
  row_fingerprint: string;
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
      normalizeRequiredArgument(
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

function createCanonicalFixtureRows(
  input: {
    externalAccountId: string;
    dateFrom: string;
    dateTo: string;
  },
): EtrylueNormalizedMediaRow[] {
  const dates = [
    input.dateFrom,
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
          `fixture-campaign-${suffix}`,

        campaign_name:
          `fixture-campaign-${suffix}`,

        group:
          `fixture-group-${suffix}`,

        group_name:
          `fixture-group-${suffix}`,

        adgroup_name:
          `fixture-group-${suffix}`,

        keyword:
          `fixture-keyword-${suffix}`,

        keyword_name:
          `fixture-keyword-${suffix}`,

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
          "verification_fixture",

        provider:
          NAVER_PROVIDER,

        ingestion_source:
          "api",

        external_account_id:
          input.externalAccountId,

        external_campaign_id:
          `fixture-campaign-id-${suffix}`,

        external_group_id:
          `fixture-group-id-${suffix}`,

        external_keyword_id:
          `fixture-keyword-id-${suffix}`,

        provider_meta: {
          fixture: true,
          fixture_index:
            index,
        },
      };
    },
  );
}

async function readStagingRows(
  jobId: string,
): Promise<StagingStoredRow[]> {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from(
        MEDIA_SYNC_STAGING_ROWS_TABLE,
      )
      .select(
        [
          "id",
          "job_id",
          "report_id",
          "workspace_id",
          "advertiser_id",
          "connection_id",
          "provider",
          "external_account_id",
          "date_window_index",
          "date_from",
          "date_to",
          "row_index",
          "row_key",
          "date",
          "channel",
          "device",
          "source",
          "row",
          "row_fingerprint",
        ].join(", "),
      )
      .eq("job_id", jobId)
      .order(
        "row_index",
        { ascending: true },
      );

  if (error) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_READ_FAILED",
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "VERIFICATION_STAGING_ROWS_INVALID_RESULT",
    );
  }

  return data as unknown as StagingStoredRow[];
}

function normalizeStagingSnapshot(
  rows: readonly StagingStoredRow[],
): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      job_id: row.job_id,
      report_id:
        row.report_id,
      workspace_id:
        row.workspace_id,
      advertiser_id:
        row.advertiser_id,
      connection_id:
        row.connection_id,
      provider:
        row.provider,
      external_account_id:
        row.external_account_id,
      date_window_index:
        row.date_window_index,
      date_from:
        row.date_from,
      date_to:
        row.date_to,
      row_index:
        row.row_index,
      row_key:
        row.row_key,
      date:
        row.date,
      channel:
        row.channel,
      device:
        row.device,
      source:
        row.source,
      row:
        row.row,
      row_fingerprint:
        row.row_fingerprint,
    })),
  );
}

async function expectRepositoryError(
  operation: () => Promise<unknown>,
  expectedCode:
    MediaSyncStagingRepositoryError["code"],
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      error instanceof
        MediaSyncStagingRepositoryError &&
      error.code === expectedCode
    );
  }
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

  const remainingRows =
    await readStagingRows(
      fixture.jobId,
    );

  return remainingRows.length === 0;
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
        input.connectionId &&
      context.connection.workspaceId ===
        input.workspaceId &&
      context.connection.advertiserId ===
        input.advertiserId &&
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

    const firstAppend =
      await appendMediaSyncStagingBatch({
        job:
          claimedJob,

        rows:
          canonicalRows,

        rowStartIndex:
          0,

        dateWindowIndex:
          0,
      });

    const firstAppendMatches =
      firstAppend.submittedRows ===
        canonicalRows.length &&
      firstAppend.insertedRows ===
        canonicalRows.length &&
      firstAppend.duplicateRows ===
        0 &&
      firstAppend.firstRowIndex ===
        0 &&
      firstAppend.lastRowIndex ===
        canonicalRows.length - 1;

    console.log(
      "first append matches:",
      firstAppendMatches,
    );

    const storedAfterFirstAppend =
      await readStagingRows(
        claimedJob.id,
      );

    const storedRowCountMatches =
      storedAfterFirstAppend.length ===
      canonicalRows.length;

    const storedIndexesMatch =
      storedAfterFirstAppend.every(
        (row, index) =>
          Number(row.row_index) ===
          index,
      );

    const storedScopeMatches =
      storedAfterFirstAppend.every(
        (row) =>
          row.job_id ===
            claimedJob.id &&
          row.report_id ===
            claimedJob.report_id &&
          row.workspace_id ===
            claimedJob.workspace_id &&
          row.advertiser_id ===
            claimedJob.advertiser_id &&
          row.connection_id ===
            claimedJob.connection_id &&
          row.provider ===
            claimedJob.provider &&
          row.external_account_id ===
            claimedJob.external_account_id &&
          row.date_window_index ===
            0 &&
          row.date_from ===
            claimedJob.date_from &&
          row.date_to ===
            claimedJob.date_to,
      );

    const storedKeysPresent =
      storedAfterFirstAppend.every(
        (row) =>
          typeof row.row_key ===
            "string" &&
          row.row_key.length > 0,
      );

    const fingerprintsPresent =
      storedAfterFirstAppend.every(
        (row) =>
          typeof row.row_fingerprint ===
            "string" &&
          /^[0-9a-f]{64}$/.test(
            row.row_fingerprint,
          ),
      );

    console.log(
      "stored row count matches:",
      storedRowCountMatches,
    );

    console.log(
      "stored row indexes match:",
      storedIndexesMatch,
    );

    console.log(
      "stored row scope matches:",
      storedScopeMatches,
    );

    console.log(
      "stored row keys present:",
      storedKeysPresent,
    );

    console.log(
      "stored fingerprints present:",
      fingerprintsPresent,
    );

    const stableSnapshot =
      normalizeStagingSnapshot(
        storedAfterFirstAppend,
      );

    const duplicateAppend =
      await appendMediaSyncStagingBatch({
        job:
          claimedJob,

        rows:
          canonicalRows,

        rowStartIndex:
          0,

        dateWindowIndex:
          0,
      });

    const duplicateAppendMatches =
      duplicateAppend.submittedRows ===
        canonicalRows.length &&
      duplicateAppend.insertedRows ===
        0 &&
      duplicateAppend.duplicateRows ===
        canonicalRows.length &&
      duplicateAppend.firstRowIndex ===
        0 &&
      duplicateAppend.lastRowIndex ===
        canonicalRows.length - 1;

    console.log(
      "exact duplicate retry accepted:",
      duplicateAppendMatches,
    );

    const storedAfterDuplicate =
      await readStagingRows(
        claimedJob.id,
      );

    const duplicateRetryUnchanged =
      normalizeStagingSnapshot(
        storedAfterDuplicate,
      ) === stableSnapshot;

    console.log(
      "exact duplicate rows unchanged:",
      duplicateRetryUnchanged,
    );

    const metricConflictRows =
      canonicalRows.map(
        (row, index) =>
          index === 0
            ? {
                ...row,
                cost:
                  row.cost + 1,
              }
            : row,
      );

    const metricConflictDetected =
      await expectRepositoryError(
        () =>
          appendMediaSyncStagingBatch({
            job:
              claimedJob,

            rows:
              metricConflictRows,

            rowStartIndex:
              0,

            dateWindowIndex:
              0,
          }),
        "DUPLICATE_CONFLICT",
      );

    const storedAfterMetricConflict =
      await readStagingRows(
        claimedJob.id,
      );

    const metricConflictAtomic =
      normalizeStagingSnapshot(
        storedAfterMetricConflict,
      ) === stableSnapshot;

    console.log(
      "same row key metric conflict detected:",
      metricConflictDetected,
    );

    console.log(
      "metric conflict left DB unchanged:",
      metricConflictAtomic,
    );

    const rowIndexConflictRows =
      canonicalRows.map(
        (row, index) =>
          index === 0
            ? {
                ...row,
                keyword:
                  "fixture-conflicting-keyword",

                keyword_name:
                  "fixture-conflicting-keyword",

                external_keyword_id:
                  "fixture-conflicting-keyword-id",
              }
            : row,
      );

    const rowIndexConflictDetected =
      await expectRepositoryError(
        () =>
          appendMediaSyncStagingBatch({
            job:
              claimedJob,

            rows:
              rowIndexConflictRows,

            rowStartIndex:
              0,

            dateWindowIndex:
              0,
          }),
        "DUPLICATE_CONFLICT",
      );

    const storedAfterIndexConflict =
      await readStagingRows(
        claimedJob.id,
      );

    const rowIndexConflictAtomic =
      normalizeStagingSnapshot(
        storedAfterIndexConflict,
      ) === stableSnapshot;

    console.log(
      "same row index different key conflict detected:",
      rowIndexConflictDetected,
    );

    console.log(
      "row index conflict left DB unchanged:",
      rowIndexConflictAtomic,
    );

    const scopeMismatchRows =
      canonicalRows.map(
        (row, index) =>
          index === 0
            ? {
                ...row,
                external_account_id:
                  `${row.external_account_id}-mismatch`,
              }
            : row,
      );

    const scopeMismatchDetected =
      await expectRepositoryError(
        () =>
          appendMediaSyncStagingBatch({
            job:
              claimedJob,

            rows:
              scopeMismatchRows,

            rowStartIndex:
              0,

            dateWindowIndex:
              0,
          }),
        "SCOPE_MISMATCH",
      );

    const storedAfterScopeMismatch =
      await readStagingRows(
        claimedJob.id,
      );

    const scopeMismatchAtomic =
      normalizeStagingSnapshot(
        storedAfterScopeMismatch,
      ) === stableSnapshot;

    console.log(
      "scope mismatch detected:",
      scopeMismatchDetected,
    );

    console.log(
      "scope mismatch left DB unchanged:",
      scopeMismatchAtomic,
    );

    const emptyAppend =
      await appendMediaSyncStagingBatch({
        job:
          claimedJob,

        rows:
          [],

        rowStartIndex:
          canonicalRows.length,

        dateWindowIndex:
          0,
      });

    const emptyAppendMatches =
      emptyAppend.submittedRows ===
        0 &&
      emptyAppend.insertedRows ===
        0 &&
      emptyAppend.duplicateRows ===
        0 &&
      emptyAppend.firstRowIndex ===
        null &&
      emptyAppend.lastRowIndex ===
        null;

    console.log(
      "empty batch no-op matches:",
      emptyAppendMatches,
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
      firstAppendMatches &&
      storedRowCountMatches &&
      storedIndexesMatch &&
      storedScopeMatches &&
      storedKeysPresent &&
      fingerprintsPresent &&
      duplicateAppendMatches &&
      duplicateRetryUnchanged &&
      metricConflictDetected &&
      metricConflictAtomic &&
      rowIndexConflictDetected &&
      rowIndexConflictAtomic &&
      scopeMismatchDetected &&
      scopeMismatchAtomic &&
      emptyAppendMatches &&
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

        if (
          !emergencyCleanupCompleted
        ) {
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
      MediaSyncStagingRepositoryError ||
    error instanceof
      MediaSyncJobsRepositoryError ||
    error instanceof
      MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "media sync staging verification failed:",
      error.code,
    );

    console.error(
      "repository error diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(error),
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
      "media sync staging verification failed:",
      error.message.startsWith(
        "VERIFICATION_",
      )
        ? error.message
        : error.name,
    );

    console.error(
      "error diagnostic:",
      JSON.stringify(
        readSafeErrorDiagnostic(error),
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
    "media sync staging verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
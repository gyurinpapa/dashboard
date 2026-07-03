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
  NaverSearchAdsApiError,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsKeywordRecord,
} from "../src/lib/media-sync/naver-searchads-api";
import {
  iterateNaverSearchAdsAdgroups,
  iterateNaverSearchAdsCampaigns,
  iterateNaverSearchAdsKeywords,
  NaverSearchAdsHierarchyError,
  type NaverSearchAdsPageContext,
  type NaverSearchAdsPaginationSummary,
} from "../src/lib/media-sync/naver-searchads-hierarchy";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

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

const VERIFICATION_RECORD_SIZE = 3;
const VERIFICATION_MAX_PAGES = 100;

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

type RecordWithId = {
  id: string;
};

type CapturedPage = {
  pageNumber: number;
  recordCount: number;
  baseSearchId: string | null;
  nextBaseSearchId: string | null;
  totalRecordsSeen: number;
  isLastPage: boolean;
};

type PaginationCapture<T extends RecordWithId> = {
  ids: Set<string>;
  pages: CapturedPage[];
  firstRecord: T | null;
  duplicateDetected: boolean;
  pageSequenceValid: boolean;
  cursorSequenceValid: boolean;
  cumulativeCountValid: boolean;
  pageSizeValid: boolean;
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

function createPaginationCapture<
  T extends RecordWithId,
>(): PaginationCapture<T> {
  return {
    ids: new Set<string>(),
    pages: [],
    firstRecord: null,
    duplicateDetected: false,
    pageSequenceValid: true,
    cursorSequenceValid: true,
    cumulativeCountValid: true,
    pageSizeValid: true,
  };
}

function capturePage<
  T extends RecordWithId,
>(
  capture: PaginationCapture<T>,
  records: readonly T[],
  context: NaverSearchAdsPageContext,
): void {
  const previousPage =
    capture.pages[
      capture.pages.length - 1
    ] ?? null;

  const expectedPageNumber =
    capture.pages.length + 1;

  if (
    context.pageNumber !==
    expectedPageNumber
  ) {
    capture.pageSequenceValid = false;
  }

  if (previousPage) {
    if (
      context.baseSearchId !==
      previousPage.nextBaseSearchId
    ) {
      capture.cursorSequenceValid =
        false;
    }
  } else if (
    context.baseSearchId !== null
  ) {
    capture.cursorSequenceValid =
      false;
  }

  const expectedTotalRecords =
    capture.ids.size +
    records.length;

  if (
    context.totalRecordsSeen !==
    expectedTotalRecords
  ) {
    capture.cumulativeCountValid =
      false;
  }

  if (
    records.length >
    context.recordSize
  ) {
    capture.pageSizeValid = false;
  }

  if (
    records.length <
      context.recordSize &&
    !context.isLastPage
  ) {
    capture.pageSizeValid = false;
  }

  if (
    records.length ===
      context.recordSize &&
    context.isLastPage
  ) {
    capture.pageSizeValid = false;
  }

  const expectedNextBaseSearchId =
    records.length > 0
      ? records[
          records.length - 1
        ]?.id ?? null
      : null;

  if (
    context.nextBaseSearchId !==
    expectedNextBaseSearchId
  ) {
    capture.cursorSequenceValid =
      false;
  }

  if (
    context.nextBaseSearchId !==
      null &&
    context.nextBaseSearchId ===
      context.baseSearchId
  ) {
    capture.cursorSequenceValid =
      false;
  }

  for (const record of records) {
    if (capture.ids.has(record.id)) {
      capture.duplicateDetected =
        true;
    }

    capture.ids.add(record.id);

    if (!capture.firstRecord) {
      capture.firstRecord = record;
    }
  }

  capture.pages.push({
    pageNumber: context.pageNumber,
    recordCount: records.length,
    baseSearchId:
      context.baseSearchId,
    nextBaseSearchId:
      context.nextBaseSearchId,
    totalRecordsSeen:
      context.totalRecordsSeen,
    isLastPage:
      context.isLastPage,
  });
}

function validatePaginationResult<
  T extends RecordWithId,
>(
  capture: PaginationCapture<T>,
  summary: NaverSearchAdsPaginationSummary,
): boolean {
  const lastPage =
    capture.pages[
      capture.pages.length - 1
    ] ?? null;

  const precedingPages =
    capture.pages.slice(0, -1);

  const finalPageValid =
    lastPage !== null &&
    lastPage.isLastPage;

  const precedingPagesValid =
    precedingPages.every(
      (page) => !page.isLastPage,
    );

  const summaryMatches =
    summary.pageCount ===
      capture.pages.length &&
    summary.recordCount ===
      capture.ids.size &&
    summary.lastBaseSearchId ===
      lastPage?.nextBaseSearchId;

  const maxPagesRespected =
    summary.pageCount <=
    VERIFICATION_MAX_PAGES;

  return (
    capture.pageSequenceValid &&
    capture.cursorSequenceValid &&
    capture.cumulativeCountValid &&
    capture.pageSizeValid &&
    !capture.duplicateDetected &&
    finalPageValid &&
    precedingPagesValid &&
    summaryMatches &&
    maxPagesRespected
  );
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

async function deleteVerificationJob(
  fixture: VerificationFixture,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", fixture.jobId)
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

  return verifyJobDeleted(
    fixture.jobId,
  );
}

function printPaginationResult(
  label: string,
  capture: PaginationCapture<RecordWithId>,
  summary: NaverSearchAdsPaginationSummary,
  valid: boolean,
): void {
  console.log(
    `${label} pages:`,
    summary.pageCount,
  );
  console.log(
    `${label} records:`,
    summary.recordCount,
  );
  console.log(
    `${label} cursor sequence valid:`,
    capture.cursorSequenceValid,
  );
  console.log(
    `${label} duplicate IDs:`,
    capture.duplicateDetected,
  );
  console.log(
    `${label} pagination valid:`,
    valid,
  );
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
        dataLevel: "keyword",
        mode: "snapshot_replace",
      });

    fixture = {
      jobId: pendingJob.id,
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
        pendingJob.id &&
      context.connection.id ===
        input.connectionId &&
      context.connection.workspaceId ===
        input.workspaceId &&
      context.connection.advertiserId ===
        input.advertiserId &&
      context.credentials.customerId ===
        context.connection
          .externalAccountId;

    console.log(
      "worker context matches fixture:",
      contextMatchesFixture,
    );

    const campaignCapture =
      createPaginationCapture<
        NaverSearchAdsCampaignRecord
      >();

    const campaignSummary =
      await iterateNaverSearchAdsCampaigns({
        credentials:
          context.credentials,
        options: {
          recordSize:
            VERIFICATION_RECORD_SIZE,
          maxPages:
            VERIFICATION_MAX_PAGES,
        },
        onPage: (
          records,
          pageContext,
        ) => {
          capturePage(
            campaignCapture,
            records,
            pageContext,
          );
        },
      });

    const campaignPaginationValid =
      validatePaginationResult(
        campaignCapture,
        campaignSummary,
      );

    printPaginationResult(
      "campaign",
      campaignCapture,
      campaignSummary,
      campaignPaginationValid,
    );

    const firstCampaign =
      campaignCapture.firstRecord;

    let adgroupSummary:
      | NaverSearchAdsPaginationSummary
      | null = null;

    let adgroupCapture:
      | PaginationCapture<NaverSearchAdsAdgroupRecord>
      | null = null;

    let adgroupPaginationValid =
      firstCampaign === null;

    if (firstCampaign) {
      adgroupCapture =
        createPaginationCapture<
          NaverSearchAdsAdgroupRecord
        >();

      adgroupSummary =
        await iterateNaverSearchAdsAdgroups({
          credentials:
            context.credentials,
          campaignId:
            firstCampaign.id,
          options: {
            recordSize:
              VERIFICATION_RECORD_SIZE,
            maxPages:
              VERIFICATION_MAX_PAGES,
          },
          onPage: (
            records,
            pageContext,
          ) => {
            for (const record of records) {
              if (
                record.campaignId !==
                firstCampaign.id
              ) {
                throw new Error(
                  "VERIFICATION_ADGROUP_CAMPAIGN_SCOPE_MISMATCH",
                );
              }
            }

            capturePage(
              adgroupCapture!,
              records,
              pageContext,
            );
          },
        });

      adgroupPaginationValid =
        validatePaginationResult(
          adgroupCapture,
          adgroupSummary,
        );

      printPaginationResult(
        "adgroup",
        adgroupCapture,
        adgroupSummary,
        adgroupPaginationValid,
      );
    } else {
      console.log(
        "adgroup pagination skipped:",
        true,
      );
    }

    const firstAdgroup =
      adgroupCapture?.firstRecord ??
      null;

    let keywordSummary:
      | NaverSearchAdsPaginationSummary
      | null = null;

    let keywordCapture:
      | PaginationCapture<NaverSearchAdsKeywordRecord>
      | null = null;

    let keywordPaginationValid =
      firstAdgroup === null;

    if (firstAdgroup) {
      keywordCapture =
        createPaginationCapture<
          NaverSearchAdsKeywordRecord
        >();

      keywordSummary =
        await iterateNaverSearchAdsKeywords({
          credentials:
            context.credentials,
          adgroupId:
            firstAdgroup.id,
          options: {
            recordSize:
              VERIFICATION_RECORD_SIZE,
            maxPages:
              VERIFICATION_MAX_PAGES,
          },
          onPage: (
            records,
            pageContext,
          ) => {
            for (const record of records) {
              if (
                record.adgroupId !==
                firstAdgroup.id
              ) {
                throw new Error(
                  "VERIFICATION_KEYWORD_ADGROUP_SCOPE_MISMATCH",
                );
              }
            }

            capturePage(
              keywordCapture!,
              records,
              pageContext,
            );
          },
        });

      keywordPaginationValid =
        validatePaginationResult(
          keywordCapture,
          keywordSummary,
        );

      printPaginationResult(
        "keyword",
        keywordCapture,
        keywordSummary,
        keywordPaginationValid,
      );
    } else {
      console.log(
        "keyword pagination skipped:",
        true,
      );
    }

    const multiPageTraversalConfirmed =
      campaignSummary.pageCount >= 2 ||
      (adgroupSummary?.pageCount ??
        0) >= 2 ||
      (keywordSummary?.pageCount ??
        0) >= 2;

    console.log(
      "multi-page traversal confirmed:",
      multiPageTraversalConfirmed,
    );

    cleanupCompleted =
      await cleanupFixture(fixture);

    console.log(
      "verification fixture deleted:",
      cleanupCompleted,
    );

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      campaignPaginationValid &&
      adgroupPaginationValid &&
      keywordPaginationValid &&
      multiPageTraversalConfirmed &&
      cleanupCompleted;

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
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof
    NaverSearchAdsHierarchyError
  ) {
    console.error(
      "Naver pagination verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    NaverSearchAdsApiError
  ) {
    console.error(
      "Naver pagination verification failed:",
      error.code,
      error.status ?? "",
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "Naver pagination verification failed:",
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
      "Naver pagination verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver pagination verification failed:",
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
    "Naver pagination verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
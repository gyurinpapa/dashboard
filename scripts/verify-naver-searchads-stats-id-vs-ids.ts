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
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsKeywordDailyStats,
  probeNaverSearchAdsKeywordStatsIdsShape,
  fetchNaverSearchAdsKeywordPage,
  NaverSearchAdsApiError,
  type NaverSearchAdsKeywordRecord,
  type NaverSearchAdsSafeResponseShape,
} from "../src/lib/media-sync/naver-searchads-api";

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

const HIERARCHY_RECORD_SIZE = 100;
const MAX_CAMPAIGN_PAGES = 100;
const MAX_ADGROUP_PAGES = 100;
const MAX_KEYWORD_PAGES = 100;

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

async function findFirstKeyword(
  credentials: Parameters<
    typeof fetchNaverSearchAdsCampaignPage
  >[0]["credentials"],
): Promise<NaverSearchAdsKeywordRecord | null> {
  let campaignBaseSearchId:
    | string
    | null = null;

  for (
    let campaignPageNumber = 1;
    campaignPageNumber <= MAX_CAMPAIGN_PAGES;
    campaignPageNumber += 1
  ) {
    const campaignPage =
      await fetchNaverSearchAdsCampaignPage({
        credentials,
        baseSearchId:
          campaignBaseSearchId,
        recordSize:
          HIERARCHY_RECORD_SIZE,
        selector: "NEXT",
      });

    for (
      const campaign
      of campaignPage.records
    ) {
      let adgroupBaseSearchId:
        | string
        | null = null;

      for (
        let adgroupPageNumber = 1;
        adgroupPageNumber <= MAX_ADGROUP_PAGES;
        adgroupPageNumber += 1
      ) {
        const adgroupPage =
          await fetchNaverSearchAdsAdgroupPage({
            credentials,
            campaignId: campaign.id,
            baseSearchId:
              adgroupBaseSearchId,
            recordSize:
              HIERARCHY_RECORD_SIZE,
            selector: "NEXT",
          });

        for (
          const adgroup
          of adgroupPage.records
        ) {
          let keywordBaseSearchId:
            | string
            | null = null;

          for (
            let keywordPageNumber = 1;
            keywordPageNumber <= MAX_KEYWORD_PAGES;
            keywordPageNumber += 1
          ) {
            const keywordPage =
              await fetchNaverSearchAdsKeywordPage({
                credentials,
                adgroupId: adgroup.id,
                baseSearchId:
                  keywordBaseSearchId,
                recordSize:
                  HIERARCHY_RECORD_SIZE,
                selector: "NEXT",
              });

            const firstKeyword =
              keywordPage.records[0] ??
              null;

            if (firstKeyword) {
              return firstKeyword;
            }

            if (
              keywordPage.records.length <
              HIERARCHY_RECORD_SIZE
            ) {
              break;
            }

            if (
              !keywordPage.nextBaseSearchId ||
              keywordPage.nextBaseSearchId ===
                keywordBaseSearchId
            ) {
              throw new Error(
                "VERIFICATION_KEYWORD_CURSOR_INVALID",
              );
            }

            keywordBaseSearchId =
              keywordPage.nextBaseSearchId;
          }
        }

        if (
          adgroupPage.records.length <
          HIERARCHY_RECORD_SIZE
        ) {
          break;
        }

        if (
          !adgroupPage.nextBaseSearchId ||
          adgroupPage.nextBaseSearchId ===
            adgroupBaseSearchId
        ) {
          throw new Error(
            "VERIFICATION_ADGROUP_CURSOR_INVALID",
          );
        }

        adgroupBaseSearchId =
          adgroupPage.nextBaseSearchId;
      }
    }

    if (
      campaignPage.records.length <
      HIERARCHY_RECORD_SIZE
    ) {
      return null;
    }

    if (
      !campaignPage.nextBaseSearchId ||
      campaignPage.nextBaseSearchId ===
        campaignBaseSearchId
    ) {
      throw new Error(
        "VERIFICATION_CAMPAIGN_CURSOR_INVALID",
      );
    }

    campaignBaseSearchId =
      campaignPage.nextBaseSearchId;
  }

  throw new Error(
    "VERIFICATION_CAMPAIGN_PAGE_LIMIT_EXCEEDED",
  );
}

function statsNumbersAreValid(
  records: Awaited<
    ReturnType<
      typeof fetchNaverSearchAdsKeywordDailyStats
    >
  >["records"],
): boolean {
  return records.every((record) =>
    [
      record.impCnt,
      record.clkCnt,
      record.salesAmt,
      record.ccnt,
      record.convAmt,
      record.avgRnk,
    ].every(
      (value) =>
        value === null ||
        Number.isFinite(value),
    ),
  );
}

function safeShapeToText(
  shape: NaverSearchAdsSafeResponseShape,
): string {
  const parts = [
    `kind=${shape.kind}`,
  ];

  if (shape.keys.length > 0) {
    parts.push(
      `keys=${shape.keys.join(",")}`,
    );
  }

  if (shape.itemCount !== null) {
    parts.push(
      `itemCount=${shape.itemCount}`,
    );
  }

  if (shape.firstItemKind !== null) {
    parts.push(
      `firstItemKind=${shape.firstItemKind}`,
    );
  }

  if (
    shape.firstItemKeys.length > 0
  ) {
    parts.push(
      `firstItemKeys=${shape.firstItemKeys.join(",")}`,
    );
  }

  return parts.join("; ");
}

function printShapeResult(
  label: string,
  result: {
    responseShape:
      NaverSearchAdsSafeResponseShape;
    topLevelChildShapes: Record<
      string,
      NaverSearchAdsSafeResponseShape
    >;
  },
): void {
  console.log(
    `${label} response shape:`,
    safeShapeToText(
      result.responseShape,
    ),
  );

  for (
    const [key, shape]
    of Object.entries(
      result.topLevelChildShapes,
    )
  ) {
    console.log(
      `${label} child shape ${key}:`,
      safeShapeToText(shape),
    );
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

    const keyword = await findFirstKeyword(
      context.credentials,
    );

    const keywordIdAcquired =
      keyword !== null;

    console.log(
      "keyword ID acquired:",
      keywordIdAcquired,
    );

    if (!keyword) {
      throw new Error(
        "VERIFICATION_KEYWORD_NOT_FOUND",
      );
    }

    const idStatsResult =
      await fetchNaverSearchAdsKeywordDailyStats({
        credentials:
          context.credentials,
        keywordId: keyword.id,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });

    const idRequestScopePreserved =
      idStatsResult.keywordId ===
      keyword.id;

    const idDatesWithinRange =
      idStatsResult.records.every(
        (record) =>
          record.date >=
            input.dateFrom &&
          record.date <= input.dateTo &&
          record.periodStart ===
            record.date &&
          record.periodEnd ===
            record.date,
      );

    const idNumericFieldsValid =
      statsNumbersAreValid(
        idStatsResult.records,
      );

    console.log(
      "id request succeeded:",
      true,
    );
    console.log(
      "id records returned:",
      idStatsResult.records.length,
    );
    console.log(
      "id request scope preserved:",
      idRequestScopePreserved,
    );
    console.log(
      "id dates within range:",
      idDatesWithinRange,
    );
    console.log(
      "id numeric fields valid:",
      idNumericFieldsValid,
    );

    const idsSummaryResult =
      await probeNaverSearchAdsKeywordStatsIdsShape({
        credentials:
          context.credentials,
        keywordId: keyword.id,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        includeTimeIncrement: false,
      });

    const idsSummaryScopePreserved =
      idsSummaryResult.keywordId ===
        keyword.id &&
      idsSummaryResult.dateFrom ===
        input.dateFrom &&
      idsSummaryResult.dateTo ===
        input.dateTo &&
      idsSummaryResult
        .includeTimeIncrement ===
        false;

    console.log(
      "ids summary request succeeded:",
      true,
    );
    console.log(
      "ids summary scope preserved:",
      idsSummaryScopePreserved,
    );

    printShapeResult(
      "ids summary",
      idsSummaryResult,
    );

    let idsDailyHttp400 = false;
    let idsDailySucceeded = false;
    let idsDailyScopePreserved = false;

    try {
      const idsDailyResult =
        await probeNaverSearchAdsKeywordStatsIdsShape({
          credentials:
            context.credentials,
          keywordId: keyword.id,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          includeTimeIncrement: true,
        });

      idsDailySucceeded = true;

      idsDailyScopePreserved =
        idsDailyResult.keywordId ===
          keyword.id &&
        idsDailyResult.dateFrom ===
          input.dateFrom &&
        idsDailyResult.dateTo ===
          input.dateTo &&
        idsDailyResult
          .includeTimeIncrement ===
          true;

      console.log(
        "ids daily request succeeded:",
        true,
      );
      console.log(
        "ids daily scope preserved:",
        idsDailyScopePreserved,
      );

      printShapeResult(
        "ids daily",
        idsDailyResult,
      );
    } catch (error) {
      if (
        error instanceof
          NaverSearchAdsApiError &&
        error.code === "HTTP_ERROR" &&
        error.status === 400
      ) {
        idsDailyHttp400 = true;

        console.log(
          "ids daily request HTTP 400:",
          true,
        );
      } else {
        throw error;
      }
    }

    const comparisonOutcomeValid =
      idsDailySucceeded
        ? idsDailyScopePreserved
        : idsDailyHttp400;

    console.log(
      "id versus ids comparison valid:",
      comparisonOutcomeValid,
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

    const verificationPassed =
      claimMatchesFixture &&
      contextMatchesFixture &&
      keywordIdAcquired &&
      idRequestScopePreserved &&
      idDatesWithinRange &&
      idNumericFieldsValid &&
      idsSummaryScopePreserved &&
      comparisonOutcomeValid &&
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
    NaverSearchAdsApiError
  ) {
    console.error(
      "Naver id versus ids verification failed:",
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
      "Naver id versus ids verification failed:",
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
      "Naver id versus ids verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver id versus ids verification failed:",
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
    "Naver id versus ids verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});

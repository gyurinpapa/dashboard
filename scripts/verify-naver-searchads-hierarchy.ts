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
  fetchNaverSearchAdsKeywordPage,
  NaverSearchAdsApiError,
} from "../src/lib/media-sync/naver-searchads-api";

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

const VERIFICATION_RECORD_SIZE = 10;

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

  if (Array.isArray(data) && data.length > 0) {
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
    .in("status", [...ACTIVE_JOB_STATUSES])
    .limit(1);

  if (error) {
    throw new Error(
      "VERIFICATION_REPORT_ACTIVE_JOB_CHECK_FAILED",
    );
  }

  if (Array.isArray(data) && data.length > 0) {
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
    .eq("report_id", fixture.reportId)
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

  return verifyJobDeleted(fixture.jobId);
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
      context.connection.externalAccountId ===
        context.credentials.customerId;

    console.log(
      "worker context matches fixture:",
      contextMatchesFixture,
    );

    const campaignPage =
      await fetchNaverSearchAdsCampaignPage({
        credentials:
          context.credentials,
        recordSize:
          VERIFICATION_RECORD_SIZE,
        selector: "NEXT",
      });

    const campaignPageValid =
      Array.isArray(
        campaignPage.records,
      ) &&
      campaignPage.recordSize ===
        VERIFICATION_RECORD_SIZE &&
      campaignPage.selector === "NEXT" &&
      campaignPage.baseSearchId === null &&
      campaignPage.records.every(
        (campaign) =>
          campaign.id.trim().length > 0 &&
          campaign.name.trim().length > 0,
      );

    console.log(
      "campaign page request succeeded:",
      true,
    );
    console.log(
      "campaign page valid:",
      campaignPageValid,
    );
    console.log(
      "campaign records:",
      campaignPage.records.length,
    );

    let adgroupPageValid = true;
    let keywordPageValid = true;
    let adgroupRequestExecuted = false;
    let keywordRequestExecuted = false;
    let adgroupRecordCount = 0;
    let keywordRecordCount = 0;

    const firstCampaign =
      campaignPage.records[0] ?? null;

    if (firstCampaign) {
      adgroupRequestExecuted = true;

      const adgroupPage =
        await fetchNaverSearchAdsAdgroupPage({
          credentials:
            context.credentials,
          campaignId:
            firstCampaign.id,
          recordSize:
            VERIFICATION_RECORD_SIZE,
          selector: "NEXT",
        });

      adgroupRecordCount =
        adgroupPage.records.length;

      adgroupPageValid =
        adgroupPage.recordSize ===
          VERIFICATION_RECORD_SIZE &&
        adgroupPage.selector === "NEXT" &&
        adgroupPage.baseSearchId === null &&
        adgroupPage.records.every(
          (adgroup) =>
            adgroup.id.trim().length > 0 &&
            adgroup.name.trim().length > 0 &&
            adgroup.campaignId ===
              firstCampaign.id,
        );

      const firstAdgroup =
        adgroupPage.records[0] ?? null;

      if (firstAdgroup) {
        keywordRequestExecuted = true;

        const keywordPage =
          await fetchNaverSearchAdsKeywordPage({
            credentials:
              context.credentials,
            adgroupId:
              firstAdgroup.id,
            recordSize:
              VERIFICATION_RECORD_SIZE,
            selector: "NEXT",
          });

        keywordRecordCount =
          keywordPage.records.length;

        keywordPageValid =
          keywordPage.recordSize ===
            VERIFICATION_RECORD_SIZE &&
          keywordPage.selector ===
            "NEXT" &&
          keywordPage.baseSearchId ===
            null &&
          keywordPage.records.every(
            (keyword) =>
              keyword.id.trim().length >
                0 &&
              keyword.keyword.trim()
                .length > 0 &&
              keyword.adgroupId ===
                firstAdgroup.id,
          );
      }
    }

    console.log(
      "adgroup request executed:",
      adgroupRequestExecuted,
    );
    console.log(
      "adgroup page valid:",
      adgroupPageValid,
    );
    console.log(
      "adgroup records:",
      adgroupRecordCount,
    );
    console.log(
      "keyword request executed:",
      keywordRequestExecuted,
    );
    console.log(
      "keyword page valid:",
      keywordPageValid,
    );
    console.log(
      "keyword records:",
      keywordRecordCount,
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
      campaignPageValid &&
      adgroupPageValid &&
      keywordPageValid &&
      cleanupCompleted;

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
    NaverSearchAdsApiError
  ) {
    console.error(
      "Naver hierarchy verification failed:",
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
      "Naver hierarchy verification failed:",
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
      "Naver hierarchy verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "Naver hierarchy verification failed:",
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
    "Naver hierarchy verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
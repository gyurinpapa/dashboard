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
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PENDING_STATUS =
  "pending" as const;

const PROCESSING_STATUS =
  "processing" as const;

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

async function expectWorkerRepositoryError(
  action: () => Promise<unknown>,
  expectedCodes: ReadonlyArray<
    MediaSyncWorkerRepositoryError["code"]
  >,
): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    return (
      error instanceof
        MediaSyncWorkerRepositoryError &&
      expectedCodes.includes(error.code)
    );
  }
}

function createChangedJob(
  job: MediaSyncJobRecord,
  values: Partial<MediaSyncJobRecord>,
): MediaSyncJobRecord {
  return {
    ...job,
    ...values,
  };
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  let fixture: VerificationFixture | null =
    null;

  let cleanupCompleted = false;

  try {
    await assertNoExistingPendingNaverJob();

    console.log(
      "existing pending Naver jobs:",
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

    const jobScopeMatches =
      context.job.id === claimedJob.id &&
      context.job.connection_id ===
        input.connectionId &&
      context.job.workspace_id ===
        input.workspaceId &&
      context.job.advertiser_id ===
        input.advertiserId &&
      context.job.report_id ===
        input.reportId;

    const connectionScopeMatches =
      context.connection.id ===
        claimedJob.connection_id &&
      context.connection.workspaceId ===
        claimedJob.workspace_id &&
      context.connection.advertiserId ===
        claimedJob.advertiser_id &&
      context.connection.provider ===
        NAVER_PROVIDER &&
      context.connection.externalAccountId ===
        claimedJob.external_account_id;

    const credentialAccountMatches =
      context.credentials.customerId ===
        claimedJob.external_account_id &&
      context.credentials.customerId ===
        context.connection.externalAccountId;

    const credentialValuesPresent =
      context.credentials.customerId
        .trim()
        .length > 0 &&
      context.credentials.accessLicense
        .trim()
        .length > 0 &&
      context.credentials.secretKey
        .trim()
        .length > 0;

    const connectionHasNoCiphertext =
      !(
        "credential_ciphertext" in
        context.connection
      );

    console.log(
      "job scope matches:",
      jobScopeMatches,
    );
    console.log(
      "connection scope matches:",
      connectionScopeMatches,
    );
    console.log(
      "credential account matches:",
      credentialAccountMatches,
    );
    console.log(
      "credential values present:",
      credentialValuesPresent,
    );
    console.log(
      "connection ciphertext excluded:",
      connectionHasNoCiphertext,
    );

    const pendingJobBlocked =
      await expectWorkerRepositoryError(
        () =>
          loadNaverMediaSyncWorkerContext(
            pendingJob,
          ),
        ["JOB_NOT_PROCESSING"],
      );

    console.log(
      "pending job blocked:",
      pendingJobBlocked,
    );

    const providerMismatchBlocked =
      await expectWorkerRepositoryError(
        () =>
          loadNaverMediaSyncWorkerContext(
            createChangedJob(
              claimedJob,
              {
                provider: "google_ads",
              },
            ),
          ),
        ["UNSUPPORTED_PROVIDER"],
      );

    console.log(
      "provider mismatch blocked:",
      providerMismatchBlocked,
    );

    const connectionIdMismatchBlocked =
      await expectWorkerRepositoryError(
        () =>
          loadNaverMediaSyncWorkerContext(
            createChangedJob(
              claimedJob,
              {
                connection_id:
                  "00000000-0000-0000-0000-000000000001",
              },
            ),
          ),
        ["CONNECTION_NOT_FOUND"],
      );

    console.log(
      "connection ID mismatch blocked:",
      connectionIdMismatchBlocked,
    );

    const workspaceMismatchBlocked =
      await expectWorkerRepositoryError(
        () =>
          loadNaverMediaSyncWorkerContext(
            createChangedJob(
              claimedJob,
              {
                workspace_id:
                  "00000000-0000-0000-0000-000000000002",
              },
            ),
          ),
        ["CONNECTION_NOT_FOUND"],
      );

    console.log(
      "workspace mismatch blocked:",
      workspaceMismatchBlocked,
    );

    const advertiserMismatchBlocked =
      await expectWorkerRepositoryError(
        () =>
          loadNaverMediaSyncWorkerContext(
            createChangedJob(
              claimedJob,
              {
                advertiser_id:
                  "00000000-0000-0000-0000-000000000003",
              },
            ),
          ),
        ["CONNECTION_NOT_FOUND"],
      );

    console.log(
      "advertiser mismatch blocked:",
      advertiserMismatchBlocked,
    );

    const externalAccountMismatchBlocked =
      await expectWorkerRepositoryError(
        () =>
          loadNaverMediaSyncWorkerContext(
            createChangedJob(
              claimedJob,
              {
                external_account_id:
                  `${claimedJob.external_account_id}-mismatch`,
              },
            ),
          ),
        ["CONNECTION_SCOPE_MISMATCH"],
      );

    console.log(
      "external account mismatch blocked:",
      externalAccountMismatchBlocked,
    );

    cleanupCompleted =
      await cleanupFixture(fixture);

    console.log(
      "verification fixture deleted:",
      cleanupCompleted,
    );

    const verificationPassed =
      claimMatchesFixture &&
      jobScopeMatches &&
      connectionScopeMatches &&
      credentialAccountMatches &&
      credentialValuesPresent &&
      connectionHasNoCiphertext &&
      pendingJobBlocked &&
      providerMismatchBlocked &&
      connectionIdMismatchBlocked &&
      workspaceMismatchBlocked &&
      advertiserMismatchBlocked &&
      externalAccountMismatchBlocked &&
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
    MediaSyncWorkerRepositoryError
  ) {
    console.error(
      "media sync worker context verification failed:",
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
      "media sync worker context verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "media sync worker context verification failed:",
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
    "media sync worker context verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
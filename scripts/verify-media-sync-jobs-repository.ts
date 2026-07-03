import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
} from "../src/lib/media-sync/media-sync-jobs-repository";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

type VerificationInput = {
  reportId: string;
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
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

async function deleteVerificationJob(input: {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
}): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .delete()
    .eq("id", input.jobId)
    .eq("report_id", input.reportId)
    .eq("workspace_id", input.workspaceId)
    .eq("advertiser_id", input.advertiserId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_DELETE_FAILED",
    );
  }

  return data?.id === input.jobId;
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

async function main(): Promise<void> {
  const input = readVerificationInput();

  let createdJobId: string | null = null;
  let cleanupCompleted = false;

  try {
    const job =
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

    createdJobId = job.id;

    const scopeMatches =
      job.report_id === input.reportId &&
      job.connection_id ===
        input.connectionId &&
      job.workspace_id ===
        input.workspaceId &&
      job.advertiser_id ===
        input.advertiserId &&
      job.created_by === input.createdBy;

    const initialStateMatches =
      job.status === "pending" &&
      job.mode === "snapshot_replace" &&
      job.data_level === "keyword" &&
      job.progress === 0 &&
      job.raw_rows === 0 &&
      job.normalized_rows === 0 &&
      job.inserted_rows === 0 &&
      job.failed_rows === 0 &&
      job.attempt_count === 0 &&
      job.snapshot_ingestion_id ===
        null &&
      job.started_at === null &&
      job.finished_at === null &&
      job.error === null &&
      job.error_detail === null;

    console.log(
      "job created:",
      true,
    );
    console.log(
      "status:",
      job.status,
    );
    console.log(
      "scope matches:",
      scopeMatches,
    );
    console.log(
      "initial state matches:",
      initialStateMatches,
    );
    console.log(
      "previous ingestion captured:",
      job.previous_ingestion_id !==
        undefined,
    );

    const deleted =
      await deleteVerificationJob({
        jobId: job.id,
        reportId: input.reportId,
        workspaceId:
          input.workspaceId,
        advertiserId:
          input.advertiserId,
      });

    const deletionConfirmed =
      deleted &&
      (await verifyJobDeleted(job.id));

    cleanupCompleted =
      deletionConfirmed;

    console.log(
      "verification job deleted:",
      deletionConfirmed,
    );

    const verificationPassed =
      scopeMatches &&
      initialStateMatches &&
      deletionConfirmed;

    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (
      createdJobId &&
      !cleanupCompleted
    ) {
      try {
        const deleted =
          await deleteVerificationJob({
            jobId: createdJobId,
            reportId: input.reportId,
            workspaceId:
              input.workspaceId,
            advertiserId:
              input.advertiserId,
          });

        const deletionConfirmed =
          deleted &&
          (await verifyJobDeleted(
            createdJobId,
          ));

        console.log(
          "emergency cleanup completed:",
          deletionConfirmed,
        );

        if (!deletionConfirmed) {
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
    MediaSyncJobsRepositoryError
  ) {
    console.error(
      "media sync job verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "media sync job verification failed:",
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
    "media sync job verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
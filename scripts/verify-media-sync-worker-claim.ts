import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createPendingMediaSyncJob,
  MediaSyncJobsRepositoryError,
  parseMediaSyncJobRecord,
} from "../src/lib/media-sync/media-sync-jobs-repository";
import {
  claimNextNaverMediaSyncJob,
  MediaSyncWorkerRepositoryError,
} from "../src/lib/media-sync/media-sync-worker-repository";
import type {
  MediaProvider,
  MediaSyncJobRecord,
  MediaSyncJobStatus,
} from "../src/lib/media-sync/types";

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const GOOGLE_PROVIDER =
  "google_ads" as const;

const META_PROVIDER =
  "meta_ads" as const;

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

type FixtureIdentity = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
};

type PreservedJobFields = {
  workspace_id: string;
  advertiser_id: string;
  report_id: string;
  connection_id: string;
  provider: MediaProvider;
  external_account_id: string;
  date_from: string;
  date_to: string;
  data_level: MediaSyncJobRecord["data_level"];
  mode: MediaSyncJobRecord["mode"];
  previous_ingestion_id: string | null;
  snapshot_ingestion_id: string | null;
  raw_rows: number;
  normalized_rows: number;
  inserted_rows: number;
  failed_rows: number;
  progress: number;
  created_by: string;
  created_at: string;
  finished_at: string | null;
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

function buildFixtureIdentity(
  job: MediaSyncJobRecord,
): FixtureIdentity {
  return {
    jobId: job.id,
    reportId: job.report_id,
    workspaceId: job.workspace_id,
    advertiserId: job.advertiser_id,
  };
}

function pickPreservedFields(
  job: MediaSyncJobRecord,
): PreservedJobFields {
  return {
    workspace_id: job.workspace_id,
    advertiser_id: job.advertiser_id,
    report_id: job.report_id,
    connection_id: job.connection_id,
    provider: job.provider,
    external_account_id:
      job.external_account_id,
    date_from: job.date_from,
    date_to: job.date_to,
    data_level: job.data_level,
    mode: job.mode,
    previous_ingestion_id:
      job.previous_ingestion_id,
    snapshot_ingestion_id:
      job.snapshot_ingestion_id,
    raw_rows: job.raw_rows,
    normalized_rows:
      job.normalized_rows,
    inserted_rows: job.inserted_rows,
    failed_rows: job.failed_rows,
    progress: job.progress,
    created_by: job.created_by,
    created_at: job.created_at,
    finished_at: job.finished_at,
  };
}

function arePreservedFieldsEqual(
  before: PreservedJobFields,
  after: PreservedJobFields,
): boolean {
  return (
    before.workspace_id ===
      after.workspace_id &&
    before.advertiser_id ===
      after.advertiser_id &&
    before.report_id ===
      after.report_id &&
    before.connection_id ===
      after.connection_id &&
    before.provider === after.provider &&
    before.external_account_id ===
      after.external_account_id &&
    before.date_from === after.date_from &&
    before.date_to === after.date_to &&
    before.data_level ===
      after.data_level &&
    before.mode === after.mode &&
    before.previous_ingestion_id ===
      after.previous_ingestion_id &&
    before.snapshot_ingestion_id ===
      after.snapshot_ingestion_id &&
    before.raw_rows === after.raw_rows &&
    before.normalized_rows ===
      after.normalized_rows &&
    before.inserted_rows ===
      after.inserted_rows &&
    before.failed_rows ===
      after.failed_rows &&
    before.progress === after.progress &&
    before.created_by ===
      after.created_by &&
    before.created_at ===
      after.created_at &&
    before.finished_at ===
      after.finished_at
  );
}

async function assertNoExistingPendingNaverJobs(): Promise<void> {
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

async function createVerificationJob(
  input: VerificationInput,
): Promise<MediaSyncJobRecord> {
  const job =
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

  return parseMediaSyncJobRecord(job);
}

async function readVerificationJob(
  jobId: string,
): Promise<MediaSyncJobRecord | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_READ_FAILED",
    );
  }

  if (!data) {
    return null;
  }

  return parseMediaSyncJobRecord(data);
}

async function updateVerificationJob(
  jobId: string,
  values: {
    provider?: MediaProvider;
    status?: MediaSyncJobStatus;
    progress?: number;
    raw_rows?: number;
    normalized_rows?: number;
    inserted_rows?: number;
    failed_rows?: number;
    attempt_count?: number;
    started_at?: string | null;
    finished_at?: string | null;
    updated_at?: string;
    error?: string | null;
    error_detail?:
      | Record<string, string | number | boolean | null>
      | null;
  },
): Promise<MediaSyncJobRecord> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .update(values)
    .eq("id", jobId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      "VERIFICATION_JOB_UPDATE_FAILED",
    );
  }

  return parseMediaSyncJobRecord(data);
}

async function deleteVerificationJob(
  input: FixtureIdentity,
): Promise<boolean> {
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

async function cleanupFixture(
  fixture: FixtureIdentity,
): Promise<boolean> {
  const deleted =
    await deleteVerificationJob(fixture);

  if (!deleted) {
    return false;
  }

  return verifyJobDeleted(fixture.jobId);
}

async function verifySingleClaim(
  input: VerificationInput,
  fixtures: Map<string, FixtureIdentity>,
): Promise<boolean> {
  const created =
    await createVerificationJob(input);

  const fixture =
    buildFixtureIdentity(created);

  fixtures.set(created.id, fixture);

  const prepared =
    await updateVerificationJob(
      created.id,
      {
        progress: 37,
        raw_rows: 11,
        normalized_rows: 7,
        inserted_rows: 5,
        failed_rows: 2,
        attempt_count: 2,
        updated_at:
          "2000-01-01T00:00:00.000Z",
        error: "verification-old-error",
        error_detail: {
          fixture: true,
          phase: "before-claim",
        },
      },
    );

  const beforePreservedFields =
    pickPreservedFields(prepared);

  const claimed =
    await claimNextNaverMediaSyncJob();

  const claimedCorrectJob =
    claimed?.id === created.id;

  const processingStateMatches =
    claimed !== null &&
    claimed.status ===
      PROCESSING_STATUS &&
    claimed.provider ===
      NAVER_PROVIDER &&
    claimed.started_at !== null &&
    claimed.attempt_count === 3 &&
    claimed.error === null &&
    claimed.error_detail === null;

  const updatedAtChanged =
    claimed !== null &&
    claimed.updated_at !==
      prepared.updated_at;

  const preservedFieldsMatch =
    claimed !== null &&
    arePreservedFieldsEqual(
      beforePreservedFields,
      pickPreservedFields(claimed),
    );

  const secondClaim =
    await claimNextNaverMediaSyncJob();

  const cannotBeClaimedTwice =
    secondClaim === null;

  const stored =
    await readVerificationJob(created.id);

  const storedStateMatches =
    stored !== null &&
    stored.status ===
      PROCESSING_STATUS &&
    stored.started_at !== null &&
    stored.attempt_count === 3 &&
    stored.error === null &&
    stored.error_detail === null &&
    arePreservedFieldsEqual(
      beforePreservedFields,
      pickPreservedFields(stored),
    );

  console.log(
    "single claim returned fixture:",
    claimedCorrectJob,
  );
  console.log(
    "single claim processing state:",
    processingStateMatches,
  );
  console.log(
    "single claim updated_at changed:",
    updatedAtChanged,
  );
  console.log(
    "single claim fields preserved:",
    preservedFieldsMatch,
  );
  console.log(
    "single claim stored state:",
    storedStateMatches,
  );
  console.log(
    "same job cannot be claimed twice:",
    cannotBeClaimedTwice,
  );

  const cleanupCompleted =
    await cleanupFixture(fixture);

  if (cleanupCompleted) {
    fixtures.delete(created.id);
  }

  console.log(
    "single claim fixture deleted:",
    cleanupCompleted,
  );

  return (
    claimedCorrectJob &&
    processingStateMatches &&
    updatedAtChanged &&
    preservedFieldsMatch &&
    storedStateMatches &&
    cannotBeClaimedTwice &&
    cleanupCompleted
  );
}

async function verifyProviderExcluded(
  input: VerificationInput,
  provider: typeof GOOGLE_PROVIDER | typeof META_PROVIDER,
  fixtures: Map<string, FixtureIdentity>,
): Promise<boolean> {
  const created =
    await createVerificationJob(input);

  const fixture =
    buildFixtureIdentity(created);

  fixtures.set(created.id, fixture);

  const prepared =
    await updateVerificationJob(
      created.id,
      {
        provider,
      },
    );

  const claimResult =
    await claimNextNaverMediaSyncJob();

  const stored =
    await readVerificationJob(created.id);

  const excluded =
    claimResult === null &&
    prepared.provider === provider &&
    stored !== null &&
    stored.provider === provider &&
    stored.status === PENDING_STATUS &&
    stored.started_at === null &&
    stored.attempt_count === 0;

  console.log(
    `${provider} pending job excluded:`,
    excluded,
  );

  const cleanupCompleted =
    await cleanupFixture(fixture);

  if (cleanupCompleted) {
    fixtures.delete(created.id);
  }

  console.log(
    `${provider} fixture deleted:`,
    cleanupCompleted,
  );

  return excluded && cleanupCompleted;
}

async function verifyProcessingExcluded(
  input: VerificationInput,
  fixtures: Map<string, FixtureIdentity>,
): Promise<boolean> {
  const created =
    await createVerificationJob(input);

  const fixture =
    buildFixtureIdentity(created);

  fixtures.set(created.id, fixture);

  const fixedStartedAt =
    "2020-01-01T00:00:00.000Z";

  const prepared =
    await updateVerificationJob(
      created.id,
      {
        status: PROCESSING_STATUS,
        started_at: fixedStartedAt,
        attempt_count: 4,
      },
    );

  const claimResult =
    await claimNextNaverMediaSyncJob();

  const stored =
    await readVerificationJob(created.id);

  const storedStartedAt =
  stored?.started_at ?? null;

  const excluded =
    claimResult === null &&
    prepared.status ===
        PROCESSING_STATUS &&
    stored !== null &&
    stored.status ===
        PROCESSING_STATUS &&
    storedStartedAt !== null &&
    Date.parse(storedStartedAt) ===
        Date.parse(fixedStartedAt) &&
    stored.attempt_count === 4;

  console.log(
    "processing job excluded:",
    excluded,
  );

  const cleanupCompleted =
    await cleanupFixture(fixture);

  if (cleanupCompleted) {
    fixtures.delete(created.id);
  }

  console.log(
    "processing fixture deleted:",
    cleanupCompleted,
  );

  return excluded && cleanupCompleted;
}

async function verifyConcurrentClaim(
  input: VerificationInput,
  fixtures: Map<string, FixtureIdentity>,
): Promise<boolean> {
  const created =
    await createVerificationJob(input);

  const fixture =
    buildFixtureIdentity(created);

  fixtures.set(created.id, fixture);

  const [firstResult, secondResult] =
    await Promise.all([
      claimNextNaverMediaSyncJob(),
      claimNextNaverMediaSyncJob(),
    ]);

  const returnedJobs = [
    firstResult,
    secondResult,
  ].filter(
    (
      value,
    ): value is MediaSyncJobRecord =>
      value !== null,
  );

  const nullResultCount = [
    firstResult,
    secondResult,
  ].filter((value) => value === null)
    .length;

  const oneClaimOnly =
    returnedJobs.length === 1 &&
    nullResultCount === 1 &&
    returnedJobs[0]?.id === created.id;

  const stored =
    await readVerificationJob(created.id);

  const storedStateMatches =
    stored !== null &&
    stored.status ===
      PROCESSING_STATUS &&
    stored.provider ===
      NAVER_PROVIDER &&
    stored.started_at !== null &&
    stored.attempt_count === 1;

  console.log(
    "concurrent claim returned once:",
    oneClaimOnly,
  );
  console.log(
    "concurrent claim stored state:",
    storedStateMatches,
  );

  const cleanupCompleted =
    await cleanupFixture(fixture);

  if (cleanupCompleted) {
    fixtures.delete(created.id);
  }

  console.log(
    "concurrent fixture deleted:",
    cleanupCompleted,
  );

  return (
    oneClaimOnly &&
    storedStateMatches &&
    cleanupCompleted
  );
}

async function verifyEmptyQueueReturnsNull(): Promise<boolean> {
  await assertNoExistingPendingNaverJobs();

  const result =
    await claimNextNaverMediaSyncJob();

  const emptyQueueReturnsNull =
    result === null;

  console.log(
    "empty queue returns null:",
    emptyQueueReturnsNull,
  );

  return emptyQueueReturnsNull;
}

async function emergencyCleanup(
  fixtures: Map<string, FixtureIdentity>,
): Promise<boolean> {
  let allDeleted = true;

  for (const fixture of fixtures.values()) {
    try {
      const deleted =
        await cleanupFixture(fixture);

      console.log(
        `emergency cleanup ${fixture.jobId}:`,
        deleted,
      );

      if (!deleted) {
        allDeleted = false;
      }
    } catch {
      console.error(
        `emergency cleanup ${fixture.jobId}:`,
        "CLEANUP_ERROR",
      );

      allDeleted = false;
    }
  }

  fixtures.clear();

  return allDeleted;
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  const fixtures =
    new Map<string, FixtureIdentity>();

  let verificationCompleted = false;

  try {
    await assertNoExistingPendingNaverJobs();

    console.log(
      "existing pending Naver jobs:",
      0,
    );

    const singleClaimPassed =
      await verifySingleClaim(
        input,
        fixtures,
      );

    await assertNoExistingPendingNaverJobs();

    const googleExcluded =
      await verifyProviderExcluded(
        input,
        GOOGLE_PROVIDER,
        fixtures,
      );

    await assertNoExistingPendingNaverJobs();

    const metaExcluded =
      await verifyProviderExcluded(
        input,
        META_PROVIDER,
        fixtures,
      );

    await assertNoExistingPendingNaverJobs();

    const processingExcluded =
      await verifyProcessingExcluded(
        input,
        fixtures,
      );

    await assertNoExistingPendingNaverJobs();

    const concurrentClaimPassed =
      await verifyConcurrentClaim(
        input,
        fixtures,
      );

    await assertNoExistingPendingNaverJobs();

    const emptyQueuePassed =
      await verifyEmptyQueueReturnsNull();

    const verificationPassed =
      singleClaimPassed &&
      googleExcluded &&
      metaExcluded &&
      processingExcluded &&
      concurrentClaimPassed &&
      emptyQueuePassed &&
      fixtures.size === 0;

    verificationCompleted =
      verificationPassed;

    console.log(
      "remaining fixture jobs:",
      fixtures.size,
    );
    console.log(
      "verification passed:",
      verificationPassed,
    );

    if (!verificationPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (
      !verificationCompleted ||
      fixtures.size > 0
    ) {
      const cleanupCompleted =
        await emergencyCleanup(fixtures);

      console.log(
        "emergency cleanup completed:",
        cleanupCompleted,
      );

      if (!cleanupCompleted) {
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
      "media sync worker claim verification failed:",
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
      "media sync worker claim verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "media sync worker claim verification failed:",
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
    "media sync worker claim verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
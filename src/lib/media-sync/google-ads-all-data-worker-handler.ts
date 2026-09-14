import {
  readGoogleAdsAllDataProcessingCheckpoint,
  type GoogleAdsAllDataProcessingCheckpointPhase,
  type GoogleAdsAllDataProcessingCheckpointState,
} from "./google-ads-all-data-processing-checkpoint";
import type {
  GoogleAdsAllDataProcessingOrchestratorResult,
  GoogleAdsAllDataProcessingStagingResult,
} from "./google-ads-all-data-processing-orchestrator";
import type {
  MediaSyncStagingSummary,
} from "./media-sync-staging-summary-repository";
import type {
  MediaSyncSnapshotMaterializationResult,
} from "./media-sync-snapshot-materialization-repository";
import type {
  MediaSyncSnapshotActivationResult,
} from "./media-sync-snapshot-activation-repository";
import type {
  MediaSyncFinalizationResult,
} from "./media-sync-finalization-repository";
import type {
  GoogleAdsDailyV2FactOnlyCompletionResult,
  GoogleAdsDailyV2FactReplacementResult,
} from "./google-ads-daily-v2-fact-authority-repository";
import type {
  MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT =
  "google_all_data_v1" as const;

const DAILY_REPORT_V2_AUTOMATION_CONTRACT =
  "daily_report_v2" as const;

const PROCESSING_STATUS =
  "processing" as const;

const PENDING_STATUS =
  "pending" as const;

const DONE_STATUS =
  "done" as const;

const SNAPSHOT_REPLACE_MODE =
  "snapshot_replace" as const;

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs" as const;

type MediaSyncJobRecordWithExecutionContract =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract?:
      unknown;
  }>;

export type GoogleAdsAllDataWorkerJobRecord =
  MediaSyncJobRecord &
  Readonly<{
    execution_contract:
      typeof GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT;
  }>;

export type GoogleAdsAllDataWorkerHandlerErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "INVALID_CHECKPOINT"
  | "PROCESSING_FAILED"
  | "JOB_RELEASE_FAILED"
  | "STAGING_SUMMARY_FAILED"
  | "MATERIALIZATION_FAILED"
  | "ACTIVATION_FAILED"
  | "FINALIZATION_FAILED"
  | "FACT_REPLACEMENT_FAILED"
  | "FACT_ONLY_COMPLETION_FAILED";

export class GoogleAdsAllDataWorkerHandlerError
  extends Error {
  readonly code:
    GoogleAdsAllDataWorkerHandlerErrorCode;

  constructor(
    code:
      GoogleAdsAllDataWorkerHandlerErrorCode,
    message:
      string,
    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsAllDataWorkerHandlerError";

    this.code =
      code;
  }
}

export type ProcessGoogleAdsAllDataWorkerHandlerInput =
  Readonly<{
    job:
      GoogleAdsAllDataWorkerJobRecord;

    executionContract:
      typeof GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT;

    materializationBatchSize?:
      number;
  }>;

type GoogleAdsAllDataProcessRuntime =
  (
    input:
      ProcessGoogleAdsAllDataWorkerHandlerInput,
  ) =>
    Promise<
      GoogleAdsAllDataProcessingOrchestratorResult
    >;

type GoogleAdsAllDataCheckpointReader =
  (
    job:
      MediaSyncJobRecord,
  ) =>
    GoogleAdsAllDataProcessingCheckpointState;

type GoogleAdsAllDataReleaseForResume =
  (
    job:
      MediaSyncJobRecord,
  ) =>
    Promise<
      MediaSyncJobRecord
    >;

type GoogleAdsAllDataSummarize =
  (
    input:
      Readonly<{
        job:
          MediaSyncJobRecord;

        expectedRows:
          number;
      }>,
  ) =>
    Promise<
      MediaSyncStagingSummary
    >;

type GoogleAdsAllDataMaterialize =
  (
    input:
      Readonly<{
        job:
          MediaSyncJobRecord;

        summary:
          MediaSyncStagingSummary;

        batchSize?:
          number;
      }>,
  ) =>
    Promise<
      MediaSyncSnapshotMaterializationResult
    >;

type GoogleAdsAllDataActivate =
  (
    input:
      Readonly<{
        job:
          MediaSyncJobRecord;

        expectedRows:
          number;
      }>,
  ) =>
    Promise<
      MediaSyncSnapshotActivationResult
    >;

type GoogleAdsAllDataFinalize =
  (
    input:
      Readonly<{
        job:
          MediaSyncJobRecord;

        expectedRows:
          number;
      }>,
  ) =>
    Promise<
      MediaSyncFinalizationResult
    >;

type GoogleAdsAllDataReplaceDailyV2Fact =
  (
    input:
      Readonly<{
        job:
          MediaSyncJobRecord;
        date:
          string;
      }>,
  ) =>
    Promise<
      GoogleAdsDailyV2FactReplacementResult
    >;

type GoogleAdsAllDataCompleteDailyV2FactOnly =
  (
    input:
      Readonly<{
        job:
          MediaSyncJobRecord;
      }>,
  ) =>
    Promise<
      GoogleAdsDailyV2FactOnlyCompletionResult
    >;

export type GoogleAdsAllDataWorkerHandlerDependencies =
  Readonly<{
    readCheckpoint?:
      GoogleAdsAllDataCheckpointReader;

    processRuntime?:
      GoogleAdsAllDataProcessRuntime;

    releaseForResume?:
      GoogleAdsAllDataReleaseForResume;

    summarize?:
      GoogleAdsAllDataSummarize;

    materialize?:
      GoogleAdsAllDataMaterialize;

    activate?:
      GoogleAdsAllDataActivate;

    finalize?:
      GoogleAdsAllDataFinalize;

    replaceDailyV2Fact?:
      GoogleAdsAllDataReplaceDailyV2Fact;

    completeDailyV2FactOnly?:
      GoogleAdsAllDataCompleteDailyV2FactOnly;
  }>;

export type ProcessGoogleAdsAllDataWorkerPartialResult =
  Readonly<{
    status:
      "partial";

    jobId:
      string;

    reportId:
      string;

    workspaceId:
      string;

    advertiserId:
      string;

    connectionId:
      string;

    checkpointRows:
      number;

    phase:
      Exclude<
        GoogleAdsAllDataProcessingCheckpointPhase,
        "completed"
      >;

    partialReason:
      | "GOOGLE_ADS_ALL_DATA_PAGE_BOUNDARY"
      | "GOOGLE_ADS_ALL_DATA_PRODUCT_BOUNDARY";

    staging:
      GoogleAdsAllDataProcessingStagingResult;

    checkpointJob:
      MediaSyncJobRecord;

    releasedJob:
      MediaSyncJobRecord;

    snapshotIngestionId:
      null;

    expectedRows:
      number;
  }>;

export type ProcessGoogleAdsAllDataWorkerFactOnlyCompletedResult =
  Readonly<{
    status:
      "fact_only_completed";
    jobId:
      string;
    reportId:
      string;
    workspaceId:
      string;
    advertiserId:
      string;
    connectionId:
      string;
    staging:
      GoogleAdsAllDataProcessingStagingResult |
      null;
    checkpointJob:
      MediaSyncJobRecord;
    summary:
      MediaSyncStagingSummary;
    factReplacement:
      GoogleAdsDailyV2FactReplacementResult;
    factOnlyCompletion:
      GoogleAdsDailyV2FactOnlyCompletionResult;
    snapshotIngestionId:
      null;
    expectedRows:
      number;
  }>;

export type ProcessGoogleAdsAllDataWorkerCompletedResult =
  Readonly<{
    status:
      "completed";

    jobId:
      string;

    reportId:
      string;

    workspaceId:
      string;

    advertiserId:
      string;

    connectionId:
      string;

    staging:
      GoogleAdsAllDataProcessingStagingResult |
      null;

    checkpointJob:
      MediaSyncJobRecord;

    summary:
      MediaSyncStagingSummary;

    materialization:
      MediaSyncSnapshotMaterializationResult;

    activation:
      MediaSyncSnapshotActivationResult;

    finalization:
      MediaSyncFinalizationResult;

    snapshotIngestionId:
      string;

    expectedRows:
      number;
  }>;

export type ProcessGoogleAdsAllDataWorkerResult =
  | ProcessGoogleAdsAllDataWorkerPartialResult
  | ProcessGoogleAdsAllDataWorkerFactOnlyCompletedResult
  | ProcessGoogleAdsAllDataWorkerCompletedResult;

function isPlainObject(
  value:
    unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function executionContractValue(
  job:
    MediaSyncJobRecord,
): unknown {
  return (
    job as
      MediaSyncJobRecordWithExecutionContract
  ).execution_contract;
}

function automationContractValue(
  job:
    MediaSyncJobRecord,
): unknown {
  return job.automation_contract ??
    null;
}

function normalizeStableJsonValue(
  value:
    unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(
      normalizeStableJsonValue,
    );
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            normalizeStableJsonValue(
              value[key],
            ),
          ],
        ),
    );
  }

  return value;
}

function stableJson(
  value:
    unknown,
): string {
  return JSON.stringify(
    normalizeStableJsonValue(
      value,
    ),
  );
}

function processingCheckpointValue(
  errorDetail:
    unknown,
): unknown {
  if (!isPlainObject(errorDetail)) {
    return null;
  }

  return (
    errorDetail[
      PROCESSING_CHECKPOINT_KEY
    ] ??
    null
  );
}

function wrapStage(
  code:
    GoogleAdsAllDataWorkerHandlerErrorCode,
  message:
    string,
  error:
    unknown,
): GoogleAdsAllDataWorkerHandlerError {
  if (
    error instanceof
      GoogleAdsAllDataWorkerHandlerError &&
    error.code ===
      code
  ) {
    return error;
  }

  return new GoogleAdsAllDataWorkerHandlerError(
    code,
    message,
    {
      cause:
        error,
    },
  );
}

function assertClaimedJob(
  input:
    ProcessGoogleAdsAllDataWorkerHandlerInput,
): void {
  if (
    !input ||
    typeof input !== "object" ||
    !input.job ||
    typeof input.job !== "object"
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_INPUT",
      "A claimed Google Ads ALL-DATA job is required.",
    );
  }

  if (
    input.executionContract !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT ||
    executionContractValue(
      input.job,
    ) !==
      GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_JOB",
      "The claimed Google Ads job does not use the ALL-DATA execution contract.",
    );
  }

  if (
    input.job.provider !==
      GOOGLE_ADS_PROVIDER ||
    input.job.status !==
      PROCESSING_STATUS ||
    input.job.mode !==
      SNAPSHOT_REPLACE_MODE ||
    typeof input.job.started_at !==
      "string" ||
    !input.job.started_at.trim() ||
    input.job.finished_at !==
      null ||
    input.job.error !==
      null ||
    !Number.isSafeInteger(
      input.job.attempt_count,
    ) ||
    input.job.attempt_count <
      1
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_JOB",
      "The claimed Google Ads ALL-DATA job state is invalid.",
    );
  }

  if (
    input.materializationBatchSize !==
      undefined &&
    (
      !Number.isSafeInteger(
        input.materializationBatchSize,
      ) ||
      input.materializationBatchSize <
        1
    )
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_INPUT",
      "materializationBatchSize must be a positive safe integer.",
    );
  }
}

function assertSameScope(
  before:
    MediaSyncJobRecord,
  after:
    MediaSyncJobRecord,
  code:
    GoogleAdsAllDataWorkerHandlerErrorCode,
): void {
  if (
    after.id !== before.id ||
    after.report_id !==
      before.report_id ||
    after.workspace_id !==
      before.workspace_id ||
    after.advertiser_id !==
      before.advertiser_id ||
    after.connection_id !==
      before.connection_id ||
    after.provider !==
      GOOGLE_ADS_PROVIDER ||
    after.external_account_id !==
      before.external_account_id ||
    after.date_from !==
      before.date_from ||
    after.date_to !==
      before.date_to ||
    after.data_level !==
      before.data_level ||
    after.mode !==
      before.mode
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      code,
      "The Google Ads ALL-DATA media sync job scope changed unexpectedly.",
    );
  }
}

function assertReleasedJob(
  releasedJob:
    MediaSyncJobRecord,
  checkpointJob:
    MediaSyncJobRecord,
): void {
  assertSameScope(
    checkpointJob,
    releasedJob,
    "JOB_RELEASE_FAILED",
  );

  if (
    releasedJob.status !==
      PENDING_STATUS ||
    releasedJob.started_at !==
      null ||
    releasedJob.finished_at !==
      checkpointJob.finished_at ||
    releasedJob.error !==
      null ||
    releasedJob.raw_rows !==
      checkpointJob.raw_rows ||
    releasedJob.normalized_rows !==
      checkpointJob.normalized_rows ||
    releasedJob.inserted_rows !==
      checkpointJob.inserted_rows ||
    releasedJob.failed_rows !==
      checkpointJob.failed_rows ||
    stableJson(
      processingCheckpointValue(
        releasedJob.error_detail,
      ),
    ) !==
      stableJson(
        processingCheckpointValue(
          checkpointJob.error_detail,
        ),
      )
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "JOB_RELEASE_FAILED",
      "The released Google Ads ALL-DATA job violates the durable resume contract.",
    );
  }
}

function assertProcessingBoundary(
  staging:
    GoogleAdsAllDataProcessingStagingResult,
  checkpointJob:
    MediaSyncJobRecord,
  checkpointState:
    GoogleAdsAllDataProcessingCheckpointState,
): void {
  const routing =
    checkpointState.routing ??
    null;

  const productBoundary =
    checkpointState.phase ===
      "product_boundary" &&
    !checkpointState.complete &&
    checkpointState.cursor ===
      null &&
    routing !==
      null &&
    !routing.complete &&
    routing.productFamily !==
      "search" &&
    staging.isComplete &&
    staging.checkpoint.complete &&
    staging.status ===
      "completed" &&
    staging.nextPhase ===
      null &&
    staging.checkpoint.nextPhase ===
      null &&
    staging.checkpoint.cursor ===
      null;

  if (
    staging.jobId !==
      checkpointJob.id ||
    staging.dateWindowIndex !==
      checkpointState.dateWindowIndex ||
    staging.nextRowIndex !==
      checkpointState.nextRowIndex ||
    staging.checkpoint.nextRowIndex !==
      checkpointState.nextRowIndex ||
    staging.checkpoint.totalRows !==
      checkpointState.nextRowIndex ||
    staging.checkpoint.failedRows !==
      0 ||
    (
      !productBoundary &&
      staging.isComplete !==
        checkpointState.complete
    ) ||
    (
      !productBoundary &&
      staging.checkpoint.complete !==
        checkpointState.complete
    ) ||
    staging.apiPageExecutionCount !==
      1
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_CHECKPOINT",
      "The ALL-DATA staging result and durable checkpoint boundary disagree.",
    );
  }

  if (checkpointState.complete) {
    if (
      !checkpointState.hasCheckpoint ||
      checkpointState.phase !==
        "completed" ||
      checkpointState.cursor !==
        null ||
      staging.status !==
        "completed" ||
      staging.nextPhase !==
        null ||
      staging.checkpoint.nextPhase !==
        null ||
      staging.checkpoint.cursor !==
        null
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "INVALID_CHECKPOINT",
        "The completed ALL-DATA processing boundary is invalid.",
      );
    }

    return;
  }

  if (
    productBoundary
  ) {
    return;
  }

  if (
    !checkpointState.hasCheckpoint ||
    checkpointState.phase ===
      null ||
    checkpointState.phase ===
      "completed" ||
    checkpointState.cursor ===
      null ||
    staging.status !==
      "partial" ||
    staging.nextPhase !==
      checkpointState.phase ||
    staging.checkpoint.nextPhase !==
      checkpointState.phase ||
    staging.checkpoint.cursor ===
      null ||
    stableJson(
      staging.checkpoint.cursor,
    ) !==
      stableJson(
        checkpointState.cursor,
      )
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_CHECKPOINT",
      "The partial ALL-DATA processing boundary is invalid.",
    );
  }
}

function assertCompleteSummary(
  job:
    MediaSyncJobRecord,
  checkpoint:
    GoogleAdsAllDataProcessingCheckpointState,
  summary:
    MediaSyncStagingSummary,
): void {
  const expectedRows =
    checkpoint.nextRowIndex;

  if (
    !checkpoint.hasCheckpoint ||
    !checkpoint.complete ||
    checkpoint.phase !==
      "completed" ||
    checkpoint.cursor !==
      null ||
    summary.jobId !==
      job.id ||
    summary.expectedRows !==
      expectedRows ||
    summary.totalRows !==
      expectedRows ||
    summary.distinctRowIndexes !==
      expectedRows ||
    summary.rowsInExpectedRange !==
      expectedRows ||
    summary.missingExpectedRows !==
      0 ||
    summary.outOfRangeRows !==
      0 ||
    summary.scopeMismatchRows !==
      0 ||
    summary.blankRowKeyRows !==
      0 ||
    summary.missingFingerprintRows !==
      0 ||
    summary.canonicalMismatchRows !==
      0 ||
    !summary.isComplete
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "STAGING_SUMMARY_FAILED",
      "The completed Google Ads ALL-DATA staging summary is inconsistent.",
    );
  }

  if (
    expectedRows ===
      0
  ) {
    if (
      summary.minRowIndex !==
        null ||
      summary.maxRowIndex !==
        null
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "STAGING_SUMMARY_FAILED",
        "The empty Google Ads ALL-DATA staging summary contains row bounds.",
      );
    }

    return;
  }

  if (
    summary.minRowIndex !==
      0 ||
    summary.maxRowIndex !==
      expectedRows -
        1
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "STAGING_SUMMARY_FAILED",
      "The Google Ads ALL-DATA staging summary row-index boundary is incomplete.",
    );
  }
}

const defaultProcessRuntime:
  GoogleAdsAllDataProcessRuntime =
  async input => {
    const {
      processClaimedGoogleAdsAllDataJob,
    } =
      await import(
        "./google-ads-all-data-runtime-adapter"
      );

    return await processClaimedGoogleAdsAllDataJob({
      job:
        input.job,

      executionContract:
        input.executionContract,
    });
  };

const defaultSummarize:
  GoogleAdsAllDataSummarize =
  async input => {
    const {
      assertGoogleAdsAllDataStagingComplete,
    } =
      await import(
        "./google-ads-all-data-staging-summary-repository"
      );

    return await assertGoogleAdsAllDataStagingComplete(
      input,
    );
  };

const defaultReplaceDailyV2Fact:
  GoogleAdsAllDataReplaceDailyV2Fact =
  async input => {
    const {
      replaceGoogleAdsDailyV2FactDate,
    } =
      await import(
        "./google-ads-daily-v2-fact-authority-repository"
      );

    return await replaceGoogleAdsDailyV2FactDate(
      input,
    );
  };

const defaultCompleteDailyV2FactOnly:
  GoogleAdsAllDataCompleteDailyV2FactOnly =
  async input => {
    const {
      completeGoogleAdsDailyV2FactOnlyJob,
    } =
      await import(
        "./google-ads-daily-v2-fact-authority-repository"
      );

    return await completeGoogleAdsDailyV2FactOnlyJob(
      input,
    );
  };

const defaultMaterialize:
  GoogleAdsAllDataMaterialize =
  async input => {
    const {
      materializeMediaSyncSnapshot,
    } =
      await import(
        "./media-sync-snapshot-materialization-repository"
      );

    return await materializeMediaSyncSnapshot(
      input,
    );
  };

const defaultActivate:
  GoogleAdsAllDataActivate =
  async input => {
    const {
      activateMediaSyncSnapshot,
    } =
      await import(
        "./media-sync-snapshot-activation-repository"
      );

    return await activateMediaSyncSnapshot(
      input,
    );
  };

const defaultFinalize:
  GoogleAdsAllDataFinalize =
  async input => {
    const {
      finalizeMediaSyncJob,
    } =
      await import(
        "./media-sync-finalization-repository"
      );

    return await finalizeMediaSyncJob(
      input,
    );
  };

export function assertGoogleAdsAllDataCheckpointCanReleaseForResume(
  checkpoint:
    GoogleAdsAllDataProcessingCheckpointState,
): void {
  const releasableProductBoundary =
    checkpoint.phase ===
      "product_boundary" &&
    checkpoint.cursor ===
      null &&
    checkpoint.routing !==
      undefined &&
    !checkpoint.routing.complete;

  if (
    !checkpoint.hasCheckpoint ||
    checkpoint.complete ||
    checkpoint.phase ===
      null ||
    checkpoint.phase ===
      "completed" ||
    (
      checkpoint.cursor ===
        null &&
      !releasableProductBoundary
    )
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "JOB_RELEASE_FAILED",
      "Only a partial persisted Google Ads ALL-DATA checkpoint can be released.",
    );
  }
}

export async function releaseGoogleAdsAllDataJobForResume(
  job:
    MediaSyncJobRecord,
): Promise<
  MediaSyncJobRecord
> {
  let checkpoint:
    GoogleAdsAllDataProcessingCheckpointState;

  try {
    checkpoint =
      readGoogleAdsAllDataProcessingCheckpoint(
        job,
      );
  } catch (error) {
    throw wrapStage(
      "JOB_RELEASE_FAILED",
      "The Google Ads ALL-DATA checkpoint could not be validated before release.",
      error,
    );
  }
  assertGoogleAdsAllDataCheckpointCanReleaseForResume(
    checkpoint,
  );


  const {
    getSupabaseAdmin,
  } =
    await import(
      "../supabase/admin"
    );

  const {
    parseMediaSyncJobRecord,
  } =
    await import(
      "./media-sync-jobs-repository"
    );

  const supabase =
    getSupabaseAdmin();

  let result;

  try {
    result =
      await supabase
        .from(
          MEDIA_SYNC_JOBS_TABLE,
        )
        .update({
          status:
            PENDING_STATUS,

          started_at:
            null,

          error:
            null,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          job.id,
        )
        .eq(
          "provider",
          GOOGLE_ADS_PROVIDER,
        )
        .eq(
          "status",
          PROCESSING_STATUS,
        )
        .select("*")
        .maybeSingle();
  } catch (error) {
    throw wrapStage(
      "JOB_RELEASE_FAILED",
      "The partial Google Ads ALL-DATA job could not be released for resume.",
      error,
    );
  }

  const {
    data,
    error,
  } = result;

  if (error) {
    throw wrapStage(
      "JOB_RELEASE_FAILED",
      "The partial Google Ads ALL-DATA job release returned a database error.",
      error,
    );
  }

  if (!data) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "JOB_RELEASE_FAILED",
      "The Google Ads ALL-DATA job is no longer processing and was not released.",
    );
  }

  let releasedJob:
    MediaSyncJobRecord;

  try {
    releasedJob =
      parseMediaSyncJobRecord(
        data,
      );
  } catch (error) {
    throw wrapStage(
      "JOB_RELEASE_FAILED",
      "The released Google Ads ALL-DATA job record is invalid.",
      error,
    );
  }

  assertReleasedJob(
    releasedJob,
    job,
  );

  return releasedJob;
}

export async function processGoogleAdsAllDataWorkerHandler(
  input:
    ProcessGoogleAdsAllDataWorkerHandlerInput,
  dependencies:
    GoogleAdsAllDataWorkerHandlerDependencies = {},
): Promise<
  ProcessGoogleAdsAllDataWorkerResult
> {
  assertClaimedJob(
    input,
  );

  const claimedAutomationContract =
    automationContractValue(
      input.job,
    );

  const readCheckpoint =
    dependencies.readCheckpoint ??
    readGoogleAdsAllDataProcessingCheckpoint;

  const processRuntime =
    dependencies.processRuntime ??
    defaultProcessRuntime;

  const releaseForResume =
    dependencies.releaseForResume ??
    releaseGoogleAdsAllDataJobForResume;

  const summarize =
    dependencies.summarize ??
    defaultSummarize;

  const replaceDailyV2Fact =
    dependencies.replaceDailyV2Fact ??
    defaultReplaceDailyV2Fact;

  const completeDailyV2FactOnly =
    dependencies.completeDailyV2FactOnly ??
    defaultCompleteDailyV2FactOnly;

  const materialize =
    dependencies.materialize ??
    defaultMaterialize;

  const activate =
    dependencies.activate ??
    defaultActivate;

  const finalize =
    dependencies.finalize ??
    defaultFinalize;

  let checkpointState:
    GoogleAdsAllDataProcessingCheckpointState;

  try {
    checkpointState =
      readCheckpoint(
        input.job,
      );
  } catch (error) {
    throw wrapStage(
      "INVALID_CHECKPOINT",
      "The claimed Google Ads ALL-DATA checkpoint is invalid.",
      error,
    );
  }

  let checkpointJob:
    MediaSyncJobRecord =
      input.job;

  let staging:
    GoogleAdsAllDataProcessingStagingResult |
    null =
      null;

  if (
    !checkpointState.complete &&
    checkpointState.phase ===
      "product_boundary"
  ) {
    const routing =
      checkpointState.routing ??
      null;

    if (
      routing ===
        null ||
      routing.complete ||
      !(
        (
          routing.productFamily ===
            "search" &&
          routing.productIndex ===
            0
        ) ||
        routing.productFamily ===
          "demand_gen" ||
        routing.productFamily ===
          "display" ||
        routing.productFamily ===
          "performance_max"
      )
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "INVALID_CHECKPOINT",
        "A durable Google Ads ALL-DATA product boundary cannot re-enter an unsupported product before product routing continuation is activated.",
      );
    }
  }

  /*
   * Critical completion-retry boundary:
   * an already-completed durable checkpoint must skip runtime entirely.
   * This also skips connection lookup, credential decryption, token refresh,
   * and Google Ads page I/O owned by the runtime adapter.
   */
  if (!checkpointState.complete) {
    let processing:
      GoogleAdsAllDataProcessingOrchestratorResult;

    try {
      processing =
        await processRuntime(
          input,
        );
    } catch (error) {
      throw wrapStage(
        "PROCESSING_FAILED",
        "The claimed Google Ads ALL-DATA job failed during bounded processing.",
        error,
      );
    }

    assertSameScope(
      input.job,
      processing.job,
      "PROCESSING_FAILED",
    );

    if (
      executionContractValue(
        processing.job,
      ) !==
        GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "PROCESSING_FAILED",
        "The persisted Google Ads ALL-DATA job lost its execution contract.",
      );
    }

    checkpointJob =
      processing.job;

    staging =
      processing.staging;

    try {
      checkpointState =
        readCheckpoint(
          checkpointJob,
        );
    } catch (error) {
      throw wrapStage(
        "INVALID_CHECKPOINT",
        "The persisted Google Ads ALL-DATA checkpoint is invalid.",
        error,
      );
    }

    assertProcessingBoundary(
      staging,
      checkpointJob,
      checkpointState,
    );
  }

  if (!checkpointState.complete) {
    if (
      !staging ||
      checkpointState.phase ===
        null ||
      checkpointState.phase ===
        "completed"
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "INVALID_CHECKPOINT",
        "A partial Google Ads ALL-DATA checkpoint is missing its staging boundary.",
      );
    }

    let releasedJob:
      MediaSyncJobRecord;

    try {
      releasedJob =
        await releaseForResume(
          checkpointJob,
        );
    } catch (error) {
      throw wrapStage(
        "JOB_RELEASE_FAILED",
        "The partial Google Ads ALL-DATA job could not be released for resume.",
        error,
      );
    }

    assertReleasedJob(
      releasedJob,
      checkpointJob,
    );

    return Object.freeze({
      status:
        "partial" as const,

      jobId:
        releasedJob.id,

      reportId:
        releasedJob.report_id,

      workspaceId:
        releasedJob.workspace_id,

      advertiserId:
        releasedJob.advertiser_id,

      connectionId:
        releasedJob.connection_id,

      checkpointRows:
        checkpointState.nextRowIndex,

      phase:
        checkpointState.phase,

      partialReason:
        checkpointState.phase ===
          "product_boundary"
          ? "GOOGLE_ADS_ALL_DATA_PRODUCT_BOUNDARY" as const
          : "GOOGLE_ADS_ALL_DATA_PAGE_BOUNDARY" as const,

      staging,

      checkpointJob,

      releasedJob,

      snapshotIngestionId:
        null,

      expectedRows:
        checkpointState.nextRowIndex,
    });
  }

  if (
    !checkpointState.hasCheckpoint ||
    checkpointState.phase !==
      "completed" ||
    checkpointState.cursor !==
      null
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_CHECKPOINT",
      "A completed persisted Google Ads ALL-DATA checkpoint is required before completion.",
    );
  }

  let summary:
    MediaSyncStagingSummary;

  try {
    summary =
      await summarize({
        job:
          checkpointJob,

        expectedRows:
          checkpointState.nextRowIndex,
      });
  } catch (error) {
    throw wrapStage(
      "STAGING_SUMMARY_FAILED",
      "The completed Google Ads ALL-DATA staging rows could not be verified.",
      error,
    );
  }

  assertCompleteSummary(
    checkpointJob,
    checkpointState,
    summary,
  );

  const completedAutomationContract =
    automationContractValue(
      checkpointJob,
    );

  if (
    completedAutomationContract !==
      claimedAutomationContract
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "INVALID_JOB",
      "The Google Ads ALL-DATA job automation contract changed during processing.",
    );
  }

  if (
    completedAutomationContract ===
      DAILY_REPORT_V2_AUTOMATION_CONTRACT
  ) {
    if (
      typeof checkpointJob.date_from !==
        "string" ||
      checkpointJob.date_from !==
        checkpointJob.date_to
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "FACT_REPLACEMENT_FAILED",
        "Google Daily Report V2 fact routing requires one exact date.",
      );
    }

    let factReplacement:
      GoogleAdsDailyV2FactReplacementResult;

    try {
      factReplacement =
        await replaceDailyV2Fact({
          job:
            checkpointJob,
          date:
            checkpointJob.date_from,
        });
    } catch (error) {
      throw wrapStage(
        "FACT_REPLACEMENT_FAILED",
        "The Google Daily Report V2 canonical fact date could not be replaced.",
        error,
      );
    }

    assertSameScope(
      checkpointJob,
      factReplacement.job,
      "FACT_REPLACEMENT_FAILED",
    );

    if (
      factReplacement.scopeDate !==
        checkpointJob.date_from ||
      factReplacement.sourceRows !==
        checkpointState.nextRowIndex ||
      factReplacement.insertedRows !==
        checkpointState.nextRowIndex ||
      factReplacement.factRows !==
        checkpointState.nextRowIndex ||
      factReplacement.job.status !==
        PROCESSING_STATUS ||
      factReplacement.job.snapshot_ingestion_id !==
        null ||
      factReplacement.job.finished_at !==
        null ||
      factReplacement.job.failed_rows !==
        0
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "FACT_REPLACEMENT_FAILED",
        "The Google Daily Report V2 canonical fact replacement result is inconsistent.",
      );
    }

    let factOnlyCompletion:
      GoogleAdsDailyV2FactOnlyCompletionResult;

    try {
      factOnlyCompletion =
        await completeDailyV2FactOnly({
          job:
            factReplacement.job,
        });
    } catch (error) {
      throw wrapStage(
        "FACT_ONLY_COMPLETION_FAILED",
        "The Google Daily Report V2 fact-only job could not be completed.",
        error,
      );
    }

    assertSameScope(
      factReplacement.job,
      factOnlyCompletion.job,
      "FACT_ONLY_COMPLETION_FAILED",
    );

    if (
      factOnlyCompletion.coveredDates !==
        1 ||
      factOnlyCompletion.partitionRows !==
        checkpointState.nextRowIndex ||
      factOnlyCompletion.factRows !==
        checkpointState.nextRowIndex ||
      factOnlyCompletion.job.status !==
        DONE_STATUS ||
      factOnlyCompletion.job.progress !==
        100 ||
      factOnlyCompletion.job.finished_at ===
        null ||
      factOnlyCompletion.job.snapshot_ingestion_id !==
        null ||
      factOnlyCompletion.job.failed_rows !==
        0 ||
      factOnlyCompletion.job.error !==
        null
    ) {
      throw new GoogleAdsAllDataWorkerHandlerError(
        "FACT_ONLY_COMPLETION_FAILED",
        "The Google Daily Report V2 fact-only completion result is inconsistent.",
      );
    }

    return Object.freeze({
      status:
        "fact_only_completed" as const,
      jobId:
        factOnlyCompletion.job.id,
      reportId:
        factOnlyCompletion.job.report_id,
      workspaceId:
        factOnlyCompletion.job.workspace_id,
      advertiserId:
        factOnlyCompletion.job.advertiser_id,
      connectionId:
        factOnlyCompletion.job.connection_id,
      staging,
      checkpointJob,
      summary,
      factReplacement,
      factOnlyCompletion,
      snapshotIngestionId:
        null,
      expectedRows:
        checkpointState.nextRowIndex,
    });
  }

  let materialization:
    MediaSyncSnapshotMaterializationResult;

  try {
    materialization =
      await materialize({
        job:
          checkpointJob,

        summary,

        ...(
          input.materializationBatchSize ===
            undefined
            ? {}
            : {
                batchSize:
                  input.materializationBatchSize,
              }
        ),
      });
  } catch (error) {
    throw wrapStage(
      "MATERIALIZATION_FAILED",
      "The Google Ads ALL-DATA staging rows could not be materialized.",
      error,
    );
  }

  assertSameScope(
    checkpointJob,
    materialization.job,
    "MATERIALIZATION_FAILED",
  );

  if (
    materialization.rowCount !==
      checkpointState.nextRowIndex ||
    materialization.job.snapshot_ingestion_id !==
      materialization.snapshotIngestionId
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "MATERIALIZATION_FAILED",
      "The Google Ads ALL-DATA materialization result is inconsistent.",
    );
  }

  let activation:
    MediaSyncSnapshotActivationResult;

  try {
    activation =
      await activate({
        job:
          materialization.job,

        expectedRows:
          materialization.rowCount,
      });
  } catch (error) {
    throw wrapStage(
      "ACTIVATION_FAILED",
      "The Google Ads ALL-DATA snapshot could not be activated.",
      error,
    );
  }

  assertSameScope(
    materialization.job,
    activation.job,
    "ACTIVATION_FAILED",
  );

  if (
    activation.rowCount !==
      checkpointState.nextRowIndex ||
    activation.snapshotIngestionId !==
      materialization.snapshotIngestionId ||
    activation.currentIngestionId !==
      materialization.snapshotIngestionId
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "ACTIVATION_FAILED",
      "The Google Ads ALL-DATA activation result is inconsistent.",
    );
  }

  let finalization:
    MediaSyncFinalizationResult;

  try {
    finalization =
      await finalize({
        job:
          activation.job,

        expectedRows:
          activation.rowCount,
      });
  } catch (error) {
    throw wrapStage(
      "FINALIZATION_FAILED",
      "The Google Ads ALL-DATA media sync job could not be finalized.",
      error,
    );
  }

  assertSameScope(
    activation.job,
    finalization.job,
    "FINALIZATION_FAILED",
  );

  if (
    finalization.job.status !==
      DONE_STATUS ||
    finalization.rowCount !==
      checkpointState.nextRowIndex ||
    finalization.snapshotIngestionId !==
      activation.snapshotIngestionId ||
    finalization.currentIngestionId !==
      activation.snapshotIngestionId
  ) {
    throw new GoogleAdsAllDataWorkerHandlerError(
      "FINALIZATION_FAILED",
      "The Google Ads ALL-DATA finalization result is inconsistent.",
    );
  }

  return Object.freeze({
    status:
      "completed" as const,

    jobId:
      finalization.job.id,

    reportId:
      finalization.job.report_id,

    workspaceId:
      finalization.job.workspace_id,

    advertiserId:
      finalization.job.advertiser_id,

    connectionId:
      finalization.job.connection_id,

    staging,

    checkpointJob,

    summary,

    materialization,

    activation,

    finalization,

    snapshotIngestionId:
      finalization.snapshotIngestionId,

    expectedRows:
      checkpointState.nextRowIndex,
  });
}

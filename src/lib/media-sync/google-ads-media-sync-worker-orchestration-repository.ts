// src/lib/media-sync/google-ads-media-sync-worker-orchestration-repository.ts

import {
  readGoogleAdsMediaSyncProcessingCheckpoint,
  type GoogleAdsMediaSyncProcessingCheckpointState,
} from "./google-ads-media-sync-processing-checkpoint";

import type {
  GoogleAdsKeywordProcessingOrchestratorResult,
} from "./google-ads-keyword-processing-orchestrator";

import type {
  GoogleAdsKeywordStagingOrchestratorResult,
} from "./google-ads-keyword-staging-orchestrator";

import type {
  ProcessClaimedGoogleAdsKeywordJobInput,
} from "./google-ads-media-sync-runtime-adapter";

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
  MediaSyncJobRecord,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const PROCESSING_STATUS =
  "processing" as const;

const PENDING_STATUS =
  "pending" as const;

const DONE_STATUS =
  "done" as const;

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs" as const;

export type GoogleAdsMediaSyncWorkerOrchestrationErrorCode =
  | "INVALID_JOB"
  | "INVALID_CHECKPOINT"
  | "CLAIM_FAILED"
  | "PROCESSING_FAILED"
  | "JOB_RELEASE_FAILED"
  | "STAGING_SUMMARY_FAILED"
  | "MATERIALIZATION_FAILED"
  | "ACTIVATION_FAILED"
  | "FINALIZATION_FAILED";

export class GoogleAdsMediaSyncWorkerOrchestrationError
  extends Error {
  readonly code:
    GoogleAdsMediaSyncWorkerOrchestrationErrorCode;

  constructor(
    code:
      GoogleAdsMediaSyncWorkerOrchestrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsMediaSyncWorkerOrchestrationError";

    this.code =
      code;
  }
}

type GoogleAdsClaimNext =
  () => Promise<
    MediaSyncJobRecord |
    null
  >;

type GoogleAdsCheckpointReader =
  (
    job: MediaSyncJobRecord,
  ) =>
    GoogleAdsMediaSyncProcessingCheckpointState;

type GoogleAdsProcessClaimed =
  (
    input:
      ProcessClaimedGoogleAdsKeywordJobInput,
  ) => Promise<
    GoogleAdsKeywordProcessingOrchestratorResult
  >;

type GoogleAdsReleaseForResume =
  (
    job: MediaSyncJobRecord,
  ) => Promise<
    MediaSyncJobRecord
  >;

type GoogleAdsSummarize =
  (
    input: Readonly<{
      job: MediaSyncJobRecord;
      expectedRows: number;
    }>,
  ) => Promise<
    MediaSyncStagingSummary
  >;

type GoogleAdsMaterialize =
  (
    input: Readonly<{
      job: MediaSyncJobRecord;
      summary: MediaSyncStagingSummary;
      batchSize?: number;
    }>,
  ) => Promise<
    MediaSyncSnapshotMaterializationResult
  >;

type GoogleAdsActivate =
  (
    input: Readonly<{
      job: MediaSyncJobRecord;
      expectedRows: number;
    }>,
  ) => Promise<
    MediaSyncSnapshotActivationResult
  >;

type GoogleAdsFinalize =
  (
    input: Readonly<{
      job: MediaSyncJobRecord;
      expectedRows: number;
    }>,
  ) => Promise<
    MediaSyncFinalizationResult
  >;

type GoogleAdsMarkFailed =
  (
    input: Readonly<{
      job: MediaSyncJobRecord;
      error: unknown;
    }>,
  ) => Promise<void>;

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function stableJson(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record =
    value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map(
      key =>
        `${JSON.stringify(key)}:${stableJson(record[key])}`,
    )
    .join(",")}}`;
}

function processingCheckpointValue(
  value: unknown,
): unknown {
  if (!isPlainObject(value)) {
    return undefined;
  }

  return value[
    PROCESSING_CHECKPOINT_KEY
  ];
}

function assertSameScope(
  before: MediaSyncJobRecord,
  after: MediaSyncJobRecord,
  code:
    GoogleAdsMediaSyncWorkerOrchestrationErrorCode =
      "INVALID_JOB",
): void {
  if (
    after.id !== before.id ||
    after.report_id !== before.report_id ||
    after.workspace_id !== before.workspace_id ||
    after.advertiser_id !== before.advertiser_id ||
    after.connection_id !== before.connection_id ||
    after.provider !== GOOGLE_ADS_PROVIDER ||
    after.external_account_id !== before.external_account_id ||
    after.date_from !== before.date_from ||
    after.date_to !== before.date_to ||
    after.data_level !== before.data_level ||
    after.mode !== before.mode
  ) {
    throw new GoogleAdsMediaSyncWorkerOrchestrationError(
      code,
      "The Google Ads media sync job scope changed unexpectedly.",
    );
  }
}

function assertReleasedGoogleJob(
  releasedJob: MediaSyncJobRecord,
  checkpointJob: MediaSyncJobRecord,
): void {
  assertSameScope(
    checkpointJob,
    releasedJob,
    "JOB_RELEASE_FAILED",
  );

  if (
    releasedJob.status !== PENDING_STATUS ||
    releasedJob.started_at !== null ||
    releasedJob.finished_at !== checkpointJob.finished_at ||
    releasedJob.error !== null ||
    releasedJob.raw_rows !== checkpointJob.raw_rows ||
    releasedJob.normalized_rows !== checkpointJob.normalized_rows ||
    releasedJob.inserted_rows !== checkpointJob.inserted_rows ||
    releasedJob.failed_rows !== checkpointJob.failed_rows ||
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
    throw new GoogleAdsMediaSyncWorkerOrchestrationError(
      "JOB_RELEASE_FAILED",
      "The released Google Ads media sync job violates the resume contract.",
    );
  }
}

function assertCompleteSummary(
  job: MediaSyncJobRecord,
  checkpoint:
    GoogleAdsMediaSyncProcessingCheckpointState,
  summary: MediaSyncStagingSummary,
): void {
  const expectedRows =
    checkpoint.nextRowIndex;

  if (
    summary.jobId !== job.id ||
    summary.expectedRows !== expectedRows ||
    summary.totalRows !== expectedRows ||
    summary.distinctRowIndexes !== expectedRows ||
    summary.rowsInExpectedRange !== expectedRows ||
    summary.missingExpectedRows !== 0 ||
    summary.outOfRangeRows !== 0 ||
    summary.scopeMismatchRows !== 0 ||
    summary.blankRowKeyRows !== 0 ||
    summary.missingFingerprintRows !== 0 ||
    summary.canonicalMismatchRows !== 0 ||
    summary.isComplete !== true ||
    job.raw_rows !== expectedRows ||
    job.normalized_rows !== expectedRows ||
    job.inserted_rows !== expectedRows ||
    job.failed_rows !== 0
  ) {
    throw new GoogleAdsMediaSyncWorkerOrchestrationError(
      "STAGING_SUMMARY_FAILED",
      "The Google Ads staging summary does not match the durable checkpoint.",
    );
  }
}

function wrapStage(
  code:
    GoogleAdsMediaSyncWorkerOrchestrationErrorCode,
  message: string,
  error: unknown,
): GoogleAdsMediaSyncWorkerOrchestrationError {
  if (
    error instanceof
      GoogleAdsMediaSyncWorkerOrchestrationError
  ) {
    return error;
  }

  return new GoogleAdsMediaSyncWorkerOrchestrationError(
    code,
    message,
    {
      cause: error,
    },
  );
}

function shouldDeferAutomaticFailureMark(
  error: unknown,
): boolean {
  return (
    error instanceof
      GoogleAdsMediaSyncWorkerOrchestrationError &&
    (
      error.code === "ACTIVATION_FAILED" ||
      error.code === "FINALIZATION_FAILED"
    )
  );
}

const defaultClaimNext:
  GoogleAdsClaimNext =
  async () => {
    const {
      claimNextGoogleAdsMediaSyncJob,
    } =
      await import(
        "./google-ads-media-sync-worker-claim-repository"
      );

    return await claimNextGoogleAdsMediaSyncJob();
  };

const defaultProcessClaimed:
  GoogleAdsProcessClaimed =
  async input => {
    const {
      processClaimedGoogleAdsKeywordJob,
    } =
      await import(
        "./google-ads-media-sync-runtime-adapter"
      );

    return await processClaimedGoogleAdsKeywordJob(
      input,
    );
  };

const defaultSummarize:
  GoogleAdsSummarize =
  async input => {
    const {
      assertMediaSyncStagingComplete,
    } =
      await import(
        "./media-sync-staging-summary-repository"
      );

    return await assertMediaSyncStagingComplete(
      input,
    );
  };

const defaultMaterialize:
  GoogleAdsMaterialize =
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
  GoogleAdsActivate =
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
  GoogleAdsFinalize =
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

export async function releaseGoogleAdsMediaSyncJobForResume(
  job: MediaSyncJobRecord,
): Promise<MediaSyncJobRecord> {
  const checkpoint =
    readGoogleAdsMediaSyncProcessingCheckpoint(
      job,
    );

  if (
    !checkpoint.hasCheckpoint ||
    checkpoint.complete
  ) {
    throw new GoogleAdsMediaSyncWorkerOrchestrationError(
      "JOB_RELEASE_FAILED",
      "Only a partial persisted Google Ads checkpoint can be released.",
    );
  }

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
      "The partial Google Ads job could not be released for resume.",
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
      "The partial Google Ads job release returned a database error.",
      error,
    );
  }

  if (!data) {
    throw new GoogleAdsMediaSyncWorkerOrchestrationError(
      "JOB_RELEASE_FAILED",
      "The Google Ads job is no longer processing and was not released.",
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
      "The released Google Ads job record is invalid.",
      error,
    );
  }

  assertReleasedGoogleJob(
    releasedJob,
    job,
  );

  return releasedJob;
}

const defaultMarkFailed:
  GoogleAdsMarkFailed =
  async input => {
    const {
      getSupabaseAdmin,
    } =
      await import(
        "../supabase/admin"
      );

    const code =
      input.error instanceof
        GoogleAdsMediaSyncWorkerOrchestrationError
        ? input.error.code
        : "PROCESSING_FAILED";

    const now =
      new Date().toISOString();

    const supabase =
      getSupabaseAdmin();

    const {
      error,
    } =
      await supabase
        .from(
          MEDIA_SYNC_JOBS_TABLE,
        )
        .update({
          status:
            "failed",
          progress:
            0,
          error:
            code,
          error_detail: {
            code,
            stage:
              "google_ads_worker_runtime",
          },
          finished_at:
            now,
          updated_at:
            now,
        })
        .eq(
          "id",
          input.job.id,
        )
        .eq(
          "provider",
          GOOGLE_ADS_PROVIDER,
        )
        .eq(
          "status",
          PROCESSING_STATUS,
        );

    if (error) {
      throw new GoogleAdsMediaSyncWorkerOrchestrationError(
        "PROCESSING_FAILED",
        "The failed Google Ads job could not be marked failed.",
      );
    }
  };

export type ProcessGoogleAdsMediaSyncJobPartialResult =
  Readonly<{
    status: "partial";
    jobId: string;
    reportId: string;
    workspaceId: string;
    advertiserId: string;
    connectionId: string;
    checkpointRows: number;
    phase: "keyword";
    partialReason:
      "GOOGLE_ADS_KEYWORD_PAGE_BOUNDARY";
    staging:
      GoogleAdsKeywordStagingOrchestratorResult;
    checkpointJob:
      MediaSyncJobRecord;
    releasedJob:
      MediaSyncJobRecord;
    snapshotIngestionId: null;
    expectedRows: number;
  }>;

export type ProcessGoogleAdsMediaSyncJobCompletedResult =
  Readonly<{
    status: "completed";
    jobId: string;
    reportId: string;
    workspaceId: string;
    advertiserId: string;
    connectionId: string;
    staging:
      GoogleAdsKeywordStagingOrchestratorResult |
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
    snapshotIngestionId: string;
    expectedRows: number;
  }>;

export type ProcessGoogleAdsMediaSyncJobResult =
  | ProcessGoogleAdsMediaSyncJobPartialResult
  | ProcessGoogleAdsMediaSyncJobCompletedResult;

export type GoogleAdsMediaSyncWorkerOrchestrationDependencies =
  Readonly<{
    claimNext?: GoogleAdsClaimNext;
    readCheckpoint?: GoogleAdsCheckpointReader;
    processClaimed?: GoogleAdsProcessClaimed;
    releaseForResume?: GoogleAdsReleaseForResume;
    summarize?: GoogleAdsSummarize;
    materialize?: GoogleAdsMaterialize;
    activate?: GoogleAdsActivate;
    finalize?: GoogleAdsFinalize;
    markFailed?: GoogleAdsMarkFailed;
  }>;

export type ProcessNextGoogleAdsMediaSyncJobInput =
  Readonly<{
    materializationBatchSize?: number;
    dependencies?:
      GoogleAdsMediaSyncWorkerOrchestrationDependencies;
  }>;

function assertClaimedGoogleJob(
  job: MediaSyncJobRecord,
): void {
  if (
    job.provider !== GOOGLE_ADS_PROVIDER ||
    job.status !== PROCESSING_STATUS ||
    typeof job.started_at !== "string" ||
    !job.started_at.trim() ||
    job.finished_at !== null ||
    job.error !== null ||
    !Number.isSafeInteger(job.attempt_count) ||
    job.attempt_count < 1
  ) {
    throw new GoogleAdsMediaSyncWorkerOrchestrationError(
      "INVALID_JOB",
      "The claimed Google Ads job is invalid.",
    );
  }
}

export async function processNextGoogleAdsMediaSyncJob(
  input:
    ProcessNextGoogleAdsMediaSyncJobInput = {},
): Promise<
  ProcessGoogleAdsMediaSyncJobResult |
  null
> {
  const dependencies =
    input.dependencies ?? {};

  const claimNext =
    dependencies.claimNext ??
    defaultClaimNext;

  const readCheckpoint =
    dependencies.readCheckpoint ??
    readGoogleAdsMediaSyncProcessingCheckpoint;

  const processClaimed =
    dependencies.processClaimed ??
    defaultProcessClaimed;

  const releaseForResume =
    dependencies.releaseForResume ??
    releaseGoogleAdsMediaSyncJobForResume;

  const summarize =
    dependencies.summarize ??
    defaultSummarize;

  const materialize =
    dependencies.materialize ??
    defaultMaterialize;

  const activate =
    dependencies.activate ??
    defaultActivate;

  const finalize =
    dependencies.finalize ??
    defaultFinalize;

  const markFailed =
    dependencies.markFailed ??
    defaultMarkFailed;

  let claimedJob:
    MediaSyncJobRecord |
    null;

  try {
    claimedJob =
      await claimNext();
  } catch (error) {
    throw wrapStage(
      "CLAIM_FAILED",
      "The next Google Ads media sync job could not be claimed.",
      error,
    );
  }

  if (!claimedJob) {
    return null;
  }

  try {
    assertClaimedGoogleJob(
      claimedJob,
    );

    let checkpointState:
      GoogleAdsMediaSyncProcessingCheckpointState;

    try {
      checkpointState =
        readCheckpoint(
          claimedJob,
        );
    } catch (error) {
      throw wrapStage(
        "INVALID_CHECKPOINT",
        "The claimed Google Ads processing checkpoint is invalid.",
        error,
      );
    }

    let checkpointJob =
      claimedJob;

    let staging:
      GoogleAdsKeywordStagingOrchestratorResult |
      null =
        null;

    if (!checkpointState.complete) {
      let processing:
        GoogleAdsKeywordProcessingOrchestratorResult;

      try {
        processing =
          await processClaimed({
            job:
              claimedJob,

            ...(
              checkpointState.hasCheckpoint
                ? {
                    dateWindowIndex:
                      checkpointState.dateWindowIndex ??
                      undefined,
                    cursor:
                      checkpointState.cursor ??
                      undefined,
                  }
                : {}
            ),
          });
      } catch (error) {
        throw wrapStage(
          "PROCESSING_FAILED",
          "The claimed Google Ads job failed during bounded processing.",
          error,
        );
      }

      assertSameScope(
        claimedJob,
        processing.job,
        "PROCESSING_FAILED",
      );

      staging =
        processing.staging;

      checkpointJob =
        processing.job;

      try {
        checkpointState =
          readCheckpoint(
            checkpointJob,
          );
      } catch (error) {
        throw wrapStage(
          "INVALID_CHECKPOINT",
          "The persisted Google Ads processing checkpoint is invalid.",
          error,
        );
      }

      if (
        staging.jobId !== checkpointJob.id ||
        staging.nextRowIndex !== checkpointState.nextRowIndex ||
        staging.canonicalRowCount !== checkpointState.nextRowIndex ||
        staging.isComplete !== checkpointState.complete ||
        staging.checkpoint.complete !== checkpointState.complete ||
        (
          checkpointState.complete
            ? staging.status !== "completed" ||
              staging.checkpoint.cursor !== null
            : staging.status !== "partial" ||
              staging.checkpoint.cursor === null
        )
      ) {
        throw new GoogleAdsMediaSyncWorkerOrchestrationError(
          "INVALID_CHECKPOINT",
          "The Google Ads staging result and persisted checkpoint disagree.",
        );
      }
    }

    if (!checkpointState.complete) {
      if (!staging) {
        throw new GoogleAdsMediaSyncWorkerOrchestrationError(
          "INVALID_CHECKPOINT",
          "A partial Google Ads checkpoint is missing its staging result.",
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
          "The partial Google Ads job could not be released for resume.",
          error,
        );
      }

      assertReleasedGoogleJob(
        releasedJob,
        checkpointJob,
      );

      return {
        status: "partial",
        jobId: releasedJob.id,
        reportId: releasedJob.report_id,
        workspaceId: releasedJob.workspace_id,
        advertiserId: releasedJob.advertiser_id,
        connectionId: releasedJob.connection_id,
        checkpointRows:
          checkpointState.nextRowIndex,
        phase: "keyword",
        partialReason:
          "GOOGLE_ADS_KEYWORD_PAGE_BOUNDARY",
        staging,
        checkpointJob,
        releasedJob,
        snapshotIngestionId: null,
        expectedRows:
          checkpointState.nextRowIndex,
      };
    }

    if (
      !checkpointState.hasCheckpoint ||
      checkpointState.cursor !== null
    ) {
      throw new GoogleAdsMediaSyncWorkerOrchestrationError(
        "INVALID_CHECKPOINT",
        "A completed persisted Google Ads checkpoint is required before completion.",
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
        "The completed Google Ads staging rows could not be verified.",
        error,
      );
    }

    assertCompleteSummary(
      checkpointJob,
      checkpointState,
      summary,
    );

    let materialization:
      MediaSyncSnapshotMaterializationResult;

    try {
      materialization =
        await materialize({
          job:
            checkpointJob,
          summary,
          ...(
            input.materializationBatchSize === undefined
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
        "The Google Ads staging rows could not be materialized.",
        error,
      );
    }

    assertSameScope(
      checkpointJob,
      materialization.job,
      "MATERIALIZATION_FAILED",
    );

    if (
      materialization.rowCount !== checkpointState.nextRowIndex ||
      materialization.job.snapshot_ingestion_id !==
        materialization.snapshotIngestionId
    ) {
      throw new GoogleAdsMediaSyncWorkerOrchestrationError(
        "MATERIALIZATION_FAILED",
        "The Google Ads materialization result is inconsistent.",
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
        "The Google Ads snapshot could not be activated.",
        error,
      );
    }

    assertSameScope(
      materialization.job,
      activation.job,
      "ACTIVATION_FAILED",
    );

    if (
      activation.rowCount !== checkpointState.nextRowIndex ||
      activation.snapshotIngestionId !==
        materialization.snapshotIngestionId ||
      activation.currentIngestionId !==
        materialization.snapshotIngestionId
    ) {
      throw new GoogleAdsMediaSyncWorkerOrchestrationError(
        "ACTIVATION_FAILED",
        "The Google Ads activation result is inconsistent.",
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
        "The Google Ads media sync job could not be finalized.",
        error,
      );
    }

    assertSameScope(
      activation.job,
      finalization.job,
      "FINALIZATION_FAILED",
    );

    if (
      finalization.job.status !== DONE_STATUS ||
      finalization.rowCount !== checkpointState.nextRowIndex ||
      finalization.snapshotIngestionId !==
        activation.snapshotIngestionId ||
      finalization.currentIngestionId !==
        activation.snapshotIngestionId
    ) {
      throw new GoogleAdsMediaSyncWorkerOrchestrationError(
        "FINALIZATION_FAILED",
        "The Google Ads finalization result is inconsistent.",
      );
    }

    return {
      status: "completed",
      jobId: finalization.job.id,
      reportId: finalization.job.report_id,
      workspaceId: finalization.job.workspace_id,
      advertiserId: finalization.job.advertiser_id,
      connectionId: finalization.job.connection_id,
      staging,
      checkpointJob,
      summary,
      materialization,
      activation,
      finalization,
      snapshotIngestionId:
        finalization.snapshotIngestionId,
      expectedRows:
        finalization.rowCount,
    };
  } catch (error) {
    if (
      shouldDeferAutomaticFailureMark(
        error,
      )
    ) {
      console.error(
        `[media-sync-worker] Google Ads job ${claimedJob.id} remains processing for operator diagnosis because the failure occurred at or after snapshot activation authority`,
      );

      throw error;
    }

    try {
      await markFailed({
        job:
          claimedJob,
        error,
      });
    } catch {
      console.error(
        `[media-sync-worker] Google Ads job ${claimedJob.id} failure marking also failed`,
      );
    }

    throw error;
  }
}

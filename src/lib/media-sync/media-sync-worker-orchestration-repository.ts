// src/lib/media-sync/media-sync-worker-orchestration-repository.ts

import { getSupabaseAdmin } from "../supabase/admin";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
} from "./media-sync-worker-repository";
import {
  runNaverSearchAdsStagingOrchestrator,
  NaverSearchAdsStagingOrchestratorError,
  type NaverSearchAdsStagingOrchestratorResult,
  type NaverSearchAdsStagingOrchestratorInput,
} from "./naver-searchads-staging-orchestrator";
import type {
  NaverKeywordStatsCollectorProgressEvent,
} from "./naver-searchads-keyword-stats-collector";
import {
  saveMediaSyncProcessingCheckpoint,
  MediaSyncProcessingCheckpointError,
} from "./media-sync-processing-checkpoint-repository";
import {
  materializeMediaSyncSnapshot,
  MediaSyncSnapshotMaterializationError,
  type MediaSyncSnapshotMaterializationResult,
} from "./media-sync-snapshot-materialization-repository";
import {
  activateMediaSyncSnapshot,
  MediaSyncSnapshotActivationError,
  type MediaSyncSnapshotActivationResult,
} from "./media-sync-snapshot-activation-repository";
import {
  finalizeMediaSyncJob,
  MediaSyncFinalizationError,
  type MediaSyncFinalizationResult,
} from "./media-sync-finalization-repository";
import type {
  MediaSyncJobRecord,
} from "./types";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const FAILED_STATUS =
  "failed" as const;

const MEDIA_SYNC_JOBS_TABLE =
  "media_sync_jobs" as const;

const DEFAULT_JOB_TIMEOUT_MS =
  10 * 60 * 1_000;

const MIN_JOB_TIMEOUT_MS =
  30_000;

const MAX_JOB_TIMEOUT_MS =
  60 * 60 * 1_000;

export type MediaSyncWorkerOrchestrationErrorCode =
  | "NO_JOB"
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "JOB_TIMEOUT"
  | "UNSUPPORTED_PROVIDER"
  | "CLAIM_FAILED"
  | "CONTEXT_FAILED"
  | "STAGING_FAILED"
  | "CHECKPOINT_FAILED"
  | "MATERIALIZATION_FAILED"
  | "ACTIVATION_FAILED"
  | "FINALIZATION_FAILED";

export class MediaSyncWorkerOrchestrationError extends Error {
  readonly code:
    MediaSyncWorkerOrchestrationErrorCode;

  constructor(
    code:
      MediaSyncWorkerOrchestrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaSyncWorkerOrchestrationError";

    this.code = code;
  }
}

export type ProcessNaverMediaSyncJobOptions = {
  dateWindowIndex?: number;
  stagingBatchSize?: number;
  requestIntervalMs?: number;
  keywordChunkSize?: number;
  chunkPauseMs?: number;
  maxRetryCount?: number;
  jobTimeoutMs?: number;
  signal?: AbortSignal;
  onRetry?: NaverSearchAdsStagingOrchestratorInput["onRetry"];
  dependencies?: NaverSearchAdsStagingOrchestratorInput["dependencies"];
};

export type ProcessNaverMediaSyncJobResult = {
  jobId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  connectionId: string;

  staging: NaverSearchAdsStagingOrchestratorResult;
  checkpointJob: MediaSyncJobRecord;
  materialization: MediaSyncSnapshotMaterializationResult;
  activation: MediaSyncSnapshotActivationResult;
  finalization: MediaSyncFinalizationResult;

  snapshotIngestionId: string;
  expectedRows: number;
};

export type ProcessNextNaverMediaSyncJobInput =
  ProcessNaverMediaSyncJobOptions;

function validateProcessingNaverJob(
  job: MediaSyncJobRecord,
): void {
  if (
    job.provider !== NAVER_PROVIDER
  ) {
    throw new MediaSyncWorkerOrchestrationError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads media sync jobs can be orchestrated at this stage.",
    );
  }

  if (
    job.status !== PROCESSING_STATUS
  ) {
    throw new MediaSyncWorkerOrchestrationError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing before orchestration can continue.",
    );
  }

  if (!job.started_at) {
    throw new MediaSyncWorkerOrchestrationError(
      "INVALID_JOB",
      "The processing media sync job has no started_at value.",
    );
  }

  if (
    job.attempt_count < 1
  ) {
    throw new MediaSyncWorkerOrchestrationError(
      "INVALID_JOB",
      "The processing media sync job has an invalid attempt_count value.",
    );
  }
}

function wrapStageError(
  code: MediaSyncWorkerOrchestrationErrorCode,
  message: string,
  error: unknown,
): MediaSyncWorkerOrchestrationError {
  return new MediaSyncWorkerOrchestrationError(
    code,
    message,
    { cause: error },
  );
}

function normalizeTimeoutMs(
  value: unknown,
): number {
  if (value === undefined || value === null) {
    return DEFAULT_JOB_TIMEOUT_MS;
  }

  const numericValue = Number(value);

  if (
    !Number.isSafeInteger(numericValue) ||
    numericValue < MIN_JOB_TIMEOUT_MS ||
    numericValue > MAX_JOB_TIMEOUT_MS
  ) {
    throw new MediaSyncWorkerOrchestrationError(
      "INVALID_INPUT",
      `jobTimeoutMs must be an integer between ${MIN_JOB_TIMEOUT_MS} and ${MAX_JOB_TIMEOUT_MS}.`,
    );
  }

  return numericValue;
}

function getMaybeErrorCode(
  error: unknown,
): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeCode =
    (error as { code?: unknown }).code;

  return typeof maybeCode === "string" && maybeCode.trim()
    ? maybeCode.trim().slice(0, 200)
    : null;
}

function getErrorCode(
  error: unknown,
): string {
  if (error instanceof MediaSyncWorkerOrchestrationError) {
    return error.code;
  }

  return getMaybeErrorCode(error) ?? "WORKER_FAILED";
}

function getErrorName(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }

  return "UnknownError";
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message || "Media sync worker failed.";
  }

  return String(error || "Media sync worker failed.");
}

function getCauseError(
  error: unknown,
): Error | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const cause = error.cause;

  return cause instanceof Error ? cause : null;
}

function getSafeFailureDetail(
  error: unknown,
): Record<string, string | null> {
  const cause = getCauseError(error);
  const causeCode = getMaybeErrorCode(cause);

  return {
    code: getErrorCode(error),
    message: getErrorMessage(error).slice(0, 500),
    name: getErrorName(error).slice(0, 100),
    cause_name: cause?.name?.slice(0, 100) ?? null,
    cause_code: causeCode,
    cause_message: cause?.message?.slice(0, 500) ?? null,
    stage:
      error instanceof MediaSyncWorkerOrchestrationError
        ? error.code
        : "WORKER_FAILED",
  };
}

function logStage(input: {
  job: MediaSyncJobRecord;
  stage: string;
  detail?: string;
}): void {
  const detail = input.detail ? ` ${input.detail}` : "";

  console.log(
    `[media-sync-worker] job ${input.job.id} stage ${input.stage}${detail}`,
  );

  console.log(
    `[media-sync-worker] report ${input.job.report_id} date ${input.job.date_from}..${input.job.date_to} level ${input.job.data_level}`,
  );
}

function shouldLogCollectorProgress(
  event: NaverKeywordStatsCollectorProgressEvent,
): boolean {
  if (
    event.stage !== "keyword_stats:start" &&
    event.stage !== "keyword_stats:done"
  ) {
    return true;
  }

  const completed =
    event.keywordsCompletedInRun;

  if (completed <= 1) {
    return true;
  }

  return completed % 25 === 0;
}

function formatCollectorProgressDetail(
  event: NaverKeywordStatsCollectorProgressEvent,
): string {
  const parts: string[] = [
    `campaignPages=${event.campaignPagesRead}`,
    `campaigns=${event.campaignsRead}`,
    `adgroupPages=${event.adgroupPagesRead}`,
    `adgroups=${event.adgroupsRead}`,
    `keywordPages=${event.keywordPagesRead}`,
    `discovered=${event.keywordsDiscoveredInRun}`,
    `completed=${event.keywordsCompletedInRun}`,
    `statsAttempts=${event.statsRequestsAttempted}`,
    `statsSuccess=${event.statsRequestsSucceeded}`,
  ];

  if (event.campaignId) {
    parts.push(`campaign=${event.campaignId}`);
  }

  if (event.adgroupId) {
    parts.push(`adgroup=${event.adgroupId}`);
  }

  if (event.keywordId) {
    parts.push(`keyword=${event.keywordId}`);
  }

  if (event.pageNumber !== null) {
    parts.push(`page=${event.pageNumber}`);
  }

  if (event.recordsRead !== null) {
    parts.push(`records=${event.recordsRead}`);
  }

  if (event.chunkIndex !== null) {
    parts.push(`chunk=${event.chunkIndex}`);
  }

  if (event.chunkSize !== null) {
    parts.push(`chunkSize=${event.chunkSize}`);
  }

  if (event.keywordIndexInChunk !== null) {
    parts.push(`keywordIndex=${event.keywordIndexInChunk}`);
  }

  if (event.attemptCount !== null) {
    parts.push(`attempts=${event.attemptCount}`);
  }

  if (event.delayMs !== null) {
    parts.push(`delayMs=${event.delayMs}`);
  }

  if (event.retryCount > 0) {
    parts.push(`retries=${event.retryCount}`);
  }

  return parts.join(" ");
}

function logCollectorProgress(input: {
  job: MediaSyncJobRecord;
  event: NaverKeywordStatsCollectorProgressEvent;
}): void {
  if (!shouldLogCollectorProgress(input.event)) {
    return;
  }

  logStage({
    job: input.job,
    stage: `collector:${input.event.stage}`,
    detail: formatCollectorProgressDetail(input.event),
  });
}

async function markProcessingMediaSyncJobFailed(input: {
  job: MediaSyncJobRecord;
  error: unknown;
}): Promise<void> {
  const now = new Date().toISOString();
  const safeDetail = getSafeFailureDetail(input.error);
  const safeErrorCode =
    safeDetail.cause_code ||
    safeDetail.code ||
    "WORKER_FAILED";

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from(MEDIA_SYNC_JOBS_TABLE)
    .update({
      status: FAILED_STATUS,
      progress: 0,
      error: safeErrorCode,
      error_detail: safeDetail,
      finished_at: now,
      updated_at: now,
    })
    .eq("id", input.job.id)
    .eq("status", PROCESSING_STATUS);

  if (error) {
    throw wrapStageError(
      "FINALIZATION_FAILED",
      "The failed Naver media sync job could not be marked as failed.",
      error,
    );
  }

  console.error(
    `[media-sync-worker] job ${input.job.id} marked failed: ${safeErrorCode}`,
  );
}

function withJobTimeout<T>(input: {
  job: MediaSyncJobRecord;
  timeoutMs: number;
  abortController: AbortController | null;
  promise: Promise<T>;
}): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      input.abortController?.abort();

      reject(
        new MediaSyncWorkerOrchestrationError(
          "JOB_TIMEOUT",
          `The Naver media sync job exceeded the ${input.timeoutMs}ms timeout.`,
        ),
      );
    }, input.timeoutMs);
  });

  return Promise.race([
    input.promise,
    timeoutPromise,
  ]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

/**
 * 이미 processing으로 점유된 Naver media_sync_job 1개를
 * collector → staging → checkpoint → materialization
 * → activation → finalization 순서로 끝까지 처리한다.
 *
 * 주의:
 * - 실제 worker loop는 이 함수를 반복 호출하지 않는다.
 * - 실패 시 이 함수 자체는 failed 상태로 바꾸지 않는다.
 * - processNextNaverMediaSyncJob()이 이미 점유한 job 실패를 failed로 정리한다.
 * - checkpoint/finalization repository의 error_detail 정책을 훼손하지 않는다.
 * - credential/provider 원본 payload를 로그나 DB에 저장하지 않는다.
 */
export async function processClaimedNaverMediaSyncJob(
  job: MediaSyncJobRecord,
  options: ProcessNaverMediaSyncJobOptions = {},
): Promise<ProcessNaverMediaSyncJobResult> {
  validateProcessingNaverJob(job);

  logStage({ job, stage: "claimed" });

  let context;

  try {
    logStage({ job, stage: "context:start" });

    context =
      await loadNaverMediaSyncWorkerContext(
        job,
      );
  } catch (error) {
    if (
      error instanceof
      MediaSyncWorkerRepositoryError
    ) {
      throw wrapStageError(
        "CONTEXT_FAILED",
        "The Naver media sync worker context could not be loaded.",
        error,
      );
    }

    throw wrapStageError(
      "CONTEXT_FAILED",
      "The Naver media sync worker context failed unexpectedly.",
      error,
    );
  }

  logStage({ job: context.job, stage: "context:done" });

  let staging:
    NaverSearchAdsStagingOrchestratorResult;

  try {
    logStage({ job: context.job, stage: "staging:start" });

    staging =
      await runNaverSearchAdsStagingOrchestrator({
        job:
          context.job,

        credentials:
          context.credentials,

        dateWindowIndex:
          options.dateWindowIndex,

        stagingBatchSize:
          options.stagingBatchSize,

        requestIntervalMs:
          options.requestIntervalMs,

        keywordChunkSize:
          options.keywordChunkSize,

        chunkPauseMs:
          options.chunkPauseMs,

        maxRetryCount:
          options.maxRetryCount,

        signal:
          options.signal,

        onRetry:
          options.onRetry,

        onCollectorProgress:
          async (
            event,
          ): Promise<void> => {
            logCollectorProgress({
              job:
                context.job,
              event,
            });
          },

        dependencies:
          options.dependencies,
      });
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsStagingOrchestratorError
    ) {
      throw wrapStageError(
        "STAGING_FAILED",
        "The Naver media sync staging orchestration failed.",
        error,
      );
    }

    throw wrapStageError(
      "STAGING_FAILED",
      "The Naver media sync staging orchestration failed unexpectedly.",
      error,
    );
  }

  logStage({
    job: context.job,
    stage: "staging:done",
  });

  let checkpointJob:
    MediaSyncJobRecord;

  try {
    logStage({ job: context.job, stage: "checkpoint:start" });

    checkpointJob =
      await saveMediaSyncProcessingCheckpoint({
        job:
          context.job,

        result:
          staging,
      });
  } catch (error) {
    if (
      error instanceof
      MediaSyncProcessingCheckpointError
    ) {
      throw wrapStageError(
        "CHECKPOINT_FAILED",
        "The Naver media sync processing checkpoint could not be saved.",
        error,
      );
    }

    throw wrapStageError(
      "CHECKPOINT_FAILED",
      "The Naver media sync processing checkpoint failed unexpectedly.",
      error,
    );
  }

  logStage({ job: checkpointJob, stage: "checkpoint:done" });

  let materialization:
    MediaSyncSnapshotMaterializationResult;

  try {
    logStage({ job: checkpointJob, stage: "materialization:start" });

    materialization =
      await materializeMediaSyncSnapshot({
        job:
          checkpointJob,

        summary:
          staging.summary,
      });
  } catch (error) {
    if (
      error instanceof
      MediaSyncSnapshotMaterializationError
    ) {
      throw wrapStageError(
        "MATERIALIZATION_FAILED",
        "The Naver media sync snapshot could not be materialized.",
        error,
      );
    }

    throw wrapStageError(
      "MATERIALIZATION_FAILED",
      "The Naver media sync snapshot materialization failed unexpectedly.",
      error,
    );
  }

  logStage({
    job: materialization.job,
    stage: "materialization:done",
    detail: `rows=${materialization.rowCount}`,
  });

  let activation:
    MediaSyncSnapshotActivationResult;

  try {
    logStage({ job: materialization.job, stage: "activation:start" });

    activation =
      await activateMediaSyncSnapshot({
        job:
          materialization.job,

        expectedRows:
          materialization.rowCount,
      });
  } catch (error) {
    if (
      error instanceof
      MediaSyncSnapshotActivationError
    ) {
      throw wrapStageError(
        "ACTIVATION_FAILED",
        "The Naver media sync snapshot could not be activated.",
        error,
      );
    }

    throw wrapStageError(
      "ACTIVATION_FAILED",
      "The Naver media sync snapshot activation failed unexpectedly.",
      error,
    );
  }

  logStage({
    job: activation.job,
    stage: "activation:done",
    detail: `rows=${activation.rowCount}`,
  });

  let finalization:
    MediaSyncFinalizationResult;

  try {
    logStage({ job: activation.job, stage: "finalization:start" });

    finalization =
      await finalizeMediaSyncJob({
        job:
          activation.job,

        expectedRows:
          activation.rowCount,
      });
  } catch (error) {
    if (
      error instanceof
      MediaSyncFinalizationError
    ) {
      throw wrapStageError(
        "FINALIZATION_FAILED",
        "The Naver media sync job could not be finalized.",
        error,
      );
    }

    throw wrapStageError(
      "FINALIZATION_FAILED",
      "The Naver media sync finalization failed unexpectedly.",
      error,
    );
  }

  logStage({
    job: finalization.job,
    stage: "finalization:done",
    detail: `snapshot=${finalization.snapshotIngestionId} rows=${finalization.rowCount}`,
  });

  return {
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

    materialization,

    activation,

    finalization,

    snapshotIngestionId:
      finalization.snapshotIngestionId,

    expectedRows:
      finalization.rowCount,
  };
}

/**
 * pending Naver media_sync_job 1개를 processing으로 점유하고
 * end-to-end orchestration을 1회 실행한다.
 *
 * 실제 worker loop 연결 전 fixture/단발 검증용 진입점이다.
 */
export async function processNextNaverMediaSyncJob(
  input: ProcessNextNaverMediaSyncJobInput = {},
): Promise<ProcessNaverMediaSyncJobResult | null> {
  let claimedJob:
    MediaSyncJobRecord | null;

  try {
    claimedJob =
      await claimNextNaverMediaSyncJob();
  } catch (error) {
    if (
      error instanceof
      MediaSyncWorkerRepositoryError
    ) {
      throw wrapStageError(
        "CLAIM_FAILED",
        "The next Naver media sync job could not be claimed.",
        error,
      );
    }

    throw wrapStageError(
      "CLAIM_FAILED",
      "The next Naver media sync job claim failed unexpectedly.",
      error,
    );
  }

  if (!claimedJob) {
    return null;
  }

  const timeoutMs = normalizeTimeoutMs(input.jobTimeoutMs);
  const abortController = input.signal ? null : new AbortController();

  const processingInput: ProcessNaverMediaSyncJobOptions = {
    ...input,
    signal: input.signal ?? abortController?.signal,
  };

  try {
    return await withJobTimeout({
      job: claimedJob,
      timeoutMs,
      abortController,
      promise: processClaimedNaverMediaSyncJob(
        claimedJob,
        processingInput,
      ),
    });
  } catch (error) {
    await markProcessingMediaSyncJobFailed({
      job: claimedJob,
      error,
    });

    throw error;
  }
}

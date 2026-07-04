// src/lib/media-sync/media-sync-worker-orchestration-repository.ts

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

export type MediaSyncWorkerOrchestrationErrorCode =
  | "NO_JOB"
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
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

/**
 * 이미 processing으로 점유된 Naver media_sync_job 1개를
 * collector → staging → checkpoint → materialization
 * → activation → finalization 순서로 끝까지 처리한다.
 *
 * 주의:
 * - 실제 worker loop는 이 함수를 반복 호출하지 않는다.
 * - 실패 시 여기서 임의로 failed 상태로 바꾸지 않는다.
 * - checkpoint/finalization repository의 error_detail 정책을 훼손하지 않는다.
 * - credential/provider 원본 payload를 로그나 DB에 저장하지 않는다.
 */
export async function processClaimedNaverMediaSyncJob(
  job: MediaSyncJobRecord,
  options: ProcessNaverMediaSyncJobOptions = {},
): Promise<ProcessNaverMediaSyncJobResult> {
  validateProcessingNaverJob(job);

  let context;

  try {
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

  let staging:
    NaverSearchAdsStagingOrchestratorResult;

  try {
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

  let checkpointJob:
    MediaSyncJobRecord;

  try {
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

  let materialization:
    MediaSyncSnapshotMaterializationResult;

  try {
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

  let activation:
    MediaSyncSnapshotActivationResult;

  try {
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

  let finalization:
    MediaSyncFinalizationResult;

  try {
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

  return processClaimedNaverMediaSyncJob(
    claimedJob,
    input,
  );
}
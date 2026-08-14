// src/lib/media-sync/media-sync-worker-orchestration-repository.ts

import { getSupabaseAdmin } from "../supabase/admin";
import {
  claimNextNaverMediaSyncJob,
  loadNaverMediaSyncWorkerContext,
  MediaSyncWorkerRepositoryError,
  releaseNaverMediaSyncJobForResume,
} from "./media-sync-worker-repository";
import {
  runNaverSearchAdsStagingOrchestrator,
  NaverSearchAdsStagingOrchestratorError,
  type NaverSearchAdsStagingOrchestratorCompletedResult,
  type NaverSearchAdsStagingOrchestratorInput,
  type NaverSearchAdsStagingOrchestratorPartialResult,
} from "./naver-searchads-staging-orchestrator";
import type {
  NaverKeywordStatsCollectorProgressEvent,
} from "./naver-searchads-keyword-stats-collector";
import {
  runNaverSearchAdsAuthoritativeEntityStagingOrchestrator,
  NaverSearchAdsAuthoritativeEntityStagingOrchestratorError,
  type NaverSearchAdsAuthoritativeEntityStagingOrchestratorInput,
  type NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult,
} from "./naver-searchads-authoritative-entity-staging-orchestrator";
import type {
  NaverAuthoritativeEntityStatsCollectorProgressEvent,
} from "./naver-searchads-authoritative-entity-stats-collector";
import {
  assertNaverSearchAdsCombinedStagingComplete,
  MediaSyncStagingSummaryError,
  type MediaSyncStagingSummary,
} from "./media-sync-staging-summary-repository";
import type {
  MediaCanonicalRowBatchBufferState,
} from "./media-canonical-row-batch-buffer";
import {
  createCombinedCheckpointFromAuthoritativeResult,
  createCombinedCheckpointFromKeywordResult,
  readNaverSearchAdsCombinedProcessingCheckpoint,
  saveNaverSearchAdsCombinedProcessingCheckpoint,
  MediaSyncCombinedProcessingCheckpointError,
  type MediaSyncCombinedProcessingCheckpointDependencies,
  type NaverSearchAdsCombinedProcessingCheckpoint,
  type NaverSearchAdsCombinedStagingPhase,
} from "./media-sync-combined-processing-checkpoint-repository";
import {
  reconcileNaverSearchAdsBrandSearchCrossGrainStaging,
  isNaverSearchAdsBrandSearchCrossGrainReconciliationPartialResult,
  NaverSearchAdsBrandSearchCrossGrainReconciliationError,
  type NaverSearchAdsBrandSearchCrossGrainReconciliationCompletedResult,
  type NaverSearchAdsBrandSearchCrossGrainReconciliationDependencies,
} from "./naver-searchads-brand-search-cross-grain-reconciliation-repository";
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
import {
  loadMediaSyncReportFanoutTargets,
  loadMediaSyncReportProjectionAuthority,
  MediaSyncReportFanoutError,
  type MediaSyncReportFanoutTarget,
  type MediaSyncReportProjectionAuthority,
} from "./media-sync-report-fanout-repository";
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

const MAX_SAFE_ERROR_TEXT_LENGTH =
  1_000;

const MAX_SAFE_ERROR_FIELD_LENGTH =
  500;

const MAX_NESTED_CAUSE_DEPTH =
  6;

const FORBIDDEN_FAILURE_DETAIL_KEY_PATTERN =
  /secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key/i;

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
  | "JOB_RELEASE_FAILED"
  | "RECONCILIATION_FAILED"
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

export type MediaSyncWorkerOrchestrationDependencies = {
  loadContext:
    typeof loadNaverMediaSyncWorkerContext;

  runKeywordStaging:
    typeof runNaverSearchAdsStagingOrchestrator;

  runAuthoritativeStaging:
    typeof runNaverSearchAdsAuthoritativeEntityStagingOrchestrator;

  saveCombinedCheckpoint:
    typeof saveNaverSearchAdsCombinedProcessingCheckpoint;

  releaseForResume:
    typeof releaseNaverMediaSyncJobForResume;

  reconcileStaging:
    typeof reconcileNaverSearchAdsBrandSearchCrossGrainStaging;

  assertStagingComplete:
    typeof assertNaverSearchAdsCombinedStagingComplete;

  loadFanoutTargets?:
    typeof loadMediaSyncReportFanoutTargets;

  loadProjectionAuthority?:
    typeof loadMediaSyncReportProjectionAuthority;

  materialize:
    typeof materializeMediaSyncSnapshot;

  activate:
    typeof activateMediaSyncSnapshot;

  finalize:
    typeof finalizeMediaSyncJob;
};

type ResolvedMediaSyncWorkerOrchestrationDependencies =
  Omit<
    MediaSyncWorkerOrchestrationDependencies,
    "loadFanoutTargets" |
    "loadProjectionAuthority"
  > & {
    loadFanoutTargets:
      typeof loadMediaSyncReportFanoutTargets;

    loadProjectionAuthority:
      typeof loadMediaSyncReportProjectionAuthority;
  };

export type ProcessNaverMediaSyncJobOptions = {
  dateWindowIndex?: number;
  stagingBatchSize?: number;
  requestIntervalMs?: number;
  keywordChunkSize?: number;
  chunkPauseMs?: number;
  maxRetryCount?: number;
  maxKeywordStatsPerRun?: number;
  maxStatsRequestsPerRun?: number;
  maxKeywordDiscoveryPagesPerRun?: number;

  maxAuthoritativeEntityStatsPerRun?: number;
  maxAuthoritativeStatsRequestsPerRun?: number;
  maxAuthoritativeDiscoveryPagesPerRun?: number;

  reconciliationBatchSize?: number;
  materializationBatchSize?: number;
  jobTimeoutMs?: number;
  signal?: AbortSignal;

  onRetry?:
    NaverSearchAdsStagingOrchestratorInput["onRetry"];

  onAuthoritativeRetry?:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorInput["onRetry"];

  dependencies?:
    NaverSearchAdsStagingOrchestratorInput["dependencies"];

  authoritativeDependencies?:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorInput["collectorDependencies"];

  authoritativeStagingRepositoryDependencies?:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorInput["stagingRepositoryDependencies"];

  combinedCheckpointDependencies?:
    MediaSyncCombinedProcessingCheckpointDependencies;

  reconciliationDependencies?:
    NaverSearchAdsBrandSearchCrossGrainReconciliationDependencies;

  orchestrationDependencies?: Partial<
    MediaSyncWorkerOrchestrationDependencies
  >;
};

export type NaverSearchAdsWorkerCombinedAppendTotals = {
  flushCount: number;
  submittedRows: number;
  insertedRows: number;
  duplicateRows: number;
  maximumBatchSize: number;
  firstRowIndex: number | null;
  lastRowIndex: number | null;
};

export type NaverSearchAdsWorkerPhase =
  | NaverSearchAdsCombinedStagingPhase
  | "reconciliation";

export type NaverSearchAdsWorkerCombinedCollectorResult = {
  phase:
    NaverSearchAdsWorkerPhase;

  partialReason:
    string | null;

  keyword:
    NaverSearchAdsStagingOrchestratorCompletedResult["collector"] |
    NaverSearchAdsStagingOrchestratorPartialResult["collector"] |
    null;

  authoritative:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult["collector"] |
    null;
};

export type NaverSearchAdsWorkerCombinedPartialSummary = {
  isComplete: false;
  totalRows: number;
  expectedRows: number;
  insertedRows: number;
  duplicateRows: number;
};

export type NaverSearchAdsWorkerCombinedStagingResult = {
  status:
    "partial" |
    "completed";

  isComplete:
    boolean;

  phase:
    NaverSearchAdsWorkerPhase;

  jobId:
    string;

  dateWindowIndex:
    number;

  canonicalRowCount:
    number;

  runCanonicalRowCount:
    number;

  callbackCount:
    number;

  collector:
    NaverSearchAdsWorkerCombinedCollectorResult;

  buffer:
    MediaCanonicalRowBatchBufferState;

  append:
    NaverSearchAdsWorkerCombinedAppendTotals;

  summary:
    MediaSyncStagingSummary |
    NaverSearchAdsWorkerCombinedPartialSummary;

  keyword:
    NaverSearchAdsStagingOrchestratorCompletedResult |
    NaverSearchAdsStagingOrchestratorPartialResult |
    null;

  authoritative:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult |
    null;
};

export type MediaSyncReportFanoutProjectionResult = {
  reportId:
    string;

  primary:
    boolean;

  materialization:
    MediaSyncSnapshotMaterializationResult;

  activation:
    MediaSyncSnapshotActivationResult;
};

export type ProcessNaverMediaSyncJobCompletedResult = {
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

  reconciliation:
    NaverSearchAdsBrandSearchCrossGrainReconciliationCompletedResult;

  staging:
    NaverSearchAdsWorkerCombinedStagingResult & {
      status:
        "completed";
      isComplete:
        true;
      summary:
        MediaSyncStagingSummary;
    };

  checkpointJob:
    MediaSyncJobRecord;

  materialization:
    MediaSyncSnapshotMaterializationResult;

  activation:
    MediaSyncSnapshotActivationResult;

  /**
   * Additive full-fanout result.
   *
   * The legacy top-level materialization / activation fields remain
   * the primary projection result.
   */
  fanout?:
    MediaSyncReportFanoutProjectionResult[];

  finalization:
    MediaSyncFinalizationResult;

  snapshotIngestionId:
    string;

  expectedRows:
    number;
};

export type ProcessNaverMediaSyncJobPartialResult = {
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

  phase:
    "keyword" |
    "authoritative" |
    "reconciliation";

  partialReason:
    string;

  checkpointRows:
    number;

  staging:
    NaverSearchAdsWorkerCombinedStagingResult & {
      status:
        "partial";
      isComplete:
        false;
      summary:
        NaverSearchAdsWorkerCombinedPartialSummary;
    };

  checkpointJob:
    MediaSyncJobRecord;

  releasedJob:
    MediaSyncJobRecord;

  snapshotIngestionId:
    null;

  expectedRows:
    number;
};

export type ProcessNaverMediaSyncJobResult =
  | ProcessNaverMediaSyncJobCompletedResult
  | ProcessNaverMediaSyncJobPartialResult;

export type ProcessNextNaverMediaSyncJobInput =
  ProcessNaverMediaSyncJobOptions;

type SafeFailureDetail = {
  code: string;
  message: string;
  name: string;
  stage: string;
  cause_name: string | null;
  cause_code: string | null;
  cause_message: string | null;
  nested_causes: SafeNestedCauseDetail[];
};

type SafeNestedCauseDetail = {
  depth: number;
  name: string;
  code: string | null;
  message: string;
  constructor_name: string | null;
  postgres_code?: string;
  postgres_hint?: string;
  postgres_details?: string;
  http_status?: number;
  pending_row_count?: number;
  flushed_batch_count?: number;
  flushed_row_count?: number;
};

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

function safeText(
  value: unknown,
  fallback: string,
  maxLength = MAX_SAFE_ERROR_FIELD_LENGTH,
): string {
  if (typeof value === "string") {
    const normalizedValue =
      value.trim();

    return (
      normalizedValue || fallback
    ).slice(
      0,
      maxLength,
    );
  }

  if (
    value === null ||
    value === undefined
  ) {
    return fallback.slice(
      0,
      maxLength,
    );
  }

  return String(value || fallback).slice(
    0,
    maxLength,
  );
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
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

function isForbiddenFailureDetailKey(
  key: string,
): boolean {
  return FORBIDDEN_FAILURE_DETAIL_KEY_PATTERN.test(
    key.replace(
      /[^a-z0-9_-]/gi,
      "",
    ),
  );
}

function getMaybeStringProperty(
  value: unknown,
  key: string,
  maxLength = MAX_SAFE_ERROR_FIELD_LENGTH,
): string | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  if (
    isForbiddenFailureDetailKey(
      key,
    )
  ) {
    return null;
  }

  const propertyValue =
    (value as Record<string, unknown>)[key];

  if (
    typeof propertyValue !== "string" ||
    !propertyValue.trim()
  ) {
    return null;
  }

  return propertyValue.trim().slice(
    0,
    maxLength,
  );
}

function getMaybeNumberProperty(
  value: unknown,
  key: string,
): number | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  if (
    isForbiddenFailureDetailKey(
      key,
    )
  ) {
    return null;
  }

  const propertyValue =
    (value as Record<string, unknown>)[key];

  return typeof propertyValue === "number" &&
    Number.isFinite(propertyValue)
    ? propertyValue
    : null;
}

function getMaybeErrorCode(
  error: unknown,
): string | null {
  return getMaybeStringProperty(
    error,
    "code",
    200,
  );
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
    return safeText(
      error.name,
      "Error",
      100,
    );
  }

  return getMaybeStringProperty(
    error,
    "name",
    100,
  ) ?? "UnknownError";
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return safeText(
      error.message,
      "Media sync worker failed.",
      MAX_SAFE_ERROR_TEXT_LENGTH,
    );
  }

  const message =
    getMaybeStringProperty(
      error,
      "message",
      MAX_SAFE_ERROR_TEXT_LENGTH,
    );

  if (message) {
    return message;
  }

  return safeText(
    error,
    "Media sync worker failed.",
    MAX_SAFE_ERROR_TEXT_LENGTH,
  );
}

function getConstructorName(
  error: unknown,
): string | null {
  if (
    !error ||
    typeof error !== "object"
  ) {
    return null;
  }

  const constructorName =
    error.constructor?.name;

  return typeof constructorName === "string" &&
    constructorName.trim()
    ? constructorName.trim().slice(
        0,
        100,
      )
    : null;
}

function getCauseValue(
  error: unknown,
): unknown {
  if (
    !error ||
    typeof error !== "object"
  ) {
    return null;
  }

  return (error as { cause?: unknown }).cause ?? null;
}

function getSafePostgresErrorFields(
  error: unknown,
): Partial<SafeNestedCauseDetail> {
  const postgresCode =
    getMaybeStringProperty(
      error,
      "code",
      100,
    );

  const postgresHint =
    getMaybeStringProperty(
      error,
      "hint",
      MAX_SAFE_ERROR_TEXT_LENGTH,
    );

  const postgresDetails =
    getMaybeStringProperty(
      error,
      "details",
      MAX_SAFE_ERROR_TEXT_LENGTH,
    );

  const httpStatus =
    getMaybeNumberProperty(
      error,
      "status",
    ) ??
    getMaybeNumberProperty(
      error,
      "statusCode",
    );

  const detail:
    Partial<SafeNestedCauseDetail> = {};

  if (postgresCode) {
    detail.postgres_code =
      postgresCode;
  }

  if (postgresHint) {
    detail.postgres_hint =
      postgresHint;
  }

  if (postgresDetails) {
    detail.postgres_details =
      postgresDetails;
  }

  if (
    typeof httpStatus === "number" &&
    Number.isFinite(httpStatus)
  ) {
    detail.http_status =
      httpStatus;
  }

  return detail;
}

function getSafeBufferErrorFields(
  error: unknown,
): Partial<SafeNestedCauseDetail> {
  const pendingRowCount =
    getMaybeNumberProperty(
      error,
      "pendingRowCount",
    );

  const flushedBatchCount =
    getMaybeNumberProperty(
      error,
      "flushedBatchCount",
    );

  const flushedRowCount =
    getMaybeNumberProperty(
      error,
      "flushedRowCount",
    );

  const detail:
    Partial<SafeNestedCauseDetail> = {};

  if (
    typeof pendingRowCount === "number" &&
    Number.isFinite(pendingRowCount)
  ) {
    detail.pending_row_count =
      pendingRowCount;
  }

  if (
    typeof flushedBatchCount === "number" &&
    Number.isFinite(flushedBatchCount)
  ) {
    detail.flushed_batch_count =
      flushedBatchCount;
  }

  if (
    typeof flushedRowCount === "number" &&
    Number.isFinite(flushedRowCount)
  ) {
    detail.flushed_row_count =
      flushedRowCount;
  }

  return detail;
}

function createSafeNestedCauseDetail(
  error: unknown,
  depth: number,
): SafeNestedCauseDetail {
  return {
    depth,

    name:
      getErrorName(
        error,
      ),

    code:
      getMaybeErrorCode(
        error,
      ),

    message:
      getErrorMessage(
        error,
      ),

    constructor_name:
      getConstructorName(
        error,
      ),

    ...getSafePostgresErrorFields(
      error,
    ),

    ...getSafeBufferErrorFields(
      error,
    ),
  };
}

function getNestedCauses(
  error: unknown,
): SafeNestedCauseDetail[] {
  const causes:
    SafeNestedCauseDetail[] = [];

  const visited =
    new Set<unknown>();

  let current:
    unknown =
      getCauseValue(
        error,
      );

  for (
    let depth = 1;
    depth <= MAX_NESTED_CAUSE_DEPTH;
    depth += 1
  ) {
    if (
      current === null ||
      current === undefined
    ) {
      break;
    }

    if (
      typeof current === "object" &&
      current !== null
    ) {
      if (
        visited.has(
          current,
        )
      ) {
        causes.push({
          depth,
          name:
            "CircularCause",
          code:
            null,
          message:
            "Circular error cause reference was omitted.",
          constructor_name:
            getConstructorName(
              current,
            ),
        });

        break;
      }

      visited.add(
        current,
      );
    }

    causes.push(
      createSafeNestedCauseDetail(
        current,
        depth,
      ),
    );

    current =
      getCauseValue(
        current,
      );
  }

  return causes;
}

function getSafeFailureDetail(
  error: unknown,
): SafeFailureDetail {
  const nestedCauses =
    getNestedCauses(
      error,
    );

  const firstCause =
    nestedCauses[0] ?? null;

  return {
    code:
      getErrorCode(
        error,
      ),

    message:
      getErrorMessage(
        error,
      ),

    name:
      getErrorName(
        error,
      ),

    cause_name:
      firstCause?.name ?? null,

    cause_code:
      firstCause?.code ?? null,

    cause_message:
      firstCause?.message ?? null,

    stage:
      error instanceof MediaSyncWorkerOrchestrationError
        ? error.code
        : "WORKER_FAILED",

    nested_causes:
      nestedCauses,
  };
}

function logSafeFailureContext(input: {
  job: MediaSyncJobRecord;
  label: "processing_failure" | "mark_failed_failure";
  error: unknown;
}): void {
  const detail =
    getSafeFailureDetail(
      input.error,
    );

  console.error(
    `[media-sync-worker] job ${input.job.id} ${input.label}: ${JSON.stringify(detail)}`,
  );
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

function assertFanoutTargetsUnchanged(input: {
  expected:
    readonly MediaSyncReportFanoutTarget[];

  actual:
    readonly MediaSyncReportFanoutTarget[];

  stageCode:
    "ACTIVATION_FAILED" |
    "FINALIZATION_FAILED";

  phase:
    string;
}): void {
  if (
    input.expected.length !==
    input.actual.length
  ) {
    throw new MediaSyncWorkerOrchestrationError(
      input.stageCode,
      `The report fanout target set changed ${input.phase}.`,
    );
  }

  for (
    let index = 0;
    index <
      input.expected.length;
    index += 1
  ) {
    const expected =
      input.expected[index];

    const actual =
      input.actual[index];

    if (
      !expected ||
      !actual ||
      expected.reportId !==
        actual.reportId ||
      expected.primary !==
        actual.primary
    ) {
      throw new MediaSyncWorkerOrchestrationError(
        input.stageCode,
        `The report fanout target set changed ${input.phase}.`,
      );
    }
  }
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

function shouldLogAuthoritativeCollectorProgress(
  event:
    NaverAuthoritativeEntityStatsCollectorProgressEvent,
): boolean {
  if (
    event.stage !==
      "entity_stats:start" &&
    event.stage !==
      "entity_stats:done"
  ) {
    return true;
  }

  const completed =
    event.entitiesCompletedInRun;

  if (completed <= 1) {
    return true;
  }

  return completed % 25 === 0;
}

function formatAuthoritativeCollectorProgressDetail(
  event:
    NaverAuthoritativeEntityStatsCollectorProgressEvent,
): string {
  const parts:
    string[] = [
      `campaignPages=${event.campaignPagesRead}`,
      `campaigns=${event.campaignsRead}`,
      `adgroupPages=${event.adgroupPagesRead}`,
      `adgroups=${event.adgroupsRead}`,
      `entityPages=${event.entityPagesRead}`,
      `discovered=${event.entitiesDiscoveredInRun}`,
      `completed=${event.entitiesCompletedInRun}`,
      `statsAttempts=${event.statsRequestsAttempted}`,
      `statsSuccess=${event.statsRequestsSucceeded}`,
  ];

  if (event.campaignId) {
    parts.push(
      `campaign=${event.campaignId}`,
    );
  }

  if (event.adgroupId) {
    parts.push(
      `adgroup=${event.adgroupId}`,
    );
  }

  if (event.entityId) {
    parts.push(
      `entity=${event.entityId}`,
    );
  }

  if (event.authoritativeGrain) {
    parts.push(
      `grain=${event.authoritativeGrain}`,
    );
  }

  if (event.pageNumber !== null) {
    parts.push(
      `page=${event.pageNumber}`,
    );
  }

  if (event.recordsRead !== null) {
    parts.push(
      `records=${event.recordsRead}`,
    );
  }

  if (event.attemptCount !== null) {
    parts.push(
      `attempts=${event.attemptCount}`,
    );
  }

  if (event.delayMs !== null) {
    parts.push(
      `delayMs=${event.delayMs}`,
    );
  }

  if (event.retryCount > 0) {
    parts.push(
      `retries=${event.retryCount}`,
    );
  }

  return parts.join(
    " ",
  );
}

function logAuthoritativeCollectorProgress(input: {
  job:
    MediaSyncJobRecord;
  event:
    NaverAuthoritativeEntityStatsCollectorProgressEvent;
}): void {
  if (
    !shouldLogAuthoritativeCollectorProgress(
      input.event,
    )
  ) {
    return;
  }

  logStage({
    job:
      input.job,
    stage:
      `authoritative:${input.event.stage}`,
    detail:
      formatAuthoritativeCollectorProgressDetail(
        input.event,
      ),
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

function resolveOrchestrationDependencies(
  overrides:
    Partial<MediaSyncWorkerOrchestrationDependencies> |
    undefined,
): ResolvedMediaSyncWorkerOrchestrationDependencies {
  return {
    loadContext:
      overrides?.loadContext ??
      loadNaverMediaSyncWorkerContext,

    runKeywordStaging:
      overrides?.runKeywordStaging ??
      runNaverSearchAdsStagingOrchestrator,

    runAuthoritativeStaging:
      overrides?.runAuthoritativeStaging ??
      runNaverSearchAdsAuthoritativeEntityStagingOrchestrator,

    saveCombinedCheckpoint:
      overrides?.saveCombinedCheckpoint ??
      saveNaverSearchAdsCombinedProcessingCheckpoint,

    releaseForResume:
      overrides?.releaseForResume ??
      releaseNaverMediaSyncJobForResume,

    reconcileStaging:
      overrides?.reconcileStaging ??
      reconcileNaverSearchAdsBrandSearchCrossGrainStaging,

    assertStagingComplete:
      overrides?.assertStagingComplete ??
      assertNaverSearchAdsCombinedStagingComplete,

    loadFanoutTargets:
      overrides?.loadFanoutTargets ??
      loadMediaSyncReportFanoutTargets,

    loadProjectionAuthority:
      overrides?.loadProjectionAuthority ??
      loadMediaSyncReportProjectionAuthority,

    materialize:
      overrides?.materialize ??
      materializeMediaSyncSnapshot,

    activate:
      overrides?.activate ??
      activateMediaSyncSnapshot,

    finalize:
      overrides?.finalize ??
      finalizeMediaSyncJob,
  };
}

function createEmptyCombinedBuffer(
  maxBatchSize = 0,
): MediaCanonicalRowBatchBufferState {
  return {
    maxBatchSize,
    pendingRowCount:
      0,
    acceptedRowCount:
      0,
    flushedBatchCount:
      0,
    flushedRowCount:
      0,
    busy:
      false,
  };
}

function combineBufferStates(
  states:
    readonly (
      MediaCanonicalRowBatchBufferState |
      null
    )[],
): MediaCanonicalRowBatchBufferState {
  const available =
    states.filter(
      (
        state,
      ): state is MediaCanonicalRowBatchBufferState =>
        state !== null,
    );

  if (
    available.length ===
    0
  ) {
    return createEmptyCombinedBuffer();
  }

  return {
    maxBatchSize:
      Math.max(
        ...available.map(
          (
            state,
          ) =>
            state.maxBatchSize,
        ),
      ),

    pendingRowCount:
      available.reduce(
        (
          total,
          state,
        ) =>
          total +
          state.pendingRowCount,
        0,
      ),

    acceptedRowCount:
      available.reduce(
        (
          total,
          state,
        ) =>
          total +
          state.acceptedRowCount,
        0,
      ),

    flushedBatchCount:
      available.reduce(
        (
          total,
          state,
        ) =>
          total +
          state.flushedBatchCount,
        0,
      ),

    flushedRowCount:
      available.reduce(
        (
          total,
          state,
        ) =>
          total +
          state.flushedRowCount,
        0,
      ),

    busy:
      available.some(
        (
          state,
        ) =>
          state.busy,
      ),
  };
}

function createEmptyCombinedAppend():
  NaverSearchAdsWorkerCombinedAppendTotals {
  return {
    flushCount:
      0,
    submittedRows:
      0,
    insertedRows:
      0,
    duplicateRows:
      0,
    maximumBatchSize:
      0,
    firstRowIndex:
      null,
    lastRowIndex:
      null,
  };
}

function combineAppendTotals(
  values:
    readonly (
      NaverSearchAdsWorkerCombinedAppendTotals |
      null
    )[],
): NaverSearchAdsWorkerCombinedAppendTotals {
  const result =
    createEmptyCombinedAppend();

  for (
    const value
    of values
  ) {
    if (!value) {
      continue;
    }

    result.flushCount +=
      value.flushCount;

    result.submittedRows +=
      value.submittedRows;

    result.insertedRows +=
      value.insertedRows;

    result.duplicateRows +=
      value.duplicateRows;

    result.maximumBatchSize =
      Math.max(
        result.maximumBatchSize,
        value.maximumBatchSize,
      );

    if (
      result.firstRowIndex ===
        null &&
      value.firstRowIndex !==
        null
    ) {
      result.firstRowIndex =
        value.firstRowIndex;
    }

    if (
      value.lastRowIndex !==
      null
    ) {
      result.lastRowIndex =
        value.lastRowIndex;
    }
  }

  return result;
}

function createCombinedStagingResult(input: {
  jobId:
    string;

  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;

  status:
    "partial" |
    "completed";

  partialReason:
    string | null;

  phaseOverride?:
    NaverSearchAdsWorkerPhase;

  keyword:
    NaverSearchAdsStagingOrchestratorCompletedResult |
    NaverSearchAdsStagingOrchestratorPartialResult |
    null;

  authoritative:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult |
    null;

  summary?:
    MediaSyncStagingSummary;
}): NaverSearchAdsWorkerCombinedStagingResult {
  const runCanonicalRowCount =
    (
      input.keyword
        ?.runCanonicalRowCount ??
      0
    ) +
    (
      input.authoritative
        ?.runCanonicalRowCount ??
      0
    );

  const callbackCount =
    (
      input.keyword
        ?.callbackCount ??
      0
    ) +
    (
      input.authoritative
        ?.callbackCount ??
      0
    );

  const buffer =
    combineBufferStates([
      input.keyword
        ?.buffer ??
        null,
      input.authoritative
        ?.buffer ??
        null,
    ]);

  const append =
    combineAppendTotals([
      input.keyword
        ?.append ??
        null,
      input.authoritative
        ?.append ??
        null,
    ]);

  if (
    input.status ===
    "completed"
  ) {
    if (
      !input.summary ||
      !input.summary.isComplete ||
      input.summary.totalRows !==
        input.checkpoint.totalRows
    ) {
      throw new MediaSyncWorkerOrchestrationError(
        "STAGING_FAILED",
        "The completed combined staging result requires an exact complete summary.",
      );
    }

    return {
      status:
        "completed",
      isComplete:
        true,
      phase:
        "completed",
      jobId:
        input.jobId,
      dateWindowIndex:
        input.checkpoint.dateWindowIndex,
      canonicalRowCount:
        input.checkpoint.totalRows,
      runCanonicalRowCount,
      callbackCount,
      collector: {
        phase:
          "completed",
        partialReason:
          null,
        keyword:
          input.keyword?.collector ??
          null,
        authoritative:
          input.authoritative
            ?.collector ??
          null,
      },
      buffer,
      append,
      summary:
        input.summary,
      keyword:
        input.keyword,
      authoritative:
        input.authoritative,
    };
  }

  return {
    status:
      "partial",
    isComplete:
      false,
    phase:
      input.phaseOverride ??
      input.checkpoint.phase,
    jobId:
      input.jobId,
    dateWindowIndex:
      input.checkpoint.dateWindowIndex,
    canonicalRowCount:
      input.checkpoint.totalRows,
    runCanonicalRowCount,
    callbackCount,
    collector: {
      phase:
        input.phaseOverride ??
        input.checkpoint.phase,
      partialReason:
        input.partialReason,
      keyword:
        input.keyword?.collector ??
        null,
      authoritative:
        input.authoritative
          ?.collector ??
        null,
    },
    buffer,
    append,
    summary: {
      isComplete:
        false,
      totalRows:
        input.checkpoint.totalRows,
      expectedRows:
        input.checkpoint.totalRows,
      insertedRows:
        input.checkpoint.totalRows,
      duplicateRows:
        append.duplicateRows,
    },
    keyword:
      input.keyword,
    authoritative:
      input.authoritative,
  };
}

async function releaseCombinedPartial(input: {
  job:
    MediaSyncJobRecord;

  checkpointJob:
    MediaSyncJobRecord;

  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;

  partialReason:
    string;

  resultPhase?:
    ProcessNaverMediaSyncJobPartialResult["phase"];

  keyword:
    NaverSearchAdsStagingOrchestratorCompletedResult |
    NaverSearchAdsStagingOrchestratorPartialResult |
    null;

  authoritative:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult |
    null;

  dependencies:
    MediaSyncWorkerOrchestrationDependencies;
}): Promise<
  ProcessNaverMediaSyncJobPartialResult
> {
  let releasedJob:
    MediaSyncJobRecord;

  try {
    logStage({
      job:
        input.checkpointJob,
      stage:
        "resume-release:start",
      detail:
        `phase=${input.resultPhase ?? input.checkpoint.phase} rows=${input.checkpoint.totalRows}`,
    });

    releasedJob =
      await input.dependencies
        .releaseForResume(
          input.checkpointJob,
        );
  } catch (error) {
    throw wrapStageError(
      "JOB_RELEASE_FAILED",
      "The partial Naver media sync job could not be released for resume.",
      error,
    );
  }

  const staging =
    createCombinedStagingResult({
      jobId:
        input.checkpointJob.id,
      checkpoint:
        input.checkpoint,
      status:
        "partial",
      partialReason:
        input.partialReason,
      phaseOverride:
        input.resultPhase,
      keyword:
        input.keyword,
      authoritative:
        input.authoritative,
    }) as ProcessNaverMediaSyncJobPartialResult["staging"];

  logStage({
    job:
      releasedJob,
    stage:
      "resume-release:done",
    detail:
      `phase=${input.resultPhase ?? input.checkpoint.phase} rows=${input.checkpoint.totalRows} reason=${input.partialReason}`,
  });

  return {
    status:
      "partial",
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
    phase:
      input.resultPhase ??
      (
        input.checkpoint.phase ===
        "keyword"
          ? "keyword"
          : "authoritative"
      ),
    partialReason:
      input.partialReason,
    checkpointRows:
      input.checkpoint.totalRows,
    staging,
    checkpointJob:
      input.checkpointJob,
    releasedJob,
    snapshotIngestionId:
      null,
    expectedRows:
      input.checkpoint.totalRows,
  };
}

/**
 * 이미 processing으로 점유된 Naver media_sync_job 1개를 처리한다.
 *
 * staging phase:
 * 1) WEB_SITE keyword
 * 2) SHOPPING / BRAND_SEARCH authoritative entity
 *
 * 두 phase가 모두 completed이고 combined staging summary가 정확할 때만
 * materialization → activation → finalization을 실행한다.
 */
export async function processClaimedNaverMediaSyncJob(
  job:
    MediaSyncJobRecord,
  options:
    ProcessNaverMediaSyncJobOptions = {},
): Promise<
  ProcessNaverMediaSyncJobResult
> {
  validateProcessingNaverJob(
    job,
  );

  const dependencies =
    resolveOrchestrationDependencies(
      options.orchestrationDependencies,
    );

  logStage({
    job,
    stage:
      "claimed",
  });

  let context;

  try {
    logStage({
      job,
      stage:
        "context:start",
    });

    context =
      await dependencies.loadContext(
        job,
      );
  } catch (error) {
    throw wrapStageError(
      "CONTEXT_FAILED",
      "The Naver media sync worker context could not be loaded.",
      error,
    );
  }

  logStage({
    job:
      context.job,
    stage:
      "context:done",
  });

  let checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;

  try {
    checkpoint =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        context.job,
      );
  } catch (error) {
    throw wrapStageError(
      "CHECKPOINT_FAILED",
      "The Naver combined processing checkpoint could not be read.",
      error,
    );
  }

  let checkpointJob =
    context.job;

  let keyword:
    NaverSearchAdsStagingOrchestratorCompletedResult |
    NaverSearchAdsStagingOrchestratorPartialResult |
    null =
      null;

  let authoritative:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult |
    null =
      null;

  if (
    checkpoint.phase ===
    "keyword"
  ) {
    try {
      logStage({
        job:
          checkpointJob,
        stage:
          "staging:keyword:start",
        detail:
          `rows=${checkpoint.totalRows}`,
      });

      keyword =
        await dependencies.runKeywordStaging({
          job:
            checkpointJob,
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
          maxKeywordStatsPerRun:
            options.maxKeywordStatsPerRun,
          maxStatsRequestsPerRun:
            options.maxStatsRequestsPerRun,
          maxKeywordDiscoveryPagesPerRun:
            options.maxKeywordDiscoveryPagesPerRun,
          signal:
            options.signal,
          onRetry:
            options.onRetry,
          onCollectorProgress:
            async (
              event:
                NaverKeywordStatsCollectorProgressEvent,
            ): Promise<void> => {
              logCollectorProgress({
                job:
                  checkpointJob,
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
          "The Naver keyword staging phase failed.",
          error,
        );
      }

      throw wrapStageError(
        "STAGING_FAILED",
        "The Naver keyword staging phase failed unexpectedly.",
        error,
      );
    }

    checkpoint =
      createCombinedCheckpointFromKeywordResult({
        job:
          checkpointJob,
        previous:
          checkpoint,
        result:
          keyword,
      });

    try {
      checkpointJob =
        await dependencies
          .saveCombinedCheckpoint(
            {
              job:
                checkpointJob,
              checkpoint,
            },
            options.combinedCheckpointDependencies,
          );
    } catch (error) {
      if (
        error instanceof
        MediaSyncCombinedProcessingCheckpointError
      ) {
        throw wrapStageError(
          "CHECKPOINT_FAILED",
          "The Naver keyword combined checkpoint could not be saved.",
          error,
        );
      }

      throw wrapStageError(
        "CHECKPOINT_FAILED",
        "The Naver keyword combined checkpoint failed unexpectedly.",
        error,
      );
    }

    logStage({
      job:
        checkpointJob,
      stage:
        keyword.status ===
        "partial"
          ? "staging:keyword:partial"
          : "staging:keyword:done",
      detail:
        `rows=${checkpoint.totalRows} runRows=${keyword.runCanonicalRowCount}`,
    });

    if (
      keyword.status ===
      "partial"
    ) {
      return releaseCombinedPartial({
        job:
          context.job,
        checkpointJob,
        checkpoint,
        partialReason:
          keyword.collector
            .partialReason ??
          "keyword_partial",
        keyword,
        authoritative:
          null,
        dependencies,
      });
    }
  }

  if (
    checkpoint.phase ===
    "authoritative"
  ) {
    try {
      logStage({
        job:
          checkpointJob,
        stage:
          "staging:authoritative:start",
        detail:
          `rowStart=${checkpoint.nextRowIndex}`,
      });

      authoritative =
        await dependencies
          .runAuthoritativeStaging({
            job:
              checkpointJob,
            credentials:
              context.credentials,
            rowStartIndex:
              checkpoint.nextRowIndex,
            dateWindowIndex:
              checkpoint.dateWindowIndex,
            cursor:
              checkpoint.authoritative
                .cursor ??
              undefined,
            stagingBatchSize:
              options.stagingBatchSize,
            requestIntervalMs:
              options.requestIntervalMs,
            maxRetryCount:
              options.maxRetryCount,
            maxEntityStatsPerRun:
              options.maxAuthoritativeEntityStatsPerRun,
            maxStatsRequestsPerRun:
              options.maxAuthoritativeStatsRequestsPerRun ??
              options.maxStatsRequestsPerRun,
            maxDiscoveryPagesPerRun:
              options.maxAuthoritativeDiscoveryPagesPerRun,
            signal:
              options.signal,
            onRetry:
              options.onAuthoritativeRetry,
            onCollectorProgress:
              async (
                event:
                  NaverAuthoritativeEntityStatsCollectorProgressEvent,
              ): Promise<void> => {
                logAuthoritativeCollectorProgress({
                  job:
                    checkpointJob,
                  event,
                });
              },
            collectorDependencies:
              options.authoritativeDependencies,
            stagingRepositoryDependencies:
              options.authoritativeStagingRepositoryDependencies,
          });
    } catch (error) {
      if (
        error instanceof
        NaverSearchAdsAuthoritativeEntityStagingOrchestratorError
      ) {
        throw wrapStageError(
          "STAGING_FAILED",
          "The Naver authoritative staging phase failed.",
          error,
        );
      }

      throw wrapStageError(
        "STAGING_FAILED",
        "The Naver authoritative staging phase failed unexpectedly.",
        error,
      );
    }

    checkpoint =
      createCombinedCheckpointFromAuthoritativeResult({
        job:
          checkpointJob,
        previous:
          checkpoint,
        result:
          authoritative,
      });

    try {
      checkpointJob =
        await dependencies
          .saveCombinedCheckpoint(
            {
              job:
                checkpointJob,
              checkpoint,
            },
            options.combinedCheckpointDependencies,
          );
    } catch (error) {
      if (
        error instanceof
        MediaSyncCombinedProcessingCheckpointError
      ) {
        throw wrapStageError(
          "CHECKPOINT_FAILED",
          "The Naver authoritative combined checkpoint could not be saved.",
          error,
        );
      }

      throw wrapStageError(
        "CHECKPOINT_FAILED",
        "The Naver authoritative combined checkpoint failed unexpectedly.",
        error,
      );
    }

    logStage({
      job:
        checkpointJob,
      stage:
        authoritative.status ===
        "partial"
          ? "staging:authoritative:partial"
          : "staging:authoritative:done",
      detail:
        `rows=${checkpoint.totalRows} runRows=${authoritative.runCanonicalRowCount}`,
    });

    if (
      authoritative.status ===
      "partial"
    ) {
      return releaseCombinedPartial({
        job:
          context.job,
        checkpointJob,
        checkpoint,
        partialReason:
          authoritative.collector
            .partialReason ??
          "authoritative_partial",
        keyword,
        authoritative,
        dependencies,
      });
    }
  }

  if (
    checkpoint.phase !==
      "completed"
  ) {
    throw new MediaSyncWorkerOrchestrationError(
      "CHECKPOINT_FAILED",
      "The combined staging phases ended without a completed checkpoint.",
    );
  }

  let reconciliation:
    NaverSearchAdsBrandSearchCrossGrainReconciliationCompletedResult;

  try {
    logStage({
      job:
        checkpointJob,
      stage:
        "staging:reconciliation:start",
      detail:
        `rows=${checkpoint.totalRows}`,
    });

    const reconciliationAttempt =
      await dependencies
        .reconcileStaging(
          {
            job:
              checkpointJob,
            expectedRows:
              checkpoint.totalRows,
            batchSize:
              options.reconciliationBatchSize,
          },
          options.reconciliationDependencies,
        );

    checkpointJob =
      reconciliationAttempt.job;

    checkpoint =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        checkpointJob,
      );

    if (
      isNaverSearchAdsBrandSearchCrossGrainReconciliationPartialResult(
        reconciliationAttempt,
      )
    ) {
      logStage({
        job:
          checkpointJob,
        stage:
          "staging:reconciliation:partial",
        detail:
          `phase=${reconciliationAttempt.progress.phase} cursor=${reconciliationAttempt.progress.cursor} validatedRows=${reconciliationAttempt.progress.validatedRows} sourceRows=${reconciliationAttempt.sourceRows} retainedRows=${reconciliationAttempt.retainedRows}`,
      });

      return releaseCombinedPartial({
        job:
          context.job,
        checkpointJob,
        checkpoint,
        resultPhase:
          "reconciliation",
        partialReason:
          `reconciliation_${reconciliationAttempt.progress.phase}`,
        keyword,
        authoritative,
        dependencies,
      });
    }

    reconciliation =
      reconciliationAttempt;

    if (
      checkpoint.phase !== "completed" ||
      checkpoint.totalRows !==
        reconciliation.retainedRows ||
      checkpoint.nextRowIndex !==
        reconciliation.retainedRows
    ) {
      throw new MediaSyncWorkerOrchestrationError(
        "RECONCILIATION_FAILED",
        "The reconciled Naver checkpoint does not match the retained staging rows.",
      );
    }
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsBrandSearchCrossGrainReconciliationError ||
      error instanceof
      MediaSyncCombinedProcessingCheckpointError ||
      error instanceof
      MediaSyncWorkerOrchestrationError
    ) {
      throw wrapStageError(
        "RECONCILIATION_FAILED",
        "The Naver BRAND_SEARCH cross-grain staging reconciliation failed.",
        error,
      );
    }

    throw wrapStageError(
      "RECONCILIATION_FAILED",
      "The Naver BRAND_SEARCH cross-grain staging reconciliation failed unexpectedly.",
      error,
    );
  }

  logStage({
    job:
      checkpointJob,
    stage:
      "staging:reconciliation:done",
    detail:
      `sourceRows=${reconciliation.sourceRows} excludedRows=${reconciliation.excludedRows} retainedRows=${reconciliation.retainedRows} changed=${reconciliation.changed} alreadyReconciled=${reconciliation.alreadyReconciled}`,
  });

  let summary:
    MediaSyncStagingSummary;

  try {
    logStage({
      job:
        checkpointJob,
      stage:
        "staging:combined-summary:start",
      detail:
        `rows=${checkpoint.totalRows}`,
    });

    summary =
      await dependencies
        .assertStagingComplete({
          job:
            checkpointJob,
          expectedRows:
            checkpoint.totalRows,
        });
  } catch (error) {
    if (
      error instanceof
      MediaSyncStagingSummaryError
    ) {
      throw wrapStageError(
        "STAGING_FAILED",
        "The combined Naver staging rows are incomplete.",
        error,
      );
    }

    throw wrapStageError(
      "STAGING_FAILED",
      "The combined Naver staging summary failed unexpectedly.",
      error,
    );
  }

  const staging =
    createCombinedStagingResult({
      jobId:
        checkpointJob.id,
      checkpoint,
      status:
        "completed",
      partialReason:
        null,
      keyword,
      authoritative,
      summary,
    }) as ProcessNaverMediaSyncJobCompletedResult["staging"];

  logStage({
    job:
      checkpointJob,
    stage:
      "staging:combined-summary:done",
    detail:
      `rows=${staging.canonicalRowCount}`,
  });

  let fanoutTargets:
    MediaSyncReportFanoutTarget[];

  try {
    logStage({
      job:
        checkpointJob,
      stage:
        "fanout-targets:start",
    });

    fanoutTargets =
      await dependencies
        .loadFanoutTargets(
          checkpointJob,
        );
  } catch (error) {
    if (
      error instanceof
      MediaSyncReportFanoutError
    ) {
      throw wrapStageError(
        "MATERIALIZATION_FAILED",
        "The Naver media sync report fanout targets could not be loaded.",
        error,
      );
    }

    throw wrapStageError(
      "MATERIALIZATION_FAILED",
      "The Naver media sync report fanout target lookup failed unexpectedly.",
      error,
    );
  }

  logStage({
    job:
      checkpointJob,
    stage:
      "fanout-targets:done",
    detail:
      `reports=${fanoutTargets.length}`,
  });

  let fanoutJob =
    checkpointJob;

  const materializedFanout:
    {
      target:
        MediaSyncReportFanoutTarget;

      materialization:
        MediaSyncSnapshotMaterializationResult;
    }[] =
      [];

  for (
    const target
    of fanoutTargets
  ) {
    let targetMaterialization:
      MediaSyncSnapshotMaterializationResult;

    try {
      logStage({
        job:
          fanoutJob,
        stage:
          "materialization:start",
        detail:
          `targetReport=${target.reportId} primary=${target.primary}`,
      });

      targetMaterialization =
        await dependencies.materialize({
          job:
            fanoutJob,
          summary:
            staging.summary,
          targetReportId:
            target.reportId,
          batchSize:
            options.materializationBatchSize,
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

    fanoutJob =
      targetMaterialization.job;

    materializedFanout.push({
      target,
      materialization:
        targetMaterialization,
    });

    logStage({
      job:
        targetMaterialization.job,
      stage:
        "materialization:done",
      detail:
        `targetReport=${target.reportId} primary=${target.primary} rows=${targetMaterialization.rowCount} batchSize=${
          options.materializationBatchSize ??
          2_000
        }`,
    });
  }

  const primaryMaterializationEntry =
    materializedFanout.find(
      (
        entry,
      ) =>
        entry.target.primary,
    );

  if (!primaryMaterializationEntry) {
    throw new MediaSyncWorkerOrchestrationError(
      "MATERIALIZATION_FAILED",
      "The primary report projection was not materialized.",
    );
  }

  const materialization =
    primaryMaterializationEntry
      .materialization;

  let preActivationTargets:
    MediaSyncReportFanoutTarget[];

  try {
    preActivationTargets =
      await dependencies
        .loadFanoutTargets(
          fanoutJob,
        );
  } catch (error) {
    if (
      error instanceof
      MediaSyncReportFanoutError
    ) {
      throw wrapStageError(
        "ACTIVATION_FAILED",
        "The report fanout targets could not be revalidated before activation.",
        error,
      );
    }

    throw wrapStageError(
      "ACTIVATION_FAILED",
      "The report fanout target revalidation failed unexpectedly before activation.",
      error,
    );
  }

  assertFanoutTargetsUnchanged({
    expected:
      fanoutTargets,
    actual:
      preActivationTargets,
    stageCode:
      "ACTIVATION_FAILED",
    phase:
      "before activation",
  });

  const projectionAuthorityByReportId =
    new Map<
      string,
      MediaSyncReportProjectionAuthority
    >();

  for (
    const entry
    of materializedFanout
  ) {
    let projectionAuthority:
      MediaSyncReportProjectionAuthority;

    try {
      projectionAuthority =
        await dependencies
          .loadProjectionAuthority({
            job:
              fanoutJob,
            reportId:
              entry.target.reportId,
            snapshotIngestionId:
              entry.materialization
                .snapshotIngestionId,
          });
    } catch (error) {
      if (
        error instanceof
        MediaSyncReportFanoutError
      ) {
        throw wrapStageError(
          "ACTIVATION_FAILED",
          "The materialized report projection authority could not be loaded.",
          error,
        );
      }

      throw wrapStageError(
        "ACTIVATION_FAILED",
        "The report projection authority lookup failed unexpectedly.",
        error,
      );
    }

    projectionAuthorityByReportId.set(
      entry.target.reportId,
      projectionAuthority,
    );
  }

  const activationOrder = [
    ...materializedFanout.filter(
      (
        entry,
      ) =>
        !entry.target.primary,
    ),
    primaryMaterializationEntry,
  ];

  const activationByReportId =
    new Map<
      string,
      MediaSyncSnapshotActivationResult
    >();

  for (
    const entry
    of activationOrder
  ) {
    const projectionAuthority =
      projectionAuthorityByReportId.get(
        entry.target.reportId,
      );

    if (!projectionAuthority) {
      throw new MediaSyncWorkerOrchestrationError(
        "ACTIVATION_FAILED",
        "The exact report projection authority is missing before activation.",
      );
    }

    let targetActivation:
      MediaSyncSnapshotActivationResult;

    try {
      logStage({
        job:
          fanoutJob,
        stage:
          "activation:start",
        detail:
          `targetReport=${entry.target.reportId} primary=${entry.target.primary}`,
      });

      targetActivation =
        await dependencies.activate({
          job:
            fanoutJob,
          expectedRows:
            entry.materialization
              .rowCount,
          projection:
            projectionAuthority,
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

    fanoutJob =
      targetActivation.job;

    activationByReportId.set(
      entry.target.reportId,
      targetActivation,
    );

    logStage({
      job:
        targetActivation.job,
      stage:
        "activation:done",
      detail:
        `targetReport=${entry.target.reportId} primary=${entry.target.primary} rows=${targetActivation.rowCount}`,
    });
  }

  const activation =
    activationByReportId.get(
      primaryMaterializationEntry
        .target.reportId,
    );

  if (!activation) {
    throw new MediaSyncWorkerOrchestrationError(
      "ACTIVATION_FAILED",
      "The primary report projection was not activated.",
    );
  }

  let preFinalizationTargets:
    MediaSyncReportFanoutTarget[];

  try {
    preFinalizationTargets =
      await dependencies
        .loadFanoutTargets(
          activation.job,
        );
  } catch (error) {
    if (
      error instanceof
      MediaSyncReportFanoutError
    ) {
      throw wrapStageError(
        "FINALIZATION_FAILED",
        "The report fanout targets could not be revalidated before execution finalization.",
        error,
      );
    }

    throw wrapStageError(
      "FINALIZATION_FAILED",
      "The report fanout target revalidation failed unexpectedly before execution finalization.",
      error,
    );
  }

  assertFanoutTargetsUnchanged({
    expected:
      fanoutTargets,
    actual:
      preFinalizationTargets,
    stageCode:
      "FINALIZATION_FAILED",
    phase:
      "before execution finalization",
  });

  const fanout =
    materializedFanout.map(
      (
        entry,
      ): MediaSyncReportFanoutProjectionResult => {
        const targetActivation =
          activationByReportId.get(
            entry.target.reportId,
          );

        if (!targetActivation) {
          throw new MediaSyncWorkerOrchestrationError(
            "FINALIZATION_FAILED",
            "A materialized report projection is missing its activation result.",
          );
        }

        return {
          reportId:
            entry.target.reportId,
          primary:
            entry.target.primary,
          materialization:
            entry.materialization,
          activation:
            targetActivation,
        };
      },
    );

  let finalization:
    MediaSyncFinalizationResult;

  try {
    logStage({
      job:
        activation.job,
      stage:
        "finalization:start",
      detail:
        `fanoutReports=${fanout.length}`,
    });

    finalization =
      await dependencies.finalize({
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
    job:
      finalization.job,
    stage:
      "finalization:done",
    detail:
      `snapshot=${finalization.snapshotIngestionId} rows=${finalization.rowCount} fanoutReports=${fanout.length}`,
  });

  return {
    status:
      "completed",
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
    reconciliation,
    staging,
    checkpointJob,
    materialization,
    activation,
    fanout,
    finalization,
    snapshotIngestionId:
      finalization.snapshotIngestionId,
    expectedRows:
      finalization.rowCount,
  };
}

/**
 * pending Naver media_sync_job 1개를 processing으로 점유하고
 * orchestration을 1회 실행한다.
 *
 * partial이면 job은 failed가 아니라 pending으로 복귀한다.
 * completed이면 기존대로 snapshot activation/finalization까지 완료한다.
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
    logSafeFailureContext({
      job:
        claimedJob,
      label:
        "processing_failure",
      error,
    });

    try {
      await markProcessingMediaSyncJobFailed({
        job:
          claimedJob,
        error,
      });
    } catch (markFailedError) {
      logSafeFailureContext({
        job:
          claimedJob,
        label:
          "mark_failed_failure",
        error:
          markFailedError,
      });
    }

    throw error;
  }
}

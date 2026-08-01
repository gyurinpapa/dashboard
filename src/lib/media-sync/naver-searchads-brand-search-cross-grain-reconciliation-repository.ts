import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import {
  readNaverSearchAdsCombinedProcessingCheckpoint,
  type NaverSearchAdsCombinedProcessingCheckpoint,
} from "./media-sync-combined-processing-checkpoint-repository";
import type {
  MediaSyncJobRecord,
} from "./types";

const RECONCILE_NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_STAGING_RPC =
  "reconcile_naver_searchads_brand_search_cross_grain_staging";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const DEFAULT_RECONCILIATION_BATCH_SIZE =
  5_000;

const MIN_RECONCILIATION_BATCH_SIZE =
  100;

const MAX_RECONCILIATION_BATCH_SIZE =
  10_000;

export const NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_KIND =
  "brand_search_cross_grain_dedup_v1" as const;

export const NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_VERSION =
  1 as const;

export type NaverSearchAdsBrandSearchCrossGrainReconciliationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "CHECKPOINT_NOT_COMPLETED"
  | "RECONCILIATION_CONFLICT"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class NaverSearchAdsBrandSearchCrossGrainReconciliationError
  extends Error {
  readonly code:
    NaverSearchAdsBrandSearchCrossGrainReconciliationErrorCode;

  constructor(
    code:
      NaverSearchAdsBrandSearchCrossGrainReconciliationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsBrandSearchCrossGrainReconciliationError";

    this.code =
      code;
  }
}

export type NaverSearchAdsBrandSearchCrossGrainReconciliationMetrics = {
  kind:
    typeof NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_KIND;

  version:
    typeof NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_VERSION;

  changed: boolean;
  alreadyReconciled: boolean;

  sourceRows: number;
  excludedRows: number;
  retainedRows: number;

  mixedCampaignCount: number;
  matchedCampaignCount: number;
  remainingOverlapRows: number;

  excludedImpressions: number;
  excludedClicks: number;
  excludedCost: number;
  excludedConversions: number;
  excludedRevenue: number;
};

export type NaverSearchAdsBrandSearchCrossGrainReconciliationPhase =
  | "source_validation"
  | "mutation"
  | "retained_validation"
  | "finalization";

export type NaverSearchAdsBrandSearchCrossGrainReconciliationProgress = {
  phase:
    NaverSearchAdsBrandSearchCrossGrainReconciliationPhase;
  sourceRows: number;
  excludedRows: number;
  retainedRows: number;
  cursor: number;
  validatedRows: number;
  batchSize: number;
};

export type NaverSearchAdsBrandSearchCrossGrainReconciliationCompletedResult =
  NaverSearchAdsBrandSearchCrossGrainReconciliationMetrics & {
    job: MediaSyncJobRecord;
    checkpoint:
      NaverSearchAdsCombinedProcessingCheckpoint;
  };

export type NaverSearchAdsBrandSearchCrossGrainReconciliationPartialResult =
  NaverSearchAdsBrandSearchCrossGrainReconciliationCompletedResult & {
    progress:
      NaverSearchAdsBrandSearchCrossGrainReconciliationProgress;
  };

export type NaverSearchAdsBrandSearchCrossGrainReconciliationResult =
  | NaverSearchAdsBrandSearchCrossGrainReconciliationCompletedResult
  | NaverSearchAdsBrandSearchCrossGrainReconciliationPartialResult;

export function isNaverSearchAdsBrandSearchCrossGrainReconciliationPartialResult(
  result:
    NaverSearchAdsBrandSearchCrossGrainReconciliationResult,
): result is NaverSearchAdsBrandSearchCrossGrainReconciliationPartialResult {
  return "progress" in result;
}

export type ReconcileNaverSearchAdsBrandSearchCrossGrainStagingInput = {
  job: MediaSyncJobRecord;
  expectedRows: number;
  batchSize?: number;
};

export type NaverSearchAdsBrandSearchCrossGrainReconciliationRpcResult = {
  data: unknown;
  error: unknown;
};

export type NaverSearchAdsBrandSearchCrossGrainReconciliationRpcInvoker = (
  functionName: string,
  args: {
    p_payload: unknown;
  },
) => Promise<
  NaverSearchAdsBrandSearchCrossGrainReconciliationRpcResult
>;

export type NaverSearchAdsBrandSearchCrossGrainReconciliationDependencies = {
  invokeRpc?:
    NaverSearchAdsBrandSearchCrossGrainReconciliationRpcInvoker;
};

type UnknownRecord =
  Record<string, unknown>;

type ReconciliationRpcRecord = {
  job: unknown;
  reconciliation_kind: unknown;
  reconciliation_version: unknown;
  changed: unknown;
  already_reconciled: unknown;
  source_rows: unknown;
  excluded_rows: unknown;
  retained_rows: unknown;
  mixed_campaign_count: unknown;
  matched_campaign_count: unknown;
  remaining_overlap_rows: unknown;
  excluded_impressions: unknown;
  excluded_clicks: unknown;
  excluded_cost: unknown;
  excluded_conversions: unknown;
  excluded_revenue: unknown;
};

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

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_INPUT",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function requireNonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
  errorCode:
    "INVALID_INPUT" |
    "INVALID_DATABASE_RESULT" =
      "INVALID_DATABASE_RESULT",
): number {
  const numericValue =
    typeof value === "string" &&
    value.trim()
      ? Number(value)
      : value;

  if (
    typeof numericValue !== "number" ||
    !Number.isSafeInteger(numericValue) ||
    numericValue < 0
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      errorCode,
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return numericValue;
}

function normalizeReconciliationBatchSize(
  value: unknown,
): number {
  if (
    value === undefined ||
    value === null
  ) {
    return DEFAULT_RECONCILIATION_BATCH_SIZE;
  }

  const numericValue =
    typeof value === "string" &&
    value.trim()
      ? Number(value)
      : value;

  if (
    typeof numericValue !== "number" ||
    !Number.isSafeInteger(numericValue) ||
    numericValue < MIN_RECONCILIATION_BATCH_SIZE ||
    numericValue > MAX_RECONCILIATION_BATCH_SIZE
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_INPUT",
      `batchSize must be an integer between ${MIN_RECONCILIATION_BATCH_SIZE} and ${MAX_RECONCILIATION_BATCH_SIZE}.`,
    );
  }

  return numericValue;
}

function requireFiniteNumber(
  value: unknown,
  fieldName: string,
): number {
  const numericValue =
    typeof value === "string" &&
    value.trim()
      ? Number(value)
      : value;

  if (
    typeof numericValue !== "number" ||
    !Number.isFinite(numericValue) ||
    numericValue < 0
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      `${fieldName} must be a finite non-negative number.`,
    );
  }

  return numericValue;
}

function validateJob(
  job: unknown,
): asserts job is MediaSyncJobRecord {
  if (!isPlainObject(job)) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_JOB",
      "A media sync job is required.",
    );
  }

  requireNonEmptyString(
    job.id,
    "job.id",
  );

  requireNonEmptyString(
    job.report_id,
    "job.report_id",
  );

  requireNonEmptyString(
    job.workspace_id,
    "job.workspace_id",
  );

  requireNonEmptyString(
    job.advertiser_id,
    "job.advertiser_id",
  );

  requireNonEmptyString(
    job.connection_id,
    "job.connection_id",
  );

  requireNonEmptyString(
    job.external_account_id,
    "job.external_account_id",
  );

  requireNonEmptyString(
    job.date_from,
    "job.date_from",
  );

  requireNonEmptyString(
    job.date_to,
    "job.date_to",
  );

  if (
    job.provider !==
      NAVER_SEARCH_ADS_PROVIDER
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads staging can be reconciled.",
    );
  }

  if (
    job.status !==
      PROCESSING_STATUS
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing before reconciliation.",
    );
  }

  if (
    job.snapshot_ingestion_id !== null ||
    job.finished_at !== null
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_JOB",
      "A materialized or finished media sync job cannot be reconciled.",
    );
  }
}

function readCompletedCheckpoint(
  job: MediaSyncJobRecord,
): NaverSearchAdsCombinedProcessingCheckpoint {
  let checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;

  try {
    checkpoint =
      readNaverSearchAdsCombinedProcessingCheckpoint(
        job,
      );
  } catch (error) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "CHECKPOINT_NOT_COMPLETED",
      "The Naver combined processing checkpoint could not be read for reconciliation.",
      {
        cause:
          error,
      },
    );
  }

  if (
    checkpoint.phase !== "completed" ||
    !checkpoint.keyword.complete ||
    !checkpoint.authoritative.complete ||
    checkpoint.failedRows !== 0
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "CHECKPOINT_NOT_COMPLETED",
      "Both Naver staging phases must be complete before reconciliation.",
    );
  }

  return checkpoint;
}

function validateInputContract(
  input:
    ReconcileNaverSearchAdsBrandSearchCrossGrainStagingInput,
): {
  job: MediaSyncJobRecord;
  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint;
  expectedRows: number;
  batchSize: number;
} {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_INPUT",
      "Reconciliation input is required.",
    );
  }

  validateJob(
    input.job,
  );

  const expectedRows =
    requireNonNegativeSafeInteger(
      input.expectedRows,
      "expectedRows",
      "INVALID_INPUT",
    );

  const batchSize =
    normalizeReconciliationBatchSize(
      input.batchSize,
    );

  const checkpoint =
    readCompletedCheckpoint(
      input.job,
    );

  if (
    checkpoint.totalRows !== expectedRows ||
    checkpoint.nextRowIndex !== expectedRows ||
    input.job.raw_rows !== expectedRows ||
    input.job.normalized_rows !== expectedRows ||
    input.job.inserted_rows !== expectedRows ||
    input.job.failed_rows !== 0
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_JOB",
      "The completed job counts do not match the reconciliation boundary.",
    );
  }

  return {
    job:
      input.job,
    checkpoint,
    expectedRows,
    batchSize,
  };
}

function mapRpcError(
  error: unknown,
): NaverSearchAdsBrandSearchCrossGrainReconciliationError {
  const message =
    isPlainObject(error) &&
    typeof error.message === "string"
      ? error.message
      : "";

  const create = (
    code:
      NaverSearchAdsBrandSearchCrossGrainReconciliationErrorCode,
    text: string,
  ) =>
    new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      code,
      text,
      {
        cause:
          error,
      },
    );

  if (
    message.includes(
      "NSBGR_INVALID_INPUT",
    )
  ) {
    return create(
      "INVALID_INPUT",
      "The BRAND_SEARCH cross-grain reconciliation input is invalid.",
    );
  }

  if (
    message.includes(
      "NSBGR_INVALID_JOB",
    ) ||
    message.includes(
      "NSBGR_JOB_NOT_FOUND",
    )
  ) {
    return create(
      "INVALID_JOB",
      "The BRAND_SEARCH cross-grain reconciliation job is invalid.",
    );
  }

  if (
    message.includes(
      "NSBGR_JOB_NOT_PROCESSING",
    )
  ) {
    return create(
      "JOB_NOT_PROCESSING",
      "The BRAND_SEARCH cross-grain reconciliation job is not processing.",
    );
  }

  if (
    message.includes(
      "NSBGR_UNSUPPORTED_PROVIDER",
    )
  ) {
    return create(
      "UNSUPPORTED_PROVIDER",
      "The BRAND_SEARCH cross-grain reconciliation provider is unsupported.",
    );
  }

  if (
    message.includes(
      "NSBGR_SCOPE_MISMATCH",
    )
  ) {
    return create(
      "SCOPE_MISMATCH",
      "The BRAND_SEARCH cross-grain reconciliation scope does not match the job.",
    );
  }

  if (
    message.includes(
      "NSBGR_CHECKPOINT_NOT_COMPLETED",
    )
  ) {
    return create(
      "CHECKPOINT_NOT_COMPLETED",
      "The BRAND_SEARCH cross-grain reconciliation checkpoint is not complete.",
    );
  }

  if (
    message.includes(
      "NSBGR_RECONCILIATION_CONFLICT",
    ) ||
    message.includes(
      "NSBGR_STAGING_CHANGED",
    ) ||
    message.includes(
      "NSBGR_POSTCONDITION_FAILED",
    )
  ) {
    return create(
      "RECONCILIATION_CONFLICT",
      "The BRAND_SEARCH cross-grain reconciliation contract conflicted with the persisted staging state.",
    );
  }

  return create(
    "DATABASE_ERROR",
    "The BRAND_SEARCH cross-grain reconciliation RPC failed.",
  );
}

function parseRpcRecord(
  value: unknown,
): ReconciliationRpcRecord {
  if (!isPlainObject(value)) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC row must be an object.",
    );
  }

  return value as ReconciliationRpcRecord;
}

function readReconciliationMetadata(
  job: MediaSyncJobRecord,
): UnknownRecord {
  if (!isPlainObject(job.error_detail)) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciled job has no error_detail object.",
    );
  }

  const processingCheckpoint =
    job.error_detail[
      "processing_checkpoint"
    ];

  if (!isPlainObject(processingCheckpoint)) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciled job has no processing checkpoint object.",
    );
  }

  const reconciliation =
    processingCheckpoint[
      "reconciliation"
    ];

  if (!isPlainObject(reconciliation)) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciled job has no reconciliation audit object.",
    );
  }

  return reconciliation;
}

function readReconciliationWork(
  job: MediaSyncJobRecord,
): UnknownRecord | null {
  if (!isPlainObject(job.error_detail)) {
    return null;
  }

  const processingCheckpoint =
    job.error_detail[
      "processing_checkpoint"
    ];

  if (!isPlainObject(processingCheckpoint)) {
    return null;
  }

  const reconciliationWork =
    processingCheckpoint[
      "reconciliation_work"
    ];

  return isPlainObject(reconciliationWork)
    ? reconciliationWork
    : null;
}

function parseReconciliationProgress(
  job: MediaSyncJobRecord,
): NaverSearchAdsBrandSearchCrossGrainReconciliationProgress | null {
  const work =
    readReconciliationWork(
      job,
    );

  if (!work) {
    return null;
  }

  const phase =
    work.phase;

  if (
    phase !== "source_validation" &&
    phase !== "mutation" &&
    phase !== "retained_validation" &&
    phase !== "finalization"
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC returned an invalid bounded progress phase.",
    );
  }

  const progress:
    NaverSearchAdsBrandSearchCrossGrainReconciliationProgress = {
      phase,
      sourceRows:
        requireNonNegativeSafeInteger(
          work.source_rows,
          "reconciliation_work.source_rows",
        ),
      excludedRows:
        requireNonNegativeSafeInteger(
          work.excluded_rows,
          "reconciliation_work.excluded_rows",
        ),
      retainedRows:
        requireNonNegativeSafeInteger(
          work.retained_rows,
          "reconciliation_work.retained_rows",
        ),
      cursor:
        requireNonNegativeSafeInteger(
          work.cursor,
          "reconciliation_work.cursor",
        ),
      validatedRows:
        requireNonNegativeSafeInteger(
          work.validated_rows,
          "reconciliation_work.validated_rows",
        ),
      batchSize:
        normalizeReconciliationBatchSize(
          work.batch_size,
        ),
    };

  if (
    progress.sourceRows -
      progress.excludedRows !==
        progress.retainedRows ||
    progress.cursor !==
      progress.validatedRows ||
    (
      progress.phase === "source_validation" &&
      progress.cursor >
        progress.sourceRows
    ) ||
    (
      progress.phase === "retained_validation" &&
      progress.cursor >
        progress.retainedRows
    ) ||
    (
      (
        progress.phase === "mutation" ||
        progress.phase === "finalization"
      ) &&
      (
        progress.cursor !== 0 ||
        progress.validatedRows !== 0
      )
    )
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC returned inconsistent bounded progress values.",
    );
  }

  return progress;
}

function parseMetrics(
  record: ReconciliationRpcRecord,
): NaverSearchAdsBrandSearchCrossGrainReconciliationMetrics {
  if (
    record.reconciliation_kind !==
      NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_KIND ||
    record.reconciliation_version !==
      NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_VERSION ||
    typeof record.changed !== "boolean" ||
    typeof record.already_reconciled !== "boolean"
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC returned an invalid contract header.",
    );
  }

  const metrics:
    NaverSearchAdsBrandSearchCrossGrainReconciliationMetrics = {
      kind:
        NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_KIND,
      version:
        NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_RECONCILIATION_VERSION,
      changed:
        record.changed,
      alreadyReconciled:
        record.already_reconciled,
      sourceRows:
        requireNonNegativeSafeInteger(
          record.source_rows,
          "source_rows",
        ),
      excludedRows:
        requireNonNegativeSafeInteger(
          record.excluded_rows,
          "excluded_rows",
        ),
      retainedRows:
        requireNonNegativeSafeInteger(
          record.retained_rows,
          "retained_rows",
        ),
      mixedCampaignCount:
        requireNonNegativeSafeInteger(
          record.mixed_campaign_count,
          "mixed_campaign_count",
        ),
      matchedCampaignCount:
        requireNonNegativeSafeInteger(
          record.matched_campaign_count,
          "matched_campaign_count",
        ),
      remainingOverlapRows:
        requireNonNegativeSafeInteger(
          record.remaining_overlap_rows,
          "remaining_overlap_rows",
        ),
      excludedImpressions:
        requireFiniteNumber(
          record.excluded_impressions,
          "excluded_impressions",
        ),
      excludedClicks:
        requireFiniteNumber(
          record.excluded_clicks,
          "excluded_clicks",
        ),
      excludedCost:
        requireFiniteNumber(
          record.excluded_cost,
          "excluded_cost",
        ),
      excludedConversions:
        requireFiniteNumber(
          record.excluded_conversions,
          "excluded_conversions",
        ),
      excludedRevenue:
        requireFiniteNumber(
          record.excluded_revenue,
          "excluded_revenue",
        ),
    };

  if (
    metrics.sourceRows -
      metrics.excludedRows !==
        metrics.retainedRows ||
    metrics.remainingOverlapRows !== 0 ||
    metrics.matchedCampaignCount >
      metrics.mixedCampaignCount ||
    (
      metrics.changed &&
      (
        metrics.alreadyReconciled ||
        metrics.excludedRows === 0
      )
    ) ||
    (
      metrics.alreadyReconciled &&
      metrics.changed
    ) ||
    (
      !metrics.changed &&
      !metrics.alreadyReconciled &&
      metrics.excludedRows !== 0
    )
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC returned inconsistent aggregate values.",
    );
  }

  return metrics;
}

function validateReturnedJob(
  inputJob: MediaSyncJobRecord,
  returnedJob: MediaSyncJobRecord,
  metrics:
    NaverSearchAdsBrandSearchCrossGrainReconciliationMetrics,
): NaverSearchAdsCombinedProcessingCheckpoint {
  const immutableFields = [
    "id",
    "workspace_id",
    "advertiser_id",
    "report_id",
    "connection_id",
    "provider",
    "external_account_id",
    "date_from",
    "date_to",
    "data_level",
    "mode",
    "previous_ingestion_id",
    "attempt_count",
    "created_by",
    "created_at",
    "started_at",
  ] as const;

  for (
    const field
    of immutableFields
  ) {
    if (
      returnedJob[field] !==
        inputJob[field]
    ) {
      throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
        "INVALID_DATABASE_RESULT",
        `The reconciled job changed immutable field ${field}.`,
      );
    }
  }

  if (
    returnedJob.status !== PROCESSING_STATUS ||
    returnedJob.snapshot_ingestion_id !== null ||
    returnedJob.finished_at !== null ||
    returnedJob.error !== inputJob.error ||
    returnedJob.progress !== inputJob.progress ||
    returnedJob.raw_rows !== metrics.retainedRows ||
    returnedJob.normalized_rows !== metrics.retainedRows ||
    returnedJob.inserted_rows !== metrics.retainedRows ||
    returnedJob.failed_rows !== 0
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciled job contains unexpected mutable values.",
    );
  }

  const checkpoint =
    readCompletedCheckpoint(
      returnedJob,
    );

  if (
    checkpoint.totalRows !== metrics.retainedRows ||
    checkpoint.nextRowIndex !== metrics.retainedRows
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciled checkpoint row count does not match the RPC result.",
    );
  }

  const metadata =
    readReconciliationMetadata(
      returnedJob,
    );

  const metadataMetrics = {
    kind:
      metadata.kind,
    version:
      metadata.version,
    sourceRows:
      requireNonNegativeSafeInteger(
        metadata.source_rows,
        "reconciliation.source_rows",
      ),
    excludedRows:
      requireNonNegativeSafeInteger(
        metadata.excluded_rows,
        "reconciliation.excluded_rows",
      ),
    retainedRows:
      requireNonNegativeSafeInteger(
        metadata.retained_rows,
        "reconciliation.retained_rows",
      ),
    mixedCampaignCount:
      requireNonNegativeSafeInteger(
        metadata.mixed_campaign_count,
        "reconciliation.mixed_campaign_count",
      ),
    matchedCampaignCount:
      requireNonNegativeSafeInteger(
        metadata.matched_campaign_count,
        "reconciliation.matched_campaign_count",
      ),
    excludedImpressions:
      requireFiniteNumber(
        metadata.excluded_impressions,
        "reconciliation.excluded_impressions",
      ),
    excludedClicks:
      requireFiniteNumber(
        metadata.excluded_clicks,
        "reconciliation.excluded_clicks",
      ),
    excludedCost:
      requireFiniteNumber(
        metadata.excluded_cost,
        "reconciliation.excluded_cost",
      ),
    excludedConversions:
      requireFiniteNumber(
        metadata.excluded_conversions,
        "reconciliation.excluded_conversions",
      ),
    excludedRevenue:
      requireFiniteNumber(
        metadata.excluded_revenue,
        "reconciliation.excluded_revenue",
      ),
    appliedAt:
      metadata.applied_at,
  };

  if (
    metadataMetrics.kind !== metrics.kind ||
    metadataMetrics.version !== metrics.version ||
    metadataMetrics.sourceRows !== metrics.sourceRows ||
    metadataMetrics.excludedRows !== metrics.excludedRows ||
    metadataMetrics.retainedRows !== metrics.retainedRows ||
    metadataMetrics.mixedCampaignCount !== metrics.mixedCampaignCount ||
    metadataMetrics.matchedCampaignCount !== metrics.matchedCampaignCount ||
    metadataMetrics.excludedImpressions !== metrics.excludedImpressions ||
    metadataMetrics.excludedClicks !== metrics.excludedClicks ||
    metadataMetrics.excludedCost !== metrics.excludedCost ||
    metadataMetrics.excludedConversions !== metrics.excludedConversions ||
    metadataMetrics.excludedRevenue !== metrics.excludedRevenue ||
    typeof metadataMetrics.appliedAt !== "string" ||
    !metadataMetrics.appliedAt.trim()
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation audit metadata does not match the RPC result.",
    );
  }

  return checkpoint;
}

function validatePartialReturnedJob(
  inputJob: MediaSyncJobRecord,
  returnedJob: MediaSyncJobRecord,
  metrics:
    NaverSearchAdsBrandSearchCrossGrainReconciliationMetrics,
  progress:
    NaverSearchAdsBrandSearchCrossGrainReconciliationProgress,
): NaverSearchAdsCombinedProcessingCheckpoint {
  const immutableFields = [
    "id",
    "workspace_id",
    "advertiser_id",
    "report_id",
    "connection_id",
    "provider",
    "external_account_id",
    "date_from",
    "date_to",
    "data_level",
    "mode",
    "previous_ingestion_id",
    "attempt_count",
    "created_by",
    "created_at",
    "started_at",
  ] as const;

  for (
    const field
    of immutableFields
  ) {
    if (
      returnedJob[field] !==
        inputJob[field]
    ) {
      throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
        "INVALID_DATABASE_RESULT",
        `The partial reconciliation changed immutable field ${field}.`,
      );
    }
  }

  if (
    returnedJob.status !== PROCESSING_STATUS ||
    returnedJob.snapshot_ingestion_id !== null ||
    returnedJob.finished_at !== null ||
    returnedJob.error !== inputJob.error ||
    returnedJob.progress !== inputJob.progress ||
    returnedJob.raw_rows !== metrics.retainedRows ||
    returnedJob.normalized_rows !== metrics.retainedRows ||
    returnedJob.inserted_rows !== metrics.retainedRows ||
    returnedJob.failed_rows !== 0 ||
    progress.sourceRows !== metrics.sourceRows ||
    progress.excludedRows !== metrics.excludedRows ||
    progress.retainedRows !== metrics.retainedRows
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The partial reconciliation returned unexpected job or metric values.",
    );
  }

  const checkpoint =
    readCompletedCheckpoint(
      returnedJob,
    );

  if (
    checkpoint.totalRows !==
      metrics.retainedRows ||
    checkpoint.nextRowIndex !==
      metrics.retainedRows
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The partial reconciliation checkpoint does not match the current retained boundary.",
    );
  }

  return checkpoint;
}

async function invokeDefaultRpc(
  functionName: string,
  args: {
    p_payload: unknown;
  },
): Promise<
  NaverSearchAdsBrandSearchCrossGrainReconciliationRpcResult
> {
  const {
    getSupabaseAdmin,
  } =
    await import(
      "../supabase/admin"
    );

  const supabase =
    getSupabaseAdmin();

  const result =
    await supabase.rpc(
      functionName,
      args,
    );

  return {
    data:
      result.data,
    error:
      result.error,
  };
}

export async function reconcileNaverSearchAdsBrandSearchCrossGrainStaging(
  input:
    ReconcileNaverSearchAdsBrandSearchCrossGrainStagingInput,
  dependencies:
    NaverSearchAdsBrandSearchCrossGrainReconciliationDependencies = {},
): Promise<
  NaverSearchAdsBrandSearchCrossGrainReconciliationResult
> {
  const validated =
    validateInputContract(
      input,
    );

  const payload = {
    job_id:
      validated.job.id,
    report_id:
      validated.job.report_id,
    workspace_id:
      validated.job.workspace_id,
    advertiser_id:
      validated.job.advertiser_id,
    connection_id:
      validated.job.connection_id,
    provider:
      validated.job.provider,
    external_account_id:
      validated.job.external_account_id,
    date_from:
      validated.job.date_from,
    date_to:
      validated.job.date_to,
    expected_rows:
      validated.expectedRows,
    batch_size:
      validated.batchSize,
  };

  const invokeRpc =
    dependencies.invokeRpc ??
    invokeDefaultRpc;

  let rpcResult:
    NaverSearchAdsBrandSearchCrossGrainReconciliationRpcResult;

  try {
    rpcResult =
      await invokeRpc(
        RECONCILE_NAVER_SEARCH_ADS_BRAND_SEARCH_CROSS_GRAIN_STAGING_RPC,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "DATABASE_ERROR",
      "The BRAND_SEARCH cross-grain reconciliation repository could not access the database.",
      {
        cause:
          error,
      },
    );
  }

  if (rpcResult.error) {
    throw mapRpcError(
      rpcResult.error,
    );
  }

  if (
    !Array.isArray(
      rpcResult.data,
    ) ||
    rpcResult.data.length !== 1
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC must return exactly one row.",
    );
  }

  const record =
    parseRpcRecord(
      rpcResult.data[0],
    );

  let returnedJob:
    MediaSyncJobRecord;

  try {
    returnedJob =
      parseMediaSyncJobRecord(
        record.job,
      );
  } catch (error) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC returned an invalid media sync job.",
      {
        cause:
          error,
      },
    );
  }

  const progress =
    parseReconciliationProgress(
      returnedJob,
    );

  const metrics =
    parseMetrics(
      record,
    );

  if (progress) {
    const checkpoint =
      validatePartialReturnedJob(
        validated.job,
        returnedJob,
        metrics,
        progress,
      );

    return {
      ...metrics,
      job:
        returnedJob,
      checkpoint,
      progress,
    };
  }

  if (
    (
      !metrics.alreadyReconciled &&
      metrics.sourceRows !==
        validated.expectedRows
    ) ||
    (
      metrics.alreadyReconciled &&
      metrics.retainedRows !==
        validated.expectedRows
    )
  ) {
    throw new NaverSearchAdsBrandSearchCrossGrainReconciliationError(
      "INVALID_DATABASE_RESULT",
      "The reconciliation RPC row counts do not match the requested boundary.",
    );
  }

  const checkpoint =
    validateReturnedJob(
      validated.job,
      returnedJob,
      metrics,
    );

  return {
    ...metrics,
    job:
      returnedJob,
    checkpoint,
  };
}
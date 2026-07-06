import { getSupabaseAdmin } from "../supabase/admin";
import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import type {
  NaverSearchAdsStagingOrchestratorResult,
} from "./naver-searchads-staging-orchestrator";
import type {
  JsonObject,
  JsonValue,
  MediaSyncJobRecord,
} from "./types";

const SAVE_PROCESSING_CHECKPOINT_RPC =
  "save_media_sync_processing_checkpoint";

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const FORBIDDEN_SECRET_KEY_PATTERN =
  /secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key/i;

export type MediaSyncProcessingCheckpointErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "INVALID_COUNTS"
  | "CHECKPOINT_REGRESSION"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncProcessingCheckpointError
  extends Error {
  readonly code:
    MediaSyncProcessingCheckpointErrorCode;

  constructor(
    code:
      MediaSyncProcessingCheckpointErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "MediaSyncProcessingCheckpointError";

    this.code =
      code;
  }
}

export type SaveMediaSyncProcessingCheckpointInput = {
  job: MediaSyncJobRecord;

  result:
    NaverSearchAdsStagingOrchestratorResult;
};

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

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function requireNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function assertSafeJsonValue(
  value: unknown,
  path: string,
  visited: Set<object>,
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MediaSyncProcessingCheckpointError(
        "INVALID_INPUT",
        `${path} contains a non-finite number.`,
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      throw new MediaSyncProcessingCheckpointError(
        "INVALID_INPUT",
        `${path} contains a circular reference.`,
      );
    }

    visited.add(value);

    try {
      for (
        let index = 0;
        index < value.length;
        index += 1
      ) {
        assertSafeJsonValue(
          value[index],
          `${path}[${index}]`,
          visited,
        );
      }
    } finally {
      visited.delete(value);
    }

    return;
  }

  if (!isPlainObject(value)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      `${path} contains a non-JSON value.`,
    );
  }

  if (visited.has(value)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      `${path} contains a circular reference.`,
    );
  }

  visited.add(value);

  try {
    for (
      const [key, nestedValue]
      of Object.entries(value)
    ) {
      if (
        FORBIDDEN_SECRET_KEY_PATTERN.test(
          key.replace(
            /[^a-z0-9_-]/gi,
            "",
          ),
        )
      ) {
        throw new MediaSyncProcessingCheckpointError(
          "INVALID_INPUT",
          `${path} contains a forbidden secret field.`,
        );
      }

      assertSafeJsonValue(
        nestedValue,
        `${path}.${key}`,
        visited,
      );
    }
  } finally {
    visited.delete(value);
  }
}

function toSafeJsonObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (!isPlainObject(value)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      `${fieldName} must be a JSON object.`,
    );
  }

  assertSafeJsonValue(
    value,
    fieldName,
    new Set<object>(),
  );

  return value as JsonObject;
}

function validateJob(
  value: unknown,
): asserts value is MediaSyncJobRecord {
  if (!isPlainObject(value)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_JOB",
      "A media sync job is required.",
    );
  }

  normalizeRequiredString(
    value.id,
    "job.id",
  );

  normalizeRequiredString(
    value.report_id,
    "job.report_id",
  );

  normalizeRequiredString(
    value.workspace_id,
    "job.workspace_id",
  );

  normalizeRequiredString(
    value.advertiser_id,
    "job.advertiser_id",
  );

  normalizeRequiredString(
    value.connection_id,
    "job.connection_id",
  );

  normalizeRequiredString(
    value.external_account_id,
    "job.external_account_id",
  );

  if (
    value.provider !==
    NAVER_PROVIDER
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads checkpoints are supported.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing.",
    );
  }
}

function validateResult(
  job: MediaSyncJobRecord,
  result: unknown,
): asserts result is
  NaverSearchAdsStagingOrchestratorResult {
  if (!isPlainObject(result)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "An orchestrator result is required.",
    );
  }

  if (
    result.jobId !==
    job.id
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The orchestrator result does not match the media sync job.",
    );
  }

  if (
    result.status !== "partial" &&
    result.status !== "completed"
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The orchestrator result has an invalid status.",
    );
  }

  if (
    result.isComplete !==
    (result.status === "completed")
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The orchestrator result completion flag is inconsistent.",
    );
  }

  requireNonNegativeInteger(
    result.dateWindowIndex,
    "result.dateWindowIndex",
  );

  requireNonNegativeInteger(
    result.runCanonicalRowCount,
    "result.runCanonicalRowCount",
  );

  requireNonNegativeInteger(
    result.canonicalRowCount,
    "result.canonicalRowCount",
  );

  if (!isPlainObject(result.collector)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The orchestrator collector result is invalid.",
    );
  }

  if (!isPlainObject(result.append)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The orchestrator append result is invalid.",
    );
  }

  if (!isPlainObject(result.summary)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The orchestrator summary result is invalid.",
    );
  }

  if (!isPlainObject(result.checkpointSeed)) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The orchestrator checkpoint seed is invalid.",
    );
  }
}

function mapRpcError(
  error: unknown,
): MediaSyncProcessingCheckpointError {
  const message =
    isPlainObject(error) &&
    typeof error.message ===
      "string"
      ? error.message
      : "";

  if (
    message.includes(
      "MSC_JOB_NOT_PROCESSING",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The media sync job is no longer processing.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSC_UNSUPPORTED_PROVIDER",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "The media sync provider is not supported.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSC_SCOPE_MISMATCH",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The checkpoint scope does not match the media sync job.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSC_INVALID_COUNTS",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      "The processing checkpoint counts are inconsistent.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSC_CHECKPOINT_REGRESSION",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "CHECKPOINT_REGRESSION",
      "The processing checkpoint cannot move backwards.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSC_JOB_NOT_FOUND",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "INVALID_JOB",
      "The media sync job was not found.",
      { cause: error },
    );
  }

  if (
    message.includes(
      "MSC_INVALID_INPUT",
    )
  ) {
    return new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "The processing checkpoint input is invalid.",
      { cause: error },
    );
  }

  return new MediaSyncProcessingCheckpointError(
    "DATABASE_ERROR",
    "The processing checkpoint could not be saved.",
    { cause: error },
  );
}

export async function saveMediaSyncProcessingCheckpoint(
  input:
    SaveMediaSyncProcessingCheckpointInput,
): Promise<MediaSyncJobRecord> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_INPUT",
      "Checkpoint input is required.",
    );
  }

  validateJob(
    input.job,
  );

  validateResult(
    input.job,
    input.result,
  );

  const collector =
    input.result.collector;

  const append =
    input.result.append;

  const summary =
    input.result.summary;

  const checkpointSeed =
    input.result.checkpointSeed;

  const runDiscoveredKeywords =
    requireNonNegativeInteger(
      collector
        .keywordsDiscoveredInRun,
      "collector.keywordsDiscoveredInRun",
    );

  const runCompletedKeywords =
    requireNonNegativeInteger(
      collector
        .keywordsCompletedInRun,
      "collector.keywordsCompletedInRun",
    );

  const runStatsRequestsAttempted =
    requireNonNegativeInteger(
      collector
        .statsRequestsAttempted,
      "collector.statsRequestsAttempted",
    );

  const runStatsRequestsSucceeded =
    requireNonNegativeInteger(
      collector
        .statsRequestsSucceeded,
      "collector.statsRequestsSucceeded",
    );

  const runRetryCount =
    requireNonNegativeInteger(
      collector.retryCount,
      "collector.retryCount",
    );

  const seedInsertedRows =
    requireNonNegativeInteger(
      checkpointSeed.insertedRows,
      "checkpointSeed.insertedRows",
    );

  const seedRawRows =
    requireNonNegativeInteger(
      checkpointSeed.rawRows,
      "checkpointSeed.rawRows",
    );

  const seedNormalizedRows =
    requireNonNegativeInteger(
      checkpointSeed.normalizedRows,
      "checkpointSeed.normalizedRows",
    );

  const seedFailedRows =
    requireNonNegativeInteger(
      checkpointSeed.failedRows,
      "checkpointSeed.failedRows",
    );

  const seedDiscoveredKeywords =
    requireNonNegativeInteger(
      checkpointSeed.collector
        .discoveredKeywords,
      "checkpointSeed.collector.discoveredKeywords",
    );

  const seedCompletedKeywords =
    requireNonNegativeInteger(
      checkpointSeed.collector
        .completedKeywords,
      "checkpointSeed.collector.completedKeywords",
    );

  const seedStatsRequestsAttempted =
    requireNonNegativeInteger(
      checkpointSeed.collector
        .statsRequestsAttempted,
      "checkpointSeed.collector.statsRequestsAttempted",
    );

  const seedStatsRequestsSucceeded =
    requireNonNegativeInteger(
      checkpointSeed.collector
        .statsRequestsSucceeded,
      "checkpointSeed.collector.statsRequestsSucceeded",
    );

  const seedRetryCount =
    requireNonNegativeInteger(
      checkpointSeed.collector
        .retryCount,
      "checkpointSeed.collector.retryCount",
    );

  const runCanonicalRowCount =
    requireNonNegativeInteger(
      input.result
        .runCanonicalRowCount,
      "result.runCanonicalRowCount",
    );

  const canonicalRowCount =
    requireNonNegativeInteger(
      input.result
        .canonicalRowCount,
      "result.canonicalRowCount",
    );

  const summaryTotalRows =
    requireNonNegativeInteger(
      summary.totalRows,
      "summary.totalRows",
    );

  const appendSubmittedRows =
    requireNonNegativeInteger(
      append.submittedRows,
      "append.submittedRows",
    );

  const appendInsertedRows =
    requireNonNegativeInteger(
      append.insertedRows,
      "append.insertedRows",
    );

  const appendDuplicateRows =
    requireNonNegativeInteger(
      append.duplicateRows,
      "append.duplicateRows",
    );

  const discoveredKeywords =
    seedDiscoveredKeywords +
    runDiscoveredKeywords;

  const completedKeywords =
    seedCompletedKeywords +
    runCompletedKeywords;

  const statsRequestsAttempted =
    seedStatsRequestsAttempted +
    runStatsRequestsAttempted;

  const statsRequestsSucceeded =
    seedStatsRequestsSucceeded +
    runStatsRequestsSucceeded;

  const retryCount =
    seedRetryCount +
    runRetryCount;

  const insertedRows =
    seedInsertedRows +
    appendInsertedRows +
    appendDuplicateRows;

  const rawRows =
    seedRawRows +
    runCanonicalRowCount;

  const normalizedRows =
    seedNormalizedRows +
    runCanonicalRowCount;

  const failedRows =
    seedFailedRows;

  if (
    completedKeywords >
      discoveredKeywords ||
    statsRequestsSucceeded >
      statsRequestsAttempted ||
    appendSubmittedRows !==
      runCanonicalRowCount ||
    insertedRows !==
      canonicalRowCount ||
    rawRows !==
      canonicalRowCount ||
    normalizedRows !==
      canonicalRowCount ||
    summaryTotalRows !==
      canonicalRowCount ||
    failedRows !==
      0 ||
    summary.isComplete !==
      input.result.isComplete
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      "The orchestrator result contains inconsistent checkpoint counts.",
    );
  }

  if (
    input.result.status === "partial" &&
    (
      input.result.isComplete !== false ||
      summary.isComplete !== false ||
      collector.status !== "partial" ||
      collector.completed !== false
    )
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      "The partial orchestrator result contains inconsistent completion flags.",
    );
  }

  if (
    input.result.status === "completed" &&
    (
      input.result.isComplete !== true ||
      summary.isComplete !== true ||
      collector.status !== "completed" ||
      collector.completed !== true
    )
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_COUNTS",
      "The completed orchestrator result contains inconsistent completion flags.",
    );
  }

  const cursor =
    toSafeJsonObject(
      collector.cursor,
      "collector.cursor",
    );

  const payload = {
    job_id:
      input.job.id,

    report_id:
      input.job.report_id,

    workspace_id:
      input.job.workspace_id,

    advertiser_id:
      input.job.advertiser_id,

    connection_id:
      input.job.connection_id,

    provider:
      input.job.provider,

    external_account_id:
      input.job.external_account_id,

    raw_rows:
      canonicalRowCount,

    normalized_rows:
      canonicalRowCount,

    inserted_rows:
      insertedRows,

    failed_rows:
      failedRows,

    collector: {
      discovered_keywords:
        discoveredKeywords,

      completed_keywords:
        completedKeywords,

      stats_requests_attempted:
        statsRequestsAttempted,

      stats_requests_succeeded:
        statsRequestsSucceeded,

      retry_count:
        retryCount,

      date_window_index:
        input.result.dateWindowIndex,

      cursor,
    },
  };

  const supabase =
    getSupabaseAdmin();

  let rpcResult;

  try {
    rpcResult =
      await supabase.rpc(
        SAVE_PROCESSING_CHECKPOINT_RPC,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new MediaSyncProcessingCheckpointError(
      "DATABASE_ERROR",
      "The checkpoint repository could not access the database.",
      { cause: error },
    );
  }

  const {
    data,
    error,
  } = rpcResult;

  if (error) {
    throw mapRpcError(
      error,
    );
  }

  if (
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The checkpoint RPC returned an invalid result.",
    );
  }

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        data[0],
      );
  } catch (error) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The checkpoint RPC returned an invalid media sync job.",
      { cause: error },
    );
  }

  if (
    updatedJob.id !==
      input.job.id ||
    updatedJob.status !==
      PROCESSING_STATUS ||
    updatedJob.snapshot_ingestion_id !==
      input.job.snapshot_ingestion_id ||
    updatedJob.finished_at !==
      input.job.finished_at ||
    updatedJob.raw_rows !==
      canonicalRowCount ||
    updatedJob.normalized_rows !==
      canonicalRowCount ||
    updatedJob.inserted_rows !==
      insertedRows ||
    updatedJob.failed_rows !==
      failedRows
  ) {
    throw new MediaSyncProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The saved checkpoint job contains unexpected values.",
    );
  }

  return updatedJob;
}
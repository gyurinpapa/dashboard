import {
  parseMediaSyncJobRecord,
} from "./media-sync-jobs-repository";
import type {
  NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult,
} from "./naver-searchads-authoritative-entity-staging-orchestrator";
import {
  normalizeNaverAuthoritativeEntityStatsCursor,
  type NaverAuthoritativeEntityStatsCursor,
} from "./naver-searchads-authoritative-entity-stats-state";
import type {
  NaverSearchAdsStagingOrchestratorResult,
} from "./naver-searchads-staging-orchestrator";
import {
  normalizeNaverKeywordStatsCursor,
  type NaverKeywordStatsCursor,
} from "./naver-searchads-keyword-stats-state";
import type {
  JsonObject,
  JsonValue,
  MediaSyncJobRecord,
} from "./types";

const SAVE_PROCESSING_CHECKPOINT_RPC =
  "save_naver_searchads_combined_processing_checkpoint";

const PROCESSING_CHECKPOINT_KEY =
  "processing_checkpoint" as const;

const NAVER_PROVIDER =
  "naver_searchad" as const;

const PROCESSING_STATUS =
  "processing" as const;

const FORBIDDEN_SECRET_KEY_PATTERN =
  /secret|token|credential|ciphertext|accesslicense|authorization|password|api[_-]?key/i;

export type NaverSearchAdsCombinedStagingPhase =
  | "keyword"
  | "authoritative"
  | "completed";

export type NaverSearchAdsCombinedCollectorCounts = {
  discovered: number;
  completed: number;
  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;
  retryCount: number;
};

export type NaverSearchAdsCombinedKeywordCheckpoint = {
  complete: boolean;
  cursor: NaverKeywordStatsCursor | null;
  counts: NaverSearchAdsCombinedCollectorCounts;
};

export type NaverSearchAdsCombinedAuthoritativeCheckpoint = {
  complete: boolean;
  cursor: NaverAuthoritativeEntityStatsCursor | null;
  counts: NaverSearchAdsCombinedCollectorCounts;
};

export type NaverSearchAdsCombinedProcessingCheckpoint = {
  version: 1;
  phase: NaverSearchAdsCombinedStagingPhase;
  dateWindowIndex: number;
  nextRowIndex: number;
  totalRows: number;
  failedRows: number;
  keyword: NaverSearchAdsCombinedKeywordCheckpoint;
  authoritative: NaverSearchAdsCombinedAuthoritativeCheckpoint;
};

export type MediaSyncCombinedProcessingCheckpointErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JOB"
  | "JOB_NOT_PROCESSING"
  | "UNSUPPORTED_PROVIDER"
  | "SCOPE_MISMATCH"
  | "INVALID_COUNTS"
  | "CHECKPOINT_REGRESSION"
  | "DATABASE_ERROR"
  | "INVALID_DATABASE_RESULT";

export class MediaSyncCombinedProcessingCheckpointError
  extends Error {
  readonly code:
    MediaSyncCombinedProcessingCheckpointErrorCode;

  constructor(
    code:
      MediaSyncCombinedProcessingCheckpointErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "MediaSyncCombinedProcessingCheckpointError";

    this.code =
      code;
  }
}

export type MediaSyncCombinedProcessingCheckpointRpcResult = {
  data: unknown;
  error: unknown;
};

export type MediaSyncCombinedProcessingCheckpointRpcInvoker = (
  functionName: string,
  args: {
    p_payload: unknown;
  },
) => Promise<
  MediaSyncCombinedProcessingCheckpointRpcResult
>;

export type MediaSyncCombinedProcessingCheckpointDependencies = {
  invokeRpc?:
    MediaSyncCombinedProcessingCheckpointRpcInvoker;
};

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(
      value,
    );

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
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
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function readNonNegativeInteger(
  value: unknown,
): number | null {
  if (
    typeof value !==
      "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    return null;
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
    typeof value ===
      "string" ||
    typeof value ===
      "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MediaSyncCombinedProcessingCheckpointError(
        "INVALID_INPUT",
        `${path} contains a non-finite number.`,
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    if (visited.has(value)) {
      throw new MediaSyncCombinedProcessingCheckpointError(
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
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      `${path} contains a non-JSON value.`,
    );
  }

  if (visited.has(value)) {
    throw new MediaSyncCombinedProcessingCheckpointError(
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
        throw new MediaSyncCombinedProcessingCheckpointError(
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
    throw new MediaSyncCombinedProcessingCheckpointError(
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
    throw new MediaSyncCombinedProcessingCheckpointError(
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
    throw new MediaSyncCombinedProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads combined checkpoints are supported.",
    );
  }

  if (
    value.status !==
    PROCESSING_STATUS
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The media sync job must be processing.",
    );
  }
}

function createEmptyCounts():
  NaverSearchAdsCombinedCollectorCounts {
  return {
    discovered:
      0,
    completed:
      0,
    statsRequestsAttempted:
      0,
    statsRequestsSucceeded:
      0,
    retryCount:
      0,
  };
}

function normalizeCounts(
  value: unknown,
  fieldName: string,
): NaverSearchAdsCombinedCollectorCounts {
  if (!isPlainObject(value)) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      `${fieldName} must be an object.`,
    );
  }

  const counts = {
    discovered:
      requireNonNegativeInteger(
        value.discovered,
        `${fieldName}.discovered`,
      ),

    completed:
      requireNonNegativeInteger(
        value.completed,
        `${fieldName}.completed`,
      ),

    statsRequestsAttempted:
      requireNonNegativeInteger(
        value.statsRequestsAttempted,
        `${fieldName}.statsRequestsAttempted`,
      ),

    statsRequestsSucceeded:
      requireNonNegativeInteger(
        value.statsRequestsSucceeded,
        `${fieldName}.statsRequestsSucceeded`,
      ),

    retryCount:
      requireNonNegativeInteger(
        value.retryCount,
        `${fieldName}.retryCount`,
      ),
  };

  if (
    counts.completed >
      counts.discovered ||
    counts.statsRequestsSucceeded >
      counts.statsRequestsAttempted
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      `${fieldName} contains inconsistent counts.`,
    );
  }

  return counts;
}

function normalizePhase(
  value: unknown,
): NaverSearchAdsCombinedStagingPhase {
  if (
    value === "keyword" ||
    value === "authoritative" ||
    value === "completed"
  ) {
    return value;
  }

  throw new MediaSyncCombinedProcessingCheckpointError(
    "INVALID_INPUT",
    "The combined checkpoint phase is invalid.",
  );
}

function normalizeKeywordCursor(
  value: unknown,
): NaverKeywordStatsCursor | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  try {
    return normalizeNaverKeywordStatsCursor(
      value,
    );
  } catch (error) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "The keyword checkpoint cursor is invalid.",
      {
        cause:
          error,
      },
    );
  }
}

function normalizeAuthoritativeCursor(
  value: unknown,
): NaverAuthoritativeEntityStatsCursor | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  try {
    return normalizeNaverAuthoritativeEntityStatsCursor(
      value,
    );
  } catch (error) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "The authoritative checkpoint cursor is invalid.",
      {
        cause:
          error,
      },
    );
  }
}

function validateCheckpoint(
  job: MediaSyncJobRecord,
  value: unknown,
): NaverSearchAdsCombinedProcessingCheckpoint {
  if (!isPlainObject(value)) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "A combined processing checkpoint is required.",
    );
  }

  const version =
    value.version;

  if (version !== 1) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "The combined processing checkpoint version is invalid.",
    );
  }

  const phase =
    normalizePhase(
      value.phase,
    );

  const dateWindowIndex =
    requireNonNegativeInteger(
      value.dateWindowIndex,
      "checkpoint.dateWindowIndex",
    );

  const nextRowIndex =
    requireNonNegativeInteger(
      value.nextRowIndex,
      "checkpoint.nextRowIndex",
    );

  const totalRows =
    requireNonNegativeInteger(
      value.totalRows,
      "checkpoint.totalRows",
    );

  const failedRows =
    requireNonNegativeInteger(
      value.failedRows,
      "checkpoint.failedRows",
    );

  if (
    totalRows !==
      nextRowIndex ||
    failedRows !==
      0
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      "The combined checkpoint row counts are inconsistent.",
    );
  }

  if (
    !isPlainObject(
      value.keyword,
    ) ||
    !isPlainObject(
      value.authoritative,
    )
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "The combined checkpoint phase states are invalid.",
    );
  }

  const keyword = {
    complete:
      value.keyword.complete ===
      true,

    cursor:
      normalizeKeywordCursor(
        value.keyword.cursor,
      ),

    counts:
      normalizeCounts(
        value.keyword.counts,
        "checkpoint.keyword.counts",
      ),
  };

  const authoritative = {
    complete:
      value.authoritative.complete ===
      true,

    cursor:
      normalizeAuthoritativeCursor(
        value.authoritative.cursor,
      ),

    counts:
      normalizeCounts(
        value.authoritative.counts,
        "checkpoint.authoritative.counts",
      ),
  };

  if (
    phase !== "keyword" &&
    !keyword.complete
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      "The keyword phase must be complete before the authoritative phase.",
    );
  }

  if (
    phase === "completed" &&
    !authoritative.complete
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      "The authoritative phase must be complete before combined completion.",
    );
  }

  if (
    nextRowIndex <
    job.inserted_rows
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "CHECKPOINT_REGRESSION",
      "The combined checkpoint cannot move behind the saved job row count.",
    );
  }

  return {
    version:
      1,
    phase,
    dateWindowIndex,
    nextRowIndex,
    totalRows,
    failedRows,
    keyword,
    authoritative,
  };
}

function readProcessingCheckpoint(
  job: MediaSyncJobRecord,
): UnknownRecord | null {
  const errorDetail =
    job.error_detail;

  if (!isPlainObject(errorDetail)) {
    return null;
  }

  const checkpoint =
    errorDetail[
      PROCESSING_CHECKPOINT_KEY
    ];

  return isPlainObject(checkpoint)
    ? checkpoint
    : null;
}

function readLegacyCounts(
  collector: UnknownRecord,
): NaverSearchAdsCombinedCollectorCounts {
  return {
    discovered:
      readNonNegativeInteger(
        collector.discovered_keywords,
      ) ?? 0,

    completed:
      readNonNegativeInteger(
        collector.completed_keywords,
      ) ?? 0,

    statsRequestsAttempted:
      readNonNegativeInteger(
        collector.stats_requests_attempted,
      ) ?? 0,

    statsRequestsSucceeded:
      readNonNegativeInteger(
        collector.stats_requests_succeeded,
      ) ?? 0,

    retryCount:
      readNonNegativeInteger(
        collector.retry_count,
      ) ?? 0,
  };
}

export function readNaverSearchAdsCombinedProcessingCheckpoint(
  job: MediaSyncJobRecord,
): NaverSearchAdsCombinedProcessingCheckpoint {
  validateJob(
    job,
  );

  const checkpoint =
    readProcessingCheckpoint(
      job,
    );

  if (!checkpoint) {
    if (
      job.raw_rows !== 0 ||
      job.normalized_rows !== 0 ||
      job.inserted_rows !== 0 ||
      job.failed_rows !== 0
    ) {
      throw new MediaSyncCombinedProcessingCheckpointError(
        "INVALID_JOB",
        "A job with saved rows must contain a processing checkpoint.",
      );
    }

    return {
      version:
        1,
      phase:
        "keyword",
      dateWindowIndex:
        0,
      nextRowIndex:
        0,
      totalRows:
        0,
      failedRows:
        0,
      keyword: {
        complete:
          false,
        cursor:
          null,
        counts:
          createEmptyCounts(),
      },
      authoritative: {
        complete:
          false,
        cursor:
          null,
        counts:
          createEmptyCounts(),
      },
    };
  }

  const collector =
    isPlainObject(
      checkpoint.collector,
    )
      ? checkpoint.collector
      : null;

  if (!collector) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_JOB",
      "The processing checkpoint collector state is invalid.",
    );
  }

  if (
    collector.combined_version ===
      1
  ) {
    const parsed =
      validateCheckpoint(
        job,
        {
          version:
            1,
          phase:
            collector.phase,
          dateWindowIndex:
            collector.date_window_index,
          nextRowIndex:
            collector.next_row_index,
          totalRows:
            checkpoint.inserted_rows,
          failedRows:
            checkpoint.failed_rows,
          keyword:
            collector.keyword,
          authoritative:
            collector.authoritative,
        },
      );

    if (
      checkpoint.raw_rows !==
        parsed.totalRows ||
      checkpoint.normalized_rows !==
        parsed.totalRows ||
      checkpoint.inserted_rows !==
        parsed.totalRows ||
      checkpoint.failed_rows !==
        0 ||
      job.raw_rows !==
        parsed.totalRows ||
      job.normalized_rows !==
        parsed.totalRows ||
      job.inserted_rows !==
        parsed.totalRows ||
      job.failed_rows !==
        0
    ) {
      throw new MediaSyncCombinedProcessingCheckpointError(
        "INVALID_JOB",
        "The saved job counts do not match the combined processing checkpoint.",
      );
    }

    return parsed;
  }

  const legacyCursor =
    normalizeKeywordCursor(
      collector.cursor,
    );

  const totalRows =
    readNonNegativeInteger(
      checkpoint.inserted_rows,
    ) ??
    job.inserted_rows;

  if (
    job.raw_rows !==
      totalRows ||
    job.normalized_rows !==
      totalRows ||
    job.inserted_rows !==
      totalRows ||
    job.failed_rows !==
      0
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_JOB",
      "The legacy checkpoint counts do not match the saved job.",
    );
  }

  return {
    version:
      1,
    phase:
      "keyword",
    dateWindowIndex:
      readNonNegativeInteger(
        collector.date_window_index,
      ) ?? 0,
    nextRowIndex:
      totalRows,
    totalRows,
    failedRows:
      0,
    keyword: {
      complete:
        false,
      cursor:
        legacyCursor,
      counts:
        readLegacyCounts(
          collector,
        ),
    },
    authoritative: {
      complete:
        false,
      cursor:
        null,
      counts:
        createEmptyCounts(),
    },
  };
}

function addCounts(
  previous:
    NaverSearchAdsCombinedCollectorCounts,
  delta:
    NaverSearchAdsCombinedCollectorCounts,
): NaverSearchAdsCombinedCollectorCounts {
  const next = {
    discovered:
      previous.discovered +
      delta.discovered,

    completed:
      previous.completed +
      delta.completed,

    statsRequestsAttempted:
      previous.statsRequestsAttempted +
      delta.statsRequestsAttempted,

    statsRequestsSucceeded:
      previous.statsRequestsSucceeded +
      delta.statsRequestsSucceeded,

    retryCount:
      previous.retryCount +
      delta.retryCount,
  };

  return normalizeCounts(
    next,
    "combined counts",
  );
}

export function createCombinedCheckpointFromKeywordResult(input: {
  job: MediaSyncJobRecord;
  previous:
    NaverSearchAdsCombinedProcessingCheckpoint;
  result:
    NaverSearchAdsStagingOrchestratorResult;
}): NaverSearchAdsCombinedProcessingCheckpoint {
  validateJob(
    input.job,
  );

  if (
    input.previous.phase !==
      "keyword"
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "A keyword result cannot update a non-keyword combined checkpoint.",
    );
  }

  if (
    input.result.jobId !==
      input.job.id
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The keyword orchestrator result does not match the job.",
    );
  }

  const seed =
    input.result.checkpointSeed;

  const keywordCounts = {
    discovered:
      requireNonNegativeInteger(
        seed.collector.discoveredKeywords,
        "keyword seed discoveredKeywords",
      ) +
      requireNonNegativeInteger(
        input.result.collector
          .keywordsDiscoveredInRun,
        "keyword run keywordsDiscoveredInRun",
      ),

    completed:
      requireNonNegativeInteger(
        seed.collector.completedKeywords,
        "keyword seed completedKeywords",
      ) +
      requireNonNegativeInteger(
        input.result.collector
          .keywordsCompletedInRun,
        "keyword run keywordsCompletedInRun",
      ),

    statsRequestsAttempted:
      requireNonNegativeInteger(
        seed.collector.statsRequestsAttempted,
        "keyword seed statsRequestsAttempted",
      ) +
      requireNonNegativeInteger(
        input.result.collector
          .statsRequestsAttempted,
        "keyword run statsRequestsAttempted",
      ),

    statsRequestsSucceeded:
      requireNonNegativeInteger(
        seed.collector.statsRequestsSucceeded,
        "keyword seed statsRequestsSucceeded",
      ) +
      requireNonNegativeInteger(
        input.result.collector
          .statsRequestsSucceeded,
        "keyword run statsRequestsSucceeded",
      ),

    retryCount:
      requireNonNegativeInteger(
        seed.collector.retryCount,
        "keyword seed retryCount",
      ) +
      requireNonNegativeInteger(
        input.result.collector.retryCount,
        "keyword run retryCount",
      ),
  };

  normalizeCounts(
    keywordCounts,
    "keyword combined counts",
  );

  const totalRows =
    requireNonNegativeInteger(
      input.result.canonicalRowCount,
      "keyword result canonicalRowCount",
    );

  if (
    input.result.summary.totalRows !==
      totalRows ||
    input.result.append.submittedRows !==
      input.result.runCanonicalRowCount
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      "The keyword result contains inconsistent row counts.",
    );
  }

  return validateCheckpoint(
    input.job,
    {
      version:
        1,
      phase:
        input.result.status ===
        "completed"
          ? "authoritative"
          : "keyword",
      dateWindowIndex:
        input.result.dateWindowIndex,
      nextRowIndex:
        totalRows,
      totalRows,
      failedRows:
        0,
      keyword: {
        complete:
          input.result.status ===
          "completed",
        cursor:
          input.result.collector.cursor,
        counts:
          keywordCounts,
      },
      authoritative:
        input.previous.authoritative,
    },
  );
}

export function createCombinedCheckpointFromAuthoritativeResult(input: {
  job: MediaSyncJobRecord;
  previous:
    NaverSearchAdsCombinedProcessingCheckpoint;
  result:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorResult;
}): NaverSearchAdsCombinedProcessingCheckpoint {
  validateJob(
    input.job,
  );

  if (
    input.previous.phase !==
      "authoritative" ||
    !input.previous.keyword.complete
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "An authoritative result requires a completed keyword checkpoint.",
    );
  }

  if (
    input.result.jobId !==
      input.job.id ||
    input.result.rowStartIndex !==
      input.previous.nextRowIndex
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The authoritative result does not match the combined checkpoint row boundary.",
    );
  }

  const runRows =
    requireNonNegativeInteger(
      input.result.runCanonicalRowCount,
      "authoritative result runCanonicalRowCount",
    );

  if (
    input.result.nextRowIndex !==
      input.previous.nextRowIndex +
      runRows ||
    input.result.append.submittedRows !==
      runRows
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      "The authoritative result contains inconsistent row counts.",
    );
  }

  const deltaCounts = {
    discovered:
      requireNonNegativeInteger(
        input.result.collector
          .entitiesDiscoveredInRun,
        "authoritative entitiesDiscoveredInRun",
      ),

    completed:
      requireNonNegativeInteger(
        input.result.collector
          .entitiesCompletedInRun,
        "authoritative entitiesCompletedInRun",
      ),

    statsRequestsAttempted:
      requireNonNegativeInteger(
        input.result.collector
          .statsRequestsAttempted,
        "authoritative statsRequestsAttempted",
      ),

    statsRequestsSucceeded:
      requireNonNegativeInteger(
        input.result.collector
          .statsRequestsSucceeded,
        "authoritative statsRequestsSucceeded",
      ),

    retryCount:
      requireNonNegativeInteger(
        input.result.collector.retryCount,
        "authoritative retryCount",
      ),
  };

  const authoritativeCounts =
    addCounts(
      input.previous.authoritative.counts,
      deltaCounts,
    );

  return validateCheckpoint(
    input.job,
    {
      version:
        1,
      phase:
        input.result.status ===
        "completed"
          ? "completed"
          : "authoritative",
      dateWindowIndex:
        input.result.dateWindowIndex,
      nextRowIndex:
        input.result.nextRowIndex,
      totalRows:
        input.result.nextRowIndex,
      failedRows:
        0,
      keyword:
        input.previous.keyword,
      authoritative: {
        complete:
          input.result.status ===
          "completed",
        cursor:
          input.result.collector.cursor,
        counts:
          authoritativeCounts,
      },
    },
  );
}

function mapRpcError(
  error: unknown,
): MediaSyncCombinedProcessingCheckpointError {
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
    return new MediaSyncCombinedProcessingCheckpointError(
      "JOB_NOT_PROCESSING",
      "The media sync job is no longer processing.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_UNSUPPORTED_PROVIDER",
    )
  ) {
    return new MediaSyncCombinedProcessingCheckpointError(
      "UNSUPPORTED_PROVIDER",
      "The checkpoint provider is not supported.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_SCOPE_MISMATCH",
    )
  ) {
    return new MediaSyncCombinedProcessingCheckpointError(
      "SCOPE_MISMATCH",
      "The checkpoint scope does not match the job.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_INVALID_COUNTS",
    )
  ) {
    return new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_COUNTS",
      "The checkpoint counts are inconsistent.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_CHECKPOINT_REGRESSION",
    )
  ) {
    return new MediaSyncCombinedProcessingCheckpointError(
      "CHECKPOINT_REGRESSION",
      "The checkpoint cannot move backwards.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_JOB_NOT_FOUND",
    )
  ) {
    return new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_JOB",
      "The media sync job was not found.",
      {
        cause:
          error,
      },
    );
  }

  if (
    message.includes(
      "MSC_INVALID_INPUT",
    )
  ) {
    return new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "The combined checkpoint payload is invalid.",
      {
        cause:
          error,
      },
    );
  }

  return new MediaSyncCombinedProcessingCheckpointError(
    "DATABASE_ERROR",
    "The combined processing checkpoint could not be saved.",
    {
      cause:
        error,
    },
  );
}

async function invokeDefaultRpc(
  functionName: string,
  args: {
    p_payload: unknown;
  },
): Promise<
  MediaSyncCombinedProcessingCheckpointRpcResult
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

export async function saveNaverSearchAdsCombinedProcessingCheckpoint(
  input: {
    job:
      MediaSyncJobRecord;
    checkpoint:
      NaverSearchAdsCombinedProcessingCheckpoint;
  },
  dependencies:
    MediaSyncCombinedProcessingCheckpointDependencies = {},
): Promise<
  MediaSyncJobRecord
> {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_INPUT",
      "Combined checkpoint input is required.",
    );
  }

  validateJob(
    input.job,
  );

  const checkpoint =
    validateCheckpoint(
      input.job,
      input.checkpoint,
    );

  if (
    checkpoint.totalRows <
      input.job.inserted_rows
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "CHECKPOINT_REGRESSION",
      "The combined checkpoint cannot move behind the job counts.",
    );
  }

  const keywordCursor =
    checkpoint.keyword.cursor
      ? toSafeJsonObject(
          checkpoint.keyword.cursor,
          "checkpoint.keyword.cursor",
        )
      : {};

  const authoritativeCursor =
    checkpoint.authoritative.cursor
      ? toSafeJsonObject(
          checkpoint.authoritative.cursor,
          "checkpoint.authoritative.cursor",
        )
      : null;

  const totalStatsRequestsAttempted =
    checkpoint.keyword.counts
      .statsRequestsAttempted +
    checkpoint.authoritative.counts
      .statsRequestsAttempted;

  const totalStatsRequestsSucceeded =
    checkpoint.keyword.counts
      .statsRequestsSucceeded +
    checkpoint.authoritative.counts
      .statsRequestsSucceeded;

  const totalRetryCount =
    checkpoint.keyword.counts
      .retryCount +
    checkpoint.authoritative.counts
      .retryCount;

  const payload = {
    job_id:
      input.job.id,

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
      checkpoint.totalRows,

    normalized_rows:
      checkpoint.totalRows,

    inserted_rows:
      checkpoint.totalRows,

    failed_rows:
      0,

    collector: {
      /*
       * Legacy keyword fields remain present so the existing SQL RPC and
       * keyword checkpoint reader keep their established contract.
       */
      discovered_keywords:
        checkpoint.keyword.counts
          .discovered,

      completed_keywords:
        checkpoint.keyword.counts
          .completed,

      stats_requests_attempted:
        totalStatsRequestsAttempted,

      stats_requests_succeeded:
        totalStatsRequestsSucceeded,

      retry_count:
        totalRetryCount,

      date_window_index:
        checkpoint.dateWindowIndex,

      cursor:
        keywordCursor,

      /*
       * Combined phase state is additive and does not replace legacy fields.
       */
      combined_version:
        1,

      phase:
        checkpoint.phase,

      next_row_index:
        checkpoint.nextRowIndex,

      keyword: {
        complete:
          checkpoint.keyword.complete,

        cursor:
          checkpoint.keyword.cursor
            ? keywordCursor
            : null,

        counts: {
          discovered:
            checkpoint.keyword.counts
              .discovered,

          completed:
            checkpoint.keyword.counts
              .completed,

          statsRequestsAttempted:
            checkpoint.keyword.counts
              .statsRequestsAttempted,

          statsRequestsSucceeded:
            checkpoint.keyword.counts
              .statsRequestsSucceeded,

          retryCount:
            checkpoint.keyword.counts
              .retryCount,
        },
      },

      authoritative: {
        complete:
          checkpoint.authoritative.complete,

        cursor:
          authoritativeCursor,

        counts: {
          discovered:
            checkpoint.authoritative.counts
              .discovered,

          completed:
            checkpoint.authoritative.counts
              .completed,

          statsRequestsAttempted:
            checkpoint.authoritative.counts
              .statsRequestsAttempted,

          statsRequestsSucceeded:
            checkpoint.authoritative.counts
              .statsRequestsSucceeded,

          retryCount:
            checkpoint.authoritative.counts
              .retryCount,
        },
      },
    },
  };

  assertSafeJsonValue(
    payload,
    "checkpoint payload",
    new Set<object>(),
  );

  const invokeRpc =
    dependencies.invokeRpc ??
    invokeDefaultRpc;

  let rpcResult:
    MediaSyncCombinedProcessingCheckpointRpcResult;

  try {
    rpcResult =
      await invokeRpc(
        SAVE_PROCESSING_CHECKPOINT_RPC,
        {
          p_payload:
            payload,
        },
      );
  } catch (error) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "DATABASE_ERROR",
      "The combined checkpoint repository could not access the database.",
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
    rpcResult.data.length !==
      1
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The combined checkpoint RPC returned an invalid result.",
    );
  }

  let updatedJob:
    MediaSyncJobRecord;

  try {
    updatedJob =
      parseMediaSyncJobRecord(
        rpcResult.data[0],
      );
  } catch (error) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The combined checkpoint RPC returned an invalid media sync job.",
      {
        cause:
          error,
      },
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
      checkpoint.totalRows ||
    updatedJob.normalized_rows !==
      checkpoint.totalRows ||
    updatedJob.inserted_rows !==
      checkpoint.totalRows ||
    updatedJob.failed_rows !==
      0
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The saved combined checkpoint job contains unexpected values.",
    );
  }

  const savedCheckpoint =
    readNaverSearchAdsCombinedProcessingCheckpoint(
      updatedJob,
    );

  if (
    savedCheckpoint.phase !==
      checkpoint.phase ||
    savedCheckpoint.nextRowIndex !==
      checkpoint.nextRowIndex ||
    savedCheckpoint.totalRows !==
      checkpoint.totalRows
  ) {
    throw new MediaSyncCombinedProcessingCheckpointError(
      "INVALID_DATABASE_RESULT",
      "The saved combined checkpoint state does not match the request.",
    );
  }

  return updatedJob;
}

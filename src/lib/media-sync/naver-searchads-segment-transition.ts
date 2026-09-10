import {
  completeCurrentMediaSyncSegment,
  parseMediaSyncSegmentProgress,
  type MediaSyncSegmentProgress,
} from "./media-sync-segment-progress";

import type {
  NaverSearchAdsCombinedCollectorCounts,
  NaverSearchAdsCombinedProcessingCheckpoint,
} from "./media-sync-combined-processing-checkpoint-repository";

export type NaverSearchAdsSegmentTransitionErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CHECKPOINT"
  | "CHECKPOINT_NOT_COMPLETED"
  | "SEGMENT_CHECKPOINT_MISMATCH";

export class NaverSearchAdsSegmentTransitionError
  extends Error {
  readonly code:
    NaverSearchAdsSegmentTransitionErrorCode;

  constructor(
    code:
      NaverSearchAdsSegmentTransitionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsSegmentTransitionError";

    this.code =
      code;
  }
}

export type NaverSearchAdsSegmentTransitionResult =
  | Readonly<{
      kind:
        "next_segment";

      progress:
        MediaSyncSegmentProgress;

      checkpoint:
        NaverSearchAdsCombinedProcessingCheckpoint;
    }>
  | Readonly<{
      kind:
        "all_segments_completed";

      progress:
        MediaSyncSegmentProgress;

      checkpoint:
        NaverSearchAdsCombinedProcessingCheckpoint;
    }>;

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

function requireNonNegativeSafeInteger(
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
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_CHECKPOINT",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function validateCompletedCheckpoint(
  checkpoint:
    NaverSearchAdsCombinedProcessingCheckpoint,
): void {
  if (
    !checkpoint ||
    typeof checkpoint !==
      "object" ||
    checkpoint.version !==
      1
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_CHECKPOINT",
      "A valid Naver combined checkpoint is required.",
    );
  }

  const dateWindowIndex =
    requireNonNegativeSafeInteger(
      checkpoint.dateWindowIndex,
      "checkpoint.dateWindowIndex",
    );

  const nextRowIndex =
    requireNonNegativeSafeInteger(
      checkpoint.nextRowIndex,
      "checkpoint.nextRowIndex",
    );

  const totalRows =
    requireNonNegativeSafeInteger(
      checkpoint.totalRows,
      "checkpoint.totalRows",
    );

  const failedRows =
    requireNonNegativeSafeInteger(
      checkpoint.failedRows,
      "checkpoint.failedRows",
    );

  if (
    dateWindowIndex !==
      checkpoint.dateWindowIndex ||
    nextRowIndex !==
      totalRows ||
    failedRows !==
      0
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_CHECKPOINT",
      "The completed Naver checkpoint row authority is inconsistent.",
    );
  }

  if (
    checkpoint.phase !==
      "completed" ||
    checkpoint.keyword.complete !==
      true ||
    checkpoint.authoritative.complete !==
      true
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "CHECKPOINT_NOT_COMPLETED",
      "The Naver segment checkpoint must be fully completed before transition.",
    );
  }
}

export function createNaverSearchAdsSegmentTransition(
  input: Readonly<{
    jobDateFrom: string;
    jobDateTo: string;

    progress:
      MediaSyncSegmentProgress;

    checkpoint:
      NaverSearchAdsCombinedProcessingCheckpoint;
  }>,
): NaverSearchAdsSegmentTransitionResult {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_INPUT",
      "Naver segment transition input is required.",
    );
  }

  let progress:
    MediaSyncSegmentProgress;

  try {
    progress =
      parseMediaSyncSegmentProgress(
        input.progress,
        {
          dateFrom:
            input.jobDateFrom,

          dateTo:
            input.jobDateTo,
        },
      );
  } catch (error) {
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_INPUT",
      "The Naver segment progress does not match the job date scope.",
      {
        cause:
          error,
      },
    );
  }

  if (
    progress.complete ||
    progress.currentIndex ===
      null
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_INPUT",
      "A completed segment progress state cannot transition again.",
    );
  }

  validateCompletedCheckpoint(
    input.checkpoint,
  );

  if (
    input.checkpoint
      .dateWindowIndex !==
    progress.currentIndex
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "SEGMENT_CHECKPOINT_MISMATCH",
      "The completed Naver checkpoint does not match the active sync segment.",
    );
  }

  const nextProgress =
    completeCurrentMediaSyncSegment({
      progress,

      dateFrom:
        input.jobDateFrom,

      dateTo:
        input.jobDateTo,
    });

  if (
    nextProgress.complete
  ) {
    return Object.freeze({
      kind:
        "all_segments_completed",

      progress:
        nextProgress,

      checkpoint:
        input.checkpoint,
    });
  }

  const nextDateWindowIndex =
    nextProgress.currentIndex;

  if (
    nextDateWindowIndex ===
      null
  ) {
    throw new NaverSearchAdsSegmentTransitionError(
      "INVALID_INPUT",
      "The next Naver segment index could not be resolved.",
    );
  }

  const boundary =
    input.checkpoint.totalRows;

  const nextCheckpoint:
    NaverSearchAdsCombinedProcessingCheckpoint = {
      version:
        1,

      phase:
        "keyword",

      dateWindowIndex:
        nextDateWindowIndex,

      nextRowIndex:
        boundary,

      totalRows:
        boundary,

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

  return Object.freeze({
    kind:
      "next_segment",

    progress:
      nextProgress,

    checkpoint:
      nextCheckpoint,
  });
}

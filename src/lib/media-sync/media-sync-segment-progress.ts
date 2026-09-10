import {
  MEDIA_SYNC_SEGMENT_MAX_DAYS,
  buildMediaSyncSegments,
  type MediaSyncSegment,
} from "./media-sync-segment-contract";

export const MEDIA_SYNC_SEGMENT_PROGRESS_CONTRACT =
  "sync_segment_v1" as const;

export const MEDIA_SYNC_SEGMENT_PROGRESS_VERSION =
  1 as const;

export type MediaSyncSegmentProgress =
  Readonly<{
    contract:
      typeof MEDIA_SYNC_SEGMENT_PROGRESS_CONTRACT;

    version:
      typeof MEDIA_SYNC_SEGMENT_PROGRESS_VERSION;

    dateFrom: string;
    dateTo: string;

    segmentDays:
      typeof MEDIA_SYNC_SEGMENT_MAX_DAYS;

    totalCount: number;
    completedCount: number;

    currentIndex:
      number |
      null;

    complete: boolean;
  }>;

export type MediaSyncSegmentProgressErrorCode =
  | "INVALID_INPUT"
  | "INVALID_PROGRESS"
  | "SCOPE_MISMATCH"
  | "ALREADY_COMPLETE";

export class MediaSyncSegmentProgressError
  extends Error {
  readonly code:
    MediaSyncSegmentProgressErrorCode;

  constructor(
    code:
      MediaSyncSegmentProgressErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      "MediaSyncSegmentProgressError";

    this.code =
      code;
  }
}

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
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
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      `${fieldName} must be a non-negative safe integer.`,
    );
  }

  return value;
}

function normalizeRange(
  input: Readonly<{
    dateFrom: string;
    dateTo: string;
  }>,
): Readonly<{
  dateFrom: string;
  dateTo: string;
  segments:
    readonly MediaSyncSegment[];
}> {
  let segments:
    readonly MediaSyncSegment[];

  try {
    segments =
      buildMediaSyncSegments({
        dateFrom:
          input.dateFrom,
        dateTo:
          input.dateTo,
      });
  } catch (error) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_INPUT",
      "The media sync segment progress range is invalid.",
    );
  }

  if (
    segments.length <
    1
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_INPUT",
      "The media sync segment range must contain at least one segment.",
    );
  }

  return Object.freeze({
    dateFrom:
      segments[0].dateFrom,
    dateTo:
      segments[
        segments.length -
        1
      ].dateTo,
    segments,
  });
}

function freezeProgress(
  progress:
    MediaSyncSegmentProgress,
): MediaSyncSegmentProgress {
  return Object.freeze({
    ...progress,
  });
}

export function createMediaSyncSegmentProgress(
  input: Readonly<{
    dateFrom: string;
    dateTo: string;
  }>,
): MediaSyncSegmentProgress {
  const range =
    normalizeRange(
      input,
    );

  return freezeProgress({
    contract:
      MEDIA_SYNC_SEGMENT_PROGRESS_CONTRACT,

    version:
      MEDIA_SYNC_SEGMENT_PROGRESS_VERSION,

    dateFrom:
      range.dateFrom,

    dateTo:
      range.dateTo,

    segmentDays:
      MEDIA_SYNC_SEGMENT_MAX_DAYS,

    totalCount:
      range.segments.length,

    completedCount:
      0,

    currentIndex:
      0,

    complete:
      false,
  });
}

export function parseMediaSyncSegmentProgress(
  value: unknown,
  expectedScope?: Readonly<{
    dateFrom: string;
    dateTo: string;
  }>,
): MediaSyncSegmentProgress {
  if (
    !isPlainObject(
      value,
    )
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "Media sync segment progress must be a plain object.",
    );
  }

  if (
    value.contract !==
      MEDIA_SYNC_SEGMENT_PROGRESS_CONTRACT ||
    value.version !==
      MEDIA_SYNC_SEGMENT_PROGRESS_VERSION ||
    value.segmentDays !==
      MEDIA_SYNC_SEGMENT_MAX_DAYS
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "Media sync segment progress contract metadata is invalid.",
    );
  }

  if (
    typeof value.dateFrom !==
      "string" ||
    typeof value.dateTo !==
      "string"
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "Media sync segment progress date scope is invalid.",
    );
  }

  const storedRange =
    normalizeRange({
      dateFrom:
        value.dateFrom,
      dateTo:
        value.dateTo,
    });

  if (
    storedRange.dateFrom !==
      value.dateFrom ||
    storedRange.dateTo !==
      value.dateTo
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "Media sync segment progress dates are not canonical.",
    );
  }

  if (
    expectedScope
  ) {
    const expectedRange =
      normalizeRange(
        expectedScope,
      );

    if (
      storedRange.dateFrom !==
        expectedRange.dateFrom ||
      storedRange.dateTo !==
        expectedRange.dateTo
    ) {
      throw new MediaSyncSegmentProgressError(
        "SCOPE_MISMATCH",
        "Media sync segment progress does not match the expected date scope.",
      );
    }
  }

  const totalCount =
    requireNonNegativeInteger(
      value.totalCount,
      "progress.totalCount",
    );

  const completedCount =
    requireNonNegativeInteger(
      value.completedCount,
      "progress.completedCount",
    );

  if (
    totalCount !==
      storedRange.segments.length ||
    totalCount <
      1 ||
    completedCount >
      totalCount
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "Media sync segment progress counts are inconsistent.",
    );
  }

  const complete =
    value.complete;

  if (
    typeof complete !==
      "boolean"
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "progress.complete must be boolean.",
    );
  }

  const currentIndex =
    value.currentIndex ===
      null
      ? null
      : requireNonNegativeInteger(
          value.currentIndex,
          "progress.currentIndex",
        );

  if (complete) {
    if (
      completedCount !==
        totalCount ||
      currentIndex !==
        null
    ) {
      throw new MediaSyncSegmentProgressError(
        "INVALID_PROGRESS",
        "Completed media sync segment progress is inconsistent.",
      );
    }
  } else {
    if (
      completedCount >=
        totalCount ||
      currentIndex ===
        null ||
      currentIndex !==
        completedCount ||
      currentIndex >=
        totalCount
    ) {
      throw new MediaSyncSegmentProgressError(
        "INVALID_PROGRESS",
        "Active media sync segment progress is inconsistent.",
      );
    }
  }

  return freezeProgress({
    contract:
      MEDIA_SYNC_SEGMENT_PROGRESS_CONTRACT,

    version:
      MEDIA_SYNC_SEGMENT_PROGRESS_VERSION,

    dateFrom:
      storedRange.dateFrom,

    dateTo:
      storedRange.dateTo,

    segmentDays:
      MEDIA_SYNC_SEGMENT_MAX_DAYS,

    totalCount,

    completedCount,

    currentIndex,

    complete,
  });
}

export function getCurrentMediaSyncSegment(
  input: Readonly<{
    progress:
      MediaSyncSegmentProgress;

    dateFrom: string;
    dateTo: string;
  }>,
): MediaSyncSegment | null {
  const progress =
    parseMediaSyncSegmentProgress(
      input.progress,
      {
        dateFrom:
          input.dateFrom,
        dateTo:
          input.dateTo,
      },
    );

  if (
    progress.complete
  ) {
    return null;
  }

  const segments =
    buildMediaSyncSegments({
      dateFrom:
        progress.dateFrom,
      dateTo:
        progress.dateTo,
    });

  const currentIndex =
    progress.currentIndex;

  if (
    currentIndex ===
      null ||
    !segments[
      currentIndex
    ]
  ) {
    throw new MediaSyncSegmentProgressError(
      "INVALID_PROGRESS",
      "The current media sync segment could not be resolved.",
    );
  }

  return segments[
    currentIndex
  ];
}

export function completeCurrentMediaSyncSegment(
  input: Readonly<{
    progress:
      MediaSyncSegmentProgress;

    dateFrom: string;
    dateTo: string;
  }>,
): MediaSyncSegmentProgress {
  const progress =
    parseMediaSyncSegmentProgress(
      input.progress,
      {
        dateFrom:
          input.dateFrom,
        dateTo:
          input.dateTo,
      },
    );

  if (
    progress.complete
  ) {
    throw new MediaSyncSegmentProgressError(
      "ALREADY_COMPLETE",
      "All media sync segments are already complete.",
    );
  }

  const completedCount =
    progress.completedCount +
    1;

  const complete =
    completedCount ===
    progress.totalCount;

  return freezeProgress({
    ...progress,

    completedCount,

    currentIndex:
      complete
        ? null
        : completedCount,

    complete,
  });
}

export function getMediaSyncSegmentCompletionPercent(
  progress:
    MediaSyncSegmentProgress,
): number {
  const normalized =
    parseMediaSyncSegmentProgress(
      progress,
    );

  return Math.floor(
    (
      normalized.completedCount /
      normalized.totalCount
    ) *
      100,
  );
}

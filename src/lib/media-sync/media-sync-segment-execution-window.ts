import {
  buildMediaSyncSegments,
} from "./media-sync-segment-contract";

export type MediaSyncSegmentExecutionWindow =
  Readonly<{
    dateFrom: string;
    dateTo: string;
  }>;

export type MediaSyncSegmentExecutionWindowErrorCode =
  | "INVALID_INPUT"
  | "INVALID_INDEX"
  | "SCOPE_MISMATCH";

export class MediaSyncSegmentExecutionWindowError
  extends Error {
  readonly code:
    MediaSyncSegmentExecutionWindowErrorCode;

  constructor(
    code:
      MediaSyncSegmentExecutionWindowErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      "MediaSyncSegmentExecutionWindowError";

    this.code =
      code;
  }
}

export function resolveMediaSyncSegmentExecutionWindow(
  input: Readonly<{
    jobDateFrom: string;
    jobDateTo: string;

    dateWindowIndex: number;

    executionDateFrom?: string;
    executionDateTo?: string;
  }>,
): MediaSyncSegmentExecutionWindow {
  if (
    !Number.isSafeInteger(
      input.dateWindowIndex,
    ) ||
    input.dateWindowIndex < 0
  ) {
    throw new MediaSyncSegmentExecutionWindowError(
      "INVALID_INDEX",
      "dateWindowIndex must be a non-negative safe integer.",
    );
  }

  const hasExecutionDateFrom =
    input.executionDateFrom !==
    undefined;

  const hasExecutionDateTo =
    input.executionDateTo !==
    undefined;

  if (
    hasExecutionDateFrom !==
    hasExecutionDateTo
  ) {
    throw new MediaSyncSegmentExecutionWindowError(
      "INVALID_INPUT",
      "executionDateFrom and executionDateTo must be provided together.",
    );
  }

  if (
    !hasExecutionDateFrom &&
    !hasExecutionDateTo
  ) {
    return Object.freeze({
      dateFrom:
        input.jobDateFrom,

      dateTo:
        input.jobDateTo,
    });
  }

  const segments =
    buildMediaSyncSegments({
      dateFrom:
        input.jobDateFrom,

      dateTo:
        input.jobDateTo,
    });

  const expected =
    segments[
      input.dateWindowIndex
    ];

  if (!expected) {
    throw new MediaSyncSegmentExecutionWindowError(
      "INVALID_INDEX",
      "The requested sync segment does not exist in the job date range.",
    );
  }

  if (
    input.executionDateFrom !==
      expected.dateFrom ||
    input.executionDateTo !==
      expected.dateTo
  ) {
    throw new MediaSyncSegmentExecutionWindowError(
      "SCOPE_MISMATCH",
      "The requested execution date window does not match the canonical sync segment.",
    );
  }

  return Object.freeze({
    dateFrom:
      expected.dateFrom,

    dateTo:
      expected.dateTo,
  });
}

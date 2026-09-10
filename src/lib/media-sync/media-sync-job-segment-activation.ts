import {
  createMediaSyncSegmentProgress,
  type MediaSyncSegmentProgress,
} from "./media-sync-segment-progress";
import {
  isMediaSyncSegmentEligibleReport,
} from "./media-sync-segment-eligibility";

import type {
  MediaProvider,
} from "./types";

export function buildInitialMediaSyncSegmentProgressForJob(
  input: Readonly<{
    provider:
      MediaProvider;

    reportMeta:
      unknown;

    dateFrom:
      string;

    dateTo:
      string;

    deterministicJobId:
      string | null;
  }>,
): MediaSyncSegmentProgress | null {
  /*
   * Deterministic job ids are currently reserved for internal
   * scheduler/idempotency flows such as the one-day Naver daily
   * incremental job. Those existing flows must remain byte-for-
   * behavior compatible and are not segment-managed here.
   */
  if (
    input.deterministicJobId !==
      null
  ) {
    return null;
  }

  if (
    !isMediaSyncSegmentEligibleReport({
      provider:
        input.provider,

      reportMeta:
        input.reportMeta,
    })
  ) {
    return null;
  }

  return createMediaSyncSegmentProgress({
    dateFrom:
      input.dateFrom,

    dateTo:
      input.dateTo,
  });
}

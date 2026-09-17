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

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isCanonicalMonthlyNaverManualJob(
  input: Readonly<{
    provider: MediaProvider;
    reportMeta: unknown;
  }>,
): boolean {
  if (
    input.provider !==
      "naver_searchad" ||
    !isPlainObject(
      input.reportMeta,
    ) ||
    input.reportMeta
      .url_contract_version !==
      2
  ) {
    return false;
  }

  const identity =
    input.reportMeta
      .public_identity;

  return (
    isPlainObject(
      identity,
    ) &&
    identity.source_type ===
      "api" &&
    identity.period_type ===
      "monthly"
  );
}

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

  /*
   * Canonical Naver monthly jobs are at most 31 days. Run new manual
   * monthly jobs as one execution window to avoid repeating the same
   * hierarchy/entity traversal once per 7-day segment. Longer periods
   * keep the existing segmented safety contract. Existing jobs with
   * persisted sync_segment_progress remain unchanged.
   */
  if (
    isCanonicalMonthlyNaverManualJob({
      provider:
        input.provider,
      reportMeta:
        input.reportMeta,
    })
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

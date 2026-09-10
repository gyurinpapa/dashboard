import {
  createMediaSyncSegmentProgress,
  type MediaSyncSegmentProgress,
} from "./media-sync-segment-progress";

import type {
  MediaProvider,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const SEGMENT_ELIGIBLE_PERIOD_TYPES =
  new Set([
    "monthly",
    "quarterly",
    "yearly",
    "cumulative",
  ] as const);

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
  if (
    input.provider !==
      NAVER_SEARCH_ADS_PROVIDER
  ) {
    return null;
  }

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
    !isPlainObject(
      input.reportMeta,
    )
  ) {
    return null;
  }

  if (
    input.reportMeta
      .url_contract_version !==
      2
  ) {
    return null;
  }

  const identity =
    input.reportMeta
      .public_identity;

  if (
    !isPlainObject(
      identity,
    )
  ) {
    return null;
  }

  if (
    identity.source_type !==
      "api"
  ) {
    return null;
  }

  const periodType =
    identity.period_type;

  if (
    typeof periodType !==
      "string" ||
    !SEGMENT_ELIGIBLE_PERIOD_TYPES.has(
      periodType as
        | "monthly"
        | "quarterly"
        | "yearly"
        | "cumulative",
    )
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

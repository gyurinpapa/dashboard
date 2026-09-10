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

export function isMediaSyncSegmentEligibleReport(
  input: Readonly<{
    provider:
      MediaProvider |
      null |
      undefined;

    reportMeta:
      unknown;
  }>,
): boolean {
  if (
    input.provider !==
      NAVER_SEARCH_ADS_PROVIDER
  ) {
    return false;
  }

  if (
    !isPlainObject(
      input.reportMeta,
    )
  ) {
    return false;
  }

  if (
    input.reportMeta
      .url_contract_version !==
      2
  ) {
    return false;
  }

  const identity =
    input.reportMeta
      .public_identity;

  if (
    !isPlainObject(
      identity,
    )
  ) {
    return false;
  }

  if (
    identity.source_type !==
      "api"
  ) {
    return false;
  }

  const periodType =
    identity.period_type;

  if (
    typeof periodType !==
      "string"
  ) {
    return false;
  }

  return SEGMENT_ELIGIBLE_PERIOD_TYPES.has(
    periodType as
      | "monthly"
      | "quarterly"
      | "yearly"
      | "cumulative",
  );
}

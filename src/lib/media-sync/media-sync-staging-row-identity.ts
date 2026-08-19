import {
  isValidYmd,
  type EtrylueNormalizedMediaRow,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const NAVER_AUTHORITATIVE_ROW_KEY_NAMESPACE =
  "naver_searchad_authoritative_v1" as const;

export type MediaSyncStagingRowIdentityErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PROVIDER"
  | "UNSUPPORTED_ROW_LEVEL";

export class MediaSyncStagingRowIdentityError extends Error {
  readonly code:
    MediaSyncStagingRowIdentityErrorCode;

  constructor(
    code:
      MediaSyncStagingRowIdentityErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "MediaSyncStagingRowIdentityError";

    this.code =
      code;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string") {
    throw new MediaSyncStagingRowIdentityError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new MediaSyncStagingRowIdentityError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new MediaSyncStagingRowIdentityError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeRowDate(
  value: unknown,
): string {
  const date =
    normalizeRequiredString(
      value,
      "row.date",
      10,
    );

  if (!isValidYmd(date)) {
    throw new MediaSyncStagingRowIdentityError(
      "INVALID_INPUT",
      "row.date must be a valid YYYY-MM-DD date.",
    );
  }

  return date;
}

function assertMatchingDataLevel(
  row: EtrylueNormalizedMediaRow,
): void {
  if (
    row.row_level !==
    row.data_level
  ) {
    throw new MediaSyncStagingRowIdentityError(
      "INVALID_INPUT",
      "row.row_level and row.data_level must match before staging identity is created.",
    );
  }
}

/**
 * Deterministic natural key for one canonical staging row.
 *
 * Compatibility contract:
 * - keyword rows keep the exact pre-existing JSON-array encoding.
 * - authoritative creative/mixed rows use a namespaced encoding so they
 *   cannot collide with legacy keyword rows or with each other.
 * - metrics and display names are intentionally excluded.
 */
export function buildMediaSyncStagingRowKey(
  row: EtrylueNormalizedMediaRow,
): string {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw new MediaSyncStagingRowIdentityError(
      "INVALID_INPUT",
      "A canonical media row is required.",
    );
  }

  const provider =
    normalizeRequiredString(
      row.provider,
      "row.provider",
      100,
    );

  if (
    provider !==
      NAVER_SEARCH_ADS_PROVIDER &&
    provider !==
      GOOGLE_ADS_PROVIDER
  ) {
    throw new MediaSyncStagingRowIdentityError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads and Google Ads staging row identity is supported at this stage.",
    );
  }

  assertMatchingDataLevel(
    row,
  );

  if (
    provider ===
      GOOGLE_ADS_PROVIDER &&
    row.row_level !==
      "keyword"
  ) {
    throw new MediaSyncStagingRowIdentityError(
      "UNSUPPORTED_ROW_LEVEL",
      "Only Google Ads keyword rows can create staging identity at this stage.",
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      row.external_account_id,
      "row.external_account_id",
      500,
    );

  const externalCampaignId =
    normalizeRequiredString(
      row.external_campaign_id,
      "row.external_campaign_id",
    );

  const externalGroupId =
    normalizeRequiredString(
      row.external_group_id,
      "row.external_group_id",
    );

  const date =
    normalizeRowDate(
      row.date,
    );

  if (
    row.row_level ===
    "keyword"
  ) {
    const externalKeywordId =
      normalizeRequiredString(
        row.external_keyword_id,
        "row.external_keyword_id",
      );

    /*
     * Do not alter this array. It is the existing keyword row_key contract.
     */
    return JSON.stringify([
      provider,
      externalAccountId,
      externalCampaignId,
      externalGroupId,
      externalKeywordId,
      date,
    ]);
  }

  if (
    row.row_level ===
    "creative"
  ) {
    const externalCreativeId =
      normalizeRequiredString(
        row[
          "external_creative_id"
        ],
        "row.external_creative_id",
      );

    return JSON.stringify([
      NAVER_AUTHORITATIVE_ROW_KEY_NAMESPACE,
      "creative",
      provider,
      externalAccountId,
      externalCampaignId,
      externalGroupId,
      externalCreativeId,
      date,
    ]);
  }

  if (
    row.row_level ===
    "mixed"
  ) {
    return JSON.stringify([
      NAVER_AUTHORITATIVE_ROW_KEY_NAMESPACE,
      "mixed",
      provider,
      externalAccountId,
      externalCampaignId,
      externalGroupId,
      date,
    ]);
  }

  throw new MediaSyncStagingRowIdentityError(
    "UNSUPPORTED_ROW_LEVEL",
    "Only keyword, creative, and mixed Naver Search Ads rows can create staging identity.",
  );
}

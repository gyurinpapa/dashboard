// src/lib/media-sync/google-ads-canonical-row.ts

import {
  isValidYmd,
  type EtrylueNormalizedMediaRow,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_INGESTION_SOURCE =
  "api" as const;

const GOOGLE_ADS_ROW_LEVEL =
  "keyword" as const;

export const GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON =
  "google_ads_keyword_daily_stats" as const;

export const GOOGLE_ADS_CANONICAL_DEFAULT_CHANNEL =
  "검색광고";

export const GOOGLE_ADS_CANONICAL_DEFAULT_SOURCE =
  "Google Ads";

export const GOOGLE_ADS_CANONICAL_DEFAULT_PLATFORM =
  "Google";

export const GOOGLE_ADS_CANONICAL_DEFAULT_DEVICE =
  "";

export type GoogleAdsCanonicalRowErrorCode =
  | "INVALID_INPUT"
  | "SCOPE_MISMATCH"
  | "INVALID_STATS_RECORD"
  | "DUPLICATE_DATE";

export class GoogleAdsCanonicalRowError extends Error {
  readonly code: GoogleAdsCanonicalRowErrorCode;

  constructor(
    code: GoogleAdsCanonicalRowErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "GoogleAdsCanonicalRowError";

    this.code =
      code;
  }
}

export type GoogleAdsCanonicalCampaign = Readonly<{
  id: string;
  name: string;
}>;

export type GoogleAdsCanonicalAdGroup = Readonly<{
  id: string;
  campaignId: string;
  name: string;
}>;

export type GoogleAdsCanonicalKeyword = Readonly<{
  id: string;
  adGroupId: string;
  text: string;
}>;

export type GoogleAdsKeywordDailyStatsRecord =
  Readonly<{
    date: string;
    keywordId: string;

    /**
     * Canonical metric values.
     *
     * Google-specific wire-format conversion such as cost_micros -> cost
     * belongs to the future Google Ads API collector, not this mapper.
     */
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
  }>;

export type ConvertGoogleAdsKeywordDailyStatsToCanonicalRowsInput =
  Readonly<{
    externalAccountId: string;
    campaign: GoogleAdsCanonicalCampaign;
    adGroup: GoogleAdsCanonicalAdGroup;
    keyword: GoogleAdsCanonicalKeyword;
    records: readonly GoogleAdsKeywordDailyStatsRecord[];
  }>;

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeMetric(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      `${fieldName} must be a finite non-negative number.`,
    );
  }

  return value;
}

function normalizeDate(
  value: unknown,
  fieldName: string,
): string {
  const date =
    normalizeRequiredString(
      value,
      fieldName,
      10,
    );

  if (!isValidYmd(date)) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return date;
}

function assertHierarchyScope(input: {
  campaignId: string;
  adGroupId: string;
  adGroupCampaignId: unknown;
  keywordAdGroupId: unknown;
}): void {
  const adGroupCampaignId =
    normalizeRequiredString(
      input.adGroupCampaignId,
      "adGroup.campaignId",
    );

  if (adGroupCampaignId !== input.campaignId) {
    throw new GoogleAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Google Ads ad group does not belong to the supplied campaign.",
    );
  }

  const keywordAdGroupId =
    normalizeRequiredString(
      input.keywordAdGroupId,
      "keyword.adGroupId",
    );

  if (keywordAdGroupId !== input.adGroupId) {
    throw new GoogleAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Google Ads keyword does not belong to the supplied ad group.",
    );
  }
}

function normalizeStatsRecord(input: {
  record: unknown;
  rowIndex: number;
  keywordId: string;
}): {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
} {
  const {
    record,
    rowIndex,
    keywordId,
  } = input;

  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      `records[${rowIndex}] must be an object.`,
    );
  }

  const typedRecord =
    record as GoogleAdsKeywordDailyStatsRecord;

  const recordKeywordId =
    normalizeRequiredString(
      typedRecord.keywordId,
      `records[${rowIndex}].keywordId`,
    );

  if (recordKeywordId !== keywordId) {
    throw new GoogleAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      `records[${rowIndex}] belongs to a different keyword.`,
    );
  }

  return {
    date:
      normalizeDate(
        typedRecord.date,
        `records[${rowIndex}].date`,
      ),

    impressions:
      normalizeMetric(
        typedRecord.impressions,
        `records[${rowIndex}].impressions`,
      ),

    clicks:
      normalizeMetric(
        typedRecord.clicks,
        `records[${rowIndex}].clicks`,
      ),

    cost:
      normalizeMetric(
        typedRecord.cost,
        `records[${rowIndex}].cost`,
      ),

    conversions:
      normalizeMetric(
        typedRecord.conversions,
        `records[${rowIndex}].conversions`,
      ),

    revenue:
      normalizeMetric(
        typedRecord.revenue,
        `records[${rowIndex}].revenue`,
      ),
  };
}

export function convertGoogleAdsKeywordDailyStatsToCanonicalRows(
  input: ConvertGoogleAdsKeywordDailyStatsToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_INPUT",
      "Google Ads canonical row conversion input is required.",
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      input.externalAccountId,
      "externalAccountId",
      500,
    );

  const campaignId =
    normalizeRequiredString(
      input.campaign?.id,
      "campaign.id",
    );

  const campaignName =
    normalizeRequiredString(
      input.campaign?.name,
      "campaign.name",
    );

  const adGroupId =
    normalizeRequiredString(
      input.adGroup?.id,
      "adGroup.id",
    );

  const adGroupName =
    normalizeRequiredString(
      input.adGroup?.name,
      "adGroup.name",
    );

  const keywordId =
    normalizeRequiredString(
      input.keyword?.id,
      "keyword.id",
    );

  const keywordName =
    normalizeRequiredString(
      input.keyword?.text,
      "keyword.text",
    );

  assertHierarchyScope({
    campaignId,
    adGroupId,
    adGroupCampaignId:
      input.adGroup?.campaignId,
    keywordAdGroupId:
      input.keyword?.adGroupId,
  });

  if (!Array.isArray(input.records)) {
    throw new GoogleAdsCanonicalRowError(
      "INVALID_INPUT",
      "records must be an array.",
    );
  }

  const seenDates =
    new Set<string>();

  const rows =
    input.records.map(
      (
        record,
        rowIndex,
      ) => {
        const metrics =
          normalizeStatsRecord({
            record,
            rowIndex,
            keywordId,
          });

        if (seenDates.has(metrics.date)) {
          throw new GoogleAdsCanonicalRowError(
            "DUPLICATE_DATE",
            "The Google Ads stats input contains more than one row for the same keyword and date.",
          );
        }

        seenDates.add(metrics.date);

        return {
          date:
            metrics.date,
          report_date:
            metrics.date,
          day:
            metrics.date,
          ymd:
            metrics.date,

          channel:
            GOOGLE_ADS_CANONICAL_DEFAULT_CHANNEL,
          source:
            GOOGLE_ADS_CANONICAL_DEFAULT_SOURCE,
          platform:
            GOOGLE_ADS_CANONICAL_DEFAULT_PLATFORM,

          /**
           * Initial Google Ads contract is intentionally not device-segmented.
           * Device segmentation must not be introduced before the staging
           * identity contract is explicitly extended for that grain.
           */
          device:
            GOOGLE_ADS_CANONICAL_DEFAULT_DEVICE,

          campaign:
            campaignName,
          campaign_name:
            campaignName,

          group:
            adGroupName,
          group_name:
            adGroupName,
          adgroup_name:
            adGroupName,

          keyword:
            keywordName,
          keyword_name:
            keywordName,

          impressions:
            metrics.impressions,
          clicks:
            metrics.clicks,
          cost:
            metrics.cost,
          conversions:
            metrics.conversions,
          revenue:
            metrics.revenue,

          row_level:
            GOOGLE_ADS_ROW_LEVEL,
          data_level:
            GOOGLE_ADS_ROW_LEVEL,
          row_level_reason:
            GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON,

          provider:
            GOOGLE_ADS_PROVIDER,
          ingestion_source:
            GOOGLE_ADS_INGESTION_SOURCE,

          external_account_id:
            externalAccountId,
          external_campaign_id:
            campaignId,
          external_group_id:
            adGroupId,
          external_keyword_id:
            keywordId,
        } satisfies EtrylueNormalizedMediaRow;
      },
    );

  rows.sort(
    (
      left,
      right,
    ) =>
      left.date.localeCompare(
        right.date,
      ),
  );

  return rows;
}

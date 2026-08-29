import {
  buildGoogleAdsAuthorityProviderMeta,
} from "./google-ads-authoritative-grain";
import {
  GOOGLE_ADS_CANONICAL_DEFAULT_CHANNEL,
  GOOGLE_ADS_CANONICAL_DEFAULT_DEVICE,
  GOOGLE_ADS_CANONICAL_DEFAULT_PLATFORM,
  GOOGLE_ADS_CANONICAL_DEFAULT_SOURCE,
} from "./google-ads-canonical-row";
import {
  isValidYmd,
  type EtrylueNormalizedMediaRow,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_INGESTION_SOURCE =
  "api" as const;

const GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL =
  "creative" as const;

export const GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL_REASON =
  "google_ads_demand_gen_ad_daily_stats" as const;

export type GoogleAdsDemandGenAdCanonicalRowErrorCode =
  | "INVALID_INPUT"
  | "SCOPE_MISMATCH"
  | "INVALID_STATS_RECORD"
  | "DUPLICATE_DATE";

export class GoogleAdsDemandGenAdCanonicalRowError
  extends Error {
  readonly code:
    GoogleAdsDemandGenAdCanonicalRowErrorCode;

  constructor(
    code:
      GoogleAdsDemandGenAdCanonicalRowErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsDemandGenAdCanonicalRowError";

    this.code =
      code;
  }
}

export type GoogleAdsDemandGenAdCanonicalCampaign =
  Readonly<{
    id: string;
    name: string;
  }>;

export type GoogleAdsDemandGenAdCanonicalAdGroup =
  Readonly<{
    id: string;
    campaignId: string;
    name: string;
  }>;

export type GoogleAdsDemandGenAdCanonicalAd =
  Readonly<{
    id: string;
    adGroupId: string;
  }>;

export type GoogleAdsDemandGenAdDailyStatsRecord =
  Readonly<{
    date: string;
    adId: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
  }>;

export type ConvertGoogleAdsDemandGenAdDailyStatsToCanonicalRowsInput =
  Readonly<{
    externalAccountId: string;
    campaign:
      GoogleAdsDemandGenAdCanonicalCampaign;
    adGroup:
      GoogleAdsDemandGenAdCanonicalAdGroup;
    ad:
      GoogleAdsDemandGenAdCanonicalAd;
    records:
      readonly GoogleAdsDemandGenAdDailyStatsRecord[];
  }>;

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength =
    2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > maxLength
  ) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} is invalid.`,
    );
  }

  return normalized;
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
    throw new GoogleAdsDemandGenAdCanonicalRowError(
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
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "INVALID_STATS_RECORD",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return date;
}

function assertHierarchyScope(
  input: Readonly<{
    campaignId: string;
    adGroupId: string;
    adGroupCampaignId: unknown;
    adId: string;
    adAdGroupId: unknown;
  }>,
): void {
  const adGroupCampaignId =
    normalizeRequiredString(
      input.adGroupCampaignId,
      "adGroup.campaignId",
    );

  if (
    adGroupCampaignId !==
    input.campaignId
  ) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Google Ads ad group does not belong to the supplied campaign.",
    );
  }

  const adAdGroupId =
    normalizeRequiredString(
      input.adAdGroupId,
      "ad.adGroupId",
    );

  if (
    adAdGroupId !==
    input.adGroupId
  ) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Google Ads ad does not belong to the supplied ad group.",
    );
  }
}

function normalizeStatsRecord(
  input: Readonly<{
    record: unknown;
    rowIndex: number;
    adId: string;
  }>,
): Readonly<{
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
}> {
  const {
    record,
    rowIndex,
    adId,
  } = input;

  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "INVALID_STATS_RECORD",
      `records[${rowIndex}] must be an object.`,
    );
  }

  const typedRecord =
    record as GoogleAdsDemandGenAdDailyStatsRecord;

  const recordAdId =
    normalizeRequiredString(
      typedRecord.adId,
      `records[${rowIndex}].adId`,
    );

  if (
    recordAdId !==
    adId
  ) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "SCOPE_MISMATCH",
      `records[${rowIndex}] belongs to a different ad.`,
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

export function convertGoogleAdsDemandGenAdDailyStatsToCanonicalRows(
  input:
    ConvertGoogleAdsDemandGenAdDailyStatsToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "INVALID_INPUT",
      "Google Ads Demand Gen ad canonical row conversion input is required.",
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

  const adId =
    normalizeRequiredString(
      input.ad?.id,
      "ad.id",
    );

  assertHierarchyScope({
    campaignId,
    adGroupId,
    adGroupCampaignId:
      input.adGroup?.campaignId,
    adId,
    adAdGroupId:
      input.ad?.adGroupId,
  });

  if (!Array.isArray(input.records)) {
    throw new GoogleAdsDemandGenAdCanonicalRowError(
      "INVALID_INPUT",
      "records must be an array.",
    );
  }

  const providerMeta =
    buildGoogleAdsAuthorityProviderMeta({
      campaignType:
        "DEMAND_GEN",
      entityType:
        "ad",
      entityId:
        adId,
    });

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
            adId,
          });

        if (
          seenDates.has(
            metrics.date,
          )
        ) {
          throw new GoogleAdsDemandGenAdCanonicalRowError(
            "DUPLICATE_DATE",
            "The Google Ads Demand Gen ad stats input contains more than one row for the same ad and date.",
          );
        }

        seenDates.add(
          metrics.date,
        );

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

          creative:
            adId,
          creative_name:
            adId,

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
            GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL,
          data_level:
            GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL,
          row_level_reason:
            GOOGLE_ADS_DEMAND_GEN_AD_ROW_LEVEL_REASON,

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
          external_creative_id:
            adId,

          provider_meta:
            providerMeta,
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

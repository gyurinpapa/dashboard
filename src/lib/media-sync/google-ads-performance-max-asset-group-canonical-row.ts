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

/*
 * Etrylue's public report data-level contract remains
 * keyword | creative | mixed | unknown.
 *
 * PMAX asset_group is therefore transported as a creative-level
 * report row while provider_meta retains the real authority:
 *
 * product_family      = performance_max
 * authoritative_grain = asset_group
 * entity_type          = asset_group
 */
const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL =
  "creative" as const;

export const GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL_REASON =
  "google_ads_performance_max_asset_group_daily_stats" as const;

export type GoogleAdsPerformanceMaxAssetGroupCanonicalRowErrorCode =
  | "INVALID_INPUT"
  | "SCOPE_MISMATCH"
  | "INVALID_STATS_RECORD"
  | "DUPLICATE_DATE";

export class GoogleAdsPerformanceMaxAssetGroupCanonicalRowError
  extends Error {
  readonly code:
    GoogleAdsPerformanceMaxAssetGroupCanonicalRowErrorCode;

  constructor(
    code:
      GoogleAdsPerformanceMaxAssetGroupCanonicalRowErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "GoogleAdsPerformanceMaxAssetGroupCanonicalRowError";

    this.code =
      code;
  }
}

export type GoogleAdsPerformanceMaxAssetGroupCanonicalCampaign =
  Readonly<{
    id: string;
    name: string;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupCanonicalAssetGroup =
  Readonly<{
    id: string;
    campaignId: string;
    name: string;
  }>;

export type GoogleAdsPerformanceMaxAssetGroupDailyStatsRecord =
  Readonly<{
    date: string;
    assetGroupId: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
  }>;

export type ConvertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRowsInput =
  Readonly<{
    externalAccountId: string;

    campaign:
      GoogleAdsPerformanceMaxAssetGroupCanonicalCampaign;

    assetGroup:
      GoogleAdsPerformanceMaxAssetGroupCanonicalAssetGroup;

    records:
      readonly GoogleAdsPerformanceMaxAssetGroupDailyStatsRecord[];
  }>;

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength =
    2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
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
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
      "INVALID_STATS_RECORD",
      `${fieldName} must be a valid YYYY-MM-DD date.`,
    );
  }

  return date;
}

function assertHierarchyScope(
  input: Readonly<{
    campaignId: string;
    assetGroupCampaignId: unknown;
  }>,
): void {
  const assetGroupCampaignId =
    normalizeRequiredString(
      input.assetGroupCampaignId,
      "assetGroup.campaignId",
    );

  if (
    assetGroupCampaignId !==
    input.campaignId
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Google Ads Performance Max asset group does not belong to the supplied campaign.",
    );
  }
}

function normalizeStatsRecord(
  input: Readonly<{
    record: unknown;
    rowIndex: number;
    assetGroupId: string;
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
    assetGroupId,
  } = input;

  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
      "INVALID_STATS_RECORD",
      `records[${rowIndex}] must be an object.`,
    );
  }

  const typedRecord =
    record as
      GoogleAdsPerformanceMaxAssetGroupDailyStatsRecord;

  const recordAssetGroupId =
    normalizeRequiredString(
      typedRecord.assetGroupId,
      `records[${rowIndex}].assetGroupId`,
    );

  if (
    recordAssetGroupId !==
    assetGroupId
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
      "SCOPE_MISMATCH",
      `records[${rowIndex}] belongs to a different asset group.`,
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

export function convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows(
  input:
    ConvertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
      "INVALID_INPUT",
      "Google Ads Performance Max asset-group canonical row conversion input is required.",
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

  const assetGroupId =
    normalizeRequiredString(
      input.assetGroup?.id,
      "assetGroup.id",
    );

  const assetGroupName =
    normalizeRequiredString(
      input.assetGroup?.name,
      "assetGroup.name",
    );

  assertHierarchyScope({
    campaignId,
    assetGroupCampaignId:
      input.assetGroup?.campaignId,
  });

  if (!Array.isArray(input.records)) {
    throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
      "INVALID_INPUT",
      "records must be an array.",
    );
  }

  const providerMeta =
    buildGoogleAdsAuthorityProviderMeta({
      campaignType:
        "PERFORMANCE_MAX",
      entityType:
        "asset_group",
      entityId:
        assetGroupId,
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
            assetGroupId,
          });

        if (
          seenDates.has(
            metrics.date,
          )
        ) {
          throw new GoogleAdsPerformanceMaxAssetGroupCanonicalRowError(
            "DUPLICATE_DATE",
            "The Google Ads Performance Max asset-group stats input contains more than one row for the same asset group and date.",
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

          /*
           * Preserve existing report structure without adding
           * an asset_group row/data level.
           */
          group:
            assetGroupName,
          group_name:
            assetGroupName,
          adgroup_name:
            assetGroupName,

          creative:
            assetGroupName,
          creative_name:
            assetGroupName,

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
            GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL,
          data_level:
            GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL,
          row_level_reason:
            GOOGLE_ADS_PERFORMANCE_MAX_ASSET_GROUP_ROW_LEVEL_REASON,

          provider:
            GOOGLE_ADS_PROVIDER,
          ingestion_source:
            GOOGLE_ADS_INGESTION_SOURCE,

          external_account_id:
            externalAccountId,
          external_campaign_id:
            campaignId,

          /*
           * The existing report schema uses group/creative identities.
           * Both project the authoritative asset-group ID.
           */
          external_group_id:
            assetGroupId,
          external_ad_id:
            assetGroupId,
          external_creative_id:
            assetGroupId,

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

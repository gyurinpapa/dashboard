import type {
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsKeywordDailyStatsRecord,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
} from "./naver-searchads-api";
import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsEntityDailyStatsRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsStatsEntityType,
} from "./naver-searchads-api";
import {
  isValidMediaSyncDateRange,
  isValidYmd,
  type EtrylueNormalizedMediaRow,
  type JsonObject,
} from "./types";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const NAVER_SEARCH_ADS_INGESTION_SOURCE =
  "api" as const;

const NAVER_SEARCH_ADS_ROW_LEVEL =
  "keyword" as const;

const NAVER_SEARCH_ADS_ROW_LEVEL_REASON =
  "naver_searchad_registered_keyword_daily_stats" as const;

export const NAVER_SEARCH_ADS_CANONICAL_DEFAULT_CHANNEL =
  "검색광고";

export const NAVER_SEARCH_ADS_CANONICAL_DEFAULT_SOURCE =
  "네이버 검색광고";

export const NAVER_SEARCH_ADS_CANONICAL_DEFAULT_PLATFORM =
  "네이버";

export const NAVER_SEARCH_ADS_CANONICAL_DEFAULT_DEVICE =
  "";

export type NaverSearchAdsCanonicalRowErrorCode =
  | "INVALID_INPUT"
  | "SCOPE_MISMATCH"
  | "INVALID_STATS_RECORD"
  | "DUPLICATE_DATE";

export class NaverSearchAdsCanonicalRowError extends Error {
  readonly code: NaverSearchAdsCanonicalRowErrorCode;

  constructor(
    code: NaverSearchAdsCanonicalRowErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "NaverSearchAdsCanonicalRowError";
    this.code = code;
  }
}

export type NaverSearchAdsCanonicalDimensions = {
  channel?: string;
  source?: string;
  platform?: string;
  device?: string;
};

export type ConvertNaverKeywordDailyStatsToCanonicalRowsInput = {
  externalAccountId: string;

  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  keyword: NaverSearchAdsKeywordRecord;
  stats: NaverSearchAdsKeywordDailyStatsResult;

  dimensions?: NaverSearchAdsCanonicalDimensions;
};

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeDimension(
  value: unknown,
  fallback: string,
  fieldName: string,
): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must be a string when provided.`,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > 500) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeNullableMetric(
  value: number | null,
  fieldName: string,
): number {
  if (value === null) {
    return 0;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      `${fieldName} must be null or a non-negative finite number.`,
    );
  }

  return value;
}

function assertHierarchyScope(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  keyword: NaverSearchAdsKeywordRecord;
  stats: NaverSearchAdsKeywordDailyStatsResult;
}): void {
  if (
    input.adgroup.campaignId !==
    input.campaign.id
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver adgroup does not belong to the supplied campaign.",
    );
  }

  if (
    input.keyword.adgroupId !==
    input.adgroup.id
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver keyword does not belong to the supplied adgroup.",
    );
  }

  if (
    input.stats.keywordId !==
    input.keyword.id
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver stats result does not belong to the supplied keyword.",
    );
  }
}

function assertStatsResultRange(
  stats: NaverSearchAdsKeywordDailyStatsResult,
): void {
  if (
    !isValidMediaSyncDateRange(
      stats.dateFrom,
      stats.dateTo,
    )
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      "The Naver stats result date range is invalid.",
    );
  }
}

function normalizeStatsRecord(input: {
  record: NaverSearchAdsKeywordDailyStatsRecord;
  stats: NaverSearchAdsKeywordDailyStatsResult;
  keywordId: string;
}): {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  rank: number;
} {
  const { record, stats, keywordId } = input;

  if (
    record.keywordId !== keywordId
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "A Naver daily stats record belongs to a different keyword.",
    );
  }

  if (
    !isValidYmd(record.date) ||
    !isValidYmd(record.periodStart) ||
    !isValidYmd(record.periodEnd)
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver daily stats record contains an invalid date.",
    );
  }

  if (
    record.date !== record.periodStart ||
    record.date !== record.periodEnd
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver daily stats record must represent exactly one date.",
    );
  }

  if (
    record.date < stats.dateFrom ||
    record.date > stats.dateTo
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver daily stats record is outside the requested date range.",
    );
  }

  return {
    date: record.date,

    impressions:
      normalizeNullableMetric(
        record.impCnt,
        "impCnt",
      ),

    clicks:
      normalizeNullableMetric(
        record.clkCnt,
        "clkCnt",
      ),

    cost:
      normalizeNullableMetric(
        record.salesAmt,
        "salesAmt",
      ),

    conversions:
      normalizeNullableMetric(
        record.ccnt,
        "ccnt",
      ),

    revenue:
      normalizeNullableMetric(
        record.convAmt,
        "convAmt",
      ),

    rank:
      normalizeNullableMetric(
        record.avgRnk,
        "avgRnk",
      ),
  };
}

function buildProviderMeta(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  keyword: NaverSearchAdsKeywordRecord;
  periodStart: string;
  periodEnd: string;
}): JsonObject {
  return {
    provider: NAVER_SEARCH_ADS_PROVIDER,

    period_start:
      input.periodStart,
    period_end:
      input.periodEnd,

    campaign_type:
      input.campaign.campaignType,
    campaign_status:
      input.campaign.status,
    campaign_status_reason:
      input.campaign.statusReason,
    campaign_user_lock:
      input.campaign.userLock,

    adgroup_type:
      input.adgroup.adgroupType,
    adgroup_status:
      input.adgroup.status,
    adgroup_status_reason:
      input.adgroup.statusReason,
    adgroup_user_lock:
      input.adgroup.userLock,

    keyword_inspect_status:
      input.keyword.inspectStatus,
    keyword_status:
      input.keyword.status,
    keyword_status_reason:
      input.keyword.statusReason,
    keyword_user_lock:
      input.keyword.userLock,
    keyword_bid_amount:
      input.keyword.bidAmount,
    keyword_use_group_bid_amount:
      input.keyword.useGroupBidAmount,
  };
}

export function convertNaverKeywordDailyStatsToCanonicalRows(
  input: ConvertNaverKeywordDailyStatsToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      "Naver canonical row conversion input is required.",
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      input.externalAccountId,
      "externalAccountId",
      300,
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

  const adgroupId =
    normalizeRequiredString(
      input.adgroup?.id,
      "adgroup.id",
    );

  const adgroupName =
    normalizeRequiredString(
      input.adgroup?.name,
      "adgroup.name",
    );

  const keywordId =
    normalizeRequiredString(
      input.keyword?.id,
      "keyword.id",
    );

  const keywordName =
    normalizeRequiredString(
      input.keyword?.keyword,
      "keyword.keyword",
    );

  assertHierarchyScope({
    campaign:
      input.campaign,
    adgroup:
      input.adgroup,
    keyword:
      input.keyword,
    stats:
      input.stats,
  });

  assertStatsResultRange(
    input.stats,
  );

  const channel =
    normalizeDimension(
      input.dimensions?.channel,
      NAVER_SEARCH_ADS_CANONICAL_DEFAULT_CHANNEL,
      "dimensions.channel",
    );

  const source =
    normalizeDimension(
      input.dimensions?.source,
      NAVER_SEARCH_ADS_CANONICAL_DEFAULT_SOURCE,
      "dimensions.source",
    );

  const platform =
    normalizeDimension(
      input.dimensions?.platform,
      NAVER_SEARCH_ADS_CANONICAL_DEFAULT_PLATFORM,
      "dimensions.platform",
    );

  const device =
    normalizeDimension(
      input.dimensions?.device,
      NAVER_SEARCH_ADS_CANONICAL_DEFAULT_DEVICE,
      "dimensions.device",
    );

  const seenDates =
    new Set<string>();

  const rows =
    input.stats.records.map(
      (record) => {
        const metrics =
          normalizeStatsRecord({
            record,
            stats:
              input.stats,
            keywordId,
          });

        if (
          seenDates.has(metrics.date)
        ) {
          throw new NaverSearchAdsCanonicalRowError(
            "DUPLICATE_DATE",
            "The Naver stats result contains more than one row for the same keyword and date.",
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

          channel,
          source,
          platform,
          device,

          campaign:
            campaignName,
          campaign_name:
            campaignName,

          group:
            adgroupName,
          group_name:
            adgroupName,
          adgroup_name:
            adgroupName,

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

          rank:
            metrics.rank,

          row_level:
            NAVER_SEARCH_ADS_ROW_LEVEL,
          data_level:
            NAVER_SEARCH_ADS_ROW_LEVEL,
          row_level_reason:
            NAVER_SEARCH_ADS_ROW_LEVEL_REASON,

          provider:
            NAVER_SEARCH_ADS_PROVIDER,
          ingestion_source:
            NAVER_SEARCH_ADS_INGESTION_SOURCE,

          external_account_id:
            externalAccountId,
          external_campaign_id:
            campaignId,
          external_group_id:
            adgroupId,
          external_keyword_id:
            keywordId,

          provider_meta:
            buildProviderMeta({
              campaign:
                input.campaign,
              adgroup:
                input.adgroup,
              keyword:
                input.keyword,
              periodStart:
                record.periodStart,
              periodEnd:
                record.periodEnd,
            }),
        } satisfies EtrylueNormalizedMediaRow;
      },
    );

  rows.sort((left, right) =>
    left.date.localeCompare(
      right.date,
    ),
  );

  return rows;
}

const NAVER_SEARCH_ADS_SHOPPING_CAMPAIGN_TYPE =
  "SHOPPING" as const;

const NAVER_SEARCH_ADS_BRAND_SEARCH_CAMPAIGN_TYPE =
  "BRAND_SEARCH" as const;

const NAVER_SEARCH_ADS_SHOPPING_ROW_LEVEL =
  "creative" as const;

const NAVER_SEARCH_ADS_SHOPPING_ROW_LEVEL_REASON =
  "naver_searchad_shopping_ad_daily_stats" as const;

const NAVER_SEARCH_ADS_BRAND_SEARCH_ROW_LEVEL =
  "mixed" as const;

const NAVER_SEARCH_ADS_BRAND_SEARCH_ROW_LEVEL_REASON =
  "naver_searchad_brand_search_adgroup_daily_stats" as const;

export type ConvertNaverShoppingAdDailyStatsToCanonicalRowsInput = {
  externalAccountId: string;

  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  ad: NaverSearchAdsAdRecord;
  stats: NaverSearchAdsEntityDailyStatsResult;

  dimensions?: NaverSearchAdsCanonicalDimensions;
};

export type ConvertNaverBrandSearchAdgroupDailyStatsToCanonicalRowsInput = {
  externalAccountId: string;

  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  stats: NaverSearchAdsEntityDailyStatsResult;

  dimensions?: NaverSearchAdsCanonicalDimensions;
};

type NormalizedNaverEntityMetrics = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

type ResolvedNaverCanonicalDimensions = {
  channel: string;
  source: string;
  platform: string;
  device: string;
};

function resolveNaverCanonicalDimensions(
  dimensions:
    | NaverSearchAdsCanonicalDimensions
    | undefined,
): ResolvedNaverCanonicalDimensions {
  return {
    channel:
      normalizeDimension(
        dimensions?.channel,
        NAVER_SEARCH_ADS_CANONICAL_DEFAULT_CHANNEL,
        "dimensions.channel",
      ),
    source:
      normalizeDimension(
        dimensions?.source,
        NAVER_SEARCH_ADS_CANONICAL_DEFAULT_SOURCE,
        "dimensions.source",
      ),
    platform:
      normalizeDimension(
        dimensions?.platform,
        NAVER_SEARCH_ADS_CANONICAL_DEFAULT_PLATFORM,
        "dimensions.platform",
      ),
    device:
      normalizeDimension(
        dimensions?.device,
        NAVER_SEARCH_ADS_CANONICAL_DEFAULT_DEVICE,
        "dimensions.device",
      ),
  };
}

function normalizeOptionalStableString(
  value: unknown,
  fallback: string,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} must be a string or null.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue || fallback;
}

function assertEntityStatsResultRange(
  stats: NaverSearchAdsEntityDailyStatsResult,
): void {
  if (
    !stats ||
    typeof stats !== "object" ||
    !isValidMediaSyncDateRange(
      stats.dateFrom,
      stats.dateTo,
    )
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      "The Naver entity stats result date range is invalid.",
    );
  }

  if (!Array.isArray(stats.records)) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      "The Naver entity stats result records must be an array.",
    );
  }
}

function assertExpectedEntityStatsScope(input: {
  stats: NaverSearchAdsEntityDailyStatsResult;
  expectedEntityId: string;
  expectedEntityType: NaverSearchAdsStatsEntityType;
}): void {
  if (
    input.stats.entityType !==
    input.expectedEntityType
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      `The Naver stats result entityType must be ${input.expectedEntityType}.`,
    );
  }

  if (
    input.stats.entityId !==
    input.expectedEntityId
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver stats result belongs to a different entity.",
    );
  }
}

function normalizeEntityStatsRecord(input: {
  record: NaverSearchAdsEntityDailyStatsRecord;
  stats: NaverSearchAdsEntityDailyStatsResult;
  expectedEntityId: string;
  expectedEntityType: NaverSearchAdsStatsEntityType;
}): NormalizedNaverEntityMetrics {
  const {
    record,
    stats,
    expectedEntityId,
    expectedEntityType,
  } = input;

  if (
    !record ||
    typeof record !== "object"
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver entity daily stats record is required.",
    );
  }

  if (
    record.entityType !==
    expectedEntityType
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      `A Naver daily stats record entityType must be ${expectedEntityType}.`,
    );
  }

  if (
    record.entityId !==
    expectedEntityId
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "A Naver daily stats record belongs to a different entity.",
    );
  }

  if (
    !isValidYmd(record.date) ||
    !isValidYmd(record.periodStart) ||
    !isValidYmd(record.periodEnd)
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver entity daily stats record contains an invalid date.",
    );
  }

  if (
    record.date !==
      record.periodStart ||
    record.date !==
      record.periodEnd
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver entity daily stats record must represent exactly one date.",
    );
  }

  if (
    record.date < stats.dateFrom ||
    record.date > stats.dateTo
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_STATS_RECORD",
      "A Naver entity daily stats record is outside the requested date range.",
    );
  }

  return {
    date:
      record.date,
    impressions:
      normalizeNullableMetric(
        record.impCnt,
        "impCnt",
      ),
    clicks:
      normalizeNullableMetric(
        record.clkCnt,
        "clkCnt",
      ),
    cost:
      normalizeNullableMetric(
        record.salesAmt,
        "salesAmt",
      ),
    conversions:
      normalizeNullableMetric(
        record.ccnt,
        "ccnt",
      ),
    revenue:
      normalizeNullableMetric(
        record.convAmt,
        "convAmt",
      ),
  };
}

function assertShoppingAdHierarchyScope(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  ad: NaverSearchAdsAdRecord;
  stats: NaverSearchAdsEntityDailyStatsResult;
  adId: string;
}): void {
  if (
    input.campaign.campaignType !==
    NAVER_SEARCH_ADS_SHOPPING_CAMPAIGN_TYPE
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The shopping ad converter only accepts SHOPPING campaigns.",
    );
  }

  if (
    input.adgroup.campaignId !==
    input.campaign.id
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver adgroup does not belong to the supplied shopping campaign.",
    );
  }

  if (
    input.ad.adgroupId !==
    input.adgroup.id
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver ad does not belong to the supplied adgroup.",
    );
  }

  assertExpectedEntityStatsScope({
    stats:
      input.stats,
    expectedEntityId:
      input.adId,
    expectedEntityType:
      "ad",
  });
}

function assertBrandSearchAdgroupHierarchyScope(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  stats: NaverSearchAdsEntityDailyStatsResult;
  adgroupId: string;
}): void {
  if (
    input.campaign.campaignType !==
    NAVER_SEARCH_ADS_BRAND_SEARCH_CAMPAIGN_TYPE
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The brand-search adgroup converter only accepts BRAND_SEARCH campaigns.",
    );
  }

  if (
    input.adgroup.campaignId !==
    input.campaign.id
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "SCOPE_MISMATCH",
      "The Naver adgroup does not belong to the supplied brand-search campaign.",
    );
  }

  assertExpectedEntityStatsScope({
    stats:
      input.stats,
    expectedEntityId:
      input.adgroupId,
    expectedEntityType:
      "adgroup",
  });
}

function buildShoppingAdProviderMeta(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  ad: NaverSearchAdsAdRecord;
  periodStart: string;
  periodEnd: string;
}): JsonObject {
  return {
    provider:
      NAVER_SEARCH_ADS_PROVIDER,
    authoritative_grain:
      "ad",
    entity_type:
      "ad",
    entity_id:
      input.ad.id,

    period_start:
      input.periodStart,
    period_end:
      input.periodEnd,

    campaign_type:
      input.campaign.campaignType,
    campaign_status:
      input.campaign.status,
    campaign_status_reason:
      input.campaign.statusReason,
    campaign_user_lock:
      input.campaign.userLock,

    adgroup_type:
      input.adgroup.adgroupType,
    adgroup_status:
      input.adgroup.status,
    adgroup_status_reason:
      input.adgroup.statusReason,
    adgroup_user_lock:
      input.adgroup.userLock,

    ad_type:
      input.ad.type,
    ad_inspect_status:
      input.ad.inspectStatus,
    ad_status:
      input.ad.status,
    ad_status_reason:
      input.ad.statusReason,
    ad_user_lock:
      input.ad.userLock,
    ad_reference_key:
      input.ad.referenceKey,
  };
}

function buildBrandSearchAdgroupProviderMeta(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  periodStart: string;
  periodEnd: string;
}): JsonObject {
  return {
    provider:
      NAVER_SEARCH_ADS_PROVIDER,
    authoritative_grain:
      "adgroup",
    entity_type:
      "adgroup",
    entity_id:
      input.adgroup.id,

    period_start:
      input.periodStart,
    period_end:
      input.periodEnd,

    campaign_type:
      input.campaign.campaignType,
    campaign_status:
      input.campaign.status,
    campaign_status_reason:
      input.campaign.statusReason,
    campaign_user_lock:
      input.campaign.userLock,

    adgroup_type:
      input.adgroup.adgroupType,
    adgroup_status:
      input.adgroup.status,
    adgroup_status_reason:
      input.adgroup.statusReason,
    adgroup_user_lock:
      input.adgroup.userLock,
  };
}

export function convertNaverShoppingAdDailyStatsToCanonicalRows(
  input: ConvertNaverShoppingAdDailyStatsToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      "Naver shopping ad canonical row conversion input is required.",
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      input.externalAccountId,
      "externalAccountId",
      300,
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

  const adgroupId =
    normalizeRequiredString(
      input.adgroup?.id,
      "adgroup.id",
    );

  const adgroupName =
    normalizeRequiredString(
      input.adgroup?.name,
      "adgroup.name",
    );

  const adId =
    normalizeRequiredString(
      input.ad?.id,
      "ad.id",
    );

  normalizeRequiredString(
    input.ad?.type,
    "ad.type",
  );

  assertEntityStatsResultRange(
    input.stats,
  );

  assertShoppingAdHierarchyScope({
    campaign:
      input.campaign,
    adgroup:
      input.adgroup,
    ad:
      input.ad,
    stats:
      input.stats,
    adId,
  });

  const dimensions =
    resolveNaverCanonicalDimensions(
      input.dimensions,
    );

  const creativeName =
    normalizeOptionalStableString(
      input.ad.referenceKey,
      adId,
      "ad.referenceKey",
    );

  const seenDates =
    new Set<string>();

  const rows =
    input.stats.records.map(
      (record) => {
        const metrics =
          normalizeEntityStatsRecord({
            record,
            stats:
              input.stats,
            expectedEntityId:
              adId,
            expectedEntityType:
              "ad",
          });

        if (
          seenDates.has(
            metrics.date,
          )
        ) {
          throw new NaverSearchAdsCanonicalRowError(
            "DUPLICATE_DATE",
            "The Naver stats result contains more than one row for the same ad and date.",
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
            dimensions.channel,
          source:
            dimensions.source,
          platform:
            dimensions.platform,
          device:
            dimensions.device,

          campaign:
            campaignName,
          campaign_name:
            campaignName,

          group:
            adgroupName,
          group_name:
            adgroupName,
          adgroup_name:
            adgroupName,

          keyword:
            "",
          keyword_name:
            "",

          creative:
            creativeName,
          creative_name:
            creativeName,

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
            NAVER_SEARCH_ADS_SHOPPING_ROW_LEVEL,
          data_level:
            NAVER_SEARCH_ADS_SHOPPING_ROW_LEVEL,
          row_level_reason:
            NAVER_SEARCH_ADS_SHOPPING_ROW_LEVEL_REASON,

          provider:
            NAVER_SEARCH_ADS_PROVIDER,
          ingestion_source:
            NAVER_SEARCH_ADS_INGESTION_SOURCE,

          external_account_id:
            externalAccountId,
          external_campaign_id:
            campaignId,
          external_group_id:
            adgroupId,
          external_creative_id:
            adId,

          provider_meta:
            buildShoppingAdProviderMeta({
              campaign:
                input.campaign,
              adgroup:
                input.adgroup,
              ad:
                input.ad,
              periodStart:
                record.periodStart,
              periodEnd:
                record.periodEnd,
            }),
        } satisfies EtrylueNormalizedMediaRow;
      },
    );

  rows.sort((left, right) =>
    left.date.localeCompare(
      right.date,
    ),
  );

  return rows;
}

export function convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows(
  input: ConvertNaverBrandSearchAdgroupDailyStatsToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverSearchAdsCanonicalRowError(
      "INVALID_INPUT",
      "Naver brand-search adgroup canonical row conversion input is required.",
    );
  }

  const externalAccountId =
    normalizeRequiredString(
      input.externalAccountId,
      "externalAccountId",
      300,
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

  const adgroupId =
    normalizeRequiredString(
      input.adgroup?.id,
      "adgroup.id",
    );

  const adgroupName =
    normalizeRequiredString(
      input.adgroup?.name,
      "adgroup.name",
    );

  assertEntityStatsResultRange(
    input.stats,
  );

  assertBrandSearchAdgroupHierarchyScope({
    campaign:
      input.campaign,
    adgroup:
      input.adgroup,
    stats:
      input.stats,
    adgroupId,
  });

  const dimensions =
    resolveNaverCanonicalDimensions(
      input.dimensions,
    );

  const seenDates =
    new Set<string>();

  const rows =
    input.stats.records.map(
      (record) => {
        const metrics =
          normalizeEntityStatsRecord({
            record,
            stats:
              input.stats,
            expectedEntityId:
              adgroupId,
            expectedEntityType:
              "adgroup",
          });

        if (
          seenDates.has(
            metrics.date,
          )
        ) {
          throw new NaverSearchAdsCanonicalRowError(
            "DUPLICATE_DATE",
            "The Naver stats result contains more than one row for the same adgroup and date.",
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
            dimensions.channel,
          source:
            dimensions.source,
          platform:
            dimensions.platform,
          device:
            dimensions.device,

          campaign:
            campaignName,
          campaign_name:
            campaignName,

          group:
            adgroupName,
          group_name:
            adgroupName,
          adgroup_name:
            adgroupName,

          keyword:
            "",
          keyword_name:
            "",

          creative:
            "",
          creative_name:
            "",

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
            NAVER_SEARCH_ADS_BRAND_SEARCH_ROW_LEVEL,
          data_level:
            NAVER_SEARCH_ADS_BRAND_SEARCH_ROW_LEVEL,
          row_level_reason:
            NAVER_SEARCH_ADS_BRAND_SEARCH_ROW_LEVEL_REASON,

          provider:
            NAVER_SEARCH_ADS_PROVIDER,
          ingestion_source:
            NAVER_SEARCH_ADS_INGESTION_SOURCE,

          external_account_id:
            externalAccountId,
          external_campaign_id:
            campaignId,
          external_group_id:
            adgroupId,

          provider_meta:
            buildBrandSearchAdgroupProviderMeta({
              campaign:
                input.campaign,
              adgroup:
                input.adgroup,
              periodStart:
                record.periodStart,
              periodEnd:
                record.periodEnd,
            }),
        } satisfies EtrylueNormalizedMediaRow;
      },
    );

  rows.sort((left, right) =>
    left.date.localeCompare(
      right.date,
    ),
  );

  return rows;
}

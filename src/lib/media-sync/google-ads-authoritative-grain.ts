// src/lib/media-sync/google-ads-authoritative-grain.ts

import type {
  JsonObject,
} from "./types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

export const GOOGLE_ADS_CAMPAIGN_TYPES = [
  "SEARCH",
  "DEMAND_GEN",
  "DISPLAY",
  "PERFORMANCE_MAX",
] as const;

export type GoogleAdsCampaignType =
  (typeof GOOGLE_ADS_CAMPAIGN_TYPES)[number];

export const GOOGLE_ADS_PRODUCT_FAMILIES = [
  "search",
  "demand_gen",
  "display",
  "performance_max",
] as const;

export type GoogleAdsProductFamily =
  (typeof GOOGLE_ADS_PRODUCT_FAMILIES)[number];

export const GOOGLE_ADS_AUTHORITATIVE_GRAINS = [
  "ad",
  "asset_group",
] as const;

export type GoogleAdsAuthoritativeGrain =
  (typeof GOOGLE_ADS_AUTHORITATIVE_GRAINS)[number];

export const GOOGLE_ADS_ENTITY_TYPES = [
  "keyword",
  "ad",
  "asset_group",
  "asset",
] as const;

export type GoogleAdsEntityType =
  (typeof GOOGLE_ADS_ENTITY_TYPES)[number];

export type GoogleAdsCampaignAuthorityContract =
  Readonly<{
    provider:
      typeof GOOGLE_ADS_PROVIDER;

    campaignType:
      GoogleAdsCampaignType;

    productFamily:
      GoogleAdsProductFamily;

    authoritativeGrain:
      GoogleAdsAuthoritativeGrain;
  }>;

export type BuildGoogleAdsAuthorityProviderMetaInput =
  Readonly<{
    campaignType:
      unknown;

    entityType:
      GoogleAdsEntityType;

    entityId:
      unknown;
  }>;

export type GoogleAdsAuthorityProviderMeta =
  JsonObject & {
    provider:
      typeof GOOGLE_ADS_PROVIDER;

    campaign_type:
      GoogleAdsCampaignType;

    product_family:
      GoogleAdsProductFamily;

    authoritative_grain:
      GoogleAdsAuthoritativeGrain;

    entity_type:
      GoogleAdsEntityType;

    entity_id:
      string;
  };

export type GoogleAdsAuthoritativeGrainErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CAMPAIGN_TYPE";

export class GoogleAdsAuthoritativeGrainError
  extends Error {
  readonly code:
    GoogleAdsAuthoritativeGrainErrorCode;

  constructor(
    code:
      GoogleAdsAuthoritativeGrainErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      "GoogleAdsAuthoritativeGrainError";

    this.code =
      code;
  }
}

const CAMPAIGN_CONTRACTS:
  Readonly<
    Record<
      GoogleAdsCampaignType,
      GoogleAdsCampaignAuthorityContract
    >
  > =
  Object.freeze({
    SEARCH:
      Object.freeze({
        provider:
          GOOGLE_ADS_PROVIDER,
        campaignType:
          "SEARCH",
        productFamily:
          "search",
        authoritativeGrain:
          "ad",
      }),

    DEMAND_GEN:
      Object.freeze({
        provider:
          GOOGLE_ADS_PROVIDER,
        campaignType:
          "DEMAND_GEN",
        productFamily:
          "demand_gen",
        authoritativeGrain:
          "ad",
      }),

    DISPLAY:
      Object.freeze({
        provider:
          GOOGLE_ADS_PROVIDER,
        campaignType:
          "DISPLAY",
        productFamily:
          "display",
        authoritativeGrain:
          "ad",
      }),

    PERFORMANCE_MAX:
      Object.freeze({
        provider:
          GOOGLE_ADS_PROVIDER,
        campaignType:
          "PERFORMANCE_MAX",
        productFamily:
          "performance_max",
        authoritativeGrain:
          "asset_group",
      }),
  });

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (!normalized) {
    throw new GoogleAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new GoogleAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalized;
}

function normalizeCampaignType(
  value: unknown,
): string {
  return normalizeRequiredString(
    value,
    "campaignType",
    200,
  )
    .toUpperCase()
    .replace(
      /[\s-]+/gu,
      "_",
    );
}

function isGoogleAdsCampaignType(
  value: string,
): value is GoogleAdsCampaignType {
  return (
    value === "SEARCH" ||
    value === "DEMAND_GEN" ||
    value === "DISPLAY" ||
    value === "PERFORMANCE_MAX"
  );
}

function isGoogleAdsEntityType(
  value: unknown,
): value is GoogleAdsEntityType {
  return (
    value === "keyword" ||
    value === "ad" ||
    value === "asset_group" ||
    value === "asset"
  );
}

export function resolveGoogleAdsCampaignAuthorityContract(
  campaignType: unknown,
): GoogleAdsCampaignAuthorityContract {
  const normalizedCampaignType =
    normalizeCampaignType(
      campaignType,
    );

  if (
    !isGoogleAdsCampaignType(
      normalizedCampaignType,
    )
  ) {
    throw new GoogleAdsAuthoritativeGrainError(
      "UNSUPPORTED_CAMPAIGN_TYPE",
      `Google Ads campaign type ${normalizedCampaignType} has no supported authority contract.`,
    );
  }

  return {
    ...CAMPAIGN_CONTRACTS[
      normalizedCampaignType
    ],
  };
}

export function buildGoogleAdsAuthorityProviderMeta(
  input:
    BuildGoogleAdsAuthorityProviderMetaInput,
): GoogleAdsAuthorityProviderMeta {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new GoogleAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      "Google Ads authority provider metadata input is required.",
    );
  }

  const contract =
    resolveGoogleAdsCampaignAuthorityContract(
      input.campaignType,
    );

  if (
    !isGoogleAdsEntityType(
      input.entityType,
    )
  ) {
    throw new GoogleAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      "entityType is not a supported Google Ads entity type.",
    );
  }

  const entityId =
    normalizeRequiredString(
      input.entityId,
      "entityId",
      2_000,
    );

  return {
    provider:
      GOOGLE_ADS_PROVIDER,

    campaign_type:
      contract.campaignType,

    product_family:
      contract.productFamily,

    authoritative_grain:
      contract.authoritativeGrain,

    entity_type:
      input.entityType,

    entity_id:
      entityId,
  };
}

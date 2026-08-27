// scripts/verify-google-ads-authoritative-grain.ts

import assert from "node:assert/strict";

import {
  buildGoogleAdsAuthorityProviderMeta,
  GoogleAdsAuthoritativeGrainError,
  resolveGoogleAdsCampaignAuthorityContract,
} from "../src/lib/media-sync/google-ads-authoritative-grain";

function verifyContracts(): void {
  assert.deepEqual(
    resolveGoogleAdsCampaignAuthorityContract(
      "SEARCH",
    ),
    {
      provider:
        "google_ads",
      campaignType:
        "SEARCH",
      productFamily:
        "search",
      authoritativeGrain:
        "ad",
    },
  );

  assert.deepEqual(
    resolveGoogleAdsCampaignAuthorityContract(
      " demand-gen ",
    ),
    {
      provider:
        "google_ads",
      campaignType:
        "DEMAND_GEN",
      productFamily:
        "demand_gen",
      authoritativeGrain:
        "ad",
    },
  );

  assert.deepEqual(
    resolveGoogleAdsCampaignAuthorityContract(
      "display",
    ),
    {
      provider:
        "google_ads",
      campaignType:
        "DISPLAY",
      productFamily:
        "display",
      authoritativeGrain:
        "ad",
    },
  );

  assert.deepEqual(
    resolveGoogleAdsCampaignAuthorityContract(
      "performance max",
    ),
    {
      provider:
        "google_ads",
      campaignType:
        "PERFORMANCE_MAX",
      productFamily:
        "performance_max",
      authoritativeGrain:
        "asset_group",
    },
  );
}

function verifyProviderMeta(): void {
  assert.deepEqual(
    buildGoogleAdsAuthorityProviderMeta({
      campaignType:
        "SEARCH",
      entityType:
        "keyword",
      entityId:
        "keyword-1",
    }),
    {
      provider:
        "google_ads",
      campaign_type:
        "SEARCH",
      product_family:
        "search",
      authoritative_grain:
        "ad",
      entity_type:
        "keyword",
      entity_id:
        "keyword-1",
    },
  );

  assert.deepEqual(
    buildGoogleAdsAuthorityProviderMeta({
      campaignType:
        "SEARCH",
      entityType:
        "ad",
      entityId:
        "ad-1",
    }),
    {
      provider:
        "google_ads",
      campaign_type:
        "SEARCH",
      product_family:
        "search",
      authoritative_grain:
        "ad",
      entity_type:
        "ad",
      entity_id:
        "ad-1",
    },
  );

  assert.deepEqual(
    buildGoogleAdsAuthorityProviderMeta({
      campaignType:
        "DEMAND_GEN",
      entityType:
        "asset",
      entityId:
        "asset-1",
    }),
    {
      provider:
        "google_ads",
      campaign_type:
        "DEMAND_GEN",
      product_family:
        "demand_gen",
      authoritative_grain:
        "ad",
      entity_type:
        "asset",
      entity_id:
        "asset-1",
    },
  );

  assert.deepEqual(
    buildGoogleAdsAuthorityProviderMeta({
      campaignType:
        "PERFORMANCE_MAX",
      entityType:
        "asset_group",
      entityId:
        "asset-group-1",
    }),
    {
      provider:
        "google_ads",
      campaign_type:
        "PERFORMANCE_MAX",
      product_family:
        "performance_max",
      authoritative_grain:
        "asset_group",
      entity_type:
        "asset_group",
      entity_id:
        "asset-group-1",
    },
  );
}

function verifyFailures(): void {
  assert.throws(
    () =>
      resolveGoogleAdsCampaignAuthorityContract(
        "VIDEO",
      ),
    (
      error: unknown,
    ) =>
      error instanceof
        GoogleAdsAuthoritativeGrainError &&
      error.code ===
        "UNSUPPORTED_CAMPAIGN_TYPE",
  );

  assert.throws(
    () =>
      buildGoogleAdsAuthorityProviderMeta({
        campaignType:
          "SEARCH",
        entityType:
          "asset_group",
        entityId:
          "",
      }),
    (
      error: unknown,
    ) =>
      error instanceof
        GoogleAdsAuthoritativeGrainError &&
      error.code ===
        "INVALID_INPUT",
  );
}

function main(): void {
  verifyContracts();
  verifyProviderMeta();
  verifyFailures();

  console.log(
    "SEARCH authority: ad",
  );

  console.log(
    "DEMAND_GEN authority: ad",
  );

  console.log(
    "DISPLAY authority: ad",
  );

  console.log(
    "PERFORMANCE_MAX authority: asset_group",
  );

  console.log(
    "Google provider_meta contract: true",
  );

  console.log(
    "unsupported campaign rejection: true",
  );

  console.log(
    "verification passed: true",
  );
}

try {
  main();
} catch (error) {
  console.error(
    "Google Ads authoritative grain verification failed:",
    error,
  );

  process.exitCode =
    1;
}

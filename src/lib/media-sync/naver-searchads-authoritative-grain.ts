const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

export const NAVER_SEARCH_ADS_AUTHORITATIVE_GRAINS = [
  "keyword",
  "adgroup",
  "ad",
] as const;

export type NaverSearchAdsAuthoritativeGrain =
  (typeof NAVER_SEARCH_ADS_AUTHORITATIVE_GRAINS)[number];

export type NaverSearchAdsCanonicalRowLevel =
  | "keyword"
  | "creative"
  | "mixed";

export type NaverSearchAdsCollectionStatus =
  | "collect"
  | "excluded";

export type NaverSearchAdsCampaignCollectionContract = {
  provider: typeof NAVER_SEARCH_ADS_PROVIDER;
  status: "collect";
  campaignType:
    | "WEB_SITE"
    | "POWER_CONTENTS"
    | "PLACE"
    | "SHOPPING"
    | "BRAND_SEARCH";
  authoritativeGrain:
    NaverSearchAdsAuthoritativeGrain;
  canonicalRowLevel:
    NaverSearchAdsCanonicalRowLevel;
  canonicalDataLevel:
    NaverSearchAdsCanonicalRowLevel;
  rowLevelReason:
    | "naver_searchad_registered_keyword_daily_stats"
    | "naver_searchad_shopping_ad_daily_stats"
    | "naver_searchad_brand_search_adgroup_daily_stats";
};

export type NaverExternalProductCollectionPolicy = {
  status: "excluded";
  reason: "excluded_display_provider";
  productFamily: "display_ads";
  normalizedProductCode:
    | "ADVOOST"
    | "ADVOOST_SHOPPING";
};

export type NaverSearchAdsAuthoritativeSelection<T> = {
  campaignId: string;
  campaignType:
    NaverSearchAdsCampaignCollectionContract["campaignType"];
  contract:
    NaverSearchAdsCampaignCollectionContract;
  authoritativeGrain:
    NaverSearchAdsAuthoritativeGrain;
  value: T;
  ignoredGrains:
    NaverSearchAdsAuthoritativeGrain[];
};

export type NaverSearchAdsGrainValues<T> =
  Partial<
    Record<
      NaverSearchAdsAuthoritativeGrain,
      T
    >
  >;

export type NaverSearchAdsAuthoritativeGrainErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CAMPAIGN_TYPE"
  | "AUTHORITATIVE_VALUE_MISSING"
  | "DUPLICATE_CAMPAIGN_SELECTION"
  | "UNSUPPORTED_EXTERNAL_PRODUCT";

export class NaverSearchAdsAuthoritativeGrainError
  extends Error {
  readonly code:
    NaverSearchAdsAuthoritativeGrainErrorCode;

  constructor(
    code:
      NaverSearchAdsAuthoritativeGrainErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsAuthoritativeGrainError";

    this.code =
      code;
  }
}

const CAMPAIGN_CONTRACTS:
  Record<
    NaverSearchAdsCampaignCollectionContract["campaignType"],
    NaverSearchAdsCampaignCollectionContract
  > = {
    WEB_SITE: {
      provider:
        NAVER_SEARCH_ADS_PROVIDER,
      status:
        "collect",
      campaignType:
        "WEB_SITE",
      authoritativeGrain:
        "keyword",
      canonicalRowLevel:
        "keyword",
      canonicalDataLevel:
        "keyword",
      rowLevelReason:
        "naver_searchad_registered_keyword_daily_stats",
    },

    POWER_CONTENTS: {
      provider:
        NAVER_SEARCH_ADS_PROVIDER,
      status:
        "collect",
      campaignType:
        "POWER_CONTENTS",
      authoritativeGrain:
        "keyword",
      canonicalRowLevel:
        "keyword",
      canonicalDataLevel:
        "keyword",
      rowLevelReason:
        "naver_searchad_registered_keyword_daily_stats",
    },

    PLACE: {
      provider:
        NAVER_SEARCH_ADS_PROVIDER,
      status:
        "collect",
      campaignType:
        "PLACE",
      authoritativeGrain:
        "keyword",
      canonicalRowLevel:
        "keyword",
      canonicalDataLevel:
        "keyword",
      rowLevelReason:
        "naver_searchad_registered_keyword_daily_stats",
    },

    SHOPPING: {
      provider:
        NAVER_SEARCH_ADS_PROVIDER,
      status:
        "collect",
      campaignType:
        "SHOPPING",
      authoritativeGrain:
        "ad",
      canonicalRowLevel:
        "creative",
      canonicalDataLevel:
        "creative",
      rowLevelReason:
        "naver_searchad_shopping_ad_daily_stats",
    },

    BRAND_SEARCH: {
      provider:
        NAVER_SEARCH_ADS_PROVIDER,
      status:
        "collect",
      campaignType:
        "BRAND_SEARCH",
      authoritativeGrain:
        "adgroup",
      canonicalRowLevel:
        "mixed",
      canonicalDataLevel:
        "mixed",
      rowLevelReason:
        "naver_searchad_brand_search_adgroup_daily_stats",
    },
  };

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeCampaignType(
  value: unknown,
): string {
  return normalizeRequiredString(
    value,
    "campaignType",
    100,
  ).toUpperCase();
}

function normalizeExternalProductCode(
  value: unknown,
): string {
  return normalizeRequiredString(
    value,
    "productCode",
    200,
  )
    .toUpperCase()
    .replace(
      /[\s-]+/g,
      "_",
    );
}

function isAuthoritativeGrain(
  value: unknown,
): value is NaverSearchAdsAuthoritativeGrain {
  return (
    value === "keyword" ||
    value === "adgroup" ||
    value === "ad"
  );
}

export function resolveNaverSearchAdsCampaignCollectionContract(
  campaignType: unknown,
): NaverSearchAdsCampaignCollectionContract {
  const normalizedCampaignType =
    normalizeCampaignType(
      campaignType,
    );

  if (
    normalizedCampaignType ===
      "WEB_SITE" ||
    normalizedCampaignType ===
      "POWER_CONTENTS" ||
    normalizedCampaignType ===
      "PLACE" ||
    normalizedCampaignType ===
      "SHOPPING" ||
    normalizedCampaignType ===
      "BRAND_SEARCH"
  ) {
    return {
      ...CAMPAIGN_CONTRACTS[
        normalizedCampaignType
      ],
    };
  }

  throw new NaverSearchAdsAuthoritativeGrainError(
    "UNSUPPORTED_CAMPAIGN_TYPE",
    `Naver Search Ads campaign type ${normalizedCampaignType} has no verified authoritative grain.`,
  );
}

export function resolveNaverExternalProductCollectionPolicy(
  productCode: unknown,
): NaverExternalProductCollectionPolicy {
  const normalizedProductCode =
    normalizeExternalProductCode(
      productCode,
    );

  if (
    normalizedProductCode ===
      "ADVOOST" ||
    normalizedProductCode ===
      "ADVOOST_SHOPPING"
  ) {
    return {
      status:
        "excluded",
      reason:
        "excluded_display_provider",
      productFamily:
        "display_ads",
      normalizedProductCode,
    };
  }

  throw new NaverSearchAdsAuthoritativeGrainError(
    "UNSUPPORTED_EXTERNAL_PRODUCT",
    `Naver external product ${normalizedProductCode} has no collection policy.`,
  );
}

export function selectNaverSearchAdsAuthoritativeValue<T>(
  input: {
    campaignId: unknown;
    campaignType: unknown;
    valuesByGrain:
      NaverSearchAdsGrainValues<T>;
  },
): NaverSearchAdsAuthoritativeSelection<T> {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      "Authoritative selection input is required.",
    );
  }

  const campaignId =
    normalizeRequiredString(
      input.campaignId,
      "campaignId",
      200,
    );

  if (
    !input.valuesByGrain ||
    typeof input.valuesByGrain !==
      "object" ||
    Array.isArray(
      input.valuesByGrain,
    )
  ) {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      "valuesByGrain must be an object.",
    );
  }

  const contract =
    resolveNaverSearchAdsCampaignCollectionContract(
      input.campaignType,
    );

  const authoritativeValue =
    input.valuesByGrain[
      contract.authoritativeGrain
    ];

  if (
    authoritativeValue ===
    undefined
  ) {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "AUTHORITATIVE_VALUE_MISSING",
      `Campaign ${campaignId} is missing ${contract.authoritativeGrain} data.`,
    );
  }

  const ignoredGrains =
    Object.keys(
      input.valuesByGrain,
    )
      .filter(
        (value): value is
          NaverSearchAdsAuthoritativeGrain =>
          isAuthoritativeGrain(
            value,
          ),
      )
      .filter(
        (grain) =>
          grain !==
          contract.authoritativeGrain,
      );

  return {
    campaignId,
    campaignType:
      contract.campaignType,
    contract: {
      ...contract,
    },
    authoritativeGrain:
      contract.authoritativeGrain,
    value:
      authoritativeValue,
    ignoredGrains,
  };
}

export function assertUniqueNaverSearchAdsCampaignSelections(
  selections:
    readonly NaverSearchAdsAuthoritativeSelection<unknown>[],
): void {
  if (!Array.isArray(selections)) {
    throw new NaverSearchAdsAuthoritativeGrainError(
      "INVALID_INPUT",
      "selections must be an array.",
    );
  }

  const seenCampaignIds =
    new Set<string>();

  for (
    const selection
    of selections
  ) {
    const campaignId =
      normalizeRequiredString(
        selection?.campaignId,
        "selection.campaignId",
        200,
      );

    if (
      seenCampaignIds.has(
        campaignId,
      )
    ) {
      throw new NaverSearchAdsAuthoritativeGrainError(
        "DUPLICATE_CAMPAIGN_SELECTION",
        `Campaign ${campaignId} has more than one authoritative selection.`,
      );
    }

    seenCampaignIds.add(
      campaignId,
    );
  }
}

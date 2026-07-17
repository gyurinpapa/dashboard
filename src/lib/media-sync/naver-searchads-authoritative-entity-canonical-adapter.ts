import type {
  NaverAuthoritativeEntityStatsCollectorItem,
} from "./naver-searchads-authoritative-entity-stats-collector";
import {
  resolveNaverSearchAdsCampaignCollectionContract,
  NaverSearchAdsAuthoritativeGrainError,
} from "./naver-searchads-authoritative-grain";
import {
  convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows,
  convertNaverShoppingAdDailyStatsToCanonicalRows,
  type NaverSearchAdsCanonicalDimensions,
} from "./naver-searchads-canonical-row";
import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsAdgroupRecord,
} from "./naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
} from "./types";

export type NaverSearchAdsAuthoritativeEntityCanonicalAdapterErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CAMPAIGN_TYPE"
  | "AUTHORITATIVE_GRAIN_MISMATCH"
  | "ENTITY_SHAPE_MISMATCH";

export class NaverSearchAdsAuthoritativeEntityCanonicalAdapterError
  extends Error {
  readonly code:
    NaverSearchAdsAuthoritativeEntityCanonicalAdapterErrorCode;

  constructor(
    code:
      NaverSearchAdsAuthoritativeEntityCanonicalAdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      "NaverSearchAdsAuthoritativeEntityCanonicalAdapterError";

    this.code =
      code;
  }
}

export type ConvertNaverAuthoritativeEntityCollectorItemToCanonicalRowsInput = {
  externalAccountId: string;
  item: NaverAuthoritativeEntityStatsCollectorItem;
  dimensions?: NaverSearchAdsCanonicalDimensions;
};

type UnknownRecord =
  Record<string, unknown>;

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(
      value,
    );

  return (
    prototype ===
      Object.prototype ||
    prototype ===
      null
  );
}

function normalizeExternalAccountId(
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "INVALID_INPUT",
      "externalAccountId must be a string.",
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "INVALID_INPUT",
      "externalAccountId must not be empty.",
    );
  }

  if (
    normalizedValue.length >
    300
  ) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "INVALID_INPUT",
      "externalAccountId exceeds the maximum allowed length.",
    );
  }

  return normalizedValue;
}

function isNaverSearchAdsAdRecord(
  value: unknown,
): value is NaverSearchAdsAdRecord {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id ===
      "string" &&
    typeof value.adgroupId ===
      "string" &&
    typeof value.type ===
      "string"
  );
}

function isNaverSearchAdsAdgroupRecord(
  value: unknown,
): value is NaverSearchAdsAdgroupRecord {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id ===
      "string" &&
    typeof value.campaignId ===
      "string" &&
    typeof value.name ===
      "string"
  );
}

function resolveCollectionContract(
  campaignType: unknown,
) {
  if (
    typeof campaignType !==
      "string" ||
    !campaignType.trim()
  ) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "UNSUPPORTED_CAMPAIGN_TYPE",
      "The authoritative entity canonical adapter requires a verified SHOPPING or BRAND_SEARCH campaign type.",
    );
  }

  try {
    return resolveNaverSearchAdsCampaignCollectionContract(
      campaignType,
    );
  } catch (error) {
    if (
      error instanceof
      NaverSearchAdsAuthoritativeGrainError
    ) {
      throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
        "UNSUPPORTED_CAMPAIGN_TYPE",
        "The authoritative entity canonical adapter received an unsupported campaign type.",
        {
          cause:
            error,
        },
      );
    }

    throw error;
  }
}

export function convertNaverAuthoritativeEntityCollectorItemToCanonicalRows(
  input:
    ConvertNaverAuthoritativeEntityCollectorItemToCanonicalRowsInput,
): EtrylueNormalizedMediaRow[] {
  if (
    !input ||
    typeof input !==
      "object" ||
    Array.isArray(
      input,
    )
  ) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "INVALID_INPUT",
      "Authoritative entity canonical adapter input is required.",
    );
  }

  if (
    !input.item ||
    typeof input.item !==
      "object" ||
    Array.isArray(
      input.item,
    )
  ) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "INVALID_INPUT",
      "A Naver authoritative entity collector item is required.",
    );
  }

  const externalAccountId =
    normalizeExternalAccountId(
      input.externalAccountId,
    );

  const contract =
    resolveCollectionContract(
      input.item.campaign?.campaignType,
    );

  if (
    contract.authoritativeGrain ===
    "keyword"
  ) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "UNSUPPORTED_CAMPAIGN_TYPE",
      "WEB_SITE is owned by the existing keyword collector and cannot enter the authoritative entity canonical adapter.",
    );
  }

  if (
    input.item.authoritativeGrain !==
    contract.authoritativeGrain
  ) {
    throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
      "AUTHORITATIVE_GRAIN_MISMATCH",
      `Campaign type ${contract.campaignType} requires authoritative grain ${contract.authoritativeGrain}.`,
    );
  }

  if (
    contract.campaignType ===
    "SHOPPING"
  ) {
    if (
      !isNaverSearchAdsAdRecord(
        input.item.entity,
      )
    ) {
      throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
        "ENTITY_SHAPE_MISMATCH",
        "A SHOPPING authoritative collector item must contain an ad entity.",
      );
    }

    return convertNaverShoppingAdDailyStatsToCanonicalRows({
      externalAccountId,
      campaign:
        input.item.campaign,
      adgroup:
        input.item.adgroup,
      ad:
        input.item.entity,
      stats:
        input.item.stats,
      dimensions:
        input.dimensions,
    });
  }

  if (
    contract.campaignType ===
    "BRAND_SEARCH"
  ) {
    if (
      !isNaverSearchAdsAdgroupRecord(
        input.item.entity,
      )
    ) {
      throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
        "ENTITY_SHAPE_MISMATCH",
        "A BRAND_SEARCH authoritative collector item must contain an adgroup entity.",
      );
    }

    /*
     * BRAND_SEARCH authoritative entity is item.entity.
     * The collector may supply a page placeholder through item.adgroup,
     * so the actual entity must own the canonical group fields and ID.
     */
    return convertNaverBrandSearchAdgroupDailyStatsToCanonicalRows({
      externalAccountId,
      campaign:
        input.item.campaign,
      adgroup:
        input.item.entity,
      stats:
        input.item.stats,
      dimensions:
        input.dimensions,
    });
  }

  throw new NaverSearchAdsAuthoritativeEntityCanonicalAdapterError(
    "UNSUPPORTED_CAMPAIGN_TYPE",
    "The authoritative entity canonical adapter received an unsupported campaign type.",
  );
}

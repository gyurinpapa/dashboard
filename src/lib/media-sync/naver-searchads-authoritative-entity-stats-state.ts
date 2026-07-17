import {
  classifyNaverKeywordStatsRetryCategory,
  decideNaverKeywordStatsRetry,
  type NaverKeywordStatsRetryCategory,
  type NaverKeywordStatsRetryDecision,
  type NaverKeywordStatsRetryInput,
} from "./naver-searchads-keyword-stats-state";
import type {
  NaverSearchAdsAuthoritativeGrain,
  NaverSearchAdsCampaignCollectionContract,
} from "./naver-searchads-authoritative-grain";

export const NAVER_AUTHORITATIVE_ENTITY_STATS_CURSOR_VERSION = 1 as const;

export type NaverAuthoritativeEntityStatsCursorVersion =
  typeof NAVER_AUTHORITATIVE_ENTITY_STATS_CURSOR_VERSION;

export type NaverAuthoritativeEntityStatsDateWindow = {
  index: number;
  dateFrom: string;
  dateTo: string;
};

export type NaverAuthoritativeEntityStatsCursor = {
  version: NaverAuthoritativeEntityStatsCursorVersion;

  dateWindowIndex: number;
  dateFrom: string;
  dateTo: string;

  campaignBaseSearchId: string | null;
  campaignId: string | null;
  campaignType:
    | NaverSearchAdsCampaignCollectionContract["campaignType"]
    | null;
  authoritativeGrain:
    | Exclude<NaverSearchAdsAuthoritativeGrain, "keyword">
    | null;

  adgroupBaseSearchId: string | null;
  adgroupId: string | null;

  entityBaseSearchId: string | null;
  entityIndexInPage: number;
  lastCompletedEntityId: string | null;

  completedEntityCount: number;
  discoveredEntityCount: number;
};

export type NaverAuthoritativeEntityStatsFailureState = {
  cursor: NaverAuthoritativeEntityStatsCursor;
  entityId: string | null;
  httpStatus: number | null;
  errorCode: string;
  retryCount: number;
  failedAt: string;
};

export type NaverAuthoritativeEntityStatsResumePosition = {
  entityIndexInPage: number;
  matchedLastCompletedEntity: boolean;
  restartPageFromBeginning: boolean;
};

export type NaverAuthoritativeEntityStatsRetryCategory =
  NaverKeywordStatsRetryCategory;

export type NaverAuthoritativeEntityStatsRetryDecision =
  NaverKeywordStatsRetryDecision;

export type NaverAuthoritativeEntityStatsRetryInput =
  NaverKeywordStatsRetryInput;

export class NaverAuthoritativeEntityStatsStateError extends Error {
  readonly code:
    | "INVALID_CURSOR"
    | "INVALID_DATE_WINDOW"
    | "INVALID_ENTITY_ID"
    | "INVALID_FAILURE_STATE";

  constructor(
    code: NaverAuthoritativeEntityStatsStateError["code"],
    message: string,
  ) {
    super(message);
    this.name = "NaverAuthoritativeEntityStatsStateError";
    this.code = code;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}

function normalizeNullableString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must be a string or null.`,
    );
  }

  return value.trim() || null;
}

function assertNonNegativeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function assertDateWindow(
  value: NaverAuthoritativeEntityStatsDateWindow,
): void {
  assertNonNegativeInteger(value.index, "dateWindow.index");

  if (!isIsoDate(value.dateFrom) || !isIsoDate(value.dateTo)) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_DATE_WINDOW",
      "The date window must contain valid YYYY-MM-DD dates.",
    );
  }

  if (value.dateFrom > value.dateTo) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_DATE_WINDOW",
      "dateFrom must be earlier than or equal to dateTo.",
    );
  }
}

function normalizeCampaignType(
  value: unknown,
): NaverSearchAdsCampaignCollectionContract["campaignType"] | null {
  const normalized = normalizeNullableString(value, "campaignType");

  if (normalized === null) {
    return null;
  }

  if (
    normalized !== "WEB_SITE" &&
    normalized !== "SHOPPING" &&
    normalized !== "BRAND_SEARCH"
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "campaignType is not supported by the authoritative collection contract.",
    );
  }

  return normalized;
}

function normalizeAuthoritativeGrain(
  value: unknown,
): Exclude<NaverSearchAdsAuthoritativeGrain, "keyword"> | null {
  const normalized = normalizeNullableString(
    value,
    "authoritativeGrain",
  );

  if (normalized === null) {
    return null;
  }

  if (normalized !== "adgroup" && normalized !== "ad") {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "authoritativeGrain must be adgroup or ad.",
    );
  }

  return normalized;
}

function cloneCursor(
  cursor: NaverAuthoritativeEntityStatsCursor,
): NaverAuthoritativeEntityStatsCursor {
  return { ...cursor };
}

export function createNaverAuthoritativeEntityStatsCursor(
  input: {
    dateWindow: NaverAuthoritativeEntityStatsDateWindow;
    completedEntityCount?: number;
    discoveredEntityCount?: number;
  },
): NaverAuthoritativeEntityStatsCursor {
  assertDateWindow(input.dateWindow);

  const completedEntityCount = input.completedEntityCount ?? 0;
  const discoveredEntityCount = input.discoveredEntityCount ?? 0;

  assertNonNegativeInteger(
    completedEntityCount,
    "completedEntityCount",
  );
  assertNonNegativeInteger(
    discoveredEntityCount,
    "discoveredEntityCount",
  );

  if (completedEntityCount > discoveredEntityCount) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "completedEntityCount must not exceed discoveredEntityCount.",
    );
  }

  return {
    version: NAVER_AUTHORITATIVE_ENTITY_STATS_CURSOR_VERSION,
    dateWindowIndex: input.dateWindow.index,
    dateFrom: input.dateWindow.dateFrom,
    dateTo: input.dateWindow.dateTo,
    campaignBaseSearchId: null,
    campaignId: null,
    campaignType: null,
    authoritativeGrain: null,
    adgroupBaseSearchId: null,
    adgroupId: null,
    entityBaseSearchId: null,
    entityIndexInPage: 0,
    lastCompletedEntityId: null,
    completedEntityCount,
    discoveredEntityCount,
  };
}

export function normalizeNaverAuthoritativeEntityStatsCursor(
  value: unknown,
): NaverAuthoritativeEntityStatsCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "Cursor must be an object.",
    );
  }

  const candidate = value as Partial<NaverAuthoritativeEntityStatsCursor>;

  if (
    candidate.version !==
    NAVER_AUTHORITATIVE_ENTITY_STATS_CURSOR_VERSION
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "Unsupported cursor version.",
    );
  }

  assertNonNegativeInteger(candidate.dateWindowIndex, "dateWindowIndex");
  assertNonNegativeInteger(candidate.entityIndexInPage, "entityIndexInPage");
  assertNonNegativeInteger(
    candidate.completedEntityCount,
    "completedEntityCount",
  );
  assertNonNegativeInteger(
    candidate.discoveredEntityCount,
    "discoveredEntityCount",
  );

  if (candidate.completedEntityCount > candidate.discoveredEntityCount) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "completedEntityCount must not exceed discoveredEntityCount.",
    );
  }

  const normalized: NaverAuthoritativeEntityStatsCursor = {
    version: NAVER_AUTHORITATIVE_ENTITY_STATS_CURSOR_VERSION,
    dateWindowIndex: candidate.dateWindowIndex,
    dateFrom: normalizeRequiredString(candidate.dateFrom, "dateFrom"),
    dateTo: normalizeRequiredString(candidate.dateTo, "dateTo"),
    campaignBaseSearchId: normalizeNullableString(
      candidate.campaignBaseSearchId,
      "campaignBaseSearchId",
    ),
    campaignId: normalizeNullableString(candidate.campaignId, "campaignId"),
    campaignType: normalizeCampaignType(candidate.campaignType),
    authoritativeGrain: normalizeAuthoritativeGrain(
      candidate.authoritativeGrain,
    ),
    adgroupBaseSearchId: normalizeNullableString(
      candidate.adgroupBaseSearchId,
      "adgroupBaseSearchId",
    ),
    adgroupId: normalizeNullableString(candidate.adgroupId, "adgroupId"),
    entityBaseSearchId: normalizeNullableString(
      candidate.entityBaseSearchId,
      "entityBaseSearchId",
    ),
    entityIndexInPage: candidate.entityIndexInPage,
    lastCompletedEntityId: normalizeNullableString(
      candidate.lastCompletedEntityId,
      "lastCompletedEntityId",
    ),
    completedEntityCount: candidate.completedEntityCount,
    discoveredEntityCount: candidate.discoveredEntityCount,
  };

  assertDateWindow({
    index: normalized.dateWindowIndex,
    dateFrom: normalized.dateFrom,
    dateTo: normalized.dateTo,
  });

  if (
    (normalized.campaignType === null) !==
      (normalized.authoritativeGrain === null)
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "campaignType and authoritativeGrain must be set together.",
    );
  }

  if (
    normalized.campaignType === "SHOPPING" &&
    normalized.authoritativeGrain !== "ad"
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "SHOPPING cursor grain must be ad.",
    );
  }

  if (
    normalized.campaignType === "BRAND_SEARCH" &&
    normalized.authoritativeGrain !== "adgroup"
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "BRAND_SEARCH cursor grain must be adgroup.",
    );
  }

  if (normalized.campaignType === "WEB_SITE") {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "WEB_SITE is owned by the existing keyword collector.",
    );
  }

  return normalized;
}

export function setNaverAuthoritativeEntityStatsCampaignPosition(
  cursor: NaverAuthoritativeEntityStatsCursor,
  input: {
    campaignBaseSearchId: string | null;
    campaignId: string | null;
    campaignType:
      | "SHOPPING"
      | "BRAND_SEARCH"
      | null;
    authoritativeGrain: "ad" | "adgroup" | null;
  },
): NaverAuthoritativeEntityStatsCursor {
  const normalized = normalizeNaverAuthoritativeEntityStatsCursor(cursor);

  return normalizeNaverAuthoritativeEntityStatsCursor({
    ...normalized,
    campaignBaseSearchId: input.campaignBaseSearchId,
    campaignId: input.campaignId,
    campaignType: input.campaignType,
    authoritativeGrain: input.authoritativeGrain,
    adgroupBaseSearchId: null,
    adgroupId: null,
    entityBaseSearchId: null,
    entityIndexInPage: 0,
    lastCompletedEntityId: null,
  });
}

export function setNaverAuthoritativeEntityStatsAdgroupPosition(
  cursor: NaverAuthoritativeEntityStatsCursor,
  input: {
    adgroupBaseSearchId: string | null;
    adgroupId: string | null;
  },
): NaverAuthoritativeEntityStatsCursor {
  const normalized = normalizeNaverAuthoritativeEntityStatsCursor(cursor);

  if (!normalized.campaignId) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "campaignId is required before setting an adgroup position.",
    );
  }

  return normalizeNaverAuthoritativeEntityStatsCursor({
    ...normalized,
    adgroupBaseSearchId: input.adgroupBaseSearchId,
    adgroupId: input.adgroupId,
    entityBaseSearchId: null,
    entityIndexInPage: 0,
    lastCompletedEntityId: null,
  });
}

export function setNaverAuthoritativeEntityStatsEntityPagePosition(
  cursor: NaverAuthoritativeEntityStatsCursor,
  input: {
    entityBaseSearchId: string | null;
  },
): NaverAuthoritativeEntityStatsCursor {
  const normalized = normalizeNaverAuthoritativeEntityStatsCursor(cursor);

  if (!normalized.campaignId || !normalized.authoritativeGrain) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "Campaign position is required before setting an entity page.",
    );
  }

  if (normalized.authoritativeGrain === "ad" && !normalized.adgroupId) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "SHOPPING ad collection requires an adgroup position.",
    );
  }

  return normalizeNaverAuthoritativeEntityStatsCursor({
    ...normalized,
    entityBaseSearchId: input.entityBaseSearchId,
    entityIndexInPage: 0,
    lastCompletedEntityId: null,
  });
}

export function setNaverAuthoritativeEntityStatsDiscoveredCount(
  cursor: NaverAuthoritativeEntityStatsCursor,
  discoveredEntityCount: number,
): NaverAuthoritativeEntityStatsCursor {
  const normalized = normalizeNaverAuthoritativeEntityStatsCursor(cursor);
  assertNonNegativeInteger(discoveredEntityCount, "discoveredEntityCount");

  if (discoveredEntityCount < normalized.completedEntityCount) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "discoveredEntityCount must not be lower than completedEntityCount.",
    );
  }

  return {
    ...normalized,
    discoveredEntityCount,
  };
}

export function markNaverAuthoritativeEntityStatsEntityCompleted(
  input: {
    cursor: NaverAuthoritativeEntityStatsCursor;
    entityId: string;
    entityIndexInPage: number;
  },
): NaverAuthoritativeEntityStatsCursor {
  const normalized = normalizeNaverAuthoritativeEntityStatsCursor(
    input.cursor,
  );
  const entityId = normalizeRequiredString(input.entityId, "entityId");
  assertNonNegativeInteger(input.entityIndexInPage, "entityIndexInPage");

  if (input.entityIndexInPage < normalized.entityIndexInPage) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_CURSOR",
      "A completed entity cannot move the cursor backward.",
    );
  }

  return {
    ...normalized,
    entityIndexInPage: input.entityIndexInPage + 1,
    lastCompletedEntityId: entityId,
    completedEntityCount: normalized.completedEntityCount + 1,
  };
}

export function resolveNaverAuthoritativeEntityStatsResumePosition(
  cursor: NaverAuthoritativeEntityStatsCursor,
  entityIds: readonly string[],
): NaverAuthoritativeEntityStatsResumePosition {
  const normalized = normalizeNaverAuthoritativeEntityStatsCursor(cursor);
  const normalizedEntityIds = entityIds.map((entityId, index) =>
    normalizeRequiredString(entityId, `entityIds[${index}]`),
  );

  if (normalizedEntityIds.length === 0) {
    return {
      entityIndexInPage: 0,
      matchedLastCompletedEntity:
        normalized.lastCompletedEntityId === null,
      restartPageFromBeginning: true,
    };
  }

  if (normalized.lastCompletedEntityId) {
    const completedIndex = normalizedEntityIds.indexOf(
      normalized.lastCompletedEntityId,
    );

    if (completedIndex >= 0) {
      return {
        entityIndexInPage: completedIndex + 1,
        matchedLastCompletedEntity: true,
        restartPageFromBeginning: false,
      };
    }
  }

  if (normalized.entityIndexInPage < normalizedEntityIds.length) {
    return {
      entityIndexInPage: normalized.entityIndexInPage,
      matchedLastCompletedEntity: false,
      restartPageFromBeginning: false,
    };
  }

  return {
    entityIndexInPage: 0,
    matchedLastCompletedEntity: false,
    restartPageFromBeginning: true,
  };
}

export function createNaverAuthoritativeEntityStatsFailureState(
  input: NaverAuthoritativeEntityStatsFailureState,
): NaverAuthoritativeEntityStatsFailureState {
  const cursor = normalizeNaverAuthoritativeEntityStatsCursor(input.cursor);
  const entityId = normalizeNullableString(input.entityId, "entityId");
  assertNonNegativeInteger(input.retryCount, "retryCount");

  if (
    input.httpStatus !== null &&
    (!Number.isInteger(input.httpStatus) || input.httpStatus < 100)
  ) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_FAILURE_STATE",
      "httpStatus must be null or a valid HTTP status.",
    );
  }

  if (!isIsoDate(input.failedAt.slice(0, 10))) {
    throw new NaverAuthoritativeEntityStatsStateError(
      "INVALID_FAILURE_STATE",
      "failedAt must be an ISO timestamp.",
    );
  }

  return {
    cursor: cloneCursor(cursor),
    entityId,
    httpStatus: input.httpStatus,
    errorCode: normalizeRequiredString(input.errorCode, "errorCode"),
    retryCount: input.retryCount,
    failedAt: input.failedAt,
  };
}

export function classifyNaverAuthoritativeEntityStatsRetryCategory(
  input: {
    httpStatus: number | null;
    isNetworkError?: boolean;
  },
): NaverAuthoritativeEntityStatsRetryCategory {
  return classifyNaverKeywordStatsRetryCategory(input);
}

export function decideNaverAuthoritativeEntityStatsRetry(
  input: NaverAuthoritativeEntityStatsRetryInput,
): NaverAuthoritativeEntityStatsRetryDecision {
  return decideNaverKeywordStatsRetry(input);
}

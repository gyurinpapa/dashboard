export const NAVER_KEYWORD_STATS_CURSOR_VERSION = 1 as const;

export const NAVER_KEYWORD_STATS_DEFAULT_CONCURRENCY = 1;

export const NAVER_KEYWORD_STATS_DEFAULT_REQUEST_INTERVAL_MS =
  1_000;

export const NAVER_KEYWORD_STATS_DEFAULT_CHUNK_SIZE = 100;

export const NAVER_KEYWORD_STATS_DEFAULT_CHUNK_PAUSE_MS =
  10_000;

export const NAVER_KEYWORD_STATS_DEFAULT_MAX_DATE_WINDOW_DAYS =
  31;

export const NAVER_KEYWORD_STATS_DEFAULT_MAX_RETRY_COUNT =
  3;

export const NAVER_KEYWORD_STATS_RATE_LIMIT_RETRY_DELAYS_MS =
  [60_000, 120_000, 240_000] as const;

export const NAVER_KEYWORD_STATS_SERVER_RETRY_DELAYS_MS =
  [2_000, 4_000, 8_000] as const;

export const NAVER_KEYWORD_STATS_MAX_JITTER_MS = 500;

export type NaverKeywordStatsCursorVersion =
  typeof NAVER_KEYWORD_STATS_CURSOR_VERSION;

export type NaverKeywordStatsDateWindow = {
  index: number;
  dateFrom: string;
  dateTo: string;
};

export type NaverKeywordStatsCursor = {
  version: NaverKeywordStatsCursorVersion;

  dateWindowIndex: number;
  dateFrom: string;
  dateTo: string;

  campaignBaseSearchId: string | null;
  campaignId: string | null;

  adgroupBaseSearchId: string | null;
  adgroupId: string | null;

  keywordBaseSearchId: string | null;

  keywordChunkIndex: number;
  keywordIndexInChunk: number;

  lastCompletedKeywordId: string | null;

  completedKeywordCount: number;
  discoveredKeywordCount: number;
};

export type NaverKeywordStatsRetryCategory =
  | "rate_limit"
  | "server_error"
  | "network_error"
  | "non_retryable";

export type NaverKeywordStatsRetryDecision =
  | {
      shouldRetry: true;
      category: Exclude<
        NaverKeywordStatsRetryCategory,
        "non_retryable"
      >;
      retryCount: number;
      delayMs: number;
    }
  | {
      shouldRetry: false;
      category: NaverKeywordStatsRetryCategory;
      retryCount: number;
      delayMs: null;
      reason:
        | "MAX_RETRY_COUNT_REACHED"
        | "NON_RETRYABLE_STATUS"
        | "NON_RETRYABLE_ERROR";
    };

export type NaverKeywordStatsFailureState = {
  cursor: NaverKeywordStatsCursor;
  keywordId: string | null;
  httpStatus: number | null;
  errorCode: string;
  retryCount: number;
  failedAt: string;
};

export type NaverKeywordStatsResumePosition = {
  keywordIndexInChunk: number;
  matchedLastCompletedKeyword: boolean;
  restartChunkFromBeginning: boolean;
};

export type NaverKeywordStatsCursorInput = {
  dateWindow: NaverKeywordStatsDateWindow;
  completedKeywordCount?: number;
  discoveredKeywordCount?: number;
};

export type NaverKeywordStatsKeywordSuccessInput = {
  cursor: NaverKeywordStatsCursor;
  keywordId: string;
  keywordIndexInChunk: number;
};

export type NaverKeywordStatsChunkAdvanceInput = {
  cursor: NaverKeywordStatsCursor;
  nextKeywordBaseSearchId: string | null;
};

export type NaverKeywordStatsAdgroupAdvanceInput = {
  cursor: NaverKeywordStatsCursor;
  nextAdgroupBaseSearchId: string | null;
  nextAdgroupId: string | null;
};

export type NaverKeywordStatsCampaignAdvanceInput = {
  cursor: NaverKeywordStatsCursor;
  nextCampaignBaseSearchId: string | null;
  nextCampaignId: string | null;
};

export type NaverKeywordStatsFailureInput = {
  cursor: NaverKeywordStatsCursor;
  keywordId: string | null;
  httpStatus: number | null;
  errorCode: string;
  retryCount: number;
  failedAt: string;
};

export type NaverKeywordStatsRetryInput = {
  category: NaverKeywordStatsRetryCategory;
  retryCount: number;
  retryAfterMs?: number | null;
  jitterMs?: number;
  maxRetryCount?: number;
};

export class NaverKeywordStatsStateError extends Error {
  readonly code:
    | "INVALID_CURSOR"
    | "INVALID_DATE_WINDOW"
    | "INVALID_KEYWORD_ID"
    | "INVALID_RETRY_INPUT"
    | "INVALID_FAILURE_STATE";

  constructor(
    code: NaverKeywordStatsStateError["code"],
    message: string,
  ) {
    super(message);

    this.name = "NaverKeywordStatsStateError";
    this.code = code;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must not be empty.`,
    );
  }

  return normalizedValue;
}

function normalizeNullableString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must be a string or null.`,
    );
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
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
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_RETRY_INPUT",
      `${fieldName} must be a positive integer.`,
    );
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function parseIsoDateToUtcMilliseconds(
  value: string,
): number {
  if (!isIsoDate(value)) {
    throw new NaverKeywordStatsStateError(
      "INVALID_DATE_WINDOW",
      `Invalid ISO date: ${value}`,
    );
  }

  return new Date(
    `${value}T00:00:00.000Z`,
  ).getTime();
}

function cloneCursor(
  cursor: NaverKeywordStatsCursor,
): NaverKeywordStatsCursor {
  return {
    ...cursor,
  };
}

function normalizeRetryAfterMs(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new NaverKeywordStatsStateError(
      "INVALID_RETRY_INPUT",
      "retryAfterMs must be a non-negative finite number.",
    );
  }

  return Math.floor(value);
}

function normalizeJitterMs(
  value: number | undefined,
): number {
  if (value === undefined) {
    return 0;
  }

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value >
      NAVER_KEYWORD_STATS_MAX_JITTER_MS
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_RETRY_INPUT",
      `jitterMs must be between 0 and ${NAVER_KEYWORD_STATS_MAX_JITTER_MS}.`,
    );
  }

  return Math.floor(value);
}

function getRetryDelayFromSchedule(
  schedule: readonly number[],
  retryCount: number,
): number {
  const scheduleIndex = retryCount - 1;
  const scheduledDelay =
    schedule[scheduleIndex];

  if (
    typeof scheduledDelay !== "number"
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_RETRY_INPUT",
      "Retry schedule does not contain the requested retry count.",
    );
  }

  return scheduledDelay;
}

export function getNaverKeywordStatsDateWindowDays(
  dateFrom: string,
  dateTo: string,
): number {
  const fromMilliseconds =
    parseIsoDateToUtcMilliseconds(dateFrom);

  const toMilliseconds =
    parseIsoDateToUtcMilliseconds(dateTo);

  if (fromMilliseconds > toMilliseconds) {
    throw new NaverKeywordStatsStateError(
      "INVALID_DATE_WINDOW",
      "dateFrom must be earlier than or equal to dateTo.",
    );
  }

  const oneDayMilliseconds =
    24 * 60 * 60 * 1_000;

  return (
    Math.floor(
      (
        toMilliseconds -
        fromMilliseconds
      ) / oneDayMilliseconds,
    ) + 1
  );
}

export function assertValidNaverKeywordStatsDateWindow(
  window: NaverKeywordStatsDateWindow,
  maxDays =
    NAVER_KEYWORD_STATS_DEFAULT_MAX_DATE_WINDOW_DAYS,
): void {
  assertNonNegativeInteger(
    window.index,
    "dateWindow.index",
  );

  assertPositiveInteger(
    maxDays,
    "maxDays",
  );

  const dateWindowDays =
    getNaverKeywordStatsDateWindowDays(
      window.dateFrom,
      window.dateTo,
    );

  if (dateWindowDays > maxDays) {
    throw new NaverKeywordStatsStateError(
      "INVALID_DATE_WINDOW",
      `Date window must not exceed ${maxDays} days.`,
    );
  }
}

export function createNaverKeywordStatsCursor(
  input: NaverKeywordStatsCursorInput,
): NaverKeywordStatsCursor {
  assertValidNaverKeywordStatsDateWindow(
    input.dateWindow,
  );

  const completedKeywordCount =
    input.completedKeywordCount ?? 0;

  const discoveredKeywordCount =
    input.discoveredKeywordCount ?? 0;

  assertNonNegativeInteger(
    completedKeywordCount,
    "completedKeywordCount",
  );

  assertNonNegativeInteger(
    discoveredKeywordCount,
    "discoveredKeywordCount",
  );

  if (
    completedKeywordCount >
    discoveredKeywordCount
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "completedKeywordCount must not exceed discoveredKeywordCount.",
    );
  }

  return {
    version:
      NAVER_KEYWORD_STATS_CURSOR_VERSION,

    dateWindowIndex:
      input.dateWindow.index,
    dateFrom:
      input.dateWindow.dateFrom,
    dateTo:
      input.dateWindow.dateTo,

    campaignBaseSearchId: null,
    campaignId: null,

    adgroupBaseSearchId: null,
    adgroupId: null,

    keywordBaseSearchId: null,

    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,

    lastCompletedKeywordId: null,

    completedKeywordCount,
    discoveredKeywordCount,
  };
}

export function normalizeNaverKeywordStatsCursor(
  value: unknown,
): NaverKeywordStatsCursor {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "Cursor must be an object.",
    );
  }

  const candidate =
    value as Partial<NaverKeywordStatsCursor>;

  if (
    candidate.version !==
    NAVER_KEYWORD_STATS_CURSOR_VERSION
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "Unsupported cursor version.",
    );
  }

  assertNonNegativeInteger(
    candidate.dateWindowIndex,
    "dateWindowIndex",
  );

  assertNonNegativeInteger(
    candidate.keywordChunkIndex,
    "keywordChunkIndex",
  );

  assertNonNegativeInteger(
    candidate.keywordIndexInChunk,
    "keywordIndexInChunk",
  );

  assertNonNegativeInteger(
    candidate.completedKeywordCount,
    "completedKeywordCount",
  );

  assertNonNegativeInteger(
    candidate.discoveredKeywordCount,
    "discoveredKeywordCount",
  );

  if (
    candidate.completedKeywordCount >
    candidate.discoveredKeywordCount
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "completedKeywordCount must not exceed discoveredKeywordCount.",
    );
  }

  const normalizedCursor:
    NaverKeywordStatsCursor = {
      version:
        NAVER_KEYWORD_STATS_CURSOR_VERSION,

      dateWindowIndex:
        candidate.dateWindowIndex,
      dateFrom:
        normalizeRequiredString(
          candidate.dateFrom,
          "dateFrom",
        ),
      dateTo:
        normalizeRequiredString(
          candidate.dateTo,
          "dateTo",
        ),

      campaignBaseSearchId:
        normalizeNullableString(
          candidate.campaignBaseSearchId,
          "campaignBaseSearchId",
        ),
      campaignId:
        normalizeNullableString(
          candidate.campaignId,
          "campaignId",
        ),

      adgroupBaseSearchId:
        normalizeNullableString(
          candidate.adgroupBaseSearchId,
          "adgroupBaseSearchId",
        ),
      adgroupId:
        normalizeNullableString(
          candidate.adgroupId,
          "adgroupId",
        ),

      keywordBaseSearchId:
        normalizeNullableString(
          candidate.keywordBaseSearchId,
          "keywordBaseSearchId",
        ),

      keywordChunkIndex:
        candidate.keywordChunkIndex,
      keywordIndexInChunk:
        candidate.keywordIndexInChunk,

      lastCompletedKeywordId:
        normalizeNullableString(
          candidate.lastCompletedKeywordId,
          "lastCompletedKeywordId",
        ),

      completedKeywordCount:
        candidate.completedKeywordCount,
      discoveredKeywordCount:
        candidate.discoveredKeywordCount,
    };

  assertValidNaverKeywordStatsDateWindow({
    index:
      normalizedCursor.dateWindowIndex,
    dateFrom:
      normalizedCursor.dateFrom,
    dateTo:
      normalizedCursor.dateTo,
  });

  return normalizedCursor;
}

export function setNaverKeywordStatsDiscoveredCount(
  cursor: NaverKeywordStatsCursor,
  discoveredKeywordCount: number,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  assertNonNegativeInteger(
    discoveredKeywordCount,
    "discoveredKeywordCount",
  );

  if (
    discoveredKeywordCount <
    normalizedCursor.completedKeywordCount
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "discoveredKeywordCount must not be lower than completedKeywordCount.",
    );
  }

  return {
    ...normalizedCursor,
    discoveredKeywordCount,
  };
}

export function addNaverKeywordStatsDiscoveredCount(
  cursor: NaverKeywordStatsCursor,
  discoveredKeywordCount: number,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  assertNonNegativeInteger(
    discoveredKeywordCount,
    "discoveredKeywordCount",
  );

  return {
    ...normalizedCursor,
    discoveredKeywordCount:
      normalizedCursor
        .discoveredKeywordCount +
      discoveredKeywordCount,
  };
}

export function setNaverKeywordStatsCampaignPosition(
  cursor: NaverKeywordStatsCursor,
  input: {
    campaignBaseSearchId:
      | string
      | null;
    campaignId: string | null;
  },
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  return {
    ...normalizedCursor,
    campaignBaseSearchId:
      normalizeNullableString(
        input.campaignBaseSearchId,
        "campaignBaseSearchId",
      ),
    campaignId:
      normalizeNullableString(
        input.campaignId,
        "campaignId",
      ),
    adgroupBaseSearchId: null,
    adgroupId: null,
    keywordBaseSearchId: null,
    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
  };
}

export function setNaverKeywordStatsAdgroupPosition(
  cursor: NaverKeywordStatsCursor,
  input: {
    adgroupBaseSearchId:
      | string
      | null;
    adgroupId: string | null;
  },
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  if (!normalizedCursor.campaignId) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "campaignId is required before setting an adgroup position.",
    );
  }

  return {
    ...normalizedCursor,
    adgroupBaseSearchId:
      normalizeNullableString(
        input.adgroupBaseSearchId,
        "adgroupBaseSearchId",
      ),
    adgroupId:
      normalizeNullableString(
        input.adgroupId,
        "adgroupId",
      ),
    keywordBaseSearchId: null,
    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
  };
}

export function setNaverKeywordStatsKeywordPagePosition(
  cursor: NaverKeywordStatsCursor,
  input: {
    keywordBaseSearchId:
      | string
      | null;
  },
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  if (!normalizedCursor.adgroupId) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "adgroupId is required before setting a keyword page position.",
    );
  }

  return {
    ...normalizedCursor,
    keywordBaseSearchId:
      normalizeNullableString(
        input.keywordBaseSearchId,
        "keywordBaseSearchId",
      ),
    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
  };
}

export function markNaverKeywordStatsKeywordCompleted(
  input: NaverKeywordStatsKeywordSuccessInput,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(
      input.cursor,
    );

  const keywordId =
    normalizeRequiredString(
      input.keywordId,
      "keywordId",
    );

  assertNonNegativeInteger(
    input.keywordIndexInChunk,
    "keywordIndexInChunk",
  );

  if (
    input.keywordIndexInChunk <
    normalizedCursor.keywordIndexInChunk
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "A completed keyword cannot move the cursor backward.",
    );
  }

  return {
    ...normalizedCursor,
    keywordIndexInChunk:
      input.keywordIndexInChunk + 1,
    lastCompletedKeywordId:
      keywordId,
    completedKeywordCount:
      normalizedCursor
        .completedKeywordCount + 1,
  };
}

export function advanceNaverKeywordStatsChunk(
  input: NaverKeywordStatsChunkAdvanceInput,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(
      input.cursor,
    );

  return {
    ...normalizedCursor,
    keywordBaseSearchId:
      normalizeNullableString(
        input.nextKeywordBaseSearchId,
        "nextKeywordBaseSearchId",
      ),
    keywordChunkIndex:
      normalizedCursor
        .keywordChunkIndex + 1,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
  };
}

export function advanceNaverKeywordStatsAdgroup(
  input: NaverKeywordStatsAdgroupAdvanceInput,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(
      input.cursor,
    );

  if (!normalizedCursor.campaignId) {
    throw new NaverKeywordStatsStateError(
      "INVALID_CURSOR",
      "campaignId is required before advancing an adgroup.",
    );
  }

  return {
    ...normalizedCursor,
    adgroupBaseSearchId:
      normalizeNullableString(
        input.nextAdgroupBaseSearchId,
        "nextAdgroupBaseSearchId",
      ),
    adgroupId:
      normalizeNullableString(
        input.nextAdgroupId,
        "nextAdgroupId",
      ),
    keywordBaseSearchId: null,
    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
  };
}

export function advanceNaverKeywordStatsCampaign(
  input: NaverKeywordStatsCampaignAdvanceInput,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(
      input.cursor,
    );

  return {
    ...normalizedCursor,
    campaignBaseSearchId:
      normalizeNullableString(
        input.nextCampaignBaseSearchId,
        "nextCampaignBaseSearchId",
      ),
    campaignId:
      normalizeNullableString(
        input.nextCampaignId,
        "nextCampaignId",
      ),
    adgroupBaseSearchId: null,
    adgroupId: null,
    keywordBaseSearchId: null,
    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,
    lastCompletedKeywordId: null,
  };
}

export function advanceNaverKeywordStatsDateWindow(
  cursor: NaverKeywordStatsCursor,
  nextDateWindow: NaverKeywordStatsDateWindow,
): NaverKeywordStatsCursor {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  assertValidNaverKeywordStatsDateWindow(
    nextDateWindow,
  );

  if (
    nextDateWindow.index !==
    normalizedCursor.dateWindowIndex + 1
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_DATE_WINDOW",
      "The next date window index must increase by exactly one.",
    );
  }

  return {
    version:
      NAVER_KEYWORD_STATS_CURSOR_VERSION,

    dateWindowIndex:
      nextDateWindow.index,
    dateFrom:
      nextDateWindow.dateFrom,
    dateTo:
      nextDateWindow.dateTo,

    campaignBaseSearchId: null,
    campaignId: null,

    adgroupBaseSearchId: null,
    adgroupId: null,

    keywordBaseSearchId: null,

    keywordChunkIndex: 0,
    keywordIndexInChunk: 0,

    lastCompletedKeywordId: null,

    completedKeywordCount:
      normalizedCursor
        .completedKeywordCount,
    discoveredKeywordCount:
      normalizedCursor
        .discoveredKeywordCount,
  };
}

export function resolveNaverKeywordStatsResumePosition(
  cursor: NaverKeywordStatsCursor,
  keywordIds: readonly string[],
): NaverKeywordStatsResumePosition {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  const normalizedKeywordIds =
    keywordIds.map(
      (keywordId, index) =>
        normalizeRequiredString(
          keywordId,
          `keywordIds[${index}]`,
        ),
    );

  if (
    normalizedKeywordIds.length === 0
  ) {
    return {
      keywordIndexInChunk: 0,
      matchedLastCompletedKeyword:
        normalizedCursor
          .lastCompletedKeywordId ===
        null,
      restartChunkFromBeginning: true,
    };
  }

  if (
    normalizedCursor
      .lastCompletedKeywordId
  ) {
    const completedKeywordIndex =
      normalizedKeywordIds.indexOf(
        normalizedCursor
          .lastCompletedKeywordId,
      );

    if (completedKeywordIndex >= 0) {
      return {
        keywordIndexInChunk:
          completedKeywordIndex + 1,
        matchedLastCompletedKeyword:
          true,
        restartChunkFromBeginning:
          false,
      };
    }
  }

  if (
    normalizedCursor.keywordIndexInChunk <
    normalizedKeywordIds.length
  ) {
    return {
      keywordIndexInChunk:
        normalizedCursor
          .keywordIndexInChunk,
      matchedLastCompletedKeyword:
        false,
      restartChunkFromBeginning:
        false,
    };
  }

  return {
    keywordIndexInChunk: 0,
    matchedLastCompletedKeyword:
      false,
    restartChunkFromBeginning: true,
  };
}

export function classifyNaverKeywordStatsRetryCategory(
  input: {
    httpStatus: number | null;
    isNetworkError?: boolean;
  },
): NaverKeywordStatsRetryCategory {
  if (input.isNetworkError === true) {
    return "network_error";
  }

  if (input.httpStatus === 429) {
    return "rate_limit";
  }

  if (
    input.httpStatus !== null &&
    input.httpStatus >= 500 &&
    input.httpStatus <= 599
  ) {
    return "server_error";
  }

  return "non_retryable";
}

export function decideNaverKeywordStatsRetry(
  input: NaverKeywordStatsRetryInput,
): NaverKeywordStatsRetryDecision {
  const maxRetryCount =
    input.maxRetryCount ??
    NAVER_KEYWORD_STATS_DEFAULT_MAX_RETRY_COUNT;

  assertPositiveInteger(
    maxRetryCount,
    "maxRetryCount",
  );

  assertNonNegativeInteger(
    input.retryCount,
    "retryCount",
  );

  const nextRetryCount =
    input.retryCount + 1;

  if (
    input.category ===
    "non_retryable"
  ) {
    return {
      shouldRetry: false,
      category:
        "non_retryable",
      retryCount:
        input.retryCount,
      delayMs: null,
      reason:
        "NON_RETRYABLE_ERROR",
    };
  }

  if (
    nextRetryCount >
    maxRetryCount
  ) {
    return {
      shouldRetry: false,
      category:
        input.category,
      retryCount:
        input.retryCount,
      delayMs: null,
      reason:
        "MAX_RETRY_COUNT_REACHED",
    };
  }

  const retryAfterMs =
    normalizeRetryAfterMs(
      input.retryAfterMs,
    );

  const jitterMs =
    normalizeJitterMs(
      input.jitterMs,
    );

  if (
    input.category ===
    "rate_limit"
  ) {
    const delayMs =
      retryAfterMs ??
      getRetryDelayFromSchedule(
        NAVER_KEYWORD_STATS_RATE_LIMIT_RETRY_DELAYS_MS,
        nextRetryCount,
      );

    return {
      shouldRetry: true,
      category:
        "rate_limit",
      retryCount:
        nextRetryCount,
      delayMs,
    };
  }

  const baseDelayMs =
    getRetryDelayFromSchedule(
      NAVER_KEYWORD_STATS_SERVER_RETRY_DELAYS_MS,
      nextRetryCount,
    );

  return {
    shouldRetry: true,
    category:
      input.category,
    retryCount:
      nextRetryCount,
    delayMs:
      baseDelayMs + jitterMs,
  };
}

export function createNaverKeywordStatsFailureState(
  input: NaverKeywordStatsFailureInput,
): NaverKeywordStatsFailureState {
  const cursor =
    normalizeNaverKeywordStatsCursor(
      input.cursor,
    );

  const keywordId =
    normalizeNullableString(
      input.keywordId,
      "keywordId",
    );

  const errorCode =
    normalizeRequiredString(
      input.errorCode,
      "errorCode",
    );

  assertNonNegativeInteger(
    input.retryCount,
    "retryCount",
  );

  if (
    input.httpStatus !== null &&
    (
      !Number.isInteger(
        input.httpStatus,
      ) ||
      input.httpStatus < 100 ||
      input.httpStatus > 599
    )
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_FAILURE_STATE",
      "httpStatus must be null or a valid HTTP status code.",
    );
  }

  const failedAt =
    normalizeRequiredString(
      input.failedAt,
      "failedAt",
    );

  const failedAtDate =
    new Date(failedAt);

  if (
    Number.isNaN(
      failedAtDate.getTime(),
    )
  ) {
    throw new NaverKeywordStatsStateError(
      "INVALID_FAILURE_STATE",
      "failedAt must be a valid datetime string.",
    );
  }

  return {
    cursor:
      cloneCursor(cursor),
    keywordId,
    httpStatus:
      input.httpStatus,
    errorCode,
    retryCount:
      input.retryCount,
    failedAt:
      failedAtDate.toISOString(),
  };
}

export function isNaverKeywordStatsCursorAtChunkStart(
  cursor: NaverKeywordStatsCursor,
): boolean {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  return (
    normalizedCursor
      .keywordIndexInChunk === 0 &&
    normalizedCursor
      .lastCompletedKeywordId === null
  );
}

export function isNaverKeywordStatsCursorAtHierarchyStart(
  cursor: NaverKeywordStatsCursor,
): boolean {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(cursor);

  return (
    normalizedCursor
      .campaignBaseSearchId === null &&
    normalizedCursor
      .campaignId === null &&
    normalizedCursor
      .adgroupBaseSearchId === null &&
    normalizedCursor
      .adgroupId === null &&
    normalizedCursor
      .keywordBaseSearchId === null &&
    normalizedCursor
      .keywordChunkIndex === 0 &&
    normalizedCursor
      .keywordIndexInChunk === 0 &&
    normalizedCursor
      .lastCompletedKeywordId === null
  );
}
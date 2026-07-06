import { setTimeout as delay } from "node:timers/promises";

import type { NaverSearchAdsCredentials } from "./connection-credentials";
import {
  NaverSearchAdsApiError,
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsKeywordDailyStats,
  fetchNaverSearchAdsKeywordPage,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsKeywordDailyStatsResult,
  type NaverSearchAdsKeywordRecord,
  type NaverSearchAdsListPage,
} from "./naver-searchads-api";
import {
  NAVER_KEYWORD_STATS_DEFAULT_CHUNK_PAUSE_MS,
  NAVER_KEYWORD_STATS_DEFAULT_CHUNK_SIZE,
  NAVER_KEYWORD_STATS_DEFAULT_MAX_RETRY_COUNT,
  NAVER_KEYWORD_STATS_DEFAULT_REQUEST_INTERVAL_MS,
  NAVER_KEYWORD_STATS_MAX_JITTER_MS,
  classifyNaverKeywordStatsRetryCategory,
  createNaverKeywordStatsFailureState,
  decideNaverKeywordStatsRetry,
  markNaverKeywordStatsKeywordCompleted,
  normalizeNaverKeywordStatsCursor,
  resolveNaverKeywordStatsResumePosition,
  setNaverKeywordStatsAdgroupPosition,
  setNaverKeywordStatsCampaignPosition,
  setNaverKeywordStatsDiscoveredCount,
  setNaverKeywordStatsKeywordPagePosition,
  type NaverKeywordStatsCursor,
  type NaverKeywordStatsFailureState,
  type NaverKeywordStatsRetryCategory,
} from "./naver-searchads-keyword-stats-state";

const NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE = 100;

const NAVER_KEYWORD_STATS_MAX_CAMPAIGN_PAGES = 10_000;
const NAVER_KEYWORD_STATS_MAX_ADGROUP_PAGES = 10_000;
const NAVER_KEYWORD_STATS_MAX_KEYWORD_PAGES = 10_000;

const NAVER_KEYWORD_STATS_MAX_KEYWORDS_PER_RUN = 1_000_000;
const NAVER_KEYWORD_STATS_MAX_REQUESTS_PER_RUN = 1_000_000;
const NAVER_KEYWORD_DISCOVERY_MAX_PAGES_PER_RUN = 1_000_000;

export type NaverKeywordStatsCollectorErrorCode =
  | "INVALID_INPUT"
  | "COLLECTION_ABORTED"
  | "API_REQUEST_FAILED"
  | "RETRY_EXHAUSTED"
  | "CONSUMER_FAILED"
  | "INVALID_PAGINATION_CURSOR"
  | "PAGE_LIMIT_EXCEEDED"
  | "RESUME_POSITION_NOT_FOUND";

export class NaverKeywordStatsCollectorError extends Error {
  readonly code: NaverKeywordStatsCollectorErrorCode;
  readonly cursor: NaverKeywordStatsCursor;
  readonly failureState: NaverKeywordStatsFailureState | null;

  constructor(
    code: NaverKeywordStatsCollectorErrorCode,
    message: string,
    options: ErrorOptions & {
      cursor: NaverKeywordStatsCursor;
      failureState?: NaverKeywordStatsFailureState | null;
    },
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "NaverKeywordStatsCollectorError";
    this.code = code;
    this.cursor = {
      ...options.cursor,
    };

    this.failureState =
      options.failureState
        ? {
            ...options.failureState,
            cursor: {
              ...options.failureState.cursor,
            },
          }
        : null;
  }
}

export type NaverKeywordStatsCollectorItem = {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  keyword: NaverSearchAdsKeywordRecord;
  stats: NaverSearchAdsKeywordDailyStatsResult;

  cursorBefore: NaverKeywordStatsCursor;
  cursorAfter: NaverKeywordStatsCursor;

  requestAttemptCount: number;
};

export type NaverKeywordStatsCollectorConsumer = (
  item: NaverKeywordStatsCollectorItem,
) => void | Promise<void>;

export type NaverKeywordStatsCollectorRetryOperation =
  | "campaign_page"
  | "adgroup_page"
  | "keyword_page"
  | "keyword_stats";

export type NaverKeywordStatsCollectorRetryEvent = {
  category: Exclude<
    NaverKeywordStatsRetryCategory,
    "non_retryable"
  >;

  retryCount: number;
  delayMs: number;

  operation: NaverKeywordStatsCollectorRetryOperation;

  keywordId: string | null;
  httpStatus: number | null;
  errorCode: string;

  cursor: NaverKeywordStatsCursor;
};

export type NaverKeywordStatsCollectorRetryCallback = (
  event: NaverKeywordStatsCollectorRetryEvent,
) => void | Promise<void>;

export type NaverKeywordStatsCollectorProgressStage =
  | "collector:start"
  | "collector:partial"
  | "collector:done"
  | "campaign_page:start"
  | "campaign_page:done"
  | "campaign:start"
  | "campaign:done"
  | "adgroup_page:start"
  | "adgroup_page:done"
  | "adgroup:start"
  | "adgroup:done"
  | "keyword_page:start"
  | "keyword_page:done"
  | "keyword_chunk:start"
  | "keyword_chunk:done"
  | "keyword_chunk:pause"
  | "keyword_stats:start"
  | "keyword_stats:done";

export type NaverKeywordStatsCollectorProgressEvent = {
  stage: NaverKeywordStatsCollectorProgressStage;

  cursor: NaverKeywordStatsCursor;

  campaignId: string | null;
  adgroupId: string | null;
  keywordId: string | null;

  pageNumber: number | null;
  recordsRead: number | null;
  chunkIndex: number | null;
  chunkSize: number | null;
  keywordIndexInChunk: number | null;

  campaignPagesRead: number;
  campaignsRead: number;
  adgroupPagesRead: number;
  adgroupsRead: number;
  keywordPagesRead: number;
  keywordsDiscoveredInRun: number;
  keywordsCompletedInRun: number;
  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;
  retryCount: number;

  attemptCount: number | null;
  delayMs: number | null;
};

export type NaverKeywordStatsCollectorProgressCallback = (
  event: NaverKeywordStatsCollectorProgressEvent,
) => void | Promise<void>;

export type NaverKeywordStatsCollectorSleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

export type NaverKeywordStatsCollectorDependencies = {
  fetchCampaignPage: typeof fetchNaverSearchAdsCampaignPage;
  fetchAdgroupPage: typeof fetchNaverSearchAdsAdgroupPage;
  fetchKeywordPage: typeof fetchNaverSearchAdsKeywordPage;
  fetchKeywordDailyStats:
    typeof fetchNaverSearchAdsKeywordDailyStats;

  sleep: NaverKeywordStatsCollectorSleep;
  now: () => number;
  random: () => number;
};

export type NaverKeywordStatsCollectorInput = {
  credentials: NaverSearchAdsCredentials;
  cursor: NaverKeywordStatsCursor;

  onKeywordStats: NaverKeywordStatsCollectorConsumer;
  onRetry?: NaverKeywordStatsCollectorRetryCallback;
  onProgress?: NaverKeywordStatsCollectorProgressCallback;

  requestIntervalMs?: number;
  keywordChunkSize?: number;
  chunkPauseMs?: number;
  maxRetryCount?: number;

  maxKeywordStatsPerRun?: number;
  maxStatsRequestsPerRun?: number;
  maxKeywordDiscoveryPagesPerRun?: number;

  signal?: AbortSignal;

  dependencies?: Partial<NaverKeywordStatsCollectorDependencies>;
};

export type NaverKeywordStatsCollectorPartialReason =
  | "max_keyword_stats_per_run_reached"
  | "max_stats_requests_per_run_reached"
  | "max_keyword_discovery_pages_per_run_reached";

export type NaverKeywordStatsCollectorBaseResult = {
  cursor: NaverKeywordStatsCursor;

  campaignPagesRead: number;
  campaignsRead: number;

  adgroupPagesRead: number;
  adgroupsRead: number;

  keywordPagesRead: number;
  keywordsDiscoveredInRun: number;
  keywordsCompletedInRun: number;

  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;

  retryCount: number;
};

export type NaverKeywordStatsCollectorCompletedResult =
  NaverKeywordStatsCollectorBaseResult & {
    status: "completed";
    completed: true;
    isComplete: true;
    partialReason: null;
  };

export type NaverKeywordStatsCollectorPartialResult =
  NaverKeywordStatsCollectorBaseResult & {
    status: "partial";
    completed: false;
    isComplete: false;
    partialReason: NaverKeywordStatsCollectorPartialReason;
  };

export type NaverKeywordStatsCollectorResult =
  | NaverKeywordStatsCollectorCompletedResult
  | NaverKeywordStatsCollectorPartialResult;

type NormalizedCollectorOptions = {
  requestIntervalMs: number;
  keywordChunkSize: number;
  chunkPauseMs: number;
  maxRetryCount: number;
  maxKeywordStatsPerRun: number | null;
  maxStatsRequestsPerRun: number | null;
  maxKeywordDiscoveryPagesPerRun: number | null;
};

type ResolvedCollectorDependencies =
  NaverKeywordStatsCollectorDependencies;

type CollectorRuntimeState = {
  cursor: NaverKeywordStatsCursor;

  campaignPagesRead: number;
  campaignsRead: number;

  adgroupPagesRead: number;
  adgroupsRead: number;

  keywordPagesRead: number;

  keywordsDiscoveredInRun: number;
  keywordsCompletedInRun: number;

  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;

  retryCount: number;

  lastStatsRequestStartedAt: number | null;
};

type ApiRequestResult<T> = {
  value: T;
  attemptCount: number;
};

type ResumeTarget = {
  enabled: boolean;

  campaignId: string | null;
  adgroupId: string | null;

  keywordBaseSearchId: string | null;
  keywordChunkIndex: number;
  keywordIndexInChunk: number;
  lastCompletedKeywordId: string | null;

  campaignMatched: boolean;
  adgroupMatched: boolean;
  keywordPageMatched: boolean;
  keywordChunkMatched: boolean;
};

type CollectorTraversalResult =
  | {
      status: "continue";
    }
  | {
      status: "partial";
      reason: NaverKeywordStatsCollectorPartialReason;
    };

const CONTINUE_TRAVERSAL: CollectorTraversalResult = {
  status: "continue",
};

const DEFAULT_COLLECTOR_DEPENDENCIES:
  ResolvedCollectorDependencies = {
    fetchCampaignPage:
      fetchNaverSearchAdsCampaignPage,

    fetchAdgroupPage:
      fetchNaverSearchAdsAdgroupPage,

    fetchKeywordPage:
      fetchNaverSearchAdsKeywordPage,

    fetchKeywordDailyStats:
      fetchNaverSearchAdsKeywordDailyStats,

    sleep: async (
      milliseconds: number,
      signal?: AbortSignal,
    ): Promise<void> => {
      await delay(
        milliseconds,
        undefined,
        signal
          ? {
              signal,
            }
          : undefined,
      );
    },

    now: () => Date.now(),
    random: () => Math.random(),
  };

function normalizeNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value;
}

function normalizePositiveInteger(
  value: unknown,
  fieldName: string,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new Error(
      `${fieldName} must be an integer between 1 and ${maximum}.`,
    );
  }

  return value;
}

function normalizeOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
  maximum: number,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizePositiveInteger(
    value,
    fieldName,
    maximum,
  );
}

function normalizeCollectorOptions(
  input: NaverKeywordStatsCollectorInput,
): NormalizedCollectorOptions {
  return {
    requestIntervalMs:
      input.requestIntervalMs === undefined
        ? NAVER_KEYWORD_STATS_DEFAULT_REQUEST_INTERVAL_MS
        : normalizeNonNegativeInteger(
            input.requestIntervalMs,
            "requestIntervalMs",
          ),

    keywordChunkSize:
      input.keywordChunkSize === undefined
        ? NAVER_KEYWORD_STATS_DEFAULT_CHUNK_SIZE
        : normalizePositiveInteger(
            input.keywordChunkSize,
            "keywordChunkSize",
            NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,
          ),

    chunkPauseMs:
      input.chunkPauseMs === undefined
        ? NAVER_KEYWORD_STATS_DEFAULT_CHUNK_PAUSE_MS
        : normalizeNonNegativeInteger(
            input.chunkPauseMs,
            "chunkPauseMs",
          ),

    maxRetryCount:
      input.maxRetryCount === undefined
        ? NAVER_KEYWORD_STATS_DEFAULT_MAX_RETRY_COUNT
        : normalizePositiveInteger(
            input.maxRetryCount,
            "maxRetryCount",
            10,
          ),

    maxKeywordStatsPerRun:
      normalizeOptionalPositiveInteger(
        input.maxKeywordStatsPerRun,
        "maxKeywordStatsPerRun",
        NAVER_KEYWORD_STATS_MAX_KEYWORDS_PER_RUN,
      ),

    maxStatsRequestsPerRun:
      normalizeOptionalPositiveInteger(
        input.maxStatsRequestsPerRun,
        "maxStatsRequestsPerRun",
        NAVER_KEYWORD_STATS_MAX_REQUESTS_PER_RUN,
      ),

    maxKeywordDiscoveryPagesPerRun:
      normalizeOptionalPositiveInteger(
        input.maxKeywordDiscoveryPagesPerRun,
        "maxKeywordDiscoveryPagesPerRun",
        NAVER_KEYWORD_DISCOVERY_MAX_PAGES_PER_RUN,
      ),
  };
}

function resolveCollectorDependencies(
  dependencies:
    | Partial<NaverKeywordStatsCollectorDependencies>
    | undefined,
): ResolvedCollectorDependencies {
  const resolvedDependencies:
    ResolvedCollectorDependencies = {
      ...DEFAULT_COLLECTOR_DEPENDENCIES,
      ...dependencies,
    };

  const dependencyEntries: Array<
    [
      keyof ResolvedCollectorDependencies,
      unknown,
    ]
  > = [
    [
      "fetchCampaignPage",
      resolvedDependencies.fetchCampaignPage,
    ],
    [
      "fetchAdgroupPage",
      resolvedDependencies.fetchAdgroupPage,
    ],
    [
      "fetchKeywordPage",
      resolvedDependencies.fetchKeywordPage,
    ],
    [
      "fetchKeywordDailyStats",
      resolvedDependencies.fetchKeywordDailyStats,
    ],
    [
      "sleep",
      resolvedDependencies.sleep,
    ],
    [
      "now",
      resolvedDependencies.now,
    ],
    [
      "random",
      resolvedDependencies.random,
    ],
  ];

  for (
    const [dependencyName, dependency]
    of dependencyEntries
  ) {
    if (typeof dependency !== "function") {
      throw new Error(
        `${dependencyName} dependency must be a function.`,
      );
    }
  }

  return resolvedDependencies;
}

function cloneCursor(
  cursor: NaverKeywordStatsCursor,
): NaverKeywordStatsCursor {
  return {
    ...cursor,
  };
}

function createInitialRuntimeState(
  cursor: NaverKeywordStatsCursor,
): CollectorRuntimeState {
  return {
    cursor:
      cloneCursor(cursor),

    campaignPagesRead: 0,
    campaignsRead: 0,

    adgroupPagesRead: 0,
    adgroupsRead: 0,

    keywordPagesRead: 0,

    keywordsDiscoveredInRun: 0,
    keywordsCompletedInRun: 0,

    statsRequestsAttempted: 0,
    statsRequestsSucceeded: 0,

    retryCount: 0,

    lastStatsRequestStartedAt: null,
  };
}

function createResumeTarget(
  cursor: NaverKeywordStatsCursor,
): ResumeTarget {
  const hasHierarchyPosition =
    cursor.campaignId !== null ||
    cursor.adgroupId !== null ||
    cursor.keywordBaseSearchId !== null ||
    cursor.keywordChunkIndex > 0 ||
    cursor.keywordIndexInChunk > 0 ||
    cursor.lastCompletedKeywordId !== null;

  return {
    enabled:
      hasHierarchyPosition,

    campaignId:
      cursor.campaignId,

    adgroupId:
      cursor.adgroupId,

    keywordBaseSearchId:
      cursor.keywordBaseSearchId,

    keywordChunkIndex:
      cursor.keywordChunkIndex,

    keywordIndexInChunk:
      cursor.keywordIndexInChunk,

    lastCompletedKeywordId:
      cursor.lastCompletedKeywordId,

    campaignMatched:
      !hasHierarchyPosition ||
      cursor.campaignId === null,

    adgroupMatched:
      !hasHierarchyPosition ||
      cursor.adgroupId === null,

    keywordPageMatched:
      !hasHierarchyPosition ||
      cursor.keywordBaseSearchId === null,

    keywordChunkMatched:
      !hasHierarchyPosition ||
      (
        cursor.keywordBaseSearchId === null &&
        cursor.keywordChunkIndex === 0
      ),
  };
}

function getKeywordDiscoveryPagesRead(
  state: CollectorRuntimeState,
): number {
  return (
    state.campaignPagesRead +
    state.adgroupPagesRead +
    state.keywordPagesRead
  );
}

function getDiscoveryPagePartialReasonForCurrentRun(
  state: CollectorRuntimeState,
  options: NormalizedCollectorOptions,
): NaverKeywordStatsCollectorPartialReason | null {
  if (
    options.maxKeywordDiscoveryPagesPerRun !== null &&
    getKeywordDiscoveryPagesRead(state) >=
      options.maxKeywordDiscoveryPagesPerRun
  ) {
    return "max_keyword_discovery_pages_per_run_reached";
  }

  return null;
}

function shouldStopAfterCompletedPage(input: {
  state: CollectorRuntimeState;
  options: NormalizedCollectorOptions;
}): NaverKeywordStatsCollectorPartialReason | null {
  return getDiscoveryPagePartialReasonForCurrentRun(
    input.state,
    input.options,
  );
}

function resetCursorForNextCampaignPage(input: {
  cursor: NaverKeywordStatsCursor;
  campaignBaseSearchId: string;
}): NaverKeywordStatsCursor {
  return {
    ...input.cursor,

    campaignBaseSearchId:
      input.campaignBaseSearchId,

    campaignId:
      null,

    adgroupBaseSearchId:
      null,

    adgroupId:
      null,

    keywordBaseSearchId:
      null,

    keywordChunkIndex:
      0,

    keywordIndexInChunk:
      0,

    lastCompletedKeywordId:
      null,
  };
}

function resetCursorForNextAdgroupPage(input: {
  cursor: NaverKeywordStatsCursor;
  adgroupBaseSearchId: string;
}): NaverKeywordStatsCursor {
  return {
    ...input.cursor,

    adgroupBaseSearchId:
      input.adgroupBaseSearchId,

    adgroupId:
      null,

    keywordBaseSearchId:
      null,

    keywordChunkIndex:
      0,

    keywordIndexInChunk:
      0,

    lastCompletedKeywordId:
      null,
  };
}

function resetCursorForNextKeywordPage(input: {
  cursor: NaverKeywordStatsCursor;
  keywordBaseSearchId: string;
}): NaverKeywordStatsCursor {
  return {
    ...input.cursor,

    keywordBaseSearchId:
      input.keywordBaseSearchId,

    keywordChunkIndex:
      0,

    keywordIndexInChunk:
      0,

    lastCompletedKeywordId:
      null,
  };
}

function getPartialReasonForCurrentRun(
  state: CollectorRuntimeState,
  options: NormalizedCollectorOptions,
): NaverKeywordStatsCollectorPartialReason | null {
  if (
    options.maxKeywordStatsPerRun !== null &&
    state.keywordsCompletedInRun >=
      options.maxKeywordStatsPerRun
  ) {
    return "max_keyword_stats_per_run_reached";
  }

  if (
    options.maxStatsRequestsPerRun !== null &&
    state.statsRequestsAttempted >=
      options.maxStatsRequestsPerRun
  ) {
    return "max_stats_requests_per_run_reached";
  }

  return null;
}

function buildCollectorResult(
  input:
    | {
        status: "completed";
        state: CollectorRuntimeState;
      }
    | {
        status: "partial";
        state: CollectorRuntimeState;
        partialReason:
          NaverKeywordStatsCollectorPartialReason;
      },
): NaverKeywordStatsCollectorResult {
  const baseResult: NaverKeywordStatsCollectorBaseResult = {
    cursor:
      cloneCursor(
        input.state.cursor,
      ),

    campaignPagesRead:
      input.state.campaignPagesRead,

    campaignsRead:
      input.state.campaignsRead,

    adgroupPagesRead:
      input.state.adgroupPagesRead,

    adgroupsRead:
      input.state.adgroupsRead,

    keywordPagesRead:
      input.state.keywordPagesRead,

    keywordsDiscoveredInRun:
      input.state.keywordsDiscoveredInRun,

    keywordsCompletedInRun:
      input.state.keywordsCompletedInRun,

    statsRequestsAttempted:
      input.state.statsRequestsAttempted,

    statsRequestsSucceeded:
      input.state.statsRequestsSucceeded,

    retryCount:
      input.state.retryCount,
  };

  if (input.status === "completed") {
    return {
      ...baseResult,
      status: "completed",
      completed: true,
      isComplete: true,
      partialReason: null,
    };
  }

  return {
    ...baseResult,
    status: "partial",
    completed: false,
    isComplete: false,
    partialReason:
      input.partialReason,
  };
}

function assertNotAborted(
  signal: AbortSignal | undefined,
  cursor: NaverKeywordStatsCursor,
): void {
  if (signal?.aborted !== true) {
    return;
  }

  throw new NaverKeywordStatsCollectorError(
    "COLLECTION_ABORTED",
    "Naver keyword stats collection was aborted.",
    {
      cursor,
    },
  );
}

async function waitWithAbort(input: {
  milliseconds: number;
  signal: AbortSignal | undefined;
  cursor: NaverKeywordStatsCursor;
  dependencies: ResolvedCollectorDependencies;
}): Promise<void> {
  if (input.milliseconds <= 0) {
    assertNotAborted(
      input.signal,
      input.cursor,
    );

    return;
  }

  assertNotAborted(
    input.signal,
    input.cursor,
  );

  try {
    await input.dependencies.sleep(
      input.milliseconds,
      input.signal,
    );
  } catch (error) {
    if (input.signal?.aborted === true) {
      throw new NaverKeywordStatsCollectorError(
        "COLLECTION_ABORTED",
        "Naver keyword stats collection was aborted while waiting.",
        {
          cursor:
            input.cursor,
          cause:
            error,
        },
      );
    }

    throw error;
  }
}

function createJitterMs(
  dependencies: ResolvedCollectorDependencies,
): number {
  const randomValue =
    dependencies.random();

  if (
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue >= 1
  ) {
    throw new Error(
      "random dependency must return a number greater than or equal to 0 and lower than 1.",
    );
  }

  return Math.floor(
    randomValue *
      (
        NAVER_KEYWORD_STATS_MAX_JITTER_MS +
        1
      ),
  );
}

function isNetworkApiError(
  error: NaverSearchAdsApiError,
): boolean {
  return (
    error.code === "NETWORK_ERROR" ||
    error.code === "REQUEST_TIMEOUT"
  );
}

function getApiErrorCode(
  error: NaverSearchAdsApiError,
): string {
  if (
    error.code === "HTTP_ERROR" &&
    error.status !== null
  ) {
    return `${error.code}_${error.status}`;
  }

  return error.code;
}

function buildFailureState(input: {
  cursor: NaverKeywordStatsCursor;
  keywordId: string | null;
  error: NaverSearchAdsApiError;
  retryCount: number;
  dependencies: ResolvedCollectorDependencies;
}): NaverKeywordStatsFailureState {
  return createNaverKeywordStatsFailureState({
    cursor:
      input.cursor,

    keywordId:
      input.keywordId,

    httpStatus:
      input.error.status,

    errorCode:
      getApiErrorCode(
        input.error,
      ),

    retryCount:
      input.retryCount,

    failedAt:
      new Date(
        input.dependencies.now(),
      ).toISOString(),
  });
}

async function notifyRetry(
  callback:
    | NaverKeywordStatsCollectorRetryCallback
    | undefined,
  event: NaverKeywordStatsCollectorRetryEvent,
): Promise<void> {
  if (!callback) {
    return;
  }

  await callback({
    ...event,
    cursor:
      cloneCursor(
        event.cursor,
      ),
  });
}

async function notifyProgress(input: {
  callback:
    | NaverKeywordStatsCollectorProgressCallback
    | undefined;
  stage: NaverKeywordStatsCollectorProgressStage;
  state: CollectorRuntimeState;
  campaignId?: string | null;
  adgroupId?: string | null;
  keywordId?: string | null;
  pageNumber?: number | null;
  recordsRead?: number | null;
  chunkIndex?: number | null;
  chunkSize?: number | null;
  keywordIndexInChunk?: number | null;
  attemptCount?: number | null;
  delayMs?: number | null;
}): Promise<void> {
  if (!input.callback) {
    return;
  }

  await input.callback({
    stage:
      input.stage,

    cursor:
      cloneCursor(input.state.cursor),

    campaignId:
      input.campaignId ?? input.state.cursor.campaignId ?? null,

    adgroupId:
      input.adgroupId ?? input.state.cursor.adgroupId ?? null,

    keywordId:
      input.keywordId ?? input.state.cursor.lastCompletedKeywordId ?? null,

    pageNumber:
      input.pageNumber ?? null,

    recordsRead:
      input.recordsRead ?? null,

    chunkIndex:
      input.chunkIndex ?? null,

    chunkSize:
      input.chunkSize ?? null,

    keywordIndexInChunk:
      input.keywordIndexInChunk ?? null,

    campaignPagesRead:
      input.state.campaignPagesRead,

    campaignsRead:
      input.state.campaignsRead,

    adgroupPagesRead:
      input.state.adgroupPagesRead,

    adgroupsRead:
      input.state.adgroupsRead,

    keywordPagesRead:
      input.state.keywordPagesRead,

    keywordsDiscoveredInRun:
      input.state.keywordsDiscoveredInRun,

    keywordsCompletedInRun:
      input.state.keywordsCompletedInRun,

    statsRequestsAttempted:
      input.state.statsRequestsAttempted,

    statsRequestsSucceeded:
      input.state.statsRequestsSucceeded,

    retryCount:
      input.state.retryCount,

    attemptCount:
      input.attemptCount ?? null,

    delayMs:
      input.delayMs ?? null,
  });
}

async function waitForStatsRequestInterval(input: {
  state: CollectorRuntimeState;
  options: NormalizedCollectorOptions;
  signal: AbortSignal | undefined;
  dependencies: ResolvedCollectorDependencies;
}): Promise<void> {
  if (
    input.state.lastStatsRequestStartedAt ===
    null
  ) {
    return;
  }

  const elapsedMilliseconds =
    input.dependencies.now() -
    input.state.lastStatsRequestStartedAt;

  const remainingMilliseconds =
    input.options.requestIntervalMs -
    elapsedMilliseconds;

  if (remainingMilliseconds <= 0) {
    return;
  }

  await waitWithAbort({
    milliseconds:
      remainingMilliseconds,

    signal:
      input.signal,

    cursor:
      input.state.cursor,

    dependencies:
      input.dependencies,
  });
}

async function executeApiRequestWithRetry<T>(input: {
  operation: NaverKeywordStatsCollectorRetryOperation;
  keywordId: string | null;

  state: CollectorRuntimeState;
  options: NormalizedCollectorOptions;

  signal: AbortSignal | undefined;

  onRetry:
    | NaverKeywordStatsCollectorRetryCallback
    | undefined;

  dependencies: ResolvedCollectorDependencies;

  beforeAttempt?: () => Promise<void>;
  request: () => Promise<T>;
}): Promise<ApiRequestResult<T>> {
  let retryCount = 0;

  while (true) {
    assertNotAborted(
      input.signal,
      input.state.cursor,
    );

    if (input.beforeAttempt) {
      await input.beforeAttempt();
    }

    if (
      input.operation ===
      "keyword_stats"
    ) {
      input.state.lastStatsRequestStartedAt =
        input.dependencies.now();

      input.state.statsRequestsAttempted += 1;
    }

    try {
      const value =
        await input.request();

      if (
        input.operation ===
        "keyword_stats"
      ) {
        input.state.statsRequestsSucceeded += 1;
      }

      return {
        value,
        attemptCount:
          retryCount + 1,
      };
    } catch (error) {
      if (
        !(error instanceof NaverSearchAdsApiError)
      ) {
        throw error;
      }

      const category =
        classifyNaverKeywordStatsRetryCategory({
          httpStatus:
            error.status,

          isNetworkError:
            isNetworkApiError(error),
        });

      const retryDecision =
        decideNaverKeywordStatsRetry({
          category,
          retryCount,

          jitterMs:
            category === "server_error" ||
            category === "network_error"
              ? createJitterMs(
                  input.dependencies,
                )
              : 0,

          maxRetryCount:
            input.options.maxRetryCount,
        });

      if (!retryDecision.shouldRetry) {
        const failureState =
          buildFailureState({
            cursor:
              input.state.cursor,

            keywordId:
              input.keywordId,

            error,

            retryCount:
              retryDecision.retryCount,

            dependencies:
              input.dependencies,
          });

        throw new NaverKeywordStatsCollectorError(
          retryDecision.reason ===
            "MAX_RETRY_COUNT_REACHED"
            ? "RETRY_EXHAUSTED"
            : "API_REQUEST_FAILED",

          retryDecision.reason ===
            "MAX_RETRY_COUNT_REACHED"
            ? "Naver Search Ads API retry limit was reached."
            : "Naver Search Ads API request failed with a non-retryable error.",

          {
            cursor:
              input.state.cursor,

            failureState,

            cause:
              error,
          },
        );
      }

      retryCount =
        retryDecision.retryCount;

      input.state.retryCount += 1;

      await notifyRetry(
        input.onRetry,
        {
          category:
            retryDecision.category,

          retryCount:
            retryDecision.retryCount,

          delayMs:
            retryDecision.delayMs,

          operation:
            input.operation,

          keywordId:
            input.keywordId,

          httpStatus:
            error.status,

          errorCode:
            getApiErrorCode(
              error,
            ),

          cursor:
            input.state.cursor,
        },
      );

      await waitWithAbort({
        milliseconds:
          retryDecision.delayMs,

        signal:
          input.signal,

        cursor:
          input.state.cursor,

        dependencies:
          input.dependencies,
      });
    }
  }
}

function splitKeywordPageIntoChunks(
  keywords: readonly NaverSearchAdsKeywordRecord[],
  chunkSize: number,
): NaverSearchAdsKeywordRecord[][] {
  const chunks:
    NaverSearchAdsKeywordRecord[][] = [];

  for (
    let offset = 0;
    offset < keywords.length;
    offset += chunkSize
  ) {
    chunks.push(
      keywords.slice(
        offset,
        offset + chunkSize,
      ),
    );
  }

  return chunks;
}

function getSafeDiscoveredCountForChunk(input: {
  cursor: NaverKeywordStatsCursor;
  remainingKeywordCount: number;
}): number {
  return Math.max(
    input.cursor.discoveredKeywordCount,

    input.cursor.completedKeywordCount +
      input.remainingKeywordCount,
  );
}

function setCursorDiscoveredLowerBound(input: {
  cursor: NaverKeywordStatsCursor;
  remainingKeywordCount: number;
}): NaverKeywordStatsCursor {
  const nextDiscoveredCount =
    getSafeDiscoveredCountForChunk(
      input,
    );

  if (
    nextDiscoveredCount ===
    input.cursor.discoveredKeywordCount
  ) {
    return cloneCursor(
      input.cursor,
    );
  }

  return setNaverKeywordStatsDiscoveredCount(
    input.cursor,
    nextDiscoveredCount,
  );
}

function assertPaginationCanContinue(input: {
  currentBaseSearchId: string | null;
  nextBaseSearchId: string | null;

  recordsLength: number;
  recordSize: number;

  cursor: NaverKeywordStatsCursor;

  level:
    | "campaign"
    | "adgroup"
    | "keyword";
}): void {
  if (
    input.recordsLength <
    input.recordSize
  ) {
    return;
  }

  if (
    !input.nextBaseSearchId ||
    input.nextBaseSearchId ===
      input.currentBaseSearchId
  ) {
    throw new NaverKeywordStatsCollectorError(
      "INVALID_PAGINATION_CURSOR",
      `Naver Search Ads ${input.level} pagination cursor did not advance.`,
      {
        cursor:
          input.cursor,
      },
    );
  }
}

function shouldSkipCampaignForResume(
  resumeTarget: ResumeTarget,
  campaignId: string,
): boolean {
  if (
    !resumeTarget.enabled ||
    resumeTarget.campaignMatched
  ) {
    return false;
  }

  if (
    resumeTarget.campaignId ===
    campaignId
  ) {
    resumeTarget.campaignMatched =
      true;

    return false;
  }

  return true;
}

function shouldSkipAdgroupForResume(
  resumeTarget: ResumeTarget,
  adgroupId: string,
): boolean {
  if (
    !resumeTarget.enabled ||
    resumeTarget.adgroupMatched
  ) {
    return false;
  }

  if (
    resumeTarget.adgroupId ===
    adgroupId
  ) {
    resumeTarget.adgroupMatched =
      true;

    return false;
  }

  return true;
}

function shouldSkipKeywordPageForResume(input: {
  resumeTarget: ResumeTarget;
  pageBaseSearchId: string | null;
}): boolean {
  if (
    !input.resumeTarget.enabled ||
    input.resumeTarget.keywordPageMatched
  ) {
    return false;
  }

  if (
    input.resumeTarget.keywordBaseSearchId ===
    input.pageBaseSearchId
  ) {
    input.resumeTarget.keywordPageMatched =
      true;

    return false;
  }

  return true;
}

function shouldSkipKeywordChunkForResume(input: {
  resumeTarget: ResumeTarget;
  chunkIndex: number;
}): boolean {
  if (
    !input.resumeTarget.enabled ||
    input.resumeTarget.keywordChunkMatched
  ) {
    return false;
  }

  if (
    input.resumeTarget.keywordChunkIndex ===
    input.chunkIndex
  ) {
    input.resumeTarget.keywordChunkMatched =
      true;

    return false;
  }

  return true;
}

function resolveChunkStartIndex(input: {
  resumeTarget: ResumeTarget;
  cursor: NaverKeywordStatsCursor;
  chunk: readonly NaverSearchAdsKeywordRecord[];
}): number {
  if (!input.resumeTarget.enabled) {
    return 0;
  }

  const keywordIds =
    input.chunk.map(
      (keyword) =>
        keyword.id,
    );

  const resumeCursor:
    NaverKeywordStatsCursor = {
      ...input.cursor,

      keywordIndexInChunk:
        input.resumeTarget.keywordIndexInChunk,

      lastCompletedKeywordId:
        input.resumeTarget.lastCompletedKeywordId,
    };

  const resumePosition =
    resolveNaverKeywordStatsResumePosition(
      resumeCursor,
      keywordIds,
    );

  return resumePosition.keywordIndexInChunk;
}

function markResumeCompleted(
  resumeTarget: ResumeTarget,
): void {
  resumeTarget.enabled = false;
  resumeTarget.campaignMatched = true;
  resumeTarget.adgroupMatched = true;
  resumeTarget.keywordPageMatched = true;
  resumeTarget.keywordChunkMatched = true;
}

function assertResumeTargetResolved(
  resumeTarget: ResumeTarget,
  cursor: NaverKeywordStatsCursor,
): void {
  if (!resumeTarget.enabled) {
    return;
  }

  throw new NaverKeywordStatsCollectorError(
    "RESUME_POSITION_NOT_FOUND",
    "The saved Naver keyword stats resume position could not be found in the current hierarchy.",
    {
      cursor,
    },
  );
}

async function consumeKeywordChunk(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;

  chunk: readonly NaverSearchAdsKeywordRecord[];
  chunkIndex: number;

  state: CollectorRuntimeState;
  options: NormalizedCollectorOptions;
  resumeTarget: ResumeTarget;

  credentials: NaverSearchAdsCredentials;

  onKeywordStats:
    NaverKeywordStatsCollectorConsumer;

  onRetry:
    | NaverKeywordStatsCollectorRetryCallback
    | undefined;

  onProgress:
    | NaverKeywordStatsCollectorProgressCallback
    | undefined;

  signal: AbortSignal | undefined;

  dependencies: ResolvedCollectorDependencies;
}): Promise<CollectorTraversalResult> {
  if (
    shouldSkipKeywordChunkForResume({
      resumeTarget:
        input.resumeTarget,

      chunkIndex:
        input.chunkIndex,
    })
  ) {
    return CONTINUE_TRAVERSAL;
  }

  const startIndex =
    resolveChunkStartIndex({
      resumeTarget:
        input.resumeTarget,

      cursor:
        input.state.cursor,

      chunk:
        input.chunk,
    });

  if (
    startIndex < 0 ||
    startIndex > input.chunk.length
  ) {
    throw new NaverKeywordStatsCollectorError(
      "RESUME_POSITION_NOT_FOUND",
      "The saved keyword index is outside the rebuilt keyword chunk.",
      {
        cursor:
          input.state.cursor,
      },
    );
  }

  markResumeCompleted(
    input.resumeTarget,
  );

  const remainingKeywordCount =
    input.chunk.length -
    startIndex;

  input.state.cursor =
    setCursorDiscoveredLowerBound({
      cursor:
        input.state.cursor,

      remainingKeywordCount,
    });

  input.state.keywordsDiscoveredInRun +=
    remainingKeywordCount;

  await notifyProgress({
    callback:
      input.onProgress,
    stage:
      "keyword_chunk:start",
    state:
      input.state,
    campaignId:
      input.campaign.id,
    adgroupId:
      input.adgroup.id,
    chunkIndex:
      input.chunkIndex,
    chunkSize:
      input.chunk.length,
  });

  for (
    let keywordIndex = startIndex;
    keywordIndex < input.chunk.length;
    keywordIndex += 1
  ) {
    const partialReasonBeforeKeyword =
      getPartialReasonForCurrentRun(
        input.state,
        input.options,
      );

    if (partialReasonBeforeKeyword !== null) {
      return {
        status: "partial",
        reason:
          partialReasonBeforeKeyword,
      };
    }

    assertNotAborted(
      input.signal,
      input.state.cursor,
    );

    const keyword =
      input.chunk[keywordIndex];

    if (!keyword) {
      throw new NaverKeywordStatsCollectorError(
        "INVALID_INPUT",
        "The keyword chunk contains an invalid item.",
        {
          cursor:
            input.state.cursor,
        },
      );
    }

    const cursorBefore =
      cloneCursor(
        input.state.cursor,
      );

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "keyword_stats:start",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      adgroupId:
        input.adgroup.id,
      keywordId:
        keyword.id,
      chunkIndex:
        input.chunkIndex,
      chunkSize:
        input.chunk.length,
      keywordIndexInChunk:
        keywordIndex,
    });

    const statsRequest:
      ApiRequestResult<NaverSearchAdsKeywordDailyStatsResult> =
      await executeApiRequestWithRetry<
        NaverSearchAdsKeywordDailyStatsResult
      >({
        operation:
          "keyword_stats",

        keywordId:
          keyword.id,

        state:
          input.state,

        options:
          input.options,

        signal:
          input.signal,

        onRetry:
          input.onRetry,

        dependencies:
          input.dependencies,

        beforeAttempt:
          async (): Promise<void> => {
            await waitForStatsRequestInterval({
              state:
                input.state,

              options:
                input.options,

              signal:
                input.signal,

              dependencies:
                input.dependencies,
            });
          },

        request:
          (): Promise<NaverSearchAdsKeywordDailyStatsResult> =>
            input.dependencies.fetchKeywordDailyStats({
              credentials:
                input.credentials,

              keywordId:
                keyword.id,

              dateFrom:
                input.state.cursor.dateFrom,

              dateTo:
                input.state.cursor.dateTo,
            }),
      });

    const cursorAfter =
      markNaverKeywordStatsKeywordCompleted({
        cursor:
          cursorBefore,

        keywordId:
          keyword.id,

        keywordIndexInChunk:
          keywordIndex,
      });

    try {
      await input.onKeywordStats({
        campaign:
          input.campaign,

        adgroup:
          input.adgroup,

        keyword,

        stats:
          statsRequest.value,

        cursorBefore,

        cursorAfter:
          cloneCursor(
            cursorAfter,
          ),

        requestAttemptCount:
          statsRequest.attemptCount,
      });
    } catch (error) {
      throw new NaverKeywordStatsCollectorError(
        "CONSUMER_FAILED",
        "The Naver keyword stats consumer failed.",
        {
          cursor:
            cursorBefore,

          cause:
            error,
        },
      );
    }

    input.state.cursor =
      cursorAfter;

    input.state.keywordsCompletedInRun += 1;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "keyword_stats:done",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      adgroupId:
        input.adgroup.id,
      keywordId:
        keyword.id,
      chunkIndex:
        input.chunkIndex,
      chunkSize:
        input.chunk.length,
      keywordIndexInChunk:
        keywordIndex,
      recordsRead:
        statsRequest.value.records.length,
      attemptCount:
        statsRequest.attemptCount,
    });

    const partialReasonAfterKeyword =
      getPartialReasonForCurrentRun(
        input.state,
        input.options,
      );

    if (partialReasonAfterKeyword !== null) {
      return {
        status: "partial",
        reason:
          partialReasonAfterKeyword,
      };
    }
  }

  await notifyProgress({
    callback:
      input.onProgress,
    stage:
      "keyword_chunk:done",
    state:
      input.state,
    campaignId:
      input.campaign.id,
    adgroupId:
      input.adgroup.id,
    chunkIndex:
      input.chunkIndex,
    chunkSize:
      input.chunk.length,
  });

  if (
    input.chunk.length ===
      input.options.keywordChunkSize &&
    input.options.chunkPauseMs > 0
  ) {
    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "keyword_chunk:pause",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      adgroupId:
        input.adgroup.id,
      chunkIndex:
        input.chunkIndex,
      chunkSize:
        input.chunk.length,
      delayMs:
        input.options.chunkPauseMs,
    });

    await waitWithAbort({
      milliseconds:
        input.options.chunkPauseMs,

      signal:
        input.signal,

      cursor:
        input.state.cursor,

      dependencies:
        input.dependencies,
    });
  }

  return CONTINUE_TRAVERSAL;
}

async function collectKeywordPages(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;

  state: CollectorRuntimeState;
  options: NormalizedCollectorOptions;
  resumeTarget: ResumeTarget;

  credentials: NaverSearchAdsCredentials;

  onKeywordStats:
    NaverKeywordStatsCollectorConsumer;

  onRetry:
    | NaverKeywordStatsCollectorRetryCallback
    | undefined;

  onProgress:
    | NaverKeywordStatsCollectorProgressCallback
    | undefined;

  signal: AbortSignal | undefined;

  dependencies: ResolvedCollectorDependencies;
}): Promise<CollectorTraversalResult> {
  let keywordBaseSearchId:
    | string
    | null =
      input.resumeTarget.keywordPageMatched
        ? null
        : input.state.cursor.keywordBaseSearchId;

  for (
    let pageNumber = 1;
    pageNumber <=
    NAVER_KEYWORD_STATS_MAX_KEYWORD_PAGES;
    pageNumber += 1
  ) {
    const pageBaseSearchId:
      string | null =
      keywordBaseSearchId;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "keyword_page:start",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      adgroupId:
        input.adgroup.id,
      pageNumber,
    });

    const keywordPageRequest:
      ApiRequestResult<
        NaverSearchAdsListPage<NaverSearchAdsKeywordRecord>
      > =
      await executeApiRequestWithRetry<
        NaverSearchAdsListPage<NaverSearchAdsKeywordRecord>
      >({
        operation:
          "keyword_page",

        keywordId:
          null,

        state:
          input.state,

        options:
          input.options,

        signal:
          input.signal,

        onRetry:
          input.onRetry,

        dependencies:
          input.dependencies,

        request:
          (): Promise<
            NaverSearchAdsListPage<NaverSearchAdsKeywordRecord>
          > =>
            input.dependencies.fetchKeywordPage({
              credentials:
                input.credentials,

              adgroupId:
                input.adgroup.id,

              baseSearchId:
                pageBaseSearchId,

              recordSize:
                NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,

              selector:
                "NEXT",
            }),
      });

    const keywordPage:
      NaverSearchAdsListPage<NaverSearchAdsKeywordRecord> =
      keywordPageRequest.value;

    input.state.keywordPagesRead += 1;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "keyword_page:done",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      adgroupId:
        input.adgroup.id,
      pageNumber,
      recordsRead:
        keywordPage.records.length,
      attemptCount:
        keywordPageRequest.attemptCount,
    });

    if (
      !shouldSkipKeywordPageForResume({
        resumeTarget:
          input.resumeTarget,

        pageBaseSearchId,
      })
    ) {
      input.state.cursor =
        setNaverKeywordStatsKeywordPagePosition(
          input.state.cursor,
          {
            keywordBaseSearchId:
              pageBaseSearchId,
          },
        );

      const chunks =
        splitKeywordPageIntoChunks(
          keywordPage.records,
          input.options.keywordChunkSize,
        );

      for (
        let chunkIndex = 0;
        chunkIndex < chunks.length;
        chunkIndex += 1
      ) {
        const chunk =
          chunks[chunkIndex];

        if (!chunk) {
          throw new NaverKeywordStatsCollectorError(
            "INVALID_INPUT",
            "The generated keyword chunk is invalid.",
            {
              cursor:
                input.state.cursor,
            },
          );
        }

        input.state.cursor = {
          ...input.state.cursor,

          keywordChunkIndex:
            chunkIndex,

          keywordIndexInChunk:
            0,

          lastCompletedKeywordId:
            null,
        };

        const chunkResult =
          await consumeKeywordChunk({
            campaign:
              input.campaign,

            adgroup:
              input.adgroup,

            chunk,

            chunkIndex,

            state:
              input.state,

            options:
              input.options,

            resumeTarget:
              input.resumeTarget,

            credentials:
              input.credentials,

            onKeywordStats:
              input.onKeywordStats,

            onRetry:
              input.onRetry,

            onProgress:
              input.onProgress,

            signal:
              input.signal,

            dependencies:
              input.dependencies,
          });

        if (
          chunkResult.status ===
          "partial"
        ) {
          return chunkResult;
        }
      }
    }

    if (
      keywordPage.records.length <
      NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE
    ) {
      return CONTINUE_TRAVERSAL;
    }

    assertPaginationCanContinue({
      currentBaseSearchId:
        pageBaseSearchId,

      nextBaseSearchId:
        keywordPage.nextBaseSearchId,

      recordsLength:
        keywordPage.records.length,

      recordSize:
        NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,

      cursor:
        input.state.cursor,

      level:
        "keyword",
    });

    const nextKeywordBaseSearchId =
      keywordPage.nextBaseSearchId;

    if (!nextKeywordBaseSearchId) {
      throw new NaverKeywordStatsCollectorError(
        "INVALID_PAGINATION_CURSOR",
        "Naver Search Ads keyword pagination cursor did not advance.",
        {
          cursor:
            input.state.cursor,
        },
      );
    }

    keywordBaseSearchId =
      nextKeywordBaseSearchId;

    input.state.cursor =
      resetCursorForNextKeywordPage({
        cursor:
          input.state.cursor,

        keywordBaseSearchId:
          nextKeywordBaseSearchId,
      });

    const partialReasonAfterKeywordPage =
      shouldStopAfterCompletedPage({
        state:
          input.state,

        options:
          input.options,
      });

    if (partialReasonAfterKeywordPage !== null) {
      return {
        status:
          "partial",

        reason:
          partialReasonAfterKeywordPage,
      };
    }
  }

  throw new NaverKeywordStatsCollectorError(
    "PAGE_LIMIT_EXCEEDED",
    "Naver keyword pagination exceeded the safety page limit.",
    {
      cursor:
        input.state.cursor,
    },
  );
}

async function collectAdgroupPages(input: {
  campaign: NaverSearchAdsCampaignRecord;

  state: CollectorRuntimeState;
  options: NormalizedCollectorOptions;
  resumeTarget: ResumeTarget;

  credentials: NaverSearchAdsCredentials;

  onKeywordStats:
    NaverKeywordStatsCollectorConsumer;

  onRetry:
    | NaverKeywordStatsCollectorRetryCallback
    | undefined;

  onProgress:
    | NaverKeywordStatsCollectorProgressCallback
    | undefined;

  signal: AbortSignal | undefined;

  dependencies: ResolvedCollectorDependencies;
}): Promise<CollectorTraversalResult> {
  let adgroupBaseSearchId:
    | string
    | null =
      input.resumeTarget.adgroupMatched
        ? null
        : input.state.cursor.adgroupBaseSearchId;

  for (
    let pageNumber = 1;
    pageNumber <=
    NAVER_KEYWORD_STATS_MAX_ADGROUP_PAGES;
    pageNumber += 1
  ) {
    const pageBaseSearchId:
      string | null =
      adgroupBaseSearchId;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "adgroup_page:start",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      pageNumber,
    });

    const adgroupPageRequest:
      ApiRequestResult<
        NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord>
      > =
      await executeApiRequestWithRetry<
        NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord>
      >({
        operation:
          "adgroup_page",

        keywordId:
          null,

        state:
          input.state,

        options:
          input.options,

        signal:
          input.signal,

        onRetry:
          input.onRetry,

        dependencies:
          input.dependencies,

        request:
          (): Promise<
            NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord>
          > =>
            input.dependencies.fetchAdgroupPage({
              credentials:
                input.credentials,

              campaignId:
                input.campaign.id,

              baseSearchId:
                pageBaseSearchId,

              recordSize:
                NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,

              selector:
                "NEXT",
            }),
      });

    const adgroupPage:
      NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord> =
      adgroupPageRequest.value;

    input.state.adgroupPagesRead += 1;

    input.state.adgroupsRead +=
      adgroupPage.records.length;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "adgroup_page:done",
      state:
        input.state,
      campaignId:
        input.campaign.id,
      pageNumber,
      recordsRead:
        adgroupPage.records.length,
      attemptCount:
        adgroupPageRequest.attemptCount,
    });

    for (
      const adgroup
      of adgroupPage.records
    ) {
      if (
        shouldSkipAdgroupForResume(
          input.resumeTarget,
          adgroup.id,
        )
      ) {
        continue;
      }

      await notifyProgress({
        callback:
          input.onProgress,
        stage:
          "adgroup:start",
        state:
          input.state,
        campaignId:
          input.campaign.id,
        adgroupId:
          adgroup.id,
      });

      input.state.cursor =
        setNaverKeywordStatsAdgroupPosition(
          input.state.cursor,
          {
            adgroupBaseSearchId:
              pageBaseSearchId,

            adgroupId:
              adgroup.id,
          },
        );

      const keywordPagesResult =
        await collectKeywordPages({
          campaign:
            input.campaign,

          adgroup,

          state:
            input.state,

          options:
            input.options,

          resumeTarget:
            input.resumeTarget,

          credentials:
            input.credentials,

          onKeywordStats:
            input.onKeywordStats,

          onRetry:
            input.onRetry,

          onProgress:
            input.onProgress,

          signal:
            input.signal,

          dependencies:
            input.dependencies,
        });

      if (
        keywordPagesResult.status ===
        "partial"
      ) {
        return keywordPagesResult;
      }

      await notifyProgress({
        callback:
          input.onProgress,
        stage:
          "adgroup:done",
        state:
          input.state,
        campaignId:
          input.campaign.id,
        adgroupId:
          adgroup.id,
      });
    }

    if (
      adgroupPage.records.length <
      NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE
    ) {
      return CONTINUE_TRAVERSAL;
    }

    assertPaginationCanContinue({
      currentBaseSearchId:
        pageBaseSearchId,

      nextBaseSearchId:
        adgroupPage.nextBaseSearchId,

      recordsLength:
        adgroupPage.records.length,

      recordSize:
        NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,

      cursor:
        input.state.cursor,

      level:
        "adgroup",
    });

    const nextAdgroupBaseSearchId =
      adgroupPage.nextBaseSearchId;

    if (!nextAdgroupBaseSearchId) {
      throw new NaverKeywordStatsCollectorError(
        "INVALID_PAGINATION_CURSOR",
        "Naver Search Ads adgroup pagination cursor did not advance.",
        {
          cursor:
            input.state.cursor,
        },
      );
    }

    adgroupBaseSearchId =
      nextAdgroupBaseSearchId;

    input.state.cursor =
      resetCursorForNextAdgroupPage({
        cursor:
          input.state.cursor,

        adgroupBaseSearchId:
          nextAdgroupBaseSearchId,
      });

    const partialReasonAfterAdgroupPage =
      shouldStopAfterCompletedPage({
        state:
          input.state,

        options:
          input.options,
      });

    if (partialReasonAfterAdgroupPage !== null) {
      return {
        status:
          "partial",

        reason:
          partialReasonAfterAdgroupPage,
      };
    }
  }

  throw new NaverKeywordStatsCollectorError(
    "PAGE_LIMIT_EXCEEDED",
    "Naver adgroup pagination exceeded the safety page limit.",
    {
      cursor:
        input.state.cursor,
    },
  );
}

export async function collectNaverKeywordDailyStats(
  input: NaverKeywordStatsCollectorInput,
): Promise<NaverKeywordStatsCollectorResult> {
  const normalizedCursor =
    normalizeNaverKeywordStatsCursor(
      input.cursor,
    );

  if (
    typeof input.onKeywordStats !==
    "function"
  ) {
    throw new NaverKeywordStatsCollectorError(
      "INVALID_INPUT",
      "onKeywordStats must be a function.",
      {
        cursor:
          normalizedCursor,
      },
    );
  }

  let options:
    NormalizedCollectorOptions;

  let dependencies:
    ResolvedCollectorDependencies;

  try {
    options =
      normalizeCollectorOptions(
        input,
      );

    dependencies =
      resolveCollectorDependencies(
        input.dependencies,
      );
  } catch (error) {
    throw new NaverKeywordStatsCollectorError(
      "INVALID_INPUT",
      "Naver keyword stats collector input is invalid.",
      {
        cursor:
          normalizedCursor,

        cause:
          error,
      },
    );
  }

  const state =
    createInitialRuntimeState(
      normalizedCursor,
    );

  const resumeTarget =
    createResumeTarget(
      normalizedCursor,
    );

  await notifyProgress({
    callback:
      input.onProgress,
    stage:
      "collector:start",
    state,
  });

  let campaignBaseSearchId:
    | string
    | null =
      resumeTarget.campaignMatched
        ? null
        : state.cursor.campaignBaseSearchId;

  for (
    let pageNumber = 1;
    pageNumber <=
    NAVER_KEYWORD_STATS_MAX_CAMPAIGN_PAGES;
    pageNumber += 1
  ) {
    const pageBaseSearchId:
      string | null =
      campaignBaseSearchId;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "campaign_page:start",
      state,
      pageNumber,
    });

    const campaignPageRequest:
      ApiRequestResult<
        NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
      > =
      await executeApiRequestWithRetry<
        NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
      >({
        operation:
          "campaign_page",

        keywordId:
          null,

        state,

        options,

        signal:
          input.signal,

        onRetry:
          input.onRetry,

        dependencies,

        request:
          (): Promise<
            NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
          > =>
            dependencies.fetchCampaignPage({
              credentials:
                input.credentials,

              baseSearchId:
                pageBaseSearchId,

              recordSize:
                NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,

              selector:
                "NEXT",
            }),
      });

    const campaignPage:
      NaverSearchAdsListPage<NaverSearchAdsCampaignRecord> =
      campaignPageRequest.value;

    state.campaignPagesRead += 1;

    state.campaignsRead +=
      campaignPage.records.length;

    await notifyProgress({
      callback:
        input.onProgress,
      stage:
        "campaign_page:done",
      state,
      pageNumber,
      recordsRead:
        campaignPage.records.length,
      attemptCount:
        campaignPageRequest.attemptCount,
    });

    for (
      const campaign
      of campaignPage.records
    ) {
      if (
        shouldSkipCampaignForResume(
          resumeTarget,
          campaign.id,
        )
      ) {
        continue;
      }

      await notifyProgress({
        callback:
          input.onProgress,
        stage:
          "campaign:start",
        state,
        campaignId:
          campaign.id,
      });

      state.cursor =
        setNaverKeywordStatsCampaignPosition(
          state.cursor,
          {
            campaignBaseSearchId:
              pageBaseSearchId,

            campaignId:
              campaign.id,
          },
        );

      const adgroupPagesResult =
        await collectAdgroupPages({
          campaign,

          state,

          options,

          resumeTarget,

          credentials:
            input.credentials,

          onKeywordStats:
            input.onKeywordStats,

          onRetry:
            input.onRetry,

          onProgress:
            input.onProgress,

          signal:
            input.signal,

          dependencies,
        });

      if (
        adgroupPagesResult.status ===
        "partial"
      ) {
        await notifyProgress({
          callback:
            input.onProgress,
          stage:
            "collector:partial",
          state,
          campaignId:
            campaign.id,
        });

        return buildCollectorResult({
          status:
            "partial",
          state,
          partialReason:
            adgroupPagesResult.reason,
        });
      }

      await notifyProgress({
        callback:
          input.onProgress,
        stage:
          "campaign:done",
        state,
        campaignId:
          campaign.id,
      });
    }

    if (
      campaignPage.records.length <
      NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE
    ) {
      assertResumeTargetResolved(
        resumeTarget,
        state.cursor,
      );

      await notifyProgress({
        callback:
          input.onProgress,
        stage:
          "collector:done",
        state,
      });

      return buildCollectorResult({
        status:
          "completed",
        state,
      });
    }

    assertPaginationCanContinue({
      currentBaseSearchId:
        pageBaseSearchId,

      nextBaseSearchId:
        campaignPage.nextBaseSearchId,

      recordsLength:
        campaignPage.records.length,

      recordSize:
        NAVER_KEYWORD_STATS_HIERARCHY_RECORD_SIZE,

      cursor:
        state.cursor,

      level:
        "campaign",
    });

    const nextCampaignBaseSearchId =
      campaignPage.nextBaseSearchId;

    if (!nextCampaignBaseSearchId) {
      throw new NaverKeywordStatsCollectorError(
        "INVALID_PAGINATION_CURSOR",
        "Naver Search Ads campaign pagination cursor did not advance.",
        {
          cursor:
            state.cursor,
        },
      );
    }

    campaignBaseSearchId =
      nextCampaignBaseSearchId;

    state.cursor =
      resetCursorForNextCampaignPage({
        cursor:
          state.cursor,

        campaignBaseSearchId:
          nextCampaignBaseSearchId,
      });

    const partialReasonAfterCampaignPage =
      shouldStopAfterCompletedPage({
        state,
        options,
      });

    if (partialReasonAfterCampaignPage !== null) {
      await notifyProgress({
        callback:
          input.onProgress,

        stage:
          "collector:partial",

        state,
      });

      return buildCollectorResult({
        status:
          "partial",

        state,

        partialReason:
          partialReasonAfterCampaignPage,
      });
    }
  }

  throw new NaverKeywordStatsCollectorError(
    "PAGE_LIMIT_EXCEEDED",
    "Naver campaign pagination exceeded the safety page limit.",
    {
      cursor:
        state.cursor,
    },
  );
}
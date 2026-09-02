import { setTimeout as delay } from "node:timers/promises";

import type { NaverSearchAdsCredentials } from "./connection-credentials";
import {
  fetchNaverSearchAdsAdPage,
  fetchNaverSearchAdsAdgroupPage,
  fetchNaverSearchAdsCampaignPage,
  fetchNaverSearchAdsEntityDailyStats,
  NaverSearchAdsApiError,
  type NaverSearchAdsAdRecord,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsEntityDailyStatsResult,
  type NaverSearchAdsListPage,
} from "./naver-searchads-api";
import {
  resolveNaverSearchAdsCampaignCollectionContract,
  NaverSearchAdsAuthoritativeGrainError,
} from "./naver-searchads-authoritative-grain";
import {
  fetchNaverSearchAdsStatReportAdgroupDailyStats,
} from "./naver-searchads-stat-report-daily-metrics";
import {
  classifyNaverAuthoritativeEntityStatsRetryCategory,
  createNaverAuthoritativeEntityStatsFailureState,
  decideNaverAuthoritativeEntityStatsRetry,
  markNaverAuthoritativeEntityStatsEntityCompleted,
  normalizeNaverAuthoritativeEntityStatsCursor,
  resolveNaverAuthoritativeEntityStatsResumePosition,
  setNaverAuthoritativeEntityStatsAdgroupPosition,
  setNaverAuthoritativeEntityStatsCampaignPosition,
  setNaverAuthoritativeEntityStatsDiscoveredCount,
  setNaverAuthoritativeEntityStatsEntityPagePosition,
  type NaverAuthoritativeEntityStatsCursor,
  type NaverAuthoritativeEntityStatsFailureState,
  type NaverAuthoritativeEntityStatsRetryCategory,
} from "./naver-searchads-authoritative-entity-stats-state";

const HIERARCHY_RECORD_SIZE = 100;
const MAX_CAMPAIGN_PAGES = 10_000;
const MAX_ADGROUP_PAGES = 10_000;
const MAX_AD_PAGES = 10_000;
const DEFAULT_REQUEST_INTERVAL_MS = 1_000;
const DEFAULT_MAX_RETRY_COUNT = 3;
const MAX_ENTITIES_PER_RUN = 1_000_000;
const MAX_STATS_REQUESTS_PER_RUN = 1_000_000;
const MAX_DISCOVERY_PAGES_PER_RUN = 1_000_000;
const MAX_JITTER_MS = 500;
const AUTHORITATIVE_STATS_MAX_CONCURRENCY = 4;
const AUTHORITATIVE_STATS_REQUEST_INTERVAL_MS = 250;

export type NaverAuthoritativeEntityStatsCollectorErrorCode =
  | "INVALID_INPUT"
  | "COLLECTION_ABORTED"
  | "API_REQUEST_FAILED"
  | "RETRY_EXHAUSTED"
  | "CONSUMER_FAILED"
  | "INVALID_PAGINATION_CURSOR"
  | "PAGE_LIMIT_EXCEEDED"
  | "RESUME_POSITION_NOT_FOUND"
  | "UNSUPPORTED_CAMPAIGN_TYPE";

export class NaverAuthoritativeEntityStatsCollectorError extends Error {
  readonly code: NaverAuthoritativeEntityStatsCollectorErrorCode;
  readonly cursor: NaverAuthoritativeEntityStatsCursor;
  readonly failureState: NaverAuthoritativeEntityStatsFailureState | null;

  constructor(
    code: NaverAuthoritativeEntityStatsCollectorErrorCode,
    message: string,
    options: ErrorOptions & {
      cursor: NaverAuthoritativeEntityStatsCursor;
      failureState?: NaverAuthoritativeEntityStatsFailureState | null;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "NaverAuthoritativeEntityStatsCollectorError";
    this.code = code;
    this.cursor = { ...options.cursor };
    this.failureState = options.failureState
      ? {
          ...options.failureState,
          cursor: { ...options.failureState.cursor },
        }
      : null;
  }
}

export type NaverAuthoritativeEntityStatsCollectorItem = {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  entity: NaverSearchAdsAdgroupRecord | NaverSearchAdsAdRecord;
  authoritativeGrain: "adgroup" | "ad";
  stats: NaverSearchAdsEntityDailyStatsResult;
  cursorBefore: NaverAuthoritativeEntityStatsCursor;
  cursorAfter: NaverAuthoritativeEntityStatsCursor;
  requestAttemptCount: number;
};

export type NaverAuthoritativeEntityStatsCollectorConsumer = (
  item: NaverAuthoritativeEntityStatsCollectorItem,
) => void | Promise<void>;

export type NaverAuthoritativeEntityStatsCollectorRetryOperation =
  | "campaign_page"
  | "adgroup_page"
  | "ad_page"
  | "entity_stats";

export type NaverAuthoritativeEntityStatsCollectorRetryEvent = {
  category: Exclude<NaverAuthoritativeEntityStatsRetryCategory, "non_retryable">;
  retryCount: number;
  delayMs: number;
  operation: NaverAuthoritativeEntityStatsCollectorRetryOperation;
  entityId: string | null;
  httpStatus: number | null;
  errorCode: string;
  cursor: NaverAuthoritativeEntityStatsCursor;
};

export type NaverAuthoritativeEntityStatsCollectorProgressStage =
  | "collector:start"
  | "collector:partial"
  | "collector:done"
  | "campaign_page:start"
  | "campaign_page:done"
  | "campaign:start"
  | "campaign:skipped_keyword_collector"
  | "campaign:done"
  | "adgroup_page:start"
  | "adgroup_page:done"
  | "adgroup:start"
  | "adgroup:done"
  | "entity_page:start"
  | "entity_page:done"
  | "entity_stats:start"
  | "entity_stats:done";

export type NaverAuthoritativeEntityStatsCollectorProgressEvent = {
  stage: NaverAuthoritativeEntityStatsCollectorProgressStage;
  cursor: NaverAuthoritativeEntityStatsCursor;
  campaignId: string | null;
  adgroupId: string | null;
  entityId: string | null;
  authoritativeGrain: "adgroup" | "ad" | null;
  pageNumber: number | null;
  recordsRead: number | null;
  campaignPagesRead: number;
  campaignsRead: number;
  adgroupPagesRead: number;
  adgroupsRead: number;
  entityPagesRead: number;
  entitiesDiscoveredInRun: number;
  entitiesCompletedInRun: number;
  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;
  retryCount: number;
  attemptCount: number | null;
  delayMs: number | null;
};

export type NaverAuthoritativeEntityStatsCollectorDependencies = {
  fetchCampaignPage: typeof fetchNaverSearchAdsCampaignPage;
  fetchAdgroupPage: typeof fetchNaverSearchAdsAdgroupPage;
  fetchAdPage: typeof fetchNaverSearchAdsAdPage;
  fetchEntityDailyStats: typeof fetchNaverSearchAdsEntityDailyStats;
  fetchStatReportAdgroupDailyStats?:
    typeof fetchNaverSearchAdsStatReportAdgroupDailyStats;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  random: () => number;
};

type ResolvedNaverAuthoritativeEntityStatsCollectorDependencies =
  Omit<
    NaverAuthoritativeEntityStatsCollectorDependencies,
    "fetchStatReportAdgroupDailyStats"
  > & {
    fetchStatReportAdgroupDailyStats:
      typeof fetchNaverSearchAdsStatReportAdgroupDailyStats;
  };

export type NaverAuthoritativeEntityStatsCollectorInput = {
  credentials: NaverSearchAdsCredentials;
  cursor: NaverAuthoritativeEntityStatsCursor;
  onEntityStats: NaverAuthoritativeEntityStatsCollectorConsumer;
  onRetry?: (event: NaverAuthoritativeEntityStatsCollectorRetryEvent) => void | Promise<void>;
  onProgress?: (event: NaverAuthoritativeEntityStatsCollectorProgressEvent) => void | Promise<void>;
  requestIntervalMs?: number;
  maxRetryCount?: number;
  maxEntityStatsPerRun?: number;
  maxStatsRequestsPerRun?: number;
  maxDiscoveryPagesPerRun?: number;
  signal?: AbortSignal;
  dependencies?: Partial<NaverAuthoritativeEntityStatsCollectorDependencies>;
};

export type NaverAuthoritativeEntityStatsCollectorPartialReason =
  | "max_entity_stats_per_run_reached"
  | "max_stats_requests_per_run_reached"
  | "max_discovery_pages_per_run_reached";

export type NaverAuthoritativeEntityStatsCollectorResult = {
  status: "completed" | "partial";
  completed: boolean;
  isComplete: boolean;
  partialReason: NaverAuthoritativeEntityStatsCollectorPartialReason | null;
  cursor: NaverAuthoritativeEntityStatsCursor;
  campaignPagesRead: number;
  campaignsRead: number;
  adgroupPagesRead: number;
  adgroupsRead: number;
  entityPagesRead: number;
  entitiesDiscoveredInRun: number;
  entitiesCompletedInRun: number;
  statsRequestsAttempted: number;
  statsRequestsSucceeded: number;
  retryCount: number;
};

type RuntimeState = Omit<
  NaverAuthoritativeEntityStatsCollectorResult,
  "status" | "completed" | "isComplete" | "partialReason"
> & {
  lastStatsRequestStartedAt: number | null;
};

type Options = {
  requestIntervalMs: number;
  maxRetryCount: number;
  maxEntityStatsPerRun: number | null;
  maxStatsRequestsPerRun: number | null;
  maxDiscoveryPagesPerRun: number | null;
};

type ApiRequestResult<T> = {
  value: T;
  attemptCount: number;
};

type TraversalResult =
  | { status: "continue" }
  | {
      status: "partial";
      reason: NaverAuthoritativeEntityStatsCollectorPartialReason;
    };

type EntityPageInput<
  T extends NaverSearchAdsAdgroupRecord | NaverSearchAdsAdRecord,
> = {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  entities: readonly T[];
  grain: "adgroup" | "ad";
  state: RuntimeState;
  options: Options;
  credentials: NaverSearchAdsCredentials;
  onEntityStats: NaverAuthoritativeEntityStatsCollectorConsumer;
  onRetry: NaverAuthoritativeEntityStatsCollectorInput["onRetry"];
  onProgress: NaverAuthoritativeEntityStatsCollectorInput["onProgress"];
  signal: AbortSignal | undefined;
  dependencies:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies;
};

type BoundedEntityStatsTaskResult<
  T extends NaverSearchAdsAdgroupRecord | NaverSearchAdsAdRecord,
> = {
  entity: T;
  index: number;
  cursorBefore: NaverAuthoritativeEntityStatsCursor;
  cursorAfter: NaverAuthoritativeEntityStatsCursor;
  statsRequest: ApiRequestResult<NaverSearchAdsEntityDailyStatsResult>;
  requestState: RuntimeState;
};

const CONTINUE: TraversalResult = { status: "continue" };

const DEFAULT_DEPENDENCIES:
  ResolvedNaverAuthoritativeEntityStatsCollectorDependencies = {
  fetchCampaignPage: fetchNaverSearchAdsCampaignPage,
  fetchAdgroupPage: fetchNaverSearchAdsAdgroupPage,
  fetchAdPage: fetchNaverSearchAdsAdPage,
  fetchEntityDailyStats: fetchNaverSearchAdsEntityDailyStats,
  fetchStatReportAdgroupDailyStats:
    fetchNaverSearchAdsStatReportAdgroupDailyStats,
  sleep: async (milliseconds, signal) => {
    await delay(
      milliseconds,
      undefined,
      signal ? { signal } : undefined,
    );
  },
  now: () => Date.now(),
  random: () => Math.random(),
};

function normalizeNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
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
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`${fieldName} must be an integer between 1 and ${maximum}.`);
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

  return normalizePositiveInteger(value, fieldName, maximum);
}

function normalizeOptions(
  input: NaverAuthoritativeEntityStatsCollectorInput,
): Options {
  return {
    requestIntervalMs:
      input.requestIntervalMs === undefined
        ? DEFAULT_REQUEST_INTERVAL_MS
        : normalizeNonNegativeInteger(
            input.requestIntervalMs,
            "requestIntervalMs",
          ),
    maxRetryCount:
      input.maxRetryCount === undefined
        ? DEFAULT_MAX_RETRY_COUNT
        : normalizePositiveInteger(input.maxRetryCount, "maxRetryCount", 10),
    maxEntityStatsPerRun: normalizeOptionalPositiveInteger(
      input.maxEntityStatsPerRun,
      "maxEntityStatsPerRun",
      MAX_ENTITIES_PER_RUN,
    ),
    maxStatsRequestsPerRun: normalizeOptionalPositiveInteger(
      input.maxStatsRequestsPerRun,
      "maxStatsRequestsPerRun",
      MAX_STATS_REQUESTS_PER_RUN,
    ),
    maxDiscoveryPagesPerRun: normalizeOptionalPositiveInteger(
      input.maxDiscoveryPagesPerRun,
      "maxDiscoveryPagesPerRun",
      MAX_DISCOVERY_PAGES_PER_RUN,
    ),
  };
}

function resolveDependencies(
  dependencies: Partial<NaverAuthoritativeEntityStatsCollectorDependencies> | undefined,
): ResolvedNaverAuthoritativeEntityStatsCollectorDependencies {
  const resolved:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };

  for (const [name, dependency] of Object.entries(resolved)) {
    if (typeof dependency !== "function") {
      throw new Error(`${name} dependency must be a function.`);
    }
  }

  return resolved;
}

function cloneCursor(
  cursor: NaverAuthoritativeEntityStatsCursor,
): NaverAuthoritativeEntityStatsCursor {
  return { ...cursor };
}

function createState(cursor: NaverAuthoritativeEntityStatsCursor): RuntimeState {
  return {
    cursor: cloneCursor(cursor),
    campaignPagesRead: 0,
    campaignsRead: 0,
    adgroupPagesRead: 0,
    adgroupsRead: 0,
    entityPagesRead: 0,
    entitiesDiscoveredInRun: 0,
    entitiesCompletedInRun: 0,
    statsRequestsAttempted: 0,
    statsRequestsSucceeded: 0,
    retryCount: 0,
    lastStatsRequestStartedAt: null,
  };
}

function buildResult(
  state: RuntimeState,
  partialReason: NaverAuthoritativeEntityStatsCollectorPartialReason | null,
): NaverAuthoritativeEntityStatsCollectorResult {
  return {
    status: partialReason ? "partial" : "completed",
    completed: partialReason === null,
    isComplete: partialReason === null,
    partialReason,
    cursor: cloneCursor(state.cursor),
    campaignPagesRead: state.campaignPagesRead,
    campaignsRead: state.campaignsRead,
    adgroupPagesRead: state.adgroupPagesRead,
    adgroupsRead: state.adgroupsRead,
    entityPagesRead: state.entityPagesRead,
    entitiesDiscoveredInRun: state.entitiesDiscoveredInRun,
    entitiesCompletedInRun: state.entitiesCompletedInRun,
    statsRequestsAttempted: state.statsRequestsAttempted,
    statsRequestsSucceeded: state.statsRequestsSucceeded,
    retryCount: state.retryCount,
  };
}

function assertNotAborted(
  signal: AbortSignal | undefined,
  cursor: NaverAuthoritativeEntityStatsCursor,
): void {
  if (signal?.aborted !== true) {
    return;
  }

  throw new NaverAuthoritativeEntityStatsCollectorError(
    "COLLECTION_ABORTED",
    "Naver authoritative entity collection was aborted.",
    { cursor },
  );
}

async function notifyProgress(
  callback: NaverAuthoritativeEntityStatsCollectorInput["onProgress"],
  stage: NaverAuthoritativeEntityStatsCollectorProgressStage,
  state: RuntimeState,
  extra: Partial<
    Pick<
      NaverAuthoritativeEntityStatsCollectorProgressEvent,
      | "campaignId"
      | "adgroupId"
      | "entityId"
      | "authoritativeGrain"
      | "pageNumber"
      | "recordsRead"
      | "attemptCount"
      | "delayMs"
    >
  > = {},
): Promise<void> {
  if (!callback) {
    return;
  }

  await callback({
    stage,
    cursor: cloneCursor(state.cursor),
    campaignId: extra.campaignId ?? state.cursor.campaignId,
    adgroupId: extra.adgroupId ?? state.cursor.adgroupId,
    entityId: extra.entityId ?? state.cursor.lastCompletedEntityId,
    authoritativeGrain:
      extra.authoritativeGrain ?? state.cursor.authoritativeGrain,
    pageNumber: extra.pageNumber ?? null,
    recordsRead: extra.recordsRead ?? null,
    campaignPagesRead: state.campaignPagesRead,
    campaignsRead: state.campaignsRead,
    adgroupPagesRead: state.adgroupPagesRead,
    adgroupsRead: state.adgroupsRead,
    entityPagesRead: state.entityPagesRead,
    entitiesDiscoveredInRun: state.entitiesDiscoveredInRun,
    entitiesCompletedInRun: state.entitiesCompletedInRun,
    statsRequestsAttempted: state.statsRequestsAttempted,
    statsRequestsSucceeded: state.statsRequestsSucceeded,
    retryCount: state.retryCount,
    attemptCount: extra.attemptCount ?? null,
    delayMs: extra.delayMs ?? null,
  });
}

function isNetworkApiError(error: NaverSearchAdsApiError): boolean {
  return error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT";
}

function errorCode(error: NaverSearchAdsApiError): string {
  return error.code === "HTTP_ERROR" && error.status !== null
    ? `${error.code}_${error.status}`
    : error.code;
}

async function executeApiRequestWithRetry<T>(input: {
  operation: NaverAuthoritativeEntityStatsCollectorRetryOperation;
  entityId: string | null;
  state: RuntimeState;
  options: Options;
  signal: AbortSignal | undefined;
  onRetry: NaverAuthoritativeEntityStatsCollectorInput["onRetry"];
  dependencies:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies;
  beforeAttempt?: () => Promise<void>;
  request: () => Promise<T>;
}): Promise<ApiRequestResult<T>> {
  let retryCount = 0;

  while (true) {
    assertNotAborted(input.signal, input.state.cursor);

    if (input.beforeAttempt) {
      await input.beforeAttempt();
    }

    if (input.operation === "entity_stats") {
      input.state.lastStatsRequestStartedAt = input.dependencies.now();
      input.state.statsRequestsAttempted += 1;
    }

    try {
      const value = await input.request();

      if (input.operation === "entity_stats") {
        input.state.statsRequestsSucceeded += 1;
      }

      return { value, attemptCount: retryCount + 1 };
    } catch (error) {
      if (!(error instanceof NaverSearchAdsApiError)) {
        throw error;
      }

      const category = classifyNaverAuthoritativeEntityStatsRetryCategory({
        httpStatus: error.status,
        isNetworkError: isNetworkApiError(error),
      });
      const jitter =
        category === "server_error" || category === "network_error"
          ? Math.floor(input.dependencies.random() * (MAX_JITTER_MS + 1))
          : 0;
      const decision = decideNaverAuthoritativeEntityStatsRetry({
        category,
        retryCount,
        jitterMs: jitter,
        maxRetryCount: input.options.maxRetryCount,
      });

      if (!decision.shouldRetry) {
        const failureState = createNaverAuthoritativeEntityStatsFailureState({
          cursor: input.state.cursor,
          entityId: input.entityId,
          httpStatus: error.status,
          errorCode: errorCode(error),
          retryCount: decision.retryCount,
          failedAt: new Date(input.dependencies.now()).toISOString(),
        });

        throw new NaverAuthoritativeEntityStatsCollectorError(
          decision.reason === "MAX_RETRY_COUNT_REACHED"
            ? "RETRY_EXHAUSTED"
            : "API_REQUEST_FAILED",
          "Naver Search Ads authoritative entity request failed.",
          {
            cursor: input.state.cursor,
            failureState,
            cause: error,
          },
        );
      }

      retryCount = decision.retryCount;
      input.state.retryCount += 1;

      if (input.onRetry) {
        await input.onRetry({
          category: decision.category,
          retryCount: decision.retryCount,
          delayMs: decision.delayMs,
          operation: input.operation,
          entityId: input.entityId,
          httpStatus: error.status,
          errorCode: errorCode(error),
          cursor: cloneCursor(input.state.cursor),
        });
      }

      await input.dependencies.sleep(decision.delayMs, input.signal);
    }
  }
}

async function waitForStatsInterval(input: {
  state: RuntimeState;
  options: Options;
  signal: AbortSignal | undefined;
  dependencies:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies;
}): Promise<void> {
  if (input.state.lastStatsRequestStartedAt === null) {
    return;
  }

  const remaining =
    input.options.requestIntervalMs -
    (input.dependencies.now() - input.state.lastStatsRequestStartedAt);

  if (remaining > 0) {
    await input.dependencies.sleep(remaining, input.signal);
  }
}

function currentPartialReason(
  state: RuntimeState,
  options: Options,
): NaverAuthoritativeEntityStatsCollectorPartialReason | null {
  if (
    options.maxEntityStatsPerRun !== null &&
    state.entitiesCompletedInRun >= options.maxEntityStatsPerRun
  ) {
    return "max_entity_stats_per_run_reached";
  }

  if (
    options.maxStatsRequestsPerRun !== null &&
    state.statsRequestsAttempted >= options.maxStatsRequestsPerRun
  ) {
    return "max_stats_requests_per_run_reached";
  }

  return null;
}

function discoveryPartialReason(
  state: RuntimeState,
  options: Options,
): NaverAuthoritativeEntityStatsCollectorPartialReason | null {
  if (
    options.maxDiscoveryPagesPerRun !== null &&
    state.campaignPagesRead + state.adgroupPagesRead + state.entityPagesRead >=
      options.maxDiscoveryPagesPerRun
  ) {
    return "max_discovery_pages_per_run_reached";
  }

  return null;
}

function assertPagination(
  recordsLength: number,
  nextBaseSearchId: string | null,
  currentBaseSearchId: string | null,
  cursor: NaverAuthoritativeEntityStatsCursor,
  level: "campaign" | "adgroup" | "ad",
): void {
  if (recordsLength < HIERARCHY_RECORD_SIZE) {
    return;
  }

  if (!nextBaseSearchId || nextBaseSearchId === currentBaseSearchId) {
    throw new NaverAuthoritativeEntityStatsCollectorError(
      "INVALID_PAGINATION_CURSOR",
      `Naver ${level} pagination cursor did not advance.`,
      { cursor },
    );
  }
}

function setDiscoveredLowerBound(
  state: RuntimeState,
  remainingEntityCount: number,
): void {
  const next = Math.max(
    state.cursor.discoveredEntityCount,
    state.cursor.completedEntityCount + remainingEntityCount,
  );

  state.cursor = setNaverAuthoritativeEntityStatsDiscoveredCount(
    state.cursor,
    next,
  );
}

function isBrandSearchFastPath(input: {
  campaign: NaverSearchAdsCampaignRecord;
  grain: "adgroup" | "ad";
}): boolean {
  return (
    input.grain === "adgroup" &&
    input.campaign.campaignType
      ?.trim()
      .toUpperCase() === "BRAND_SEARCH"
  );
}

function isShoppingBoundedStatsPath(input: {
  campaign: NaverSearchAdsCampaignRecord;
  grain: "adgroup" | "ad";
  options: Options;
}): boolean {
  return (
    input.grain === "ad" &&
    input.campaign.campaignType
      ?.trim()
      .toUpperCase() === "SHOPPING" &&
    input.options.maxStatsRequestsPerRun === null
  );
}

function isBrandSearchBoundedStatsPath(input: {
  campaign: NaverSearchAdsCampaignRecord;
  grain: "adgroup" | "ad";
  options: Options;
}): boolean {
  return (
    isBrandSearchFastPath({
      campaign:
        input.campaign,
      grain:
        input.grain,
    }) &&
    input.options.maxStatsRequestsPerRun ===
      null
  );
}

function remainingEntityStatsBudget(
  state: RuntimeState,
  options: Options,
): number {
  if (options.maxEntityStatsPerRun === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(
    0,
    options.maxEntityStatsPerRun - state.entitiesCompletedInRun,
  );
}

function createBoundedStatsStartGate(input: {
  state: RuntimeState;
  options: Options;
  signal: AbortSignal | undefined;
  dependencies:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies;
}): () => Promise<void> {
  const requestIntervalMs =
    input.options.requestIntervalMs === 0
      ? 0
      : AUTHORITATIVE_STATS_REQUEST_INTERVAL_MS;

  let nextAllowedStartAt =
    input.state.lastStatsRequestStartedAt === null
      ? null
      : input.state.lastStatsRequestStartedAt + requestIntervalMs;
  let tail: Promise<void> = Promise.resolve();

  return (): Promise<void> => {
    const scheduled = tail.then(async () => {
      assertNotAborted(input.signal, input.state.cursor);

      if (nextAllowedStartAt !== null && requestIntervalMs > 0) {
        const remaining =
          nextAllowedStartAt - input.dependencies.now();

        if (remaining > 0) {
          await input.dependencies.sleep(remaining, input.signal);
        }
      }

      const startedAt =
        input.dependencies.now();

      input.state.lastStatsRequestStartedAt =
        startedAt;

      nextAllowedStartAt =
        startedAt + requestIntervalMs;
    });

    tail = scheduled.catch(() => undefined);

    return scheduled;
  };
}

function createBoundedRequestState(
  state: RuntimeState,
  cursor: NaverAuthoritativeEntityStatsCursor,
): RuntimeState {
  return {
    ...state,
    cursor: cloneCursor(cursor),
    statsRequestsAttempted: 0,
    statsRequestsSucceeded: 0,
    retryCount: 0,
    lastStatsRequestStartedAt: null,
  };
}

function mergeBoundedRequestState(
  state: RuntimeState,
  requestState: RuntimeState,
): void {
  state.statsRequestsAttempted += requestState.statsRequestsAttempted;
  state.statsRequestsSucceeded += requestState.statsRequestsSucceeded;
  state.retryCount += requestState.retryCount;

  if (
    requestState.lastStatsRequestStartedAt !== null &&
    (
      state.lastStatsRequestStartedAt === null ||
      requestState.lastStatsRequestStartedAt >
        state.lastStatsRequestStartedAt
    )
  ) {
    state.lastStatsRequestStartedAt =
      requestState.lastStatsRequestStartedAt;
  }
}

async function consumeEntityPageBounded<
  T extends NaverSearchAdsAdgroupRecord | NaverSearchAdsAdRecord,
>(
  input: EntityPageInput<T>,
  startIndex: number,
): Promise<TraversalResult> {
  const waitForFallbackStart = createBoundedStatsStartGate({
    state: input.state,
    options: input.options,
    signal: input.signal,
    dependencies: input.dependencies,
  });

  let index = startIndex;

  while (index < input.entities.length) {
    const beforeReason = currentPartialReason(input.state, input.options);

    if (beforeReason) {
      return { status: "partial", reason: beforeReason };
    }

    const batchSize = Math.min(
      AUTHORITATIVE_STATS_MAX_CONCURRENCY,
      input.entities.length - index,
      remainingEntityStatsBudget(input.state, input.options),
    );

    if (batchSize <= 0) {
      const reason = currentPartialReason(input.state, input.options);

      return {
        status: "partial",
        reason: reason ?? "max_entity_stats_per_run_reached",
      };
    }

    const tasks: Array<Promise<BoundedEntityStatsTaskResult<T>>> = [];
    let plannedCursor = cloneCursor(input.state.cursor);

    for (let offset = 0; offset < batchSize; offset += 1) {
      const entityIndex = index + offset;
      const entity = input.entities[entityIndex];

      if (!entity) {
        throw new NaverAuthoritativeEntityStatsCollectorError(
          "INVALID_INPUT",
          "The authoritative entity page contains an invalid item.",
          { cursor: input.state.cursor },
        );
      }

      const cursorBefore = cloneCursor(plannedCursor);
      const cursorAfter = markNaverAuthoritativeEntityStatsEntityCompleted({
        cursor: cursorBefore,
        entityId: entity.id,
        entityIndexInPage: entityIndex,
      });
      plannedCursor = cloneCursor(cursorAfter);

      const requestState = createBoundedRequestState(
        input.state,
        cursorBefore,
      );

      await notifyProgress(
        input.onProgress,
        "entity_stats:start",
        requestState,
        {
          campaignId: input.campaign.id,
          adgroupId: input.adgroup.id,
          entityId: entity.id,
          authoritativeGrain: input.grain,
        },
      );

      tasks.push(
        (async (): Promise<BoundedEntityStatsTaskResult<T>> => {
          let statReportUnavailable =
            false;

          const statsRequest = await executeApiRequestWithRetry({
            operation: "entity_stats",
            entityId: entity.id,
            state: requestState,
            options: input.options,
            signal: input.signal,
            onRetry: input.onRetry,
            dependencies: input.dependencies,
            request: async () => {
              if (
                isBrandSearchFastPath({
                  campaign:
                    input.campaign,
                  grain:
                    input.grain,
                }) &&
                !statReportUnavailable
              ) {
                try {
                  return await input.dependencies
                    .fetchStatReportAdgroupDailyStats({
                      credentials:
                        input.credentials,
                      entityId:
                        entity.id,
                      entityType:
                        "adgroup",
                      dateFrom:
                        cursorBefore.dateFrom,
                      dateTo:
                        cursorBefore.dateTo,
                      signal:
                        input.signal,
                    });
                } catch {
                  assertNotAborted(
                    input.signal,
                    cursorBefore,
                  );

                  statReportUnavailable =
                    true;
                }
              }

              await waitForFallbackStart();

              return input.dependencies.fetchEntityDailyStats({
                credentials: input.credentials,
                entityId: entity.id,
                entityType: input.grain,
                dateFrom: cursorBefore.dateFrom,
                dateTo: cursorBefore.dateTo,
              });
            },
          });

          return {
            entity,
            index: entityIndex,
            cursorBefore,
            cursorAfter,
            statsRequest,
            requestState,
          };
        })(),
      );
    }

    const settled = await Promise.allSettled(tasks);

    for (let offset = 0; offset < settled.length; offset += 1) {
      const outcome = settled[offset];

      if (!outcome) {
        throw new NaverAuthoritativeEntityStatsCollectorError(
          "INVALID_INPUT",
          "The bounded authoritative request result is missing.",
          { cursor: input.state.cursor },
        );
      }

      if (outcome.status === "rejected") {
        throw outcome.reason;
      }

      const result = outcome.value;

      mergeBoundedRequestState(input.state, result.requestState);

      try {
        await input.onEntityStats({
          campaign: input.campaign,
          adgroup: input.adgroup,
          entity: result.entity,
          authoritativeGrain: input.grain,
          stats: result.statsRequest.value,
          cursorBefore: cloneCursor(result.cursorBefore),
          cursorAfter: cloneCursor(result.cursorAfter),
          requestAttemptCount: result.statsRequest.attemptCount,
        });
      } catch (error) {
        throw new NaverAuthoritativeEntityStatsCollectorError(
          "CONSUMER_FAILED",
          "The authoritative entity stats consumer failed.",
          { cursor: result.cursorBefore, cause: error },
        );
      }

      input.state.cursor = cloneCursor(result.cursorAfter);
      input.state.entitiesCompletedInRun += 1;

      await notifyProgress(
        input.onProgress,
        "entity_stats:done",
        input.state,
        {
          campaignId: input.campaign.id,
          adgroupId: input.adgroup.id,
          entityId: result.entity.id,
          authoritativeGrain: input.grain,
          recordsRead: result.statsRequest.value.records.length,
          attemptCount: result.statsRequest.attemptCount,
        },
      );
    }

    const afterReason = currentPartialReason(input.state, input.options);

    if (afterReason) {
      return { status: "partial", reason: afterReason };
    }

    index += batchSize;
  }

  return CONTINUE;
}

async function consumeEntityPage<
  T extends NaverSearchAdsAdgroupRecord | NaverSearchAdsAdRecord,
>(input: EntityPageInput<T>): Promise<TraversalResult> {
  const entityIds = input.entities.map((entity) => entity.id);
  const resume = resolveNaverAuthoritativeEntityStatsResumePosition(
    input.state.cursor,
    entityIds,
  );
  const startIndex = resume.entityIndexInPage;

  if (startIndex < 0 || startIndex > input.entities.length) {
    throw new NaverAuthoritativeEntityStatsCollectorError(
      "RESUME_POSITION_NOT_FOUND",
      "Saved entity resume position is outside the rebuilt page.",
      { cursor: input.state.cursor },
    );
  }

  setDiscoveredLowerBound(input.state, input.entities.length - startIndex);
  input.state.entitiesDiscoveredInRun += input.entities.length - startIndex;

  if (
    isShoppingBoundedStatsPath({
      campaign: input.campaign,
      grain: input.grain,
      options: input.options,
    }) ||
    isBrandSearchBoundedStatsPath({
      campaign: input.campaign,
      grain: input.grain,
      options: input.options,
    })
  ) {
    return consumeEntityPageBounded(input, startIndex);
  }

  for (let index = startIndex; index < input.entities.length; index += 1) {
    const beforeReason = currentPartialReason(input.state, input.options);

    if (beforeReason) {
      return { status: "partial", reason: beforeReason };
    }

    const entity = input.entities[index];

    if (!entity) {
      throw new NaverAuthoritativeEntityStatsCollectorError(
        "INVALID_INPUT",
        "The authoritative entity page contains an invalid item.",
        { cursor: input.state.cursor },
      );
    }

    const cursorBefore = cloneCursor(input.state.cursor);

    await notifyProgress(
      input.onProgress,
      "entity_stats:start",
      input.state,
      {
        campaignId: input.campaign.id,
        adgroupId: input.adgroup.id,
        entityId: entity.id,
        authoritativeGrain: input.grain,
      },
    );

    const useStatReportFastPath =
      isBrandSearchFastPath({
        campaign: input.campaign,
        grain: input.grain,
      });

    const statsRequest = await executeApiRequestWithRetry({
      operation: "entity_stats",
      entityId: entity.id,
      state: input.state,
      options: input.options,
      signal: input.signal,
      onRetry: input.onRetry,
      dependencies: input.dependencies,
      beforeAttempt:
        useStatReportFastPath
          ? undefined
          : () =>
              waitForStatsInterval({
                state: input.state,
                options: input.options,
                signal: input.signal,
                dependencies: input.dependencies,
              }),
      request: async () => {
        if (useStatReportFastPath) {
          try {
            return await input.dependencies
              .fetchStatReportAdgroupDailyStats({
                credentials: input.credentials,
                entityId: entity.id,
                entityType: "adgroup",
                dateFrom: input.state.cursor.dateFrom,
                dateTo: input.state.cursor.dateTo,
                signal: input.signal,
              });
          } catch {
            await waitForStatsInterval({
              state: input.state,
              options: input.options,
              signal: input.signal,
              dependencies: input.dependencies,
            });
          }
        }

        return input.dependencies.fetchEntityDailyStats({
          credentials: input.credentials,
          entityId: entity.id,
          entityType: input.grain,
          dateFrom: input.state.cursor.dateFrom,
          dateTo: input.state.cursor.dateTo,
        });
      },
    });

    const cursorAfter = markNaverAuthoritativeEntityStatsEntityCompleted({
      cursor: cursorBefore,
      entityId: entity.id,
      entityIndexInPage: index,
    });

    try {
      await input.onEntityStats({
        campaign: input.campaign,
        adgroup: input.adgroup,
        entity,
        authoritativeGrain: input.grain,
        stats: statsRequest.value,
        cursorBefore,
        cursorAfter: cloneCursor(cursorAfter),
        requestAttemptCount: statsRequest.attemptCount,
      });
    } catch (error) {
      throw new NaverAuthoritativeEntityStatsCollectorError(
        "CONSUMER_FAILED",
        "The authoritative entity stats consumer failed.",
        { cursor: cursorBefore, cause: error },
      );
    }

    input.state.cursor = cursorAfter;
    input.state.entitiesCompletedInRun += 1;

    await notifyProgress(input.onProgress, "entity_stats:done", input.state, {
      campaignId: input.campaign.id,
      adgroupId: input.adgroup.id,
      entityId: entity.id,
      authoritativeGrain: input.grain,
      recordsRead: statsRequest.value.records.length,
      attemptCount: statsRequest.attemptCount,
    });

    const afterReason = currentPartialReason(input.state, input.options);

    if (afterReason) {
      return { status: "partial", reason: afterReason };
    }
  }

  return CONTINUE;
}

async function collectShoppingAds(input: {
  campaign: NaverSearchAdsCampaignRecord;
  adgroup: NaverSearchAdsAdgroupRecord;
  state: RuntimeState;
  options: Options;
  credentials: NaverSearchAdsCredentials;
  onEntityStats: NaverAuthoritativeEntityStatsCollectorConsumer;
  onRetry: NaverAuthoritativeEntityStatsCollectorInput["onRetry"];
  onProgress: NaverAuthoritativeEntityStatsCollectorInput["onProgress"];
  signal: AbortSignal | undefined;
  dependencies:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies;
}): Promise<TraversalResult> {
  let baseSearchId =
    input.state.cursor.adgroupId === input.adgroup.id
      ? input.state.cursor.entityBaseSearchId
      : null;

  for (let pageNumber = 1; pageNumber <= MAX_AD_PAGES; pageNumber += 1) {
    const pageBaseSearchId = baseSearchId;
    await notifyProgress(input.onProgress, "entity_page:start", input.state, {
      campaignId: input.campaign.id,
      adgroupId: input.adgroup.id,
      authoritativeGrain: "ad",
      pageNumber,
    });

    const request = await executeApiRequestWithRetry<
      NaverSearchAdsListPage<NaverSearchAdsAdRecord>
    >({
      operation: "ad_page",
      entityId: null,
      state: input.state,
      options: input.options,
      signal: input.signal,
      onRetry: input.onRetry,
      dependencies: input.dependencies,
      request: () =>
        input.dependencies.fetchAdPage({
          credentials: input.credentials,
          adgroupId: input.adgroup.id,
          baseSearchId: pageBaseSearchId,
          recordSize: HIERARCHY_RECORD_SIZE,
          selector: "NEXT",
        }),
    });

    input.state.entityPagesRead += 1;

    const isResumingEntityPage =
      input.state.cursor.adgroupId === input.adgroup.id &&
      input.state.cursor.entityBaseSearchId === pageBaseSearchId &&
      (input.state.cursor.lastCompletedEntityId !== null ||
        input.state.cursor.entityIndexInPage > 0);

    if (!isResumingEntityPage) {
      input.state.cursor = setNaverAuthoritativeEntityStatsEntityPagePosition(
        input.state.cursor,
        { entityBaseSearchId: pageBaseSearchId },
      );
    }

    await notifyProgress(input.onProgress, "entity_page:done", input.state, {
      campaignId: input.campaign.id,
      adgroupId: input.adgroup.id,
      authoritativeGrain: "ad",
      pageNumber,
      recordsRead: request.value.records.length,
      attemptCount: request.attemptCount,
    });

    const consumed = await consumeEntityPage({
      campaign: input.campaign,
      adgroup: input.adgroup,
      entities: request.value.records,
      grain: "ad",
      state: input.state,
      options: input.options,
      credentials: input.credentials,
      onEntityStats: input.onEntityStats,
      onRetry: input.onRetry,
      onProgress: input.onProgress,
      signal: input.signal,
      dependencies: input.dependencies,
    });

    if (consumed.status === "partial") {
      return consumed;
    }

    if (request.value.records.length < HIERARCHY_RECORD_SIZE) {
      return CONTINUE;
    }

    assertPagination(
      request.value.records.length,
      request.value.nextBaseSearchId,
      pageBaseSearchId,
      input.state.cursor,
      "ad",
    );

    baseSearchId = request.value.nextBaseSearchId;
    input.state.cursor = setNaverAuthoritativeEntityStatsEntityPagePosition(
      input.state.cursor,
      { entityBaseSearchId: baseSearchId },
    );

    const discoveryReason = discoveryPartialReason(input.state, input.options);

    if (discoveryReason) {
      return { status: "partial", reason: discoveryReason };
    }
  }

  throw new NaverAuthoritativeEntityStatsCollectorError(
    "PAGE_LIMIT_EXCEEDED",
    "Naver ad pagination exceeded the safety page limit.",
    { cursor: input.state.cursor },
  );
}

async function collectCampaignAdgroups(input: {
  campaign: NaverSearchAdsCampaignRecord;
  grain: "adgroup" | "ad";
  state: RuntimeState;
  options: Options;
  credentials: NaverSearchAdsCredentials;
  onEntityStats: NaverAuthoritativeEntityStatsCollectorConsumer;
  onRetry: NaverAuthoritativeEntityStatsCollectorInput["onRetry"];
  onProgress: NaverAuthoritativeEntityStatsCollectorInput["onProgress"];
  signal: AbortSignal | undefined;
  dependencies:
    ResolvedNaverAuthoritativeEntityStatsCollectorDependencies;
}): Promise<TraversalResult> {
  let baseSearchId =
    input.state.cursor.campaignId === input.campaign.id
      ? input.state.cursor.adgroupBaseSearchId
      : null;

  for (let pageNumber = 1; pageNumber <= MAX_ADGROUP_PAGES; pageNumber += 1) {
    const pageBaseSearchId = baseSearchId;
    await notifyProgress(input.onProgress, "adgroup_page:start", input.state, {
      campaignId: input.campaign.id,
      authoritativeGrain: input.grain,
      pageNumber,
    });

    const request = await executeApiRequestWithRetry<
      NaverSearchAdsListPage<NaverSearchAdsAdgroupRecord>
    >({
      operation: "adgroup_page",
      entityId: null,
      state: input.state,
      options: input.options,
      signal: input.signal,
      onRetry: input.onRetry,
      dependencies: input.dependencies,
      request: () =>
        input.dependencies.fetchAdgroupPage({
          credentials: input.credentials,
          campaignId: input.campaign.id,
          baseSearchId: pageBaseSearchId,
          recordSize: HIERARCHY_RECORD_SIZE,
          selector: "NEXT",
        }),
    });

    input.state.adgroupPagesRead += 1;

    const isResumingAdgroupPage =
      input.state.cursor.campaignId === input.campaign.id &&
      input.state.cursor.adgroupBaseSearchId === pageBaseSearchId &&
      (input.state.cursor.adgroupId !== null ||
        input.state.cursor.lastCompletedEntityId !== null);

    if (!isResumingAdgroupPage) {
      input.state.cursor = setNaverAuthoritativeEntityStatsAdgroupPosition(
        input.state.cursor,
        {
          adgroupBaseSearchId: pageBaseSearchId,
          adgroupId: null,
        },
      );
    }

    await notifyProgress(input.onProgress, "adgroup_page:done", input.state, {
      campaignId: input.campaign.id,
      authoritativeGrain: input.grain,
      pageNumber,
      recordsRead: request.value.records.length,
      attemptCount: request.attemptCount,
    });

    if (input.grain === "adgroup") {
      input.state.entityPagesRead += 1;

      const isResumingBrandEntityPage =
        input.state.cursor.entityBaseSearchId === pageBaseSearchId &&
        (input.state.cursor.lastCompletedEntityId !== null ||
          input.state.cursor.entityIndexInPage > 0);

      if (!isResumingBrandEntityPage) {
        input.state.cursor = setNaverAuthoritativeEntityStatsEntityPagePosition(
          input.state.cursor,
          { entityBaseSearchId: pageBaseSearchId },
        );
      }

      const placeholderAdgroup = request.value.records[0] ?? {
        id: "empty",
        campaignId: input.campaign.id,
        name: "empty",
        adgroupType: null,
        status: null,
        statusReason: null,
        userLock: null,
      };

      const consumed = await consumeEntityPage({
        campaign: input.campaign,
        adgroup: placeholderAdgroup,
        entities: request.value.records,
        grain: "adgroup",
        state: input.state,
        options: input.options,
        credentials: input.credentials,
        onEntityStats: input.onEntityStats,
        onRetry: input.onRetry,
        onProgress: input.onProgress,
        signal: input.signal,
        dependencies: input.dependencies,
      });

      input.state.adgroupsRead += request.value.records.length;

      if (consumed.status === "partial") {
        return consumed;
      }
    } else {
      let startIndex = 0;

      if (input.state.cursor.adgroupId) {
        const found = request.value.records.findIndex(
          (adgroup) => adgroup.id === input.state.cursor.adgroupId,
        );

        if (found < 0) {
          throw new NaverAuthoritativeEntityStatsCollectorError(
            "RESUME_POSITION_NOT_FOUND",
            "Saved shopping adgroup resume position was not found.",
            { cursor: input.state.cursor },
          );
        }

        startIndex = found;
      }

      for (let index = startIndex; index < request.value.records.length; index += 1) {
        const adgroup = request.value.records[index];

        if (!adgroup) {
          throw new NaverAuthoritativeEntityStatsCollectorError(
            "INVALID_INPUT",
            "The adgroup page contains an invalid item.",
            { cursor: input.state.cursor },
          );
        }

        if (input.state.cursor.adgroupId !== adgroup.id) {
          input.state.cursor = setNaverAuthoritativeEntityStatsAdgroupPosition(
            input.state.cursor,
            {
              adgroupBaseSearchId: pageBaseSearchId,
              adgroupId: adgroup.id,
            },
          );
        }
        input.state.adgroupsRead += 1;

        await notifyProgress(input.onProgress, "adgroup:start", input.state, {
          campaignId: input.campaign.id,
          adgroupId: adgroup.id,
          authoritativeGrain: "ad",
        });

        const result = await collectShoppingAds({
          campaign: input.campaign,
          adgroup,
          state: input.state,
          options: input.options,
          credentials: input.credentials,
          onEntityStats: input.onEntityStats,
          onRetry: input.onRetry,
          onProgress: input.onProgress,
          signal: input.signal,
          dependencies: input.dependencies,
        });

        if (result.status === "partial") {
          return result;
        }

        await notifyProgress(input.onProgress, "adgroup:done", input.state, {
          campaignId: input.campaign.id,
          adgroupId: adgroup.id,
          authoritativeGrain: "ad",
        });

        input.state.cursor = setNaverAuthoritativeEntityStatsAdgroupPosition(
          input.state.cursor,
          {
            adgroupBaseSearchId: pageBaseSearchId,
            adgroupId: null,
          },
        );
      }
    }

    if (request.value.records.length < HIERARCHY_RECORD_SIZE) {
      return CONTINUE;
    }

    assertPagination(
      request.value.records.length,
      request.value.nextBaseSearchId,
      pageBaseSearchId,
      input.state.cursor,
      "adgroup",
    );

    baseSearchId = request.value.nextBaseSearchId;
    input.state.cursor = setNaverAuthoritativeEntityStatsAdgroupPosition(
      input.state.cursor,
      { adgroupBaseSearchId: baseSearchId, adgroupId: null },
    );

    const discoveryReason = discoveryPartialReason(input.state, input.options);

    if (discoveryReason) {
      return { status: "partial", reason: discoveryReason };
    }
  }

  throw new NaverAuthoritativeEntityStatsCollectorError(
    "PAGE_LIMIT_EXCEEDED",
    "Naver adgroup pagination exceeded the safety page limit.",
    { cursor: input.state.cursor },
  );
}

export async function collectNaverAuthoritativeEntityDailyStats(
  input: NaverAuthoritativeEntityStatsCollectorInput,
): Promise<NaverAuthoritativeEntityStatsCollectorResult> {
  if (!input || typeof input !== "object") {
    throw new Error("Naver authoritative entity collector input is required.");
  }

  if (typeof input.onEntityStats !== "function") {
    throw new Error("onEntityStats must be a function.");
  }

  const options = normalizeOptions(input);
  const dependencies = resolveDependencies(input.dependencies);
  const state = createState(normalizeNaverAuthoritativeEntityStatsCursor(input.cursor));
  let campaignBaseSearchId = state.cursor.campaignBaseSearchId;

  await notifyProgress(input.onProgress, "collector:start", state);

  for (let pageNumber = 1; pageNumber <= MAX_CAMPAIGN_PAGES; pageNumber += 1) {
    const pageBaseSearchId = campaignBaseSearchId;
    await notifyProgress(input.onProgress, "campaign_page:start", state, {
      pageNumber,
    });

    const request = await executeApiRequestWithRetry<
      NaverSearchAdsListPage<NaverSearchAdsCampaignRecord>
    >({
      operation: "campaign_page",
      entityId: null,
      state,
      options,
      signal: input.signal,
      onRetry: input.onRetry,
      dependencies,
      request: () =>
        dependencies.fetchCampaignPage({
          credentials: input.credentials,
          baseSearchId: pageBaseSearchId,
          recordSize: HIERARCHY_RECORD_SIZE,
          selector: "NEXT",
        }),
    });

    state.campaignPagesRead += 1;

    await notifyProgress(input.onProgress, "campaign_page:done", state, {
      pageNumber,
      recordsRead: request.value.records.length,
      attemptCount: request.attemptCount,
    });

    let startIndex = 0;

    if (state.cursor.campaignId) {
      const found = request.value.records.findIndex(
        (campaign) => campaign.id === state.cursor.campaignId,
      );

      if (found < 0) {
        throw new NaverAuthoritativeEntityStatsCollectorError(
          "RESUME_POSITION_NOT_FOUND",
          "Saved campaign resume position was not found.",
          { cursor: state.cursor },
        );
      }

      startIndex = found;
    }

    for (let index = startIndex; index < request.value.records.length; index += 1) {
      const campaign = request.value.records[index];

      if (!campaign) {
        throw new NaverAuthoritativeEntityStatsCollectorError(
          "INVALID_INPUT",
          "The campaign page contains an invalid item.",
          { cursor: state.cursor },
        );
      }

      let contract;

      try {
        contract = resolveNaverSearchAdsCampaignCollectionContract(
          campaign.campaignType,
        );
      } catch (error) {
        if (error instanceof NaverSearchAdsAuthoritativeGrainError) {
          throw new NaverAuthoritativeEntityStatsCollectorError(
            "UNSUPPORTED_CAMPAIGN_TYPE",
            error.message,
            { cursor: state.cursor, cause: error },
          );
        }

        throw error;
      }

      state.campaignsRead += 1;

      if (contract.authoritativeGrain === "keyword") {
        await notifyProgress(
          input.onProgress,
          "campaign:skipped_keyword_collector",
          state,
          { campaignId: campaign.id },
        );
        continue;
      }

      if (state.cursor.campaignId !== campaign.id) {
        state.cursor = setNaverAuthoritativeEntityStatsCampaignPosition(
          state.cursor,
          {
            campaignBaseSearchId: pageBaseSearchId,
            campaignId: campaign.id,
            campaignType:
              contract.authoritativeGrain === "ad"
                ? "SHOPPING"
                : "BRAND_SEARCH",
            authoritativeGrain: contract.authoritativeGrain,
          },
        );
      }

      await notifyProgress(input.onProgress, "campaign:start", state, {
        campaignId: campaign.id,
        authoritativeGrain: contract.authoritativeGrain,
      });

      const result = await collectCampaignAdgroups({
        campaign,
        grain: contract.authoritativeGrain,
        state,
        options,
        credentials: input.credentials,
        onEntityStats: input.onEntityStats,
        onRetry: input.onRetry,
        onProgress: input.onProgress,
        signal: input.signal,
        dependencies,
      });

      if (result.status === "partial") {
        await notifyProgress(input.onProgress, "collector:partial", state);
        return buildResult(state, result.reason);
      }

      await notifyProgress(input.onProgress, "campaign:done", state, {
        campaignId: campaign.id,
        authoritativeGrain: contract.authoritativeGrain,
      });

      state.cursor = setNaverAuthoritativeEntityStatsCampaignPosition(
        state.cursor,
        {
          campaignBaseSearchId: pageBaseSearchId,
          campaignId: null,
          campaignType: null,
          authoritativeGrain: null,
        },
      );
    }

    if (request.value.records.length < HIERARCHY_RECORD_SIZE) {
      await notifyProgress(input.onProgress, "collector:done", state);
      return buildResult(state, null);
    }

    assertPagination(
      request.value.records.length,
      request.value.nextBaseSearchId,
      pageBaseSearchId,
      state.cursor,
      "campaign",
    );

    campaignBaseSearchId = request.value.nextBaseSearchId;
    state.cursor = setNaverAuthoritativeEntityStatsCampaignPosition(
      state.cursor,
      {
        campaignBaseSearchId,
        campaignId: null,
        campaignType: null,
        authoritativeGrain: null,
      },
    );

    const reason = discoveryPartialReason(state, options);

    if (reason) {
      await notifyProgress(input.onProgress, "collector:partial", state);
      return buildResult(state, reason);
    }
  }

  throw new NaverAuthoritativeEntityStatsCollectorError(
    "PAGE_LIMIT_EXCEEDED",
    "Naver campaign pagination exceeded the safety page limit.",
    { cursor: state.cursor },
  );
}

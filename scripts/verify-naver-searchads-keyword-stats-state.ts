import {
  deepStrictEqual,
  equal,
  ok,
  throws,
} from "node:assert/strict";

import {
  NAVER_KEYWORD_STATS_CURSOR_VERSION,
  NAVER_KEYWORD_STATS_DEFAULT_CHUNK_PAUSE_MS,
  NAVER_KEYWORD_STATS_DEFAULT_CHUNK_SIZE,
  NAVER_KEYWORD_STATS_DEFAULT_CONCURRENCY,
  NAVER_KEYWORD_STATS_DEFAULT_MAX_DATE_WINDOW_DAYS,
  NAVER_KEYWORD_STATS_DEFAULT_MAX_RETRY_COUNT,
  NAVER_KEYWORD_STATS_DEFAULT_REQUEST_INTERVAL_MS,
  NAVER_KEYWORD_STATS_MAX_JITTER_MS,
  NAVER_KEYWORD_STATS_RATE_LIMIT_RETRY_DELAYS_MS,
  NAVER_KEYWORD_STATS_SERVER_RETRY_DELAYS_MS,
  NaverKeywordStatsStateError,
  addNaverKeywordStatsDiscoveredCount,
  advanceNaverKeywordStatsAdgroup,
  advanceNaverKeywordStatsCampaign,
  advanceNaverKeywordStatsChunk,
  advanceNaverKeywordStatsDateWindow,
  assertValidNaverKeywordStatsDateWindow,
  classifyNaverKeywordStatsRetryCategory,
  createNaverKeywordStatsCursor,
  createNaverKeywordStatsFailureState,
  decideNaverKeywordStatsRetry,
  getNaverKeywordStatsDateWindowDays,
  isNaverKeywordStatsCursorAtChunkStart,
  isNaverKeywordStatsCursorAtHierarchyStart,
  markNaverKeywordStatsKeywordCompleted,
  normalizeNaverKeywordStatsCursor,
  resolveNaverKeywordStatsResumePosition,
  setNaverKeywordStatsAdgroupPosition,
  setNaverKeywordStatsCampaignPosition,
  setNaverKeywordStatsDiscoveredCount,
  setNaverKeywordStatsKeywordPagePosition,
  type NaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";

type VerificationTest = {
  name: string;
  run: () => void;
};

type VerificationResult = {
  name: string;
  passed: boolean;
  error: string | null;
};

function createInitialCursor(): NaverKeywordStatsCursor {
  return createNaverKeywordStatsCursor({
    dateWindow: {
      index: 0,
      dateFrom: "2026-06-01",
      dateTo: "2026-06-24",
    },
  });
}

function assertStateError(
  callback: () => unknown,
  expectedCode: NaverKeywordStatsStateError["code"],
): void {
  throws(
    callback,
    (error: unknown) => {
      return (
        error instanceof
          NaverKeywordStatsStateError &&
        error.code === expectedCode
      );
    },
  );
}

const tests: VerificationTest[] = [
  {
    name: "safe default constants remain fixed",
    run: () => {
      equal(
        NAVER_KEYWORD_STATS_CURSOR_VERSION,
        1,
      );

      equal(
        NAVER_KEYWORD_STATS_DEFAULT_CONCURRENCY,
        1,
      );

      equal(
        NAVER_KEYWORD_STATS_DEFAULT_REQUEST_INTERVAL_MS,
        1_000,
      );

      equal(
        NAVER_KEYWORD_STATS_DEFAULT_CHUNK_SIZE,
        100,
      );

      equal(
        NAVER_KEYWORD_STATS_DEFAULT_CHUNK_PAUSE_MS,
        10_000,
      );

      equal(
        NAVER_KEYWORD_STATS_DEFAULT_MAX_DATE_WINDOW_DAYS,
        31,
      );

      equal(
        NAVER_KEYWORD_STATS_DEFAULT_MAX_RETRY_COUNT,
        3,
      );

      deepStrictEqual(
        NAVER_KEYWORD_STATS_RATE_LIMIT_RETRY_DELAYS_MS,
        [60_000, 120_000, 240_000],
      );

      deepStrictEqual(
        NAVER_KEYWORD_STATS_SERVER_RETRY_DELAYS_MS,
        [2_000, 4_000, 8_000],
      );

      equal(
        NAVER_KEYWORD_STATS_MAX_JITTER_MS,
        500,
      );
    },
  },
  {
    name: "date window day count is inclusive",
    run: () => {
      equal(
        getNaverKeywordStatsDateWindowDays(
          "2026-06-01",
          "2026-06-24",
        ),
        24,
      );

      equal(
        getNaverKeywordStatsDateWindowDays(
          "2026-06-01",
          "2026-06-01",
        ),
        1,
      );

      equal(
        getNaverKeywordStatsDateWindowDays(
          "2026-01-01",
          "2026-01-31",
        ),
        31,
      );
    },
  },
  {
    name: "date window rejects more than 31 days",
    run: () => {
      assertStateError(
        () =>
          assertValidNaverKeywordStatsDateWindow({
            index: 0,
            dateFrom: "2026-01-01",
            dateTo: "2026-02-01",
          }),
        "INVALID_DATE_WINDOW",
      );
    },
  },
  {
    name: "date window rejects reversed dates",
    run: () => {
      assertStateError(
        () =>
          getNaverKeywordStatsDateWindowDays(
            "2026-06-24",
            "2026-06-01",
          ),
        "INVALID_DATE_WINDOW",
      );
    },
  },
  {
    name: "date window rejects invalid calendar dates",
    run: () => {
      assertStateError(
        () =>
          getNaverKeywordStatsDateWindowDays(
            "2026-02-30",
            "2026-03-01",
          ),
        "INVALID_DATE_WINDOW",
      );
    },
  },
  {
    name: "initial cursor starts at hierarchy and chunk start",
    run: () => {
      const cursor =
        createInitialCursor();

      equal(
        cursor.version,
        NAVER_KEYWORD_STATS_CURSOR_VERSION,
      );

      equal(
        cursor.dateWindowIndex,
        0,
      );

      equal(
        cursor.dateFrom,
        "2026-06-01",
      );

      equal(
        cursor.dateTo,
        "2026-06-24",
      );

      equal(
        cursor.completedKeywordCount,
        0,
      );

      equal(
        cursor.discoveredKeywordCount,
        0,
      );

      equal(
        isNaverKeywordStatsCursorAtChunkStart(
          cursor,
        ),
        true,
      );

      equal(
        isNaverKeywordStatsCursorAtHierarchyStart(
          cursor,
        ),
        true,
      );
    },
  },
  {
    name: "cursor normalization returns a validated copy",
    run: () => {
      const cursor =
        createInitialCursor();

      const normalizedCursor =
        normalizeNaverKeywordStatsCursor({
          ...cursor,
        });

      deepStrictEqual(
        normalizedCursor,
        cursor,
      );

      ok(
        normalizedCursor !== cursor,
      );
    },
  },
  {
    name: "cursor normalization rejects unsupported version",
    run: () => {
      const cursor =
        createInitialCursor();

      assertStateError(
        () =>
          normalizeNaverKeywordStatsCursor({
            ...cursor,
            version: 2,
          }),
        "INVALID_CURSOR",
      );
    },
  },
  {
    name: "discovered count can be set and incremented",
    run: () => {
      const initialCursor =
        createInitialCursor();

      const setCursor =
        setNaverKeywordStatsDiscoveredCount(
          initialCursor,
          100,
        );

      equal(
        setCursor.discoveredKeywordCount,
        100,
      );

      const addedCursor =
        addNaverKeywordStatsDiscoveredCount(
          setCursor,
          25,
        );

      equal(
        addedCursor.discoveredKeywordCount,
        125,
      );

      equal(
        initialCursor.discoveredKeywordCount,
        0,
      );
    },
  },
  {
    name: "discovered count cannot be lower than completed count",
    run: () => {
      const cursor =
        createNaverKeywordStatsCursor({
          dateWindow: {
            index: 0,
            dateFrom: "2026-06-01",
            dateTo: "2026-06-24",
          },
          completedKeywordCount: 5,
          discoveredKeywordCount: 5,
        });

      assertStateError(
        () =>
          setNaverKeywordStatsDiscoveredCount(
            cursor,
            4,
          ),
        "INVALID_CURSOR",
      );
    },
  },
  {
    name: "campaign position resets lower hierarchy positions",
    run: () => {
      const cursor =
        setNaverKeywordStatsCampaignPosition(
          createInitialCursor(),
          {
            campaignBaseSearchId:
              "campaign-page-1",
            campaignId:
              "campaign-1",
          },
        );

      equal(
        cursor.campaignBaseSearchId,
        "campaign-page-1",
      );

      equal(
        cursor.campaignId,
        "campaign-1",
      );

      equal(
        cursor.adgroupBaseSearchId,
        null,
      );

      equal(
        cursor.adgroupId,
        null,
      );

      equal(
        cursor.keywordBaseSearchId,
        null,
      );

      equal(
        isNaverKeywordStatsCursorAtHierarchyStart(
          cursor,
        ),
        false,
      );
    },
  },
  {
    name: "adgroup position requires campaign and resets keyword position",
    run: () => {
      const campaignCursor =
        setNaverKeywordStatsCampaignPosition(
          createInitialCursor(),
          {
            campaignBaseSearchId:
              "campaign-page-1",
            campaignId:
              "campaign-1",
          },
        );

      const adgroupCursor =
        setNaverKeywordStatsAdgroupPosition(
          campaignCursor,
          {
            adgroupBaseSearchId:
              "adgroup-page-1",
            adgroupId:
              "adgroup-1",
          },
        );

      equal(
        adgroupCursor.campaignId,
        "campaign-1",
      );

      equal(
        adgroupCursor.adgroupBaseSearchId,
        "adgroup-page-1",
      );

      equal(
        adgroupCursor.adgroupId,
        "adgroup-1",
      );

      equal(
        adgroupCursor.keywordBaseSearchId,
        null,
      );

      assertStateError(
        () =>
          setNaverKeywordStatsAdgroupPosition(
            createInitialCursor(),
            {
              adgroupBaseSearchId:
                "adgroup-page-1",
              adgroupId:
                "adgroup-1",
            },
          ),
        "INVALID_CURSOR",
      );
    },
  },
  {
    name: "keyword page position requires adgroup",
    run: () => {
      const campaignCursor =
        setNaverKeywordStatsCampaignPosition(
          createInitialCursor(),
          {
            campaignBaseSearchId: null,
            campaignId:
              "campaign-1",
          },
        );

      const adgroupCursor =
        setNaverKeywordStatsAdgroupPosition(
          campaignCursor,
          {
            adgroupBaseSearchId: null,
            adgroupId:
              "adgroup-1",
          },
        );

      const keywordPageCursor =
        setNaverKeywordStatsKeywordPagePosition(
          adgroupCursor,
          {
            keywordBaseSearchId:
              "keyword-page-1",
          },
        );

      equal(
        keywordPageCursor.keywordBaseSearchId,
        "keyword-page-1",
      );

      equal(
        keywordPageCursor.keywordChunkIndex,
        0,
      );

      equal(
        keywordPageCursor.keywordIndexInChunk,
        0,
      );

      assertStateError(
        () =>
          setNaverKeywordStatsKeywordPagePosition(
            campaignCursor,
            {
              keywordBaseSearchId:
                "keyword-page-1",
            },
          ),
        "INVALID_CURSOR",
      );
    },
  },
  {
    name: "keyword success advances only after completion",
    run: () => {
      const cursor =
        setNaverKeywordStatsDiscoveredCount(
          createInitialCursor(),
          100,
        );

      const completedCursor =
        markNaverKeywordStatsKeywordCompleted({
          cursor,
          keywordId:
            "keyword-1",
          keywordIndexInChunk: 0,
        });

      equal(
        completedCursor.keywordIndexInChunk,
        1,
      );

      equal(
        completedCursor.lastCompletedKeywordId,
        "keyword-1",
      );

      equal(
        completedCursor.completedKeywordCount,
        1,
      );

      equal(
        cursor.keywordIndexInChunk,
        0,
      );

      equal(
        cursor.completedKeywordCount,
        0,
      );
    },
  },
  {
    name: "keyword success cannot move cursor backward",
    run: () => {
      const cursor =
        setNaverKeywordStatsDiscoveredCount(
          createInitialCursor(),
          100,
        );

      const firstCompletedCursor =
        markNaverKeywordStatsKeywordCompleted({
          cursor,
          keywordId:
            "keyword-1",
          keywordIndexInChunk: 0,
        });

      assertStateError(
        () =>
          markNaverKeywordStatsKeywordCompleted({
            cursor:
              firstCompletedCursor,
            keywordId:
              "keyword-0",
            keywordIndexInChunk: 0,
          }),
        "INVALID_CURSOR",
      );
    },
  },
  {
    name: "resume uses the keyword after last completed id",
    run: () => {
      const cursor =
        markNaverKeywordStatsKeywordCompleted({
          cursor:
            setNaverKeywordStatsDiscoveredCount(
              createInitialCursor(),
              3,
            ),
          keywordId:
            "keyword-2",
          keywordIndexInChunk: 1,
        });

      const resumePosition =
        resolveNaverKeywordStatsResumePosition(
          cursor,
          [
            "keyword-1",
            "keyword-2",
            "keyword-3",
          ],
        );

      deepStrictEqual(
        resumePosition,
        {
          keywordIndexInChunk: 2,
          matchedLastCompletedKeyword: true,
          restartChunkFromBeginning: false,
        },
      );
    },
  },
  {
    name: "resume falls back to stored index when last id is missing",
    run: () => {
      const cursor =
        markNaverKeywordStatsKeywordCompleted({
          cursor:
            setNaverKeywordStatsDiscoveredCount(
              createInitialCursor(),
              3,
            ),
          keywordId:
            "deleted-keyword",
          keywordIndexInChunk: 0,
        });

      const resumePosition =
        resolveNaverKeywordStatsResumePosition(
          cursor,
          [
            "keyword-1",
            "keyword-2",
            "keyword-3",
          ],
        );

      deepStrictEqual(
        resumePosition,
        {
          keywordIndexInChunk: 1,
          matchedLastCompletedKeyword: false,
          restartChunkFromBeginning: false,
        },
      );
    },
  },
  {
    name: "resume restarts chunk when stored index is outside rebuilt chunk",
    run: () => {
      const cursor =
        normalizeNaverKeywordStatsCursor({
          ...createInitialCursor(),
          keywordIndexInChunk: 10,
          lastCompletedKeywordId:
            "missing-keyword",
        });

      const resumePosition =
        resolveNaverKeywordStatsResumePosition(
          cursor,
          [
            "keyword-1",
            "keyword-2",
          ],
        );

      deepStrictEqual(
        resumePosition,
        {
          keywordIndexInChunk: 0,
          matchedLastCompletedKeyword: false,
          restartChunkFromBeginning: true,
        },
      );
    },
  },
  {
    name: "chunk advance resets keyword completion position",
    run: () => {
      const completedCursor =
        markNaverKeywordStatsKeywordCompleted({
          cursor:
            setNaverKeywordStatsDiscoveredCount(
              createInitialCursor(),
              100,
            ),
          keywordId:
            "keyword-1",
          keywordIndexInChunk: 0,
        });

      const nextChunkCursor =
        advanceNaverKeywordStatsChunk({
          cursor:
            completedCursor,
          nextKeywordBaseSearchId:
            "keyword-page-2",
        });

      equal(
        nextChunkCursor.keywordChunkIndex,
        1,
      );

      equal(
        nextChunkCursor.keywordIndexInChunk,
        0,
      );

      equal(
        nextChunkCursor.lastCompletedKeywordId,
        null,
      );

      equal(
        nextChunkCursor.keywordBaseSearchId,
        "keyword-page-2",
      );

      equal(
        nextChunkCursor.completedKeywordCount,
        1,
      );

      equal(
        isNaverKeywordStatsCursorAtChunkStart(
          nextChunkCursor,
        ),
        true,
      );
    },
  },
  {
    name: "adgroup advance resets only lower hierarchy state",
    run: () => {
      const campaignCursor =
        setNaverKeywordStatsCampaignPosition(
          createInitialCursor(),
          {
            campaignBaseSearchId:
              "campaign-page-1",
            campaignId:
              "campaign-1",
          },
        );

      const adgroupCursor =
        setNaverKeywordStatsAdgroupPosition(
          campaignCursor,
          {
            adgroupBaseSearchId:
              "adgroup-page-1",
            adgroupId:
              "adgroup-1",
          },
        );

      const nextAdgroupCursor =
        advanceNaverKeywordStatsAdgroup({
          cursor:
            adgroupCursor,
          nextAdgroupBaseSearchId:
            "adgroup-page-2",
          nextAdgroupId:
            "adgroup-2",
        });

      equal(
        nextAdgroupCursor.campaignId,
        "campaign-1",
      );

      equal(
        nextAdgroupCursor.adgroupBaseSearchId,
        "adgroup-page-2",
      );

      equal(
        nextAdgroupCursor.adgroupId,
        "adgroup-2",
      );

      equal(
        nextAdgroupCursor.keywordBaseSearchId,
        null,
      );

      equal(
        nextAdgroupCursor.keywordChunkIndex,
        0,
      );
    },
  },
  {
    name: "campaign advance resets all lower hierarchy state",
    run: () => {
      const cursor =
        setNaverKeywordStatsCampaignPosition(
          createInitialCursor(),
          {
            campaignBaseSearchId:
              "campaign-page-1",
            campaignId:
              "campaign-1",
          },
        );

      const nextCampaignCursor =
        advanceNaverKeywordStatsCampaign({
          cursor,
          nextCampaignBaseSearchId:
            "campaign-page-2",
          nextCampaignId:
            "campaign-2",
        });

      equal(
        nextCampaignCursor.campaignBaseSearchId,
        "campaign-page-2",
      );

      equal(
        nextCampaignCursor.campaignId,
        "campaign-2",
      );

      equal(
        nextCampaignCursor.adgroupBaseSearchId,
        null,
      );

      equal(
        nextCampaignCursor.adgroupId,
        null,
      );

      equal(
        nextCampaignCursor.keywordBaseSearchId,
        null,
      );
    },
  },
  {
    name: "date window advance resets hierarchy and preserves counts",
    run: () => {
      const initialCursor =
        createNaverKeywordStatsCursor({
          dateWindow: {
            index: 0,
            dateFrom: "2026-05-01",
            dateTo: "2026-05-31",
          },
          completedKeywordCount: 100,
          discoveredKeywordCount: 100,
        });

      const positionedCursor =
        setNaverKeywordStatsCampaignPosition(
          initialCursor,
          {
            campaignBaseSearchId:
              "campaign-page-1",
            campaignId:
              "campaign-1",
          },
        );

      const nextWindowCursor =
        advanceNaverKeywordStatsDateWindow(
          positionedCursor,
          {
            index: 1,
            dateFrom: "2026-06-01",
            dateTo: "2026-06-24",
          },
        );

      equal(
        nextWindowCursor.dateWindowIndex,
        1,
      );

      equal(
        nextWindowCursor.dateFrom,
        "2026-06-01",
      );

      equal(
        nextWindowCursor.dateTo,
        "2026-06-24",
      );

      equal(
        nextWindowCursor.completedKeywordCount,
        100,
      );

      equal(
        nextWindowCursor.discoveredKeywordCount,
        100,
      );

      equal(
        isNaverKeywordStatsCursorAtHierarchyStart(
          nextWindowCursor,
        ),
        true,
      );
    },
  },
  {
    name: "date window index must advance by exactly one",
    run: () => {
      const cursor =
        createInitialCursor();

      assertStateError(
        () =>
          advanceNaverKeywordStatsDateWindow(
            cursor,
            {
              index: 2,
              dateFrom: "2026-07-01",
              dateTo: "2026-07-31",
            },
          ),
        "INVALID_DATE_WINDOW",
      );
    },
  },
  {
    name: "HTTP and network retry categories are classified",
    run: () => {
      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: 429,
        }),
        "rate_limit",
      );

      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: 500,
        }),
        "server_error",
      );

      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: 503,
        }),
        "server_error",
      );

      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: null,
          isNetworkError: true,
        }),
        "network_error",
      );

      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: 400,
        }),
        "non_retryable",
      );

      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: 401,
        }),
        "non_retryable",
      );

      equal(
        classifyNaverKeywordStatsRetryCategory({
          httpStatus: 404,
        }),
        "non_retryable",
      );
    },
  },
  {
    name: "429 uses conservative retry schedule",
    run: () => {
      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "rate_limit",
          retryCount: 0,
        }),
        {
          shouldRetry: true,
          category:
            "rate_limit",
          retryCount: 1,
          delayMs: 60_000,
        },
      );

      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "rate_limit",
          retryCount: 1,
        }),
        {
          shouldRetry: true,
          category:
            "rate_limit",
          retryCount: 2,
          delayMs: 120_000,
        },
      );

      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "rate_limit",
          retryCount: 2,
        }),
        {
          shouldRetry: true,
          category:
            "rate_limit",
          retryCount: 3,
          delayMs: 240_000,
        },
      );
    },
  },
  {
    name: "429 Retry-After overrides internal schedule",
    run: () => {
      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "rate_limit",
          retryCount: 0,
          retryAfterMs: 75_000,
        }),
        {
          shouldRetry: true,
          category:
            "rate_limit",
          retryCount: 1,
          delayMs: 75_000,
        },
      );
    },
  },
  {
    name: "5xx and network retries use short schedule plus jitter",
    run: () => {
      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "server_error",
          retryCount: 0,
          jitterMs: 250,
        }),
        {
          shouldRetry: true,
          category:
            "server_error",
          retryCount: 1,
          delayMs: 2_250,
        },
      );

      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "network_error",
          retryCount: 1,
          jitterMs: 500,
        }),
        {
          shouldRetry: true,
          category:
            "network_error",
          retryCount: 2,
          delayMs: 4_500,
        },
      );
    },
  },
  {
    name: "retry stops after maximum retry count",
    run: () => {
      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "rate_limit",
          retryCount: 3,
        }),
        {
          shouldRetry: false,
          category:
            "rate_limit",
          retryCount: 3,
          delayMs: null,
          reason:
            "MAX_RETRY_COUNT_REACHED",
        },
      );

      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "server_error",
          retryCount: 3,
        }),
        {
          shouldRetry: false,
          category:
            "server_error",
          retryCount: 3,
          delayMs: null,
          reason:
            "MAX_RETRY_COUNT_REACHED",
        },
      );
    },
  },
  {
    name: "non-retryable errors stop immediately",
    run: () => {
      deepStrictEqual(
        decideNaverKeywordStatsRetry({
          category:
            "non_retryable",
          retryCount: 0,
        }),
        {
          shouldRetry: false,
          category:
            "non_retryable",
          retryCount: 0,
          delayMs: null,
          reason:
            "NON_RETRYABLE_ERROR",
        },
      );
    },
  },
  {
    name: "retry validation rejects jitter above maximum",
    run: () => {
      assertStateError(
        () =>
          decideNaverKeywordStatsRetry({
            category:
              "server_error",
            retryCount: 0,
            jitterMs:
              NAVER_KEYWORD_STATS_MAX_JITTER_MS +
              1,
          }),
        "INVALID_RETRY_INPUT",
      );
    },
  },
  {
    name: "failure state stores a cloned cursor and normalized datetime",
    run: () => {
      const cursor =
        markNaverKeywordStatsKeywordCompleted({
          cursor:
            setNaverKeywordStatsDiscoveredCount(
              createInitialCursor(),
              100,
            ),
          keywordId:
            "keyword-1",
          keywordIndexInChunk: 0,
        });

      const failureState =
        createNaverKeywordStatsFailureState({
          cursor,
          keywordId:
            "keyword-2",
          httpStatus: 429,
          errorCode:
            "RATE_LIMITED",
          retryCount: 3,
          failedAt:
            "2026-06-30T09:00:00+09:00",
        });

      equal(
        failureState.keywordId,
        "keyword-2",
      );

      equal(
        failureState.httpStatus,
        429,
      );

      equal(
        failureState.errorCode,
        "RATE_LIMITED",
      );

      equal(
        failureState.retryCount,
        3,
      );

      equal(
        failureState.failedAt,
        "2026-06-30T00:00:00.000Z",
      );

      deepStrictEqual(
        failureState.cursor,
        cursor,
      );

      ok(
        failureState.cursor !== cursor,
      );
    },
  },
  {
    name: "failure state rejects invalid HTTP status",
    run: () => {
      assertStateError(
        () =>
          createNaverKeywordStatsFailureState({
            cursor:
              createInitialCursor(),
            keywordId:
              "keyword-1",
            httpStatus: 999,
            errorCode:
              "INVALID_STATUS",
            retryCount: 0,
            failedAt:
              "2026-06-30T00:00:00.000Z",
          }),
        "INVALID_FAILURE_STATE",
      );
    },
  },
];

function runVerificationTests(): VerificationResult[] {
  const results:
    VerificationResult[] = [];

  for (const test of tests) {
    try {
      test.run();

      results.push({
        name: test.name,
        passed: true,
        error: null,
      });

      console.log(
        `PASS: ${test.name}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "UNKNOWN_ERROR";

      results.push({
        name: test.name,
        passed: false,
        error: errorMessage,
      });

      console.error(
        `FAIL: ${test.name}`,
      );

      console.error(
        `  ${errorMessage}`,
      );
    }
  }

  return results;
}

function main(): void {
  console.log(
    "Naver keyword stats state verification started.",
  );

  console.log(
    "verification uses Naver API:",
    false,
  );

  console.log(
    "verification uses database:",
    false,
  );

  console.log(
    "verification modifies report data:",
    false,
  );

  const results =
    runVerificationTests();

  const passedCount =
    results.filter(
      (result) =>
        result.passed,
    ).length;

  const failedResults =
    results.filter(
      (result) =>
        !result.passed,
    );

  console.log(
    "verification tests attempted:",
    results.length,
  );

  console.log(
    "verification tests passed:",
    passedCount,
  );

  console.log(
    "verification tests failed:",
    failedResults.length,
  );

  if (
    failedResults.length > 0
  ) {
    console.error(
      "failed verification tests:",
    );

    for (
      const failedResult
      of failedResults
    ) {
      console.error(
        `- ${failedResult.name}: ${failedResult.error ?? "UNKNOWN_ERROR"}`,
      );
    }
  }

  const verificationPassed =
    results.length > 0 &&
    failedResults.length === 0;

  console.log(
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "UNKNOWN_ERROR";

  console.error(
    "Naver keyword stats state verification failed:",
    errorMessage,
  );

  process.exitCode = 1;
}
import {
  createMediaCanonicalRowBatchBuffer,
  MediaCanonicalRowBatchBufferError,
  type MediaCanonicalRowBatchFlushContext,
} from "../src/lib/media-sync/media-canonical-row-batch-buffer";
import {
  convertNaverKeywordDailyStatsToCanonicalRows,
  NaverSearchAdsCanonicalRowError,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import {
  collectNaverKeywordDailyStats,
  NaverKeywordStatsCollectorError,
  type NaverKeywordStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";
import type {
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
} from "../src/lib/media-sync/types";

const EXTERNAL_ACCOUNT_ID =
  "fixture-customer-001";

const DATE_FROM = "2026-06-01";
const DATE_TO = "2026-06-03";

const KEYWORD_COUNT = 5;
const ROWS_PER_KEYWORD = 3;
const BATCH_SIZE = 4;

const EXPECTED_CANONICAL_ROW_COUNT =
  KEYWORD_COUNT * ROWS_PER_KEYWORD;

const EXPECTED_BATCH_SIZES = [
  4,
  4,
  4,
  3,
] as const;

const CAMPAIGN:
  NaverSearchAdsCampaignRecord = {
    id: "cmp-fixture-001",
    name: "통합 검증 캠페인",
    campaignType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const ADGROUP:
  NaverSearchAdsAdgroupRecord = {
    id: "grp-fixture-001",
    campaignId: CAMPAIGN.id,
    name: "통합 검증 광고그룹",
    adgroupType: "WEB_SITE",
    status: "ELIGIBLE",
    statusReason: null,
    userLock: false,
  };

const KEYWORDS:
  NaverSearchAdsKeywordRecord[] =
  Array.from(
    {
      length: KEYWORD_COUNT,
    },
    (_, index) => {
      const sequence = index + 1;

      return {
        id:
          `kwd-fixture-${String(sequence).padStart(3, "0")}`,
        adgroupId: ADGROUP.id,
        keyword:
          `통합검증키워드-${sequence}`,
        inspectStatus: "APPROVED",
        status: "ELIGIBLE",
        statusReason: null,
        userLock: false,
        bidAmount:
          100 * sequence,
        useGroupBidAmount: false,
      };
    },
  );

type CapturedBatch = {
  size: number;
  context: MediaCanonicalRowBatchFlushContext;
  orderKeys: string[];
};

type IntegrationMeasurements = {
  callbackCount: number;
  convertedRowCount: number;
  flushCount: number;
  maximumBatchSizeObserved: number;
  finalPartialBatchSize: number | null;
  fullBatchCount: number;
  finalBatchCount: number;
  batchSizes: number[];
  flushedOrderKeys: string[];
  callbackOrderKeys: string[];
  contexts: MediaCanonicalRowBatchFlushContext[];
};

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function assertJsonEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson =
    JSON.stringify(actual);

  const expectedJson =
    JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}: expected=${expectedJson} actual=${actualJson}`,
    );
  }
}

function createListPage<T>(
  records: T[],
): NaverSearchAdsListPage<T> {
  return {
    records,
    recordSize: 100,
    selector: "NEXT",
    baseSearchId: null,
    nextBaseSearchId:
      records.length > 0
        ? (
            records[
              records.length - 1
            ] as {
              id?: unknown;
            }
          ).id as string
        : null,
  };
}

function createStatsResult(
  keywordId: string,
): NaverSearchAdsKeywordDailyStatsResult {
  const keywordSequence =
    Number(
      keywordId.slice(-3),
    );

  return {
    keywordId,
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    records: [
      {
        keywordId,
        date: "2026-06-01",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-01",
        impCnt:
          keywordSequence * 100 + 1,
        clkCnt:
          keywordSequence * 10 + 1,
        salesAmt:
          keywordSequence * 1000 + 1,
        ccnt:
          keywordSequence + 1,
        convAmt:
          keywordSequence * 5000 + 1,
        avgRnk:
          keywordSequence + 0.1,
      },
      {
        keywordId,
        date: "2026-06-02",
        periodStart: "2026-06-02",
        periodEnd: "2026-06-02",
        impCnt:
          keywordSequence * 100 + 2,
        clkCnt:
          keywordSequence * 10 + 2,
        salesAmt:
          keywordSequence * 1000 + 2,
        ccnt:
          keywordSequence + 2,
        convAmt:
          keywordSequence * 5000 + 2,
        avgRnk:
          keywordSequence + 0.2,
      },
      {
        keywordId,
        date: "2026-06-03",
        periodStart: "2026-06-03",
        periodEnd: "2026-06-03",
        impCnt:
          keywordSequence * 100 + 3,
        clkCnt:
          keywordSequence * 10 + 3,
        salesAmt:
          keywordSequence * 1000 + 3,
        ccnt:
          keywordSequence + 3,
        convAmt:
          keywordSequence * 5000 + 3,
        avgRnk:
          keywordSequence + 0.3,
      },
    ],
  };
}

function createOrderKey(
  row: EtrylueNormalizedMediaRow,
): string {
  return [
    row.external_keyword_id,
    row.date,
  ].join("|");
}

function createDependencies():
  Partial<NaverKeywordStatsCollectorDependencies> {
  let nowValue = 0;

  return {
    fetchCampaignPage:
      async () =>
        createListPage([
          CAMPAIGN,
        ]),

    fetchAdgroupPage:
      async () =>
        createListPage([
          ADGROUP,
        ]),

    fetchKeywordPage:
      async () =>
        createListPage(
          KEYWORDS.map(
            (keyword) => ({
              ...keyword,
            }),
          ),
        ),

    fetchKeywordDailyStats:
      async (input) =>
        createStatsResult(
          input.keywordId,
        ),

    sleep:
      async () => {},

    now:
      () => {
        nowValue += 1;
        return nowValue;
      },

    random:
      () => 0,
  };
}

function createExpectedOrderKeys(): string[] {
  return KEYWORDS.flatMap(
    (keyword) => [
      `${keyword.id}|2026-06-01`,
      `${keyword.id}|2026-06-02`,
      `${keyword.id}|2026-06-03`,
    ],
  );
}

async function runSuccessfulIntegration(): Promise<void> {
  const capturedBatches:
    CapturedBatch[] = [];

  const measurements:
    IntegrationMeasurements = {
      callbackCount: 0,
      convertedRowCount: 0,
      flushCount: 0,
      maximumBatchSizeObserved: 0,
      finalPartialBatchSize: null,
      fullBatchCount: 0,
      finalBatchCount: 0,
      batchSizes: [],
      flushedOrderKeys: [],
      callbackOrderKeys: [],
      contexts: [],
    };

  const buffer =
    createMediaCanonicalRowBatchBuffer({
      maxBatchSize:
        BATCH_SIZE,

      onFlush:
        async (
          rows,
          context,
        ) => {
          const orderKeys =
            rows.map(
              createOrderKey,
            );

          capturedBatches.push({
            size:
              rows.length,
            context: {
              ...context,
            },
            orderKeys,
          });

          measurements.flushCount +=
            1;

          measurements.maximumBatchSizeObserved =
            Math.max(
              measurements.maximumBatchSizeObserved,
              rows.length,
            );

          measurements.batchSizes.push(
            rows.length,
          );

          measurements.flushedOrderKeys.push(
            ...orderKeys,
          );

          measurements.contexts.push({
            ...context,
          });

          if (
            context.reason === "full"
          ) {
            measurements.fullBatchCount +=
              1;
          }

          if (
            context.reason === "final"
          ) {
            measurements.finalBatchCount +=
              1;

            measurements.finalPartialBatchSize =
              rows.length;
          }
        },
    });

  const startCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: DATE_FROM,
        dateTo: DATE_TO,
      },
    });

  const collectorResult =
    await collectNaverKeywordDailyStats({
      credentials: {
        customerId:
          EXTERNAL_ACCOUNT_ID,
        accessLicense:
          "fixture-access-license",
        secretKey:
          "fixture-secret-key",
      },

      cursor:
        startCursor,

      requestIntervalMs: 0,
      keywordChunkSize: 3,
      chunkPauseMs: 0,
      maxRetryCount: 3,

      dependencies:
        createDependencies(),

      onKeywordStats:
        async (item) => {
          measurements.callbackCount +=
            1;

          const rows =
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                item.campaign,
              adgroup:
                item.adgroup,
              keyword:
                item.keyword,
              stats:
                item.stats,
            });

          measurements.convertedRowCount +=
            rows.length;

          measurements.callbackOrderKeys.push(
            ...rows.map(
              createOrderKey,
            ),
          );

          await buffer.pushMany(
            rows,
          );
        },
    });

  const stateBeforeFinalFlush =
    buffer.getState();

  assertEqual(
    stateBeforeFinalFlush.pendingRowCount,
    3,
    "Final partial batch pending count mismatch",
  );

  assertEqual(
    stateBeforeFinalFlush.flushedRowCount,
    12,
    "Rows confirmed before final flush mismatch",
  );

  await buffer.flushRemaining();

  const finalState =
    buffer.getState();

  const expectedOrderKeys =
    createExpectedOrderKeys();

  assertEqual(
    collectorResult.completed,
    true,
    "Collector did not complete",
  );

  assertEqual(
    collectorResult.keywordsCompletedInRun,
    KEYWORD_COUNT,
    "Collector keyword completion count mismatch",
  );

  assertEqual(
    collectorResult.statsRequestsSucceeded,
    KEYWORD_COUNT,
    "Collector stats success count mismatch",
  );

  assertEqual(
    collectorResult.cursor.completedKeywordCount,
    KEYWORD_COUNT,
    "Final cursor completion count mismatch",
  );

  assertEqual(
    measurements.callbackCount,
    KEYWORD_COUNT,
    "Callback count mismatch",
  );

  assertEqual(
    measurements.convertedRowCount,
    EXPECTED_CANONICAL_ROW_COUNT,
    "Canonical conversion row count mismatch",
  );

  assertEqual(
    finalState.acceptedRowCount,
    EXPECTED_CANONICAL_ROW_COUNT,
    "Buffer accepted row count mismatch",
  );

  assertEqual(
    finalState.flushedRowCount,
    EXPECTED_CANONICAL_ROW_COUNT,
    "Buffer flushed row count mismatch",
  );

  assertEqual(
    finalState.pendingRowCount,
    0,
    "Rows remain buffered after final flush",
  );

  assertEqual(
    finalState.flushedBatchCount,
    EXPECTED_BATCH_SIZES.length,
    "Flushed batch count mismatch",
  );

  assertEqual(
    measurements.maximumBatchSizeObserved,
    BATCH_SIZE,
    "Maximum batch size mismatch",
  );

  assertTrue(
    measurements.batchSizes.every(
      (batchSize) =>
        batchSize <= BATCH_SIZE,
    ),
    "A flushed batch exceeded the maximum size.",
  );

  assertJsonEqual(
    measurements.batchSizes,
    EXPECTED_BATCH_SIZES,
    "Batch size sequence mismatch",
  );

  assertEqual(
    measurements.fullBatchCount,
    3,
    "Full batch count mismatch",
  );

  assertEqual(
    measurements.finalBatchCount,
    1,
    "Final batch count mismatch",
  );

  assertEqual(
    measurements.finalPartialBatchSize,
    3,
    "Final partial batch size mismatch",
  );

  assertJsonEqual(
    measurements.callbackOrderKeys,
    expectedOrderKeys,
    "Callback canonical row order mismatch",
  );

  assertJsonEqual(
    measurements.flushedOrderKeys,
    expectedOrderKeys,
    "Flushed canonical row order mismatch",
  );

  assertJsonEqual(
    measurements.contexts,
    [
      {
        batchIndex: 0,
        rowStartIndex: 0,
        rowEndIndex: 3,
        reason: "full",
      },
      {
        batchIndex: 1,
        rowStartIndex: 4,
        rowEndIndex: 7,
        reason: "full",
      },
      {
        batchIndex: 2,
        rowStartIndex: 8,
        rowEndIndex: 11,
        reason: "full",
      },
      {
        batchIndex: 3,
        rowStartIndex: 12,
        rowEndIndex: 14,
        reason: "final",
      },
    ],
    "Flush context sequence mismatch",
  );

  assertEqual(
    capturedBatches.length,
    EXPECTED_BATCH_SIZES.length,
    "Captured batch count mismatch",
  );

  console.log(
    "collector completed:",
    collectorResult.completed,
  );
  console.log(
    "collector keywords completed:",
    collectorResult.keywordsCompletedInRun,
  );
  console.log(
    "collector stats requests succeeded:",
    collectorResult.statsRequestsSucceeded,
  );
  console.log(
    "canonical callbacks converted:",
    measurements.callbackCount,
  );
  console.log(
    "canonical rows accepted:",
    finalState.acceptedRowCount,
  );
  console.log(
    "canonical rows flushed:",
    finalState.flushedRowCount,
  );
  console.log(
    "flush batch count:",
    finalState.flushedBatchCount,
  );
  console.log(
    "flush batch sizes:",
    JSON.stringify(
      measurements.batchSizes,
    ),
  );
  console.log(
    "maximum batch size observed:",
    measurements.maximumBatchSizeObserved,
  );
  console.log(
    "final partial batch size:",
    measurements.finalPartialBatchSize,
  );
  console.log(
    "global row order preserved:",
    true,
  );
  console.log(
    "final buffer pending rows:",
    finalState.pendingRowCount,
  );
}

async function runConsumerFailureIntegration(): Promise<void> {
  let flushAttemptCount = 0;

  const buffer =
    createMediaCanonicalRowBatchBuffer({
      maxBatchSize: 4,

      onFlush:
        async () => {
          flushAttemptCount += 1;

          throw new Error(
            "fixture flush consumer failure",
          );
        },
    });

  const startCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index: 0,
        dateFrom: DATE_FROM,
        dateTo: DATE_TO,
      },
    });

  let collectorError:
    NaverKeywordStatsCollectorError | null =
    null;

  try {
    await collectNaverKeywordDailyStats({
      credentials: {
        customerId:
          EXTERNAL_ACCOUNT_ID,
        accessLicense:
          "fixture-access-license",
        secretKey:
          "fixture-secret-key",
      },

      cursor:
        startCursor,

      requestIntervalMs: 0,
      keywordChunkSize: 3,
      chunkPauseMs: 0,
      maxRetryCount: 3,

      dependencies:
        createDependencies(),

      onKeywordStats:
        async (item) => {
          const rows =
            convertNaverKeywordDailyStatsToCanonicalRows({
              externalAccountId:
                EXTERNAL_ACCOUNT_ID,
              campaign:
                item.campaign,
              adgroup:
                item.adgroup,
              keyword:
                item.keyword,
              stats:
                item.stats,
            });

          await buffer.pushMany(
            rows,
          );
        },
    });
  } catch (error) {
    assertTrue(
      error instanceof
        NaverKeywordStatsCollectorError,
      "Expected collector consumer failure.",
    );

    collectorError = error;
  }

  assertTrue(
    collectorError !== null,
    "Collector did not expose the consumer failure.",
  );

  assertEqual(
    collectorError.code,
    "CONSUMER_FAILED",
    "Unexpected collector error code",
  );

  assertEqual(
    collectorError.cursor.completedKeywordCount,
    1,
    "Collector advanced past the failed keyword callback",
  );

  assertEqual(
    flushAttemptCount,
    1,
    "Unexpected flush attempt count",
  );

  const pendingRows =
    buffer.getPendingRowsForVerification();

  const failedState =
    buffer.getState();

  assertEqual(
    pendingRows.length,
    4,
    "Failed full batch was not preserved",
  );

  assertEqual(
    failedState.flushedRowCount,
    0,
    "Failed rows were incorrectly confirmed",
  );

  assertEqual(
    failedState.flushedBatchCount,
    0,
    "Failed batch was incorrectly counted",
  );

  const cause =
    collectorError.cause;

  assertTrue(
    cause instanceof
      MediaCanonicalRowBatchBufferError,
    "Collector failure cause is not the batch buffer error.",
  );

  assertEqual(
    cause.code,
    "CONSUMER_FAILED",
    "Unexpected batch buffer error code",
  );

  assertEqual(
    cause.pendingRowCount,
    4,
    "Batch buffer failure pending count mismatch",
  );

  console.log(
    "consumer failure exposed by collector:",
    true,
  );
  console.log(
    "cursor preserved before failed keyword completion:",
    true,
  );
  console.log(
    "failed batch pending rows preserved:",
    pendingRows.length,
  );
  console.log(
    "failed batch confirmed rows:",
    failedState.flushedRowCount,
  );
}

async function main(): Promise<void> {
  let verificationPassed = false;

  try {
    await runSuccessfulIntegration();
    await runConsumerFailureIntegration();

    verificationPassed = true;
  } catch (error) {
    if (
      error instanceof
      NaverKeywordStatsCollectorError
    ) {
      console.error(
        "collector integration verification failed:",
        error.code,
      );
    } else if (
      error instanceof
      NaverSearchAdsCanonicalRowError
    ) {
      console.error(
        "canonical integration verification failed:",
        error.code,
      );
    } else if (
      error instanceof
      MediaCanonicalRowBatchBufferError
    ) {
      console.error(
        "batch buffer integration verification failed:",
        error.code,
      );
    } else {
      console.error(
        "integration verification failed:",
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : {
              value: String(error),
            },
      );
    }
  }

  console.log(
    "verification uses real Naver API:",
    false,
  );
  console.log(
    "verification uses database:",
    false,
  );
  console.log(
    "verification writes report_rows:",
    false,
  );
  console.log(
    "verification creates snapshot:",
    false,
  );
  console.log(
    "verification updates job progress:",
    false,
  );
  console.log(
    "verification modifies CSV worker:",
    false,
  );
  console.log(
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

void main();

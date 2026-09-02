import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  createMediaCanonicalRowBatchBuffer,
} from "../src/lib/media-sync/media-canonical-row-batch-buffer";
import {
  appendMediaSyncStagingBatch,
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  buildMediaSyncStagingRowKey,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import {
  runNaverSearchAdsAuthoritativeEntityStagingOrchestrator,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator";
import type {
  NaverAuthoritativeEntityStatsCollectorDependencies,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector";
import {
  convertNaverKeywordDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/naver-searchads-canonical-row";
import {
  collectNaverKeywordDailyStats,
  type NaverKeywordStatsCollectorDependencies,
  type NaverKeywordStatsCollectorResult,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-collector";
import {
  createNaverKeywordStatsCursor,
  normalizeNaverKeywordStatsCursor,
  type NaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";
import type {
  NaverSearchAdsAdRecord,
  NaverSearchAdsAdgroupRecord,
  NaverSearchAdsCampaignRecord,
  NaverSearchAdsEntityDailyStatsResult,
  NaverSearchAdsKeywordDailyStatsResult,
  NaverSearchAdsKeywordRecord,
  NaverSearchAdsListPage,
} from "../src/lib/media-sync/naver-searchads-api";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const EXTERNAL_ACCOUNT_ID =
  "123456";

const DATE_FROM =
  "2026-05-01";

const DATE_TO =
  "2026-05-02";

const DATE_WINDOW_INDEX =
  0;

const KEYWORD_STAGING_BATCH_SIZE =
  3;

const AUTHORITATIVE_STAGING_BATCH_SIZE =
  3;

const credentials = {
  customerId:
    EXTERNAL_ACCOUNT_ID,
  accessLicense:
    "fixture-access-license",
  secretKey:
    "fixture-secret-key",
};

const JOB_FIXTURE:
  MediaSyncJobRecord = {
    id:
      "11111111-1111-4111-8111-111111111111",
    workspace_id:
      "22222222-2222-4222-8222-222222222222",
    advertiser_id:
      "33333333-3333-4333-8333-333333333333",
    report_id:
      "44444444-4444-4444-8444-444444444444",
    connection_id:
      "55555555-5555-4555-8555-555555555555",

    provider:
      "naver_searchad",
    external_account_id:
      EXTERNAL_ACCOUNT_ID,

    date_from:
      DATE_FROM,
    date_to:
      DATE_TO,

    data_level:
      "mixed",
    mode:
      "snapshot_replace",

    status:
      "processing",
    progress:
      0,

    raw_rows:
      0,
    normalized_rows:
      0,
    inserted_rows:
      0,
    failed_rows:
      0,

    previous_ingestion_id:
      null,
    snapshot_ingestion_id:
      null,

    attempt_count:
      1,
    error:
      null,
    error_detail:
      null,

    created_by:
      "66666666-6666-4666-8666-666666666666",
    created_at:
      "2026-07-14T00:00:00.000Z",
    started_at:
      "2026-07-14T00:00:01.000Z",
    finished_at:
      null,
    updated_at:
      "2026-07-14T00:00:01.000Z",
  };

const campaigns:
  NaverSearchAdsCampaignRecord[] = [
    {
      id:
        "cmp-web",
      name:
        "Powerlink",
      campaignType:
        "WEB_SITE",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "cmp-shopping",
      name:
        "Shopping MO",
      campaignType:
        "SHOPPING",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "cmp-brand",
      name:
        "Brand Search",
      campaignType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const webAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "grp-web",
      campaignId:
        "cmp-web",
      name:
        "Powerlink Group",
      adgroupType:
        "WEB_SITE",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const shoppingAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "grp-shopping",
      campaignId:
        "cmp-shopping",
      name:
        "Shopping Group",
      adgroupType:
        "SHOPPING_PRODUCT_AD",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const brandAdgroups:
  NaverSearchAdsAdgroupRecord[] = [
    {
      id:
        "grp-brand-1",
      campaignId:
        "cmp-brand",
      name:
        "Brand Group 1",
      adgroupType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
    {
      id:
        "grp-brand-2",
      campaignId:
        "cmp-brand",
      name:
        "Brand Group 2",
      adgroupType:
        "BRAND_SEARCH",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
    },
  ];

const webKeywords:
  NaverSearchAdsKeywordRecord[] = [
    {
      id:
        "kw-web-1",
      adgroupId:
        "grp-web",
      keyword:
        "파워링크 키워드 1",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      bidAmount:
        500,
      useGroupBidAmount:
        false,
    },
    {
      id:
        "kw-web-2",
      adgroupId:
        "grp-web",
      keyword:
        "파워링크 키워드 2",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      bidAmount:
        600,
      useGroupBidAmount:
        false,
    },
  ];

const shoppingAds:
  NaverSearchAdsAdRecord[] = [
    {
      id:
        "ad-shopping-1",
      adgroupId:
        "grp-shopping",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "product-1",
    },
    {
      id:
        "ad-shopping-2",
      adgroupId:
        "grp-shopping",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "product-2",
    },
    {
      id:
        "ad-shopping-3",
      adgroupId:
        "grp-shopping",
      type:
        "SHOPPING_PRODUCT_AD",
      inspectStatus:
        "APPROVED",
      status:
        "ELIGIBLE",
      statusReason:
        null,
      userLock:
        false,
      referenceKey:
        "product-3",
    },
  ];

type UnknownRecord =
  Record<string, unknown>;

type CombinedPhase =
  | "keyword:first"
  | "keyword:resume"
  | "authoritative:first"
  | "authoritative:resume";

type CapturedRpcCall = {
  phase:
    CombinedPhase;
  functionName:
    string;
  payload:
    UnknownRecord;
};

type KeywordPhaseResult = {
  collector:
    NaverKeywordStatsCollectorResult;
  rowStartIndex:
    number;
  nextRowIndex:
    number;
  runCanonicalRowCount:
    number;
  canonicalRows:
    EtrylueNormalizedMediaRow[];
};

function page<T>(
  records: T[],
): NaverSearchAdsListPage<T> {
  return {
    records,
    nextBaseSearchId:
      null,
    recordSize:
      100,
    selector:
      "NEXT",
    baseSearchId:
      null,
  };
}

function keywordStats(
  keywordId: string,
): NaverSearchAdsKeywordDailyStatsResult {
  return {
    keywordId,
    dateFrom:
      DATE_FROM,
    dateTo:
      DATE_TO,
    records: [
      {
        keywordId,
        date:
          DATE_TO,
        periodStart:
          DATE_TO,
        periodEnd:
          DATE_TO,
        impCnt:
          40,
        clkCnt:
          4,
        salesAmt:
          400,
        ccnt:
          2,
        convAmt:
          900,
        avgRnk:
          2.2,
      },
      {
        keywordId,
        date:
          DATE_FROM,
        periodStart:
          DATE_FROM,
        periodEnd:
          DATE_FROM,
        impCnt:
          30,
        clkCnt:
          3,
        salesAmt:
          300,
        ccnt:
          1,
        convAmt:
          700,
        avgRnk:
          1.8,
      },
    ],
  };
}

function entityStats(
  entityId: string,
  entityType:
    | "adgroup"
    | "ad",
): NaverSearchAdsEntityDailyStatsResult {
  return {
    entityId,
    entityType,
    dateFrom:
      DATE_FROM,
    dateTo:
      DATE_TO,
    records: [
      {
        entityId,
        entityType,
        date:
          DATE_TO,
        periodStart:
          DATE_TO,
        periodEnd:
          DATE_TO,
        impCnt:
          20,
        clkCnt:
          2,
        salesAmt:
          200,
        ccnt:
          1,
        convAmt:
          500,
      },
      {
        entityId,
        entityType,
        date:
          DATE_FROM,
        periodStart:
          DATE_FROM,
        periodEnd:
          DATE_FROM,
        impCnt:
          10,
        clkCnt:
          1,
        salesAmt:
          100,
        ccnt:
          0,
        convAmt:
          0,
      },
    ],
  };
}

function hash(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
    )
    .digest(
      "hex",
    );
}

function requireRecord(
  value: unknown,
  message: string,
): UnknownRecord {
  if (
    value === null ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new Error(
      message,
    );
  }

  return value as
    UnknownRecord;
}

function requireRpcRows(
  payload:
    UnknownRecord,
): UnknownRecord[] {
  const rows =
    payload.rows;

  if (!Array.isArray(rows)) {
    throw new Error(
      "RPC payload rows must be an array.",
    );
  }

  return rows.map(
    (
      row,
    ) =>
      requireRecord(
        row,
        "RPC payload row must be an object.",
      ),
  );
}

function flattenRpcRows(
  calls:
    readonly CapturedRpcCall[],
): UnknownRecord[] {
  return calls.flatMap(
    (
      call,
    ) =>
      requireRpcRows(
        call.payload,
      ),
  );
}

function getCampaignAdgroups(
  campaignId: string,
): NaverSearchAdsAdgroupRecord[] {
  if (
    campaignId ===
    "cmp-web"
  ) {
    return webAdgroups;
  }

  if (
    campaignId ===
    "cmp-shopping"
  ) {
    return shoppingAdgroups;
  }

  if (
    campaignId ===
    "cmp-brand"
  ) {
    return brandAdgroups;
  }

  return [];
}

async function runKeywordPhase(input: {
  cursor:
    NaverKeywordStatsCursor;
  rowStartIndex:
    number;
  maxKeywordStatsPerRun:
    number;
  dependencies:
    Partial<NaverKeywordStatsCollectorDependencies>;
  invokeRpc:
    MediaSyncStagingRepositoryRpcInvoker;
}): Promise<KeywordPhaseResult> {
  const canonicalRows:
    EtrylueNormalizedMediaRow[] = [];

  const batchBuffer =
    createMediaCanonicalRowBatchBuffer({
      maxBatchSize:
        KEYWORD_STAGING_BATCH_SIZE,

      onFlush:
        async (
          rows,
          context,
        ): Promise<void> => {
          const absoluteRowStartIndex =
            input.rowStartIndex +
            context.rowStartIndex;

          const result =
            await appendMediaSyncStagingBatch(
              {
                job:
                  JOB_FIXTURE,
                rows,
                rowStartIndex:
                  absoluteRowStartIndex,
                dateWindowIndex:
                  DATE_WINDOW_INDEX,
              },
              {
                invokeRpc:
                  input.invokeRpc,
              },
            );

          assert.equal(
            result.submittedRows,
            rows.length,
            "Keyword staging submitted row count mismatch.",
          );

          assert.equal(
            result.insertedRows,
            rows.length,
            "Keyword staging inserted row count mismatch.",
          );

          assert.equal(
            result.duplicateRows,
            0,
            "Keyword staging fixture must not return duplicate rows.",
          );

          assert.equal(
            result.firstRowIndex,
            absoluteRowStartIndex,
            "Keyword staging first row index mismatch.",
          );

          assert.equal(
            result.lastRowIndex,
            absoluteRowStartIndex +
              rows.length -
              1,
            "Keyword staging last row index mismatch.",
          );
        },
    });

  const collector =
    await collectNaverKeywordDailyStats({
      credentials,
      cursor:
        input.cursor,
      requestIntervalMs:
        0,
      keywordChunkSize:
        100,
      chunkPauseMs:
        0,
      maxRetryCount:
        3,
      maxKeywordStatsPerRun:
        input.maxKeywordStatsPerRun,
      maxStatsRequestsPerRun:
        20,
      maxKeywordDiscoveryPagesPerRun:
        20,
      dependencies:
        input.dependencies,

      onKeywordStats:
        async (
          item,
        ): Promise<void> => {
          const itemBefore =
            JSON.stringify(
              item,
            );

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

          assert.ok(
            rows.every(
              (
                row,
              ) =>
                row.row_level ===
                  "keyword" &&
                row.external_campaign_id ===
                  "cmp-web",
            ),
            "Only WEB_SITE keyword rows may enter the keyword staging phase.",
          );

          await batchBuffer.pushMany(
            rows,
          );

          canonicalRows.push(
            ...rows,
          );

          assert.equal(
            JSON.stringify(
              item,
            ),
            itemBefore,
            "Keyword phase mutated the collector item.",
          );
        },
    });

  await batchBuffer.flushRemaining();

  const bufferState =
    batchBuffer.getState();

  assert.equal(
    bufferState.pendingRowCount,
    0,
    "Keyword phase left pending canonical rows.",
  );

  assert.equal(
    bufferState.flushedRowCount,
    canonicalRows.length,
    "Keyword phase flushed row count mismatch.",
  );

  return {
    collector,
    rowStartIndex:
      input.rowStartIndex,
    nextRowIndex:
      input.rowStartIndex +
      canonicalRows.length,
    runCanonicalRowCount:
      canonicalRows.length,
    canonicalRows,
  };
}

function assertCursorContracts(input: {
  keywordCursor:
    NaverKeywordStatsCursor;
  authoritativeCursor:
    UnknownRecord;
}): void {
  const keywordCursor =
    input.keywordCursor as
      unknown as UnknownRecord;

  assert.ok(
    Object.prototype.hasOwnProperty.call(
      keywordCursor,
      "keywordChunkIndex",
    ),
    "Keyword cursor contract is missing keywordChunkIndex.",
  );

  assert.ok(
    !Object.prototype.hasOwnProperty.call(
      keywordCursor,
      "authoritativeGrain",
    ),
    "Keyword cursor must not contain authoritativeGrain.",
  );

  assert.ok(
    Object.prototype.hasOwnProperty.call(
      input.authoritativeCursor,
      "authoritativeGrain",
    ),
    "Authoritative cursor contract is missing authoritativeGrain.",
  );

  assert.ok(
    !Object.prototype.hasOwnProperty.call(
      input.authoritativeCursor,
      "keywordChunkIndex",
    ),
    "Authoritative cursor must not contain keywordChunkIndex.",
  );
}

async function main(): Promise<void> {
  const sourcePaths = [
    "src/lib/media-sync/naver-searchads-keyword-stats-collector.ts",
    "src/lib/media-sync/naver-searchads-staging-orchestrator.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter.ts",
    "src/lib/media-sync/naver-searchads-canonical-row.ts",
    "src/lib/media-sync/media-canonical-row-batch-buffer.ts",
    "src/lib/media-sync/media-sync-staging-row-identity.ts",
    "src/lib/media-sync/media-sync-staging-repository.ts",
  ] as const;

  const sourceBefore =
    await Promise.all(
      sourcePaths.map(
        (
          path,
        ) =>
          readFile(
            path,
            "utf8",
          ),
      ),
    );

  const fixtureBefore =
    JSON.stringify({
      job:
        JOB_FIXTURE,
      campaigns,
      webAdgroups,
      shoppingAdgroups,
      brandAdgroups,
      webKeywords,
      shoppingAds,
    });

  let currentPhase:
    CombinedPhase =
      "keyword:first";

  const capturedRpcCalls:
    CapturedRpcCall[] = [];

  const invokeRpc:
    MediaSyncStagingRepositoryRpcInvoker =
    async (
      functionName,
      args,
    ) => {
      assert.equal(
        functionName,
        "append_media_sync_staging_batch",
        "Unexpected staging RPC function name.",
      );

      const payload =
        requireRecord(
          args.p_payload,
          "RPC p_payload must be an object.",
        );

      const rows =
        requireRpcRows(
          payload,
        );

      const rowIndexes =
        rows.map(
          (
            row,
          ) => {
            assert.equal(
              typeof row.row_index,
              "number",
              "RPC row_index must be a number.",
            );

            return row.row_index as
              number;
          },
        );

      capturedRpcCalls.push({
        phase:
          currentPhase,
        functionName,
        payload,
      });

      return {
        data: [
          {
            submitted_rows:
              rows.length,
            inserted_rows:
              rows.length,
            duplicate_rows:
              0,
            first_row_index:
              rowIndexes[0] ??
              null,
            last_row_index:
              rowIndexes[
                rowIndexes.length -
                  1
              ] ??
              null,
          },
        ],
        error:
          null,
      };
    };

  let keywordNow =
    Date.parse(
      "2026-07-14T00:00:00.000Z",
    );

  const keywordDependencies:
    Partial<NaverKeywordStatsCollectorDependencies> = {
      fetchCampaignPage:
        async () =>
          page(
            campaigns,
          ),

      fetchAdgroupPage:
        async (
          input,
        ) =>
          page(
            getCampaignAdgroups(
              input.campaignId,
            ),
          ),

      fetchKeywordPage:
        async (
          input,
        ) =>
          page(
            input.adgroupId ===
              "grp-web"
              ? webKeywords
              : [],
          ),

      fetchKeywordDailyStats:
        async (
          input,
        ) =>
          keywordStats(
            input.keywordId,
          ),

      fetchStatReportKeywordDailyStats:
        async () => {
          throw new Error(
            "STAT_REPORT_UNAVAILABLE_FOR_VERIFICATION",
          );
        },

      sleep:
        async () =>
          undefined,

      now:
        () => {
          keywordNow +=
            1_000;

          return keywordNow;
        },

      random:
        () =>
          0,
    };

  const initialKeywordCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index:
          DATE_WINDOW_INDEX,
        dateFrom:
          DATE_FROM,
        dateTo:
          DATE_TO,
      },
    });

  currentPhase =
    "keyword:first";

  const keywordFirst =
    await runKeywordPhase({
      cursor:
        initialKeywordCursor,
      rowStartIndex:
        0,
      maxKeywordStatsPerRun:
        1,
      dependencies:
        keywordDependencies,
      invokeRpc,
    });

  assert.equal(
    keywordFirst.collector.status,
    "partial",
    "The first keyword phase must stop at the bounded limit.",
  );

  assert.equal(
    keywordFirst.collector.partialReason,
    "max_keyword_stats_per_run_reached",
  );

  assert.equal(
    keywordFirst.runCanonicalRowCount,
    2,
    "The first keyword phase must emit one keyword across two dates.",
  );

  assert.equal(
    keywordFirst.nextRowIndex,
    2,
  );

  const persistedKeywordCursor =
    normalizeNaverKeywordStatsCursor(
      JSON.parse(
        JSON.stringify(
          keywordFirst.collector.cursor,
        ),
      ),
    );

  currentPhase =
    "keyword:resume";

  const keywordSecond =
    await runKeywordPhase({
      cursor:
        persistedKeywordCursor,
      rowStartIndex:
        keywordFirst.nextRowIndex,
      maxKeywordStatsPerRun:
        20,
      dependencies:
        keywordDependencies,
      invokeRpc,
    });

  assert.equal(
    keywordSecond.collector.status,
    "completed",
    "The resumed keyword phase must complete.",
  );

  assert.equal(
    keywordSecond.collector.isComplete,
    true,
  );

  assert.equal(
    keywordSecond.runCanonicalRowCount,
    2,
    "The resumed keyword phase must emit the remaining keyword across two dates.",
  );

  assert.equal(
    keywordSecond.nextRowIndex,
    4,
    "The authoritative phase must start after all keyword staging rows.",
  );

  assert.equal(
    keywordSecond.collector.cursor.completedKeywordCount,
    2,
  );

  const keywordRows = [
    ...keywordFirst.canonicalRows,
    ...keywordSecond.canonicalRows,
  ];

  assert.equal(
    keywordRows.length,
    4,
  );

  assert.ok(
    keywordRows.every(
      (
        row,
      ) =>
        row.row_level ===
          "keyword" &&
        row.external_campaign_id ===
          "cmp-web",
    ),
    "Keyword phase contains a non-WEB_SITE campaign row.",
  );

  let authoritativeNow =
    Date.parse(
      "2026-07-14T01:00:00.000Z",
    );

  const authoritativeDependencies:
    Partial<NaverAuthoritativeEntityStatsCollectorDependencies> = {
      fetchCampaignPage:
        async () =>
          page(
            campaigns,
          ),

      fetchAdgroupPage:
        async (
          input,
        ) =>
          page(
            getCampaignAdgroups(
              input.campaignId,
            ),
          ),

      fetchAdPage:
        async (
          input,
        ) =>
          page(
            input.adgroupId ===
              "grp-shopping"
              ? shoppingAds
              : [],
          ),

      fetchEntityDailyStats:
        async (
          input,
        ) => {
          assert.ok(
            input.entityType ===
              "ad" ||
              input.entityType ===
                "adgroup",
            "Authoritative phase requested a non-authoritative entity type.",
          );

          return entityStats(
            input.entityId,
            input.entityType,
          );
        },

      fetchStatReportAdgroupDailyStats:
        async () => {
          throw new Error(
            "STAT_REPORT_UNAVAILABLE_FOR_VERIFICATION",
          );
        },

      sleep:
        async () =>
          undefined,

      now:
        () => {
          authoritativeNow +=
            1_000;

          return authoritativeNow;
        },

      random:
        () =>
          0,
    };

  currentPhase =
    "authoritative:first";

  const authoritativeFirst =
    await runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
      job:
        JOB_FIXTURE,
      credentials,
      rowStartIndex:
        keywordSecond.nextRowIndex,
      dateWindowIndex:
        DATE_WINDOW_INDEX,
      stagingBatchSize:
        AUTHORITATIVE_STAGING_BATCH_SIZE,
      requestIntervalMs:
        0,
      maxRetryCount:
        3,
      maxEntityStatsPerRun:
        2,
      maxStatsRequestsPerRun:
        20,
      maxDiscoveryPagesPerRun:
        20,
      collectorDependencies:
        authoritativeDependencies,
      stagingRepositoryDependencies: {
        invokeRpc,
      },
    });

  assert.equal(
    authoritativeFirst.status,
    "partial",
  );

  assert.equal(
    authoritativeFirst.rowStartIndex,
    4,
    "The authoritative phase did not start at the keyword phase boundary.",
  );

  assert.equal(
    authoritativeFirst.nextRowIndex,
    8,
  );

  assert.equal(
    authoritativeFirst.runCanonicalRowCount,
    4,
  );

  const persistedAuthoritativeCursor =
    JSON.parse(
      JSON.stringify(
        authoritativeFirst.collector.cursor,
      ),
    ) as UnknownRecord;

  currentPhase =
    "authoritative:resume";

  const authoritativeSecond =
    await runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
      job:
        JOB_FIXTURE,
      credentials,
      rowStartIndex:
        authoritativeFirst.nextRowIndex,
      dateWindowIndex:
        DATE_WINDOW_INDEX,
      cursor:
        authoritativeFirst.collector.cursor,
      stagingBatchSize:
        AUTHORITATIVE_STAGING_BATCH_SIZE,
      requestIntervalMs:
        0,
      maxRetryCount:
        3,
      maxEntityStatsPerRun:
        20,
      maxStatsRequestsPerRun:
        20,
      maxDiscoveryPagesPerRun:
        20,
      collectorDependencies:
        authoritativeDependencies,
      stagingRepositoryDependencies: {
        invokeRpc,
      },
    });

  assert.equal(
    authoritativeSecond.status,
    "completed",
  );

  assert.equal(
    authoritativeSecond.isComplete,
    true,
  );

  assert.equal(
    authoritativeSecond.rowStartIndex,
    8,
  );

  assert.equal(
    authoritativeSecond.nextRowIndex,
    14,
  );

  assert.equal(
    authoritativeSecond.runCanonicalRowCount,
    6,
  );

  assert.equal(
    authoritativeSecond.collector.cursor.completedEntityCount,
    5,
  );

  assertCursorContracts({
    keywordCursor:
      keywordSecond.collector.cursor,
    authoritativeCursor:
      persistedAuthoritativeCursor,
  });

  const rpcRows =
    flattenRpcRows(
      capturedRpcCalls,
    );

  assert.equal(
    rpcRows.length,
    14,
    "Combined staging row count mismatch.",
  );

  assert.deepEqual(
    rpcRows.map(
      (
        row,
      ) =>
        row.row_index,
    ),
    Array.from(
      {
        length:
          14,
      },
      (
        _,
        index,
      ) =>
        index,
    ),
    "Combined staging row indexes must be contiguous from 0 through 13.",
  );

  const canonicalRows =
    rpcRows.map(
      (
        row,
      ) =>
        requireRecord(
          row.row,
          "RPC canonical row must be an object.",
        ) as
          EtrylueNormalizedMediaRow,
    );

  assert.equal(
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "keyword",
    ).length,
    4,
  );

  assert.equal(
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "creative",
    ).length,
    6,
  );

  assert.equal(
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "mixed",
    ).length,
    4,
  );

  assert.deepEqual(
    canonicalRows.map(
      (
        row,
      ) =>
        row.row_level,
    ),
    [
      "keyword",
      "keyword",
      "keyword",
      "keyword",
      "creative",
      "creative",
      "creative",
      "creative",
      "creative",
      "creative",
      "mixed",
      "mixed",
      "mixed",
      "mixed",
    ],
    "Combined phase order must remain keyword then creative then mixed.",
  );

  const campaignGrains =
    new Map<
      string,
      Set<string>
    >();

  for (
    const row
    of canonicalRows
  ) {
    const campaignId =
      String(
        row.external_campaign_id ??
          "",
      );

    assert.notEqual(
      campaignId,
      "",
      "Combined canonical row is missing external_campaign_id.",
    );

    const grains =
      campaignGrains.get(
        campaignId,
      ) ??
      new Set<string>();

    grains.add(
      row.row_level,
    );

    campaignGrains.set(
      campaignId,
      grains,
    );
  }

  assert.deepEqual(
    Array.from(
      campaignGrains.get(
        "cmp-web",
      ) ??
      [],
    ),
    [
      "keyword",
    ],
  );

  assert.deepEqual(
    Array.from(
      campaignGrains.get(
        "cmp-shopping",
      ) ??
      [],
    ),
    [
      "creative",
    ],
  );

  assert.deepEqual(
    Array.from(
      campaignGrains.get(
        "cmp-brand",
      ) ??
      [],
    ),
    [
      "mixed",
    ],
  );

  assert.ok(
    Array.from(
      campaignGrains.values(),
    ).every(
      (
        grains,
      ) =>
        grains.size ===
        1,
    ),
    "A campaign emitted more than one authoritative grain.",
  );

  const rowKeys =
    rpcRows.map(
      (
        row,
      ) =>
        String(
          row.row_key,
        ),
    );

  assert.equal(
    new Set(
      rowKeys,
    ).size,
    rowKeys.length,
    "Combined staging contains duplicate or cross-grain-colliding row keys.",
  );

  assert.deepEqual(
    rowKeys,
    canonicalRows.map(
      (
        row,
      ) =>
        buildMediaSyncStagingRowKey(
          row,
        ),
    ),
    "Combined RPC row keys do not match the shared staging identity contract.",
  );

  for (
    const call
    of capturedRpcCalls
  ) {
    assert.deepEqual(
      {
        job_id:
          call.payload.job_id,
        report_id:
          call.payload.report_id,
        workspace_id:
          call.payload.workspace_id,
        advertiser_id:
          call.payload.advertiser_id,
        connection_id:
          call.payload.connection_id,
        provider:
          call.payload.provider,
        external_account_id:
          call.payload.external_account_id,
        date_from:
          call.payload.date_from,
        date_to:
          call.payload.date_to,
        date_window_index:
          call.payload.date_window_index,
      },
      {
        job_id:
          JOB_FIXTURE.id,
        report_id:
          JOB_FIXTURE.report_id,
        workspace_id:
          JOB_FIXTURE.workspace_id,
        advertiser_id:
          JOB_FIXTURE.advertiser_id,
        connection_id:
          JOB_FIXTURE.connection_id,
        provider:
          JOB_FIXTURE.provider,
        external_account_id:
          JOB_FIXTURE.external_account_id,
        date_from:
          JOB_FIXTURE.date_from,
        date_to:
          JOB_FIXTURE.date_to,
        date_window_index:
          DATE_WINDOW_INDEX,
      },
      `Combined staging RPC scope mismatch in phase ${call.phase}.`,
    );
  }

  const totals =
    canonicalRows.reduce(
      (
        result,
        row,
      ) => ({
        impressions:
          result.impressions +
          row.impressions,
        clicks:
          result.clicks +
          row.clicks,
        cost:
          result.cost +
          row.cost,
        conversions:
          result.conversions +
          row.conversions,
        revenue:
          result.revenue +
          row.revenue,
      }),
      {
        impressions:
          0,
        clicks:
          0,
        cost:
          0,
        conversions:
          0,
        revenue:
          0,
      },
    );

  assert.deepEqual(
    totals,
    {
      impressions:
        290,
      clicks:
        29,
      cost:
        2_900,
      conversions:
        11,
      revenue:
        5_700,
    },
  );

  assert.equal(
    JSON.stringify({
      job:
        JOB_FIXTURE,
      campaigns,
      webAdgroups,
      shoppingAdgroups,
      brandAdgroups,
      webKeywords,
      shoppingAds,
    }),
    fixtureBefore,
    "Combined orchestration fixture mutated source inputs.",
  );

  const sourceAfter =
    await Promise.all(
      sourcePaths.map(
        (
          path,
        ) =>
          readFile(
            path,
            "utf8",
          ),
      ),
    );

  assert.deepEqual(
    sourceAfter.map(
      hash,
    ),
    sourceBefore.map(
      hash,
    ),
    "Existing keyword or authoritative staging sources changed during verification.",
  );

  console.log(
    "verified combined WEB_SITE keyword then authoritative staging phase order: true",
  );

  console.log(
    "verified keyword partial/resume cursor contract: true",
  );

  console.log(
    "verified authoritative partial/resume cursor contract: true",
  );

  console.log(
    "verified keyword and authoritative cursors remain structurally separate: true",
  );

  console.log(
    "verified authoritative rowStartIndex begins at the keyword nextRowIndex: true",
  );

  console.log(
    "verified combined staging row indexes are contiguous from 0 through 13: true",
  );

  console.log(
    "verified WEB_SITE campaign emits keyword rows only: true",
  );

  console.log(
    "verified SHOPPING campaign emits creative rows only: true",
  );

  console.log(
    "verified BRAND_SEARCH campaign emits mixed rows only: true",
  );

  console.log(
    "verified exactly one authoritative grain per campaign: true",
  );

  console.log(
    "verified combined cross-grain duplicate staging row keys: 0",
  );

  console.log(
    "verified combined staging RPC scope and date-window payloads remain stable: true",
  );

  console.log(
    "verified combined canonical metric totals: 290 / 29 / 2900 / 11 / 5700",
  );

  console.log(
    "verified existing keyword collector and staging orchestrator source hashes unchanged: true",
  );

  console.log(
    "verified authoritative collector and staging orchestrator source hashes unchanged: true",
  );

  console.log(
    "fixture uses a keyword-only DI harness because the existing keyword staging orchestrator has no repository injection seam: true",
  );

  console.log(
    "fixture uses the production authoritative entity staging orchestrator: true",
  );

  console.log(
    "fixture uses injected Naver API dependencies: true",
  );

  console.log(
    "fixture uses injected Supabase RPC mock: true",
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
  );

  console.log(
    "fixture writes staging: false",
  );

  console.log(
    "fixture writes report_rows: false",
  );

  console.log(
    "fixture changes report pointers: false",
  );

  console.log(
    "verification passed: true",
  );
}

main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "Naver combined staging orchestration fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);

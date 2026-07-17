import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  buildMediaSyncStagingRowKey,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import {
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  runNaverSearchAdsAuthoritativeEntityStagingOrchestrator,
  NaverSearchAdsAuthoritativeEntityStagingOrchestratorError,
  type NaverSearchAdsAuthoritativeEntityStagingOrchestratorErrorCode,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator";
import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  NaverSearchAdsApiError,
  type NaverSearchAdsAdRecord,
  type NaverSearchAdsAdgroupRecord,
  type NaverSearchAdsCampaignRecord,
  type NaverSearchAdsEntityDailyStatsResult,
  type NaverSearchAdsListPage,
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

type CapturedRpcCall = {
  functionName:
    string;
  payload:
    UnknownRecord;
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

function stats(
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
  assert.ok(
    value !== null &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value,
      ),
    message,
  );

  return value as
    UnknownRecord;
}

function requireRpcRows(
  payload: UnknownRecord,
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

function expectOrchestratorError(
  expectedCode:
    NaverSearchAdsAuthoritativeEntityStagingOrchestratorErrorCode,
  callback:
    () => Promise<unknown>,
): Promise<void> {
  return callback()
    .then(
      () => {
        throw new Error(
          `Expected authoritative entity staging orchestrator error ${expectedCode}.`,
        );
      },
      (
        error:
          unknown,
      ) => {
        if (
          !(
            error instanceof
            NaverSearchAdsAuthoritativeEntityStagingOrchestratorError
          )
        ) {
          throw new Error(
            "Expected NaverSearchAdsAuthoritativeEntityStagingOrchestratorError.",
          );
        }

        assert.equal(
          error.code,
          expectedCode,
          "Unexpected authoritative entity staging orchestrator error code.",
        );
      },
    );
}

async function main(): Promise<void> {
  const sourcePaths = [
    "src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-canonical-adapter.ts",
    "src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator.ts",
    "src/lib/media-sync/naver-searchads-canonical-row.ts",
    "src/lib/media-sync/media-canonical-row-batch-buffer.ts",
    "src/lib/media-sync/media-sync-staging-row-identity.ts",
    "src/lib/media-sync/media-sync-staging-repository.ts",
    "src/lib/media-sync/naver-searchads-keyword-stats-collector.ts",
    "src/lib/media-sync/naver-searchads-staging-orchestrator.ts",
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
      credentials,
      campaigns,
      shoppingAdgroups,
      brandAdgroups,
      shoppingAds,
    });

  let now =
    Date.parse(
      "2026-07-14T00:00:00.000Z",
    );

  const attempts =
    new Map<
      string,
      number
    >();

  const retryEvents:
    string[] = [];

  const progressStages:
    string[] = [];

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

  const collectorDependencies = {
    fetchCampaignPage:
      async () =>
        page(
          campaigns,
        ),

    fetchAdgroupPage:
      async (
        input: {
          campaignId:
            string;
        },
      ) =>
        page(
          input.campaignId ===
            "cmp-shopping"
            ? shoppingAdgroups
            : input.campaignId ===
                "cmp-brand"
              ? brandAdgroups
              : [],
        ),

    fetchAdPage:
      async (
        input: {
          adgroupId:
            string;
        },
      ) =>
        page(
          input.adgroupId ===
            "grp-shopping"
            ? shoppingAds
            : [],
        ),

    fetchEntityDailyStats:
      async (
        input: {
          entityId:
            string;
          entityType:
            "campaign"
            | "adgroup"
            | "keyword"
            | "ad";
        },
      ) => {
        const attempt =
          (
            attempts.get(
              input.entityId,
            ) ?? 0
          ) + 1;

        attempts.set(
          input.entityId,
          attempt,
        );

        if (
          input.entityId ===
            "grp-brand-1" &&
          attempt === 1
        ) {
          throw new NaverSearchAdsApiError(
            "HTTP_ERROR",
            "Fixture rate limit.",
            {
              status:
                429,
            },
          );
        }

        if (
          input.entityType !==
            "ad" &&
          input.entityType !==
            "adgroup"
        ) {
          throw new Error(
            "Collector requested a non-authoritative entity type.",
          );
        }

        return stats(
          input.entityId,
          input.entityType,
        );
      },

    sleep:
      async () =>
        undefined,

    now:
      () => {
        now +=
          1_000;

        return now;
      },

    random:
      () =>
        0,
  };

  let validationApiCallCount =
    0;

  const validationCollectorDependencies = {
    ...collectorDependencies,

    fetchCampaignPage:
      async () => {
        validationApiCallCount +=
          1;

        return page(
          campaigns,
        );
      },
  };

  await expectOrchestratorError(
    "CREDENTIAL_SCOPE_MISMATCH",
    () =>
      runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
        job:
          JOB_FIXTURE,
        credentials: {
          ...credentials,
          customerId:
            "different-customer",
        },
        rowStartIndex:
          0,
        collectorDependencies:
          validationCollectorDependencies,
        stagingRepositoryDependencies: {
          invokeRpc,
        },
      }),
  );

  await expectOrchestratorError(
    "JOB_NOT_PROCESSING",
    () =>
      runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
        job: {
          ...JOB_FIXTURE,
          status:
            "pending",
        },
        credentials,
        rowStartIndex:
          0,
        collectorDependencies:
          validationCollectorDependencies,
        stagingRepositoryDependencies: {
          invokeRpc,
        },
      }),
  );

  const mismatchedCursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index:
          DATE_WINDOW_INDEX,
        dateFrom:
          "2026-04-30",
        dateTo:
          DATE_TO,
      },
    });

  await expectOrchestratorError(
    "CURSOR_SCOPE_MISMATCH",
    () =>
      runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
        job:
          JOB_FIXTURE,
        credentials,
        rowStartIndex:
          0,
        cursor:
          mismatchedCursor,
        collectorDependencies:
          validationCollectorDependencies,
        stagingRepositoryDependencies: {
          invokeRpc,
        },
      }),
  );

  assert.equal(
    validationApiCallCount,
    0,
    "Invalid orchestrator inputs reached the Naver collector dependencies.",
  );

  assert.equal(
    capturedRpcCalls.length,
    0,
    "Invalid orchestrator inputs reached the staging RPC mock.",
  );

  const first =
    await runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
      job:
        JOB_FIXTURE,
      credentials,
      rowStartIndex:
        0,
      dateWindowIndex:
        DATE_WINDOW_INDEX,
      stagingBatchSize:
        3,
      requestIntervalMs:
        0,
      maxEntityStatsPerRun:
        2,
      maxStatsRequestsPerRun:
        20,
      maxDiscoveryPagesPerRun:
        20,
      collectorDependencies,
      stagingRepositoryDependencies: {
        invokeRpc,
      },
      onRetry:
        (
          event,
        ) => {
          retryEvents.push(
            [
              event.operation,
              event.entityId,
              event.category,
            ].join(
              ":",
            ),
          );
        },
      onCollectorProgress:
        (
          event,
        ) => {
          progressStages.push(
            event.stage,
          );
        },
    });

  assert.equal(
    first.status,
    "partial",
  );

  assert.equal(
    first.isComplete,
    false,
  );

  assert.equal(
    first.collector.partialReason,
    "max_entity_stats_per_run_reached",
  );

  assert.equal(
    first.callbackCount,
    2,
  );

  assert.equal(
    first.runCanonicalRowCount,
    4,
  );

  assert.equal(
    first.rowStartIndex,
    0,
  );

  assert.equal(
    first.nextRowIndex,
    4,
  );

  assert.deepEqual(
    first.append,
    {
      flushCount:
        2,
      submittedRows:
        4,
      insertedRows:
        4,
      duplicateRows:
        0,
      maximumBatchSize:
        3,
      firstRowIndex:
        0,
      lastRowIndex:
        3,
    },
  );

  assert.equal(
    first.buffer.acceptedRowCount,
    4,
  );

  assert.equal(
    first.buffer.flushedRowCount,
    4,
  );

  assert.equal(
    first.buffer.pendingRowCount,
    0,
  );

  assert.deepEqual(
    flattenRpcRows(
      capturedRpcCalls,
    ).map(
      (
        row,
      ) =>
        row.row_index,
    ),
    [
      0,
      1,
      2,
      3,
    ],
  );

  const secondCallStart =
    capturedRpcCalls.length;

  const second =
    await runNaverSearchAdsAuthoritativeEntityStagingOrchestrator({
      job:
        JOB_FIXTURE,
      credentials,
      rowStartIndex:
        first.nextRowIndex,
      dateWindowIndex:
        DATE_WINDOW_INDEX,
      cursor:
        first.collector.cursor,
      stagingBatchSize:
        4,
      requestIntervalMs:
        0,
      maxEntityStatsPerRun:
        20,
      maxStatsRequestsPerRun:
        20,
      maxDiscoveryPagesPerRun:
        20,
      collectorDependencies,
      stagingRepositoryDependencies: {
        invokeRpc,
      },
      onRetry:
        (
          event,
        ) => {
          retryEvents.push(
            [
              event.operation,
              event.entityId,
              event.category,
            ].join(
              ":",
            ),
          );
        },
      onCollectorProgress:
        (
          event,
        ) => {
          progressStages.push(
            event.stage,
          );
        },
    });

  assert.equal(
    second.status,
    "completed",
  );

  assert.equal(
    second.isComplete,
    true,
  );

  assert.equal(
    second.collector.partialReason,
    null,
  );

  assert.equal(
    second.callbackCount,
    3,
  );

  assert.equal(
    second.runCanonicalRowCount,
    6,
  );

  assert.equal(
    second.rowStartIndex,
    4,
  );

  assert.equal(
    second.nextRowIndex,
    10,
  );

  assert.deepEqual(
    second.append,
    {
      flushCount:
        2,
      submittedRows:
        6,
      insertedRows:
        6,
      duplicateRows:
        0,
      maximumBatchSize:
        4,
      firstRowIndex:
        4,
      lastRowIndex:
        9,
    },
  );

  assert.equal(
    second.buffer.acceptedRowCount,
    6,
  );

  assert.equal(
    second.buffer.flushedRowCount,
    6,
  );

  assert.equal(
    second.buffer.pendingRowCount,
    0,
  );

  assert.deepEqual(
    flattenRpcRows(
      capturedRpcCalls.slice(
        secondCallStart,
      ),
    ).map(
      (
        row,
      ) =>
        row.row_index,
    ),
    [
      4,
      5,
      6,
      7,
      8,
      9,
    ],
  );

  assert.ok(
    progressStages.includes(
      "campaign:skipped_keyword_collector",
    ),
    "WEB_SITE campaign was not left to the keyword collector.",
  );

  assert.ok(
    retryEvents.includes(
      "entity_stats:grp-brand-1:rate_limit",
    ),
    "Expected BRAND_SEARCH 429 retry event is missing.",
  );

  assert.equal(
    attempts.get(
      "grp-brand-1",
    ),
    2,
    "BRAND_SEARCH API retry count mismatch.",
  );

  const allRpcRows =
    flattenRpcRows(
      capturedRpcCalls,
    );

  assert.equal(
    allRpcRows.length,
    10,
  );

  assert.deepEqual(
    allRpcRows.map(
      (
        row,
      ) =>
        row.row_index,
    ),
    [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
    ],
    "Authoritative staging row indexes must remain contiguous across resume.",
  );

  const canonicalRows =
    allRpcRows.map(
      (
        row,
      ) =>
        requireRecord(
          row.row,
          "RPC canonical row must be an object.",
        ) as
          EtrylueNormalizedMediaRow,
    );

  assert.deepEqual(
    allRpcRows.map(
      (
        row,
      ) =>
        row.row_key,
    ),
    canonicalRows.map(
      (
        row,
      ) =>
        buildMediaSyncStagingRowKey(
          row,
        ),
    ),
    "Staging RPC row keys do not match the shared identity contract.",
  );

  assert.equal(
    new Set(
      allRpcRows.map(
        (
          row,
        ) =>
          String(
            row.row_key,
          ),
      ),
    ).size,
    10,
    "Authoritative staging row keys contain duplicates.",
  );

  const creativeRows =
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "creative",
    );

  const mixedRows =
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "mixed",
    );

  assert.equal(
    creativeRows.length,
    6,
  );

  assert.equal(
    mixedRows.length,
    4,
  );

  assert.equal(
    canonicalRows.filter(
      (
        row,
      ) =>
        row.row_level ===
        "keyword",
    ).length,
    0,
    "Authoritative entity orchestrator emitted keyword rows.",
  );

  assert.ok(
    creativeRows.every(
      (
        row,
      ) =>
        row.data_level ===
          "creative" &&
        row.row_level_reason ===
          "naver_searchad_shopping_ad_daily_stats" &&
        String(
          row[
            "external_creative_id"
          ] ?? "",
        ).length >
          0 &&
        row.external_keyword_id ===
          undefined &&
        row.provider_meta?.[
          "authoritative_grain"
        ] ===
          "ad",
    ),
    "SHOPPING staging payload contract mismatch.",
  );

  assert.ok(
    mixedRows.every(
      (
        row,
      ) =>
        row.data_level ===
          "mixed" &&
        row.row_level_reason ===
          "naver_searchad_brand_search_adgroup_daily_stats" &&
        typeof row.external_group_id ===
          "string" &&
        row.external_group_id.length >
          0 &&
        row.external_keyword_id ===
          undefined &&
        row[
          "external_creative_id"
        ] ===
          undefined &&
        row.provider_meta?.[
          "authoritative_grain"
        ] ===
          "adgroup",
    ),
    "BRAND_SEARCH staging payload contract mismatch.",
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
      "Staging RPC scope changed between authoritative batches.",
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
        150,
      clicks:
        15,
      cost:
        1_500,
      conversions:
        5,
      revenue:
        2_500,
    },
  );

  assert.equal(
    JSON.stringify({
      job:
        JOB_FIXTURE,
      credentials,
      campaigns,
      shoppingAdgroups,
      brandAdgroups,
      shoppingAds,
    }),
    fixtureBefore,
    "Authoritative entity staging orchestrator mutated source inputs.",
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
    "Collector, adapter, orchestrator, canonical, batch buffer, identity, repository, or keyword sources changed during verification.",
  );

  console.log(
    "verified authoritative entity staging orchestrator collector-to-adapter-to-repository contract: true",
  );

  console.log(
    "verified SHOPPING rows are buffered and appended as creative staging payloads: true",
  );

  console.log(
    "verified BRAND_SEARCH rows are buffered and appended as mixed staging payloads: true",
  );

  console.log(
    "verified WEB_SITE remains owned by the existing keyword staging path: true",
  );

  console.log(
    "verified partial result flushes all accepted canonical rows: true",
  );

  console.log(
    "verified explicit cursor and nextRowIndex resume contract: true",
  );

  console.log(
    "verified staging row indexes remain contiguous across partial resume: true",
  );

  console.log(
    "verified configurable staging batch boundaries: true",
  );

  console.log(
    "verified partial/resume produces no duplicate authoritative staging row keys: true",
  );

  console.log(
    "verified 429 retry contributes one canonical row set without duplication: true",
  );

  console.log(
    "verified one authoritative grain per campaign in staging payloads: true",
  );

  console.log(
    "verified cross-grain duplicate staging row keys: 0",
  );

  console.log(
    "verified invalid job credential and cursor scopes fail before API or RPC: true",
  );

  console.log(
    "verified staging RPC scope and date-window payloads remain stable: true",
  );

  console.log(
    "verified canonical metric totals: 150 / 15 / 1500 / 5 / 2500",
  );

  console.log(
    "verified existing keyword collector and staging orchestrator source hashes unchanged: true",
  );

  console.log(
    "verified collector, adapter, orchestrator, canonical, batch, identity, repository, and inputs unchanged: true",
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
      "Naver authoritative entity staging orchestrator fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);

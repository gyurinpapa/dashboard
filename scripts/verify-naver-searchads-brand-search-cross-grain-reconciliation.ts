import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  createNaverAuthoritativeEntityStatsCursor,
} from "../src/lib/media-sync/naver-searchads-authoritative-entity-stats-state";
import {
  createNaverKeywordStatsCursor,
} from "../src/lib/media-sync/naver-searchads-keyword-stats-state";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE_FROM =
  "2026-05-01";

const DATE_TO =
  "2026-05-02";

const SOURCE_ROWS =
  45_844;

const EXCLUDED_ROWS =
  1_204;

const RETAINED_ROWS =
  44_640;

const EXCLUDED_IMPRESSIONS =
  2_632;

const EXCLUDED_CLICKS =
  1_092;

const EXCLUDED_COST =
  0;

const EXCLUDED_CONVERSIONS =
  65;

const EXCLUDED_REVENUE =
  7_639_300;

const RETAINED_IMPRESSIONS =
  7_075;

const RETAINED_CLICKS =
  1_183;

const RETAINED_COST =
  113_850;

const RETAINED_CONVERSIONS =
  67;

const RETAINED_REVENUE =
  12_729_300;

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";

const ADVERTISER_ID =
  "33333333-3333-4333-8333-333333333333";

const REPORT_ID =
  "44444444-4444-4444-8444-444444444444";

const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";

const CREATED_BY =
  "66666666-6666-4666-8666-666666666666";

const PREVIOUS_INGESTION_ID =
  "77777777-7777-4777-8777-777777777777";

const EXTERNAL_ACCOUNT_ID =
  "123456";

const RECONCILIATION_KIND =
  "brand_search_cross_grain_dedup_v1" as const;

const RECONCILIATION_VERSION =
  1 as const;

type UnknownRecord =
  Record<string, unknown>;

type MetricRow = {
  id: number;
  rowIndex: number;
  rowKey: string;
  fingerprint: string;
  campaignId: string;
  campaignType: string;
  rowLevel: string;
  dataLevel: string;
  reason: string;
  authoritativeGrain: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

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

function clone<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T;
}

function requireRecord(
  value: unknown,
  message: string,
): UnknownRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      message,
    );
  }

  return value as
    UnknownRecord;
}

function createCheckpointErrorDetail(input: {
  rows: number;
  reconciliation?: UnknownRecord;
}): UnknownRecord {
  const keywordCursor =
    createNaverKeywordStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          DATE_FROM,
        dateTo:
          DATE_TO,
      },
    });

  const authoritativeCursor =
    createNaverAuthoritativeEntityStatsCursor({
      dateWindow: {
        index:
          0,
        dateFrom:
          DATE_FROM,
        dateTo:
          DATE_TO,
      },
    });

  const processingCheckpoint:
    UnknownRecord = {
      version:
        1,
      saved_at:
        "2026-07-30T00:00:00.000Z",
      raw_rows:
        input.rows,
      normalized_rows:
        input.rows,
      inserted_rows:
        input.rows,
      failed_rows:
        0,
      collector: {
        discovered_keywords:
          22_257,
        completed_keywords:
          22_257,
        stats_requests_attempted:
          22_922,
        stats_requests_succeeded:
          22_922,
        retry_count:
          0,
        date_window_index:
          0,
        cursor:
          keywordCursor,
        combined_version:
          1,
        phase:
          "completed",
        next_row_index:
          input.rows,
        keyword: {
          complete:
            true,
          cursor:
            keywordCursor,
          counts: {
            discovered:
              22_257,
            completed:
              22_257,
            statsRequestsAttempted:
              22_257,
            statsRequestsSucceeded:
              22_257,
            retryCount:
              0,
          },
        },
        authoritative: {
          complete:
            true,
          cursor:
            authoritativeCursor,
          counts: {
            discovered:
              665,
            completed:
              665,
            statsRequestsAttempted:
              665,
            statsRequestsSucceeded:
              665,
            retryCount:
              0,
          },
        },
      },
    };

  if (input.reconciliation) {
    processingCheckpoint.reconciliation =
      input.reconciliation;
  }

  return {
    processing_checkpoint:
      processingCheckpoint,
  };
}

function createJob(input: {
  rows: number;
  updatedAt: string;
  reconciliation?: UnknownRecord;
}): MediaSyncJobRecord {
  return {
    id:
      JOB_ID,
    workspace_id:
      WORKSPACE_ID,
    advertiser_id:
      ADVERTISER_ID,
    report_id:
      REPORT_ID,
    connection_id:
      CONNECTION_ID,

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
      input.rows,
    normalized_rows:
      input.rows,
    inserted_rows:
      input.rows,
    failed_rows:
      0,

    previous_ingestion_id:
      PREVIOUS_INGESTION_ID,
    snapshot_ingestion_id:
      null,

    attempt_count:
      459,
    error:
      null,
    error_detail:
      createCheckpointErrorDetail({
        rows:
          input.rows,
        reconciliation:
          input.reconciliation,
      }) as never,

    created_by:
      CREATED_BY,
    created_at:
      "2026-07-29T00:00:00.000Z",
    started_at:
      "2026-07-29T00:00:01.000Z",
    finished_at:
      null,
    updated_at:
      input.updatedAt,
  };
}

function createReconciliationMetadata(input: {
  sourceRows: number;
  excludedRows: number;
  retainedRows: number;
  mixedCampaignCount: number;
  matchedCampaignCount: number;
  excludedImpressions: number;
  excludedClicks: number;
  excludedCost: number;
  excludedConversions: number;
  excludedRevenue: number;
}): UnknownRecord {
  return {
    kind:
      RECONCILIATION_KIND,
    version:
      RECONCILIATION_VERSION,
    source_rows:
      input.sourceRows,
    excluded_rows:
      input.excludedRows,
    retained_rows:
      input.retainedRows,
    mixed_campaign_count:
      input.mixedCampaignCount,
    matched_campaign_count:
      input.matchedCampaignCount,
    excluded_impressions:
      input.excludedImpressions,
    excluded_clicks:
      input.excludedClicks,
    excluded_cost:
      input.excludedCost,
    excluded_conversions:
      input.excludedConversions,
    excluded_revenue:
      input.excludedRevenue,
    applied_at:
      "2026-07-30T00:10:00.000Z",
  };
}

function createRpcRow(input: {
  job: MediaSyncJobRecord;
  changed: boolean;
  alreadyReconciled: boolean;
  sourceRows: number;
  excludedRows: number;
  retainedRows: number;
  mixedCampaignCount: number;
  matchedCampaignCount: number;
  excludedImpressions: number;
  excludedClicks: number;
  excludedCost: number;
  excludedConversions: number;
  excludedRevenue: number;
}) {
  return {
    job:
      input.job,
    reconciliation_kind:
      RECONCILIATION_KIND,
    reconciliation_version:
      RECONCILIATION_VERSION,
    changed:
      input.changed,
    already_reconciled:
      input.alreadyReconciled,
    source_rows:
      input.sourceRows,
    excluded_rows:
      input.excludedRows,
    retained_rows:
      input.retainedRows,
    mixed_campaign_count:
      input.mixedCampaignCount,
    matched_campaign_count:
      input.matchedCampaignCount,
    remaining_overlap_rows:
      0,
    excluded_impressions:
      input.excludedImpressions,
    excluded_clicks:
      input.excludedClicks,
    excluded_cost:
      input.excludedCost,
    excluded_conversions:
      input.excludedConversions,
    excluded_revenue:
      input.excludedRevenue,
  };
}

function metricRow(input: {
  id: number;
  campaignId: string;
  campaignType: string;
  rowLevel: string;
  dataLevel: string;
  reason: string;
  authoritativeGrain?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  revenue?: number;
}): MetricRow {
  const identity = {
    id:
      input.id,
    campaignId:
      input.campaignId,
    campaignType:
      input.campaignType,
    rowLevel:
      input.rowLevel,
    dataLevel:
      input.dataLevel,
    reason:
      input.reason,
    authoritativeGrain:
      input.authoritativeGrain ?? "",
  };

  return {
    id:
      input.id,
    rowIndex:
      input.id,
    rowKey:
      `row-${input.id}`,
    fingerprint:
      hash(
        JSON.stringify(identity),
      ),
    campaignId:
      input.campaignId,
    campaignType:
      input.campaignType,
    rowLevel:
      input.rowLevel,
    dataLevel:
      input.dataLevel,
    reason:
      input.reason,
    authoritativeGrain:
      input.authoritativeGrain ?? "",
    impressions:
      input.impressions ?? 0,
    clicks:
      input.clicks ?? 0,
    cost:
      input.cost ?? 0,
    conversions:
      input.conversions ?? 0,
    revenue:
      input.revenue ?? 0,
  };
}

function createProductionShapeRows(): MetricRow[] {
  const rows:
    MetricRow[] = [];

  const addRows = (
    count: number,
    factory: (
      index: number,
      id: number,
    ) => MetricRow,
  ) => {
    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const id =
        rows.length;

      rows.push(
        factory(
          index,
          id,
        ),
      );
    }
  };

  addRows(
    756,
    (
      index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          "brand-snowline",
        campaignType:
          "BRAND_SEARCH",
        rowLevel:
          "keyword",
        dataLevel:
          "keyword",
        reason:
          "naver_searchad_registered_keyword_daily_stats",
        impressions:
          index === 0
            ? EXCLUDED_IMPRESSIONS
            : 0,
        clicks:
          index === 0
            ? EXCLUDED_CLICKS
            : 0,
        cost:
          0,
        conversions:
          index === 0
            ? EXCLUDED_CONVERSIONS
            : 0,
        revenue:
          index === 0
            ? EXCLUDED_REVENUE
            : 0,
      }),
  );

  addRows(
    230,
    (
      _index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          "brand-2021",
        campaignType:
          "BRAND_SEARCH",
        rowLevel:
          "keyword",
        dataLevel:
          "keyword",
        reason:
          "naver_searchad_registered_keyword_daily_stats",
      }),
  );

  addRows(
    218,
    (
      _index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          "brand-fanbella",
        campaignType:
          "BRAND_SEARCH",
        rowLevel:
          "keyword",
        dataLevel:
          "keyword",
        reason:
          "naver_searchad_registered_keyword_daily_stats",
      }),
  );

  const mixedCampaigns = [
    "brand-snowline",
    "brand-2021",
    "brand-fanbella",
    "brand-mixed-only-a",
    "brand-mixed-only-b",
  ] as const;

  addRows(
    50,
    (
      index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          mixedCampaigns[
            index %
            mixedCampaigns.length
          ],
        campaignType:
          "BRAND_SEARCH",
        rowLevel:
          "mixed",
        dataLevel:
          "mixed",
        reason:
          "naver_searchad_brand_search_adgroup_daily_stats",
        authoritativeGrain:
          "adgroup",
        impressions:
          index === 0
            ? 2_742
            : 0,
        clicks:
          index === 0
            ? 1_098
            : 0,
        conversions:
          index === 0
            ? 65
            : 0,
        revenue:
          index === 0
            ? 7_639_300
            : 0,
      }),
  );

  addRows(
    46,
    (
      index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          "shopping-mo",
        campaignType:
          "SHOPPING",
        rowLevel:
          "creative",
        dataLevel:
          "creative",
        reason:
          "naver_searchad_shopping_ad_daily_stats",
        authoritativeGrain:
          "ad",
        impressions:
          index === 0
            ? 3_257
            : 0,
        clicks:
          index === 0
            ? 83
            : 0,
        cost:
          index === 0
            ? 109_901
            : 0,
        conversions:
          index === 0
            ? 2
            : 0,
        revenue:
          index === 0
            ? 5_090_000
            : 0,
      }),
  );

  addRows(
    46,
    (
      index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          "shopping-pc",
        campaignType:
          "SHOPPING",
        rowLevel:
          "creative",
        dataLevel:
          "creative",
        reason:
          "naver_searchad_shopping_ad_daily_stats",
        authoritativeGrain:
          "ad",
        impressions:
          index === 0
            ? 1_076
            : 0,
        clicks:
          index === 0
            ? 2
            : 0,
        cost:
          index === 0
            ? 3_949
            : 0,
      }),
  );

  const retainedSoFar =
    rows.length -
    EXCLUDED_ROWS;

  const fillerRows =
    RETAINED_ROWS -
    retainedSoFar;

  assert.ok(
    fillerRows >= 0,
  );

  addRows(
    fillerRows,
    (
      _index,
      id,
    ) =>
      metricRow({
        id,
        campaignId:
          "website-filler",
        campaignType:
          "WEB_SITE",
        rowLevel:
          "keyword",
        dataLevel:
          "keyword",
        reason:
          "naver_searchad_registered_keyword_daily_stats",
      }),
  );

  assert.equal(
    rows.length,
    SOURCE_ROWS,
  );

  return rows;
}

function sumMetrics(
  rows: readonly MetricRow[],
) {
  return rows.reduce(
    (
      total,
      row,
    ) => ({
      impressions:
        total.impressions +
        row.impressions,
      clicks:
        total.clicks +
        row.clicks,
      cost:
        total.cost +
        row.cost,
      conversions:
        total.conversions +
        row.conversions,
      revenue:
        total.revenue +
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
}

function reconcileRows(
  inputRows: readonly MetricRow[],
) {
  const mixedCampaigns =
    new Set(
      inputRows
        .filter(
          (
            row,
          ) =>
            row.rowLevel === "mixed" &&
            row.dataLevel === "mixed" &&
            row.reason ===
              "naver_searchad_brand_search_adgroup_daily_stats" &&
            row.campaignType ===
              "BRAND_SEARCH" &&
            row.authoritativeGrain ===
              "adgroup" &&
            row.campaignId.length > 0,
        )
        .map(
          (
            row,
          ) =>
            row.campaignId,
        ),
    );

  const excluded =
    inputRows.filter(
      (
        row,
      ) =>
        row.rowLevel === "keyword" &&
        row.dataLevel === "keyword" &&
        row.reason ===
          "naver_searchad_registered_keyword_daily_stats" &&
        row.campaignType ===
          "BRAND_SEARCH" &&
        mixedCampaigns.has(
          row.campaignId,
        ),
    );

  const excludedIds =
    new Set(
      excluded.map(
        (
          row,
        ) =>
          row.id,
      ),
    );

  const retained =
    inputRows
      .filter(
        (
          row,
        ) =>
          !excludedIds.has(
            row.id,
          ),
      )
      .map(
        (
          row,
          rowIndex,
        ) => ({
          ...row,
          rowIndex,
        }),
      );

  return {
    mixedCampaigns,
    matchedCampaigns:
      new Set(
        excluded.map(
          (
            row,
          ) =>
            row.campaignId,
        ),
      ),
    excluded,
    retained,
  };
}

function stripSqlComments(
  sql: string,
): string {
  return sql
    .replace(
      /\/\*[\s\S]*?\*\//g,
      " ",
    )
    .replace(
      /--.*$/gm,
      " ",
    );
}

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "fixture-service-role-key";

  const {
    reconcileNaverSearchAdsBrandSearchCrossGrainStaging,
  } =
    await import(
      "../src/lib/media-sync/naver-searchads-brand-search-cross-grain-reconciliation-repository"
    );

  const sourcePaths = [
    "src/lib/media-sync/naver-searchads-brand-search-cross-grain-reconciliation-repository.ts",
    "src/lib/media-sync/media-sync-worker-orchestration-repository.ts",
    "scripts/sql/create-reconcile-naver-searchads-brand-search-cross-grain-staging.sql",
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

  const productionRows =
    createProductionShapeRows();

  const firstPass =
    reconcileRows(
      productionRows,
    );

  assert.equal(
    firstPass.mixedCampaigns.size,
    5,
  );

  assert.equal(
    firstPass.matchedCampaigns.size,
    3,
  );

  assert.equal(
    firstPass.excluded.length,
    EXCLUDED_ROWS,
  );

  assert.equal(
    firstPass.retained.length,
    RETAINED_ROWS,
  );

  assert.deepEqual(
    sumMetrics(
      firstPass.excluded,
    ),
    {
      impressions:
        EXCLUDED_IMPRESSIONS,
      clicks:
        EXCLUDED_CLICKS,
      cost:
        EXCLUDED_COST,
      conversions:
        EXCLUDED_CONVERSIONS,
      revenue:
        EXCLUDED_REVENUE,
    },
  );

  assert.deepEqual(
    sumMetrics(
      firstPass.retained,
    ),
    {
      impressions:
        RETAINED_IMPRESSIONS,
      clicks:
        RETAINED_CLICKS,
      cost:
        RETAINED_COST,
      conversions:
        RETAINED_CONVERSIONS,
      revenue:
        RETAINED_REVENUE,
    },
  );

  assert.ok(
    firstPass.retained.every(
      (
        row,
        index,
      ) =>
        row.rowIndex === index,
    ),
    "Retained row indexes are not compact and continuous.",
  );

  const originalById =
    new Map(
      productionRows.map(
        (
          row,
        ) => [
          row.id,
          row,
        ],
      ),
    );

  assert.ok(
    firstPass.retained.every(
      (
        row,
      ) => {
        const original =
          originalById.get(
            row.id,
          );

        return Boolean(
          original &&
          original.rowKey === row.rowKey &&
          original.fingerprint === row.fingerprint,
        );
      },
    ),
    "Reconciliation changed retained row identity.",
  );

  const secondPass =
    reconcileRows(
      firstPass.retained,
    );

  assert.equal(
    secondPass.excluded.length,
    0,
    "Second reconciliation was not idempotent.",
  );

  assert.equal(
    secondPass.retained.length,
    RETAINED_ROWS,
  );

  const noOverlapRows = [
    metricRow({
      id:
        0,
      campaignId:
        "website-only",
      campaignType:
        "WEB_SITE",
      rowLevel:
        "keyword",
      dataLevel:
        "keyword",
      reason:
        "naver_searchad_registered_keyword_daily_stats",
      impressions:
        10,
      clicks:
        1,
    }),
  ];

  const noOverlapResult =
    reconcileRows(
      noOverlapRows,
    );

  assert.equal(
    noOverlapResult.excluded.length,
    0,
  );

  assert.deepEqual(
    sumMetrics(
      noOverlapResult.retained,
    ),
    sumMetrics(
      noOverlapRows,
    ),
  );

  const reconciliationMetadata =
    createReconciliationMetadata({
      sourceRows:
        SOURCE_ROWS,
      excludedRows:
        EXCLUDED_ROWS,
      retainedRows:
        RETAINED_ROWS,
      mixedCampaignCount:
        5,
      matchedCampaignCount:
        3,
      excludedImpressions:
        EXCLUDED_IMPRESSIONS,
      excludedClicks:
        EXCLUDED_CLICKS,
      excludedCost:
        EXCLUDED_COST,
      excludedConversions:
        EXCLUDED_CONVERSIONS,
      excludedRevenue:
        EXCLUDED_REVENUE,
    });

  const rawJob =
    createJob({
      rows:
        SOURCE_ROWS,
      updatedAt:
        "2026-07-30T00:00:00.000Z",
    });

  const retainedBoundaryResumeJob =
    createJob({
      rows:
        RETAINED_ROWS,
      updatedAt:
        "2026-07-30T00:09:00.000Z",
    });

  const reconciledJob =
    createJob({
      rows:
        RETAINED_ROWS,
      updatedAt:
        "2026-07-30T00:10:00.000Z",
      reconciliation:
        reconciliationMetadata,
    });

  let firstRpcCalls =
    0;

  const repositoryResult =
    await reconcileNaverSearchAdsBrandSearchCrossGrainStaging(
      {
        job:
          rawJob,
        expectedRows:
          SOURCE_ROWS,
      },
      {
        invokeRpc:
          async (
            functionName: string,
            args: {
              p_payload: unknown;
            },
          ) => {
            firstRpcCalls +=
              1;

            assert.equal(
              functionName,
              "reconcile_naver_searchads_brand_search_cross_grain_staging",
            );

            const payload =
              requireRecord(
                args.p_payload,
                "Reconciliation payload must be an object.",
              );

            assert.equal(
              payload.job_id,
              JOB_ID,
            );

            assert.equal(
              payload.report_id,
              REPORT_ID,
            );

            assert.equal(
              payload.workspace_id,
              WORKSPACE_ID,
            );

            assert.equal(
              payload.expected_rows,
              SOURCE_ROWS,
            );

            return {
              data: [
                createRpcRow({
                  job:
                    reconciledJob,
                  changed:
                    true,
                  alreadyReconciled:
                    false,
                  sourceRows:
                    SOURCE_ROWS,
                  excludedRows:
                    EXCLUDED_ROWS,
                  retainedRows:
                    RETAINED_ROWS,
                  mixedCampaignCount:
                    5,
                  matchedCampaignCount:
                    3,
                  excludedImpressions:
                    EXCLUDED_IMPRESSIONS,
                  excludedClicks:
                    EXCLUDED_CLICKS,
                  excludedCost:
                    EXCLUDED_COST,
                  excludedConversions:
                    EXCLUDED_CONVERSIONS,
                  excludedRevenue:
                    EXCLUDED_REVENUE,
                }),
              ],
              error:
                null,
            };
          },
      },
    );

  assert.equal(
    firstRpcCalls,
    1,
  );

  assert.equal(
    repositoryResult.changed,
    true,
  );

  assert.equal(
    repositoryResult.alreadyReconciled,
    false,
  );

  assert.equal(
    repositoryResult.sourceRows,
    SOURCE_ROWS,
  );

  assert.equal(
    repositoryResult.excludedRows,
    EXCLUDED_ROWS,
  );

  assert.equal(
    repositoryResult.retainedRows,
    RETAINED_ROWS,
  );

  assert.equal(
    repositoryResult.checkpoint.totalRows,
    RETAINED_ROWS,
  );

  let boundedResumedFinalRpcCalls =
    0;

  const boundedResumedFinalResult =
    await reconcileNaverSearchAdsBrandSearchCrossGrainStaging(
      {
        job:
          retainedBoundaryResumeJob,
        expectedRows:
          RETAINED_ROWS,
      },
      {
        invokeRpc:
          async (
            functionName: string,
            args: {
              p_payload: unknown;
            },
          ) => {
            boundedResumedFinalRpcCalls +=
              1;

            assert.equal(
              functionName,
              "reconcile_naver_searchads_brand_search_cross_grain_staging",
            );

            const payload =
              requireRecord(
                args.p_payload,
                "Bounded resumed reconciliation payload must be an object.",
              );

            assert.equal(
              payload.expected_rows,
              RETAINED_ROWS,
            );

            return {
              data: [
                createRpcRow({
                  job:
                    reconciledJob,
                  changed:
                    true,
                  alreadyReconciled:
                    false,
                  sourceRows:
                    SOURCE_ROWS,
                  excludedRows:
                    EXCLUDED_ROWS,
                  retainedRows:
                    RETAINED_ROWS,
                  mixedCampaignCount:
                    5,
                  matchedCampaignCount:
                    3,
                  excludedImpressions:
                    EXCLUDED_IMPRESSIONS,
                  excludedClicks:
                    EXCLUDED_CLICKS,
                  excludedCost:
                    EXCLUDED_COST,
                  excludedConversions:
                    EXCLUDED_CONVERSIONS,
                  excludedRevenue:
                    EXCLUDED_REVENUE,
                }),
              ],
              error:
                null,
            };
          },
      },
    );

  assert.equal(
    boundedResumedFinalRpcCalls,
    1,
  );

  assert.equal(
    boundedResumedFinalResult.changed,
    true,
  );

  assert.equal(
    boundedResumedFinalResult.alreadyReconciled,
    false,
  );

  assert.equal(
    boundedResumedFinalResult.sourceRows,
    SOURCE_ROWS,
  );

  assert.equal(
    boundedResumedFinalResult.retainedRows,
    RETAINED_ROWS,
  );

  assert.equal(
    boundedResumedFinalResult.checkpoint.totalRows,
    RETAINED_ROWS,
  );

  const idempotentResult =
    await reconcileNaverSearchAdsBrandSearchCrossGrainStaging(
      {
        job:
          repositoryResult.job,
        expectedRows:
          RETAINED_ROWS,
      },
      {
        invokeRpc:
          async () => ({
            data: [
              createRpcRow({
                job:
                  reconciledJob,
                changed:
                  false,
                alreadyReconciled:
                  true,
                sourceRows:
                  SOURCE_ROWS,
                excludedRows:
                  EXCLUDED_ROWS,
                retainedRows:
                  RETAINED_ROWS,
                mixedCampaignCount:
                  5,
                matchedCampaignCount:
                  3,
                excludedImpressions:
                  EXCLUDED_IMPRESSIONS,
                excludedClicks:
                  EXCLUDED_CLICKS,
                excludedCost:
                  EXCLUDED_COST,
                excludedConversions:
                  EXCLUDED_CONVERSIONS,
                excludedRevenue:
                  EXCLUDED_REVENUE,
              }),
            ],
            error:
              null,
          }),
      },
    );

  assert.equal(
    idempotentResult.changed,
    false,
  );

  assert.equal(
    idempotentResult.alreadyReconciled,
    true,
  );

  const noOverlapMetadata =
    createReconciliationMetadata({
      sourceRows:
        118,
      excludedRows:
        0,
      retainedRows:
        118,
      mixedCampaignCount:
        0,
      matchedCampaignCount:
        0,
      excludedImpressions:
        0,
      excludedClicks:
        0,
      excludedCost:
        0,
      excludedConversions:
        0,
      excludedRevenue:
        0,
    });

  const noOverlapInputJob =
    createJob({
      rows:
        118,
      updatedAt:
        "2026-07-30T01:00:00.000Z",
    });

  const noOverlapReturnedJob =
    createJob({
      rows:
        118,
      updatedAt:
        "2026-07-30T01:00:01.000Z",
      reconciliation:
        noOverlapMetadata,
    });

  const noOverlapRepositoryResult =
    await reconcileNaverSearchAdsBrandSearchCrossGrainStaging(
      {
        job:
          noOverlapInputJob,
        expectedRows:
          118,
      },
      {
        invokeRpc:
          async () => ({
            data: [
              createRpcRow({
                job:
                  noOverlapReturnedJob,
                changed:
                  false,
                alreadyReconciled:
                  false,
                sourceRows:
                  118,
                excludedRows:
                  0,
                retainedRows:
                  118,
                mixedCampaignCount:
                  0,
                matchedCampaignCount:
                  0,
                excludedImpressions:
                  0,
                excludedClicks:
                  0,
                excludedCost:
                  0,
                excludedConversions:
                  0,
                excludedRevenue:
                  0,
              }),
            ],
            error:
              null,
          }),
      },
    );

  assert.equal(
    noOverlapRepositoryResult.changed,
    false,
  );

  assert.equal(
    noOverlapRepositoryResult.alreadyReconciled,
    false,
  );

  assert.equal(
    noOverlapRepositoryResult.retainedRows,
    118,
  );

  const sql =
    sourceBefore[2];

  const sqlWithoutComments =
    stripSqlComments(
      sql,
    );

  const requiredSqlPatterns = [
    /create\s+or\s+replace\s+function\s+public\.reconcile_naver_searchads_brand_search_cross_grain_staging/i,
    /security\s+definer/i,
    /for\s+update/i,
    /naver_searchad_brand_search_adgroup_daily_stats/i,
    /naver_searchad_registered_keyword_daily_stats/i,
    /provider_meta,campaign_type/i,
    /provider_meta,authoritative_grain/i,
    /brand_search_cross_grain_dedup_v1/i,
    /row_number\s*\(\s*\)\s+over/i,
    /delete\s+from\s+public\.media_sync_staging_rows/i,
    /update\s+public\.media_sync_staging_rows/i,
    /update\s+public\.media_sync_jobs/i,
    /reconciliation/i,
    /grant\s+execute[\s\S]*to\s+service_role/i,
  ] as const;

  for (
    const pattern
    of requiredSqlPatterns
  ) {
    assert.match(
      sqlWithoutComments,
      pattern,
      `Required SQL contract is missing: ${pattern}`,
    );
  }

  assert.doesNotMatch(
    sqlWithoutComments,
    /(?:update|insert\s+into|delete\s+from)\s+public\.(?:reports|report_rows|report_ingestions)\b/i,
    "Reconciliation SQL contains a forbidden report writer.",
  );

  assert.doesNotMatch(
    sqlWithoutComments,
    /\b(?:materialize_media_sync_snapshot|activate_media_sync_snapshot|finalize_media_sync_job)\b/i,
    "Reconciliation SQL invokes a forbidden lifecycle RPC.",
  );

  assert.doesNotMatch(
    sqlWithoutComments,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    "Reconciliation SQL contains a hard-coded UUID.",
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
    "Reconciliation verification changed source files.",
  );

  console.log(
    "verified production-shape raw staging rows: 45844",
  );

  console.log(
    "verified BRAND_SEARCH cross-grain overlap rows: 1204",
  );

  console.log(
    "verified retained staging rows: 44640",
  );

  console.log(
    "verified excluded metrics: 2632 / 1092 / 0 / 65 / 7639300",
  );

  console.log(
    "verified retained metrics: 7075 / 1183 / 113850 / 67 / 12729300",
  );

  console.log(
    "verified retained row identity and compact row indexes: true",
  );

  console.log(
    "verified second reconciliation is idempotent: true",
  );

  console.log(
    "verified no-overlap reconciliation is a no-op: true",
  );

  console.log(
    "verified repository RPC payload and result parsing: true",
  );

  console.log(
    "verified bounded resumed final boundary parsing: true",
  );

  console.log(
    "verified reconciliation SQL has no report lifecycle writer: true",
  );

  console.log(
    "fixture uses real Naver API: false",
  );

  console.log(
    "fixture uses database: false",
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
      "Naver Search Ads BRAND_SEARCH cross-grain reconciliation fixture failed.",
      error,
    );

    process.exitCode =
      1;
  },
);
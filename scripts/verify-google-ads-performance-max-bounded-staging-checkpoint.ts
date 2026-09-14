import assert from "node:assert/strict";
import fs from "node:fs";

import {
  convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/google-ads-performance-max-asset-group-canonical-row";

import {
  runGoogleAdsAllDataPerformanceMaxStagingOrchestrator,
} from "../src/lib/media-sync/google-ads-all-data-performance-max-staging-orchestrator";

import {
  runGoogleAdsAllDataProcessingOrchestrator,
} from "../src/lib/media-sync/google-ads-all-data-processing-orchestrator";

import {
  readGoogleAdsAllDataProcessingCheckpoint,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";

function makeJob(
  insertedRows = 0,
) {
  return {
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
      "google_ads",
    external_account_id:
      "1234567890",

    date_from:
      "2026-05-01",
    date_to:
      "2026-05-01",

    data_level:
      "keyword",
    mode:
      "snapshot_replace",

    status:
      "processing",
    progress:
      50,

    raw_rows:
      insertedRows,
    normalized_rows:
      insertedRows,
    inserted_rows:
      insertedRows,
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
      "test",
    created_at:
      "2026-05-01T00:00:00.000Z",
    started_at:
      "2026-05-01T00:00:00.000Z",
    finished_at:
      null,
    updated_at:
      "2026-05-01T00:00:00.000Z",

    execution_contract:
      "google_all_data_v1",
  } as any;
}

async function main(): Promise<void> {
  const canonical =
    convertGoogleAdsPerformanceMaxAssetGroupDailyStatsToCanonicalRows({
      externalAccountId:
        "1234567890",

      campaign: {
        id:
          "100",
        name:
          "PMAX Campaign",
      },

      assetGroup: {
        id:
          "200",
        campaignId:
          "100",
        name:
          "Primary Asset Group",
      },

      records: [
        {
          date:
            "2026-05-01",
          assetGroupId:
            "200",
          impressions:
            100,
          clicks:
            10,
          cost:
            1.25,
          conversions:
            2,
          revenue:
            300,
        },
      ],
    });

  const partial =
    await runGoogleAdsAllDataPerformanceMaxStagingOrchestrator(
      {
        job:
          makeJob(0),

        accessToken:
          "access-token",

        developerToken:
          "developer-token",

        dateWindowIndex:
          0,
      },
      {
        collectPage:
          async () =>
            ({
              rows:
                canonical,

              status:
                "partial",

              isComplete:
                false,

              cursor: {
                version:
                  1,
                pageIndex:
                  1,
                page:
                  "next-page",
              },

              pageCount:
                1,

              completedPageCount:
                1,

              requestCount:
                1,

              retryCount:
                0,
            } as any),

        appendBatch:
          async input => {
            assert.equal(
              input.rowStartIndex,
              0,
            );

            assert.equal(
              input.rows.length,
              1,
            );

            return {
              submittedRows:
                1,
              insertedRows:
                1,
              duplicateRows:
                0,
              firstRowIndex:
                0,
              lastRowIndex:
                0,
            };
          },
      },
    );

  assert.equal(
    partial.isComplete,
    false,
  );

  assert.equal(
    partial.nextRowIndex,
    1,
  );

  assert.equal(
    partial.checkpoint.cursor?.expectedRowStartIndex,
    1,
  );

  assert.equal(
    partial.checkpoint.cursor?.page.page,
    "next-page",
  );

  const completed =
    await runGoogleAdsAllDataPerformanceMaxStagingOrchestrator(
      {
        job:
          makeJob(1),

        accessToken:
          "access-token",

        developerToken:
          "developer-token",

        dateWindowIndex:
          0,

        cursor:
          partial.checkpoint.cursor,
      },
      {
        collectPage:
          async input => {
            assert.equal(
              (input.cursor as any)?.page,
              "next-page",
            );

            return {
              rows:
                [],

              status:
                "completed",

              isComplete:
                true,

              cursor:
                null,

              pageCount:
                1,

              completedPageCount:
                2,

              requestCount:
                1,

              retryCount:
                0,
            } as any;
          },

        appendBatch:
          async () => {
            throw new Error(
              "zero-row terminal page must not append",
            );
          },
      },
    );

  assert.equal(
    completed.isComplete,
    true,
  );

  assert.equal(
    completed.nextRowIndex,
    1,
  );

  assert.equal(
    completed.checkpoint.cursor,
    null,
  );

  let savedCandidate:
    any = null;

  const processor =
    await runGoogleAdsAllDataProcessingOrchestrator(
      {
        job:
          makeJob(0),

        accessToken:
          "access-token",

        developerToken:
          "developer-token",

        dateWindowIndex:
          0,

        routing: {
          route: [
            "performance_max",
          ],
          productIndex:
            0,
          productFamily:
            "performance_max",
          complete:
            false,
        },
      } as any,
      {
        runPerformanceMaxStaging:
          async () =>
            partial as any,

        saveCheckpoint:
          async (input: any) => {
            savedCandidate =
              input;

            return makeJob(1);
          },
      } as any,
    );

  assert.equal(
    processor.staging.phaseRun,
    "performance_max_asset_group",
  );

  assert.equal(
    processor.staging.nextPhase,
    "performance_max_asset_group",
  );

  assert.equal(
    processor.staging.checkpoint.cursor?.phase,
    "performance_max_asset_group",
  );

  assert.equal(
    savedCandidate.routing.productFamily,
    "performance_max",
  );

  const durableCursor =
    processor.staging.checkpoint.cursor;

  assert.ok(
    durableCursor,
  );

  const checkpointJob =
    makeJob(1);

  checkpointJob.error_detail = {
    processing_checkpoint: {
      version:
        1,

      execution_contract:
        "google_all_data_v1",

      date_window_index:
        0,

      next_row_index:
        1,

      raw_rows:
        1,

      normalized_rows:
        1,

      inserted_rows:
        1,

      failed_rows:
        0,

      complete:
        false,

      collector: {
        google_version:
          1,

        all_data_version:
          1,

        phase:
          "performance_max_asset_group",

        date_window_index:
          0,

        next_row_index:
          1,

        complete:
          false,

        cursor:
          durableCursor,

        product_route: [
          "performance_max",
        ],

        product_index:
          0,

        product_family:
          "performance_max",
      },
    },
  };

  const read =
    readGoogleAdsAllDataProcessingCheckpoint(
      checkpointJob,
    );

  assert.equal(
    read.phase,
    "performance_max_asset_group",
  );

  assert.equal(
    read.nextRowIndex,
    1,
  );

  assert.equal(
    read.complete,
    false,
  );

  assert.equal(
    read.routing?.productFamily,
    "performance_max",
  );

  const sql =
    fs.readFileSync(
      new URL(
        "./sql/create-save-google-ads-all-data-processing-checkpoint.sql",
        import.meta.url,
      ),
      "utf8",
    );

  const phaseHits =
    (
      sql.match(
        /performance_max_asset_group/g,
      ) ?? []
    ).length;

  assert.ok(
    phaseHits >= 4,
    `expected >=4 PMAX SQL checkpoint phase hits, got ${phaseHits}`,
  );

  console.log(
    "PMAX_BOUNDED_STAGING=PASS",
  );

  console.log(
    "PMAX_DURABLE_CHECKPOINT=PASS",
  );

  console.log(
    `PMAX_SQL_PHASE_HITS=${phaseHits}`,
  );
}

void main().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);

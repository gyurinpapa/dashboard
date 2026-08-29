import assert from "node:assert/strict";
import fs from "node:fs";

import {
  GoogleAdsAllDataProductRoutingBootstrapRepositoryError,
  saveGoogleAdsAllDataProductRoutingBootstrap,
  type GoogleAdsAllDataProductRoutingBootstrapJobRecord,
} from "../src/lib/media-sync/google-ads-all-data-product-routing-bootstrap-repository";
import {
  validateGoogleAdsAllDataProductRoutingState,
} from "../src/lib/media-sync/google-ads-all-data-product-routing";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const REPORT_ID =
  "22222222-2222-4222-8222-222222222222";

const WORKSPACE_ID =
  "33333333-3333-4333-8333-333333333333";

const ADVERTISER_ID =
  "44444444-4444-4444-8444-444444444444";

const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";

const ACCOUNT_ID =
  "1234567890";

const DATE =
  "2026-05-01";

type JobOverride =
  Partial<
    MediaSyncJobRecord &
    Readonly<{
      execution_contract:
        unknown;
    }>
  >;

function createJob(
  override:
    JobOverride = {},
): MediaSyncJobRecord {
  return {
    id:
      JOB_ID,

    report_id:
      REPORT_ID,

    workspace_id:
      WORKSPACE_ID,

    advertiser_id:
      ADVERTISER_ID,

    connection_id:
      CONNECTION_ID,

    provider:
      "google_ads",

    external_account_id:
      ACCOUNT_ID,

    status:
      "processing",

    mode:
      "snapshot_replace",

    date_from:
      DATE,

    date_to:
      DATE,

    raw_rows:
      0,

    normalized_rows:
      0,

    inserted_rows:
      0,

    failed_rows:
      0,

    error:
      null,

    error_detail:
      null,

    execution_contract:
      "google_all_data_v1",

    ...override,
  } as unknown as
    MediaSyncJobRecord;
}

function createSavedJob(
  job:
    MediaSyncJobRecord,
  payload:
    Record<string, unknown>,
): GoogleAdsAllDataProductRoutingBootstrapJobRecord {
  const collector =
    payload.collector as
      Record<string, unknown>;

  const checkpoint = {
    version:
      1,

    saved_at:
      "2026-08-29T00:00:00.000Z",

    execution_contract:
      "google_all_data_v1",

    date_window_index:
      collector.date_window_index,

    next_row_index:
      collector.next_row_index,

    raw_rows:
      0,

    normalized_rows:
      0,

    inserted_rows:
      0,

    failed_rows:
      0,

    complete:
      collector.complete,

    collector,
  };

  return {
    ...job,

    raw_rows:
      0,

    normalized_rows:
      0,

    inserted_rows:
      0,

    failed_rows:
      0,

    error:
      null,

    error_detail: {
      processing_checkpoint:
        checkpoint,
    },

    execution_contract:
      "google_all_data_v1",
  } as unknown as
    GoogleAdsAllDataProductRoutingBootstrapJobRecord;
}

async function main():
  Promise<void> {
  const routing =
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "search",
        "demand_gen",
      ],

      productIndex:
        0,

      productFamily:
        "search",

      complete:
        false,
    });

  const job =
    createJob();

  let rpcCalls =
    0;

  let capturedPayload:
    Record<string, unknown> |
    null =
      null;

  const saved =
    await saveGoogleAdsAllDataProductRoutingBootstrap(
      {
        job,
        routing,
      },
      {
        invokeRpc:
          async (
            functionName,
            args,
          ) => {
            rpcCalls +=
              1;

            assert.equal(
              functionName,
              "save_google_ads_all_data_processing_checkpoint",
            );

            capturedPayload =
              args.p_payload;

            const collector =
              args.p_payload.collector as
                Record<string, unknown>;

            assert.equal(
              args.p_payload.raw_rows,
              0,
            );

            assert.equal(
              args.p_payload.normalized_rows,
              0,
            );

            assert.equal(
              args.p_payload.inserted_rows,
              0,
            );

            assert.equal(
              args.p_payload.failed_rows,
              0,
            );

            assert.deepEqual(
              collector.product_route,
              [
                "search",
                "demand_gen",
              ],
            );

            assert.equal(
              collector.product_index,
              0,
            );

            assert.equal(
              collector.product_family,
              "search",
            );

            assert.equal(
              collector.phase,
              "product_boundary",
            );

            assert.equal(
              collector.date_window_index,
              0,
            );

            assert.equal(
              collector.next_row_index,
              0,
            );

            assert.equal(
              collector.complete,
              false,
            );

            assert.equal(
              collector.cursor,
              null,
            );

            return {
              data: [
                createSavedJob(
                  job,
                  args.p_payload,
                ),
              ],

              error:
                null,
            };
          },

        parseJob:
          async value =>
            value as
              GoogleAdsAllDataProductRoutingBootstrapJobRecord,
      },
    );

  assert.equal(
    rpcCalls,
    1,
  );

  assert.ok(
    capturedPayload,
  );

  assert.equal(
    saved.id,
    JOB_ID,
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_RPC_EXACTLY_ONCE=PASS",
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_ZERO_ROW_COUNTS=PASS",
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_PHASE=product_boundary",
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_CURSOR=NULL",
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_ROUTING_PERSISTED=PASS",
  );

  let invalidCountRpcCalls =
    0;

  await assert.rejects(
    () =>
      saveGoogleAdsAllDataProductRoutingBootstrap(
        {
          job:
            createJob({
              raw_rows:
                1,

              normalized_rows:
                1,

              inserted_rows:
                1,
            }),

          routing,
        },
        {
          invokeRpc:
            async () => {
              invalidCountRpcCalls +=
                1;

              throw new Error(
                "should-not-run",
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataProductRoutingBootstrapRepositoryError &&
      error.code ===
        "INVALID_COUNTS",
  );

  assert.equal(
    invalidCountRpcCalls,
    0,
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_ROWS_FAIL_BEFORE_RPC=PASS",
  );

  const advancedRouting =
    validateGoogleAdsAllDataProductRoutingState({
      route: [
        "search",
        "demand_gen",
      ],

      productIndex:
        1,

      productFamily:
        "demand_gen",

      complete:
        false,
    });

  let invalidRoutingRpcCalls =
    0;

  await assert.rejects(
    () =>
      saveGoogleAdsAllDataProductRoutingBootstrap(
        {
          job:
            createJob(),

          routing:
            advancedRouting,
        },
        {
          invokeRpc:
            async () => {
              invalidRoutingRpcCalls +=
                1;

              throw new Error(
                "should-not-run",
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataProductRoutingBootstrapRepositoryError &&
      error.code ===
        "ROUTING_CONFLICT",
  );

  assert.equal(
    invalidRoutingRpcCalls,
    0,
  );

  console.log(
    "ALL_DATA_PRODUCT_ROUTE_BOOTSTRAP_NONINITIAL_ROUTING_FAILS_BEFORE_RPC=PASS",
  );

  const sql =
    fs.readFileSync(
      "scripts/sql/create-save-google-ads-all-data-processing-checkpoint.sql",
      "utf8",
    );

  assert.match(
    sql,
    /v_phase not in\s*\(\s*'product_boundary',\s*'keyword',\s*'search_ad',\s*'completed'\s*\)/u,
  );

  assert.match(
    sql,
    /when 'product_boundary' then 0/u,
  );

  assert.match(
    sql,
    /if v_phase = 'product_boundary' then/u,
  );

  console.log(
    "ALL_DATA_SQL_PRODUCT_BOUNDARY_PHASE_WHITELIST=PASS",
  );

  console.log(
    "ALL_DATA_SQL_PRODUCT_BOUNDARY_PHASE_RANK=PASS",
  );

  console.log(
    "ALL_DATA_SQL_PRODUCT_BOUNDARY_CURSOR_CONTRACT=PASS",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_PRODUCT_ROUTING_BOOTSTRAP_REPOSITORY_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );
}

void main().catch(
  error => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

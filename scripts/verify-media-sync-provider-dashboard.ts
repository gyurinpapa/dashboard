import assert from "node:assert/strict";

import {
  buildMediaSyncProviderDashboard,
} from "../src/lib/media-sync/media-sync-provider-dashboard";
import type {
  SafeMediaConnection,
  SafeMediaSyncJob,
} from "../src/lib/media-sync/types";

const NOW = "2026-08-31T06:05:59.455797+00:00";

function buildConnection(
  provider: SafeMediaConnection["provider"],
  id: string,
): SafeMediaConnection {
  return {
    id,
    workspace_id: "workspace-1",
    advertiser_id: "advertiser-1",
    provider,
    external_account_id: `${provider}-account`,
    external_account_name: `${provider} account`,
    status: "active",
    has_credentials: true,
    connected_at: NOW,
    last_verified_at: NOW,
    last_sync_at: NOW,
    last_error: null,
    meta: {},
    created_by: "user-1",
    created_at: NOW,
    updated_at: NOW,
  };
}

function buildJob(input: {
  provider: SafeMediaSyncJob["provider"];
  connectionId: string;
  status: SafeMediaSyncJob["status"];
  progress: number;
  insertedRows: number;
  errorDetail: SafeMediaSyncJob["error_detail"];
}): SafeMediaSyncJob {
  return {
    id: `${input.provider}-job`,
    workspace_id: "workspace-1",
    advertiser_id: "advertiser-1",
    report_id: "report-1",
    connection_id: input.connectionId,
    provider: input.provider,
    external_account_id: `${input.provider}-account`,
    date_from: "2026-08-25",
    date_to: "2026-08-25",
    data_level: "keyword",
    mode: "snapshot_replace",
    status: input.status,
    progress: input.progress,
    raw_rows: input.insertedRows,
    normalized_rows: input.insertedRows,
    inserted_rows: input.insertedRows,
    failed_rows: 0,
    previous_ingestion_id: null,
    snapshot_ingestion_id: input.status === "done" ? "snapshot-1" : null,
    attempt_count: 1,
    error: null,
    error_detail: input.errorDetail,
    created_by: "user-1",
    created_at: NOW,
    started_at: NOW,
    finished_at: input.status === "done" ? NOW : null,
    updated_at: NOW,
  };
}

const googleConnection = buildConnection("google_ads", "google-connection");
const naverConnection = buildConnection("naver_searchad", "naver-connection");

const dashboard = buildMediaSyncProviderDashboard({
  connections: [googleConnection, naverConnection],
  jobs: [
    buildJob({
      provider: "google_ads",
      connectionId: googleConnection.id,
      status: "processing",
      progress: 58,
      insertedRows: 7,
      errorDetail: {
        processing_checkpoint: {
          collector: {
            phase: "demand_gen_ad",
            product_route: ["search", "demand_gen"],
            product_index: 1,
            product_family: "demand_gen",
            next_row_index: 7,
          },
        },
      },
    }),
    buildJob({
      provider: "naver_searchad",
      connectionId: naverConnection.id,
      status: "done",
      progress: 100,
      insertedRows: 118,
      errorDetail: {
        processing_checkpoint: {
          phase: "completed",
          totalRows: 118,
        },
      },
    }),
  ],
});

assert.deepEqual(
  dashboard.map((item) => item.provider),
  ["naver_searchad", "google_ads", "meta_ads"],
);

const naver = dashboard[0];
const google = dashboard[1];
const meta = dashboard[2];

assert.equal(naver.connections.length, 1);
assert.equal(naver.products.filter((product) => product.state === "enabled").length, 5);
assert.equal(naver.latest_job?.phase, "completed");
assert.equal(naver.latest_job?.collected_rows, 118);

assert.equal(google.connections.length, 1);
assert.deepEqual(
  google.products
    .filter((product) => product.state === "enabled")
    .map((product) => product.key),
  ["search", "demand_gen", "display"],
);
assert.equal(google.latest_job?.phase, "demand_gen_ad");
assert.equal(google.latest_job?.current_product, "demand_gen");
assert.equal(google.latest_job?.current_product_label, "Demand Gen");
assert.equal(google.latest_job?.progress, 58);
assert.equal(google.latest_job?.collected_rows, 7);

assert.equal(meta.runtime_enabled, false);
assert.equal(meta.selection_mode, "unavailable");
assert.equal(meta.connections.length, 0);
assert.equal(meta.latest_job, null);

const serialized = JSON.stringify(dashboard).toLowerCase();

for (const forbidden of [
  "credential_ciphertext",
  "access_token",
  "refresh_token",
  "secret_key",
]) {
  assert.equal(serialized.includes(forbidden), false);
}

console.log("MEDIA_SYNC_PROVIDER_DASHBOARD=PASS");
console.log("PROVIDER_CARDS=3");
console.log("GOOGLE_ENABLED_PRODUCTS=3");
console.log("NAVER_ENABLED_PRODUCTS=5");
console.log("META_RUNTIME=DISABLED");
console.log("DATABASE_MUTATIONS=0");
console.log("LIVE_SYNC=NOT_RUN");

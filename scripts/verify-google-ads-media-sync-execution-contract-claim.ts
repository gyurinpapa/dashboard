import assert from "node:assert/strict";

import {
  claimNextGoogleAdsMediaSyncJob,
  GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,
  GoogleAdsMediaSyncWorkerClaimRepositoryError,
} from "../src/lib/media-sync/google-ads-media-sync-worker-claim-repository";

import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const CLAIM_RPC =
  "claim_next_google_ads_media_sync_job";

const BASE_JOB: MediaSyncJobRecord = {
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
    "2026-05-02",

  data_level:
    "keyword",

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
    "2026-05-03T00:00:00.000Z",

  started_at:
    "2026-05-03T00:00:01.000Z",

  finished_at:
    null,

  updated_at:
    "2026-05-03T00:00:01.000Z",
};

async function claimWithRaw(
  raw: unknown,
) {
  return await claimNextGoogleAdsMediaSyncJob({
    invokeRpc:
      async rpcName => {
        assert.equal(
          rpcName,
          CLAIM_RPC,
        );

        return {
          data: [
            raw,
          ],
          error:
            null,
        };
      },

    parseJobRecord:
      async () =>
        BASE_JOB,
  });
}

async function main(): Promise<void> {
  const missing =
    await claimWithRaw(
      {},
    );

  assert.equal(
    missing,
    BASE_JOB,
  );

  assert.equal(
    missing !== null &&
      "execution_contract" in missing,
    false,
  );

  console.log(
    "MISSING_EXECUTION_CONTRACT_LEGACY_OBJECT_SHAPE=PASS",
  );

  const explicitNull =
    await claimWithRaw({
      execution_contract:
        null,
    });

  assert.equal(
    explicitNull,
    BASE_JOB,
  );

  assert.equal(
    explicitNull !== null &&
      "execution_contract" in explicitNull,
    false,
  );

  console.log(
    "NULL_EXECUTION_CONTRACT_LEGACY_OBJECT_SHAPE=PASS",
  );

  const allData =
    await claimWithRaw({
      execution_contract:
        GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT,
    });

  assert.notEqual(
    allData,
    null,
  );

  assert.equal(
    allData?.execution_contract,
    "google_all_data_v1",
  );

  assert.equal(
    allData?.id,
    BASE_JOB.id,
  );

  console.log(
    "GOOGLE_ALL_DATA_EXECUTION_CONTRACT_INTERNAL_EXTRACTION=PASS",
  );

  await assert.rejects(
    () =>
      claimWithRaw({
        execution_contract:
          "unsupported_contract",
      }),

    error => {
      assert.ok(
        error instanceof
          GoogleAdsMediaSyncWorkerClaimRepositoryError,
      );

      assert.equal(
        error.code,
        "INVALID_RECORD",
      );

      return true;
    },
  );

  console.log(
    "UNKNOWN_EXECUTION_CONTRACT_FAIL_CLOSED=PASS",
  );

  console.log(
    "GOOGLE_ADS_EXECUTION_CONTRACT_CLAIM_FIXTURE=PASS",
  );
}

void main();

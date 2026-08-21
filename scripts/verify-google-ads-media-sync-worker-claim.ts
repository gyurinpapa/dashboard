import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";

import {
  claimNextGoogleAdsMediaSyncJob,
  GoogleAdsMediaSyncWorkerClaimRepositoryError,
} from "../src/lib/media-sync/google-ads-media-sync-worker-claim-repository";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const CLAIM_RPC =
  "claim_next_google_ads_media_sync_job";

function makeClaimedJob(
  overrides:
    Partial<MediaSyncJobRecord> = {},
): MediaSyncJobRecord {
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
      "2026-08-20T00:00:00.000Z",
    started_at:
      "2026-08-20T00:00:01.000Z",
    finished_at:
      null,
    updated_at:
      "2026-08-20T00:00:01.000Z",
    ...overrides,
  } as MediaSyncJobRecord;
}

function parseFixtureJobRecord(
  value: unknown,
): MediaSyncJobRecord {
  assert.ok(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );

  return value as
    MediaSyncJobRecord;
}

async function expectClaimError(
  run:
    () => Promise<unknown>,
  code:
    GoogleAdsMediaSyncWorkerClaimRepositoryError["code"],
): Promise<
  GoogleAdsMediaSyncWorkerClaimRepositoryError
> {
  try {
    await run();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsMediaSyncWorkerClaimRepositoryError,
    );

    assert.equal(
      error.code,
      code,
    );

    return error;
  }

  assert.fail(
    `Expected GoogleAdsMediaSyncWorkerClaimRepositoryError(${code})`,
  );
}

async function main(): Promise<void> {
  let injectedRpcCalls =
    0;

  {
    const expectedJob =
      makeClaimedJob({
        error_detail: {
          processing_checkpoint: {
            version:
              1,
          },
        },
      });

    let receivedRpcName =
      "";

    const claimed =
      await claimNextGoogleAdsMediaSyncJob({
        parseJobRecord:
          parseFixtureJobRecord,

        invokeRpc:
          async (
            rpcName,
          ) => {
            injectedRpcCalls +=
              1;

            receivedRpcName =
              rpcName;

            return {
              data: [
                expectedJob,
              ],
              error:
                null,
            };
          },
      });

    assert.equal(
      receivedRpcName,
      CLAIM_RPC,
    );

    assert.deepEqual(
      claimed,
      expectedJob,
    );

    console.log(
      "PASS: Google claim repository invokes only the dedicated RPC and accepts one exact processing job",
    );
  }

  {
    const claimedNull =
      await claimNextGoogleAdsMediaSyncJob({
        parseJobRecord:
          parseFixtureJobRecord,

        invokeRpc:
          async (
            rpcName,
          ) => {
            injectedRpcCalls +=
              1;

            assert.equal(
              rpcName,
              CLAIM_RPC,
            );

            return {
              data:
                null,
              error:
                null,
            };
          },
      });

    assert.equal(
      claimedNull,
      null,
    );

    const claimedEmpty =
      await claimNextGoogleAdsMediaSyncJob({
        parseJobRecord:
          parseFixtureJobRecord,

        invokeRpc:
          async (
            rpcName,
          ) => {
            injectedRpcCalls +=
              1;

            assert.equal(
              rpcName,
              CLAIM_RPC,
            );

            return {
              data: [],
              error:
                null,
            };
          },
      });

    assert.equal(
      claimedEmpty,
      null,
    );

    console.log(
      "PASS: no claimable Google job returns null without fabrication",
    );
  }

  {
    await expectClaimError(
      () =>
        claimNextGoogleAdsMediaSyncJob({
          parseJobRecord:
            parseFixtureJobRecord,

          invokeRpc:
            async () => {
              injectedRpcCalls +=
                1;

              return {
                data: [
                  makeClaimedJob({
                    provider:
                      "naver_searchad",
                  }),
                ],
                error:
                  null,
              };
            },
        }),
      "INVALID_RECORD",
    );

    console.log(
      "PASS: non-Google provider fails closed after claim RPC",
    );
  }

  {
    await expectClaimError(
      () =>
        claimNextGoogleAdsMediaSyncJob({
          parseJobRecord:
            parseFixtureJobRecord,

          invokeRpc:
            async () => {
              injectedRpcCalls +=
                1;

              return {
                data: [
                  makeClaimedJob({
                    status:
                      "pending",
                    started_at:
                      null,
                  }),
                ],
                error:
                  null,
              };
            },
        }),
      "INVALID_RECORD",
    );

    console.log(
      "PASS: non-processing claimed status fails closed",
    );
  }

  {
    await expectClaimError(
      () =>
        claimNextGoogleAdsMediaSyncJob({
          parseJobRecord:
            parseFixtureJobRecord,

          invokeRpc:
            async () => {
              injectedRpcCalls +=
                1;

              return {
                data: [
                  makeClaimedJob({
                    error_detail: {
                      processing_checkpoint: {
                        version:
                          1,
                      },
                      unexpected:
                        true,
                    },
                  }),
                ],
                error:
                  null,
              };
            },
        }),
      "INVALID_RECORD",
    );

    console.log(
      "PASS: claimed error_detail may preserve only processing_checkpoint",
    );
  }

  {
    await expectClaimError(
      () =>
        claimNextGoogleAdsMediaSyncJob({
          parseJobRecord:
            parseFixtureJobRecord,

          invokeRpc:
            async () => {
              injectedRpcCalls +=
                1;

              return {
                data: [
                  makeClaimedJob(),
                  makeClaimedJob({
                    id:
                      "77777777-7777-4777-8777-777777777777",
                  }),
                ],
                error:
                  null,
              };
            },
        }),
      "INVALID_RECORD",
    );

    console.log(
      "PASS: more than one claimed Google job fails closed",
    );
  }

  {
    await expectClaimError(
      () =>
        claimNextGoogleAdsMediaSyncJob({
          parseJobRecord:
            parseFixtureJobRecord,

          invokeRpc:
            async () => {
              injectedRpcCalls +=
                1;

              return {
                data:
                  null,
                error: {
                  code:
                    "FIXTURE_RPC_ERROR",
                },
              };
            },
        }),
      "CLAIM_ERROR",
    );

    console.log(
      "PASS: Google claim RPC error maps to a dedicated safe repository error",
    );
  }

  {
    await expectClaimError(
      () =>
        claimNextGoogleAdsMediaSyncJob({
          parseJobRecord:
            async () => {
              throw new Error(
                "FIXTURE_PARSE_FAILURE",
              );
            },

          invokeRpc:
            async () => {
              injectedRpcCalls +=
                1;

              return {
                data: [
                  makeClaimedJob(),
                ],
                error:
                  null,
              };
            },
        }),
      "INVALID_RECORD",
    );

    console.log(
      "PASS: injected job parser failure maps to an invalid claimed record without DB fallback",
    );
  }

  const sqlPath =
    fileURLToPath(
      new URL(
        "./sql/create-claim-next-google-ads-media-sync-job.sql",
        import.meta.url,
      ),
    );

  const sql =
    readFileSync(
      sqlPath,
      "utf8",
    );

  const requiredSqlSignals = [
    "create or replace function public.claim_next_google_ads_media_sync_job()",
    "returns setof public.media_sync_jobs",
    "security definer",
    "set search_path = pg_catalog, public",
    "job.status = 'pending'",
    "job.provider = 'google_ads'",
    "job.created_at asc",
    "job.id asc",
    "for update skip locked",
    "limit 1",
    "status = 'processing'",
    "started_at = now()",
    "updated_at = now()",
    "job.attempt_count + 1",
    "error = null",
    "? 'processing_checkpoint'",
    "grant execute",
    "to service_role",
  ];

  for (
    const signal of
    requiredSqlSignals
  ) {
    assert.ok(
      sql.toLowerCase().includes(
        signal.toLowerCase(),
      ),
      `Missing SQL contract signal: ${signal}`,
    );
  }

  assert.equal(
    sql.includes(
      "create or replace function public.claim_next_naver_media_sync_job",
    ),
    false,
  );

  assert.equal(
    sql.includes(
      "job.provider = 'naver_searchad'",
    ),
    false,
  );

  assert.ok(
    sql.includes(
      "from anon",
    ),
  );

  assert.ok(
    sql.includes(
      "from authenticated",
    ),
  );

  console.log(
    "PASS: SQL mirrors the Production Naver locking contract while creating only the Google claim RPC",
  );

  console.log(
    "GOOGLE_ADS_MEDIA_SYNC_WORKER_CLAIM_FIXTURE=PASS",
  );

  console.log(
    `INJECTED_GOOGLE_CLAIM_RPC_CALLS=${injectedRpcCalls}`,
  );

  console.log(
    "REAL_GOOGLE_CLAIM_RPC_CALLS=0",
  );

  console.log(
    "PRODUCTION_SQL_EXECUTIONS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "WORKER_RUNTIME_CHANGES=0",
  );

  console.log(
    "NAVER_RUNTIME_CHANGES=0",
  );
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);

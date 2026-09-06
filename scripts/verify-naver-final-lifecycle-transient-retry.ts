import assert from "node:assert/strict";

import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

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

const SNAPSHOT_ID =
  "77777777-7777-4777-8777-777777777777";

const PREVIOUS_ID =
  "88888888-8888-4888-8888-888888888888";

const EXPECTED_ROWS =
  2;

const FINGERPRINT =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const FINISHED_AT =
  "2026-09-07T01:00:00.000Z";

function createJob(
  provider:
    "naver_searchad" |
    "google_ads" =
      "naver_searchad",
): MediaSyncJobRecord {
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

    provider,

    external_account_id:
      "123456",

    date_from:
      "2026-08-01",

    date_to:
      "2026-08-31",

    data_level:
      "keyword",

    mode:
      "snapshot_replace",

    status:
      "processing",

    progress:
      70,

    raw_rows:
      EXPECTED_ROWS,

    normalized_rows:
      EXPECTED_ROWS,

    inserted_rows:
      EXPECTED_ROWS,

    failed_rows:
      0,

    previous_ingestion_id:
      PREVIOUS_ID,

    snapshot_ingestion_id:
      SNAPSHOT_ID,

    attempt_count:
      1,

    error:
      null,

    error_detail:
      null,

    created_by:
      CREATED_BY,

    created_at:
      "2026-09-07T00:00:00.000Z",

    started_at:
      "2026-09-07T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-09-07T00:00:01.000Z",
  };
}

function createDoneJob():
  MediaSyncJobRecord {
  return {
    ...createJob(),

    status:
      "done",

    progress:
      100,

    finished_at:
      FINISHED_AT,

    updated_at:
      FINISHED_AT,
  };
}

const SUMMARY = {
  jobId:
    JOB_ID,

  expectedRows:
    EXPECTED_ROWS,

  totalRows:
    EXPECTED_ROWS,

  minRowIndex:
    0,

  maxRowIndex:
    EXPECTED_ROWS - 1,

  distinctRowIndexes:
    EXPECTED_ROWS,

  rowsInExpectedRange:
    EXPECTED_ROWS,

  missingExpectedRows:
    0,

  outOfRangeRows:
    0,

  scopeMismatchRows:
    0,

  blankRowKeyRows:
    0,

  missingFingerprintRows:
    0,

  canonicalMismatchRows:
    0,

  dateWindowCount:
    1,

  dateWindowSummaries: [
    {
      dateWindowIndex:
        0,

      rowCount:
        EXPECTED_ROWS,

      minRowIndex:
        0,

      maxRowIndex:
        EXPECTED_ROWS - 1,

      minDate:
        "2026-08-01",

      maxDate:
        "2026-08-31",
    },
  ],

  isComplete:
    true,
};

function prepareResult() {
  return [
    {
      job:
        createJob(),

      snapshot_ingestion_id:
        SNAPSHOT_ID,

      expected_rows:
        EXPECTED_ROWS,

      next_row_index:
        0,

      idempotent:
        false,
    },
  ];
}

function batchResult() {
  return [
    {
      job:
        createJob(),

      snapshot_ingestion_id:
        SNAPSHOT_ID,

      batch_start:
        0,

      batch_end_exclusive:
        EXPECTED_ROWS,

      expected_batch_rows:
        EXPECTED_ROWS,

      inserted_rows:
        EXPECTED_ROWS,

      materialized_batch_rows:
        EXPECTED_ROWS,

      next_row_index:
        EXPECTED_ROWS,

      complete:
        true,

      idempotent:
        false,
    },
  ];
}

function completionResult() {
  return [
    {
      job:
        createJob(),

      snapshot_ingestion_id:
        SNAPSHOT_ID,

      row_count:
        EXPECTED_ROWS,

      staging_fingerprint:
        FINGERPRINT,

      materialized_fingerprint:
        FINGERPRINT,

      idempotent:
        true,
    },
  ];
}

function activationResult() {
  return [
    {
      job:
        createJob(),

      previous_ingestion_id:
        PREVIOUS_ID,

      snapshot_ingestion_id:
        SNAPSHOT_ID,

      current_ingestion_id:
        SNAPSHOT_ID,

      published_ingestion_id:
        null,

      row_count:
        EXPECTED_ROWS,

      staging_fingerprint:
        FINGERPRINT,

      materialized_fingerprint:
        FINGERPRINT,

      idempotent:
        true,
    },
  ];
}

function finalizationResult() {
  return [
    {
      job:
        createDoneJob(),

      snapshot_ingestion_id:
        SNAPSHOT_ID,

      current_ingestion_id:
        SNAPSHOT_ID,

      published_ingestion_id:
        null,

      row_count:
        EXPECTED_ROWS,

      staging_fingerprint:
        FINGERPRINT,

      materialized_fingerprint:
        FINGERPRINT,

      finished_at:
        FINISHED_AT,

      connection_id:
        CONNECTION_ID,

      connection_last_sync_at:
        FINISHED_AT,

      connection_updated:
        false,

      idempotent:
        true,
    },
  ];
}

async function main():
  Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fixture-service-role-key";

  const {
    materializeMediaSyncSnapshot,
  } = await import(
    "../src/lib/media-sync/media-sync-snapshot-materialization-repository"
  );

  const {
    activateMediaSyncSnapshot,
    MediaSyncSnapshotActivationError,
  } = await import(
    "../src/lib/media-sync/media-sync-snapshot-activation-repository"
  );

  const {
    finalizeMediaSyncJob,
    MediaSyncFinalizationError,
  } = await import(
    "../src/lib/media-sync/media-sync-finalization-repository"
  );

  // -------------------------------------------------------
  // A. Completion response loss:
  // same exact completion payload is retried.
  // -------------------------------------------------------
  {
    const materializationJob = {
      ...createJob(),
      snapshot_ingestion_id:
        null,
    };

    let completionCalls =
      0;

    const completionPayloads:
      string[] =
        [];

    const waits:
      number[] =
        [];

    const result =
      await materializeMediaSyncSnapshot({
        job:
          materializationJob,

        summary:
          SUMMARY,

        batchSize:
          EXPECTED_ROWS,

        dependencies: {
          wait: async (
            delayMs,
          ) => {
            waits.push(
              delayMs,
            );
          },

          invokeRpc: async (
            functionName,
            args,
          ) => {
            if (
              functionName ===
              "prepare_media_sync_snapshot_materialization"
            ) {
              return {
                data:
                  prepareResult(),

                error:
                  null,
              };
            }

            if (
              functionName ===
              "materialize_media_sync_snapshot_batch"
            ) {
              return {
                data:
                  batchResult(),

                error:
                  null,
              };
            }

            if (
              functionName ===
              "complete_media_sync_snapshot_materialization"
            ) {
              completionCalls +=
                1;

              completionPayloads.push(
                JSON.stringify(
                  args.p_payload,
                ),
              );

              if (
                completionCalls <=
                  2
              ) {
                return {
                  data:
                    null,

                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              }

              return {
                data:
                  completionResult(),

                error:
                  null,
              };
            }

            throw new Error(
              `unexpected RPC ${functionName}`,
            );
          },
        },
      });

    assert.equal(
      result.rowCount,
      EXPECTED_ROWS,
    );

    assert.equal(
      completionCalls,
      3,
    );

    assert.deepEqual(
      waits,
      [500, 500],
    );

    assert.equal(
      new Set(
        completionPayloads,
      ).size,
      1,
    );

    console.log(
      "completion transient exact retry=PASS",
    );
  }

  // -------------------------------------------------------
  // B. Activation: thrown upstream + returned 57014 + success.
  // -------------------------------------------------------
  {
    let calls =
      0;

    const waits:
      number[] =
        [];

    const payloads:
      string[] =
        [];

    const result =
      await activateMediaSyncSnapshot({
        job:
          createJob(),

        expectedRows:
          EXPECTED_ROWS,

        dependencies: {
          wait: async (
            delayMs,
          ) => {
            waits.push(
              delayMs,
            );
          },

          invokeRpc: async (
            _functionName,
            args,
          ) => {
            calls += 1;

            payloads.push(
              JSON.stringify(
                args.p_payload,
              ),
            );

            if (calls === 1) {
              throw new Error(
                "upstream request timeout",
              );
            }

            if (calls === 2) {
              return {
                data:
                  null,

                error: {
                  code:
                    "57014",

                  message:
                    "canceling statement due to statement timeout",
                },
              };
            }

            return {
              data:
                activationResult(),

              error:
                null,
            };
          },
        },
      });

    assert.equal(
      result.idempotent,
      true,
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      waits,
      [500, 500],
    );

    assert.equal(
      new Set(payloads).size,
      1,
    );

    console.log(
      "activation transient exact retry=PASS",
    );
  }

  // -------------------------------------------------------
  // C. Finalization response loss:
  // same processing-input payload retries into idempotent DONE.
  // -------------------------------------------------------
  {
    let calls =
      0;

    const waits:
      number[] =
        [];

    const payloads:
      string[] =
        [];

    const result =
      await finalizeMediaSyncJob({
        job:
          createJob(),

        expectedRows:
          EXPECTED_ROWS,

        dependencies: {
          wait: async (
            delayMs,
          ) => {
            waits.push(
              delayMs,
            );
          },

          invokeRpc: async (
            _functionName,
            args,
          ) => {
            calls += 1;

            payloads.push(
              JSON.stringify(
                args.p_payload,
              ),
            );

            if (calls <= 2) {
              return {
                data:
                  null,

                error: {
                  message:
                    "upstream request timeout",
                },
              };
            }

            return {
              data:
                finalizationResult(),

              error:
                null,
            };
          },
        },
      });

    assert.equal(
      result.job.status,
      "done",
    );

    assert.equal(
      result.idempotent,
      true,
    );

    assert.equal(
      result.connectionUpdated,
      false,
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      waits,
      [500, 500],
    );

    assert.equal(
      new Set(payloads).size,
      1,
    );

    console.log(
      "finalization response-loss exact retry=PASS",
    );
  }

  // -------------------------------------------------------
  // D. Persistent Naver transient: max 3, then fail closed.
  // -------------------------------------------------------
  {
    let calls =
      0;

    const waits:
      number[] =
        [];

    await assert.rejects(
      () =>
        finalizeMediaSyncJob({
          job:
            createJob(),

          expectedRows:
            EXPECTED_ROWS,

          dependencies: {
            wait: async (
              delayMs,
            ) => {
              waits.push(
                delayMs,
              );
            },

            invokeRpc:
              async () => {
                calls += 1;

                return {
                  data:
                    null,

                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              },
          },
        }),

      (
        error:
          unknown,
      ) => {
        assert.ok(
          error instanceof
            MediaSyncFinalizationError,
        );

        assert.equal(
          error.code,
          "DATABASE_ERROR",
        );

        return true;
      },
    );

    assert.equal(
      calls,
      3,
    );

    assert.deepEqual(
      waits,
      [500, 500],
    );

    console.log(
      "persistent Naver transient fail-closed=PASS",
    );
  }

  // -------------------------------------------------------
  // E. Non-transient: one attempt only.
  // -------------------------------------------------------
  {
    let calls =
      0;

    const waits:
      number[] =
        [];

    await assert.rejects(
      () =>
        activateMediaSyncSnapshot({
          job:
            createJob(),

          expectedRows:
            EXPECTED_ROWS,

          dependencies: {
            wait: async (
              delayMs,
            ) => {
              waits.push(
                delayMs,
              );
            },

            invokeRpc:
              async () => {
                calls += 1;

                return {
                  data:
                    null,

                  error: {
                    message:
                      "permission denied",
                  },
                };
              },
          },
        }),

      (
        error:
          unknown,
      ) => {
        assert.ok(
          error instanceof
            MediaSyncSnapshotActivationError,
        );

        return true;
      },
    );

    assert.equal(
      calls,
      1,
    );

    assert.deepEqual(
      waits,
      [],
    );

    console.log(
      "non-transient no retry=PASS",
    );
  }

  // -------------------------------------------------------
  // F. Google containment: transient remains one-shot.
  // -------------------------------------------------------
  {
    let activationCalls =
      0;

    await assert.rejects(
      () =>
        activateMediaSyncSnapshot({
          job:
            createJob(
              "google_ads",
            ),

          expectedRows:
            EXPECTED_ROWS,

          dependencies: {
            wait:
              async () =>
                undefined,

            invokeRpc:
              async () => {
                activationCalls +=
                  1;

                return {
                  data:
                    null,

                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              },
          },
        }),
    );

    assert.equal(
      activationCalls,
      1,
    );

    let finalizationCalls =
      0;

    await assert.rejects(
      () =>
        finalizeMediaSyncJob({
          job:
            createJob(
              "google_ads",
            ),

          expectedRows:
            EXPECTED_ROWS,

          dependencies: {
            wait:
              async () =>
                undefined,

            invokeRpc:
              async () => {
                finalizationCalls +=
                  1;

                return {
                  data:
                    null,

                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              },
          },
        }),
    );

    assert.equal(
      finalizationCalls,
      1,
    );

    console.log(
      "Google lifecycle behavior unchanged=PASS",
    );
  }

  console.log(
    "database calls=0",
  );

  console.log(
    "naver api calls=0",
  );

  console.log(
    "verification=PASS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      "final lifecycle transient retry verification failed",
      error,
    );

    process.exitCode = 1;
  },
);

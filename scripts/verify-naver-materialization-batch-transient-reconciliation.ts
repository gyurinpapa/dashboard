import assert from "node:assert/strict";

import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const JOB_ID =
  "11111111-1111-4111-8111-111111111111";

const REPORT_ID =
  "44444444-4444-4444-8444-444444444444";

const SNAPSHOT_ID =
  "77777777-7777-4777-8777-777777777777";

const PREVIOUS_ID =
  "88888888-8888-4888-8888-888888888888";

const EXPECTED_ROWS = 4;
const BATCH_SIZE = 2;

const FINGERPRINT =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const JOB:
  MediaSyncJobRecord = {
    id: JOB_ID,
    workspace_id:
      "22222222-2222-4222-8222-222222222222",
    advertiser_id:
      "33333333-3333-4333-8333-333333333333",
    report_id:
      REPORT_ID,
    connection_id:
      "55555555-5555-4555-8555-555555555555",

    provider:
      "naver_searchad",
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
      "2026-09-07T00:00:00.000Z",
    started_at:
      "2026-09-07T00:00:01.000Z",
    finished_at:
      null,
    updated_at:
      "2026-09-07T00:00:01.000Z",
  };

const JOB_WITH_SNAPSHOT:
  MediaSyncJobRecord = {
    ...JOB,
    snapshot_ingestion_id:
      SNAPSHOT_ID,
  };

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

function prepareResult(
  nextRowIndex: number,
) {
  return [
    {
      job:
        JOB_WITH_SNAPSHOT,
      snapshot_ingestion_id:
        SNAPSHOT_ID,
      expected_rows:
        EXPECTED_ROWS,
      next_row_index:
        nextRowIndex,
      idempotent:
        false,
    },
  ];
}

function batchResult(
  batchStart: number,
) {
  const end =
    Math.min(
      batchStart +
        BATCH_SIZE,
      EXPECTED_ROWS,
    );

  return [
    {
      job:
        JOB_WITH_SNAPSHOT,
      snapshot_ingestion_id:
        SNAPSHOT_ID,
      batch_start:
        batchStart,
      batch_end_exclusive:
        end,
      expected_batch_rows:
        end -
        batchStart,
      inserted_rows:
        end -
        batchStart,
      materialized_batch_rows:
        end -
        batchStart,
      next_row_index:
        end,
      complete:
        end >=
        EXPECTED_ROWS,
      idempotent:
        false,
    },
  ];
}

function completeResult() {
  return [
    {
      job:
        JOB_WITH_SNAPSHOT,
      snapshot_ingestion_id:
        SNAPSHOT_ID,
      row_count:
        EXPECTED_ROWS,
      staging_fingerprint:
        FINGERPRINT,
      materialized_fingerprint:
        FINGERPRINT,
      idempotent:
        false,
    },
  ];
}

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fixture-service-role-key";

  const {
    materializeMediaSyncSnapshot,
    MediaSyncSnapshotMaterializationError,
  } = await import(
    "../src/lib/media-sync/media-sync-snapshot-materialization-repository"
  );

  // -------------------------------------------------------
  // A. NOT_COMMITTED_EXPECTED:
  // first batch transient -> prepare says still 0 -> exact replay.
  // -------------------------------------------------------
  {
    const waits: number[] = [];
    const batchPayloads: string[] = [];

    let prepareCalls = 0;
    let firstBatchCalls = 0;

    const result =
      await materializeMediaSyncSnapshot({
        job:
          JOB,
        summary:
          SUMMARY,
        batchSize:
          BATCH_SIZE,

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
              prepareCalls += 1;

              return {
                data:
                  prepareResult(0),
                error:
                  null,
              };
            }

            if (
              functionName ===
              "materialize_media_sync_snapshot_batch"
            ) {
              const start =
                Number(
                  args.p_payload
                    .batch_start,
                );

              if (
                start === 0
              ) {
                firstBatchCalls += 1;

                batchPayloads.push(
                  JSON.stringify(
                    args.p_payload,
                  ),
                );

                if (
                  firstBatchCalls ===
                  1
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
              }

              return {
                data:
                  batchResult(
                    start,
                  ),
                error:
                  null,
              };
            }

            if (
              functionName ===
              "complete_media_sync_snapshot_materialization"
            ) {
              return {
                data:
                  completeResult(),
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
      firstBatchCalls,
      2,
    );

    assert.equal(
      prepareCalls,
      2,
    );

    assert.deepEqual(
      waits,
      [500],
    );

    assert.equal(
      new Set(
        batchPayloads,
      ).size,
      1,
    );

    console.log(
      "NOT_COMMITTED_EXPECTED exact replay=PASS",
    );
  }

  // -------------------------------------------------------
  // B. COMMITTED_EXPECTED:
  // batch response lost -> prepare says checkpoint advanced to 2.
  // no duplicate first batch replay.
  // -------------------------------------------------------
  {
    let prepareCalls = 0;
    let firstBatchCalls = 0;
    const batchStarts: number[] = [];

    const result =
      await materializeMediaSyncSnapshot({
        job:
          JOB,
        summary:
          SUMMARY,
        batchSize:
          BATCH_SIZE,

        dependencies: {
          wait:
            async () => undefined,

          invokeRpc: async (
            functionName,
            args,
          ) => {
            if (
              functionName ===
              "prepare_media_sync_snapshot_materialization"
            ) {
              prepareCalls += 1;

              return {
                data:
                  prepareResult(
                    prepareCalls ===
                    1
                      ? 0
                      : 2,
                  ),
                error:
                  null,
              };
            }

            if (
              functionName ===
              "materialize_media_sync_snapshot_batch"
            ) {
              const start =
                Number(
                  args.p_payload
                    .batch_start,
                );

              batchStarts.push(
                start,
              );

              if (
                start === 0
              ) {
                firstBatchCalls += 1;

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
                  batchResult(
                    start,
                  ),
                error:
                  null,
              };
            }

            if (
              functionName ===
              "complete_media_sync_snapshot_materialization"
            ) {
              return {
                data:
                  completeResult(),
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
      firstBatchCalls,
      1,
    );

    assert.deepEqual(
      batchStarts,
      [0, 2],
    );

    console.log(
      "COMMITTED_EXPECTED skips duplicate batch replay=PASS",
    );
  }

  // -------------------------------------------------------
  // C. 57014 + NOT COMMITTED -> retry.
  // -------------------------------------------------------
  {
    let batchZeroCalls = 0;

    const result =
      await materializeMediaSyncSnapshot({
        job:
          JOB,
        summary:
          SUMMARY,
        batchSize:
          BATCH_SIZE,

        dependencies: {
          wait:
            async () => undefined,

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
                  prepareResult(0),
                error:
                  null,
              };
            }

            if (
              functionName ===
              "materialize_media_sync_snapshot_batch"
            ) {
              const start =
                Number(
                  args.p_payload
                    .batch_start,
                );

              if (
                start === 0
              ) {
                batchZeroCalls += 1;

                if (
                  batchZeroCalls ===
                  1
                ) {
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
              }

              return {
                data:
                  batchResult(
                    start,
                  ),
                error:
                  null,
              };
            }

            if (
              functionName ===
              "complete_media_sync_snapshot_materialization"
            ) {
              return {
                data:
                  completeResult(),
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
      batchZeroCalls,
      2,
    );

    console.log(
      "57014 batch reconciliation retry=PASS",
    );
  }

  // -------------------------------------------------------
  // D. unexpected checkpoint -> fail closed.
  // -------------------------------------------------------
  {
    let prepareCalls = 0;

    await assert.rejects(
      () =>
        materializeMediaSyncSnapshot({
          job:
            JOB,
          summary:
            SUMMARY,
          batchSize:
            BATCH_SIZE,

          dependencies: {
            wait:
              async () =>
                undefined,

            invokeRpc: async (
              functionName,
            ) => {
              if (
                functionName ===
                "prepare_media_sync_snapshot_materialization"
              ) {
                prepareCalls += 1;

                return {
                  data:
                    prepareResult(
                      prepareCalls ===
                      1
                        ? 0
                        : 1,
                    ),
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
                    null,
                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              }

              throw new Error(
                `unexpected RPC ${functionName}`,
              );
            },
          },
        }),

      (
        error: unknown,
      ) => {
        assert.ok(
          error instanceof
            MediaSyncSnapshotMaterializationError,
        );

        assert.equal(
          error.code,
          "MATERIALIZATION_CONFLICT",
        );

        return true;
      },
    );

    console.log(
      "unexpected checkpoint fail-closed=PASS",
    );
  }

  // -------------------------------------------------------
  // E. persistent NOT_COMMITTED transient -> max 3 then fail.
  // -------------------------------------------------------
  {
    let batchCalls = 0;
    const waits: number[] = [];

    await assert.rejects(
      () =>
        materializeMediaSyncSnapshot({
          job:
            JOB,
          summary:
            SUMMARY,
          batchSize:
            BATCH_SIZE,

          dependencies: {
            wait:
              async (
                delayMs,
              ) => {
                waits.push(
                  delayMs,
                );
              },

            invokeRpc: async (
              functionName,
            ) => {
              if (
                functionName ===
                "prepare_media_sync_snapshot_materialization"
              ) {
                return {
                  data:
                    prepareResult(0),
                  error:
                    null,
                };
              }

              if (
                functionName ===
                "materialize_media_sync_snapshot_batch"
              ) {
                batchCalls += 1;

                return {
                  data:
                    null,
                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              }

              throw new Error(
                `unexpected RPC ${functionName}`,
              );
            },
          },
        }),

      (
        error: unknown,
      ) => {
        assert.ok(
          error instanceof
            MediaSyncSnapshotMaterializationError,
        );

        assert.equal(
          error.code,
          "DATABASE_ERROR",
        );

        return true;
      },
    );

    assert.equal(
      batchCalls,
      3,
    );

    assert.deepEqual(
      waits,
      [500, 500],
    );

    console.log(
      "persistent transient max attempts fail-closed=PASS",
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
      "materialization batch transient reconciliation verification failed",
      error,
    );

    process.exitCode = 1;
  },
);

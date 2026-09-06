import assert from "node:assert/strict";

const BASE_RPC =
  "summarize_naver_searchads_combined_staging_base";

const BATCH_RPC =
  "validate_naver_searchads_combined_staging_batch_v3";

const JOB_ID =
  "c828933c-8306-499e-bb40-2a618b0886ad";

const EXPECTED_ROWS = 1;

function createJob() {
  return {
    id: JOB_ID,
    report_id:
      "ea413950-4068-41e8-9ced-8355020d7e7d",
    workspace_id:
      "27b1556f-9d42-496f-bd7e-5a59ebee71d4",
    advertiser_id:
      "da51e71a-01ce-42fb-a937-7af0b5f47786",
    connection_id:
      "aba7d28f-ec85-49db-941a-fa5babe2af61",
    provider: "naver_searchad",
    external_account_id: "703575",
    status: "processing",
    date_from: "2026-05-01",
    date_to: "2026-05-01",
    started_at:
      "2026-09-07T00:00:00.000Z",
    attempt_count: 1,
  };
}

function baseResult() {
  return [
    {
      job_id: JOB_ID,
      expected_rows: EXPECTED_ROWS,
      total_rows: EXPECTED_ROWS,
      min_row_index: 0,
      max_row_index: 0,
      distinct_row_indexes: EXPECTED_ROWS,
      rows_in_expected_range: EXPECTED_ROWS,
      missing_expected_rows: 0,
      out_of_range_rows: 0,
      scope_mismatch_rows: 0,
      blank_row_key_rows: 0,
      missing_fingerprint_rows: 0,
      date_window_count: 0,
      date_window_summaries: [],
    },
  ];
}

function batchResult(
  afterRowIndex: number | null,
) {
  if (afterRowIndex === null) {
    return [
      {
        job_id: JOB_ID,
        after_row_index: null,
        batch_size: 2000,
        batch_rows: 1,
        batch_max_row_index: 0,
        scope_mismatch_rows: 0,
        blank_row_key_rows: 0,
        missing_fingerprint_rows: 0,
        canonical_mismatch_rows: 0,
        date_window_summaries: [
          {
            date_window_index: 0,
            row_count: 1,
            min_row_index: 0,
            max_row_index: 0,
            min_date: "2026-05-01",
            max_date: "2026-05-01",
          },
        ],
      },
    ];
  }

  return [
    {
      job_id: JOB_ID,
      after_row_index: 0,
      batch_size: 2000,
      batch_rows: 0,
      batch_max_row_index: null,
      scope_mismatch_rows: 0,
      blank_row_key_rows: 0,
      missing_fingerprint_rows: 0,
      canonical_mismatch_rows: 0,
      date_window_summaries: [],
    },
  ];
}

type FailureMode =
  | "returned_upstream"
  | "returned_statement_timeout"
  | "thrown_upstream"
  | "persistent_upstream"
  | "non_transient";

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fixture.supabase.co";

  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fixture-service-role-key";

  const {
    getNaverSearchAdsCombinedStagingSummary,
    MediaSyncStagingSummaryError,
  } = await import(
    "../src/lib/media-sync/media-sync-staging-summary-repository"
  );

  async function runSuccessfulScenario(input: {
    mode:
      | "returned_upstream"
      | "returned_statement_timeout"
      | "thrown_upstream";
    target: "base" | "batch";
  }): Promise<void> {
    let targetCalls = 0;

    const waits: number[] = [];
    const replayPayloads: string[] = [];

    const summary =
      await getNaverSearchAdsCombinedStagingSummary(
        {
          job: createJob() as never,
          expectedRows: EXPECTED_ROWS,
        },
        {
          wait: async (delayMs) => {
            waits.push(delayMs);
          },

          invokeRpc: async (
            functionName,
            args,
          ) => {
            const isTarget =
              (
                input.target === "base" &&
                functionName === BASE_RPC
              ) ||
              (
                input.target === "batch" &&
                functionName === BATCH_RPC &&
                args.p_payload
                  .after_row_index === null
              );

            if (isTarget) {
              targetCalls += 1;

              replayPayloads.push(
                JSON.stringify(
                  args.p_payload,
                ),
              );

              if (targetCalls <= 2) {
                if (
                  input.mode ===
                  "thrown_upstream"
                ) {
                  throw new Error(
                    "upstream request timeout",
                  );
                }

                if (
                  input.mode ===
                  "returned_statement_timeout"
                ) {
                  return {
                    data: null,
                    error: {
                      code: "57014",
                      message:
                        "canceling statement due to statement timeout",
                    },
                  };
                }

                return {
                  data: null,
                  error: {
                    message:
                      "upstream request timeout",
                  },
                };
              }
            }

            if (functionName === BASE_RPC) {
              return {
                data: baseResult(),
                error: null,
              };
            }

            if (functionName === BATCH_RPC) {
              return {
                data:
                  batchResult(
                    args.p_payload
                      .after_row_index as
                        number | null,
                  ),
                error: null,
              };
            }

            throw new Error(
              `Unexpected RPC: ${functionName}`,
            );
          },
        },
      );

    assert.equal(
      summary.isComplete,
      true,
    );

    const expectedTargetCalls =
      input.target === "base"
        ? 4
        : 3;

    /*
     * BASE target:
     * - beforeSummary transient attempts: 3
     * - afterSummary stability witness: 1
     *
     * BATCH target:
     * - the targeted first bounded batch transient attempts: 3
     */
    assert.equal(
      targetCalls,
      expectedTargetCalls,
    );

    assert.deepEqual(
      waits,
      [500, 500],
    );

    assert.equal(
      new Set(
        replayPayloads,
      ).size,
      1,
      "Transient retries must replay the exact same read payload.",
    );
  }

  await runSuccessfulScenario({
    mode: "returned_upstream",
    target: "batch",
  });

  await runSuccessfulScenario({
    mode: "returned_statement_timeout",
    target: "batch",
  });

  await runSuccessfulScenario({
    mode: "thrown_upstream",
    target: "base",
  });

  {
    let calls = 0;
    const waits: number[] = [];

    await assert.rejects(
      () =>
        getNaverSearchAdsCombinedStagingSummary(
          {
            job: createJob() as never,
            expectedRows:
              EXPECTED_ROWS,
          },
          {
            wait: async (delayMs) => {
              waits.push(delayMs);
            },

            invokeRpc: async () => {
              calls += 1;

              return {
                data: null,
                error: {
                  message:
                    "upstream request timeout",
                },
              };
            },
          },
        ),

      (
        error: unknown,
      ) => {
        assert.ok(
          error instanceof
            MediaSyncStagingSummaryError,
        );

        assert.equal(
          error.code,
          "DATABASE_ERROR",
        );

        return true;
      },
    );

    assert.equal(calls, 3);
    assert.deepEqual(
      waits,
      [500, 500],
    );
  }

  {
    let calls = 0;
    const waits: number[] = [];

    await assert.rejects(
      () =>
        getNaverSearchAdsCombinedStagingSummary(
          {
            job: createJob() as never,
            expectedRows:
              EXPECTED_ROWS,
          },
          {
            wait: async (delayMs) => {
              waits.push(delayMs);
            },

            invokeRpc: async () => {
              calls += 1;

              return {
                data: null,
                error: {
                  message:
                    "permission denied",
                },
              };
            },
          },
        ),

      (
        error: unknown,
      ) => {
        assert.ok(
          error instanceof
            MediaSyncStagingSummaryError,
        );

        return true;
      },
    );

    assert.equal(calls, 1);
    assert.deepEqual(waits, []);
  }

  console.log(
    "returned upstream timeout retry=PASS",
  );
  console.log(
    "returned 57014 statement timeout retry=PASS",
  );
  console.log(
    "thrown upstream timeout retry=PASS",
  );
  console.log(
    "exact read payload replay=PASS",
  );
  console.log(
    "max attempts 3 fail-closed=PASS",
  );
  console.log(
    "non-transient no retry=PASS",
  );
  console.log(
    "cursor advances only after successful batch=PASS",
  );
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
      "combined validation transient retry verification failed",
      error,
    );

    process.exitCode = 1;
  },
);

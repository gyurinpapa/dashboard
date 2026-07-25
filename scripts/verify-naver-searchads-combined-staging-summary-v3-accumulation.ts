import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const REPOSITORY_PATH =
  "src/lib/media-sync/media-sync-staging-summary-repository.ts";

const BASE_RPC =
  "summarize_naver_searchads_combined_staging_base";

const BATCH_RPC =
  "validate_naver_searchads_combined_staging_batch_v3";

const JOB_ID =
  "c828933c-8306-499e-bb40-2a618b0886ad";

const EXPECTED_ROWS = 6;

function hash(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

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
    date_to: "2026-05-02",
    started_at: "2026-07-25T11:00:00.000Z",
    attempt_count: 1,
  };
}

function createBaseResult(input?: {
  totalRows?: number;
  maxRowIndex?: number;
}) {
  const totalRows =
    input?.totalRows ?? EXPECTED_ROWS;

  const maxRowIndex =
    input?.maxRowIndex ?? EXPECTED_ROWS - 1;

  return [
    {
      job_id: JOB_ID,
      expected_rows: EXPECTED_ROWS,
      total_rows: totalRows,
      min_row_index:
        totalRows === 0 ? null : 0,
      max_row_index:
        totalRows === 0 ? null : maxRowIndex,
      distinct_row_indexes: totalRows,
      rows_in_expected_range: totalRows,
      missing_expected_rows:
        Math.max(EXPECTED_ROWS - totalRows, 0),
      out_of_range_rows: 0,
      scope_mismatch_rows: 0,
      blank_row_key_rows: 0,
      missing_fingerprint_rows: 0,
      date_window_count: 0,
      date_window_summaries: [],
    },
  ];
}

function createBatchResult(input: {
  afterRowIndex: number | null;
  batchRows: number;
  batchMaxRowIndex: number | null;
  scopeMismatchRows?: number;
  blankRowKeyRows?: number;
  missingFingerprintRows?: number;
  canonicalMismatchRows?: number;
  dateWindowSummaries: unknown[];
}) {
  return [
    {
      job_id: JOB_ID,
      after_row_index: input.afterRowIndex,
      batch_size: 2000,
      batch_rows: input.batchRows,
      batch_max_row_index:
        input.batchMaxRowIndex,
      scope_mismatch_rows:
        input.scopeMismatchRows ?? 0,
      blank_row_key_rows:
        input.blankRowKeyRows ?? 0,
      missing_fingerprint_rows:
        input.missingFingerprintRows ?? 0,
      canonical_mismatch_rows:
        input.canonicalMismatchRows ?? 0,
      date_window_summaries:
        input.dateWindowSummaries,
    },
  ];
}

async function main(): Promise<void> {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??=
    "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    "fixture-service-role-key";

  const sourceBefore =
    await readFile(REPOSITORY_PATH, "utf8");

  const {
    getNaverSearchAdsCombinedStagingSummary,
    MediaSyncStagingSummaryError,
  } = await import(
    "../src/lib/media-sync/media-sync-staging-summary-repository"
  );

  const calls: Array<{
    functionName: string;
    payload: Record<string, unknown>;
  }> = [];

  let responseIndex = 0;

  const responses = [
    createBaseResult(),
    createBatchResult({
      afterRowIndex: null,
      batchRows: 3,
      batchMaxRowIndex: 2,
      dateWindowSummaries: [
        {
          date_window_index: 1,
          row_count: 3,
          min_row_index: 0,
          max_row_index: 2,
          min_date: "2026-05-02",
          max_date: "2026-05-02",
        },
      ],
    }),
    createBatchResult({
      afterRowIndex: 2,
      batchRows: 3,
      batchMaxRowIndex: 5,
      dateWindowSummaries: [
        {
          date_window_index: 0,
          row_count: 2,
          min_row_index: 3,
          max_row_index: 4,
          min_date: "2026-05-01",
          max_date: "2026-05-02",
        },
        {
          date_window_index: 1,
          row_count: 1,
          min_row_index: 5,
          max_row_index: 5,
          min_date: "2026-05-01",
          max_date: "2026-05-01",
        },
      ],
    }),
    createBatchResult({
      afterRowIndex: 5,
      batchRows: 0,
      batchMaxRowIndex: null,
      dateWindowSummaries: [],
    }),
    createBaseResult(),
  ];

  const completeSummary =
    await getNaverSearchAdsCombinedStagingSummary(
      {
        job: createJob() as never,
        expectedRows: EXPECTED_ROWS,
      },
      {
        invokeRpc: async (
          functionName,
          args,
        ) => {
          calls.push({
            functionName,
            payload: args.p_payload,
          });

          const data =
            responses[responseIndex];

          responseIndex += 1;

          assert.ok(
            data,
            "The fixture received an unexpected RPC call.",
          );

          return {
            data,
            error: null,
          };
        },
      },
    );

  assert.equal(responseIndex, responses.length);
  assert.deepEqual(
    calls.map((call) => call.functionName),
    [BASE_RPC, BATCH_RPC, BATCH_RPC, BATCH_RPC, BASE_RPC],
  );
  assert.deepEqual(
    calls
      .filter((call) => call.functionName === BATCH_RPC)
      .map((call) => call.payload.after_row_index),
    [null, 2, 5],
  );
  assert.ok(
    calls
      .filter((call) => call.functionName === BATCH_RPC)
      .every((call) => call.payload.batch_size === 2000),
  );

  assert.deepEqual(
    completeSummary.dateWindowSummaries,
    [
      {
        dateWindowIndex: 0,
        rowCount: 2,
        minRowIndex: 3,
        maxRowIndex: 4,
        minDate: "2026-05-01",
        maxDate: "2026-05-02",
      },
      {
        dateWindowIndex: 1,
        rowCount: 4,
        minRowIndex: 0,
        maxRowIndex: 5,
        minDate: "2026-05-01",
        maxDate: "2026-05-02",
      },
    ],
  );
  assert.equal(completeSummary.dateWindowCount, 2);
  assert.equal(completeSummary.scopeMismatchRows, 0);
  assert.equal(completeSummary.blankRowKeyRows, 0);
  assert.equal(completeSummary.missingFingerprintRows, 0);
  assert.equal(completeSummary.canonicalMismatchRows, 0);
  assert.equal(completeSummary.isComplete, true);

  let incompleteResponseIndex = 0;
  const incompleteResponses = [
    createBaseResult(),
    createBatchResult({
      afterRowIndex: null,
      batchRows: 3,
      batchMaxRowIndex: 2,
      scopeMismatchRows: 1,
      missingFingerprintRows: 1,
      dateWindowSummaries: [
        {
          date_window_index: 0,
          row_count: 3,
          min_row_index: 0,
          max_row_index: 2,
          min_date: "2026-05-01",
          max_date: "2026-05-01",
        },
      ],
    }),
    createBatchResult({
      afterRowIndex: 2,
      batchRows: 3,
      batchMaxRowIndex: 5,
      blankRowKeyRows: 1,
      canonicalMismatchRows: 1,
      dateWindowSummaries: [
        {
          date_window_index: 0,
          row_count: 3,
          min_row_index: 3,
          max_row_index: 5,
          min_date: "2026-05-02",
          max_date: "2026-05-02",
        },
      ],
    }),
    createBatchResult({
      afterRowIndex: 5,
      batchRows: 0,
      batchMaxRowIndex: null,
      dateWindowSummaries: [],
    }),
    createBaseResult(),
  ];

  const incompleteSummary =
    await getNaverSearchAdsCombinedStagingSummary(
      {
        job: createJob() as never,
        expectedRows: EXPECTED_ROWS,
      },
      {
        invokeRpc: async () => {
          const data =
            incompleteResponses[
              incompleteResponseIndex
            ];

          incompleteResponseIndex += 1;

          assert.ok(data);

          return {
            data,
            error: null,
          };
        },
      },
    );

  assert.equal(incompleteSummary.scopeMismatchRows, 1);
  assert.equal(incompleteSummary.blankRowKeyRows, 1);
  assert.equal(incompleteSummary.missingFingerprintRows, 1);
  assert.equal(incompleteSummary.canonicalMismatchRows, 1);
  assert.equal(incompleteSummary.dateWindowCount, 1);
  assert.deepEqual(
    incompleteSummary.dateWindowSummaries,
    [
      {
        dateWindowIndex: 0,
        rowCount: 6,
        minRowIndex: 0,
        maxRowIndex: 5,
        minDate: "2026-05-01",
        maxDate: "2026-05-02",
      },
    ],
  );
  assert.equal(incompleteSummary.isComplete, false);

  let changedResponseIndex = 0;
  const changedResponses = [
    createBaseResult(),
    createBatchResult({
      afterRowIndex: null,
      batchRows: 6,
      batchMaxRowIndex: 5,
      dateWindowSummaries: [
        {
          date_window_index: 0,
          row_count: 6,
          min_row_index: 0,
          max_row_index: 5,
          min_date: "2026-05-01",
          max_date: "2026-05-02",
        },
      ],
    }),
    createBatchResult({
      afterRowIndex: 5,
      batchRows: 0,
      batchMaxRowIndex: null,
      dateWindowSummaries: [],
    }),
    createBaseResult({
      totalRows: 5,
      maxRowIndex: 4,
    }),
  ];

  await assert.rejects(
    () =>
      getNaverSearchAdsCombinedStagingSummary(
        {
          job: createJob() as never,
          expectedRows: EXPECTED_ROWS,
        },
        {
          invokeRpc: async () => {
            const data =
              changedResponses[
                changedResponseIndex
              ];

            changedResponseIndex += 1;

            assert.ok(data);

            return {
              data,
              error: null,
            };
          },
        },
      ),
    (error: unknown) => {
      assert.ok(
        error instanceof MediaSyncStagingSummaryError,
      );
      assert.equal(error.code, "STAGING_CHANGED");
      return true;
    },
  );

  const sourceAfter =
    await readFile(REPOSITORY_PATH, "utf8");

  assert.equal(
    hash(sourceAfter),
    hash(sourceBefore),
    "The v3 accumulation fixture modified the repository source file.",
  );

  console.log("verified v3 bounded RPC name and cursor sequence: true");
  console.log("verified repeated date-window indexes merge across batches: true");
  console.log("verified date-window row counts and index/date bounds merge correctly: true");
  console.log("verified date-window summaries sort by date_window_index: true");
  console.log("verified scope/key/fingerprint/canonical counters accumulate: true");
  console.log("verified complete summary remains complete: true");
  console.log("verified mismatch counters keep summary incomplete: true");
  console.log("verified before/after base stability guard remains active: true");
  console.log("fixture uses database: false");
  console.log("fixture writes staging: false");
  console.log("fixture writes report_rows: false");
  console.log("fixture changes report pointers: false");
  console.log("verification passed: true");
}

main().catch((error: unknown) => {
  console.error(
    "Naver combined staging summary v3 accumulation fixture failed.",
    error,
  );
  process.exitCode = 1;
});
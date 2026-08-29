import assert from "node:assert/strict";

import {
  assertGoogleAdsAllDataStagingComplete,
  getGoogleAdsAllDataStagingSummary,
  GoogleAdsAllDataStagingSummaryError,
  type GoogleAdsAllDataStagingSummaryDependencies,
} from "../src/lib/media-sync/google-ads-all-data-staging-summary-repository";
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

const BASE_RPC =
  "summarize_google_ads_all_data_staging_base";

const VALIDATION_RPC =
  "validate_google_ads_all_data_staging_batch_v1";

function createJob(
  expectedRows:
    number,
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

    date_from:
      DATE,

    date_to:
      DATE,

    data_level:
      "keyword",

    mode:
      "snapshot_replace",

    status:
      "processing",

    progress:
      99,

    raw_rows:
      expectedRows,

    normalized_rows:
      expectedRows,

    inserted_rows:
      expectedRows,

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
      {
        processing_checkpoint: {
          all_data_version:
            1,
          complete:
            true,
        },
      },

    created_by:
      "66666666-6666-4666-8666-666666666666",

    created_at:
      "2026-08-28T00:00:00.000Z",

    started_at:
      "2026-08-28T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-28T00:00:02.000Z",

    execution_contract:
      "google_all_data_v1",
  } as unknown as
    MediaSyncJobRecord;
}

function baseResult(
  input:
    Readonly<{
      expectedRows:
        number;
      totalRows?:
        number;
      minRowIndex?:
        number |
        null;
      maxRowIndex?:
        number |
        null;
      rowsInExpectedRange?:
        number;
      missingExpectedRows?:
        number;
      outOfRangeRows?:
        number;
    }>,
) {
  const totalRows =
    input.totalRows ??
    input.expectedRows;

  const rowsInExpectedRange =
    input.rowsInExpectedRange ??
    Math.min(
      totalRows,
      input.expectedRows,
    );

  return [
    {
      job_id:
        JOB_ID,

      expected_rows:
        input.expectedRows,

      total_rows:
        totalRows,

      min_row_index:
        input.minRowIndex ===
          undefined
          ? totalRows === 0
            ? null
            : 0
          : input.minRowIndex,

      max_row_index:
        input.maxRowIndex ===
          undefined
          ? totalRows === 0
            ? null
            : totalRows - 1
          : input.maxRowIndex,

      distinct_row_indexes:
        totalRows,

      rows_in_expected_range:
        rowsInExpectedRange,

      missing_expected_rows:
        input.missingExpectedRows ??
        Math.max(
          input.expectedRows -
            rowsInExpectedRange,
          0,
        ),

      out_of_range_rows:
        input.outOfRangeRows ??
        Math.max(
          totalRows -
            rowsInExpectedRange,
          0,
        ),

      scope_mismatch_rows:
        0,

      blank_row_key_rows:
        0,

      missing_fingerprint_rows:
        0,

      date_window_count:
        0,

      date_window_summaries:
        [],
    },
  ];
}

function validationResult(
  input:
    Readonly<{
      afterRowIndex:
        number |
        null;
      batchRows:
        number;
      batchMaxRowIndex:
        number |
        null;
      minRowIndex?:
        number;
      maxRowIndex?:
        number;
      rowCount?:
        number;
      canonicalMismatchRows?:
        number;
    }>,
) {
  const dateWindowSummaries =
    input.batchRows === 0
      ? []
      : [
          {
            date_window_index:
              0,

            row_count:
              input.rowCount ??
              input.batchRows,

            min_row_index:
              input.minRowIndex ??
              (
                input.afterRowIndex === null
                  ? 0
                  : input.afterRowIndex + 1
              ),

            max_row_index:
              input.maxRowIndex ??
              input.batchMaxRowIndex,

            min_date:
              DATE,

            max_date:
              DATE,
          },
        ];

  return [
    {
      job_id:
        JOB_ID,

      after_row_index:
        input.afterRowIndex,

      batch_size:
        2_000,

      batch_rows:
        input.batchRows,

      batch_max_row_index:
        input.batchMaxRowIndex,

      scope_mismatch_rows:
        0,

      blank_row_key_rows:
        0,

      missing_fingerprint_rows:
        0,

      canonical_mismatch_rows:
        input.canonicalMismatchRows ??
        0,

      date_window_summaries:
        dateWindowSummaries,
    },
  ];
}

async function verifyModuleImportIsolation():
  Promise<void> {
  assert.equal(
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
      "",
    "",
  );

  console.log(
    "ALL_DATA_SUMMARY_IMPORT_WITHOUT_SUPABASE_ENV=PASS",
  );
}

async function verifyCompleteSummary():
  Promise<void> {
  const calls:
    Array<
      Readonly<{
        functionName:
          string;
        payload:
          Record<string, unknown>;
      }>
    > = [];

  let baseCalls =
    0;

  let validationCalls =
    0;

  const dependencies:
    GoogleAdsAllDataStagingSummaryDependencies = {
      invokeRpc:
        async (
          functionName,
          args,
        ) => {
          calls.push({
            functionName,

            payload:
              args.p_payload,
          });

          if (
            functionName ===
            BASE_RPC
          ) {
            baseCalls += 1;

            return {
              data:
                baseResult({
                  expectedRows:
                    3,
                }),

              error:
                null,
            };
          }

          assert.equal(
            functionName,
            VALIDATION_RPC,
          );

          validationCalls += 1;

          if (
            validationCalls === 1
          ) {
            return {
              data:
                validationResult({
                  afterRowIndex:
                    null,

                  batchRows:
                    2,

                  batchMaxRowIndex:
                    1,

                  minRowIndex:
                    0,

                  maxRowIndex:
                    1,
                }),

              error:
                null,
            };
          }

          if (
            validationCalls === 2
          ) {
            return {
              data:
                validationResult({
                  afterRowIndex:
                    1,

                  batchRows:
                    1,

                  batchMaxRowIndex:
                    2,

                  minRowIndex:
                    2,

                  maxRowIndex:
                    2,
                }),

              error:
                null,
            };
          }

          return {
            data:
              validationResult({
                afterRowIndex:
                  2,

                batchRows:
                  0,

                batchMaxRowIndex:
                  null,
              }),

            error:
              null,
          };
        },
    };

  const summary =
    await assertGoogleAdsAllDataStagingComplete(
      {
        job:
          createJob(3),

        expectedRows:
          3,
      },
      dependencies,
    );

  assert.equal(
    baseCalls,
    2,
  );

  assert.equal(
    validationCalls,
    3,
  );

  assert.equal(
    summary.isComplete,
    true,
  );

  assert.equal(
    summary.totalRows,
    3,
  );

  assert.equal(
    summary.minRowIndex,
    0,
  );

  assert.equal(
    summary.maxRowIndex,
    2,
  );

  assert.equal(
    summary.canonicalMismatchRows,
    0,
  );

  assert.equal(
    summary.dateWindowCount,
    1,
  );

  assert.deepEqual(
    summary.dateWindowSummaries,
    [
      {
        dateWindowIndex:
          0,

        rowCount:
          3,

        minRowIndex:
          0,

        maxRowIndex:
          2,

        minDate:
          DATE,

        maxDate:
          DATE,
      },
    ],
  );

  const firstPayload =
    calls[0]?.payload;

  assert.ok(
    firstPayload,
  );

  assert.equal(
    firstPayload.provider,
    "google_ads",
  );

  assert.equal(
    firstPayload.execution_contract,
    "google_all_data_v1",
  );

  assert.equal(
    firstPayload.expected_rows,
    3,
  );

  assert.equal(
    firstPayload.report_id,
    REPORT_ID,
  );

  assert.equal(
    firstPayload.external_account_id,
    ACCOUNT_ID,
  );

  const validationPayload =
    calls.find(
      call =>
        call.functionName ===
        VALIDATION_RPC,
    )?.payload;

  assert.ok(
    validationPayload,
  );

  assert.equal(
    validationPayload.batch_size,
    2_000,
  );

  assert.equal(
    validationPayload.after_row_index,
    null,
  );

  console.log(
    "ALL_DATA_SUMMARY_BASE_BEFORE_AFTER_EXACT=PASS",
  );

  console.log(
    "ALL_DATA_SUMMARY_VALIDATION_BOUNDED_2000=PASS",
  );

  console.log(
    "ALL_DATA_SUMMARY_VALIDATION_EXHAUSTION=PASS",
  );

  console.log(
    "ALL_DATA_SUMMARY_ALL_ROWS_COVERED=PASS",
  );

  console.log(
    "ALL_DATA_SUMMARY_DATE_WINDOW_BATCH_MERGE=PASS",
  );

  console.log(
    "ALL_DATA_SUMMARY_EXECUTION_CONTRACT_PAYLOAD=PASS",
  );

  console.log(
    "ALL_DATA_SUMMARY_COMPLETE=PASS",
  );
}

async function verifyCanonicalMismatch():
  Promise<void> {
  let baseCalls =
    0;

  let validationCalls =
    0;

  const summary =
    await getGoogleAdsAllDataStagingSummary(
      {
        job:
          createJob(1),

        expectedRows:
          1,
      },
      {
        invokeRpc:
          async (
            functionName,
          ) => {
            if (
              functionName ===
              BASE_RPC
            ) {
              baseCalls += 1;

              return {
                data:
                  baseResult({
                    expectedRows:
                      1,
                  }),

                error:
                  null,
              };
            }

            validationCalls += 1;

            if (
              validationCalls === 1
            ) {
              return {
                data:
                  validationResult({
                    afterRowIndex:
                      null,

                    batchRows:
                      1,

                    batchMaxRowIndex:
                      0,

                    canonicalMismatchRows:
                      1,
                  }),

                error:
                  null,
              };
            }

            return {
              data:
                validationResult({
                  afterRowIndex:
                    0,

                  batchRows:
                    0,

                  batchMaxRowIndex:
                    null,
                }),

              error:
                null,
            };
          },
      },
    );

  assert.equal(
    baseCalls,
    2,
  );

  assert.equal(
    summary.canonicalMismatchRows,
    1,
  );

  assert.equal(
    summary.isComplete,
    false,
  );

  console.log(
    "ALL_DATA_SUMMARY_CANONICAL_MISMATCH_FAIL_CLOSED=PASS",
  );
}

async function verifyStagingChanged():
  Promise<void> {
  let baseCalls =
    0;

  let validationCalls =
    0;

  await assert.rejects(
    () =>
      getGoogleAdsAllDataStagingSummary(
        {
          job:
            createJob(1),

          expectedRows:
            1,
        },
        {
          invokeRpc:
            async (
              functionName,
            ) => {
              if (
                functionName ===
                BASE_RPC
              ) {
                baseCalls += 1;

                return {
                  data:
                    baseCalls === 1
                      ? baseResult({
                          expectedRows:
                            1,
                        })
                      : baseResult({
                          expectedRows:
                            1,

                          totalRows:
                            2,

                          minRowIndex:
                            0,

                          maxRowIndex:
                            1,

                          rowsInExpectedRange:
                            1,

                          missingExpectedRows:
                            0,

                          outOfRangeRows:
                            1,
                        }),

                  error:
                    null,
                };
              }

              validationCalls += 1;

              return {
                data:
                  validationCalls === 1
                    ? validationResult({
                        afterRowIndex:
                          null,

                        batchRows:
                          1,

                        batchMaxRowIndex:
                          0,
                      })
                    : validationResult({
                        afterRowIndex:
                          0,

                        batchRows:
                          0,

                        batchMaxRowIndex:
                          null,
                      }),

                error:
                  null,
              };
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataStagingSummaryError &&
      error.code ===
        "STAGING_CHANGED",
  );

  console.log(
    "ALL_DATA_SUMMARY_STAGING_CHANGED_FAIL_CLOSED=PASS",
  );
}

async function verifyExecutionContractFailClosed():
  Promise<void> {
  let rpcCalls =
    0;

  await assert.rejects(
    () =>
      getGoogleAdsAllDataStagingSummary(
        {
          job: {
            ...createJob(0),

            execution_contract:
              undefined,
          } as unknown as
            MediaSyncJobRecord,

          expectedRows:
            0,
        },
        {
          invokeRpc:
            async () => {
              rpcCalls += 1;

              return {
                data:
                  null,

                error:
                  null,
              };
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataStagingSummaryError &&
      error.code ===
        "INVALID_JOB",
  );

  assert.equal(
    rpcCalls,
    0,
  );

  console.log(
    "ALL_DATA_SUMMARY_EXECUTION_CONTRACT_FAILS_BEFORE_RPC=PASS",
  );
}

async function main():
  Promise<void> {
  await verifyModuleImportIsolation();

  await verifyCompleteSummary();

  await verifyCanonicalMismatch();

  await verifyStagingChanged();

  await verifyExecutionContractFailClosed();

  console.log(
    "GOOGLE_ADS_ALL_DATA_STAGING_SUMMARY_REPOSITORY_FIXTURE=PASS",
  );

  console.log(
    "LIVE_DB_CALLS=0",
  );

  console.log(
    "GOOGLE_API_CALLS=0",
  );

  console.log(
    "GOOGLE_OAUTH_CALLS=0",
  );
}

main().catch(
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

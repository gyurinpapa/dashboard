import assert from "node:assert/strict";

import {
  GoogleAdsAllDataProcessingCheckpointError,
  readGoogleAdsAllDataProcessingCheckpoint,
} from "../src/lib/media-sync/google-ads-all-data-processing-checkpoint";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const DATE =
  "2026-05-01";

const ACCOUNT_ID =
  "1234567890";

function createCursor(
  input: Readonly<{
    phase:
      "keyword" |
      "search_ad";
    nextRowIndex:
      number;
    phaseCursor:
      unknown;
  }>,
): Record<string, unknown> {
  return {
    version:
      1,

    phase:
      input.phase,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      input.nextRowIndex,

    phaseCursor:
      input.phaseCursor,
  };
}

function createCheckpoint(
  input: Readonly<{
    phase:
      "keyword" |
      "search_ad" |
      "completed";
    nextRowIndex:
      number;
    complete:
      boolean;
    cursor:
      unknown;
  }>,
): Record<string, unknown> {
  return {
    version:
      1,

    execution_contract:
      "google_all_data_v1",

    date_window_index:
      0,

    next_row_index:
      input.nextRowIndex,

    raw_rows:
      input.nextRowIndex,

    normalized_rows:
      input.nextRowIndex,

    inserted_rows:
      input.nextRowIndex,

    failed_rows:
      0,

    complete:
      input.complete,

    collector: {
      google_version:
        1,

      all_data_version:
        1,

      phase:
        input.phase,

      date_window_index:
        0,

      next_row_index:
        input.nextRowIndex,

      complete:
        input.complete,

      cursor:
        input.cursor,
    },
  };
}

function createJob(
  input: Readonly<{
    insertedRows:
      number;
    checkpoint?:
      Record<string, unknown> |
      null;
    executionContract?:
      unknown;
  }>,
): MediaSyncJobRecord {
  const checkpoint =
    input.checkpoint ??
    null;

  const errorDetail =
    checkpoint
      ? {
          processing_checkpoint:
            checkpoint,
        }
      : null;

  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    report_id:
      "22222222-2222-4222-8222-222222222222",

    workspace_id:
      "33333333-3333-4333-8333-333333333333",

    advertiser_id:
      "44444444-4444-4444-8444-444444444444",

    connection_id:
      "55555555-5555-4555-8555-555555555555",

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
      50,

    raw_rows:
      input.insertedRows,

    normalized_rows:
      input.insertedRows,

    inserted_rows:
      input.insertedRows,

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
      errorDetail,

    created_by:
      "66666666-6666-4666-8666-666666666666",

    created_at:
      "2026-08-28T00:00:00.000Z",

    started_at:
      "2026-08-28T00:00:01.000Z",

    finished_at:
      null,

    updated_at:
      "2026-08-28T00:00:01.000Z",

    execution_contract:
      input.executionContract ===
        undefined
        ? "google_all_data_v1"
        : input.executionContract,
  } as unknown as
    MediaSyncJobRecord;
}

function expectCheckpointError(
  fn:
    () => unknown,
  code:
    string,
): void {
  assert.throws(
    fn,
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsAllDataProcessingCheckpointError &&
      error.code ===
        code,
  );
}

function main():
  void {
  const fresh =
    readGoogleAdsAllDataProcessingCheckpoint(
      createJob({
        insertedRows:
          0,
      }),
    );

  assert.deepEqual(
    fresh,
    {
      hasCheckpoint:
        false,

      dateWindowIndex:
        null,

      phase:
        null,

      cursor:
        null,

      nextRowIndex:
        0,

      complete:
        false,
    },
  );

  console.log(
    "ALL_DATA_FRESH_JOB_NO_CHECKPOINT=PASS",
  );

  const keywordNestedCursor = {
    version:
      1,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    page: {
      version:
        1,

      pageIndex:
        1,

      page:
        "keyword-page-2",
    },
  };

  const keywordCursor =
    createCursor({
      phase:
        "keyword",

      nextRowIndex:
        5,

      phaseCursor:
        keywordNestedCursor,
    });

  const keyword =
    readGoogleAdsAllDataProcessingCheckpoint(
      createJob({
        insertedRows:
          5,

        checkpoint:
          createCheckpoint({
            phase:
              "keyword",

            nextRowIndex:
              5,

            complete:
              false,

            cursor:
              keywordCursor,
          }),
      }),
    );

  assert.equal(
    keyword.hasCheckpoint,
    true,
  );

  assert.equal(
    keyword.phase,
    "keyword",
  );

  assert.equal(
    keyword.nextRowIndex,
    5,
  );

  assert.deepEqual(
    keyword.cursor,
    keywordCursor,
  );

  console.log(
    "ALL_DATA_KEYWORD_CHECKPOINT_READ=PASS",
  );

  const transitionCursor =
    createCursor({
      phase:
        "search_ad",

      nextRowIndex:
        5,

      phaseCursor:
        null,
    });

  const transition =
    readGoogleAdsAllDataProcessingCheckpoint(
      createJob({
        insertedRows:
          5,

        checkpoint:
          createCheckpoint({
            phase:
              "search_ad",

            nextRowIndex:
              5,

            complete:
              false,

            cursor:
              transitionCursor,
          }),
      }),
    );

  assert.equal(
    transition.phase,
    "search_ad",
  );

  assert.equal(
    transition.nextRowIndex,
    5,
  );

  assert.equal(
    transition.cursor
      ?.phaseCursor,
    null,
  );

  console.log(
    "ALL_DATA_ZERO_ROW_PHASE_TRANSITION=PASS",
  );

  const searchAdNestedCursor = {
    version:
      1,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      7,

    page: {
      version:
        1,

      pageIndex:
        1,

      page:
        "search-ad-page-2",
    },
  };

  const searchAdCursor =
    createCursor({
      phase:
        "search_ad",

      nextRowIndex:
        7,

      phaseCursor:
        searchAdNestedCursor,
    });

  const searchAd =
    readGoogleAdsAllDataProcessingCheckpoint(
      createJob({
        insertedRows:
          7,

        checkpoint:
          createCheckpoint({
            phase:
              "search_ad",

            nextRowIndex:
              7,

            complete:
              false,

            cursor:
              searchAdCursor,
          }),
      }),
    );

  assert.equal(
    searchAd.phase,
    "search_ad",
  );

  assert.deepEqual(
    searchAd.cursor,
    searchAdCursor,
  );

  console.log(
    "ALL_DATA_SEARCH_AD_CHECKPOINT_READ=PASS",
  );


  const demandGenNestedCursor = {
    version:
      1,

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      11,

    page: {
      version:
        1,

      pageIndex:
        1,

      page:
        "demand-gen-page-2",
    },
  };

  const demandGenCursor = {
    version:
      1,

    phase:
      "demand_gen_ad",

    externalAccountId:
      ACCOUNT_ID,

    dateWindowIndex:
      0,

    dateFrom:
      DATE,

    dateTo:
      DATE,

    expectedRowStartIndex:
      11,

    phaseCursor:
      demandGenNestedCursor,
  };

  const demandGen =
    readGoogleAdsAllDataProcessingCheckpoint(
      createJob({
        insertedRows:
          11,

        checkpoint:
          createCheckpoint({
            phase:
              "demand_gen_ad" as never,

            nextRowIndex:
              11,

            complete:
              false,

            cursor:
              demandGenCursor,
          }),
      }),
    );

  assert.equal(
    demandGen.hasCheckpoint,
    true,
  );

  assert.equal(
    demandGen.phase,
    "demand_gen_ad",
  );

  assert.equal(
    demandGen.nextRowIndex,
    11,
  );

  assert.deepEqual(
    demandGen.cursor,
    demandGenCursor,
  );

  assert.deepEqual(
    demandGen.cursor
      ?.phaseCursor,
    demandGenNestedCursor,
  );

  console.log(
    "ALL_DATA_DEMAND_GEN_AD_CHECKPOINT_READ=PASS",
  );

  console.log(
    "ALL_DATA_DEMAND_GEN_AD_EXACT_RESUME_CURSOR=PASS",
  );

  const malformedDemandGenCursor = {
    ...demandGenCursor,

    phaseCursor:
      null,
  };

  expectCheckpointError(
    () =>
      readGoogleAdsAllDataProcessingCheckpoint(
        createJob({
          insertedRows:
            11,

          checkpoint:
            createCheckpoint({
              phase:
                "demand_gen_ad" as never,

              nextRowIndex:
                11,

              complete:
                false,

              cursor:
                malformedDemandGenCursor,
            }),
        }),
      ),
    "INVALID_CHECKPOINT",
  );

  console.log(
    "ALL_DATA_DEMAND_GEN_AD_MALFORMED_CURSOR_FAIL_CLOSED=PASS",
  );

  const completed =
    readGoogleAdsAllDataProcessingCheckpoint(
      createJob({
        insertedRows:
          9,

        checkpoint:
          createCheckpoint({
            phase:
              "completed",

            nextRowIndex:
              9,

            complete:
              true,

            cursor:
              null,
          }),
      }),
    );

  assert.equal(
    completed.hasCheckpoint,
    true,
  );

  assert.equal(
    completed.phase,
    "completed",
  );

  assert.equal(
    completed.cursor,
    null,
  );

  assert.equal(
    completed.complete,
    true,
  );

  console.log(
    "ALL_DATA_COMPLETED_CHECKPOINT_READ=PASS",
  );

  const staleCursor =
    createCursor({
      phase:
        "search_ad",

      nextRowIndex:
        6,

      phaseCursor:
        null,
    });

  expectCheckpointError(
    () =>
      readGoogleAdsAllDataProcessingCheckpoint(
        createJob({
          insertedRows:
            7,

          checkpoint:
            createCheckpoint({
              phase:
                "search_ad",

              nextRowIndex:
                7,

              complete:
                false,

              cursor:
                staleCursor,
            }),
        }),
      ),
    "CHECKPOINT_SCOPE_MISMATCH",
  );

  console.log(
    "ALL_DATA_STALE_ROW_BOUNDARY_FAIL_CLOSED=PASS",
  );

  const countMismatch =
    createCheckpoint({
      phase:
        "search_ad",

      nextRowIndex:
        7,

      complete:
        false,

      cursor:
        searchAdCursor,
    });

  countMismatch.raw_rows =
    6;

  expectCheckpointError(
    () =>
      readGoogleAdsAllDataProcessingCheckpoint(
        createJob({
          insertedRows:
            7,

          checkpoint:
            countMismatch,
        }),
      ),
    "INVALID_COUNTS",
  );

  console.log(
    "ALL_DATA_COUNT_MISMATCH_FAIL_CLOSED=PASS",
  );

  expectCheckpointError(
    () =>
      readGoogleAdsAllDataProcessingCheckpoint(
        createJob({
          insertedRows:
            0,

          executionContract:
            null,
        }),
      ),
    "INVALID_JOB",
  );

  console.log(
    "ALL_DATA_LEGACY_JOB_REJECTED=PASS",
  );

  const legacyCheckpoint = {
    version:
      1,

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

      phase:
        "keyword",

      completed_page_count:
        1,

      cursor:
        keywordNestedCursor,
    },
  };

  expectCheckpointError(
    () =>
      readGoogleAdsAllDataProcessingCheckpoint(
        createJob({
          insertedRows:
            1,

          checkpoint:
            legacyCheckpoint,
        }),
      ),
    "INVALID_CHECKPOINT",
  );

  console.log(
    "ALL_DATA_LEGACY_CHECKPOINT_CONFLICT_FAIL_CLOSED=PASS",
  );

  expectCheckpointError(
    () =>
      readGoogleAdsAllDataProcessingCheckpoint(
        createJob({
          insertedRows:
            1,
        }),
      ),
    "INVALID_COUNTS",
  );

  console.log(
    "ALL_DATA_ROWS_WITHOUT_CHECKPOINT_FAIL_CLOSED=PASS",
  );

  console.log(
    "GOOGLE_ADS_ALL_DATA_PROCESSING_CHECKPOINT_READER_FIXTURE=PASS",
  );

  console.log(
    "DB_CALLS=0",
  );

  console.log(
    "GOOGLE_API_CALLS=0",
  );
}

main();

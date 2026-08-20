import assert from "node:assert/strict";
import fs from "node:fs";

import {
  GoogleAdsKeywordProcessingCheckpointError,
  saveGoogleAdsKeywordProcessingCheckpoint,
  type GoogleAdsKeywordCheckpointRpcInvoker,
} from "../src/lib/media-sync/google-ads-keyword-processing-checkpoint-repository";
import type {
  GoogleAdsKeywordStagingOrchestratorResult,
} from "../src/lib/media-sync/google-ads-keyword-staging-orchestrator";
import type {
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const SQL_FILE =
  "scripts/sql/create-save-google-ads-keyword-processing-checkpoint.sql";

const ACCESS_TOKEN_SENTINEL =
  "fixture-access-token-must-never-appear";

const DEVELOPER_TOKEN_SENTINEL =
  "fixture-developer-token-must-never-appear";

type CapturedRpc = {
  functionName: string;
  payload:
    Record<string, unknown>;
};

function makeJob(
  insertedRows = 0,
): MediaSyncJobRecord {
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
      "1234567890",
    status:
      "processing",
    progress:
      0,
    date_from:
      "2026-05-01",
    date_to:
      "2026-05-02",
    raw_rows:
      insertedRows,
    normalized_rows:
      insertedRows,
    inserted_rows:
      insertedRows,
    failed_rows:
      0,
    snapshot_ingestion_id:
      null,
    finished_at:
      null,
    error:
      null,
    error_detail:
      null,
  } as unknown as
    MediaSyncJobRecord;
}

function makePartialResult(
  input: {
    rowStartIndex?: number;
    nextRowIndex?: number;
    pageIndex?: number;
    page?: string;
    dateWindowIndex?: number;
  } = {},
): GoogleAdsKeywordStagingOrchestratorResult {
  const rowStartIndex =
    input.rowStartIndex ??
    0;

  const nextRowIndex =
    input.nextRowIndex ??
    1;

  const pageIndex =
    input.pageIndex ??
    1;

  const dateWindowIndex =
    input.dateWindowIndex ??
    0;

  const cursor = {
    version:
      1 as const,
    externalAccountId:
      "1234567890",
    dateWindowIndex,
    dateFrom:
      "2026-05-01",
    dateTo:
      "2026-05-02",
    page: {
      version:
        1 as const,
      pageIndex,
      page:
        input.page ??
        "fixture-page-2",
    },
  };

  return {
    jobId:
      "11111111-1111-4111-8111-111111111111",
    dateWindowIndex,
    rowStartIndex,
    nextRowIndex,
    runCanonicalRowCount:
      nextRowIndex -
      rowStartIndex,
    canonicalRowCount:
      nextRowIndex,
    status:
      "partial",
    isComplete:
      false,
    collector: {
      rows:
        [],
      status:
        "partial",
      isComplete:
        false,
      cursor:
        cursor.page,
      pageCount:
        1,
      completedPageCount:
        pageIndex,
      requestCount:
        1,
      retryCount:
        0,
    },
    append: {
      submittedRows:
        nextRowIndex -
        rowStartIndex,
      insertedRows:
        nextRowIndex -
        rowStartIndex,
      duplicateRows:
        0,
      firstRowIndex:
        rowStartIndex,
      lastRowIndex:
        nextRowIndex -
        1,
    },
    checkpoint: {
      version:
        1,
      dateWindowIndex,
      nextRowIndex,
      totalRows:
        nextRowIndex,
      failedRows:
        0,
      complete:
        false,
      cursor,
    },
  };
}

function makeCompletedResult(
  rowStartIndex = 1,
  nextRowIndex = 2,
  completedPageCount = 2,
): GoogleAdsKeywordStagingOrchestratorResult {
  return {
    jobId:
      "11111111-1111-4111-8111-111111111111",
    dateWindowIndex:
      0,
    rowStartIndex,
    nextRowIndex,
    runCanonicalRowCount:
      nextRowIndex -
      rowStartIndex,
    canonicalRowCount:
      nextRowIndex,
    status:
      "completed",
    isComplete:
      true,
    collector: {
      rows:
        [],
      status:
        "completed",
      isComplete:
        true,
      cursor:
        null,
      pageCount:
        1,
      completedPageCount,
      requestCount:
        1,
      retryCount:
        0,
    },
    append: {
      submittedRows:
        nextRowIndex -
        rowStartIndex,
      insertedRows:
        nextRowIndex -
        rowStartIndex,
      duplicateRows:
        0,
      firstRowIndex:
        rowStartIndex,
      lastRowIndex:
        nextRowIndex -
        1,
    },
    checkpoint: {
      version:
        1,
      dateWindowIndex:
        0,
      nextRowIndex,
      totalRows:
        nextRowIndex,
      failedRows:
        0,
      complete:
        true,
      cursor:
        null,
    },
  };
}

function makeRpc(
  captured:
    CapturedRpc[],
  updatedJob:
    MediaSyncJobRecord,
): GoogleAdsKeywordCheckpointRpcInvoker {
  return async (
    functionName,
    args,
  ) => {
    captured.push({
      functionName,
      payload:
        args.p_payload as
          Record<string, unknown>,
    });

    return {
      data: [
        updatedJob,
      ],
      error:
        null,
    };
  };
}

function assertNoCredentialLeak(
  value: unknown,
): void {
  const serialized =
    JSON.stringify(
      value,
    );

  assert.equal(
    serialized.includes(
      ACCESS_TOKEN_SENTINEL,
    ),
    false,
  );

  assert.equal(
    serialized.includes(
      DEVELOPER_TOKEN_SENTINEL,
    ),
    false,
  );
}

async function main():
  Promise<void> {
  const partialCalls:
    CapturedRpc[] =
    [];

  const partialResult =
    makePartialResult();

  const partialUpdatedJob = {
    ...makeJob(
      0,
    ),
    raw_rows:
      1,
    normalized_rows:
      1,
    inserted_rows:
      1,
  } as MediaSyncJobRecord;

  const partialSaved =
    await saveGoogleAdsKeywordProcessingCheckpoint(
      {
        job:
          makeJob(
            0,
          ),
        result:
          partialResult,
      },
      {
        invokeRpc:
          makeRpc(
            partialCalls,
            partialUpdatedJob,
          ),
        parseJob:
          value =>
            value as
              MediaSyncJobRecord,
      },
    );

  assert.equal(
    partialSaved.inserted_rows,
    1,
  );

  assert.equal(
    partialCalls.length,
    1,
  );

  assert.equal(
    partialCalls[0]
      ?.functionName,
    "save_google_ads_keyword_processing_checkpoint",
  );

  const partialPayload =
    partialCalls[0]
      ?.payload;

  assert.ok(
    partialPayload,
  );

  assert.equal(
    partialPayload.provider,
    "google_ads",
  );

  assert.equal(
    partialPayload.raw_rows,
    1,
  );

  assert.equal(
    partialPayload.normalized_rows,
    1,
  );

  assert.equal(
    partialPayload.inserted_rows,
    1,
  );

  assert.equal(
    partialPayload.failed_rows,
    0,
  );

  const partialCollector =
    partialPayload.collector as
      Record<string, unknown>;

  assert.equal(
    partialCollector.google_version,
    1,
  );

  assert.equal(
    partialCollector.phase,
    "keyword",
  );

  assert.equal(
    partialCollector.date_window_index,
    0,
  );

  assert.equal(
    partialCollector.next_row_index,
    1,
  );

  assert.equal(
    partialCollector.completed_page_count,
    1,
  );

  assert.equal(
    partialCollector.complete,
    false,
  );

  assert.ok(
    partialCollector.cursor &&
    typeof partialCollector.cursor ===
      "object",
  );

  assertNoCredentialLeak(
    partialPayload,
  );

  console.log(
    "PASS: partial Google checkpoint maps to the dedicated RPC with exact scope and row authority",
  );

  const completedCalls:
    CapturedRpc[] =
    [];

  const completedResult =
    makeCompletedResult();

  await saveGoogleAdsKeywordProcessingCheckpoint(
    {
      job:
        makeJob(
          1,
        ),
      result:
        completedResult,
    },
    {
      invokeRpc:
        makeRpc(
          completedCalls,
          {
            ...makeJob(
              1,
            ),
            raw_rows:
              2,
            normalized_rows:
              2,
            inserted_rows:
              2,
          } as MediaSyncJobRecord,
        ),
      parseJob:
        value =>
          value as
            MediaSyncJobRecord,
    },
  );

  const completedCollector =
    completedCalls[0]
      ?.payload
      .collector as
        Record<string, unknown>;

  assert.equal(
    completedCollector.complete,
    true,
  );

  assert.equal(
    completedCollector.cursor,
    null,
  );

  assert.equal(
    completedCollector.completed_page_count,
    2,
  );

  console.log(
    "PASS: completed Google checkpoint persists no page cursor",
  );

  let wrongProviderRpcCalls =
    0;

  await assert.rejects(
    () =>
      saveGoogleAdsKeywordProcessingCheckpoint(
        {
          job: {
            ...makeJob(
              0,
            ),
            provider:
              "naver_searchad",
          } as MediaSyncJobRecord,
          result:
            makePartialResult(),
        },
        {
          invokeRpc:
            async () => {
              wrongProviderRpcCalls +=
                1;

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
        GoogleAdsKeywordProcessingCheckpointError &&
      error.code ===
        "UNSUPPORTED_PROVIDER",
  );

  assert.equal(
    wrongProviderRpcCalls,
    0,
  );

  console.log(
    "PASS: non-Google job fails before checkpoint RPC",
  );

  let regressionRpcCalls =
    0;

  await assert.rejects(
    () =>
      saveGoogleAdsKeywordProcessingCheckpoint(
        {
          job:
            makeJob(
              2,
            ),
          result:
            makePartialResult({
              rowStartIndex:
                1,
              nextRowIndex:
                1,
            }),
        },
        {
          invokeRpc:
            async () => {
              regressionRpcCalls +=
                1;

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
        GoogleAdsKeywordProcessingCheckpointError &&
      error.code ===
        "CHECKPOINT_REGRESSION",
  );

  assert.equal(
    regressionRpcCalls,
    0,
  );

  console.log(
    "PASS: checkpoint row regression fails before RPC",
  );

  let scopeRpcCalls =
    0;

  const scopeResult =
    makePartialResult();

  assert.ok(
    scopeResult.checkpoint.cursor,
  );

  const badScopeResult = {
    ...scopeResult,
    checkpoint: {
      ...scopeResult.checkpoint,
      cursor: {
        ...scopeResult.checkpoint.cursor,
        externalAccountId:
          "0000000000",
      },
    },
  } as GoogleAdsKeywordStagingOrchestratorResult;

  await assert.rejects(
    () =>
      saveGoogleAdsKeywordProcessingCheckpoint(
        {
          job:
            makeJob(
              0,
            ),
          result:
            badScopeResult,
        },
        {
          invokeRpc:
            async () => {
              scopeRpcCalls +=
                1;

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
        GoogleAdsKeywordProcessingCheckpointError &&
      error.code ===
        "SCOPE_MISMATCH",
  );

  assert.equal(
    scopeRpcCalls,
    0,
  );

  console.log(
    "PASS: cursor account scope mismatch fails before RPC",
  );

  await assert.rejects(
    () =>
      saveGoogleAdsKeywordProcessingCheckpoint(
        {
          job:
            makeJob(
              0,
            ),
          result:
            makePartialResult(),
        },
        {
          invokeRpc:
            async () => ({
              data:
                null,
              error: {
                message:
                  "MSC_CHECKPOINT_REGRESSION",
              },
            }),
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsKeywordProcessingCheckpointError &&
      error.code ===
        "CHECKPOINT_REGRESSION",
  );

  console.log(
    "PASS: RPC checkpoint regression maps to the dedicated fail-closed error",
  );

  const sql =
    fs.readFileSync(
      SQL_FILE,
      "utf8",
    );

  const requiredSqlSignals = [
    "save_google_ads_keyword_processing_checkpoint",
    "v_provider <> 'google_ads'",
    "for update",
    "v_raw_rows <> v_normalized_rows",
    "v_inserted_rows <> v_next_row_index",
    "v_failed_rows <> 0",
    "v_google_version is distinct from 1",
    "v_phase is distinct from 'keyword'",
    "is distinct from\n          v_external_account_id",
    "is distinct from\n          v_date_window_index",
    "is distinct from\n          v_date_from",
    "is distinct from\n          v_date_to",
    "is distinct from 1",
    "is distinct from\n          v_completed_page_count",
    "is distinct from 'object'",
    "v_date_window_index <>",
    "v_existing_date_window_index",
    "v_completed_page_count <>",
    "v_existing_completed_page_count",
    "MSC_CHECKPOINT_REGRESSION",
    "MSC_CHECKPOINT_CONFLICT",
    "from authenticated",
    "from anon",
    "to service_role",
  ];

  for (
    const signal of
    requiredSqlSignals
  ) {
    assert.equal(
      sql.includes(
        signal,
      ),
      true,
      `Missing SQL safety signal: ${signal}`,
    );
  }

  assert.equal(
    sql.includes(
      "  v_page_cursor jsonb;",
    ),
    true,
  );

  assert.equal(
    sql.includes(
      "  v_page_token text;",
    ),
    true,
  );

  assert.equal(
    sql.includes(
      "v_page_token :=\n        nullif(",
    ),
    true,
  );

  assert.equal(
    sql.includes(
      "v_page :=\n        nullif(",
    ),
    false,
  );

  assert.equal(
    sql.includes(
      "create or replace function public.save_media_sync_processing_checkpoint",
    ),
    false,
  );

  assert.equal(
    sql.includes(
      "create or replace function public.save_naver_searchads_combined_processing_checkpoint",
    ),
    false,
  );

  console.log(
    "PASS: SQL creates only the Google checkpoint RPC and preserves Naver checkpoint contracts",
  );

  console.log(
    "GOOGLE_ADS_KEYWORD_PROCESSING_CHECKPOINT_FIXTURE=PASS",
  );

  console.log(
    `INJECTED_CHECKPOINT_RPC_CALLS=${partialCalls.length + completedCalls.length + 1}`,
  );

  console.log(
    "REAL_CHECKPOINT_RPC_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "SQL_EXECUTIONS=0",
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

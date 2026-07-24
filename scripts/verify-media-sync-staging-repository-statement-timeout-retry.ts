import assert from "node:assert/strict";

import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
  type MediaSyncStagingRepositoryRpcInvoker,
  type MediaSyncStagingRepositoryRpcResult,
} from "../src/lib/media-sync/media-sync-staging-repository";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const JOB_FIXTURE: MediaSyncJobRecord = {
  id: "job-statement-timeout-retry",
  workspace_id: "workspace-001",
  advertiser_id: "advertiser-001",
  report_id: "report-001",
  connection_id: "connection-001",
  provider: "naver_searchad",
  external_account_id: "customer-001",
  date_from: "2026-05-01",
  date_to: "2026-05-02",
  data_level: "keyword",
  mode: "snapshot_replace",
  status: "processing",
  progress: 0,
  raw_rows: 0,
  normalized_rows: 0,
  inserted_rows: 0,
  failed_rows: 0,
  previous_ingestion_id: null,
  snapshot_ingestion_id: null,
  attempt_count: 1,
  error: null,
  error_detail: null,
  created_by: "user-001",
  created_at: "2026-07-25T00:00:00.000Z",
  started_at: "2026-07-25T00:01:00.000Z",
  finished_at: null,
  updated_at: "2026-07-25T00:01:00.000Z",
};

const ROW_FIXTURE: EtrylueNormalizedMediaRow = {
  date: "2026-05-01",
  report_date: "2026-05-01",
  day: "2026-05-01",
  ymd: "2026-05-01",

  channel: "검색광고",
  source: "네이버 검색광고",
  platform: "네이버",
  device: "",

  campaign: "Campaign",
  campaign_name: "Campaign",
  group: "Group",
  group_name: "Group",
  adgroup_name: "Group",
  keyword: "Keyword",
  keyword_name: "Keyword",

  impressions: 100,
  clicks: 10,
  cost: 1_000,
  conversions: 1,
  revenue: 2_000,

  row_level: "keyword",
  data_level: "keyword",
  row_level_reason:
    "naver_searchad_registered_keyword_daily_stats",

  provider: "naver_searchad",
  ingestion_source: "api",
  external_account_id: "customer-001",
  external_campaign_id: "campaign-001",
  external_group_id: "group-001",
  external_keyword_id: "keyword-001",

  provider_meta: {
    fixture: true,
  },
};

const SUCCESS_RESULT: MediaSyncStagingRepositoryRpcResult = {
  data: [
    {
      submitted_rows: 1,
      inserted_rows: 1,
      duplicate_rows: 0,
      first_row_index: 40,
      last_row_index: 40,
    },
  ],
  error: null,
};

const STATEMENT_TIMEOUT_ERROR = {
  code: "57014",
  message:
    "canceling statement due to statement timeout",
};

function createInput() {
  return {
    job: structuredClone(JOB_FIXTURE),
    rows: [
      structuredClone(ROW_FIXTURE),
    ],
    rowStartIndex: 40,
    dateWindowIndex: 0,
  };
}

async function expectRepositoryError(input: {
  invokeRpc: MediaSyncStagingRepositoryRpcInvoker;
  expectedCode: MediaSyncStagingRepositoryError["code"];
  expectedCause?: unknown;
  wait?: (delayMs: number) => Promise<void>;
}): Promise<MediaSyncStagingRepositoryError> {
  try {
    await appendMediaSyncStagingBatch(
      createInput(),
      {
        invokeRpc: input.invokeRpc,
        wait:
          input.wait ??
          (async () => undefined),
      },
    );
  } catch (error) {
    if (
      !(error instanceof
        MediaSyncStagingRepositoryError)
    ) {
      throw new Error(
        "Expected MediaSyncStagingRepositoryError.",
        { cause: error },
      );
    }

    assert.equal(
      error.code,
      input.expectedCode,
      "Unexpected staging repository error code.",
    );

    if (input.expectedCause !== undefined) {
      assert.equal(
        error.cause,
        input.expectedCause,
        "Unexpected staging repository error cause.",
      );
    }

    return error;
  }

  throw new Error(
    `Expected ${input.expectedCode}.`,
  );
}

async function verifyTimeoutThenSuccess(): Promise<void> {
  const calls: Array<{
    functionName: string;
    args: { p_payload: unknown };
  }> = [];
  const waits: number[] = [];

  const invokeRpc: MediaSyncStagingRepositoryRpcInvoker =
    async (functionName, args) => {
      calls.push({
        functionName,
        args,
      });

      if (calls.length === 1) {
        return {
          data: null,
          error: STATEMENT_TIMEOUT_ERROR,
        };
      }

      return SUCCESS_RESULT;
    };

  const result =
    await appendMediaSyncStagingBatch(
      createInput(),
      {
        invokeRpc,
        wait: async (delayMs) => {
          waits.push(delayMs);
        },
      },
    );

  assert.deepEqual(
    result,
    {
      submittedRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      firstRowIndex: 40,
      lastRowIndex: 40,
    },
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [250]);
  assert.equal(
    calls[0]?.functionName,
    "append_media_sync_staging_batch",
  );
  assert.equal(
    calls[1]?.functionName,
    "append_media_sync_staging_batch",
  );
  assert.equal(
    calls[0]?.args,
    calls[1]?.args,
    "Retry must reuse the exact same RPC args object.",
  );
  assert.equal(
    calls[0]?.args.p_payload,
    calls[1]?.args.p_payload,
    "Retry must reuse the exact same payload object.",
  );
}

async function verifyThrownTimeoutThenSuccess(): Promise<void> {
  let calls = 0;
  const waits: number[] = [];

  const invokeRpc: MediaSyncStagingRepositoryRpcInvoker =
    async () => {
      calls += 1;

      if (calls === 1) {
        throw STATEMENT_TIMEOUT_ERROR;
      }

      return SUCCESS_RESULT;
    };

  const result =
    await appendMediaSyncStagingBatch(
      createInput(),
      {
        invokeRpc,
        wait: async (delayMs) => {
          waits.push(delayMs);
        },
      },
    );

  assert.equal(calls, 2);
  assert.deepEqual(waits, [250]);
  assert.equal(result.insertedRows, 1);
}

async function verifySecondTimeoutFails(): Promise<void> {
  let calls = 0;
  const waits: number[] = [];
  const secondTimeout = {
    ...STATEMENT_TIMEOUT_ERROR,
  };

  const error =
    await expectRepositoryError({
      invokeRpc: async () => {
        calls += 1;

        return {
          data: null,
          error:
            calls === 1
              ? STATEMENT_TIMEOUT_ERROR
              : secondTimeout,
        };
      },
      expectedCode: "DATABASE_ERROR",
      expectedCause: secondTimeout,
      wait: async (delayMs) => {
        waits.push(delayMs);
      },
    });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [250]);
  assert.equal(
    error.message,
    "The media sync staging batch could not be appended.",
  );
}

async function verifyNonTimeoutErrorsAreNotRetried(): Promise<void> {
  const duplicateError = {
    code: "P0001",
    message: "MSS_DUPLICATE_CONFLICT",
  };
  let duplicateCalls = 0;

  await expectRepositoryError({
    invokeRpc: async () => {
      duplicateCalls += 1;

      return {
        data: null,
        error: duplicateError,
      };
    },
    expectedCode: "DUPLICATE_CONFLICT",
    expectedCause: duplicateError,
  });

  assert.equal(duplicateCalls, 1);

  const databaseError = {
    code: "XX000",
    message: "unexpected database failure",
  };
  let databaseCalls = 0;

  await expectRepositoryError({
    invokeRpc: async () => {
      databaseCalls += 1;

      return {
        data: null,
        error: databaseError,
      };
    },
    expectedCode: "DATABASE_ERROR",
    expectedCause: databaseError,
  });

  assert.equal(databaseCalls, 1);
}

async function main(): Promise<void> {
  await verifyTimeoutThenSuccess();
  await verifyThrownTimeoutThenSuccess();
  await verifySecondTimeoutFails();
  await verifyNonTimeoutErrorsAreNotRetried();

  console.log(
    "statement timeout retry verification passed: true",
  );
}

void main();
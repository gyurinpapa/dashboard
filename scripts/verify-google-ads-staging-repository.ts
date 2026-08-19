// scripts/verify-google-ads-staging-repository.ts

import assert from "node:assert/strict";

import {
  convertGoogleAdsKeywordDailyStatsToCanonicalRows,
} from "../src/lib/media-sync/google-ads-canonical-row";
import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const GOOGLE_ADS_PROVIDER =
  "google_ads" as const;

const GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON =
  "google_ads_keyword_daily_stats" as const;

const BASE_INPUT = {
  externalAccountId: "1234567890",
  campaign: {
    id: "1001",
    name: "Fixture Search Campaign",
  },
  adGroup: {
    id: "2001",
    campaignId: "1001",
    name: "Fixture Search Ad Group",
  },
  keyword: {
    id: "3001",
    adGroupId: "2001",
    text: "fixture keyword",
  },
  records: [
    {
      date: "2026-05-01",
      keywordId: "3001",
      impressions: 100,
      clicks: 10,
      cost: 12000,
      conversions: 2,
      revenue: 32000,
    },
  ],
} as const;

const GOOGLE_JOB = {
  id: "11111111-1111-4111-8111-111111111111",
  report_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
  advertiser_id: "44444444-4444-4444-8444-444444444444",
  connection_id: "55555555-5555-4555-8555-555555555555",
  provider: GOOGLE_ADS_PROVIDER,
  external_account_id: "1234567890",
  status: "processing",
  date_from: "2026-05-01",
  date_to: "2026-05-01",
  started_at: "2026-08-19T00:00:00.000Z",
  attempt_count: 1,
} as unknown as MediaSyncJobRecord;

type CapturedRpc = {
  functionName: string;
  payload: Record<string, unknown>;
};

function successfulRpc(
  captured: CapturedRpc[],
): MediaSyncStagingRepositoryRpcInvoker {
  return async (
    functionName,
    args,
  ) => {
    assert.equal(
      typeof args,
      "object",
    );

    const payload =
      (args as {
        p_payload: unknown;
      }).p_payload;

    assert.ok(
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload),
    );

    captured.push({
      functionName,
      payload:
        payload as Record<string, unknown>,
    });

    return {
      data: [
        {
          submitted_rows: 1,
          inserted_rows: 1,
          duplicate_rows: 0,
          first_row_index: 0,
          last_row_index: 0,
        },
      ],
      error: null,
    };
  };
}

async function expectRepositoryErrorBeforeRpc(input: {
  job?: MediaSyncJobRecord;
  row: EtrylueNormalizedMediaRow;
  expectedCode:
    MediaSyncStagingRepositoryError["code"];
}): Promise<void> {
  let rpcCalls = 0;

  await assert.rejects(
    () =>
      appendMediaSyncStagingBatch(
        {
          job:
            input.job ??
            GOOGLE_JOB,
          rows: [
            input.row,
          ],
          rowStartIndex: 0,
          dateWindowIndex: 0,
        },
        {
          invokeRpc:
            async () => {
              rpcCalls += 1;

              return {
                data: null,
                error: null,
              };
            },
          wait:
            async () => {
              throw new Error(
                "WAIT_MUST_NOT_RUN",
              );
            },
        },
      ),
    (error: unknown) =>
      error instanceof
        MediaSyncStagingRepositoryError &&
      error.code ===
        input.expectedCode,
  );

  assert.equal(
    rpcCalls,
    0,
    "Rejected Google staging input reached the RPC boundary.",
  );
}

async function main(): Promise<void> {
  const [row] =
    convertGoogleAdsKeywordDailyStatsToCanonicalRows(
      BASE_INPUT,
    );

  assert.ok(row);

  const captured: CapturedRpc[] = [];

  const result =
    await appendMediaSyncStagingBatch(
      {
        job: GOOGLE_JOB,
        rows: [row],
        rowStartIndex: 0,
        dateWindowIndex: 0,
      },
      {
        invokeRpc:
          successfulRpc(captured),
        wait:
          async () => {
            throw new Error(
              "WAIT_MUST_NOT_RUN",
            );
          },
      },
    );

  assert.deepEqual(
    result,
    {
      submittedRows: 1,
      insertedRows: 1,
      duplicateRows: 0,
      firstRowIndex: 0,
      lastRowIndex: 0,
    },
  );

  assert.equal(
    captured.length,
    1,
  );

  const [{ functionName, payload }] =
    captured;

  assert.equal(
    functionName,
    "append_media_sync_staging_batch",
  );

  assert.equal(
    payload.provider,
    GOOGLE_ADS_PROVIDER,
  );

  assert.equal(
    payload.external_account_id,
    "1234567890",
  );

  assert.equal(
    "report_id" in payload,
    false,
    "The existing optional report_id RPC payload contract changed.",
  );

  assert.ok(
    Array.isArray(payload.rows),
  );

  const [rpcRow] =
    payload.rows as Array<
      Record<string, unknown>
    >;

  assert.ok(rpcRow);

  assert.equal(
    rpcRow.row_key,
    JSON.stringify([
      "google_ads",
      "1234567890",
      "1001",
      "2001",
      "3001",
      "2026-05-01",
    ]),
  );

  const canonicalPayload =
    rpcRow.row as
      EtrylueNormalizedMediaRow;

  assert.equal(
    canonicalPayload.provider,
    GOOGLE_ADS_PROVIDER,
  );

  assert.equal(
    canonicalPayload.row_level,
    "keyword",
  );

  assert.equal(
    canonicalPayload.data_level,
    "keyword",
  );

  assert.equal(
    canonicalPayload.row_level_reason,
    GOOGLE_ADS_KEYWORD_ROW_LEVEL_REASON,
  );

  for (const level of [
    "creative",
    "mixed",
  ] as const) {
    await expectRepositoryErrorBeforeRpc({
      row: {
        ...row,
        row_level: level,
        data_level: level,
      },
      expectedCode:
        "INVALID_INPUT",
    });
  }

  await expectRepositoryErrorBeforeRpc({
    row: {
      ...row,
      row_level_reason:
        "verification_fixture",
    },
    expectedCode:
      "INVALID_INPUT",
  });

  await expectRepositoryErrorBeforeRpc({
    job: {
      ...GOOGLE_JOB,
      provider:
        "meta_ads",
    } as unknown as MediaSyncJobRecord,
    row: {
      ...row,
      provider:
        "meta_ads",
    } as EtrylueNormalizedMediaRow,
    expectedCode:
      "UNSUPPORTED_PROVIDER",
  });

  console.log(
    "GOOGLE_ADS_STAGING_REPOSITORY_FIXTURE=PASS",
  );
  console.log(
    "verified Google provider reaches injected RPC: true",
  );
  console.log(
    "verified Google keyword-only row contract before RPC: true",
  );
  console.log(
    "verified exact Google row_level_reason before RPC: true",
  );
  console.log(
    "verified Google creative/mixed rows blocked before RPC: true",
  );
  console.log(
    "verified unsupported provider blocked before RPC: true",
  );
  console.log(
    "verified report_id remains omitted from RPC payload: true",
  );
  console.log(
    "verified real database writes: 0",
  );
  console.log(
    "verified Google API calls: 0",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

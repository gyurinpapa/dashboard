import assert from "node:assert/strict";

import {
  collectGoogleAdsKeywordStats,
} from "../src/lib/media-sync/google-ads-keyword-stats-collector";
import {
  appendMediaSyncStagingBatch,
  MediaSyncStagingRepositoryError,
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import {
  buildMediaSyncStagingRowKey,
} from "../src/lib/media-sync/media-sync-staging-row-identity";
import type {
  EtrylueNormalizedMediaRow,
  MediaSyncJobRecord,
} from "../src/lib/media-sync/types";

const ACCESS_TOKEN =
  "fixture-access-token";

const DEVELOPER_TOKEN =
  "fixture-developer-token";

const TARGET_CUSTOMER_ID =
  "1234567890";

const LOGIN_CUSTOMER_ID =
  "9876543210";

const ROW_START_INDEX = 40;
const DATE_WINDOW_INDEX = 7;

const GOOGLE_JOB = {
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
    TARGET_CUSTOMER_ID,
  status:
    "processing",
  date_from:
    "2026-05-01",
  date_to:
    "2026-05-02",
  started_at:
    "2026-08-20T00:00:00.000Z",
  attempt_count:
    1,
} as unknown as MediaSyncJobRecord;

type CapturedRpc = {
  functionName: string;
  payload: Record<string, unknown>;
};

function makeGoogleRow(
  date: string,
  input: {
    impressions: string;
    clicks: string;
    costMicros: string;
    conversions: number;
    conversionsValue: number;
  },
) {
  return {
    campaign: {
      id: "1001",
      name: "Fixture Search Campaign",
    },
    adGroup: {
      id: "2001",
      name: "Fixture Search Ad Group",
    },
    adGroupCriterion: {
      criterionId: "3001",
      keyword: {
        text: "fixture keyword",
      },
    },
    segments: {
      date,
    },
    metrics: {
      impressions:
        input.impressions,
      clicks:
        input.clicks,
      costMicros:
        input.costMicros,
      conversions:
        input.conversions,
      conversionsValue:
        input.conversionsValue,
    },
  };
}

function makeSearchResponse(
  rows: unknown[],
  nextPageToken?: string,
): Response {
  return new Response(
    JSON.stringify({
      results: rows,
      ...(nextPageToken
        ? {
            nextPageToken,
          }
        : {}),
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json",
        "request-id":
          "fixture-google-request",
      },
    },
  );
}

function successfulRpc(
  captured: CapturedRpc[],
): MediaSyncStagingRepositoryRpcInvoker {
  return async (
    functionName,
    args,
  ) => {
    const payload =
      args.p_payload;

    assert.ok(
      payload &&
        typeof payload ===
          "object" &&
        !Array.isArray(
          payload,
        ),
      "RPC payload must be a plain object.",
    );

    captured.push({
      functionName,
      payload:
        payload as Record<
          string,
          unknown
        >,
    });

    return {
      data: [
        {
          submitted_rows: 2,
          inserted_rows: 2,
          duplicate_rows: 0,
          first_row_index:
            ROW_START_INDEX,
          last_row_index:
            ROW_START_INDEX + 1,
        },
      ],
      error: null,
    };
  };
}

function assertCanonicalRow(
  row:
    EtrylueNormalizedMediaRow,
  date: string,
  expected: {
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
  },
): void {
  assert.equal(
    row.provider,
    "google_ads",
  );

  assert.equal(
    row.ingestion_source,
    "api",
  );

  assert.equal(
    row.row_level,
    "keyword",
  );

  assert.equal(
    row.data_level,
    "keyword",
  );

  assert.equal(
    row.row_level_reason,
    "google_ads_keyword_daily_stats",
  );

  assert.equal(
    row.external_account_id,
    TARGET_CUSTOMER_ID,
  );

  assert.equal(
    row.external_campaign_id,
    "1001",
  );

  assert.equal(
    row.external_group_id,
    "2001",
  );

  assert.equal(
    row.external_keyword_id,
    "3001",
  );

  assert.equal(
    row.date,
    date,
  );

  assert.equal(
    row.impressions,
    expected.impressions,
  );

  assert.equal(
    row.clicks,
    expected.clicks,
  );

  assert.equal(
    row.cost,
    expected.cost,
  );

  assert.equal(
    row.conversions,
    expected.conversions,
  );

  assert.equal(
    row.revenue,
    expected.revenue,
  );
}

function assertNoSecrets(
  value: unknown,
): void {
  const serialized =
    JSON.stringify(value);

  assert(
    !serialized.includes(
      ACCESS_TOKEN,
    ),
    "Access token reached staging payload.",
  );

  assert(
    !serialized.includes(
      DEVELOPER_TOKEN,
    ),
    "Developer token reached staging payload.",
  );
}

async function main(): Promise<void> {
  let googleFetchCalls = 0;

  const collection =
    await collectGoogleAdsKeywordStats(
      {
        accessToken:
          ACCESS_TOKEN,
        developerToken:
          DEVELOPER_TOKEN,
        targetCustomerId:
          TARGET_CUSTOMER_ID,
        loginCustomerId:
          LOGIN_CUSTOMER_ID,
        startDate:
          "2026-05-01",
        endDate:
          "2026-05-02",
      },
      {
        fetchImpl:
          async (
            input,
            init,
          ) => {
            googleFetchCalls += 1;

            assert.equal(
              String(input),
              "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search",
            );

            const headers =
              new Headers(
                init?.headers,
              );

            assert.equal(
              headers.get(
                "authorization",
              ),
              `Bearer ${ACCESS_TOKEN}`,
            );

            assert.equal(
              headers.get(
                "developer-token",
              ),
              DEVELOPER_TOKEN,
            );

            assert.equal(
              headers.get(
                "login-customer-id",
              ),
              LOGIN_CUSTOMER_ID,
            );

            const requestBody =
              JSON.parse(
                String(
                  init?.body,
                ),
              ) as Record<
                string,
                unknown
              >;

            assert.equal(
              "pageSize" in
                requestBody,
              false,
            );

            if (
              googleFetchCalls ===
              1
            ) {
              /*
               * Deliberately return the later date first.
               * The collector must still produce deterministic
               * canonical date ordering before staging.
               */
              assert.equal(
                requestBody.pageToken,
                undefined,
              );

              return makeSearchResponse(
                [
                  makeGoogleRow(
                    "2026-05-02",
                    {
                      impressions:
                        "200",
                      clicks:
                        "20",
                      costMicros:
                        "2500000",
                      conversions:
                        3,
                      conversionsValue:
                        800,
                    },
                  ),
                ],
                "page-2",
              );
            }

            assert.equal(
              requestBody.pageToken,
              "page-2",
            );

            return makeSearchResponse(
              [
                makeGoogleRow(
                  "2026-05-01",
                  {
                    impressions:
                      "100",
                    clicks:
                      "10",
                    costMicros:
                      "1234567",
                    conversions:
                      2.5,
                    conversionsValue:
                      456.75,
                  },
                ),
              ],
            );
          },
        sleepImpl:
          async () => {
            throw new Error(
              "COLLECTOR_RETRY_SLEEP_MUST_NOT_RUN",
            );
          },
        randomImpl:
          () => 0,
      },
      {
        requestTimeoutMs:
          1_000,
      },
    );

  assert.equal(
    googleFetchCalls,
    2,
  );

  assert.equal(
    collection.pageCount,
    2,
  );

  assert.equal(
    collection.requestCount,
    2,
  );

  assert.equal(
    collection.retryCount,
    0,
  );

  assert.equal(
    collection.rows.length,
    2,
  );

  const [
    firstRow,
    secondRow,
  ] = collection.rows;

  assert.ok(firstRow);
  assert.ok(secondRow);

  assertCanonicalRow(
    firstRow,
    "2026-05-01",
    {
      impressions: 100,
      clicks: 10,
      cost: 1.234567,
      conversions: 2.5,
      revenue: 456.75,
    },
  );

  assertCanonicalRow(
    secondRow,
    "2026-05-02",
    {
      impressions: 200,
      clicks: 20,
      cost: 2.5,
      conversions: 3,
      revenue: 800,
    },
  );

  console.log(
    "PASS: H-5D collector produces deterministic canonical keyword rows across pagination",
  );

  const firstKey =
    buildMediaSyncStagingRowKey(
      firstRow,
    );

  const secondKey =
    buildMediaSyncStagingRowKey(
      secondRow,
    );

  assert.equal(
    firstKey,
    JSON.stringify([
      "google_ads",
      TARGET_CUSTOMER_ID,
      "1001",
      "2001",
      "3001",
      "2026-05-01",
    ]),
  );

  assert.equal(
    secondKey,
    JSON.stringify([
      "google_ads",
      TARGET_CUSTOMER_ID,
      "1001",
      "2001",
      "3001",
      "2026-05-02",
    ]),
  );

  assert.notEqual(
    firstKey,
    secondKey,
  );

  console.log(
    "PASS: collector rows enter the unchanged Google keyword staging identity contract",
  );

  const captured:
    CapturedRpc[] = [];

  const appendResult =
    await appendMediaSyncStagingBatch(
      {
        job:
          GOOGLE_JOB,
        rows:
          collection.rows,
        rowStartIndex:
          ROW_START_INDEX,
        dateWindowIndex:
          DATE_WINDOW_INDEX,
      },
      {
        invokeRpc:
          successfulRpc(
            captured,
          ),
        wait:
          async () => {
            throw new Error(
              "STAGING_RETRY_WAIT_MUST_NOT_RUN",
            );
          },
      },
    );

  assert.deepEqual(
    appendResult,
    {
      submittedRows: 2,
      insertedRows: 2,
      duplicateRows: 0,
      firstRowIndex:
        ROW_START_INDEX,
      lastRowIndex:
        ROW_START_INDEX + 1,
    },
  );

  assert.equal(
    captured.length,
    1,
  );

  const [
    rpcCall,
  ] = captured;

  assert.ok(rpcCall);

  assert.equal(
    rpcCall.functionName,
    "append_media_sync_staging_batch",
  );

  const payload =
    rpcCall.payload;

  assert.equal(
    payload.job_id,
    GOOGLE_JOB.id,
  );

  assert.equal(
    payload.workspace_id,
    GOOGLE_JOB.workspace_id,
  );

  assert.equal(
    payload.advertiser_id,
    GOOGLE_JOB.advertiser_id,
  );

  assert.equal(
    payload.connection_id,
    GOOGLE_JOB.connection_id,
  );

  assert.equal(
    payload.provider,
    "google_ads",
  );

  assert.equal(
    payload.external_account_id,
    TARGET_CUSTOMER_ID,
  );

  assert.equal(
    payload.date_from,
    "2026-05-01",
  );

  assert.equal(
    payload.date_to,
    "2026-05-02",
  );

  assert.equal(
    payload.date_window_index,
    DATE_WINDOW_INDEX,
  );

  assert.equal(
    "report_id" in payload,
    false,
  );

  assert.ok(
    Array.isArray(
      payload.rows,
    ),
  );

  const rpcRows =
    payload.rows as Array<
      Record<
        string,
        unknown
      >
    >;

  assert.equal(
    rpcRows.length,
    2,
  );

  const [
    firstRpcRow,
    secondRpcRow,
  ] = rpcRows;

  assert.ok(
    firstRpcRow,
  );

  assert.ok(
    secondRpcRow,
  );

  assert.equal(
    firstRpcRow.row_index,
    ROW_START_INDEX,
  );

  assert.equal(
    secondRpcRow.row_index,
    ROW_START_INDEX + 1,
  );

  assert.equal(
    firstRpcRow.row_key,
    firstKey,
  );

  assert.equal(
    secondRpcRow.row_key,
    secondKey,
  );

  assert.equal(
    firstRpcRow.date,
    "2026-05-01",
  );

  assert.equal(
    secondRpcRow.date,
    "2026-05-02",
  );

  assert.equal(
    firstRpcRow.channel,
    "검색광고",
  );

  assert.equal(
    firstRpcRow.source,
    "Google Ads",
  );

  assert.equal(
    firstRpcRow.device,
    "",
  );

  assert.deepEqual(
    firstRpcRow.row,
    firstRow,
  );

  assert.deepEqual(
    secondRpcRow.row,
    secondRow,
  );

  assertNoSecrets(
    payload,
  );

  console.log(
    "PASS: collector rows hand off directly to one injected staging RPC with exact scope and row indexes",
  );

  console.log(
    "PASS: OAuth and developer credentials are absent from the staging payload",
  );

  let mismatchRpcCalls =
    0;

  await assert.rejects(
    () =>
      appendMediaSyncStagingBatch(
        {
          job: {
            ...GOOGLE_JOB,
            external_account_id:
              "1111111111",
          } as MediaSyncJobRecord,
          rows: [
            firstRow,
          ],
          rowStartIndex:
            ROW_START_INDEX,
          dateWindowIndex:
            DATE_WINDOW_INDEX,
        },
        {
          invokeRpc:
            async () => {
              mismatchRpcCalls +=
                1;

              return {
                data: null,
                error: null,
              };
            },
          wait:
            async () => {
              throw new Error(
                "MISMATCH_WAIT_MUST_NOT_RUN",
              );
            },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        MediaSyncStagingRepositoryError &&
      error.code ===
        "SCOPE_MISMATCH",
  );

  assert.equal(
    mismatchRpcCalls,
    0,
  );

  console.log(
    "PASS: collector/staging account scope mismatch fails before RPC",
  );

  console.log(
    "GOOGLE_ADS_KEYWORD_STAGING_HANDOFF_FIXTURE=PASS",
  );

  console.log(
    "INJECTED_GOOGLE_FETCH_CALLS=2",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "INJECTED_STAGING_RPC_CALLS=1",
  );

  console.log(
    "REAL_STAGING_RPC_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "WORKER_RUNTIME_CHANGES=0",
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

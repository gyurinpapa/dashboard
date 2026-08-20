import assert from "node:assert/strict";

import {
  GoogleAdsKeywordStatsCollectorError,
} from "../src/lib/media-sync/google-ads-keyword-stats-collector";
import {
  runGoogleAdsKeywordStagingOrchestrator,
  GoogleAdsKeywordStagingOrchestratorError,
} from "../src/lib/media-sync/google-ads-keyword-staging-orchestrator";
import {
  MediaSyncStagingRepositoryError,
  type MediaSyncStagingRepositoryRpcInvoker,
} from "../src/lib/media-sync/media-sync-staging-repository";
import type {
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

const DATE_WINDOW_INDEX =
  7;

type CapturedStagingCall = {
  functionName: string;
  payload:
    Record<string, unknown>;
};

function makeJob(
  rowCount: number,
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
      TARGET_CUSTOMER_ID,
    status:
      "processing",
    progress:
      0,
    date_from:
      "2026-05-01",
    date_to:
      "2026-05-02",
    raw_rows:
      rowCount,
    normalized_rows:
      rowCount,
    inserted_rows:
      rowCount,
    failed_rows:
      0,
    snapshot_ingestion_id:
      null,
    error:
      null,
    error_detail:
      null,
    requested_by:
      null,
    attempt_count:
      1,
    started_at:
      "2026-08-20T00:00:00.000Z",
    finished_at:
      null,
    created_at:
      "2026-08-20T00:00:00.000Z",
    updated_at:
      "2026-08-20T00:00:00.000Z",
  } as unknown as MediaSyncJobRecord;
}

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
      id:
        "1001",
      name:
        "Fixture Search Campaign",
    },
    adGroup: {
      id:
        "2001",
      name:
        "Fixture Search Ad Group",
    },
    adGroupCriterion: {
      criterionId:
        "3001",
      keyword: {
        text:
          "fixture keyword",
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
  nextPage?: string,
): Response {
  return new Response(
    JSON.stringify({
      results:
        rows,
      ...(nextPage
        ? {
            nextPageToken:
              nextPage,
          }
        : {}),
    }),
    {
      status:
        200,
      headers: {
        "Content-Type":
          "application/json",
        "request-id":
          "fixture-google-request",
      },
    },
  );
}

function readRequestBody(
  init:
    RequestInit |
    undefined,
): Record<string, unknown> {
  return JSON.parse(
    String(
      init?.body,
    ),
  ) as Record<string, unknown>;
}

function assertNoSecretValues(
  value: unknown,
): void {
  const serialized =
    JSON.stringify(
      value,
    );

  assert.equal(
    serialized.includes(
      ACCESS_TOKEN,
    ),
    false,
    "Access token leaked outside the Google request boundary.",
  );

  assert.equal(
    serialized.includes(
      DEVELOPER_TOKEN,
    ),
    false,
    "Developer token leaked outside the Google request boundary.",
  );
}

function stagingRpc(input: {
  captured:
    CapturedStagingCall[];
  duplicate?: boolean;
  fail?: boolean;
}):
  MediaSyncStagingRepositoryRpcInvoker {
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
      "Staging payload must be a plain object.",
    );

    const typedPayload =
      payload as
        Record<string, unknown>;

    input.captured.push({
      functionName,
      payload:
        typedPayload,
    });

    if (input.fail) {
      return {
        data:
          null,
        error: {
          message:
            "FIXTURE_STAGING_FAILURE",
        },
      };
    }

    assert.ok(
      Array.isArray(
        typedPayload.rows,
      ),
      "Staging rows must be an array.",
    );

    const rows =
      typedPayload.rows as
        Array<
          Record<
            string,
            unknown
          >
        >;

    const firstRowIndex =
      rows.length > 0
        ? rows[0]
            ?.row_index ??
          null
        : null;

    const lastRowIndex =
      rows.length > 0
        ? rows[
            rows.length -
            1
          ]?.row_index ??
          null
        : null;

    return {
      data: [
        {
          submitted_rows:
            rows.length,
          inserted_rows:
            input.duplicate
              ? 0
              : rows.length,
          duplicate_rows:
            input.duplicate
              ? rows.length
              : 0,
          first_row_index:
            firstRowIndex,
          last_row_index:
            lastRowIndex,
        },
      ],
      error:
        null,
    };
  };
}

async function main():
  Promise<void> {
  const primaryStagingCalls:
    CapturedStagingCall[] =
    [];

  let primaryFetchCalls =
    0;

  const primaryFetch:
    typeof fetch =
    async (
      request,
      init,
    ) => {
      primaryFetchCalls +=
        1;

      assert.match(
        String(
          request,
        ),
        /\/v25\/customers\/1234567890\/googleAds:search$/,
      );

      const body =
        readRequestBody(
          init,
        );

      assert.equal(
        "pageSize" in
          body,
        false,
      );

      if (
        primaryFetchCalls ===
        1
      ) {
        assert.equal(
          body.pageToken,
          undefined,
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
          "page-2",
        );
      }

      if (
        primaryFetchCalls ===
        2
      ) {
        assert.equal(
          body.pageToken,
          "page-2",
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
        );
      }

      throw new Error(
        "UNEXPECTED_PRIMARY_GOOGLE_FETCH",
      );
    };

  const first =
    await runGoogleAdsKeywordStagingOrchestrator(
      {
        job:
          makeJob(
            0,
          ),
        accessToken:
          ACCESS_TOKEN,
        developerToken:
          DEVELOPER_TOKEN,
        loginCustomerId:
          LOGIN_CUSTOMER_ID,
        dateWindowIndex:
          DATE_WINDOW_INDEX,
        collectorDependencies: {
          fetchImpl:
            primaryFetch,
          sleepImpl:
            async () => {
              throw new Error(
                "PRIMARY_RETRY_SLEEP_MUST_NOT_RUN",
              );
            },
          randomImpl:
            () => 0,
        },
        collectorOptions: {
          requestTimeoutMs:
            1_000,
        },
        stagingRepositoryDependencies: {
          invokeRpc:
            stagingRpc({
              captured:
                primaryStagingCalls,
            }),
          wait:
            async () => {
              throw new Error(
                "PRIMARY_STAGING_RETRY_WAIT_MUST_NOT_RUN",
              );
            },
        },
      },
    );

  assert.equal(
    primaryFetchCalls,
    1,
    "The first bounded invocation must execute exactly one Google page.",
  );

  assert.equal(
    first.status,
    "partial",
  );

  assert.equal(
    first.isComplete,
    false,
  );

  assert.equal(
    first.rowStartIndex,
    0,
  );

  assert.equal(
    first.nextRowIndex,
    1,
  );

  assert.equal(
    first.runCanonicalRowCount,
    1,
  );

  assert.equal(
    first.canonicalRowCount,
    1,
  );

  assert.equal(
    first.collector.pageCount,
    1,
  );

  assert.equal(
    first.collector.completedPageCount,
    1,
  );

  assert.equal(
    first.append.submittedRows,
    1,
  );

  assert.equal(
    first.append.insertedRows,
    1,
  );

  assert.equal(
    first.append.duplicateRows,
    0,
  );

  const resumeCursor =
    first.checkpoint.cursor;

  assert.ok(
    resumeCursor,
    "The partial result must return a resume cursor.",
  );

  assert.equal(
    resumeCursor.externalAccountId,
    TARGET_CUSTOMER_ID,
  );

  assert.equal(
    resumeCursor.dateWindowIndex,
    DATE_WINDOW_INDEX,
  );

  assert.equal(
    resumeCursor.page.pageIndex,
    1,
  );

  assert.equal(
    resumeCursor.page.page,
    "page-2",
  );

  assertNoSecretValues(
    first.checkpoint,
  );

  console.log(
    "PASS: first invocation fetches and stages exactly one Google Search page",
  );

  const second =
    await runGoogleAdsKeywordStagingOrchestrator(
      {
        job:
          makeJob(
            1,
          ),
        accessToken:
          ACCESS_TOKEN,
        developerToken:
          DEVELOPER_TOKEN,
        loginCustomerId:
          LOGIN_CUSTOMER_ID,
        dateWindowIndex:
          DATE_WINDOW_INDEX,
        cursor:
          resumeCursor,
        collectorDependencies: {
          fetchImpl:
            primaryFetch,
          sleepImpl:
            async () => {
              throw new Error(
                "PRIMARY_RETRY_SLEEP_MUST_NOT_RUN",
              );
            },
          randomImpl:
            () => 0,
        },
        collectorOptions: {
          requestTimeoutMs:
            1_000,
        },
        stagingRepositoryDependencies: {
          invokeRpc:
            stagingRpc({
              captured:
                primaryStagingCalls,
            }),
          wait:
            async () => {
              throw new Error(
                "PRIMARY_STAGING_RETRY_WAIT_MUST_NOT_RUN",
              );
            },
        },
      },
    );

  assert.equal(
    primaryFetchCalls,
    2,
  );

  assert.equal(
    second.status,
    "completed",
  );

  assert.equal(
    second.isComplete,
    true,
  );

  assert.equal(
    second.rowStartIndex,
    1,
  );

  assert.equal(
    second.nextRowIndex,
    2,
  );

  assert.equal(
    second.canonicalRowCount,
    2,
  );

  assert.equal(
    second.collector.completedPageCount,
    2,
  );

  assert.equal(
    second.checkpoint.cursor,
    null,
  );

  assert.equal(
    second.checkpoint.complete,
    true,
  );

  assertNoSecretValues(
    second.checkpoint,
  );

  assert.equal(
    primaryStagingCalls.length,
    2,
  );

  const firstPayload =
    primaryStagingCalls[0]
      ?.payload;

  const secondPayload =
    primaryStagingCalls[1]
      ?.payload;

  assert.ok(
    firstPayload,
  );

  assert.ok(
    secondPayload,
  );

  assert.equal(
    firstPayload.provider,
    "google_ads",
  );

  assert.equal(
    secondPayload.provider,
    "google_ads",
  );

  assert.equal(
    firstPayload.external_account_id,
    TARGET_CUSTOMER_ID,
  );

  assert.equal(
    secondPayload.external_account_id,
    TARGET_CUSTOMER_ID,
  );

  assert.equal(
    firstPayload.date_window_index,
    DATE_WINDOW_INDEX,
  );

  assert.equal(
    secondPayload.date_window_index,
    DATE_WINDOW_INDEX,
  );

  const firstRows =
    firstPayload.rows as
      Array<
        Record<
          string,
          unknown
        >
      >;

  const secondRows =
    secondPayload.rows as
      Array<
        Record<
          string,
          unknown
        >
      >;

  assert.equal(
    firstRows.length,
    1,
  );

  assert.equal(
    secondRows.length,
    1,
  );

  assert.equal(
    firstRows[0]
      ?.row_index,
    0,
  );

  assert.equal(
    secondRows[0]
      ?.row_index,
    1,
  );

  assert.equal(
    firstRows[0]
      ?.date,
    "2026-05-01",
  );

  assert.equal(
    secondRows[0]
      ?.date,
    "2026-05-02",
  );

  assertNoSecretValues(
    firstPayload,
  );

  assertNoSecretValues(
    secondPayload,
  );

  console.log(
    "PASS: partial resume continues at the exact next row and page boundary",
  );

  const retryStagingCalls:
    CapturedStagingCall[] =
    [];

  let retryFetchCalls =
    0;

  const retry =
    await runGoogleAdsKeywordStagingOrchestrator(
      {
        job:
          makeJob(
            0,
          ),
        accessToken:
          ACCESS_TOKEN,
        developerToken:
          DEVELOPER_TOKEN,
        loginCustomerId:
          LOGIN_CUSTOMER_ID,
        dateWindowIndex:
          DATE_WINDOW_INDEX,
        collectorDependencies: {
          fetchImpl:
            async (
              _request,
              init,
            ) => {
              retryFetchCalls +=
                1;

              const body =
                readRequestBody(
                  init,
                );

              assert.equal(
                body.pageToken,
                undefined,
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
                "page-2",
              );
            },
          sleepImpl:
            async () => {
              throw new Error(
                "RETRY_SLEEP_MUST_NOT_RUN",
              );
            },
          randomImpl:
            () => 0,
        },
        stagingRepositoryDependencies: {
          invokeRpc:
            stagingRpc({
              captured:
                retryStagingCalls,
              duplicate:
                true,
            }),
          wait:
            async () => {
              throw new Error(
                "RETRY_STAGING_WAIT_MUST_NOT_RUN",
              );
            },
        },
      },
    );

  assert.equal(
    retryFetchCalls,
    1,
  );

  assert.equal(
    retry.nextRowIndex,
    1,
  );

  assert.equal(
    retry.append.insertedRows,
    0,
  );

  assert.equal(
    retry.append.duplicateRows,
    1,
  );

  assert.deepEqual(
    retry.checkpoint.cursor,
    resumeCursor,
  );

  assertNoSecretValues(
    retry.checkpoint,
  );

  console.log(
    "PASS: replay of an uncheckpointed page preserves row boundary and resume cursor",
  );

  let pageTokenErrorFetchCalls =
    0;

  let pageTokenErrorSleepCalls =
    0;

  let pageTokenErrorStagingCalls =
    0;

  for (
    const requestError of [
      "EXPIRED_PAGE_TOKEN",
      "INVALID_PAGE_TOKEN",
    ] as const
  ) {
    await assert.rejects(
      () =>
        runGoogleAdsKeywordStagingOrchestrator(
          {
            job:
              makeJob(
                1,
              ),
            accessToken:
              ACCESS_TOKEN,
            developerToken:
              DEVELOPER_TOKEN,
            loginCustomerId:
              LOGIN_CUSTOMER_ID,
            dateWindowIndex:
              DATE_WINDOW_INDEX,
            cursor:
              resumeCursor,
            collectorDependencies: {
              fetchImpl:
                async (
                  _request,
                  init,
                ) => {
                  pageTokenErrorFetchCalls +=
                    1;

                  const body =
                    readRequestBody(
                      init,
                    );

                  assert.equal(
                    body.pageToken,
                    "page-2",
                  );

                  return new Response(
                    JSON.stringify({
                      error: {
                        code:
                          400,
                        message:
                          "Fixture Google Ads page token error",
                        status:
                          "INVALID_ARGUMENT",
                        details: [
                          {
                            "@type":
                              "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
                            errors: [
                              {
                                errorCode: {
                                  requestError,
                                },
                              },
                            ],
                          },
                        ],
                      },
                    }),
                    {
                      status:
                        400,
                      headers: {
                        "Content-Type":
                          "application/json",
                        "request-id":
                          `page-token-${requestError.toLowerCase()}-request`,
                      },
                    },
                  );
                },
              sleepImpl:
                async () => {
                  pageTokenErrorSleepCalls +=
                    1;
                },
              randomImpl:
                () => 0,
            },
            collectorOptions: {
              maxRetries:
                3,
            },
            stagingRepositoryDependencies: {
              invokeRpc:
                async () => {
                  pageTokenErrorStagingCalls +=
                    1;

                  return {
                    data:
                      null,
                    error:
                      null,
                  };
                },
            },
          },
        ),
      (
        error:
          unknown,
      ) =>
        error instanceof
          GoogleAdsKeywordStatsCollectorError &&
        error.code ===
          "PAGE_TOKEN_ERROR" &&
        error.googleRequestError ===
          requestError &&
        error.retryCount ===
          0,
    );
  }

  assert.equal(
    pageTokenErrorFetchCalls,
    2,
  );

  assert.equal(
    pageTokenErrorSleepCalls,
    0,
  );

  assert.equal(
    pageTokenErrorStagingCalls,
    0,
  );

  console.log(
    "PASS: expired/invalid Google page tokens fail closed before staging or checkpoint advance",
  );

  let pageLimitFetchCalls =
    0;

  let pageLimitStagingCalls =
    0;

  await assert.rejects(
    () =>
      runGoogleAdsKeywordStagingOrchestrator(
        {
          job:
            makeJob(
              0,
            ),
          accessToken:
            ACCESS_TOKEN,
          developerToken:
            DEVELOPER_TOKEN,
          loginCustomerId:
            LOGIN_CUSTOMER_ID,
          dateWindowIndex:
            DATE_WINDOW_INDEX,
          collectorDependencies: {
            fetchImpl:
              async () => {
                pageLimitFetchCalls +=
                  1;

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
                  "page-2",
                );
              },
            sleepImpl:
              async () => {
                throw new Error(
                  "PAGE_LIMIT_SLEEP_MUST_NOT_RUN",
                );
              },
            randomImpl:
              () => 0,
          },
          collectorOptions: {
            maxPages:
              1,
          },
          stagingRepositoryDependencies: {
            invokeRpc:
              async () => {
                pageLimitStagingCalls +=
                  1;

                return {
                  data:
                    null,
                  error:
                    null,
                };
              },
          },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsKeywordStatsCollectorError &&
      error.code ===
        "PAGE_LIMIT_EXCEEDED",
  );

  assert.equal(
    pageLimitFetchCalls,
    1,
  );

  assert.equal(
    pageLimitStagingCalls,
    0,
  );

  console.log(
    "PASS: total page limit fails closed before staging the over-limit boundary",
  );

  let mismatchFetchCalls =
    0;

  let mismatchStagingCalls =
    0;

  await assert.rejects(
    () =>
      runGoogleAdsKeywordStagingOrchestrator(
        {
          job: {
            ...makeJob(
              0,
            ),
            provider:
              "naver_searchad",
          } as MediaSyncJobRecord,
          accessToken:
            ACCESS_TOKEN,
          developerToken:
            DEVELOPER_TOKEN,
          collectorDependencies: {
            fetchImpl:
              async () => {
                mismatchFetchCalls +=
                  1;

                throw new Error(
                  "MISMATCH_FETCH_MUST_NOT_RUN",
                );
              },
          },
          stagingRepositoryDependencies: {
            invokeRpc:
              async () => {
                mismatchStagingCalls +=
                  1;

                return {
                  data:
                    null,
                  error:
                    null,
                };
              },
          },
        },
      ),
    (
      error:
        unknown,
    ) =>
      error instanceof
        GoogleAdsKeywordStagingOrchestratorError &&
      error.code ===
        "UNSUPPORTED_PROVIDER",
  );

  assert.equal(
    mismatchFetchCalls,
    0,
  );

  assert.equal(
    mismatchStagingCalls,
    0,
  );

  console.log(
    "PASS: non-Google job scope fails before Google fetch and staging RPC",
  );

  let failureFetchCalls =
    0;

  const failureStagingCalls:
    CapturedStagingCall[] =
    [];

  await assert.rejects(
    () =>
      runGoogleAdsKeywordStagingOrchestrator(
        {
          job:
            makeJob(
              0,
            ),
          accessToken:
            ACCESS_TOKEN,
          developerToken:
            DEVELOPER_TOKEN,
          loginCustomerId:
            LOGIN_CUSTOMER_ID,
          dateWindowIndex:
            DATE_WINDOW_INDEX,
          collectorDependencies: {
            fetchImpl:
              async () => {
                failureFetchCalls +=
                  1;

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
                  "FAILURE_SLEEP_MUST_NOT_RUN",
                );
              },
            randomImpl:
              () => 0,
          },
          stagingRepositoryDependencies: {
            invokeRpc:
              stagingRpc({
                captured:
                  failureStagingCalls,
                fail:
                  true,
              }),
            wait:
              async () => {
                throw new Error(
                  "FAILURE_STAGING_WAIT_MUST_NOT_RUN",
                );
              },
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
        "DATABASE_ERROR",
  );

  assert.equal(
    failureFetchCalls,
    1,
  );

  assert.equal(
    failureStagingCalls.length,
    1,
  );

  console.log(
    "PASS: staging failure produces no advanced orchestration checkpoint result",
  );

  console.log(
    "GOOGLE_ADS_KEYWORD_STAGING_ORCHESTRATOR_FIXTURE=PASS",
  );

  console.log(
    `INJECTED_GOOGLE_FETCH_CALLS=${primaryFetchCalls + retryFetchCalls + pageTokenErrorFetchCalls + pageLimitFetchCalls + failureFetchCalls}`,
  );

  console.log(
    `INJECTED_STAGING_RPC_CALLS=${primaryStagingCalls.length + retryStagingCalls.length + pageTokenErrorStagingCalls + failureStagingCalls.length}`,
  );

  console.log(
    "CHECKPOINT_DB_WRITES=0",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "REAL_STAGING_RPC_CALLS=0",
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

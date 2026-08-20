import assert from "node:assert/strict";

import {
  GOOGLE_ADS_API_VERSION,
} from "../src/lib/media-sync/google-ads-account-verification";
import {
  GoogleAdsKeywordStatsCollectorError,
  buildGoogleAdsKeywordStatsQuery,
  buildGoogleAdsKeywordStatsSearchRequest,
  collectGoogleAdsKeywordStats,
} from "../src/lib/media-sync/google-ads-keyword-stats-collector";

const ACCESS_TOKEN =
  "fixture-access-token";

const DEVELOPER_TOKEN =
  "fixture-developer-token";

const TARGET_CUSTOMER_ID =
  "1234567890";

const LOGIN_CUSTOMER_ID =
  "9876543210";

const BASE_INPUT = {
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
} as const;

function makeRow(
  input: {
    campaignId?: string;
    campaignName?: string;
    adGroupId?: string;
    adGroupName?: string;
    keywordId?: string;
    keywordText?: string;
    date?: string;
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number;
    conversionsValue?: number;
  } = {},
) {
  return {
    campaign: {
      id:
        input.campaignId ??
        "1001",
      name:
        input.campaignName ??
        "Search Campaign",
    },
    adGroup: {
      id:
        input.adGroupId ??
        "2001",
      name:
        input.adGroupName ??
        "Search Ad Group",
    },
    adGroupCriterion: {
      criterionId:
        input.keywordId ??
        "3001",
      keyword: {
        text:
          input.keywordText ??
          "fixture keyword",
      },
    },
    segments: {
      date:
        input.date ??
        "2026-05-01",
    },
    metrics: {
      impressions:
        input.impressions ??
        "100",
      clicks:
        input.clicks ??
        "10",
      costMicros:
        input.costMicros ??
        "1234567",
      conversions:
        input.conversions ??
        2.5,
      conversionsValue:
        input.conversionsValue ??
        456.75,
    },
  };
}

function response(
  input: {
    rows?: unknown[];
    nextPageToken?: string;
    status?: number;
    googleStatus?: string;
    requestError?:
      | "EXPIRED_PAGE_TOKEN"
      | "INVALID_PAGE_TOKEN";
    requestId?: string;
  } = {},
): Response {
  const status =
    input.status ??
    200;

  const body =
    status >= 200 &&
    status < 300
      ? {
          results:
            input.rows ??
            [],
          ...(input.nextPageToken
            ? {
                nextPageToken:
                  input.nextPageToken,
              }
            : {}),
        }
      : {
          error: {
            code: status,
            message:
              "Fixture Google Ads error",
            status:
              input.googleStatus ??
              "UNKNOWN",
            ...(input.requestError
              ? {
                  details: [
                    {
                      "@type":
                        "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
                      errors: [
                        {
                          errorCode: {
                            requestError:
                              input.requestError,
                          },
                        },
                      ],
                    },
                  ],
                }
              : {}),
          },
        };

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
        "request-id":
          input.requestId ??
          "fixture-request-id",
      },
    },
  );
}

async function expectError(
  fn: () => Promise<unknown>,
  code:
    GoogleAdsKeywordStatsCollectorError["code"],
): Promise<GoogleAdsKeywordStatsCollectorError> {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof
        GoogleAdsKeywordStatsCollectorError,
      `Expected GoogleAdsKeywordStatsCollectorError, received ${String(error)}`,
    );

    assert.equal(
      error.code,
      code,
    );

    return error;
  }

  throw new Error(
    `Expected ${code} but no error was thrown.`,
  );
}

function assertNoSecretLeak(
  value: unknown,
): void {
  const serialized =
    value instanceof Error
      ? `${value.name}:${value.message}:${JSON.stringify(value)}`
      : JSON.stringify(value);

  assert(
    !serialized.includes(
      ACCESS_TOKEN,
    ),
    "Access token leaked.",
  );

  assert(
    !serialized.includes(
      DEVELOPER_TOKEN,
    ),
    "Developer token leaked.",
  );
}

async function main(): Promise<void> {
  let passed = 0;

  {
    const query =
      buildGoogleAdsKeywordStatsQuery(
        {
          startDate:
            "2026-05-01",
          endDate:
            "2026-05-02",
        },
      );

    assert(
      query.includes(
        "FROM keyword_view",
      ),
    );

    assert(
      query.includes(
        "segments.date",
      ),
    );

    assert(
      query.includes(
        "metrics.cost_micros",
      ),
    );

    assert(
      query.includes(
        "metrics.conversions_value",
      ),
    );

    assert(
      query.includes(
        "WHERE segments.date BETWEEN '2026-05-01' AND '2026-05-02'",
      ),
    );

    assert(
      !query.includes(
        "segments.device",
      ),
    );

    console.log(
      "PASS: GAQL is keyword/date grain only and preserves canonical non-device contract",
    );

    passed += 1;
  }

  {
    const request =
      buildGoogleAdsKeywordStatsSearchRequest(
        BASE_INPUT,
      );

    assert.equal(
      GOOGLE_ADS_API_VERSION,
      "v25",
    );

    assert.equal(
      request.endpoint,
      "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search",
    );

    assert.equal(
      request.method,
      "POST",
    );

    assert.equal(
      request.headers.Authorization,
      `Bearer ${ACCESS_TOKEN}`,
    );

    assert.equal(
      request.headers[
        "developer-token"
      ],
      DEVELOPER_TOKEN,
    );

    assert.equal(
      request.headers[
        "login-customer-id"
      ],
      LOGIN_CUSTOMER_ID,
    );

    const body =
      JSON.parse(
        request.body,
      ) as Record<
        string,
        unknown
      >;

    assert.deepEqual(
      Object.keys(body).sort(),
      ["query"],
    );

    assert.equal(
      "pageSize" in body,
      false,
    );

    assert.equal(
      "pageToken" in body,
      false,
    );

    const nextRequest =
      buildGoogleAdsKeywordStatsSearchRequest(
        {
          ...BASE_INPUT,
          pageToken:
            "next-page",
        },
      );

    const nextBody =
      JSON.parse(
        nextRequest.body,
      ) as Record<
        string,
        unknown
      >;

    assert.equal(
      nextBody.pageToken,
      "next-page",
    );

    assert.equal(
      "pageSize" in nextBody,
      false,
    );

    assert.equal(
      nextBody.query,
      body.query,
    );

    console.log(
      "PASS: v25 Search uses fixed paging with pageToken only and exact query continuity",
    );

    passed += 1;
  }

  {
    const requestBodies:
      Array<
        Record<
          string,
          unknown
        >
      > = [];

    let fetchCalls = 0;

    const result =
      await collectGoogleAdsKeywordStats(
        BASE_INPUT,
        {
          fetchImpl:
            async (
              _input,
              init,
            ) => {
              fetchCalls += 1;

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

              assert(
                init?.signal instanceof
                  AbortSignal,
              );

              const body =
                JSON.parse(
                  String(
                    init?.body,
                  ),
                ) as Record<
                  string,
                  unknown
                >;

              requestBodies.push(
                body,
              );

              if (
                fetchCalls === 1
              ) {
                return response({
                  rows: [
                    makeRow({
                      date:
                        "2026-05-01",
                    }),
                  ],
                  nextPageToken:
                    "page-2",
                });
              }

              return response({
                rows: [
                  makeRow({
                    date:
                      "2026-05-02",
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
                  }),
                ],
              });
            },
          sleepImpl:
            async () => {},
          randomImpl:
            () => 0,
        },
        {
          requestTimeoutMs:
            1_000,
        },
      );

    assert.equal(
      fetchCalls,
      2,
    );

    assert.equal(
      result.pageCount,
      2,
    );

    assert.equal(
      result.requestCount,
      2,
    );

    assert.equal(
      result.retryCount,
      0,
    );

    assert.equal(
      result.rows.length,
      2,
    );

    assert.equal(
      requestBodies[0]
        ?.pageToken,
      undefined,
    );

    assert.equal(
      requestBodies[1]
        ?.pageToken,
      "page-2",
    );

    assert.equal(
      requestBodies[0]
        ?.query,
      requestBodies[1]
        ?.query,
    );

    assert.equal(
      result.rows[0]
        ?.external_account_id,
      TARGET_CUSTOMER_ID,
    );

    assert.equal(
      result.rows[0]
        ?.external_campaign_id,
      "1001",
    );

    assert.equal(
      result.rows[0]
        ?.external_group_id,
      "2001",
    );

    assert.equal(
      result.rows[0]
        ?.external_keyword_id,
      "3001",
    );

    assert.equal(
      result.rows[0]
        ?.row_level,
      "keyword",
    );

    assert.equal(
      result.rows[0]
        ?.row_level_reason,
      "google_ads_keyword_daily_stats",
    );

    assert.equal(
      result.rows[0]
        ?.cost,
      1.234567,
    );

    assert.equal(
      result.rows[0]
        ?.revenue,
      456.75,
    );

    assert.equal(
      result.rows[1]
        ?.cost,
      2.5,
    );

    assertNoSecretLeak(
      result,
    );

    console.log(
      "PASS: two Search pages become deterministic canonical keyword daily rows",
    );

    passed += 1;
  }

  {
    const sleepDelays:
      number[] = [];

    let fetchCalls = 0;

    const result =
      await collectGoogleAdsKeywordStats(
        BASE_INPUT,
        {
          fetchImpl:
            async () => {
              fetchCalls += 1;

              if (
                fetchCalls === 1
              ) {
                return response({
                  status: 429,
                  googleStatus:
                    "RESOURCE_EXHAUSTED",
                  requestId:
                    "rate-limit-request",
                });
              }

              return response({
                rows: [
                  makeRow(),
                ],
              });
            },
          sleepImpl:
            async (
              delayMs,
            ) => {
              sleepDelays.push(
                delayMs,
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
      fetchCalls,
      2,
    );

    assert.equal(
      result.retryCount,
      1,
    );

    assert.deepEqual(
      sleepDelays,
      [1_000],
    );

    console.log(
      "PASS: HTTP 429 is retried once with bounded exponential backoff",
    );

    passed += 1;
  }

  {
    const sleepDelays:
      number[] = [];

    let fetchCalls = 0;

    const result =
      await collectGoogleAdsKeywordStats(
        BASE_INPUT,
        {
          fetchImpl:
            async () => {
              fetchCalls += 1;

              if (
                fetchCalls === 1
              ) {
                return response({
                  status: 503,
                  googleStatus:
                    "UNAVAILABLE",
                });
              }

              return response({
                rows: [
                  makeRow(),
                ],
              });
            },
          sleepImpl:
            async (
              delayMs,
            ) => {
              sleepDelays.push(
                delayMs,
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
      result.retryCount,
      1,
    );

    assert.equal(
      fetchCalls,
      2,
    );

    assert.deepEqual(
      sleepDelays,
      [1_000],
    );

    console.log(
      "PASS: transient Google UNAVAILABLE response is bounded-retryable",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;
    let sleepCalls = 0;

    const error =
      await expectError(
        () =>
          collectGoogleAdsKeywordStats(
            BASE_INPUT,
            {
              fetchImpl:
                async () => {
                  fetchCalls += 1;

                  return response({
                    status: 403,
                    googleStatus:
                      "PERMISSION_DENIED",
                    requestId:
                      "permission-request",
                  });
                },
              sleepImpl:
                async () => {
                  sleepCalls += 1;
                },
              randomImpl:
                () => 0,
            },
            {
              requestTimeoutMs:
                1_000,
            },
          ),
        "API_HTTP_ERROR",
      );

    assert.equal(
      fetchCalls,
      1,
    );

    assert.equal(
      sleepCalls,
      0,
    );

    assert.equal(
      error.status,
      403,
    );

    assert.equal(
      error.requestId,
      "permission-request",
    );

    assertNoSecretLeak(
      error,
    );

    console.log(
      "PASS: permission failure is not retried and preserves safe request authority",
    );

    passed += 1;
  }

  {
    for (
      const requestError of [
        "EXPIRED_PAGE_TOKEN",
        "INVALID_PAGE_TOKEN",
      ] as const
    ) {
      const requestBodies:
        Array<
          Record<
            string,
            unknown
          >
        > = [];

      let fetchCalls = 0;
      let sleepCalls = 0;

      const requestId =
        `page-token-${requestError.toLowerCase()}-request`;

      const error =
        await expectError(
          () =>
            collectGoogleAdsKeywordStats(
              BASE_INPUT,
              {
                fetchImpl:
                  async (
                    _input,
                    init,
                  ) => {
                    fetchCalls +=
                      1;

                    const body =
                      JSON.parse(
                        String(
                          init?.body,
                        ),
                      ) as Record<
                        string,
                        unknown
                      >;

                    requestBodies.push(
                      body,
                    );

                    if (
                      fetchCalls ===
                      1
                    ) {
                      return response({
                        rows: [
                          makeRow({
                            date:
                              "2026-05-01",
                          }),
                        ],
                        nextPageToken:
                          "page-token-under-test",
                      });
                    }

                    return response({
                      status:
                        400,
                      googleStatus:
                        "INVALID_ARGUMENT",
                      requestError,
                      requestId,
                    });
                  },
                sleepImpl:
                  async () => {
                    sleepCalls +=
                      1;
                  },
                randomImpl:
                  () => 0,
              },
              {
                requestTimeoutMs:
                  1_000,
                maxRetries:
                  3,
              },
            ),
          "PAGE_TOKEN_ERROR",
        );

      assert.equal(
        fetchCalls,
        2,
      );

      assert.equal(
        sleepCalls,
        0,
      );

      assert.equal(
        requestBodies[0]
          ?.pageToken,
        undefined,
      );

      assert.equal(
        requestBodies[1]
          ?.pageToken,
        "page-token-under-test",
      );

      assert.equal(
        error.status,
        400,
      );

      assert.equal(
        error.googleStatus,
        "INVALID_ARGUMENT",
      );

      assert.equal(
        error.googleRequestError,
        requestError,
      );

      assert.equal(
        error.requestId,
        requestId,
      );

      assert.equal(
        error.retryCount,
        0,
      );

      assertNoSecretLeak(
        error,
      );

      console.log(
        `PASS: ${requestError} fails closed without retry`,
      );

      passed += 1;
    }
  }

  {
    let fetchCalls = 0;
    const sleepDelays:
      number[] = [];

    const error =
      await expectError(
        () =>
          collectGoogleAdsKeywordStats(
            BASE_INPUT,
            {
              fetchImpl:
                async () => {
                  fetchCalls += 1;

                  return response({
                    status: 503,
                    googleStatus:
                      "UNAVAILABLE",
                    requestId:
                      `retry-${fetchCalls}`,
                  });
                },
              sleepImpl:
                async (
                  delayMs,
                ) => {
                  sleepDelays.push(
                    delayMs,
                  );
                },
              randomImpl:
                () => 0,
            },
            {
              requestTimeoutMs:
                1_000,
              maxRetries:
                2,
            },
          ),
        "RETRY_EXHAUSTED",
      );

    assert.equal(
      fetchCalls,
      3,
    );

    assert.deepEqual(
      sleepDelays,
      [
        1_000,
        2_000,
      ],
    );

    assert.equal(
      error.status,
      503,
    );

    assert.equal(
      error.googleStatus,
      "UNAVAILABLE",
    );

    assert.equal(
      error.retryCount,
      2,
    );

    assertNoSecretLeak(
      error,
    );

    console.log(
      "PASS: transient retry exhaustion is exact and bounded",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;

    await expectError(
      () =>
        collectGoogleAdsKeywordStats(
          BASE_INPUT,
          {
            fetchImpl:
              async () => {
                fetchCalls += 1;

                return response({
                  rows: [
                    makeRow({
                      date:
                        fetchCalls ===
                          1
                          ? "2026-05-01"
                          : "2026-05-02",
                    }),
                  ],
                  nextPageToken:
                    "same-token",
                });
              },
            sleepImpl:
              async () => {},
            randomImpl:
              () => 0,
          },
          {
            requestTimeoutMs:
              1_000,
          },
        ),
      "PAGINATION_LOOP",
    );

    assert.equal(
      fetchCalls,
      2,
    );

    console.log(
      "PASS: repeated nextPageToken fails closed before infinite pagination",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;

    await expectError(
      () =>
        collectGoogleAdsKeywordStats(
          BASE_INPUT,
          {
            fetchImpl:
              async () => {
                fetchCalls += 1;

                return response({
                  rows: [
                    makeRow(),
                  ],
                  nextPageToken:
                    "page-2",
                });
              },
            sleepImpl:
              async () => {},
            randomImpl:
              () => 0,
          },
          {
            requestTimeoutMs:
              1_000,
            maxPages:
              1,
          },
        ),
      "PAGE_LIMIT_EXCEEDED",
    );

    assert.equal(
      fetchCalls,
      1,
    );

    console.log(
      "PASS: bounded page limit fails closed without fetching beyond authority",
    );

    passed += 1;
  }

  {
    await expectError(
      () =>
        collectGoogleAdsKeywordStats(
          BASE_INPUT,
          {
            fetchImpl:
              async () =>
                response({
                  rows: [
                    makeRow(),
                    makeRow(),
                  ],
                }),
            sleepImpl:
              async () => {},
            randomImpl:
              () => 0,
          },
          {
            requestTimeoutMs:
              1_000,
          },
        ),
      "INVALID_RESPONSE",
    );

    console.log(
      "PASS: duplicate keyword/date wire rows fail closed before canonical handoff",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;

    await expectError(
      () =>
        collectGoogleAdsKeywordStats(
          {
            ...BASE_INPUT,
            startDate:
              "2026-05-03",
            endDate:
              "2026-05-01",
          },
          {
            fetchImpl:
              async () => {
                fetchCalls += 1;

                return response();
              },
          },
        ),
      "INVALID_INPUT",
    );

    assert.equal(
      fetchCalls,
      0,
    );

    console.log(
      "PASS: invalid date range fails before any injected network boundary",
    );

    passed += 1;
  }

  assert.equal(
    passed,
    13,
  );

  console.log(
    `Google Ads keyword stats collector fixture: ${passed}/13 PASS`,
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "STAGING_APPENDS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "WORKER_RUNTIME_CHANGES=0",
  );

  console.log(
    "GOOGLE_ADS_KEYWORD_STATS_COLLECTOR_FIXTURE=PASS",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);

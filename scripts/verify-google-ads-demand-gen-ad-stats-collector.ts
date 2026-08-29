import assert from "node:assert/strict";

import {
  GOOGLE_ADS_DEMAND_GEN_AD_STATS_PAGE_SIZE,
  GoogleAdsDemandGenAdStatsCollectorError,
  buildGoogleAdsDemandGenAdStatsQuery,
  buildGoogleAdsDemandGenAdStatsSearchRequest,
  collectGoogleAdsDemandGenAdStatsPage,
} from "../src/lib/media-sync/google-ads-demand-gen-ad-stats-collector";

function jsonResponse(
  body: unknown,
  status =
    200,
): Response {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

async function expectAsyncError(
  fn: () => Promise<unknown>,
  code:
    GoogleAdsDemandGenAdStatsCollectorError["code"],
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsDemandGenAdStatsCollectorError,
    );

    assert.equal(
      error.code,
      code,
    );

    return;
  }

  assert.fail(
    `Expected GoogleAdsDemandGenAdStatsCollectorError ${code}`,
  );
}

function verifyQuery(): void {
  const query =
    buildGoogleAdsDemandGenAdStatsQuery({
      startDate:
        "2026-08-24",

      endDate:
        "2026-08-25",
    });

  const requiredFields = [
    "campaign.id",
    "campaign.name",
    "ad_group.id",
    "ad_group.name",
    "ad_group_ad.ad.id",
    "segments.date",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
    "metrics.conversions",
    "metrics.conversions_value",
  ];

  for (
    const field
    of requiredFields
  ) {
    assert.match(
      query,
      new RegExp(
        field.replace(
          /[.*+?^${}()|[\]\\]/gu,
          "\\$&",
        ),
        "u",
      ),
    );
  }

  assert.match(
    query,
    /FROM ad_group_ad/u,
  );

  assert.match(
    query,
    /campaign\.advertising_channel_type = 'DEMAND_GEN'/u,
  );

  assert.doesNotMatch(
    query,
    /ad_group_ad\.ad\.name/u,
  );

  assert.equal(
    GOOGLE_ADS_DEMAND_GEN_AD_STATS_PAGE_SIZE,
    10_000,
  );

  console.log(
    "DEMAND_GEN_AD_QUERY_MINIMUM_FIELDS=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_QUERY_SEARCH_ONLY=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_QUERY_DOES_NOT_REQUIRE_AD_NAME=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_FIXED_PAGE_BOUNDARY=PASS",
  );
}

function verifyRequest(): void {
  const request =
    buildGoogleAdsDemandGenAdStatsSearchRequest({
      accessToken:
        "fixture-access",

      developerToken:
        "fixture-developer",

      targetCustomerId:
        "123-456-7890",

      loginCustomerId:
        "987-654-3210",

      startDate:
        "2026-08-24",

      endDate:
        "2026-08-25",
    });

  assert.equal(
    request.method,
    "POST",
  );

  assert.match(
    request.endpoint,
    /\/v25\/customers\/1234567890\/googleAds:search$/u,
  );

  assert.equal(
    request.headers.Authorization,
    "Bearer fixture-access",
  );

  assert.equal(
    request.headers[
      "developer-token"
    ],
    "fixture-developer",
  );

  assert.equal(
    request.headers[
      "login-customer-id"
    ],
    "9876543210",
  );

  const firstBody =
    JSON.parse(
      request.body,
    ) as Record<string, unknown>;

  assert.equal(
    typeof firstBody.query,
    "string",
  );

  assert.equal(
    firstBody.pageToken,
    undefined,
  );

  assert.equal(
    firstBody.pageSize,
    undefined,
  );

  const resumed =
    buildGoogleAdsDemandGenAdStatsSearchRequest({
      accessToken:
        "fixture-access",

      developerToken:
        "fixture-developer",

      targetCustomerId:
        "1234567890",

      startDate:
        "2026-08-24",

      endDate:
        "2026-08-25",

      pageToken:
        "search-ad-page-2",
    });

  const resumedBody =
    JSON.parse(
      resumed.body,
    ) as Record<string, unknown>;

  assert.equal(
    resumedBody.pageToken,
    "search-ad-page-2",
  );

  console.log(
    "DEMAND_GEN_AD_SEARCH_REQUEST_CONTRACT=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_PAGE_TOKEN_REQUEST_CONTRACT=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_NO_CUSTOM_PAGE_SIZE=PASS",
  );
}

async function verifyFirstPage(): Promise<void> {
  let fetchCalls =
    0;

  const result =
    await collectGoogleAdsDemandGenAdStatsPage(
      {
        accessToken:
          "fixture-access",

        developerToken:
          "fixture-developer",

        targetCustomerId:
          "1234567890",

        startDate:
          "2026-08-24",

        endDate:
          "2026-08-25",
      },

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
              ) as Record<string, unknown>;

            assert.equal(
              body.pageToken,
              undefined,
            );

            return jsonResponse({
              results: [
                {
                  campaign: {
                    id:
                      "1001",
                    name:
                      "Search Campaign",
                  },

                  adGroup: {
                    id:
                      "2001",
                    name:
                      "Search Ad Group",
                  },

                  adGroupAd: {
                    ad: {
                      id:
                        "3001",
                    },
                  },

                  segments: {
                    date:
                      "2026-08-24",
                  },

                  metrics: {
                    impressions:
                      "100",
                    clicks:
                      "10",
                    costMicros:
                      "12345000",
                    conversions:
                      "2.5",
                    conversionsValue:
                      "40000.5",
                  },
                },

                {
                  campaign: {
                    id:
                      "1001",
                    name:
                      "Search Campaign",
                  },

                  adGroup: {
                    id:
                      "2001",
                    name:
                      "Search Ad Group",
                  },

                  adGroupAd: {
                    ad: {
                      id:
                        "3001",
                    },
                  },

                  segments: {
                    date:
                      "2026-08-25",
                  },

                  metrics: {
                    impressions:
                      "200",
                    clicks:
                      "20",
                    costMicros:
                      "23456000",
                    conversions:
                      "3",
                    conversionsValue:
                      "60000",
                  },
                },
              ],

              nextPageToken:
                "search-ad-page-2",
            });
          },

        sleepImpl:
          async () => {
            assert.fail(
              "No retry sleep expected.",
            );
          },

        randomImpl:
          () => 0,
      },

      {
        maxRetries:
          0,

        maxPages:
          10,
      },
    );

  assert.equal(
    fetchCalls,
    1,
  );

  assert.equal(
    result.pageCount,
    1,
  );

  assert.equal(
    result.completedPageCount,
    1,
  );

  assert.equal(
    result.requestCount,
    1,
  );

  assert.equal(
    result.retryCount,
    0,
  );

  assert.equal(
    result.status,
    "partial",
  );

  assert.equal(
    result.isComplete,
    false,
  );

  assert.deepEqual(
    result.cursor,
    {
      version:
        1,
      pageIndex:
        1,
      page:
        "search-ad-page-2",
    },
  );

  assert.equal(
    result.rows.length,
    2,
  );

  const first =
    result.rows[0];

  assert.ok(
    first,
  );

  assert.equal(
    first.row_level,
    "creative",
  );

  assert.equal(
    first.data_level,
    "creative",
  );

  assert.equal(
    first.row_level_reason,
    "google_ads_demand_gen_ad_daily_stats",
  );

  assert.equal(
    first.external_creative_id,
    "3001",
  );

  assert.equal(
    first.cost,
    12.345,
  );

  assert.equal(
    first.conversions,
    2.5,
  );

  assert.equal(
    first.revenue,
    40000.5,
  );

  assert.deepEqual(
    first.provider_meta,
    {
      provider:
        "google_ads",
      campaign_type:
        "DEMAND_GEN",
      product_family:
        "demand_gen",
      authoritative_grain:
        "ad",
      entity_type:
        "ad",
      entity_id:
        "3001",
    },
  );

  console.log(
    "DEMAND_GEN_AD_ONE_PAGE_COLLECTION=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_WIRE_METRIC_CONVERSION=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_CANONICAL_AUTHORITY_OUTPUT=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_PARTIAL_CURSOR=PASS",
  );
}

async function verifyResume(): Promise<void> {
  let fetchCalls =
    0;

  const result =
    await collectGoogleAdsDemandGenAdStatsPage(
      {
        accessToken:
          "fixture-access",

        developerToken:
          "fixture-developer",

        targetCustomerId:
          "1234567890",

        startDate:
          "2026-08-24",

        endDate:
          "2026-08-25",

        cursor: {
          version:
            1,

          pageIndex:
            1,

          page:
            "search-ad-page-2",
        },
      },

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
              ) as Record<string, unknown>;

            assert.equal(
              body.pageToken,
              "search-ad-page-2",
            );

            return jsonResponse({
              results: [
                {
                  campaign: {
                    id:
                      "1001",
                    name:
                      "Search Campaign",
                  },

                  adGroup: {
                    id:
                      "2001",
                    name:
                      "Search Ad Group",
                  },

                  adGroupAd: {
                    ad: {
                      id:
                        "3002",
                    },
                  },

                  segments: {
                    date:
                      "2026-08-25",
                  },

                  metrics: {
                    impressions:
                      "50",
                    clicks:
                      "5",
                    costMicros:
                      "5000000",
                    conversions:
                      "1",
                    conversionsValue:
                      "10000",
                  },
                },
              ],
            });
          },

        sleepImpl:
          async () => {
            assert.fail(
              "No retry sleep expected.",
            );
          },

        randomImpl:
          () => 0,
      },

      {
        maxRetries:
          0,

        maxPages:
          10,
      },
    );

  assert.equal(
    fetchCalls,
    1,
  );

  assert.equal(
    result.completedPageCount,
    2,
  );

  assert.equal(
    result.status,
    "completed",
  );

  assert.equal(
    result.isComplete,
    true,
  );

  assert.equal(
    result.cursor,
    null,
  );

  assert.equal(
    result.rows.length,
    1,
  );

  assert.equal(
    result.rows[0]?.external_creative_id,
    "3002",
  );

  console.log(
    "DEMAND_GEN_AD_EXACT_CURSOR_RESUME=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_NO_PREVIOUS_PAGE_REFETCH=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_COMPLETION_BOUNDARY=PASS",
  );
}

async function verifyRetry(): Promise<void> {
  let fetchCalls =
    0;

  let sleepCalls =
    0;

  const result =
    await collectGoogleAdsDemandGenAdStatsPage(
      {
        accessToken:
          "fixture-access",

        developerToken:
          "fixture-developer",

        targetCustomerId:
          "1234567890",

        startDate:
          "2026-08-24",

        endDate:
          "2026-08-25",
      },

      {
        fetchImpl:
          async () => {
            fetchCalls +=
              1;

            if (
              fetchCalls ===
              1
            ) {
              return jsonResponse(
                {
                  error: {
                    status:
                      "UNAVAILABLE",
                  },
                },
                503,
              );
            }

            return jsonResponse({
              results: [],
            });
          },

        sleepImpl:
          async delayMs => {
            sleepCalls +=
              1;

            assert.equal(
              delayMs,
              1_000,
            );
          },

        randomImpl:
          () => 0,
      },

      {
        maxRetries:
          1,

        maxPages:
          10,
      },
    );

  assert.equal(
    fetchCalls,
    2,
  );

  assert.equal(
    sleepCalls,
    1,
  );

  assert.equal(
    result.requestCount,
    2,
  );

  assert.equal(
    result.retryCount,
    1,
  );

  assert.equal(
    result.status,
    "completed",
  );

  console.log(
    "DEMAND_GEN_AD_TRANSIENT_RETRY_BOUNDED=PASS",
  );
}

async function verifyPaginationFailures(): Promise<void> {
  await expectAsyncError(
    () =>
      collectGoogleAdsDemandGenAdStatsPage(
        {
          accessToken:
            "fixture-access",

          developerToken:
            "fixture-developer",

          targetCustomerId:
            "1234567890",

          startDate:
            "2026-08-24",

          endDate:
            "2026-08-25",

          cursor: {
            version:
              1,

            pageIndex:
              1,

            page:
              "repeat-token",
          },
        },

        {
          fetchImpl:
            async () =>
              jsonResponse({
                results: [],

                nextPageToken:
                  "repeat-token",
              }),

          sleepImpl:
            async () => {},

          randomImpl:
            () => 0,
        },

        {
          maxRetries:
            0,

          maxPages:
            10,
        },
      ),

    "PAGINATION_LOOP",
  );

  await expectAsyncError(
    () =>
      collectGoogleAdsDemandGenAdStatsPage(
        {
          accessToken:
            "fixture-access",

          developerToken:
            "fixture-developer",

          targetCustomerId:
            "1234567890",

          startDate:
            "2026-08-24",

          endDate:
            "2026-08-25",
        },

        {
          fetchImpl:
            async () =>
              jsonResponse({
                results: [],

                nextPageToken:
                  "has-more",
              }),

          sleepImpl:
            async () => {},

          randomImpl:
            () => 0,
        },

        {
          maxRetries:
            0,

          maxPages:
            1,
        },
      ),

    "PAGE_LIMIT_EXCEEDED",
  );

  console.log(
    "DEMAND_GEN_AD_PAGINATION_LOOP_FAIL_CLOSED=PASS",
  );

  console.log(
    "DEMAND_GEN_AD_PAGE_LIMIT_FAIL_CLOSED=PASS",
  );
}

async function verifyMalformedResponse(): Promise<void> {
  await expectAsyncError(
    () =>
      collectGoogleAdsDemandGenAdStatsPage(
        {
          accessToken:
            "fixture-access",

          developerToken:
            "fixture-developer",

          targetCustomerId:
            "1234567890",

          startDate:
            "2026-08-24",

          endDate:
            "2026-08-25",
        },

        {
          fetchImpl:
            async () =>
              jsonResponse({
                results: [
                  {
                    campaign: {
                      id:
                        "1001",
                      name:
                        "Search Campaign",
                    },

                    adGroup: {
                      id:
                        "2001",
                      name:
                        "Search Ad Group",
                    },

                    adGroupAd: {
                      ad: {},
                    },

                    segments: {
                      date:
                        "2026-08-25",
                    },

                    metrics: {},
                  },
                ],
              }),

          sleepImpl:
            async () => {},

          randomImpl:
            () => 0,
        },

        {
          maxRetries:
            0,

          maxPages:
            10,
        },
      ),

    "INVALID_RESPONSE",
  );

  console.log(
    "DEMAND_GEN_AD_MALFORMED_RESPONSE_FAIL_CLOSED=PASS",
  );
}

async function main(): Promise<void> {
  verifyQuery();
  verifyRequest();

  await verifyFirstPage();
  await verifyResume();
  await verifyRetry();
  await verifyPaginationFailures();
  await verifyMalformedResponse();

  console.log(
    "GOOGLE_ADS_DEMAND_GEN_AD_STATS_COLLECTOR_FIXTURE=PASS",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );
}

void main();

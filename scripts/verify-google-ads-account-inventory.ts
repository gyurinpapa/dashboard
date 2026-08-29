import assert from "node:assert/strict";

import {
  GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
  GoogleAdsAccountInventoryError,
  buildGoogleAdsAccountInventorySearchRequest,
  classifyGoogleAdsAccountInventoryRows,
  collectGoogleAdsAccountInventory,
} from "../src/lib/media-sync/google-ads-account-inventory";

function expectError(
  fn: () => unknown,
  code:
    GoogleAdsAccountInventoryError["code"],
): void {
  try {
    fn();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsAccountInventoryError,
    );

    assert.equal(
      error.code,
      code,
    );

    return;
  }

  assert.fail(
    `Expected GoogleAdsAccountInventoryError ${code}`,
  );
}

async function expectAsyncError(
  fn: () => Promise<unknown>,
  code:
    GoogleAdsAccountInventoryError["code"],
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert.ok(
      error instanceof
        GoogleAdsAccountInventoryError,
    );

    assert.equal(
      error.code,
      code,
    );

    return;
  }

  assert.fail(
    `Expected GoogleAdsAccountInventoryError ${code}`,
  );
}

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

function verifyQuery(): void {
  assert.match(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /campaign\.id/u,
  );

  assert.match(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /campaign\.name/u,
  );

  assert.match(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /campaign\.advertising_channel_type/u,
  );

  assert.match(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /campaign\.status/u,
  );

  assert.match(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /WHERE campaign\.status != 'REMOVED'/u,
  );

  assert.doesNotMatch(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /\bmetrics\./u,
  );

  assert.doesNotMatch(
    GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    /\bsegments\./u,
  );

  console.log(
    "INVENTORY_QUERY_NO_METRICS=PASS",
  );

  console.log(
    "INVENTORY_QUERY_NON_REMOVED_ONLY=PASS",
  );
}

function verifyClassification(): void {
  const result =
    classifyGoogleAdsAccountInventoryRows([
      {
        campaign: {
          id:
            "1001",
          name:
            "Search Campaign",
          advertisingChannelType:
            "SEARCH",
          status:
            "ENABLED",
        },
      },

      {
        campaign: {
          id:
            1002,
          name:
            "Demand Gen Campaign",
          advertisingChannelType:
            "demand-gen",
          status:
            "PAUSED",
        },
      },

      {
        campaign: {
          id:
            "1003",
          name:
            "Display Campaign",
          advertisingChannelType:
            " display ",
          status:
            "ENABLED",
        },
      },

      {
        campaign: {
          id:
            "1004",
          name:
            "PMax Campaign",
          advertisingChannelType:
            "performance max",
          status:
            "PAUSED",
        },
      },

      {
        campaign: {
          id:
            "1005",
          name:
            "Unsupported Campaign",
          advertisingChannelType:
            "HOTEL",
          status:
            "ENABLED",
        },
      },

      {
        campaign: {
          id:
            "1006",
          name:
            "Shopping Future Contract",
          advertisingChannelType:
            "SHOPPING",
          status:
            "PAUSED",
        },
      },
    ]);

  assert.equal(
    result.campaigns.length,
    6,
  );

  assert.equal(
    result.supportedCampaigns.length,
    4,
  );

  assert.equal(
    result.unsupportedCampaigns.length,
    2,
  );

  assert.deepEqual(
    result.supportedCampaigns.map(
      campaign => ({
        campaignId:
          campaign.campaignId,
        campaignType:
          campaign.campaignType,
        productFamily:
          campaign.productFamily,
        authoritativeGrain:
          campaign.authoritativeGrain,
      }),
    ),
    [
      {
        campaignId:
          "1001",
        campaignType:
          "SEARCH",
        productFamily:
          "search",
        authoritativeGrain:
          "ad",
      },
      {
        campaignId:
          "1002",
        campaignType:
          "DEMAND_GEN",
        productFamily:
          "demand_gen",
        authoritativeGrain:
          "ad",
      },
      {
        campaignId:
          "1003",
        campaignType:
          "DISPLAY",
        productFamily:
          "display",
        authoritativeGrain:
          "ad",
      },
      {
        campaignId:
          "1004",
        campaignType:
          "PERFORMANCE_MAX",
        productFamily:
          "performance_max",
        authoritativeGrain:
          "asset_group",
      },
    ],
  );

  assert.deepEqual(
    result.unsupportedCampaigns.map(
      campaign => ({
        campaignId:
          campaign.campaignId,
        campaignType:
          campaign.campaignType,
        reason:
          campaign.reason,
      }),
    ),
    [
      {
        campaignId:
          "1005",
        campaignType:
          "HOTEL",
        reason:
          "UNSUPPORTED_CAMPAIGN_TYPE",
      },
      {
        campaignId:
          "1006",
        campaignType:
          "SHOPPING",
        reason:
          "UNSUPPORTED_CAMPAIGN_TYPE",
      },
    ],
  );

  console.log(
    "SUPPORTED_CAMPAIGN_CLASSIFICATION=PASS",
  );

  console.log(
    "UNSUPPORTED_CAMPAIGN_PRESERVED=PASS",
  );

  console.log(
    "CAMPAIGN_ID_PRESERVED=PASS",
  );

  console.log(
    "CAMPAIGN_TYPE_PRESERVED=PASS",
  );
}

function verifyPureFailures(): void {
  expectError(
    () =>
      classifyGoogleAdsAccountInventoryRows(
        {},
      ),
    "INVALID_INPUT",
  );

  expectError(
    () =>
      classifyGoogleAdsAccountInventoryRows([
        {
          campaign: {
            id:
              "2001",
            name:
              "First",
            advertisingChannelType:
              "SEARCH",
            status:
              "ENABLED",
          },
        },
        {
          campaign: {
            id:
              "2001",
            name:
              "Duplicate",
            advertisingChannelType:
              "SEARCH",
            status:
              "PAUSED",
          },
        },
      ]),
    "DUPLICATE_CAMPAIGN_ID",
  );

  expectError(
    () =>
      classifyGoogleAdsAccountInventoryRows([
        {
          campaign: {
            id:
              "3001",
            name:
              "Malformed",
            advertisingChannelType:
              null,
            status:
              "ENABLED",
          },
        },
      ]),
    "INVALID_RESPONSE",
  );

  console.log(
    "DUPLICATE_CAMPAIGN_FAIL_CLOSED=PASS",
  );

  console.log(
    "MALFORMED_CAMPAIGN_FAIL_CLOSED=PASS",
  );
}

function verifyRequestBuilder(): void {
  const first =
    buildGoogleAdsAccountInventorySearchRequest({
      accessToken:
        "fixture-access-token",

      developerToken:
        "fixture-developer-token",

      targetCustomerId:
        "123-456-7890",

      loginCustomerId:
        "987-654-3210",
    });

  assert.equal(
    first.method,
    "POST",
  );

  assert.match(
    first.endpoint,
    /\/v25\/customers\/1234567890\/googleAds:search$/u,
  );

  assert.equal(
    first.headers.Authorization,
    "Bearer fixture-access-token",
  );

  assert.equal(
    first.headers["developer-token"],
    "fixture-developer-token",
  );

  assert.equal(
    first.headers["login-customer-id"],
    "9876543210",
  );

  assert.deepEqual(
    JSON.parse(
      first.body,
    ),
    {
      query:
        GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,
    },
  );

  const resumed =
    buildGoogleAdsAccountInventorySearchRequest({
      accessToken:
        "fixture-access-token",

      developerToken:
        "fixture-developer-token",

      targetCustomerId:
        "1234567890",

      pageToken:
        "inventory-page-2",
    });

  assert.deepEqual(
    JSON.parse(
      resumed.body,
    ),
    {
      query:
        GOOGLE_ADS_ACCOUNT_INVENTORY_QUERY,

      pageToken:
        "inventory-page-2",
    },
  );

  console.log(
    "INVENTORY_SEARCH_REQUEST_CONTRACT=PASS",
  );

  console.log(
    "INVENTORY_PAGE_TOKEN_REQUEST_CONTRACT=PASS",
  );
}

async function verifyBoundedPagination(): Promise<void> {
  const requestBodies:
    Record<string, unknown>[] = [];

  let fetchCalls =
    0;

  const result =
    await collectGoogleAdsAccountInventory(
      {
        accessToken:
          "fixture-access-token",

        developerToken:
          "fixture-developer-token",

        targetCustomerId:
          "1234567890",
      },

      {
        fetchImpl:
          async (
            _input,
            init,
          ) => {
            fetchCalls +=
              1;

            requestBodies.push(
              JSON.parse(
                String(
                  init?.body,
                ),
              ) as Record<string, unknown>,
            );

            if (
              fetchCalls === 1
            ) {
              return jsonResponse({
                results: [
                  {
                    campaign: {
                      id:
                        "4001",
                      name:
                        "Search",
                      advertisingChannelType:
                        "SEARCH",
                      status:
                        "ENABLED",
                    },
                  },
                ],

                nextPageToken:
                  "inventory-page-2",
              });
            }

            assert.equal(
              fetchCalls,
              2,
            );

            return jsonResponse({
              results: [
                {
                  campaign: {
                    id:
                      "4002",
                    name:
                      "PMax",
                    advertisingChannelType:
                      "PERFORMANCE_MAX",
                    status:
                      "PAUSED",
                  },
                },
                {
                  campaign: {
                    id:
                      "4003",
                    name:
                      "Unsupported",
                    advertisingChannelType:
                      "HOTEL",
                    status:
                      "ENABLED",
                  },
                },
              ],
            });
          },

        sleepImpl:
          async () => {
            assert.fail(
              "No retry sleep expected for successful pagination.",
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
    result.campaigns.length,
    3,
  );

  assert.equal(
    result.supportedCampaigns.length,
    2,
  );

  assert.equal(
    result.unsupportedCampaigns.length,
    1,
  );

  assert.equal(
    requestBodies[0]?.pageToken,
    undefined,
  );

  assert.equal(
    requestBodies[1]?.pageToken,
    "inventory-page-2",
  );

  console.log(
    "INVENTORY_BOUNDED_PAGINATION=PASS",
  );

  console.log(
    "INVENTORY_RESULTS_CLASSIFIED_AFTER_PAGINATION=PASS",
  );
}

async function verifyRetry(): Promise<void> {
  let fetchCalls =
    0;

  let sleepCalls =
    0;

  const result =
    await collectGoogleAdsAccountInventory(
      {
        accessToken:
          "fixture-access-token",

        developerToken:
          "fixture-developer-token",

        targetCustomerId:
          "1234567890",
      },

      {
        fetchImpl:
          async () => {
            fetchCalls +=
              1;

            if (
              fetchCalls === 1
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
    result.pageCount,
    1,
  );

  console.log(
    "INVENTORY_TRANSIENT_RETRY_BOUNDED=PASS",
  );
}

async function verifyPaginationFailures(): Promise<void> {
  let loopCalls =
    0;

  await expectAsyncError(
    () =>
      collectGoogleAdsAccountInventory(
        {
          accessToken:
            "fixture-access-token",

          developerToken:
            "fixture-developer-token",

          targetCustomerId:
            "1234567890",
        },

        {
          fetchImpl:
            async () => {
              loopCalls +=
                1;

              return jsonResponse({
                results: [],

                nextPageToken:
                  "repeat-token",
              });
            },

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

  assert.equal(
    loopCalls,
    2,
  );

  let limitCalls =
    0;

  await expectAsyncError(
    () =>
      collectGoogleAdsAccountInventory(
        {
          accessToken:
            "fixture-access-token",

          developerToken:
            "fixture-developer-token",

          targetCustomerId:
            "1234567890",
        },

        {
          fetchImpl:
            async () => {
              limitCalls +=
                1;

              return jsonResponse({
                results: [],

                nextPageToken:
                  "has-another-page",
              });
            },

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

  assert.equal(
    limitCalls,
    1,
  );

  console.log(
    "INVENTORY_PAGINATION_LOOP_FAIL_CLOSED=PASS",
  );

  console.log(
    "INVENTORY_PAGE_LIMIT_FAIL_CLOSED=PASS",
  );
}

async function main(): Promise<void> {
  verifyQuery();
  verifyClassification();
  verifyPureFailures();
  verifyRequestBuilder();

  await verifyBoundedPagination();
  await verifyRetry();
  await verifyPaginationFailures();

  console.log(
    "GOOGLE_ADS_ACCOUNT_INVENTORY_TRANSPORT_FIXTURE=PASS",
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

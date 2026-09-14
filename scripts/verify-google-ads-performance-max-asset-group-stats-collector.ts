import assert from "node:assert/strict";

import {
  buildGoogleAdsPerformanceMaxAssetGroupStatsQuery,
  collectGoogleAdsPerformanceMaxAssetGroupStatsPage,
} from "../src/lib/media-sync/google-ads-performance-max-asset-group-stats-collector";

const query =
  buildGoogleAdsPerformanceMaxAssetGroupStatsQuery({
    startDate:
      "2026-05-01",
    endDate:
      "2026-05-01",
  });

for (
  const expected of [
    "asset_group.id",
    "asset_group.name",
    "segments.date",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
    "metrics.conversions",
    "metrics.conversions_value",
    "FROM asset_group",
    "campaign.advertising_channel_type = 'PERFORMANCE_MAX'",
  ]
) {
  assert.ok(
    query.includes(
      expected,
    ),
    `missing GAQL token: ${expected}`,
  );
}

let capturedUrl =
  "";

let capturedBody =
  "";

const fetchImpl:
  typeof fetch =
  async (
    input,
    init,
  ) => {
    capturedUrl =
      String(input);

    capturedBody =
      String(
        init?.body ??
        "",
      );

    return new Response(
      JSON.stringify({
        results: [
          {
            campaign: {
              id:
                "100",
              name:
                "PMAX Campaign",
            },

            assetGroup: {
              id:
                "200",
              name:
                "Primary Asset Group",
            },

            segments: {
              date:
                "2026-05-01",
            },

            metrics: {
              impressions:
                "100",
              clicks:
                "10",
              costMicros:
                "1250000",
              conversions:
                2,
              conversionsValue:
                300,
            },
          },
        ],
      }),
      {
        status:
          200,
        headers: {
          "content-type":
            "application/json",
        },
      },
    );
  };

async function main(): Promise<void> {
  const result =
    await collectGoogleAdsPerformanceMaxAssetGroupStatsPage(
    {
      accessToken:
        "access-token",
      developerToken:
        "developer-token",
      targetCustomerId:
        "1234567890",
      startDate:
        "2026-05-01",
      endDate:
        "2026-05-01",
    },
    {
      fetchImpl,
      sleepImpl:
        async () => {},
      randomImpl:
        () => 0,
    },
  );

assert.ok(
  capturedUrl.includes(
    "/v25/customers/1234567890/googleAds:search",
  ),
);

assert.ok(
  capturedBody.includes(
    "PERFORMANCE_MAX",
  ),
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
  result.rows[0]?.provider_meta?.product_family,
  "performance_max",
);

assert.equal(
  result.rows[0]?.provider_meta?.authoritative_grain,
  "asset_group",
);

assert.equal(
  result.rows[0]?.provider_meta?.entity_type,
  "asset_group",
);

assert.equal(
  result.rows[0]?.cost,
  1.25,
);

assert.equal(
  result.rows[0]?.revenue,
  300,
);

  console.log(
    "PMAX_ASSET_GROUP_COLLECTOR=PASS",
  );
}

void main().catch(
  error => {
    console.error(error);
    process.exitCode = 1;
  },
);

import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

const sql =
  readFileSync(
    resolve(
      process.cwd(),
      "scripts/sql/create-summarize-google-ads-all-data-staging.sql",
    ),
    "utf8",
  );

for (
  const required of [
    "'SEARCH'",
    "'DEMAND_GEN'",
    "'DISPLAY'",
    "'PERFORMANCE_MAX'",
    "'search'",
    "'demand_gen'",
    "'display'",
    "'performance_max'",
    "'asset_group'",
    "'google_ads_search_ad_daily_stats'",
    "'google_ads_demand_gen_ad_daily_stats'",
    "'google_ads_display_ad_daily_stats'",
    "'google_ads_performance_max_asset_group_daily_stats'",
  ]
) {
  assert.ok(
    sql.includes(
      required,
    ),
    `summary SQL missing ${required}`,
  );
}

assert.ok(
  sql.includes(
    "in ('search', 'demand_gen', 'display')",
  ),
);

assert.ok(
  sql.includes(
    "is not distinct from\n                  'asset_group'",
  ),
);

console.log(
  "SUMMARY_SEARCH_AUTHORITY=PASS",
);

console.log(
  "SUMMARY_DEMAND_GEN_AUTHORITY=PASS",
);

console.log(
  "SUMMARY_DISPLAY_AUTHORITY=PASS",
);

console.log(
  "SUMMARY_PMAX_ASSET_GROUP_AUTHORITY=PASS",
);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql =
  readFileSync(
    resolve(
      process.cwd(),
      "scripts/sql/create-save-google-ads-all-data-processing-checkpoint.sql",
    ),
    "utf8",
  );

assert.match(
  sql,
  /elsif\s+v_phase\s*=\s*'search_ad'[\s\S]*?v_phase_cursor\s+is\s+not\s+null\s+and\s+v_phase_cursor\s*<>\s*'null'::jsonb\s+and\s+jsonb_typeof\(\s*v_phase_cursor\s*\)\s*<>\s*'object'/,
);

console.log(
  "SEARCH_AD_JSON_NULL_PHASE_CURSOR_ALLOWED=PASS",
);

assert.match(
  sql,
  /v_cursor\s*:=\s*nullif\(\s*v_collector\s*->\s*'cursor'\s*,\s*'null'::jsonb\s*\)/,
);

assert.match(
  sql,
  /v_existing_cursor\s*:=\s*nullif\(\s*v_existing_collector\s*->\s*'cursor'\s*,\s*'null'::jsonb\s*\)/,
);

console.log(
  "TOP_LEVEL_JSON_NULL_NORMALIZATION_PRESERVED=PASS",
);

assert.ok(
  (sql.match(/'demand_gen_ad'/g)?.length ?? 0) >= 4,
);

console.log(
  "DEMAND_GEN_CONTRACT_PRESERVED=PASS",
);

console.log(
  "SEARCH_AD_NULL_PHASE_CURSOR_REGRESSION_FIXTURE=PASS",
);

console.log("DB_CALLS=0");
console.log("GOOGLE_API_CALLS=0");

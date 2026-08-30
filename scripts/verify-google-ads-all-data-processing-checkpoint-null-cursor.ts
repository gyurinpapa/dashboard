import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "scripts/sql/create-save-google-ads-all-data-processing-checkpoint.sql",
  ),
  "utf8",
);

/*
 * No /s regex flag:
 * project TypeScript target predates ES2018.
 *
 * \s includes newline, so the expressions remain
 * whitespace/newline agnostic.
 */
assert.match(
  sql,
  /v_cursor\s*:=\s*nullif\(\s*v_collector\s*->\s*'cursor'\s*,\s*'null'::jsonb\s*\)/,
);

assert.match(
  sql,
  /v_existing_cursor\s*:=\s*nullif\(\s*v_existing_collector\s*->\s*'cursor'\s*,\s*'null'::jsonb\s*\)/,
);

assert.doesNotMatch(
  sql,
  /v_cursor\s*:=\s*v_collector\s*->\s*'cursor'\s*;/,
);

assert.doesNotMatch(
  sql,
  /v_existing_cursor\s*:=\s*v_existing_collector\s*->\s*'cursor'\s*;/,
);

assert.ok(
  (sql.match(/'demand_gen_ad'/g)?.length ?? 0) >= 4,
);

assert.ok(
  (
    sql.match(
      /when\s+'demand_gen_ad'\s+then\s+1/g,
    )?.length ?? 0
  ) >= 2,
);

console.log(
  "FRESH_JSON_NULL_CURSOR_NORMALIZATION=PASS",
);

console.log(
  "PERSISTED_JSON_NULL_CURSOR_NORMALIZATION=PASS",
);

console.log(
  "TS_TARGET_ES2018_DOTALL_DEPENDENCY=NO",
);

console.log(
  "DEMAND_GEN_CONTRACT_PRESERVED=PASS",
);

console.log(
  "CHECKPOINT_NULL_CURSOR_REGRESSION_FIXTURE=PASS",
);

console.log("DB_CALLS=0");
console.log("GOOGLE_API_CALLS=0");

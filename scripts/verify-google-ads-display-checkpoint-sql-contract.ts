import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";

const sql =
  readFileSync(
    "scripts/sql/create-save-google-ads-all-data-processing-checkpoint.sql",
    "utf8",
  );

assert.match(
  sql,
  /'demand_gen_ad',\s*'display_ad',\s*'completed'/u,
);

assert.equal(
  (
    sql.match(
      /when 'display_ad' then 1/gu,
    ) ?? []
  ).length,
  2,
);

assert.match(
  sql,
  /elsif v_phase in \(\s*'demand_gen_ad',\s*'display_ad'\s*\) then/u,
);

assert.doesNotMatch(
  sql,
  /when 'performance_max_ad'/u,
);

assert.match(
  sql,
  /to service_role;/u,
);

console.log(
  "DISPLAY_SQL_PHASE_ALLOWLIST=PASS",
);

console.log(
  "DISPLAY_SQL_PHASE_RANK=PASS",
);

console.log(
  "DISPLAY_SQL_CURSOR_CONTRACT=PASS",
);

console.log(
  "PERFORMANCE_MAX_SQL_PHASE=BLOCKED",
);

console.log(
  "DISPLAY_SQL_SOURCE_CONTRACT=PASS",
);

console.log(
  "DATABASE_CALLS=0",
);

console.log(
  "DATABASE_MUTATIONS=0",
);

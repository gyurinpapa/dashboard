import fs from "node:fs";

function read(path) {
  return fs.readFileSync(
    path,
    "utf8",
  );
}

function requireCondition(
  value,
  label,
) {
  if (!value) {
    console.error(
      `${label}=FAIL`,
    );
    process.exit(20);
  }

  console.log(
    `${label}=PASS`,
  );
}

const sql = read(
  "scripts/sql/add-media-sync-job-automation-contract-v2.sql",
);

const types = read(
  "src/lib/media-sync/types.ts",
);

const jobs = read(
  "src/lib/media-sync/media-sync-jobs-repository.ts",
);

requireCondition(
  /add column if not exists automation_contract text null/i.test(
    sql,
  ),
  "SQL_NULLABLE_ADDITIVE_COLUMN",
);

requireCondition(
  /automation_contract is null[\s\S]*automation_contract = 'daily_report_v2'/i.test(
    sql,
  ),
  "SQL_FAIL_CLOSED_CHECK",
);

requireCondition(
  /^\s*begin\s*;/im.test(
    sql,
  ) &&
    /^\s*commit\s*;/im.test(
      sql,
    ),
  "SQL_EXPLICIT_TRANSACTION",
);

requireCondition(
  !/execution_contract\s*=\s*'daily_report_v2'/i.test(
    sql,
  ),
  "EXECUTION_CONTRACT_UNTOUCHED",
);

requireCondition(
  /automation_contract\?:\s*"daily_report_v2"\s*\|\s*null/.test(
    types,
  ),
  "TYPE_AUTOMATION_CONTRACT",
);

requireCondition(
  /value\.automation_contract === undefined/.test(
    jobs,
  ) &&
    /value\.automation_contract === null/.test(
      jobs,
    ),
  "PARSER_LEGACY_NULL_COMPATIBLE",
);

requireCondition(
  /value\.automation_contract === "daily_report_v2"/.test(
    jobs,
  ),
  "PARSER_DAILY_REPORT_V2",
);

requireCondition(
  /unsupported automation_contract value/.test(
    jobs,
  ),
  "PARSER_FAIL_CLOSED",
);

requireCondition(
  !/automation_contract[\s\S]{0,300}insertRecord/.test(
    jobs,
  ),
  "JOB_CREATOR_NOT_YET_AUTHORIZING_V2",
);

console.log(
  "V2_D8_STATIC_FOUNDATION=PASS",
);

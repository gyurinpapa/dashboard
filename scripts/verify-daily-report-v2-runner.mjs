import {
  readFileSync,
} from "node:fs";

const runner =
  readFileSync(
    "scripts/daily-report-v2-scheduler.ts",
    "utf8",
  );

const v1Runner =
  readFileSync(
    "scripts/naver-searchads-daily-report-scheduler.ts",
    "utf8",
  );

function requireCondition(
  condition,
  label,
) {
  if (!condition) {
    console.error(
      `${label}=FAIL`,
    );

    process.exit(1);
  }

  console.log(
    `${label}=PASS`,
  );
}

requireCondition(
  runner.includes(
    '"DAILY_REPORT_V2_SCHEDULER_ENABLED"',
  ),
  "D10H_V2_RUNNER_ENV_GATE",
);

requireCondition(
  runner.includes(
    '"daily_report_v2" as const',
  ),
  "D10H_V2_RUNNER_CONTRACT",
);

requireCondition(
  runner.includes(
    "runDailyReportV2SchedulerOnce",
  ) &&
  runner.includes(
    "createDailyReportV2SchedulerDatabaseDependencies",
  ),
  "D10H_V2_RUNNER_WIRING",
);

requireCondition(
  (
    runner.match(
      /runDailyReportV2SchedulerOnce\(\{/g,
    ) ??
    []
  ).length ===
    1,
  "D10H_V2_RUNNER_ONE_SCHEDULER_CALL",
);

requireCondition(
  (
    runner.match(
      /createDailyReportV2SchedulerDatabaseDependencies\(\)/g,
    ) ??
    []
  ).length ===
    1,
  "D10H_V2_RUNNER_ONE_DEPENDENCY_BUILD",
);

requireCondition(
  runner.includes(
    '"disabled_noop"',
  ) &&
  runner.includes(
    "enabled:\n          false",
  ),
  "D10H_V2_RUNNER_DISABLED_NOOP",
);

requireCondition(
  runner.includes(
    'timezone:\n        "Asia/Seoul"',
  ) &&
  runner.includes(
    "provider:\n        result.provider",
  ),
  "D10H_V2_RUNNER_STRUCTURED_RESULT",
);

requireCondition(
  runner.includes(
    'await Promise.all([',
  ) &&
  runner.includes(
    'import(\n        "../src/lib/media-sync/daily-report-v2-scheduler"',
  ) &&
  runner.includes(
    'import(\n        "../src/lib/media-sync/daily-report-v2-scheduler-repository"',
  ),
  "D10H_V2_RUNNER_IMPORTS_AFTER_GATE",
);

requireCondition(
  runner.includes(
    "process.exitCode =\n      1;",
  ) &&
  runner.includes(
    'typeof code ===\n              "string"',
  ),
  "D10H_V2_RUNNER_FAIL_CLOSED",
);

requireCondition(
  !runner.includes(
    "NAVER_DAILY_REPORT_SCHEDULER_ENABLED",
  ) &&
  !runner.includes(
    "naver_daily_report_v1",
  ) &&
  !runner.includes(
    "runNaverDailyReportSchedulerOnce",
  ) &&
  !runner.includes(
    "createNaverDailyReportSchedulerDatabaseDependencies",
  ),
  "D10H_V1_RUNTIME_NOT_IMPORTED",
);

requireCondition(
  v1Runner.includes(
    '"NAVER_DAILY_REPORT_SCHEDULER_ENABLED"',
  ) &&
  v1Runner.includes(
    '"naver_daily_report_v1" as const',
  ) &&
  !v1Runner.includes(
    "daily_report_v2",
  ) &&
  !v1Runner.includes(
    "runDailyReportV2SchedulerOnce",
  ),
  "D10H_V1_V2_RUNNER_ISOLATION",
);

requireCondition(
  !runner.includes(
    "railway",
  ) &&
  !runner.includes(
    "cron",
  ) &&
  !runner.includes(
    "crontab",
  ) &&
  !runner.includes(
    "RRULE",
  ) &&
  !runner.includes(
    "schedule:",
  ),
  "D10H_NO_DEPLOYMENT_COUPLING",
);

console.log(
  "V2_D10H_RUNNER_STATIC_CONTRACT=PASS",
);

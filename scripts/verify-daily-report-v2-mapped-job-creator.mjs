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

const repo = read(
  "src/lib/media-sync/media-sync-jobs-repository.ts",
);

const route = read(
  "app/api/reports/[id]/media-sync-jobs/route.ts",
);

const v1Scheduler = read(
  "src/lib/media-sync/naver-searchads-daily-report-scheduler.ts",
);

const googleWorker = read(
  "src/lib/media-sync/google-ads-all-data-worker-handler.ts",
);

requireCondition(
  /const DAILY_REPORT_V2_AUTOMATION_CONTRACT\s*=\s*\n?\s*"daily_report_v2"/.test(
    repo,
  ),
  "D9_V2_CONTRACT_CONSTANT",
);

requireCondition(
  /export type CreatePendingDailyReportV2MediaSyncJobInput/.test(
    repo,
  ) &&
    /jobId:\s*string/.test(
      repo,
    ) &&
    /connectionId:\s*string/.test(
      repo,
    ),
  "D9_EXPLICIT_INPUT_CONTRACT",
);

requireCondition(
  /async function requireExplicitReportMappedConnectionId/.test(
    repo,
  ) &&
    /\.eq\(\s*"connection_id"[\s\S]{0,100}input\.connectionId/.test(
      repo,
    ),
  "D9_EXPLICIT_MAPPING_QUERY",
);

requireCondition(
  /useExplicitMappedConnection[\s\S]{0,500}requireExplicitReportMappedConnectionId/.test(
    repo,
  ),
  "D9_EXPLICIT_MAPPING_SELECTION",
);

requireCondition(
  /automation_contract:\s*\n?\s*automationContract/.test(
    repo,
  ),
  "D9_PERSISTS_AUTOMATION_CONTRACT",
);

requireCondition(
  /existingRecord\.automation_contract[\s\S]{0,180}automationContract/.test(
    repo,
  ),
  "D9_DETERMINISTIC_REPLAY_CONTRACT",
);

requireCondition(
  /record\.automation_contract[\s\S]{0,180}automationContract/.test(
    repo,
  ),
  "D9_POST_INSERT_CONTRACT",
);

requireCondition(
  /export async function createPendingMediaSyncJob\([\s\S]{0,220}createPendingMediaSyncJobInternal\(\s*input/.test(
    repo,
  ),
  "D9_LEGACY_CREATOR_WRAPPER",
);

requireCondition(
  /export async function createPendingDailyReportV2MediaSyncJob\([\s\S]{0,500}automationContract:\s*DAILY_REPORT_V2_AUTOMATION_CONTRACT[\s\S]{0,220}useExplicitMappedConnection:\s*true/.test(
    repo,
  ),
  "D9_V2_INTERNAL_WRAPPER",
);

requireCondition(
  !route.includes(
    "createPendingDailyReportV2MediaSyncJob",
  ) &&
    !route.includes(
      "automation_contract",
    ),
  "D9_PUBLIC_ROUTE_UNCHANGED",
);

requireCondition(
  !v1Scheduler.includes(
    "createPendingDailyReportV2MediaSyncJob",
  ) &&
    !v1Scheduler.includes(
      "automation_contract",
    ),
  "D9_V1_SCHEDULER_UNCHANGED",
);

requireCondition(
  !googleWorker.includes(
    "automation_contract",
  ),
  "D9_GOOGLE_WORKER_UNCHANGED",
);

console.log(
  "V2_D9_STATIC_CONTRACT=PASS",
);

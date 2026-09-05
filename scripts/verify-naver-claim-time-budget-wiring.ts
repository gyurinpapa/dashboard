import fs from "node:fs";

function read(path: string): string {
  return fs.readFileSync(
    path,
    "utf8",
  );
}

function count(
  text: string,
  needle: string,
): number {
  return text.split(needle).length - 1;
}

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

const worker =
  read("scripts/media-sync-worker.ts");

const orchestration =
  read(
    "src/lib/media-sync/media-sync-worker-orchestration-repository.ts",
  );

const keywordStaging =
  read(
    "src/lib/media-sync/naver-searchads-staging-orchestrator.ts",
  );

const authoritativeStaging =
  read(
    "src/lib/media-sync/naver-searchads-authoritative-entity-staging-orchestrator.ts",
  );

const keywordCollector =
  read(
    "src/lib/media-sync/naver-searchads-keyword-stats-collector.ts",
  );

const authoritativeCollector =
  read(
    "src/lib/media-sync/naver-searchads-authoritative-entity-stats-collector.ts",
  );

const materialization =
  read(
    "src/lib/media-sync/media-sync-snapshot-materialization-repository.ts",
  );

assert(
  worker.includes(
    "MEDIA_SYNC_WORKER_CLAIM_WORK_BUDGET_MS",
  ),
  "worker time-budget env missing",
);

assert(
  worker.includes(
    "claim work budget ms:",
  ),
  "worker startup budget authority log missing",
);

assert(
  worker.includes(
    "claimWorkBudgetMs:",
  ),
  "worker orchestration handoff missing",
);

assert(
  !worker
    .match(
      /function hasExplicitNaverBoundedRunEnvironment[\s\S]*?\n}/,
    )?.[0]
    .includes(
      "CLAIM_WORK_BUDGET_MS_ENV",
    ),
  "claim budget must not disable authoritative overlap",
);

assert(
  orchestration.includes(
    "claimWorkDeadlineAtMs",
  ),
  "shared claim deadline missing",
);

assert(
  count(
    orchestration,
    "deadlineAtMs:\n",
  ) >= 3,
  "deadline must reach keyword + overlap authoritative + serial authoritative",
);

assert(
  keywordStaging.includes(
    "deadlineAtMs?: number",
  ) &&
  keywordStaging.includes(
    "deadlineAtMs:\n        input.deadlineAtMs",
  ),
  "keyword staging deadline handoff missing",
);

assert(
  authoritativeStaging.includes(
    "deadlineAtMs?:"
  ) &&
  authoritativeStaging.includes(
    "deadlineAtMs:\n        input.deadlineAtMs",
  ),
  "authoritative staging deadline handoff missing",
);

assert(
  keywordCollector.includes(
    '"claim_time_budget_reached"',
  ) &&
  keywordCollector.includes(
    "options.now() >=",
  ),
  "keyword time partial contract missing",
);

assert(
  authoritativeCollector.includes(
    '"claim_time_budget_reached"',
  ) &&
  authoritativeCollector.includes(
    "options.now() >=",
  ),
  "authoritative time partial contract missing",
);

/*
 * Stage A scope guard:
 * materialization must remain untouched until the separate
 * resumable fanout/materialization-yield design is patched.
 */
assert(
  !materialization.includes(
    "claimWorkDeadlineAtMs",
  ) &&
  !materialization.includes(
    "claim_time_budget_reached",
  ),
  "Stage A unexpectedly modified materialization budget semantics",
);

console.log(
  "NAVER_CLAIM_TIME_BUDGET_WIRING=PASS",
);

console.log(
  "KEYWORD_TIME_PARTIAL=PASS",
);

console.log(
  "AUTHORITATIVE_TIME_PARTIAL=PASS",
);

console.log(
  "OVERLAP_GATE_PRESERVED=PASS",
);

console.log(
  "MATERIALIZATION_STAGE_A_UNCHANGED=PASS",
);

console.log(
  "FULL_MONTH_NAVER_SYNC=BLOCKED",
);

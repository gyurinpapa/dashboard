import fs from "node:fs";
import { execFileSync } from "node:child_process";

const orchestrationPath =
  "src/lib/media-sync/media-sync-worker-orchestration-repository.ts";

const orchestration =
  fs.readFileSync(
    orchestrationPath,
    "utf8",
  );

const worker =
  fs.readFileSync(
    "scripts/media-sync-worker.ts",
    "utf8",
  );

const headOrchestration =
  execFileSync(
    "git",
    [
      "show",
      `HEAD:${orchestrationPath}`,
    ],
    {
      encoding: "utf8",
    },
  );

function requireCondition(
  value,
  label,
) {
  if (!value) {
    console.error(`${label}=FAIL`);
    process.exit(30);
  }

  console.log(`${label}=PASS`);
}

requireCondition(
  orchestration.includes(
    'const DAILY_REPORT_V2_AUTOMATION_CONTRACT =',
  ) &&
    orchestration.includes(
      '"daily_report_v2" as const',
    ),
  "D10E_DAILY_V2_MARKER_PRESENT",
);

requireCondition(
  orchestration.includes(
    '"FACT_ONLY_COMPLETION_FAILED"',
  ),
  "D10E_FACT_ONLY_FAILURE_STAGE_PRESENT",
);

requireCondition(
  /const claimedAutomationContract =[\s\S]{0,120}job\.automation_contract/.test(
    orchestration,
  ) &&
    /const completedAutomationContract =[\s\S]{0,120}checkpointJob\.automation_contract/.test(
      orchestration,
    ) &&
    /completedAutomationContract !==[\s\S]{0,100}claimedAutomationContract/.test(
      orchestration,
    ),
  "D10E_CLAIM_TO_COMPLETION_AUTHORITY_PRESERVED",
);

requireCondition(
  /completedAutomationContract ===[\s\S]{0,120}DAILY_REPORT_V2_AUTOMATION_CONTRACT[\s\S]{0,160}options\.enableNaverFactProjection ===[\s\S]{0,40}true/.test(
    orchestration,
  ),
  "D10E_DAILY_V2_BYPASSES_LEGACY_ENV_GATE",
);

requireCondition(
  orchestration.includes(
    'Daily Report V2 Naver fact projection requires one exact date.',
  ),
  "D10E_EXACT_DAY_GATE_PRESENT",
);

const factStart =
  orchestration.indexOf(
    "async function processNaverFactProjectionAfterStaging(",
  );

const factEnd =
  orchestration.indexOf(
    "\nexport async function processClaimedNaverMediaSyncJob(",
    factStart,
  );

requireCondition(
  factStart >= 0 &&
    factEnd > factStart,
  "D10E_FACT_FUNCTION_RANGE",
);

const fact =
  orchestration.slice(
    factStart,
    factEnd,
  );

const exactDay =
  fact.indexOf(
    "Daily Report V2 Naver fact projection requires one exact date.",
  );

const replace =
  fact.indexOf(
    ".replaceFactDate({",
  );

const authorityCheck =
  fact.indexOf(
    "The Naver fact replacement result changed automation authority.",
    replace,
  );

const dailyBranch =
  fact.indexOf(
    "projectionAutomationContract ===",
    authorityCheck,
  );

const complete =
  fact.indexOf(
    ".completeFactOnly({",
    dailyBranch,
  );

const factOnlyReturn =
  fact.indexOf(
    '"fact_only_completed"',
    complete,
  );

const fanout =
  fact.indexOf(
    "  let fanoutTargets:",
    factOnlyReturn,
  );

requireCondition(
  exactDay >= 0 &&
    exactDay < replace &&
    replace < authorityCheck &&
    authorityCheck < dailyBranch &&
    dailyBranch < complete &&
    complete < factOnlyReturn &&
    factOnlyReturn < fanout,
  "D10E_DAILY_V2_ROUTING_ORDER_EXACT",
);

const dailyBranchText =
  fact.slice(
    dailyBranch,
    fanout,
  );

requireCondition(
  dailyBranchText.includes(
    ".completeFactOnly({",
  ) &&
    dailyBranchText.includes(
      '"fact_only_completed"',
    ) &&
    dailyBranchText.includes(
      "snapshotIngestionId:\n          null",
    ),
  "D10E_DAILY_V2_FACT_ONLY_RESULT",
);

for (const forbidden of [
  ".loadFanoutTargets(",
  ".loadFactProjectionCoverage({",
  ".prepareFactSnapshot({",
  ".materializeFactSnapshotBatch({",
  ".activateFactSnapshotFanout({",
  ".finalizeFactSnapshot({",
  "await dependencies.materialize({",
  "await dependencies.activate({",
  "await dependencies.finalize({",
]) {
  requireCondition(
    !dailyBranchText.includes(
      forbidden,
    ),
    `D10E_DAILY_V2_NO_SNAPSHOT_${forbidden
      .replace(/[^A-Za-z0-9]+/g, "_")}`,
  );
}

const headFactStart =
  headOrchestration.indexOf(
    "async function processNaverFactProjectionAfterStaging(",
  );

const headFactEnd =
  headOrchestration.indexOf(
    "\nexport async function processClaimedNaverMediaSyncJob(",
    headFactStart,
  );

const headFact =
  headOrchestration.slice(
    headFactStart,
    headFactEnd,
  );

const headLegacyStart =
  headFact.indexOf(
    "  let fanoutTargets:",
  );

const currentLegacyStart =
  fact.indexOf(
    "  let fanoutTargets:",
    factOnlyReturn,
  );

requireCondition(
  headLegacyStart >= 0 &&
    currentLegacyStart >= 0 &&
    fact.slice(currentLegacyStart) ===
      headFact.slice(headLegacyStart),
  "D10E_LEGACY_FACT_SNAPSHOT_TAIL_BYTE_IDENTICAL",
);

requireCondition(
  worker.includes(
    'result.status === "fact_only_completed"',
  ),
  "D10E_TOP_LEVEL_FACT_ONLY_ALREADY_SUPPORTED",
);

const deferStart =
  orchestration.indexOf(
    "function shouldDeferAutomaticFailureMark(",
  );

const deferEnd =
  orchestration.indexOf(
    "\nfunction resolveOrchestrationDependencies(",
    deferStart,
  );

const deferBody =
  orchestration.slice(
    deferStart,
    deferEnd,
  );

requireCondition(
  !deferBody.includes(
    "FACT_ONLY_COMPLETION_FAILED",
  ),
  "D10E_FACT_ONLY_FAILURE_NOT_DEFERRED",
);

console.log(
  "V2_D10E_STATIC_ROUTING_CONTRACT=PASS",
);

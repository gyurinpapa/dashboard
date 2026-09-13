import fs from "node:fs";

const handler = fs.readFileSync(
  "src/lib/media-sync/google-ads-all-data-worker-handler.ts",
  "utf8",
);

const orchestration = fs.readFileSync(
  "src/lib/media-sync/google-ads-media-sync-worker-orchestration-repository.ts",
  "utf8",
);

const claim = fs.readFileSync(
  "src/lib/media-sync/google-ads-media-sync-worker-claim-repository.ts",
  "utf8",
);

const worker = fs.readFileSync(
  "scripts/media-sync-worker.ts",
  "utf8",
);

function requireCondition(value, label) {
  if (!value) {
    console.error(`${label}=FAIL`);
    process.exit(20);
  }
  console.log(`${label}=PASS`);
}

requireCondition(
  handler.includes('"daily_report_v2" as const'),
  "D10C_AUTOMATION_CONTRACT_PRESENT",
);

requireCondition(
  handler.includes(
    "ProcessGoogleAdsAllDataWorkerFactOnlyCompletedResult",
  ) &&
    handler.includes('"fact_only_completed"'),
  "D10C_FACT_ONLY_RESULT_PRESENT",
);

requireCondition(
  handler.includes("replaceGoogleAdsDailyV2FactDate") &&
    handler.includes("completeGoogleAdsDailyV2FactOnlyJob"),
  "D10C_D10B_REPOSITORY_WIRED",
);

const summaryCall =
  handler.indexOf(
    `  assertCompleteSummary(
    checkpointJob,`
  );

const preservation =
  handler.indexOf(
    "completedAutomationContract !==",
    summaryCall,
  );

const routing =
  handler.indexOf(
    "completedAutomationContract ===",
    preservation,
  );

const replacement =
  handler.indexOf(
    "await replaceDailyV2Fact({",
    routing,
  );

const completion =
  handler.indexOf(
    "await completeDailyV2FactOnly({",
    replacement,
  );

const factOnlyReturn =
  handler.indexOf(
    '"fact_only_completed" as const',
    completion,
  );

const materialization =
  handler.indexOf(
    "await materialize({",
    factOnlyReturn,
  );

const activation =
  handler.indexOf(
    "await activate({",
    materialization,
  );

const finalization =
  handler.indexOf(
    "await finalize({",
    activation,
  );

requireCondition(
  summaryCall >= 0 &&
    summaryCall < preservation &&
    preservation < routing &&
    routing < replacement &&
    replacement < completion &&
    completion < factOnlyReturn &&
    factOnlyReturn < materialization &&
    materialization < activation &&
    activation < finalization,
  "D10C_ROUTING_ORDER_EXACT",
);

requireCondition(
  /completedAutomationContract\s*!==[\s\S]{0,100}claimedAutomationContract/.test(
    handler,
  ),
  "D10C_AUTOMATION_CONTRACT_PRESERVED",
);

requireCondition(
  /completedAutomationContract\s*===[\s\S]{0,100}DAILY_REPORT_V2_AUTOMATION_CONTRACT/.test(
    handler,
  ),
  "D10C_DAILY_V2_ONLY_GATE",
);

requireCondition(
  /checkpointJob\.date_from\s*!==[\s\S]{0,80}checkpointJob\.date_to/.test(
    handler,
  ),
  "D10C_EXACT_DAY_GATE",
);

requireCondition(
  /factReplacement\.sourceRows[\s\S]{0,120}checkpointState\.nextRowIndex/.test(
    handler,
  ) &&
    /factReplacement\.factRows[\s\S]{0,120}checkpointState\.nextRowIndex/.test(
      handler,
    ),
  "D10C_REPLACEMENT_POSTCHECK",
);

requireCondition(
  /factOnlyCompletion\.coveredDates[\s\S]{0,80}1/.test(
    handler,
  ) &&
    /factOnlyCompletion\.partitionRows[\s\S]{0,120}checkpointState\.nextRowIndex/.test(
      handler,
    ) &&
    /factOnlyCompletion\.job\.snapshot_ingestion_id[\s\S]{0,50}null/.test(
      handler,
    ),
  "D10C_FACT_ONLY_COMPLETION_POSTCHECK",
);

requireCondition(
  /status:[\s\S]{0,60}"fact_only_completed" as const[\s\S]{0,1200}snapshotIngestionId:[\s\S]{0,50}null/.test(
    handler,
  ),
  "D10C_NULL_SNAPSHOT_RESULT",
);

requireCondition(
  handler.includes('"FACT_REPLACEMENT_FAILED"') &&
    handler.includes('"FACT_ONLY_COMPLETION_FAILED"'),
  "D10C_FAILURE_STAGES_PRESENT",
);

requireCondition(
  handler.includes("await materialize({") &&
    handler.includes("await activate({") &&
    handler.includes("await finalize({"),
  "D10C_LEGACY_SNAPSHOT_PATH_PRESERVED",
);

requireCondition(
  !orchestration.includes("daily_report_v2") &&
    !orchestration.includes("replaceGoogleAdsDailyV2FactDate"),
  "D10C_ORCHESTRATION_UNCHANGED",
);

requireCondition(
  !claim.includes("replaceGoogleAdsDailyV2FactDate") &&
    !claim.includes("completeGoogleAdsDailyV2FactOnlyJob"),
  "D10C_CLAIM_UNCHANGED",
);

requireCondition(
  worker.includes('result.status === "fact_only_completed"'),
  "D10C_TOP_LEVEL_FACT_ONLY_ALREADY_SUPPORTED",
);

console.log("V2_D10C_STATIC_ROUTING_CONTRACT=PASS");

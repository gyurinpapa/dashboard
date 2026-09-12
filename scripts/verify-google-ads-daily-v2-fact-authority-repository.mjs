import fs from "node:fs";

const source = fs.readFileSync(
  "src/lib/media-sync/google-ads-daily-v2-fact-authority-repository.ts",
  "utf8",
);

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

requireCondition(
  source.includes(
    '"replace_google_ads_daily_v2_fact_date"',
  ) &&
    source.includes(
      '"complete_google_ads_daily_v2_fact_only_job"',
    ),
  "D10B_EXACT_RPC_NAMES",
);

requireCondition(
  source.includes(
    '"google_ads" as const',
  ) &&
    source.includes(
      '"google_all_data_v1" as const',
    ) &&
    source.includes(
      '"daily_report_v2" as const',
    ),
  "D10B_ROUTING_CONTRACTS",
);

requireCondition(
  /readExecutionContract[\s\S]*GOOGLE_ADS_ALL_DATA_EXECUTION_CONTRACT/.test(
    source,
  ),
  "D10B_EXECUTION_AUTHORITY_FAIL_CLOSED",
);

requireCondition(
  /readAutomationContract[\s\S]*DAILY_REPORT_V2_AUTOMATION_CONTRACT/.test(
    source,
  ),
  "D10B_AUTOMATION_AUTHORITY_FAIL_CLOSED",
);

requireCondition(
  /job\.date_from\s*!==[\s\S]{0,50}job\.date_to/.test(
    source,
  ),
  "D10B_EXACT_DAY_GATE",
);

requireCondition(
  /job\.snapshot_ingestion_id\s*!==[\s\S]{0,30}null/.test(
    source,
  ),
  "D10B_NULL_SNAPSHOT_GATE",
);

requireCondition(
  /export async function replaceGoogleAdsDailyV2FactDate/.test(
    source,
  ),
  "D10B_REPLACEMENT_EXPORT",
);

requireCondition(
  /export async function completeGoogleAdsDailyV2FactOnlyJob/.test(
    source,
  ),
  "D10B_COMPLETION_EXPORT",
);

requireCondition(
  /scopeDate\s*!==[\s\S]{0,50}input\.date/.test(
    source,
  ) &&
    /sourceRows\s*!==[\s\S]{0,80}input\.job\.inserted_rows/.test(
      source,
    ),
  "D10B_REPLACEMENT_POSTCHECK",
);

requireCondition(
  /coveredDates\s*!==[\s\S]{0,30}1/.test(
    source,
  ) &&
    /returnedJob\.status\s*!==[\s\S]{0,50}DONE_STATUS/.test(
      source,
    ) &&
    /returnedJob\.snapshot_ingestion_id\s*!==[\s\S]{0,30}null/.test(
      source,
    ),
  "D10B_COMPLETION_POSTCHECK",
);

requireCondition(
  source.includes(
    "TRANSIENT_MAX_ATTEMPTS",
  ) &&
    source.includes(
      "upstream request timeout",
    ) &&
    source.includes(
      '"57014"',
    ),
  "D10B_BOUNDED_TRANSIENT_RETRY",
);

requireCondition(
  !source.includes(
    "materializeMediaSyncSnapshot",
  ) &&
    !source.includes(
      "activateMediaSyncSnapshot",
    ) &&
    !source.includes(
      "finalizeMediaSyncJob",
    ),
  "D10B_NO_SNAPSHOT_LIFECYCLE",
);

requireCondition(
  !source.includes(
    "current_ingestion_id",
  ) &&
    !source.includes(
      "published_ingestion_id",
    ) &&
    !source.includes(
      "last_sync_at",
    ),
  "D10B_NO_POINTER_OR_LAST_SYNC",
);

requireCondition(
  !source.includes(
    "naver_searchad",
  ) &&
    !source.includes(
      "brand_search_cross_grain",
    ),
  "D10B_NO_NAVER_COUPLING",
);

console.log(
  "V2_D10B_STATIC_CONTRACT=PASS",
);

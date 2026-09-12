import fs from "node:fs";

const sql = fs.readFileSync(
  "scripts/sql/create-google-ads-daily-v2-fact-authority.sql",
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
  /^\s*begin\s*;/im.test(
    sql,
  ) &&
    /^\s*commit\s*;/im.test(
      sql,
    ),
  "D10A_ATOMIC_SQL",
);

requireCondition(
  /replace_google_ads_daily_v2_fact_date/i.test(
    sql,
  ),
  "D10A_GOOGLE_REPLACEMENT_RPC",
);

requireCondition(
  /complete_google_ads_daily_v2_fact_only_job/i.test(
    sql,
  ),
  "D10A_GOOGLE_FACT_ONLY_COMPLETION_RPC",
);

requireCondition(
  /v_job\.provider\s*<>\s*'google_ads'/i.test(
    sql,
  ) &&
    /execution_contract[\s\S]{0,100}'google_all_data_v1'/i.test(
      sql,
    ) &&
    /automation_contract[\s\S]{0,100}'daily_report_v2'/i.test(
      sql,
    ),
  "D10A_EXACT_ROUTING_AUTHORITY",
);

requireCondition(
  /v_job\.date_from\s*<>\s*v_job\.date_to/i.test(
    sql,
  ),
  "D10A_EXACT_DAY_ONLY",
);

requireCondition(
  /processing_checkpoint/i.test(
    sql,
  ) &&
    /collector[\s\S]{0,600}phase[\s\S]{0,100}'completed'/i.test(
      sql,
    ) &&
    /collector[\s\S]{0,900}cursor[\s\S]{0,100}'null'::jsonb/i.test(
      sql,
    ),
  "D10A_GOOGLE_TERMINAL_CHECKPOINT_GATE",
);

requireCondition(
  /count\(\s*distinct staging\.row_index\s*\)/i.test(
    sql,
  ) &&
    /count\(\s*distinct staging\.row_key\s*\)/i.test(
      sql,
    ) &&
    /row_fingerprint[\s\S]{0,600}extensions\.digest/i.test(
      sql,
    ),
  "D10A_FULL_STAGING_WITNESS",
);

requireCondition(
  /v_total_rows\s*=\s*0[\s\S]{0,500}v_min_row_index[\s\S]{0,500}v_max_row_index/i.test(
    sql,
  ),
  "D10A_ZERO_ROW_SAFE",
);

requireCondition(
  /pg_advisory_xact_lock/i.test(
    sql,
  ) &&
    /source_job_created_at[\s\S]{0,500}source_job_id/i.test(
      sql,
    ),
  "D10A_CONCURRENCY_AND_STALE_GUARD",
);

requireCondition(
  /with deleted as\s*\([\s\S]*delete[\s\S]*media_sync_fact_rows[\s\S]*inserted as\s*\([\s\S]*insert into public\.media_sync_fact_rows/i.test(
    sql,
  ),
  "D10A_ATOMIC_FACT_REPLACEMENT",
);

requireCondition(
  /insert into public\.media_sync_fact_partitions/i.test(
    sql,
  ) &&
    /row_count/i.test(
      sql,
    ),
  "D10A_DURABLE_PARTITION_AUTHORITY",
);

requireCondition(
  /v_covered_dates\s*<>\s*1/i.test(
    sql,
  ) &&
    /v_partition_rows[\s\S]{0,300}v_job\.inserted_rows/i.test(
      sql,
    ) &&
    /v_fact_rows[\s\S]{0,300}v_job\.inserted_rows/i.test(
      sql,
    ),
  "D10A_FACT_ONLY_COMPLETION_COVERAGE",
);

requireCondition(
  /snapshot_ingestion_id is null/i.test(
    sql,
  ) &&
    /status\s*=\s*'done'/i.test(
      sql,
    ) &&
    /progress\s*=\s*100/i.test(
      sql,
    ),
  "D10A_DONE_NULL_SNAPSHOT_CONTRACT",
);

requireCondition(
  !/update\s+public\.reports/i.test(
    sql,
  ) &&
    !/update\s+public\.media_connections/i.test(
      sql,
    ) &&
    !/insert\s+into\s+public\.report_rows/i.test(
      sql,
    ) &&
    !/insert\s+into\s+public\.report_ingestions/i.test(
      sql,
    ),
  "D10A_NO_REPORT_POINTER_OR_CONNECTION_MUTATION",
);

requireCondition(
  !/naver_searchad/i.test(
    sql,
  ) &&
    !/brand_search_cross_grain_dedup_v1/i.test(
      sql,
    ) &&
    !/authoritative,complete/i.test(
      sql,
    ),
  "D10A_NO_NAVER_CHECKPOINT_COUPLING",
);

requireCondition(
  /revoke all[\s\S]*replace_google_ads_daily_v2_fact_date\(jsonb\)[\s\S]*from public,\s*anon,\s*authenticated/i.test(
    sql,
  ) &&
    /grant execute[\s\S]*replace_google_ads_daily_v2_fact_date\(jsonb\)[\s\S]*service_role/i.test(
      sql,
    ) &&
    /revoke all[\s\S]*complete_google_ads_daily_v2_fact_only_job\(jsonb\)[\s\S]*from public,\s*anon,\s*authenticated/i.test(
      sql,
    ) &&
    /grant execute[\s\S]*complete_google_ads_daily_v2_fact_only_job\(jsonb\)[\s\S]*service_role/i.test(
      sql,
    ),
  "D10A_RPC_SECURITY",
);

console.log(
  "V2_D10A_STATIC_CONTRACT=PASS",
);

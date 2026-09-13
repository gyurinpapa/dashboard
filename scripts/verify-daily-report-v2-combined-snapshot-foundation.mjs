import {
  readFileSync,
} from "node:fs";

const sql =
  readFileSync(
    new URL(
      "./sql/create-daily-report-v2-combined-snapshot-foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );

const repository =
  readFileSync(
    new URL(
      "../src/lib/media-sync/daily-report-v2-combined-snapshot-repository.ts",
      import.meta.url,
    ),
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

    process.exit(
      1,
    );
  }

  console.log(
    `${label}=PASS`,
  );
}

requireCondition(
  sql.includes(
    "create table if not exists public.daily_report_v2_snapshot_runs",
  ) &&
    sql.includes(
      "daily_report_v2_snapshot_runs_report_through_uidx",
    ) &&
    sql.includes(
      "daily_report_v2_snapshot_runs_one_open_per_report_uidx",
    ),
  "D10K2_DURABLE_RUN_AUTHORITY",
);

requireCondition(
  sql.includes(
    "create or replace function public.prepare_daily_report_v2_combined_snapshot",
  ) &&
    sql.includes(
      "'daily_report_v2'",
    ) &&
    sql.includes(
      "'daily_sync'",
    ) &&
    sql.includes(
      "'all_mapped_supported_media'",
    ),
  "D10K2_CANONICAL_PREPARE_RPC",
);

requireCondition(
  sql.includes(
    "'naver_searchad'",
  ) &&
    sql.includes(
      "'google_ads'",
    ) &&
    sql.includes(
      "DRV2S_INACTIVE_PARTICIPANT",
    ) &&
    sql.includes(
      "DRV2S_DUPLICATE_FACT_SCOPE",
    ),
  "D10K2_PARTICIPANT_AUTHORITY",
);

requireCondition(
  sql.includes(
    "public.media_sync_fact_partitions",
  ) &&
    sql.includes(
      "covered_dates = v_expected_dates",
    ) &&
    sql.includes(
      "DRV2S_FACT_COVERAGE_INCOMPLETE",
    ),
  "D10K2_CONTIGUOUS_FACT_GATE",
);

requireCondition(
  sql.includes(
    "insert into public.report_ingestions",
  ) &&
    sql.includes(
      "'api'",
    ) &&
    sql.includes(
      "'processing'",
    ),
  "D10K2_REPORT_INGESTION_REUSE",
);

requireCondition(
  !sql.includes(
    "insert into public.media_sync_report_projections",
  ) &&
    !sql.includes(
      "update public.media_sync_jobs",
    ) &&
    !sql.includes(
      "update public.media_connections",
    ) &&
    !sql.includes(
      "set published_ingestion_id",
    ) &&
    !sql.includes(
      "set current_ingestion_id",
    ),
  "D10K2_NO_LEGACY_RUN_OWNERSHIP_OR_POINTER_MUTATION",
);

requireCondition(
  !sql.includes(
    "materialize_daily_report_v2_combined_snapshot_batch(",
  ) &&
    !sql.includes(
      "activate_daily_report_v2_combined_snapshot(",
    ),
  "D10K2_FOUNDATION_ONLY_BOUNDARY",
);

requireCondition(
  !sql.includes(
    "v_report.published_ingestion_id\n       is distinct from v_report.published_ingestion_id",
  ) &&
    !sql.includes(
      "DRV2S_INTERNAL_ERROR: impossible published pointer comparison",
    ),
  "D10K2_PUBLISHED_POINTER_SELF_COMPARISON_ABSENT",
);

requireCondition(
  repository.includes(
    '"prepare_daily_report_v2_combined_snapshot"',
  ) &&
    repository.includes(
      "prepareDailyReportV2CombinedSnapshot",
    ) &&
    repository.includes(
      "participant_contract",
    ) &&
    repository.includes(
      "participantCount",
    ),
  "D10K2_TYPESCRIPT_ADAPTER",
);

requireCondition(
  !repository.includes(
    "media_sync_report_projections",
  ) &&
    !repository.includes(
      "media_sync_jobs",
    ) &&
    !repository.includes(
      "media_connections",
    ),
  "D10K2_ADAPTER_NO_LEGACY_TABLE_COUPLING",
);

console.log(
  "V2_D10K2_COMBINED_SNAPSHOT_FOUNDATION_STATIC=PASS",
);

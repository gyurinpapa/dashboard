import {
  readFileSync,
} from "node:fs";

const sql =
  readFileSync(
    new URL(
      "./sql/create-daily-report-v2-combined-snapshot-activation.sql",
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
    "public.activate_daily_report_v2_combined_snapshot",
  ),
  "D10K4_ACTIVATION_RPC",
);

requireCondition(
  sql.includes(
    "from public.reports as r",
  ) &&
    sql.includes(
      "for update;",
    ) &&
    sql.includes(
      "from public.daily_report_v2_snapshot_runs as r",
    ) &&
    sql.includes(
      "from public.report_ingestions as ri",
    ) &&
    sql.includes(
      "for share;",
    ),
  "D10K4_LOCK_AUTHORITY",
);

requireCondition(
  /if\s+v_run\.status\s*=\s*'ready'\s+then/.test(
    sql,
  ) &&
    /set\s+status\s*=\s*'activated'/.test(
      sql,
    ) &&
    /v_run\.status\s*:=\s*'activated';/.test(
      sql,
    ) &&
    /v_run\.status\s*<>\s*'activated'/.test(
      sql,
    ),
  "D10K4_READY_TO_ACTIVATED_STATE_MACHINE",
);

requireCondition(
  sql.includes(
    "set current_ingestion_id =",
  ) &&
    sql.includes(
      "is not distinct from v_run.previous_ingestion_id",
    ) &&
    sql.includes(
      "is not distinct from v_published_ingestion_before",
    ),
  "D10K4_CURRENT_POINTER_CAS",
);

requireCondition(
  !sql.toLowerCase().includes(
    "set published_ingestion_id",
  ),
  "D10K4_PUBLISHED_POINTER_IMMUTABLE",
);

requireCondition(
  sql.includes(
    "v_source_fingerprint",
  ) &&
    sql.includes(
      "source_job_id",
    ) &&
    sql.includes(
      "source_job_created_at",
    ) &&
    sql.includes(
      "DRV2SA_SOURCE_GENERATION_CHANGED",
    ),
  "D10K4_COMPACT_SOURCE_FINGERPRINT_REVALIDATION",
);

requireCondition(
  sql.includes(
    "for share of fp;",
  ) &&
    sql.includes(
      "join public.media_sync_fact_partitions as fp",
    ) &&
    sql.includes(
      "fp.date >= v_run.start_date",
    ) &&
    sql.includes(
      "fp.date <= v_run.through_date",
    ),
  "D10K4_PARTITION_GENERATION_LOCKED_THROUGH_CAS",
);

requireCondition(
  sql.includes(
    "v_ingestion.status <> 'success'",
  ) &&
    sql.includes(
      "v_ingestion.row_count",
    ) &&
    sql.includes(
      "v_run.expected_rows",
    ),
  "D10K4_SUCCESS_CANDIDATE_GATE",
);

requireCondition(
  !sql.toLowerCase().includes(
    "update public.media_sync_jobs",
  ) &&
    !sql.toLowerCase().includes(
      "insert into public.media_sync_jobs",
    ) &&
    !sql.toLowerCase().includes(
      "update public.media_connections",
    ) &&
    !sql.toLowerCase().includes(
      "insert into public.media_connections",
    ) &&
    !sql.toLowerCase().includes(
      "update public.media_sync_report_projections",
    ) &&
    !sql.toLowerCase().includes(
      "insert into public.media_sync_report_projections",
    ),
  "D10K4_NO_LEGACY_AUTHORITY_MUTATION",
);

requireCondition(
  !sql.includes(
    "public.media_sync_fact_rows",
  ),
  "D10K4_NO_FULL_FACT_ROW_RESCAN",
);

requireCondition(
  repository.includes(
    '"activate_daily_report_v2_combined_snapshot"',
  ) &&
    repository.includes(
      "activateDailyReportV2CombinedSnapshot",
    ) &&
    repository.includes(
      "currentIngestionId !==\n      snapshotIngestionId",
    ) &&
    repository.includes(
      'status !==\n      "activated"',
    ),
  "D10K4_TYPESCRIPT_ACTIVATION_ADAPTER",
);

requireCondition(
  repository.includes(
    "data.length !==\n      1",
  ) &&
    repository.includes(
      "requireSha256Hex",
    ) &&
    repository.includes(
      "function requirePresentNullableUuid(",
    ) &&
    repository.includes(
      "previousIngestionId:\n      requirePresentNullableUuid(",
    ) &&
    repository.includes(
      "publishedIngestionId:\n      requirePresentNullableUuid(",
    ),
  "D10K4_ADAPTER_FAIL_CLOSED_VALIDATION",
);

console.log(
  "V2_D10K4_COMBINED_SNAPSHOT_ACTIVATION_STATIC=PASS",
);

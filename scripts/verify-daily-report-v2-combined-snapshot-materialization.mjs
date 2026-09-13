import {
  readFileSync,
} from "node:fs";

const sql =
  readFileSync(
    new URL(
      "./sql/create-daily-report-v2-combined-snapshot-materialization.sql",
      import.meta.url,
    ),
    "utf8",
  );

const foundation =
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
  foundation.includes(
    "create table if not exists public.daily_report_v2_snapshot_runs",
  ) &&
    sql.includes(
      "add column if not exists source_fingerprint text null",
    ),
  "D10K3_RUN_SOURCE_FINGERPRINT_AUTHORITY",
);

requireCondition(
  sql.includes(
    "public.materialize_daily_report_v2_combined_snapshot_batch",
  ) &&
    sql.includes(
      "public.complete_daily_report_v2_combined_snapshot",
    ),
  "D10K3_PROVIDER_NEUTRAL_RPCS",
);

requireCondition(
  sql.includes(
    "jsonb_to_recordset(v_run.participant_contract)",
  ) &&
    sql.includes(
      "public.media_sync_fact_partitions",
    ) &&
    sql.includes(
      "public.media_sync_fact_rows",
    ),
  "D10K3_FROZEN_PARTICIPANT_SOURCE_SCOPE",
);

requireCondition(
  sql.includes(
    "source_job_id",
  ) &&
    sql.includes(
      "source_job_created_at",
    ) &&
    sql.includes(
      "extensions.digest",
    ) &&
    sql.includes(
      "DRV2SM_SOURCE_GENERATION_CHANGED",
    ) &&
    sql.includes(
      "DRV2SC_SOURCE_GENERATION_CHANGED",
    ),
  "D10K3_MULTI_BATCH_SOURCE_GENERATION_GATE",
);

requireCondition(
  sql.includes(
    "f.date,\n      f.provider,\n      f.external_account_id,\n      f.row_key",
  ) &&
    sql.includes(
      "b.date,\n              b.provider,\n              b.external_account_id,\n              b.row_key",
    ),
  "D10K3_DETERMINISTIC_COMBINED_ORDER",
);

requireCondition(
  sql.includes(
    "v_checkpoint_before :=\n    v_ingestion.row_count::bigint",
  ) &&
    sql.includes(
      "set row_count =\n             v_batch_end_exclusive::integer",
    ),
  "D10K3_ATOMIC_INGESTION_CHECKPOINT",
);

requireCondition(
  sql.includes(
    "DRV2SM_ZERO_ROW_RUN",
  ) &&
    sql.includes(
      "v_run.expected_rows = 0",
    ) &&
    sql.includes(
      "zero-row snapshot contains report_rows",
    ),
  "D10K3_ZERO_ROW_COMPLETION_PATH",
);

requireCondition(
  sql.includes(
    "set status = 'materializing'",
  ) &&
    sql.includes(
      "set status = 'ready'",
    ),
  "D10K3_RUN_STATE_MACHINE",
);

requireCondition(
  !sql.toLowerCase().includes(
    "update public.reports",
  ) &&
    !sql.toLowerCase().includes(
      "insert into public.media_sync_jobs",
    ) &&
    !sql.toLowerCase().includes(
      "update public.media_sync_jobs",
    ) &&
    !sql.toLowerCase().includes(
      "insert into public.media_connections",
    ) &&
    !sql.toLowerCase().includes(
      "update public.media_connections",
    ) &&
    !sql.toLowerCase().includes(
      "insert into public.media_sync_report_projections",
    ) &&
    !sql.toLowerCase().includes(
      "update public.media_sync_report_projections",
    ),
  "D10K3_NO_LEGACY_OWNERSHIP_MUTATION",
);

requireCondition(
  !sql.toLowerCase().includes(
    "set current_ingestion_id",
  ) &&
    !sql.toLowerCase().includes(
      "set published_ingestion_id",
    ),
  "D10K3_NO_POINTER_MUTATION",
);

requireCondition(
  repository.includes(
    '"materialize_daily_report_v2_combined_snapshot_batch"',
  ) &&
    repository.includes(
      '"complete_daily_report_v2_combined_snapshot"',
  ) &&
    repository.includes(
      "materializeDailyReportV2CombinedSnapshotBatch",
    ) &&
    repository.includes(
      "completeDailyReportV2CombinedSnapshot",
    ),
  "D10K3_TYPESCRIPT_ADAPTERS",
);

requireCondition(
  repository.includes(
    "input.batchSize >\n      5000",
  ) &&
    repository.includes(
      "SHA256_HEX_PATTERN",
    ) &&
    repository.includes(
      "data.length !==\n      1",
    ),
  "D10K3_ADAPTER_FAIL_CLOSED_VALIDATION",
);

requireCondition(
  sql.includes(
    "DRV2SC_FACT_SOURCE_EXTRA_ROWS",
  ) &&
    sql.includes(
      "offset v_run.expected_rows",
    ) &&
    sql.includes(
      "limit 1",
    ),
  "D10K3_CANONICAL_SOURCE_CARDINALITY_CLOSED",
);

requireCondition(
  repository.includes(
    "materializedBatchRows !==\n      expectedBatchRows",
  ) &&
    repository.includes(
      "insertedRows >\n      expectedBatchRows",
    ) &&
    repository.includes(
      "complete !==\n      (\n        nextRowIndex >=\n          expectedRows\n      )",
    ),
  "D10K3_ADAPTER_CROSS_FIELD_INVARIANTS",
);

console.log(
  "V2_D10K3_COMBINED_SNAPSHOT_MATERIALIZATION_STATIC=PASS",
);

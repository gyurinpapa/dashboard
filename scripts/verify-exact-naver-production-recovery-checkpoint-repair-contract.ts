// scripts/verify-exact-naver-production-recovery-checkpoint-repair-contract.ts
//
// Static, database-free contract verification for the exact one-time
// Naver Search Ads recovery checkpoint repair SQL.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SQL_PATH = resolve(
  process.cwd(),
  "scripts/sql/repair-exact-naver-production-recovery-candidate-checkpoint.sql",
);

const sql = readFileSync(SQL_PATH, "utf8");
const normalized = sql.replace(/\r\n/g, "\n");
const lower = normalized.toLowerCase();

function requirePattern(
  pattern: RegExp,
  message: string,
): void {
  assert.match(normalized, pattern, message);
}

function forbidPattern(
  pattern: RegExp,
  message: string,
): void {
  assert.doesNotMatch(normalized, pattern, message);
}

function countMatches(
  pattern: RegExp,
): number {
  return [...normalized.matchAll(pattern)].length;
}

assert.ok(
  normalized.trimStart().startsWith("/*"),
  "The repair SQL must begin with its safety contract comment.",
);

requirePattern(
  /\bbegin;[\s\S]*\bdo\s+\$repair\$[\s\S]*\$repair\$;[\s\S]*\bcommit;\s*$/i,
  "The repair must remain inside one explicit transaction.",
);

requirePattern(
  /set local lock_timeout = '10s';/i,
  "The exact repair lock timeout must remain bounded.",
);
requirePattern(
  /set local statement_timeout = '10min';/i,
  "The exact repair statement timeout must remain bounded.",
);

const exactConstants = [
  "4191baff-393f-4be8-bb38-31548d3ba051",
  "9b9fd0b2-3c1a-40a5-aed4-3674a0a9adb7",
  "ea413950-4068-41e8-9ced-8355020d7e7d",
  "27b1556f-9d42-496f-bd7e-5a59ebee71d4",
  "da51e71a-01ce-42fb-a937-7af0b5f47786",
  "aba7d28f-ec85-49db-941a-fa5babe2af61",
  "48401e55-55e5-4722-ba58-1ad2338eda04",
  "6d74227e-8d3b-4782-b041-6915d1cc3b89",
  "faa9904967893b9980c2063c0837a8402b81b7ff9ad67e94b7a5a798e6602100",
  "ce2e3e29ba94c9e980a4a1a039cdbcdec8ba5078515c39b6559cded641c5bd40",
] as const;

for (const value of exactConstants) {
  assert.ok(
    lower.includes(value),
    `Missing exact recovery constant: ${value}`,
  );
}

requirePattern(
  /v_expected_candidate_updated_at\s+constant timestamptz\s*:=\s*'2026-07-21 04:07:30\.991\+00';/i,
  "The approved candidate updated_at guard changed.",
);
requirePattern(
  /v_expected_source_job_updated_at\s+constant timestamptz\s*:=\s*'2026-07-19 11:59:16\.834\+00';/i,
  "The approved source-job updated_at guard changed.",
);
requirePattern(
  /v_expected_candidate_attempt_count\s+constant bigint\s*:=\s*9;/i,
  "The candidate attempt_count guard must remain exactly 9.",
);
requirePattern(
  /v_source_boundary\s+constant bigint\s*:=\s*44514;/i,
  "44,514 must remain only the immutable source-prefix boundary.",
);
requirePattern(
  /v_expected_total_report_rows\s+constant bigint\s*:=\s*359716;/i,
  "The active report_rows total baseline changed.",
);
requirePattern(
  /v_expected_current_report_rows\s+constant bigint\s*:=\s*118;/i,
  "The current report_rows baseline changed.",
);
requirePattern(
  /v_expected_published_report_rows\s+constant bigint\s*:=\s*44514;/i,
  "The published report_rows baseline changed.",
);

requirePattern(
  /v_candidate_expected_rows\s*:=\s*v_candidate\.raw_rows;/i,
  "Candidate total rows must be derived dynamically from the exact job.",
);
requirePattern(
  /v_authoritative_tail_rows\s*:=\s*v_candidate_expected_rows\s*-\s*v_source_boundary;/i,
  "The authoritative tail must be calculated dynamically.",
);
requirePattern(
  /v_candidate\.raw_rows\s*<\s*v_source_boundary/i,
  "Candidate totals must allow rows beyond the fixed source prefix.",
);
requirePattern(
  /v_checkpoint\s*#>>\s*'\{collector,next_row_index\}'\s*<>\s*v_candidate_expected_rows::text/i,
  "Checkpoint next_row_index must match the dynamic candidate total.",
);
requirePattern(
  /v_checkpoint\s*#>>\s*'\{inserted_rows\}'\s*<>\s*v_candidate_expected_rows::text/i,
  "Checkpoint inserted_rows must match the dynamic candidate total.",
);

forbidPattern(
  /v_candidate\.raw_rows\s+is\s+distinct\s+from\s+v_source_boundary/i,
  "Candidate total rows must never be fixed to the source boundary.",
);
forbidPattern(
  /v_candidate_rows\s*<>\s*v_source_boundary/i,
  "Candidate live row count must never be fixed to 44,514.",
);
forbidPattern(
  /full\s+outer\s+join/i,
  "Large-volume recovery verification must not use a full outer join.",
);
forbidPattern(
  /v_candidate_identity_digest/i,
  "No candidate-wide digest may be calculated.",
);

requirePattern(
  /media_sync_staging_rows_job_row_index_unique/i,
  "The persisted unique row-index contract must be verified.",
);
requirePattern(
  /media_sync_staging_rows_job_window_row_key_unique/i,
  "The persisted unique natural-key contract must be verified.",
);
requirePattern(
  /v_required_unique_constraint_count\s*<>\s*2/i,
  "Both staging unique constraints must gate the repair.",
);

requirePattern(
  /count\(\*\)::bigint,[\s\S]*min\(row\.row_index\)::bigint,[\s\S]*max\(row\.row_index\)::bigint[\s\S]*into[\s\S]*v_candidate_rows,[\s\S]*v_candidate_min_row_index,[\s\S]*v_candidate_max_row_index/i,
  "Dynamic candidate continuity must use count/min/max.",
);
requirePattern(
  /v_candidate_rows\s*<>\s*v_candidate_expected_rows/i,
  "Live candidate count must equal the dynamic job/checkpoint total.",
);
requirePattern(
  /v_candidate_max_row_index\s*<>\s*v_candidate_expected_rows\s*-\s*1/i,
  "Candidate row_index continuity must end at dynamic total minus one.",
);
requirePattern(
  /v_candidate_prefix_rows\s*<>\s*v_source_boundary/i,
  "The immutable source prefix must remain exactly 44,514 rows.",
);
requirePattern(
  /v_candidate_tail_rows\s*<>\s*v_authoritative_tail_rows/i,
  "The authoritative tail must remain dynamic and internally consistent.",
);

requirePattern(
  /from public\.media_sync_staging_rows as source_row\s+left join public\.media_sync_staging_rows as candidate_row[\s\S]*source_row\.job_id\s*=\s*v_source_job_id/i,
  "Source/candidate equality must be a source-bounded indexed prefix comparison.",
);
requirePattern(
  /if\s+v_candidate_prefix_mismatch_rows\s*<>\s*0\s+then/i,
  "Any source-prefix mismatch must stop the repair.",
);

assert.equal(
  countMatches(/\bupdate\s+public\.media_sync_jobs\s+as\s+job\b/gi),
  1,
  "The SQL must contain exactly one media_sync_jobs UPDATE.",
);

forbidPattern(
  /\binsert\s+into\b/i,
  "The repair SQL must not INSERT any row.",
);
forbidPattern(
  /\bdelete\s+from\b/i,
  "The repair SQL must not DELETE any row.",
);
forbidPattern(
  /\btruncate\b/i,
  "The repair SQL must not TRUNCATE any table.",
);
forbidPattern(
  /\bupdate\s+public\.(?!media_sync_jobs\b)[a-z0-9_]+/i,
  "The repair SQL must not UPDATE any table except media_sync_jobs.",
);

const updateMatch = normalized.match(
  /update\s+public\.media_sync_jobs\s+as\s+job\s+set\s+([\s\S]*?)\s+where\s+job\.id\s*=\s*v_candidate_id([\s\S]*?)returning\s+job\.\*/i,
);
assert.ok(updateMatch, "The exact candidate UPDATE could not be parsed.");

const setClause = updateMatch[1]
  .replace(/\s+/g, " ")
  .trim();
assert.equal(
  setClause,
  "error_detail = v_repaired_error_detail, updated_at = v_repair_time",
  "Only candidate.error_detail and candidate.updated_at may change.",
);

const whereClause = updateMatch[2];
for (const guard of [
  /job\.status\s*=\s*'cancelled'/i,
  /job\.attempt_count\s*=\s*v_expected_candidate_attempt_count/i,
  /job\.updated_at\s*=\s*v_expected_candidate_updated_at/i,
  /job\.snapshot_ingestion_id\s+is\s+null/i,
  /job\.raw_rows\s*=\s*v_candidate_expected_rows/i,
  /job\.normalized_rows\s*=\s*v_candidate_expected_rows/i,
  /job\.inserted_rows\s*=\s*v_candidate_expected_rows/i,
  /job\.error_detail\s+is\s+not\s+distinct\s+from\s+v_candidate\.error_detail/i,
]) {
  assert.match(
    whereClause,
    guard,
    `Missing exact candidate UPDATE guard: ${guard}`,
  );
}

requirePattern(
  /v_expected_reduced_recovery\s*:=\s*jsonb_build_object\([\s\S]*?'source_job_id'[\s\S]*?'confirmation_token'[\s\S]*?'expected_current_ingestion_id'[\s\S]*?'expected_published_ingestion_id'[\s\S]*?'isolated'[\s\S]*?\);/i,
  "The exact five-field reduced recovery shape changed.",
);
requirePattern(
  /if\s+v_recovery\s+is\s+distinct\s+from\s+v_expected_reduced_recovery\s+then/i,
  "The one-time reduced-shape gate is missing.",
);
requirePattern(
  /RECOVERY_CHECKPOINT_REPAIR_REDUCED_SHAPE_MISMATCH/,
  "The second-run/repaired-shape rejection code is missing.",
);

requirePattern(
  /v_repaired_recovery\s*:=\s*v_recovery\s*\|\|\s*jsonb_build_object\([\s\S]*?'contract_version'[\s\S]*?'source_job_updated_at'[\s\S]*?'source_staging_rows'[\s\S]*?'source_identity_digest'[\s\S]*?'keyword_counts_derived_from_staging'[\s\S]*?'request_counts_reconstructed'[\s\S]*?'prepared_at'[\s\S]*?'confirmation_token'[\s\S]*?'isolated'[\s\S]*?\);/i,
  "The original recovery contract fields are not fully restored.",
);

requirePattern(
  /active_job\.status\s+in\s*\('pending',\s*'processing'\)/i,
  "The active-job isolation guard is missing.",
);
requirePattern(
  /if\s+v_active_job_count\s*<>\s*0\s+then/i,
  "The repair must stop when an active job exists.",
);

for (const code of [
  "RECOVERY_CHECKPOINT_REPAIR_CANDIDATE_STATE_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_CANDIDATE_ROW_BOUNDARY_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_CHECKPOINT_STATE_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_SOURCE_JOB_STATE_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_REPORT_STATE_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_STAGING_UNIQUE_CONTRACT_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_SOURCE_STAGING_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_CANDIDATE_STAGING_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_SOURCE_PREFIX_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_REPORT_ROWS_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_INGESTION_METADATA_MISMATCH",
  "RECOVERY_CHECKPOINT_REPAIR_UPDATE_SCOPE_BREACHED",
  "RECOVERY_CHECKPOINT_REPAIR_EXTERNAL_STATE_CHANGED",
  "RECOVERY_CHECKPOINT_REPAIR_CANDIDATE_STAGING_CHANGED",
  "RECOVERY_CHECKPOINT_REPAIR_SOURCE_STAGING_CHANGED",
  "RECOVERY_CHECKPOINT_REPAIR_REPORT_SENTINEL_CHANGED",
] as const) {
  assert.ok(lower.includes(code.toLowerCase()), `Missing safety error code: ${code}`);
}

requirePattern(
  /v_report_ingestions_digest_before[\s\S]*v_report_ingestions_digest_after/i,
  "report_ingestions before/after digest validation is missing.",
);
requirePattern(
  /v_current_sentinel_digest_before[\s\S]*v_current_sentinel_digest_after/i,
  "Current report_rows sentinel validation is missing.",
);
requirePattern(
  /v_published_sentinel_digest_before[\s\S]*v_published_sentinel_digest_after/i,
  "Published report_rows sentinel validation is missing.",
);

forbidPattern(
  /\b(?:perform|call|select)\s+(?:public\.)?(?:materialize|activate|finalize)[a-z0-9_]*\s*\(/i,
  "Materialization, activation, or finalization must not be invoked.",
);
forbidPattern(
  /\bclaim_(?:next|exact)[a-z0-9_]*\s*\(/i,
  "No generic or exact claim RPC may run during checkpoint repair.",
);

requirePattern(
  /candidate\.raw_rows\s*=\s*candidate_staging_state\.candidate_rows[\s\S]*candidate\.checkpoint\s*#>>\s*'\{collector,next_row_index\}'[\s\S]*candidate_staging_state\.candidate_rows[\s\S]*as repair_postconditions_ok/i,
  "The dynamic committed post-repair safety result is incomplete.",
);
requirePattern(
  /candidate\.recovery ->> 'confirmation_token'\s*=\s*confirmation\.recalculated_confirmation_token/i,
  "The refreshed confirmation token is not independently recalculated.",
);

console.log(
  "exact recovery checkpoint repair contract verification passed:",
  true,
);
console.log("database client created:", false);
console.log("RPC calls:", false);
console.log("database writes:", false);
console.log("exact candidate UPDATE statements:", 1);
console.log("candidate columns allowed to change: error_detail / updated_at");
console.log("candidate total fixed to 44,514:", false);
console.log("source prefix fixed to 44,514:", true);
console.log("authoritative tail handled dynamically:", true);
console.log("candidate-wide digest/string aggregation:", false);
console.log("full outer joins:", false);
console.log("new jobs allowed:", false);
console.log("staging writes allowed:", false);
console.log("report pointer writes allowed:", false);
console.log("materialization called:", false);
console.log("activation called:", false);
console.log("finalization called:", false);
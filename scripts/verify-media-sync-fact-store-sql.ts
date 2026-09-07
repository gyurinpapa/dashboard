import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sqlPath = path.join(
  process.cwd(),
  "scripts/sql/create-media-sync-fact-store.sql",
);

const sql = fs.readFileSync(
  sqlPath,
  "utf8",
);

/*
 * Mutation-containment assertions must inspect executable SQL only.
 * Architecture/safety comments intentionally name legacy contracts such as
 * report_rows and current_ingestion_id while stating that they stay unchanged.
 */
const executableSql = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n\r]*/g, "");

function mustContain(
  pattern: RegExp,
  message: string,
): void {
  assert.match(
    sql,
    pattern,
    message,
  );
}

function mustNotContain(
  pattern: RegExp,
  message: string,
): void {
  assert.doesNotMatch(
    sql,
    pattern,
    message,
  );
}

/*
 * Table / identity.
 */
mustContain(
  /create table public\.media_sync_fact_rows/i,
  "fact table is missing",
);

mustContain(
  /workspace_id[\s\S]*advertiser_id[\s\S]*provider[\s\S]*external_account_id[\s\S]*row_key/i,
  "canonical identity columns are missing",
);

mustContain(
  /create unique index\s+media_sync_fact_rows_identity_unique[\s\S]*workspace_id[\s\S]*advertiser_id[\s\S]*provider[\s\S]*external_account_id[\s\S]*row_key/i,
  "canonical natural identity unique index is missing",
);

mustContain(
  /media_sync_fact_rows_replacement_scope_index[\s\S]*workspace_id[\s\S]*advertiser_id[\s\S]*provider[\s\S]*external_account_id[\s\S]*date/i,
  "exact account/date replacement index is missing",
);

mustContain(
  /media_sync_fact_rows_retention_date_index/i,
  "retention date index is missing",
);

/*
 * Only workspace / advertiser own canonical lifetime.
 * Operational lineage must not cascade-delete canonical history.
 */
mustContain(
  /workspace_id uuid[\s\S]*references public\.workspaces\(id\)[\s\S]*on delete cascade/i,
  "workspace lifetime FK is missing",
);

mustContain(
  /advertiser_id uuid[\s\S]*references public\.advertisers\(id\)[\s\S]*on delete cascade/i,
  "advertiser lifetime FK is missing",
);

mustNotContain(
  /references public\.reports\s*\(/i,
  "report lineage must not own canonical facts",
);

mustNotContain(
  /references public\.media_connections\s*\(/i,
  "connection lineage must not own canonical facts",
);

mustNotContain(
  /references public\.media_sync_jobs\s*\(/i,
  "job lineage must not own canonical facts",
);

/*
 * Existing canonical payload / fingerprint convention.
 */
mustContain(
  /row jsonb\s+not null/i,
  "canonical JSONB row is missing",
);

mustContain(
  /row_fingerprint text[\s\S]*generated always as[\s\S]*extensions\.digest[\s\S]*sha256/i,
  "generated SHA-256 row fingerprint is missing",
);

/*
 * UI / browser containment.
 */
mustContain(
  /alter table public\.media_sync_fact_rows\s+enable row level security/i,
  "RLS must be enabled",
);

mustContain(
  /revoke all[\s\S]*media_sync_fact_rows[\s\S]*public,\s*anon,\s*authenticated,\s*service_role/i,
  "direct fact table authority must be revoked first",
);

mustContain(
  /grant select[\s\S]*media_sync_fact_rows[\s\S]*service_role/i,
  "service_role fact read authority is missing",
);

mustNotContain(
  /grant\s+(insert|update|delete|all)[\s\S]*media_sync_fact_rows[\s\S]*service_role/i,
  "service_role direct fact mutation must remain disabled",
);


/*
 * Zero-row durable partition authority.
 */
mustContain(
  /create table public\.media_sync_fact_partitions/i,
  "durable fact partition authority table is missing",
);

mustContain(
  /primary key\s*\([\s\S]*workspace_id[\s\S]*advertiser_id[\s\S]*provider[\s\S]*external_account_id[\s\S]*date[\s\S]*\)/i,
  "fact partition natural key is missing",
);

mustContain(
  /row_count bigint\s+not null/i,
  "zero-row partition row_count authority is missing",
);

mustContain(
  /media_sync_fact_partitions[\s\S]*source_job_created_at/i,
  "partition source job chronology is missing",
);

mustContain(
  /insert into public\.media_sync_fact_partitions[\s\S]*on conflict[\s\S]*source_job_created_at/i,
  "partition watermark upsert is missing",
);

mustContain(
  /row_count[\s\S]*v_source_rows/i,
  "zero-row-aware partition row count persistence is missing",
);

/*
 * Replacement RPC security.
 */
mustContain(
  /replace_naver_searchads_fact_date/i,
  "Naver date replacement RPC is missing",
);

mustContain(
  /language plpgsql[\s\S]*security definer[\s\S]*set search_path/i,
  "SECURITY DEFINER hardening is missing",
);

mustContain(
  /revoke all[\s\S]*replace_naver_searchads_fact_date\(jsonb\)[\s\S]*from public/i,
  "public RPC revoke is missing",
);

mustContain(
  /revoke all[\s\S]*replace_naver_searchads_fact_date\(jsonb\)[\s\S]*from anon/i,
  "anon RPC revoke is missing",
);

mustContain(
  /revoke all[\s\S]*replace_naver_searchads_fact_date\(jsonb\)[\s\S]*from authenticated/i,
  "authenticated RPC revoke is missing",
);

mustContain(
  /grant execute[\s\S]*replace_naver_searchads_fact_date\(jsonb\)[\s\S]*service_role/i,
  "service_role RPC execute authority is missing",
);

/*
 * Provider / mode containment.
 */
mustContain(
  /v_job\.provider <> 'naver_searchad'/i,
  "initial RPC must remain Naver-only",
);

mustContain(
  /v_job\.mode <> 'snapshot_replace'/i,
  "legacy snapshot mode authority must remain explicit",
);

/*
 * Destructive replacement completion authority.
 */
mustContain(
  /\{collector,phase\}[\s\S]*completed/i,
  "completed collector gate is missing",
);

mustContain(
  /\{collector,keyword,complete\}[\s\S]*true/i,
  "keyword completion gate is missing",
);

mustContain(
  /\{collector,authoritative,complete\}[\s\S]*true/i,
  "authoritative completion gate is missing",
);

mustContain(
  /brand_search_cross_grain_dedup_v1/i,
  "completed reconciliation authority is missing",
);

mustContain(
  /remaining_overlap_rows[\s\S]*<> 0/i,
  "cross-grain overlap zero guard is missing",
);

mustContain(
  /v_retained_rows < 0/i,
  "retained rows validation must allow zero",
);

mustContain(
  /if v_retained_rows = 0 then[\s\S]*media_sync_staging_rows/i,
  "zero-row authoritative staging guard is missing",
);

/*
 * Post-reconciliation mutation detection.
 */
mustContain(
  /v_min_row_index[\s\S]*is distinct from 0/i,
  "minimum staging boundary witness is missing",
);

mustContain(
  /v_max_row_index[\s\S]*v_retained_rows - 1/i,
  "maximum staging boundary witness is missing",
);

/*
 * Cross-job account/date serialization and stale-job protection.
 */
mustContain(
  /pg_advisory_xact_lock[\s\S]*hashtextextended/i,
  "account/date advisory transaction lock is missing",
);

mustContain(
  /v_partition_source_job_created_at[\s\S]*v_partition_source_job_id[\s\S]*>[\s\S]*v_job\.created_at[\s\S]*v_job\.id/i,
  "deterministic newer-job overwrite protection is missing",
);

mustContain(
  /media_sync_fact_partitions\.source_job_created_at[\s\S]*media_sync_fact_partitions\.source_job_id[\s\S]*<=[\s\S]*excluded\.source_job_created_at[\s\S]*excluded\.source_job_id/i,
  "deterministic partition watermark upsert ordering is missing",
);

/*
 * Exact date partition semantics.
 */
mustContain(
  /staging\.date =\s*v_date/i,
  "staging replacement must be bounded to one date",
);

mustContain(
  /fact\.date =\s*v_date/i,
  "fact deletion must be bounded to one date",
);

/*
 * Atomic omission-aware replacement.
 */
mustContain(
  /with deleted as\s*\([\s\S]*delete[\s\S]*media_sync_fact_rows[\s\S]*inserted as\s*\([\s\S]*insert into public\.media_sync_fact_rows/i,
  "atomic delete + insert replacement CTE is missing",
);

mustContain(
  /v_inserted_rows <>[\s\S]*v_source_rows/i,
  "insert-count postcheck is missing",
);

mustContain(
  /v_fact_rows <>[\s\S]*v_source_rows/i,
  "fact-count postcheck is missing",
);

/*
 * Existing report snapshot/pointer contracts must not be touched.
 */
assert.doesNotMatch(
  executableSql,
  /\breport_rows\b/i,
  "fact migration must not mutate report_rows",
);

assert.doesNotMatch(
  executableSql,
  /\breport_ingestions\b/i,
  "fact migration must not mutate report_ingestions",
);

assert.doesNotMatch(
  executableSql,
  /\bcurrent_ingestion_id\b/i,
  "fact migration must not touch current_ingestion_id",
);

assert.doesNotMatch(
  executableSql,
  /\bpublished_ingestion_id\b/i,
  "fact migration must not touch published_ingestion_id",
);

console.log(
  "MEDIA_SYNC_FACT_STORE_SQL=PASS",
);

console.log(
  "FACT_IDENTITY=workspace+advertiser+provider+external_account+row_key",
);

console.log(
  "REPLACEMENT_PARTITION=workspace+advertiser+provider+external_account+date",
);

console.log(
  "ZERO_ROW_REPLACEMENT=GUARDED",
);

console.log(
  "PARTIAL_REPLACEMENT=BLOCKED",
);

console.log(
  "NEWER_JOB_OVERWRITE=BLOCKED",
);

console.log(
  "DIRECT_FACT_DML=BLOCKED",
);

console.log(
  "REPORT_SNAPSHOT_CONTRACT=UNCHANGED",
);

console.log(
  "PRODUCTION_MUTATIONS=0",
);

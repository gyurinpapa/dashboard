import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Static SQL inspection only: no database client, SQL executor, environment or network.
type FunctionEvidence = {
  definition: string; definition_md5: string; definition_bytes: number;
  public_execute: boolean; role_access: { role: string; execute: boolean }[];
};
type Baseline = { source_sha256: string; source_project_ref_verified: boolean;
  audit: { section: string; object_name: string; detail: {
    overloads?: FunctionEvidence[]; transaction_read_only?: string;
  } }[] };

export const candidateFiles = {
  "create-meta-ads-staging-contract.sql": ["assert_meta_ads_execution_scope", "meta_ads_row_shape_valid", "is_meta_ads_canonical_row",
    "meta_ads_canonical_row_key", "summarize_meta_ads_staging_base", "validate_meta_ads_staging_batch_v1",
    "save_meta_ads_processing_checkpoint", "append_media_sync_staging_batch"],
  "create-meta-ads-snapshot-materialization.sql": ["prepare_media_sync_snapshot_materialization",
    "materialize_media_sync_snapshot_batch", "complete_media_sync_snapshot_materialization"],
  "create-activate-meta-ads-snapshot-fanout.sql": ["lock_meta_ads_snapshot_fanout", "activate_meta_ads_snapshot_fanout"],
  "create-meta-ads-finalization-contract.sql": ["finalize_media_sync_job"],
} as const;
const replaced = ["append_media_sync_staging_batch", "prepare_media_sync_snapshot_materialization",
  "materialize_media_sync_snapshot_batch", "complete_media_sync_snapshot_materialization", "finalize_media_sync_job"];
const md5 = (value: string) => createHash("md5").update(value).digest("hex");

export function extractDefinitions(sql: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\([^]*?AS \$function\$[^]*?\$function\$/g)) {
    assert.ok(!result.has(match[1]), "Duplicate function definition"); result.set(match[1], match[0]);
  }
  return result;
}

export function verifyCandidate(fileName: keyof typeof candidateFiles, sql: string, baseline: Baseline) {
  assert.ok(sql.trimEnd().endsWith("ROLLBACK;"), "Candidate must not commit");
  assert.match(sql, /SET LOCAL search_path = pg_catalog;/, "Definition hashing must use the export search_path");
  const defs = extractDefinitions(sql);
  assert.deepEqual([...defs.keys()], [...candidateFiles[fileName]], "Function change allowlist");
  for (const [name, def] of defs) {
    assert.match(def, /SECURITY DEFINER/);
    assert.match(def, /SET search_path TO 'pg_catalog', 'public'(?:, 'extensions')?/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) FROM PUBLIC, anon, authenticated;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role;`));
    if (replaced.includes(name)) {
      const original = baseline.audit.find((row) => row.object_name === `public.${name}`)!.detail.overloads![0];
      assert.match(sql, new RegExp(original.definition_md5));
      assert.ok(sql.includes(`META_BASELINE_DRIFT: ${name}`));
      const restored = def.replace(/\/\* META_ONLY_BEGIN:(\w+) \*\/[^]*?\/\* META_ONLY_END:\1 \*\/\n?/g, "");
      assert.equal(restored.trimEnd(), original.definition.trimEnd(), `Non-Meta baseline changed: ${name}`);
      if (name === "finalize_media_sync_job") {
        const metaBlock = def.match(/\/\* META_ONLY_BEGIN:meta_atomic_finalize \*\/([^]*?)\/\* META_ONLY_END:meta_atomic_finalize \*\//)![1];
        // RETURNS TABLE names are PL/pgSQL variables. A bare finished_at in
        // the UPDATE predicate is ambiguous even though SQL syntax parses.
        assert.doesNotMatch(metaBlock, /(?<![\w.])finished_at\s+is\s+null/i,
          "Meta finalization must qualify finished_at in its predicate");
      }
    } else {
      assert.ok(name.includes("meta_ads"), "All new functions must be Meta-specific");
      assert.ok(def.startsWith("CREATE FUNCTION "), "Never replace an unexpected existing Meta function");
      assert.ok(sql.includes(`META_NAME_ALREADY_EXISTS: ${name}`));
    }
  }
  // Definitions contain application writes by design. Outside their bodies,
  // candidates may only guard catalog state and define/restrict functions.
  let outside = sql;
  for (const def of defs.values()) outside = outside.replace(def, "");
  assert.doesNotMatch(outside.replace(/--[^\n]*/g, ""), /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|NOTIFY|CALL|COMMIT)\b/i);
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|POLICY|TRIGGER|EXTENSION)\b/i);
  assert.doesNotMatch(sql, /(?:DISABLE\s+TRIGGER|session_replication_role|dblink|http_post|net\.http)/i);
  return defs;
}

export function verifyMetaSqlContracts() {
  const baseline = JSON.parse(readFileSync("scripts/fixtures/meta-ads-db-authority-baseline.json", "utf8")) as Baseline;
  assert.equal(baseline.source_sha256, "df89dfb74fd637f65707007d341f5bdcc469ab8e69bc30b49649586b0dab0f10");
  assert.equal(baseline.source_project_ref_verified, false);
  assert.equal(baseline.audit.length, 29);
  const functionRows = baseline.audit.filter((row) => row.section === "10_function");
  assert.equal(functionRows.length, 17);
  for (const row of functionRows) {
    assert.equal(row.detail.overloads?.length, 1);
    const f = row.detail.overloads![0];
    assert.equal(Buffer.byteLength(f.definition), f.definition_bytes);
    assert.equal(md5(f.definition), f.definition_md5);
    assert.equal(f.public_execute, false);
    for (const role of f.role_access) assert.equal(role.execute, role.role === "service_role");
  }
  const definitions = new Map<string, string>(); let mutationChecks = 0;
  for (const fileName of Object.keys(candidateFiles) as (keyof typeof candidateFiles)[]) {
    const sql = readFileSync(`scripts/sql/${fileName}`, "utf8");
    for (const [name, def] of verifyCandidate(fileName, sql, baseline)) definitions.set(name, def);
    for (const mutated of [sql.replace(/ROLLBACK;\s*$/, "COMMIT;"),
      sql.replace("FROM PUBLIC, anon, authenticated;", "FROM PUBLIC;"),
      sql + "\nALTER TABLE public.reports DISABLE TRIGGER ALL;\nROLLBACK;",
      sql.replace(/META_(BASELINE_DRIFT|NAME_ALREADY_EXISTS)/g, "MISSING_GUARD")]) {
      assert.throws(() => verifyCandidate(fileName, mutated, baseline)); mutationChecks += 1;
    }
  }
  assert.equal(definitions.size, 14);
  // A real modification outside Meta blocks must fail the baseline comparison.
  const material = readFileSync("scripts/sql/create-meta-ads-snapshot-materialization.sql", "utf8");
  assert.throws(() => verifyCandidate("create-meta-ads-snapshot-materialization.sql",
    material.replace("if v_job.status <> 'processing'", "if v_job.status <> 'done'"), baseline));
  mutationChecks += 1;
  const finalization = readFileSync("scripts/sql/create-meta-ads-finalization-contract.sql", "utf8");
  assert.ok(finalization.includes("j.finished_at is null"));
  assert.throws(() => verifyCandidate("create-meta-ads-finalization-contract.sql",
    finalization.replace("j.finished_at is null", "finished_at is null"), baseline));
  mutationChecks += 1;
  const lock = definitions.get("lock_meta_ads_snapshot_fanout")!;
  const activate = definitions.get("activate_meta_ads_snapshot_fanout")!;
  const finalize = definitions.get("finalize_media_sync_job")!;
  assert.ok(lock.indexOf("from public.media_sync_jobs") < lock.indexOf("from public.media_connections"));
  assert.ok(lock.indexOf("from public.media_connections") < lock.indexOf("from public.report_media_connections"));
  assert.match(lock, /count\(distinct \(x\.value->>'report_id'\)::uuid\)/);
  assert.match(lock, /not exists\(select 1 from public\.media_sync_report_projections where media_sync_job_id=m_job\.id and report_id=m_job\.report_id\)/);
  assert.match(lock, /m_report\.meta #>> '\{data_source,kind\}' is distinct from 'api'/);
  for (const check of ["MAPPING_SET_CHANGED", "PROJECTION_AUTHORITY_INVALID", "PRIMARY_MIRROR_INVALID",
    "REPORT_SCOPE_OR_PERIOD_INVALID", "MULTI_CONNECTION_REPORT_UNSUPPORTED", "PUBLISHED_BASELINE_CHANGED", "SNAPSHOT_INCOMPLETE", "PARTIAL_OR_NOT_ACTIVE"])
    assert.ok(lock.includes(`META_FANOUT_${check}`));
  assert.ok(activate.indexOf("lock_meta_ads_snapshot_fanout") < activate.indexOf("update public.reports"));
  assert.doesNotMatch(activate, /update public\.(?:media_sync_jobs|media_connections)/i);
  assert.doesNotMatch(activate, /\bexception\s+when\b/i);
  assert.match(finalize, /lock_meta_ads_snapshot_fanout\(p_payload,true\)/);
  assert.match(finalize, /META_FINALIZE_POINTER_CHANGED/);
  const canonical = definitions.get("meta_ads_row_shape_valid")!;
  assert.doesNotMatch(canonical, /pg_timezone_names/);
  assert.match(definitions.get("is_meta_ads_canonical_row")!, /meta_ads_row_shape_valid/);
  assert.match(definitions.get("is_meta_ads_canonical_row")!, /pg_timezone_names/);
  for (const name of ["append_media_sync_staging_batch", "validate_meta_ads_staging_batch_v1", "prepare_media_sync_snapshot_materialization"]) {
    const body = definitions.get(name)!;
    assert.equal((body.match(/from pg_catalog\.pg_timezone_names/g) ?? []).length, 1,
      `${name}: load the server catalog once per call`);
    assert.match(body, /meta_ads_row_shape_valid/);
    assert.match(body, /or not coalesce\([^\n]+time_zone[^\n]+=any\(m_timezone_names\),false\)/);
    assert.doesNotMatch(body, /public\.is_meta_ads_canonical_row\(/,
      "Bulk validation must not enumerate the time zone catalog per row");
  }
  for (const def of definitions.values()) assert.doesNotMatch(def, /->'provider_meta'\s+-\s+'entity_id'/,
    "Parenthesize JSON extraction before subtraction; PostgreSQL operator precedence matters");
  assert.match(canonical, /v26\.0/);
  for (const field of ["cost", "conversions", "revenue", "impressions", "clicks", "metric_policy", "attribution_windows"])
    assert.ok(canonical.includes(field));
  assert.match(definitions.get("validate_meta_ads_staging_batch_v1")!, /not between 1 and 2000/);
  assert.match(definitions.get("prepare_media_sync_snapshot_materialization")!, /meta_canonical_prepare/);
  assert.match(definitions.get("materialize_media_sync_snapshot_batch")!, /v_projection\.snapshot_ingestion_id/);
  assert.match(definitions.get("materialize_media_sync_snapshot_batch")!, /s\.workspace_id,\s+v_report_id,/);
  assert.match(definitions.get("save_meta_ads_processing_checkpoint")!, /raw_rows=m_expected,normalized_rows=m_expected,inserted_rows=m_expected/);
  return { definitions, mutationChecks };
}

if (process.argv[1]?.endsWith("verify-meta-ads-sql-contract.ts")) {
  const { mutationChecks } = verifyMetaSqlContracts();
  console.log("META_DB_BASELINE_17_DEFINITIONS_HASH_BYTES_ACL=PASS");
  console.log("META_COMMON_FUNCTIONS_BASELINE_RESTORED=5/5");
  console.log("META_SQL_NEW_FUNCTIONS=9");
  console.log(`META_SQL_MUTATION_REJECTION_CASES=${mutationChecks}`);
  console.log("SQL_OBJECT_AND_PRIVILEGE_SCOPE=PASS");
  console.log("DB_EXECUTIONS=0\nSQL_RUNTIME_SEMANTICS=NOT_TESTED\nMETA_SQL_STATIC_CONTRACT=PASS");
}

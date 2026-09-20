import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const path = "scripts/sql/create-meta-ads-materialization-handoff.sql";
const table = "meta_ads_materialization_handoffs";
const functions = ["lock_meta_ads_materialization_handoff_v1", "prepare_meta_ads_materialization_handoff_v1",
  "materialize_meta_ads_handoff_batch_v1", "complete_meta_ads_materialization_handoff_v1"];
const existing = {
  "scripts/sql/create-meta-ads-staging-contract.sql": "77700291945b9e68198f1c065c9fe8928bcd61584df0c8131d4307d4d2510531",
  "scripts/sql/create-meta-ads-snapshot-materialization.sql": "3902332ee27eff683cff1e11276968c12784c50ac1037a08bb6574c186176dfa",
  "scripts/sql/create-activate-meta-ads-snapshot-fanout.sql": "7bec4fe4761f4f2baaa11e572043fe4023cb8d01874eb15ea4294ee318a40427",
  "scripts/sql/create-meta-ads-finalization-contract.sql": "a5247ad5f4f22b6e118efa7edaa4ad502973f0bfe3315068bd661bf0694f8bd0",
  "scripts/sql/create-meta-ads-page-checkpoint-contract.sql": "7736da65d1bdb7e20f868ec1cf6783a843e2dfcca1b27c16ef4ce4c6f4374d6f",
};

const lockRequirements = [
  "v_job.provider IS DISTINCT FROM 'meta_ads'", "v_job.status IS DISTINCT FROM 'processing'",
  "v_job.failed_rows IS DISTINCT FROM 0", "v_job.finished_at IS NOT NULL", "v_job.error IS NOT NULL",
  "v_job.execution_contract IS NOT NULL", "v_job.automation_contract IS NOT NULL", "v_job.sync_segment_progress IS NOT NULL",
  "v_job.attempt_count IS DISTINCT FROM (v_ident->>'attempt_count')::integer",
  "v_job.started_at IS DISTINCT FROM (v_ident->>'started_at')::timestamptz",
  "v_job.workspace_id IS DISTINCT FROM (v_ident->>'workspace_id')::uuid",
  "v_job.advertiser_id IS DISTINCT FROM (v_ident->>'advertiser_id')::uuid",
  "v_job.report_id IS DISTINCT FROM (v_ident->>'report_id')::uuid",
  "v_job.connection_id IS DISTINCT FROM (v_ident->>'connection_id')::uuid",
  "v_job.created_by IS DISTINCT FROM (v_ident->>'created_by')::uuid",
  "v_job.previous_ingestion_id IS DISTINCT FROM (v_ident->>'previous_ingestion_id')::uuid",
  "v_handoff.page_envelope IS DISTINCT FROM v_page", "v_handoff.checkpoint IS DISTINCT FROM v_checkpoint.checkpoint",
  "v_handoff.expected_rows IS DISTINCT FROM v_expected", "v_state := public.load_meta_ads_page_checkpoint_v1(v_page);",
  "v_state->>'phase' IS DISTINCT FROM 'collected'", "v_state->'cursor' IS DISTINCT FROM 'null'::jsonb",
  "v_state->'pending' IS DISTINCT FROM 'null'::jsonb", "v_state->'revision' IS DISTINCT FROM p_payload->'checkpoint_revision'",
  "v_state->>'digest' IS DISTINCT FROM p_payload->>'checkpoint_digest'",
  "v_state->'totalRows' IS DISTINCT FROM to_jsonb(v_expected)", "v_state->'nextRowIndex' IS DISTINCT FROM to_jsonb(v_expected)",
  "v_job.raw_rows>v_expected", "v_job.raw_rows IS DISTINCT FROM v_job.normalized_rows",
  "v_job.raw_rows IS DISTINCT FROM v_job.inserted_rows", "v_existing AND v_job.raw_rows IS DISTINCT FROM v_expected",
  "v_connection.status IS DISTINCT FROM 'active'", "v_mapping.tenant_id IS DISTINCT FROM v_connection.tenant_id",
  "v_ids IS DISTINCT FROM p_payload->'target_report_ids'", "NOT (v_ids ? v_job.report_id::text)",
  "NOT (v_ids ? v_report_id::text)", "v_projection.created_by IS DISTINCT FROM v_job.created_by",
  "v_projection.snapshot_ingestion_id IS DISTINCT FROM v_job.snapshot_ingestion_id",
  "v_report.tenant_id IS DISTINCT FROM v_connection.tenant_id", "v_report.meta#>>'{data_source,kind}' IS DISTINCT FROM 'api'",
  "m.connection_id<>v_job.connection_id", "v_report.published_ingestion_id", "v_handoff.targets IS DISTINCT FROM v_targets",
];
const prepareRequirements = [
  "v_new := NOT (v_locked->>'existing')::boolean;", "IF v_new THEN", "'report_id',v_locked#>'{job,report_id}'",
  "v_before := public.summarize_meta_ads_staging_base(v_validation_payload);",
  "v_before->'is_structurally_complete' IS DISTINCT FROM 'true'::jsonb",
  "v_authority->>'currency' IS DISTINCT FROM v_context->>'currency'",
  "v_authority->>'time_zone' IS DISTINCT FROM v_context->>'timeZone'",
  "v_authority->'metric_policy' IS DISTINCT FROM jsonb_build_object(",
  "WHILE v_start<v_expected LOOP", "'batch_start',v_start,'batch_size',2000",
  "v_batch->'is_valid' IS DISTINCT FROM 'true'::jsonb", "v_batch->'canonical_mismatch_rows' IS DISTINCT FROM '0'::jsonb",
  "v_batch->'batch_rows' IS DISTINCT FROM to_jsonb(least(2000,v_expected-v_start))",
  "v_batch->'batch_max_row_index' IS DISTINCT FROM to_jsonb(least(v_start+2000,v_expected)-1)",
  "v_start := v_start+2000;", "v_after IS DISTINCT FROM v_before",
  "SELECT * INTO STRICT v_saved FROM public.save_meta_ads_processing_checkpoint(v_validation_payload);",
  "v_saved.raw_rows IS DISTINCT FROM v_expected", "v_saved.normalized_rows IS DISTINCT FROM v_expected",
  "v_saved.inserted_rows IS DISTINCT FROM v_expected",
  "VALUES((v_base->>'job_id')::uuid,p_payload->'page',v_locked->'checkpoint',v_expected,v_batches,v_locked->'targets');",
  "SELECT * INTO STRICT v_answer FROM public.prepare_media_sync_snapshot_materialization(v_base);",
];

export function verifyMetaHandoffSql(sql: string) {
  const plain = sql.replace(/--[^\n]*/g, "");
  assert.match(plain, /^\s*BEGIN;/); assert.match(plain, /ROLLBACK;\s*$/);
  assert.doesNotMatch(plain, /\b(?:COMMIT|TRUNCATE|DROP|DELETE\s+FROM|CREATE\s+OR\s+REPLACE|CREATE\s+EXTENSION|CREATE\s+TRIGGER|CREATE\s+POLICY)\b/i);
  assert.doesNotMatch(plain, /\bUPDATE\s+public\.|ON\s+CONFLICT|EXCEPTION\s+WHEN|EXECUTE\s+(?:format|'|\$|v_)/i);
  assert.doesNotMatch(plain, /session_replication_role|dblink|net\.http|pg_sleep|activate_meta_ads_snapshot_fanout|finalize_media_sync_job/i);
  assert.doesNotMatch(plain, /(?:<>|<=|>=|=|<|>)\s*CASE\b/i);
  assert.match(plain, /SET LOCAL lock_timeout = '2s';/); assert.match(plain, /SET LOCAL statement_timeout = '15s';/);
  assert.deepEqual([...plain.matchAll(/CREATE TABLE public\.(\w+)/g)].map(m => m[1]), [table]);
  assert.deepEqual([...plain.matchAll(/CREATE FUNCTION public\.(\w+)\(p_payload jsonb\)/g)].map(m => m[1]), functions);
  assert.match(plain, /META_HANDOFF_OBJECT_EXISTS/); assert.match(plain, /META_HANDOFF_DEPENDENCY_MISSING/);
  assert.ok(plain.includes("job_id uuid PRIMARY KEY REFERENCES public.media_sync_jobs(id) ON DELETE CASCADE"));
  for (const action of ["ENABLE", "FORCE"]) assert.ok(plain.includes(`ALTER TABLE public.${table} ${action} ROW LEVEL SECURITY;`));
  assert.ok(plain.includes(`ALTER TABLE public.${table} OWNER TO postgres;`));
  assert.ok(plain.includes(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role;`));
  assert.doesNotMatch(plain, /GRANT[^;]+ON TABLE/i);
  const definitions = [...plain.matchAll(/CREATE FUNCTION public\.(\w+)\(p_payload jsonb\)([\s\S]*?)\$function\$;/g)];
  assert.equal(definitions.length, 4);
  for (const [index, [, name, body]] of definitions.entries()) {
    assert.match(body, /RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER/);
    assert.ok(body.includes("SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'"));
    assert.ok(plain.includes(`ALTER FUNCTION public.${name}(jsonb) OWNER TO postgres;`));
    assert.ok(plain.includes(`REVOKE ALL ON FUNCTION public.${name}(jsonb) FROM PUBLIC, anon, authenticated${index === 0 ? ", service_role" : ""};`));
  }
  assert.deepEqual([...plain.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\(jsonb\) TO (\w+);/g)]
    .map(m => [m[1], m[2]]), functions.slice(1).map(n => [n, "service_role"]));
  const [lock, prepare, batch, complete] = definitions.map(m => m[2]);
  for (const text of lockRequirements) assert.ok(lock.includes(text), text);
  for (const text of prepareRequirements) assert.ok(prepare.includes(text), text);
  const locks = [
    "FROM public.media_sync_jobs j WHERE j.id=(v_page->>'job_id')::uuid FOR UPDATE;",
    "FROM public.meta_ads_page_checkpoints c WHERE c.job_id=v_job.id FOR UPDATE;",
    "FROM public.meta_ads_materialization_handoffs h WHERE h.job_id=v_job.id FOR UPDATE;",
    "FROM public.media_connections c WHERE c.id=v_job.connection_id FOR UPDATE;",
    "FROM public.report_media_connections m WHERE m.connection_id=v_job.connection_id ORDER BY m.report_id FOR SHARE LOOP",
    "FROM public.media_sync_report_projections p WHERE p.media_sync_job_id=v_job.id ORDER BY p.report_id FOR UPDATE LOOP",
    "ORDER BY r.id FOR UPDATE LOOP",
  ];
  const positions = locks.map(s => { assert.ok(lock.includes(s)); return lock.indexOf(s); });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  for (const body of [prepare, batch, complete]) {
    assert.equal(body.split("v_locked := public.lock_meta_ads_materialization_handoff_v1(p_payload);").length - 1, 1);
  }
  for (const body of [batch, complete]) {
    assert.ok(body.includes("v_locked->'existing' IS DISTINCT FROM 'true'::jsonb"));
    assert.ok(body.includes("v_locked#>'{projection,snapshot_ingestion_id}' IS DISTINCT FROM p_payload->'snapshot_ingestion_id'"));
    assert.ok(body.indexOf("lock_meta_ads_materialization_handoff_v1") < body.indexOf("SELECT * INTO STRICT v_answer"));
  }
  assert.ok(batch.includes("p_payload->'batch_size' IS DISTINCT FROM '2000'::jsonb"));
  assert.ok(batch.includes("mod(v_start,2000)<>0"));
  assert.ok(batch.includes("v_start>=(v_base->>'expected_rows')::integer"));
  assert.ok(batch.includes("FROM public.materialize_media_sync_snapshot_batch(v_base || jsonb_build_object("));
  assert.ok(complete.includes("FROM public.complete_media_sync_snapshot_materialization(v_locked->'base_payload' ||"));
  const ordered = ["lock_meta_ads_materialization_handoff_v1", "v_before :=", "WHILE v_start", "v_after :=",
    "save_meta_ads_processing_checkpoint", `INSERT INTO public.${table}`, "FROM public.prepare_media_sync_snapshot_materialization"];
  const at = ordered.map(s => { assert.ok(prepare.includes(s)); return prepare.indexOf(s); });
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  assert.deepEqual([...plain.matchAll(/\bINSERT INTO public\.(\w+)/g)].map(m => m[1]), [table]);
  assert.deepEqual([...plain.matchAll(/ALTER TABLE public\.(\w+)/g)].map(m => m[1]), [table, table, table]);
  assert.deepEqual([...plain.matchAll(/ALTER FUNCTION public\.(\w+)\(jsonb\)/g)].map(m => m[1]), functions);
  return definitions;
}

// Optional development-only PostgreSQL 17 parser. The Mac runner will not install
// this dependency. No server/SQL execution: even parser PASS is not runtime PASS.
const parserProgram = String.raw`
import sys,json
from pglast import parser
assert parser.get_postgresql_version()[0] == 17
sql=sys.stdin.read()
def verify(text):
    parser.parse_sql_json(text)
    blocks=json.loads(parser.parse_plpgsql_json(text))
    assert len(blocks)==5
    count=0
    def walk(value):
        nonlocal count
        if isinstance(value,dict):
            if "PLpgSQL_expr" in value:
                e=value["PLpgSQL_expr"]; query=e["query"]; mode=e["parseMode"]
                if mode==2: query="SELECT "+query
                elif mode==3:
                    assert ":=" in query
                    query="SELECT "+query.split(":=",1)[1]
                else: assert mode==0
                parser.parse_sql_json(query); count+=1
            for child in value.values(): walk(child)
        elif isinstance(value,list):
            for child in value: walk(child)
    walk(blocks)
    return count
count=verify(sql)
mutations=[("v_start := v_start+2000;","v_start := (1+);"),
           ("v_expected NOT BETWEEN 1 AND 100000","v_expected<CASE WHEN true THEN 1 ELSE 2 END"),
           ("WHERE c.job_id=v_job.id FOR UPDATE;","WHERE c.job_id= FOR UPDATE;")]
for before,after in mutations:
    assert before in sql
    try: verify(sql.replace(before,after,1))
    except parser.ParseError: pass
    else: raise AssertionError("INVALID_SYNTAX_ACCEPTED:"+before)
print(json.dumps({"parser":"PASS","postgresql_parser_version":parser.get_postgresql_version(),
  "functions":4,"guard_blocks":1,"embedded_expressions":count,"syntax_mutations_rejected":len(mutations),
  "db_executions":0,"runtime_semantics":"NOT_TESTED"}))
`;

function main() {
  for (const [file, hash] of Object.entries(existing)) assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), hash, file);
  const sql = readFileSync(path, "utf8"); verifyMetaHandoffSql(sql);
  let cases = 0;
  function reject(from: string, to: string) {
    assert.ok(sql.includes(from), from);
    assert.throws(() => verifyMetaHandoffSql(sql.replace(from, to)), assert.AssertionError, from); cases++;
  }
  for (const text of [...lockRequirements, ...prepareRequirements]) reject(text, "false");
  for (const [from, to] of [
    ["ROLLBACK;", "COMMIT;"], ["CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"],
    ["ENABLE ROW LEVEL SECURITY", "DISABLE ROW LEVEL SECURITY"], ["FORCE ROW LEVEL SECURITY", "NO FORCE ROW LEVEL SECURITY"],
    ["FROM PUBLIC, anon, authenticated, service_role;", "FROM PUBLIC;"], ["TO service_role;", "TO authenticated;"],
    ["FROM PUBLIC, anon, authenticated;", "FROM PUBLIC;"], ["OWNER TO postgres;", "OWNER TO service_role;"],
    ["'extensions', 'pg_temp'", "'extensions'"], ["SET LOCAL statement_timeout = '15s';", "SET LOCAL statement_timeout = '0';"],
    ["SET LOCAL lock_timeout = '2s';", "SET LOCAL lock_timeout = '0';"],
    ["WHERE j.id=(v_page->>'job_id')::uuid FOR UPDATE;", "WHERE j.id=(v_page->>'job_id')::uuid FOR SHARE;"],
    ["WHERE c.job_id=v_job.id FOR UPDATE;", "WHERE c.job_id=v_job.id;"],
    ["WHERE h.job_id=v_job.id FOR UPDATE;", "WHERE h.job_id=v_job.id;"],
    ["WHERE c.id=v_job.connection_id FOR UPDATE;", "WHERE c.id=v_job.connection_id FOR SHARE;"],
    ["ORDER BY m.report_id FOR SHARE LOOP", "ORDER BY m.report_id LOOP"],
    ["ORDER BY p.report_id FOR UPDATE LOOP", "ORDER BY p.report_id LOOP"],
    ["ORDER BY r.id FOR UPDATE LOOP", "ORDER BY r.id FOR SHARE LOOP"],
    ["p_payload->'batch_size' IS DISTINCT FROM '2000'::jsonb", "false"], ["mod(v_start,2000)<>0", "false"],
    ["v_start>=(v_base->>'expected_rows')::integer", "false"],
  ]) reject(from, to);
  for (const name of functions.slice(1)) {
    const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
    const end = sql.indexOf("$function$;", start);
    const block = sql.slice(start, end);
    for (const text of ["v_locked := public.lock_meta_ads_materialization_handoff_v1(p_payload);",
      ...(name === functions[1] ? [] : ["v_locked->'existing' IS DISTINCT FROM 'true'::jsonb",
        "v_locked#>'{projection,snapshot_ingestion_id}' IS DISTINCT FROM p_payload->'snapshot_ingestion_id'"])]) {
      assert.ok(block.includes(text));
      assert.throws(() => verifyMetaHandoffSql(sql.slice(0, start) + block.replace(text, "false") + sql.slice(end))); cases++;
    }
  }
  for (const injected of [`GRANT EXECUTE ON FUNCTION public.${functions[0]}(jsonb) TO service_role;`,
    `GRANT SELECT ON TABLE public.${table} TO service_role;`, "UPDATE public.media_sync_jobs SET status='done';",
    "SELECT public.finalize_media_sync_job('{}'::jsonb);"]) {
    assert.throws(() => verifyMetaHandoffSql(sql.replace(/ROLLBACK;\s*$/, injected + "\nROLLBACK;"))); cases++;
  }
  console.log(`META_HANDOFF_SQL_STATIC_CONTRACT=PASS MUTATION_REJECTIONS=${cases} NEW_TABLES=1 NEW_FUNCTIONS=4 PUBLIC_RPCS=3`);
  console.log("EXISTING_SQL_FILES_HASHES=PASS DB_EXECUTIONS=0 SQL_RUNTIME_SEMANTICS=NOT_TESTED");
  if (process.argv.includes("--postgres-parser")) {
    const result = spawnSync("python3", ["-B", "-c", parserProgram], { input: sql, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.parser, "PASS"); console.log(JSON.stringify(report));
  } else console.log("POSTGRES_PARSER=NOT_RUN (development option: --postgres-parser; requires pglast 7.x)");
}
if (process.argv[1]?.endsWith("verify-meta-ads-materialization-handoff-sql-contract.ts")) main();

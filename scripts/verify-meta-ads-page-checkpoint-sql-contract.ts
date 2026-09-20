import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = "scripts/sql/create-meta-ads-page-checkpoint-contract.sql";
const functions = ["load_meta_ads_page_checkpoint_v1","compare_and_set_meta_ads_page_checkpoint_v1","append_meta_ads_checkpoint_page_v1"];
const existing = {
  "scripts/sql/create-meta-ads-staging-contract.sql":"77700291945b9e68198f1c065c9fe8928bcd61584df0c8131d4307d4d2510531",
  "scripts/sql/create-meta-ads-snapshot-materialization.sql":"3902332ee27eff683cff1e11276968c12784c50ac1037a08bb6574c186176dfa",
  "scripts/sql/create-activate-meta-ads-snapshot-fanout.sql":"7bec4fe4761f4f2baaa11e572043fe4023cb8d01874eb15ea4294ee318a40427",
  "scripts/sql/create-meta-ads-finalization-contract.sql":"a5247ad5f4f22b6e118efa7edaa4ad502973f0bfe3315068bd661bf0694f8bd0",
};
export function verifyMetaPageSql(sql: string) {
  const plain = sql.replace(/--[^\n]*/g,"");
  // PL/pgSQL reads IF expressions up to THEN; CASE must stay inside parentheses.
  assert.doesNotMatch(plain,/(?:<>|<=|>=|=|<|>)\s*CASE\b/i);
  assert.match(plain,/^\s*BEGIN;/); assert.match(plain,/ROLLBACK;\s*$/);
  assert.doesNotMatch(plain,/\b(?:COMMIT|TRUNCATE|DROP|DELETE\s+FROM|CREATE\s+OR\s+REPLACE|CREATE\s+EXTENSION|CREATE\s+TRIGGER)\b/i);
  assert.doesNotMatch(plain,/session_replication_role|dblink|net\.http|auth\.uid|pg_sleep/i);
  assert.deepEqual([...plain.matchAll(/CREATE FUNCTION public\.(\w+)\(p_payload jsonb\)/g)].map(x=>x[1]),functions);
  assert.deepEqual([...plain.matchAll(/CREATE TABLE public\.(\w+)/g)].map(x=>x[1]),["meta_ads_page_checkpoints"]);
  assert.match(plain,/job_id uuid PRIMARY KEY REFERENCES public\.media_sync_jobs\(id\) ON DELETE CASCADE/);
  for (const action of ["ENABLE","FORCE"]) assert.ok(plain.includes(`ALTER TABLE public.meta_ads_page_checkpoints ${action} ROW LEVEL SECURITY;`));
  assert.ok(plain.includes("REVOKE ALL ON TABLE public.meta_ads_page_checkpoints FROM PUBLIC, anon, authenticated, service_role;"));
  assert.doesNotMatch(plain,/GRANT[^;]+ON TABLE/);
  assert.match(plain,/META_PAGE_OBJECT_ALREADY_EXISTS/); assert.match(plain,/META_PAGE_DEPENDENCY_MISSING/);
  const defs = [...plain.matchAll(/CREATE FUNCTION public\.(\w+)\(p_payload jsonb\)([\s\S]*?)\$function\$;/g)];
  assert.equal(defs.length,3);
  for (const [,name,body] of defs) {
    assert.match(body,/VOLATILE SECURITY DEFINER/);
    assert.ok(body.includes("SET search_path TO 'pg_catalog', 'public', 'extensions'"));
    assert.ok(plain.includes(`REVOKE ALL ON FUNCTION public.${name}(jsonb) FROM PUBLIC, anon, authenticated;`));
    assert.ok(plain.includes(`GRANT EXECUTE ON FUNCTION public.${name}(jsonb) TO service_role;`));
  }
  const [load,cas,append]=defs.map(x=>x[2]);
  assert.match(load,/FROM public\.media_sync_jobs WHERE id=\(p_payload->>'job_id'\)::uuid FOR UPDATE/);
  assert.match(load,/FROM public\.meta_ads_page_checkpoints WHERE job_id=j.id FOR UPDATE/);
  assert.ok(load.indexOf("FROM public.media_sync_jobs")<load.indexOf("FROM public.meta_ads_page_checkpoints"));
  for(const text of ["j.attempt_count IS DISTINCT FROM (ident->>'attempt_count')::integer",
    "j.started_at IS DISTINCT FROM (ident->>'started_at')::timestamptz", "j.provider IS DISTINCT FROM 'meta_ads'",
    "j.status IS DISTINCT FROM 'processing'", "META_PAGE_CHECKPOINT_MISSING", "META_PAGE_SCOPE_DRIFT",
    "META_PAGE_STAGING_FROZEN", "stored.scope_document IS DISTINCT FROM doc"]) assert.ok(load.includes(text),text);
  for(const body of [cas,append]) assert.match(body,/public\.load_meta_ads_page_checkpoint_v1\(p_payload\)/);
  for(const text of ["p_payload->'expected_revision' IS DISTINCT FROM old->'revision'", "META_PAGE_APPEND_NOT_CONFIRMED",
    "META_PAGE_TERMINAL_IMMUTABLE", "META_PAGE_CURSOR_INVALID", "META_PAGE_ROW_DUPLICATE", "META_PAGE_CONTEXT_DRIFT",
    "s.row IS DISTINCT FROM x.value->'row'", "stage_count<>total", "nxt-'digest' IS DISTINCT FROM expected",
    "'namespace','meta_page_checkpoint_v1','body',nxt-'digest'", "old->>'phase'='collecting'", "old->>'phase'='pending'"])
    assert.ok(cas.includes(text),text);
  assert.doesNotMatch(cas,/\{1,4096\}/);
  assert.ok(cas.includes("length(cur->>'after') NOT BETWEEN 1 AND 4096"));
  assert.ok(append.indexOf("load_meta_ads_page_checkpoint_v1")<append.indexOf("append_media_sync_staging_batch"));
  assert.match(append,/p_payload->'expected_revision' IS DISTINCT FROM state->'revision'/);
  assert.match(append,/p_payload->>'pending_id' IS DISTINCT FROM state#>>'\{pending,id\}'/);
  assert.match(append,/request IS DISTINCT FROM jsonb_build_object/);
  assert.doesNotMatch(append,/EXCEPTION\s+WHEN/i);
  assert.deepEqual([...plain.matchAll(/\b(?:INSERT INTO|UPDATE|ALTER TABLE)\s+public\.(\w+)/g)].map(x=>x[1])
    .filter(n=>n!=="meta_ads_page_checkpoints"),[]);
}
function main() {
  for(const [file,hash] of Object.entries(existing)) assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"),hash);
  const sql=readFileSync(path,"utf8");verifyMetaPageSql(sql);
  const replacements: Array<[string,string]>=[
    ["value<(CASE WHEN k='maxRetries' THEN 0 WHEN k='maxResponseBytes' THEN 128 ELSE 1 END)",
     "value<CASE WHEN k='maxRetries' THEN 0 WHEN k='maxResponseBytes' THEN 128 ELSE 1 END"],
    ["value>(CASE k WHEN 'pageSize' THEN 2000 WHEN 'maxPages' THEN 1000 WHEN 'maxRecords' THEN 100000\n      WHEN 'maxRetries' THEN 3 WHEN 'requestTimeoutMs' THEN 30000 ELSE 8388608 END)",
     "value>CASE k WHEN 'pageSize' THEN 2000 WHEN 'maxPages' THEN 1000 WHEN 'maxRecords' THEN 100000\n      WHEN 'maxRetries' THEN 3 WHEN 'requestTimeoutMs' THEN 30000 ELSE 8388608 END"],
    ["jsonb_array_length(cur->k)<>(CASE WHEN k='seenRows' THEN fetched ELSE pages END)",
     "jsonb_array_length(cur->k)<>CASE WHEN k='seenRows' THEN fetched ELSE pages END"],
    ["ROLLBACK;","COMMIT;"],["FOR UPDATE;",";"],["ENABLE ROW LEVEL SECURITY","DISABLE ROW LEVEL SECURITY"],
    ["FORCE ROW LEVEL SECURITY","NO FORCE ROW LEVEL SECURITY"],["FROM PUBLIC, anon, authenticated;","FROM PUBLIC;"],
    ["FROM PUBLIC, anon, authenticated, service_role;","FROM PUBLIC, anon, authenticated;"],
    ["TO service_role;","TO authenticated;"],["CREATE FUNCTION","CREATE OR REPLACE FUNCTION"],
    ["j.attempt_count IS DISTINCT FROM (ident->>'attempt_count')::integer","false"],
    ["j.started_at IS DISTINCT FROM (ident->>'started_at')::timestamptz","false"],
    ["j.provider IS DISTINCT FROM 'meta_ads'","false"],["j.status IS DISTINCT FROM 'processing'","false"],
    ["p_payload->'expected_revision' IS DISTINCT FROM old->'revision'","false"],
    ["s.row IS DISTINCT FROM x.value->'row'","false"],["stage_count<>total","false"],
    ["nxt-'digest' IS DISTINCT FROM expected","false"],
    ["p_payload->>'pending_id' IS DISTINCT FROM state#>>'{pending,id}'","false"],
    ["stored.scope_document IS DISTINCT FROM doc","false"],
    ["length(cur->>'after') NOT BETWEEN 1 AND 4096","false"],
  ];
  let cases=0;
  for(const [from,to] of replacements) {assert.ok(sql.includes(from));assert.throws(()=>verifyMetaPageSql(sql.replace(from,to)));cases++;}
  assert.throws(()=>verifyMetaPageSql(sql.replace(/ROLLBACK;\s*$/,"UPDATE public.media_sync_jobs SET status='done';\nROLLBACK;")));cases++;
  console.log(`META_PAGE_SQL_STATIC_CONTRACT=PASS MUTATION_REJECTIONS=${cases} NEW_TABLES=1 NEW_FUNCTIONS=3`);
  console.log("EXISTING_SQL_HASHES=PASS DB_EXECUTIONS=0 SQL_RUNTIME_SEMANTICS=NOT_TESTED");
}
if(process.argv[1]?.endsWith("verify-meta-ads-page-checkpoint-sql-contract.ts"))main();

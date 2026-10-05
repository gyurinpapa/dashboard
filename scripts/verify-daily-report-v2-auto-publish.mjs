// Synthetic PostgreSQL runtime tests. No network or production credentials.
// Install @electric-sql/pglite@0.4.0 in a separate temporary directory and set
// ETRYLUE_PGLITE_ROOT to its node_modules/@electric-sql/pglite directory.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.env.ETRYLUE_PGLITE_ROOT;
if (!root) throw new Error('ETRYLUE_PGLITE_ROOT is required (test-only dependency)');
const { PGlite } = await import(pathToFileURL(`${root}/dist/index.js`));
const { pgcrypto } = await import(pathToFileURL(`${root}/dist/contrib/pgcrypto.js`));
const db = new PGlite({ extensions: { pgcrypto } });
const sql = readFileSync(new URL('./sql/create-daily-report-v2-combined-snapshot-activation.sql', import.meta.url), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [report, workspace, advertiser, user, run, old, next, job, image] = Array.from({length:9},(_,i)=>uid(i+1));
await db.exec(`
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER; END IF; END $$;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE reports(id uuid PRIMARY KEY, workspace_id uuid, advertiser_id uuid, created_by uuid,
 status text, meta jsonb, period_start date, period_end date, draft_period_start date, draft_period_end date,
 current_ingestion_id uuid, published_ingestion_id uuid, share_token text, published_at timestamptz,
 published_creatives_batch_id uuid, current_creatives_batch_id uuid, published_period_start date,
 published_period_end date, title text);
CREATE TABLE daily_report_v2_snapshot_runs(id uuid PRIMARY KEY, report_id uuid, workspace_id uuid,
 advertiser_id uuid, created_by uuid, status text, start_date date, through_date date,
 previous_ingestion_id uuid, snapshot_ingestion_id uuid, source_fingerprint text,
 participant_contract jsonb, expected_rows int, updated_at timestamptz);
CREATE TABLE report_ingestions(id uuid PRIMARY KEY, workspace_id uuid, report_id uuid, kind text,
 status text, row_count int, csv_path text, error text, created_by uuid);
CREATE TABLE media_sync_fact_partitions(workspace_id uuid,advertiser_id uuid,provider text,
 external_account_id text,date date,source_job_id uuid,source_job_created_at timestamptz,row_count int);
CREATE TABLE report_rows(ingestion_id uuid,row jsonb);
`);
await db.exec(sql);
const query = async (s,args=[]) => (await db.query(s,args)).rows;
async function reset() {
 await db.exec('TRUNCATE reports,daily_report_v2_snapshot_runs,report_ingestions,media_sync_fact_partitions,report_rows');
 const meta={data_source:{kind:'api'},public_identity:{source_type:'api',period_type:'daily_sync',period_key:'2026-10-05'},media_sync:{auto_sync:{enabled:true,contract:'daily_report_v2',start_date:'2026-10-05',scope:'all_mapped_supported_media'}},month_goal:123,filters:{campaign:'unchanged'}};
 await query(`INSERT INTO reports(id,workspace_id,advertiser_id,created_by,status,meta,current_ingestion_id,published_ingestion_id,share_token,published_at,published_creatives_batch_id,current_creatives_batch_id,title) VALUES($1,$2,$3,$4,'ready',$5,$6,$6,'synthetic-share-token','2026-10-01',$7,$8,'unchanged')`,[report,workspace,advertiser,user,JSON.stringify(meta),old,image,uid(10)]);
 await query(`INSERT INTO report_ingestions VALUES($1,$2,$3,'api','success',2,null,null,$4)`,[next,workspace,report,user]);
 await query(`INSERT INTO media_sync_fact_partitions VALUES($1,$2,'naver_searchad','synthetic-account','2026-10-05',$3,'2026-10-05T20:00:00Z',2)`,[workspace,advertiser,job]);
 await query(`INSERT INTO daily_report_v2_snapshot_runs VALUES($1,$2,$3,$4,$5,'ready','2026-10-05','2026-10-05',$6,$7,null,$8,2,null)`,[run,report,workspace,advertiser,user,old,next,JSON.stringify([{provider:'naver_searchad',external_account_id:'synthetic-account'}])]);
 await db.exec(`UPDATE daily_report_v2_snapshot_runs SET source_fingerprint=(SELECT encode(extensions.digest(convert_to(jsonb_build_array(provider,external_account_id,date::text,source_job_id::text,extract(epoch from source_job_created_at)::text,row_count)::text,'UTF8'),'sha256'),'hex') FROM media_sync_fact_partitions)`);
 await query(`INSERT INTO report_rows VALUES($1,'{"cost":42,"clicks":3}'),($2,'{"cost":43,"clicks":4}')`,[old,next]);
}
const activate = () => query('SELECT * FROM activate_daily_report_v2_combined_snapshot($1::jsonb)',[JSON.stringify({run_id:run})]);
const state = async () => ({report:(await query('SELECT * FROM reports'))[0],run:(await query('SELECT * FROM daily_report_v2_snapshot_runs'))[0],rows:await query('SELECT * FROM report_rows ORDER BY ingestion_id'),partitions:await query('SELECT * FROM media_sync_fact_partitions')});
let passed=0;
async function test(name,fn){await reset();await fn();passed++;console.log(`PASS ${name}`);}
async function rejectWith(pattern){const before=await state();await assert.rejects(activate,pattern);assert.deepEqual(await state(),before);}
await test('published daily advances both pointers and preserves all other report fields/data',async()=>{
 const before=await state();const result=(await activate())[0];const after=await state();
 assert.equal(after.report.current_ingestion_id,next);assert.equal(after.report.published_ingestion_id,next);
 assert.deepEqual(after.report,{...before.report,current_ingestion_id:next,published_ingestion_id:next});
 assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.partitions,before.partitions);
 assert.equal(after.run.status,'activated');assert.equal(result.idempotent,false);
});
await test('first publication remains manual',async()=>{
 await db.exec('UPDATE reports SET published_ingestion_id=null,share_token=null,published_at=null');
 await activate();assert.equal((await state()).report.published_ingestion_id,null);
});
await test('draft with an old published pointer is not auto-published',async()=>{
 await db.exec("UPDATE reports SET status='draft'");await activate();assert.equal((await state()).report.published_ingestion_id,old);
});
for(const token of [null,'','   ']) await test(`missing/blank share token ${JSON.stringify(token)} is not auto-published`,async()=>{
 await query('UPDATE reports SET share_token=$1',[token]);await activate();assert.equal((await state()).report.published_ingestion_id,old);
});
await test('exact retry does not change any state',async()=>{
 await activate();const before=await state();assert.equal((await activate())[0].idempotent,true);assert.deepEqual(await state(),before);
});
await test('retry preserves later manual publication decision',async()=>{
 await activate();await query('UPDATE reports SET published_ingestion_id=$1',[old]);const before=await state();await activate();assert.deepEqual(await state(),before);
});
await test('already activated pre-upgrade run is not silently republished',async()=>{
 await query('UPDATE reports SET current_ingestion_id=$1',[next]);await db.exec("UPDATE daily_report_v2_snapshot_runs SET status='activated'");
 const before=await state();await activate();assert.deepEqual(await state(),before);
});
await test('failed snapshot cannot move either pointer',async()=>{await db.exec("UPDATE report_ingestions SET status='failed'");await rejectWith(/INGESTION_INVALID/)});
await test('row count mismatch cannot publish',async()=>{await db.exec('UPDATE report_ingestions SET row_count=1');await rejectWith(/INGESTION_INVALID/)});
await test('unfinished run cannot publish',async()=>{await db.exec("UPDATE daily_report_v2_snapshot_runs SET status='materializing'");await rejectWith(/RUN_NOT_READY/)});
await test('changed canonical data cannot publish',async()=>{await db.exec('UPDATE media_sync_fact_partitions SET row_count=3');await rejectWith(/SOURCE_GENERATION_CHANGED/)});
await test('stale current pointer cannot publish',async()=>{await query('UPDATE reports SET current_ingestion_id=$1',[uid(99)]);await rejectWith(/ACTIVATION_CONFLICT/)});
await test('cross-workspace run cannot publish',async()=>{await query('UPDATE daily_report_v2_snapshot_runs SET workspace_id=$1',[uid(99)]);await rejectWith(/SCOPE_MISMATCH/)});
for(const [name,path,value] of [
 ['ordinary report','{public_identity,period_type}','monthly'],['CSV report','{data_source,kind}','csv'],
 ['disabled automation','{media_sync,auto_sync,enabled}',false],['other automation contract','{media_sync,auto_sync,contract}','other']
]) await test(`${name} rejected without mutations`,async()=>{
 await query('UPDATE reports SET meta=jsonb_set(meta,$1::text[],$2::jsonb)',[path,JSON.stringify(value)]);await rejectWith(/INVALID_REPORT/);
});
await test('missing daily metadata never grants new automatic publication',async()=>{
 await db.exec("UPDATE reports SET meta=meta #- '{media_sync,auto_sync,contract}'");await activate();assert.equal((await state()).report.published_ingestion_id,old);
});
await test('transaction failure after report update rolls back both pointers',async()=>{
 await db.exec(`CREATE FUNCTION fail_test_run() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic late failure'; END $$;
 CREATE TRIGGER fail_test BEFORE UPDATE ON daily_report_v2_snapshot_runs FOR EACH ROW EXECUTE FUNCTION fail_test_run()`);
 await rejectWith(/synthetic late failure/);await db.exec('DROP TRIGGER fail_test ON daily_report_v2_snapshot_runs; DROP FUNCTION fail_test_run()');
});
await test('only service_role can execute RPC',async()=>{
 const rows=await query(`SELECT has_function_privilege('anon','activate_daily_report_v2_combined_snapshot(jsonb)','EXECUTE') anon,
 has_function_privilege('authenticated','activate_daily_report_v2_combined_snapshot(jsonb)','EXECUTE') authenticated,
 has_function_privilege('service_role','activate_daily_report_v2_combined_snapshot(jsonb)','EXECUTE') service_role`);
 assert.deepEqual(rows[0],{anon:false,authenticated:false,service_role:true});
});
console.log(JSON.stringify({passed,engine:(await query('SELECT version()'))[0].version,production_reads:0,production_writes:0,external_api_calls:0}));
await db.close();

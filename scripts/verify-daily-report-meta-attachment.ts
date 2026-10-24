import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

async function main() {
  const path = process.env.META_TEST_PGLITE_MODULE;
  assert.ok(path, "Use an isolated PGlite module, never a production database.");
  const { PGlite } = await import(path);
  const db = new PGlite();
  let cases = 0;
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.exec(`
    create role service_role bypassrls; create role anon; create role authenticated;
    create table reports(id uuid primary key,tenant_id uuid,workspace_id uuid,advertiser_id uuid,report_type_id uuid,
      status text,meta jsonb,current_ingestion_id uuid,published_ingestion_id uuid,
      unique(tenant_id,workspace_id,advertiser_id,id));
    create table report_types(id uuid primary key,key text);
    create table media_connections(id uuid primary key,tenant_id uuid,workspace_id uuid,advertiser_id uuid,
      provider text,status text,credential_ciphertext text,credential_version integer,last_verified_at timestamptz,
      external_account_id text,meta jsonb,unique(tenant_id,workspace_id,advertiser_id,id));
    create table report_media_connections(report_id uuid,connection_id uuid);
    create table manual_report_media_connections(report_id uuid,connection_id uuid);
    create table report_ingestions(id uuid primary key,workspace_id uuid,report_id uuid,kind text,status text,row_count integer,created_by uuid);
    create table report_rows(id uuid default gen_random_uuid(),workspace_id uuid,report_id uuid,advertiser_id uuid,
      row_index integer,row jsonb,date date,channel text,device text,source text,ingestion_id uuid,
      unique(report_id,ingestion_id,row_index));
    create table daily_report_v2_snapshot_runs(report_id uuid,workspace_id uuid,advertiser_id uuid,snapshot_ingestion_id uuid,
      status text,start_date date,through_date date,expected_rows integer);
    create table meta_ads_daily_partitions(connection_id uuid,tenant_id uuid,workspace_id uuid,advertiser_id uuid,
      date date,row_count integer,rows jsonb,content_hash text,policy jsonb);
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(readFileSync("scripts/sql/attach-daily-report-meta.sql", "utf8"));
  const policy = { contract: "meta_contact_snapshot_v1", enabled: true, external_account_id: "123", currency: "KRW",
    time_zone: "Asia/Seoul", conversion_field: "conversions", conversion_action_type: "contact_website",
    missing_conversion: "zero_after_complete_reconciliation", revenue: "not_provided", attribution: "platform_default", report_type: "db" };
  const meta = { data_source: { kind: "api", provider: "naver_searchad" }, public_identity: { period_type: "daily_sync", period_key: "2020-09-01" },
    media_sync: { auto_sync: { contract: "daily_report_v2", start_date: "2020-09-01", enabled: true } } };
  await db.query("insert into report_types values($1,'db')", [id(5)]);
  await db.query("insert into reports values($1,$2,$3,$4,$5,'ready',$6,$7,$8)", [id(1), id(2), id(3), id(4), id(5), meta, id(10), id(10)]);
  for (const [n,provider,advertiser] of [[6,"naver_searchad",4],[7,"meta_ads",4],[8,"meta_ads",99],[9,"google_ads",4]] as const) {
    await db.query("insert into media_connections values($1,$2,$3,$4,$5,'active','synthetic',1,now(),'123',$6)",
      [id(n),id(2),id(3),id(advertiser),provider,{ meta_ads_reporting:policy,meta_ads_daily:{contract:"meta_daily_v1",enabled:true,start_date:"2020-09-01"} }]);
  }
  await db.query("insert into report_media_connections values($1,$2)",[id(1),id(6)]);
  await db.query("insert into report_ingestions values($1,$2,$3,'api','success',1,$4)",[id(10),id(3),id(1),id(20)]);
  const naver = { provider:"naver_searchad",date:"2020-09-01",cost:1234,impressions:123,clicks:12,conversions:1 };
  await db.query("insert into report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,source,ingestion_id) values($1,$2,$3,0,$4,'2020-09-01','Naver','Naver',$5)",[id(3),id(1),id(4),naver,id(10)]);
  await db.query("insert into daily_report_v2_snapshot_runs values($1,$2,$3,$4,'activated','2020-09-01','2020-09-02',1)",[id(1),id(3),id(4),id(10)]);
  const addPartition = (date:string,cost:number) => db.query("insert into meta_ads_daily_partitions values($1,$2,$3,$4,$5,1,$6,$7,$8)",
    [id(7),id(2),id(3),id(4),date,[{provider:"meta_ads",date,cost,impressions:5,clicks:1,conversions:2}],String(cost),policy]);
  await addPartition("2020-09-01", 200);
  const attach = (ids=[id(6),id(7)]) => db.query("select attach_daily_report_meta_v1($1,$2,$3) result",[id(1),ids,id(20)]);
  const resolve = (source=id(10)) => db.query("select resolve_daily_report_meta_snapshot_v1($1,$2) result",[id(1),source]);
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(attach(),/permission denied/); await assert.rejects(resolve(),/permission denied/); cases+=2;
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await resolve()).rows[0].result.status,"unattached"); cases++;
  for (const ids of [[id(8)],[id(9)],[id(6),id(6)],[]]) {
    await assert.rejects(attach(ids),/DAILY_META_/); cases++;
  }
  assert.equal((await attach()).rows[0].result.status,"attached"); cases++;
  assert.equal((await attach()).rows[0].result.status,"unchanged"); cases++;
  assert.equal((await attach([id(6)])).rows[0].result.status,"unchanged"); cases++;
  await assert.rejects(resolve(),/DAILY_META_COVERAGE_INCOMPLETE/); cases++;
  assert.equal((await db.query("select count(*)::integer n from report_ingestions")).rows[0].n,1); cases++;
  await addPartition("2020-09-02", 300);
  const first=(await resolve()).rows[0].result;
  assert.deepEqual([first.source_rows,first.meta_rows],[1,2]); cases++;
  assert.equal((await resolve()).rows[0].result.snapshot_ingestion_id,first.snapshot_ingestion_id); cases++;
  const source=await db.query("select row from report_rows where ingestion_id=$1",[id(10)]);
  assert.deepEqual(source.rows[0].row,naver); cases++;
  const projected=await db.query("select row from report_rows where ingestion_id=$1 order by row_index",[first.snapshot_ingestion_id]);
  assert.deepEqual(projected.rows.map((r:any)=>r.row.cost),[1234,200,300]); cases++;
  const report=(await db.query("select * from reports")).rows[0];
  assert.equal(report.current_ingestion_id,id(10)); assert.equal(report.published_ingestion_id,id(10));
  assert.deepEqual(report.meta.media_sync,meta.media_sync); cases++;
  assert.equal((await db.query("select count(*)::integer n from report_media_connections")).rows[0].n,1); cases++;
  // Attribution correction creates a new immutable projection; the previous shared copy survives.
  await db.query("update meta_ads_daily_partitions set rows=$1,content_hash='corrected' where date='2020-09-02'",
    [[{provider:"meta_ads",date:"2020-09-02",cost:350,conversions:3}]]);
  const corrected=(await resolve()).rows[0].result;
  assert.notEqual(corrected.snapshot_ingestion_id,first.snapshot_ingestion_id); cases++;
  assert.equal((await db.query("select (row->>'cost')::integer cost from report_rows where ingestion_id=$1 and row_index=2",[first.snapshot_ingestion_id])).rows[0].cost,300); cases++;
  // Simulate tomorrow's unchanged Naver scheduler publishing its own new source pointer.
  await db.query("insert into report_ingestions select $1,workspace_id,report_id,kind,status,row_count,created_by from report_ingestions where id=$2",[id(11),id(10)]);
  await db.query("insert into report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,source,ingestion_id) select workspace_id,report_id,advertiser_id,row_index,row,date,channel,source,$1 from report_rows where ingestion_id=$2",[id(11),id(10)]);
  await db.query("insert into daily_report_v2_snapshot_runs select report_id,workspace_id,advertiser_id,$1,status,start_date,'2020-09-03',expected_rows from daily_report_v2_snapshot_runs",[id(11)]);
  await db.query("update reports set current_ingestion_id=$1",[id(11)]);
  await assert.rejects(resolve(),/DAILY_META_SOURCE_CHANGED/); cases++;
  await assert.rejects(resolve(id(11)),/DAILY_META_COVERAGE_INCOMPLETE/); cases++;
  await addPartition("2020-09-03",400);
  const tomorrow=(await resolve(id(11))).rows[0].result;
  assert.deepEqual([tomorrow.source_rows,tomorrow.meta_rows,tomorrow.through_date],[1,3,"2020-09-03"]); cases++;
  assert.equal((await db.query("select published_ingestion_id from reports")).rows[0].published_ingestion_id,id(10)); cases++;
  assert.equal((await db.query("select count(*)::integer n from report_media_connections")).rows[0].n,1); cases++;
  await db.close();
  console.log(`PASS: ${cases} isolated PostgreSQL checks; scopes, permissions, idempotency, exact source preservation, corrections, next-day refresh, missing dates, published isolation. No live APIs.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

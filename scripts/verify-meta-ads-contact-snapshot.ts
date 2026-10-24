import { normalizeCsvRows, summarize, groupBySource } from "../src/lib/report/aggregate";
import { isNaverMetaReportMeta, isNaverMetaSelection, toggleReportConnectionSelection } from "../src/lib/media-sync/naver-meta-report";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMetaAdsContactRows } from "../src/lib/media-sync/meta-ads-contact-rows";
import { readMetaAdsContactPolicy, type MetaAdsContactPolicy } from "../src/lib/media-sync/meta-ads-contact-policy";
import { parseMetaAdsInsightsPreview } from "../src/lib/media-sync/meta-ads-insights-preview";
import { handleMetaAdsContactSync, type MetaAdsContactTarget } from "../src/lib/media-sync/meta-ads-contact-sync";
import { encryptMetaAdsCredentials } from "../src/lib/media-sync/meta-ads-credentials";
import type { MediaConnectionReportAccessContext } from "../src/lib/media-sync/media-connection-access";
import { getMediaProviderSyncCapability } from "../src/lib/media-sync/media-provider-sync-capabilities";
import { buildMediaSyncProviderDashboard } from "../src/lib/media-sync/media-sync-provider-dashboard";
import type { SafeMediaConnection } from "../src/lib/media-sync/types";

// Isolated PostgreSQL 17/WASM only. No production credentials, DB or network.
process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 39).toString("base64");
let liveNetwork = 0;
globalThis.fetch = async () => { liveNetwork++; throw new Error("LIVE_NETWORK_FORBIDDEN"); };
let cases = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accountId = "123456", token = "SYNTHETIC_CONTACT_SECRET", timestamp = "2020-10-01T00:00:00+00:00";
const range = { dateFrom: "2020-09-01", dateTo: "2020-09-30" };
const settings = { ...range, dataLevel: "creative", mode: "snapshot_replace" };
const policy: MetaAdsContactPolicy = { contract: "meta_contact_snapshot_v1", enabled: true, external_account_id: accountId,
  currency: "KRW", time_zone: "Asia/Seoul", conversion_field: "conversions", conversion_action_type: "contact_website",
  missing_conversion: "zero_after_complete_reconciliation", revenue: "not_provided", attribution: "platform_default", report_type: "db" };
const raw = [1, 2, 3, 4].map((n, i) => ({ account_id: accountId, campaign_id: String(10 + Math.min(n, 3)),
  campaign_name: `Campaign ${Math.min(n, 3)}`, adset_id: String(20+n), adset_name: `Group ${n}`, ad_id: String(30+n), ad_name: `Ad ${n}`,
  date_start: `2020-09-0${n}`, date_stop: `2020-09-0${n}`, impressions: "100", clicks: "10", spend: "0.1",
  actions: [{ action_type: "contact_website", value: "999" }],
  conversions: i === 3 ? undefined : [{ action_type: "contact_website", value: String([4, 1, 3][i]) }, { action_type: "contact_total", value: "999" }],
}));
const aggregateRaw = { account_id: accountId, date_start: range.dateFrom, date_stop: range.dateTo,
  impressions: "400", clicks: "40", spend: "0.4", conversions: [{ action_type: "contact_website", value: "8" }, { action_type: "contact_total", value: "8" }] };
const aggregate = parseMetaAdsInsightsPreview({ data: [aggregateRaw] }, accountId, range);
const access: MediaConnectionReportAccessContext = { userId: uuid(1), reportId: uuid(2), workspaceId: uuid(3), advertiserId: uuid(4), accessScope: "workspace",
  canRunSync: true, canManageConnections: true, canViewConnections: true, role: "admin", isTrueMaster: false,
  email: "fixture@example.invalid", advertiserCreatedBy: uuid(1) };
const credentialContext = { connectionId: uuid(5), workspaceId: access.workspaceId, advertiserId: access.advertiserId,
  provider: "meta_ads" as const, externalAccountId: accountId };
const target: MetaAdsContactTarget = {
  report: { id: access.reportId, workspace_id: access.workspaceId, advertiser_id: access.advertiserId,
    updated_at: timestamp, current_ingestion_id: null, status: "draft", report_type_key: "db",
    meta: { data_source: { kind: "api", provider: "meta_ads", data_level: "creative", mode: "snapshot_replace" },
      media_sync: { date_from: range.dateFrom, date_to: range.dateTo, data_level: "creative", mode: "snapshot_replace" } } },
  connection: { id: uuid(5), workspace_id: access.workspaceId, advertiser_id: access.advertiserId, provider: "meta_ads",
    external_account_id: accountId, credential_version: 1, status: "active", connected_at: timestamp,
    last_verified_at: timestamp, updated_at: timestamp, credential_ciphertext: encryptMetaAdsCredentials({ version: 1, access_token: token }, credentialContext),
    meta: { meta_ads_reporting: policy } },
  mapping: [{ connection_id: uuid(5), workspace_id: access.workspaceId, advertiser_id: access.advertiserId }],
};
const request = () => new Request("https://fixture.invalid/api/sync", { method: "POST" });
const fakeFetch: typeof fetch = async input => {
  const url = new URL(String(input));
  assert.equal(url.origin, "https://graph.facebook.com");
  if (!url.pathname.endsWith("/insights")) return Response.json({ id: `act_${accountId}`, account_id: accountId, currency: "KRW", timezone_name: "Asia/Seoul" });
  return Response.json({ data: url.searchParams.get("level") === "account" ? [aggregateRaw] : raw });
};

async function main() {
  assert.deepEqual(readMetaAdsContactPolicy(policy, accountId), policy); cases++;
  for (const change of [{ enabled: false }, { conversion_field: "actions" }, { conversion_action_type: "contact_total" },
    { revenue: "zero" }, { attribution: "7d_click" }, { missing_conversion: "always_zero" }, { currency: "" }, { time_zone: "invalid" },
    { report_type: "commerce" }, { external_account_id: "999" }, { extra: true }]) {
    assert.equal(readMetaAdsContactPolicy({ ...policy, ...change }, accountId), null); cases++;
  }
  const normalized = normalizeMetaAdsContactRows(raw, aggregate, range, policy, 1);
  assert.deepEqual(normalized.rows.map(r => r.conversions), [4,1,3,0]);
  assert.ok(normalized.rows.every(r => r.revenue === null));
  assert.equal(normalized.check.ad_daily_sum.rows_without_contact_value, 1);
  assert.ok(!JSON.stringify(normalized.rows).includes("999")); cases++;
  for (const bad of [{ ...aggregate, spend: "0.5" }, { ...aggregate, conversions: [] }, { ...aggregate, impressions: "399" }]) {
    assert.throws(() => normalizeMetaAdsContactRows(raw, bad, range, policy, 1)); cases++;
  }
  assert.throws(() => normalizeMetaAdsContactRows([...raw,raw[3]], aggregate, range, policy, 1)); cases++;
  assert.throws(() => normalizeMetaAdsContactRows(raw.map(r => ({ ...r, ad_name: "\n" })), aggregate, range, policy, 1)); cases++;
  assert.equal(getMediaProviderSyncCapability("meta_ads").syncRuntimeEnabled, false); cases++;
  const safeConnection = { ...target.connection, has_credentials:true,external_account_name:"Fixture",last_sync_at:null,last_error:null,
    created_by:uuid(1),created_at:timestamp,meta:{meta_ads_reporting:policy} } as unknown as SafeMediaConnection;
  assert.equal(buildMediaSyncProviderDashboard({connections:[safeConnection],jobs:[]})[2].runtime_enabled,true); cases++;
  assert.equal(buildMediaSyncProviderDashboard({connections:[{...safeConnection,meta:{}}],jobs:[]})[2].runtime_enabled,false); cases++;
  assert.equal(buildMediaSyncProviderDashboard({connections:[safeConnection,{...safeConnection,id:uuid(98),provider:"naver_searchad"}],jobs:[]})[2].runtime_enabled,true); cases++;

  let payload: Record<string, unknown> | undefined, writes = 0, loads = 0;
  const deps = { load: async () => { loads++; return structuredClone(target); }, reauthorize: async () => access,
    fetchImpl: fakeFetch, save: async (p: Record<string, unknown>) => { writes++; payload = structuredClone(p);
      return { snapshot_ingestion_id: uuid(6), job: { id: uuid(7), provider: "meta_ads", report_id: access.reportId,
        workspace_id: access.workspaceId, advertiser_id: access.advertiserId, connection_id: uuid(5), external_account_id: accountId,
        status: "done", inserted_rows: 4, failed_rows: 0, snapshot_ingestion_id: uuid(6) } }; } };
  const response = await handleMetaAdsContactSync(request(), access, settings, deps);
  assert.equal(response.status, 200); assert.equal(writes, 1); assert.equal(loads, 2); assert.ok(payload);
  const responseText = await response.text(); assert.ok(!responseText.includes(token)); assert.ok(!responseText.includes("credential")); cases++;
  const validPayload = structuredClone(payload!);
  const deny = async (changes: Partial<typeof deps>, expected = 409, req = request(), a = access, s = settings) => {
    writes = 0;
    const result = await handleMetaAdsContactSync(req, a, s, { ...deps, ...changes });
    assert.equal(result.status, expected, await result.text()); assert.equal(writes, 0); cases++;
  };
  await deny({}, 403, new Request("https://fixture.invalid/api/sync", { method: "POST", headers: { origin: "https://evil.invalid" } }));
  await deny({}, 403, request(), { ...access, canRunSync: false });
  await deny({ reauthorize: async () => ({ ...access, canRunSync: false }) }, 403);
  await deny({}, 409, request(), access, { ...settings, dataLevel: "keyword" });
  await deny({}, 409, request(), access, { ...settings, dateTo: "2099-09-30" });
  await deny({ load: async () => { const t=structuredClone(target); t.report.meta.media_sync={
    date_from:"2099-09-01",date_to:"2099-09-30",data_level:"creative",mode:"snapshot_replace" }; return t; } },
    400, request(), access, { ...settings, dateFrom:"2099-09-01",dateTo:"2099-09-30" });
  for (const mutate of [
    (t: MetaAdsContactTarget) => { t.connection.meta = {}; },
    (t: MetaAdsContactTarget) => { t.report.report_type_key = "commerce"; },
    (t: MetaAdsContactTarget) => { t.report.meta.data_source = { kind: "api", provider: "naver_searchad" }; },
    (t: MetaAdsContactTarget) => { t.mapping = []; },
    (t: MetaAdsContactTarget) => { t.connection.advertiser_id = uuid(99); },
  ]) await deny({ load: async () => { const t=structuredClone(target); mutate(t); return t; } });
  let call=0;
  await deny({ load: async () => { const t=structuredClone(target); if (++call>1) t.report.updated_at="2020-10-02T00:00:00Z"; return t; } });
  await deny({ fetchImpl: async input => String(input).includes("level=ad")
    ? Response.json({ data: raw.slice(0,2) }) : fakeFetch(input) });
  await deny({ fetchImpl: async () => { throw new Error(token); } }, 502);

  const modulePath = process.env.META_TEST_PGLITE_MODULE;
  assert.ok(modulePath, "Set META_TEST_PGLITE_MODULE to an isolated PGlite module; never a production DB URL.");
  const { PGlite } = await import(modulePath);
  const db = new PGlite();
  await db.exec(`
    create role service_role bypassrls; create role anon; create role authenticated;
    create table media_connections(id uuid primary key,workspace_id uuid,advertiser_id uuid,tenant_id uuid,provider text,
      external_account_id text,status text,credential_version integer,credential_ciphertext text,last_verified_at timestamptz,
      updated_at timestamptz,last_sync_at timestamptz,meta jsonb);
    create table report_types(id uuid primary key,key text);
    create table reports(id uuid primary key,workspace_id uuid,advertiser_id uuid,tenant_id uuid,report_type_id uuid,
      status text,updated_at timestamptz,current_ingestion_id uuid,published_ingestion_id uuid,last_ingested_at timestamptz,
      last_ingestion_run_id text,meta jsonb);
    create table report_media_connections(report_id uuid,connection_id uuid,workspace_id uuid,advertiser_id uuid,tenant_id uuid,primary key(report_id,connection_id));
    create unique index single_mapping on report_media_connections(report_id);
    create table report_ingestions(id uuid primary key,workspace_id uuid not null,report_id uuid not null,kind text,status text,row_count integer,created_by uuid);
    create table report_rows(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,report_id uuid not null,advertiser_id uuid,
      row_index integer,row jsonb,date date,channel text,device text,source text,ingestion_id uuid);
    create unique index row_identity on report_rows(report_id,ingestion_id,row_index);
    create table media_sync_jobs(id uuid primary key,workspace_id uuid,advertiser_id uuid,report_id uuid,connection_id uuid,provider text,
      external_account_id text,date_from date,date_to date,data_level text,mode text,status text,progress integer,
      raw_rows integer,normalized_rows integer,inserted_rows integer,failed_rows integer,previous_ingestion_id uuid,snapshot_ingestion_id uuid,
      attempt_count integer,created_by uuid,started_at timestamptz,finished_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create unique index active_job_connection on media_sync_jobs(connection_id) where status in ('pending','processing');
    create unique index active_job_report on media_sync_jobs(report_id) where status in ('pending','processing');
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(readFileSync("scripts/sql/create-meta-ads-contact-snapshot.sql","utf8")); cases++;
  await db.exec(`
    alter table reports add constraint report_scope_unique unique(tenant_id,workspace_id,advertiser_id,id);
    alter table media_connections add constraint connection_scope_unique unique(tenant_id,workspace_id,advertiser_id,id);
    alter table reports add column title text, add column period_start date, add column period_end date,
      add column created_by uuid, add column created_at timestamptz default now();
    alter table reports alter column id set default gen_random_uuid();
    alter table reports alter column updated_at set default now();
    create table workspaces(id uuid primary key,tenant_id uuid);
    create table advertisers(id uuid primary key,workspace_id uuid,tenant_id uuid);
    create table media_sync_fact_partitions(workspace_id uuid,advertiser_id uuid,provider text,external_account_id text,date date,
      source_connection_id uuid,source_job_id uuid,row_count bigint,updated_at timestamptz default now(),
      primary key(workspace_id,advertiser_id,provider,external_account_id,date));
    create table media_sync_fact_rows(workspace_id uuid,advertiser_id uuid,provider text,external_account_id text,date date,
      source_connection_id uuid,source_job_id uuid,row_key text,row jsonb,channel text,device text,source text,
      primary key(workspace_id,advertiser_id,provider,external_account_id,row_key));
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(readFileSync("scripts/sql/create-api-report-with-media-connections-v2.sql","utf8"));
  await db.exec(readFileSync("scripts/sql/create-naver-meta-report.sql","utf8")); cases++;

  await db.query("insert into report_types values($1,'db'),($2,'commerce')",[uuid(8),uuid(9)]);
  await db.query("insert into media_connections values($1,$2,$3,$4,'meta_ads',$5,'active',1,'synthetic_cipher',$6,$6,null,$7)",
    [uuid(5),access.workspaceId,access.advertiserId,uuid(10),accountId,timestamp,JSON.stringify(target.connection.meta)]);
  await db.query("insert into reports values($1,$2,$3,$4,$5,'draft',$6,null,$7,null,null,$8)",
    [access.reportId,access.workspaceId,access.advertiserId,uuid(10),uuid(8),timestamp,uuid(11),JSON.stringify(target.report.meta)]);
  await db.query("insert into reports values($1,$2,$3,$4,$5,'ready',$6,$7,$7,null,null,$8)",
    [uuid(99),access.workspaceId,access.advertiserId,uuid(10),uuid(8),timestamp,uuid(12),JSON.stringify({data_source:{kind:"api",provider:"naver_searchad"}})]);
  await db.query("insert into report_media_connections values($1,$2,$3,$4,$5)",[access.reportId,uuid(5),access.workspaceId,access.advertiserId,uuid(10)]);
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select save_meta_ads_contact_snapshot_v1($1::jsonb)",[JSON.stringify(validPayload)]), /permission denied/); cases++;
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const save = (p: Record<string,unknown>) => db.query("select save_meta_ads_contact_snapshot_v1($1::jsonb) result",[JSON.stringify(p)]);
  const sqlDeny = async (mutate: (p: Record<string,unknown>)=>void, error: RegExp) => {
    const p=structuredClone(validPayload); mutate(p); await assert.rejects(save(p),error);
    const counts=await db.query("select (select count(*) from report_rows)::integer rows,(select count(*) from report_ingestions)::integer ingestions,(select count(*) from media_sync_jobs)::integer jobs");
    assert.deepEqual(counts.rows[0],{rows:0,ingestions:0,jobs:0}); cases++;
  };
  await sqlDeny(p=>{p.report_id=uuid(99);},/META_CONTACT_REPORT_REQUIRED/);
  await sqlDeny(p=>{p.expected_report_updated_at="2020-10-02T00:00:00Z";},/META_CONTACT_CHANGED/);
  await sqlDeny(p=>{p.expected_current_ingestion_id=uuid(88);},/META_CONTACT_CHANGED/);
  await sqlDeny(p=>{p.expected_connection_updated_at="2020-10-02T00:00:00Z";},/META_CONTACT_CHANGED/);
  await sqlDeny(p=>{p.workspace_id=uuid(88);},/META_CONTACT_CHANGED/);
  await sqlDeny(p=>{p.account_totals={...normalized.check.account,website_contacts:"9"};},/META_CONTACT_RECONCILIATION_FAILED/);
  await sqlDeny(p=>{p.rows=[];},/META_CONTACT_INVALID_INPUT/);
  await sqlDeny(p=>{p.rows=[...normalized.rows,normalized.rows[3]];},/META_CONTACT_DUPLICATE_ROW/);
  for (const change of [{revenue:0},{provider:"naver_searchad"},{date:"2020-08-31"},{impressions:0.5},{cost:-1},
    {conversions:null},{external_account_id:"999"},{access_token:token}]) {
    await sqlDeny(p=>{p.rows=[{...normalized.rows[0],...change},...normalized.rows.slice(1)];},/META_CONTACT_INVALID_ROW/);
  }
  await sqlDeny(p=>{p.policy={...policy,conversion_field:"actions"};},/META_CONTACT_POLICY_REQUIRED/);
  // Force a late insertion error to prove prior inserts and pointer changes roll back atomically.
  await db.exec("reset role; alter table media_sync_jobs add constraint force_failure check (inserted_rows < 1); set role service_role");
  await sqlDeny(()=>{},/force_failure/);
  await db.exec("reset role; alter table media_sync_jobs drop constraint force_failure; set role service_role");
  const results=await Promise.allSettled([save(validPayload),save(validPayload)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1); cases++;
  const state=await db.query("select (select count(*) from report_rows)::integer rows,(select count(*) from report_ingestions)::integer ingestions,(select count(*) from media_sync_jobs)::integer jobs,(select sum((row->>'conversions')::numeric) from report_rows)::text contacts,(select sum((row->>'cost')::numeric) from report_rows)::text cost");
  assert.deepEqual(state.rows[0],{rows:4,ingestions:1,jobs:1,contacts:"8",cost:"0.4"}); cases++;
  const pointers=await db.query("select current_ingestion_id,published_ingestion_id from reports where id=$1",[access.reportId]);
  assert.ok(pointers.rows[0].current_ingestion_id); assert.equal(pointers.rows[0].published_ingestion_id,uuid(11)); cases++;
  const naver=await db.query("select current_ingestion_id,published_ingestion_id from reports where id=$1",[uuid(99)]);
  assert.deepEqual(naver.rows[0],{current_ingestion_id:uuid(12),published_ingestion_id:uuid(12)}); cases++;
  const bulkRaw = Array.from({length:2500},(_,i)=>({...raw[0],ad_id:String(1000+i),impressions:"1",clicks:"0",spend:"1",
    conversions:i===0?[{action_type:"contact_website",value:"8"}]:undefined}));
  const bulkAggregate={...aggregate,impressions:"2500",clicks:"0",spend:"2500"};
  const bulk=normalizeMetaAdsContactRows(bulkRaw,bulkAggregate,range,policy,5);
  const current=await db.query("select r.updated_at::text report_updated,c.updated_at::text connection_updated from reports r,media_connections c where r.id=$1 and c.id=$2",[access.reportId,uuid(5)]);
  const bulkPayload={...validPayload,expected_report_updated_at:current.rows[0].report_updated,
    expected_connection_updated_at:current.rows[0].connection_updated,expected_current_ingestion_id:pointers.rows[0].current_ingestion_id,
    account_totals:bulk.check.account,page_count:5,rows:bulk.rows};
  const started=Date.now(); await save(bulkPayload); const bulkMs=Date.now()-started;
  const bulkState=await db.query("select count(*)::integer rows,sum((rr.row->>'conversions')::numeric)::text contacts from report_rows rr join reports r on r.id=rr.report_id and r.current_ingestion_id=rr.ingestion_id where r.id=$1",[access.reportId]);
  assert.deepEqual(bulkState.rows[0],{rows:2500,contacts:"8"}); cases++;
  await runCombinedChecks(db, validPayload, safeConnection, deps);
  assert.equal(liveNetwork,0); await db.close();
  console.log(`META_CONTACT_SNAPSHOT: ${cases} cases PASS; MAX_2500_ROWS_MS=${bulkMs}; REAL_POSTGRES_ENGINE=17_WASM; LIVE_API=0; PRODUCTION_WRITES=0`);
}


type TestDb = {exec: (sql:string)=>Promise<unknown>; query: (sql:string,args?:unknown[])=>Promise<{rows:Record<string,any>[]}>};
async function runCombinedChecks(db: TestDb, payload: Record<string,unknown>, safeMeta: SafeMediaConnection,
  deps: Parameters<typeof handleMetaAdsContactSync>[3]) {
  const naver = {id:uuid(40),workspace_id:access.workspaceId,advertiser_id:access.advertiserId,
    provider:"naver_searchad",external_account_id:"naver-1",status:"active",updated_at:timestamp};
  const mixedMeta = {url_contract_version:2, data_source:{kind:"api",providers:["meta_ads","naver_searchad"],
    aggregation_contract:"naver_meta_contact_v1",data_level:"mixed",mode:"snapshot_replace"},
    media_sync:{date_from:range.dateFrom,date_to:range.dateTo,data_level:"mixed",mode:"snapshot_replace"}};
  const mixedTarget: MetaAdsContactTarget = {...structuredClone(target),companions:[naver],
    report:{...target.report,meta:mixedMeta},mapping:[...target.mapping,
      {connection_id:naver.id,workspace_id:access.workspaceId,advertiser_id:access.advertiserId}]};
  const selected = toggleReportConnectionSelection([naver.id],safeMeta.id);
  assert.deepEqual(selected,[naver.id,safeMeta.id]);
  assert.deepEqual(toggleReportConnectionSelection(selected,naver.id),[safeMeta.id]);
  assert.deepEqual(toggleReportConnectionSelection([safeMeta.id],naver.id),[safeMeta.id,naver.id]); cases++;
  assert.ok(isNaverMetaReportMeta(mixedMeta));
  assert.ok(isNaverMetaSelection([safeMeta,{...safeMeta,...naver}]));
  assert.ok(!isNaverMetaSelection([safeMeta,{...safeMeta,id:uuid(41),provider:"google_ads"}])); cases++;
  let preflights=0,combinedSaves=0;
  const combinedDeps = {...deps,load:async()=>structuredClone(mixedTarget),preflight:async()=>{preflights++;},
    save:async(p:Record<string,unknown>)=>{combinedSaves++;return deps.save(p);}};
  const combinedResponse=await handleMetaAdsContactSync(request(),access,{...settings,dataLevel:"mixed"},combinedDeps);
  assert.equal(combinedResponse.status,200,await combinedResponse.text()); assert.equal(preflights,1); assert.equal(combinedSaves,1); cases++;
  for (const mutate of [
    (t:MetaAdsContactTarget)=>{t.companions![0].advertiser_id=uuid(98);},
    (t:MetaAdsContactTarget)=>{t.companions![0].provider="google_ads";},
    (t:MetaAdsContactTarget)=>{t.mapping.pop();},
    (t:MetaAdsContactTarget)=>{t.report.meta.media_sync={...mixedMeta.media_sync,auto_sync:{enabled:true}};},
  ]) {
    const bad=structuredClone(mixedTarget);mutate(bad);combinedSaves=0;
    assert.equal((await handleMetaAdsContactSync(request(),access,{...settings,dataLevel:"mixed"},
      {...combinedDeps,load:async()=>bad})).status,409);assert.equal(combinedSaves,0);cases++;
  }
  combinedSaves=0;
  const failedCoverage=await handleMetaAdsContactSync(request(),access,{...settings,dataLevel:"mixed"},
    {...combinedDeps,preflight:async()=>{throw new Error("fixture missing coverage");}});
  assert.notEqual(failedCoverage.status,200);assert.equal(combinedSaves,0);cases++;

  await db.exec("reset role");
  await db.query("insert into workspaces values($1,$2)",[access.workspaceId,uuid(10)]);
  await db.query("insert into advertisers values($1,$2,$3)",[access.advertiserId,access.workspaceId,uuid(10)]);
  await db.query("insert into media_connections values($1,$2,$3,$4,'naver_searchad','naver-1','active',1,'synthetic_naver_cipher',$5,$5,null,'{}')",
    [naver.id,access.workspaceId,access.advertiserId,uuid(10),timestamp]);
  await db.exec("set role service_role");
  const createArgs = [access.workspaceId,access.advertiserId,[safeMeta.id,naver.id],uuid(8),"Combined fixture",null,null,access.userId,
    JSON.stringify({data_source:{kind:"api",data_level:"mixed"}})];
  const create = (args=createArgs)=>db.query("select create_naver_meta_report_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) result",args);
  for (const change of [(a:unknown[])=>{a[3]=uuid(9);},(a:unknown[])=>{a[2]=[safeMeta.id,safeMeta.id];},
    (a:unknown[])=>{a[1]=uuid(98);},(a:unknown[])=>{a[8]=JSON.stringify({media_sync:{auto_sync:{enabled:true}}});}]) {
    const args=structuredClone(createArgs);change(args);await assert.rejects(create(args));cases++;
  }
  for(const role of ["anon","authenticated"]) {
    await db.exec(`reset role;set role ${role}`);
    await assert.rejects(create(),/permission denied/);cases++;
  }
  await db.exec("reset role;set role service_role");
  const created=(await create()).rows[0].result, reportId=created.id;
  assert.deepEqual(created.providers,["meta_ads","naver_searchad"]);
  assert.deepEqual(new Set(created.connection_ids),new Set([naver.id,safeMeta.id]));
  assert.equal(created.meta.data_source.data_level,"mixed");cases++;
  const mappings=(await db.query("select (select count(*) from manual_report_media_connections where report_id=$1)::integer manual,(select count(*) from report_media_connections where report_id=$1)::integer legacy",[reportId])).rows[0];
  assert.deepEqual(mappings,{manual:2,legacy:0});cases++;
  await db.query("update reports set meta=$2,updated_at=$3,published_ingestion_id=$4 where id=$1",[reportId,JSON.stringify(mixedMeta),timestamp,uuid(49)]);
  const freshMeta=(await db.query("select updated_at::text from media_connections where id=$1",[safeMeta.id])).rows[0];
  const mixedPayload={...payload,report_id:reportId,expected_report_updated_at:timestamp,expected_current_ingestion_id:null,
    expected_connection_updated_at:freshMeta.updated_at};
  const saveMixed=(p=mixedPayload)=>db.query("select save_meta_ads_contact_snapshot_v1($1) result",[JSON.stringify(p)]);
  const denyMixed=async(error:RegExp)=>{await assert.rejects(saveMixed(),error);
    assert.equal((await db.query("select count(*)::integer n from report_rows where report_id=$1",[reportId])).rows[0].n,0);cases++;};
  await denyMixed(/NAVER_META_COVERAGE_INCOMPLETE/);
  // Thirty authoritative dates, including twenty-nine valid zero-row dates.
  await db.query(`insert into media_sync_fact_partitions(workspace_id,advertiser_id,provider,external_account_id,date,source_connection_id,source_job_id,row_count)
    select $1,$2,'naver_searchad','naver-1',d::date,$3,$4,case when d::date='2020-09-01' then 1 else 0 end
    from generate_series('2020-09-01'::date,'2020-09-30'::date,interval '1 day') d`,[access.workspaceId,access.advertiserId,naver.id,uuid(42)]);
  await denyMixed(/NAVER_META_FACTS_CHANGED/);
  const fact={date:"2020-09-01",provider:"naver_searchad",external_account_id:"naver-1",impressions:600,clicks:60,cost:99.6,
    conversions:12,revenue:0,campaign:"Naver campaign",group:"Naver group",keyword:"Naver keyword",row_level:"keyword"};
  await db.query("insert into media_sync_fact_rows values($1,$2,'naver_searchad','naver-1','2020-09-01',$3,$4,'row1',$5,'검색광고','','네이버 검색광고')",
    [access.workspaceId,access.advertiserId,naver.id,uuid(42),JSON.stringify(fact)]);
  const before=JSON.stringify((await db.query("select * from media_sync_fact_rows")).rows);
  // Late failure after both provider rows and the Naver done job were inserted must roll everything back.
  await db.exec("reset role;alter table media_sync_jobs add constraint combined_late_failure check(provider<>'meta_ads' or report_id<>'"+reportId+"');set role service_role");
  await denyMixed(/combined_late_failure/);
  assert.equal((await db.query("select count(*)::integer n from media_sync_jobs where report_id=$1",[reportId])).rows[0].n,0);cases++;
  await db.exec("reset role;alter table media_sync_jobs drop constraint combined_late_failure;set role service_role");
  const saved=(await saveMixed()).rows[0].result;
  assert.equal(saved.row_count,5); assert.equal(saved.job.inserted_rows,4);cases++;
  const totals=(await db.query(`select count(*)::integer rows,sum((rr.row->>'impressions')::numeric)::text impressions,
    sum((rr.row->>'clicks')::numeric)::text clicks,sum((rr.row->>'cost')::numeric)::text cost,sum((rr.row->>'conversions')::numeric)::text conversions
    from report_rows rr join reports r on r.id=rr.report_id and r.current_ingestion_id=rr.ingestion_id where r.id=$1`,[reportId])).rows[0];
  assert.deepEqual(totals,{rows:5,impressions:"1000",clicks:"100",cost:"100.0",conversions:"20"});cases++;
  const displayed = normalizeCsvRows((await db.query("select rr.row from report_rows rr join reports r on r.id=rr.report_id and r.current_ingestion_id=rr.ingestion_id where r.id=$1",[reportId])).rows.map(r=>r.row));
  const summary=summarize(displayed);
  assert.equal(summary.impressions,1000);assert.equal(summary.clicks,100);assert.equal(summary.conversions,20);
  assert.ok(Math.abs(summary.cost-100)<0.000001);assert.ok(Math.abs(summary.cpa-5)<0.000001);
  const sources=groupBySource(displayed);assert.equal(sources.length,2);
  assert.deepEqual(sources.map(r=>r.conversions).sort((a,b)=>a-b),[8,12]);cases++;
  assert.equal(JSON.stringify((await db.query("select * from media_sync_fact_rows")).rows),before);cases++;
  assert.equal((await db.query("select published_ingestion_id from reports where id=$1",[reportId])).rows[0].published_ingestion_id,uuid(49));cases++;
  assert.deepEqual((await db.query("select current_ingestion_id,published_ingestion_id from reports where id=$1",[uuid(99)])).rows[0],
    {current_ingestion_id:uuid(12),published_ingestion_id:uuid(12)});cases++;
  assert.equal((await db.query("select last_sync_at from media_connections where id=$1",[naver.id])).rows[0].last_sync_at,null);cases++;
  await assert.rejects(saveMixed(),/META_CONTACT_CHANGED/);cases++;
  // Refresh replaces the entire combined snapshot without duplicate accumulation; the previous snapshot stays intact.
  const current=(await db.query("select r.updated_at::text report_updated,c.updated_at::text connection_updated,r.current_ingestion_id from reports r,media_connections c where r.id=$1 and c.id=$2",[reportId,safeMeta.id])).rows[0];
  await saveMixed({...mixedPayload,expected_report_updated_at:current.report_updated,expected_connection_updated_at:current.connection_updated,
    expected_current_ingestion_id:current.current_ingestion_id});
  assert.equal((await db.query("select count(*)::integer n from report_rows rr join reports r on r.id=rr.report_id and r.current_ingestion_id=rr.ingestion_id where r.id=$1",[reportId])).rows[0].n,5);
  assert.equal((await db.query("select count(*)::integer n from report_rows where report_id=$1",[reportId])).rows[0].n,10);cases++;
  // No worker ever sees a Naver mapping for this report, even after refresh.
  assert.equal((await db.query("select count(*)::integer n from report_media_connections where report_id=$1",[reportId])).rows[0].n,0);cases++;
  assert.equal((await db.query("select count(*)::integer n from media_sync_jobs where report_id=$1 and status in ('pending','processing')",[reportId])).rows[0].n,0);cases++;
}
main().catch(error=>{console.error(error);process.exitCode=1;});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMetaDailyWindow } from "../src/lib/media-sync/meta-ads-daily";
import { normalizeMetaAdsContactRows } from "../src/lib/media-sync/meta-ads-contact-rows";
import { readMetaAdsContactPolicy, type MetaAdsContactPolicy } from "../src/lib/media-sync/meta-ads-contact-policy";
import { parseMetaAdsInsightsPreview } from "../src/lib/media-sync/meta-ads-insights-preview";
import { getPreviousCompletedSeoulCalendarDate } from "../src/lib/media-sync/naver-searchads-daily-scheduler";

type DB = { exec(sql: string): Promise<unknown>; query<T extends Record<string, any> = Record<string, any>>(sql: string, args?: unknown[]): Promise<{ rows: T[] }> };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function runMetaInstantFormChecks(db: DB) {
  let cases = 0;
  const date = getPreviousCompletedSeoulCalendarDate(new Date()), range = { dateFrom: date, dateTo: date };
  const legacy: MetaAdsContactPolicy = { contract: "meta_contact_snapshot_v1", enabled: true, external_account_id: "555999",
    currency: "KRW", time_zone: "Asia/Seoul", conversion_field: "conversions", conversion_action_type: "contact_website",
    missing_conversion: "zero_after_complete_reconciliation", revenue: "not_provided", attribution: "platform_default", report_type: "db" };
  const policy: MetaAdsContactPolicy = { ...legacy, instant_form: { field: "actions", action_type: "onsite_conversion.lead_grouped" } };
  assert.deepEqual(readMetaAdsContactPolicy(policy, "555999"), policy); cases++;
  for (const instant_form of [null, {field:"conversions",action_type:"onsite_conversion.lead_grouped"},
    {field:"actions",action_type:"lead"}, {...policy.instant_form,unknown:true}]) {
    assert.equal(readMetaAdsContactPolicy({...policy,instant_form},"555999"), null); cases++;
  }
  const actions = ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_search_add_meta_leads"]
    .map(action_type => ({ action_type, value: "2" }));
  const rows = [{ account_id:"555999",campaign_id:"11",adset_id:"22",ad_id:"33",date_start:date,date_stop:date,
    impressions:"100",clicks:"10",spend:"200",actions },
    {account_id:"555999",campaign_id:"11",adset_id:"22",ad_id:"34",date_start:date,date_stop:date,
      impressions:"50",clicks:"5",spend:"100",conversions:[{action_type:"contact_website",value:"1"},{action_type:"contact_total",value:"1"}]}];
  const account = parseMetaAdsInsightsPreview({data:[{account_id:"555999",date_start:date,date_stop:date,
    impressions:"150",clicks:"15",spend:"300",actions,conversions:[{action_type:"contact_website",value:"1"}]}]},"555999",range);
  const combined = normalizeMetaDailyWindow(rows,account,range,policy,1);
  assert.deepEqual(combined.rows.map(r=>r.conversions),[2,1]); cases++;
  assert.deepEqual(combined.totals,{impressions:"150",clicks:"15",spend:"300",website_contacts:"1",instant_form_submissions:"2",total_conversions:"3"}); cases++;
  assert.equal(normalizeMetaDailyWindow(rows,account,range,legacy,1).totals.website_contacts,"1"); cases++;
  const onlyForms = {...account,conversions:[]};
  const formRows = rows.map(r=>({...r,conversions:undefined}));
  assert.equal(normalizeMetaAdsContactRows(formRows,onlyForms,range,policy,1).check.account.total_conversions,"2"); cases++;
  assert.throws(()=>normalizeMetaAdsContactRows(formRows,onlyForms,range,legacy,1)); cases++;
  for(const changes of [{actions:[]},{actions:[{action_type:"onsite_conversion.lead_grouped",value:"3"}]},
    {conversions:[]},{spend:"301"}]) {
    assert.throws(()=>normalizeMetaDailyWindow(rows,{...account,...changes},range,policy,1)); cases++;
  }
  assert.throws(()=>normalizeMetaDailyWindow([{...rows[0],actions:[...actions,actions[1]]},rows[1]],account,range,policy,1)); cases++;
  const absent=normalizeMetaDailyWindow(rows.map(r=>({...r,conversions:undefined,actions:undefined})),
    {...account,conversions:[],actions:[]},range,policy,1);
  assert.equal(absent.evidence,"omitted_on_complete_insights"); assert.equal(absent.totals.total_conversions,"0"); cases++;
  const empty=normalizeMetaDailyWindow([],parseMetaAdsInsightsPreview({data:[]},"555999",range),range,policy,1);
  assert.equal(empty.totals.total_conversions,"0"); cases++;
  const decimalRow={...rows[0],conversions:[{action_type:"contact_website",value:"0.1"}],actions:[{action_type:"onsite_conversion.lead_grouped",value:"0.2"}]};
  assert.equal(normalizeMetaDailyWindow([decimalRow],{...account,impressions:"100",clicks:"10",spend:"200",conversions:decimalRow.conversions,actions:decimalRow.actions},range,policy,1).rows[0].conversions,0.3); cases++;

  await db.exec("reset role");
  await db.exec(`create table daily_report_v2_snapshot_runs(report_id uuid,workspace_id uuid,advertiser_id uuid,snapshot_ingestion_id uuid,
    status text,start_date date,through_date date,expected_rows integer); grant all on daily_report_v2_snapshot_runs to service_role;`);
  await db.exec(readFileSync("scripts/sql/attach-daily-report-meta.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261027060000_meta_instant_form_conversions.sql","utf8")); cases++;
  await db.exec("set role service_role");
  const c=id(901),workspace=id(902),advertiser=id(903),tenant=id(904),report=id(905),lease=id(906);
  await db.query(`insert into media_connections(id,workspace_id,advertiser_id,tenant_id,provider,external_account_id,status,
    credential_version,credential_ciphertext,last_verified_at,updated_at,meta)
    values($1,$2,$3,$4,'meta_ads','555999','active',1,'synthetic',now(),now(),'{}')`,[c,workspace,advertiser,tenant]);
  const rpc=async(name:string,args:unknown[],casts:string[]) => (await db.query(`select ${name}(${casts.map((s,i)=>`$${i+1}::${s}`).join(',')}) result`,args)).rows[0].result;
  const ts=(await db.query("select updated_at::text value from media_connections where id=$1",[c])).rows[0].value;
  const activation={connection_id:c,workspace_id:workspace,advertiser_id:advertiser,user_id:id(1),external_account_id:"555999",
    expected_updated_at:ts,replacement_ciphertext:null,start_date:date,policy,
    proof:{date_from:date,date_to:date,complete:true,totals:combined.totals,evidence:combined.evidence,page_count:1,row_count:2}};
  const activate=(p:unknown)=>rpc("activate_meta_ads_daily_connection_v1",[p],["jsonb"]);
  for(const totals of [{...combined.totals,total_conversions:"5"},{...combined.totals,instant_form_submissions:"-1"}]) {
    await assert.rejects(activate({...activation,proof:{...activation.proof,totals}})); cases++;
  }
  assert.equal((await activate(activation)).enabled,true); cases++;
  assert.equal((await db.query("select count(*)::integer n from meta_ads_daily_eligible_v1() where connection_id=$1",[c])).rows[0].n,1); cases++;
  const claim=await rpc("claim_meta_ads_daily_run_v1",[c,date,lease],["uuid","date","uuid"]);
  const payload={connection_id:c,run_id:claim.run_id,lease,expected_connection_updated_at:claim.connection_updated_at,
    date_from:date,date_to:date,policy,...combined};
  const save=(p:unknown)=>rpc("replace_meta_ads_daily_window_v1",[p],["jsonb"]);
  for(const patch of [ {totals:{...combined.totals,instant_form_submissions:"3",total_conversions:"4"}},
    {rows:[{...combined.rows[0],conversions:4},combined.rows[1]]},
    {rows:[{...combined.rows[0],provider_meta:{...combined.rows[0].provider_meta as object,instant_form_submissions:3}},combined.rows[1]]},
    {evidence:"omitted_on_complete_insights"}]) {
    await assert.rejects(save({...payload,...patch})); cases++;
  }
  assert.equal((await save(payload)).row_count,2); await save(payload); cases++;
  const saved=(await db.query("select row_count,proof from meta_ads_daily_partitions where connection_id=$1",[c])).rows[0];
  assert.equal(saved.row_count,2); assert.equal(saved.proof.account_totals.instant_form_submissions,"2"); cases++;
  assert.equal((await rpc("finish_meta_ads_daily_run_v1",[claim.run_id,lease,null],["uuid","uuid","text"])).status,"done"); cases++;
  const meta={data_source:{kind:"api",provider:"meta_ads",data_level:"creative",mode:"snapshot_replace"},
    media_sync:{date_from:date,date_to:date,data_level:"creative",mode:"snapshot_replace"}};
  await db.query(`insert into reports(id,workspace_id,advertiser_id,tenant_id,report_type_id,status,updated_at,meta,created_by)
    values($1,$2,$3,$4,$5,'draft',now(),$6,$7)`,[report,workspace,advertiser,tenant,id(8),meta,id(1)]);
  await db.query("insert into report_media_connections values($1,$2,$3,$4,$5)",[report,c,workspace,advertiser,tenant]);
  const built=await rpc("materialize_meta_ads_daily_report_v1",[report,c,date],["uuid","uuid","date"]);
  assert.equal(built.status,"updated"); cases++;
  assert.equal((await rpc("materialize_meta_ads_daily_report_v1",[report,c,date],["uuid","uuid","date"])).status,"unchanged"); cases++;
  assert.equal((await db.query("select sum((row->>'conversions')::numeric)::text n from report_rows where ingestion_id=$1",[built.snapshot_ingestion_id])).rows[0].n,"3"); cases++;
  // Preserve legacy website-only reports after the migration.
  assert.equal((await rpc("materialize_meta_ads_daily_report_v1",[id(705),id(701),date],["uuid","uuid","date"])).status,"unchanged"); cases++;
  // The manual path accepts the same independently reconciled components.
  const state=(await db.query("select r.updated_at::text report_updated,r.current_ingestion_id,c.updated_at::text connection_updated,c.last_verified_at::text verified from reports r,media_connections c where r.id=$1 and c.id=$2",[report,c])).rows[0];
  const manual={contract:policy.contract,workspace_id:workspace,advertiser_id:advertiser,report_id:report,connection_id:c,user_id:id(1),
    external_account_id:"555999",expected_report_updated_at:state.report_updated,expected_current_ingestion_id:state.current_ingestion_id,
    expected_connection_updated_at:state.connection_updated,expected_last_verified_at:state.verified,date_from:date,date_to:date,
    policy,account_totals:combined.totals,page_count:1,rows:combined.rows};
  assert.equal((await rpc("save_meta_ads_contact_snapshot_v1",[manual],["jsonb"])).job.inserted_rows,2); cases++;
  // Existing Naver automatic report: additive immutable projection, source/published pointers untouched.
  const nr=id(910),nc=id(911),source=id(912);
  await db.query(`insert into media_connections(id,workspace_id,advertiser_id,tenant_id,provider,external_account_id,status,credential_ciphertext)
    values($1,$2,$3,$4,'naver_searchad','N1','active','synthetic')`,[nc,workspace,advertiser,tenant]);
  const nmeta={data_source:{kind:"api",provider:"naver_searchad"},public_identity:{period_type:"daily_sync",period_key:date},media_sync:{auto_sync:{contract:"daily_report_v2",start_date:date}}};
  await db.query(`insert into reports(id,workspace_id,advertiser_id,tenant_id,report_type_id,status,updated_at,meta,created_by,current_ingestion_id,published_ingestion_id)
    values($1,$2,$3,$4,$5,'ready',now(),$6,$7,$8,$8)`,[nr,workspace,advertiser,tenant,id(8),nmeta,id(1),source]);
  await db.query("insert into report_media_connections values($1,$2,$3,$4,$5)",[nr,nc,workspace,advertiser,tenant]);
  await db.query("insert into report_ingestions values($1,$2,$3,'api','success',1,$4)",[source,workspace,nr,id(1)]);
  const naver={provider:"naver_searchad",date,cost:700,conversions:7};
  await db.query("insert into report_rows(workspace_id,report_id,advertiser_id,row_index,row,date,channel,source,ingestion_id) values($1,$2,$3,0,$4,$5,'Naver','Naver',$6)",[workspace,nr,advertiser,naver,date,source]);
  await db.query("insert into daily_report_v2_snapshot_runs values($1,$2,$3,$4,'activated',$5,$5,1)",[nr,workspace,advertiser,source,date]);
  assert.equal((await rpc("attach_daily_report_meta_v1",[nr,[nc,c],id(1)],["uuid","uuid[]","uuid"])).status,"attached"); cases++;
  const projected=await rpc("resolve_daily_report_meta_snapshot_v1",[nr,source],["uuid","uuid"]);
  assert.equal(projected.meta_rows,2); cases++;
  assert.equal((await db.query("select sum((row->>'conversions')::numeric)::text n from report_rows where ingestion_id=$1",[projected.snapshot_ingestion_id])).rows[0].n,"10"); cases++;
  assert.deepEqual((await db.query("select current_ingestion_id,published_ingestion_id from reports where id=$1",[nr])).rows[0],{current_ingestion_id:source,published_ingestion_id:source}); cases++;
  assert.deepEqual((await db.query("select row from report_rows where ingestion_id=$1",[source])).rows[0].row,naver); cases++;
  assert.equal((await rpc("resolve_daily_report_meta_snapshot_v1",[nr,source],["uuid","uuid"])).snapshot_ingestion_id,projected.snapshot_ingestion_id); cases++;
  console.log(JSON.stringify({suite:"meta_instant_forms",cases,status:"PASS",live_api:0}));
}

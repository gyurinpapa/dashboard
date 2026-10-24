import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planMetaDailyWindows, normalizeMetaDailyWindow, shiftMetaDay } from "../src/lib/media-sync/meta-ads-daily";
import { getPreviousCompletedSeoulCalendarDate } from "../src/lib/media-sync/naver-searchads-daily-scheduler";
import { parseMetaAdsInsightsPreview } from "../src/lib/media-sync/meta-ads-insights-preview";
import type { MetaAdsContactPolicy } from "../src/lib/media-sync/meta-ads-contact-policy";
import { metaAdsDailyStatusText } from "../src/lib/media-sync/meta-ads-daily-policy";

type DB = { exec(sql: string): Promise<unknown>; query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, args?: unknown[]): Promise<{ rows: T[] }> };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Runs inside the existing isolated PostgreSQL fixture; never connects to production. */
export async function runMetaDailyChecks(db: DB) {
  let cases = 0;
  const target = getPreviousCompletedSeoulCalendarDate(new Date()), start = shiftMetaDay(target, -9);
  assert.equal(getPreviousCompletedSeoulCalendarDate(new Date("2026-10-23T20:00:00Z")), "2026-10-23"); cases++;
  assert.deepEqual(planMetaDailyWindows(start, target, []), [
    { dateFrom: start, dateTo: shiftMetaDay(start, 6) }, { dateFrom: shiftMetaDay(start, 7), dateTo: target }]); cases++;
  const allDays = Array.from({ length: 10 }, (_, i) => shiftMetaDay(start, i));
  assert.deepEqual(planMetaDailyWindows(start, target, allDays), [{ dateFrom: shiftMetaDay(target, -6), dateTo: target }]); cases++;
  assert.equal(planMetaDailyWindows(shiftMetaDay(target, -100), target, []).length, 12); cases++;
  const policy: MetaAdsContactPolicy = { contract: "meta_contact_snapshot_v1", enabled: true, external_account_id: "555777",
    currency: "KRW", time_zone: "Asia/Seoul", conversion_field: "conversions", conversion_action_type: "contact_website",
    missing_conversion: "zero_after_complete_reconciliation", revenue: "not_provided", attribution: "platform_default", report_type: "db" };
  const daily = { contract: "meta_daily_v1", enabled: true, start_date: start, time_zone: "Asia/Seoul", schedule: "0 20 * * *", lookback_days: 7 };
  assert.match(metaAdsDailyStatusText({ meta_ads_daily: daily })!, /새벽 5시.*첫 수집 대기/); cases++;
  const range = { dateFrom: start, dateTo: shiftMetaDay(start, 6) };
  const raw = [0, 3].map((n, i) => ({ account_id: policy.external_account_id, campaign_id: "11", adset_id: "22", ad_id: String(33 + i),
    date_start: shiftMetaDay(start, n), date_stop: shiftMetaDay(start, n), impressions: "100", clicks: "10", spend: "0.1",
    conversions: i ? undefined : [{ action_type: "contact_website", value: "8" }, { action_type: "contact_total", value: "8" }] }));
  const accountRaw = { account_id: policy.external_account_id, date_start: range.dateFrom, date_stop: range.dateTo,
    impressions: "200", clicks: "20", spend: "0.2", conversions: [{ action_type: "contact_website", value: "8" }] };
  const account = parseMetaAdsInsightsPreview({ data: [accountRaw] }, policy.external_account_id, range);
  const normal = normalizeMetaDailyWindow(raw, account, range, policy, 1);
  assert.equal(normal.totals.website_contacts, "8"); assert.equal(normal.rows[1].conversions, 0); cases++;
  const sparse = normalizeMetaDailyWindow(raw.map(r => ({ ...r, conversions: undefined })), { ...account, conversions: [] }, range, policy, 1);
  assert.equal(sparse.evidence, "omitted_on_complete_insights"); assert.equal(sparse.totals.website_contacts, "0"); cases++;
  assert.throws(() => normalizeMetaDailyWindow(raw, { ...account, conversions: [] }, range, policy, 1)); cases++;
  assert.throws(() => normalizeMetaDailyWindow(raw, { ...account, spend: "0.3" }, range, policy, 1)); cases++;
  assert.throws(() => normalizeMetaDailyWindow([...raw, raw[0]], account, range, policy, 1)); cases++;
  const emptyRange = { dateFrom: shiftMetaDay(start, 7), dateTo: target };
  const emptyAccount = parseMetaAdsInsightsPreview({ data: [] }, policy.external_account_id, emptyRange);
  const empty = normalizeMetaDailyWindow([], emptyAccount, emptyRange, policy, 1);
  assert.equal(empty.evidence, "no_data"); assert.equal(empty.rows.length, 0); cases++;
  assert.throws(() => normalizeMetaDailyWindow(raw, { ...emptyAccount, date_from: start, date_to: range.dateTo }, range, policy, 1)); cases++;

  await db.exec("reset role");
  await db.exec(readFileSync("scripts/sql/create-meta-ads-daily.sql", "utf8"));
  await db.exec(readFileSync("scripts/sql/materialize-meta-ads-daily.sql", "utf8")); cases++;
  const c = id(701), workspace = id(702), advertiser = id(703), tenant = id(704), report = id(705), lease = id(706);
  const policyMeta = { meta_ads_reporting: policy, meta_ads_daily: daily };
  await db.query(`insert into media_connections(id,workspace_id,advertiser_id,tenant_id,provider,external_account_id,status,
    credential_version,credential_ciphertext,last_verified_at,updated_at,meta)
    values($1,$2,$3,$4,'meta_ads',$5,'active',1,'synthetic',now(),now(),$6)`, [c, workspace, advertiser, tenant, policy.external_account_id, policyMeta]);
  const reportMeta = { data_source: { kind: "api", provider: "meta_ads", data_level: "creative", mode: "snapshot_replace" },
    media_sync: { date_from: start, date_to: target, data_level: "creative", mode: "snapshot_replace" } };
  await db.query(`insert into reports(id,workspace_id,advertiser_id,tenant_id,report_type_id,status,updated_at,published_ingestion_id,meta,created_by)
    values($1,$2,$3,$4,$5,'draft',now(),$6,$7,$8)`, [report, workspace, advertiser, tenant, id(8), id(777), reportMeta, id(1)]);
  await db.query("insert into report_media_connections values($1,$2,$3,$4,$5)", [report, c, workspace, advertiser, tenant]);
  const call = async (name: string, args: unknown[], casts: string[]) => {
    const result = await db.query<{ result: Record<string, unknown> }>(`select ${name}(${casts.map((cast, i) => `$${i + 1}::${cast}`).join(",")}) result`, args);
    return result.rows[0].result;
  };
  const claim = (l = lease) => call("claim_meta_ads_daily_run_v1", [c, target, l], ["uuid", "date", "uuid"]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(claim(), /permission denied/);
    await assert.rejects(db.query("select * from meta_ads_daily_partitions"), /permission denied/); cases++;
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const first = await claim(); assert.equal(first.claimed, true); assert.equal(first.collection_start, start); cases++;
  assert.equal((await claim(id(707))).reason, "leased"); cases++;
  const payload = { connection_id: c, run_id: first.run_id, lease, expected_connection_updated_at: first.connection_updated_at,
    date_from: range.dateFrom, date_to: range.dateTo, policy, ...normal };
  const save = (p: unknown) => call("replace_meta_ads_daily_window_v1", [p], ["jsonb"]);
  for (const change of [{ lease: id(707) }, { connection_id: id(5) }, { expected_connection_updated_at: "2000-01-01" },
    { totals: { ...normal.totals, website_contacts: "9" } }, { rows: [...normal.rows, normal.rows[0]] },
    { rows: [{ ...normal.rows[0], provider: "naver_searchad" }, normal.rows[1]] }, { rows: [{ ...normal.rows[0], access_token: "secret" }, normal.rows[1]] },
    { policy: { ...policy, conversion_action_type: "contact_total" } }, { evidence: "no_data" }]) {
    await assert.rejects(save({ ...payload, ...change }));
    assert.equal((await db.query("select count(*)::integer n from meta_ads_daily_partitions")).rows[0].n, 0); cases++;
  }
  await save(payload); await save(payload);
  assert.equal((await db.query("select count(*)::integer n from meta_ads_daily_partitions")).rows[0].n, 7); cases++;
  const finish = (l: string, error: string | null = null) => call("finish_meta_ads_daily_run_v1", [first.run_id, l, error], ["uuid", "uuid", "text"]);
  assert.equal((await finish(lease)).status, "partial"); cases++;
  const secondLease = id(708), second = await claim(secondLease);
  assert.equal(second.claimed, true); assert.equal(second.collection_start, shiftMetaDay(target, -6)); cases++;
  // Reclaim invalidates an earlier process's lease even if it retained its payload.
  await assert.rejects(save(payload), /META_CONTACT_CHANGED|META_DAILY_LEASE_LOST/); cases++;
  await save({ ...payload, lease: secondLease, expected_connection_updated_at: second.connection_updated_at,
    date_from: emptyRange.dateFrom, date_to: emptyRange.dateTo, ...empty });
  assert.equal((await finish(secondLease)).status, "done"); cases++;
  assert.equal((await claim()).reason, "already_done"); cases++;
  const materialize = (r = report) => call("materialize_meta_ads_daily_report_v1", [r, c, target], ["uuid", "uuid", "date"]);
  const state = () => db.query(`select r.current_ingestion_id,r.published_ingestion_id,
    (select count(*)::integer from report_rows where report_id=r.id and ingestion_id=r.current_ingestion_id) rows,
    (select coalesce(sum((row->>'conversions')::numeric),0)::text from report_rows where report_id=r.id and ingestion_id=r.current_ingestion_id) contacts
    from reports r where r.id=$1`, [report]);
  const built = await materialize(); assert.equal(built.status, "updated"); assert.equal(built.row_count, 2); cases++;
  const before = (await state()).rows[0]; assert.equal(before.published_ingestion_id, id(777)); assert.equal(before.contacts, "8"); cases++;
  assert.equal((await materialize()).status, "unchanged"); cases++;
  await db.exec("begin"); await db.query("delete from meta_ads_daily_partitions where connection_id=$1 and date=$2", [c, target]);
  assert.equal((await materialize()).status, "waiting_meta"); assert.deepEqual((await state()).rows[0], before); await db.exec("rollback"); cases++;
  // A completely empty but verified reporting period must clear a previous draft snapshot atomically.
  await db.exec("begin");
  await db.query("update reports set meta=jsonb_set(meta,'{media_sync,date_from}',to_jsonb($2::text)) where id=$1", [report, emptyRange.dateFrom]);
  assert.equal((await materialize()).row_count, 0); assert.equal((await state()).rows[0].rows, 0); await db.exec("rollback"); cases++;
  // Late failure must leave draft/published pointers and all old snapshots intact.
  await db.exec("reset role; alter table media_sync_jobs add constraint daily_late_failure check (report_id<>'" + report + "' or inserted_rows<1) not valid; set role service_role");
  await db.exec("begin");
  await db.query("update reports set meta=meta-'meta_ads_daily_projection' where id=$1", [report]);
  await assert.rejects(materialize(), /daily_late_failure/); await db.exec("rollback");
  assert.deepEqual((await state()).rows[0], before); cases++;
  await db.exec("reset role; alter table media_sync_jobs drop constraint daily_late_failure; set role service_role");
  // Mixed report waits for Naver; filling the zero-row last day is sufficient coverage.
  const naver = id(710), mixed = id(711);
  await db.query(`insert into media_connections(id,workspace_id,advertiser_id,tenant_id,provider,external_account_id,status,
    credential_version,credential_ciphertext,last_verified_at,updated_at,meta) values($1,$2,$3,$4,'naver_searchad','999777','active',1,'synthetic',now(),now(),'{}')`,
    [naver, workspace, advertiser, tenant]);
  const mixedMeta = { ...reportMeta, url_contract_version: 2, data_source: { kind: "api", mode: "snapshot_replace", data_level: "mixed",
    aggregation_contract: "naver_meta_contact_v1", providers: ["meta_ads", "naver_searchad"] }, media_sync: { ...reportMeta.media_sync, data_level: "mixed" } };
  await db.query(`insert into reports(id,workspace_id,advertiser_id,tenant_id,report_type_id,status,updated_at,meta,created_by)
    values($1,$2,$3,$4,$5,'draft',now(),$6,$7)`, [mixed, workspace, advertiser, tenant, id(8), mixedMeta, id(1)]);
  await db.query(`insert into manual_report_media_connections(tenant_id,workspace_id,advertiser_id,report_id,connection_id)
    values($1,$2,$3,$4,$5),($1,$2,$3,$4,$6)`, [tenant, workspace, advertiser, mixed, c, naver]);
  for (const date of allDays.slice(0, -1)) await db.query(`insert into media_sync_fact_partitions(workspace_id,advertiser_id,provider,external_account_id,date,
    source_connection_id,source_job_id,row_count) values($1,$2,'naver_searchad','999777',$3,$4,$5,0)`, [workspace, advertiser, date, naver, id(712)]);
  assert.equal((await materialize(mixed)).status, "waiting_naver"); cases++;
  await db.query(`insert into media_sync_fact_partitions(workspace_id,advertiser_id,provider,external_account_id,date,
    source_connection_id,source_job_id,row_count) values($1,$2,'naver_searchad','999777',$3,$4,$5,0)`, [workspace, advertiser, target, naver, id(712)]);
  const naverBefore = await db.query("select * from media_sync_fact_partitions where source_connection_id=$1 order by date", [naver]);
  assert.equal((await materialize(mixed)).status, "updated"); cases++;
  assert.equal((await materialize(mixed)).status, "unchanged"); cases++;
  assert.deepEqual((await db.query("select * from media_sync_fact_partitions where source_connection_id=$1 order by date", [naver])).rows, naverBefore.rows); cases++;
  assert.equal((await materialize(id(99))).status, "ineligible"); cases++;
  console.log(JSON.stringify({ suite: "meta_ads_daily", cases, status: "PASS" }));
}

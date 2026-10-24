import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleMetaAdsOnboarding } from "../src/lib/media-sync/meta-ads-onboarding";
import { createMetaDailyRunner } from "../src/lib/media-sync/meta-ads-daily-runner";
import { encryptMetaAdsCredentials, decryptMetaAdsCredentials } from "../src/lib/media-sync/meta-ads-credentials";
import { metaAdsSetupDates, metaAdsDailyStatusText } from "../src/lib/media-sync/meta-ads-daily-policy";
import { shiftMetaDay } from "../src/lib/media-sync/meta-ads-daily";
import type { MetaAdsVerificationRecord } from "../src/lib/media-sync/meta-ads-connection-verification";
import type { MediaConnectionsPostAccessContext } from "../src/lib/media-sync/media-connections-post-policy";

type DB = { exec(sql: string): Promise<unknown>; query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, args?: unknown[]): Promise<{ rows: T[] }> };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export async function runMetaOnboardingChecks(db: DB) {
  let cases = 0, writes = 0, reads = 0, authorizations = 0;
  const dates = metaAdsSetupDates(), target = dates.maxDate, start = shiftMetaDay(target, -6);
  assert.deepEqual(metaAdsSetupDates(new Date("2026-10-23T20:00:00Z")),
    { maxDate: "2026-10-23", minDate: "2025-10-23", defaultStart: "2026-09-24" }); cases++;
  const access: MediaConnectionsPostAccessContext = { userId: id(1), workspaceId: id(802), advertiserId: id(803),
    accessScope: "workspace", canManageConnections: true };
  const context = { connectionId: id(801), workspaceId: access.workspaceId, advertiserId: access.advertiserId,
    provider: "meta_ads" as const, externalAccountId: "777888" };
  const token = "SYNTHETIC_ONBOARDING_SECRET", replacement = "SYNTHETIC_REPLACEMENT_SECRET";
  const record: MetaAdsVerificationRecord = { id: context.connectionId, workspace_id: access.workspaceId,
    advertiser_id: access.advertiserId, provider: "meta_ads", external_account_id: context.externalAccountId,
    credential_ciphertext: encryptMetaAdsCredentials({ version: 1, access_token: token }, context), credential_version: 1,
    status: "active", connected_at: null, updated_at: "2000-01-01T00:00:00+00:00" };
  const input = { expectedWorkspaceId: access.workspaceId, startDate: start, conversion: "website_contact", confirmConversion: true, credentials: null };
  const request = (b: unknown = input, headers: Record<string, string> = {}) => new Request("https://fixture.invalid/setup", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(b) });
  const fakeFetch: typeof fetch = async (urlInput, init) => {
    reads++;
    const url = new URL(String(urlInput));
    assert.equal(url.origin, "https://graph.facebook.com"); assert.ok(!url.href.includes(token));
    assert.match(new Headers(init?.headers).get("Authorization")!, /^Bearer SYNTHETIC_/);
    if (!url.pathname.endsWith("/insights")) return Response.json({ id: "act_777888", account_id: "777888", currency: "KRW", timezone_name: "Asia/Seoul" });
    const range = JSON.parse(url.searchParams.get("time_range")!);
    const row = { account_id: "777888", date_start: range.since, date_stop: range.until, impressions: "100", clicks: "10", spend: "1000",
      conversions: [{ action_type: "contact_website", value: "1" }, { action_type: "contact_total", value: "1" }] };
    return Response.json({ data: [url.searchParams.get("level") === "account" ? row :
      { ...row, date_stop: range.since, campaign_id: "11", adset_id: "22", ad_id: "33" }] });
  };
  let captured: Record<string, unknown> = {};
  const deps = { resolveAccess: async () => { authorizations++; return access; }, load: async () => structuredClone(record), fetchImpl: fakeFetch,
    activate: async (p: Record<string, unknown>) => { writes++; captured = structuredClone(p);
      return { connection_id: record.id, enabled: true, initial_status: "pending" }; } };
  const invoke = (req = request(), overrides = {}) => handleMetaAdsOnboarding(req, access.advertiserId, record.id, { ...deps, ...overrides });
  const valid = await invoke(); assert.equal(valid.status, 200); assert.equal(authorizations, 2); assert.equal(writes, 1); cases++;
  const returned = await valid.text(); assert.ok(!returned.includes(token)); assert.ok(!returned.includes("ciphertext")); cases++;
  const validPayload = structuredClone(captured);
  const deny = async (req: Request, status: number, overrides = {}, noReads = true) => {
    writes = 0; reads = 0;
    const response = await invoke(req, overrides);
    assert.equal(response.status, status, await response.text()); assert.equal(writes, 0); if (noReads) assert.equal(reads, 0); cases++;
  };
  await deny(request(input, { origin: "https://evil.invalid" }), 403);
  await deny(request({ ...input, expectedWorkspaceId: id(900) }), 409);
  await deny(request({ ...input, confirmConversion: false }), 400);
  await deny(request({ ...input, conversion: "purchase" }), 400);
  await deny(request({ ...input, startDate: shiftMetaDay(target, 1) }), 400);
  await deny(request({ ...input, startDate: shiftMetaDay(target, -366) }), 400);
  await deny(request({ ...input, unknown: true }), 400);
  await deny(request(), 403, { resolveAccess: async () => ({ ...access, canManageConnections: false }) });
  await deny(request(), 404, { load: async () => ({ ...record, advertiser_id: id(900) }) });
  await deny(request(), 422, { fetchImpl: async () => Response.json({ id: "act_777888", account_id: "777888", currency: "USD", timezone_name: "America/New_York" }) });
  let auth = 0;
  await deny(request(), 403, { resolveAccess: async () => (++auth === 1 ? access : { ...access, canManageConnections: false }) }, false);
  await deny(request(), 409, { fetchImpl: async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes("level=ad")
    ? Response.json({ data: [] }) : fakeFetch(u, i) }, false);
  await deny(request(), 502, { fetchImpl: async () => { throw new Error(token); } });
  writes = 0;
  const replaced = await invoke(request({ ...input, credentials: { version: 1, access_token: replacement } }));
  assert.equal(replaced.status, 200); assert.equal(writes, 1);
  assert.equal(decryptMetaAdsCredentials(captured.replacement_ciphertext as string, context).access_token, replacement);
  assert.ok(!JSON.stringify(captured).includes(replacement)); cases++;
  const replacementCipher = captured.replacement_ciphertext;

  await db.exec("reset role; alter table media_connections add column if not exists connected_at timestamptz, add column if not exists last_error text");
  const legacy = (await db.query("select * from media_connections where id=$1", [id(701)])).rows[0];
  await db.exec(readFileSync("supabase/migrations/20261024141551_meta_ads_common_onboarding.sql", "utf8")); cases++;
  assert.deepEqual((await db.query("select * from media_connections where id=$1", [id(701)])).rows[0], legacy); cases++;
  await db.query(`insert into media_connections(id,workspace_id,advertiser_id,tenant_id,provider,external_account_id,status,credential_version,
    credential_ciphertext,updated_at,meta) values($1,$2,$3,$4,'meta_ads','777888','active',1,$5,$6,'{}')`,
    [record.id, access.workspaceId, access.advertiserId, id(804), record.credential_ciphertext, record.updated_at]);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const result = await db.query<{ result: Record<string, unknown> | null }>(`select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) result`,
      keys.map(k => args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
    return result.rows[0].result;
  };
  const activate = (p = validPayload) => rpc("activate_meta_ads_daily_connection_v1", { p_payload: p });
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const [name, args] of [
      ["activate_meta_ads_daily_connection_v1", { p_payload: validPayload }],
      ["enqueue_meta_ads_daily_batch_v1", { p_target_date: target }],
      ["claim_meta_ads_collection_task_v1", { p_lease: id(820) }],
      ["finish_meta_ads_collection_task_v1", { p_task_id: id(820), p_lease: id(821), p_error: null }],
      ["meta_ads_daily_eligible_v1", {}],
    ] as [string, Record<string, unknown>][]) { await assert.rejects(rpc(name, args), /permission denied/); cases++; }
    await assert.rejects(db.query("select * from meta_ads_daily_enrollments"), /permission denied/); cases++;
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  for (const change of [{ workspace_id: id(900) }, { advertiser_id: id(900) }, { connection_id: id(701) },
    { expected_updated_at: "1999-01-01" }, { start_date: shiftMetaDay(target, 1) },
    { policy: { ...(validPayload.policy as object), conversion_action_type: "purchase" } },
    { proof: { ...(validPayload.proof as object), evidence: "omitted_on_complete_insights" } }]) {
    await assert.rejects(activate({ ...validPayload, ...change }));
    assert.equal((await db.query("select count(*)::integer n from meta_ads_daily_enrollments where connection_id=$1", [record.id])).rows[0].n, 0); cases++;
  }
  await db.exec("reset role; alter table meta_ads_collection_queue add constraint setup_late_failure check (connection_id<>'" + record.id + "'); set role service_role");
  await assert.rejects(activate(), /setup_late_failure/);
  assert.deepEqual((await db.query("select meta from media_connections where id=$1", [record.id])).rows[0].meta, {}); cases++;
  await db.exec("reset role; alter table meta_ads_collection_queue drop constraint setup_late_failure; set role service_role");
  assert.equal((await activate())!.initial_status, "pending"); cases++;
  const refreshPayload = async (changes = {}) => ({ ...validPayload, expected_updated_at:
    (await db.query("select updated_at::text value from media_connections where id=$1", [record.id])).rows[0].value, ...changes });
  assert.equal((await activate(await refreshPayload()))!.already_enabled, true); cases++;
  const eligible = await db.query("select connection_id from meta_ads_daily_eligible_v1() order by connection_id");
  assert.deepEqual(eligible.rows.map(r => r.connection_id), [id(701), id(801)]); cases++;
  const enqueue = () => rpc("enqueue_meta_ads_daily_batch_v1", { p_target_date: target });
  assert.equal((await enqueue())!.enqueued, 1); assert.equal((await enqueue())!.enqueued, 0); cases++;
  const claim = (lease: string) => rpc("claim_meta_ads_collection_task_v1", { p_lease: lease });
  const first = (await claim(id(820)))!, second = (await claim(id(821)))!;
  assert.equal(first.connection_id, record.id); assert.equal(second.connection_id, id(701)); assert.notEqual(first.id, second.id); cases++;
  const finish = (taskId: unknown, lease: string, error: string | null = null) => rpc("finish_meta_ads_collection_task_v1",
    { p_task_id: taskId, p_lease: lease, p_error: error });
  await assert.rejects(finish(first.id, id(899)), /META_DAILY_LEASE_LOST/); cases++;

  // Run the real collector against PostgreSQL and injected Meta HTTP, including generation/row/proof writes.
  const adapter = {
    async rpc(name: string, args: Record<string, unknown>) {
      try { return { data: await rpc(name, args), error: null }; }
      catch (error) { return { data: null, error: { message: String((error as Error).message) } }; }
    },
    from(table: string) {
      assert.ok(["media_connections", "report_media_connections", "manual_report_media_connections"].includes(table));
      let columns = "*", limit = 1000; const filters: [string, unknown][] = [];
      async function execute(single: boolean) {
        const rows = await db.query(`select ${columns} from ${table}${filters.length ? " where " + filters.map(([k], i) => `${k}=$${i + 1}`).join(" and ") : ""} limit ${limit}`,
          filters.map(([, v]) => v));
        const values = rows.rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
        return { data: single ? values[0] : values, error: null };
      }
      const builder = { select(c: string) { assert.match(c, /^[a-z_,]+$/); columns = c; return builder; },
        eq(k: string, v: unknown) { assert.match(k, /^[a-z_]+$/); filters.push([k, v]); return builder; },
        limit(n: number) { limit = n; return builder; }, single: () => execute(true),
        then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) { return execute(false).then(resolve, reject); } };
      return builder;
    },
  } as unknown as SupabaseClient;
  const collector = createMetaDailyRunner(adapter, fakeFetch);
  const logs: string[] = [], originalLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  try {
    assert.equal(await collector.collect(record.id, target), 0); cases++;
    assert.equal(await collector.collect(id(701), target), 0); cases++;
  } finally { console.log = originalLog; }
  assert.ok(!logs.join("").includes(token)); assert.ok(!logs.join("").includes("ciphertext")); cases++;
  assert.equal((await finish(first.id, id(820)))!.status, "done");
  assert.equal((await finish(second.id, id(821)))!.status, "done"); cases++;
  const facts = (await db.query("select count(*)::integer days,sum(row_count)::integer rows from meta_ads_daily_partitions where connection_id=$1", [record.id])).rows[0];
  assert.deepEqual(facts, { days: 7, rows: 1 }); cases++;
  const status = (await db.query("select meta from media_connections where id=$1", [record.id])).rows[0].meta as Record<string, unknown>;
  assert.match(metaAdsDailyStatusText(status)!, /수집 완료/); cases++;
  assert.equal((await enqueue())!.enqueued, 0); assert.equal(await claim(id(822)), null); cases++;
  // Credential changes create a new generation; an old successful run cannot satisfy it.
  assert.equal((await activate(await refreshPayload({ replacement_ciphertext: replacementCipher })))!.already_enabled, false); cases++;
  const rotated = (await claim(id(823)))!;
  const current = (await rpc("claim_meta_ads_daily_run_v1", { p_connection_id: record.id, p_target_date: target, p_lease: id(824) }))!;
  assert.equal(current.claimed, true); cases++;
  // Re-authorizing during a run invalidates that run's credential CAS, and the new generation need not wait twenty minutes.
  const cipher3 = encryptMetaAdsCredentials({ version: 1, access_token: "SYNTHETIC_THIRD_SECRET" }, context);
  await activate(await refreshPayload({ replacement_ciphertext: cipher3 }));
  const newRun = (await rpc("claim_meta_ads_daily_run_v1", { p_connection_id: record.id, p_target_date: target, p_lease: id(825) }))!;
  assert.equal(newRun.claimed, true); cases++;
  await assert.rejects(rpc("finish_meta_ads_daily_run_v1", { p_run_id: current.run_id, p_lease: id(824), p_error: null }), /META_DAILY_LEASE_LOST/); cases++;
  await assert.rejects(finish(rotated.id, id(823)), /META_DAILY_LEASE_LOST/); cases++;
  await rpc("finish_meta_ads_daily_run_v1", { p_run_id: newRun.run_id, p_lease: id(825), p_error: "META_DAILY_FAILED" });
  const retryTask = (await claim(id(826)))!;
  assert.equal((await finish(retryTask.id, id(826), "META_DAILY_FAILED"))!.status, "pending"); cases++;
  assert.equal(await claim(id(827)), null); cases++;
  await db.query("update meta_ads_collection_queue set next_attempt_at=now()-interval '1 second' where id=$1", [retryTask.id]);
  const retry = (await claim(id(828)))!; assert.equal(retry.attempt, 2); cases++;
  // Recovery after a crashed task's lease expires is bounded to three claims.
  await db.query("update meta_ads_collection_queue set lease_until=now()-interval '1 second' where id=$1", [retry.id]);
  assert.equal((await claim(id(829)))!.attempt, 3); cases++;
  await db.query("update meta_ads_collection_queue set lease_until=now()-interval '1 second' where id=$1", [retry.id]);
  assert.equal(await claim(id(830)), null); cases++;
  assert.equal((await db.query("select status from meta_ads_collection_queue where id=$1", [retry.id])).rows[0].status, "failed"); cases++;
  // Disabled/disconnected accounts and unverified token edits disappear from discovery immediately.
  await db.query("update media_connections set status='disconnected' where id=$1", [record.id]);
  assert.equal((await db.query("select count(*)::integer n from meta_ads_daily_eligible_v1() where connection_id=$1", [record.id])).rows[0].n, 0); cases++;
  await db.query("update media_connections set status='active',credential_ciphertext='unverified-edit' where id=$1", [record.id]);
  assert.equal((await db.query("select count(*)::integer n from meta_ads_daily_eligible_v1() where connection_id=$1", [record.id])).rows[0].n, 0); cases++;
  assert.deepEqual((await db.query("select count(*)::integer days,sum(row_count)::integer rows from meta_ads_daily_partitions where connection_id=$1", [record.id])).rows[0], facts); cases++;
  assert.deepEqual((await db.query("select * from media_connections where id=$1", [id(701)])).rows[0], legacy); cases++;
  console.log(JSON.stringify({ suite: "meta_ads_common_onboarding", cases, status: "PASS", live_api: 0 }));
}

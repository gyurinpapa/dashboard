import assert from "node:assert/strict";

// Synthetic-only tests: no real credentials, network, database or environment files.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 79).toString("base64");
let network = 0;
globalThis.fetch = async () => { network++; throw new Error("NETWORK_FORBIDDEN"); };

async function main() {
  const { resolveMetaAdsPreviewRange: range, parseMetaAdsInsightsPreview: parse,
    readMetaAdsInsightsPreview: read } = await import("../src/lib/media-sync/meta-ads-insights-preview");
  const { handleMetaAdsInsightsPreview: handle } = await import("../src/lib/media-sync/meta-ads-insights-preview-route");
  const { encryptMetaAdsCredentials } = await import("../src/lib/media-sync/meta-ads-credentials");
  const { MediaConnectionAccessError } = await import("../src/lib/media-sync/media-connection-access");
  const { getMediaProviderSyncCapability } = await import("../src/lib/media-sync/media-provider-sync-capabilities");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Card } = await import("../app/report-builder/MetaAdsConnectionCard");
  const { default: Diagnostic } = await import("../app/report-builder/MetaAdsInsightsPreview");
  const { formatMetaAdsPreviewExport: exportResult } = await import("../src/lib/media-sync/meta-ads-insights-preview-export");
  let cases = 0;
  const now = new Date("2026-10-23T16:00:00Z"); // Oct 24 in the account's time zone.
  const period = { dateFrom: "2026-09-24", dateTo: "2026-10-23" };
  assert.deepEqual(range({}, "Asia/Seoul", now), period); cases++;
  assert.deepEqual(range({}, "America/Los_Angeles", now), { dateFrom: "2026-09-23", dateTo: "2026-10-22" }); cases++;
  assert.deepEqual(range({ dateFrom: "2026-09-23", dateTo: "2026-10-23" }, "Asia/Seoul", now),
    { dateFrom: "2026-09-23", dateTo: "2026-10-23" }); cases++;
  for (const bad of [{ dateFrom: "2026-10-24", dateTo: "2026-10-24" }, { dateFrom: "2026-09-22", dateTo: "2026-10-23" },
    { dateFrom: "2026-02-30", dateTo: "2026-03-01" }, { dateFrom: "2026-10-23" },
    { dateFrom: "2026-10-23", dateTo: "2026-10-22" }]) { assert.throws(() => range(bad, "Asia/Seoul", now)); cases++; }
  const accountId = "1627000000000000", token = "SYNTHETIC_META_PREVIEW_SECRET";
  const row = { account_id: accountId, date_start: period.dateFrom, date_stop: period.dateTo,
    impressions: "12982", clicks: "563", spend: "101531.25", actions: [
      { action_type: "lead", value: "7" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "7" },
      { action_type: "landing_page_view", value: "519" }, { action_type: "offsite_conversion.custom.123", value: "2" },
    ] };
  const parsed = parse({ data: [row], paging: { cursors: { after: "opaque" } } }, accountId, period);
  assert.equal(parsed.spend, "101531.25"); assert.equal(parsed.actions.length, 4);
  assert.equal(parsed.actions[0].value, "7"); assert.equal(parsed.actions[1].value, "7");
  assert.deepEqual(parsed.conversions, []); assert.deepEqual(parsed.conversion_values, []);
  assert.deepEqual(parsed.action_values, []); cases++;
  const empty = parse({ data: [] }, accountId, period);
  assert.equal(empty.has_data, false); assert.equal(empty.spend, null);
  assert.deepEqual(empty.conversions, []); assert.deepEqual(empty.conversion_values, []); cases++;
  assert.deepEqual(parse({ data: [{ ...row, actions: undefined }] }, accountId, period).actions, []); cases++;
  const conversionRow = { ...row, actions: [{ action_type: "contact_website", value: "3" }],
    action_values: [{ action_type: "contact_website", value: "30" }],
    conversions: [{ action_type: "contact_website", value: "5" }, { action_type: "contact_total", value: "5" }],
    conversion_values: [{ action_type: "contact_website", value: "12.5" }] };
  const conversionParsed = parse({ data: [conversionRow] }, accountId, period);
  // Preserve fields and overlapping action types independently, without totals or zero coercion.
  for (const field of ["actions", "action_values", "conversions", "conversion_values"] as const) {
    assert.deepEqual(conversionParsed[field], conversionRow[field]); cases++;
  }
  const conversionOnly = parse({ data: [{ ...conversionRow, actions: undefined, action_values: undefined }] }, accountId, period);
  assert.equal(conversionOnly.has_data, true); assert.deepEqual(conversionOnly.actions, []);
  assert.deepEqual(conversionOnly.conversions, conversionRow.conversions); cases++;
  for (const field of ["conversions", "conversion_values"] as const) {
    for (const invalid of [null, "5", [{ action_type: "contact_website", value: "-1" }],
      [{ action_type: "contact_website", value: "1" }, { action_type: "contact_website", value: "2" }],
      [{ action_type: "<script>", value: "1" }]]) {
      assert.throws(() => parse({ data: [{ ...conversionRow, [field]: invalid }] }, accountId, period)); cases++;
    }
  }
  for (const bad of [null, { error: { message: token } }, { data: [row, row] },
    { data: [row], paging: { next: "https://untrusted.invalid/?access_token=secret" } },
    ...[{ account_id: "99" }, { date_stop: "2026-10-24" }, { spend: "NaN" }, { impressions: "1.5" },
      { actions: [{ action_type: "lead", value: "1" }, { action_type: "lead", value: "2" }] },
      { actions: [{ action_type: "lead", value: "-1" }] }, { actions: [{ action_type: "<script>", value: "1" }] },
      { action_values: null }].map(change => ({ data: [{ ...row, ...change }] }))]) {
    assert.throws(() => parse(bad, accountId, period)); cases++;
  }
  const readInput = { ...period, externalAccountId: accountId, accessToken: token };
  let metaCalls = 0;
  const fetchInsights: typeof fetch = async (input, init) => {
    metaCalls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://graph.facebook.com");
    assert.equal(url.pathname, `/v26.0/act_${accountId}/insights`);
    assert.equal(url.searchParams.get("level"), "account"); assert.equal(url.searchParams.get("limit"), "1");
    assert.equal(url.searchParams.get("fields"), "account_id,date_start,date_stop,impressions,clicks,spend,actions,action_values,conversions,conversion_values");
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal(url.searchParams.has("action_report_time"), false);
    assert.equal(url.searchParams.has("action_attribution_windows"), false);
    assert.deepEqual(JSON.parse(url.searchParams.get("time_range")!), { since: period.dateFrom, until: period.dateTo });
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    return Response.json({ data: [row] });
  };
  assert.deepEqual(await read(readInput, fetchInsights), parsed); assert.equal(metaCalls, 1); cases++;
  for (const response of [Response.json({ error: { message: token } }, { status: 403 }),
    new Response("bad json"), new Response("{}", { headers: { "content-length": "200000" } }),
    new Response("a".repeat(131073)), Response.json({ data: [row], paging: { next: "https://other.invalid" } })]) {
    await assert.rejects(read(readInput, async () => response), error => !String(error).includes(token)); cases++;
  }
  await assert.rejects(read(readInput, async () => { throw new Error(token); }), error => !String(error).includes(token)); cases++;
  await assert.rejects(read(readInput, () => new Promise(() => {}), { timeoutMs: 5 }), /REQUEST_TIMEOUT/); cases++;
  let bodyCancelled = false;
  await assert.rejects(read(readInput, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); }, cancel() { bodyCancelled = true; },
  })), { timeoutMs: 5 }), /REQUEST_TIMEOUT/);
  assert.equal(bodyCancelled, true); cases++;

  const workspaceId = "10000000-0000-4000-8000-000000000001", advertiserId = "10000000-0000-4000-8000-000000000002";
  const connectionId = "10000000-0000-4000-8000-000000000003", userId = "10000000-0000-4000-8000-000000000004";
  const context = { workspaceId, advertiserId, connectionId, provider: "meta_ads" as const, externalAccountId: accountId };
  const record = { id: connectionId, workspace_id: workspaceId, advertiser_id: advertiserId, provider: "meta_ads" as const,
    external_account_id: accountId, credential_ciphertext: encryptMetaAdsCredentials({ version: 1, access_token: token }, context),
    credential_version: 1, status: "active" as const, connected_at: "2026-10-01T00:00:00Z",
    last_verified_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
  const beforeRecord = structuredClone(record);
  const access = { workspaceId, advertiserId, userId, canManageConnections: true, accessScope: "workspace" as const };
  const url = `https://fixture.invalid/api/advertisers/${advertiserId}/media-connections/meta-ads/${connectionId}/insights-preview`;
  const request = (body: unknown = { expectedWorkspaceId: workspaceId }, headers = {}) => new Request(url, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://fixture.invalid", ...headers }, body: JSON.stringify(body),
  });
  let calls = 0, loads = 0;
  type Deps = Parameters<typeof handle>[3];
  const deps: Deps = { now: () => now,
    resolveAccess: async input => { assert.equal(input.action, "manage_connections"); return access; },
    load: async scope => { loads++; assert.deepEqual(scope, { connectionId, workspaceId, advertiserId }); return { ...record }; },
    fetchImpl: async (input, init) => {
      calls++;
      if (String(input).includes("/insights?")) return fetchInsights(input, init);
      assert.equal(new URL(String(input)).pathname, `/v26.0/act_${accountId}`);
      return Response.json({ id: `act_${accountId}`, account_id: accountId, currency: "KRW", timezone_name: "Asia/Seoul" });
    },
  };
  async function run(req: Request, status: number, overrides: Partial<Deps> = {}, expectedCalls = 0) {
    const start = calls;
    const response = await handle(req, advertiserId, connectionId, { ...deps, ...overrides });
    const raw = await response.text();
    assert.equal(response.status, status, raw); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(raw.includes(token), false); assert.equal(raw.includes(record.credential_ciphertext), false);
    assert.equal(calls - start, expectedCalls); cases++; return JSON.parse(raw);
  }
  const success = await run(request(), 200, {}, 2);
  assert.deepEqual(success.preview, parsed); assert.equal(success.read_only, true);
  assert.equal(success.sync_enabled, false); assert.equal(success.conversion_mapping, "UNCONFIRMED");
  assert.equal(loads, 2); assert.deepEqual(record, beforeRecord);
  const conversionSuccess = await run(request(), 200, { fetchImpl: async (input, init) => {
    if (!String(input).includes("/insights?")) return deps.fetchImpl(input, init);
    calls++; return Response.json({ data: [conversionRow] });
  } }, 2);
  assert.deepEqual(conversionSuccess.preview, conversionParsed);
  const beforeLoads = loads;
  for (const status of [401, 403, 404, 500]) {
    await run(request(), status === 404 ? 403 : status, { resolveAccess: async () => { throw new MediaConnectionAccessError("UNAUTHORIZED", status, token); } });
  }
  assert.equal(loads, beforeLoads);
  await run(request(), 403, { resolveAccess: async () => ({ ...access, canManageConnections: false }) });
  await run(request(), 403, { resolveAccess: async () => ({ ...access, accessScope: "own_created" }) });
  await run(request(undefined, { Origin: "https://other.invalid" }), 403);
  await run(request(undefined, { "Sec-Fetch-Site": "cross-site" }), 403);
  await run(request({ expectedWorkspaceId: userId }), 409);
  await run(request({ expectedWorkspaceId: workspaceId, dateFrom: "2026-02-30", dateTo: "2026-03-01" }), 400);
  await run(request({ expectedWorkspaceId: workspaceId, dateFrom: "2026-10-24", dateTo: "2026-10-24" }), 400, {}, 1);
  for (const body of [null, [], {}, { expectedWorkspaceId: workspaceId, accessToken: token },
    { expectedWorkspaceId: workspaceId, padding: "a".repeat(2048) }]) await run(request(body), 400);
  await run(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), 400);
  await run(request(), 404, { load: async () => null });
  for (const change of [{ last_verified_at: null }, { last_verified_at: "bad" }, { provider: "naver_searchad" as const },
    { advertiser_id: userId }, { workspace_id: userId }, { status: "disconnected" as const },
    { credential_ciphertext: null }, { credential_version: 2 }, { updated_at: "bad" }]) {
    await run(request(), 409, { load: async () => ({ ...record, ...change }) });
  }
  await run(request(), 422, { load: async () => ({ ...record, credential_ciphertext: "invalid" }) });
  let readCount = 0;
  await run(request(), 409, { load: async () => ++readCount === 1 ? { ...record } : { ...record, updated_at: "2026-10-23T00:00:00Z" } }, 2);
  await run(request(), 502, { fetchImpl: async () => { calls++; return Response.json({ error: { message: token } }); } }, 1);
  const props = { workspaceId, advertiserId, loading: false, resolved: true, error: "", canManage: true,
    getAccessToken: async () => null, onRefresh() {}, connections: [{ ...record, has_credentials: true, external_account_name: "Fixture" }] };
  assert.equal(renderToStaticMarkup(createElement(Card, props)).includes("성과·전환 점검"), false); cases++;
  assert.equal(renderToStaticMarkup(createElement(Card, { ...props, canManage: false })).includes("성과·전환 점검"), false); cases++;
  assert.equal(renderToStaticMarkup(createElement(Card, { ...props, connections: [{ ...props.connections[0], last_verified_at: null }] })).includes("성과·전환 점검"), false); cases++;
  assert.ok(renderToStaticMarkup(createElement(Diagnostic, { workspaceId, advertiserId, connectionId,
    externalAccountId: accountId, accountLabel: "Fixture", getAccessToken: async () => null })).includes("성과·전환 점검")); cases++;
  const exported = exportResult({ externalAccountId: accountId, currency: "KRW", timeZone: "Asia/Seoul",
    preview: { ...conversionParsed, access_token: token,
      ...Object.fromEntries((["actions", "action_values", "conversions", "conversion_values"] as const)
        .map(field => [field, conversionParsed[field].map(action => ({ ...action, access_token: token }))])) } as typeof parsed });
  assert.equal(exported.includes(token), false);
  assert.equal(exported.includes("access_token"), false);
  assert.equal(JSON.parse(exported).schema, "etrylue_meta_insights_check_v2");
  for (const field of ["actions", "action_values", "conversions", "conversion_values"] as const) {
    assert.deepEqual(JSON.parse(exported)[field], conversionParsed[field]);
  }
  assert.equal(JSON.parse(exported).conversion_mapping, "UNCONFIRMED"); cases++;
  assert.equal(network, 0); assert.equal(getMediaProviderSyncCapability("meta_ads").syncRuntimeEnabled, false);
  assert.deepEqual(record, beforeRecord);
  console.log(`META_INSIGHTS_PREVIEW: ${cases} cases PASS; LIVE_API=0; DB_WRITES=0; META_SYNC=DISABLED`);
}
main().catch(error => { console.error("META_INSIGHTS_PREVIEW: FAIL", error); process.exitCode = 1; });

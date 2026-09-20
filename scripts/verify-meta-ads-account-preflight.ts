import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type { MetaAdsCanonicalContext } from "../src/lib/media-sync/meta-ads-canonical-row";
import type { MetaAdsCredentialContext } from "../src/lib/media-sync/meta-ads-credentials";

let cases = 0, networkAttempts = 0;
async function fixture() {
  assert.deepEqual(Object.keys(process.env).sort(), ["META_PREFLIGHT_FIXTURE", "NODE_ENV", "PATH"].sort());
  const deny = () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
  globalThis.fetch = deny;
  for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
    [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
    [dgram.Socket.prototype, ["send", "connect"]]] as const) {
    for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
  }
  syncBuiltinESMExports();
  const m = await import("../src/lib/media-sync/meta-ads-account-preflight");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const { buildMetaAdsInsightsRequest } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const wire = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8")) as {
    context: MetaAdsCanonicalContext; pages: unknown[];
  };
  const draft = JSON.parse(readFileSync("scripts/fixtures/meta-ads-connection-draft.json", "utf8"));
  const externalAccountId = wire.context.externalAccountId, accessToken = "SYNTHETIC_SECRET_SENTINEL";
  const input = { externalAccountId, accessToken };
  const raw = { id: `act_${externalAccountId}`, account_id: externalAccountId,
    currency: wire.context.currency, timezone_name: wire.context.timeZone };
  const scope: MetaAdsCredentialContext = { connectionId: "fixture-connection", workspaceId: "fixture-workspace",
    advertiserId: "fixture-advertiser", provider: "meta_ads", externalAccountId };
  const policy = { version: 1 as const, scope, currency: raw.currency, timeZone: raw.timezone_name,
    metricPolicy: wire.context.metricPolicy };
  const range = { dateFrom: wire.context.dateFrom, dateTo: wire.context.dateTo };
  const before = JSON.stringify({ input, raw, policy, range, draft });
  function errorIs(code: string, status: number | null = null) {
    return (error: unknown) => {
      assert.ok(error instanceof m.MetaAdsAccountPreflightError);
      assert.equal(error.code, code); assert.equal(error.status, status); assert.equal(error.cause, undefined);
      for (const value of [String(error.stack), JSON.stringify(error)]) {
        assert.ok(!value.includes(accessToken)); assert.ok(!value.includes(externalAccountId));
      }
      return true;
    };
  }
  function rejects(fn: () => unknown, code: string) { assert.throws(fn, errorIs(code)); cases++; }
  async function rejectsAsync(fn: () => Promise<unknown>, code: string, status: number | null = null) {
    await assert.rejects(fn, errorIs(code, status)); cases++;
  }
  const request = m.buildMetaAdsAccountMetadataRequest(input), url = new URL(request.url);
  assert.equal(url.origin, "https://graph.facebook.com");
  assert.equal(url.pathname, `/v26.0/act_${externalAccountId}`);
  assert.deepEqual([...url.searchParams], [["fields", "id,account_id,currency,timezone_name"]]);
  assert.deepEqual(request.init, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`,
    Accept: "application/json" }, cache: "no-store", redirect: "error" });
  assert.ok(!request.url.includes(accessToken)); cases++;
  for (const value of [request, request.init, request.init.headers]) { assert.ok(Object.isFrozen(value)); cases++; }
  for (const value of [null, "", "0", "01", 123, "act_123", "1/insights", "1?fields=name", "1\n", "9".repeat(31)]) {
    rejects(() => m.buildMetaAdsAccountMetadataRequest({ ...input, externalAccountId: value as string }), "INVALID_INPUT");
  }
  for (const value of [null, "", " leading", "line\nbreak", "with space", "é", "a".repeat(20001)]) {
    rejects(() => m.buildMetaAdsAccountMetadataRequest({ ...input, accessToken: value as string }), "INVALID_INPUT");
  }
  const parsed = m.parseMetaAdsAccountMetadata(raw, externalAccountId);
  assert.deepEqual(parsed, { externalAccountId, currency: raw.currency, timeZone: raw.timezone_name });
  assert.ok(Object.isFrozen(parsed)); cases++;
  let getterCalls = 0;
  const getter = () => { getterCalls++; throw new Error(accessToken); };
  assert.deepEqual(m.parseMetaAdsAccountMetadata({ ...raw, get secret() { return getter(); } }, externalAccountId), parsed); cases++;
  for (const key of ["id", "account_id", "currency", "timezone_name"]) {
    const missing = { ...raw } as Record<string, unknown>; delete missing[key];
    rejects(() => m.parseMetaAdsAccountMetadata(missing, externalAccountId), "INVALID_RESPONSE");
    const withGetter = { ...raw }; Object.defineProperty(withGetter, key, { get: getter });
    rejects(() => m.parseMetaAdsAccountMetadata(withGetter, externalAccountId), "INVALID_RESPONSE");
  }
  for (const value of [null, [], {}, "body", Object.assign(Object.create({ inherited: true }), raw),
    new Proxy({}, { getPrototypeOf() { throw new Error(accessToken); } })]) {
    rejects(() => m.parseMetaAdsAccountMetadata(value, externalAccountId), "INVALID_RESPONSE");
  }
  for (const value of [{ ...raw, id: "act_9" }, { ...raw, id: externalAccountId },
    { ...raw, account_id: Number(externalAccountId) }, { ...raw, account_id: "9" }]) {
    rejects(() => m.parseMetaAdsAccountMetadata(value, externalAccountId), "ACCOUNT_MISMATCH");
  }
  for (const currency of ["krw", "KRW ", "US", 0, null]) {
    rejects(() => m.parseMetaAdsAccountMetadata({ ...raw, currency }, externalAccountId), "INVALID_METADATA");
  }
  for (const timezone_name of ["Asia/NoSuchZone", " UTC", "", "UTC\n", null, 9]) {
    rejects(() => m.parseMetaAdsAccountMetadata({ ...raw, timezone_name }, externalAccountId), "INVALID_METADATA");
  }
  rejects(() => m.parseMetaAdsAccountMetadata({ error: { message: accessToken } }, externalAccountId), "API_ERROR");
  rejects(() => m.parseMetaAdsAccountMetadata({ ...raw, get error() { return getter(); } }, externalAccountId), "API_ERROR");
  assert.equal(getterCalls, 0); cases++;
  const checked = m.verifyMetaAdsAccountPolicyMetadata(policy, scope, range, raw);
  assert.deepEqual(checked.resolvedPolicy.context, wire.context); assert.deepEqual(checked.metadata, parsed);
  assert.ok(Object.isFrozen(checked)); cases++;
  rejects(() => m.verifyMetaAdsAccountPolicyMetadata(policy, scope, range, { ...raw, currency: "USD" }), "POLICY_MISMATCH");
  rejects(() => m.verifyMetaAdsAccountPolicyMetadata(policy, scope, range, { ...raw, timezone_name: "UTC" }), "POLICY_MISMATCH");
  rejects(() => m.verifyMetaAdsAccountPolicyMetadata(policy, { ...scope, workspaceId: "different" }, range, raw), "INVALID_POLICY");
  rejects(() => m.verifyMetaAdsAccountPolicyMetadata(policy, scope, { ...range, dateFrom: "2026-02-29" }, raw), "INVALID_POLICY");
  rejects(() => m.verifyMetaAdsAccountPolicyMetadata(draft, scope, range, raw), "INVALID_POLICY");
  assert.equal(draft.executionEnabled, false); assert.equal(draft.accountMetadataVerified, false);
  for (const key of ["scope", "currency", "timeZone"]) assert.equal(draft[key], null);
  assert.equal(draft.metricPolicyCandidate.conversionActionType, null);
  assert.equal(draft.metricPolicyCandidate.revenueActionType, null); cases++;
  const candidatePolicy = { ...policy, metricPolicy: { ...policy.metricPolicy,
    actionReportTime: draft.metricPolicyCandidate.actionReportTime,
    attributionWindows: draft.metricPolicyCandidate.attributionWindows } };
  const candidate = m.verifyMetaAdsAccountPolicyMetadata(candidatePolicy, scope, range, raw);
  const candidateRequest = buildMetaAdsInsightsRequest({ context: candidate.resolvedPolicy.context, accessToken });
  assert.equal(new URL(candidateRequest.url).searchParams.get("action_report_time"), "impression");
  assert.equal(new URL(candidateRequest.url).searchParams.get("action_attribution_windows"), '["7d_click","1d_view"]'); cases++;

  let metadataCalls = 0;
  const mockFetch: typeof fetch = async (address, init) => {
    metadataCalls++; assert.equal(address, request.url);
    assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${accessToken}`);
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(raw));
  };
  assert.deepEqual(await m.readMetaAdsAccountMetadata(input, { fetchImpl: mockFetch }), parsed);
  assert.equal(metadataCalls, 1); cases++;
  await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, {} as { fetchImpl: typeof fetch }), "MISSING_DEPENDENCY");
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 30001 }, { timeoutMs: NaN },
    { maxResponseBytes: 127 }, { maxResponseBytes: 262145 }, { maxResponseBytes: 128.5 }]) {
    await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: mockFetch }, options), "INVALID_INPUT");
  }
  await rejectsAsync(() => m.readMetaAdsAccountMetadata({ ...input, externalAccountId: "" }, { fetchImpl: mockFetch }), "INVALID_INPUT");
  assert.equal(metadataCalls, 1); cases++;
  for (const status of [400, 401, 403, 429, 500, 503]) {
    let calls = 0;
    await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => {
      calls++; return new Response(accessToken, { status });
    } }), "API_HTTP_ERROR", status);
    assert.equal(calls, 1);
  }
  await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => { throw new Error(accessToken); } }), "REQUEST_FAILED");
  for (const [response, code] of [
    [new Response(JSON.stringify({ error: { message: accessToken } })), "API_ERROR"],
    [new Response(accessToken), "INVALID_RESPONSE"],
    [new Response(new Uint8Array([0xc3, 0x28])), "INVALID_RESPONSE"],
    [new Response(null, { status: 204 }), "INVALID_RESPONSE"],
    [new Response(JSON.stringify({ ...raw, account_id: "9" })), "ACCOUNT_MISMATCH"],
    [new Response("small", { headers: { "content-length": "999999999" } }), "RESPONSE_TOO_LARGE"],
    [new Response("x".repeat(65537)), "RESPONSE_TOO_LARGE"],
  ] as const) {
    await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => response }), code);
  }
  const redirected = new Response(JSON.stringify(raw)); Object.defineProperty(redirected, "redirected", { value: true });
  await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => redirected }), "INVALID_RESPONSE");
  for (const address of ["https://example.com/", request.url.replace("v26.0", "v27.0"), `${request.url}&access_token=${accessToken}`]) {
    const response = new Response(JSON.stringify(raw)); Object.defineProperty(response, "url", { value: address });
    await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => response }), "ACCOUNT_MISMATCH");
  }
  const matching = new Response(JSON.stringify(raw)); Object.defineProperty(matching, "url", { value: request.url });
  assert.deepEqual(await m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => matching }), parsed); cases++;
  let timeoutSignal: AbortSignal | null | undefined;
  await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async (_, init) => {
    timeoutSignal = init?.signal; return new Promise<Response>(() => {});
  } }, { timeoutMs: 5 }), "REQUEST_TIMEOUT");
  assert.equal(timeoutSignal?.aborted, true); cases++;
  let cancelled = false;
  const stalled = new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
  await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: async () => stalled }, { timeoutMs: 5 }), "REQUEST_TIMEOUT");
  assert.equal(cancelled, true); cases++;
  // Capture account identity before an asynchronous caller can mutate the input.
  const mutable = { ...input };
  assert.deepEqual(await m.readMetaAdsAccountMetadata(mutable, { fetchImpl: async () => {
    mutable.externalAccountId = "9"; return new Response(JSON.stringify(raw));
  } }), parsed); cases++;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    rejects(() => m.buildMetaAdsAccountMetadataRequest(input), "SERVER_ONLY");
    rejects(() => m.parseMetaAdsAccountMetadata(raw, externalAccountId), "SERVER_ONLY");
    rejects(() => m.verifyMetaAdsAccountPolicyMetadata(policy, scope, range, raw), "SERVER_ONLY");
    await rejectsAsync(() => m.readMetaAdsAccountMetadata(input, { fetchImpl: mockFetch }), "SERVER_ONLY");
  } finally { Reflect.deleteProperty(globalThis, "window"); }

  // Metadata -> explicit policy -> existing real collector, with synthetic wire pages.
  let page = 0, fetched = 0, canonical = 0, cursor: unknown;
  const mockInsights: typeof fetch = async () => new Response(JSON.stringify(wire.pages[page++]));
  do {
    const result = await collect({ context: checked.resolvedPolicy.context, accessToken, cursor },
      { fetchImpl: mockInsights }, { pageSize: 4, maxRetries: 0 });
    fetched += result.fetchedRows; canonical += result.canonicalRows; cursor = result.cursor;
    if (cursor) {
      let changedPolicyFetches = 0;
      await assert.rejects(() => collect({ context: candidate.resolvedPolicy.context, accessToken, cursor },
        { fetchImpl: async () => { changedPolicyFetches++; throw new Error("must not fetch"); } },
        { pageSize: 4, maxRetries: 0 }), (error: unknown) => error instanceof Error && error.message === "Meta insights INVALID_CURSOR.");
      assert.equal(changedPolicyFetches, 0); cases++;
    }
  } while (cursor);
  assert.equal(fetched, 7); assert.equal(canonical, 6); assert.equal(page, wire.pages.length); cases++;
  assert.equal(JSON.stringify({ input, raw, policy, range, draft }), before); cases++;
  assert.equal(networkAttempts, 0); cases++;
  console.log(`META_ACCOUNT_PREFLIGHT=PASS CASES=${cases} NETWORK=BLOCKED DB_EXECUTIONS=0`);
  console.log("UNCONNECTED_DRAFT=NON_EXECUTABLE METADATA_POLICY_PARITY=PASS CHANGED_POLICY_RESUME=REJECTED");
  console.log("CANONICAL_ROWS=6 FETCHED_ROWS=7 TRANSPORT=MOCK LIVE_META_API_CALLS=0 LIVE_WORKER=DISABLED");
}
if (process.env.META_PREFLIGHT_FIXTURE === "1") {
  fixture().catch(() => { console.error("META_ACCOUNT_PREFLIGHT=FAIL"); process.exitCode = 1; });
} else {
  const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-meta-ads-account-preflight.ts"], {
    cwd: process.cwd(), env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", META_PREFLIGHT_FIXTURE: "1" }, encoding: "utf8",
  });
  process.stdout.write(child.stdout ?? ""); process.stderr.write(child.stderr ?? "");
  if (child.error || child.status !== 0) process.exitCode = 1;
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
// Deny real I/O before importing application modules. No env files or DB imports.
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw new Error("META_TEST_NETWORK_FORBIDDEN"); };
globalThis.fetch = deny;
for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
  [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
  [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
  [dgram.Socket.prototype, ["send", "connect"]]] as const) {
  for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
}
syncBuiltinESMExports();

async function main() {
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const { MetaInsightsError, metaRequestContext, metaHash } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const context = metaRequestContext(fixture.context);
  const accessToken = "fixture-never-log-this-secret";
  const input = { context, accessToken };
  const options = { pageSize: 4, maxRetries: 0 };
  const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
  const pageFetch = (page: unknown): typeof fetch => async () => json(page);
  let cases = 0;
  async function rejects(fn: () => Promise<unknown>, code: string) {
    await assert.rejects(fn, (error) => {
      assert.ok(error instanceof MetaInsightsError); assert.equal(error.code, code);
      assert.ok(!JSON.stringify(error).includes(accessToken)); assert.ok(!String(error).includes(accessToken));
      assert.equal(error.cause, undefined); return true;
    }); cases++;
  }
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    assert.equal(u.origin, "https://graph.facebook.com");
    assert.equal(u.searchParams.get("after"), [null, "fixture-page-2", "fixture-page-3"][calls]);
    assert.ok(!u.href.includes(accessToken));
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${accessToken}`);
    assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    return json(fixture.pages[calls++]);
  };
  const first = await collect(input, { fetchImpl }, options);
  assert.equal(first.cursor?.seenRows.length, 3); // Includes the all-zero row.
  const saved = JSON.stringify(first.cursor);
  const second = await collect({ ...input, cursor: first.cursor }, { fetchImpl }, options);
  const third = await collect({ ...input, cursor: second.cursor }, { fetchImpl }, options);
  assert.equal(calls, 3); assert.equal(third.isComplete, true); assert.equal(third.cursor, null);
  assert.equal(first.rows.length + second.rows.length + third.rows.length, 6);
  assert.equal(first.fetchedRows + second.fetchedRows + third.fetchedRows, 7);
  assert.equal(JSON.stringify(first.cursor), saved);
  assert.ok(!JSON.stringify([first, second, third]).includes(accessToken));
  assert.ok(!JSON.stringify([first, second, third]).includes("discard-fixture-token"));
  assert.ok(!Object.hasOwn(third, "rawRows")); cases++;
  let unexpectedFetch = 0;
  const forbidden: typeof fetch = async () => { unexpectedFetch++; throw new Error("should not fetch"); };
  for (const cursor of [{ ...first.cursor, scope: "wrong" }, { ...first.cursor, version: 2 },
    { ...first.cursor, after: "wrong" }, { ...first.cursor, seenRows: ["invalid"] },
    { ...first.cursor, pageIndex: -1 }, { ...first.cursor, next: "https://evil.invalid" }]) {
    await rejects(() => collect({ ...input, cursor }, { fetchImpl: forbidden }, options), "INVALID_CURSOR");
  }
  await rejects(() => collect({ ...input, context: { ...context, dateTo: "2026-09-08" }, cursor: first.cursor },
    { fetchImpl: forbidden }, options), "INVALID_CURSOR");
  assert.equal(unexpectedFetch, 0);
  await rejects(() => collect({ ...input, cursor: { ...first.cursor, after: accessToken,
    seenCursors: [metaHash(accessToken)] } }, { fetchImpl: forbidden }, options), "INVALID_CURSOR");
  for (const invalid of [{ maxPages: 0 }, { maxRetries: 4 }, { maxRecords: 0 },
    { requestTimeoutMs: 0 }, { maxResponseBytes: 127 }]) {
    await rejects(() => collect(input, { fetchImpl: forbidden }, { ...options, ...invalid }), "INVALID_INPUT");
  }
  assert.equal(unexpectedFetch, 0);
  const endpoint = `https://graph.facebook.com/v26.0/act_${context.externalAccountId}/insights`;
  const next = (after: string) => ({ data: [], paging: { cursors: { after }, next: endpoint + "?after=" + after } });
  await rejects(() => collect({ ...input, cursor: first.cursor }, { fetchImpl: pageFetch(next("fixture-page-2")) }, options), "PAGINATION_LOOP");
  await rejects(() => collect({ ...input, cursor: second.cursor }, { fetchImpl: pageFetch(next("fixture-page-2")) }, options), "PAGINATION_LOOP");
  await rejects(() => collect(input, { fetchImpl: pageFetch(fixture.pages[0]) }, { ...options, maxPages: 1 }), "PAGE_LIMIT_EXCEEDED");
  await rejects(() => collect(input, { fetchImpl: pageFetch(fixture.pages[0]) }, { ...options, maxRecords: 2 }), "ROW_LIMIT_EXCEEDED");
  await rejects(() => collect({ ...input, cursor: first.cursor }, { fetchImpl: pageFetch({ data: [fixture.pages[0].data[1]] }) }, options), "DUPLICATE_AD_DAY");
  const noNext = await collect(input, { fetchImpl: pageFetch({ data: [] }) }, options);
  assert.equal(noNext.isComplete, true); assert.equal(noNext.canonicalRows, 0); cases++;
  const invalidPage = structuredClone(fixture.pages[2]);
  delete invalidPage.data[0].actions;
  const unchanged = JSON.stringify(second.cursor);
  await rejects(() => collect({ ...input, cursor: second.cursor }, { fetchImpl: pageFetch(invalidPage) }, options), "UNRESOLVED_METRIC_POLICY");
  assert.equal(JSON.stringify(second.cursor), unchanged);
  const resumed = await collect({ ...input, cursor: second.cursor }, { fetchImpl: pageFetch(fixture.pages[2]) }, options);
  assert.deepEqual(resumed, third); cases++;
  let retries = 0; const delays: number[] = []; const retryUrls: string[] = [];
  const retryFetch: typeof fetch = async (url) => {
    retryUrls.push(String(url)); retries++;
    if (retries === 1) return json({ message: accessToken }, 429, { "retry-after": "2" });
    if (retries === 2) return json({}, 503);
    return json(fixture.pages[0]);
  };
  const recovered = await collect(input, { fetchImpl: retryFetch, sleepImpl: async (ms) => { delays.push(ms); } }, { ...options, maxRetries: 2 });
  assert.equal(recovered.requestCount, 3); assert.equal(recovered.retryCount, 2);
  assert.deepEqual(delays, [2000, 2000]); assert.equal(new Set(retryUrls).size, 1);
  assert.deepEqual(recovered.cursor, first.cursor); cases++;
  const capped: number[] = []; let count = 0;
  await collect(input, { fetchImpl: async () => ++count === 1 ? json({}, 429, { "retry-after": "999999" }) : json({ data: [] }),
    sleepImpl: async (ms) => { capped.push(ms); } }, { ...options, maxRetries: 1 });
  assert.deepEqual(capped, [30000]); cases++;
  const dated: number[] = []; count = 0;
  await collect(input, { fetchImpl: async () => ++count === 1 ? json({}, 429, { "retry-after": "Wed, 01 Jan 2025 00:00:03 GMT" }) : json({ data: [] }),
    nowImpl: () => Date.parse("2025-01-01T00:00:00Z"), sleepImpl: async (ms) => { dated.push(ms); } }, { ...options, maxRetries: 1 });
  assert.deepEqual(dated, [3000]); cases++;
  count = 0;
  await rejects(() => collect(input, { fetchImpl: async () => { count++; return json({ message: accessToken }, 503); }, sleepImpl: async () => {} },
    { ...options, maxRetries: 2 }), "RETRY_EXHAUSTED"); assert.equal(count, 3);
  for (const status of [400, 401, 403, 404, 302]) {
    count = 0;
    await rejects(() => collect(input, { fetchImpl: async () => { count++; return json({ message: accessToken }, status); } }, options), "API_HTTP_ERROR");
    assert.equal(count, 1);
  }
  count = 0;
  await rejects(() => collect(input, { fetchImpl: async () => { count++; return json(fixture.errors.auth); } }, { ...options, maxRetries: 3 }), "API_ERROR");
  assert.equal(count, 1);
  count = 0;
  const transient = await collect(input, { fetchImpl: async () => ++count === 1 ? json(fixture.errors.transient) : json({ data: [] }),
    sleepImpl: async () => {} }, { ...options, maxRetries: 1 });
  assert.equal(transient.retryCount, 1); cases++;
  await rejects(() => collect(input, { fetchImpl: async () => { throw new Error(accessToken); } }, options), "RETRY_EXHAUSTED");
  await rejects(() => collect(input, { fetchImpl: async () => json({}, 503), sleepImpl: async () => { throw new Error(accessToken); } },
    { ...options, maxRetries: 1 }), "REQUEST_FAILED");
  await rejects(() => collect(input, { fetchImpl: async () => new Response("not-json:" + accessToken) }, options), "INVALID_RESPONSE");
  await rejects(() => collect(input, { fetchImpl: async () => new Response(new Uint8Array([0xff])) }, options), "INVALID_RESPONSE");
  await rejects(() => collect(input, { fetchImpl: async () => {
    const response = json({ data: [] }); Object.defineProperty(response, "redirected", { value: true }); return response;
  } }, options), "INVALID_RESPONSE");
  await rejects(() => collect(input, { fetchImpl: async () => {
    const response = json({ data: [] }); Object.defineProperty(response, "url", { value: "https://evil.invalid/" }); return response;
  } }, options), "SCOPE_MISMATCH");
  await rejects(() => collect(input, { fetchImpl: async () => new Response("{}", { headers: { "content-length": "99999" } }) },
    { ...options, maxResponseBytes: 128 }), "RESPONSE_TOO_LARGE");
  await rejects(() => collect(input, { fetchImpl: async () => new Response("x".repeat(129)) }, { ...options, maxResponseBytes: 128 }), "RESPONSE_TOO_LARGE");
  let signal: AbortSignal | null | undefined;
  await rejects(() => collect(input, { fetchImpl: async (_url, init) => { signal = init?.signal; return new Promise<Response>(() => {}); } },
    { ...options, requestTimeoutMs: 5 }), "RETRY_EXHAUSTED"); assert.equal(signal?.aborted, true);
  let cancelled = false;
  await rejects(() => collect(input, { fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) },
    { ...options, requestTimeoutMs: 5 }), "RETRY_EXHAUSTED"); assert.equal(cancelled, true);
  await rejects(() => collect(input, { fetchImpl: pageFetch(next(accessToken)) }, options), "INVALID_RESPONSE");
  assert.equal(networkAttempts, 0);
  assert.equal(globalThis.fetch, deny);
  console.log(`META_AD_DAILY_COLLECTOR=PASS CASES=${cases}`);
  console.log("FETCH=MOCK_ONLY CURSOR_SCOPE_AND_DUPLICATES=PASS NETWORK_CALLS=0 DB_EXECUTIONS=0");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

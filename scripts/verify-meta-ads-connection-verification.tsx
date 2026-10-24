import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaAdsVerificationRecord } from "../src/lib/media-sync/meta-ads-connection-verification";

// Synthetic credentials only; no environment files, real API or database access.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 71).toString("base64");
let unexpectedFetches = 0;
globalThis.fetch = async () => { unexpectedFetches++; throw new Error("NETWORK_FORBIDDEN"); };

async function main() {
  const { handleMetaAdsConnectionVerification: verify } = await import("../src/lib/media-sync/meta-ads-connection-verification");
  const { createMetaAdsVerificationStore } = await import("../src/lib/media-sync/meta-ads-verification-repository");
  const { encryptMetaAdsCredentials } = await import("../src/lib/media-sync/meta-ads-credentials");
  const { MediaConnectionAccessError } = await import("../src/lib/media-sync/media-connection-access");
  const { getMediaProviderSyncCapability } = await import("../src/lib/media-sync/media-provider-sync-capabilities");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Card } = await import("../app/report-builder/MetaAdsConnectionCard");
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const advertiserId = "10000000-0000-4000-8000-000000000002";
  const connectionId = "10000000-0000-4000-8000-000000000003";
  const userId = "10000000-0000-4000-8000-000000000004";
  const externalAccountId = "12345678901234567890";
  const token = "SYNTHETIC_META_VERIFICATION_SECRET";
  const access = { workspaceId, advertiserId, userId, canManageConnections: true, accessScope: "workspace" as const };
  const credentialContext = { connectionId, workspaceId, advertiserId, provider: "meta_ads" as const, externalAccountId };
  const record: MetaAdsVerificationRecord = { id: connectionId, workspace_id: workspaceId,
    advertiser_id: advertiserId, provider: "meta_ads", external_account_id: externalAccountId,
    credential_ciphertext: encryptMetaAdsCredentials({ version: 1, access_token: token }, credentialContext),
    credential_version: 1, status: "active", connected_at: null, updated_at: "2026-10-01T00:00:00Z" };
  const metadata = { id: `act_${externalAccountId}`, account_id: externalAccountId, currency: "KRW", timezone_name: "Asia/Seoul" };
  const url = `https://fixture.invalid/api/advertisers/${advertiserId}/media-connections/meta-ads/${connectionId}/verify`;
  const request = (body: unknown = { expectedWorkspaceId: workspaceId }, headers: Record<string, string> = {}) => new Request(url, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://fixture.invalid", ...headers }, body: JSON.stringify(body),
  });
  let reads = 0, calls = 0, writes = 0, cases = 0;
  type Deps = Parameters<typeof verify>[3];
  const deps: Deps = {
    resolveAccess: async scope => { assert.equal(scope.action, "manage_connections"); return access; },
    load: async scope => { reads++; assert.deepEqual(scope, { connectionId, workspaceId, advertiserId }); return { ...record }; },
    fetchImpl: async (input, init) => {
      calls++;
      assert.equal(String(input), `https://graph.facebook.com/v26.0/act_${externalAccountId}?fields=id%2Caccount_id%2Ccurrency%2Ctimezone_name`);
      assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
      return Response.json(metadata);
    },
    markVerified: async (value, at) => { writes++; assert.equal(value.updated_at, record.updated_at);
      assert.equal(value.id, connectionId); assert.ok(Number.isFinite(Date.parse(at))); return true; },
  };
  async function run(req: Request, status: number, overrides: Partial<Deps> = {}, expectedCalls = 0, expectedWrites = 0) {
    const beforeCalls = calls, beforeWrites = writes;
    const res = await verify(req, advertiserId, connectionId, { ...deps, ...overrides });
    const raw = await res.text();
    assert.equal(res.status, status, raw); assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(raw.includes(token), false); assert.equal(raw.includes(record.credential_ciphertext!), false);
    assert.equal(raw.includes("credential_ciphertext"), false);
    assert.equal(calls - beforeCalls, expectedCalls); assert.equal(writes - beforeWrites, expectedWrites);
    cases++; return JSON.parse(raw);
  }
  const result = await run(request(), 200, {}, 1, 1);
  assert.equal(result.verification, "ACCOUNT_ACCESS_CONFIRMED"); assert.equal(result.sync_enabled, false);
  assert.equal(result.connection.id, connectionId); assert.deepEqual(result.account, { currency: "KRW", timezone_name: "Asia/Seoul" });
  for (const status of [401, 403, 404, 500]) {
    const beforeReads = reads;
    await run(request(), status === 404 ? 403 : status, { resolveAccess: async () => {
      throw new MediaConnectionAccessError("UNAUTHORIZED", status, token);
    } });
    assert.equal(reads, beforeReads);
  }
  await run(request(), 403, { resolveAccess: async () => ({ ...access, canManageConnections: false }) });
  await run(request(), 403, { resolveAccess: async () => ({ ...access, accessScope: "own_created" }) });
  await run(request(), 409, { resolveAccess: async () => ({ ...access, advertiserId: userId }) });
  await run(request({ expectedWorkspaceId: userId }), 409);
  await run(request(undefined, { Origin: "https://other.invalid" }), 403);
  await run(request(undefined, { "Sec-Fetch-Site": "cross-site" }), 403);
  await run(request(undefined, { "Content-Type": "text/plain" }), 400);
  for (const body of [null, [], {}, { expectedWorkspaceId: "invalid" }, { expectedWorkspaceId: workspaceId, accessToken: token },
    { expectedWorkspaceId: workspaceId, padding: "a".repeat(2048) }]) await run(request(body), 400);
  await run(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), 400);
  await run(request(), 404, { load: async () => null });
  for (const change of [{ provider: "naver_searchad" as const }, { advertiser_id: userId }, { workspace_id: userId },
    { id: userId }, { status: "disconnected" as const }, { credential_ciphertext: null }, { credential_version: 2 }, { updated_at: "bad" }]) {
    await run(request(), 409, { load: async () => ({ ...record, ...change }) });
  }
  await run(request(), 422, { load: async () => ({ ...record, credential_ciphertext: "invalid" }) });
  const responseWith = (body: unknown, status = 200): typeof fetch => async () => { calls++; return Response.json(body, { status }); };
  for (const body of [{ ...metadata, account_id: "99" }, { ...metadata, timezone_name: "invalid/zone" }, { error: { message: token } }]) {
    await run(request(), 502, { fetchImpl: responseWith(body) }, 1);
  }
  for (const status of [400, 401, 403, 500]) await run(request(), 502, { fetchImpl: responseWith({ error: { message: token } }, status) }, 1);
  await run(request(), 502, { fetchImpl: async () => { calls++; throw new Error(token); } }, 1);
  await run(request(), 409, { markVerified: async () => { writes++; return false; } }, 1, 1);
  await run(request(), 500, { markVerified: async () => { writes++; throw new Error(token); } }, 1, 1);

  // Exercise the real repository with a query recorder: only the scoped Meta row
  // can be written, and a stale snapshot cannot be accepted as verification.
  let query: { filters: Record<string, unknown>; update?: Record<string, unknown>; selected?: string } = { filters: {} };
  let returnRow: unknown = { ...record };
  const chain = {
    select(value: string) { query.selected = value; return chain; },
    eq(key: string, value: unknown) { query.filters[key] = value; return chain; },
    update(value: Record<string, unknown>) { query.update = value; return chain; },
    async maybeSingle() { return { data: returnRow, error: null }; },
  };
  const db = { from(table: string) { assert.equal(table, "media_connections"); query = { filters: {} }; return chain; } };
  const store = createMetaAdsVerificationStore(db as unknown as SupabaseClient);
  await store.load({ connectionId, workspaceId, advertiserId });
  assert.deepEqual(query.filters, { id: connectionId, workspace_id: workspaceId, advertiser_id: advertiserId, provider: "meta_ads" });
  const at = "2026-10-24T04:30:00.000Z";
  returnRow = { id: connectionId, last_verified_at: "2026-10-24T04:30:00+00:00" };
  assert.equal(await store.markVerified(record, at), true);
  assert.deepEqual(query.filters, { id: connectionId, workspace_id: workspaceId, advertiser_id: advertiserId,
    provider: "meta_ads", external_account_id: externalAccountId, status: "active", credential_version: 1, updated_at: record.updated_at });
  assert.deepEqual(Object.keys(query.update!).sort(), ["connected_at", "last_error", "last_verified_at", "updated_at"]);
  assert.equal(JSON.stringify(query).includes(record.credential_ciphertext!), false);
  returnRow = null;
  assert.equal(await store.markVerified(record, at), false); cases += 3;
  const props = { workspaceId, advertiserId, loading: false, resolved: true, error: "", canManage: true,
    getAccessToken: async () => null, onRefresh() {}, connections: [{ id: connectionId, workspace_id: workspaceId,
      advertiser_id: advertiserId, provider: "meta_ads" as const, external_account_id: externalAccountId,
      external_account_name: "Fixture", status: "active" as const, has_credentials: true, last_verified_at: null }] };
  assert.ok(renderToStaticMarkup(createElement(Card, props)).includes(">인증 확인</button>"));
  assert.equal(renderToStaticMarkup(createElement(Card, { ...props, canManage: false })).includes(">인증 확인</button>"), false);
  assert.equal(renderToStaticMarkup(createElement(Card, { ...props, connections: [] })).includes(">인증 확인</button>"), false); cases += 3;
  assert.equal(getMediaProviderSyncCapability("meta_ads").syncRuntimeEnabled, false);
  assert.deepEqual(getMediaProviderSyncCapability("meta_ads").allowedDataLevels, []);
  assert.equal(unexpectedFetches, 0);
  console.log(`META_CONNECTION_VERIFICATION: ${cases} cases PASS; LIVE_API=0; LIVE_DB=0; META_SYNC=DISABLED`);
}
main().catch(error => { console.error("META_CONNECTION_VERIFICATION: FAIL", error); process.exitCode = 1; });

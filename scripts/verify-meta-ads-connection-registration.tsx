import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type { MediaConnectionRecord } from "../src/lib/media-sync/types";

let cases = 0;
async function fixture() {
  let networkAttempts = 0;
  const deny = () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
  globalThis.fetch = deny;
  for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
    [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
    [dgram.Socket.prototype, ["send", "connect"]]] as const) {
    for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
  }
  syncBuiltinESMExports();
  const registration = await import("../src/lib/media-sync/meta-ads-connection-registration");
  const { handleMetaAdsConnectionPost: post } = await import("../src/lib/media-sync/meta-ads-connection-route");
  const { MediaConnectionAccessError } = await import("../src/lib/media-sync/media-connection-access");
  const { resolveMediaConnectionPermissions } = await import("../src/lib/media-sync/media-connection-access-policy");
  const { decryptMetaAdsCredentials } = await import("../src/lib/media-sync/meta-ads-credentials");
  const { getMetaAdsConnectionView: view, metaAdsConnectionErrorMessage } = await import("../src/lib/media-sync/meta-ads-connection-view");
  const { default: Card } = await import("../app/report-builder/MetaAdsConnectionCard");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const token = "SYNTHETIC_META_REGISTRATION_SECRET";
  const workspaceId = "10000000-0000-4000-8000-000000000001";
  const advertiserId = "10000000-0000-4000-8000-000000000002";
  const access = { userId: "10000000-0000-4000-8000-000000000003", workspaceId, advertiserId,
    canManageConnections: true, accessScope: "workspace" as const };
  const body = { expectedWorkspaceId: workspaceId, externalAccountId: "12345678901234567890",
    externalAccountName: "Synthetic account", credentials: { version: 1, access_token: token } };
  const input = { advertiserId, access, body };
  const url = `https://fixture.invalid/api/advertisers/${advertiserId}/media-connections/meta-ads`;
  const request = (value: unknown = body, headers: Record<string, string> = {}) => new Request(url, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://fixture.invalid", ...headers }, body: JSON.stringify(value),
  });
  const records: MediaConnectionRecord[] = [];
  const insert = async (record: MediaConnectionRecord) => {
    records.push(structuredClone(record));
    return { data: structuredClone(record), error: null };
  };
  const deps: Parameters<typeof post>[2] = { resolveAccess: async (scope) => {
    assert.equal(scope.advertiserId, advertiserId); assert.equal(scope.action, "manage_connections"); return access;
  }, insert };
  const response = await post(request(), advertiserId, deps);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  const record = records[0];
  assert.equal(result.verification, "NOT_PERFORMED"); assert.equal(result.sync_enabled, false);
  assert.equal(record.last_verified_at, null); assert.equal(record.connected_at, null);
  assert.equal(record.last_sync_at, null); assert.equal(record.created_by, access.userId);
  assert.deepEqual(record.meta, { sourceOwnership: "api", dataLevel: "creative" });
  assert.equal(result.connection.has_credentials, true);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(JSON.stringify(result).includes(record.credential_ciphertext!), false);
  assert.equal(Object.hasOwn(result.connection, "credential_ciphertext"), false);
  cases++;
  const context = { connectionId: record.id, workspaceId, advertiserId, provider: "meta_ads" as const,
    externalAccountId: body.externalAccountId };
  assert.deepEqual(decryptMetaAdsCredentials(record.credential_ciphertext!, context), body.credentials); cases++;
  for (const key of ["connectionId", "workspaceId", "advertiserId", "externalAccountId"] as const) {
    assert.throws(() => decryptMetaAdsCredentials(record.credential_ciphertext!, { ...context, [key]: "9" })); cases++;
  }
  async function rejected(req: Request, expected: number, overrides: Partial<typeof deps> = {}, id = advertiserId) {
    const writes = records.length;
    const res = await post(req, id, { ...deps, ...overrides });
    assert.equal(res.status, expected);
    const serialized = await res.text();
    assert.equal(serialized.includes(token), false); assert.equal(serialized.includes("credential_ciphertext"), false);
    assert.equal(records.length, writes); assert.equal(res.headers.get("cache-control"), "no-store"); cases++;
    return JSON.parse(serialized);
  }
  // Denied authentication/authorization must run before parsing or encryption/storage.
  for (const status of [401, 403, 404, 500]) {
    await rejected(request(), status === 404 ? 403 : status, { resolveAccess: async () => {
      throw new MediaConnectionAccessError("UNAUTHORIZED", status, token, { cause: { access_token: token } });
    } });
  }
  for (const role of ["master", "director", "admin", "staff", "client"] as const) {
    for (const isOwnAdvertiser of [true, false]) {
      const permissions = resolveMediaConnectionPermissions({ role, isOwnAdvertiser, isTrueMaster: false });
      if (!permissions.canManageConnections) {
        await rejected(request(), 403, { resolveAccess: async () => ({ ...access, ...permissions }) });
      }
    }
  }
  await rejected(request(), 403, { resolveAccess: async () => ({ ...access, accessScope: "own_created" }) });
  await rejected(request(), 409, { resolveAccess: async () => ({ ...access, advertiserId: "another" }) });
  await rejected(request(), 409, { resolveAccess: async () => ({ ...access, workspaceId: "another" }) });
  await rejected(request({ ...body, expectedWorkspaceId: "another" }), 409);
  for (const key of ["workspaceId", "advertiserId", "createdBy", "provider", "status", "last_verified_at", "meta", "connectionId"]) {
    await rejected(request({ ...body, [key]: token }), 400);
  }
  for (const externalAccountId of ["act_123", "001", " 123", "123 ", 123, "1e3", "x", "9".repeat(31), null]) {
    await rejected(request({ ...body, externalAccountId }), 400);
  }
  for (const credentials of [null, {}, { version: 2, access_token: token }, { version: 1, access_token: " " },
    { version: 1, access_token: "x".repeat(20001) }, { ...body.credentials, refresh_token: token }]) {
    await rejected(request({ ...body, credentials }), 400);
  }
  await rejected(request({ ...body, externalAccountName: "x".repeat(501) }), 400);
  await rejected(request({ ...body, externalAccountName: "line\nbreak" }), 400);
  await rejected(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), 400);
  await rejected(request(body, { "Content-Type": "text/plain" }), 400);
  await rejected(request({ ...body, externalAccountName: "x".repeat(32769) }), 400);
  await rejected(request(body, { Origin: "https://evil.invalid" }), 403);
  await rejected(request(body, { "Sec-Fetch-Site": "cross-site" }), 403);
  await rejected(request(), 400, {}, " bad ");
  await rejected(request(), 500, { resolveAccess: async () => { throw new Error(token); } });
  const duplicate = await rejected(request(), 409, { insert: async () => ({ data: null, error: { code: "23505", details: token } }) });
  assert.equal(duplicate.error, "ALREADY_EXISTS");
  await rejected(request(), 500, { insert: async () => ({ data: null, error: { message: token } }) });
  await rejected(request(), 500, { insert: async () => { throw new Error(token); } });
  await rejected(request(), 500, { insert: async () => ({ data: null, error: null }) });
  for (const key of ["id", "workspace_id", "advertiser_id", "provider", "external_account_id", "status", "last_verified_at"]) {
    await rejected(request(), 500, { insert: async record => ({ data: { ...record, [key]: "wrong" }, error: null }) });
  }
  const encryptionKey = process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
  assert.equal((await rejected(request(), 500)).error, "ENCRYPTION_FAILED");
  process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = encryptionKey;
  // The mock store enforces the existing natural-key uniqueness; no overwrite or retry-upsert.
  let existing: MediaConnectionRecord | null = null;
  const uniqueInsert = async (row: MediaConnectionRecord) => {
    if (existing) return { data: null, error: { code: "23505" } };
    existing = structuredClone(row); return { data: structuredClone(row), error: null };
  };
  const pair = await Promise.all([post(request(), advertiserId, { ...deps, insert: uniqueInsert }),
    post(request(), advertiserId, { ...deps, insert: uniqueInsert })]);
  assert.deepEqual(pair.map(r => r.status).sort(), [201, 409]); cases++;
  let getterCalls = 0;
  const badBody = { ...body, get credentials() { getterCalls++; return body.credentials; } };
  assert.throws(() => registration.prepareMetaAdsConnectionRegistration(advertiserId, access, badBody));
  assert.equal(getterCalls, 0); cases++;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { assert.throws(() => registration.prepareMetaAdsConnectionRegistration(advertiserId, access, body)); cases++; }
  finally { Reflect.deleteProperty(globalThis, "window"); }
  assert.deepEqual(input.body, body);

  const props = { workspaceId, advertiserId, connections: [] as typeof result.connection[], loading: false,
    resolved: true, error: "", canManage: true, getAccessToken: async () => "synthetic-session", onRefresh: () => {} };
  const states = [
    [{}, "○ 미연결"],
    [{ loading: true }, "조회 중"],
    [{ resolved: false }, "조회 중"],
    [{ error: "read failed" }, "확인 불가"],
    [{ connections: [result.connection] }, "인증 확인 필요"],
    [{ connections: [{ ...result.connection, has_credentials: false }] }, "자격증명 필요"],
    [{ connections: [{ ...result.connection, last_verified_at: "bad" }] }, "인증 확인 필요"],
    [{ connections: [{ ...result.connection, last_verified_at: "2026-09-20T00:00:00Z" }] }, "● 연결됨"],
    [{ connections: [{ ...result.connection, status: "disconnected" }] }, "○ 미연결"],
    [{ connections: [{ ...result.connection, status: "error" }] }, "오류"],
    [{ connections: [result.connection, { ...result.connection, id: "other" }] }, "확인 필요"],
    [{ connections: [{ ...result.connection, workspace_id: "other" }] }, "확인 불가"],
    [{ connections: [{ ...result.connection, advertiser_id: "other" }] }, "확인 불가"],
    [{ connections: [{ ...result.connection, provider: "naver_searchad" }] }, "확인 불가"],
  ] as const;
  for (const [change, label] of states) {
    const state = { ...props, ...change };
    assert.equal(view(state).label, label);
    const markup = renderToStaticMarkup(createElement(Card, state));
    assert.ok(markup.includes(label)); assert.equal(markup.includes(token), false);
    assert.ok(markup.includes("광고 데이터 동기화는 아직 활성화하지 않았습니다."));
    if (!view(state).ready) assert.equal(markup.includes("Meta 계정 등록"), false);
    cases++;
  }
  const readonlyMarkup = renderToStaticMarkup(createElement(Card, { ...props, canManage: false }));
  assert.equal(readonlyMarkup.includes("Meta 계정 등록"), false); assert.ok(readonlyMarkup.includes("조회 권한만 있습니다.")); cases++;
  assert.equal(metaAdsConnectionErrorMessage(token).includes(token), false); cases++;
  const capabilities = await import("../src/lib/media-sync/media-provider-sync-capabilities");
  assert.equal(capabilities.getMediaProviderSyncCapability("meta_ads").syncRuntimeEnabled, false); cases++;
  assert.equal(networkAttempts, 0);
  console.log(`META_CONNECTION_REGISTRATION=PASS CASES=${cases} NETWORK_ATTEMPTS=0 DB_EXECUTIONS=0`);
  console.log("MOCK_INSERT_ONLY REAL_TOKEN_STORAGE=0 META_API_CALLS=0 SYNC_RUNTIME=DISABLED");
}

if (process.argv.includes("--fixture-child")) {
  fixture().catch(error => { console.error(`META_CONNECTION_FIXTURE_FAILED AFTER_CASE=${cases}`, error); process.exitCode = 1; });
} else {
  const child = spawnSync(process.execPath, ["--import", "tsx", process.argv[1], "--fixture-child"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "https://meta-fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key",
      MEDIA_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 37).toString("base64") },
    encoding: "utf8", timeout: 30000,
  });
  process.stdout.write(child.stdout ?? ""); process.stderr.write(child.stderr ?? "");
  process.exitCode = child.status === 0 ? 0 : 1;
}

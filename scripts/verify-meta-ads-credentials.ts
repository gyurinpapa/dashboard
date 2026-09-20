import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type { MetaAdsCredentialContext } from "../src/lib/media-sync/meta-ads-credentials";

let cases = 0, networkAttempts = 0;
async function fixture() {
  // This branch is launched below with an explicit replacement environment.
  assert.equal(process.env.META_CREDENTIAL_FIXTURE, "1");
  const deny = () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
  globalThis.fetch = deny;
  for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
    [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
    [dgram.Socket.prototype, ["send", "connect"]]] as const) {
    for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
  }
  syncBuiltinESMExports();
  const m = await import("../src/lib/media-sync/meta-ads-credentials");
  const crypto = await import("../src/lib/media-sync/crypto");
  const c: MetaAdsCredentialContext = { connectionId: "fixture-connection", workspaceId: "fixture-workspace",
    advertiserId: "fixture-advertiser", provider: "meta_ads", externalAccountId: "12345678901234567890" };
  const token = "SYNTHETIC_META_SECRET_SENTINEL", value = { version: 1, access_token: token };
  const fixtureKey = Buffer.alloc(32, 37).toString("base64");
  assert.equal(process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY, fixtureKey);
  function reject(fn: () => unknown, code?: string) {
    assert.throws(fn, (error: unknown) => {
      assert.ok(error instanceof m.MetaAdsCredentialError);
      if (code) assert.equal(error.code, code);
      assert.equal(error.cause, undefined);
      for (const secret of [token, fixtureKey]) {
        assert.equal(String(error.stack).includes(secret), false);
        assert.equal(JSON.stringify(error).includes(secret), false);
      }
      return true;
    }); cases++;
  }
  const original = structuredClone({ c, value });
  const encrypted = m.encryptMetaAdsCredentials(value, c), again = m.encryptMetaAdsCredentials(value, c);
  assert.notEqual(encrypted, again); assert.ok(encrypted.startsWith("v1.")); cases++;
  assert.deepEqual(m.decryptMetaAdsCredentials(encrypted, c), value); cases++;
  assert.equal(encrypted.includes(token), false); cases++;
  assert.deepEqual({ c, value }, original); cases++;
  assert.deepEqual(m.toSafeMetaAdsCredentialInfo(value, c), { provider: "meta_ads", credentialVersion: 1,
    externalAccountId: c.externalAccountId, hasAccessToken: true });
  assert.equal(JSON.stringify(m.toSafeMetaAdsCredentialInfo(value, c)).includes(token), false); cases++;
  assert.ok(Object.isFrozen(m.validateMetaAdsCredentials(value))); cases++;
  for (const key of ["connectionId", "workspaceId", "advertiserId", "externalAccountId"] as const) {
    reject(() => m.decryptMetaAdsCredentials(encrypted, { ...c, [key]: key === "externalAccountId" ? "9" : "different" }), "DECRYPTION_FAILED");
  }
  for (const provider of ["google_ads", "naver_searchad", "", null]) {
    reject(() => m.buildMetaAdsCredentialAad({ ...c, provider } as MetaAdsCredentialContext), "UNSUPPORTED_PROVIDER");
  }
  for (const id of ["", "  account", "account ", "act_123", "0123", 123, "1e3", "1".repeat(31), "a", null]) {
    reject(() => m.buildMetaAdsCredentialAad({ ...c, externalAccountId: id } as MetaAdsCredentialContext), "INVALID_CONTEXT");
  }
  for (const key of ["connectionId", "workspaceId", "advertiserId"]) {
    for (const id of ["", "leading ", "\n", "a".repeat(201), null]) {
      reject(() => m.buildMetaAdsCredentialAad({ ...c, [key]: id }), "INVALID_CONTEXT");
    }
  }
  for (const bad of [null, [], {}, { ...value, version: 2 }, { ...value, version: "1" },
    { ...value, refresh_token: token }, { ...value, auth_type: "system_user" },
    ...["", " ", " padded", "line\nbreak", "t\0k", "한글", "x".repeat(20001), null, 42].map(access_token => ({ version: 1, access_token }))]) {
    reject(() => m.validateMetaAdsCredentials(bad), "INVALID_CREDENTIALS");
  }
  let getterCalls = 0;
  const getter = { version: 1, get access_token() { getterCalls++; return token; } };
  reject(() => m.validateMetaAdsCredentials(getter), "INVALID_CREDENTIALS"); assert.equal(getterCalls, 0);
  reject(() => m.validateMetaAdsCredentials(Object.assign(Object.create({ inherited: true }), value)), "INVALID_CREDENTIALS");
  reject(() => m.validateMetaAdsCredentials({ ...value, [Symbol("extra")]: token }), "INVALID_CREDENTIALS");
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error(token); } });
  reject(() => m.validateMetaAdsCredentials(hostile), "INVALID_CREDENTIALS");
  assert.equal(m.decryptMetaAdsCredentials(m.encryptMetaAdsCredentials({ version: 1, access_token: "x".repeat(20000) }, c), c).access_token.length, 20000); cases++;
  const segments = encrypted.split(".");
  for (const index of [1, 2, 3]) {
    const changed = [...segments], bytes = Buffer.from(changed[index], "base64url");
    bytes[0] ^= 1; changed[index] = bytes.toString("base64url");
    reject(() => m.decryptMetaAdsCredentials(changed.join("."), c), "DECRYPTION_FAILED");
  }
  for (const text of ["", "bad", "v2." + segments.slice(1).join("."), encrypted.slice(0, -5), "x".repeat(65537)]) {
    reject(() => m.decryptMetaAdsCredentials(text, c), "DECRYPTION_FAILED");
  }
  const malformed = crypto.encryptMediaCredentialJson({ version: 99, access_token: token }, m.buildMetaAdsCredentialAad(c));
  reject(() => m.decryptMetaAdsCredentials(malformed, c), "DECRYPTION_FAILED");
  for (const key of [undefined, "invalid", Buffer.alloc(32, 38).toString("base64")]) {
    if (key === undefined) delete process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = key;
    reject(() => m.decryptMetaAdsCredentials(encrypted, c), "DECRYPTION_FAILED");
    if (key === undefined || key === "invalid") reject(() => m.encryptMetaAdsCredentials(value, c), "ENCRYPTION_FAILED");
  }
  process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = fixtureKey;
  const aad1 = m.buildMetaAdsCredentialAad({ ...c, connectionId: "a:b", workspaceId: "c" });
  const aad2 = m.buildMetaAdsCredentialAad({ ...c, connectionId: "a", workspaceId: "b:c" });
  assert.notEqual(aad1, aad2); cases++;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    for (const fn of [() => m.validateMetaAdsCredentials(value), () => m.buildMetaAdsCredentialAad(c),
      () => m.encryptMetaAdsCredentials(value, c), () => m.decryptMetaAdsCredentials(encrypted, c),
      () => m.toSafeMetaAdsCredentialInfo(value, c)]) reject(fn, "SERVER_ONLY");
  } finally { Reflect.deleteProperty(globalThis, "window"); }
  // Shared cipher compatibility and provider namespace isolation, synthetic only.
  const google = await import("../src/lib/media-sync/google-ads-credentials");
  const gc = { ...c, provider: "google_ads" as const, externalAccountId: "1234567890" };
  const gv = { version: 1 as const, auth_type: "oauth_user" as const, refresh_token: "synthetic-google", login_customer_id: null };
  const ge = google.encryptGoogleAdsCredentials(gv, gc);
  assert.deepEqual(google.decryptGoogleAdsCredentials(ge, gc), gv); cases++;
  reject(() => m.decryptMetaAdsCredentials(ge, { ...c, externalAccountId: gc.externalAccountId }), "DECRYPTION_FAILED");
  const naver = await import("../src/lib/media-sync/connection-credentials");
  const nc = { ...c, provider: "naver_searchad" as const, externalAccountId: "12345" };
  const nv = { customerId: "12345", accessLicense: "synthetic-license", secretKey: "synthetic-secret" };
  const ne = naver.encryptNaverSearchAdsCredentials(nv, nc);
  assert.deepEqual(naver.decryptNaverSearchAdsCredentials(ne, nc), nv); cases++;
  reject(() => m.decryptMetaAdsCredentials(ne, { ...c, externalAccountId: nc.externalAccountId }), "DECRYPTION_FAILED");
  assert.equal(networkAttempts, 0);
  console.log(`META_CREDENTIAL_CONTRACT=PASS CASES=${cases} NETWORK_ATTEMPTS=0 DB_EXECUTIONS=0`);
  console.log("KEY_SOURCE=SYNTHETIC_CHILD_ENV LEGACY_CODEC_ROUNDTRIPS=PASS LIVE_TOKEN_VALIDATION=NOT_RUN");
}
if (process.argv.includes("--fixture-child")) {
  fixture().catch(() => { console.error(`META_CREDENTIAL_FIXTURE_FAILED AFTER_CASE=${cases}`); process.exitCode = 1; });
} else {
  // No inherited key, database variables, .env loading or NODE_OPTIONS.
  const result = spawnSync(process.execPath, ["--import", "tsx", process.argv[1], "--fixture-child"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test", META_CREDENTIAL_FIXTURE: "1",
      MEDIA_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 37).toString("base64") },
    encoding: "utf8", timeout: 30000,
  });
  process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  process.exitCode = result.status === 0 ? 0 : 1;
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const directory = mkdtempSync(join(tmpdir(), "google-token-diagnostic-"));
const preload = join(directory, "fixture.mjs");
const credentialsModule = pathToFileURL(resolve("src/lib/media-sync/google-ads-credentials.ts")).href;
const secret = "fixture-diagnostic-client-secret";
const refresh = "fixture-diagnostic-refresh-token";
const access = "fixture-diagnostic-access-token";

try {
  writeFileSync(preload, `
import assert from "node:assert/strict";
import { encryptGoogleAdsCredentials } from ${JSON.stringify(credentialsModule)};
const [workspaceId, advertiserId, connectionId] = ${JSON.stringify(ids)};
const mode = process.env.DIAGNOSTIC_FIXTURE;
let reads = 0, refreshes = 0, violations = 0;
const connection = {
  id: connectionId, workspace_id: workspaceId, advertiser_id: advertiserId,
  provider: "google_ads", external_account_id: "1234567890", status: "active", credential_version: 1,
  credential_ciphertext: encryptGoogleAdsCredentials({version: 1, auth_type: "oauth_user", refresh_token: ${JSON.stringify(refresh)}, login_customer_id: null},
    { connectionId, workspaceId, advertiserId, provider: "google_ads", externalAccountId: "1234567890" }),
};
if (mode === "wrong_scope") connection.workspace_id = "different-workspace";
if (mode === "inactive") connection.status = "disabled";
if (mode === "bad_ciphertext") connection.credential_ciphertext = "invalid-ciphertext";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin === "https://diagnostic.supabase.invalid" && init?.method === "GET" && url.pathname === "/rest/v1/media_connections") {
    reads++;
    assert.equal(url.searchParams.get("id"), "eq." + connectionId);
    assert.equal(url.searchParams.get("workspace_id"), "eq." + workspaceId);
    assert.equal(url.searchParams.get("advertiser_id"), "eq." + advertiserId);
    assert.equal(url.searchParams.get("provider"), "eq.google_ads");
    return new Response(JSON.stringify([connection]), { headers: { "Content-Type": "application/json" } });
  }
  if (url.href === "https://oauth2.googleapis.com/token" && init?.method === "POST") {
    refreshes++;
    assert.equal(refreshes, 1);
    assert.equal(init.body.get("refresh_token"), ${JSON.stringify(refresh)});
    assert.equal(init.body.get("client_secret"), ${JSON.stringify(secret)});
    const body = mode === "ok" ? {access_token: ${JSON.stringify(access)}, token_type: "Bearer", expires_in: 3600}
      : {error: mode, error_description: ${JSON.stringify(secret + refresh)}};
    return new Response(JSON.stringify(body), { status: mode === "ok" ? 200 : mode === "invalid_client" ? 401 : 400 });
  }
  violations++;
  throw new Error("Unexpected network or mutation blocked");
};
process.on("exit", () => console.error(JSON.stringify({ fixture_audit: true, reads, refreshes, violations })));
`);

  const cases = [
    { mode: "ok", result: "TOKEN_REFRESH_OK", requests: 1 },
    { mode: "invalid_grant", result: "TOKEN_REFRESH_FAILED", requests: 1 },
    { mode: "invalid_client", result: "TOKEN_REFRESH_FAILED", requests: 1 },
    { mode: "wrong_scope", result: "CONNECTION_NOT_ELIGIBLE", requests: 0 },
    { mode: "inactive", result: "CONNECTION_NOT_ELIGIBLE", requests: 0 },
    { mode: "bad_ciphertext", result: "DIAGNOSTIC_PREREQUISITE_FAILED", requests: 0 },
    { mode: "missing_config", result: "DIAGNOSTIC_PREREQUISITE_FAILED", requests: 0 },
    { mode: "invalid_arguments", result: "INVALID_ARGUMENTS", requests: 0 },
  ];
  for (const fixture of cases) {
    const child = spawnSync(process.execPath, [
      "--import", "tsx", "--import", preload,
      "scripts/diagnose-google-ads-token-refresh.ts",
      ...(fixture.mode === "invalid_arguments" ? [] : ids),
    ], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "https://diagnostic.supabase.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key",
        MEDIA_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
        GOOGLE_ADS_OAUTH_CLIENT_ID: "fixture.apps.googleusercontent.com",
        GOOGLE_ADS_OAUTH_CLIENT_SECRET: fixture.mode === "missing_config" ? "" : secret,
        GOOGLE_ADS_DEVELOPER_TOKEN: "fixture-developer-token",
        GOOGLE_ADS_OAUTH_REDIRECT_URI: "https://diagnostic.invalid/callback",
        DIAGNOSTIC_FIXTURE: fixture.mode,
      },
    });
    assert.equal(child.error, undefined);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.result, fixture.result, fixture.mode);
    assert.equal(result.token_requests, fixture.requests);
    assert.equal(result.db_writes, 0);
    assert.equal(result.ads_api_calls, 0);
    assert.equal(child.status, fixture.mode === "ok" ? 0 : fixture.mode === "invalid_arguments" ? 2 : 1);
    const audit = JSON.parse(child.stderr.trim().split("\n").at(-1)!);
    assert.equal(audit.violations, 0);
    assert.equal(audit.refreshes, fixture.requests);
    assert.equal(audit.reads, fixture.mode === "invalid_arguments" ? 0 : 1);
    if (fixture.mode.startsWith("invalid_") && fixture.mode !== "invalid_arguments") {
      assert.equal(result.oauth_error, fixture.mode);
      assert.equal(result.http_status, fixture.mode === "invalid_client" ? 401 : 400);
    }
    for (const credential of [secret, refresh, access, "fixture-service-role-key"]) {
      assert.equal((child.stdout + child.stderr).includes(credential), false, "credential output must remain absent");
    }
  }
  console.log("GOOGLE_ADS_TOKEN_DIAGNOSTIC=PASS (8 mocked command runs)");
  console.log("LIVE_NETWORK_CALLS=0 DB_WRITES=0 ADS_API_CALLS=0");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

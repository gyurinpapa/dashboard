import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getGoogleAdsSafeFailureDiagnostic as diagnose } from "../src/lib/media-sync/google-ads-safe-failure-diagnostic";
import { GoogleAdsAccessTokenRefreshError, refreshGoogleAdsAccessToken } from "../src/lib/media-sync/google-ads-access-token-refresh";
import { GoogleAdsSearchAdStatsCollectorError } from "../src/lib/media-sync/google-ads-search-ad-stats-collector";
import { MediaSyncStagingRepositoryError } from "../src/lib/media-sync/media-sync-staging-repository";

const secret = "DO_NOT_PERSIST_ACCESS_TOKEN_OR_RESPONSE";
const unknown = { category: "unknown", reason: null, http_status: null };
async function main() {
  const token = new GoogleAdsAccessTokenRefreshError("TOKEN_HTTP_ERROR", secret, { status: 400 });
  assert.deepEqual(diagnose(token), { category: "token_refresh", reason: "TOKEN_HTTP_ERROR", http_status: 400 });
  assert.deepEqual(diagnose(new Error(secret, { cause: token })), diagnose(token));
  assert.ok(!JSON.stringify(diagnose(token)).includes(secret));
  console.log("PASS token HTTP error and wrapped cause classified without message or invalid_grant inference");

  const api = new GoogleAdsSearchAdStatsCollectorError("API_HTTP_ERROR", secret, { status: 429 });
  assert.deepEqual(diagnose(api), { category: "ads_api", reason: "API_HTTP_ERROR", http_status: 429 });
  const database = new MediaSyncStagingRepositoryError("DATABASE_ERROR", secret, { cause: new Error(secret) });
  assert.deepEqual(diagnose(database), { category: "database", reason: "DATABASE_ERROR", http_status: null });
  console.log("PASS actual API and staging DB error classes remain distinguishable");

  const names = ["Keyword", "SearchAd", "DemandGenAd", "DisplayAd", "ShoppingAd", "PerformanceMaxAssetGroup", "YoutubeAd"];
  for (const name of names) {
    assert.equal(diagnose(Object.assign(new Error(secret), { name: `GoogleAds${name}StatsCollectorError`, code: "API_HTTP_ERROR", status: 503 })).category, "ads_api");
  }
  for (const code of [secret, "invalid_grant", "AUTH_FAILED"]) {
    assert.deepEqual(diagnose({ name: token.name, code, status: 400, message: secret }), unknown);
  }
  for (const status of [NaN, Infinity, 400.5, 600, "400", secret]) {
    assert.equal(diagnose({ name: token.name, code: token.code, status }).http_status, null);
  }
  console.log("PASS collector allowlist, unknown codes and invalid status sanitization");

  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  assert.deepEqual(diagnose(cycle), unknown);
  let nested: unknown = token;
  for (let i = 0; i < 8; i++) nested = new Error(secret, { cause: nested });
  assert.deepEqual(diagnose(nested), unknown);
  let getterCalls = 0;
  assert.deepEqual(diagnose(Object.defineProperty({}, "name", { get() { getterCalls++; throw Error(secret); } })), unknown);
  assert.equal(getterCalls, 0);
  assert.deepEqual(diagnose(new Proxy({}, { getOwnPropertyDescriptor() { throw Error(secret); } })), unknown);
  console.log("PASS cycles, depth limit, getters and diagnostic extraction failures are bounded");

  let requests = 0;
  try {
    await refreshGoogleAdsAccessToken({ config: { clientId: "test-client", clientSecret: secret }, refreshToken: secret }, async () => {
      requests++;
      return new Response(JSON.stringify({ error: "invalid_grant", error_description: secret }), { status: 400 });
    });
    assert.fail("Expected token failure");
  } catch (error) {
    assert.deepEqual(diagnose(error), { category: "token_refresh", reason: "TOKEN_HTTP_ERROR", http_status: 400 });
  }
  assert.equal(requests, 1);
  console.log("PASS real refresh function with synthetic HTTP 400: one request, no body capture or retry");

  const repository = readFileSync(new URL("../src/lib/media-sync/google-ads-media-sync-worker-orchestration-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /diagnostic:\s*getGoogleAdsSafeFailureDiagnostic\(input.error\)/);
  console.log("PASS persistence hook present (static); live persistence NOT tested");
  console.log("PASS_SAFE_FAILURE_DIAGNOSTIC; live_db=0; live_google_api=0; token_requests=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

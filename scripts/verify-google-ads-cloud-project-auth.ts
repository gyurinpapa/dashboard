import assert from "node:assert/strict";
import { readGoogleAdsOAuthConfig } from "../src/lib/media-sync/google-ads-oauth-config";
import { buildGoogleAdsAccountVerificationRequest } from "../src/lib/media-sync/google-ads-account-verification";
import { buildGoogleAdsAccountInventorySearchRequest } from "../src/lib/media-sync/google-ads-account-inventory";
import { buildGoogleAdsKeywordStatsSearchRequest } from "../src/lib/media-sync/google-ads-keyword-stats-collector";
import { buildGoogleAdsDisplayAdStatsSearchRequest } from "../src/lib/media-sync/google-ads-display-ad-stats-collector";
import { buildGoogleAdsSearchAdStatsSearchRequest } from "../src/lib/media-sync/google-ads-search-ad-stats-collector";
import { buildGoogleAdsDemandGenAdStatsSearchRequest } from "../src/lib/media-sync/google-ads-demand-gen-ad-stats-collector";
import { buildGoogleAdsShoppingAdStatsSearchRequest } from "../src/lib/media-sync/google-ads-shopping-ad-stats-collector";
import { buildGoogleAdsYoutubeAdStatsSearchRequest } from "../src/lib/media-sync/google-ads-youtube-ad-stats-collector";
import { buildGoogleAdsPerformanceMaxAssetGroupStatsSearchRequest } from "../src/lib/media-sync/google-ads-performance-max-asset-group-stats-collector";

const env = {
  GOOGLE_ADS_OAUTH_CLIENT_ID: "fixture.apps.googleusercontent.com",
  GOOGLE_ADS_OAUTH_CLIENT_SECRET: "fixture-secret",
  GOOGLE_ADS_OAUTH_REDIRECT_URI: "https://oauth-review.etrylue.com/api/media-connections/google-ads/oauth/callback",
};
const config = readGoogleAdsOAuthConfig(env);
assert.equal(config.developerToken, "");
for (const key of Object.keys(env)) {
  assert.throws(() => readGoogleAdsOAuthConfig({ ...env, [key]: undefined }));
}
assert.equal(readGoogleAdsOAuthConfig({ ...env, GOOGLE_ADS_DEVELOPER_TOKEN: "legacy-token" }).developerToken, "legacy-token");

const input = {
  accessToken: "fixture-access-token",
  developerToken: config.developerToken,
  targetCustomerId: "381-339-6758",
  loginCustomerId: "930-429-2762",
  startDate: "2026-11-08",
  endDate: "2026-11-08",
};
const builders = [buildGoogleAdsAccountVerificationRequest,
buildGoogleAdsAccountInventorySearchRequest,
buildGoogleAdsKeywordStatsSearchRequest,
buildGoogleAdsDisplayAdStatsSearchRequest,
buildGoogleAdsSearchAdStatsSearchRequest,
buildGoogleAdsDemandGenAdStatsSearchRequest,
buildGoogleAdsShoppingAdStatsSearchRequest,
buildGoogleAdsYoutubeAdStatsSearchRequest,
buildGoogleAdsPerformanceMaxAssetGroupStatsSearchRequest];
for (const build of builders) {
  const request = build(input);
  assert.equal(request.headers.Authorization, "Bearer fixture-access-token");
  assert.equal(request.headers["login-customer-id"], "9304292762");
  assert.equal(Object.hasOwn(request.headers, "developer-token"), false);
  assert.deepEqual(build({ ...input, developerToken: "legacy-token" }), request);
  assert.throws(() => build({ ...input, accessToken: "" }));
  assert.throws(() => build({ ...input, targetCustomerId: "invalid" }));
}
console.log("GOOGLE_ADS_CLOUD_PROJECT_AUTH=PASS (9 request builders; missing/legacy developer token; required OAuth credentials, bearer and customer checks)");
console.log("LIVE_GOOGLE_API_CALLS=0");

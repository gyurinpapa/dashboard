// Run only in the worker's existing server environment:
// node --import tsx scripts/diagnose-google-ads-token-refresh.ts <workspace-id> <advertiser-id> <connection-id>
// SELECT one scoped connection, refresh once, discard the access token.
// No job claim/retry, advertising API call, connection update, or DB write.
import { decryptGoogleAdsCredentials, GOOGLE_ADS_CREDENTIAL_VERSION } from "../src/lib/media-sync/google-ads-credentials";
import { readGoogleAdsOAuthConfig } from "../src/lib/media-sync/google-ads-oauth-config";
import { GoogleAdsAccessTokenRefreshError, refreshGoogleAdsAccessToken } from "../src/lib/media-sync/google-ads-access-token-refresh";

let stage = "arguments";
let tokenRequests = 0;

function report(result: Record<string, string | number | null>) {
  console.log(JSON.stringify({ ...result, stage, token_requests: tokenRequests, ads_api_calls: 0, db_writes: 0 }));
}

async function main() {
  const args = process.argv.slice(2);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (args.length !== 3 || args.some(value => !uuid.test(value))) {
    report({ result: "INVALID_ARGUMENTS", usage: "<workspace-id> <advertiser-id> <connection-id>" });
    process.exitCode = 2;
    return;
  }
  const [workspaceId, advertiserId, connectionId] = args;
  stage = "load_connection";
  const { getSupabaseAdmin } = await import("../src/lib/supabase/admin");
  const { data: connection, error } = await getSupabaseAdmin()
    .from("media_connections")
    .select("id,workspace_id,advertiser_id,provider,external_account_id,status,credential_version,credential_ciphertext")
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .eq("provider", "google_ads")
    .maybeSingle();

  if (error || !connection || connection.id !== connectionId ||
      connection.workspace_id !== workspaceId || connection.advertiser_id !== advertiserId ||
      connection.provider !== "google_ads" || connection.status !== "active" ||
      connection.credential_version !== GOOGLE_ADS_CREDENTIAL_VERSION) {
    report({ result: "CONNECTION_NOT_ELIGIBLE" });
    process.exitCode = 1;
    return;
  }

  stage = "decrypt_credentials";
  const credentials = decryptGoogleAdsCredentials(connection.credential_ciphertext, {
    connectionId, workspaceId, advertiserId,
    provider: "google_ads", externalAccountId: connection.external_account_id,
  });
  stage = "read_oauth_config";
  const config = readGoogleAdsOAuthConfig();
  stage = "refresh_token";
  try {
    await refreshGoogleAdsAccessToken(
      { config, refreshToken: credentials.refresh_token },
      async (input, init) => {
        tokenRequests++;
        return fetch(input, init);
      },
    );
    report({ result: "TOKEN_REFRESH_OK" });
  } catch (error) {
    if (!(error instanceof GoogleAdsAccessTokenRefreshError)) throw error;
    report({ result: "TOKEN_REFRESH_FAILED", code: error.code, http_status: error.status, oauth_error: error.oauthError });
    process.exitCode = 1;
  }
}

main().catch(() => {
  // Do not print arbitrary errors, causes, credentials, or HTTP bodies.
  report({ result: "DIAGNOSTIC_PREREQUISITE_FAILED" });
  process.exitCode = 1;
});

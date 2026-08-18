import assert from "node:assert/strict";

import {
  GOOGLE_ADS_OAUTH_SCOPE,
} from "../src/lib/media-sync/google-ads-oauth-config";
import {
  GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
  decryptGoogleAdsOAuthTransaction,
} from "../src/lib/media-sync/google-ads-oauth-transaction";
import {
  GoogleAdsOAuthStartError,
  parseGoogleAdsOAuthStartRequest,
  prepareGoogleAdsOAuthStart,
} from "../src/lib/media-sync/google-ads-oauth-start";

const TEST_NOW_MS =
  Date.parse("2026-08-18T14:00:00.000Z");

const TEST_ENV = {
  GOOGLE_ADS_DEVELOPER_TOKEN:
    "test-developer-token",
  GOOGLE_ADS_OAUTH_CLIENT_ID:
    "test-client.apps.googleusercontent.com",
  GOOGLE_ADS_OAUTH_CLIENT_SECRET:
    "test-client-secret",
  GOOGLE_ADS_OAUTH_REDIRECT_URI:
    "https://app.etrylue.com/api/media-connections/google-ads/oauth/callback",
} as const;

const TEST_ACCESS = {
  userId: "user-1",
  workspaceId: "workspace-1",
  advertiserId: "advertiser-1",
  canManageConnections: true,
} as const;

function expectStartError(
  fn: () => unknown,
  code: GoogleAdsOAuthStartError["code"],
): void {
  assert.throws(
    fn,
    (error) =>
      error instanceof GoogleAdsOAuthStartError &&
      error.code === code,
  );
}

function test(
  name: string,
  fn: () => void,
): void {
  fn();
  console.log(`PASS: ${name}`);
}

async function main(): Promise<void> {
  const originalEncryptionKey =
    process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;

  process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
    Buffer.alloc(32, 9).toString("base64");

  let passed = 0;

  try {
    test(
      "OAuth start request accepts only advertiser/customer context and normalizes Google customer IDs",
      () => {
        const parsed =
          parseGoogleAdsOAuthStartRequest({
            advertiserId: " advertiser-1 ",
            targetCustomerId:
              "123-456-7890",
            loginCustomerId:
              "987-654-3210",
          });

        assert.deepEqual(parsed, {
          advertiserId: "advertiser-1",
          targetCustomerId:
            "1234567890",
          loginCustomerId:
            "9876543210",
        });

        expectStartError(
          () =>
            parseGoogleAdsOAuthStartRequest({
              advertiserId:
                "advertiser-1",
              targetCustomerId:
                "1234567890",
              loginCustomerId: null,
              workspaceId:
                "must-not-be-accepted",
            }),
          "INVALID_INPUT",
        );
      },
    );
    passed += 1;

    test(
      "Prepared OAuth start binds encrypted transaction to authenticated user/workspace/advertiser context",
      () => {
        const prepared =
          prepareGoogleAdsOAuthStart(
            {
              request: {
                advertiserId:
                  "advertiser-1",
                targetCustomerId:
                  "1234567890",
                loginCustomerId:
                  "9876543210",
              },
              access: TEST_ACCESS,
            },
            TEST_ENV,
            TEST_NOW_MS,
          );

        const transaction =
          decryptGoogleAdsOAuthTransaction(
            prepared.cookie.value,
            TEST_NOW_MS + 1,
          );

        assert.equal(
          transaction.user_id,
          TEST_ACCESS.userId,
        );
        assert.equal(
          transaction.workspace_id,
          TEST_ACCESS.workspaceId,
        );
        assert.equal(
          transaction.advertiser_id,
          TEST_ACCESS.advertiserId,
        );
        assert.equal(
          transaction.target_customer_id,
          "1234567890",
        );
        assert.equal(
          transaction.login_customer_id,
          "9876543210",
        );
      },
    );
    passed += 1;

    test(
      "Authorization URL requests offline Google Ads access with PKCE state and forced consent",
      () => {
        const prepared =
          prepareGoogleAdsOAuthStart(
            {
              request: {
                advertiserId:
                  "advertiser-1",
                targetCustomerId:
                  "1234567890",
                loginCustomerId: null,
              },
              access: TEST_ACCESS,
            },
            TEST_ENV,
            TEST_NOW_MS,
          );

        const url =
          new URL(prepared.authorizationUrl);

        assert.equal(
          url.origin + url.pathname,
          "https://accounts.google.com/o/oauth2/v2/auth",
        );
        assert.equal(
          url.searchParams.get("client_id"),
          TEST_ENV.GOOGLE_ADS_OAUTH_CLIENT_ID,
        );
        assert.equal(
          url.searchParams.get("redirect_uri"),
          TEST_ENV.GOOGLE_ADS_OAUTH_REDIRECT_URI,
        );
        assert.equal(
          url.searchParams.get("response_type"),
          "code",
        );
        assert.equal(
          url.searchParams.get("scope"),
          GOOGLE_ADS_OAUTH_SCOPE,
        );
        assert.equal(
          url.searchParams.get("access_type"),
          "offline",
        );
        assert.equal(
          url.searchParams.get("prompt"),
          "consent",
        );
        assert.equal(
          url.searchParams.get(
            "code_challenge_method",
          ),
          "S256",
        );

        assert.ok(
          url.searchParams.get("state"),
        );
        assert.ok(
          url.searchParams.get(
            "code_challenge",
          ),
        );
      },
    );
    passed += 1;

    test(
      "OAuth transaction cookie is HttpOnly, callback-scoped, SameSite=Lax, secure on HTTPS, and encrypted",
      () => {
        const prepared =
          prepareGoogleAdsOAuthStart(
            {
              request: {
                advertiserId:
                  "advertiser-1",
                targetCustomerId:
                  "1234567890",
                loginCustomerId: null,
              },
              access: TEST_ACCESS,
            },
            TEST_ENV,
            TEST_NOW_MS,
          );

        assert.equal(
          prepared.cookie.name,
          GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
        );
        assert.equal(
          prepared.cookie.options.httpOnly,
          true,
        );
        assert.equal(
          prepared.cookie.options.sameSite,
          "lax",
        );
        assert.equal(
          prepared.cookie.options.secure,
          true,
        );
        assert.equal(
          prepared.cookie.options.path,
          "/api/media-connections/google-ads/oauth/callback",
        );
        assert.equal(
          prepared.cookie.options.maxAge,
          600,
        );

        assert.equal(
          prepared.cookie.value.includes(
            "1234567890",
          ),
          false,
        );
        assert.equal(
          prepared.cookie.value.includes(
            "advertiser-1",
          ),
          false,
        );
      },
    );
    passed += 1;

    test(
      "Loopback OAuth redirect produces a non-secure development cookie without weakening production policy",
      () => {
        const prepared =
          prepareGoogleAdsOAuthStart(
            {
              request: {
                advertiserId:
                  "advertiser-1",
                targetCustomerId:
                  "1234567890",
                loginCustomerId: null,
              },
              access: TEST_ACCESS,
            },
            {
              ...TEST_ENV,
              GOOGLE_ADS_OAUTH_REDIRECT_URI:
                "http://localhost:3000/api/media-connections/google-ads/oauth/callback",
            },
            TEST_NOW_MS,
          );

        assert.equal(
          prepared.cookie.options.secure,
          false,
        );
      },
    );
    passed += 1;

    test(
      "Advertiser scope mismatch fails closed before OAuth transaction creation",
      () => {
        expectStartError(
          () =>
            prepareGoogleAdsOAuthStart(
              {
                request: {
                  advertiserId:
                    "advertiser-2",
                  targetCustomerId:
                    "1234567890",
                  loginCustomerId: null,
                },
                access: TEST_ACCESS,
              },
              TEST_ENV,
              TEST_NOW_MS,
            ),
          "ADVERTISER_SCOPE_MISMATCH",
        );
      },
    );
    passed += 1;

    test(
      "Connection-management denial fails closed before OAuth transaction creation",
      () => {
        expectStartError(
          () =>
            prepareGoogleAdsOAuthStart(
              {
                request: {
                  advertiserId:
                    "advertiser-1",
                  targetCustomerId:
                    "1234567890",
                  loginCustomerId: null,
                },
                access: {
                  ...TEST_ACCESS,
                  canManageConnections:
                    false,
                },
              },
              TEST_ENV,
              TEST_NOW_MS,
            ),
          "ACCESS_DENIED",
        );
      },
    );
    passed += 1;

    test(
      "Missing Google OAuth configuration fails closed without exposing configuration values",
      () => {
        expectStartError(
          () =>
            prepareGoogleAdsOAuthStart(
              {
                request: {
                  advertiserId:
                    "advertiser-1",
                  targetCustomerId:
                    "1234567890",
                  loginCustomerId: null,
                },
                access: TEST_ACCESS,
              },
              {},
              TEST_NOW_MS,
            ),
          "CONFIGURATION_ERROR",
        );
      },
    );
    passed += 1;
  } finally {
    if (originalEncryptionKey === undefined) {
      delete process.env
        .MEDIA_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
        originalEncryptionKey;
    }
  }

  console.log(`fixture result: ${passed}/8`);
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});

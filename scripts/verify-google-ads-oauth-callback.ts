import assert from "node:assert/strict";

import {
  GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
  GOOGLE_ADS_CREDENTIAL_VERSION,
} from "../src/lib/media-sync/google-ads-credentials";
import {
  createGoogleAdsConnectionVerificationResult,
} from "../src/lib/media-sync/google-ads-connection-verification";
import {
  GoogleAdsOAuthCallbackFlowError,
  assertGoogleAdsOAuthCallbackAccess,
  buildGoogleAdsOAuthCallbackReturnUrl,
  completeGoogleAdsOAuthCallback,
  getGoogleAdsOAuthTransactionClearCookieOptions,
} from "../src/lib/media-sync/google-ads-oauth-callback";
import type {
  GoogleAdsOAuthConfig,
} from "../src/lib/media-sync/google-ads-oauth-config";
import {
  createGoogleAdsOAuthTransaction,
} from "../src/lib/media-sync/google-ads-oauth-transaction";
import type {
  GoogleAdsOAuthCallbackResult,
  GoogleAdsOAuthTokenSet,
} from "../src/lib/media-sync/google-ads-oauth";

const NOW_MS =
  Date.parse("2026-08-18T14:20:00.000Z");

const CONFIG: GoogleAdsOAuthConfig = {
  developerToken: "developer-token",
  clientId:
    "client.apps.googleusercontent.com",
  clientSecret: "client-secret",
  redirectUri:
    "https://etrylue.com/api/media-connections/google-ads/oauth/callback",
};

const ACCESS = {
  userId: "user-1",
  workspaceId: "workspace-1",
  advertiserId: "advertiser-1",
  canManageConnections: true,
} as const;

function transaction(
  loginCustomerId: string | null = null,
) {
  return createGoogleAdsOAuthTransaction(
    {
      userId: ACCESS.userId,
      workspaceId: ACCESS.workspaceId,
      advertiserId:
        ACCESS.advertiserId,
      targetCustomerId:
        "1234567890",
      loginCustomerId,
    },
    NOW_MS,
  );
}

function callback(): GoogleAdsOAuthCallbackResult {
  return {
    code: "authorization-code",
    state: "fixture-state",
  };
}

function tokenSet(): GoogleAdsOAuthTokenSet {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 3600,
    tokenType: "Bearer",
    scopes: [
      "https://www.googleapis.com/auth/adwords",
    ],
  };
}

function expectFlowError(
  fn: () => unknown,
  code:
    GoogleAdsOAuthCallbackFlowError["code"],
) {
  assert.throws(
    fn,
    (error) =>
      error instanceof
        GoogleAdsOAuthCallbackFlowError &&
      error.code === code,
  );
}

async function expectFlowErrorAsync(
  fn: () => Promise<unknown>,
  code:
    GoogleAdsOAuthCallbackFlowError["code"],
) {
  await assert.rejects(
    fn,
    (error) =>
      error instanceof
        GoogleAdsOAuthCallbackFlowError &&
      error.code === code,
  );
}

function test(
  name: string,
  fn: () => void,
) {
  fn();
  console.log(`PASS: ${name}`);
}

async function testAsync(
  name: string,
  fn: () => Promise<void>,
) {
  await fn();
  console.log(`PASS: ${name}`);
}

async function main() {
  let passed = 0;

  test(
    "callback access must exactly match initiating user/workspace/advertiser",
    () => {
      const tx = transaction();

      assert.deepEqual(
        assertGoogleAdsOAuthCallbackAccess(
          tx,
          ACCESS,
        ),
        ACCESS,
      );

      expectFlowError(
        () =>
          assertGoogleAdsOAuthCallbackAccess(
            tx,
            {
              ...ACCESS,
              userId: "user-2",
            },
          ),
        "ACCESS_CONTEXT_MISMATCH",
      );

      expectFlowError(
        () =>
          assertGoogleAdsOAuthCallbackAccess(
            tx,
            {
              ...ACCESS,
              workspaceId:
                "workspace-2",
            },
          ),
        "ACCESS_CONTEXT_MISMATCH",
      );

      expectFlowError(
        () =>
          assertGoogleAdsOAuthCallbackAccess(
            tx,
            {
              ...ACCESS,
              advertiserId:
                "advertiser-2",
            },
          ),
        "ACCESS_CONTEXT_MISMATCH",
      );
    },
  );
  passed += 1;

  test(
    "current manage permission denial fails closed",
    () => {
      expectFlowError(
        () =>
          assertGoogleAdsOAuthCallbackAccess(
            transaction(),
            {
              ...ACCESS,
              canManageConnections:
                false,
            },
          ),
        "ACCESS_DENIED",
      );
    },
  );
  passed += 1;

  await testAsync(
    "successful callback exchanges token, verifies exact customer, then persists verified connection",
    async () => {
      const calls: string[] = [];
      let persistenceInput:
        | Record<string, unknown>
        | null = null;

      const result =
        await completeGoogleAdsOAuthCallback(
          {
            config: CONFIG,
            transaction: transaction(),
            callback: callback(),
            access: ACCESS,
          },
          {
            async exchangeAuthorizationCode(
              input,
            ) {
              calls.push("exchange");

              assert.equal(
                input.code,
                "authorization-code",
              );
              assert.equal(
                input.config,
                CONFIG,
              );
              assert.ok(
                input.codeVerifier.length >= 43,
              );

              return tokenSet();
            },

            async verifyAccountAccess(input) {
              calls.push("verify");

              assert.equal(
                input.accessToken,
                "access-token",
              );
              assert.equal(
                input.developerToken,
                CONFIG.developerToken,
              );
              assert.equal(
                input.targetCustomerId,
                "1234567890",
              );
              assert.equal(
                input.loginCustomerId,
                null,
              );

              return {
                verification:
                  createGoogleAdsConnectionVerificationResult(
                    {
                      targetCustomerId:
                        "1234567890",
                      loginCustomerId:
                        null,
                    },
                    NOW_MS,
                  ),
                externalAccountName:
                  "Fixture Customer",
              };
            },

            async persistVerifiedConnection(
              input,
            ) {
              calls.push("persist");

              persistenceInput =
                input as unknown as
                  Record<string, unknown>;

              return {
                id: "connection-1",
              };
            },
          },
          NOW_MS,
        );

      assert.deepEqual(
        calls,
        ["exchange", "verify", "persist"],
      );

      assert.deepEqual(result, {
        advertiserId:
          "advertiser-1",
        connectionId:
          "connection-1",
      });

      assert.ok(persistenceInput);

      const serialized =
        JSON.stringify(persistenceInput);

      assert.equal(
        serialized.includes(
          "access-token",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "developer-token",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "client-secret",
        ),
        false,
      );

      const credentials =
        (
          persistenceInput as {
            credentials: {
              version: number;
              auth_type: string;
              refresh_token: string;
              login_customer_id:
                string | null;
            };
          }
        ).credentials;

      assert.deepEqual(credentials, {
        version:
          GOOGLE_ADS_CREDENTIAL_VERSION,
        auth_type:
          GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
        refresh_token:
          "refresh-token",
        login_customer_id: null,
      });
    },
  );
  passed += 1;

  await testAsync(
    "manager login customer is propagated coherently to verification and stored credential context",
    async () => {
      let verifiedLogin:
        unknown = undefined;
      let persistedLogin:
        unknown = undefined;

      await completeGoogleAdsOAuthCallback(
        {
          config: CONFIG,
          transaction:
            transaction("9876543210"),
          callback: callback(),
          access: ACCESS,
        },
        {
          async exchangeAuthorizationCode() {
            return tokenSet();
          },

          async verifyAccountAccess(input) {
            verifiedLogin =
              input.loginCustomerId;

            return {
              verification:
                createGoogleAdsConnectionVerificationResult(
                  {
                    targetCustomerId:
                      "1234567890",
                    loginCustomerId:
                      "9876543210",
                  },
                  NOW_MS,
                ),
              externalAccountName: null,
            };
          },

          async persistVerifiedConnection(
            input,
          ) {
            persistedLogin =
              input.credentials
                .login_customer_id;

            return {
              id: "connection-2",
            };
          },
        },
        NOW_MS,
      );

      assert.equal(
        verifiedLogin,
        "9876543210",
      );
      assert.equal(
        persistedLogin,
        "9876543210",
      );
    },
  );
  passed += 1;

  await testAsync(
    "verification target mismatch fails before persistence",
    async () => {
      let persistCalls = 0;

      await expectFlowErrorAsync(
        () =>
          completeGoogleAdsOAuthCallback(
            {
              config: CONFIG,
              transaction: transaction(),
              callback: callback(),
              access: ACCESS,
            },
            {
              async exchangeAuthorizationCode() {
                return tokenSet();
              },

              async verifyAccountAccess() {
                return {
                  verification:
                    createGoogleAdsConnectionVerificationResult(
                      {
                        targetCustomerId:
                          "1111111111",
                        loginCustomerId:
                          null,
                      },
                      NOW_MS,
                    ),
                  externalAccountName:
                    null,
                };
              },

              async persistVerifiedConnection() {
                persistCalls += 1;
                return {
                  id: "should-not-exist",
                };
              },
            },
            NOW_MS,
          ),
        "VERIFICATION_SCOPE_MISMATCH",
      );

      assert.equal(
        persistCalls,
        0,
      );
    },
  );
  passed += 1;

  await testAsync(
    "verification login-customer mismatch fails before persistence",
    async () => {
      let persistCalls = 0;

      await expectFlowErrorAsync(
        () =>
          completeGoogleAdsOAuthCallback(
            {
              config: CONFIG,
              transaction:
                transaction("9876543210"),
              callback: callback(),
              access: ACCESS,
            },
            {
              async exchangeAuthorizationCode() {
                return tokenSet();
              },

              async verifyAccountAccess() {
                return {
                  verification:
                    createGoogleAdsConnectionVerificationResult(
                      {
                        targetCustomerId:
                          "1234567890",
                        loginCustomerId:
                          null,
                      },
                      NOW_MS,
                    ),
                  externalAccountName:
                    null,
                };
              },

              async persistVerifiedConnection() {
                persistCalls += 1;
                return {
                  id: "should-not-exist",
                };
              },
            },
            NOW_MS,
          ),
        "VERIFICATION_SCOPE_MISMATCH",
      );

      assert.equal(
        persistCalls,
        0,
      );
    },
  );
  passed += 1;

  await testAsync(
    "access mismatch prevents token exchange, verification, and persistence",
    async () => {
      let calls = 0;

      await expectFlowErrorAsync(
        () =>
          completeGoogleAdsOAuthCallback(
            {
              config: CONFIG,
              transaction: transaction(),
              callback: callback(),
              access: {
                ...ACCESS,
                userId: "user-2",
              },
            },
            {
              async exchangeAuthorizationCode() {
                calls += 1;
                return tokenSet();
              },

              async verifyAccountAccess() {
                calls += 1;
                throw new Error(
                  "must not run",
                );
              },

              async persistVerifiedConnection() {
                calls += 1;
                return {
                  id: "must-not-run",
                };
              },
            },
            NOW_MS,
          ),
        "ACCESS_CONTEXT_MISMATCH",
      );

      assert.equal(calls, 0);
    },
  );
  passed += 1;

  await testAsync(
    "token exchange failure prevents verification and persistence",
    async () => {
      let verifyCalls = 0;
      let persistCalls = 0;

      await assert.rejects(
        () =>
          completeGoogleAdsOAuthCallback(
            {
              config: CONFIG,
              transaction: transaction(),
              callback: callback(),
              access: ACCESS,
            },
            {
              async exchangeAuthorizationCode() {
                throw new Error(
                  "fixture token failure",
                );
              },

              async verifyAccountAccess() {
                verifyCalls += 1;
                throw new Error(
                  "must not run",
                );
              },

              async persistVerifiedConnection() {
                persistCalls += 1;
                return {
                  id: "must-not-run",
                };
              },
            },
            NOW_MS,
          ),
      );

      assert.equal(
        verifyCalls,
        0,
      );
      assert.equal(
        persistCalls,
        0,
      );
    },
  );
  passed += 1;

  await testAsync(
    "verification failure prevents persistence",
    async () => {
      let persistCalls = 0;

      await assert.rejects(
        () =>
          completeGoogleAdsOAuthCallback(
            {
              config: CONFIG,
              transaction: transaction(),
              callback: callback(),
              access: ACCESS,
            },
            {
              async exchangeAuthorizationCode() {
                return tokenSet();
              },

              async verifyAccountAccess() {
                throw new Error(
                  "fixture verification failure",
                );
              },

              async persistVerifiedConnection() {
                persistCalls += 1;
                return {
                  id: "must-not-run",
                };
              },
            },
            NOW_MS,
          ),
      );

      assert.equal(
        persistCalls,
        0,
      );
    },
  );
  passed += 1;

  test(
    "callback return URL is fixed to same-origin report-builder and contains only safe outcome context",
    () => {
      const success =
        new URL(
          buildGoogleAdsOAuthCallbackReturnUrl(
            "https://etrylue.com/api/media-connections/google-ads/oauth/callback?code=secret-code",
            {
              outcome: "success",
              workspaceId:
                "workspace-return-1",
              advertiserId:
                "advertiser-1",
              connectionId:
                "connection-1",
            },
          ),
        );

      assert.equal(
        success.origin,
        "https://etrylue.com",
      );
      assert.equal(
        success.pathname,
        "/report-builder",
      );
      assert.equal(
        success.searchParams.get(
          "google_ads_oauth",
        ),
        "success",
      );
      assert.equal(
        success.searchParams.get(
          "workspace_id",
        ),
        "workspace-return-1",
      );
      assert.equal(
        success.searchParams.get(
          "advertiser_id",
        ),
        "advertiser-1",
      );
      assert.equal(
        success.searchParams.get(
          "connection_id",
        ),
        "connection-1",
      );
      assert.equal(
        success.toString().includes(
          "secret-code",
        ),
        false,
      );

      const failure =
        new URL(
          buildGoogleAdsOAuthCallbackReturnUrl(
            "http://localhost:3000/api/media-connections/google-ads/oauth/callback",
            {
              outcome: "error",
              errorCode:
                "TOKEN_REQUEST_FAILED",
            },
          ),
        );

      assert.equal(
        failure.origin,
        "http://localhost:3000",
      );
      assert.equal(
        failure.pathname,
        "/report-builder",
      );
      assert.equal(
        failure.searchParams.get(
          "google_ads_oauth",
        ),
        "error",
      );
      assert.equal(
        failure.searchParams.get(
          "workspace_id",
        ),
        null,
      );
      assert.equal(
        failure.searchParams.get(
          "error",
        ),
        "TOKEN_REQUEST_FAILED",
      );
    },
  );
  passed += 1;

  test(
    "transaction clear-cookie policy preserves callback path and expires immediately",
    () => {
      assert.deepEqual(
        getGoogleAdsOAuthTransactionClearCookieOptions(
          true,
        ),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path:
            "/api/media-connections/google-ads/oauth/callback",
          maxAge: 0,
        },
      );

      assert.deepEqual(
        getGoogleAdsOAuthTransactionClearCookieOptions(
          false,
        ),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          path:
            "/api/media-connections/google-ads/oauth/callback",
          maxAge: 0,
        },
      );
    },
  );
  passed += 1;

  console.log(
    `fixture result: ${passed}/11`,
  );
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});

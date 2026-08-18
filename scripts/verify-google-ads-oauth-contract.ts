import { createHash } from "node:crypto";

import {
  GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT,
  GOOGLE_ADS_OAUTH_SCOPE,
  GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
  normalizeGoogleAdsCustomerId,
  readGoogleAdsOAuthConfig,
} from "../src/lib/media-sync/google-ads-oauth-config";
import {
  GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
  GOOGLE_ADS_OAUTH_TRANSACTION_TTL_MS,
  GoogleAdsOAuthTransactionError,
  assertGoogleAdsOAuthStateMatches,
  createGoogleAdsOAuthTransaction,
  decryptGoogleAdsOAuthTransaction,
  deriveGoogleAdsPkceCodeChallenge,
  encryptGoogleAdsOAuthTransaction,
  getGoogleAdsOAuthTransactionCookieOptions,
} from "../src/lib/media-sync/google-ads-oauth-transaction";
import {
  GOOGLE_ADS_OAUTH_TOKEN_REQUEST_TIMEOUT_MS,
  GoogleAdsOAuthError,
  assertGoogleAdsOAuthCallbackState,
  buildGoogleAdsAuthorizationCodeTokenRequest,
  buildGoogleAdsAuthorizationUrl,
  exchangeGoogleAdsAuthorizationCode,
  parseGoogleAdsOAuthCallbackQuery,
  parseGoogleAdsOAuthTokenResponse,
} from "../src/lib/media-sync/google-ads-oauth";

type FixtureResult = {
  name: string;
  passed: boolean;
  error?: unknown;
};

const FIXED_NOW_MS = Date.parse(
  "2026-08-18T00:00:00.000Z",
);

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runFixture(
  name: string,
  fn: () => void | Promise<void>,
): Promise<FixtureResult> {
  return Promise.resolve()
    .then(fn)
    .then(() => ({
      name,
      passed: true,
    }))
    .catch((error) => ({
      name,
      passed: false,
      error,
    }));
}

async function main(): Promise<void> {
  const originalEncryptionKey =
    process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;

  process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
    Buffer.alloc(32, 7).toString("base64");

  const config = readGoogleAdsOAuthConfig({
    GOOGLE_ADS_DEVELOPER_TOKEN:
      "test-developer-token",
    GOOGLE_ADS_OAUTH_CLIENT_ID:
      "test-client.apps.googleusercontent.com",
    GOOGLE_ADS_OAUTH_CLIENT_SECRET:
      "test-client-secret",
    GOOGLE_ADS_OAUTH_REDIRECT_URI:
      "https://app.etrylue.com/api/media-connections/google-ads/oauth/callback",
  });

  const transaction =
    createGoogleAdsOAuthTransaction(
      {
        userId: "user-1",
        workspaceId: "workspace-1",
        advertiserId: "advertiser-1",
        targetCustomerId: "123-456-7890",
        loginCustomerId: "9876543210",
      },
      FIXED_NOW_MS,
    );

  const results = await Promise.all([
    runFixture(
      "Google Ads customer IDs normalize to 10 digits",
      () => {
        assertTrue(
          normalizeGoogleAdsCustomerId(
            "123-456-7890",
          ) === "1234567890",
          "formatted customer ID did not normalize",
        );

        let rejected = false;

        try {
          normalizeGoogleAdsCustomerId(
            "12345",
          );
        } catch {
          rejected = true;
        }

        assertTrue(
          rejected,
          "invalid customer ID was accepted",
        );
      },
    ),

    runFixture(
      "OAuth transaction uses random state, PKCE S256, expiry, and HttpOnly cookie policy",
      () => {
        assertTrue(
          transaction.target_customer_id ===
            "1234567890",
          "target customer ID was not normalized",
        );
        assertTrue(
          transaction.login_customer_id ===
            "9876543210",
          "login customer ID was not preserved",
        );
        assertTrue(
          transaction.state.length >= 43,
          "state entropy surface is too small",
        );
        assertTrue(
          transaction.code_verifier.length >= 43 &&
            transaction.code_verifier.length <= 128,
          "PKCE verifier length is invalid",
        );

        const expectedChallenge = createHash(
          "sha256",
        )
          .update(
            transaction.code_verifier,
            "ascii",
          )
          .digest("base64url");

        assertTrue(
          deriveGoogleAdsPkceCodeChallenge(
            transaction.code_verifier,
          ) === expectedChallenge,
          "PKCE S256 challenge is invalid",
        );
        assertTrue(
          Date.parse(transaction.expires_at) -
            Date.parse(transaction.issued_at) ===
            GOOGLE_ADS_OAUTH_TRANSACTION_TTL_MS,
          "OAuth transaction TTL is invalid",
        );

        const cookieOptions =
          getGoogleAdsOAuthTransactionCookieOptions(
            true,
          );

        assertTrue(
          GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME ===
            "etrylue_google_ads_oauth_transaction" &&
            cookieOptions.httpOnly === true &&
            cookieOptions.sameSite === "lax" &&
            cookieOptions.secure === true &&
            cookieOptions.maxAge === 600,
          "OAuth transaction cookie policy is invalid",
        );
      },
    ),

    runFixture(
      "OAuth transaction encrypts, decrypts, expires, and fails closed on state mismatch",
      () => {
        const ciphertext =
          encryptGoogleAdsOAuthTransaction(
            transaction,
          );

        assertTrue(
          !ciphertext.includes(
            transaction.code_verifier,
          ),
          "PKCE verifier leaked into ciphertext",
        );

        const decrypted =
          decryptGoogleAdsOAuthTransaction(
            ciphertext,
            FIXED_NOW_MS + 1_000,
          );

        assertTrue(
          decrypted.state === transaction.state &&
            decrypted.code_verifier ===
              transaction.code_verifier,
          "OAuth transaction roundtrip failed",
        );

        assertGoogleAdsOAuthStateMatches(
          transaction.state,
          transaction.state,
        );

        let stateMismatch = false;

        try {
          assertGoogleAdsOAuthStateMatches(
            transaction.state,
            "different-state-value-that-is-long-enough-1234567890",
          );
        } catch (error) {
          stateMismatch =
            error instanceof
              GoogleAdsOAuthTransactionError &&
            error.code === "STATE_MISMATCH";
        }

        assertTrue(
          stateMismatch,
          "state mismatch did not fail closed",
        );

        let expired = false;

        try {
          decryptGoogleAdsOAuthTransaction(
            ciphertext,
            FIXED_NOW_MS +
              GOOGLE_ADS_OAUTH_TRANSACTION_TTL_MS,
          );
        } catch (error) {
          expired =
            error instanceof
              GoogleAdsOAuthTransactionError &&
            error.code === "TRANSACTION_EXPIRED";
        }

        assertTrue(
          expired,
          "expired OAuth transaction was accepted",
        );
      },
    ),

    runFixture(
      "Authorization URL is adwords-only, offline, state-bound, and PKCE S256",
      () => {
        const authorizationUrl = new URL(
          buildGoogleAdsAuthorizationUrl({
            config,
            transaction,
          }),
        );

        assertTrue(
          authorizationUrl.origin +
              authorizationUrl.pathname ===
            GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT,
          "authorization endpoint is invalid",
        );
        assertTrue(
          authorizationUrl.searchParams.get(
            "scope",
          ) === GOOGLE_ADS_OAUTH_SCOPE,
          "authorization scope is invalid",
        );
        assertTrue(
          authorizationUrl.searchParams.get(
            "access_type",
          ) === "offline",
          "offline access is missing",
        );
        assertTrue(
          authorizationUrl.searchParams.get(
            "state",
          ) === transaction.state,
          "state is missing",
        );
        assertTrue(
          authorizationUrl.searchParams.get(
            "code_challenge_method",
          ) === "S256",
          "PKCE S256 is missing",
        );
        assertTrue(
          authorizationUrl.searchParams.get(
            "prompt",
          ) === null,
          "normal flow must not force consent",
        );
        assertTrue(
          !authorizationUrl.search.includes(
            "openid",
          ) &&
            !authorizationUrl.search.includes(
              "profile",
            ) &&
            !authorizationUrl.search.includes(
              "email",
            ),
          "identity scopes leaked into Google Ads OAuth request",
        );

        const forceConsentUrl = new URL(
          buildGoogleAdsAuthorizationUrl({
            config,
            transaction,
            forceConsent: true,
          }),
        );

        assertTrue(
          forceConsentUrl.searchParams.get(
            "prompt",
          ) === "consent",
          "force consent flow did not request consent",
        );
      },
    ),

    runFixture(
      "Callback parser rejects denial and validates state separately",
      () => {
        const callback =
          parseGoogleAdsOAuthCallbackQuery(
            new URLSearchParams({
              code: "authorization-code",
              state: transaction.state,
            }),
          );

        assertGoogleAdsOAuthCallbackState(
          transaction,
          callback,
        );

        let denied = false;

        try {
          parseGoogleAdsOAuthCallbackQuery(
            new URLSearchParams({
              error: "access_denied",
              state: transaction.state,
            }),
          );
        } catch (error) {
          denied =
            error instanceof GoogleAdsOAuthError &&
            error.code === "AUTHORIZATION_DENIED";
        }

        assertTrue(
          denied,
          "OAuth denial was not rejected",
        );
      },
    ),

    runFixture(
      "Authorization-code exchange request uses exact redirect URI and PKCE verifier",
      () => {
        const request =
          buildGoogleAdsAuthorizationCodeTokenRequest({
            config,
            code: "authorization-code",
            codeVerifier:
              transaction.code_verifier,
          });

        assertTrue(
          request.endpoint ===
            GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
          "token endpoint is invalid",
        );
        assertTrue(
          request.method === "POST",
          "token exchange must use POST",
        );
        assertTrue(
          request.body.get("grant_type") ===
            "authorization_code",
          "grant_type is invalid",
        );
        assertTrue(
          request.body.get("redirect_uri") ===
            config.redirectUri,
          "redirect URI is invalid",
        );
        assertTrue(
          request.body.get("code_verifier") ===
            transaction.code_verifier,
          "PKCE verifier is missing",
        );
        assertTrue(
          request.body.get("client_secret") ===
            config.clientSecret,
          "client secret is missing from server-side token request",
        );
        assertTrue(
          !request.body.has("developer_token"),
          "developer token must not be sent to OAuth token endpoint",
        );
      },
    ),

    runFixture(
      "Token response requires refresh token and adwords scope",
      () => {
        const tokenSet =
          parseGoogleAdsOAuthTokenResponse({
            access_token: "access-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: GOOGLE_ADS_OAUTH_SCOPE,
            refresh_token: "refresh-token",
          });

        assertTrue(
          tokenSet.accessToken === "access-token" &&
            tokenSet.refreshToken ===
              "refresh-token" &&
            tokenSet.scopes.includes(
              GOOGLE_ADS_OAUTH_SCOPE,
            ),
          "valid token response was not parsed",
        );

        let missingRefreshToken = false;

        try {
          parseGoogleAdsOAuthTokenResponse({
            access_token: "access-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: GOOGLE_ADS_OAUTH_SCOPE,
          });
        } catch (error) {
          missingRefreshToken =
            error instanceof GoogleAdsOAuthError &&
            error.code ===
              "REFRESH_TOKEN_MISSING";
        }

        assertTrue(
          missingRefreshToken,
          "missing refresh token was accepted",
        );
      },
    ),

    runFixture(
      "Mock token exchange proves no live Google request is required by fixture",
      async () => {
        let fetchCalls = 0;

        const tokenSet =
          await exchangeGoogleAdsAuthorizationCode(
            {
              config,
              code: "authorization-code",
              codeVerifier:
                transaction.code_verifier,
            },
            async (input, init) => {
              fetchCalls += 1;

              assertTrue(
                String(input) ===
                  GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
                "mock exchange used an unexpected endpoint",
              );
              assertTrue(
                init?.method === "POST",
                "mock exchange did not use POST",
              );
              assertTrue(
                init?.signal instanceof AbortSignal,
                "mock exchange did not receive an AbortSignal",
              );

              return new Response(
                JSON.stringify({
                  access_token:
                    "mock-access-token",
                  expires_in: 3600,
                  token_type: "Bearer",
                  scope: GOOGLE_ADS_OAUTH_SCOPE,
                  refresh_token:
                    "mock-refresh-token",
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              );
            },
          );

        assertTrue(
          fetchCalls === 1 &&
            tokenSet.refreshToken ===
              "mock-refresh-token",
          "mock token exchange failed",
        );
      },
    ),
    runFixture(
      "OAuth token exchange is bounded and fails closed on timeout",
      async () => {
        assertTrue(
          GOOGLE_ADS_OAUTH_TOKEN_REQUEST_TIMEOUT_MS ===
            10_000,
          "default OAuth token timeout changed",
        );

        let timedOut = false;

        try {
          await exchangeGoogleAdsAuthorizationCode(
            {
              config,
              code: "authorization-code",
              codeVerifier:
                transaction.code_verifier,
            },
            async (_input, init) => {
              const signal = init?.signal;

              assertTrue(
                signal instanceof AbortSignal,
                "timeout fixture did not receive an AbortSignal",
              );

              return await new Promise<Response>(
                (_resolve, reject) => {
                  signal.addEventListener(
                    "abort",
                    () => {
                      reject(
                        new Error(
                          "mock token request aborted",
                        ),
                      );
                    },
                    { once: true },
                  );
                },
              );
            },
            5,
          );
        } catch (error) {
          timedOut =
            error instanceof GoogleAdsOAuthError &&
            error.code ===
              "TOKEN_REQUEST_TIMEOUT";
        }

        assertTrue(
          timedOut,
          "OAuth token request timeout did not fail closed",
        );
      },
    ),
    runFixture(
      "OAuth token response body is covered by the same bounded timeout",
      async () => {
        let timedOut = false;

        try {
          await exchangeGoogleAdsAuthorizationCode(
            {
              config,
              code: "authorization-code",
              codeVerifier:
                transaction.code_verifier,
            },
            async (_input, init) => {
              const signal = init?.signal;

              assertTrue(
                signal instanceof AbortSignal,
                "body-timeout fixture did not receive an AbortSignal",
              );

              const body = new ReadableStream<Uint8Array>({
                start(controller) {
                  signal.addEventListener(
                    "abort",
                    () => {
                      const abortError =
                        new Error(
                          "mock token response body aborted",
                        );
                      abortError.name = "AbortError";
                      controller.error(
                        abortError,
                      );
                    },
                    { once: true },
                  );
                },
              });

              return new Response(
                body,
                {
                  status: 200,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              );
            },
            5,
          );
        } catch (error) {
          timedOut =
            error instanceof GoogleAdsOAuthError &&
            error.code ===
              "TOKEN_REQUEST_TIMEOUT";
        }

        assertTrue(
          timedOut,
          "OAuth token response body escaped the bounded timeout",
        );
      },
    ),
  ]);

  if (originalEncryptionKey === undefined) {
    delete process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
  } else {
    process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
      originalEncryptionKey;
  }

  for (const result of results) {
    if (result.passed) {
      console.log(`PASS: ${result.name}`);
      continue;
    }

    console.error(`FAIL: ${result.name}`);
    console.error(result.error);
  }

  const passedCount = results.filter(
    (result) => result.passed,
  ).length;

  console.log(
    `fixture result: ${passedCount}/${results.length}`,
  );

  if (passedCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

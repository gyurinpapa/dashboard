import assert from "node:assert/strict";

import {
  GOOGLE_ADS_OAUTH_SCOPE,
  GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
} from "../src/lib/media-sync/google-ads-oauth-config";
import {
  GOOGLE_ADS_ACCESS_TOKEN_REFRESH_TIMEOUT_MS,
  GoogleAdsAccessTokenRefreshError,
  buildGoogleAdsAccessTokenRefreshRequest,
  parseGoogleAdsAccessTokenRefreshResponse,
  refreshGoogleAdsAccessToken,
} from "../src/lib/media-sync/google-ads-access-token-refresh";

const CLIENT_ID =
  "fixture-client.apps.googleusercontent.com";
const CLIENT_SECRET =
  "fixture-client-secret";
const REFRESH_TOKEN =
  "fixture-refresh-token";
const ACCESS_TOKEN =
  "fixture-access-token";

const CONFIG = {
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
} as const;

function expectSyncError(
  fn: () => unknown,
  code: GoogleAdsAccessTokenRefreshError["code"],
): GoogleAdsAccessTokenRefreshError {
  try {
    fn();
  } catch (error) {
    assert(
      error instanceof
        GoogleAdsAccessTokenRefreshError,
      `Expected GoogleAdsAccessTokenRefreshError, received ${String(error)}`,
    );

    assert.equal(error.code, code);

    return error;
  }

  throw new Error(
    `Expected ${code} but no error was thrown.`,
  );
}

async function expectAsyncError(
  fn: () => Promise<unknown>,
  code: GoogleAdsAccessTokenRefreshError["code"],
): Promise<GoogleAdsAccessTokenRefreshError> {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof
        GoogleAdsAccessTokenRefreshError,
      `Expected GoogleAdsAccessTokenRefreshError, received ${String(error)}`,
    );

    assert.equal(error.code, code);

    return error;
  }

  throw new Error(
    `Expected ${code} but no error was thrown.`,
  );
}

function assertNoCredentialLeak(
  value: unknown,
): void {
  const serialized =
    value instanceof Error
      ? `${value.name}:${value.message}:${JSON.stringify(value)}`
      : JSON.stringify(value);

  assert(
    !serialized.includes(CLIENT_SECRET),
    "Client secret leaked from refresh primitive.",
  );

  assert(
    !serialized.includes(REFRESH_TOKEN),
    "Refresh token leaked from refresh primitive.",
  );
}

async function main(): Promise<void> {
  let passed = 0;

  {
    const request =
      buildGoogleAdsAccessTokenRefreshRequest({
        config: CONFIG,
        refreshToken: REFRESH_TOKEN,
      });

    assert.equal(
      request.endpoint,
      GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
    );

    assert.equal(
      request.method,
      "POST",
    );

    assert.equal(
      request.headers["Content-Type"],
      "application/x-www-form-urlencoded",
    );

    assert.deepEqual(
      Array.from(request.body.keys()).sort(),
      [
        "client_id",
        "client_secret",
        "grant_type",
        "refresh_token",
      ],
    );

    assert.equal(
      request.body.get("client_id"),
      CLIENT_ID,
    );

    assert.equal(
      request.body.get("client_secret"),
      CLIENT_SECRET,
    );

    assert.equal(
      request.body.get("refresh_token"),
      REFRESH_TOKEN,
    );

    assert.equal(
      request.body.get("grant_type"),
      "refresh_token",
    );

    assert.equal(
      request.body.has("code"),
      false,
    );

    assert.equal(
      request.body.has("code_verifier"),
      false,
    );

    assert.equal(
      request.body.has("redirect_uri"),
      false,
    );

    assert.equal(
      request.body.has("scope"),
      false,
    );

    console.log(
      "PASS: refresh request uses exact refresh_token grant contract",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;

    const fetchImpl: typeof fetch = async (
      input,
      init,
    ) => {
      fetchCalls += 1;

      assert.equal(
        String(input),
        GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
      );

      assert.equal(
        init?.method,
        "POST",
      );

      const headers =
        new Headers(init?.headers);

      assert.equal(
        headers.get("content-type"),
        "application/x-www-form-urlencoded",
      );

      assert(
        init?.body instanceof URLSearchParams,
      );

      assert.equal(
        init.body.get("refresh_token"),
        REFRESH_TOKEN,
      );

      assert(
        init?.signal instanceof AbortSignal,
      );

      return new Response(
        JSON.stringify({
          access_token: ACCESS_TOKEN,
          expires_in: 3600,
          token_type: "Bearer",
          scope: GOOGLE_ADS_OAUTH_SCOPE,
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );
    };

    const result =
      await refreshGoogleAdsAccessToken(
        {
          config: CONFIG,
          refreshToken: REFRESH_TOKEN,
        },
        fetchImpl,
        1_000,
      );

    assert.equal(fetchCalls, 1);
    assert.equal(
      result.accessToken,
      ACCESS_TOKEN,
    );
    assert.equal(result.expiresIn, 3600);
    assert.equal(result.tokenType, "Bearer");
    assert.deepEqual(
      result.scopes,
      [GOOGLE_ADS_OAUTH_SCOPE],
    );

    assert.equal(
      "refreshToken" in result,
      false,
    );

    assertNoCredentialLeak(result);

    console.log(
      "PASS: refresh returns only short-lived access-token material and calls injected fetch exactly once",
    );

    passed += 1;
  }

  {
    const parsed =
      parseGoogleAdsAccessTokenRefreshResponse({
        access_token: ACCESS_TOKEN,
        expires_in: 3599,
        token_type: "Bearer",
      });

    assert.equal(
      parsed.accessToken,
      ACCESS_TOKEN,
    );
    assert.deepEqual(parsed.scopes, []);

    console.log(
      "PASS: omitted refresh response scope preserves original authorization contract",
    );

    passed += 1;
  }

  {
    expectSyncError(
      () =>
        parseGoogleAdsAccessTokenRefreshResponse({
          access_token: ACCESS_TOKEN,
          expires_in: 3600,
          token_type: "Bearer",
          scope:
            "https://www.googleapis.com/auth/userinfo.email",
        }),
      "REQUIRED_SCOPE_MISSING",
    );

    console.log(
      "PASS: explicit refresh response scope fails closed when Google Ads scope is absent",
    );

    passed += 1;
  }

  {
    const error =
      await expectAsyncError(
        () =>
          refreshGoogleAdsAccessToken(
            {
              config: CONFIG,
              refreshToken:
                REFRESH_TOKEN,
            },
            async () =>
              new Response(
                JSON.stringify({
                  error:
                    "invalid_grant",
                }),
                {
                  status: 400,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              ),
            1_000,
          ),
        "TOKEN_HTTP_ERROR",
      );

    assert.equal(error.status, 400);
    assert.equal(error.oauthError, "invalid_grant");
    assert.match(error.message, /HTTP 400; OAuth invalid_grant/);
    assertNoCredentialLeak(error);

    console.log(
      "PASS: unsuccessful OAuth HTTP response preserves status without leaking credentials",
    );

    passed += 1;
  }

  {
    const cases = [
      { status: 401, body: { error: "invalid_client", error_description: CLIENT_SECRET }, expected: "invalid_client" },
      { status: 403, body: { error: "admin_policy_enforced", error_description: REFRESH_TOKEN }, expected: "admin_policy_enforced" },
      { status: 503, body: { error: "temporarily_unavailable" }, expected: "temporarily_unavailable" },
      { status: 400, body: { error: REFRESH_TOKEN, error_description: CLIENT_SECRET }, expected: null },
      { status: 400, body: { error: { message: CLIENT_SECRET }, refresh_token: REFRESH_TOKEN }, expected: null },
      { status: 502, body: `<html>${CLIENT_SECRET}</html>`, expected: null },
    ];
    for (const fixture of cases) {
      let fetchCalls = 0;
      const error = await expectAsyncError(() => refreshGoogleAdsAccessToken(
        { config: CONFIG, refreshToken: REFRESH_TOKEN },
        async () => {
          fetchCalls++;
          return new Response(typeof fixture.body === "string" ? fixture.body : JSON.stringify(fixture.body), { status: fixture.status });
        },
      ), "TOKEN_HTTP_ERROR");
      assert.equal(fetchCalls, 1, "diagnostics must not introduce token retries");
      assert.equal(error.status, fixture.status);
      assert.equal(error.oauthError, fixture.expected);
      assertNoCredentialLeak(error);
    }
    console.log("PASS: OAuth failure classification retains only allowlisted codes; no raw descriptions or retries");
    passed++;
  }

  {
    let cancelled = false;
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: "invalid_grant", error_description: CLIENT_SECRET + "x".repeat(9_000) })));
      },
      cancel() { cancelled = true; },
    });
    const error = await expectAsyncError(() => refreshGoogleAdsAccessToken(
      { config: CONFIG, refreshToken: REFRESH_TOKEN },
      async () => new Response(oversizedBody, { status: 400 }),
    ), "TOKEN_HTTP_ERROR");
    assert.equal(cancelled, true);
    assert.equal(error.status, 400);
    assert.equal(error.oauthError, null);
    assertNoCredentialLeak(error);
    console.log("PASS: oversized error body is cancelled and discarded");
    passed++;
  }

  {
    const error = await expectAsyncError(() => refreshGoogleAdsAccessToken(
      { config: CONFIG, refreshToken: REFRESH_TOKEN },
      async (_input, init) => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        },
      }), { status: 503 }),
      10,
    ), "TOKEN_HTTP_ERROR");
    assert.equal(error.status, 503);
    assert.equal(error.oauthError, null);
    assertNoCredentialLeak(error);
    console.log("PASS: stalled OAuth error body remains bounded and preserves the HTTP failure");
    passed++;
  }

  {
    const error =
      await expectAsyncError(
        () =>
          refreshGoogleAdsAccessToken(
            {
              config: CONFIG,
              refreshToken:
                REFRESH_TOKEN,
            },
            async () =>
              new Response(
                "{not-json",
                {
                  status: 200,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              ),
            1_000,
          ),
        "INVALID_TOKEN_RESPONSE",
      );

    assertNoCredentialLeak(error);

    console.log(
      "PASS: malformed refresh response fails closed",
    );

    passed += 1;
  }

  {
    const error =
      await expectAsyncError(
        () =>
          refreshGoogleAdsAccessToken(
            {
              config: CONFIG,
              refreshToken:
                REFRESH_TOKEN,
            },
            async () => {
              throw new Error(
                "fixture network failure",
              );
            },
            1_000,
          ),
        "TOKEN_REQUEST_FAILED",
      );

    assertNoCredentialLeak(error);

    console.log(
      "PASS: network failure fails closed without credential leakage",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;

    const fetchImpl: typeof fetch = async (
      _input,
      init,
    ) => {
      fetchCalls += 1;

      const signal = init?.signal;

      assert(
        signal instanceof AbortSignal,
      );

      return await new Promise<Response>(
        (_resolve, reject) => {
          const rejectAbort = () => {
            reject(
              new DOMException(
                "Aborted",
                "AbortError",
              ),
            );
          };

          if (signal.aborted) {
            rejectAbort();
            return;
          }

          signal.addEventListener(
            "abort",
            rejectAbort,
            {
              once: true,
            },
          );
        },
      );
    };

    await expectAsyncError(
      () =>
        refreshGoogleAdsAccessToken(
          {
            config: CONFIG,
            refreshToken:
              REFRESH_TOKEN,
          },
          fetchImpl,
          10,
        ),
      "TOKEN_REQUEST_TIMEOUT",
    );

    assert.equal(fetchCalls, 1);

    console.log(
      "PASS: refresh request timeout aborts injected fetch and fails closed",
    );

    passed += 1;
  }

  {
    const fetchImpl: typeof fetch = async (
      _input,
      init,
    ) => {
      const signal = init?.signal;

      assert(
        signal instanceof AbortSignal,
      );

      const body =
        new ReadableStream<Uint8Array>({
          start(controller) {
            const failOnAbort = () => {
              controller.error(
                new DOMException(
                  "Aborted",
                  "AbortError",
                ),
              );
            };

            if (signal.aborted) {
              failOnAbort();
              return;
            }

            signal.addEventListener(
              "abort",
              failOnAbort,
              {
                once: true,
              },
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
    };

    await expectAsyncError(
      () =>
        refreshGoogleAdsAccessToken(
          {
            config: CONFIG,
            refreshToken:
              REFRESH_TOKEN,
          },
          fetchImpl,
          10,
        ),
      "TOKEN_REQUEST_TIMEOUT",
    );

    console.log(
      "PASS: refresh response body remains inside the bounded timeout",
    );

    passed += 1;
  }

  {
    let fetchCalls = 0;

    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;

      throw new Error(
        "must not be called",
      );
    };

    await expectAsyncError(
      () =>
        refreshGoogleAdsAccessToken(
          {
            config: CONFIG,
            refreshToken:
              REFRESH_TOKEN,
          },
          fetchImpl,
          0,
        ),
      "INVALID_INPUT",
    );

    assert.equal(fetchCalls, 0);

    assert.equal(
      GOOGLE_ADS_ACCESS_TOKEN_REFRESH_TIMEOUT_MS,
      10_000,
    );

    console.log(
      "PASS: invalid timeout fails before network and default timeout remains 10s",
    );

    passed += 1;
  }

  assert.equal(passed, 13);

  console.log(
    `Google Ads access-token refresh fixture: ${passed}/13 PASS`,
  );

  console.log(
    "LIVE_GOOGLE_OAUTH_CALLS=0",
  );

  console.log(
    "LIVE_GOOGLE_ADS_API_CALLS=0",
  );

  console.log(
    "DB_WRITES=0",
  );

  console.log(
    "GOOGLE_ADS_ACCESS_TOKEN_REFRESH_FIXTURE=PASS",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

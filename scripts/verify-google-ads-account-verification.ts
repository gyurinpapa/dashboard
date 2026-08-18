import {
  GOOGLE_ADS_API_VERSION,
  GoogleAdsAccountVerificationError,
  buildGoogleAdsAccountVerificationRequest,
  verifyGoogleAdsAccountAccess,
} from "../src/lib/media-sync/google-ads-account-verification";

const TARGET_CUSTOMER_ID = "1234567890";
const LOGIN_CUSTOMER_ID = "9876543210";
const ACCESS_TOKEN = "fixture-access-token";
const DEVELOPER_TOKEN = "fixture-developer-token";
const NOW_MS = Date.parse("2026-08-18T12:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectErrorCode(
  fn: () => Promise<unknown> | unknown,
  code: GoogleAdsAccountVerificationError["code"],
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(
      error instanceof GoogleAdsAccountVerificationError,
      `Expected GoogleAdsAccountVerificationError, received ${String(error)}`,
    );
    assert(
      error.code === code,
      `Expected ${code}, received ${error.code}`,
    );
    return;
  }

  throw new Error(`Expected ${code} but no error was thrown.`);
}

function makeCustomerResponse(
  customerId = TARGET_CUSTOMER_ID,
  descriptiveName: string | null = "Fixture Google Ads Account",
): Response {
  return new Response(
    JSON.stringify({
      results: [
        {
          customer: {
            resourceName: `customers/${customerId}`,
            id: customerId,
            ...(descriptiveName === null
              ? {}
              : { descriptiveName }),
          },
        },
      ],
      fieldMask:
        "customer.resourceName,customer.id,customer.descriptiveName",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

async function main(): Promise<void> {
  const tests: Array<{
    name: string;
    run: () => Promise<void> | void;
  }> = [
    {
      name: "Google Ads verification request targets v25 read-only search and does not send login header for direct access",
      run: () => {
        const request = buildGoogleAdsAccountVerificationRequest({
          accessToken: ACCESS_TOKEN,
          developerToken: DEVELOPER_TOKEN,
          targetCustomerId: "123-456-7890",
        });

        assert(
          GOOGLE_ADS_API_VERSION === "v25",
          "Google Ads API version is unexpected.",
        );
        assert(
          request.endpoint ===
            "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search",
          "Google Ads verification endpoint is incorrect.",
        );
        assert(
          request.method === "POST",
          "Google Ads verification method is incorrect.",
        );
        assert(
          request.headers.Authorization ===
            `Bearer ${ACCESS_TOKEN}`,
          "Authorization header is incorrect.",
        );
        assert(
          request.headers["developer-token"] ===
            DEVELOPER_TOKEN,
          "developer-token header is incorrect.",
        );
        assert(
          !("login-customer-id" in request.headers),
          "Direct access request unexpectedly includes login-customer-id.",
        );

        const parsedBody = JSON.parse(request.body) as {
          query?: unknown;
        };

        assert(
          parsedBody.query ===
            "SELECT customer.resource_name, customer.id, customer.descriptive_name FROM customer LIMIT 1",
          "Google Ads verification query is incorrect.",
        );
      },
    },
    {
      name: "Manager verification sends normalized login-customer-id and creates a fresh exact proof",
      run: async () => {
        let fetchCalls = 0;

        const fetchImpl: typeof fetch = async (
          input,
          init,
        ) => {
          fetchCalls += 1;

          assert(
            String(input) ===
              "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search",
            "Fixture received an unexpected URL.",
          );

          const headers = new Headers(init?.headers);

          assert(
            headers.get("authorization") ===
              `Bearer ${ACCESS_TOKEN}`,
            "Fixture authorization header is incorrect.",
          );
          assert(
            headers.get("developer-token") ===
              DEVELOPER_TOKEN,
            "Fixture developer-token header is incorrect.",
          );
          assert(
            headers.get("login-customer-id") ===
              LOGIN_CUSTOMER_ID,
            "Fixture login-customer-id header is incorrect.",
          );
          assert(
            init?.signal instanceof AbortSignal,
            "Fixture request is missing an abort signal.",
          );

          return makeCustomerResponse();
        };

        const result = await verifyGoogleAdsAccountAccess(
          {
            accessToken: ACCESS_TOKEN,
            developerToken: DEVELOPER_TOKEN,
            targetCustomerId: "123-456-7890",
            loginCustomerId: "987-654-3210",
          },
          fetchImpl,
          1_000,
          NOW_MS,
        );

        assert(fetchCalls === 1, "Verifier must call Google exactly once.");
        assert(
          result.verification.target_customer_id ===
            TARGET_CUSTOMER_ID,
          "Verified target customer ID is incorrect.",
        );
        assert(
          result.verification.login_customer_id ===
            LOGIN_CUSTOMER_ID,
          "Verified login customer ID is incorrect.",
        );
        assert(
          result.verification.verified_at ===
            "2026-08-18T12:00:00.000Z",
          "Verified timestamp is incorrect.",
        );
        assert(
          result.externalAccountName ===
            "Fixture Google Ads Account",
          "Verified account name is incorrect.",
        );

        const serialized = JSON.stringify(result);

        assert(
          !serialized.includes(ACCESS_TOKEN) &&
            !serialized.includes(DEVELOPER_TOKEN),
          "Verifier result leaked a bearer or developer token.",
        );
      },
    },
    {
      name: "Target mismatch fails closed before any verification proof can be returned",
      run: async () => {
        const fetchImpl: typeof fetch = async () =>
          makeCustomerResponse("1111111111");

        await expectErrorCode(
          () =>
            verifyGoogleAdsAccountAccess(
              {
                accessToken: ACCESS_TOKEN,
                developerToken: DEVELOPER_TOKEN,
                targetCustomerId: TARGET_CUSTOMER_ID,
                loginCustomerId: LOGIN_CUSTOMER_ID,
              },
              fetchImpl,
              1_000,
              NOW_MS,
            ),
          "TARGET_CUSTOMER_MISMATCH",
        );
      },
    },
    {
      name: "Unsuccessful Google Ads responses fail closed without parsing provider error bodies",
      run: async () => {
        const fetchImpl: typeof fetch = async () =>
          new Response(
            JSON.stringify({
              error: {
                message: "must-not-propagate",
              },
            }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

        try {
          await verifyGoogleAdsAccountAccess(
            {
              accessToken: ACCESS_TOKEN,
              developerToken: DEVELOPER_TOKEN,
              targetCustomerId: TARGET_CUSTOMER_ID,
              loginCustomerId: LOGIN_CUSTOMER_ID,
            },
            fetchImpl,
            1_000,
            NOW_MS,
          );
        } catch (error) {
          assert(
            error instanceof GoogleAdsAccountVerificationError,
            "Expected GoogleAdsAccountVerificationError.",
          );
          assert(
            error.code === "API_HTTP_ERROR",
            "Expected API_HTTP_ERROR.",
          );
          assert(error.status === 403, "HTTP status was not preserved.");
          assert(
            !error.message.includes("must-not-propagate"),
            "Provider error body leaked into the application error.",
          );
          return;
        }

        throw new Error("Expected API_HTTP_ERROR but no error was thrown.");
      },
    },
    {
      name: "Malformed Google Ads success responses are rejected",
      run: async () => {
        const fetchImpl: typeof fetch = async () =>
          new Response(
            JSON.stringify({ results: [] }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );

        await expectErrorCode(
          () =>
            verifyGoogleAdsAccountAccess(
              {
                accessToken: ACCESS_TOKEN,
                developerToken: DEVELOPER_TOKEN,
                targetCustomerId: TARGET_CUSTOMER_ID,
              },
              fetchImpl,
              1_000,
              NOW_MS,
            ),
          "INVALID_RESPONSE",
        );
      },
    },
    {
      name: "Google Ads verification timeout aborts the injected request and fails closed",
      run: async () => {
        const fetchImpl: typeof fetch = async (
          _input,
          init,
        ) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;

            assert(signal, "Timeout fixture requires an AbortSignal.");

            const rejectAbort = () => {
              const error = new Error("fixture aborted");
              error.name = "AbortError";
              reject(error);
            };

            if (signal.aborted) {
              rejectAbort();
              return;
            }

            signal.addEventListener(
              "abort",
              rejectAbort,
              { once: true },
            );
          });

        await expectErrorCode(
          () =>
            verifyGoogleAdsAccountAccess(
              {
                accessToken: ACCESS_TOKEN,
                developerToken: DEVELOPER_TOKEN,
                targetCustomerId: TARGET_CUSTOMER_ID,
              },
              fetchImpl,
              1,
              NOW_MS,
            ),
          "REQUEST_TIMEOUT",
        );
      },
    },
    {
      name: "Invalid input is rejected before any fetch executor is called",
      run: async () => {
        let fetchCalls = 0;

        const fetchImpl: typeof fetch = async () => {
          fetchCalls += 1;
          return makeCustomerResponse();
        };

        await expectErrorCode(
          () =>
            verifyGoogleAdsAccountAccess(
              {
                accessToken: ACCESS_TOKEN,
                developerToken: DEVELOPER_TOKEN,
                targetCustomerId: "not-a-customer-id",
              },
              fetchImpl,
              1_000,
              NOW_MS,
            ),
          "INVALID_INPUT",
        );

        assert(
          fetchCalls === 0,
          "Invalid input reached the fetch executor.",
        );
      },
    },
  ];

  let passed = 0;

  for (const test of tests) {
    await test.run();
    passed += 1;
    console.log(`PASS: ${test.name}`);
  }

  console.log(`fixture result: ${passed}/${tests.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

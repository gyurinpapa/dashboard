import {
  assertSafeMediaConnectionPayload,
  buildSafeMediaConnectionResponse,
  buildSafeMediaConnectionsResponse,
  MediaConnectionRequestError,
  normalizeMediaConnectionAdvertiserId,
  normalizeMediaConnectionConnectionId,
  normalizeMediaConnectionMeta,
  parseCreateMediaConnectionRequest,
  parseReplaceMediaConnectionCredentialsRequest,
} from "../src/lib/media-sync/media-connection-request";
import type {
  MediaConnectionRecord,
} from "../src/lib/media-sync/types";

type TestCase = {
  name: string;
  run: () => void;
};

const SECRET_SENTINELS = {
  ciphertext:
    "fixture-ciphertext-never-return-this",
  accessLicense:
    "fixture-access-license-never-return-this",
  secretKey:
    "fixture-secret-key-never-return-this",
};

function fail(message: string): never {
  throw new Error(message);
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    fail(
      [
        message,
        `Expected: ${String(expected)}`,
        `Actual: ${String(actual)}`,
      ].join("\n"),
    );
  }
}

function assertTrue(
  value: unknown,
  message: string,
): void {
  if (value !== true) {
    fail(message);
  }
}

function assertFalse(
  value: unknown,
  message: string,
): void {
  if (value !== false) {
    fail(message);
  }
}

function expectRequestError(
  run: () => void,
  expectedCode:
    | "INVALID_INPUT"
    | "UNSUPPORTED_PROVIDER"
    | "UNSAFE_RESPONSE",
  message: string,
): void {
  try {
    run();
  } catch (error) {
    if (
      error instanceof MediaConnectionRequestError
    ) {
      assertEqual(
        error.code,
        expectedCode,
        `${message}: error code mismatch.`,
      );

      return;
    }

    throw error;
  }

  fail(`${message}: expected an error.`);
}

function createFixtureRecord(
  suffix: string,
): MediaConnectionRecord {
  return {
    id: `fixture-connection-${suffix}`,
    workspace_id: "fixture-workspace",
    advertiser_id: "fixture-advertiser",

    provider: "naver_searchad",
    external_account_id:
      `fixture-account-${suffix}`,
    external_account_name:
      `Fixture Account ${suffix}`,

    credential_ciphertext:
      SECRET_SENTINELS.ciphertext,
    credential_version: 1,

    status: "active",

    connected_at: "2026-01-01T00:00:00.000Z",
    last_verified_at: null,
    last_sync_at: null,
    last_error: null,

    meta: {
      timezone: "Asia/Seoul",
      currency: "KRW",
      sourceOwnership: "api",
      dataLevel: "keyword",
      displayName: `Fixture ${suffix}`,
    },

    created_by: "fixture-user",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const identifierTests: readonly TestCase[] = [
  {
    name: "advertiser id is trimmed",
    run: () => {
      assertEqual(
        normalizeMediaConnectionAdvertiserId(
          "  fixture-advertiser  ",
        ),
        "fixture-advertiser",
        "advertiserId must be trimmed.",
      );
    },
  },
  {
    name: "empty advertiser id is rejected",
    run: () => {
      expectRequestError(
        () =>
          normalizeMediaConnectionAdvertiserId(
            "   ",
          ),
        "INVALID_INPUT",
        "Empty advertiserId",
      );
    },
  },
  {
    name: "connection id is trimmed",
    run: () => {
      assertEqual(
        normalizeMediaConnectionConnectionId(
          "  fixture-connection  ",
        ),
        "fixture-connection",
        "connectionId must be trimmed.",
      );
    },
  },
  {
    name: "empty connection id is rejected",
    run: () => {
      expectRequestError(
        () =>
          normalizeMediaConnectionConnectionId(
            "",
          ),
        "INVALID_INPUT",
        "Empty connectionId",
      );
    },
  },
];

const createRequestTests: readonly TestCase[] = [
  {
    name: "valid create request is normalized",
    run: () => {
      const result =
        parseCreateMediaConnectionRequest({
          advertiserId:
            "  fixture-advertiser  ",
          body: {
            provider: "naver_searchad",
            externalAccountId:
              "  fixture-account  ",
            externalAccountName:
              "  Fixture Account  ",
            credentials: {
              customerId: "  fixture-customer  ",
              accessLicense:
                "  fixture-access-license  ",
              secretKey:
                "  fixture-secret-key  ",
            },
            meta: {
              timezone: "Asia/Seoul",
              currency: "KRW",
              nested: {
                enabled: true,
              },
            },
          },
        });

      assertEqual(
        result.advertiserId,
        "fixture-advertiser",
        "advertiserId normalization failed.",
      );

      assertEqual(
        result.provider,
        "naver_searchad",
        "provider normalization failed.",
      );

      assertEqual(
        result.externalAccountId,
        "fixture-account",
        "externalAccountId normalization failed.",
      );

      assertEqual(
        result.externalAccountName,
        "Fixture Account",
        "externalAccountName normalization failed.",
      );

      assertEqual(
        result.credentials.customerId,
        "fixture-customer",
        "customerId normalization failed.",
      );

      assertEqual(
        result.credentials.accessLicense,
        "fixture-access-license",
        "accessLicense normalization failed.",
      );

      assertEqual(
        result.credentials.secretKey,
        "fixture-secret-key",
        "secretKey normalization failed.",
      );
    },
  },
  {
    name: "blank external account name becomes null",
    run: () => {
      const result =
        parseCreateMediaConnectionRequest({
          advertiserId: "fixture-advertiser",
          body: {
            provider: "naver_searchad",
            externalAccountId:
              "fixture-account",
            externalAccountName: "   ",
            credentials: {
              customerId: "fixture-customer",
              accessLicense:
                "fixture-access-license",
              secretKey: "fixture-secret-key",
            },
          },
        });

      assertEqual(
        result.externalAccountName,
        null,
        "Blank externalAccountName must become null.",
      );
    },
  },
  {
    name: "unknown provider is rejected",
    run: () => {
      expectRequestError(
        () =>
          parseCreateMediaConnectionRequest({
            advertiserId:
              "fixture-advertiser",
            body: {
              provider: "unknown_provider",
              externalAccountId:
                "fixture-account",
              credentials: {
                customerId:
                  "fixture-customer",
                accessLicense:
                  "fixture-access-license",
                secretKey:
                  "fixture-secret-key",
              },
            },
          }),
        "INVALID_INPUT",
        "Unknown provider",
      );
    },
  },
  {
    name: "known but unsupported provider is rejected",
    run: () => {
      expectRequestError(
        () =>
          parseCreateMediaConnectionRequest({
            advertiserId:
              "fixture-advertiser",
            body: {
              provider: "google_ads",
              externalAccountId:
                "fixture-account",
              credentials: {
                customerId:
                  "fixture-customer",
                accessLicense:
                  "fixture-access-license",
                secretKey:
                  "fixture-secret-key",
              },
            },
          }),
        "UNSUPPORTED_PROVIDER",
        "Unsupported provider",
      );
    },
  },
  {
    name: "missing credential field is rejected",
    run: () => {
      expectRequestError(
        () =>
          parseCreateMediaConnectionRequest({
            advertiserId:
              "fixture-advertiser",
            body: {
              provider: "naver_searchad",
              externalAccountId:
                "fixture-account",
              credentials: {
                customerId:
                  "fixture-customer",
                accessLicense:
                  "fixture-access-license",
              },
            },
          }),
        "INVALID_INPUT",
        "Missing secretKey",
      );
    },
  },
];

const replaceCredentialTests: readonly TestCase[] = [
  {
    name: "credential replacement request is separate and normalized",
    run: () => {
      const result =
        parseReplaceMediaConnectionCredentialsRequest(
          {
            advertiserId:
              "  fixture-advertiser  ",
            connectionId:
              "  fixture-connection  ",
            body: {
              provider: "naver_searchad",
              credentials: {
                customerId:
                  "  replacement-customer  ",
                accessLicense:
                  "  replacement-license  ",
                secretKey:
                  "  replacement-secret  ",
              },
            },
          },
        );

      assertEqual(
        result.advertiserId,
        "fixture-advertiser",
        "Replacement advertiserId mismatch.",
      );

      assertEqual(
        result.connectionId,
        "fixture-connection",
        "Replacement connectionId mismatch.",
      );

      assertEqual(
        result.credentials.customerId,
        "replacement-customer",
        "Replacement customerId mismatch.",
      );
    },
  },
  {
    name: "credential replacement rejects unsupported provider",
    run: () => {
      expectRequestError(
        () =>
          parseReplaceMediaConnectionCredentialsRequest(
            {
              advertiserId:
                "fixture-advertiser",
              connectionId:
                "fixture-connection",
              body: {
                provider: "meta_ads",
                credentials: {
                  customerId:
                    "fixture-customer",
                  accessLicense:
                    "fixture-access-license",
                  secretKey:
                    "fixture-secret-key",
                },
              },
            },
          ),
        "UNSUPPORTED_PROVIDER",
        "Replacement unsupported provider",
      );
    },
  },
];

const metadataTests: readonly TestCase[] = [
  {
    name: "safe nested metadata is accepted",
    run: () => {
      const result =
        normalizeMediaConnectionMeta({
          timezone: "Asia/Seoul",
          currency: "KRW",
          nested: {
            list: [1, true, null, "safe"],
          },
        });

      const nested = result.nested;

      assertTrue(
        typeof nested === "object" &&
          nested !== null,
        "Safe nested metadata must be preserved.",
      );
    },
  },
  {
    name: "top-level secret-like metadata key is rejected",
    run: () => {
      expectRequestError(
        () =>
          normalizeMediaConnectionMeta({
            secretKey: "must-not-be-stored",
          }),
        "INVALID_INPUT",
        "Top-level secret-like metadata",
      );
    },
  },
  {
    name: "nested secret-like metadata key is rejected",
    run: () => {
      expectRequestError(
        () =>
          normalizeMediaConnectionMeta({
            providerSettings: {
              access_token:
                "must-not-be-stored",
            },
          }),
        "INVALID_INPUT",
        "Nested secret-like metadata",
      );
    },
  },
  {
    name: "non-finite metadata number is rejected",
    run: () => {
      expectRequestError(
        () =>
          normalizeMediaConnectionMeta({
            invalidNumber: Number.NaN,
          }),
        "INVALID_INPUT",
        "Non-finite metadata number",
      );
    },
  },
];

const safeResponseTests: readonly TestCase[] = [
  {
    name: "single safe response removes credential ciphertext",
    run: () => {
      const response =
        buildSafeMediaConnectionResponse(
          createFixtureRecord("one"),
        );

      const serialized = JSON.stringify(response);

      assertFalse(
        serialized.includes(
          "credential_ciphertext",
        ),
        "Safe response must not contain credential_ciphertext.",
      );

      assertFalse(
        serialized.includes(
          SECRET_SENTINELS.ciphertext,
        ),
        "Safe response must not contain ciphertext value.",
      );

      assertTrue(
        response.connection.has_credentials,
        "Safe response must expose only has_credentials.",
      );
    },
  },
  {
    name: "list safe response removes credentials from every item",
    run: () => {
      const response =
        buildSafeMediaConnectionsResponse([
          createFixtureRecord("one"),
          createFixtureRecord("two"),
        ]);

      const serialized = JSON.stringify(response);

      assertEqual(
        response.connections.length,
        2,
        "List response count mismatch.",
      );

      assertFalse(
        serialized.includes(
          "credential_ciphertext",
        ),
        "List response must not contain credential_ciphertext.",
      );

      assertFalse(
        serialized.includes(
          SECRET_SENTINELS.ciphertext,
        ),
        "List response must not contain ciphertext value.",
      );
    },
  },
  {
    name: "explicit credential object in public payload is rejected",
    run: () => {
      expectRequestError(
        () =>
          assertSafeMediaConnectionPayload({
            connection: {
              id: "fixture-connection",
              credentials: {
                accessLicense:
                  SECRET_SENTINELS.accessLicense,
                secretKey:
                  SECRET_SENTINELS.secretKey,
              },
            },
          }),
        "UNSAFE_RESPONSE",
        "Credential object in public response",
      );
    },
  },
  {
    name: "nested access token in public payload is rejected",
    run: () => {
      expectRequestError(
        () =>
          assertSafeMediaConnectionPayload({
            connection: {
              id: "fixture-connection",
              meta: {
                nested: {
                  access_token:
                    "must-not-be-returned",
                },
              },
            },
          }),
        "UNSAFE_RESPONSE",
        "Nested access token in public response",
      );
    },
  },
  {
    name: "has_credentials is permitted in public payload",
    run: () => {
      assertSafeMediaConnectionPayload({
        connection: {
          id: "fixture-connection",
          has_credentials: true,
        },
      });
    },
  },
];

function runTests(
  section: string,
  tests: readonly TestCase[],
): number {
  console.log("");
  console.log(section);

  let passed = 0;

  for (const test of tests) {
    test.run();
    passed += 1;

    console.log(`PASS: ${test.name}`);
  }

  return passed;
}

function main(): void {
  console.log(
    "Starting media connection request fixture verification.",
  );

  let passed = 0;

  passed += runTests(
    "Identifier normalization",
    identifierTests,
  );

  passed += runTests(
    "Create connection request",
    createRequestTests,
  );

  passed += runTests(
    "Credential replacement request",
    replaceCredentialTests,
  );

  passed += runTests(
    "Public metadata policy",
    metadataTests,
  );

  passed += runTests(
    "Safe response contract",
    safeResponseTests,
  );

  const total =
    identifierTests.length +
    createRequestTests.length +
    replaceCredentialTests.length +
    metadataTests.length +
    safeResponseTests.length;

  assertEqual(
    passed,
    total,
    "Not all request fixture tests were executed.",
  );

  console.log("");
  console.log(
    `Media connection request verification passed: ${passed}/${total} fixtures.`,
  );

  console.log(
    "No database, login session, credential encryption key, media API, or environment variable was used.",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "Media connection request verification failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
}
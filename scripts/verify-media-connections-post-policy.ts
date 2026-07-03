import {
  getMediaConnectionActionDenialCode,
  resolveMediaConnectionPermissions,
  type MediaConnectionWorkspaceRole,
} from "../src/lib/media-sync/media-connection-access-policy";
import {
  MediaConnectionRequestError,
  parseCreateMediaConnectionRequest,
} from "../src/lib/media-sync/media-connection-request";
import {
  buildCreateMediaConnectionSuccessResponse,
  buildCreateNaverSearchAdsRepositoryInput,
  MediaConnectionsPostPolicyError,
  type MediaConnectionsPostAccessContext,
} from "../src/lib/media-sync/media-connections-post-policy";
import {
  mapMediaConnectionRequestRouteError,
  mapMediaConnectionsRepositoryRouteError,
} from "../src/lib/media-sync/media-connections-route-policy";
import type { SafeMediaConnection } from "../src/lib/media-sync/types";

type TestCase = {
  name: string;
  run: () => void;
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
        `${message}: request error code mismatch.`,
      );

      return;
    }

    throw error;
  }

  fail(`${message}: expected request error.`);
}

function expectPostPolicyError(
  run: () => void,
  expectedCode:
    | "INVALID_ACCESS_CONTEXT"
    | "ADVERTISER_SCOPE_MISMATCH"
    | "UNSAFE_RESPONSE",
  message: string,
): void {
  try {
    run();
  } catch (error) {
    if (
      error instanceof MediaConnectionsPostPolicyError
    ) {
      assertEqual(
        error.code,
        expectedCode,
        `${message}: policy error code mismatch.`,
      );

      return;
    }

    throw error;
  }

  fail(`${message}: expected post policy error.`);
}

function createAccessContext(
  overrides?: Partial<MediaConnectionsPostAccessContext>,
): MediaConnectionsPostAccessContext {
  return {
    userId: "fixture-user",
    workspaceId: "fixture-workspace",
    advertiserId: "fixture-advertiser",
    accessScope: "workspace",
    canManageConnections: true,
    ...(overrides ?? {}),
  };
}

function createParsedRequest() {
  return parseCreateMediaConnectionRequest({
    advertiserId: "fixture-advertiser",
    body: {
      provider: "naver_searchad",
      externalAccountId: "fixture-account",
      externalAccountName: "Fixture Account",
      credentials: {
        customerId: "fixture-customer",
        accessLicense: "fixture-access-license",
        secretKey: "fixture-secret-key",
      },
      meta: {
        timezone: "Asia/Seoul",
        currency: "KRW",
        sourceOwnership: "api",
        dataLevel: "keyword",
      },
    },
  });
}

function createSafeConnection(
  overrides?: Partial<SafeMediaConnection>,
): SafeMediaConnection {
  return {
    id: "fixture-connection",
    workspace_id: "fixture-workspace",
    advertiser_id: "fixture-advertiser",

    provider: "naver_searchad",
    external_account_id: "fixture-account",
    external_account_name: "Fixture Account",

    status: "active",
    has_credentials: true,

    connected_at: "2026-01-01T00:00:00.000Z",
    last_verified_at: null,
    last_sync_at: null,
    last_error: null,

    meta: {
      timezone: "Asia/Seoul",
      currency: "KRW",
      sourceOwnership: "api",
      dataLevel: "keyword",
    },

    created_by: "fixture-user",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",

    ...(overrides ?? {}),
  };
}

function verifyManagePermission(
  input: {
    role: MediaConnectionWorkspaceRole;
    isTrueMaster: boolean;
    isOwnAdvertiser: boolean;
  },
  expectedAllowed: boolean,
  fixtureName: string,
): void {
  const permissions =
    resolveMediaConnectionPermissions(input);

  const denialCode =
    getMediaConnectionActionDenialCode(
      "manage_connections",
      permissions,
    );

  assertEqual(
    denialCode === null,
    expectedAllowed,
    `${fixtureName}: manage permission mismatch.`,
  );
}

const permissionTests: readonly TestCase[] = [
  {
    name: "true master may create a connection",
    run: () => {
      verifyManagePermission(
        {
          role: "master",
          isTrueMaster: true,
          isOwnAdvertiser: false,
        },
        true,
        "True master",
      );
    },
  },
  {
    name: "director may create a connection",
    run: () => {
      verifyManagePermission(
        {
          role: "director",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        },
        true,
        "Director",
      );
    },
  },
  {
    name: "admin may create a connection",
    run: () => {
      verifyManagePermission(
        {
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        },
        true,
        "Admin",
      );
    },
  },
  {
    name: "staff cannot create a connection even for own advertiser",
    run: () => {
      verifyManagePermission(
        {
          role: "staff",
          isTrueMaster: false,
          isOwnAdvertiser: true,
        },
        false,
        "Staff own advertiser",
      );
    },
  },
  {
    name: "client cannot create a connection",
    run: () => {
      verifyManagePermission(
        {
          role: "client",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        },
        false,
        "Client",
      );
    },
  },
  {
    name: "non-true-master master role cannot create a connection",
    run: () => {
      verifyManagePermission(
        {
          role: "master",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        },
        false,
        "Non-true-master master",
      );
    },
  },
];

const requestTests: readonly TestCase[] = [
  {
    name: "valid POST request is normalized",
    run: () => {
      const request =
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
              customerId:
                "  fixture-customer  ",
              accessLicense:
                "  fixture-access-license  ",
              secretKey:
                "  fixture-secret-key  ",
            },
          },
        });

      assertEqual(
        request.advertiserId,
        "fixture-advertiser",
        "advertiserId normalization failed.",
      );

      assertEqual(
        request.externalAccountId,
        "fixture-account",
        "externalAccountId normalization failed.",
      );

      assertEqual(
        request.credentials.customerId,
        "fixture-customer",
        "customerId normalization failed.",
      );
    },
  },
  {
    name: "unsupported provider maps to 400",
    run: () => {
      try {
        parseCreateMediaConnectionRequest({
          advertiserId: "fixture-advertiser",
          body: {
            provider: "google_ads",
            externalAccountId:
              "fixture-account",
            credentials: {
              customerId: "fixture-customer",
              accessLicense:
                "fixture-access-license",
              secretKey:
                "fixture-secret-key",
            },
          },
        });
      } catch (error) {
        if (
          error instanceof MediaConnectionRequestError
        ) {
          const mapped =
            mapMediaConnectionRequestRouteError(
              error.code,
            );

          assertEqual(
            mapped.status,
            400,
            "Unsupported provider status mismatch.",
          );

          assertEqual(
            mapped.error,
            "UNSUPPORTED_PROVIDER",
            "Unsupported provider code mismatch.",
          );

          return;
        }

        throw error;
      }

      fail("Unsupported provider must be rejected.");
    },
  },
  {
    name: "missing secret key is rejected",
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
  {
    name: "secret-like metadata is rejected",
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
                secretKey:
                  "fixture-secret-key",
              },
              meta: {
                access_token:
                  "must-not-be-stored",
              },
            },
          }),
        "INVALID_INPUT",
        "Secret-like metadata",
      );
    },
  },
];

const repositoryInputTests: readonly TestCase[] = [
  {
    name: "repository input uses authorized workspace and user",
    run: () => {
      const access = createAccessContext();
      const request = createParsedRequest();

      const repositoryInput =
        buildCreateNaverSearchAdsRepositoryInput(
          access,
          request,
        );

      assertEqual(
        repositoryInput.workspaceId,
        "fixture-workspace",
        "workspaceId must come from access context.",
      );

      assertEqual(
        repositoryInput.advertiserId,
        "fixture-advertiser",
        "advertiserId must match access scope.",
      );

      assertEqual(
        repositoryInput.createdBy,
        "fixture-user",
        "createdBy must come from authenticated user.",
      );

      assertEqual(
        repositoryInput.externalAccountId,
        "fixture-account",
        "externalAccountId mismatch.",
      );
    },
  },
  {
    name: "request cannot override workspace or createdBy",
    run: () => {
      const access = createAccessContext({
        workspaceId:
          "authorized-workspace",
        userId: "authenticated-user",
      });

      const request =
        parseCreateMediaConnectionRequest({
          advertiserId:
            "fixture-advertiser",
          body: {
            provider: "naver_searchad",
            workspaceId:
              "malicious-workspace",
            createdBy: "malicious-user",
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
        });

      const repositoryInput =
        buildCreateNaverSearchAdsRepositoryInput(
          access,
          request,
        );

      assertEqual(
        repositoryInput.workspaceId,
        "authorized-workspace",
        "Body workspaceId must be ignored.",
      );

      assertEqual(
        repositoryInput.createdBy,
        "authenticated-user",
        "Body createdBy must be ignored.",
      );
    },
  },
  {
    name: "advertiser scope mismatch is blocked",
    run: () => {
      const access = createAccessContext({
        advertiserId:
          "authorized-advertiser",
      });

      const request =
        parseCreateMediaConnectionRequest({
          advertiserId:
            "different-advertiser",
          body: {
            provider: "naver_searchad",
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
        });

      expectPostPolicyError(
        () =>
          buildCreateNaverSearchAdsRepositoryInput(
            access,
            request,
          ),
        "ADVERTISER_SCOPE_MISMATCH",
        "Advertiser scope mismatch",
      );
    },
  },
  {
    name: "non-manage access context is blocked",
    run: () => {
      const access = createAccessContext({
        canManageConnections: false,
      });

      expectPostPolicyError(
        () =>
          buildCreateNaverSearchAdsRepositoryInput(
            access,
            createParsedRequest(),
          ),
        "INVALID_ACCESS_CONTEXT",
        "Non-manage access context",
      );
    },
  },
];

const repositoryErrorTests: readonly TestCase[] = [
  {
    name: "duplicate connection maps to 409",
    run: () => {
      const result =
        mapMediaConnectionsRepositoryRouteError(
          "CONNECTION_ALREADY_EXISTS",
        );

      assertEqual(
        result.status,
        409,
        "Duplicate status mismatch.",
      );

      assertEqual(
        result.error,
        "CONNECTION_ALREADY_EXISTS",
        "Duplicate code mismatch.",
      );
    },
  },
  {
    name: "encryption failure maps to safe 500",
    run: () => {
      const result =
        mapMediaConnectionsRepositoryRouteError(
          "ENCRYPTION_ERROR",
        );

      assertEqual(
        result.status,
        500,
        "Encryption error status mismatch.",
      );

      assertEqual(
        result.error,
        "ENCRYPTION_ERROR",
        "Encryption error code mismatch.",
      );
    },
  },
  {
    name: "database failure maps to generic safe 500",
    run: () => {
      const result =
        mapMediaConnectionsRepositoryRouteError(
          "DATABASE_ERROR",
        );

      assertEqual(
        result.status,
        500,
        "Database error status mismatch.",
      );

      assertEqual(
        result.error,
        "MEDIA_CONNECTION_DATABASE_ERROR",
        "Database error code mismatch.",
      );
    },
  },
];

const successResponseTests: readonly TestCase[] = [
  {
    name: "safe created connection response is accepted",
    run: () => {
      const response =
        buildCreateMediaConnectionSuccessResponse(
          createAccessContext(),
          createSafeConnection(),
        );

      const serialized = JSON.stringify(response);

      assertTrue(
        response.ok,
        "Success response must return ok true.",
      );

      assertFalse(
        serialized.includes(
          "credential_ciphertext",
        ),
        "Success response must not contain credential ciphertext.",
      );

      assertFalse(
        serialized.includes("secretKey"),
        "Success response must not contain secretKey.",
      );

      assertTrue(
        response.connection.has_credentials,
        "Success response may expose has_credentials.",
      );
    },
  },
  {
    name: "repository response with another workspace is blocked",
    run: () => {
      expectPostPolicyError(
        () =>
          buildCreateMediaConnectionSuccessResponse(
            createAccessContext(),
            createSafeConnection({
              workspace_id:
                "different-workspace",
            }),
          ),
        "ADVERTISER_SCOPE_MISMATCH",
        "Created connection workspace mismatch",
      );
    },
  },
  {
    name: "repository response with another advertiser is blocked",
    run: () => {
      expectPostPolicyError(
        () =>
          buildCreateMediaConnectionSuccessResponse(
            createAccessContext(),
            createSafeConnection({
              advertiser_id:
                "different-advertiser",
            }),
          ),
        "ADVERTISER_SCOPE_MISMATCH",
        "Created connection advertiser mismatch",
      );
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
    "Starting media connections POST policy fixture verification.",
  );

  let passed = 0;

  passed += runTests(
    "POST management permissions",
    permissionTests,
  );

  passed += runTests(
    "POST request validation",
    requestTests,
  );

  passed += runTests(
    "Repository input scope",
    repositoryInputTests,
  );

  passed += runTests(
    "Repository error mapping",
    repositoryErrorTests,
  );

  passed += runTests(
    "POST success response",
    successResponseTests,
  );

  const total =
    permissionTests.length +
    requestTests.length +
    repositoryInputTests.length +
    repositoryErrorTests.length +
    successResponseTests.length;

  assertEqual(
    passed,
    total,
    "Not all POST policy fixtures were executed.",
  );

  console.log("");
  console.log(
    `Media connections POST policy verification passed: ${passed}/${total} fixtures.`,
  );

  console.log(
    "No database, user account, login session, encryption key, credential storage, media API, or environment variable was used.",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "Media connections POST policy verification failed.",
  );

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
}
import assert from "node:assert/strict";

import {
  buildReplaceMediaConnectionCredentialsSuccessResponse,
  buildReplaceNaverSearchAdsCredentialsRepositoryInput,
  MediaConnectionCredentialsReplacePolicyError,
  type MediaConnectionCredentialsReplaceAccessContext,
} from "../src/lib/media-sync/media-connection-credentials-replace-policy";
import type { ReplaceNaverSearchAdsCredentialsRequest } from "../src/lib/media-sync/media-connection-request";
import {
  resolveMediaConnectionPermissions,
  resolveTrueMasterStatus,
  type MediaConnectionWorkspaceRole,
} from "../src/lib/media-sync/media-connection-access-policy";
import type {
  MediaConnectionAccessScope,
} from "../src/lib/media-sync/media-connection-access-policy";
import type { SafeMediaConnection } from "../src/lib/media-sync/types";

const USER_ID =
  "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID =
  "22222222-2222-4222-8222-222222222222";
const ADVERTISER_ID =
  "33333333-3333-4333-8333-333333333333";
const OTHER_ADVERTISER_ID =
  "44444444-4444-4444-8444-444444444444";
const CONNECTION_ID =
  "55555555-5555-4555-8555-555555555555";
const OTHER_CONNECTION_ID =
  "66666666-6666-4666-8666-666666666666";

const TRUE_MASTER_EMAIL =
  "gyurinpapakimdh@gmail.com";

type TestCase = {
  name: string;
  run: () => void;
};

function createRequest(
  overrides?: Partial<ReplaceNaverSearchAdsCredentialsRequest>,
): ReplaceNaverSearchAdsCredentialsRequest {
  return {
    advertiserId: ADVERTISER_ID,
    connectionId: CONNECTION_ID,
    provider: "naver_searchad",
    credentials: {
      customerId: "fixture-customer-id",
      accessLicense:
        "fixture-access-license",
      secretKey: "fixture-secret-key",
    },
    ...overrides,
  };
}

function createAccessContext(input: {
  role: MediaConnectionWorkspaceRole;
  isTrueMaster: boolean;
  isOwnAdvertiser: boolean;
  advertiserId?: string;
  userId?: string;
}): MediaConnectionCredentialsReplaceAccessContext {
  const permissions =
    resolveMediaConnectionPermissions({
      role: input.role,
      isTrueMaster:
        input.isTrueMaster,
      isOwnAdvertiser:
        input.isOwnAdvertiser,
    });

  return {
    userId:
      input.userId ?? USER_ID,
    workspaceId: WORKSPACE_ID,
    advertiserId:
      input.advertiserId ??
      ADVERTISER_ID,
    accessScope:
      permissions.accessScope,
    canManageConnections:
      permissions.canManageConnections,
  };
}

function createSafeConnection(
  overrides?: Partial<SafeMediaConnection>,
): SafeMediaConnection {
  return {
    id: CONNECTION_ID,
    workspace_id: WORKSPACE_ID,
    advertiser_id: ADVERTISER_ID,
    provider: "naver_searchad",
    external_account_id:
      "fixture-customer-id",
    external_account_name:
      "Fixture Naver Search Ads",
    has_credentials: true,
    status: "active",
    connected_at:
      "2026-06-25T00:00:00.000Z",
    last_verified_at: null,
    last_sync_at: null,
    last_error: null,
    meta: {},
    created_by: USER_ID,
    created_at:
      "2026-06-25T00:00:00.000Z",
    updated_at:
      "2026-06-25T00:00:00.000Z",
    ...overrides,
  };
}

function expectPolicyError(
  expectedCode:
    MediaConnectionCredentialsReplacePolicyError["code"],
  callback: () => unknown,
): void {
  assert.throws(
    callback,
    (error: unknown) => {
      assert.ok(
        error instanceof
          MediaConnectionCredentialsReplacePolicyError,
      );

      assert.equal(
        error.code,
        expectedCode,
      );

      return true;
    },
  );
}

function assertRepositoryInputForAllowedRole(
  access:
    MediaConnectionCredentialsReplaceAccessContext,
): void {
  const request = createRequest();

  const repositoryInput =
    buildReplaceNaverSearchAdsCredentialsRepositoryInput(
      access,
      request,
    );

  assert.deepEqual(
    repositoryInput,
    {
      connectionId: CONNECTION_ID,
      workspaceId: WORKSPACE_ID,
      advertiserId: ADVERTISER_ID,
      credentials:
        request.credentials,
    },
  );

  assert.equal(
    Object.hasOwn(
      repositoryInput,
      "createdBy",
    ),
    false,
  );

  assert.equal(
    Object.hasOwn(
      repositoryInput,
      "userId",
    ),
    false,
  );
}

function assertDeniedRole(input: {
  role: MediaConnectionWorkspaceRole;
  isOwnAdvertiser: boolean;
}): void {
  const access = createAccessContext({
    role: input.role,
    isTrueMaster: false,
    isOwnAdvertiser:
      input.isOwnAdvertiser,
  });

  expectPolicyError(
    "INVALID_ACCESS_CONTEXT",
    () =>
      buildReplaceNaverSearchAdsCredentialsRepositoryInput(
        access,
        createRequest(),
      ),
  );
}

const tests: TestCase[] = [
  {
    name:
      "true master can build credential replacement repository input",
    run: () => {
      const isTrueMaster =
        resolveTrueMasterStatus({
          email: TRUE_MASTER_EMAIL,
          hasMasterMembership: true,
        });

      assert.equal(
        isTrueMaster,
        true,
      );

      assertRepositoryInputForAllowedRole(
        createAccessContext({
          role: "master",
          isTrueMaster,
          isOwnAdvertiser: false,
        }),
      );
    },
  },
  {
    name:
      "director can build credential replacement repository input",
    run: () => {
      assertRepositoryInputForAllowedRole(
        createAccessContext({
          role: "director",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        }),
      );
    },
  },
  {
    name:
      "admin can build credential replacement repository input",
    run: () => {
      assertRepositoryInputForAllowedRole(
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        }),
      );
    },
  },
  {
    name:
      "staff who created advertiser cannot replace credentials",
    run: () => {
      assertDeniedRole({
        role: "staff",
        isOwnAdvertiser: true,
      });
    },
  },
  {
    name:
      "staff who did not create advertiser cannot replace credentials",
    run: () => {
      assertDeniedRole({
        role: "staff",
        isOwnAdvertiser: false,
      });
    },
  },
  {
    name:
      "client cannot replace credentials",
    run: () => {
      assertDeniedRole({
        role: "client",
        isOwnAdvertiser: false,
      });
    },
  },
  {
    name:
      "ordinary master role is not automatically true master",
    run: () => {
      const isTrueMaster =
        resolveTrueMasterStatus({
          email:
            "ordinary-master@example.com",
          hasMasterMembership: true,
        });

      assert.equal(
        isTrueMaster,
        false,
      );

      assertDeniedRole({
        role: "master",
        isOwnAdvertiser: false,
      });
    },
  },
  {
    name:
      "true master email without master membership is denied",
    run: () => {
      const isTrueMaster =
        resolveTrueMasterStatus({
          email: TRUE_MASTER_EMAIL,
          hasMasterMembership: false,
        });

      assert.equal(
        isTrueMaster,
        false,
      );

      assertDeniedRole({
        role: "master",
        isOwnAdvertiser: false,
      });
    },
  },
  {
    name:
      "platform owner alone cannot become true master",
    run: () => {
      const isTrueMaster =
        resolveTrueMasterStatus({
          email:
            "platform-owner@example.com",
          hasMasterMembership: false,
          isPlatformOwner: true,
        });

      assert.equal(
        isTrueMaster,
        false,
      );

      assertDeniedRole({
        role: "master",
        isOwnAdvertiser: false,
      });
    },
  },
  {
    name:
      "request advertiser must match authorized advertiser",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      expectPolicyError(
        "ADVERTISER_SCOPE_MISMATCH",
        () =>
          buildReplaceNaverSearchAdsCredentialsRepositoryInput(
            access,
            createRequest({
              advertiserId:
                OTHER_ADVERTISER_ID,
            }),
          ),
      );
    },
  },
  {
    name:
      "workspace is taken only from authorized access context",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const repositoryInput =
        buildReplaceNaverSearchAdsCredentialsRepositoryInput(
          access,
          createRequest(),
        );

      assert.equal(
        repositoryInput.workspaceId,
        WORKSPACE_ID,
      );
    },
  },
  {
    name:
      "connection id is taken from validated request",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const repositoryInput =
        buildReplaceNaverSearchAdsCredentialsRepositoryInput(
          access,
          createRequest(),
        );

      assert.equal(
        repositoryInput.connectionId,
        CONNECTION_ID,
      );
    },
  },
  {
    name:
      "credentials are passed from validated request without body scope fields",
    run: () => {
      const access =
        createAccessContext({
          role: "director",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const request =
        createRequest();

      const repositoryInput =
        buildReplaceNaverSearchAdsCredentialsRepositoryInput(
          access,
          request,
        );

      assert.deepEqual(
        repositoryInput.credentials,
        request.credentials,
      );

      assert.equal(
        Object.hasOwn(
          repositoryInput,
          "workspace_id",
        ),
        false,
      );

      assert.equal(
        Object.hasOwn(
          repositoryInput,
          "advertiser_id",
        ),
        false,
      );
    },
  },
  {
    name:
      "success response accepts matching safe connection",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const response =
        buildReplaceMediaConnectionCredentialsSuccessResponse(
          access,
          CONNECTION_ID,
          createSafeConnection(),
        );

      assert.equal(
        response.ok,
        true,
      );
      assert.equal(
        response.workspace_id,
        WORKSPACE_ID,
      );
      assert.equal(
        response.advertiser_id,
        ADVERTISER_ID,
      );
      assert.equal(
        response.connection.id,
        CONNECTION_ID,
      );
      assert.equal(
        response.connection
          .has_credentials,
        true,
      );
    },
  },
  {
    name:
      "success response rejects workspace mismatch",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      expectPolicyError(
        "ADVERTISER_SCOPE_MISMATCH",
        () =>
          buildReplaceMediaConnectionCredentialsSuccessResponse(
            access,
            CONNECTION_ID,
            createSafeConnection({
              workspace_id:
                "77777777-7777-4777-8777-777777777777",
            }),
          ),
      );
    },
  },
  {
    name:
      "success response rejects advertiser mismatch",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      expectPolicyError(
        "ADVERTISER_SCOPE_MISMATCH",
        () =>
          buildReplaceMediaConnectionCredentialsSuccessResponse(
            access,
            CONNECTION_ID,
            createSafeConnection({
              advertiser_id:
                OTHER_ADVERTISER_ID,
            }),
          ),
      );
    },
  },
  {
    name:
      "success response rejects connection mismatch",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      expectPolicyError(
        "CONNECTION_SCOPE_MISMATCH",
        () =>
          buildReplaceMediaConnectionCredentialsSuccessResponse(
            access,
            CONNECTION_ID,
            createSafeConnection({
              id:
                OTHER_CONNECTION_ID,
            }),
          ),
      );
    },
  },
  {
    name:
      "success response rejects credential ciphertext",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const unsafeConnection = {
        ...createSafeConnection(),
        credential_ciphertext:
          "must-not-be-exposed",
      } as unknown as SafeMediaConnection;

      expectPolicyError(
        "UNSAFE_RESPONSE",
        () =>
          buildReplaceMediaConnectionCredentialsSuccessResponse(
            access,
            CONNECTION_ID,
            unsafeConnection,
          ),
      );
    },
  },
  {
    name:
      "success response rejects credentials object",
    run: () => {
      const access =
        createAccessContext({
          role: "admin",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const unsafeConnection = {
        ...createSafeConnection(),
        credentials: {
          customerId:
            "must-not-be-exposed",
          accessLicense:
            "must-not-be-exposed",
          secretKey:
            "must-not-be-exposed",
        },
      } as unknown as SafeMediaConnection;

      expectPolicyError(
        "UNSAFE_RESPONSE",
        () =>
          buildReplaceMediaConnectionCredentialsSuccessResponse(
            access,
            CONNECTION_ID,
            unsafeConnection,
          ),
      );
    },
  },
  {
    name:
      "success response contains no credential fields",
    run: () => {
      const access =
        createAccessContext({
          role: "director",
          isTrueMaster: false,
          isOwnAdvertiser: false,
        });

      const response =
        buildReplaceMediaConnectionCredentialsSuccessResponse(
          access,
          CONNECTION_ID,
          createSafeConnection(),
        );

      const serialized =
        JSON.stringify(response);

      assert.equal(
        serialized.includes(
          "credential_ciphertext",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "\"credentials\"",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "accessLicense",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "secretKey",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "accessToken",
        ),
        false,
      );
      assert.equal(
        serialized.includes(
          "refreshToken",
        ),
        false,
      );
    },
  },
];

let passedCount = 0;

for (const test of tests) {
  try {
    test.run();
    passedCount += 1;

    console.log(
      `PASS ${passedCount}/${tests.length}: ${test.name}`,
    );
  } catch (error) {
    console.error(
      `FAIL ${passedCount + 1}/${tests.length}: ${test.name}`,
    );

    if (error instanceof Error) {
      console.error(
        error.name,
        error.message,
      );
    } else {
      console.error(
        "UNKNOWN_ERROR",
      );
    }

    process.exitCode = 1;
    break;
  }
}

if (passedCount === tests.length) {
  console.log(
    `Media connection credential replacement policy verification passed: ${passedCount}/${tests.length}`,
  );
}
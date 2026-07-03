import assert from "node:assert/strict";

import {
  MEDIA_CONNECTION_CREDENTIALS_ROUTE_ACTION,
  MEDIA_CONNECTION_CREDENTIALS_ROUTE_METHOD,
  MEDIA_CONNECTION_CREDENTIALS_ROUTE_PATTERN,
  MEDIA_CONNECTION_CREDENTIALS_ROUTE_SUCCESS_STATUS,
  buildMediaConnectionCredentialsRouteRepositoryInput,
  buildMediaConnectionCredentialsRouteRequest,
  buildMediaConnectionCredentialsRouteSuccessResponse,
  getInvalidMediaConnectionCredentialsJsonRouteError,
  mapMediaConnectionCredentialsReplacePolicyRouteError,
  mapMediaConnectionCredentialsRouteError,
} from "../src/lib/media-sync/media-connection-credentials-route-policy";
import {
  MediaConnectionCredentialsReplacePolicyError,
  type MediaConnectionCredentialsReplaceAccessContext,
} from "../src/lib/media-sync/media-connection-credentials-replace-policy";
import {
  MediaConnectionRequestError,
} from "../src/lib/media-sync/media-connection-request";
import {
  MediaConnectionsRepositoryError,
} from "../src/lib/media-sync/media-connections-repository";
import type { SafeMediaConnection } from "../src/lib/media-sync/types";

const ADVERTISER_ID =
  "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID =
  "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID =
  "33333333-3333-4333-8333-333333333333";
const USER_ID =
  "44444444-4444-4444-8444-444444444444";

let passed = 0;

function verify(
  name: string,
  run: () => void,
): void {
  run();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function expectThrowsWithCode(
  run: () => unknown,
  expectedCode: string,
): void {
  assert.throws(run, (error: unknown) => {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error)
    ) {
      return false;
    }

    return error.code === expectedCode;
  });
}

const access: MediaConnectionCredentialsReplaceAccessContext =
  {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    advertiserId: ADVERTISER_ID,
    accessScope: "true_master",
    canManageConnections: true,
  };

const safeConnection = {
  id: CONNECTION_ID,
  workspace_id: WORKSPACE_ID,
  advertiser_id: ADVERTISER_ID,
  provider: "naver_searchad",
  external_account_id: "1234567",
  external_account_name: "Fixture account",
  status: "active",
  connected_at: "2026-06-25T00:00:00.000Z",
  last_verified_at: null,
  last_sync_at: null,
  last_error: null,
  meta: {},
  created_by: USER_ID,
  created_at: "2026-06-25T00:00:00.000Z",
  updated_at: "2026-06-25T00:00:00.000Z",
  has_credentials: true,
} as SafeMediaConnection;

verify(
  "route method is PATCH",
  () => {
    assert.equal(
      MEDIA_CONNECTION_CREDENTIALS_ROUTE_METHOD,
      "PATCH",
    );
  },
);

verify(
  "route path uses a nested credentials segment",
  () => {
    assert.equal(
      MEDIA_CONNECTION_CREDENTIALS_ROUTE_PATTERN,
      "/api/advertisers/[id]/media-connections/[connectionId]/credentials",
    );
  },
);

verify(
  "route action is manage_connections",
  () => {
    assert.equal(
      MEDIA_CONNECTION_CREDENTIALS_ROUTE_ACTION,
      "manage_connections",
    );
  },
);

verify(
  "successful PATCH status is 200",
  () => {
    assert.equal(
      MEDIA_CONNECTION_CREDENTIALS_ROUTE_SUCCESS_STATUS,
      200,
    );
  },
);

const routeRequest =
  buildMediaConnectionCredentialsRouteRequest({
    advertiserId: ` ${ADVERTISER_ID} `,
    connectionId: ` ${CONNECTION_ID} `,
    body: {
      provider: "naver_searchad",
      credentials: {
        customerId: "1234567",
        accessLicense: "fixture-access-license",
        secretKey: "fixture-secret-key",
      },

      workspaceId: "untrusted-workspace",
      advertiserId: "untrusted-advertiser",
      connectionId: "untrusted-connection",
      userId: "untrusted-user",
      createdBy: "untrusted-creator",
    },
  });

verify(
  "valid route request is parsed from URL params",
  () => {
    assert.equal(
      routeRequest.request.advertiserId,
      ADVERTISER_ID,
    );
    assert.equal(
      routeRequest.request.connectionId,
      CONNECTION_ID,
    );
    assert.equal(
      routeRequest.request.provider,
      "naver_searchad",
    );
  },
);

verify(
  "body scope fields are not included in parsed request",
  () => {
    assert.equal(
      "workspaceId" in routeRequest.request,
      false,
    );
    assert.equal(
      "userId" in routeRequest.request,
      false,
    );
    assert.equal(
      "createdBy" in routeRequest.request,
      false,
    );
  },
);

const repositoryInput =
  buildMediaConnectionCredentialsRouteRepositoryInput(
    access,
    routeRequest,
  );

verify(
  "repository workspace scope comes from access context",
  () => {
    assert.equal(
      repositoryInput.workspaceId,
      WORKSPACE_ID,
    );
  },
);

verify(
  "repository advertiser scope comes from authorized access context",
  () => {
    assert.equal(
      repositoryInput.advertiserId,
      ADVERTISER_ID,
    );
  },
);

verify(
  "repository connection ID comes from validated URL request",
  () => {
    assert.equal(
      repositoryInput.connectionId,
      CONNECTION_ID,
    );
  },
);

verify(
  "repository input excludes arbitrary actor fields",
  () => {
    assert.equal(
      "userId" in repositoryInput,
      false,
    );
    assert.equal(
      "createdBy" in repositoryInput,
      false,
    );
  },
);

verify(
  "invalid advertiser ID maps through request validation",
  () => {
    expectThrowsWithCode(
      () =>
        buildMediaConnectionCredentialsRouteRequest({
          advertiserId: " ",
          connectionId: CONNECTION_ID,
          body: {
            provider: "naver_searchad",
            credentials: {
              customerId: "1234567",
              accessLicense: "access-license",
              secretKey: "secret-key",
            },
          },
        }),
      "INVALID_INPUT",
    );
  },
);

verify(
  "invalid connection ID maps through request validation",
  () => {
    expectThrowsWithCode(
      () =>
        buildMediaConnectionCredentialsRouteRequest({
          advertiserId: ADVERTISER_ID,
          connectionId: "",
          body: {
            provider: "naver_searchad",
            credentials: {
              customerId: "1234567",
              accessLicense: "access-license",
              secretKey: "secret-key",
            },
          },
        }),
      "INVALID_INPUT",
    );
  },
);

verify(
  "invalid credentials are rejected",
  () => {
    expectThrowsWithCode(
      () =>
        buildMediaConnectionCredentialsRouteRequest({
          advertiserId: ADVERTISER_ID,
          connectionId: CONNECTION_ID,
          body: {
            provider: "naver_searchad",
            credentials: {
              customerId: "",
              accessLicense: "",
              secretKey: "",
            },
          },
        }),
      "INVALID_INPUT",
    );
  },
);

verify(
  "unsupported provider is rejected",
  () => {
    expectThrowsWithCode(
      () =>
        buildMediaConnectionCredentialsRouteRequest({
          advertiserId: ADVERTISER_ID,
          connectionId: CONNECTION_ID,
          body: {
            provider: "google_ads",
            credentials: {
              customerId: "1234567",
              accessLicense: "access-license",
              secretKey: "secret-key",
            },
          },
        }),
      "UNSUPPORTED_PROVIDER",
    );
  },
);

verify(
  "malformed JSON contract maps to safe 400",
  () => {
    assert.deepEqual(
      getInvalidMediaConnectionCredentialsJsonRouteError(),
      {
        status: 400,
        error: "INVALID_JSON_BODY",
      },
    );
  },
);

verify(
  "request INVALID_INPUT maps to 400",
  () => {
    const error = new MediaConnectionRequestError(
      "INVALID_INPUT",
      "fixture request detail that must not be exposed",
    );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 400,
        error: "INVALID_INPUT",
      },
    );
  },
);

verify(
  "request UNSUPPORTED_PROVIDER maps to 400",
  () => {
    const error = new MediaConnectionRequestError(
      "UNSUPPORTED_PROVIDER",
      "fixture provider detail that must not be exposed",
    );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 400,
        error: "UNSUPPORTED_PROVIDER",
      },
    );
  },
);

verify(
  "unauthenticated access error preserves safe 401 contract",
  () => {
    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError({
        status: 401,
        code: "UNAUTHENTICATED",
      }),
      {
        status: 401,
        error: "UNAUTHENTICATED",
      },
    );
  },
);

verify(
  "manage permission denial preserves safe 403 contract",
  () => {
    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError({
        status: 403,
        code: "MEDIA_CONNECTION_ACCESS_DENIED",
      }),
      {
        status: 403,
        error: "MEDIA_CONNECTION_ACCESS_DENIED",
      },
    );
  },
);

verify(
  "advertiser not found preserves safe 404 contract",
  () => {
    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError({
        status: 404,
        code: "ADVERTISER_NOT_FOUND",
      }),
      {
        status: 404,
        error: "ADVERTISER_NOT_FOUND",
      },
    );
  },
);

verify(
  "invalid access context maps to safe 403",
  () => {
    const error =
      new MediaConnectionCredentialsReplacePolicyError(
        "INVALID_ACCESS_CONTEXT",
        "fixture access detail that must not be exposed",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsReplacePolicyRouteError(
        error,
      ),
      {
        status: 403,
        error: "MEDIA_CONNECTION_MANAGEMENT_FORBIDDEN",
      },
    );
  },
);

verify(
  "advertiser scope mismatch maps to concealed 404",
  () => {
    const error =
      new MediaConnectionCredentialsReplacePolicyError(
        "ADVERTISER_SCOPE_MISMATCH",
        "fixture advertiser scope detail",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 404,
        error: "CONNECTION_NOT_FOUND",
      },
    );
  },
);

verify(
  "connection scope mismatch maps to concealed 404",
  () => {
    const error =
      new MediaConnectionCredentialsReplacePolicyError(
        "CONNECTION_SCOPE_MISMATCH",
        "fixture connection scope detail",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 404,
        error: "CONNECTION_NOT_FOUND",
      },
    );
  },
);

verify(
  "repository connection not found maps to 404",
  () => {
    const error =
      new MediaConnectionsRepositoryError(
        "CONNECTION_NOT_FOUND",
        "fixture database detail that must not be exposed",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 404,
        error: "CONNECTION_NOT_FOUND",
      },
    );
  },
);

verify(
  "repository unsupported provider maps to 400",
  () => {
    const error =
      new MediaConnectionsRepositoryError(
        "UNSUPPORTED_PROVIDER",
        "fixture repository provider detail",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 400,
        error: "UNSUPPORTED_PROVIDER",
      },
    );
  },
);

verify(
  "credential encryption failure maps to safe 500",
  () => {
    const error =
      new MediaConnectionsRepositoryError(
        "ENCRYPTION_ERROR",
        "fixture encryption detail that must not be exposed",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 500,
        error: "ENCRYPTION_ERROR",
      },
    );
  },
);

verify(
  "database failure maps to generic safe 500",
  () => {
    const error =
      new MediaConnectionsRepositoryError(
        "DATABASE_ERROR",
        "Supabase fixture detail that must not be exposed",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 500,
        error: "MEDIA_CONNECTION_DATABASE_ERROR",
      },
    );
  },
);

verify(
  "unsafe success response maps to safe 500",
  () => {
    const error =
      new MediaConnectionCredentialsReplacePolicyError(
        "UNSAFE_RESPONSE",
        "fixture unsafe payload detail",
      );

    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(error),
      {
        status: 500,
        error: "UNSAFE_MEDIA_CONNECTION_RESPONSE",
      },
    );
  },
);

verify(
  "unexpected failure maps to INTERNAL_ERROR",
  () => {
    assert.deepEqual(
      mapMediaConnectionCredentialsRouteError(
        new Error("unexpected fixture detail"),
      ),
      {
        status: 500,
        error: "INTERNAL_ERROR",
      },
    );
  },
);

const successResponse =
  buildMediaConnectionCredentialsRouteSuccessResponse(
    access,
    CONNECTION_ID,
    safeConnection,
  );

verify(
  "success response uses status 200",
  () => {
    assert.equal(successResponse.status, 200);
    assert.equal(successResponse.body.ok, true);
  },
);

verify(
  "success response preserves authorized scopes",
  () => {
    assert.equal(
      successResponse.body.workspace_id,
      WORKSPACE_ID,
    );
    assert.equal(
      successResponse.body.advertiser_id,
      ADVERTISER_ID,
    );
    assert.equal(
      successResponse.body.connection.id,
      CONNECTION_ID,
    );
  },
);

verify(
  "success response does not expose forbidden credential keys",
  () => {
    const serialized =
      JSON.stringify(successResponse);

    assert.equal(
      serialized.includes("credential_ciphertext"),
      false,
    );
    assert.equal(
      serialized.includes('"credentials"'),
      false,
    );
    assert.equal(
      serialized.includes("accessLicense"),
      false,
    );
    assert.equal(
      serialized.includes("secretKey"),
      false,
    );
    assert.equal(
      serialized.includes("accessToken"),
      false,
    );
    assert.equal(
      serialized.includes("refreshToken"),
      false,
    );
  },
);

console.log(
  `Media connection credentials route policy verification passed: ${passed}/${passed}`,
);
import { NextResponse } from "next/server";

import {
  MediaConnectionAccessError,
  resolveAdvertiserMediaConnectionAccess,
} from "@/src/lib/media-sync/media-connection-access";
import {
  assertSafeMediaConnectionPayload,
  MediaConnectionRequestError,
  parseCreateMediaConnectionRequest,
} from "@/src/lib/media-sync/media-connection-request";
import {
  createNaverSearchAdsConnection,
  listSafeMediaConnections,
  MediaConnectionsRepositoryError,
} from "@/src/lib/media-sync/media-connections-repository";
import {
  NaverSearchAdsApiError,
  validateNaverSearchAdsCredentials,
} from "@/src/lib/media-sync/naver-searchads-api";
import {
  buildCreateMediaConnectionSuccessResponse,
  buildCreateNaverSearchAdsRepositoryInput,
  MediaConnectionsPostPolicyError,
} from "@/src/lib/media-sync/media-connections-post-policy";
import {
  getUnexpectedMediaConnectionsRouteError,
  mapMediaConnectionAccessRouteError,
  mapMediaConnectionRequestRouteError,
  mapMediaConnectionsRepositoryRouteError,
  type MediaConnectionsRouteErrorResponse,
} from "@/src/lib/media-sync/media-connections-route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ErrorResponseExtra = Record<string, unknown>;

function jsonError(
  status: number,
  error: string,
  extra?: ErrorResponseExtra,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(extra ?? {}),
    },
    { status },
  );
}

function routeErrorResponse(
  result: MediaConnectionsRouteErrorResponse,
) {
  return jsonError(
    result.status,
    result.error,
  );
}

function normalizeRouteId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  if (
    !normalizedValue ||
    normalizedValue.length > 200
  ) {
    return null;
  }

  return normalizedValue;
}

function postPolicyErrorResponse(
  error: MediaConnectionsPostPolicyError,
) {
  switch (error.code) {
    case "UNSAFE_RESPONSE":
      return jsonError(
        500,
        "UNSAFE_RESPONSE",
      );

    case "INVALID_ACCESS_CONTEXT":
    case "ADVERTISER_SCOPE_MISMATCH":
    default:
      return jsonError(
        500,
        "INTERNAL_ERROR",
      );
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    const advertiserId =
      normalizeRouteId(id);

    if (!advertiserId) {
      return jsonError(
        400,
        "INVALID_ADVERTISER_ID",
      );
    }

    const access =
      await resolveAdvertiserMediaConnectionAccess({
        request,
        advertiserId,
        action: "view_connections",
      });

    const connections =
      await listSafeMediaConnections({
        workspaceId: access.workspaceId,
        advertiserId: access.advertiserId,
      });

    const response = {
      ok: true as const,
      advertiser_id: access.advertiserId,
      workspace_id: access.workspaceId,
      access_scope: access.accessScope,
      connections,
    };

    assertSafeMediaConnectionPayload(response);

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof MediaConnectionAccessError
    ) {
      return routeErrorResponse(
        mapMediaConnectionAccessRouteError({
          status: error.status,
          code: error.code,
        }),
      );
    }

    if (
      error instanceof
      MediaConnectionsRepositoryError
    ) {
      return routeErrorResponse(
        mapMediaConnectionsRepositoryRouteError(
          error.code,
        ),
      );
    }

    if (
      error instanceof MediaConnectionRequestError
    ) {
      return routeErrorResponse(
        mapMediaConnectionRequestRouteError(
          error.code,
        ),
      );
    }

    console.error(
      "[media-connections:get] Unexpected error",
      error,
    );

    return routeErrorResponse(
      getUnexpectedMediaConnectionsRouteError(),
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    const advertiserId =
      normalizeRouteId(id);

    if (!advertiserId) {
      return jsonError(
        400,
        "INVALID_ADVERTISER_ID",
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError(
        400,
        "INVALID_JSON_BODY",
      );
    }

    const parsedRequest =
      parseCreateMediaConnectionRequest({
        advertiserId,
        body,
      });

    const access =
      await resolveAdvertiserMediaConnectionAccess({
        request,
        advertiserId:
          parsedRequest.advertiserId,
        action: "manage_connections",
      });

    const repositoryInput =
      buildCreateNaverSearchAdsRepositoryInput(
        {
          userId: access.userId,
          workspaceId: access.workspaceId,
          advertiserId: access.advertiserId,
          accessScope: access.accessScope,
          canManageConnections:
            access.canManageConnections,
        },
        parsedRequest,
      );

    if (
      repositoryInput.credentials.customerId !==
      repositoryInput.externalAccountId
    ) {
      return jsonError(
        400,
        "NAVER_CUSTOMER_ID_MISMATCH",
      );
    }

    let verification;

    try {
      verification =
        await validateNaverSearchAdsCredentials(
          repositoryInput.credentials,
        );
    } catch (error) {
      if (
        error instanceof
        NaverSearchAdsApiError
      ) {
        return jsonError(
          502,
          "NAVER_VERIFICATION_FAILED",
        );
      }

      throw error;
    }

    if (!verification.ok) {
      const authenticationFailure =
        verification.status === 401 ||
        verification.status === 403;

      return jsonError(
        authenticationFailure ? 422 : 502,
        authenticationFailure
          ? "NAVER_AUTHENTICATION_FAILED"
          : "NAVER_VERIFICATION_FAILED",
      );
    }

    const verifiedAt =
      new Date().toISOString();

    const connection =
      await createNaverSearchAdsConnection({
        ...repositoryInput,
        verifiedAt,
      });

    const response =
      buildCreateMediaConnectionSuccessResponse(
        {
          userId: access.userId,
          workspaceId: access.workspaceId,
          advertiserId: access.advertiserId,
          accessScope: access.accessScope,
          canManageConnections:
            access.canManageConnections,
        },
        connection,
      );

    assertSafeMediaConnectionPayload(response);

    return NextResponse.json(
      response,
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof MediaConnectionAccessError
    ) {
      return routeErrorResponse(
        mapMediaConnectionAccessRouteError({
          status: error.status,
          code: error.code,
        }),
      );
    }

    if (
      error instanceof MediaConnectionRequestError
    ) {
      return routeErrorResponse(
        mapMediaConnectionRequestRouteError(
          error.code,
        ),
      );
    }

    if (
      error instanceof
      MediaConnectionsRepositoryError
    ) {
      return routeErrorResponse(
        mapMediaConnectionsRepositoryRouteError(
          error.code,
        ),
      );
    }

    if (
      error instanceof
      MediaConnectionsPostPolicyError
    ) {
      return postPolicyErrorResponse(error);
    }

    console.error(
      "[media-connections:post] Unexpected error",
      error,
    );

    return routeErrorResponse(
      getUnexpectedMediaConnectionsRouteError(),
    );
  }
}
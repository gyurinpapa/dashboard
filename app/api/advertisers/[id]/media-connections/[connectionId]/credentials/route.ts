import { NextResponse } from "next/server";

import {
  MediaConnectionAccessError,
  resolveAdvertiserMediaConnectionAccess,
} from "@/src/lib/media-sync/media-connection-access";
import {
  MediaConnectionCredentialsReplacePolicyError,
} from "@/src/lib/media-sync/media-connection-credentials-replace-policy";
import {
  buildMediaConnectionCredentialsRouteRepositoryInput,
  buildMediaConnectionCredentialsRouteRequest,
  buildMediaConnectionCredentialsRouteSuccessResponse,
  getInvalidMediaConnectionCredentialsJsonRouteError,
  mapMediaConnectionCredentialsRouteError,
} from "@/src/lib/media-sync/media-connection-credentials-route-policy";
import {
  MediaConnectionRequestError,
} from "@/src/lib/media-sync/media-connection-request";
import {
  MediaConnectionsRepositoryError,
  updateNaverSearchAdsCredentials,
} from "@/src/lib/media-sync/media-connections-repository";
import {
  getUnexpectedMediaConnectionsRouteError,
  mapMediaConnectionAccessRouteError,
  type MediaConnectionsRouteErrorResponse,
} from "@/src/lib/media-sync/media-connections-route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    connectionId: string;
  }>;
};

function jsonError(
  status: number,
  error: string,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
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

/**
 * 네이버 검색광고 연결의 credential만 교체한다.
 *
 * 안전 원칙:
 * - advertiserId와 connectionId는 URL params에서만 사용한다.
 * - body의 workspaceId, advertiserId, connectionId, userId,
 *   createdBy 등 임의 scope 값은 신뢰하지 않는다.
 * - workspaceId와 authorized advertiserId는 access resolver 결과만 사용한다.
 * - manage_connections 권한이 있는 사용자만 허용한다.
 * - credential은 서버에서 암호화한 뒤 저장한다.
 * - 네이버 API 호출, sync job 생성, ingestion 변경은 수행하지 않는다.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const {
      id,
      connectionId,
    } = await context.params;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return routeErrorResponse(
        getInvalidMediaConnectionCredentialsJsonRouteError(),
      );
    }

    const routeRequest =
      buildMediaConnectionCredentialsRouteRequest({
        advertiserId: id,
        connectionId,
        body,
      });

    const access =
      await resolveAdvertiserMediaConnectionAccess({
        request,
        advertiserId:
          routeRequest.request.advertiserId,
        action: routeRequest.action,
      });

    const accessContext = {
      userId: access.userId,
      workspaceId: access.workspaceId,
      advertiserId: access.advertiserId,
      accessScope: access.accessScope,
      canManageConnections:
        access.canManageConnections,
    };

    const repositoryInput =
      buildMediaConnectionCredentialsRouteRepositoryInput(
        accessContext,
        routeRequest,
      );

    const connection =
      await updateNaverSearchAdsCredentials(
        repositoryInput,
      );

    const result =
      buildMediaConnectionCredentialsRouteSuccessResponse(
        accessContext,
        routeRequest.request.connectionId,
        connection,
      );

    return NextResponse.json(
      result.body,
      {
        status: result.status,
      },
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
      error instanceof MediaConnectionRequestError ||
      error instanceof
        MediaConnectionsRepositoryError ||
      error instanceof
        MediaConnectionCredentialsReplacePolicyError
    ) {
      return routeErrorResponse(
        mapMediaConnectionCredentialsRouteError(
          error,
        ),
      );
    }

    console.error(
      "[media-connection-credentials:patch] Unexpected error",
      error,
    );

    return routeErrorResponse(
      getUnexpectedMediaConnectionsRouteError(),
    );
  }
}
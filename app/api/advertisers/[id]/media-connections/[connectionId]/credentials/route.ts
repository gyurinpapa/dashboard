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
  requireMediaConnectionRecord,
  updateNaverSearchAdsCredentials,
} from "@/src/lib/media-sync/media-connections-repository";
import {
  NaverSearchAdsApiError,
  validateNaverSearchAdsCredentials,
} from "@/src/lib/media-sync/naver-searchads-api";
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
 * - credential은 저장 전에 Naver Search Ads API로 최소 인증 검증한다.
 * - 인증에 실패하면 기존 credential을 변경하지 않는다.
 * - sync job 생성, ingestion 변경은 수행하지 않는다.
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

    const existingConnection =
      await requireMediaConnectionRecord({
        connectionId:
          repositoryInput.connectionId,
        workspaceId:
          repositoryInput.workspaceId,
        advertiserId:
          repositoryInput.advertiserId,
      });

    if (
      existingConnection.provider !==
      "naver_searchad"
    ) {
      return jsonError(
        400,
        "UNSUPPORTED_PROVIDER",
      );
    }

    if (
      repositoryInput.credentials.customerId !==
      existingConnection.external_account_id
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
      await updateNaverSearchAdsCredentials({
        ...repositoryInput,
        verifiedAt,
      });

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
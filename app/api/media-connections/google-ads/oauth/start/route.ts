import { NextResponse } from "next/server";

import {
  MediaConnectionAccessError,
  resolveAdvertiserMediaConnectionAccess,
} from "@/src/lib/media-sync/media-connection-access";
import {
  mapMediaConnectionAccessRouteError,
  type MediaConnectionsRouteErrorResponse,
} from "@/src/lib/media-sync/media-connections-route-policy";
import {
  GoogleAdsOAuthStartError,
  parseGoogleAdsOAuthStartRequest,
  prepareGoogleAdsOAuthStart,
} from "@/src/lib/media-sync/google-ads-oauth-start";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

function jsonError(
  status: number,
  error: string,
) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function accessErrorResponse(
  result: MediaConnectionsRouteErrorResponse,
) {
  return jsonError(
    result.status,
    result.error,
  );
}

function startErrorResponse(
  error: GoogleAdsOAuthStartError,
) {
  switch (error.code) {
    case "INVALID_INPUT":
      return jsonError(
        400,
        "INVALID_INPUT",
      );

    case "ADVERTISER_SCOPE_MISMATCH":
      return jsonError(
        403,
        "ADVERTISER_SCOPE_MISMATCH",
      );

    case "ACCESS_DENIED":
      return jsonError(
        403,
        "CONNECTION_MANAGE_ACCESS_DENIED",
      );

    case "INVALID_ACCESS_CONTEXT":
    case "CONFIGURATION_ERROR":
    case "TRANSACTION_ERROR":
    case "AUTHORIZATION_URL_ERROR":
    default:
      return jsonError(
        500,
        "GOOGLE_ADS_OAUTH_START_FAILED",
      );
  }
}

export async function POST(
  request: Request,
) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError(
        400,
        "INVALID_JSON_BODY",
      );
    }

    const startRequest =
      parseGoogleAdsOAuthStartRequest(body);

    const access =
      await resolveAdvertiserMediaConnectionAccess({
        request,
        advertiserId:
          startRequest.advertiserId,
        action: "manage_connections",
      });

    const prepared =
      prepareGoogleAdsOAuthStart({
        request: startRequest,
        access: {
          userId: access.userId,
          workspaceId: access.workspaceId,
          advertiserId: access.advertiserId,
          canManageConnections:
            access.canManageConnections,
        },
      });

    const response = NextResponse.json(
      {
        ok: true,
        authorization_url:
          prepared.authorizationUrl,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );

    response.cookies.set(
      prepared.cookie.name,
      prepared.cookie.value,
      prepared.cookie.options,
    );

    return response;
  } catch (error) {
    if (
      error instanceof MediaConnectionAccessError
    ) {
      return accessErrorResponse(
        mapMediaConnectionAccessRouteError({
          status: error.status,
          code: error.code,
        }),
      );
    }

    if (
      error instanceof GoogleAdsOAuthStartError
    ) {
      return startErrorResponse(error);
    }

    console.error(
      "[google-ads-oauth:start] Unexpected error",
    );

    return jsonError(
      500,
      "INTERNAL_ERROR",
    );
  }
}

import {
  MediaConnectionCredentialsReplacePolicyError,
  buildReplaceMediaConnectionCredentialsSuccessResponse,
  buildReplaceNaverSearchAdsCredentialsRepositoryInput,
  type MediaConnectionCredentialsReplaceAccessContext,
  type ReplaceMediaConnectionCredentialsSuccessResponse,
} from "./media-connection-credentials-replace-policy";
import {
  MediaConnectionRequestError,
  parseReplaceMediaConnectionCredentialsRequest,
  type ReplaceNaverSearchAdsCredentialsRequest,
} from "./media-connection-request";
import {
  MediaConnectionsRepositoryError,
  type UpdateNaverSearchAdsCredentialsInput,
} from "./media-connections-repository";
import {
  getUnexpectedMediaConnectionsRouteError,
  mapMediaConnectionRequestRouteError,
  mapMediaConnectionsRepositoryRouteError,
  type MediaConnectionAccessErrorLike,
  type MediaConnectionsRouteErrorResponse,
} from "./media-connections-route-policy";
import type { SafeMediaConnection } from "./types";

export const MEDIA_CONNECTION_CREDENTIALS_ROUTE_METHOD =
  "PATCH" as const;

export const MEDIA_CONNECTION_CREDENTIALS_ROUTE_ACTION =
  "manage_connections" as const;

export const MEDIA_CONNECTION_CREDENTIALS_ROUTE_SUCCESS_STATUS =
  200 as const;

export const MEDIA_CONNECTION_CREDENTIALS_ROUTE_PATTERN =
  "/api/advertisers/[id]/media-connections/[connectionId]/credentials" as const;

export type MediaConnectionCredentialsRouteAction =
  typeof MEDIA_CONNECTION_CREDENTIALS_ROUTE_ACTION;

export type MediaConnectionCredentialsRouteRequest = {
  action: MediaConnectionCredentialsRouteAction;
  request: ReplaceNaverSearchAdsCredentialsRequest;
};

export type MediaConnectionCredentialsRouteSuccessResponse = {
  status: typeof MEDIA_CONNECTION_CREDENTIALS_ROUTE_SUCCESS_STATUS;
  body: ReplaceMediaConnectionCredentialsSuccessResponse;
};

export type MediaConnectionCredentialsRouteInput = {
  advertiserId: unknown;
  connectionId: unknown;
  body: unknown;
};

export type MediaConnectionCredentialsRouteErrorLike =
  | MediaConnectionRequestError
  | MediaConnectionCredentialsReplacePolicyError
  | MediaConnectionsRepositoryError
  | MediaConnectionAccessErrorLike
  | unknown;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function isValidHttpErrorStatus(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
  );
}

function isMediaConnectionAccessErrorLike(
  value: unknown,
): value is MediaConnectionAccessErrorLike {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isValidHttpErrorStatus(value.status) &&
    typeof value.code === "string" &&
    Boolean(value.code.trim())
  );
}

/**
 * Credential 교체 PATCH route가 사용할 검증된 요청 계약을 만든다.
 *
 * 안전 원칙:
 * - advertiserId와 connectionId는 URL params만 사용한다.
 * - body의 workspaceId, advertiserId, connectionId, userId,
 *   createdBy 같은 임의 scope 값은 사용하지 않는다.
 * - provider와 credentials 검증은 기존 request parser에 위임한다.
 * - access action은 manage_connections로 고정한다.
 */
export function buildMediaConnectionCredentialsRouteRequest(
  input: MediaConnectionCredentialsRouteInput,
): MediaConnectionCredentialsRouteRequest {
  return {
    action: MEDIA_CONNECTION_CREDENTIALS_ROUTE_ACTION,
    request:
      parseReplaceMediaConnectionCredentialsRequest({
        advertiserId: input.advertiserId,
        connectionId: input.connectionId,
        body: input.body,
      }),
  };
}

/**
 * route가 repository에 전달할 입력을 만든다.
 *
 * workspaceId와 authorized advertiserId는 access resolver 결과만 사용하며,
 * 실제 scope 결합 검증은 기존 credential replacement policy가 수행한다.
 */
export function buildMediaConnectionCredentialsRouteRepositoryInput(
  access: MediaConnectionCredentialsReplaceAccessContext,
  routeRequest: MediaConnectionCredentialsRouteRequest,
): UpdateNaverSearchAdsCredentialsInput {
  if (
    routeRequest.action !==
    MEDIA_CONNECTION_CREDENTIALS_ROUTE_ACTION
  ) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "INVALID_ACCESS_CONTEXT",
      "The media connection route action is invalid.",
    );
  }

  return buildReplaceNaverSearchAdsCredentialsRepositoryInput(
    access,
    routeRequest.request,
  );
}

/**
 * repository의 SafeMediaConnection 결과를
 * credential 교체 PATCH 성공 응답으로 변환한다.
 */
export function buildMediaConnectionCredentialsRouteSuccessResponse(
  access: MediaConnectionCredentialsReplaceAccessContext,
  requestedConnectionId: string,
  connection: SafeMediaConnection,
): MediaConnectionCredentialsRouteSuccessResponse {
  return {
    status:
      MEDIA_CONNECTION_CREDENTIALS_ROUTE_SUCCESS_STATUS,
    body:
      buildReplaceMediaConnectionCredentialsSuccessResponse(
        access,
        requestedConnectionId,
        connection,
      ),
  };
}

/**
 * Request.json() 실패 시 사용할 고정 오류 계약이다.
 *
 * JSON parser의 원문 오류 메시지나 body 내용을 응답에 포함하지 않는다.
 */
export function getInvalidMediaConnectionCredentialsJsonRouteError(): MediaConnectionsRouteErrorResponse {
  return {
    status: 400,
    error: "INVALID_JSON_BODY",
  };
}

/**
 * credential replacement policy 오류를 HTTP 오류 계약으로 변환한다.
 */
export function mapMediaConnectionCredentialsReplacePolicyRouteError(
  error: MediaConnectionCredentialsReplacePolicyError,
): MediaConnectionsRouteErrorResponse {
  if (error.code === "INVALID_ACCESS_CONTEXT") {
    return {
      status: 403,
      error: "MEDIA_CONNECTION_MANAGEMENT_FORBIDDEN",
    };
  }

  if (
    error.code === "ADVERTISER_SCOPE_MISMATCH" ||
    error.code === "CONNECTION_SCOPE_MISMATCH"
  ) {
    return {
      status: 404,
      error: "CONNECTION_NOT_FOUND",
    };
  }

  return {
    status: 500,
    error: "UNSAFE_MEDIA_CONNECTION_RESPONSE",
  };
}

/**
 * credential 교체 route에서 발생 가능한 알려진 오류를
 * 기존 공용 route 오류 계약과 credential 전용 정책에 맞게 매핑한다.
 *
 * 오류 객체의 message, cause, Supabase detail, credential 값은
 * 공개 응답으로 전달하지 않는다.
 */
export function mapMediaConnectionCredentialsRouteError(
  error: MediaConnectionCredentialsRouteErrorLike,
): MediaConnectionsRouteErrorResponse {
  if (
    error instanceof
    MediaConnectionCredentialsReplacePolicyError
  ) {
    return mapMediaConnectionCredentialsReplacePolicyRouteError(
      error,
    );
  }

  if (error instanceof MediaConnectionRequestError) {
    return mapMediaConnectionRequestRouteError(
      error.code,
    );
  }

  if (
    error instanceof
    MediaConnectionsRepositoryError
  ) {
    return mapMediaConnectionsRepositoryRouteError(
      error.code,
    );
  }

  if (isMediaConnectionAccessErrorLike(error)) {
    return {
      status: error.status,
      error: error.code.trim(),
    };
  }

  return getUnexpectedMediaConnectionsRouteError();
}
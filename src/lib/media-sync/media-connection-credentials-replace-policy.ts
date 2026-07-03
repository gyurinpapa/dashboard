import {
  assertSafeMediaConnectionPayload,
  type ReplaceNaverSearchAdsCredentialsRequest,
} from "./media-connection-request";
import type { MediaConnectionAccessScope } from "./media-connection-access-policy";
import type { UpdateNaverSearchAdsCredentialsInput } from "./media-connections-repository";
import type { SafeMediaConnection } from "./types";

const MAX_CONTEXT_ID_LENGTH = 200;

export type MediaConnectionCredentialsReplacePolicyErrorCode =
  | "INVALID_ACCESS_CONTEXT"
  | "ADVERTISER_SCOPE_MISMATCH"
  | "CONNECTION_SCOPE_MISMATCH"
  | "UNSAFE_RESPONSE";

export class MediaConnectionCredentialsReplacePolicyError extends Error {
  readonly code: MediaConnectionCredentialsReplacePolicyErrorCode;

  constructor(
    code: MediaConnectionCredentialsReplacePolicyErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name =
      "MediaConnectionCredentialsReplacePolicyError";
    this.code = code;
  }
}

export type MediaConnectionCredentialsReplaceAccessContext = {
  userId: string;
  workspaceId: string;
  advertiserId: string;
  accessScope: MediaConnectionAccessScope;
  canManageConnections: boolean;
};

export type ReplaceMediaConnectionCredentialsSuccessResponse = {
  ok: true;
  advertiser_id: string;
  workspace_id: string;
  access_scope: MediaConnectionAccessScope;
  connection: SafeMediaConnection;
};

function normalizeRequiredContextString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    normalizedValue.length >
    MAX_CONTEXT_ID_LENGTH
  ) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

/**
 * Credential 교체 route가 repository에 전달할 입력을 만든다.
 *
 * 안전 원칙:
 * - workspaceId는 request body가 아닌 access 결과에서만 가져온다.
 * - advertiserId는 URL 검증 결과와 access 결과가 일치해야 한다.
 * - connectionId와 credential은 검증된 request parser 결과만 사용한다.
 * - createdBy 또는 임의 userId는 repository 입력에 전달하지 않는다.
 * - manage_connections 권한이 없으면 repository 입력을 생성하지 않는다.
 */
export function buildReplaceNaverSearchAdsCredentialsRepositoryInput(
  access: MediaConnectionCredentialsReplaceAccessContext,
  request: ReplaceNaverSearchAdsCredentialsRequest,
): UpdateNaverSearchAdsCredentialsInput {
  normalizeRequiredContextString(
    access.userId,
    "access.userId",
  );

  const workspaceId =
    normalizeRequiredContextString(
      access.workspaceId,
      "access.workspaceId",
    );

  const accessAdvertiserId =
    normalizeRequiredContextString(
      access.advertiserId,
      "access.advertiserId",
    );

  const requestAdvertiserId =
    normalizeRequiredContextString(
      request.advertiserId,
      "request.advertiserId",
    );

  const connectionId =
    normalizeRequiredContextString(
      request.connectionId,
      "request.connectionId",
    );

  if (
    accessAdvertiserId !==
    requestAdvertiserId
  ) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "ADVERTISER_SCOPE_MISMATCH",
      "The request advertiser does not match the authorized advertiser scope.",
    );
  }

  if (!access.canManageConnections) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "INVALID_ACCESS_CONTEXT",
      "The access context does not permit media connection management.",
    );
  }

  return {
    connectionId,
    workspaceId,
    advertiserId: accessAdvertiserId,
    credentials: request.credentials,
  };
}

/**
 * repository가 반환한 SafeMediaConnection을
 * credential 교체 API의 공개 성공 응답으로 감싼다.
 */
export function buildReplaceMediaConnectionCredentialsSuccessResponse(
  access: MediaConnectionCredentialsReplaceAccessContext,
  requestedConnectionId: string,
  connection: SafeMediaConnection,
): ReplaceMediaConnectionCredentialsSuccessResponse {
  const workspaceId =
    normalizeRequiredContextString(
      access.workspaceId,
      "access.workspaceId",
    );

  const advertiserId =
    normalizeRequiredContextString(
      access.advertiserId,
      "access.advertiserId",
    );

  const connectionId =
    normalizeRequiredContextString(
      requestedConnectionId,
      "requestedConnectionId",
    );

  if (
    connection.workspace_id !== workspaceId ||
    connection.advertiser_id !== advertiserId
  ) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "ADVERTISER_SCOPE_MISMATCH",
      "The updated connection does not match the authorized advertiser scope.",
    );
  }

  if (connection.id !== connectionId) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "CONNECTION_SCOPE_MISMATCH",
      "The updated connection does not match the requested connection.",
    );
  }

  const response: ReplaceMediaConnectionCredentialsSuccessResponse =
    {
      ok: true,
      advertiser_id: advertiserId,
      workspace_id: workspaceId,
      access_scope: access.accessScope,
      connection,
    };

  try {
    assertSafeMediaConnectionPayload(
      response,
    );
  } catch (error) {
    throw new MediaConnectionCredentialsReplacePolicyError(
      "UNSAFE_RESPONSE",
      "The media connection response contains prohibited data.",
      { cause: error },
    );
  }

  return response;
}
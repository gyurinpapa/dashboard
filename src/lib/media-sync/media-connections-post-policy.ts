import {
  assertSafeMediaConnectionPayload,
  type CreateNaverSearchAdsConnectionRequest,
} from "./media-connection-request";
import type { MediaConnectionAccessScope } from "./media-connection-access-policy";
import type { CreateNaverSearchAdsConnectionInput } from "./media-connections-repository";
import type { SafeMediaConnection } from "./types";

const MAX_CONTEXT_ID_LENGTH = 200;

export type MediaConnectionsPostPolicyErrorCode =
  | "INVALID_ACCESS_CONTEXT"
  | "ADVERTISER_SCOPE_MISMATCH"
  | "UNSAFE_RESPONSE";

export class MediaConnectionsPostPolicyError extends Error {
  readonly code: MediaConnectionsPostPolicyErrorCode;

  constructor(
    code: MediaConnectionsPostPolicyErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaConnectionsPostPolicyError";
    this.code = code;
  }
}

export type MediaConnectionsPostAccessContext = {
  userId: string;
  workspaceId: string;
  advertiserId: string;
  accessScope: MediaConnectionAccessScope;
  canManageConnections: boolean;
};

export type CreateMediaConnectionSuccessResponse = {
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
    throw new MediaConnectionsPostPolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionsPostPolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > MAX_CONTEXT_ID_LENGTH) {
    throw new MediaConnectionsPostPolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

/**
 * POST route에서 repository에 전달할 값을 생성한다.
 *
 * 안전 원칙:
 * - workspaceId는 request body가 아니라 access 결과에서만 가져온다.
 * - createdBy는 request body가 아니라 인증된 userId에서만 가져온다.
 * - advertiserId는 URL 검증 결과와 access 결과가 정확히 일치해야 한다.
 * - credential은 검증된 request parser 결과만 전달한다.
 */
export function buildCreateNaverSearchAdsRepositoryInput(
  access: MediaConnectionsPostAccessContext,
  request: CreateNaverSearchAdsConnectionRequest,
): CreateNaverSearchAdsConnectionInput {
  const userId = normalizeRequiredContextString(
    access.userId,
    "access.userId",
  );

  const workspaceId = normalizeRequiredContextString(
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

  if (accessAdvertiserId !== requestAdvertiserId) {
    throw new MediaConnectionsPostPolicyError(
      "ADVERTISER_SCOPE_MISMATCH",
      "The request advertiser does not match the authorized advertiser scope.",
    );
  }

  if (!access.canManageConnections) {
    throw new MediaConnectionsPostPolicyError(
      "INVALID_ACCESS_CONTEXT",
      "The access context does not permit media connection management.",
    );
  }

  return {
    workspaceId,
    advertiserId: accessAdvertiserId,
    externalAccountId: request.externalAccountId,
    externalAccountName: request.externalAccountName,
    credentials: request.credentials,
    createdBy: userId,
    meta: request.meta,
  };
}

/**
 * repository가 반환한 SafeMediaConnection을
 * POST API 공개 응답 형태로 감싼다.
 */
export function buildCreateMediaConnectionSuccessResponse(
  access: MediaConnectionsPostAccessContext,
  connection: SafeMediaConnection,
): CreateMediaConnectionSuccessResponse {
  const workspaceId = normalizeRequiredContextString(
    access.workspaceId,
    "access.workspaceId",
  );

  const advertiserId = normalizeRequiredContextString(
    access.advertiserId,
    "access.advertiserId",
  );

  if (
    connection.workspace_id !== workspaceId ||
    connection.advertiser_id !== advertiserId
  ) {
    throw new MediaConnectionsPostPolicyError(
      "ADVERTISER_SCOPE_MISMATCH",
      "The created connection does not match the authorized advertiser scope.",
    );
  }

  const response: CreateMediaConnectionSuccessResponse = {
    ok: true,
    advertiser_id: advertiserId,
    workspace_id: workspaceId,
    access_scope: access.accessScope,
    connection,
  };

  try {
    assertSafeMediaConnectionPayload(response);
  } catch (error) {
    throw new MediaConnectionsPostPolicyError(
      "UNSAFE_RESPONSE",
      "The media connection response contains prohibited data.",
      { cause: error },
    );
  }

  return response;
}
import type {
  MediaConnectionAccessScope,
} from "./media-connection-access-policy";
import type {
  CreatePendingMediaSyncJobInput,
  MediaSyncJobsRepositoryErrorCode,
} from "./media-sync-jobs-repository";
import {
  assertSafeMediaSyncJobPayload,
  type CreateMediaSyncJobRequest,
  type CreateMediaSyncJobResponse,
  type MediaSyncJobRequestErrorCode,
} from "./media-sync-job-request";
import type {
  SafeMediaSyncJob,
} from "./types";

export type MediaSyncJobsRouteErrorResponse = {
  status: number;
  error: string;
};

export type MediaSyncJobAccessErrorLike = {
  status: number;
  code: string;
};

export type MediaSyncJobRouteAccessContext = {
  userId: string;
  reportId: string;
  workspaceId: string;
  advertiserId: string;
  accessScope: MediaConnectionAccessScope;
  canRunSync: boolean;
};

export type CreateMediaSyncJobRouteResult = {
  status: 201;
  body: CreateMediaSyncJobResponse;
};

export type MediaSyncJobsRoutePolicyErrorCode =
  | "INVALID_ACCESS_CONTEXT"
  | "REPORT_SCOPE_MISMATCH"
  | "MEDIA_SYNC_ACCESS_DENIED"
  | "UNSAFE_RESPONSE";

export class MediaSyncJobsRoutePolicyError extends Error {
  readonly code: MediaSyncJobsRoutePolicyErrorCode;

  constructor(
    code: MediaSyncJobsRoutePolicyErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaSyncJobsRoutePolicyError";
    this.code = code;
  }
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

function normalizeErrorCode(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalizedValue = value.trim();

  return normalizedValue || fallback;
}

function normalizeRequiredContextString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new MediaSyncJobsRoutePolicyError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} is invalid.`,
    );
  }

  return value.trim();
}

function assertAccessContext(
  access: MediaSyncJobRouteAccessContext,
): void {
  normalizeRequiredContextString(
    access.userId,
    "access.userId",
  );

  normalizeRequiredContextString(
    access.reportId,
    "access.reportId",
  );

  normalizeRequiredContextString(
    access.workspaceId,
    "access.workspaceId",
  );

  normalizeRequiredContextString(
    access.advertiserId,
    "access.advertiserId",
  );

  normalizeRequiredContextString(
    access.accessScope,
    "access.accessScope",
  );

  if (!access.canRunSync) {
    throw new MediaSyncJobsRoutePolicyError(
      "MEDIA_SYNC_ACCESS_DENIED",
      "The access context does not allow media synchronization.",
    );
  }
}

export function buildCreatePendingMediaSyncJobRepositoryInput(
  access: MediaSyncJobRouteAccessContext,
  request: CreateMediaSyncJobRequest,
): CreatePendingMediaSyncJobInput {
  assertAccessContext(access);

  if (
    access.reportId !== request.reportId
  ) {
    throw new MediaSyncJobsRoutePolicyError(
      "REPORT_SCOPE_MISMATCH",
      "The authorized report does not match the requested report.",
    );
  }

  return {
    reportId: access.reportId,
    connectionId:
      request.connectionId,

    workspaceId:
      access.workspaceId,
    advertiserId:
      access.advertiserId,

    createdBy: access.userId,

    dateFrom: request.dateFrom,
    dateTo: request.dateTo,

    dataLevel: request.dataLevel,
    mode: request.mode,
  };
}

export function buildCreateMediaSyncJobSuccessResponse(
  access: MediaSyncJobRouteAccessContext,
  request: CreateMediaSyncJobRequest,
  job: SafeMediaSyncJob,
): CreateMediaSyncJobRouteResult {
  assertAccessContext(access);

  if (
    access.reportId !==
      request.reportId ||
    job.report_id !==
      access.reportId ||
    job.workspace_id !==
      access.workspaceId ||
    job.advertiser_id !==
      access.advertiserId ||
    job.connection_id !==
      request.connectionId ||
    job.created_by !==
      access.userId
  ) {
    throw new MediaSyncJobsRoutePolicyError(
      "REPORT_SCOPE_MISMATCH",
      "The created media sync job does not match the authorized scope.",
    );
  }

  const body: CreateMediaSyncJobResponse = {
    ok: true,
    report_id: access.reportId,
    workspace_id:
      access.workspaceId,
    advertiser_id:
      access.advertiserId,
    access_scope:
      access.accessScope,
    job,
  };

  try {
    assertSafeMediaSyncJobPayload(body);
  } catch (error) {
    throw new MediaSyncJobsRoutePolicyError(
      "UNSAFE_RESPONSE",
      "The media sync job response is unsafe.",
      { cause: error },
    );
  }

  return {
    status: 201,
    body,
  };
}

export function mapMediaSyncJobAccessRouteError(
  error: MediaSyncJobAccessErrorLike,
): MediaSyncJobsRouteErrorResponse {
  return {
    status: isValidHttpErrorStatus(
      error.status,
    )
      ? error.status
      : 500,
    error: normalizeErrorCode(
      error.code,
      "MEDIA_SYNC_ACCESS_ERROR",
    ),
  };
}

export function mapMediaSyncJobRequestRouteError(
  code: MediaSyncJobRequestErrorCode,
): MediaSyncJobsRouteErrorResponse {
  if (code === "INVALID_INPUT") {
    return {
      status: 400,
      error: "INVALID_INPUT",
    };
  }

  if (code === "UNSUPPORTED_MODE") {
    return {
      status: 400,
      error: "UNSUPPORTED_MODE",
    };
  }

  return {
    status: 500,
    error: "UNSAFE_MEDIA_SYNC_JOB_RESPONSE",
  };
}

export function mapMediaSyncJobsRepositoryRouteError(
  code: MediaSyncJobsRepositoryErrorCode,
): MediaSyncJobsRouteErrorResponse {
  if (code === "INVALID_INPUT") {
    return {
      status: 400,
      error: "INVALID_INPUT",
    };
  }

  if (code === "REPORT_NOT_FOUND") {
    return {
      status: 404,
      error: "REPORT_NOT_FOUND",
    };
  }

  if (code === "CONNECTION_NOT_FOUND") {
    return {
      status: 404,
      error: "CONNECTION_NOT_FOUND",
    };
  }

  if (code === "CONNECTION_NOT_ACTIVE") {
    return {
      status: 409,
      error: "CONNECTION_NOT_ACTIVE",
    };
  }

  if (
    code ===
    "REPORT_CONNECTION_NOT_MAPPED"
  ) {
    return {
      status: 409,
      error:
        "REPORT_CONNECTION_NOT_MAPPED",
    };
  }

  if (
    code === "PROVIDER_SYNC_NOT_ENABLED" ||
    code ===
      "PROVIDER_DATA_LEVEL_NOT_SUPPORTED"
  ) {
    return {
      status: 409,
      error: code,
    };
  }

  if (
    code ===
    "ACTIVE_JOB_ALREADY_EXISTS"
  ) {
    return {
      status: 409,
      error:
        "ACTIVE_JOB_ALREADY_EXISTS",
    };
  }

  if (
    code === "REPORT_SCOPE_MISMATCH" ||
    code ===
      "CONNECTION_SCOPE_MISMATCH"
  ) {
    return {
      status: 403,
      error: code,
    };
  }

  if (code === "INVALID_RECORD") {
    return {
      status: 500,
      error: "INVALID_RECORD",
    };
  }

  return {
    status: 500,
    error:
      "MEDIA_SYNC_JOB_DATABASE_ERROR",
  };
}

export function mapMediaSyncJobsRoutePolicyError(
  code: MediaSyncJobsRoutePolicyErrorCode,
): MediaSyncJobsRouteErrorResponse {
  if (
    code ===
    "MEDIA_SYNC_ACCESS_DENIED"
  ) {
    return {
      status: 403,
      error:
        "MEDIA_SYNC_ACCESS_DENIED",
    };
  }

  if (
    code ===
    "REPORT_SCOPE_MISMATCH"
  ) {
    return {
      status: 403,
      error:
        "REPORT_SCOPE_MISMATCH",
    };
  }

  if (code === "UNSAFE_RESPONSE") {
    return {
      status: 500,
      error:
        "UNSAFE_MEDIA_SYNC_JOB_RESPONSE",
    };
  }

  return {
    status: 500,
    error: "INTERNAL_ERROR",
  };
}

export function getInvalidMediaSyncJobJsonRouteError(): MediaSyncJobsRouteErrorResponse {
  return {
    status: 400,
    error: "INVALID_JSON_BODY",
  };
}

export function getUnexpectedMediaSyncJobsRouteError(): MediaSyncJobsRouteErrorResponse {
  return {
    status: 500,
    error: "INTERNAL_ERROR",
  };
}

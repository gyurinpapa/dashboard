export type MediaConnectionsRouteErrorResponse = {
  status: number;
  error: string;
};

export type MediaConnectionAccessErrorLike = {
  status: number;
  code: string;
};

export type MediaConnectionsRepositoryErrorCodeLike =
  | "INVALID_INPUT"
  | "INVALID_RECORD"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_ALREADY_EXISTS"
  | "UNSUPPORTED_PROVIDER"
  | "DATABASE_ERROR"
  | "ENCRYPTION_ERROR"
  | "DECRYPTION_ERROR"
  | string;

export type MediaConnectionRequestErrorCodeLike =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PROVIDER"
  | "UNSAFE_RESPONSE"
  | string;

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

export function mapMediaConnectionAccessRouteError(
  error: MediaConnectionAccessErrorLike,
): MediaConnectionsRouteErrorResponse {
  return {
    status: isValidHttpErrorStatus(error.status)
      ? error.status
      : 500,
    error: normalizeErrorCode(
      error.code,
      "MEDIA_CONNECTION_ACCESS_ERROR",
    ),
  };
}

export function mapMediaConnectionsRepositoryRouteError(
  code: MediaConnectionsRepositoryErrorCodeLike,
): MediaConnectionsRouteErrorResponse {
  if (code === "INVALID_INPUT") {
    return {
      status: 400,
      error: "INVALID_INPUT",
    };
  }

  if (code === "CONNECTION_NOT_FOUND") {
    return {
      status: 404,
      error: "CONNECTION_NOT_FOUND",
    };
  }

  if (code === "CONNECTION_ALREADY_EXISTS") {
    return {
      status: 409,
      error: "CONNECTION_ALREADY_EXISTS",
    };
  }

  if (code === "UNSUPPORTED_PROVIDER") {
    return {
      status: 400,
      error: "UNSUPPORTED_PROVIDER",
    };
  }

  if (code === "INVALID_RECORD") {
    return {
      status: 500,
      error: "INVALID_RECORD",
    };
  }

  if (code === "ENCRYPTION_ERROR") {
    return {
      status: 500,
      error: "ENCRYPTION_ERROR",
    };
  }

  if (code === "DECRYPTION_ERROR") {
    return {
      status: 500,
      error: "DECRYPTION_ERROR",
    };
  }

  return {
    status: 500,
    error: "MEDIA_CONNECTION_DATABASE_ERROR",
  };
}

export function mapMediaConnectionRequestRouteError(
  code: MediaConnectionRequestErrorCodeLike,
): MediaConnectionsRouteErrorResponse {
  if (code === "INVALID_INPUT") {
    return {
      status: 400,
      error: "INVALID_INPUT",
    };
  }

  if (code === "UNSUPPORTED_PROVIDER") {
    return {
      status: 400,
      error: "UNSUPPORTED_PROVIDER",
    };
  }

  return {
    status: 500,
    error: "UNSAFE_MEDIA_CONNECTION_RESPONSE",
  };
}

export function getUnexpectedMediaConnectionsRouteError(): MediaConnectionsRouteErrorResponse {
  return {
    status: 500,
    error: "INTERNAL_ERROR",
  };
}
import {
  GOOGLE_ADS_OAUTH_SCOPE,
  GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
  type GoogleAdsOAuthConfig,
} from "./google-ads-oauth-config";
import {
  GOOGLE_ADS_OAUTH_TOKEN_REQUEST_TIMEOUT_MS,
} from "./google-ads-oauth";

const MAX_CLIENT_VALUE_LENGTH = 10_000;
const MAX_REFRESH_TOKEN_LENGTH = 20_000;
const MAX_ACCESS_TOKEN_LENGTH = 20_000;

export const GOOGLE_ADS_ACCESS_TOKEN_REFRESH_TIMEOUT_MS =
  GOOGLE_ADS_OAUTH_TOKEN_REQUEST_TIMEOUT_MS;

export type GoogleAdsOAuthClientCredentials = Pick<
  GoogleAdsOAuthConfig,
  "clientId" | "clientSecret"
>;

export type GoogleAdsAccessTokenRefreshRequest = {
  endpoint: string;
  method: "POST";
  headers: {
    "Content-Type": "application/x-www-form-urlencoded";
  };
  body: URLSearchParams;
};

export type GoogleAdsRefreshedAccessToken = {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  scopes: string[];
};

export type GoogleAdsAccessTokenRefreshErrorCode =
  | "INVALID_INPUT"
  | "TOKEN_HTTP_ERROR"
  | "TOKEN_REQUEST_TIMEOUT"
  | "TOKEN_REQUEST_FAILED"
  | "INVALID_TOKEN_RESPONSE"
  | "REQUIRED_SCOPE_MISSING";

export class GoogleAdsAccessTokenRefreshError extends Error {
  readonly code: GoogleAdsAccessTokenRefreshErrorCode;
  readonly status: number | null;

  constructor(
    code: GoogleAdsAccessTokenRefreshErrorCode,
    message: string,
    options?: {
      status?: number | null;
    },
  ) {
    super(message);

    this.name = "GoogleAdsAccessTokenRefreshError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}

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

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errorCode:
    | "INVALID_INPUT"
    | "INVALID_TOKEN_RESPONSE",
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsAccessTokenRefreshError(
      errorCode,
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsAccessTokenRefreshError(
      errorCode,
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsAccessTokenRefreshError(
      errorCode,
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeTimeoutMs(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 60_000
  ) {
    throw new GoogleAdsAccessTokenRefreshError(
      "INVALID_INPUT",
      "tokenRequestTimeoutMs must be an integer between 1 and 60000.",
    );
  }

  return value;
}

function parsePositiveInteger(
  value: unknown,
  fieldName: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new GoogleAdsAccessTokenRefreshError(
      "INVALID_TOKEN_RESPONSE",
      `${fieldName} must be a positive integer.`,
    );
  }

  return value;
}

function parseGrantedScopes(
  value: unknown,
): string[] {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return [];
  }

  if (typeof value !== "string") {
    throw new GoogleAdsAccessTokenRefreshError(
      "INVALID_TOKEN_RESPONSE",
      "scope must be a string when present.",
    );
  }

  const scopes = Array.from(
    new Set(
      value
        .split(/\s+/u)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  );

  if (
    scopes.length > 0 &&
    !scopes.includes(GOOGLE_ADS_OAUTH_SCOPE)
  ) {
    throw new GoogleAdsAccessTokenRefreshError(
      "REQUIRED_SCOPE_MISSING",
      "Google OAuth refresh response does not include the required Google Ads scope.",
    );
  }

  return scopes;
}

export function buildGoogleAdsAccessTokenRefreshRequest(
  input: {
    config: GoogleAdsOAuthClientCredentials;
    refreshToken: string;
  },
): GoogleAdsAccessTokenRefreshRequest {
  const clientId = normalizeRequiredString(
    input.config.clientId,
    "clientId",
    MAX_CLIENT_VALUE_LENGTH,
    "INVALID_INPUT",
  );

  const clientSecret = normalizeRequiredString(
    input.config.clientSecret,
    "clientSecret",
    MAX_CLIENT_VALUE_LENGTH,
    "INVALID_INPUT",
  );

  const refreshToken = normalizeRequiredString(
    input.refreshToken,
    "refreshToken",
    MAX_REFRESH_TOKEN_LENGTH,
    "INVALID_INPUT",
  );

  const body = new URLSearchParams();

  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  return {
    endpoint: GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded",
    },
    body,
  };
}

export function parseGoogleAdsAccessTokenRefreshResponse(
  value: unknown,
): GoogleAdsRefreshedAccessToken {
  if (!isPlainObject(value)) {
    throw new GoogleAdsAccessTokenRefreshError(
      "INVALID_TOKEN_RESPONSE",
      "Google OAuth refresh response is invalid.",
    );
  }

  const accessToken = normalizeRequiredString(
    value.access_token,
    "access_token",
    MAX_ACCESS_TOKEN_LENGTH,
    "INVALID_TOKEN_RESPONSE",
  );

  if (value.token_type !== "Bearer") {
    throw new GoogleAdsAccessTokenRefreshError(
      "INVALID_TOKEN_RESPONSE",
      "Google OAuth token_type is invalid.",
    );
  }

  return {
    accessToken,
    expiresIn: parsePositiveInteger(
      value.expires_in,
      "expires_in",
    ),
    tokenType: "Bearer",
    scopes: parseGrantedScopes(value.scope),
  };
}

export async function refreshGoogleAdsAccessToken(
  input: {
    config: GoogleAdsOAuthClientCredentials;
    refreshToken: string;
  },
  fetchImpl: typeof fetch = fetch,
  tokenRequestTimeoutMs =
    GOOGLE_ADS_ACCESS_TOKEN_REFRESH_TIMEOUT_MS,
): Promise<GoogleAdsRefreshedAccessToken> {
  const request =
    buildGoogleAdsAccessTokenRefreshRequest(input);

  const timeoutMs =
    normalizeTimeoutMs(tokenRequestTimeoutMs);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetchImpl(
        request.endpoint,
        {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: abortController.signal,
        },
      );
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new GoogleAdsAccessTokenRefreshError(
          "TOKEN_REQUEST_TIMEOUT",
          "Google OAuth access-token refresh request timed out.",
        );
      }

      throw new GoogleAdsAccessTokenRefreshError(
        "TOKEN_REQUEST_FAILED",
        "Google OAuth access-token refresh request failed.",
      );
    }

    if (!response.ok) {
      if (response.body) {
        try {
          await response.body.cancel();
        } catch {
          // Ignore response-body cleanup failures.
        }
      }

      throw new GoogleAdsAccessTokenRefreshError(
        "TOKEN_HTTP_ERROR",
        "Google OAuth access-token refresh returned an unsuccessful response.",
        {
          status: response.status,
        },
      );
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new GoogleAdsAccessTokenRefreshError(
          "TOKEN_REQUEST_TIMEOUT",
          "Google OAuth access-token refresh response timed out.",
        );
      }

      throw new GoogleAdsAccessTokenRefreshError(
        "INVALID_TOKEN_RESPONSE",
        "Google OAuth access-token refresh response is not valid JSON.",
      );
    }

    return parseGoogleAdsAccessTokenRefreshResponse(
      body,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

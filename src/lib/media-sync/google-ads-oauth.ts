import {
  GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT,
  GOOGLE_ADS_OAUTH_SCOPE,
  GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT,
  type GoogleAdsOAuthConfig,
} from "./google-ads-oauth-config";
import {
  assertGoogleAdsOAuthStateMatches,
  deriveGoogleAdsPkceCodeChallenge,
  type GoogleAdsOAuthTransaction,
} from "./google-ads-oauth-transaction";

const MAX_AUTHORIZATION_CODE_LENGTH = 10_000;
const MAX_OAUTH_ERROR_LENGTH = 500;
export const GOOGLE_ADS_OAUTH_TOKEN_REQUEST_TIMEOUT_MS = 10_000;

export type GoogleAdsAuthorizationUrlInput = {
  config: GoogleAdsOAuthConfig;
  transaction: GoogleAdsOAuthTransaction;
  forceConsent?: boolean;
};

export type GoogleAdsOAuthCallbackResult = {
  code: string;
  state: string;
};

export type GoogleAdsAuthorizationCodeTokenRequest = {
  endpoint: string;
  method: "POST";
  headers: {
    "Content-Type": "application/x-www-form-urlencoded";
  };
  body: URLSearchParams;
};

export type GoogleAdsOAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  scopes: string[];
};

export type GoogleAdsOAuthErrorCode =
  | "INVALID_INPUT"
  | "AUTHORIZATION_DENIED"
  | "STATE_MISMATCH"
  | "TOKEN_HTTP_ERROR"
  | "TOKEN_REQUEST_TIMEOUT"
  | "TOKEN_REQUEST_FAILED"
  | "INVALID_TOKEN_RESPONSE"
  | "REFRESH_TOKEN_MISSING"
  | "REQUIRED_SCOPE_MISSING";

export class GoogleAdsOAuthError extends Error {
  readonly code: GoogleAdsOAuthErrorCode;
  readonly status: number | null;

  constructor(
    code: GoogleAdsOAuthErrorCode,
    message: string,
    options?: ErrorOptions & {
      status?: number | null;
    },
  ) {
    super(message, options);

    this.name = "GoogleAdsOAuthError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsOAuthError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
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

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

function normalizeTokenRequestTimeoutMs(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 60_000
  ) {
    throw new GoogleAdsOAuthError(
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
    throw new GoogleAdsOAuthError(
      "INVALID_TOKEN_RESPONSE",
      `${fieldName} is invalid.`,
    );
  }

  return value;
}

function parseGrantedScopes(value: unknown): string[] {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthError(
      "INVALID_TOKEN_RESPONSE",
      "OAuth token response scope is invalid.",
    );
  }

  const scopes = value
    .split(/\s+/u)
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (!scopes.includes(GOOGLE_ADS_OAUTH_SCOPE)) {
    throw new GoogleAdsOAuthError(
      "REQUIRED_SCOPE_MISSING",
      "Google Ads OAuth scope was not granted.",
    );
  }

  return scopes;
}

export function buildGoogleAdsAuthorizationUrl(
  input: GoogleAdsAuthorizationUrlInput,
): string {
  const codeChallenge =
    deriveGoogleAdsPkceCodeChallenge(
      input.transaction.code_verifier,
    );

  const url = new URL(
    GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT,
  );

  url.searchParams.set(
    "client_id",
    input.config.clientId,
  );
  url.searchParams.set(
    "redirect_uri",
    input.config.redirectUri,
  );
  url.searchParams.set(
    "response_type",
    "code",
  );
  url.searchParams.set(
    "scope",
    GOOGLE_ADS_OAUTH_SCOPE,
  );
  url.searchParams.set(
    "access_type",
    "offline",
  );
  url.searchParams.set(
    "state",
    input.transaction.state,
  );
  url.searchParams.set(
    "code_challenge",
    codeChallenge,
  );
  url.searchParams.set(
    "code_challenge_method",
    "S256",
  );

  if (input.forceConsent === true) {
    url.searchParams.set(
      "prompt",
      "consent",
    );
  }

  return url.toString();
}

export function parseGoogleAdsOAuthCallbackQuery(
  searchParams: URLSearchParams,
): GoogleAdsOAuthCallbackResult {
  const oauthError = searchParams
    .get("error")
    ?.trim();

  if (oauthError) {
    throw new GoogleAdsOAuthError(
      "AUTHORIZATION_DENIED",
      "Google OAuth authorization was not completed.",
    );
  }

  const code = normalizeRequiredString(
    searchParams.get("code"),
    "code",
    MAX_AUTHORIZATION_CODE_LENGTH,
  );
  const state = normalizeRequiredString(
    searchParams.get("state"),
    "state",
    MAX_OAUTH_ERROR_LENGTH,
  );

  return {
    code,
    state,
  };
}

export function assertGoogleAdsOAuthCallbackState(
  transaction: GoogleAdsOAuthTransaction,
  callback: GoogleAdsOAuthCallbackResult,
): void {
  try {
    assertGoogleAdsOAuthStateMatches(
      transaction.state,
      callback.state,
    );
  } catch (error) {
    throw new GoogleAdsOAuthError(
      "STATE_MISMATCH",
      "Google OAuth callback state does not match the initiating transaction.",
      { cause: error },
    );
  }
}

export function buildGoogleAdsAuthorizationCodeTokenRequest(
  input: {
    config: GoogleAdsOAuthConfig;
    code: string;
    codeVerifier: string;
  },
): GoogleAdsAuthorizationCodeTokenRequest {
  const code = normalizeRequiredString(
    input.code,
    "code",
    MAX_AUTHORIZATION_CODE_LENGTH,
  );
  const codeVerifier = normalizeRequiredString(
    input.codeVerifier,
    "codeVerifier",
    128,
  );

  const body = new URLSearchParams();

  body.set("client_id", input.config.clientId);
  body.set(
    "client_secret",
    input.config.clientSecret,
  );
  body.set("code", code);
  body.set(
    "grant_type",
    "authorization_code",
  );
  body.set(
    "redirect_uri",
    input.config.redirectUri,
  );
  body.set(
    "code_verifier",
    codeVerifier,
  );

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

export function parseGoogleAdsOAuthTokenResponse(
  value: unknown,
): GoogleAdsOAuthTokenSet {
  if (!isPlainObject(value)) {
    throw new GoogleAdsOAuthError(
      "INVALID_TOKEN_RESPONSE",
      "Google OAuth token response is invalid.",
    );
  }

  const accessToken = normalizeRequiredString(
    value.access_token,
    "access_token",
    20_000,
  );

  const refreshTokenValue = value.refresh_token;

  if (
    typeof refreshTokenValue !== "string" ||
    !refreshTokenValue.trim()
  ) {
    throw new GoogleAdsOAuthError(
      "REFRESH_TOKEN_MISSING",
      "Google OAuth token response does not contain a refresh token.",
    );
  }

  const refreshToken =
    normalizeRequiredString(
      refreshTokenValue,
      "refresh_token",
      20_000,
    );

  if (value.token_type !== "Bearer") {
    throw new GoogleAdsOAuthError(
      "INVALID_TOKEN_RESPONSE",
      "Google OAuth token_type is invalid.",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: parsePositiveInteger(
      value.expires_in,
      "expires_in",
    ),
    tokenType: "Bearer",
    scopes: parseGrantedScopes(value.scope),
  };
}

export async function exchangeGoogleAdsAuthorizationCode(
  input: {
    config: GoogleAdsOAuthConfig;
    code: string;
    codeVerifier: string;
  },
  fetchImpl: typeof fetch = fetch,
  tokenRequestTimeoutMs =
    GOOGLE_ADS_OAUTH_TOKEN_REQUEST_TIMEOUT_MS,
): Promise<GoogleAdsOAuthTokenSet> {
  const request =
    buildGoogleAdsAuthorizationCodeTokenRequest(
      input,
    );
  const timeoutMs =
    normalizeTokenRequestTimeoutMs(
      tokenRequestTimeoutMs,
    );

  const abortController =
    new AbortController();
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
          cache: "no-store",
          signal: abortController.signal,
        },
      );
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new GoogleAdsOAuthError(
          "TOKEN_REQUEST_TIMEOUT",
          "Google OAuth token request timed out.",
          { cause: error },
        );
      }

      throw new GoogleAdsOAuthError(
        "TOKEN_REQUEST_FAILED",
        "Google OAuth token request failed.",
        { cause: error },
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

      throw new GoogleAdsOAuthError(
        "TOKEN_HTTP_ERROR",
        "Google OAuth token endpoint returned an unsuccessful response.",
        { status: response.status },
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
        throw new GoogleAdsOAuthError(
          "TOKEN_REQUEST_TIMEOUT",
          "Google OAuth token response timed out.",
          { cause: error },
        );
      }

      throw new GoogleAdsOAuthError(
        "INVALID_TOKEN_RESPONSE",
        "Google OAuth token endpoint returned invalid JSON.",
        { cause: error },
      );
    }

    return parseGoogleAdsOAuthTokenResponse(body);
  } finally {
    clearTimeout(timeoutId);
  }
}

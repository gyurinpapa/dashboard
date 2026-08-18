import {
  GoogleAdsOAuthConfigError,
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
  readGoogleAdsOAuthConfig,
} from "./google-ads-oauth-config";
import {
  GoogleAdsOAuthTransactionError,
  GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
  createGoogleAdsOAuthTransaction,
  encryptGoogleAdsOAuthTransaction,
  getGoogleAdsOAuthTransactionCookieOptions,
  type GoogleAdsOAuthTransactionCookieOptions,
} from "./google-ads-oauth-transaction";
import {
  GoogleAdsOAuthError,
  buildGoogleAdsAuthorizationUrl,
} from "./google-ads-oauth";

const MAX_CONTEXT_ID_LENGTH = 200;

const EXPECTED_REQUEST_KEYS = new Set([
  "advertiserId",
  "targetCustomerId",
  "loginCustomerId",
]);

type UnknownRecord = Record<string, unknown>;

export type GoogleAdsOAuthStartRequest = Readonly<{
  advertiserId: string;
  targetCustomerId: string;
  loginCustomerId: string | null;
}>;

export type GoogleAdsOAuthStartAccessContext = Readonly<{
  userId: string;
  workspaceId: string;
  advertiserId: string;
  canManageConnections: boolean;
}>;

export type PreparedGoogleAdsOAuthStart = Readonly<{
  authorizationUrl: string;
  cookie: Readonly<{
    name: typeof GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME;
    value: string;
    options: GoogleAdsOAuthTransactionCookieOptions;
  }>;
}>;

export type GoogleAdsOAuthStartErrorCode =
  | "INVALID_INPUT"
  | "INVALID_ACCESS_CONTEXT"
  | "ADVERTISER_SCOPE_MISMATCH"
  | "ACCESS_DENIED"
  | "CONFIGURATION_ERROR"
  | "TRANSACTION_ERROR"
  | "AUTHORIZATION_URL_ERROR";

export class GoogleAdsOAuthStartError extends Error {
  readonly code: GoogleAdsOAuthStartErrorCode;

  constructor(
    code: GoogleAdsOAuthStartErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsOAuthStartError";
    this.code = code;
  }
}

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
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

function normalizeRequiredContextString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthStartError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > MAX_CONTEXT_ID_LENGTH) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeRequestAdvertiserId(
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthStartError(
      "INVALID_INPUT",
      "advertiserId must be a string.",
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_INPUT",
      "advertiserId must not be empty.",
    );
  }

  if (normalizedValue.length > MAX_CONTEXT_ID_LENGTH) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_INPUT",
      "advertiserId exceeds the maximum allowed length.",
    );
  }

  return normalizedValue;
}

export function parseGoogleAdsOAuthStartRequest(
  value: unknown,
): GoogleAdsOAuthStartRequest {
  if (!isPlainObject(value)) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_INPUT",
      "Google Ads OAuth start request must be a plain object.",
    );
  }

  for (const key of Object.keys(value)) {
    if (!EXPECTED_REQUEST_KEYS.has(key)) {
      throw new GoogleAdsOAuthStartError(
        "INVALID_INPUT",
        "Google Ads OAuth start request contains an unexpected field.",
      );
    }
  }

  let targetCustomerId: string;
  let loginCustomerId: string | null;

  try {
    targetCustomerId = normalizeGoogleAdsCustomerId(
      value.targetCustomerId,
      "targetCustomerId",
    );

    loginCustomerId =
      normalizeOptionalGoogleAdsCustomerId(
        value.loginCustomerId,
        "loginCustomerId",
      );
  } catch (error) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_INPUT",
      "Google Ads OAuth start request contains an invalid customer ID.",
      { cause: error },
    );
  }

  return Object.freeze({
    advertiserId:
      normalizeRequestAdvertiserId(
        value.advertiserId,
      ),
    targetCustomerId,
    loginCustomerId,
  });
}

function normalizeAccessContext(
  value: GoogleAdsOAuthStartAccessContext,
): GoogleAdsOAuthStartAccessContext {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new GoogleAdsOAuthStartError(
      "INVALID_ACCESS_CONTEXT",
      "Google Ads OAuth access context is invalid.",
    );
  }

  if (typeof value.canManageConnections !== "boolean") {
    throw new GoogleAdsOAuthStartError(
      "INVALID_ACCESS_CONTEXT",
      "canManageConnections must be a boolean.",
    );
  }

  return Object.freeze({
    userId: normalizeRequiredContextString(
      value.userId,
      "access.userId",
    ),
    workspaceId: normalizeRequiredContextString(
      value.workspaceId,
      "access.workspaceId",
    ),
    advertiserId: normalizeRequiredContextString(
      value.advertiserId,
      "access.advertiserId",
    ),
    canManageConnections:
      value.canManageConnections,
  });
}

export function prepareGoogleAdsOAuthStart(
  input: {
    request: GoogleAdsOAuthStartRequest;
    access: GoogleAdsOAuthStartAccessContext;
  },
  env: Readonly<Record<string, string | undefined>> =
    process.env,
  nowMs = Date.now(),
): PreparedGoogleAdsOAuthStart {
  const request =
    parseGoogleAdsOAuthStartRequest(
      input.request,
    );

  const access =
    normalizeAccessContext(input.access);

  if (request.advertiserId !== access.advertiserId) {
    throw new GoogleAdsOAuthStartError(
      "ADVERTISER_SCOPE_MISMATCH",
      "The request advertiser does not match the authorized advertiser scope.",
    );
  }

  if (!access.canManageConnections) {
    throw new GoogleAdsOAuthStartError(
      "ACCESS_DENIED",
      "The authorized user cannot manage media connections.",
    );
  }

  let config;

  try {
    config = readGoogleAdsOAuthConfig(env);
  } catch (error) {
    if (error instanceof GoogleAdsOAuthConfigError) {
      throw new GoogleAdsOAuthStartError(
        "CONFIGURATION_ERROR",
        "Google Ads OAuth is not configured correctly.",
        { cause: error },
      );
    }

    throw error;
  }

  let transaction;

  try {
    transaction =
      createGoogleAdsOAuthTransaction(
        {
          userId: access.userId,
          workspaceId: access.workspaceId,
          advertiserId: access.advertiserId,
          targetCustomerId:
            request.targetCustomerId,
          loginCustomerId:
            request.loginCustomerId,
        },
        nowMs,
      );
  } catch (error) {
    if (
      error instanceof
      GoogleAdsOAuthTransactionError
    ) {
      throw new GoogleAdsOAuthStartError(
        "TRANSACTION_ERROR",
        "Google Ads OAuth transaction could not be created.",
        { cause: error },
      );
    }

    throw error;
  }

  let encryptedTransaction: string;

  try {
    encryptedTransaction =
      encryptGoogleAdsOAuthTransaction(
        transaction,
      );
  } catch (error) {
    if (
      error instanceof
      GoogleAdsOAuthTransactionError
    ) {
      throw new GoogleAdsOAuthStartError(
        "TRANSACTION_ERROR",
        "Google Ads OAuth transaction could not be encrypted.",
        { cause: error },
      );
    }

    throw error;
  }

  let authorizationUrl: string;

  try {
    authorizationUrl =
      buildGoogleAdsAuthorizationUrl({
        config,
        transaction,
        forceConsent: true,
      });
  } catch (error) {
    if (error instanceof GoogleAdsOAuthError) {
      throw new GoogleAdsOAuthStartError(
        "AUTHORIZATION_URL_ERROR",
        "Google Ads authorization URL could not be created.",
        { cause: error },
      );
    }

    throw error;
  }

  const secureCookie =
    new URL(config.redirectUri).protocol ===
    "https:";

  return Object.freeze({
    authorizationUrl,
    cookie: Object.freeze({
      name:
        GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
      value: encryptedTransaction,
      options:
        getGoogleAdsOAuthTransactionCookieOptions(
          secureCookie,
        ),
    }),
  });
}

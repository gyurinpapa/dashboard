import {
  decryptMediaCredentialJson,
  encryptMediaCredentialJson,
  type MediaCredentialJsonObject,
} from "./crypto";
import {
  GOOGLE_ADS_PROVIDER,
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
} from "./google-ads-oauth-config";

export const GOOGLE_ADS_CREDENTIAL_VERSION = 1 as const;
export const GOOGLE_ADS_CREDENTIAL_AUTH_TYPE =
  "oauth_user" as const;

const GOOGLE_ADS_CREDENTIAL_AAD_NAMESPACE =
  "etrylue:google-ads-connection-credential:v1";
const MAX_CONTEXT_ID_LENGTH = 200;
const MAX_REFRESH_TOKEN_LENGTH = 20_000;

export type GoogleAdsOAuthUserCredentials = {
  version: typeof GOOGLE_ADS_CREDENTIAL_VERSION;
  auth_type: typeof GOOGLE_ADS_CREDENTIAL_AUTH_TYPE;
  refresh_token: string;
  login_customer_id: string | null;
};

export type GoogleAdsCredentialContext = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  provider: typeof GOOGLE_ADS_PROVIDER;
  externalAccountId: string;
};

export type SafeGoogleAdsCredentialInfo = {
  provider: typeof GOOGLE_ADS_PROVIDER;
  authType: typeof GOOGLE_ADS_CREDENTIAL_AUTH_TYPE;
  externalAccountId: string;
  loginCustomerId: string | null;
  hasRefreshToken: true;
};

export type GoogleAdsCredentialErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_CREDENTIALS"
  | "UNSUPPORTED_PROVIDER"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED";

export class GoogleAdsCredentialError extends Error {
  readonly code: GoogleAdsCredentialErrorCode;

  constructor(
    code: GoogleAdsCredentialErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsCredentialError";
    this.code = code;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errorCode: "INVALID_CONTEXT" | "INVALID_CREDENTIALS",
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsCredentialError(
      errorCode,
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsCredentialError(
      errorCode,
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsCredentialError(
      errorCode,
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function parseCredentials(
  value: unknown,
): GoogleAdsOAuthUserCredentials {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new GoogleAdsCredentialError(
      "INVALID_CREDENTIALS",
      "Google Ads credentials must be an object.",
    );
  }

  const record = value as Record<string, unknown>;

  if (record.version !== GOOGLE_ADS_CREDENTIAL_VERSION) {
    throw new GoogleAdsCredentialError(
      "INVALID_CREDENTIALS",
      "Google Ads credential version is unsupported.",
    );
  }

  if (
    record.auth_type !==
    GOOGLE_ADS_CREDENTIAL_AUTH_TYPE
  ) {
    throw new GoogleAdsCredentialError(
      "INVALID_CREDENTIALS",
      "Google Ads credential auth_type is unsupported.",
    );
  }

  return {
    version: GOOGLE_ADS_CREDENTIAL_VERSION,
    auth_type: GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
    refresh_token: normalizeRequiredString(
      record.refresh_token,
      "refresh_token",
      MAX_REFRESH_TOKEN_LENGTH,
      "INVALID_CREDENTIALS",
    ),
    login_customer_id:
      normalizeOptionalGoogleAdsCustomerId(
        record.login_customer_id,
        "login_customer_id",
      ),
  };
}

function toJsonObject(
  credentials: GoogleAdsOAuthUserCredentials,
): MediaCredentialJsonObject {
  return {
    version: credentials.version,
    auth_type: credentials.auth_type,
    refresh_token: credentials.refresh_token,
    login_customer_id:
      credentials.login_customer_id,
  };
}

export function normalizeGoogleAdsCredentialContext(
  context: GoogleAdsCredentialContext,
): GoogleAdsCredentialContext {
  if (context.provider !== GOOGLE_ADS_PROVIDER) {
    throw new GoogleAdsCredentialError(
      "UNSUPPORTED_PROVIDER",
      "Only Google Ads credentials are supported by this codec.",
    );
  }

  return {
    connectionId: normalizeRequiredString(
      context.connectionId,
      "connectionId",
      MAX_CONTEXT_ID_LENGTH,
      "INVALID_CONTEXT",
    ),
    workspaceId: normalizeRequiredString(
      context.workspaceId,
      "workspaceId",
      MAX_CONTEXT_ID_LENGTH,
      "INVALID_CONTEXT",
    ),
    advertiserId: normalizeRequiredString(
      context.advertiserId,
      "advertiserId",
      MAX_CONTEXT_ID_LENGTH,
      "INVALID_CONTEXT",
    ),
    provider: GOOGLE_ADS_PROVIDER,
    externalAccountId: normalizeGoogleAdsCustomerId(
      context.externalAccountId,
      "externalAccountId",
    ),
  };
}

export function buildGoogleAdsCredentialAad(
  context: GoogleAdsCredentialContext,
): string {
  const normalizedContext =
    normalizeGoogleAdsCredentialContext(context);

  return [
    GOOGLE_ADS_CREDENTIAL_AAD_NAMESPACE,
    encodeURIComponent(normalizedContext.connectionId),
    encodeURIComponent(normalizedContext.workspaceId),
    encodeURIComponent(normalizedContext.advertiserId),
    encodeURIComponent(normalizedContext.provider),
    encodeURIComponent(normalizedContext.externalAccountId),
  ].join(":");
}

export function validateGoogleAdsCredentials(
  value: unknown,
): GoogleAdsOAuthUserCredentials {
  return parseCredentials(value);
}

export function encryptGoogleAdsCredentials(
  credentials: GoogleAdsOAuthUserCredentials,
  context: GoogleAdsCredentialContext,
): string {
  const normalizedCredentials =
    parseCredentials(credentials);
  const additionalAuthenticatedData =
    buildGoogleAdsCredentialAad(context);

  try {
    return encryptMediaCredentialJson(
      toJsonObject(normalizedCredentials),
      additionalAuthenticatedData,
    );
  } catch (error) {
    if (error instanceof GoogleAdsCredentialError) {
      throw error;
    }

    throw new GoogleAdsCredentialError(
      "ENCRYPTION_FAILED",
      "Google Ads credentials could not be encrypted.",
      { cause: error },
    );
  }
}

export function decryptGoogleAdsCredentials(
  credentialCiphertext: string,
  context: GoogleAdsCredentialContext,
): GoogleAdsOAuthUserCredentials {
  if (
    typeof credentialCiphertext !== "string" ||
    !credentialCiphertext.trim()
  ) {
    throw new GoogleAdsCredentialError(
      "DECRYPTION_FAILED",
      "Google Ads credential ciphertext must not be empty.",
    );
  }

  const additionalAuthenticatedData =
    buildGoogleAdsCredentialAad(context);

  try {
    const decryptedCredential =
      decryptMediaCredentialJson<MediaCredentialJsonObject>(
        credentialCiphertext,
        additionalAuthenticatedData,
      );

    return parseCredentials(decryptedCredential);
  } catch (error) {
    if (error instanceof GoogleAdsCredentialError) {
      throw error;
    }

    throw new GoogleAdsCredentialError(
      "DECRYPTION_FAILED",
      "Google Ads credentials could not be decrypted.",
      { cause: error },
    );
  }
}

export function toSafeGoogleAdsCredentialInfo(
  credentials: GoogleAdsOAuthUserCredentials,
  context: GoogleAdsCredentialContext,
): SafeGoogleAdsCredentialInfo {
  const normalizedCredentials =
    parseCredentials(credentials);
  const normalizedContext =
    normalizeGoogleAdsCredentialContext(context);

  return {
    provider: GOOGLE_ADS_PROVIDER,
    authType: GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
    externalAccountId:
      normalizedContext.externalAccountId,
    loginCustomerId:
      normalizedCredentials.login_customer_id,
    hasRefreshToken: true,
  };
}

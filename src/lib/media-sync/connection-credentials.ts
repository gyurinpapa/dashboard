import {
  decryptMediaCredentialJson,
  encryptMediaCredentialJson,
  MediaCredentialCryptoError,
  type MediaCredentialJsonObject,
} from "./crypto";
import type { MediaProvider } from "./types";

const CONNECTION_CREDENTIAL_AAD_VERSION = "v1";
const CONNECTION_CREDENTIAL_AAD_NAMESPACE =
  "etrylue:media-connection-credential";

const NAVER_SEARCH_ADS_PROVIDER = "naver_searchad" satisfies MediaProvider;

const MAX_CUSTOMER_ID_LENGTH = 200;
const MAX_ACCESS_LICENSE_LENGTH = 500;
const MAX_SECRET_KEY_LENGTH = 1000;
const MAX_EXTERNAL_ACCOUNT_ID_LENGTH = 300;
const MAX_CONTEXT_ID_LENGTH = 200;

export interface NaverSearchAdsCredentials {
  customerId: string;
  accessLicense: string;
  secretKey: string;
}

export interface MediaConnectionCredentialContext {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  provider: MediaProvider;
  externalAccountId: string;
}

export interface SafeNaverSearchAdsCredentialInfo {
  provider: typeof NAVER_SEARCH_ADS_PROVIDER;
  customerId: string;
  externalAccountId: string;
  hasAccessLicense: true;
  hasSecretKey: true;
}

export class MediaConnectionCredentialError extends Error {
  readonly code:
    | "INVALID_CONTEXT"
    | "UNSUPPORTED_PROVIDER"
    | "INVALID_CREDENTIALS"
    | "ENCRYPTION_FAILED"
    | "DECRYPTION_FAILED";

  constructor(
    code: MediaConnectionCredentialError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaConnectionCredentialError";
    this.code = code;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new MediaConnectionCredentialError(
      "INVALID_CREDENTIALS",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionCredentialError(
      "INVALID_CREDENTIALS",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionCredentialError(
      "INVALID_CREDENTIALS",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeContextValue(
  value: unknown,
  fieldName: string,
  maxLength = MAX_CONTEXT_ID_LENGTH,
): string {
  if (typeof value !== "string") {
    throw new MediaConnectionCredentialError(
      "INVALID_CONTEXT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionCredentialError(
      "INVALID_CONTEXT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionCredentialError(
      "INVALID_CONTEXT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function assertNaverSearchAdsProvider(
  provider: MediaProvider,
): asserts provider is typeof NAVER_SEARCH_ADS_PROVIDER {
  if (provider !== NAVER_SEARCH_ADS_PROVIDER) {
    throw new MediaConnectionCredentialError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads credentials are supported at this stage.",
    );
  }
}

function parseNaverSearchAdsCredentials(
  value: unknown,
): NaverSearchAdsCredentials {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new MediaConnectionCredentialError(
      "INVALID_CREDENTIALS",
      "Naver Search Ads credentials must be an object.",
    );
  }

  const credentialRecord = value as Record<string, unknown>;

  return {
    customerId: normalizeRequiredString(
      credentialRecord.customerId,
      "customerId",
      MAX_CUSTOMER_ID_LENGTH,
    ),
    accessLicense: normalizeRequiredString(
      credentialRecord.accessLicense,
      "accessLicense",
      MAX_ACCESS_LICENSE_LENGTH,
    ),
    secretKey: normalizeRequiredString(
      credentialRecord.secretKey,
      "secretKey",
      MAX_SECRET_KEY_LENGTH,
    ),
  };
}

function toCredentialJsonObject(
  credentials: NaverSearchAdsCredentials,
): MediaCredentialJsonObject {
  return {
    customerId: credentials.customerId,
    accessLicense: credentials.accessLicense,
    secretKey: credentials.secretKey,
  };
}

export function normalizeMediaConnectionCredentialContext(
  context: MediaConnectionCredentialContext,
): MediaConnectionCredentialContext {
  assertNaverSearchAdsProvider(context.provider);

  return {
    connectionId: normalizeContextValue(
      context.connectionId,
      "connectionId",
    ),
    workspaceId: normalizeContextValue(
      context.workspaceId,
      "workspaceId",
    ),
    advertiserId: normalizeContextValue(
      context.advertiserId,
      "advertiserId",
    ),
    provider: context.provider,
    externalAccountId: normalizeContextValue(
      context.externalAccountId,
      "externalAccountId",
      MAX_EXTERNAL_ACCOUNT_ID_LENGTH,
    ),
  };
}

export function buildMediaConnectionCredentialAad(
  context: MediaConnectionCredentialContext,
): string {
  const normalizedContext =
    normalizeMediaConnectionCredentialContext(context);

  return [
    CONNECTION_CREDENTIAL_AAD_NAMESPACE,
    CONNECTION_CREDENTIAL_AAD_VERSION,
    encodeURIComponent(normalizedContext.connectionId),
    encodeURIComponent(normalizedContext.workspaceId),
    encodeURIComponent(normalizedContext.advertiserId),
    encodeURIComponent(normalizedContext.provider),
    encodeURIComponent(normalizedContext.externalAccountId),
  ].join(":");
}

export function validateNaverSearchAdsCredentials(
  credentials: unknown,
): NaverSearchAdsCredentials {
  return parseNaverSearchAdsCredentials(credentials);
}

export function encryptNaverSearchAdsCredentials(
  credentials: NaverSearchAdsCredentials,
  context: MediaConnectionCredentialContext,
): string {
  const normalizedCredentials =
    parseNaverSearchAdsCredentials(credentials);

  const additionalAuthenticatedData =
    buildMediaConnectionCredentialAad(context);

  try {
    return encryptMediaCredentialJson(
      toCredentialJsonObject(normalizedCredentials),
      additionalAuthenticatedData,
    );
  } catch (error) {
    if (error instanceof MediaConnectionCredentialError) {
      throw error;
    }

    if (error instanceof MediaCredentialCryptoError) {
      throw new MediaConnectionCredentialError(
        "ENCRYPTION_FAILED",
        "Media connection credentials could not be encrypted.",
        { cause: error },
      );
    }

    throw new MediaConnectionCredentialError(
      "ENCRYPTION_FAILED",
      "Media connection credentials could not be encrypted.",
      { cause: error },
    );
  }
}

export function decryptNaverSearchAdsCredentials(
  credentialCiphertext: string,
  context: MediaConnectionCredentialContext,
): NaverSearchAdsCredentials {
  if (
    typeof credentialCiphertext !== "string" ||
    !credentialCiphertext.trim()
  ) {
    throw new MediaConnectionCredentialError(
      "DECRYPTION_FAILED",
      "Credential ciphertext must not be empty.",
    );
  }

  const additionalAuthenticatedData =
    buildMediaConnectionCredentialAad(context);

  try {
    const decryptedCredential =
      decryptMediaCredentialJson<MediaCredentialJsonObject>(
        credentialCiphertext,
        additionalAuthenticatedData,
      );

    return parseNaverSearchAdsCredentials(decryptedCredential);
  } catch (error) {
    if (error instanceof MediaConnectionCredentialError) {
      throw error;
    }

    if (error instanceof MediaCredentialCryptoError) {
      throw new MediaConnectionCredentialError(
        "DECRYPTION_FAILED",
        "Media connection credentials could not be decrypted.",
        { cause: error },
      );
    }

    throw new MediaConnectionCredentialError(
      "DECRYPTION_FAILED",
      "Media connection credentials could not be decrypted.",
      { cause: error },
    );
  }
}

export function toSafeNaverSearchAdsCredentialInfo(
  credentials: NaverSearchAdsCredentials,
  context: MediaConnectionCredentialContext,
): SafeNaverSearchAdsCredentialInfo {
  const normalizedCredentials =
    parseNaverSearchAdsCredentials(credentials);

  const normalizedContext =
    normalizeMediaConnectionCredentialContext(context);

  return {
    provider: NAVER_SEARCH_ADS_PROVIDER,
    customerId: normalizedCredentials.customerId,
    externalAccountId: normalizedContext.externalAccountId,
    hasAccessLicense: true,
    hasSecretKey: true,
  };
}
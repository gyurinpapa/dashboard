import type { MediaProvider } from "./types";

export const CONNECTION_CREDENTIAL_AAD_VERSION = "v1";

export const CONNECTION_CREDENTIAL_AAD_NAMESPACE =
  "etrylue:media-connection-credential";

export const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" satisfies MediaProvider;

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

function normalizeRequiredCredentialString(
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

export function validateNaverSearchAdsCredentials(
  value: unknown,
): NaverSearchAdsCredentials {
  if (!isPlainObject(value)) {
    throw new MediaConnectionCredentialError(
      "INVALID_CREDENTIALS",
      "Naver Search Ads credentials must be an object.",
    );
  }

  return {
    customerId: normalizeRequiredCredentialString(
      value.customerId,
      "customerId",
      MAX_CUSTOMER_ID_LENGTH,
    ),
    accessLicense: normalizeRequiredCredentialString(
      value.accessLicense,
      "accessLicense",
      MAX_ACCESS_LICENSE_LENGTH,
    ),
    secretKey: normalizeRequiredCredentialString(
      value.secretKey,
      "secretKey",
      MAX_SECRET_KEY_LENGTH,
    ),
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

export function toSafeNaverSearchAdsCredentialInfo(
  credentials: NaverSearchAdsCredentials,
  context: MediaConnectionCredentialContext,
): SafeNaverSearchAdsCredentialInfo {
  const normalizedCredentials =
    validateNaverSearchAdsCredentials(credentials);

  const normalizedContext =
    normalizeMediaConnectionCredentialContext(context);

  return {
    provider: NAVER_SEARCH_ADS_PROVIDER,
    customerId: normalizedCredentials.customerId,
    externalAccountId:
      normalizedContext.externalAccountId,
    hasAccessLicense: true,
    hasSecretKey: true,
  };
}
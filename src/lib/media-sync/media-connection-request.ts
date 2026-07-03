import {
  MediaConnectionCredentialError,
  NAVER_SEARCH_ADS_PROVIDER,
  validateNaverSearchAdsCredentials,
  type NaverSearchAdsCredentials,
} from "./connection-credential-policy";
import {
  isMediaProvider,
  toSafeMediaConnection,
  type JsonValue,
  type MediaConnectionMeta,
  type MediaConnectionRecord,
  type MediaProvider,
  type SafeMediaConnection,
} from "./types";

const MAX_ADVERTISER_ID_LENGTH = 200;
const MAX_CONNECTION_ID_LENGTH = 200;
const MAX_EXTERNAL_ACCOUNT_ID_LENGTH = 300;
const MAX_EXTERNAL_ACCOUNT_NAME_LENGTH = 500;

const FORBIDDEN_META_KEY_FRAGMENTS = [
  "credential",
  "ciphertext",
  "secret",
  "accesslicense",
  "access_license",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "apikey",
  "api_key",
  "privatekey",
  "private_key",
  "password",
  "authorization",
] as const;

const FORBIDDEN_RESPONSE_KEYS = new Set([
  "credentialciphertext",
  "credentials",
  "credential",
  "accesslicense",
  "secretkey",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "privatekey",
  "password",
  "authorization",
]);

type UnknownRecord = Record<string, unknown>;

export type MediaConnectionRequestErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_PROVIDER"
  | "UNSAFE_RESPONSE";

export class MediaConnectionRequestError extends Error {
  readonly code: MediaConnectionRequestErrorCode;

  constructor(
    code: MediaConnectionRequestErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaConnectionRequestError";
    this.code = code;
  }
}

export type CreateNaverSearchAdsConnectionRequest = {
  advertiserId: string;
  provider: typeof NAVER_SEARCH_ADS_PROVIDER;
  externalAccountId: string;
  externalAccountName: string | null;
  credentials: NaverSearchAdsCredentials;
  meta: MediaConnectionMeta;
};

export type ReplaceNaverSearchAdsCredentialsRequest = {
  advertiserId: string;
  connectionId: string;
  provider: typeof NAVER_SEARCH_ADS_PROVIDER;
  credentials: NaverSearchAdsCredentials;
};

export type MediaConnectionResponse = {
  connection: SafeMediaConnection;
};

export type MediaConnectionsResponse = {
  connections: SafeMediaConnection[];
};

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

function requirePlainObject(
  value: unknown,
  fieldName: string,
): UnknownRecord {
  if (!isPlainObject(value)) {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      `${fieldName} must be a plain object.`,
    );
  }

  return value;
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      `${fieldName} must be a string or null.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeInspectionKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s._-]/g, "");
}

function containsForbiddenMetaKey(key: string): boolean {
  const normalizedKey = normalizeInspectionKey(key);

  return FORBIDDEN_META_KEY_FRAGMENTS.some(
    (fragment) =>
      normalizedKey.includes(
        normalizeInspectionKey(fragment),
      ),
  );
}

function validateMetaValue(
  value: unknown,
  path: string,
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MediaConnectionRequestError(
        "INVALID_INPUT",
        `${path} must contain only finite numbers.`,
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateMetaValue(item, `${path}[${index}]`);
    });

    return;
  }

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(
      value,
    )) {
      if (!key.trim()) {
        throw new MediaConnectionRequestError(
          "INVALID_INPUT",
          `${path} contains an empty key.`,
        );
      }

      if (containsForbiddenMetaKey(key)) {
        throw new MediaConnectionRequestError(
          "INVALID_INPUT",
          `${path} contains a key that is not allowed in public metadata.`,
        );
      }

      validateMetaValue(
        nestedValue,
        `${path}.${key}`,
      );
    }

    return;
  }

  throw new MediaConnectionRequestError(
    "INVALID_INPUT",
    `${path} contains an unsupported value.`,
  );
}

export function normalizeMediaConnectionAdvertiserId(
  value: unknown,
): string {
  return normalizeRequiredString(
    value,
    "advertiserId",
    MAX_ADVERTISER_ID_LENGTH,
  );
}

export function normalizeMediaConnectionConnectionId(
  value: unknown,
): string {
  return normalizeRequiredString(
    value,
    "connectionId",
    MAX_CONNECTION_ID_LENGTH,
  );
}

export function normalizeMediaConnectionMeta(
  value: unknown,
): MediaConnectionMeta {
  if (value === undefined) {
    return {};
  }

  const meta = requirePlainObject(value, "meta");

  for (const [key, nestedValue] of Object.entries(
    meta,
  )) {
    if (!key.trim()) {
      throw new MediaConnectionRequestError(
        "INVALID_INPUT",
        "meta contains an empty key.",
      );
    }

    if (containsForbiddenMetaKey(key)) {
      throw new MediaConnectionRequestError(
        "INVALID_INPUT",
        "meta contains a key that is not allowed in public metadata.",
      );
    }

    validateMetaValue(nestedValue, `meta.${key}`);
  }

  try {
    return JSON.parse(
      JSON.stringify(meta),
    ) as MediaConnectionMeta;
  } catch (error) {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      "meta could not be serialized.",
      { cause: error },
    );
  }
}

function normalizeSupportedProvider(
  value: unknown,
): typeof NAVER_SEARCH_ADS_PROVIDER {
  if (!isMediaProvider(value)) {
    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      "provider is invalid.",
    );
  }

  if (value !== NAVER_SEARCH_ADS_PROVIDER) {
    throw new MediaConnectionRequestError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads connections are supported at this stage.",
    );
  }

  return value;
}

function normalizeCredentials(
  value: unknown,
): NaverSearchAdsCredentials {
  try {
    return validateNaverSearchAdsCredentials(value);
  } catch (error) {
    if (
      error instanceof MediaConnectionCredentialError
    ) {
      throw new MediaConnectionRequestError(
        "INVALID_INPUT",
        error.message,
        { cause: error },
      );
    }

    throw new MediaConnectionRequestError(
      "INVALID_INPUT",
      "Naver Search Ads credentials are invalid.",
      { cause: error },
    );
  }
}

export function parseCreateMediaConnectionRequest(
  input: {
    advertiserId: unknown;
    body: unknown;
  },
): CreateNaverSearchAdsConnectionRequest {
  const body = requirePlainObject(
    input.body,
    "body",
  );

  return {
    advertiserId:
      normalizeMediaConnectionAdvertiserId(
        input.advertiserId,
      ),
    provider: normalizeSupportedProvider(
      body.provider,
    ),
    externalAccountId: normalizeRequiredString(
      body.externalAccountId,
      "externalAccountId",
      MAX_EXTERNAL_ACCOUNT_ID_LENGTH,
    ),
    externalAccountName: normalizeOptionalString(
      body.externalAccountName,
      "externalAccountName",
      MAX_EXTERNAL_ACCOUNT_NAME_LENGTH,
    ),
    credentials: normalizeCredentials(
      body.credentials,
    ),
    meta: normalizeMediaConnectionMeta(body.meta),
  };
}

export function parseReplaceMediaConnectionCredentialsRequest(
  input: {
    advertiserId: unknown;
    connectionId: unknown;
    body: unknown;
  },
): ReplaceNaverSearchAdsCredentialsRequest {
  const body = requirePlainObject(
    input.body,
    "body",
  );

  return {
    advertiserId:
      normalizeMediaConnectionAdvertiserId(
        input.advertiserId,
      ),
    connectionId:
      normalizeMediaConnectionConnectionId(
        input.connectionId,
      ),
    provider: normalizeSupportedProvider(
      body.provider,
    ),
    credentials: normalizeCredentials(
      body.credentials,
    ),
  };
}

function assertSafeResponseValue(
  value: unknown,
  path: string,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeResponseValue(
        item,
        `${path}[${index}]`,
      );
    });

    return;
  }

  if (!isPlainObject(value)) {
    throw new MediaConnectionRequestError(
      "UNSAFE_RESPONSE",
      `${path} contains a non-serializable value.`,
    );
  }

  for (const [key, nestedValue] of Object.entries(
    value,
  )) {
    const normalizedKey =
      normalizeInspectionKey(key);

    if (FORBIDDEN_RESPONSE_KEYS.has(normalizedKey)) {
      throw new MediaConnectionRequestError(
        "UNSAFE_RESPONSE",
        `${path}.${key} is not allowed in a public response.`,
      );
    }

    assertSafeResponseValue(
      nestedValue,
      `${path}.${key}`,
    );
  }
}

function assertSerializableSafeResponse(
  value: unknown,
): void {
  assertSafeResponseValue(value, "response");

  try {
    JSON.stringify(value);
  } catch (error) {
    throw new MediaConnectionRequestError(
      "UNSAFE_RESPONSE",
      "Media connection response could not be serialized.",
      { cause: error },
    );
  }
}

export function buildSafeMediaConnectionResponse(
  record: MediaConnectionRecord,
): MediaConnectionResponse {
  const response: MediaConnectionResponse = {
    connection: toSafeMediaConnection(record),
  };

  assertSerializableSafeResponse(response);

  return response;
}

export function buildSafeMediaConnectionsResponse(
  records: readonly MediaConnectionRecord[],
): MediaConnectionsResponse {
  const response: MediaConnectionsResponse = {
    connections: records.map((record) =>
      toSafeMediaConnection(record),
    ),
  };

  assertSerializableSafeResponse(response);

  return response;
}

export function assertSafeMediaConnectionPayload(
  value: unknown,
): void {
  assertSerializableSafeResponse(value);
}

export function isSupportedMediaConnectionProvider(
  provider: MediaProvider,
): provider is typeof NAVER_SEARCH_ADS_PROVIDER {
  return provider === NAVER_SEARCH_ADS_PROVIDER;
}
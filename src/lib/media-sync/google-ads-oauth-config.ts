import type { MediaProvider } from "./types";

export const GOOGLE_ADS_PROVIDER =
  "google_ads" satisfies MediaProvider;

export const GOOGLE_ADS_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/adwords";

export const GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT =
  "https://oauth2.googleapis.com/token";

export const GOOGLE_ADS_DEVELOPER_TOKEN_ENV =
  "GOOGLE_ADS_DEVELOPER_TOKEN";
export const GOOGLE_ADS_OAUTH_CLIENT_ID_ENV =
  "GOOGLE_ADS_OAUTH_CLIENT_ID";
export const GOOGLE_ADS_OAUTH_CLIENT_SECRET_ENV =
  "GOOGLE_ADS_OAUTH_CLIENT_SECRET";
export const GOOGLE_ADS_OAUTH_REDIRECT_URI_ENV =
  "GOOGLE_ADS_OAUTH_REDIRECT_URI";

const MAX_CONFIG_VALUE_LENGTH = 10_000;
const GOOGLE_ADS_CUSTOMER_ID_PATTERN = /^\d{10}$/u;
const GOOGLE_ADS_UI_CUSTOMER_ID_PATTERN = /^\d{3}-\d{3}-\d{4}$/u;

export type GoogleAdsOAuthConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleAdsOAuthConfigErrorCode =
  | "MISSING_ENV"
  | "INVALID_ENV"
  | "INVALID_CUSTOMER_ID";

export class GoogleAdsOAuthConfigError extends Error {
  readonly code: GoogleAdsOAuthConfigErrorCode;

  constructor(
    code: GoogleAdsOAuthConfigErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsOAuthConfigError";
    this.code = code;
  }
}

function normalizeRequiredConfigValue(
  value: unknown,
  envName: string,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthConfigError(
      "MISSING_ENV",
      `${envName} is not configured.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthConfigError(
      "MISSING_ENV",
      `${envName} is not configured.`,
    );
  }

  if (normalizedValue.length > MAX_CONFIG_VALUE_LENGTH) {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_ENV",
      `${envName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeRedirectUri(value: unknown): string {
  const normalizedValue = normalizeRequiredConfigValue(
    value,
    GOOGLE_ADS_OAUTH_REDIRECT_URI_ENV,
  );

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch (error) {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_ENV",
      `${GOOGLE_ADS_OAUTH_REDIRECT_URI_ENV} must be an absolute URL.`,
      { cause: error },
    );
  }

  const isLoopbackHttp =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "[::1]");

  if (parsedUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_ENV",
      `${GOOGLE_ADS_OAUTH_REDIRECT_URI_ENV} must use HTTPS except for loopback local development.`,
    );
  }

  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_ENV",
      `${GOOGLE_ADS_OAUTH_REDIRECT_URI_ENV} must not contain credentials, query parameters, or fragments.`,
    );
  }

  return parsedUrl.toString();
}

export function normalizeGoogleAdsCustomerId(
  value: unknown,
  fieldName = "customerId",
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_CUSTOMER_ID",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_CUSTOMER_ID",
      `${fieldName} must not be empty.`,
    );
  }

  if (
    !GOOGLE_ADS_CUSTOMER_ID_PATTERN.test(normalizedValue) &&
    !GOOGLE_ADS_UI_CUSTOMER_ID_PATTERN.test(normalizedValue)
  ) {
    throw new GoogleAdsOAuthConfigError(
      "INVALID_CUSTOMER_ID",
      `${fieldName} must be a 10-digit Google Ads customer ID, optionally formatted as 123-456-7890.`,
    );
  }

  return normalizedValue.replace(/-/gu, "");
}

export function normalizeOptionalGoogleAdsCustomerId(
  value: unknown,
  fieldName = "customerId",
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeGoogleAdsCustomerId(
    value,
    fieldName,
  );
}

export function readGoogleAdsOAuthConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GoogleAdsOAuthConfig {
  return {
    developerToken: normalizeRequiredConfigValue(
      env[GOOGLE_ADS_DEVELOPER_TOKEN_ENV],
      GOOGLE_ADS_DEVELOPER_TOKEN_ENV,
    ),
    clientId: normalizeRequiredConfigValue(
      env[GOOGLE_ADS_OAUTH_CLIENT_ID_ENV],
      GOOGLE_ADS_OAUTH_CLIENT_ID_ENV,
    ),
    clientSecret: normalizeRequiredConfigValue(
      env[GOOGLE_ADS_OAUTH_CLIENT_SECRET_ENV],
      GOOGLE_ADS_OAUTH_CLIENT_SECRET_ENV,
    ),
    redirectUri: normalizeRedirectUri(
      env[GOOGLE_ADS_OAUTH_REDIRECT_URI_ENV],
    ),
  };
}

import {
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
} from "./google-ads-oauth-config";
import {
  createGoogleAdsConnectionVerificationResult,
  type GoogleAdsConnectionVerificationResult,
} from "./google-ads-connection-verification";

export const GOOGLE_ADS_API_VERSION = "v25" as const;
export const GOOGLE_ADS_ACCOUNT_VERIFICATION_TIMEOUT_MS = 10_000;

const GOOGLE_ADS_API_BASE_URL = "https://googleads.googleapis.com";
const MAX_ACCESS_TOKEN_LENGTH = 20_000;
const MAX_DEVELOPER_TOKEN_LENGTH = 10_000;
const MAX_EXTERNAL_ACCOUNT_NAME_LENGTH = 500;
const GOOGLE_ADS_ACCOUNT_VERIFICATION_QUERY =
  "SELECT customer.resource_name, customer.id, customer.descriptive_name FROM customer LIMIT 1";

export type GoogleAdsAccountVerificationRequest = {
  endpoint: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
};

export type VerifyGoogleAdsAccountAccessInput = {
  accessToken: string;
  developerToken: string;
  targetCustomerId: unknown;
  loginCustomerId?: unknown;
};

export type VerifiedGoogleAdsAccountAccess = Readonly<{
  verification: GoogleAdsConnectionVerificationResult;
  externalAccountName: string | null;
}>;

export type GoogleAdsAccountVerificationErrorCode =
  | "INVALID_INPUT"
  | "API_HTTP_ERROR"
  | "REQUEST_TIMEOUT"
  | "REQUEST_FAILED"
  | "INVALID_RESPONSE"
  | "TARGET_CUSTOMER_MISMATCH";

export class GoogleAdsAccountVerificationError extends Error {
  readonly code: GoogleAdsAccountVerificationErrorCode;
  readonly status: number | null;

  constructor(
    code: GoogleAdsAccountVerificationErrorCode,
    message: string,
    options?: ErrorOptions & {
      status?: number | null;
    },
  ) {
    super(message, options);

    this.name = "GoogleAdsAccountVerificationError";
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
    throw new GoogleAdsAccountVerificationError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_INPUT",
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
    throw new GoogleAdsAccountVerificationError(
      "INVALID_INPUT",
      "verificationTimeoutMs must be an integer between 1 and 60000.",
    );
  }

  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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

function normalizeExternalAccountName(
  value: unknown,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_RESPONSE",
      "Google Ads customer descriptive name is invalid.",
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.length >
    MAX_EXTERNAL_ACCOUNT_NAME_LENGTH
  ) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_RESPONSE",
      "Google Ads customer descriptive name exceeds the maximum allowed length.",
    );
  }

  return normalizedValue;
}

function normalizeResponseCustomerId(
  value: unknown,
): string {
  if (typeof value === "string") {
    try {
      return normalizeGoogleAdsCustomerId(
        value,
        "response.customer.id",
      );
    } catch (error) {
      throw new GoogleAdsAccountVerificationError(
        "INVALID_RESPONSE",
        "Google Ads verification response contains an invalid customer ID.",
        { cause: error },
      );
    }
  }

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    try {
      return normalizeGoogleAdsCustomerId(
        String(value),
        "response.customer.id",
      );
    } catch (error) {
      throw new GoogleAdsAccountVerificationError(
        "INVALID_RESPONSE",
        "Google Ads verification response contains an invalid customer ID.",
        { cause: error },
      );
    }
  }

  throw new GoogleAdsAccountVerificationError(
    "INVALID_RESPONSE",
    "Google Ads verification response contains an invalid customer ID.",
  );
}

function parseGoogleAdsAccountVerificationResponse(
  value: unknown,
  targetCustomerId: string,
): {
  externalAccountName: string | null;
} {
  if (!isPlainObject(value)) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_RESPONSE",
      "Google Ads verification response must be an object.",
    );
  }

  if (!Array.isArray(value.results) || value.results.length !== 1) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_RESPONSE",
      "Google Ads verification response must contain exactly one customer result.",
    );
  }

  const result = value.results[0];

  if (!isPlainObject(result) || !isPlainObject(result.customer)) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_RESPONSE",
      "Google Ads verification response is missing the customer result.",
    );
  }

  const customer = result.customer;
  const expectedResourceName =
    `customers/${targetCustomerId}`;

  if (customer.resourceName !== expectedResourceName) {
    throw new GoogleAdsAccountVerificationError(
      "TARGET_CUSTOMER_MISMATCH",
      "Google Ads verification response does not match the target customer resource.",
    );
  }

  const responseCustomerId =
    normalizeResponseCustomerId(customer.id);

  if (responseCustomerId !== targetCustomerId) {
    throw new GoogleAdsAccountVerificationError(
      "TARGET_CUSTOMER_MISMATCH",
      "Google Ads verification response does not match the target customer ID.",
    );
  }

  return {
    externalAccountName: normalizeExternalAccountName(
      customer.descriptiveName,
    ),
  };
}

export function buildGoogleAdsAccountVerificationRequest(
  input: VerifyGoogleAdsAccountAccessInput,
): GoogleAdsAccountVerificationRequest {
  const accessToken = normalizeRequiredString(
    input.accessToken,
    "accessToken",
    MAX_ACCESS_TOKEN_LENGTH,
  );
  const developerToken = normalizeRequiredString(
    input.developerToken,
    "developerToken",
    MAX_DEVELOPER_TOKEN_LENGTH,
  );

  let targetCustomerId: string;
  let loginCustomerId: string | null;

  try {
    targetCustomerId = normalizeGoogleAdsCustomerId(
      input.targetCustomerId,
      "targetCustomerId",
    );
    loginCustomerId = normalizeOptionalGoogleAdsCustomerId(
      input.loginCustomerId,
      "loginCustomerId",
    );
  } catch (error) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_INPUT",
      "Google Ads verification customer ID is invalid.",
      { cause: error },
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": developerToken,
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  return {
    endpoint:
      `${GOOGLE_ADS_API_BASE_URL}/${GOOGLE_ADS_API_VERSION}` +
      `/customers/${targetCustomerId}/googleAds:search`,
    method: "POST",
    headers,
    body: JSON.stringify({
      query: GOOGLE_ADS_ACCOUNT_VERIFICATION_QUERY,
    }),
  };
}

export async function verifyGoogleAdsAccountAccess(
  input: VerifyGoogleAdsAccountAccessInput,
  fetchImpl: typeof fetch = fetch,
  verificationTimeoutMs =
    GOOGLE_ADS_ACCOUNT_VERIFICATION_TIMEOUT_MS,
  nowMs = Date.now(),
): Promise<VerifiedGoogleAdsAccountAccess> {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new GoogleAdsAccountVerificationError(
      "INVALID_INPUT",
      "nowMs must be a valid timestamp.",
    );
  }

  const request = buildGoogleAdsAccountVerificationRequest(
    input,
  );
  const timeoutMs = normalizeTimeoutMs(
    verificationTimeoutMs,
  );
  const targetCustomerId =
    normalizeGoogleAdsCustomerId(
      input.targetCustomerId,
      "targetCustomerId",
    );
  const loginCustomerId =
    normalizeOptionalGoogleAdsCustomerId(
      input.loginCustomerId,
      "loginCustomerId",
    );

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
          cache: "no-store",
          signal: abortController.signal,
        },
      );
    } catch (error) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new GoogleAdsAccountVerificationError(
          "REQUEST_TIMEOUT",
          "Google Ads account verification request timed out.",
          { cause: error },
        );
      }

      throw new GoogleAdsAccountVerificationError(
        "REQUEST_FAILED",
        "Google Ads account verification request failed.",
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

      throw new GoogleAdsAccountVerificationError(
        "API_HTTP_ERROR",
        "Google Ads account verification returned an unsuccessful response.",
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
        throw new GoogleAdsAccountVerificationError(
          "REQUEST_TIMEOUT",
          "Google Ads account verification response timed out.",
          { cause: error },
        );
      }

      throw new GoogleAdsAccountVerificationError(
        "INVALID_RESPONSE",
        "Google Ads account verification returned invalid JSON.",
        { cause: error },
      );
    }

    const parsed =
      parseGoogleAdsAccountVerificationResponse(
        body,
        targetCustomerId,
      );

    return Object.freeze({
      verification:
        createGoogleAdsConnectionVerificationResult(
          {
            targetCustomerId,
            loginCustomerId,
            verifiedAt: new Date(nowMs).toISOString(),
          },
          nowMs,
        ),
      externalAccountName: parsed.externalAccountName,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

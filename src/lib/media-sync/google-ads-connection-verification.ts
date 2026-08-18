import {
  GOOGLE_ADS_PROVIDER,
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
} from "./google-ads-oauth-config";

export const GOOGLE_ADS_CONNECTION_VERIFICATION_METHOD =
  "google_ads_read_only_customer" as const;

export const GOOGLE_ADS_CONNECTION_VERIFICATION_MAX_AGE_MS =
  5 * 60 * 1000;

const GOOGLE_ADS_CONNECTION_VERIFICATION_FUTURE_SKEW_MS =
  30 * 1000;

const EXPECTED_VERIFICATION_KEYS = new Set([
  "provider",
  "method",
  "target_customer_id",
  "login_customer_id",
  "verified_at",
]);

export type GoogleAdsConnectionVerificationResult = Readonly<{
  provider: typeof GOOGLE_ADS_PROVIDER;
  method: typeof GOOGLE_ADS_CONNECTION_VERIFICATION_METHOD;
  target_customer_id: string;
  login_customer_id: string | null;
  verified_at: string;
}>;

export type GoogleAdsConnectionVerificationErrorCode =
  | "INVALID_VERIFICATION"
  | "STALE_VERIFICATION"
  | "FUTURE_VERIFICATION";

export class GoogleAdsConnectionVerificationError extends Error {
  readonly code: GoogleAdsConnectionVerificationErrorCode;

  constructor(
    code: GoogleAdsConnectionVerificationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsConnectionVerificationError";
    this.code = code;
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

function normalizeVerifiedAt(
  value: unknown,
  nowMs: number,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "verified_at must be a non-empty ISO timestamp.",
    );
  }

  const timestampMs = Date.parse(value);

  if (!Number.isFinite(timestampMs)) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "verified_at must be a valid ISO timestamp.",
    );
  }

  if (
    timestampMs >
    nowMs +
      GOOGLE_ADS_CONNECTION_VERIFICATION_FUTURE_SKEW_MS
  ) {
    throw new GoogleAdsConnectionVerificationError(
      "FUTURE_VERIFICATION",
      "Google Ads verification is too far in the future.",
    );
  }

  if (
    nowMs - timestampMs >
    GOOGLE_ADS_CONNECTION_VERIFICATION_MAX_AGE_MS
  ) {
    throw new GoogleAdsConnectionVerificationError(
      "STALE_VERIFICATION",
      "Google Ads verification is too old to activate a connection.",
    );
  }

  return new Date(timestampMs).toISOString();
}

export function validateGoogleAdsConnectionVerificationResult(
  value: unknown,
  nowMs = Date.now(),
): GoogleAdsConnectionVerificationResult {
  if (!Number.isFinite(nowMs)) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "nowMs must be finite.",
    );
  }

  if (!isPlainObject(value)) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "Google Ads verification result must be a plain object.",
    );
  }

  for (const key of Object.keys(value)) {
    if (!EXPECTED_VERIFICATION_KEYS.has(key)) {
      throw new GoogleAdsConnectionVerificationError(
        "INVALID_VERIFICATION",
        "Google Ads verification result contains an unexpected field.",
      );
    }
  }

  if (value.provider !== GOOGLE_ADS_PROVIDER) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "Google Ads verification provider is invalid.",
    );
  }

  if (
    value.method !==
    GOOGLE_ADS_CONNECTION_VERIFICATION_METHOD
  ) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "Google Ads verification method is invalid.",
    );
  }

  let targetCustomerId: string;
  let loginCustomerId: string | null;

  try {
    targetCustomerId = normalizeGoogleAdsCustomerId(
      value.target_customer_id,
      "target_customer_id",
    );
    loginCustomerId =
      normalizeOptionalGoogleAdsCustomerId(
        value.login_customer_id,
        "login_customer_id",
      );
  } catch (error) {
    throw new GoogleAdsConnectionVerificationError(
      "INVALID_VERIFICATION",
      "Google Ads verification contains an invalid customer ID.",
      { cause: error },
    );
  }

  return Object.freeze({
    provider: GOOGLE_ADS_PROVIDER,
    method:
      GOOGLE_ADS_CONNECTION_VERIFICATION_METHOD,
    target_customer_id: targetCustomerId,
    login_customer_id: loginCustomerId,
    verified_at: normalizeVerifiedAt(
      value.verified_at,
      nowMs,
    ),
  });
}

/**
 * Future Google Ads READ ONLY verifier uses this only after the
 * target customer access proof has succeeded. This function does
 * not perform the remote proof itself.
 */
export function createGoogleAdsConnectionVerificationResult(
  input: {
    targetCustomerId: unknown;
    loginCustomerId?: unknown;
    verifiedAt?: unknown;
  },
  nowMs = Date.now(),
): GoogleAdsConnectionVerificationResult {
  const verifiedAt =
    input.verifiedAt === undefined
      ? new Date(nowMs).toISOString()
      : input.verifiedAt;

  return validateGoogleAdsConnectionVerificationResult(
    {
      provider: GOOGLE_ADS_PROVIDER,
      method:
        GOOGLE_ADS_CONNECTION_VERIFICATION_METHOD,
      target_customer_id:
        input.targetCustomerId,
      login_customer_id:
        input.loginCustomerId ?? null,
      verified_at: verifiedAt,
    },
    nowMs,
  );
}

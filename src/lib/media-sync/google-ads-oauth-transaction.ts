import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  decryptMediaCredentialJson,
  encryptMediaCredentialJson,
  MediaCredentialCryptoError,
  type MediaCredentialJsonObject,
} from "./crypto";
import {
  normalizeGoogleAdsCustomerId,
  normalizeOptionalGoogleAdsCustomerId,
} from "./google-ads-oauth-config";

export const GOOGLE_ADS_OAUTH_TRANSACTION_VERSION = 1 as const;
export const GOOGLE_ADS_OAUTH_TRANSACTION_TTL_MS =
  10 * 60 * 1000;
export const GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME =
  "etrylue_google_ads_oauth_transaction";

const GOOGLE_ADS_OAUTH_TRANSACTION_AAD =
  "etrylue:google-ads-oauth-transaction:v1";

const MAX_CONTEXT_ID_LENGTH = 200;
const STATE_BYTE_LENGTH = 32;
const PKCE_VERIFIER_BYTE_LENGTH = 64;
const PKCE_VERIFIER_PATTERN =
  /^[A-Za-z0-9\-._~]{43,128}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export type GoogleAdsOAuthTransaction = {
  version: typeof GOOGLE_ADS_OAUTH_TRANSACTION_VERSION;
  state: string;
  code_verifier: string;
  user_id: string;
  workspace_id: string;
  advertiser_id: string;
  target_customer_id: string;
  login_customer_id: string | null;
  issued_at: string;
  expires_at: string;
};

export type CreateGoogleAdsOAuthTransactionInput = {
  userId: string;
  workspaceId: string;
  advertiserId: string;
  targetCustomerId: string;
  loginCustomerId?: string | null;
};

export type GoogleAdsOAuthTransactionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

export type GoogleAdsOAuthTransactionErrorCode =
  | "INVALID_INPUT"
  | "INVALID_TRANSACTION"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "TRANSACTION_EXPIRED"
  | "STATE_MISMATCH";

export class GoogleAdsOAuthTransactionError extends Error {
  readonly code: GoogleAdsOAuthTransactionErrorCode;

  constructor(
    code: GoogleAdsOAuthTransactionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsOAuthTransactionError";
    this.code = code;
  }
}

function normalizeRequiredContextString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > MAX_CONTEXT_ID_LENGTH) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeState(value: unknown): string {
  const normalizedValue = normalizeRequiredContextString(
    value,
    "state",
  );

  if (!BASE64URL_PATTERN.test(normalizedValue)) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      "OAuth state has an invalid format.",
    );
  }

  return normalizedValue;
}

function normalizeCodeVerifier(value: unknown): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      "PKCE code_verifier must be a string.",
    );
  }

  if (!PKCE_VERIFIER_PATTERN.test(value)) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      "PKCE code_verifier has an invalid format.",
    );
  }

  return value;
}

function normalizeIsoTimestamp(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      `${fieldName} must be an ISO timestamp.`,
    );
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      `${fieldName} must be an ISO timestamp.`,
    );
  }

  return new Date(timestamp).toISOString();
}

function parseTransaction(
  value: unknown,
): GoogleAdsOAuthTransaction {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      "Google Ads OAuth transaction is invalid.",
    );
  }

  const record = value as Record<string, unknown>;

  if (
    record.version !==
    GOOGLE_ADS_OAUTH_TRANSACTION_VERSION
  ) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      "Google Ads OAuth transaction version is unsupported.",
    );
  }

  const issuedAt = normalizeIsoTimestamp(
    record.issued_at,
    "issued_at",
  );
  const expiresAt = normalizeIsoTimestamp(
    record.expires_at,
    "expires_at",
  );

  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_TRANSACTION",
      "Google Ads OAuth transaction expiry is invalid.",
    );
  }

  return {
    version: GOOGLE_ADS_OAUTH_TRANSACTION_VERSION,
    state: normalizeState(record.state),
    code_verifier: normalizeCodeVerifier(
      record.code_verifier,
    ),
    user_id: normalizeRequiredContextString(
      record.user_id,
      "user_id",
    ),
    workspace_id: normalizeRequiredContextString(
      record.workspace_id,
      "workspace_id",
    ),
    advertiser_id: normalizeRequiredContextString(
      record.advertiser_id,
      "advertiser_id",
    ),
    target_customer_id: normalizeGoogleAdsCustomerId(
      record.target_customer_id,
      "target_customer_id",
    ),
    login_customer_id:
      normalizeOptionalGoogleAdsCustomerId(
        record.login_customer_id,
        "login_customer_id",
      ),
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
}

function toJsonObject(
  transaction: GoogleAdsOAuthTransaction,
): MediaCredentialJsonObject {
  return {
    version: transaction.version,
    state: transaction.state,
    code_verifier: transaction.code_verifier,
    user_id: transaction.user_id,
    workspace_id: transaction.workspace_id,
    advertiser_id: transaction.advertiser_id,
    target_customer_id:
      transaction.target_customer_id,
    login_customer_id:
      transaction.login_customer_id,
    issued_at: transaction.issued_at,
    expires_at: transaction.expires_at,
  };
}

export function generateGoogleAdsOAuthState(): string {
  return randomBytes(STATE_BYTE_LENGTH).toString(
    "base64url",
  );
}

export function generateGoogleAdsPkceCodeVerifier(): string {
  return randomBytes(
    PKCE_VERIFIER_BYTE_LENGTH,
  ).toString("base64url");
}

export function deriveGoogleAdsPkceCodeChallenge(
  codeVerifier: string,
): string {
  const normalizedVerifier =
    normalizeCodeVerifier(codeVerifier);

  return createHash("sha256")
    .update(normalizedVerifier, "ascii")
    .digest("base64url");
}

export function createGoogleAdsOAuthTransaction(
  input: CreateGoogleAdsOAuthTransactionInput,
  nowMs = Date.now(),
): GoogleAdsOAuthTransaction {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_INPUT",
      "nowMs must be a valid timestamp.",
    );
  }

  const issuedAt = new Date(nowMs);
  const expiresAt = new Date(
    nowMs + GOOGLE_ADS_OAUTH_TRANSACTION_TTL_MS,
  );

  return parseTransaction({
    version: GOOGLE_ADS_OAUTH_TRANSACTION_VERSION,
    state: generateGoogleAdsOAuthState(),
    code_verifier:
      generateGoogleAdsPkceCodeVerifier(),
    user_id: input.userId,
    workspace_id: input.workspaceId,
    advertiser_id: input.advertiserId,
    target_customer_id: input.targetCustomerId,
    login_customer_id:
      input.loginCustomerId ?? null,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
}

export function encryptGoogleAdsOAuthTransaction(
  transaction: GoogleAdsOAuthTransaction,
): string {
  const normalizedTransaction =
    parseTransaction(transaction);

  try {
    return encryptMediaCredentialJson(
      toJsonObject(normalizedTransaction),
      GOOGLE_ADS_OAUTH_TRANSACTION_AAD,
    );
  } catch (error) {
    if (
      error instanceof
      GoogleAdsOAuthTransactionError
    ) {
      throw error;
    }

    throw new GoogleAdsOAuthTransactionError(
      "ENCRYPTION_FAILED",
      "Google Ads OAuth transaction could not be encrypted.",
      { cause: error },
    );
  }
}

export function decryptGoogleAdsOAuthTransaction(
  ciphertext: string,
  nowMs = Date.now(),
): GoogleAdsOAuthTransaction {
  if (
    typeof ciphertext !== "string" ||
    !ciphertext.trim()
  ) {
    throw new GoogleAdsOAuthTransactionError(
      "DECRYPTION_FAILED",
      "Google Ads OAuth transaction ciphertext is missing.",
    );
  }

  let decryptedValue: MediaCredentialJsonObject;

  try {
    decryptedValue = decryptMediaCredentialJson(
      ciphertext,
      GOOGLE_ADS_OAUTH_TRANSACTION_AAD,
    );
  } catch (error) {
    throw new GoogleAdsOAuthTransactionError(
      "DECRYPTION_FAILED",
      "Google Ads OAuth transaction could not be decrypted.",
      { cause: error },
    );
  }

  let transaction: GoogleAdsOAuthTransaction;

  try {
    transaction = parseTransaction(decryptedValue);
  } catch (error) {
    if (
      error instanceof
      GoogleAdsOAuthTransactionError
    ) {
      throw error;
    }

    if (error instanceof MediaCredentialCryptoError) {
      throw new GoogleAdsOAuthTransactionError(
        "DECRYPTION_FAILED",
        "Google Ads OAuth transaction could not be decrypted.",
        { cause: error },
      );
    }

    throw error;
  }

  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new GoogleAdsOAuthTransactionError(
      "INVALID_INPUT",
      "nowMs must be a valid timestamp.",
    );
  }

  if (nowMs >= Date.parse(transaction.expires_at)) {
    throw new GoogleAdsOAuthTransactionError(
      "TRANSACTION_EXPIRED",
      "Google Ads OAuth transaction has expired.",
    );
  }

  return transaction;
}

export function assertGoogleAdsOAuthStateMatches(
  expectedState: string,
  receivedState: string,
): void {
  const expected = normalizeState(expectedState);
  const received = normalizeState(receivedState);

  const expectedBuffer = Buffer.from(
    expected,
    "utf8",
  );
  const receivedBuffer = Buffer.from(
    received,
    "utf8",
  );

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(
      expectedBuffer,
      receivedBuffer,
    )
  ) {
    throw new GoogleAdsOAuthTransactionError(
      "STATE_MISMATCH",
      "Google Ads OAuth state does not match the initiating transaction.",
    );
  }
}

export function getGoogleAdsOAuthTransactionCookieOptions(
  secure: boolean,
): GoogleAdsOAuthTransactionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/media-connections/google-ads/oauth/callback",
    maxAge: Math.floor(
      GOOGLE_ADS_OAUTH_TRANSACTION_TTL_MS / 1000,
    ),
  };
}

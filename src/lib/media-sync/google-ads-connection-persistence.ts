import {
  validateGoogleAdsCredentials,
  type GoogleAdsOAuthUserCredentials,
} from "./google-ads-credentials";
import {
  validateGoogleAdsConnectionVerificationResult,
  type GoogleAdsConnectionVerificationResult,
} from "./google-ads-connection-verification";
import type { MediaConnectionMeta } from "./types";

const MAX_CONTEXT_ID_LENGTH = 200;
const MAX_EXTERNAL_ACCOUNT_NAME_LENGTH = 500;

export type CreateVerifiedGoogleAdsConnectionInput = {
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  credentials: GoogleAdsOAuthUserCredentials;
  verification: GoogleAdsConnectionVerificationResult;
  externalAccountName?: string | null;
  meta?: MediaConnectionMeta;
};

export type PreparedVerifiedGoogleAdsConnectionPersistence = {
  workspaceId: string;
  advertiserId: string;
  createdBy: string;
  externalAccountId: string;
  externalAccountName: string | null;
  credentials: GoogleAdsOAuthUserCredentials;
  verification: GoogleAdsConnectionVerificationResult;
  meta?: MediaConnectionMeta;
};

export type GoogleAdsConnectionPersistenceErrorCode =
  | "INVALID_INPUT"
  | "VERIFICATION_CREDENTIAL_MISMATCH";

export class GoogleAdsConnectionPersistenceError extends Error {
  readonly code: GoogleAdsConnectionPersistenceErrorCode;

  constructor(
    code: GoogleAdsConnectionPersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsConnectionPersistenceError";
    this.code = code;
  }
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsConnectionPersistenceError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsConnectionPersistenceError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsConnectionPersistenceError(
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
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GoogleAdsConnectionPersistenceError(
      "INVALID_INPUT",
      `${fieldName} must be a string or null.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
    throw new GoogleAdsConnectionPersistenceError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

export function prepareVerifiedGoogleAdsConnectionPersistence(
  input: CreateVerifiedGoogleAdsConnectionInput,
  nowMs = Date.now(),
): PreparedVerifiedGoogleAdsConnectionPersistence {
  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    MAX_CONTEXT_ID_LENGTH,
  );
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    MAX_CONTEXT_ID_LENGTH,
  );
  const createdBy = normalizeRequiredString(
    input.createdBy,
    "createdBy",
    MAX_CONTEXT_ID_LENGTH,
  );

  const verification =
    validateGoogleAdsConnectionVerificationResult(
      input.verification,
      nowMs,
    );

  let credentials: GoogleAdsOAuthUserCredentials;

  try {
    credentials = validateGoogleAdsCredentials(
      input.credentials,
    );
  } catch (error) {
    throw new GoogleAdsConnectionPersistenceError(
      "INVALID_INPUT",
      "Google Ads credentials are invalid.",
      { cause: error },
    );
  }

  if (
    credentials.login_customer_id !==
    verification.login_customer_id
  ) {
    throw new GoogleAdsConnectionPersistenceError(
      "VERIFICATION_CREDENTIAL_MISMATCH",
      "Google Ads verification login customer does not match the stored credential context.",
    );
  }

  return {
    workspaceId,
    advertiserId,
    createdBy,
    externalAccountId:
      verification.target_customer_id,
    externalAccountName: normalizeOptionalString(
      input.externalAccountName,
      "externalAccountName",
      MAX_EXTERNAL_ACCOUNT_NAME_LENGTH,
    ),
    credentials,
    verification,
    meta: input.meta,
  };
}

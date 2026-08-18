import {
  GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
  GOOGLE_ADS_CREDENTIAL_VERSION,
  validateGoogleAdsCredentials,
} from "./google-ads-credentials";
import {
  validateGoogleAdsConnectionVerificationResult,
} from "./google-ads-connection-verification";
import type {
  CreateVerifiedGoogleAdsConnectionInput,
} from "./google-ads-connection-persistence";
import type {
  GoogleAdsOAuthConfig,
} from "./google-ads-oauth-config";
import {
  getGoogleAdsOAuthTransactionCookieOptions,
  type GoogleAdsOAuthTransaction,
} from "./google-ads-oauth-transaction";
import type {
  GoogleAdsOAuthCallbackResult,
  GoogleAdsOAuthTokenSet,
} from "./google-ads-oauth";
import type {
  VerifiedGoogleAdsAccountAccess,
  VerifyGoogleAdsAccountAccessInput,
} from "./google-ads-account-verification";

const MAX_CONTEXT_ID_LENGTH = 200;

export type GoogleAdsOAuthCallbackAccessContext = Readonly<{
  userId: string;
  workspaceId: string;
  advertiserId: string;
  canManageConnections: boolean;
}>;

export type GoogleAdsOAuthCallbackPersistenceResult =
  Readonly<{
    id: string;
  }>;

export type GoogleAdsOAuthCallbackDependencies =
  Readonly<{
    exchangeAuthorizationCode: (
      input: {
        config: GoogleAdsOAuthConfig;
        code: string;
        codeVerifier: string;
      },
    ) => Promise<GoogleAdsOAuthTokenSet>;
    verifyAccountAccess: (
      input: VerifyGoogleAdsAccountAccessInput,
    ) => Promise<VerifiedGoogleAdsAccountAccess>;
    persistVerifiedConnection: (
      input: CreateVerifiedGoogleAdsConnectionInput,
    ) => Promise<GoogleAdsOAuthCallbackPersistenceResult>;
  }>;

export type CompleteGoogleAdsOAuthCallbackInput =
  Readonly<{
    config: GoogleAdsOAuthConfig;
    transaction: GoogleAdsOAuthTransaction;
    callback: GoogleAdsOAuthCallbackResult;
    access: GoogleAdsOAuthCallbackAccessContext;
  }>;

export type CompletedGoogleAdsOAuthCallback =
  Readonly<{
    advertiserId: string;
    connectionId: string;
  }>;

export type GoogleAdsOAuthCallbackFlowErrorCode =
  | "INVALID_ACCESS_CONTEXT"
  | "ACCESS_CONTEXT_MISMATCH"
  | "ACCESS_DENIED"
  | "VERIFICATION_SCOPE_MISMATCH"
  | "INVALID_PERSISTENCE_RESULT";

export class GoogleAdsOAuthCallbackFlowError extends Error {
  readonly code: GoogleAdsOAuthCallbackFlowErrorCode;

  constructor(
    code: GoogleAdsOAuthCallbackFlowErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "GoogleAdsOAuthCallbackFlowError";
    this.code = code;
  }
}

function normalizeRequiredContextString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new GoogleAdsOAuthCallbackFlowError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > MAX_CONTEXT_ID_LENGTH) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "INVALID_ACCESS_CONTEXT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeAccessContext(
  value: GoogleAdsOAuthCallbackAccessContext,
): GoogleAdsOAuthCallbackAccessContext {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "INVALID_ACCESS_CONTEXT",
      "Google Ads OAuth callback access context is invalid.",
    );
  }

  if (typeof value.canManageConnections !== "boolean") {
    throw new GoogleAdsOAuthCallbackFlowError(
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

export function assertGoogleAdsOAuthCallbackAccess(
  transaction: GoogleAdsOAuthTransaction,
  accessValue: GoogleAdsOAuthCallbackAccessContext,
): GoogleAdsOAuthCallbackAccessContext {
  const access = normalizeAccessContext(accessValue);

  if (!access.canManageConnections) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "ACCESS_DENIED",
      "The authenticated user cannot manage media connections.",
    );
  }

  if (
    access.userId !== transaction.user_id ||
    access.workspaceId !== transaction.workspace_id ||
    access.advertiserId !== transaction.advertiser_id
  ) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "ACCESS_CONTEXT_MISMATCH",
      "The current access context does not match the initiating OAuth transaction.",
    );
  }

  return access;
}

export function getGoogleAdsOAuthTransactionClearCookieOptions(
  secure: boolean,
) {
  return Object.freeze({
    ...getGoogleAdsOAuthTransactionCookieOptions(
      secure,
    ),
    maxAge: 0,
  });
}

export function buildGoogleAdsOAuthCallbackReturnUrl(
  requestUrl: string,
  input:
    | Readonly<{
        outcome: "success";
        advertiserId: string;
        connectionId: string;
      }>
    | Readonly<{
        outcome: "error";
        errorCode: string;
      }>,
): string {
  const url = new URL("/report-builder", requestUrl);

  if (input.outcome === "success") {
    url.searchParams.set(
      "google_ads_oauth",
      "success",
    );
    url.searchParams.set(
      "advertiser_id",
      normalizeRequiredContextString(
        input.advertiserId,
        "advertiserId",
      ),
    );
    url.searchParams.set(
      "connection_id",
      normalizeRequiredContextString(
        input.connectionId,
        "connectionId",
      ),
    );
  } else {
    const errorCode =
      normalizeRequiredContextString(
        input.errorCode,
        "errorCode",
      );

    url.searchParams.set(
      "google_ads_oauth",
      "error",
    );
    url.searchParams.set(
      "error",
      errorCode,
    );
  }

  return url.toString();
}

export async function completeGoogleAdsOAuthCallback(
  input: CompleteGoogleAdsOAuthCallbackInput,
  dependencies: GoogleAdsOAuthCallbackDependencies,
  nowMs = Date.now(),
): Promise<CompletedGoogleAdsOAuthCallback> {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "INVALID_ACCESS_CONTEXT",
      "nowMs must be a valid timestamp.",
    );
  }

  assertGoogleAdsOAuthCallbackAccess(
    input.transaction,
    input.access,
  );

  const tokenSet =
    await dependencies.exchangeAuthorizationCode({
      config: input.config,
      code: input.callback.code,
      codeVerifier:
        input.transaction.code_verifier,
    });

  const verifiedAccount =
    await dependencies.verifyAccountAccess({
      accessToken: tokenSet.accessToken,
      developerToken:
        input.config.developerToken,
      targetCustomerId:
        input.transaction.target_customer_id,
      loginCustomerId:
        input.transaction.login_customer_id,
    });

  const verification =
    validateGoogleAdsConnectionVerificationResult(
      verifiedAccount.verification,
      nowMs,
    );

  if (
    verification.target_customer_id !==
      input.transaction.target_customer_id ||
    verification.login_customer_id !==
      input.transaction.login_customer_id
  ) {
    throw new GoogleAdsOAuthCallbackFlowError(
      "VERIFICATION_SCOPE_MISMATCH",
      "Fresh Google Ads verification does not match the initiating OAuth transaction.",
    );
  }

  const credentials =
    validateGoogleAdsCredentials({
      version:
        GOOGLE_ADS_CREDENTIAL_VERSION,
      auth_type:
        GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
      refresh_token:
        tokenSet.refreshToken,
      login_customer_id:
        input.transaction.login_customer_id,
    });

  const persisted =
    await dependencies.persistVerifiedConnection({
      workspaceId:
        input.transaction.workspace_id,
      advertiserId:
        input.transaction.advertiser_id,
      createdBy:
        input.transaction.user_id,
      credentials,
      verification,
      externalAccountName:
        verifiedAccount.externalAccountName,
    });

  const connectionId =
    normalizeRequiredContextString(
      persisted?.id,
      "persisted.id",
    );

  return Object.freeze({
    advertiserId:
      input.transaction.advertiser_id,
    connectionId,
  });
}

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  MediaConnectionAccessError,
  resolveAdvertiserMediaConnectionAccess,
} from "@/src/lib/media-sync/media-connection-access";
import {
  GoogleAdsAccountVerificationError,
  verifyGoogleAdsAccountAccess,
} from "@/src/lib/media-sync/google-ads-account-verification";
import {
  GoogleAdsOAuthCallbackFlowError,
  buildGoogleAdsOAuthCallbackReturnUrl,
  completeGoogleAdsOAuthCallback,
  getGoogleAdsOAuthTransactionClearCookieOptions,
} from "@/src/lib/media-sync/google-ads-oauth-callback";
import {
  GoogleAdsOAuthConfigError,
  readGoogleAdsOAuthConfig,
} from "@/src/lib/media-sync/google-ads-oauth-config";
import {
  GoogleAdsConnectionPersistenceError,
} from "@/src/lib/media-sync/google-ads-connection-persistence";
import {
  GoogleAdsConnectionVerificationError,
} from "@/src/lib/media-sync/google-ads-connection-verification";
import {
  GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
  GoogleAdsOAuthTransactionError,
  assertGoogleAdsOAuthStateMatches,
  decryptGoogleAdsOAuthTransaction,
} from "@/src/lib/media-sync/google-ads-oauth-transaction";
import {
  GoogleAdsOAuthError,
  exchangeGoogleAdsAuthorizationCode,
  parseGoogleAdsOAuthCallbackQuery,
} from "@/src/lib/media-sync/google-ads-oauth";
import {
  createVerifiedGoogleAdsConnection,
} from "@/src/lib/media-sync/media-connections-repository";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

function safeErrorCode(
  error: unknown,
): string {
  if (error instanceof MediaConnectionAccessError) {
    return error.code;
  }

  if (
    error instanceof GoogleAdsOAuthTransactionError ||
    error instanceof GoogleAdsOAuthError ||
    error instanceof GoogleAdsOAuthConfigError ||
    error instanceof GoogleAdsAccountVerificationError ||
    error instanceof GoogleAdsConnectionVerificationError ||
    error instanceof GoogleAdsConnectionPersistenceError ||
    error instanceof GoogleAdsOAuthCallbackFlowError
  ) {
    return error.code;
  }

  return "INTERNAL_ERROR";
}

function redirectResponse(
  request: NextRequest,
  location: string,
  clearTransactionCookie: boolean,
): NextResponse {
  const response =
    NextResponse.redirect(location);

  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  if (clearTransactionCookie) {
    response.cookies.set(
      GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
      "",
      getGoogleAdsOAuthTransactionClearCookieOptions(
        request.nextUrl.protocol === "https:",
      ),
    );
  }

  return response;
}

function errorRedirect(
  request: NextRequest,
  errorCode: string,
  clearTransactionCookie: boolean,
): NextResponse {
  return redirectResponse(
    request,
    buildGoogleAdsOAuthCallbackReturnUrl(
      request.url,
      {
        outcome: "error",
        errorCode,
      },
    ),
    clearTransactionCookie,
  );
}

export async function GET(
  request: NextRequest,
) {
  let clearTransactionCookie = false;

  try {
    const transactionCiphertext =
      request.cookies.get(
        GOOGLE_ADS_OAUTH_TRANSACTION_COOKIE_NAME,
      )?.value ?? "";

    let transaction;

    try {
      transaction =
        decryptGoogleAdsOAuthTransaction(
          transactionCiphertext,
        );

      // A decrypted but invalid/expired transaction is not reusable.
      clearTransactionCookie = true;
    } catch (error) {
      // Missing/corrupt/expired transaction cookies should be discarded.
      clearTransactionCookie = true;
      throw error;
    }

    const receivedState =
      request.nextUrl.searchParams.get(
        "state",
      ) ?? "";

    try {
      assertGoogleAdsOAuthStateMatches(
        transaction.state,
        receivedState,
      );
    } catch (error) {
      // Do not let an unrelated/mismatched callback erase a valid
      // in-flight transaction belonging to the current browser.
      clearTransactionCookie = false;
      throw error;
    }

    // Once state matches, the callback is one-shot whether later
    // authorization, token, verification, access, or persistence succeeds.
    clearTransactionCookie = true;

    const callback =
      parseGoogleAdsOAuthCallbackQuery(
        request.nextUrl.searchParams,
      );

    const access =
      await resolveAdvertiserMediaConnectionAccess({
        request,
        advertiserId:
          transaction.advertiser_id,
        action: "manage_connections",
      });

    const config =
      readGoogleAdsOAuthConfig();

    const completed =
      await completeGoogleAdsOAuthCallback(
        {
          config,
          transaction,
          callback,
          access: {
            userId: access.userId,
            workspaceId:
              access.workspaceId,
            advertiserId:
              access.advertiserId,
            canManageConnections:
              access.canManageConnections,
          },
        },
        {
          exchangeAuthorizationCode:
            exchangeGoogleAdsAuthorizationCode,
          verifyAccountAccess:
            verifyGoogleAdsAccountAccess,
          persistVerifiedConnection:
            createVerifiedGoogleAdsConnection,
        },
      );

    return redirectResponse(
      request,
      buildGoogleAdsOAuthCallbackReturnUrl(
        request.url,
        {
          outcome: "success",
          advertiserId:
            completed.advertiserId,
          connectionId:
            completed.connectionId,
        },
      ),
      true,
    );
  } catch (error) {
    const errorCode =
      safeErrorCode(error);

    if (errorCode === "INTERNAL_ERROR") {
      console.error(
        "[google-ads-oauth:callback] Unexpected error",
      );
    }

    return errorRedirect(
      request,
      errorCode,
      clearTransactionCookie,
    );
  }
}

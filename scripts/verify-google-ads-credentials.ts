import {
  GOOGLE_ADS_PROVIDER,
} from "../src/lib/media-sync/google-ads-oauth-config";
import {
  GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
  GOOGLE_ADS_CREDENTIAL_VERSION,
  GoogleAdsCredentialError,
  decryptGoogleAdsCredentials,
  encryptGoogleAdsCredentials,
  toSafeGoogleAdsCredentialInfo,
  validateGoogleAdsCredentials,
  type GoogleAdsCredentialContext,
  type GoogleAdsOAuthUserCredentials,
} from "../src/lib/media-sync/google-ads-credentials";

type FixtureResult = {
  name: string;
  passed: boolean;
  error?: unknown;
};

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runFixture(
  name: string,
  fn: () => void,
): FixtureResult {
  try {
    fn();

    return {
      name,
      passed: true,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      error,
    };
  }
}

function main(): void {
  const originalEncryptionKey =
    process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;

  process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
    Buffer.alloc(32, 11).toString("base64");

  const credentials: GoogleAdsOAuthUserCredentials = {
    version: GOOGLE_ADS_CREDENTIAL_VERSION,
    auth_type:
      GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
    refresh_token: "google-refresh-token",
    login_customer_id: "9876543210",
  };

  const context: GoogleAdsCredentialContext = {
    connectionId: "connection-1",
    workspaceId: "workspace-1",
    advertiserId: "advertiser-1",
    provider: GOOGLE_ADS_PROVIDER,
    externalAccountId: "1234567890",
  };

  const results = [
    runFixture(
      "Google credential contract accepts only version 1 oauth_user refresh-token shape",
      () => {
        const parsed =
          validateGoogleAdsCredentials(
            credentials,
          );

        assertTrue(
          parsed.version === 1 &&
            parsed.auth_type === "oauth_user" &&
            parsed.refresh_token ===
              "google-refresh-token" &&
            parsed.login_customer_id ===
              "9876543210",
          "valid Google credential contract was not preserved",
        );

        let rejected = false;

        try {
          validateGoogleAdsCredentials({
            version: 1,
            auth_type: "oauth_user",
            access_token: "must-not-be-stored",
            login_customer_id: null,
          });
        } catch (error) {
          rejected =
            error instanceof
              GoogleAdsCredentialError &&
            error.code === "INVALID_CREDENTIALS";
        }

        assertTrue(
          rejected,
          "credential without refresh token was accepted",
        );
      },
    ),

    runFixture(
      "Google credential ciphertext roundtrips without storing access token or app secrets",
      () => {
        const ciphertext =
          encryptGoogleAdsCredentials(
            credentials,
            context,
          );

        assertTrue(
          !ciphertext.includes(
            credentials.refresh_token,
          ),
          "refresh token leaked into ciphertext string",
        );

        const decrypted =
          decryptGoogleAdsCredentials(
            ciphertext,
            context,
          );

        assertTrue(
          decrypted.refresh_token ===
            credentials.refresh_token &&
            decrypted.login_customer_id ===
              credentials.login_customer_id,
          "credential roundtrip failed",
        );

        const serialized = JSON.stringify(decrypted);

        assertTrue(
          !serialized.includes("access_token") &&
            !serialized.includes("developer_token") &&
            !serialized.includes("client_secret"),
          "prohibited app or ephemeral credential field appeared",
        );
      },
    ),

    runFixture(
      "Credential AAD binds connection, workspace, advertiser, provider, and target account",
      () => {
        const ciphertext =
          encryptGoogleAdsCredentials(
            credentials,
            context,
          );

        let rejected = false;

        try {
          decryptGoogleAdsCredentials(
            ciphertext,
            {
              ...context,
              externalAccountId:
                "1111111111",
            },
          );
        } catch (error) {
          rejected =
            error instanceof
              GoogleAdsCredentialError &&
            error.code === "DECRYPTION_FAILED";
        }

        assertTrue(
          rejected,
          "credential decrypted under a different target account",
        );
      },
    ),

    runFixture(
      "Safe Google credential info contains no refresh token",
      () => {
        const safeInfo =
          toSafeGoogleAdsCredentialInfo(
            credentials,
            context,
          );

        const serialized = JSON.stringify(safeInfo);

        assertTrue(
          safeInfo.provider === "google_ads" &&
            safeInfo.hasRefreshToken === true &&
            safeInfo.externalAccountId ===
              "1234567890" &&
            !serialized.includes(
              "google-refresh-token",
            ) &&
            !serialized.includes(
              "refresh_token",
            ),
          "safe credential info leaked secret material",
        );
      },
    ),

    runFixture(
      "Google credential codec rejects non-Google provider context",
      () => {
        let rejected = false;

        try {
          encryptGoogleAdsCredentials(
            credentials,
            {
              ...context,
              provider: "naver_searchad",
            } as unknown as GoogleAdsCredentialContext,
          );
        } catch (error) {
          rejected =
            error instanceof
              GoogleAdsCredentialError &&
            error.code === "UNSUPPORTED_PROVIDER";
        }

        assertTrue(
          rejected,
          "non-Google credential context was accepted",
        );
      },
    ),
  ];

  if (originalEncryptionKey === undefined) {
    delete process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
  } else {
    process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
      originalEncryptionKey;
  }

  for (const result of results) {
    if (result.passed) {
      console.log(`PASS: ${result.name}`);
      continue;
    }

    console.error(`FAIL: ${result.name}`);
    console.error(result.error);
  }

  const passedCount = results.filter(
    (result) => result.passed,
  ).length;

  console.log(
    `fixture result: ${passedCount}/${results.length}`,
  );

  if (passedCount !== results.length) {
    process.exitCode = 1;
  }
}

main();

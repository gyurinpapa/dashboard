import { Buffer } from "node:buffer";

import {
  createGoogleAdsConnectionVerificationResult,
  GoogleAdsConnectionVerificationError,
} from "../src/lib/media-sync/google-ads-connection-verification";
import {
  GoogleAdsConnectionPersistenceError,
  prepareVerifiedGoogleAdsConnectionPersistence,
} from "../src/lib/media-sync/google-ads-connection-persistence";
import {
  GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
  GOOGLE_ADS_CREDENTIAL_VERSION,
  type GoogleAdsOAuthUserCredentials,
} from "../src/lib/media-sync/google-ads-credentials";
import {
  createVerifiedGoogleAdsConnection,
} from "../src/lib/media-sync/media-connections-repository";

const FIXED_NOW_MS = Date.parse(
  "2026-08-18T08:00:00.000Z",
);

function assertTrue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runFixture(
  name: string,
  fixture: () => void | Promise<void>,
): Promise<boolean> {
  try {
    await fixture();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error);
    return false;
  }
}

function createCredentials(
  loginCustomerId: string | null,
): GoogleAdsOAuthUserCredentials {
  return {
    version: GOOGLE_ADS_CREDENTIAL_VERSION,
    auth_type: GOOGLE_ADS_CREDENTIAL_AUTH_TYPE,
    refresh_token:
      "fixture-google-refresh-token",
    login_customer_id: loginCustomerId,
  };
}

async function main(): Promise<void> {
  const previousEncryptionKey =
    process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;

  process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
    Buffer.alloc(32, 17).toString("base64");

  const results: boolean[] = [];

  try {
    results.push(
      await runFixture(
        "Verified Google Ads persistence derives target account only from the verification proof",
        () => {
          const verification =
            createGoogleAdsConnectionVerificationResult(
              {
                targetCustomerId:
                  "123-456-7890",
                loginCustomerId:
                  "987-654-3210",
              },
              FIXED_NOW_MS,
            );

          const prepared =
            prepareVerifiedGoogleAdsConnectionPersistence(
              {
                workspaceId: "workspace-1",
                advertiserId: "advertiser-1",
                createdBy: "user-1",
                credentials:
                  createCredentials(
                    "9876543210",
                  ),
                verification,
                externalAccountName:
                  "Fixture Google Ads",
              },
              FIXED_NOW_MS,
            );

          assertTrue(
            prepared.externalAccountId ===
              "1234567890",
            "target account was not derived from verification",
          );
          assertTrue(
            prepared.verification.login_customer_id ===
              "9876543210",
            "login customer was not normalized",
          );
        },
      ),
    );

    results.push(
      await runFixture(
        "Stale or future Google Ads verification cannot activate a connection",
        () => {
          let staleRejected = false;
          let futureRejected = false;

          try {
            createGoogleAdsConnectionVerificationResult(
              {
                targetCustomerId:
                  "1234567890",
                verifiedAt:
                  "2026-08-18T07:54:59.000Z",
              },
              FIXED_NOW_MS,
            );
          } catch (error) {
            staleRejected =
              error instanceof
                GoogleAdsConnectionVerificationError &&
              error.code ===
                "STALE_VERIFICATION";
          }

          try {
            createGoogleAdsConnectionVerificationResult(
              {
                targetCustomerId:
                  "1234567890",
                verifiedAt:
                  "2026-08-18T08:00:31.000Z",
              },
              FIXED_NOW_MS,
            );
          } catch (error) {
            futureRejected =
              error instanceof
                GoogleAdsConnectionVerificationError &&
              error.code ===
                "FUTURE_VERIFICATION";
          }

          assertTrue(
            staleRejected && futureRejected,
            "verification freshness did not fail closed",
          );
        },
      ),
    );

    results.push(
      await runFixture(
        "Verification proof rejects unexpected fields such as access tokens",
        () => {
          let rejected = false;

          try {
            createGoogleAdsConnectionVerificationResult(
              {
                targetCustomerId:
                  "1234567890",
              },
              FIXED_NOW_MS,
            );

            const forged = {
              provider: "google_ads",
              method:
                "google_ads_read_only_customer",
              target_customer_id:
                "1234567890",
              login_customer_id: null,
              verified_at:
                new Date(
                  FIXED_NOW_MS,
                ).toISOString(),
              access_token: "must-not-pass",
            } as const;

            prepareVerifiedGoogleAdsConnectionPersistence(
              {
                workspaceId: "workspace-1",
                advertiserId: "advertiser-1",
                createdBy: "user-1",
                credentials:
                  createCredentials(null),
                verification:
                  forged as never,
              },
              FIXED_NOW_MS,
            );
          } catch (error) {
            rejected =
              error instanceof
              GoogleAdsConnectionVerificationError;
          }

          assertTrue(
            rejected,
            "unexpected verification field was accepted",
          );
        },
      ),
    );

    results.push(
      await runFixture(
        "Credential login customer must exactly match the verified login customer",
        () => {
          const verification =
            createGoogleAdsConnectionVerificationResult(
              {
                targetCustomerId:
                  "1234567890",
                loginCustomerId:
                  "9876543210",
              },
              FIXED_NOW_MS,
            );

          let rejected = false;

          try {
            prepareVerifiedGoogleAdsConnectionPersistence(
              {
                workspaceId: "workspace-1",
                advertiserId: "advertiser-1",
                createdBy: "user-1",
                credentials:
                  createCredentials(
                    "1112223333",
                  ),
                verification,
              },
              FIXED_NOW_MS,
            );
          } catch (error) {
            rejected =
              error instanceof
                GoogleAdsConnectionPersistenceError &&
              error.code ===
                "VERIFICATION_CREDENTIAL_MISMATCH";
          }

          assertTrue(
            rejected,
            "credential and verification login customers diverged",
          );
        },
      ),
    );

    results.push(
      await runFixture(
        "Repository refuses an unverified candidate before any insert executor is called",
        async () => {
          let insertCalls = 0;
          let rejected = false;

          try {
            await createVerifiedGoogleAdsConnection(
              {
                workspaceId: "workspace-1",
                advertiserId: "advertiser-1",
                createdBy: "user-1",
                credentials:
                  createCredentials(null),
                verification:
                  null as never,
              },
              {
                insertRecord: async (record) => {
                  insertCalls += 1;
                  return {
                    data: record,
                    error: null,
                  };
                },
              },
            );
          } catch (error) {
            rejected =
              error instanceof
              GoogleAdsConnectionVerificationError;
          }

          assertTrue(
            rejected && insertCalls === 0,
            "repository reached persistence without a valid verification proof",
          );
        },
      ),
    );

    results.push(
      await runFixture(
        "Repository persistence inserts only an active verified Google Ads connection and never needs a live DB in the fixture",
        async () => {
          const verification =
            createGoogleAdsConnectionVerificationResult({
              targetCustomerId:
                "1234567890",
              loginCustomerId: null,
            });

          let insertedRecord:
            | Record<string, unknown>
            | null = null;

          const dependencies = {
            insertRecord: async (record: Record<string, unknown>) => {
                insertedRecord = {
                  ...record,
                };

                return {
                  data: record,
                  error: null,
                };
              },
            };

          const connection =
            await createVerifiedGoogleAdsConnection(
              {
                workspaceId: "workspace-1",
                advertiserId: "advertiser-1",
                createdBy: "user-1",
                credentials:
                  createCredentials(null),
                verification,
                externalAccountName:
                  "Fixture Google Ads",
              },
              dependencies,
            );

          assertTrue(
            insertedRecord !== null,
            "repository insert executor was not called",
          );

          const record = insertedRecord as Record<
            string,
            unknown
          >;

          assertTrue(
            record.provider === "google_ads" &&
              record.external_account_id ===
                "1234567890" &&
              record.status === "active",
            "repository inserted an invalid Google Ads authority row",
          );
          assertTrue(
            typeof record.credential_ciphertext ===
              "string" &&
              Boolean(
                record.credential_ciphertext,
              ),
            "repository did not persist encrypted credentials",
          );
          assertTrue(
            !JSON.stringify(record).includes(
              "fixture-google-refresh-token",
            ),
            "repository insert record leaked the refresh token",
          );
          assertTrue(
            record.last_verified_at ===
              verification.verified_at,
            "repository did not persist the verified timestamp",
          );
          assertTrue(
            connection.provider === "google_ads" &&
              connection.external_account_id ===
                "1234567890" &&
              connection.status === "active" &&
              connection.has_credentials,
            "safe repository result is invalid",
          );
          assertTrue(
            !("credential_ciphertext" in
              connection),
            "safe result leaked credential ciphertext",
          );
        },
      ),
    );
  } finally {
    if (previousEncryptionKey === undefined) {
      delete process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY =
        previousEncryptionKey;
    }
  }

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`fixture result: ${passed}/${total}`);

  if (passed !== total) {
    process.exitCode = 1;
  }
}

void main();

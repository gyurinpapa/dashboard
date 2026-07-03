import {
  buildMediaConnectionCredentialAad,
  decryptNaverSearchAdsCredentials,
  encryptNaverSearchAdsCredentials,
  MediaConnectionCredentialError,
  toSafeNaverSearchAdsCredentialInfo,
  type MediaConnectionCredentialContext,
  type NaverSearchAdsCredentials,
} from "../src/lib/media-sync/connection-credentials";
import {
  decryptMediaCredentialJson,
  decryptMediaCredentialString,
  encryptMediaCredentialJson,
  encryptMediaCredentialString,
  MediaCredentialCryptoError,
  type MediaCredentialJsonObject,
  validateMediaCredentialEncryptionKey,
} from "../src/lib/media-sync/crypto";

const TEST_ADDITIONAL_AUTHENTICATED_DATA =
  "media-sync-crypto-verification:v1";

const TEST_STRING_PLAINTEXT =
  "synthetic-media-credential-verification-value";

const TEST_JSON_CREDENTIAL: MediaCredentialJsonObject = {
  provider: "naver_searchad",
  customerId: "synthetic-customer-id",
  accessLicense: "synthetic-access-license",
  secretKey: "synthetic-secret-key",
  enabled: true,
  version: 1,
};

const TEST_NAVER_CREDENTIALS: NaverSearchAdsCredentials = {
  customerId: "synthetic-customer-id",
  accessLicense: "synthetic-access-license",
  secretKey: "synthetic-secret-key",
};

const TEST_CONNECTION_CONTEXT: MediaConnectionCredentialContext = {
  connectionId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  advertiserId: "33333333-3333-4333-8333-333333333333",
  provider: "naver_searchad",
  externalAccountId: "synthetic-naver-account-id",
};

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function areJsonObjectsEqual(
  left: MediaCredentialJsonObject,
  right: MediaCredentialJsonObject,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areNaverCredentialsEqual(
  left: NaverSearchAdsCredentials,
  right: NaverSearchAdsCredentials,
): boolean {
  return (
    left.customerId === right.customerId &&
    left.accessLicense === right.accessLicense &&
    left.secretKey === right.secretKey
  );
}

function tamperCiphertext(ciphertext: string): string {
  const parts = ciphertext.split(".");

  assertCondition(
    parts.length === 4,
    "Generated ciphertext does not use the expected four-part format.",
  );

  const encryptedValue = parts[3];

  assertCondition(
    encryptedValue.length > 0,
    "Generated ciphertext contains an empty encrypted value.",
  );

  const lastCharacter = encryptedValue.at(-1);

  assertCondition(
    lastCharacter !== undefined,
    "Could not read the generated ciphertext.",
  );

  const replacementCharacter = lastCharacter === "A" ? "B" : "A";

  parts[3] =
    encryptedValue.slice(0, -1) + replacementCharacter;

  return parts.join(".");
}

function expectCryptoFailure(
  callback: () => unknown,
  expectedCode:
    | "INVALID_CIPHERTEXT"
    | "DECRYPTION_FAILED",
  failureMessage: string,
): void {
  try {
    callback();
  } catch (error) {
    assertCondition(
      error instanceof MediaCredentialCryptoError,
      `${failureMessage} An unexpected error type was returned.`,
    );

    assertCondition(
      error.code === expectedCode,
      `${failureMessage} Expected ${expectedCode}, but received ${error.code}.`,
    );

    return;
  }

  throw new Error(
    `${failureMessage} The operation unexpectedly succeeded.`,
  );
}

function expectConnectionCredentialFailure(
  callback: () => unknown,
  expectedCode:
    | "INVALID_CONTEXT"
    | "UNSUPPORTED_PROVIDER"
    | "INVALID_CREDENTIALS"
    | "ENCRYPTION_FAILED"
    | "DECRYPTION_FAILED",
  failureMessage: string,
): void {
  try {
    callback();
  } catch (error) {
    assertCondition(
      error instanceof MediaConnectionCredentialError,
      `${failureMessage} An unexpected error type was returned.`,
    );

    assertCondition(
      error.code === expectedCode,
      `${failureMessage} Expected ${expectedCode}, but received ${error.code}.`,
    );

    return;
  }

  throw new Error(
    `${failureMessage} The operation unexpectedly succeeded.`,
  );
}

function verifyEncryptionKey(): void {
  validateMediaCredentialEncryptionKey();
}

function verifyStringRoundTrip(): void {
  const ciphertext = encryptMediaCredentialString(
    TEST_STRING_PLAINTEXT,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  assertCondition(
    ciphertext.startsWith("v1."),
    "String ciphertext does not contain the expected v1 prefix.",
  );

  assertCondition(
    ciphertext !== TEST_STRING_PLAINTEXT,
    "String ciphertext must not equal its plaintext.",
  );

  const decryptedValue = decryptMediaCredentialString(
    ciphertext,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  assertCondition(
    decryptedValue === TEST_STRING_PLAINTEXT,
    "String encryption round-trip did not restore the original value.",
  );
}

function verifyJsonRoundTrip(): void {
  const ciphertext = encryptMediaCredentialJson(
    TEST_JSON_CREDENTIAL,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  const decryptedCredential =
    decryptMediaCredentialJson<MediaCredentialJsonObject>(
      ciphertext,
      TEST_ADDITIONAL_AUTHENTICATED_DATA,
    );

  assertCondition(
    areJsonObjectsEqual(
      decryptedCredential,
      TEST_JSON_CREDENTIAL,
    ),
    "JSON encryption round-trip did not restore the original object.",
  );
}

function verifyRandomInitializationVector(): void {
  const firstCiphertext = encryptMediaCredentialString(
    TEST_STRING_PLAINTEXT,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  const secondCiphertext = encryptMediaCredentialString(
    TEST_STRING_PLAINTEXT,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  assertCondition(
    firstCiphertext !== secondCiphertext,
    "Encrypting the same plaintext twice must produce different ciphertexts.",
  );
}

function verifyAdditionalAuthenticatedDataProtection(): void {
  const ciphertext = encryptMediaCredentialString(
    TEST_STRING_PLAINTEXT,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  expectCryptoFailure(
    () =>
      decryptMediaCredentialString(
        ciphertext,
        "media-sync-crypto-verification:wrong-aad",
      ),
    "DECRYPTION_FAILED",
    "Ciphertext was not protected by additional authenticated data.",
  );
}

function verifyTamperProtection(): void {
  const ciphertext = encryptMediaCredentialString(
    TEST_STRING_PLAINTEXT,
    TEST_ADDITIONAL_AUTHENTICATED_DATA,
  );

  const tamperedCiphertext = tamperCiphertext(ciphertext);

  expectCryptoFailure(
    () =>
      decryptMediaCredentialString(
        tamperedCiphertext,
        TEST_ADDITIONAL_AUTHENTICATED_DATA,
      ),
    "DECRYPTION_FAILED",
    "Tampered ciphertext was not rejected.",
  );
}

function verifyConnectionCredentialAadDeterminism(): void {
  const firstAad = buildMediaConnectionCredentialAad(
    TEST_CONNECTION_CONTEXT,
  );

  const secondAad = buildMediaConnectionCredentialAad({
    ...TEST_CONNECTION_CONTEXT,
  });

  assertCondition(
    firstAad === secondAad,
    "The same connection context must always produce the same AAD.",
  );

  const differentConnectionAad =
    buildMediaConnectionCredentialAad({
      ...TEST_CONNECTION_CONTEXT,
      connectionId:
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

  assertCondition(
    firstAad !== differentConnectionAad,
    "Different connection IDs must produce different AAD values.",
  );
}

function verifyConnectionCredentialRoundTrip(): void {
  const ciphertext = encryptNaverSearchAdsCredentials(
    TEST_NAVER_CREDENTIALS,
    TEST_CONNECTION_CONTEXT,
  );

  assertCondition(
    ciphertext.startsWith("v1."),
    "Connection credential ciphertext does not contain the expected v1 prefix.",
  );

  assertCondition(
    !ciphertext.includes(
      TEST_NAVER_CREDENTIALS.accessLicense,
    ),
    "Connection credential ciphertext exposed the access license.",
  );

  assertCondition(
    !ciphertext.includes(TEST_NAVER_CREDENTIALS.secretKey),
    "Connection credential ciphertext exposed the secret key.",
  );

  const decryptedCredentials =
    decryptNaverSearchAdsCredentials(
      ciphertext,
      TEST_CONNECTION_CONTEXT,
    );

  assertCondition(
    areNaverCredentialsEqual(
      decryptedCredentials,
      TEST_NAVER_CREDENTIALS,
    ),
    "Connection credential round-trip did not restore the original values.",
  );
}

function verifyConnectionIdBinding(): void {
  const ciphertext = encryptNaverSearchAdsCredentials(
    TEST_NAVER_CREDENTIALS,
    TEST_CONNECTION_CONTEXT,
  );

  expectConnectionCredentialFailure(
    () =>
      decryptNaverSearchAdsCredentials(ciphertext, {
        ...TEST_CONNECTION_CONTEXT,
        connectionId:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    "DECRYPTION_FAILED",
    "Credentials were not bound to their connection ID.",
  );
}

function verifyWorkspaceBinding(): void {
  const ciphertext = encryptNaverSearchAdsCredentials(
    TEST_NAVER_CREDENTIALS,
    TEST_CONNECTION_CONTEXT,
  );

  expectConnectionCredentialFailure(
    () =>
      decryptNaverSearchAdsCredentials(ciphertext, {
        ...TEST_CONNECTION_CONTEXT,
        workspaceId:
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    "DECRYPTION_FAILED",
    "Credentials were not bound to their workspace ID.",
  );
}

function verifyAdvertiserBinding(): void {
  const ciphertext = encryptNaverSearchAdsCredentials(
    TEST_NAVER_CREDENTIALS,
    TEST_CONNECTION_CONTEXT,
  );

  expectConnectionCredentialFailure(
    () =>
      decryptNaverSearchAdsCredentials(ciphertext, {
        ...TEST_CONNECTION_CONTEXT,
        advertiserId:
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    "DECRYPTION_FAILED",
    "Credentials were not bound to their advertiser ID.",
  );
}

function verifyExternalAccountBinding(): void {
  const ciphertext = encryptNaverSearchAdsCredentials(
    TEST_NAVER_CREDENTIALS,
    TEST_CONNECTION_CONTEXT,
  );

  expectConnectionCredentialFailure(
    () =>
      decryptNaverSearchAdsCredentials(ciphertext, {
        ...TEST_CONNECTION_CONTEXT,
        externalAccountId:
          "different-synthetic-naver-account-id",
      }),
    "DECRYPTION_FAILED",
    "Credentials were not bound to their external account ID.",
  );
}

function verifySafeCredentialInfo(): void {
  const safeInfo = toSafeNaverSearchAdsCredentialInfo(
    TEST_NAVER_CREDENTIALS,
    TEST_CONNECTION_CONTEXT,
  );

  const safeRecord = safeInfo as unknown as Record<
    string,
    unknown
  >;

  assertCondition(
    safeInfo.provider === "naver_searchad",
    "Safe credential information contains an incorrect provider.",
  );

  assertCondition(
    safeInfo.customerId ===
      TEST_NAVER_CREDENTIALS.customerId,
    "Safe credential information contains an incorrect customer ID.",
  );

  assertCondition(
    safeInfo.externalAccountId ===
      TEST_CONNECTION_CONTEXT.externalAccountId,
    "Safe credential information contains an incorrect external account ID.",
  );

  assertCondition(
    safeInfo.hasAccessLicense === true,
    "Safe credential information must indicate that an access license exists.",
  );

  assertCondition(
    safeInfo.hasSecretKey === true,
    "Safe credential information must indicate that a secret key exists.",
  );

  assertCondition(
    !("accessLicense" in safeRecord),
    "Safe credential information exposed the access license.",
  );

  assertCondition(
    !("secretKey" in safeRecord),
    "Safe credential information exposed the secret key.",
  );

  assertCondition(
    !("credentialCiphertext" in safeRecord),
    "Safe credential information exposed credential ciphertext.",
  );

  assertCondition(
    !("credential_ciphertext" in safeRecord),
    "Safe credential information exposed credential ciphertext.",
  );
}

function runVerification(): void {
  verifyEncryptionKey();
  verifyStringRoundTrip();
  verifyJsonRoundTrip();
  verifyRandomInitializationVector();
  verifyAdditionalAuthenticatedDataProtection();
  verifyTamperProtection();

  verifyConnectionCredentialAadDeterminism();
  verifyConnectionCredentialRoundTrip();
  verifyConnectionIdBinding();
  verifyWorkspaceBinding();
  verifyAdvertiserBinding();
  verifyExternalAccountBinding();
  verifySafeCredentialInfo();

  console.log(
    "Media credential and connection binding verification passed.",
  );
}

try {
  runVerification();
} catch (error) {
  console.error(
    "Media credential and connection binding verification failed.",
  );

  if (error instanceof MediaConnectionCredentialError) {
    console.error(`Error code: ${error.code}`);
    console.error(`Message: ${error.message}`);
  } else if (error instanceof MediaCredentialCryptoError) {
    console.error(`Error code: ${error.code}`);
    console.error(`Message: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`Message: ${error.message}`);
  } else {
    console.error(
      "An unknown verification error occurred.",
    );
  }

  process.exitCode = 1;
}
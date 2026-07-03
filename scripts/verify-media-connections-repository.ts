import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import {
  createNaverSearchAdsConnection,
  decryptNaverSearchAdsConnection,
  getMediaConnectionRecord,
  getSafeMediaConnection,
  listSafeMediaConnections,
  MediaConnectionsRepositoryError,
  type CreateNaverSearchAdsConnectionInput,
} from "../src/lib/media-sync/media-connections-repository";
import type {
  MediaConnectionMeta,
  SafeMediaConnection,
} from "../src/lib/media-sync/types";

const MEDIA_CONNECTIONS_TABLE = "media_connections";

const TEST_CREDENTIALS = {
  customerId: "synthetic-repository-customer-id",
  accessLicense: "synthetic-repository-access-license",
  secretKey: "synthetic-repository-secret-key",
};

type TestContext = {
  workspaceId: string;
  advertiserId: string;
  otherWorkspaceId: string;
  otherAdvertiserId: string;
  createdBy: string;
  externalAccountId: string;
  externalAccountName: string;
};

type UnknownRecord = Record<string, unknown>;

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function createTestContext(): TestContext {
  return {
    workspaceId: randomUUID(),
    advertiserId: randomUUID(),
    otherWorkspaceId: randomUUID(),
    otherAdvertiserId: randomUUID(),
    createdBy: randomUUID(),
    externalAccountId: `verify-${randomUUID()}`,
    externalAccountName:
      "Synthetic Naver Search Ads Verification Account",
  };
}

function createConnectionInput(
  context: TestContext,
): CreateNaverSearchAdsConnectionInput {
  return {
    workspaceId: context.workspaceId,
    advertiserId: context.advertiserId,
    externalAccountId: context.externalAccountId,
    externalAccountName: context.externalAccountName,
    credentials: {
      ...TEST_CREDENTIALS,
    },
    createdBy: context.createdBy,
    meta: {
      timezone: "Asia/Seoul",
      currency: "KRW",
      sourceOwnership: "api",
      dataLevel: "keyword",
      displayName: "Repository verification connection",
    },
  };
}

function assertSafeConnectionDoesNotExposeSecrets(
  connection: SafeMediaConnection,
): void {
  const record = connection as unknown as UnknownRecord;

  const forbiddenKeys = [
    "credential_ciphertext",
    "credentialCiphertext",
    "credentials",
    "accessLicense",
    "access_license",
    "secretKey",
    "secret_key",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
  ];

  for (const key of forbiddenKeys) {
    assertCondition(
      !(key in record),
      `Safe media connection exposed forbidden field: ${key}.`,
    );
  }

  const serializedConnection = JSON.stringify(connection);

  assertCondition(
    !serializedConnection.includes(
      TEST_CREDENTIALS.accessLicense,
    ),
    "Safe media connection exposed the access license value.",
  );

  assertCondition(
    !serializedConnection.includes(
      TEST_CREDENTIALS.secretKey,
    ),
    "Safe media connection exposed the secret key value.",
  );
}

function assertSafeConnectionMatchesContext(
  connection: SafeMediaConnection,
  context: TestContext,
): void {
  assertCondition(
    connection.workspace_id === context.workspaceId,
    "Safe connection contains an incorrect workspace ID.",
  );

  assertCondition(
    connection.advertiser_id === context.advertiserId,
    "Safe connection contains an incorrect advertiser ID.",
  );

  assertCondition(
    connection.provider === "naver_searchad",
    "Safe connection contains an incorrect provider.",
  );

  assertCondition(
    connection.external_account_id ===
      context.externalAccountId,
    "Safe connection contains an incorrect external account ID.",
  );

  assertCondition(
    connection.external_account_name ===
      context.externalAccountName,
    "Safe connection contains an incorrect external account name.",
  );

  assertCondition(
    connection.status === "active",
    "New media connection is not active.",
  );

  assertCondition(
    connection.has_credentials === true,
    "Safe connection does not indicate stored credentials.",
  );

  assertSafeConnectionDoesNotExposeSecrets(connection);
}

function assertDecryptedCredentialsMatch(
  credentials: {
    customerId: string;
    accessLicense: string;
    secretKey: string;
  },
): void {
  assertCondition(
    credentials.customerId === TEST_CREDENTIALS.customerId,
    "Decrypted customer ID does not match.",
  );

  assertCondition(
    credentials.accessLicense ===
      TEST_CREDENTIALS.accessLicense,
    "Decrypted access license does not match.",
  );

  assertCondition(
    credentials.secretKey === TEST_CREDENTIALS.secretKey,
    "Decrypted secret key does not match.",
  );
}

async function verifyForbiddenMetaIsRejected(
  context: TestContext,
): Promise<void> {
  const forbiddenMeta = {
    timezone: "Asia/Seoul",
    access_token: "must-never-be-stored",
  } as unknown as MediaConnectionMeta;

  try {
    await createNaverSearchAdsConnection({
      ...createConnectionInput(context),
      externalAccountId: `forbidden-meta-${randomUUID()}`,
      meta: forbiddenMeta,
    });
  } catch (error) {
    assertCondition(
      error instanceof MediaConnectionsRepositoryError,
      "Forbidden metadata returned an unexpected error type.",
    );

    assertCondition(
      error.code === "INVALID_INPUT",
      `Forbidden metadata expected INVALID_INPUT but received ${error.code}.`,
    );

    return;
  }

  throw new Error(
    "Repository accepted secret-like data inside media connection metadata.",
  );
}

async function verifyConnectionCreationAndStorage(
  context: TestContext,
): Promise<SafeMediaConnection> {
  const createdConnection =
    await createNaverSearchAdsConnection(
      createConnectionInput(context),
    );

  assertSafeConnectionMatchesContext(
    createdConnection,
    context,
  );

  const internalRecord = await getMediaConnectionRecord({
    connectionId: createdConnection.id,
    workspaceId: context.workspaceId,
    advertiserId: context.advertiserId,
  });

  assertCondition(
    internalRecord !== null,
    "Created media connection could not be loaded internally.",
  );

  assertCondition(
    typeof internalRecord.credential_ciphertext === "string" &&
      internalRecord.credential_ciphertext.startsWith("v1."),
    "Stored credential ciphertext does not use the expected encrypted format.",
  );

  assertCondition(
    internalRecord.credential_ciphertext !==
      TEST_CREDENTIALS.accessLicense,
    "Database stored the access license as plaintext.",
  );

  assertCondition(
    internalRecord.credential_ciphertext !==
      TEST_CREDENTIALS.secretKey,
    "Database stored the secret key as plaintext.",
  );

  assertCondition(
    !internalRecord.credential_ciphertext.includes(
      TEST_CREDENTIALS.accessLicense,
    ),
    "Stored ciphertext contains the plaintext access license.",
  );

  assertCondition(
    !internalRecord.credential_ciphertext.includes(
      TEST_CREDENTIALS.secretKey,
    ),
    "Stored ciphertext contains the plaintext secret key.",
  );

  assertCondition(
    internalRecord.credential_version === 1,
    "Stored credential version is incorrect.",
  );

  return createdConnection;
}

async function verifyScopedSafeLookup(
  createdConnection: SafeMediaConnection,
  context: TestContext,
): Promise<void> {
  const correctLookup = await getSafeMediaConnection({
    connectionId: createdConnection.id,
    workspaceId: context.workspaceId,
    advertiserId: context.advertiserId,
  });

  assertCondition(
    correctLookup !== null,
    "Correctly scoped safe lookup returned no connection.",
  );

  assertSafeConnectionMatchesContext(
    correctLookup,
    context,
  );

  const wrongWorkspaceLookup =
    await getSafeMediaConnection({
      connectionId: createdConnection.id,
      workspaceId: context.otherWorkspaceId,
      advertiserId: context.advertiserId,
    });

  assertCondition(
    wrongWorkspaceLookup === null,
    "Connection was accessible through an incorrect workspace ID.",
  );

  const wrongAdvertiserLookup =
    await getSafeMediaConnection({
      connectionId: createdConnection.id,
      workspaceId: context.workspaceId,
      advertiserId: context.otherAdvertiserId,
    });

  assertCondition(
    wrongAdvertiserLookup === null,
    "Connection was accessible through an incorrect advertiser ID.",
  );

  const fullyWrongLookup = await getSafeMediaConnection({
    connectionId: createdConnection.id,
    workspaceId: context.otherWorkspaceId,
    advertiserId: context.otherAdvertiserId,
  });

  assertCondition(
    fullyWrongLookup === null,
    "Connection was accessible through unrelated scope identifiers.",
  );
}

async function verifySafeListLookup(
  createdConnection: SafeMediaConnection,
  context: TestContext,
): Promise<void> {
  const connections = await listSafeMediaConnections({
    workspaceId: context.workspaceId,
    advertiserId: context.advertiserId,
  });

  const matchedConnection = connections.find(
    (connection) => connection.id === createdConnection.id,
  );

  assertCondition(
    matchedConnection !== undefined,
    "Created connection was not returned by the correctly scoped list.",
  );

  assertSafeConnectionMatchesContext(
    matchedConnection,
    context,
  );

  for (const connection of connections) {
    assertSafeConnectionDoesNotExposeSecrets(connection);
  }

  const wrongWorkspaceConnections =
    await listSafeMediaConnections({
      workspaceId: context.otherWorkspaceId,
      advertiserId: context.advertiserId,
    });

  assertCondition(
    !wrongWorkspaceConnections.some(
      (connection) => connection.id === createdConnection.id,
    ),
    "Connection appeared in a list for an incorrect workspace.",
  );

  const wrongAdvertiserConnections =
    await listSafeMediaConnections({
      workspaceId: context.workspaceId,
      advertiserId: context.otherAdvertiserId,
    });

  assertCondition(
    !wrongAdvertiserConnections.some(
      (connection) => connection.id === createdConnection.id,
    ),
    "Connection appeared in a list for an incorrect advertiser.",
  );
}

async function verifyCredentialDecryption(
  createdConnection: SafeMediaConnection,
  context: TestContext,
): Promise<void> {
  const decryptedConnection =
    await decryptNaverSearchAdsConnection({
      connectionId: createdConnection.id,
      workspaceId: context.workspaceId,
      advertiserId: context.advertiserId,
    });

  assertCondition(
    decryptedConnection.connection.id ===
      createdConnection.id,
    "Decrypted connection contains an incorrect connection ID.",
  );

  assertDecryptedCredentialsMatch(
    decryptedConnection.credentials,
  );

  try {
    await decryptNaverSearchAdsConnection({
      connectionId: createdConnection.id,
      workspaceId: context.otherWorkspaceId,
      advertiserId: context.advertiserId,
    });
  } catch (error) {
    assertCondition(
      error instanceof MediaConnectionsRepositoryError,
      "Wrong-scope decryption returned an unexpected error type.",
    );

    assertCondition(
      error.code === "CONNECTION_NOT_FOUND",
      `Wrong-scope decryption expected CONNECTION_NOT_FOUND but received ${error.code}.`,
    );

    return;
  }

  throw new Error(
    "Credentials were decrypted using an incorrect workspace scope.",
  );
}

async function cleanupVerificationRows(
  context: TestContext,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("advertiser_id", context.advertiserId)
    .like("external_account_id", "verify-%");

  if (error) {
    throw new Error(
      "Repository verification cleanup failed.",
      { cause: error },
    );
  }
}

async function verifyCleanup(
  context: TestContext,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("advertiser_id", context.advertiserId)
    .like("external_account_id", "verify-%");

  if (error) {
    throw new Error(
      "Repository verification cleanup could not be confirmed.",
      { cause: error },
    );
  }

  assertCondition(
    (data ?? []).length === 0,
    "Temporary repository verification rows remain in the database.",
  );
}

async function runVerification(): Promise<void> {
  const context = createTestContext();
  let verificationError: unknown = null;

  try {
    await verifyForbiddenMetaIsRejected(context);

    const createdConnection =
      await verifyConnectionCreationAndStorage(context);

    await verifyScopedSafeLookup(
      createdConnection,
      context,
    );

    await verifySafeListLookup(
      createdConnection,
      context,
    );

    await verifyCredentialDecryption(
      createdConnection,
      context,
    );
  } catch (error) {
    verificationError = error;
  }

  try {
    await cleanupVerificationRows(context);
    await verifyCleanup(context);
  } catch (cleanupError) {
    if (verificationError instanceof Error) {
      throw new Error(
        `${verificationError.message} Cleanup also failed.`,
        { cause: cleanupError },
      );
    }

    throw cleanupError;
  }

  if (verificationError) {
    throw verificationError;
  }

  console.log(
    "Media connections repository verification passed.",
  );
}

async function main(): Promise<void> {
  try {
    await runVerification();
  } catch (error) {
    console.error(
      "Media connections repository verification failed.",
    );

    if (error instanceof MediaConnectionsRepositoryError) {
      console.error(`Error code: ${error.code}`);
      console.error(`Message: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
    } else {
      console.error(
        "An unknown repository verification error occurred.",
      );
    }

    process.exitCode = 1;
  }
}

void main();
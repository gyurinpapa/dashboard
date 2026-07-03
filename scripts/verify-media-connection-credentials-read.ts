import {
  decryptNaverSearchAdsConnection,
  MediaConnectionsRepositoryError,
} from "../src/lib/media-sync/media-connections-repository";

const NAVER_SEARCH_ADS_PROVIDER = "naver_searchad";

type VerificationInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
};

function normalizeRequiredArgument(
  value: unknown,
  argumentName: string,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `${argumentName} argument is required.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(
      `${argumentName} argument must not be empty.`,
    );
  }

  if (normalizedValue.length > 200) {
    throw new Error(
      `${argumentName} argument exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function readVerificationInput(): VerificationInput {
  const [
    connectionIdArgument,
    workspaceIdArgument,
    advertiserIdArgument,
  ] = process.argv.slice(2);

  return {
    connectionId: normalizeRequiredArgument(
      connectionIdArgument,
      "connectionId",
    ),
    workspaceId: normalizeRequiredArgument(
      workspaceIdArgument,
      "workspaceId",
    ),
    advertiserId: normalizeRequiredArgument(
      advertiserIdArgument,
      "advertiserId",
    ),
  };
}

function hasNonEmptyString(
  value: unknown,
): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

async function main(): Promise<void> {
  const input = readVerificationInput();

  const decryptedConnection =
    await decryptNaverSearchAdsConnection({
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      advertiserId: input.advertiserId,
    });

  const { connection, credentials } =
    decryptedConnection;

  const providerMatches =
    connection.provider ===
    NAVER_SEARCH_ADS_PROVIDER;

  const scopeMatches =
    connection.id === input.connectionId &&
    connection.workspace_id ===
      input.workspaceId &&
    connection.advertiser_id ===
      input.advertiserId;

  const customerIdPresent =
    hasNonEmptyString(credentials.customerId);

  const accessLicensePresent =
    hasNonEmptyString(
      credentials.accessLicense,
    );

  const secretKeyPresent =
    hasNonEmptyString(credentials.secretKey);

  const externalAccountIdPresent =
    hasNonEmptyString(
      connection.external_account_id,
    );

  const customerIdMatchesExternalAccount =
    credentials.customerId ===
    connection.external_account_id;

  const verificationPassed =
    providerMatches &&
    scopeMatches &&
    customerIdPresent &&
    accessLicensePresent &&
    secretKeyPresent &&
    externalAccountIdPresent &&
    customerIdMatchesExternalAccount;

  console.log(
    "connection found:",
    true,
  );
  console.log(
    "provider:",
    connection.provider,
  );
  console.log(
    "scope matches:",
    scopeMatches,
  );
  console.log(
    "credential decrypt:",
    "success",
  );
  console.log(
    "customerId present:",
    customerIdPresent,
  );
  console.log(
    "accessLicense present:",
    accessLicensePresent,
  );
  console.log(
    "secretKey present:",
    secretKeyPresent,
  );
  console.log(
    "customerId matches external account:",
    customerIdMatchesExternalAccount,
  );
  console.log(
    "verification passed:",
    verificationPassed,
  );

  if (!verificationPassed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof
    MediaConnectionsRepositoryError
  ) {
    console.error(
      "credential verification failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "credential verification failed:",
      error.name,
    );

    process.exitCode = 1;
    return;
  }

  console.error(
    "credential verification failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
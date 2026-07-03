import {
  decryptNaverSearchAdsConnection,
  MediaConnectionsRepositoryError,
} from "../src/lib/media-sync/media-connections-repository";
import {
  NaverSearchAdsApiError,
  validateNaverSearchAdsCredentials,
} from "../src/lib/media-sync/naver-searchads-api";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad";

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

  const credentialsPresent =
    hasNonEmptyString(
      credentials.customerId,
    ) &&
    hasNonEmptyString(
      credentials.accessLicense,
    ) &&
    hasNonEmptyString(
      credentials.secretKey,
    );

  const customerIdMatchesExternalAccount =
    credentials.customerId ===
    connection.external_account_id;

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
    "credentials present:",
    credentialsPresent,
  );
  console.log(
    "customerId matches external account:",
    customerIdMatchesExternalAccount,
  );

  const localVerificationPassed =
    providerMatches &&
    scopeMatches &&
    credentialsPresent &&
    customerIdMatchesExternalAccount;

  if (!localVerificationPassed) {
    console.log(
      "naver api request:",
      "skipped",
    );
    console.log(
      "credential validation passed:",
      false,
    );

    process.exitCode = 1;
    return;
  }

  const apiResult =
    await validateNaverSearchAdsCredentials(
      credentials,
    );

  console.log(
    "naver api request:",
    apiResult.ok
      ? "success"
      : "rejected",
  );
  console.log(
    "http status:",
    apiResult.status,
  );
  console.log(
    "credential validation passed:",
    apiResult.ok,
  );

  if (!apiResult.ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (
    error instanceof
    MediaConnectionsRepositoryError
  ) {
    console.error(
      "credential validation failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (
    error instanceof
    NaverSearchAdsApiError
  ) {
    console.error(
      "credential validation failed:",
      error.code,
    );

    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error(
      "credential validation failed:",
      error.name,
    );

    process.exitCode = 1;
    return;
  }

  console.error(
    "credential validation failed:",
    "UNKNOWN_ERROR",
  );

  process.exitCode = 1;
});
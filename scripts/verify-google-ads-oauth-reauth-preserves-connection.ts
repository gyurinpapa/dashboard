import fs from "node:fs";
import path from "node:path";

function fail(
  message: string,
): never {
  throw new Error(message);
}

function requireContains(
  source: string,
  token: string,
  message: string,
) {
  if (!source.includes(token)) {
    fail(message);
  }
}

const root =
  process.cwd();

const repositoryPath =
  path.join(
    root,
    "src/lib/media-sync/media-connections-repository.ts",
  );

const callbackPath =
  path.join(
    root,
    "app/api/media-connections/google-ads/oauth/callback/route.ts",
  );

const repository =
  fs.readFileSync(
    repositoryPath,
    "utf8",
  );

const callback =
  fs.readFileSync(
    callbackPath,
    "utf8",
  );

const functionStart =
  repository.indexOf(
    "export async function persistVerifiedGoogleAdsConnection(",
  );

const functionEnd =
  repository.indexOf(
    "export async function createNaverSearchAdsConnection(",
    functionStart,
  );

if (
  functionStart < 0 ||
  functionEnd <= functionStart
) {
  fail(
    "Google Ads verified persistence re-auth function is missing.",
  );
}

const reauthFunction =
  repository.slice(
    functionStart,
    functionEnd,
  );

requireContains(
  reauthFunction,
  '.eq(\n        "workspace_id",',
  "Re-auth lookup must bind workspace authority.",
);

requireContains(
  reauthFunction,
  '.eq(\n        "advertiser_id",',
  "Re-auth lookup must bind advertiser authority.",
);

requireContains(
  reauthFunction,
  '.eq(\n        "provider",',
  "Re-auth lookup must bind provider authority.",
);

requireContains(
  reauthFunction,
  '.eq(\n        "external_account_id",',
  "Re-auth lookup must bind Google account authority.",
);

requireContains(
  reauthFunction,
  "return createVerifiedGoogleAdsConnection(",
  "New Google accounts must retain historical create behavior.",
);

requireContains(
  reauthFunction,
  "connectionId:\n        existingRecord.id",
  "Credential encryption must keep the existing connection id as AAD authority.",
);

requireContains(
  reauthFunction,
  "credential_ciphertext:\n            credentialCiphertext",
  "Re-auth must replace encrypted credentials.",
);

requireContains(
  reauthFunction,
  "credential_version:\n            GOOGLE_ADS_CREDENTIAL_VERSION",
  "Re-auth must retain the canonical Google credential version.",
);

requireContains(
  reauthFunction,
  'status:\n            "active"',
  "Successful re-auth must restore active connection status.",
);

requireContains(
  reauthFunction,
  "last_verified_at:\n            verifiedAt",
  "Successful re-auth must advance verification time.",
);

requireContains(
  reauthFunction,
  "last_error:\n            null",
  "Successful re-auth must clear connection error state.",
);

const updateStart =
  reauthFunction.indexOf(
    ".update({",
  );

const updateEnd =
  reauthFunction.indexOf(
    "})\n        .eq(\n          \"id\"",
    updateStart,
  );

if (
  updateStart < 0 ||
  updateEnd <= updateStart
) {
  fail(
    "Google Ads re-auth update object could not be isolated.",
  );
}

const updateObject =
  reauthFunction.slice(
    updateStart,
    updateEnd,
  );

const forbiddenMutationFields = [
  "id:",
  "workspace_id:",
  "advertiser_id:",
  "provider:",
  "external_account_id:",
  "connected_at:",
  "last_sync_at:",
  "created_by:",
  "created_at:",
  "meta:",
  "tenant_id:",
];

for (
  const field
  of forbiddenMutationFields
) {
  if (
    updateObject.includes(
      field,
    )
  ) {
    fail(
      `Re-auth update must preserve ${field.slice(0, -1)}.`,
    );
  }
}

requireContains(
  callback,
  "persistVerifiedGoogleAdsConnection,",
  "OAuth callback must import the re-auth-aware persistence function.",
);

requireContains(
  callback,
  "persistVerifiedConnection:\n            persistVerifiedGoogleAdsConnection,",
  "OAuth callback must use re-auth-aware persistence.",
);

if (
  callback.includes(
    "persistVerifiedConnection:\n            createVerifiedGoogleAdsConnection,",
  )
) {
  fail(
    "OAuth callback still uses create-only Google persistence.",
  );
}

console.log(
  "GOOGLE_OAUTH_REAUTH_EXISTING_CONNECTION_ID=PASS",
);

console.log(
  "GOOGLE_OAUTH_REAUTH_REPORT_MAPPING_PRESERVATION=PASS",
);

console.log(
  "GOOGLE_OAUTH_REAUTH_LAST_SYNC_PRESERVATION=PASS",
);

console.log(
  "GOOGLE_OAUTH_REAUTH_NEW_ACCOUNT_CREATE_FALLBACK=PASS",
);

console.log(
  "GOOGLE_OAUTH_REAUTH_CALLBACK_WIRING=PASS",
);

import { randomUUID } from "node:crypto";

import type { NaverSearchAdsCredentials } from "../src/lib/media-sync/connection-credentials";
import {
  decryptNaverSearchAdsConnection,
  getMediaConnectionRecord,
  MediaConnectionsRepositoryError,
} from "../src/lib/media-sync/media-connections-repository";

const NAVER_SEARCH_ADS_PROVIDER =
  "naver_searchad" as const;

const FORBIDDEN_RESPONSE_KEYS = new Set([
  "credentialciphertext",
  "credentials",
  "credential",
  "accesslicense",
  "secretkey",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "privatekey",
  "password",
  "authorization",
]);

type UnknownRecord = Record<string, unknown>;

type VerificationConfig = {
  baseUrl: string;
  cookie: string;
  deniedCookie: string | null;

  advertiserId: string;
  workspaceId: string;
  connectionId: string;

  replacementCredentials: NaverSearchAdsCredentials;
};

type HttpResult = {
  status: number;
  body: unknown;
};

type VerificationState = {
  replacementApplied: boolean;
  originalCredentials: NaverSearchAdsCredentials | null;
};

function fail(message: string): never {
  throw new Error(message);
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    fail(
      [
        message,
        `Expected: ${String(expected)}`,
        `Actual: ${String(actual)}`,
      ].join("\n"),
    );
  }
}

function isPlainObject(
  value: unknown,
): value is UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function normalizeInspectionKey(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]/g, "");
}

function normalizeRequiredEnvironmentValue(
  value: unknown,
  variableName: string,
  maxLength = 5000,
): string {
  if (typeof value !== "string") {
    fail(
      `${variableName} environment variable is required.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    fail(
      `${variableName} environment variable must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    fail(
      `${variableName} environment variable exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalEnvironmentValue(
  value: unknown,
  maxLength = 10000,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
    fail(
      "Optional environment variable exceeds the maximum allowed length.",
    );
  }

  return normalizedValue;
}

function normalizeBaseUrl(
  value: unknown,
): string {
  const normalizedValue =
    normalizeRequiredEnvironmentValue(
      value,
      "MEDIA_PATCH_VERIFY_BASE_URL",
      2000,
    );

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    fail(
      "MEDIA_PATCH_VERIFY_BASE_URL must be a valid absolute URL.",
    );
  }

  if (
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    fail(
      "MEDIA_PATCH_VERIFY_BASE_URL must use http or https.",
    );
  }

  return parsedUrl
    .toString()
    .replace(/\/+$/, "");
}

function readVerificationConfig(): VerificationConfig {
  return {
    baseUrl: normalizeBaseUrl(
      process.env.MEDIA_PATCH_VERIFY_BASE_URL,
    ),

    cookie:
      normalizeRequiredEnvironmentValue(
        process.env.MEDIA_PATCH_VERIFY_COOKIE,
        "MEDIA_PATCH_VERIFY_COOKIE",
        20000,
      ),

    deniedCookie:
      normalizeOptionalEnvironmentValue(
        process.env
          .MEDIA_PATCH_VERIFY_DENIED_COOKIE,
        20000,
      ),

    advertiserId:
      normalizeRequiredEnvironmentValue(
        process.env
          .MEDIA_PATCH_VERIFY_ADVERTISER_ID,
        "MEDIA_PATCH_VERIFY_ADVERTISER_ID",
        200,
      ),

    workspaceId:
      normalizeRequiredEnvironmentValue(
        process.env
          .MEDIA_PATCH_VERIFY_WORKSPACE_ID,
        "MEDIA_PATCH_VERIFY_WORKSPACE_ID",
        200,
      ),

    connectionId:
      normalizeRequiredEnvironmentValue(
        process.env
          .MEDIA_PATCH_VERIFY_CONNECTION_ID,
        "MEDIA_PATCH_VERIFY_CONNECTION_ID",
        200,
      ),

    replacementCredentials: {
      customerId:
        normalizeRequiredEnvironmentValue(
          process.env
            .MEDIA_PATCH_VERIFY_CUSTOMER_ID,
          "MEDIA_PATCH_VERIFY_CUSTOMER_ID",
          500,
        ),

      accessLicense:
        normalizeRequiredEnvironmentValue(
          process.env
            .MEDIA_PATCH_VERIFY_ACCESS_LICENSE,
          "MEDIA_PATCH_VERIFY_ACCESS_LICENSE",
          5000,
        ),

      secretKey:
        normalizeRequiredEnvironmentValue(
          process.env
            .MEDIA_PATCH_VERIFY_SECRET_KEY,
          "MEDIA_PATCH_VERIFY_SECRET_KEY",
          5000,
        ),
    },
  };
}

function createConnectionCollectionUrl(
  config: VerificationConfig,
): string {
  return [
    config.baseUrl,
    "api",
    "advertisers",
    encodeURIComponent(config.advertiserId),
    "media-connections",
  ].join("/");
}

function createCredentialPatchUrl(
  config: VerificationConfig,
  connectionId = config.connectionId,
): string {
  return [
    config.baseUrl,
    "api",
    "advertisers",
    encodeURIComponent(config.advertiserId),
    "media-connections",
    encodeURIComponent(connectionId),
    "credentials",
  ].join("/");
}

async function parseResponseBody(
  response: Response,
): Promise<unknown> {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return {
      invalid_json_response: true,
    };
  }
}

async function requestJson(
  input: {
    url: string;
    method: "GET" | "PATCH";
    cookie: string;
    body?: unknown;
    rawBody?: string;
  },
): Promise<HttpResult> {
  const headers = new Headers();

  headers.set(
    "accept",
    "application/json",
  );

  headers.set(
    "cookie",
    input.cookie,
  );

  let requestBody: string | undefined;

  if (input.rawBody !== undefined) {
    headers.set(
      "content-type",
      "application/json",
    );

    requestBody = input.rawBody;
  } else if (input.body !== undefined) {
    headers.set(
      "content-type",
      "application/json",
    );

    requestBody = JSON.stringify(input.body);
  }

  const response = await fetch(input.url, {
    method: input.method,
    headers,
    body: requestBody,
    redirect: "manual",
    cache: "no-store",
  });

  return {
    status: response.status,
    body: await parseResponseBody(response),
  };
}

function assertNoForbiddenResponseKeys(
  value: unknown,
  path = "response",
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoForbiddenResponseKeys(
        item,
        `${path}[${index}]`,
      );
    });

    return;
  }

  assert(
    isPlainObject(value),
    `${path} contains a non-plain response value.`,
  );

  for (const [key, nestedValue] of Object.entries(
    value,
  )) {
    const normalizedKey =
      normalizeInspectionKey(key);

    assert(
      !FORBIDDEN_RESPONSE_KEYS.has(
        normalizedKey,
      ),
      `${path}.${key} contains a prohibited response key.`,
    );

    assertNoForbiddenResponseKeys(
      nestedValue,
      `${path}.${key}`,
    );
  }
}

function requireResponseObject(
  body: unknown,
  context: string,
): UnknownRecord {
  assert(
    isPlainObject(body),
    `${context} response body must be a plain object.`,
  );

  return body;
}

function assertErrorResponse(
  result: HttpResult,
  expectedStatus: number,
  expectedError: string,
  context: string,
): void {
  assertEqual(
    result.status,
    expectedStatus,
    `${context}: HTTP status mismatch.`,
  );

  const body = requireResponseObject(
    result.body,
    context,
  );

  assertEqual(
    body.ok,
    false,
    `${context}: ok must be false.`,
  );

  assertEqual(
    body.error,
    expectedError,
    `${context}: error code mismatch.`,
  );

  assertNoForbiddenResponseKeys(
    body,
    `${context}.body`,
  );
}

function credentialsEqual(
  left: NaverSearchAdsCredentials,
  right: NaverSearchAdsCredentials,
): boolean {
  return (
    left.customerId === right.customerId &&
    left.accessLicense ===
      right.accessLicense &&
    left.secretKey === right.secretKey
  );
}

async function readStoredCredentialState(
  config: VerificationConfig,
): Promise<{
  ciphertext: string;
  credentials: NaverSearchAdsCredentials;
}> {
  const record =
    await getMediaConnectionRecord({
      connectionId: config.connectionId,
      workspaceId: config.workspaceId,
      advertiserId: config.advertiserId,
    });

  assert(
    record,
    "Verification connection was not found in the database.",
  );

  assertEqual(
    record.provider,
    NAVER_SEARCH_ADS_PROVIDER,
    "Verification connection provider mismatch.",
  );

  assert(
    typeof record.credential_ciphertext ===
      "string" &&
      record.credential_ciphertext.length > 0,
    "Verification connection does not contain encrypted credentials.",
  );

  const decrypted =
    await decryptNaverSearchAdsConnection({
      connectionId: config.connectionId,
      workspaceId: config.workspaceId,
      advertiserId: config.advertiserId,
    });

  return {
    ciphertext:
      record.credential_ciphertext,
    credentials: {
      customerId:
        decrypted.credentials.customerId,
      accessLicense:
        decrypted.credentials.accessLicense,
      secretKey:
        decrypted.credentials.secretKey,
    },
  };
}

function buildCredentialRequestBody(
  credentials: NaverSearchAdsCredentials,
): UnknownRecord {
  return {
    provider: NAVER_SEARCH_ADS_PROVIDER,
    credentials: {
      customerId: credentials.customerId,
      accessLicense:
        credentials.accessLicense,
      secretKey: credentials.secretKey,
    },
  };
}

async function verifyInitialGet(
  config: VerificationConfig,
): Promise<void> {
  const result = await requestJson({
    url: createConnectionCollectionUrl(
      config,
    ),
    method: "GET",
    cookie: config.cookie,
  });

  assertEqual(
    result.status,
    200,
    "Initial GET request did not return 200.",
  );

  const body = requireResponseObject(
    result.body,
    "Initial GET",
  );

  assertEqual(
    body.ok,
    true,
    "Initial GET response ok mismatch.",
  );

  assertEqual(
    body.advertiser_id,
    config.advertiserId,
    "Initial GET advertiser scope mismatch.",
  );

  assertEqual(
    body.workspace_id,
    config.workspaceId,
    "Initial GET workspace scope mismatch.",
  );

  assert(
    Array.isArray(body.connections),
    "Initial GET connections must be an array.",
  );

  const targetConnection =
    body.connections.find((value) => {
      return (
        isPlainObject(value) &&
        value.id === config.connectionId
      );
    });

  assert(
    targetConnection,
    "Initial GET did not return the verification connection.",
  );

  assertEqual(
    targetConnection.has_credentials,
    true,
    "Initial GET has_credentials must be true.",
  );

  assertNoForbiddenResponseKeys(
    body,
    "initialGet.body",
  );

  console.log(
    "PASS: initial GET returned the target safe connection.",
  );
}

async function applyCredentialPatch(
  config: VerificationConfig,
  credentials: NaverSearchAdsCredentials,
  cookie = config.cookie,
): Promise<HttpResult> {
  return requestJson({
    url: createCredentialPatchUrl(config),
    method: "PATCH",
    cookie,
    body:
      buildCredentialRequestBody(
        credentials,
      ),
  });
}

async function verifySuccessfulPatch(
  config: VerificationConfig,
): Promise<void> {
  const result =
    await applyCredentialPatch(
      config,
      config.replacementCredentials,
    );

  assertEqual(
    result.status,
    200,
    "Credential PATCH did not return 200.",
  );

  const body = requireResponseObject(
    result.body,
    "Credential PATCH",
  );

  assertEqual(
    body.ok,
    true,
    "Credential PATCH response ok mismatch.",
  );

  assertEqual(
    body.advertiser_id,
    config.advertiserId,
    "Credential PATCH advertiser scope mismatch.",
  );

  assertEqual(
    body.workspace_id,
    config.workspaceId,
    "Credential PATCH workspace scope mismatch.",
  );

  const connection =
    requireResponseObject(
      body.connection,
      "Credential PATCH connection",
    );

  assertEqual(
    connection.id,
    config.connectionId,
    "Credential PATCH connection ID mismatch.",
  );

  assertEqual(
    connection.workspace_id,
    config.workspaceId,
    "Credential PATCH connection workspace mismatch.",
  );

  assertEqual(
    connection.advertiser_id,
    config.advertiserId,
    "Credential PATCH connection advertiser mismatch.",
  );

  assertEqual(
    connection.provider,
    NAVER_SEARCH_ADS_PROVIDER,
    "Credential PATCH provider mismatch.",
  );

  assertEqual(
    connection.has_credentials,
    true,
    "Credential PATCH has_credentials must be true.",
  );

  assertNoForbiddenResponseKeys(
    body,
    "credentialPatch.body",
  );

  console.log(
    "PASS: credential PATCH returned 200 with a safe response.",
  );
}

async function verifyStoredReplacement(
  config: VerificationConfig,
  originalCiphertext: string,
): Promise<void> {
  const replacementState =
    await readStoredCredentialState(config);

  assert(
    replacementState.ciphertext !==
      originalCiphertext,
    "Credential ciphertext did not change after PATCH.",
  );

  assert(
    credentialsEqual(
      replacementState.credentials,
      config.replacementCredentials,
    ),
    "Decrypted replacement credentials do not match the PATCH input.",
  );

  console.log(
    "PASS: database ciphertext changed and replacement credentials decrypted successfully.",
  );
}

async function verifyGetAfterPatch(
  config: VerificationConfig,
): Promise<void> {
  const result = await requestJson({
    url: createConnectionCollectionUrl(
      config,
    ),
    method: "GET",
    cookie: config.cookie,
  });

  assertEqual(
    result.status,
    200,
    "GET after PATCH did not return 200.",
  );

  const body = requireResponseObject(
    result.body,
    "GET after PATCH",
  );

  assertEqual(
    body.ok,
    true,
    "GET after PATCH response ok mismatch.",
  );

  assertNoForbiddenResponseKeys(
    body,
    "getAfterPatch.body",
  );

  assert(
    Array.isArray(body.connections),
    "GET after PATCH connections must be an array.",
  );

  const targetConnection =
    body.connections.find((value) => {
      return (
        isPlainObject(value) &&
        value.id === config.connectionId
      );
    });

  assert(
    targetConnection,
    "GET after PATCH did not return the verification connection.",
  );

  assertEqual(
    targetConnection.has_credentials,
    true,
    "GET after PATCH has_credentials must remain true.",
  );

  console.log(
    "PASS: GET after PATCH remained safe and has_credentials stayed true.",
  );
}

async function verifyInvalidCredentialRequest(
  config: VerificationConfig,
): Promise<void> {
  const result = await requestJson({
    url: createCredentialPatchUrl(config),
    method: "PATCH",
    cookie: config.cookie,
    body: {
      provider: NAVER_SEARCH_ADS_PROVIDER,
      credentials: {
        customerId: "",
        accessLicense: "",
        secretKey: "",
      },
    },
  });

  assertErrorResponse(
    result,
    400,
    "INVALID_INPUT",
    "Invalid credential request",
  );

  console.log(
    "PASS: invalid credentials returned safe 400 INVALID_INPUT.",
  );
}

async function verifyInvalidJsonRequest(
  config: VerificationConfig,
): Promise<void> {
  const result = await requestJson({
    url: createCredentialPatchUrl(config),
    method: "PATCH",
    cookie: config.cookie,
    rawBody: "{",
  });

  assertErrorResponse(
    result,
    400,
    "INVALID_JSON_BODY",
    "Invalid JSON request",
  );

  console.log(
    "PASS: malformed JSON returned safe 400 INVALID_JSON_BODY.",
  );
}

async function verifyMissingConnectionRequest(
  config: VerificationConfig,
): Promise<void> {
  const missingConnectionId =
    randomUUID();

  assert(
    missingConnectionId !==
      config.connectionId,
    "Generated missing connection ID unexpectedly matched the target connection.",
  );

  const result = await requestJson({
    url: createCredentialPatchUrl(
      config,
      missingConnectionId,
    ),
    method: "PATCH",
    cookie: config.cookie,
    body:
      buildCredentialRequestBody(
        config.replacementCredentials,
      ),
  });

  assertErrorResponse(
    result,
    404,
    "CONNECTION_NOT_FOUND",
    "Missing connection request",
  );

  console.log(
    "PASS: missing or out-of-scope connection returned concealed 404.",
  );
}

async function verifyDeniedCookieRequest(
  config: VerificationConfig,
): Promise<void> {
  if (!config.deniedCookie) {
    console.log(
      "SKIP: MEDIA_PATCH_VERIFY_DENIED_COOKIE was not provided, so the 403 role test was not executed.",
    );

    return;
  }

  const result =
    await applyCredentialPatch(
      config,
      config.replacementCredentials,
      config.deniedCookie,
    );

  assertEqual(
    result.status,
    403,
    "Denied-account PATCH did not return 403.",
  );

  const body = requireResponseObject(
    result.body,
    "Denied-account PATCH",
  );

  assertEqual(
    body.ok,
    false,
    "Denied-account PATCH ok must be false.",
  );

  assert(
    typeof body.error === "string" &&
      body.error.length > 0,
    "Denied-account PATCH must return a safe error code.",
  );

  assertNoForbiddenResponseKeys(
    body,
    "deniedPatch.body",
  );

  console.log(
    "PASS: denied account returned a safe 403 response.",
  );
}

async function restoreOriginalCredentials(
  config: VerificationConfig,
  originalCredentials: NaverSearchAdsCredentials,
): Promise<void> {
  const result =
    await applyCredentialPatch(
      config,
      originalCredentials,
    );

  assertEqual(
    result.status,
    200,
    "Original credential restoration PATCH did not return 200.",
  );

  assertNoForbiddenResponseKeys(
    result.body,
    "restorePatch.body",
  );

  const restoredState =
    await readStoredCredentialState(config);

  assert(
    credentialsEqual(
      restoredState.credentials,
      originalCredentials,
    ),
    "Restored credentials do not match the original credentials.",
  );

  console.log(
    "PASS: original credentials were restored and decrypted successfully.",
  );
}

async function main(): Promise<void> {
  const config =
    readVerificationConfig();

  const state: VerificationState = {
    replacementApplied: false,
    originalCredentials: null,
  };

  console.log(
    "Starting media connection credential PATCH route integration verification.",
  );

  console.log(
    "No credential value or ciphertext will be printed.",
  );

  try {
    await verifyInitialGet(config);

    const originalState =
      await readStoredCredentialState(config);

    state.originalCredentials =
      originalState.credentials;

    console.log(
      "PASS: original credential state was read without printing secrets.",
    );

    await verifySuccessfulPatch(config);

    state.replacementApplied = true;

    await verifyStoredReplacement(
      config,
      originalState.ciphertext,
    );

    await verifyGetAfterPatch(config);

    await verifyInvalidCredentialRequest(
      config,
    );

    await verifyInvalidJsonRequest(
      config,
    );

    await verifyMissingConnectionRequest(
      config,
    );

    await verifyDeniedCookieRequest(
      config,
    );

    console.log("");
    console.log(
      "Media connection credential PATCH route integration checks passed.",
    );
  } finally {
    if (
      state.replacementApplied &&
      state.originalCredentials
    ) {
      console.log("");
      console.log(
        "Restoring original credentials.",
      );

      await restoreOriginalCredentials(
        config,
        state.originalCredentials,
      );

      state.replacementApplied = false;
    }
  }

  console.log("");
  console.log(
    "Verification completed without creating sync jobs or changing ingestion snapshots.",
  );
}

main().catch((error: unknown) => {
  console.error("");
  console.error(
    "Media connection credential PATCH route integration verification failed.",
  );

  if (
    error instanceof
    MediaConnectionsRepositoryError
  ) {
    console.error(
      "Failure code:",
      error.code,
    );
  } else if (error instanceof Error) {
    console.error(
      "Failure type:",
      error.name,
    );
    console.error(
      "Failure message:",
      error.message,
    );
  } else {
    console.error(
      "Failure type:",
      "UNKNOWN_ERROR",
    );
  }

  console.error(
    "Credential values and ciphertext were not printed.",
  );

  process.exitCode = 1;
});
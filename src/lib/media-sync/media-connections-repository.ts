import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "../supabase/admin";
import {
  decryptNaverSearchAdsCredentials,
  encryptNaverSearchAdsCredentials,
  type MediaConnectionCredentialContext,
  type NaverSearchAdsCredentials,
} from "./connection-credentials";
import {
  isMediaConnectionStatus,
  isMediaProvider,
  toSafeMediaConnection,
  type JsonObject,
  type JsonValue,
  type MediaConnectionMeta,
  type MediaConnectionRecord,
  type MediaConnectionStatus,
  type SafeMediaConnection,
} from "./types";

const MEDIA_CONNECTIONS_TABLE = "media_connections";
const NAVER_SEARCH_ADS_PROVIDER = "naver_searchad" as const;
const CURRENT_CREDENTIAL_VERSION = 1;

const POSTGRES_UNIQUE_VIOLATION_CODE = "23505";

const FORBIDDEN_META_KEY_FRAGMENTS = [
  "credential",
  "ciphertext",
  "secret",
  "accesslicense",
  "access_license",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "apikey",
  "api_key",
  "privatekey",
  "private_key",
  "password",
  "authorization",
] as const;

export type MediaConnectionsRepositoryErrorCode =
  | "INVALID_INPUT"
  | "INVALID_RECORD"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_ALREADY_EXISTS"
  | "UNSUPPORTED_PROVIDER"
  | "DATABASE_ERROR"
  | "ENCRYPTION_ERROR"
  | "DECRYPTION_ERROR";

export class MediaConnectionsRepositoryError extends Error {
  readonly code: MediaConnectionsRepositoryErrorCode;

  constructor(
    code: MediaConnectionsRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaConnectionsRepositoryError";
    this.code = code;
  }
}

export type CreateNaverSearchAdsConnectionInput = {
  workspaceId: string;
  advertiserId: string;
  externalAccountId: string;
  externalAccountName?: string | null;
  credentials: NaverSearchAdsCredentials;
  createdBy: string;
  meta?: MediaConnectionMeta;
};

export type UpdateNaverSearchAdsCredentialsInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  credentials: NaverSearchAdsCredentials;
};

export type UpdateMediaConnectionStatusInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  status: MediaConnectionStatus;
  lastError?: string | null;
};

export type UpdateMediaConnectionMetaInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
  meta: MediaConnectionMeta;
};

export type GetMediaConnectionInput = {
  connectionId: string;
  workspaceId: string;
  advertiserId: string;
};

export type ListMediaConnectionsInput = {
  workspaceId: string;
  advertiserId: string;
};

export type DecryptedNaverSearchAdsConnection = {
  connection: MediaConnectionRecord;
  credentials: NaverSearchAdsCredentials;
};

type UnknownRecord = Record<string, unknown>;

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string {
  if (typeof value !== "string") {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must not be empty.`,
    );
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
  maxLength = 500,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} must be a string or null.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      `${fieldName} exceeds the maximum allowed length.`,
    );
  }

  return normalizedValue;
}

function normalizeLastError(value: unknown): string | null {
  return normalizeOptionalString(value, "lastError", 2000);
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function normalizeMetaKeyForInspection(key: string): string {
  return key.toLowerCase().replace(/[\s.-]/g, "");
}

function containsForbiddenMetaKey(key: string): boolean {
  const normalizedKey = normalizeMetaKeyForInspection(key);

  return FORBIDDEN_META_KEY_FRAGMENTS.some((fragment) =>
    normalizedKey.includes(
      fragment.replace(/[\s.-]/g, "").toLowerCase(),
    ),
  );
}

function validateSafeMetaValue(
  value: unknown,
  path: string,
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MediaConnectionsRepositoryError(
        "INVALID_INPUT",
        `${path} must contain only finite numbers.`,
      );
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateSafeMetaValue(item, `${path}[${index}]`);
    });

    return;
  }

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (!key.trim()) {
        throw new MediaConnectionsRepositoryError(
          "INVALID_INPUT",
          `${path} contains an empty key.`,
        );
      }

      if (containsForbiddenMetaKey(key)) {
        throw new MediaConnectionsRepositoryError(
          "INVALID_INPUT",
          `${path} contains a key that is not allowed in public metadata.`,
        );
      }

      validateSafeMetaValue(nestedValue, `${path}.${key}`);
    }

    return;
  }

  throw new MediaConnectionsRepositoryError(
    "INVALID_INPUT",
    `${path} contains an unsupported value.`,
  );
}

function normalizeSafeMeta(
  value: MediaConnectionMeta | undefined,
): MediaConnectionMeta {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      "meta must be a plain object.",
    );
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (containsForbiddenMetaKey(key)) {
      throw new MediaConnectionsRepositoryError(
        "INVALID_INPUT",
        "meta contains a key that is not allowed in public metadata.",
      );
    }

    validateSafeMetaValue(nestedValue, `meta.${key}`);
  }

  try {
    return JSON.parse(
      JSON.stringify(value),
    ) as MediaConnectionMeta;
  } catch (error) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      "meta could not be serialized.",
      { cause: error },
    );
  }
}

function requireNullableString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      `Database field ${fieldName} has an invalid value.`,
    );
  }

  return value;
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      `Database field ${fieldName} has an invalid value.`,
    );
  }

  return value;
}

function requireCredentialVersion(value: unknown): number {
  const numberValue = Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue < 1
  ) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      "Database field credential_version has an invalid value.",
    );
  }

  return numberValue;
}

function parseMediaConnectionMeta(
  value: unknown,
): MediaConnectionMeta {
  if (value === null || value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      "Database field meta has an invalid value.",
    );
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (containsForbiddenMetaKey(key)) {
      throw new MediaConnectionsRepositoryError(
        "INVALID_RECORD",
        "Database field meta contains prohibited secret-like data.",
      );
    }

    validateSafeMetaValue(nestedValue, `meta.${key}`);
  }

  return value as MediaConnectionMeta;
}

function parseMediaConnectionRecord(
  value: unknown,
): MediaConnectionRecord {
  if (!isPlainObject(value)) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      "Media connection database result is invalid.",
    );
  }

  if (!isMediaProvider(value.provider)) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      "Media connection contains an invalid provider.",
    );
  }

  if (!isMediaConnectionStatus(value.status)) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_RECORD",
      "Media connection contains an invalid status.",
    );
  }

  const credentialCiphertext =
    value.credential_ciphertext === null
      ? null
      : requireString(
          value.credential_ciphertext,
          "credential_ciphertext",
        );

  return {
    id: requireString(value.id, "id"),
    workspace_id: requireString(
      value.workspace_id,
      "workspace_id",
    ),
    advertiser_id: requireString(
      value.advertiser_id,
      "advertiser_id",
    ),

    provider: value.provider,
    external_account_id: requireString(
      value.external_account_id,
      "external_account_id",
    ),
    external_account_name: requireNullableString(
      value.external_account_name,
      "external_account_name",
    ),

    credential_ciphertext: credentialCiphertext,
    credential_version: requireCredentialVersion(
      value.credential_version,
    ),

    status: value.status,

    connected_at: requireNullableString(
      value.connected_at,
      "connected_at",
    ),
    last_verified_at: requireNullableString(
      value.last_verified_at,
      "last_verified_at",
    ),
    last_sync_at: requireNullableString(
      value.last_sync_at,
      "last_sync_at",
    ),
    last_error: requireNullableString(
      value.last_error,
      "last_error",
    ),

    meta: parseMediaConnectionMeta(value.meta),

    created_by: requireString(
      value.created_by,
      "created_by",
    ),
    created_at: requireString(
      value.created_at,
      "created_at",
    ),
    updated_at: requireString(
      value.updated_at,
      "updated_at",
    ),
  };
}

function createCredentialContext(
  record: Pick<
    MediaConnectionRecord,
    | "id"
    | "workspace_id"
    | "advertiser_id"
    | "provider"
    | "external_account_id"
  >,
): MediaConnectionCredentialContext {
  return {
    connectionId: record.id,
    workspaceId: record.workspace_id,
    advertiserId: record.advertiser_id,
    provider: record.provider,
    externalAccountId: record.external_account_id,
  };
}

function wrapDatabaseError(
  message: string,
  error: unknown,
): MediaConnectionsRepositoryError {
  return new MediaConnectionsRepositoryError(
    "DATABASE_ERROR",
    message,
    { cause: error },
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (!isPlainObject(error)) {
    return false;
  }

  return error.code === POSTGRES_UNIQUE_VIOLATION_CODE;
}

export async function listSafeMediaConnections(
  input: ListMediaConnectionsInput,
): Promise<SafeMediaConnection[]> {
  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .order("created_at", { ascending: true });

  if (error) {
    throw wrapDatabaseError(
      "Media connections could not be loaded.",
      error,
    );
  }

  return (data ?? []).map((record) =>
    toSafeMediaConnection(
      parseMediaConnectionRecord(record),
    ),
  );
}

export async function getMediaConnectionRecord(
  input: GetMediaConnectionInput,
): Promise<MediaConnectionRecord | null> {
  const connectionId = normalizeRequiredString(
    input.connectionId,
    "connectionId",
    200,
  );
  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .select("*")
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  if (error) {
    throw wrapDatabaseError(
      "Media connection could not be loaded.",
      error,
    );
  }

  if (!data) {
    return null;
  }

  return parseMediaConnectionRecord(data);
}

export async function getSafeMediaConnection(
  input: GetMediaConnectionInput,
): Promise<SafeMediaConnection | null> {
  const record = await getMediaConnectionRecord(input);

  return record ? toSafeMediaConnection(record) : null;
}

export async function requireMediaConnectionRecord(
  input: GetMediaConnectionInput,
): Promise<MediaConnectionRecord> {
  const record = await getMediaConnectionRecord(input);

  if (!record) {
    throw new MediaConnectionsRepositoryError(
      "CONNECTION_NOT_FOUND",
      "Media connection was not found.",
    );
  }

  return record;
}

export async function createNaverSearchAdsConnection(
  input: CreateNaverSearchAdsConnectionInput,
): Promise<SafeMediaConnection> {
  const id = randomUUID();

  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );
  const externalAccountId = normalizeRequiredString(
    input.externalAccountId,
    "externalAccountId",
    300,
  );
  const externalAccountName = normalizeOptionalString(
    input.externalAccountName,
    "externalAccountName",
    500,
  );
  const createdBy = normalizeRequiredString(
    input.createdBy,
    "createdBy",
    200,
  );
  const meta = normalizeSafeMeta(input.meta);
  const now = new Date().toISOString();

  const credentialContext: MediaConnectionCredentialContext = {
    connectionId: id,
    workspaceId,
    advertiserId,
    provider: NAVER_SEARCH_ADS_PROVIDER,
    externalAccountId,
  };

  let credentialCiphertext: string;

  try {
    credentialCiphertext =
      encryptNaverSearchAdsCredentials(
        input.credentials,
        credentialContext,
      );
  } catch (error) {
    throw new MediaConnectionsRepositoryError(
      "ENCRYPTION_ERROR",
      "Media connection credentials could not be encrypted.",
      { cause: error },
    );
  }

  const insertRecord = {
    id,
    workspace_id: workspaceId,
    advertiser_id: advertiserId,

    provider: NAVER_SEARCH_ADS_PROVIDER,
    external_account_id: externalAccountId,
    external_account_name: externalAccountName,

    credential_ciphertext: credentialCiphertext,
    credential_version: CURRENT_CREDENTIAL_VERSION,

    status: "active" satisfies MediaConnectionStatus,

    connected_at: now,
    last_verified_at: null,
    last_sync_at: null,
    last_error: null,

    meta,

    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .insert(insertRecord)
    .select("*")
    .single();

  credentialCiphertext = "";

  if (error) {
    if (isUniqueViolation(error)) {
      throw new MediaConnectionsRepositoryError(
        "CONNECTION_ALREADY_EXISTS",
        "A media connection already exists for this advertiser, provider, and account.",
        { cause: error },
      );
    }

    throw wrapDatabaseError(
      "Media connection could not be created.",
      error,
    );
  }

  return toSafeMediaConnection(
    parseMediaConnectionRecord(data),
  );
}

export async function updateNaverSearchAdsCredentials(
  input: UpdateNaverSearchAdsCredentialsInput,
): Promise<SafeMediaConnection> {
  const existingRecord =
    await requireMediaConnectionRecord({
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
      advertiserId: input.advertiserId,
    });

  if (existingRecord.provider !== NAVER_SEARCH_ADS_PROVIDER) {
    throw new MediaConnectionsRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads credentials can be updated at this stage.",
    );
  }

  const credentialContext =
    createCredentialContext(existingRecord);

  let credentialCiphertext: string;

  try {
    credentialCiphertext =
      encryptNaverSearchAdsCredentials(
        input.credentials,
        credentialContext,
      );
  } catch (error) {
    throw new MediaConnectionsRepositoryError(
      "ENCRYPTION_ERROR",
      "Media connection credentials could not be encrypted.",
      { cause: error },
    );
  }

  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .update({
      credential_ciphertext: credentialCiphertext,
      credential_version: CURRENT_CREDENTIAL_VERSION,
      status: "active",
      connected_at: existingRecord.connected_at ?? now,
      last_verified_at: null,
      last_error: null,
      updated_at: now,
    })
    .eq("id", existingRecord.id)
    .eq("workspace_id", existingRecord.workspace_id)
    .eq("advertiser_id", existingRecord.advertiser_id)
    .select("*")
    .maybeSingle();

  credentialCiphertext = "";

  if (error) {
    throw wrapDatabaseError(
      "Media connection credentials could not be updated.",
      error,
    );
  }

  if (!data) {
    throw new MediaConnectionsRepositoryError(
      "CONNECTION_NOT_FOUND",
      "Media connection was not found during credential update.",
    );
  }

  return toSafeMediaConnection(
    parseMediaConnectionRecord(data),
  );
}

export async function updateMediaConnectionStatus(
  input: UpdateMediaConnectionStatusInput,
): Promise<SafeMediaConnection> {
  const connectionId = normalizeRequiredString(
    input.connectionId,
    "connectionId",
    200,
  );
  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );

  if (!isMediaConnectionStatus(input.status)) {
    throw new MediaConnectionsRepositoryError(
      "INVALID_INPUT",
      "status is invalid.",
    );
  }

  const lastError =
    input.status === "error"
      ? normalizeLastError(input.lastError)
      : null;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .update({
      status: input.status,
      last_error: lastError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw wrapDatabaseError(
      "Media connection status could not be updated.",
      error,
    );
  }

  if (!data) {
    throw new MediaConnectionsRepositoryError(
      "CONNECTION_NOT_FOUND",
      "Media connection was not found during status update.",
    );
  }

  return toSafeMediaConnection(
    parseMediaConnectionRecord(data),
  );
}

export async function updateMediaConnectionMeta(
  input: UpdateMediaConnectionMetaInput,
): Promise<SafeMediaConnection> {
  const connectionId = normalizeRequiredString(
    input.connectionId,
    "connectionId",
    200,
  );
  const workspaceId = normalizeRequiredString(
    input.workspaceId,
    "workspaceId",
    200,
  );
  const advertiserId = normalizeRequiredString(
    input.advertiserId,
    "advertiserId",
    200,
  );
  const meta = normalizeSafeMeta(input.meta);

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(MEDIA_CONNECTIONS_TABLE)
    .update({
      meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .eq("advertiser_id", advertiserId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw wrapDatabaseError(
      "Media connection metadata could not be updated.",
      error,
    );
  }

  if (!data) {
    throw new MediaConnectionsRepositoryError(
      "CONNECTION_NOT_FOUND",
      "Media connection was not found during metadata update.",
    );
  }

  return toSafeMediaConnection(
    parseMediaConnectionRecord(data),
  );
}

export async function decryptNaverSearchAdsConnection(
  input: GetMediaConnectionInput,
): Promise<DecryptedNaverSearchAdsConnection> {
  const connection =
    await requireMediaConnectionRecord(input);

  if (connection.provider !== NAVER_SEARCH_ADS_PROVIDER) {
    throw new MediaConnectionsRepositoryError(
      "UNSUPPORTED_PROVIDER",
      "Only Naver Search Ads credentials can be decrypted at this stage.",
    );
  }

  if (!connection.credential_ciphertext) {
    throw new MediaConnectionsRepositoryError(
      "DECRYPTION_ERROR",
      "Media connection does not contain credentials.",
    );
  }

  if (
    connection.credential_version !==
    CURRENT_CREDENTIAL_VERSION
  ) {
    throw new MediaConnectionsRepositoryError(
      "DECRYPTION_ERROR",
      "Media connection uses an unsupported credential version.",
    );
  }

  try {
    const credentials =
      decryptNaverSearchAdsCredentials(
        connection.credential_ciphertext,
        createCredentialContext(connection),
      );

    return {
      connection,
      credentials,
    };
  } catch (error) {
    throw new MediaConnectionsRepositoryError(
      "DECRYPTION_ERROR",
      "Media connection credentials could not be decrypted.",
      { cause: error },
    );
  }
}
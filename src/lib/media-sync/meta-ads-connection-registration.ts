import { randomUUID } from "node:crypto";
import {
  encryptMetaAdsCredentials,
  MetaAdsCredentialError,
  validateMetaAdsCredentials,
} from "./meta-ads-credentials";
import type { MediaConnectionsPostAccessContext } from "./media-connections-post-policy";
import { toSafeMediaConnection, type MediaConnectionRecord, type SafeMediaConnection } from "./types";

export type MetaAdsRegistrationErrorCode = "INVALID_INPUT" | "FORBIDDEN" | "SCOPE_MISMATCH" |
  "ALREADY_EXISTS" | "ENCRYPTION_FAILED" | "PERSISTENCE_FAILED";
export class MetaAdsRegistrationError extends Error {
  constructor(readonly code: MetaAdsRegistrationErrorCode) {
    super(`Meta Ads registration ${code}.`);
    this.name = "MetaAdsRegistrationError";
  }
}
function requireValue(value: unknown, code: MetaAdsRegistrationErrorCode): asserts value {
  if (!value) throw new MetaAdsRegistrationError(code);
}
function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}

/** Body scope is only an assertion. Ownership always comes from the access resolver. */
export function prepareMetaAdsConnectionRegistration(
  advertiserId: string,
  access: MediaConnectionsPostAccessContext,
  body: unknown,
): MediaConnectionRecord {
  try {
    requireValue(typeof window === "undefined", "FORBIDDEN");
    requireValue(access.canManageConnections === true &&
      ["workspace", "true_master"].includes(access.accessScope), "FORBIDDEN");
    requireValue(validId(advertiserId) && validId(access.userId) && validId(access.workspaceId) &&
      validId(access.advertiserId) && access.advertiserId === advertiserId, "SCOPE_MISMATCH");
    requireValue(body && typeof body === "object" && !Array.isArray(body) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(body)), "INVALID_INPUT");
    const keys = ["expectedWorkspaceId", "externalAccountId", "externalAccountName", "credentials"];
    requireValue(Reflect.ownKeys(body).length === keys.length &&
      Reflect.ownKeys(body).every(k => typeof k === "string" && keys.includes(k)), "INVALID_INPUT");
    const b: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(body, key);
      requireValue(descriptor && Object.hasOwn(descriptor, "value"), "INVALID_INPUT");
      b[key] = descriptor.value;
    }
    requireValue(b.expectedWorkspaceId === access.workspaceId, "SCOPE_MISMATCH");
    requireValue(typeof b.externalAccountId === "string" && /^[1-9][0-9]{0,29}$/.test(b.externalAccountId), "INVALID_INPUT");
    requireValue(b.externalAccountName === null || (typeof b.externalAccountName === "string" &&
      b.externalAccountName.length <= 500 && !/[\x00-\x1f\x7f]/.test(b.externalAccountName)), "INVALID_INPUT");
    const credentials = validateMetaAdsCredentials(b.credentials);
    const id = randomUUID(), now = new Date().toISOString();
    const ciphertext = encryptMetaAdsCredentials(credentials, {
      connectionId: id, workspaceId: access.workspaceId, advertiserId: access.advertiserId,
      provider: "meta_ads", externalAccountId: b.externalAccountId,
    });
    return {
      id, workspace_id: access.workspaceId, advertiser_id: access.advertiserId,
      provider: "meta_ads", external_account_id: b.externalAccountId,
      external_account_name: typeof b.externalAccountName === "string" ? b.externalAccountName.trim() || null : null,
      credential_ciphertext: ciphertext, credential_version: 1,
      // active means registered, never proof of token validity. Sync remains gated off.
      status: "active", connected_at: null, last_verified_at: null, last_sync_at: null, last_error: null,
      meta: { sourceOwnership: "api", dataLevel: "creative" },
      created_by: access.userId, created_at: now, updated_at: now,
    };
  } catch (error) {
    if (error instanceof MetaAdsRegistrationError) throw error;
    if (error instanceof MetaAdsCredentialError && error.code === "ENCRYPTION_FAILED") {
      throw new MetaAdsRegistrationError("ENCRYPTION_FAILED");
    }
    // No arbitrary input, lower-level cause, token or ciphertext in public errors.
    throw new MetaAdsRegistrationError("INVALID_INPUT");
  }
}

export type InsertMetaAdsConnection = (record: MediaConnectionRecord) => Promise<{
  data: unknown;
  error: unknown;
}>;

/** Injected storage is tested offline. No upsert, re-auth overwrite, Meta API or job creation. */
export async function registerMetaAdsConnection(input: {
  advertiserId: string;
  access: MediaConnectionsPostAccessContext;
  body: unknown;
}, insert: InsertMetaAdsConnection): Promise<SafeMediaConnection> {
  const record = prepareMetaAdsConnectionRegistration(input.advertiserId, input.access, input.body);
  try {
    const { data, error } = await insert(record);
    if (error) {
      const duplicate = typeof error === "object" && (error as { code?: unknown }).code === "23505";
      throw new MetaAdsRegistrationError(duplicate ? "ALREADY_EXISTS" : "PERSISTENCE_FAILED");
    }
    // Confirm only a safe identity projection; never serialize a database response wholesale.
    requireValue(data && typeof data === "object", "PERSISTENCE_FAILED");
    const stored = data as Record<string, unknown>;
    for (const key of ["id", "workspace_id", "advertiser_id", "provider", "external_account_id", "status", "last_verified_at"] as const) {
      requireValue(stored[key] === record[key], "PERSISTENCE_FAILED");
    }
    return toSafeMediaConnection(record);
  } catch (error) {
    if (error instanceof MetaAdsRegistrationError) throw error;
    throw new MetaAdsRegistrationError("PERSISTENCE_FAILED");
  } finally {
    record.credential_ciphertext = null;
  }
}

import { decryptMediaCredentialJson, encryptMediaCredentialJson } from "./crypto";

export type MetaAdsCredentials = Readonly<{ version: 1; access_token: string }>;
export type MetaAdsCredentialContext = Readonly<{
  connectionId: string; workspaceId: string; advertiserId: string;
  provider: "meta_ads"; externalAccountId: string;
}>;
export type MetaAdsCredentialErrorCode = "SERVER_ONLY" | "INVALID_CONTEXT" | "UNSUPPORTED_PROVIDER" |
  "INVALID_CREDENTIALS" | "ENCRYPTION_FAILED" | "DECRYPTION_FAILED";
export class MetaAdsCredentialError extends Error {
  constructor(readonly code: MetaAdsCredentialErrorCode) {
    super(`Meta Ads credential ${code}.`); this.name = "MetaAdsCredentialError";
  }
}
const NAMESPACE = "etrylue:meta-ads-connection-credential:v1";
function requireValue(ok: unknown, code: MetaAdsCredentialErrorCode): asserts ok {
  if (!ok) throw new MetaAdsCredentialError(code);
}
function serverOnly() { requireValue(typeof window === "undefined", "SERVER_ONLY"); }
function record(value: unknown, keys: string[], code: MetaAdsCredentialErrorCode): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  const names = Reflect.ownKeys(value);
  requireValue(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)), code);
  // Do not execute a caller's getter while validating secret-bearing objects.
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValue(descriptor && Object.hasOwn(descriptor, "value"), code);
  }
  return value as Record<string, unknown>;
}
function safe<T>(code: MetaAdsCredentialErrorCode, operation: () => T): T {
  try { serverOnly(); return operation(); }
  catch (error) {
    if (error instanceof MetaAdsCredentialError) throw error;
    // Never retain lower-level causes, caller values or plaintext in errors.
    throw new MetaAdsCredentialError(code);
  }
}
export function normalizeMetaAdsCredentialContext(value: MetaAdsCredentialContext): MetaAdsCredentialContext {
  return safe("INVALID_CONTEXT", () => {
    const c = record(value, ["connectionId", "workspaceId", "advertiserId", "provider", "externalAccountId"], "INVALID_CONTEXT");
    requireValue(c.provider === "meta_ads", "UNSUPPORTED_PROVIDER");
    for (const key of ["connectionId", "workspaceId", "advertiserId"]) {
      const id = c[key];
      requireValue(typeof id === "string" && id.length > 0 && id.length <= 200 &&
        id === id.trim() && !/[\x00-\x1f\x7f]/.test(id), "INVALID_CONTEXT");
    }
    // Keep account identity identical to the canonical collector; no numeric
    // coercion, silent trimming, or act_ prefix conversion in encryption AAD.
    requireValue(typeof c.externalAccountId === "string" && /^[1-9][0-9]{0,29}$/.test(c.externalAccountId), "INVALID_CONTEXT");
    return Object.freeze({ connectionId: c.connectionId as string, workspaceId: c.workspaceId as string,
      advertiserId: c.advertiserId as string, provider: "meta_ads", externalAccountId: c.externalAccountId });
  });
}
export function buildMetaAdsCredentialAad(context: MetaAdsCredentialContext): string {
  const c = normalizeMetaAdsCredentialContext(context);
  return [NAMESPACE, ...[c.connectionId, c.workspaceId, c.advertiserId, c.provider, c.externalAccountId].map(encodeURIComponent)].join(":");
}
/** Local storage format only. An opaque token's type, permissions, expiry,
 * account access and OAuth provenance cannot be established by this codec.
 */
export function validateMetaAdsCredentials(value: unknown): MetaAdsCredentials {
  return safe("INVALID_CREDENTIALS", () => {
    const c = record(value, ["version", "access_token"], "INVALID_CREDENTIALS");
    requireValue(c.version === 1 && typeof c.access_token === "string" && /^[\x21-\x7e]{1,20000}$/.test(c.access_token), "INVALID_CREDENTIALS");
    return Object.freeze({ version: 1, access_token: c.access_token });
  });
}
export function encryptMetaAdsCredentials(value: unknown, context: MetaAdsCredentialContext): string {
  const credentials = validateMetaAdsCredentials(value), aad = buildMetaAdsCredentialAad(context);
  return safe("ENCRYPTION_FAILED", () => encryptMediaCredentialJson({ ...credentials }, aad));
}
export function decryptMetaAdsCredentials(ciphertext: string, context: MetaAdsCredentialContext): MetaAdsCredentials {
  const aad = buildMetaAdsCredentialAad(context);
  requireValue(typeof ciphertext === "string" && ciphertext.length > 0 && ciphertext.length <= 65536, "DECRYPTION_FAILED");
  try { return validateMetaAdsCredentials(decryptMediaCredentialJson(ciphertext, aad)); }
  catch { throw new MetaAdsCredentialError("DECRYPTION_FAILED"); }
}
export function toSafeMetaAdsCredentialInfo(value: unknown, context: MetaAdsCredentialContext) {
  validateMetaAdsCredentials(value);
  const c = normalizeMetaAdsCredentialContext(context);
  return Object.freeze({ provider: "meta_ads" as const, credentialVersion: 1 as const,
    externalAccountId: c.externalAccountId, hasAccessToken: true as const });
}

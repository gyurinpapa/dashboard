import { MediaConnectionAccessError, type ResolveAdvertiserMediaAccessInput } from "./media-connection-access";
import type { MediaConnectionsPostAccessContext } from "./media-connections-post-policy";
import { decryptMetaAdsCredentials, MetaAdsCredentialError } from "./meta-ads-credentials";
import { readMetaAdsAccountMetadata, MetaAdsAccountPreflightError } from "./meta-ads-account-preflight";
import type { MediaConnectionRecord } from "./types";

export type MetaAdsVerificationRecord = Pick<MediaConnectionRecord,
  "id" | "workspace_id" | "advertiser_id" | "provider" | "external_account_id" |
  "credential_ciphertext" | "credential_version" | "status" | "connected_at" | "updated_at">;
export type MetaAdsVerificationScope = { connectionId: string; workspaceId: string; advertiserId: string };
export type MetaAdsVerificationStore = {
  load: (scope: MetaAdsVerificationScope) => Promise<MetaAdsVerificationRecord | null>;
  markVerified: (record: MetaAdsVerificationRecord, verifiedAt: string) => Promise<boolean>;
};
type Dependencies = MetaAdsVerificationStore & {
  resolveAccess: (input: ResolveAdvertiserMediaAccessInput) => Promise<MediaConnectionsPostAccessContext>;
  fetchImpl: typeof fetch;
};
class VerificationError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
function requireValue(value: unknown, code: string, status: number): asserts value {
  if (!value) throw new VerificationError(code, status);
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
async function readWorkspace(request: Request): Promise<string> {
  requireValue(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json" &&
    request.body, "INVALID_INPUT", 400);
  const reader = request.body!.getReader();
  let bytes = 0, body = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      requireValue(bytes <= 1024, "INVALID_INPUT", 400);
      body += decoder.decode(value, { stream: true });
    }
    const parsed = JSON.parse(body + decoder.decode());
    requireValue(parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 && validId(parsed.expectedWorkspaceId), "INVALID_INPUT", 400);
    return parsed.expectedWorkspaceId;
  } catch { throw new VerificationError("INVALID_INPUT", 400); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Verify one stored Meta credential with one account GET. This does not validate
 * Insights metrics or enable collection. Only successful account access is recorded.
 */
export async function handleMetaAdsConnectionVerification(request: Request, advertiserId: string,
  connectionId: string, deps: Dependencies): Promise<Response> {
  let record: MetaAdsVerificationRecord | null = null;
  try {
    requireValue(typeof window === "undefined", "FORBIDDEN", 403);
    const origin = request.headers.get("origin");
    requireValue((!origin || origin === new URL(request.url).origin) &&
      request.headers.get("sec-fetch-site") !== "cross-site", "FORBIDDEN", 403);
    requireValue(request.method === "POST" && validId(advertiserId) && validId(connectionId), "INVALID_INPUT", 400);
    const access = await deps.resolveAccess({ request, advertiserId, action: "manage_connections" });
    requireValue(access.canManageConnections && ["workspace", "true_master"].includes(access.accessScope), "FORBIDDEN", 403);
    const expectedWorkspaceId = await readWorkspace(request);
    requireValue(access.advertiserId === advertiserId && access.workspaceId === expectedWorkspaceId,
      "SCOPE_MISMATCH", 409);
    const loaded = await deps.load({ connectionId, workspaceId: access.workspaceId, advertiserId });
    requireValue(loaded, "META_CONNECTION_NOT_FOUND", 404);
    record = { ...loaded };
    requireValue(record.id === connectionId && record.workspace_id === access.workspaceId &&
      record.advertiser_id === advertiserId && record.provider === "meta_ads", "SCOPE_MISMATCH", 409);
    requireValue(record.status === "active", "META_CONNECTION_INACTIVE", 409);
    requireValue(record.credential_version === 1 && record.credential_ciphertext,
      "META_CREDENTIALS_REQUIRED", 409);
    requireValue(/^[1-9][0-9]{0,29}$/.test(record.external_account_id) &&
      Number.isFinite(Date.parse(record.updated_at)), "SCOPE_MISMATCH", 409);
    const credentials = decryptMetaAdsCredentials(record.credential_ciphertext, {
      connectionId, workspaceId: access.workspaceId, advertiserId, provider: "meta_ads",
      externalAccountId: record.external_account_id,
    });
    const metadata = await readMetaAdsAccountMetadata({ externalAccountId: record.external_account_id,
      accessToken: credentials.access_token }, { fetchImpl: deps.fetchImpl });
    const verifiedAt = new Date().toISOString();
    // A concurrent credential/scope/status change must not inherit this verification.
    requireValue(await deps.markVerified(record, verifiedAt), "META_CONNECTION_CHANGED", 409);
    return json(200, { ok: true, workspace_id: access.workspaceId, advertiser_id: advertiserId,
      verification: "ACCOUNT_ACCESS_CONFIRMED", sync_enabled: false,
      connection: { id: connectionId, provider: "meta_ads", external_account_id: record.external_account_id,
        last_verified_at: verifiedAt }, account: { currency: metadata.currency, timezone_name: metadata.timeZone } });
  } catch (error) {
    if (error instanceof VerificationError) return json(error.status, { ok: false, error: error.code });
    if (error instanceof MediaConnectionAccessError) {
      const status = error.status === 401 ? 401 : [403, 404].includes(error.status) ? 403 : 500;
      return json(status, { ok: false, error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR" });
    }
    if (error instanceof MetaAdsCredentialError) return json(422, { ok: false, error: "META_CREDENTIALS_UNREADABLE" });
    if (error instanceof MetaAdsAccountPreflightError) {
      const code = error.code === "REQUEST_TIMEOUT" ? "META_VERIFICATION_TIMEOUT" : "META_VERIFICATION_FAILED";
      return json(error.code === "REQUEST_TIMEOUT" ? 504 : 502, { ok: false, error: code });
    }
    // No transport/DB error objects or credentials in logs or public responses.
    return json(500, { ok: false, error: "META_VERIFICATION_SAVE_FAILED" });
  } finally { if (record) record.credential_ciphertext = null; }
}

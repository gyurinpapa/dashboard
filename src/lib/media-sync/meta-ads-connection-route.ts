import { MediaConnectionAccessError, type ResolveAdvertiserMediaAccessInput } from "./media-connection-access";
import type { MediaConnectionsPostAccessContext } from "./media-connections-post-policy";
import { MetaAdsRegistrationError, registerMetaAdsConnection, type InsertMetaAdsConnection } from "./meta-ads-connection-registration";

type Dependencies = {
  resolveAccess: (input: ResolveAdvertiserMediaAccessInput) => Promise<MediaConnectionsPostAccessContext>;
  insert: InsertMetaAdsConnection;
};
const MAX_BODY_BYTES = 32768;
function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) {
    throw new MetaAdsRegistrationError("INVALID_INPUT");
  }
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new MetaAdsRegistrationError("INVALID_INPUT");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MetaAdsRegistrationError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}

export async function handleMetaAdsConnectionPost(request: Request, advertiserId: string, deps: Dependencies) {
  try {
    // JSON + same-origin browser requests; no CORS grant or cross-site cookie mutation.
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return json(403, { ok: false, error: "FORBIDDEN" });
    }
    if (!advertiserId || advertiserId.length > 200 || advertiserId !== advertiserId.trim() || /[\x00-\x1f\x7f]/.test(advertiserId)) {
      return json(400, { ok: false, error: "INVALID_INPUT" });
    }
    const access = await deps.resolveAccess({ request, advertiserId, action: "manage_connections" });
    if (!access.canManageConnections) return json(403, { ok: false, error: "FORBIDDEN" });
    const body = await readBody(request);
    const connection = await registerMetaAdsConnection({ advertiserId, access, body }, deps.insert);
    return json(201, { ok: true, workspace_id: access.workspaceId, advertiser_id: access.advertiserId,
      access_scope: access.accessScope, connection, verification: "NOT_PERFORMED", sync_enabled: false });
  } catch (error) {
    if (error instanceof MediaConnectionAccessError) {
      // Map a fixed set of statuses, without echoing backend messages or causes.
      if (error.status === 401) return json(401, { ok: false, error: "UNAUTHORIZED" });
      if (error.status === 403 || error.status === 404) return json(403, { ok: false, error: "FORBIDDEN" });
    }
    if (error instanceof MetaAdsRegistrationError) {
      const status = error.code === "INVALID_INPUT" ? 400 : error.code === "FORBIDDEN" ? 403 :
        ["SCOPE_MISMATCH", "ALREADY_EXISTS"].includes(error.code) ? 409 : 500;
      return json(status, { ok: false, error: error.code });
    }
    return json(500, { ok: false, error: "INTERNAL_ERROR" });
  }
}

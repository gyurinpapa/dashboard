import { MediaConnectionAccessError, type ResolveAdvertiserMediaAccessInput } from "./media-connection-access";
import type { MediaConnectionsPostAccessContext } from "./media-connections-post-policy";
import type { MetaAdsVerificationRecord, MetaAdsVerificationScope } from "./meta-ads-connection-verification";
import { decryptMetaAdsCredentials, MetaAdsCredentialError } from "./meta-ads-credentials";
import { readMetaAdsAccountMetadata, MetaAdsAccountPreflightError } from "./meta-ads-account-preflight";
import { readMetaAdsInsightsPreview, resolveMetaAdsPreviewRange, MetaAdsInsightsPreviewError } from "./meta-ads-insights-preview";
import { isValidYmd } from "./types";
import { readMetaAdsAdDailyCheck, MetaAdsAdDailyCheckError } from "./meta-ads-ad-daily-check";

export type MetaAdsPreviewRecord = MetaAdsVerificationRecord & { last_verified_at: string | null };
type Dependencies = {
  resolveAccess: (input: ResolveAdvertiserMediaAccessInput) => Promise<MediaConnectionsPostAccessContext>;
  load: (scope: MetaAdsVerificationScope) => Promise<MetaAdsPreviewRecord | null>;
  fetchImpl: typeof fetch;
  now?: () => Date;
};
class PreviewRequestError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
function check(ok: unknown, code: string, status: number): asserts ok {
  if (!ok) throw new PreviewRequestError(code, status);
}
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function readInput(request: Request) {
  check(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json" &&
    request.body, "INVALID_INPUT", 400);
  const reader = request.body!.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; check(size <= 1024, "INVALID_INPUT", 400);
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    check(body && typeof body === "object" && !Array.isArray(body) && uuid(body.expectedWorkspaceId) &&
      Object.keys(body).every(k => ["expectedWorkspaceId", "dateFrom", "dateTo", "includeAdDailyCheck"].includes(k)) &&
      (!Object.hasOwn(body, "includeAdDailyCheck") || typeof body.includeAdDailyCheck === "boolean"), "INVALID_INPUT", 400);
    const explicitRange = Object.hasOwn(body, "dateFrom") || Object.hasOwn(body, "dateTo");
    check(!explicitRange || (typeof body.dateFrom === "string" && typeof body.dateTo === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(body.dateTo) &&
      isValidYmd(body.dateFrom) && isValidYmd(body.dateTo) && body.dateFrom <= body.dateTo &&
      Date.parse(body.dateTo) - Date.parse(body.dateFrom) < 31 * 86400000), "META_PREVIEW_INVALID_RANGE", 400);
    return { expectedWorkspaceId: body.expectedWorkspaceId as string,
      includeAdDailyCheck: body.includeAdDailyCheck === true,
      range: explicitRange ? { dateFrom: body.dateFrom as string, dateTo: body.dateTo as string } : {} };
  } catch (error) {
    throw error instanceof PreviewRequestError ? error : new PreviewRequestError("INVALID_INPUT", 400);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
/** Bounded read-only check through a stored credential. This handler has no write port. */
export async function handleMetaAdsInsightsPreview(request: Request, advertiserId: string,
  connectionId: string, deps: Dependencies): Promise<Response> {
  let connection: MetaAdsPreviewRecord | null = null;
  try {
    check(typeof window === "undefined" && (!request.headers.get("origin") ||
      request.headers.get("origin") === new URL(request.url).origin) &&
      request.headers.get("sec-fetch-site") !== "cross-site", "FORBIDDEN", 403);
    check(request.method === "POST" && uuid(advertiserId) && uuid(connectionId), "INVALID_INPUT", 400);
    const access = await deps.resolveAccess({ request, advertiserId, action: "manage_connections" });
    check(access.canManageConnections && ["workspace", "true_master"].includes(access.accessScope), "FORBIDDEN", 403);
    const input = await readInput(request);
    check(access.advertiserId === advertiserId && access.workspaceId === input.expectedWorkspaceId, "SCOPE_MISMATCH", 409);
    const scope = { connectionId, workspaceId: access.workspaceId, advertiserId };
    const loaded = await deps.load(scope);
    check(loaded, "META_CONNECTION_NOT_FOUND", 404); connection = { ...loaded };
    check(connection.id === connectionId && connection.workspace_id === scope.workspaceId &&
      connection.advertiser_id === advertiserId && connection.provider === "meta_ads" &&
      /^[1-9][0-9]{0,29}$/.test(connection.external_account_id) && Number.isFinite(Date.parse(connection.updated_at)), "SCOPE_MISMATCH", 409);
    check(connection.status === "active", "META_CONNECTION_INACTIVE", 409);
    check(connection.credential_version === 1 && connection.credential_ciphertext, "META_CREDENTIALS_REQUIRED", 409);
    check(connection.last_verified_at && Number.isFinite(Date.parse(connection.last_verified_at)), "META_PREVIEW_VERIFY_FIRST", 409);
    const credentials = decryptMetaAdsCredentials(connection.credential_ciphertext, { ...scope,
      provider: "meta_ads", externalAccountId: connection.external_account_id });
    const metadata = await readMetaAdsAccountMetadata({ externalAccountId: connection.external_account_id,
      accessToken: credentials.access_token }, { fetchImpl: deps.fetchImpl });
    const range = resolveMetaAdsPreviewRange(input.range, metadata.timeZone, deps.now?.());
    const preview = await readMetaAdsInsightsPreview({ ...range, externalAccountId: connection.external_account_id,
      accessToken: credentials.access_token }, deps.fetchImpl);
    const adDailyCheck = input.includeAdDailyCheck ? await readMetaAdsAdDailyCheck({ ...range,
      externalAccountId: connection.external_account_id, accessToken: credentials.access_token }, preview, deps.fetchImpl) : null;
    // Do not display a result obtained before a concurrent credential/scope change.
    const current = await deps.load(scope);
    check(current && current.id === connection.id && current.workspace_id === connection.workspace_id &&
      current.advertiser_id === connection.advertiser_id && current.provider === "meta_ads" &&
      current.status === "active" && current.external_account_id === connection.external_account_id &&
      current.updated_at === connection.updated_at && current.credential_version === connection.credential_version &&
      current.credential_ciphertext === connection.credential_ciphertext &&
      current.last_verified_at === connection.last_verified_at, "META_CONNECTION_CHANGED", 409);
    return json(200, { ok: true, workspace_id: scope.workspaceId, advertiser_id: advertiserId,
      connection_id: connectionId, external_account_id: connection.external_account_id,
      currency: metadata.currency, timezone_name: metadata.timeZone, read_only: true, sync_enabled: false,
      conversion_mapping: "UNCONFIRMED", preview, ad_daily_check: adDailyCheck });
  } catch (error) {
    if (error instanceof PreviewRequestError) return json(error.status, { ok: false, error: error.code });
    if (error instanceof MediaConnectionAccessError) {
      const status = error.status === 401 ? 401 : [403, 404].includes(error.status) ? 403 : 500;
      return json(status, { ok: false, error: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "META_PREVIEW_FAILED" });
    }
    if (error instanceof MetaAdsCredentialError) return json(422, { ok: false, error: "META_CREDENTIALS_UNREADABLE" });
    if (error instanceof MetaAdsInsightsPreviewError && error.code === "INVALID_RANGE") {
      return json(400, { ok: false, error: "META_PREVIEW_INVALID_RANGE" });
    }
    if ((error instanceof MetaAdsInsightsPreviewError || error instanceof MetaAdsAccountPreflightError ||
      error instanceof MetaAdsAdDailyCheckError) && error.code === "REQUEST_TIMEOUT") {
      return json(504, { ok: false, error: "META_VERIFICATION_TIMEOUT" });
    }
    if (error instanceof MetaAdsAdDailyCheckError) return json(502, { ok: false, error: "META_DAILY_CHECK_FAILED" });
    return json(502, { ok: false, error: "META_PREVIEW_FAILED" });
  } finally { if (connection) connection.credential_ciphertext = null; }
}

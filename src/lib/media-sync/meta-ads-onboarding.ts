import { MediaConnectionAccessError, type ResolveAdvertiserMediaAccessInput } from "./media-connection-access";
import type { MediaConnectionsPostAccessContext } from "./media-connections-post-policy";
import type { MetaAdsVerificationRecord, MetaAdsVerificationScope } from "./meta-ads-connection-verification";
import { decryptMetaAdsCredentials, encryptMetaAdsCredentials, validateMetaAdsCredentials } from "./meta-ads-credentials";
import { readMetaAdsAccountMetadata } from "./meta-ads-account-preflight";
import { readMetaAdsInsightsPreview } from "./meta-ads-insights-preview";
import { readMetaAdsAdDailyDataset } from "./meta-ads-ad-daily-check";
import { normalizeMetaDailyWindow, shiftMetaDay } from "./meta-ads-daily";
import { getPreviousCompletedSeoulCalendarDate } from "./naver-searchads-daily-scheduler";
import { MetaAdsContactError, requireMetaContact as check } from "./meta-ads-contact-rows";
import type { MetaAdsContactPolicy } from "./meta-ads-contact-policy";
import { isValidYmd } from "./types";

type Dependencies = {
  resolveAccess: (input: ResolveAdvertiserMediaAccessInput) => Promise<MediaConnectionsPostAccessContext>;
  load: (scope: MetaAdsVerificationScope) => Promise<MetaAdsVerificationRecord | null>;
  activate: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  fetchImpl: typeof fetch; now?: () => Date;
};
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
async function body(request: Request): Promise<Record<string, unknown>> {
  check(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json" && request.body,
    "META_SETUP_INVALID_INPUT", 400);
  const reader = request.body.getReader(); let size = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; check(size <= 32768, "META_SETUP_INVALID_INPUT", 400);
      text += decoder.decode(value, { stream: true });
    }
    const b = JSON.parse(text + decoder.decode());
    check(b && typeof b === "object" && !Array.isArray(b) && Object.keys(b).length === 5 &&
      Object.keys(b).every(k => ["expectedWorkspaceId", "startDate", "conversion", "confirmConversion", "credentials"].includes(k)),
      "META_SETUP_INVALID_INPUT", 400);
    return b;
  } catch { throw new MetaAdsContactError("META_SETUP_INVALID_INPUT", 400); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** User-confirmed website-contact onboarding. API proof and fresh authorization precede every mutation. */
export async function handleMetaAdsOnboarding(request: Request, advertiserId: string, connectionId: string, deps: Dependencies) {
  const json = (status: number, value: unknown) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  let record: MetaAdsVerificationRecord | null = null, input: Record<string, unknown> | null = null;
  try {
    check(typeof window === "undefined" && request.method === "POST" &&
      (!request.headers.get("origin") || request.headers.get("origin") === new URL(request.url).origin) &&
      request.headers.get("sec-fetch-site") !== "cross-site", "FORBIDDEN", 403);
    check(uuid(advertiserId) && uuid(connectionId), "META_SETUP_INVALID_INPUT", 400);
    const authorize = () => deps.resolveAccess({ request, advertiserId, action: "manage_connections" });
    const access = await authorize();
    check(access.canManageConnections && ["workspace", "true_master"].includes(access.accessScope) &&
      access.advertiserId === advertiserId && uuid(access.workspaceId) && uuid(access.userId), "FORBIDDEN", 403);
    input = await body(request);
    check(input.expectedWorkspaceId === access.workspaceId, "SCOPE_MISMATCH");
    check(["website_contact", "website_contact_and_instant_form"].includes(String(input.conversion)) && input.confirmConversion === true, "META_SETUP_CONFIRM_CONVERSION", 400);
    const target = getPreviousCompletedSeoulCalendarDate(deps.now?.() ?? new Date());
    check(typeof input.startDate === "string" && isValidYmd(input.startDate) && input.startDate <= target &&
      input.startDate >= shiftMetaDay(target, -365), "META_SETUP_INVALID_RANGE", 400);
    const loaded = await deps.load({ connectionId, workspaceId: access.workspaceId, advertiserId });
    check(loaded && loaded.id === connectionId && loaded.workspace_id === access.workspaceId && loaded.advertiser_id === advertiserId &&
      loaded.provider === "meta_ads" && ["active", "error"].includes(loaded.status) && loaded.credential_version === 1 &&
      Number.isFinite(Date.parse(loaded.updated_at)), "META_CONNECTION_NOT_FOUND", 404);
    record = { ...loaded };
    const context = { connectionId, workspaceId: access.workspaceId, advertiserId, provider: "meta_ads" as const,
      externalAccountId: record.external_account_id };
    const replacing = input.credentials !== null;
    const credentials = replacing ? validateMetaAdsCredentials(input.credentials) : decryptMetaAdsCredentials(record.credential_ciphertext ?? "", context);
    input.credentials = null;
    const account = await readMetaAdsAccountMetadata({ externalAccountId: record.external_account_id, accessToken: credentials.access_token },
      { fetchImpl: deps.fetchImpl });
    check(account.currency === "KRW" && account.timeZone === "Asia/Seoul", "META_SETUP_UNSUPPORTED_ACCOUNT", 422);
    const policy: MetaAdsContactPolicy = { contract: "meta_contact_snapshot_v1", enabled: true,
      external_account_id: record.external_account_id, currency: account.currency, time_zone: account.timeZone,
      conversion_field: "conversions", conversion_action_type: "contact_website", missing_conversion: "zero_after_complete_reconciliation",
      revenue: "not_provided", attribution: "platform_default", report_type: "db",
      ...(input.conversion === "website_contact_and_instant_form"
        ? { instant_form: { field: "actions", action_type: "onsite_conversion.lead_grouped" } as const } : {}) };
    const range = { dateFrom: input.startDate > shiftMetaDay(target, -6) ? input.startDate : shiftMetaDay(target, -6), dateTo: target };
    const query = { ...range, externalAccountId: record.external_account_id, accessToken: credentials.access_token };
    const aggregate = await readMetaAdsInsightsPreview(query, deps.fetchImpl);
    const dataset = await readMetaAdsAdDailyDataset(query, aggregate, deps.fetchImpl);
    const normalized = normalizeMetaDailyWindow(dataset.records, aggregate, range, policy, dataset.check.page_count);
    const fresh = await authorize();
    check(fresh.canManageConnections && ["workspace", "true_master"].includes(fresh.accessScope) &&
      fresh.userId === access.userId && fresh.workspaceId === access.workspaceId && fresh.advertiserId === advertiserId, "FORBIDDEN", 403);
    const result = await deps.activate({ connection_id: connectionId, workspace_id: access.workspaceId, advertiser_id: advertiserId,
      user_id: access.userId, external_account_id: record.external_account_id, expected_updated_at: record.updated_at,
      replacement_ciphertext: replacing ? encryptMetaAdsCredentials(credentials, context) : null,
      start_date: input.startDate, policy, proof: { date_from: range.dateFrom, date_to: range.dateTo, complete: true,
        totals: normalized.totals, evidence: normalized.evidence, page_count: normalized.page_count, row_count: normalized.rows.length } });
    check(result.connection_id === connectionId && result.enabled === true && typeof result.initial_status === "string",
      "META_SETUP_SAVE_FAILED", 500);
    return json(200, { ok: true, workspace_id: access.workspaceId, advertiser_id: advertiserId, connection_id: connectionId,
      external_account_id: record.external_account_id, verification: "INSIGHTS_CONFIRMED", sync_enabled: true,
      initial_status: result.initial_status, already_enabled: result.already_enabled === true,
      start_date: input.startDate, schedule: "05:00 Asia/Seoul" });
  } catch (error) {
    if (error instanceof MetaAdsContactError) return json(error.status, { ok: false, error: error.code });
    if (error instanceof MediaConnectionAccessError) return json(error.status === 401 ? 401 : 403,
      { ok: false, error: error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
    return json(502, { ok: false, error: "META_SETUP_VERIFICATION_FAILED" });
  } finally { if (record) record.credential_ciphertext = null; if (input) input.credentials = null; }
}

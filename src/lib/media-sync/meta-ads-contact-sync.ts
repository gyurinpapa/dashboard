import { isNaverMetaReportMeta } from "./naver-meta-report";
import { readMetaAdsAccountMetadata } from "./meta-ads-account-preflight";
import { readMetaAdsAdDailyDataset } from "./meta-ads-ad-daily-check";
import { decryptMetaAdsCredentials } from "./meta-ads-credentials";
import { readMetaAdsInsightsPreview, resolveMetaAdsPreviewRange, MetaAdsInsightsPreviewError } from "./meta-ads-insights-preview";
import { readMetaAdsContactPolicy, META_ADS_CONTACT_CONTRACT } from "./meta-ads-contact-policy";
import { normalizeMetaAdsContactRows, requireMetaContact as check, MetaAdsContactError } from "./meta-ads-contact-rows";
import type { MediaConnectionReportAccessContext } from "./media-connection-access";
import type { MetaAdsPreviewRecord } from "./meta-ads-insights-preview-route";

export type MetaAdsContactTarget = {
  report: { id: string; workspace_id: string; advertiser_id: string; updated_at: string; current_ingestion_id: string | null;
    status: string; report_type_key: string; meta: Record<string, unknown> };
  connection: MetaAdsPreviewRecord & { meta: Record<string, unknown> };
  companions?: { id: string; workspace_id: string; advertiser_id: string; provider: string;
    external_account_id: string; status: string; updated_at: string }[];
  mapping: { connection_id: string; workspace_id: string; advertiser_id: string }[];
};
type Access = MediaConnectionReportAccessContext;
type Settings = { dateFrom: string; dateTo: string; dataLevel: string; mode: string };
export type MetaAdsContactSyncDependencies = {
  load: (access: Access) => Promise<MetaAdsContactTarget | null>;
  reauthorize: () => Promise<Access>;
  preflight?: (target: MetaAdsContactTarget, settings: Settings) => Promise<void>;
  save: (payload: Record<string, unknown>) => Promise<unknown>;
  fetchImpl: typeof fetch;
  now?: () => Date;
};
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function validateTarget(target: MetaAdsContactTarget | null, access: Access, settings: Settings) {
  check(target, "META_CONTACT_REPORT_REQUIRED");
  const { report: r, connection: c, mapping } = target;
  check(r.id === access.reportId && r.workspace_id === access.workspaceId && r.advertiser_id === access.advertiserId &&
    r.report_type_key === "db" && ["draft", "ready"].includes(r.status) && Number.isFinite(Date.parse(r.updated_at)), "META_CONTACT_REPORT_REQUIRED");
  const source = object(r.meta.data_source), saved = object(r.meta.media_sync);
  const combined = isNaverMetaReportMeta(r.meta), companions = target.companions ?? [];
  const level = combined ? "mixed" : "creative";
  check(source.kind === "api" && (combined
    ? source.provider === undefined && JSON.stringify(source.providers) === JSON.stringify(["meta_ads", "naver_searchad"]) &&
      r.meta.url_contract_version === 2 && companions.length >= 1 && companions.length <= 15
    : source.provider === "meta_ads" && source.providers === undefined && companions.length === 0) &&
    saved.auto_sync === undefined && settings.dataLevel === level && settings.mode === "snapshot_replace" &&
    saved.date_from === settings.dateFrom && saved.date_to === settings.dateTo && saved.data_level === level &&
    saved.mode === "snapshot_replace", "META_CONTACT_REPORT_REQUIRED");
  const ids = [c.id, ...companions.map(n => n.id)];
  check(mapping.length === ids.length && new Set(ids).size === ids.length &&
    new Set(mapping.map(m => m.connection_id)).size === ids.length && mapping.every(m => ids.includes(m.connection_id) &&
      m.workspace_id === access.workspaceId && m.advertiser_id === access.advertiserId) &&
    companions.every(n => n.workspace_id === access.workspaceId && n.advertiser_id === access.advertiserId &&
      n.provider === "naver_searchad" && n.status === "active") &&
    new Set(companions.map(n => n.external_account_id)).size === companions.length &&
    c.workspace_id === access.workspaceId && c.advertiser_id === access.advertiserId &&
    c.provider === "meta_ads" && c.status === "active" && c.credential_version === 1 && c.credential_ciphertext &&
    c.last_verified_at && Number.isFinite(Date.parse(c.last_verified_at)) && Number.isFinite(Date.parse(c.updated_at)), "META_CONTACT_CHANGED");
  const policy = readMetaAdsContactPolicy(c.meta.meta_ads_reporting, c.external_account_id);
  check(policy && (!combined || (policy.currency === "KRW" && policy.time_zone === "Asia/Seoul")), "META_CONTACT_POLICY_REQUIRED");
  return policy;
}

/** Authenticated, manual snapshot: Meta-only or atomically combined with completed Naver facts. Shared worker capability remains disabled. */
export async function handleMetaAdsContactSync(request: Request, access: Access, settings: Settings,
  deps: MetaAdsContactSyncDependencies): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  let target: MetaAdsContactTarget | null = null;
  try {
    check(typeof window === "undefined" && request.method === "POST" &&
      (!request.headers.get("origin") || request.headers.get("origin") === new URL(request.url).origin) &&
      request.headers.get("sec-fetch-site") !== "cross-site" && access.canRunSync &&
      ["workspace", "true_master"].includes(access.accessScope), "FORBIDDEN", 403);
    target = await deps.load(access);
    const policy = validateTarget(target, access, settings);
    const { connection: c, report: r } = target!;
    const range = resolveMetaAdsPreviewRange(settings, policy.time_zone, deps.now?.());
    if (isNaverMetaReportMeta(r.meta)) {
      check(deps.preflight, "META_CONTACT_REPORT_REQUIRED");
      await deps.preflight(target!, settings);
    }
    const credential = decryptMetaAdsCredentials(c.credential_ciphertext!, { connectionId: c.id,
      workspaceId: c.workspace_id, advertiserId: c.advertiser_id, provider: "meta_ads", externalAccountId: c.external_account_id });
    const metadata = await readMetaAdsAccountMetadata({ externalAccountId: c.external_account_id, accessToken: credential.access_token },
      { fetchImpl: deps.fetchImpl });
    check(metadata.currency === policy.currency && metadata.timeZone === policy.time_zone, "META_CONTACT_POLICY_REQUIRED");
    const input = { ...range, externalAccountId: c.external_account_id, accessToken: credential.access_token };
    const aggregate = await readMetaAdsInsightsPreview(input, deps.fetchImpl);
    const dataset = await readMetaAdsAdDailyDataset(input, aggregate, deps.fetchImpl);
    const normalized = normalizeMetaAdsContactRows(dataset.records, aggregate, range, policy, dataset.check.page_count);
    const freshAccess = await deps.reauthorize();
    check(freshAccess.canRunSync && ["workspace", "true_master"].includes(freshAccess.accessScope) &&
      ["userId", "workspaceId", "advertiserId", "reportId"].every(k =>
        freshAccess[k as keyof Access] === access[k as keyof Access]), "FORBIDDEN", 403);
    const fresh = await deps.load(access);
    validateTarget(fresh, access, settings);
    check(fresh!.report.updated_at === r.updated_at && fresh!.report.current_ingestion_id === r.current_ingestion_id &&
      JSON.stringify(fresh!.mapping) === JSON.stringify(target!.mapping) &&
      JSON.stringify(fresh!.companions ?? []) === JSON.stringify(target!.companions ?? []) &&
      fresh!.connection.id === c.id && fresh!.connection.updated_at === c.updated_at &&
      fresh!.connection.last_verified_at === c.last_verified_at && fresh!.connection.credential_ciphertext === c.credential_ciphertext &&
      JSON.stringify(readMetaAdsContactPolicy(fresh!.connection.meta.meta_ads_reporting, c.external_account_id)) === JSON.stringify(policy),
      "META_CONTACT_CHANGED");
    const payload = { contract: META_ADS_CONTACT_CONTRACT, workspace_id: access.workspaceId, advertiser_id: access.advertiserId,
      report_id: r.id, connection_id: c.id, user_id: access.userId, external_account_id: c.external_account_id,
      expected_report_updated_at: r.updated_at, expected_current_ingestion_id: r.current_ingestion_id,
      expected_connection_updated_at: c.updated_at, expected_last_verified_at: c.last_verified_at,
      date_from: range.dateFrom, date_to: range.dateTo, policy, account_totals: normalized.check.account,
      page_count: normalized.check.page_count, rows: normalized.rows };
    const result = object(await deps.save(payload)), job = object(result.job);
    check(job.provider === "meta_ads" && job.report_id === r.id && job.workspace_id === access.workspaceId &&
      job.advertiser_id === access.advertiserId && job.connection_id === c.id && job.external_account_id === c.external_account_id &&
      job.status === "done" && job.inserted_rows === normalized.rows.length && job.failed_rows === 0 &&
      job.snapshot_ingestion_id === result.snapshot_ingestion_id && typeof job.id === "string", "META_CONTACT_SYNC_FAILED", 500);
    // The repository whitelists returned job fields; never return the collector or DB payload.
    return json(200, { ok: true, report_id: r.id, workspace_id: access.workspaceId, advertiser_id: access.advertiserId,
      access_scope: access.accessScope, job, report_data_saved: true, conversion_mapping: "CONTACT_WEBSITE",
      row_count: result.row_count ?? normalized.rows.length, website_contacts: normalized.check.account.website_contacts });
  } catch (error) {
    if (error instanceof MetaAdsContactError) return json(error.status, { ok: false, error: error.code });
    if (error instanceof MetaAdsInsightsPreviewError && error.code === "INVALID_RANGE")
      return json(400, { ok: false, error: "META_CONTACT_INVALID_RANGE" });
    return json(502, { ok: false, error: "META_CONTACT_SYNC_FAILED" });
  } finally { if (target) target.connection.credential_ciphertext = null; }
}

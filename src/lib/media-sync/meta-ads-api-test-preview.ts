import { META_ADS_API_VERSION } from "./meta-ads-canonical-row";
import { buildMetaAdsAccountMetadataRequest } from "./meta-ads-account-preflight";
import { buildMetaAdsInsightsRequest, metaRequestContext } from "./meta-ads-insights-request";

/** Configuration description only: no credential, connection, job or execution flag. */
export type MetaAdsApiTestPreviewInput = Readonly<{
  externalAccountId: string | null; currency: string | null; timeZone: string | null; date: string | null;
  metricPolicy: Readonly<{ conversionActionType: string | null; revenueActionType: string | null;
    actionReportTime: string | null; attributionWindows: readonly string[] | null }>;
}>;
export class MetaAdsApiTestPreviewError extends Error {
  constructor(readonly code: "SERVER_ONLY" | "INVALID_PREVIEW_INPUT") {
    super(`Meta API preview ${code}.`); this.name = "MetaAdsApiTestPreviewError";
  }
}
function check(ok: unknown): asserts ok {
  if (!ok) throw new MetaAdsApiTestPreviewError("INVALID_PREVIEW_INPUT");
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const names = Reflect.ownKeys(value);
  check(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)));
  return Object.fromEntries(keys.map(k => {
    const d = Object.getOwnPropertyDescriptor(value, k); check(d && Object.hasOwn(d, "value"));
    return [k, d.value];
  }));
}
function nullableText(value: unknown): string | null {
  check(value === null || (typeof value === "string" && value.length > 0 && value.length <= 2000 &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value)));
  return value;
}
function windows(value: unknown): string[] | null {
  if (value === null) return null;
  check(Array.isArray(value) && value.length > 0 && value.length <= 32 &&
    Reflect.ownKeys(value).length === value.length + 1);
  const result = Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i)); check(d && Object.hasOwn(d, "value"));
    const text = nullableText(d.value); check(text !== null); return text;
  });
  check(new Set(result).size === result.length); return result;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Pure description. Never fetches, reads env/credentials, or produces an authorized
 * execution payload. Internal sentinels only let the existing request builders
 * validate partial input; they are replaced with null/template values in output.
 */
export function buildMetaAdsApiTestPreview(input: unknown) {
  try {
    if (typeof window !== "undefined") throw new MetaAdsApiTestPreviewError("SERVER_ONLY");
    const p = record(input, ["externalAccountId", "currency", "timeZone", "date", "metricPolicy"]);
    const m = record(p.metricPolicy, ["conversionActionType", "revenueActionType", "actionReportTime", "attributionWindows"]);
    const externalAccountId = nullableText(p.externalAccountId), currency = nullableText(p.currency),
      timeZone = nullableText(p.timeZone), date = nullableText(p.date);
    const metricPolicy = { conversionActionType: nullableText(m.conversionActionType),
      revenueActionType: nullableText(m.revenueActionType), actionReportTime: nullableText(m.actionReportTime),
      attributionWindows: windows(m.attributionWindows) };
    const config = { externalAccountId, currency, timeZone, date, metricPolicy };
    const missingFields = Object.entries({ externalAccountId, currency, timeZone, date,
      ...Object.fromEntries(Object.entries(metricPolicy).map(([k, v]) => [`metricPolicy.${k}`, v])) })
      .filter(([, value]) => value === null).map(([key]) => key);
    const context = metaRequestContext({ apiVersion: META_ADS_API_VERSION, level: "ad", timeIncrement: 1,
      breakdowns: [], actionBreakdowns: [], externalAccountId: externalAccountId ?? "1",
      currency: currency ?? "XXX", timeZone: timeZone ?? "UTC", dateFrom: date ?? "2000-01-01", dateTo: date ?? "2000-01-01",
      metricPolicy: { conversionActionType: metricPolicy.conversionActionType ?? "preview.unresolved",
        revenueActionType: metricPolicy.revenueActionType ?? "preview.unresolved",
        actionReportTime: metricPolicy.actionReportTime ?? "preview.unresolved",
        attributionWindows: metricPolicy.attributionWindows ?? ["preview.unresolved"] } });
    // This public, non-secret sentinel is discarded with the entire init object.
    const accessToken = "SYNTHETIC_PREVIEW_ONLY_NEVER_SENT";
    const accountRequest = buildMetaAdsAccountMetadataRequest({ externalAccountId: context.externalAccountId, accessToken });
    const insightsRequest = buildMetaAdsInsightsRequest({ context, accessToken, pageSize: 25 });
    function describe(request: { url: string }, operation: "account_metadata" | "ad_daily_insights") {
      const url = new URL(request.url);
      const query: Record<string, string | null> = Object.fromEntries(url.searchParams);
      if (operation === "ad_daily_insights") {
        if (date === null) query.time_range = null;
        if (metricPolicy.actionReportTime === null) query.action_report_time = null;
        if (metricPolicy.attributionWindows === null) query.action_attribution_windows = null;
      }
      return { operation, method: "GET" as const, origin: url.origin,
        path: externalAccountId === null ? url.pathname.replace("/act_1", "/act_<AD_ACCOUNT_ID>") : url.pathname,
        query, credentialIncluded: false as const,
        authorizationRequirement: "SERVER_BEARER_HEADER_NOT_INCLUDED" as const,
        cache: "no-store" as const, redirect: "error" as const };
    }
    return freeze({ kind: "meta_ads_api_test_preview" as const, version: 1 as const,
      status: missingFields.length ? "INCOMPLETE" as const : "CONFIGURED_PREVIEW" as const,
      liveExecutionEnabled: false as const, apiVersion: META_ADS_API_VERSION, configuration: config, missingFields,
      plan: { maximumRequests: 2, accountMetadataRequests: 1, insightsRequests: 1,
        dateWindowDays: 1, maxRowsPerPage: 25, followPagination: false, automaticRetries: 0,
        beforeInsights: "REQUIRE_ACCOUNT_ID_CURRENCY_TIMEZONE_PARITY", scope: "SAMPLE_ONLY_NOT_FULL_SYNC" },
      requests: [describe(accountRequest, "account_metadata"), describe(insightsRequest, "ad_daily_insights")],
      unverified: ["LIVE_CALL_AUTHORIZATION", "ACCOUNT_ACCESS_AND_METADATA", "TOKEN_PERMISSIONS_AND_EXPIRY",
        "ACTION_TYPES_AND_ATTRIBUTION_MEANING", "V26_ACCOUNT_COMPATIBILITY"],
      canonicalRules: { grain: "ad_day", device: "", rowLevel: "creative", missingSelectedAction: "REJECT_WITHOUT_ZERO_INFERENCE",
        zeroFact: "DROP_ONLY_IF_ALL_FIVE_METRICS_ZERO", delayedConversionOrRevenue: "KEEP", raw: "CANONICAL_STAGING_TOTAL_ROWS" } });
  } catch (error) {
    if (error instanceof MetaAdsApiTestPreviewError) throw error;
    throw new MetaAdsApiTestPreviewError("INVALID_PREVIEW_INPUT");
  }
}

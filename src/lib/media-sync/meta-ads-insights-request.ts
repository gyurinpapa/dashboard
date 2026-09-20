import { createHash } from "node:crypto";
import { validateMetaAdsCanonicalContext, type MetaAdsCanonicalContext } from "./meta-ads-canonical-row";

// Server collector only; no credential loading, environment reads or runtime wiring.
export const META_INSIGHTS_ORIGIN = "https://graph.facebook.com";
export const META_INSIGHTS_FIELDS = ["account_id", "campaign_id", "campaign_name", "adset_id", "adset_name",
  "ad_id", "ad_name", "date_start", "date_stop", "impressions", "clicks", "spend", "actions", "action_values"] as const;
export type MetaInsightsErrorCode = "INVALID_INPUT" | "INVALID_RESPONSE" | "UNRESOLVED_METRIC_POLICY" |
  "INVALID_METRIC" | "SCOPE_MISMATCH" | "DUPLICATE_AD_DAY" | "UNSUPPORTED_CONTRACT" |
  "INVALID_CANONICAL_ROW" | "INVALID_CURSOR" | "PAGINATION_LOOP" | "PAGE_LIMIT_EXCEEDED" |
  "ROW_LIMIT_EXCEEDED" | "REQUEST_TIMEOUT" | "REQUEST_FAILED" | "API_HTTP_ERROR" |
  "API_ERROR" | "RETRY_EXHAUSTED" | "RESPONSE_TOO_LARGE";
export class MetaInsightsError extends Error {
  constructor(readonly code: MetaInsightsErrorCode, readonly status: number | null = null,
    readonly retryable = false, readonly retryAfterMs = 0) {
    // Never include response bodies, URLs, credentials, cursors, or error causes.
    super(`Meta insights ${code}.`);
    this.name = "MetaInsightsError";
  }
}
export function requireMeta(ok: unknown, code: MetaInsightsErrorCode = "INVALID_INPUT"): asserts ok {
  if (!ok) throw new MetaInsightsError(code);
}
export function metaObject(value: unknown, code: MetaInsightsErrorCode = "INVALID_RESPONSE"): Record<string, unknown> {
  requireMeta(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  return value as Record<string, unknown>;
}
export function metaBound(value: number, min: number, max: number): number {
  requireMeta(Number.isSafeInteger(value) && value >= min && value <= max);
  return value;
}
export function metaHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function metaCursorToken(value: unknown, code: MetaInsightsErrorCode = "INVALID_CURSOR"): string {
  requireMeta(typeof value === "string" && value.length >= 1 && value.length <= 4096 &&
    /^[A-Za-z0-9_.~+/=-]+$/.test(value), code);
  return value;
}
export function metaRequestContext(value: unknown): MetaAdsCanonicalContext {
  requireMeta(typeof window === "undefined");
  const context = validateMetaAdsCanonicalContext(value);
  requireMeta(/^[1-9][0-9]{0,29}$/.test(context.externalAccountId));
  return context;
}
export function metaInsightsEndpoint(context: MetaAdsCanonicalContext): string {
  return `${META_INSIGHTS_ORIGIN}/${context.apiVersion}/act_${context.externalAccountId}/insights`;
}
export function buildMetaAdsInsightsRequest(input: Readonly<{
  context: MetaAdsCanonicalContext; accessToken: string; pageSize?: number; after?: string;
}>): Readonly<{ url: string; init: Readonly<{ method: "GET"; headers: Readonly<Record<string, string>>;
  cache: "no-store"; redirect: "error" }> }> {
  const context = metaRequestContext(input.context);
  requireMeta(typeof input.accessToken === "string" && /^[\x21-\x7e]{1,20000}$/.test(input.accessToken));
  const size = metaBound(input.pageSize ?? 500, 1, 2000);
  const url = new URL(metaInsightsEndpoint(context));
  const parameters: Record<string, string> = {
    fields: META_INSIGHTS_FIELDS.join(","), level: "ad", time_increment: "1",
    time_range: JSON.stringify({ since: context.dateFrom, until: context.dateTo }),
    breakdowns: "[]", action_breakdowns: "[]", limit: String(size),
    action_report_time: context.metricPolicy.actionReportTime,
    action_attribution_windows: JSON.stringify(context.metricPolicy.attributionWindows),
  };
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  if (input.after !== undefined) url.searchParams.set("after", metaCursorToken(input.after));
  return Object.freeze({ url: url.href, init: Object.freeze({ method: "GET" as const,
    headers: Object.freeze({ Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" }),
    cache: "no-store" as const, redirect: "error" as const }) });
}

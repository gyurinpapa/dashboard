import { META_ADS_API_VERSION, type MetaAdsCanonicalContext, type MetaAdsMetricPolicy } from "./meta-ads-canonical-row";
import { normalizeMetaAdsCredentialContext, type MetaAdsCredentialContext } from "./meta-ads-credentials";
import { metaRequestContext } from "./meta-ads-insights-request";

/** Explicit server configuration, not a Meta API response or proof of account access.
 * Selectors and attribution labels retain the existing collector's opaque semantics.
 * This contract does not choose or certify production action types or API enum values.
 */
export type MetaAdsAccountPolicy = Readonly<{
  version: 1;
  scope: MetaAdsCredentialContext;
  currency: string;
  timeZone: string;
  metricPolicy: MetaAdsMetricPolicy;
}>;
export type MetaAdsPolicyDateRange = Readonly<{ dateFrom: string; dateTo: string }>;
export type MetaAdsResolvedAccountPolicy = Readonly<{
  version: 1; scope: MetaAdsCredentialContext; context: MetaAdsCanonicalContext;
}>;
export type MetaAdsAccountPolicyErrorCode = "SERVER_ONLY" | "INVALID_POLICY" | "INVALID_SCOPE" |
  "SCOPE_MISMATCH" | "INVALID_DATE_RANGE" | "INVALID_ACCOUNT_METADATA" | "UNRESOLVED_METRIC_POLICY";
export class MetaAdsAccountPolicyError extends Error {
  constructor(readonly code: MetaAdsAccountPolicyErrorCode) {
    super(`Meta account policy ${code}.`); this.name = "MetaAdsAccountPolicyError";
  }
}
function requirePolicy(ok: unknown, code: MetaAdsAccountPolicyErrorCode): asserts ok {
  if (!ok) throw new MetaAdsAccountPolicyError(code);
}
// Copy own data properties instead of executing getters or retaining mutable input.
function record(value: unknown, keys: readonly string[], code: MetaAdsAccountPolicyErrorCode): Record<string, unknown> {
  requirePolicy(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  const names = Reflect.ownKeys(value);
  requirePolicy(names.length === keys.length && names.every(k => typeof k === "string" && keys.includes(k)), code);
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    requirePolicy(d && Object.hasOwn(d, "value"), code); copy[key] = d.value;
  }
  return copy;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2000 &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}
const SCOPE_KEYS = ["connectionId", "workspaceId", "advertiserId", "provider", "externalAccountId"] as const;

/** expectedScope and dateRange must come from the authenticated server connection/job,
 * independently of client policy input. Matching values alone do not authorize a job.
 * No credentials, storage, network, worker gates or runtime routes are accessed here.
 */
export function resolveMetaAdsAccountPolicy(policy: unknown, expectedScope: MetaAdsCredentialContext,
  dateRange: MetaAdsPolicyDateRange): MetaAdsResolvedAccountPolicy {
  let failure: MetaAdsAccountPolicyErrorCode = "INVALID_POLICY";
  try {
    requirePolicy(typeof window === "undefined", "SERVER_ONLY");
    const p = record(policy, ["version", "scope", "currency", "timeZone", "metricPolicy"], "INVALID_POLICY");
    requirePolicy(p.version === 1, "INVALID_POLICY");
    failure = "INVALID_SCOPE";
    const scope = normalizeMetaAdsCredentialContext(record(p.scope, SCOPE_KEYS, failure) as MetaAdsCredentialContext);
    const expected = normalizeMetaAdsCredentialContext(record(expectedScope, SCOPE_KEYS, failure) as MetaAdsCredentialContext);
    requirePolicy(SCOPE_KEYS.every(key => scope[key] === expected[key]), "SCOPE_MISMATCH");
    failure = "INVALID_DATE_RANGE";
    const range = record(dateRange, ["dateFrom", "dateTo"], failure);
    // Reuse the canonical validator for calendar dates, ordering and metadata below.
    requirePolicy(text(range.dateFrom) && text(range.dateTo), failure);
    failure = "INVALID_ACCOUNT_METADATA";
    requirePolicy(text(p.currency) && /^[A-Z]{3}$/.test(p.currency) && text(p.timeZone), failure);
    new Intl.DateTimeFormat("en", { timeZone: p.timeZone });
    failure = "UNRESOLVED_METRIC_POLICY";
    const metrics = record(p.metricPolicy,
      ["conversionActionType", "revenueActionType", "actionReportTime", "attributionWindows"], failure);
    requirePolicy(text(metrics.conversionActionType) && text(metrics.revenueActionType) && text(metrics.actionReportTime), failure);
    const windows = metrics.attributionWindows;
    requirePolicy(Array.isArray(windows) && windows.length > 0 && windows.length <= 32, failure);
    // Reject holes, extra properties and accessors. The cap is a local input bound,
    // not a claim about Meta's supported attribution windows.
    const windowRecord = recordArray(windows, failure);
    requirePolicy(windowRecord.every(text) && new Set(windowRecord).size === windowRecord.length, failure);
    failure = "INVALID_DATE_RANGE";
    const context = metaRequestContext({ apiVersion: META_ADS_API_VERSION,
      level: "ad", timeIncrement: 1, breakdowns: [], actionBreakdowns: [],
      externalAccountId: scope.externalAccountId, dateFrom: range.dateFrom, dateTo: range.dateTo,
      currency: p.currency, timeZone: p.timeZone,
      metricPolicy: { conversionActionType: metrics.conversionActionType,
        revenueActionType: metrics.revenueActionType, actionReportTime: metrics.actionReportTime,
        attributionWindows: windowRecord } });
    return Object.freeze({ version: 1, scope, context });
  } catch (error) {
    if (error instanceof MetaAdsAccountPolicyError) throw error;
    // Do not expose arbitrary input, error causes, credentials or API response data.
    throw new MetaAdsAccountPolicyError(failure);
  }
}
function recordArray(value: unknown[], code: MetaAdsAccountPolicyErrorCode): unknown[] {
  const keys = Array.from({ length: value.length }, (_, i) => String(i));
  requirePolicy(Reflect.ownKeys(value).length === keys.length + 1, code);
  return keys.map(key => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    requirePolicy(d && Object.hasOwn(d, "value"), code); return d.value;
  });
}

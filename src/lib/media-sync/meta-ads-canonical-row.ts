import { isValidYmd, type EtrylueNormalizedMediaRow } from "./types";

export const META_ADS_API_VERSION = "v26.0" as const;
export const META_ADS_AD_DAILY_ROW_LEVEL_REASON =
  "meta_ads_ad_daily_insights" as const;

export type MetaAdsCanonicalErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CONTRACT"
  | "UNRESOLVED_METRIC_POLICY"
  | "INVALID_METRIC"
  | "SCOPE_MISMATCH"
  | "DUPLICATE_AD_DAY"
  | "INVALID_CANONICAL_ROW";

export class MetaAdsCanonicalError extends Error {
  constructor(readonly code: MetaAdsCanonicalErrorCode, message: string) {
    super(message);
    this.name = "MetaAdsCanonicalError";
  }
}

/** Caller-supplied, explicit semantics. No default action or attribution policy. */
export type MetaAdsMetricPolicy = Readonly<{
  conversionActionType: string;
  revenueActionType: string;
  actionReportTime: string;
  attributionWindows: readonly string[];
}>;

export type MetaAdsCanonicalContext = Readonly<{
  apiVersion: typeof META_ADS_API_VERSION;
  level: "ad";
  timeIncrement: 1;
  breakdowns: readonly [];
  actionBreakdowns: readonly [];
  externalAccountId: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  timeZone: string;
  metricPolicy: MetaAdsMetricPolicy;
}>;

export type MetaAdsActionValue = Readonly<{
  action_type: string;
  value: string | number;
}>;

/**
 * Strict offline input boundary, not a live Marketing API response parser.
 * A later collector must establish request provenance and normalize sparse
 * action arrays under an approved policy. Missing selected values are NOT zero.
 * No pagination, credentials, fetch, DB, job or report authority is accepted.
 */
export type MetaAdsAdDailyInsight = Readonly<{
  account_id: string;
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  date_start: string;
  date_stop: string;
  impressions: string | number;
  clicks: string | number;
  spend: string | number;
  actions: readonly MetaAdsActionValue[];
  action_values: readonly MetaAdsActionValue[];
}>;

function fail(code: MetaAdsCanonicalErrorCode, message: string): never {
  throw new MetaAdsCanonicalError(code, message);
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail("INVALID_INPUT", `${field} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    fail("UNSUPPORTED_CONTRACT", `${field} contains an unsupported field.`);
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() ||
      value.length > 2_000 || /[\u0000-\u001f]/.test(value)) {
    fail("INVALID_INPUT", `${field} must be a non-empty, bounded string.`);
  }
  return value;
}

function date(value: unknown, field: string): string {
  const result = text(value, field);
  if (!isValidYmd(result)) fail("INVALID_INPUT", `${field} must be YYYY-MM-DD.`);
  return result;
}

function metric(value: unknown, field: string, integer = false): number {
  if (typeof value !== "number" &&
      !(typeof value === "string" && /^(0|[1-9]\d*)(\.\d+)?$/.test(value))) {
    fail("INVALID_METRIC", `${field} must be an explicit decimal value.`);
  }
  if (integer && typeof value === "string" && !/^(0|[1-9]\d*)(\.0+)?$/.test(value)) {
    fail("INVALID_METRIC", `${field} must be an integer count.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER ||
      (parsed === 0 && typeof value === "string" && /[1-9]/.test(value)) ||
      (integer && !Number.isSafeInteger(parsed))) {
    fail("INVALID_METRIC", `${field} is outside the supported numeric range.`);
  }
  return parsed === 0 ? 0 : parsed;
}

function emptyArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length !== 0) {
    fail("UNSUPPORTED_CONTRACT", `${field} must be explicitly empty.`);
  }
}

export function validateMetaAdsCanonicalContext(value: unknown): MetaAdsCanonicalContext {
  const ctx = object(value, "context");
  exactKeys(ctx, ["apiVersion", "level", "timeIncrement", "breakdowns", "actionBreakdowns",
    "externalAccountId", "dateFrom", "dateTo", "currency", "timeZone", "metricPolicy"], "context");
  if (ctx.apiVersion !== META_ADS_API_VERSION || ctx.level !== "ad" || ctx.timeIncrement !== 1) {
    fail("UNSUPPORTED_CONTRACT", "Only pinned v26.0 ad-by-day input is supported.");
  }
  emptyArray(ctx.breakdowns, "breakdowns");
  emptyArray(ctx.actionBreakdowns, "actionBreakdowns");
  const account = text(ctx.externalAccountId, "externalAccountId");
  const from = date(ctx.dateFrom, "dateFrom");
  const to = date(ctx.dateTo, "dateTo");
  if (from > to) fail("INVALID_INPUT", "The date range is reversed.");
  const currency = text(ctx.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) fail("INVALID_INPUT", "currency must be an explicit currency code.");
  const timeZone = text(ctx.timeZone, "timeZone");
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    fail("INVALID_INPUT", "timeZone must be a valid explicit time zone.");
  }
  if (!ctx.metricPolicy) fail("UNRESOLVED_METRIC_POLICY", "An explicit metric policy is required.");
  const policy = object(ctx.metricPolicy, "metricPolicy");
  exactKeys(policy, ["conversionActionType", "revenueActionType", "actionReportTime", "attributionWindows"], "metricPolicy");
  for (const field of ["conversionActionType", "revenueActionType", "actionReportTime"] as const) {
    if (typeof policy[field] !== "string" || !policy[field]) {
      fail("UNRESOLVED_METRIC_POLICY", "Action selectors and attribution semantics must be explicit.");
    }
    text(policy[field], field);
  }
  if (!Array.isArray(policy.attributionWindows) || !policy.attributionWindows.length) {
    fail("UNRESOLVED_METRIC_POLICY", "Explicit attribution windows are required.");
  }
  const windows = policy.attributionWindows.map((window) => text(window, "attributionWindow"));
  if (new Set(windows).size !== windows.length) {
    fail("UNRESOLVED_METRIC_POLICY", "Duplicate attribution windows are ambiguous.");
  }
  return Object.freeze({
    apiVersion: META_ADS_API_VERSION, level: "ad", timeIncrement: 1,
    breakdowns: Object.freeze([] as const), actionBreakdowns: Object.freeze([] as const),
    externalAccountId: account, dateFrom: from, dateTo: to, currency, timeZone,
    metricPolicy: Object.freeze({
      conversionActionType: policy.conversionActionType as string,
      revenueActionType: policy.revenueActionType as string,
      actionReportTime: policy.actionReportTime as string,
      attributionWindows: Object.freeze(windows),
    }),
  });
}

function selectAction(value: unknown, selector: string, field: string): number {
  if (!Array.isArray(value)) fail("UNRESOLVED_METRIC_POLICY", `${field} must contain an explicit selected value.`);
  const seen = new Set<string>();
  let selected: number | undefined;
  for (const item of value) {
    const action = object(item, field);
    exactKeys(action, ["action_type", "value"], field);
    const type = text(action.action_type, "action_type");
    if (seen.has(type)) fail("UNRESOLVED_METRIC_POLICY", `${field} contains duplicate action types.`);
    seen.add(type);
    const amount = metric(action.value, field);
    if (type === selector) selected = amount;
  }
  if (selected === undefined) {
    fail("UNRESOLVED_METRIC_POLICY", `${field} is missing the selected action; absence is not zero.`);
  }
  return selected;
}

function authority(ctx: MetaAdsCanonicalContext, adId: string) {
  return {
    provider: "meta_ads", api_version: META_ADS_API_VERSION,
    authoritative_grain: "ad", entity_type: "ad", entity_id: adId,
    level: "ad", time_increment: 1, breakdowns: [], action_breakdowns: [],
    currency: ctx.currency, time_zone: ctx.timeZone,
    metric_policy: {
      conversion_action_type: ctx.metricPolicy.conversionActionType,
      revenue_action_type: ctx.metricPolicy.revenueActionType,
      action_report_time: ctx.metricPolicy.actionReportTime,
      attribution_windows: [...ctx.metricPolicy.attributionWindows],
    },
  };
}

const METRICS = ["impressions", "clicks", "cost", "conversions", "revenue"] as const;

export function convertMetaAdsDailyInsightsToCanonicalRows(input: Readonly<{
  context: MetaAdsCanonicalContext;
  records: readonly MetaAdsAdDailyInsight[];
}>): EtrylueNormalizedMediaRow[] {
  object(input, "input");
  const ctx = validateMetaAdsCanonicalContext(input.context);
  if (!Array.isArray(input.records)) fail("INVALID_INPUT", "records must be an array.");
  const seen = new Set<string>();
  const rows: EtrylueNormalizedMediaRow[] = [];
  for (const value of input.records) {
    const record = object(value, "record");
    exactKeys(record, ["account_id", "campaign_id", "campaign_name", "adset_id", "adset_name",
      "ad_id", "ad_name", "date_start", "date_stop", "impressions", "clicks", "spend",
      "actions", "action_values"], "record");
    const accountId = text(record.account_id, "account_id");
    const campaignId = text(record.campaign_id, "campaign_id");
    const adsetId = text(record.adset_id, "adset_id");
    const adId = text(record.ad_id, "ad_id");
    const day = date(record.date_start, "date_start");
    if (accountId !== ctx.externalAccountId || day < ctx.dateFrom || day > ctx.dateTo) {
      fail("SCOPE_MISMATCH", "The row is outside the requested account or date range.");
    }
    if (date(record.date_stop, "date_stop") !== day) {
      fail("UNSUPPORTED_CONTRACT", "A daily row must have equal start and stop dates.");
    }
    // Detect duplicates before zero suppression, including conflicting parents.
    const identity = JSON.stringify([accountId, adId, day]);
    if (seen.has(identity)) fail("DUPLICATE_AD_DAY", "More than one row exists for an account, ad and day.");
    seen.add(identity);
    const campaign = record.campaign_name === undefined ? campaignId : text(record.campaign_name, "campaign_name");
    const group = record.adset_name === undefined ? adsetId : text(record.adset_name, "adset_name");
    const creative = record.ad_name === undefined ? adId : text(record.ad_name, "ad_name");
    const row: EtrylueNormalizedMediaRow = {
      date: day, report_date: day, day, ymd: day,
      channel: "Meta Ads", source: "Meta Ads", platform: "Meta Ads", device: "",
      campaign, campaign_name: campaign, group, group_name: group, adgroup_name: group,
      creative, creative_name: creative,
      impressions: metric(record.impressions, "impressions", true),
      clicks: metric(record.clicks, "clicks", true),
      cost: metric(record.spend, "spend"),
      conversions: selectAction(record.actions, ctx.metricPolicy.conversionActionType, "actions"),
      revenue: selectAction(record.action_values, ctx.metricPolicy.revenueActionType, "action_values"),
      row_level: "creative", data_level: "creative", row_level_reason: META_ADS_AD_DAILY_ROW_LEVEL_REASON,
      provider: "meta_ads", ingestion_source: "api", external_account_id: accountId,
      external_campaign_id: campaignId, external_group_id: adsetId,
      external_ad_id: adId, external_creative_id: adId, provider_meta: authority(ctx, adId),
    };
    if (!METRICS.every((key) => row[key] === 0)) rows.push(row);
  }
  return rows.sort((a, b) => {
    const left = JSON.stringify([a.date, a.external_account_id, a.external_ad_id]);
    const right = JSON.stringify([b.date, b.external_account_id, b.external_ad_id]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(right)) {
    return Array.isArray(left) && left.length === right.length &&
      right.every((value, index) => sameJson(left[index], value));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length &&
    Object.keys(b).every((key) => Object.hasOwn(a, key) && sameJson(a[key], b[key]));
}

export type MetaAdsCanonicalRowValidator =
  (value: unknown) => asserts value is EtrylueNormalizedMediaRow;

/** Validate scope/policy once per dataset, then revalidate every staging row. */
export function createMetaAdsCanonicalRowValidator(
  context: MetaAdsCanonicalContext,
): MetaAdsCanonicalRowValidator {
  const ctx = validateMetaAdsCanonicalContext(context);
  return (value) => assertCanonicalRow(value, ctx);
}

function assertCanonicalRow(
  value: unknown,
  ctx: MetaAdsCanonicalContext,
): asserts value is EtrylueNormalizedMediaRow {
  const row = object(value, "row");
  const account = text(row.external_account_id, "external_account_id");
  const adId = text(row.external_ad_id, "external_ad_id");
  text(row.external_campaign_id, "external_campaign_id");
  text(row.external_group_id, "external_group_id");
  const day = date(row.date, "date");
  if (account !== ctx.externalAccountId || day < ctx.dateFrom || day > ctx.dateTo) {
    fail("SCOPE_MISMATCH", "The canonical row is outside the requested scope.");
  }
  for (const field of METRICS) {
    if (typeof row[field] !== "number") fail("INVALID_CANONICAL_ROW", "Canonical metrics must be numbers.");
    metric(row[field], field, field === "impressions" || field === "clicks");
  }
  if (METRICS.every((field) => row[field] === 0)) {
    fail("INVALID_CANONICAL_ROW", "Zero performance rows must be removed before staging.");
  }
  for (const field of ["campaign", "group", "creative"] as const) {
    text(row[field], field);
    if (row[field] !== row[`${field}_name`]) fail("INVALID_CANONICAL_ROW", "Display aliases disagree.");
  }
  if (row.provider !== "meta_ads" || row.ingestion_source !== "api" ||
      row.row_level !== "creative" || row.data_level !== "creative" ||
      row.row_level_reason !== META_ADS_AD_DAILY_ROW_LEVEL_REASON ||
      row.external_creative_id !== adId || row.adgroup_name !== row.group ||
      row.report_date !== day || row.day !== day || row.ymd !== day ||
      row.device !== "" || row.channel !== "Meta Ads" || row.source !== "Meta Ads" || row.platform !== "Meta Ads" ||
      !sameJson(row.provider_meta, authority(ctx, adId))) {
    fail("INVALID_CANONICAL_ROW", "The canonical identity, aliases or authority do not match the Meta contract.");
  }
  exactKeys(row, ["date", "report_date", "day", "ymd", "channel", "source", "platform", "device",
    "campaign", "campaign_name", "group", "group_name", "adgroup_name", "creative", "creative_name",
    ...METRICS, "row_level", "data_level", "row_level_reason", "provider", "ingestion_source",
    "external_account_id", "external_campaign_id", "external_group_id", "external_ad_id",
    "external_creative_id", "provider_meta"], "row");
}

import { reconcileMetaAdsAdDailyRows, sumMetaAdsConversionValues, type MetaAdsAdDailyCheck } from "./meta-ads-ad-daily-check";
import type { MetaAdsInsightsPreview, MetaAdsPreviewRange } from "./meta-ads-insights-preview";
import { readMetaAdsContactPolicy, type MetaAdsContactPolicy } from "./meta-ads-contact-policy";
import type { JsonObject } from "./types";

export class MetaAdsContactError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); this.name = "MetaAdsContactError"; }
}
export function requireMetaContact(ok: unknown, code: string, status = 409): asserts ok {
  if (!ok) throw new MetaAdsContactError(code, status);
}
export type MetaAdsContactRow = JsonObject & {
  date: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: null;
};
/** Only a fresh, complete, reconciled server dataset can turn sparse contact values into zero.
 * This separate contract does not loosen the old canonical row or other provider contracts.
 */
export function normalizeMetaAdsContactRows(records: readonly unknown[], account: MetaAdsInsightsPreview,
  range: MetaAdsPreviewRange, policy: MetaAdsContactPolicy, pageCount: number):
  { rows: MetaAdsContactRow[]; check: MetaAdsAdDailyCheck } {
  requireMetaContact(readMetaAdsContactPolicy(policy, policy.external_account_id), "META_CONTACT_POLICY_REQUIRED");
  const check = reconcileMetaAdsAdDailyRows(records, policy.external_account_id, range, account, pageCount, policy);
  requireMetaContact(check.status === "MATCH" && check.row_count > 0, "META_CONTACT_RECONCILIATION_FAILED");
  const name = (value: unknown, fallback: string) => {
    if (value === undefined) return fallback;
    requireMetaContact(typeof value === "string" && value.length > 0 && value.length <= 2000 && !/[\x00-\x1f\x7f]/.test(value),
      "META_CONTACT_RECONCILIATION_FAILED");
    return value;
  };
  const rows = records.map(item => {
    const r = item as Record<string, unknown>;
    const selected = (r.conversions as { action_type: string; value: string | number }[] | undefined)
      ?.find(a => a.action_type === "contact_website");
    const form = policy.instant_form ? (r.actions as { action_type: string; value: string | number }[] | undefined)
      ?.find(a => a.action_type === "onsite_conversion.lead_grouped") : undefined;
    const websiteContacts = selected ? Number(selected.value) : 0, forms = form ? Number(form.value) : 0;
    const day = r.date_start as string, ad = r.ad_id as string;
    const campaign = name(r.campaign_name, r.campaign_id as string), group = name(r.adset_name, r.adset_id as string);
    const creative = name(r.ad_name, ad);
    return { date: day, report_date: day, day, ymd: day, channel: "Meta Ads", source: "Meta Ads", platform: "Meta Ads", device: "",
      campaign, campaign_name: campaign, group, group_name: group, adgroup_name: group, creative, creative_name: creative,
      impressions: Number(r.impressions), clicks: Number(r.clicks), cost: Number(r.spend),
      conversions: sumMetaAdsConversionValues(websiteContacts, forms), revenue: null,
      row_level: "creative", data_level: "creative", row_level_reason: "meta_ads_ad_daily_insights",
      provider: "meta_ads", ingestion_source: "api", external_account_id: policy.external_account_id,
      external_campaign_id: r.campaign_id as string, external_group_id: r.adset_id as string,
      external_ad_id: ad, external_creative_id: ad,
      provider_meta: { contract: policy.contract, api_version: "v26.0", level: "ad", time_increment: 1,
        currency: policy.currency, time_zone: policy.time_zone, conversion_field: "conversions", conversion_action_type: "contact_website",
        conversion_value_source: selected || form ? "reported" : "reconciled_absence",
        ...(policy.instant_form ? { instant_form: policy.instant_form, website_contacts: websiteContacts, instant_form_submissions: forms } : {}), revenue_status: "not_provided", attribution: "platform_default" },
    } satisfies MetaAdsContactRow;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.external_ad_id.localeCompare(b.external_ad_id));
  // JSON number encoding must still reproduce the exact decimal totals in the DB.
  const normalized = rows.map(r => ({ account_id: r.external_account_id, campaign_id: r.external_campaign_id,
    campaign_name: r.campaign, adset_id: r.external_group_id, ad_id: r.external_ad_id,
    date_start: r.date, date_stop: r.date, impressions: r.impressions, clicks: r.clicks, spend: r.cost,
    conversions: [{ action_type: "contact_website", value: policy.instant_form ? r.provider_meta.website_contacts : r.conversions }],
    ...(policy.instant_form ? { actions: [{ action_type: "onsite_conversion.lead_grouped", value: r.provider_meta.instant_form_submissions }] } : {}) }));
  requireMetaContact(reconcileMetaAdsAdDailyRows(normalized, policy.external_account_id, range, account, pageCount, policy).status === "MATCH",
    "META_CONTACT_RECONCILIATION_FAILED");
  return { rows, check };
}

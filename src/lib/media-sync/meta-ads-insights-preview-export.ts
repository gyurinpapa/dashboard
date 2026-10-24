import type { MetaAdsInsightsPreview } from "./meta-ads-insights-preview";
import type { MetaAdsAdDailyCheck } from "./meta-ads-ad-daily-check";

function dailyExport(check: MetaAdsAdDailyCheck) {
  const values = (v: MetaAdsAdDailyCheck["ad_daily_sum"]) => ({ impressions: v.impressions, clicks: v.clicks,
    spend: v.spend, reported_website_contacts: v.reported_website_contacts,
    row_count: v.row_count, rows_without_contact_value: v.rows_without_contact_value });
  const metrics = (v: MetaAdsAdDailyCheck["account"] | MetaAdsAdDailyCheck["matches"]) => ({
    impressions: v.impressions, clicks: v.clicks, spend: v.spend, website_contacts: v.website_contacts });
  return { status: check.status, complete: check.complete, date_from: check.date_from, date_to: check.date_to,
    level: check.level, time_increment: check.time_increment, page_count: check.page_count, row_count: check.row_count,
    ad_count: check.ad_count, day_count: check.day_count, conversion_field: check.conversion_field,
    conversion_action_type: check.conversion_action_type, attribution: check.attribution, report_data_saved: false,
    account: metrics(check.account), ad_daily_sum: values(check.ad_daily_sum), matches: metrics(check.matches),
    campaigns: check.campaigns.map(v => ({ campaign_id: v.campaign_id, campaign_name: v.campaign_name, ...values(v) })),
    days: check.days.map(v => ({ date: v.date, ...values(v) })),
  };
}

/** Export the approved read-only response fields, never a session or credential. */
export function formatMetaAdsPreviewExport(input: {
  externalAccountId: string; currency: string; timeZone: string; preview: MetaAdsInsightsPreview;
  adDailyCheck?: MetaAdsAdDailyCheck | null;
}): string {
  const p = input.preview;
  return JSON.stringify({
    schema: input.adDailyCheck ? "etrylue_meta_insights_check_v3" : "etrylue_meta_insights_check_v2", external_account_id: input.externalAccountId,
    currency: input.currency, timezone_name: input.timeZone,
    date_from: p.date_from, date_to: p.date_to, has_data: p.has_data,
    impressions: p.impressions, clicks: p.clicks, spend: p.spend,
    actions: p.actions.map(({ action_type, value }) => ({ action_type, value })),
    action_values: p.action_values.map(({ action_type, value }) => ({ action_type, value })),
    conversions: p.conversions.map(({ action_type, value }) => ({ action_type, value })),
    conversion_values: p.conversion_values.map(({ action_type, value }) => ({ action_type, value })),
    ...(input.adDailyCheck ? { ad_daily_check: dailyExport(input.adDailyCheck) } : {}),
    conversion_mapping: "UNCONFIRMED", report_data_saved: false,
  }, null, 2);
}

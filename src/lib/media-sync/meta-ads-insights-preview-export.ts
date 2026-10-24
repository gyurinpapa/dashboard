import type { MetaAdsInsightsPreview } from "./meta-ads-insights-preview";

/** Export the approved read-only response fields, never a session or credential. */
export function formatMetaAdsPreviewExport(input: {
  externalAccountId: string; currency: string; timeZone: string; preview: MetaAdsInsightsPreview;
}): string {
  const p = input.preview;
  return JSON.stringify({
    schema: "etrylue_meta_insights_check_v2", external_account_id: input.externalAccountId,
    currency: input.currency, timezone_name: input.timeZone,
    date_from: p.date_from, date_to: p.date_to, has_data: p.has_data,
    impressions: p.impressions, clicks: p.clicks, spend: p.spend,
    actions: p.actions.map(({ action_type, value }) => ({ action_type, value })),
    action_values: p.action_values.map(({ action_type, value }) => ({ action_type, value })),
    conversions: p.conversions.map(({ action_type, value }) => ({ action_type, value })),
    conversion_values: p.conversion_values.map(({ action_type, value }) => ({ action_type, value })),
    conversion_mapping: "UNCONFIRMED", report_data_saved: false,
  }, null, 2);
}

import { reconcileMetaAdsAdDailyRows } from "./meta-ads-ad-daily-check";
import { normalizeMetaAdsContactRows, requireMetaContact as check } from "./meta-ads-contact-rows";
import { readMetaAdsContactPolicy, type MetaAdsContactPolicy } from "./meta-ads-contact-policy";
import type { MetaAdsInsightsPreview, MetaAdsPreviewRange } from "./meta-ads-insights-preview";
import { isValidYmd } from "./types";

export const shiftMetaDay = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
/** Missing history first, then a seven-day rolling correction window. Bounded and restartable. */
export function planMetaDailyWindows(start: string, target: string, covered: readonly string[], maxWindows = 12): MetaAdsPreviewRange[] {
  check(isValidYmd(start) && isValidYmd(target) && start <= target &&
    Date.parse(target) - Date.parse(start) <= 3660 * 86400000 && Number.isInteger(maxWindows) && maxWindows >= 1 && maxWindows <= 12,
    "META_DAILY_INVALID_RANGE");
  const done = new Set(covered), dates: string[] = [];
  for (let day = start; day <= target; day = shiftMetaDay(day, 1))
    if (!done.has(day) || day >= shiftMetaDay(target, -6)) dates.push(day);
  const windows: { dateFrom: string; dateTo: string }[] = [];
  for (const date of dates) {
    const last = windows.at(-1);
    if (last && shiftMetaDay(last.dateTo, 1) === date && Date.parse(date) - Date.parse(last.dateFrom) < 7 * 86400000)
      last.dateTo = date;
    else windows.push({ dateFrom: date, dateTo: date });
  }
  return windows.slice(0, maxWindows);
}

/** Daily collection accepts confirmed absence only after complete account/ad reconciliation.
 * The diagnostic/manual contract remains strict. Audit distinguishes omitted values from reported zero.
 */
export function normalizeMetaDailyWindow(records: readonly unknown[], account: MetaAdsInsightsPreview,
  range: MetaAdsPreviewRange, policy: MetaAdsContactPolicy, pageCount: number) {
  check(readMetaAdsContactPolicy(policy, policy.external_account_id) && policy.currency === "KRW" && policy.time_zone === "Asia/Seoul",
    "META_CONTACT_POLICY_REQUIRED");
  const original = reconcileMetaAdsAdDailyRows(records, policy.external_account_id, range, account, pageCount);
  const selected = account.conversions.find(a => a.action_type === "contact_website");
  if (!account.has_data) {
    check(records.length === 0 && account.impressions === null && account.clicks === null && account.spend === null &&
      account.conversions.length === 0, "META_CONTACT_RECONCILIATION_FAILED");
    return { rows: [], totals: { impressions: "0", clicks: "0", spend: "0", website_contacts: "0" },
      evidence: "no_data" as const, page_count: pageCount };
  }
  if (!selected) check(original.matches.impressions === true && original.matches.clicks === true &&
    original.matches.spend === true && original.ad_daily_sum.reported_website_contacts === "0",
    "META_CONTACT_RECONCILIATION_FAILED");
  const resolved = selected ? account : { ...account,
    conversions: [...account.conversions, { action_type: "contact_website", value: "0" }] };
  const reconciled = reconcileMetaAdsAdDailyRows(records, policy.external_account_id, range, resolved, pageCount);
  check(reconciled.status === "MATCH", "META_CONTACT_RECONCILIATION_FAILED");
  const rows = records.length ? normalizeMetaAdsContactRows(records, resolved, range, policy, pageCount).rows : [];
  return { rows, totals: reconciled.account, evidence: selected ? "reported" as const : "omitted_on_complete_insights" as const,
    page_count: pageCount };
}

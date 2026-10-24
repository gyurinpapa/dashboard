import { META_ADS_API_VERSION } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsPreview, MetaAdsPreviewRange } from "./meta-ads-insights-preview";
import { isValidYmd } from "./types";

type Totals = { impressions: string; clicks: string; spend: string; reported_website_contacts: string };
type Group = Totals & { row_count: number; rows_without_contact_value: number };
export type MetaAdsAdDailyCheck = Readonly<{
  status: "MATCH" | "MISMATCH" | "UNRESOLVED";
  complete: true; date_from: string; date_to: string;
  level: "ad"; time_increment: 1; page_count: number; row_count: number; ad_count: number; day_count: number;
  conversion_field: "conversions"; conversion_action_type: "contact_website";
  attribution: "platform_default"; report_data_saved: false;
  account: { impressions: string | null; clicks: string | null; spend: string | null; website_contacts: string | null };
  ad_daily_sum: Group;
  matches: { impressions: boolean | null; clicks: boolean | null; spend: boolean | null; website_contacts: boolean | null };
  campaigns: readonly (Group & { campaign_id: string; campaign_name: string })[];
  days: readonly (Group & { date: string })[];
}>;
export class MetaAdsAdDailyCheckError extends Error {
  constructor(readonly code: "INVALID_RESPONSE" | "INCOMPLETE_RESPONSE" | "REQUEST_FAILED" | "REQUEST_TIMEOUT") {
    super(code); this.name = "MetaAdsAdDailyCheckError";
  }
}
function check(ok: unknown, code: MetaAdsAdDailyCheckError["code"] = "INVALID_RESPONSE"): asserts ok {
  if (!ok) throw new MetaAdsAdDailyCheckError(code);
}
function object(value: unknown): Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function id(value: unknown): string { check(typeof value === "string" && /^[1-9][0-9]{0,29}$/.test(value)); return value; }
const ZERO = BigInt(0), SCALE = BigInt(1_000_000), MAX = BigInt(Number.MAX_SAFE_INTEGER) * SCALE;
function units(value: unknown, integer = false): bigint {
  check(typeof value === "string" || typeof value === "number");
  const text = String(value);
  check(text.length <= 32 && (integer ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)(\.\d{1,6})?$/).test(text));
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
  check(result <= MAX); return result;
}
function decimal(value: bigint): string {
  return `${value / SCALE}${value % SCALE ? `.${String(value % SCALE).padStart(6, "0").replace(/0+$/, "")}` : ""}`;
}
function contact(value: unknown): bigint | null {
  if (value === undefined) return null;
  check(Array.isArray(value) && value.length <= 256);
  const seen = new Set<string>(); let selected: bigint | null = null;
  for (const item of value) {
    const row = object(item), type = row.action_type;
    check(typeof type === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(type) && !seen.has(type));
    seen.add(type); const amount = units(row.value);
    if (type === "contact_website") selected = amount;
  }
  return selected;
}
type Accumulator = { impressions: bigint; clicks: bigint; spend: bigint; contacts: bigint; rows: number; missing: number };
const empty = (): Accumulator => ({ impressions: ZERO, clicks: ZERO, spend: ZERO, contacts: ZERO, rows: 0, missing: 0 });
function add(target: Accumulator, value: Accumulator) {
  for (const key of ["impressions", "clicks", "spend", "contacts"] as const) {
    target[key] += value[key]; check(target[key] <= MAX);
  }
  target.rows += value.rows; target.missing += value.missing;
}
function group(value: Accumulator): Group {
  return { impressions: decimal(value.impressions), clicks: decimal(value.clicks), spend: decimal(value.spend),
    reported_website_contacts: decimal(value.contacts), row_count: value.rows, rows_without_contact_value: value.missing };
}

/** Diagnostic reconciliation only. Missing per-row values stay explicitly counted as missing;
 * their reported-value subtotal is not a zero-filled canonical dataset or sync authorization.
 * The caller supplies the independently fetched account aggregate from the same request scope.
 */
export function reconcileMetaAdsAdDailyRows(records: readonly unknown[], accountId: string,
  range: MetaAdsPreviewRange, account: MetaAdsInsightsPreview, pageCount: number): MetaAdsAdDailyCheck {
  check(Array.isArray(records) && records.length <= 2500 && Number.isInteger(pageCount) && pageCount >= 1 && pageCount <= 5);
  id(accountId);
  check(isValidYmd(range.dateFrom) && isValidYmd(range.dateTo) && range.dateFrom <= range.dateTo &&
    Date.parse(range.dateTo) - Date.parse(range.dateFrom) < 31 * 86400000);
  check(account.date_from === range.dateFrom && account.date_to === range.dateTo);
  const seen = new Set<string>(), ads = new Set<string>(), total = empty();
  const campaigns = new Map<string, { name: string; values: Accumulator }>(), days = new Map<string, Accumulator>();
  for (const item of records) {
    const row = object(item), day = row.date_start;
    check(row.account_id === accountId && typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      isValidYmd(day) && day >= range.dateFrom && day <= range.dateTo && row.date_stop === day);
    const ad = id(row.ad_id), campaign = id(row.campaign_id); id(row.adset_id);
    const identity = `${ad}:${day}`; check(!seen.has(identity)); seen.add(identity); ads.add(ad);
    const name = row.campaign_name === undefined ? campaign : row.campaign_name;
    check(typeof name === "string" && name.length > 0 && name.length <= 2000 && !/[\x00-\x1f]/.test(name));
    const selected = contact(row.conversions);
    const values: Accumulator = { impressions: units(row.impressions, true), clicks: units(row.clicks, true),
      spend: units(row.spend), contacts: selected ?? ZERO, rows: 1, missing: selected === null ? 1 : 0 };
    add(total, values);
    if (!campaigns.has(campaign)) campaigns.set(campaign, { name, values: empty() });
    add(campaigns.get(campaign)!.values, values);
    if (!days.has(day)) days.set(day, empty()); add(days.get(day)!, values);
  }
  const selected = account.has_data ? contact(account.conversions) : null;
  const matches = {
    impressions: account.impressions === null ? null : units(account.impressions, true) === total.impressions,
    clicks: account.clicks === null ? null : units(account.clicks, true) === total.clicks,
    spend: account.spend === null ? null : units(account.spend) === total.spend,
    website_contacts: selected === null ? null : selected === total.contacts,
  };
  const checks = Object.values(matches);
  return { status: checks.includes(false) ? "MISMATCH" : checks.includes(null) ? "UNRESOLVED" : "MATCH",
    complete: true, date_from: range.dateFrom, date_to: range.dateTo, level: "ad", time_increment: 1,
    page_count: pageCount, row_count: records.length, ad_count: ads.size, day_count: days.size,
    conversion_field: "conversions", conversion_action_type: "contact_website", attribution: "platform_default",
    report_data_saved: false, account: { impressions: account.impressions, clicks: account.clicks,
      spend: account.spend, website_contacts: selected === null ? null : decimal(selected) },
    ad_daily_sum: group(total), matches,
    campaigns: [...campaigns].sort(([a], [b]) => a.localeCompare(b)).map(([campaign_id, value]) =>
      ({ campaign_id, campaign_name: value.name, ...group(value.values) })),
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...group(value) })),
  };
}

/** At most five pages/2,500 rows, one overall 20-second budget, no retries or DB writes. */
export async function readMetaAdsAdDailyCheck(input: MetaAdsPreviewRange & { externalAccountId: string; accessToken: string },
  account: MetaAdsInsightsPreview, fetchImpl: typeof fetch, options: { timeoutMs?: number } = {}): Promise<MetaAdsAdDailyCheck> {
  return (await readMetaAdsAdDailyDataset(input, account, fetchImpl, options)).check;
}

/** Server-internal complete dataset. Raw records must never be returned to the browser. */
export async function readMetaAdsAdDailyDataset(input: MetaAdsPreviewRange & { externalAccountId: string; accessToken: string },
  account: MetaAdsInsightsPreview, fetchImpl: typeof fetch, options: { timeoutMs?: number } = {}):
  Promise<{ records: readonly unknown[]; check: MetaAdsAdDailyCheck }> {
  check(typeof window === "undefined"); id(input.externalAccountId);
  check(typeof input.accessToken === "string" && /^[\x21-\x7e]{1,20000}$/.test(input.accessToken));
  check(/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) && isValidYmd(input.dateFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) && isValidYmd(input.dateTo) && input.dateFrom <= input.dateTo &&
    Date.parse(input.dateTo) - Date.parse(input.dateFrom) < 31 * 86400000);
  const timeoutMs = options.timeoutMs ?? 20000;
  check(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000);
  const url = new URL(`https://graph.facebook.com/${META_ADS_API_VERSION}/act_${input.externalAccountId}/insights`);
  url.searchParams.set("fields", "account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,impressions,clicks,spend,conversions");
  url.searchParams.set("level", "ad"); url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: input.dateFrom, until: input.dateTo }));
  url.searchParams.set("limit", "500");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      reject(new MetaAdsAdDailyCheckError("REQUEST_TIMEOUT")); controller.abort(); void reader?.cancel().catch(() => {});
    }, timeoutMs); });
    return await Promise.race([timeout, (async () => {
      const records: unknown[] = [], cursors = new Set<string>(); let bytes = 0;
      for (let page = 1; page <= 5; page++) {
        check(!controller.signal.aborted, "REQUEST_TIMEOUT");
        const response = await fetchImpl(url.href, { method: "GET", redirect: "error", cache: "no-store",
          headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" }, signal: controller.signal });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {}); throw new MetaAdsAdDailyCheckError("REQUEST_TIMEOUT");
        }
        if (!response.ok || response.redirected || (response.url && response.url !== url.href) ||
          Number(response.headers.get("content-length")) > 1048576) {
          void response.body?.cancel().catch(() => {}); throw new MetaAdsAdDailyCheckError("REQUEST_FAILED");
        }
        check(response.body); reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true }); let text = "", pageBytes = 0;
        for (;;) {
          const { done, value } = await reader.read(); check(!controller.signal.aborted, "REQUEST_TIMEOUT");
          if (done) break;
          pageBytes += value.byteLength; bytes += value.byteLength;
          check(pageBytes <= 1048576 && bytes <= 4194304, "INCOMPLETE_RESPONSE");
          text += decoder.decode(value, { stream: true });
        }
        reader.releaseLock(); reader = undefined;
        const body = object(JSON.parse(text + decoder.decode()));
        check(!Object.hasOwn(body, "error") && Array.isArray(body.data) && body.data.length <= 500);
        records.push(...body.data); check(records.length <= 2500, "INCOMPLETE_RESPONSE");
        const paging = body.paging === undefined ? {} : object(body.paging);
        if (!Object.hasOwn(paging, "next")) return { records,
          check: reconcileMetaAdsAdDailyRows(records, input.externalAccountId, input, account, page) };
        check(page < 5 && typeof paging.next === "string" && paging.next.length <= 32768, "INCOMPLETE_RESPONSE");
        const cursor = object(paging.cursors).after;
        check(typeof cursor === "string" && /^[A-Za-z0-9_.~+/=-]{1,4096}$/.test(cursor) &&
          !cursor.includes(input.accessToken) && !cursors.has(cursor), "INCOMPLETE_RESPONSE");
        const next = new URL(paging.next);
        check(next.origin === url.origin && next.pathname === url.pathname && !next.username && !next.password && !next.hash &&
          next.searchParams.getAll("after").length === 1 && next.searchParams.get("after") === cursor, "INCOMPLETE_RESPONSE");
        // Ignore next URLs and all their query parameters. Rebuild only with the bounded cursor.
        cursors.add(cursor); url.searchParams.set("after", cursor);
      }
      throw new MetaAdsAdDailyCheckError("INCOMPLETE_RESPONSE");
    })()]);
  } catch (error) {
    throw error instanceof MetaAdsAdDailyCheckError ? error : new MetaAdsAdDailyCheckError("REQUEST_FAILED");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort(); void reader?.cancel().catch(() => {});
  }
}

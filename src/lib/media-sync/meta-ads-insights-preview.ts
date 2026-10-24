import { META_ADS_API_VERSION } from "./meta-ads-canonical-row";
import { isValidYmd } from "./types";

export type MetaAdsPreviewRange = Readonly<{ dateFrom: string; dateTo: string }>;
export type MetaAdsPreviewAction = Readonly<{ action_type: string; value: string }>;
export type MetaAdsInsightsPreview = Readonly<{
  date_from: string; date_to: string; has_data: boolean;
  impressions: string | null; clicks: string | null; spend: string | null;
  actions: readonly MetaAdsPreviewAction[]; action_values: readonly MetaAdsPreviewAction[];
}>;
export class MetaAdsInsightsPreviewError extends Error {
  constructor(readonly code: "INVALID_RANGE" | "INVALID_RESPONSE" | "REQUEST_FAILED" |
    "REQUEST_TIMEOUT" | "RESPONSE_TOO_LARGE" | "API_ERROR" | "INCOMPLETE_RESPONSE") {
    super(code); this.name = "MetaAdsInsightsPreviewError";
  }
}
function check(value: unknown, code: MetaAdsInsightsPreviewError["code"]): asserts value {
  if (!value) throw new MetaAdsInsightsPreviewError(code);
}
function object(value: unknown): Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value), "INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidYmd(value);
}
const DAY = 86400000;
export function resolveMetaAdsPreviewRange(input: Partial<MetaAdsPreviewRange>, timeZone: string,
  now = new Date()): MetaAdsPreviewRange {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const dayOffset = (n: number) => new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
  const range = input.dateFrom === undefined && input.dateTo === undefined
    ? { dateFrom: dayOffset(30), dateTo: dayOffset(1) } : input;
  check(date(range.dateFrom) && date(range.dateTo) && range.dateFrom <= range.dateTo &&
    range.dateTo < today && Date.parse(range.dateTo) - Date.parse(range.dateFrom) < 31 * DAY, "INVALID_RANGE");
  return { dateFrom: range.dateFrom, dateTo: range.dateTo };
}
function metric(value: unknown, integer = false): string {
  check(typeof value === "string" || typeof value === "number", "INVALID_RESPONSE");
  const s = String(value);
  check((integer ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)(\.\d{1,6})?$/).test(s) &&
    s.length <= 32 && Number.isFinite(Number(s)) && Number(s) <= Number.MAX_SAFE_INTEGER, "INVALID_RESPONSE");
  return s;
}
function actions(value: unknown): MetaAdsPreviewAction[] {
  if (value === undefined) return [];
  check(Array.isArray(value) && value.length <= 256, "INVALID_RESPONSE");
  const seen = new Set<string>();
  return value.map(item => {
    const action = object(item), type = action.action_type;
    check(typeof type === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(type) && !seen.has(type), "INVALID_RESPONSE");
    seen.add(type);
    return { action_type: type, value: metric(action.value) };
  });
}
/** Read-only account aggregate. Preserve separate action types; no conversion mapping,
 * missing-to-zero coercion, canonical rows, report writes or sync readiness claim.
 */
export function parseMetaAdsInsightsPreview(body: unknown, accountId: string,
  range: MetaAdsPreviewRange): MetaAdsInsightsPreview {
  const parsed = object(body);
  check(!Object.hasOwn(parsed, "error"), "API_ERROR");
  check(Array.isArray(parsed.data) && parsed.data.length <= 1, "INVALID_RESPONSE");
  if (parsed.paging !== undefined) {
    check(!Object.hasOwn(object(parsed.paging), "next"), "INCOMPLETE_RESPONSE");
  }
  const base = { date_from: range.dateFrom, date_to: range.dateTo };
  if (parsed.data.length === 0) return { ...base, has_data: false, impressions: null, clicks: null,
    spend: null, actions: [], action_values: [] };
  const row = object(parsed.data[0]);
  check(row.account_id === accountId && row.date_start === range.dateFrom && row.date_stop === range.dateTo,
    "INVALID_RESPONSE");
  return { ...base, has_data: true, impressions: metric(row.impressions, true), clicks: metric(row.clicks, true),
    spend: metric(row.spend), actions: actions(row.actions), action_values: actions(row.action_values) };
}
export async function readMetaAdsInsightsPreview(input: MetaAdsPreviewRange & {
  externalAccountId: string; accessToken: string;
}, fetchImpl: typeof fetch, options: { timeoutMs?: number } = {}): Promise<MetaAdsInsightsPreview> {
  check(typeof window === "undefined" && /^[1-9][0-9]{0,29}$/.test(input.externalAccountId) &&
    /^[\x21-\x7e]{1,20000}$/.test(input.accessToken) && date(input.dateFrom) && date(input.dateTo) &&
    input.dateFrom <= input.dateTo && Date.parse(input.dateTo) - Date.parse(input.dateFrom) < 31 * DAY,
    "INVALID_RANGE");
  const timeoutMs = options.timeoutMs ?? 15000;
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 15000, "INVALID_RANGE");
  const url = new URL(`https://graph.facebook.com/${META_ADS_API_VERSION}/act_${input.externalAccountId}/insights`);
  // Match the platform's default attribution settings; do not introduce synthetic windows.
  url.searchParams.set("fields", "account_id,date_start,date_stop,impressions,clicks,spend,actions,action_values");
  url.searchParams.set("level", "account");
  url.searchParams.set("time_range", JSON.stringify({ since: input.dateFrom, until: input.dateTo }));
  url.searchParams.set("limit", "1");
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new MetaAdsInsightsPreviewError("REQUEST_TIMEOUT")); controller.abort();
        void reader?.cancel().catch(() => {});
      }, timeoutMs);
    });
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl(url.href, { method: "GET", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" }, signal: controller.signal });
      if (controller.signal.aborted || !response.ok || response.redirected ||
        (response.url && response.url !== url.href)) {
        void response.body?.cancel().catch(() => {});
        throw new MetaAdsInsightsPreviewError(controller.signal.aborted ? "REQUEST_TIMEOUT" : "API_ERROR");
      }
      if (Number(response.headers.get("content-length")) > 131072) {
        void response.body?.cancel().catch(() => {}); throw new MetaAdsInsightsPreviewError("RESPONSE_TOO_LARGE");
      }
      check(response.body, "INVALID_RESPONSE");
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0, text = "";
      for (;;) {
        const { done, value } = await reader.read();
        check(!controller.signal.aborted, "REQUEST_TIMEOUT");
        if (done) break;
        bytes += value.byteLength; check(bytes <= 131072, "RESPONSE_TOO_LARGE");
        text += decoder.decode(value, { stream: true });
      }
      return parseMetaAdsInsightsPreview(JSON.parse(text + decoder.decode()), input.externalAccountId, input);
    })()]);
  } catch (error) {
    throw error instanceof MetaAdsInsightsPreviewError ? error : new MetaAdsInsightsPreviewError("REQUEST_FAILED");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort(); void reader?.cancel().catch(() => {});
  }
}

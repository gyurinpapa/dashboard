import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import { parseMetaAdsInsightsPage } from "./meta-ads-insights-response";
import { MetaInsightsError, buildMetaAdsInsightsRequest, metaBound, metaCursorToken, metaHash,
  metaObject, metaRequestContext, requireMeta } from "./meta-ads-insights-request";

export type MetaAdsInsightsCursor = Readonly<{
  version: 1; scope: string; after: string; pageIndex: number;
  seenCursors: readonly string[]; seenRows: readonly string[];
}>;
export type MetaAdsInsightsOptions = Readonly<{
  pageSize?: number; maxPages?: number; maxRecords?: number; maxRetries?: number;
  requestTimeoutMs?: number; maxResponseBytes?: number;
}>;
export type MetaAdsInsightsDependencies = Readonly<{
  fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void>; nowImpl?: () => number;
}>;
function normalizeCursor(value: unknown, scope: string, pages: number, records: number): MetaAdsInsightsCursor | null {
  if (value === undefined || value === null) return null;
  const cursor = metaObject(value, "INVALID_CURSOR");
  requireMeta(Object.keys(cursor).sort().join() === "after,pageIndex,scope,seenCursors,seenRows,version", "INVALID_CURSOR");
  requireMeta(cursor.version === 1 && cursor.scope === scope && Number.isSafeInteger(cursor.pageIndex) &&
    (cursor.pageIndex as number) >= 1 && (cursor.pageIndex as number) < pages, "INVALID_CURSOR");
  const after = metaCursorToken(cursor.after);
  function hashes(value: unknown, limit: number): string[] {
    requireMeta(Array.isArray(value) && value.length <= limit &&
      value.every((v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) && new Set(value).size === value.length, "INVALID_CURSOR");
    return [...value];
  }
  const seenCursors = hashes(cursor.seenCursors, pages);
  const seenRows = hashes(cursor.seenRows, records);
  requireMeta(seenCursors.length === cursor.pageIndex && seenCursors.at(-1) === metaHash(after), "INVALID_CURSOR");
  return { version: 1, scope, after, pageIndex: cursor.pageIndex as number, seenCursors, seenRows };
}
function retryDelay(header: string | null, now: number): number {
  if (!header) return 0;
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.min(30_000, Math.max(0, ms)) : 0;
}
async function readJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  requireMeta(!length || !/^\d+$/.test(length) || Number(length) <= maxBytes, "RESPONSE_TOO_LARGE");
  requireMeta(response.body, "INVALID_RESPONSE");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let total = 0; let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      requireMeta(total <= maxBytes, "RESPONSE_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof MetaInsightsError) throw error;
    throw new MetaInsightsError("INVALID_RESPONSE");
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}
async function attempt(request: ReturnType<typeof buildMetaAdsInsightsRequest>, fetchImpl: typeof fetch,
  timeoutMs: number, maxBytes: number, now: () => number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new MetaInsightsError("REQUEST_TIMEOUT", null, true)); controller.abort(); }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let response: Response;
      try { response = await fetchImpl(request.url, { ...request.init, signal: controller.signal }); }
      catch { throw new MetaInsightsError("REQUEST_FAILED", null, true); }
      requireMeta(response instanceof Response && !response.redirected, "INVALID_RESPONSE");
      if (response.url) {
        const actual = new URL(response.url); const expected = new URL(request.url);
        requireMeta(actual.origin === expected.origin && actual.pathname === expected.pathname, "SCOPE_MISMATCH");
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new MetaInsightsError("API_HTTP_ERROR", response.status,
          response.status === 429 || response.status >= 500,
          retryDelay(response.headers.get("retry-after"), now()));
      }
      return readJson(response, maxBytes, controller.signal);
    })()]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** One committed page per call. No DB writes, worker hook, env/credential lookup or RAW assignment. */
export async function collectMetaAdsAdDailyInsightsPage(input: Readonly<{
  context: MetaAdsCanonicalContext; accessToken: string; cursor?: unknown;
}>, dependencies: MetaAdsInsightsDependencies = {}, options: MetaAdsInsightsOptions = {}) {
  const context = metaRequestContext(input.context);
  const pageSize = metaBound(options.pageSize ?? 500, 1, 2000);
  const maxPages = metaBound(options.maxPages ?? 1000, 1, 1000);
  const maxRecords = metaBound(options.maxRecords ?? 10000, 1, 100000);
  const maxRetries = metaBound(options.maxRetries ?? 3, 0, 3);
  const timeoutMs = metaBound(options.requestTimeoutMs ?? 10000, 1, 30000);
  const maxBytes = metaBound(options.maxResponseBytes ?? 4 * 1024 * 1024, 128, 8 * 1024 * 1024);
  const scope = metaHash(JSON.stringify({ context, pageSize, maxPages, maxRecords }));
  const cursor = normalizeCursor(input.cursor, scope, maxPages, maxRecords);
  const request = buildMetaAdsInsightsRequest({ context, accessToken: input.accessToken, pageSize, after: cursor?.after });
  requireMeta(!cursor || !cursor.after.includes(input.accessToken), "INVALID_CURSOR");
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const sleep = dependencies.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = dependencies.nowImpl ?? Date.now;
  let requestCount = 0; let retryCount = 0;
  let page: ReturnType<typeof parseMetaAdsInsightsPage>;
  for (;;) {
    requestCount++;
    try {
      const body = await attempt(request, fetchImpl, timeoutMs, maxBytes, now);
      page = parseMetaAdsInsightsPage(body, context, pageSize);
      break;
    } catch (error) {
      const safe = error instanceof MetaInsightsError ? error : new MetaInsightsError("REQUEST_FAILED");
      if (!safe.retryable) throw safe;
      if (retryCount >= maxRetries) throw new MetaInsightsError("RETRY_EXHAUSTED", safe.status);
      const delay = Math.max(safe.retryAfterMs, Math.min(1000 * 2 ** retryCount, 30000));
      retryCount++;
      try { await sleep(delay); } catch { throw new MetaInsightsError("REQUEST_FAILED"); }
    }
  }
  const seenRows = new Set(cursor?.seenRows ?? []);
  for (const key of page.identities) {
    requireMeta(!seenRows.has(key), "DUPLICATE_AD_DAY"); seenRows.add(key);
  }
  requireMeta(seenRows.size <= maxRecords, "ROW_LIMIT_EXCEEDED");
  const completedPageCount = (cursor?.pageIndex ?? 0) + 1;
  const seenCursors = [...(cursor?.seenCursors ?? [])];
  let next: MetaAdsInsightsCursor | null = null;
  if (page.after !== null) {
    requireMeta(!page.after.includes(input.accessToken), "INVALID_RESPONSE");
    const hash = metaHash(page.after);
    requireMeta(!seenCursors.includes(hash), "PAGINATION_LOOP");
    requireMeta(completedPageCount < maxPages, "PAGE_LIMIT_EXCEEDED");
    seenCursors.push(hash);
    next = Object.freeze({ version: 1 as const, scope, after: page.after, pageIndex: completedPageCount,
      seenCursors: Object.freeze(seenCursors), seenRows: Object.freeze([...seenRows]) });
  }
  return Object.freeze({ rows: Object.freeze(page.rows), cursor: next,
    status: next ? "partial" as const : "completed" as const, isComplete: next === null,
    fetchedRows: page.fetchedRows, canonicalRows: page.rows.length,
    pageCount: 1 as const, completedPageCount, requestCount, retryCount });
}

import { convertMetaAdsDailyInsightsToCanonicalRows, MetaAdsCanonicalError,
  type MetaAdsCanonicalContext, type MetaAdsAdDailyInsight } from "./meta-ads-canonical-row";
import { MetaInsightsError, metaObject, metaCursorToken, metaHash, requireMeta,
  buildMetaAdsInsightsRequest } from "./meta-ads-insights-request";

/** Strict offline wire contract. Sparse actions stay unresolved; no invented zero values. */
export function parseMetaAdsInsightsPage(value: unknown, context: MetaAdsCanonicalContext, pageSize: number) {
  const body = metaObject(value);
  if (Object.hasOwn(body, "error")) {
    const error = metaObject(body.error);
    const auth = error.code === 190 || error.code === 102;
    throw new MetaInsightsError("API_ERROR", null, !auth && error.is_transient === true);
  }
  requireMeta(Array.isArray(body.data) && body.data.length <= pageSize, "INVALID_RESPONSE");
  const records = body.data as unknown[];
  let rows;
  try {
    rows = convertMetaAdsDailyInsightsToCanonicalRows({ context, records: records as MetaAdsAdDailyInsight[] });
  } catch (error) {
    if (error instanceof MetaAdsCanonicalError) throw new MetaInsightsError(error.code);
    throw new MetaInsightsError("INVALID_RESPONSE");
  }
  // Include zero-performance input rows in duplicate detection, before DROP.
  const identities = records.map((value) => {
    const record = metaObject(value);
    return metaHash(JSON.stringify([record.account_id, record.ad_id, record.date_start]));
  });
  let after: string | null = null;
  if (body.paging !== undefined) {
    const paging = metaObject(body.paging);
    if (paging.next !== undefined) {
      requireMeta(typeof paging.next === "string" && paging.next.length > 0 && paging.next.length <= 32768, "INVALID_RESPONSE");
      const cursors = metaObject(paging.cursors);
      after = metaCursorToken(cursors.after, "INVALID_RESPONSE");
      let next: URL;
      try { next = new URL(paging.next); } catch { throw new MetaInsightsError("INVALID_RESPONSE"); }
      const expected = new URL(buildMetaAdsInsightsRequest({ context, accessToken: "fixture-validation-only", pageSize }).url);
      requireMeta(next.origin === expected.origin && next.pathname === expected.pathname &&
        !next.username && !next.password && !next.hash && next.searchParams.get("after") === after, "INVALID_RESPONSE");
      for (const key of next.searchParams.keys()) {
        requireMeta(next.searchParams.getAll(key).length === 1, "INVALID_RESPONSE");
        if (key === "after" || key === "access_token") continue;
        requireMeta(expected.searchParams.has(key) && next.searchParams.get(key) === expected.searchParams.get(key), "SCOPE_MISMATCH");
      }
      // Only the opaque cursor survives. next URLs and access_token are discarded.
    }
  }
  return { rows, identities, fetchedRows: records.length, after };
}

import { randomUUID } from "node:crypto";
import { readMetaAdsDailyPolicy } from "./meta-ads-daily-policy";
import { planMetaDailyWindows, normalizeMetaDailyWindow } from "./meta-ads-daily";
import { readMetaAdsContactPolicy } from "./meta-ads-contact-policy";
import { MetaAdsContactError, requireMetaContact as check } from "./meta-ads-contact-rows";
import { decryptMetaAdsCredentials } from "./meta-ads-credentials";
import { readMetaAdsAccountMetadata } from "./meta-ads-account-preflight";
import { readMetaAdsInsightsPreview } from "./meta-ads-insights-preview";
import { readMetaAdsAdDailyDataset } from "./meta-ads-ad-daily-check";

import type { SupabaseClient } from "@supabase/supabase-js";

// Never log provider/DB error text: either can contain caller data or credentials.
export function metaDailyErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /^(META_[A-Z_]+|NAVER_META_[A-Z_]+|REQUEST_FAILED|REQUEST_TIMEOUT|API_ERROR|INVALID_RESPONSE|INCOMPLETE_RESPONSE|DECRYPTION_FAILED)$/.test(code)
    ? code : "META_DAILY_FAILED";
}

export function createMetaDailyRunner(db: SupabaseClient, fetchImpl: typeof fetch = fetch) {
  const log = (event: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ collector: "meta_daily_v1", event, ...fields }));
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
      const code = String(error.message ?? "").split(/[\s:]/)[0];
      throw new MetaAdsContactError(metaDailyErrorCode({ code }));
    }
    return data;
  }
  async function retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await operation(); }
      catch (error) {
        if (attempt >= 2 || !["REQUEST_FAILED", "REQUEST_TIMEOUT", "API_ERROR", "META_DAILY_FAILED"].includes(metaDailyErrorCode(error))) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  async function refreshReports(connectionId: string, targetDate: string) {
    const ids = new Set<string>();
    for (const table of ["report_media_connections", "manual_report_media_connections"]) {
      const result = await db.from(table).select("report_id").eq("connection_id", connectionId).limit(501);
      check(!result.error && result.data && result.data.length <= 500, "META_DAILY_REPORT_LOOKUP_FAILED");
      for (const row of result.data) ids.add(row.report_id);
    }
    let failures = 0;
    for (const reportId of [...ids].sort()) {
      try {
        const result = await rpc("materialize_meta_ads_daily_report_v1", {
          p_report_id: reportId, p_connection_id: connectionId, p_target_date: targetDate });
        log("report", { report_id: reportId, ...result });
      } catch (error) { failures++; log("report_failed", { report_id: reportId, code: metaDailyErrorCode(error) }); }
    }
    log("report_refresh_finished", { connection_id: connectionId, report_count: ids.size, failures });
    return failures;
  }
  async function collect(connectionId: string, targetDate: string) {
    const lease = randomUUID();
    const claim = await rpc("claim_meta_ads_daily_run_v1", { p_connection_id: connectionId, p_target_date: targetDate, p_lease: lease });
    if (!claim.claimed) {
      log("skipped", { connection_id: connectionId, reason: claim.reason, target_date: targetDate });
      return claim.reason === "already_done" ? await refreshReports(connectionId, targetDate) : 0;
    }
    let failed = false;
    try {
      const { data: c, error } = await db.from("media_connections")
        .select("id,workspace_id,advertiser_id,provider,external_account_id,status,credential_version,credential_ciphertext,last_verified_at,updated_at,meta")
        .eq("id", connectionId).eq("provider", "meta_ads").single();
      check(!error && c && c.status === "active" && c.credential_version === 1 && c.last_verified_at &&
        Date.parse(c.updated_at) === Date.parse(claim.connection_updated_at), "META_CONTACT_CHANGED");
      const daily = readMetaAdsDailyPolicy(c.meta?.meta_ads_daily), policy = readMetaAdsContactPolicy(c.meta?.meta_ads_reporting, c.external_account_id);
      check(daily && policy, "META_CONTACT_POLICY_REQUIRED");
      const credential = decryptMetaAdsCredentials(c.credential_ciphertext, { connectionId: c.id, workspaceId: c.workspace_id,
        advertiserId: c.advertiser_id, provider: "meta_ads", externalAccountId: c.external_account_id });
      c.credential_ciphertext = null;
      const metadata = await retry(() => readMetaAdsAccountMetadata({ externalAccountId: c.external_account_id, accessToken: credential.access_token }, { fetchImpl }));
      check(metadata.currency === policy.currency && metadata.timeZone === policy.time_zone, "META_CONTACT_POLICY_REQUIRED");
      // SQL finds the earliest missing date; resume from there, including the rolling correction window.
      const windows = planMetaDailyWindows(claim.collection_start, targetDate, []);
      const started = Date.now();
      for (const range of windows) {
        check(Date.now() - started < 10 * 60_000, "META_DAILY_BUDGET_EXCEEDED");
        const result = await retry(async () => {
          const input = { ...range, externalAccountId: c.external_account_id, accessToken: credential.access_token };
          const aggregate = await readMetaAdsInsightsPreview(input, fetchImpl);
          const dataset = await readMetaAdsAdDailyDataset(input, aggregate, fetchImpl);
          return normalizeMetaDailyWindow(dataset.records, aggregate, range, policy, dataset.check.page_count);
        });
        const saved = await rpc("replace_meta_ads_daily_window_v1", { p_payload: {
          connection_id: c.id, run_id: claim.run_id, lease, expected_connection_updated_at: c.updated_at,
          date_from: range.dateFrom, date_to: range.dateTo, policy, ...result } });
        log("window_saved", { connection_id: c.id, date_from: range.dateFrom, date_to: range.dateTo,
          row_count: saved.row_count, evidence: result.evidence });
      }
      const done = await rpc("finish_meta_ads_daily_run_v1", { p_run_id: claim.run_id, p_lease: lease, p_error: null });
      log("collection_finished", { connection_id: c.id, target_date: targetDate, ...done });
      failed = done.status !== "done";
    } catch (error) {
      failed = true;
      const code = metaDailyErrorCode(error);
      try { await rpc("finish_meta_ads_daily_run_v1", { p_run_id: claim.run_id, p_lease: lease, p_error: code }); }
      catch { log("finish_failed", { connection_id: connectionId, code: "META_DAILY_FINISH_FAILED" }); }
      log("collection_failed", { connection_id: connectionId, target_date: targetDate, code });
    }
    return (failed ? 1 : 0) + await refreshReports(connectionId, targetDate);
  }
  return { collect };
}

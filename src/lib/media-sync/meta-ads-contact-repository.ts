import { isNaverMetaReportMeta, MANUAL_REPORT_CONNECTIONS_TABLE } from "./naver-meta-report";
import { getSupabaseAdmin } from "../supabase/admin";
import type { MediaConnectionReportAccessContext } from "./media-connection-access";
import type { MetaAdsContactTarget } from "./meta-ads-contact-sync";
import { MetaAdsContactError } from "./meta-ads-contact-rows";

export async function loadMetaAdsContactTarget(access: MediaConnectionReportAccessContext): Promise<MetaAdsContactTarget | null> {
  const db = getSupabaseAdmin();
  const report = await db.from("reports").select("id,workspace_id,advertiser_id,updated_at,current_ingestion_id,status,meta,report_type_id")
    .eq("id", access.reportId).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId).maybeSingle();
  if (report.error) throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  if (!report.data) return null;
  const combined = isNaverMetaReportMeta(report.data.meta);
  const mapping = await db.from(combined ? MANUAL_REPORT_CONNECTIONS_TABLE : "report_media_connections")
    .select("connection_id,workspace_id,advertiser_id").eq("report_id", access.reportId)
    .eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId).order("connection_id");
  if (mapping.error) throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  if (!mapping.data?.length || (!combined && mapping.data.length !== 1)) return null;
  const ids = mapping.data.map(m => m.connection_id);
  const [connection, type, companions] = await Promise.all([
    db.from("media_connections").select("id,workspace_id,advertiser_id,provider,external_account_id,credential_ciphertext,credential_version,status,connected_at,last_verified_at,updated_at,meta")
      .in("id", ids).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId)
      .eq("provider", "meta_ads").maybeSingle(),
    db.from("report_types").select("key").eq("id", report.data.report_type_id).maybeSingle(),
    db.from("media_connections").select("id,workspace_id,advertiser_id,provider,external_account_id,status,updated_at")
      .in("id", ids).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId)
      .eq("provider", "naver_searchad").order("id"),
  ]);
  if (connection.error || type.error || companions.error) throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  if (!connection.data || !type.data) return null;
  return { report: { ...report.data, report_type_key: type.data.key }, connection: connection.data,
    mapping: mapping.data, companions: companions.data ?? [] } as MetaAdsContactTarget;
}

/** Check complete dates before spending a Meta API request. SQL repeats this check under partition locks. */
export async function preflightNaverMetaCoverage(target: MetaAdsContactTarget, settings: {dateFrom: string; dateTo: string}) {
  const { report, companions = [] } = target;
  const { data, error } = await getSupabaseAdmin().from("media_sync_fact_partitions")
    .select("external_account_id,date,source_connection_id").eq("workspace_id", report.workspace_id)
    .eq("advertiser_id", report.advertiser_id).eq("provider", "naver_searchad")
    .in("external_account_id", companions.map(c => c.external_account_id))
    .gte("date", settings.dateFrom).lte("date", settings.dateTo);
  if (error) throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  const days = Math.round((Date.parse(settings.dateTo) - Date.parse(settings.dateFrom)) / 86400000) + 1;
  if (companions.some(c => new Set((data ?? []).filter(p => p.external_account_id === c.external_account_id &&
    p.source_connection_id === c.id).map(p => p.date)).size !== days))
    throw new MetaAdsContactError("NAVER_META_COVERAGE_INCOMPLETE");
}

const JOB_FIELDS = ["id","workspace_id","advertiser_id","report_id","connection_id","provider","external_account_id",
  "date_from","date_to","data_level","mode","status","progress","raw_rows","normalized_rows","inserted_rows","failed_rows",
  "previous_ingestion_id","snapshot_ingestion_id","attempt_count","error","created_by","created_at","started_at","finished_at","updated_at"];
export async function saveMetaAdsContactSnapshot(payload: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().rpc("save_meta_ads_contact_snapshot_v1", { p_payload: payload });
  if (error) {
    const code = String(error.message ?? "").split(/[\s:]/)[0];
    throw new MetaAdsContactError(["META_CONTACT_CHANGED","META_CONTACT_REPORT_REQUIRED","META_CONTACT_POLICY_REQUIRED",
      "META_CONTACT_INVALID_RANGE","META_CONTACT_RECONCILIATION_FAILED","ACTIVE_JOB_ALREADY_EXISTS",
      "NAVER_META_COVERAGE_INCOMPLETE","NAVER_META_FACTS_CHANGED","NAVER_META_TOO_MANY_ROWS"].includes(code)
      ? code : "META_CONTACT_SYNC_FAILED");
  }
  if (!data || typeof data !== "object" || !data.job || typeof data.job !== "object")
    throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  return { snapshot_ingestion_id: data.snapshot_ingestion_id, row_count: data.row_count,
    job: Object.fromEntries(JOB_FIELDS.map(k => [k, data.job[k] ?? null])) };
}

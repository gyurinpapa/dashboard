import { getSupabaseAdmin } from "../supabase/admin";
import type { MediaConnectionReportAccessContext } from "./media-connection-access";
import type { MetaAdsContactTarget } from "./meta-ads-contact-sync";
import { MetaAdsContactError } from "./meta-ads-contact-rows";

export async function loadMetaAdsContactTarget(access: MediaConnectionReportAccessContext): Promise<MetaAdsContactTarget | null> {
  const db = getSupabaseAdmin();
  const [report, mapping] = await Promise.all([
    db.from("reports").select("id,workspace_id,advertiser_id,updated_at,current_ingestion_id,status,meta,report_type_id")
      .eq("id", access.reportId).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId).maybeSingle(),
    db.from("report_media_connections").select("connection_id,workspace_id,advertiser_id")
      .eq("report_id", access.reportId).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId),
  ]);
  if (report.error || mapping.error) throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  if (!report.data || mapping.data?.length !== 1) return null;
  const [connection, type] = await Promise.all([
    db.from("media_connections").select("id,workspace_id,advertiser_id,provider,external_account_id,credential_ciphertext,credential_version,status,connected_at,last_verified_at,updated_at,meta")
      .eq("id", mapping.data[0].connection_id).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId)
      .eq("provider", "meta_ads").maybeSingle(),
    db.from("report_types").select("key").eq("id", report.data.report_type_id).maybeSingle(),
  ]);
  if (connection.error || type.error) throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  if (!connection.data || !type.data) return null;
  return { report: { ...report.data, report_type_key: type.data.key }, connection: connection.data,
    mapping: mapping.data } as MetaAdsContactTarget;
}
const JOB_FIELDS = ["id","workspace_id","advertiser_id","report_id","connection_id","provider","external_account_id",
  "date_from","date_to","data_level","mode","status","progress","raw_rows","normalized_rows","inserted_rows","failed_rows",
  "previous_ingestion_id","snapshot_ingestion_id","attempt_count","error","created_by","created_at","started_at","finished_at","updated_at"];
export async function saveMetaAdsContactSnapshot(payload: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().rpc("save_meta_ads_contact_snapshot_v1", { p_payload: payload });
  if (error) {
    const code = String(error.message ?? "").split(/[\s:]/)[0];
    throw new MetaAdsContactError(["META_CONTACT_CHANGED","META_CONTACT_REPORT_REQUIRED","META_CONTACT_POLICY_REQUIRED",
      "META_CONTACT_INVALID_RANGE","META_CONTACT_RECONCILIATION_FAILED","ACTIVE_JOB_ALREADY_EXISTS"].includes(code)
      ? code : "META_CONTACT_SYNC_FAILED");
  }
  if (!data || typeof data !== "object" || !data.job || typeof data.job !== "object")
    throw new MetaAdsContactError("META_CONTACT_SYNC_FAILED", 500);
  return { snapshot_ingestion_id: data.snapshot_ingestion_id, row_count: data.row_count,
    job: Object.fromEntries(JOB_FIELDS.map(k => [k, data.job[k] ?? null])) };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaSyncProviderDashboardItem } from "./media-sync-provider-dashboard";
import { listSafeMediaConnections } from "./media-connections-repository";
import { buildMediaSyncProviderDashboard } from "./media-sync-provider-dashboard";

export function hasDailyMetaAttachment(meta: any): boolean {
  return meta?.daily_meta_attachment?.contract === "daily_meta_attachment_v1";
}

/** Called only after report access is authorized. Collectors retain the source pointer. */
export async function resolveDailyMetaSnapshot(db: SupabaseClient, report: {
  id: string; current_ingestion_id: string | null; meta: unknown;
}): Promise<string | null> {
  if (!hasDailyMetaAttachment(report.meta)) return report.current_ingestion_id;
  const { data, error } = await db.rpc("resolve_daily_report_meta_snapshot_v1", {
    p_report_id: report.id, p_source_ingestion_id: report.current_ingestion_id,
  });
  if (error || !data?.snapshot_ingestion_id) {
    const code = String(error?.message ?? "").split(/[\s:]/)[0];
    throw new Error(code.startsWith("DAILY_META_") ? code : "DAILY_META_SNAPSHOT_FAILED");
  }
  return data.snapshot_ingestion_id;
}

export function dailyMetaAttachmentErrorMessage(code: string): string {
  if (code === "DAILY_META_COVERAGE_INCOMPLETE") return "메타 연결은 저장됐습니다. 보고서 전체 기간의 메타 데이터 수집이 완료되면 함께 표시됩니다.";
  if (code === "DAILY_META_POLICY_REQUIRED") return "메타 자동 수집 시작일이 보고서 시작일을 포함하는지 연결 설정에서 확인해 주세요.";
  if (code === "DAILY_META_UNSUPPORTED_REPORT") return "현재 기존 보고서의 매체 추가는 네이버 자동화 DB획득 보고서에 메타 계정 1개를 추가하는 경우 지원합니다. 기존 연결은 유지됩니다.";
  if (code === "DAILY_META_SOURCE_CHANGED") return "자동 수집 데이터가 갱신됐습니다. 잠시 후 다시 열어 주세요.";
  return "선택한 매체를 기존 보고서에 적용하지 못했습니다. 연결 상태와 보고서 유형을 확인해 주세요.";
}

/** Read-only status. Never presents account collection as a worker job on the source report. */
export async function loadDailyMetaProviderStatus(db: SupabaseClient, report: {
  id: string; workspace_id: string; advertiser_id: string; meta: any;
}) {
  if (!hasDailyMetaAttachment(report.meta)) return null;
  const { data: mapping, error } = await db.from("daily_report_meta_connections").select("connection_id")
    .eq("report_id", report.id).eq("workspace_id", report.workspace_id).eq("advertiser_id", report.advertiser_id).single();
  if (error || !mapping) throw new Error("DAILY_META_SCOPE_MISMATCH");
  const connections = await listSafeMediaConnections({ workspaceId: report.workspace_id, advertiserId: report.advertiser_id });
  const connection = connections.find(c => c.id === mapping.connection_id && c.provider === "meta_ads");
  if (!connection) throw new Error("DAILY_META_SCOPE_MISMATCH");
  const start = String(report.meta.public_identity.period_key);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const through = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const { data: partitions, error: partitionError } = await db.from("meta_ads_daily_partitions")
    .select("date,row_count,updated_at").eq("connection_id", connection.id).eq("workspace_id", report.workspace_id)
    .eq("advertiser_id", report.advertiser_id).gte("date", start).lte("date", through).order("date").limit(3661);
  if (partitionError) throw new Error("DAILY_META_STATUS_FAILED");
  let next = start, rows = 0, completed = 0, completedThrough: string | null = null, updatedAt: string | null = null;
  for (const p of partitions ?? []) {
    if (p.date !== next) break;
    rows += p.row_count; completed++; completedThrough = p.date;
    updatedAt = !updatedAt || p.updated_at > updatedAt ? p.updated_at : updatedAt;
    next = new Date(Date.parse(next) + 86400000).toISOString().slice(0, 10);
  }
  const total = Math.max(0, Math.round((Date.parse(through) - Date.parse(start)) / 86400000) + 1);
  const covered = total > 0 && completed === total;
  const status = connection.meta.meta_ads_daily_status as Record<string, unknown> | undefined;
  const state = status?.status === "failed" ? "failed" : status?.status === "processing" ? "processing" : covered ? "done" : "pending";
  const progress = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
  const provider: MediaSyncProviderDashboardItem = {
    ...buildMediaSyncProviderDashboard({ connections: [connection], jobs: [] })[2],
    latest_job: {
      id: `meta-daily:${connection.id}`, status: state, progress,
      phase: completedThrough ? `${completedThrough}까지 자동 수집` : "자동 수집 대기", current_product: null,
      current_product_label: null, collected_rows: rows, failed_rows: 0,
      created_at: connection.created_at, started_at: null, finished_at: updatedAt,
      updated_at: updatedAt || connection.updated_at, error: state === "failed" ? "최근 메타 자동 수집 실패" : null,
    },
  };
  return { provider, progress: { provider: "meta_ads" as const, start_date: start, through_date: through,
    completed_through: completedThrough, first_missing_date: covered ? null : next, total_dates: total,
    completed_dates: completed, progress, contiguous_rows: rows, participant_count: 1, target_covered: covered } };
}

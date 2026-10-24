import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { MediaConnectionAccessError, resolveReportMediaConnectionAccess } from "@/src/lib/media-sync/media-connection-access";
import { dailyMetaAttachmentErrorMessage, resolveDailyMetaSnapshot } from "@/src/lib/media-sync/daily-report-meta-attachment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const { id } = await ctx.params;
    const access = await resolveReportMediaConnectionAccess({ request, reportId: id, action: "run_sync" });
    const body = await request.json().catch(() => null);
    const ids = body?.connection_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 16 || new Set(ids).size !== ids.length ||
      ids.some(v => typeof v !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)) ||
      body.workspace_id !== access.workspaceId || body.advertiser_id !== access.advertiserId) {
      return NextResponse.json({ ok: false, error: "DAILY_META_INVALID_SELECTION" }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc("attach_daily_report_meta_v1", {
      p_report_id: access.reportId, p_connection_ids: ids, p_user_id: access.userId,
    });
    if (error) throw new Error(String(error.message).split(/[\s:]/)[0]);
    const { data: report, error: loadError } = await db.from("reports").select("id,current_ingestion_id,meta")
      .eq("id", access.reportId).eq("workspace_id", access.workspaceId).eq("advertiser_id", access.advertiserId).single();
    if (loadError || !report) throw new Error("DAILY_META_REPORT_REQUIRED");
    const snapshotId = await resolveDailyMetaSnapshot(db, report);
    return NextResponse.json({ ok: true, status: data.status, snapshot_ingestion_id: snapshotId });
  } catch (error) {
    if (error instanceof MediaConnectionAccessError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    const code = error instanceof Error && error.message.startsWith("DAILY_META_") ? error.message : "DAILY_META_SAVE_FAILED";
    return NextResponse.json({ ok: false, error: code, message: dailyMetaAttachmentErrorMessage(code) }, { status: 409 });
  }
}

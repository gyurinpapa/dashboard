// app/api/reports/[id]/rows/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    // ✅ sbAuth는 "서버 supabase client"로 사용 (통일)
    const auth = await sbAuth();

    if (!auth.ok) {
    return jsonError(401, "UNAUTHORIZED");
    }

    const user = auth.user;

    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();

    // 1) report 조회
    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id, current_ingestion_id")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    // 2) membership 체크  ✅ id 컬럼 쓰지 말 것
    const { data: wm, error: wmErr } = await admin
      .from("workspace_members")
      .select("role") // 또는 "workspace_id"
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    // 3) ingestion 없으면 빈 배열
    const ingestionId = report.current_ingestion_id;
    if (!ingestionId) return NextResponse.json({ ok: true, rows: [] });

    // 4) rows 로드
    const { data: rows, error: rowsErr } = await admin
      .from("report_rows")
      .select("id, report_id, ingestion_id, row, created_at")
      .eq("report_id", id)
      .eq("ingestion_id", ingestionId)
      .order("created_at", { ascending: true });

    if (rowsErr) return jsonError(500, rowsErr.message);

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}
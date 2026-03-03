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
    // ✅ auth: 결과객체 방식
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const authErr = (auth as any)?.error ?? null;

    if (authErr || !user) return jsonError(401, "UNAUTHORIZED");

    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();

    // 1) report 조회 (workspace_id, current_ingestion_id)
    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id, current_ingestion_id")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    // 2) membership 체크
    const { data: wm, error: wmErr } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    // ✅ 3) current_ingestion_id 없으면 빈 배열
    const ingestionId = report.current_ingestion_id;
    if (!ingestionId) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    // 4) rows 로드 (현재 ingestion_id 기준)
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
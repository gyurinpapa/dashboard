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

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

export async function GET(_req: Request, ctx: Ctx) {
  const { user, error: authErr } = await sbAuth();
  if (authErr || !user) return jsonError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const reportId = asString(id);
  if (!reportId) return jsonError(400, "MISSING_REPORT_ID");

  const sb = getSupabaseAdmin();

  // ✅ current_ingestion_id 조회
  const { data: rep, error: repErr } = await sb
    .from("reports")
    .select("id, current_ingestion_id")
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "REPORT_SELECT_FAILED");
  if (!rep) return jsonError(404, "REPORT_NOT_FOUND");

  const ingestionId = (rep as any).current_ingestion_id ? String((rep as any).current_ingestion_id) : "";

  // ✅ 중요: 세션이 없으면 rows=빈배열 (옛 데이터 착시 차단)
  if (!ingestionId) {
    return NextResponse.json(
      { ok: true, report_id: reportId, ingestion_id: null, rows: [] },
      { status: 200 }
    );
  }

  const { data: rows, error: selErr } = await sb
    .from("report_rows")
    .select("id, report_id, ingestion_id, date, channel, device, source, row, row_index")
    .eq("report_id", reportId)
    .eq("ingestion_id", ingestionId)
    .order("row_index", { ascending: true });

  if (selErr) return jsonError(500, selErr.message || "ROWS_SELECT_FAILED");

  return NextResponse.json(
    { ok: true, report_id: reportId, ingestion_id: ingestionId, rows: rows ?? [] },
    { status: 200 }
  );
}
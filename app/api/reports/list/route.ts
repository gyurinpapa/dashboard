// app/api/reports/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function asNonEmpty(v: any) {
  const s = asString(v);
  return s ? s : null;
}

export async function GET(req: Request) {
  try {
    // ✅ auth: 결과객체 방식 통일
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const authErr = (auth as any)?.error ?? null;

    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

    const url = new URL(req.url);
    const workspace_id = asNonEmpty(url.searchParams.get("workspace_id"));

    if (!workspace_id) return jsonError(400, "workspace_id is required");

    // ✅ membership 체크
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    // ✅ report 목록 조회
    const { data: reports, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, title, status, period_start, period_end, meta, created_at, updated_at, report_type_id")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (rErr) return jsonError(400, rErr.message);

    return NextResponse.json({ ok: true, reports: reports ?? [] });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}
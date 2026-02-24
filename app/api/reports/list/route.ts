// app/api/reports/list/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(n: any, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.trunc(v), min), max);
}

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const workspace_id = url.searchParams.get("workspace_id")?.trim() || "";
    const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

    if (!workspace_id) return jsonError(400, "workspace_id is required");

    // ✅ Supabase Admin (요청 시점 생성)
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return jsonError(
        503,
        "Supabase env missing",
        { hint: "Set SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in environment." }
      );
    }

    // ✅ 1) 서버 쿠키 세션으로 user 확인 (단일 방식)
    const sb = await sbAuth();
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    const user = userRes?.user ?? null;

    if (userErr || !user) return jsonError(401, "Unauthorized (no session). Please sign in.");

    // ✅ 2) workspace 멤버십 체크
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    // ✅ 3) reports 조회
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id, title, status, period_start, period_end, created_at, updated_at")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return jsonError(400, error.message);

    return NextResponse.json({ ok: true, reports: data ?? [] });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}
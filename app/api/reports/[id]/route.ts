// app/api/reports/[id]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function asString(v: any) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function supabaseMissing() {
  return NextResponse.json(
    {
      ok: false,
      error: "Supabase env missing",
      hint: "Set SUPABASE_URL(or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in environment.",
    },
    { status: 503 }
  );
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) return jsonError(400, "id is required");

    // ✅ Supabase Admin (요청 시점 생성)
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return supabaseMissing();

    // ✅ 1) 세션 통일: 서버에서 쿠키 기반 user 읽기
    const sb = await sbAuth();
    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();

    if (userErr || !user) return jsonError(401, "Unauthorized (no session). Please sign in.");

    // ✅ 2) report 조회 (workspace_id 확보 포함)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select(
        "id, workspace_id, report_type_id, title, status, period_start, period_end, meta, created_at, updated_at, created_by"
      )
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // ✅ 3) workspace 멤버십 체크 (권한 확인)
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) return jsonError(400, "id is required");

    // ✅ Supabase Admin (요청 시점 생성)
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return supabaseMissing();

    // ✅ 1) 세션 통일
    const sb = await sbAuth();
    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();

    if (userErr || !user) return jsonError(401, "Unauthorized (no session). Please sign in.");

    // ✅ 2) report 먼저 조회 (workspace_id 확보)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // ✅ 3) 멤버십 체크
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    // ✅ 4) body 파싱 + patch 구성
    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    const hasPeriodStart = Object.prototype.hasOwnProperty.call(body, "period_start");
    const hasPeriodEnd = Object.prototype.hasOwnProperty.call(body, "period_end");

    const period_start = hasPeriodStart ? (body.period_start ?? null) : undefined;
    const period_end = hasPeriodEnd ? (body.period_end ?? null) : undefined;

    const meta = body.meta !== undefined ? body.meta : undefined;

    const patch: any = {};
    if (title !== undefined) patch.title = title;
    if (hasPeriodStart) patch.period_start = period_start;
    if (hasPeriodEnd) patch.period_end = period_end;
    if (meta !== undefined) patch.meta = meta;

    if (Object.keys(patch).length === 0) {
      return jsonError(400, "No fields to update");
    }

    // ✅ 5) update
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("reports")
      .update(patch)
      .eq("id", id)
      .select("id, workspace_id, report_type_id, title, status, period_start, period_end, meta, updated_at")
      .maybeSingle();

    if (uErr) return jsonError(400, uErr.message);
    if (!updated) return jsonError(404, "Report not found");

    return NextResponse.json({ ok: true, report: updated });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}
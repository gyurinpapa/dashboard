// app/api/reports/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

type Ctx = { params: Promise<{ id: string }> };

function asString(v: any) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

async function getUserFromSbAuth() {
  // ✅ 이 프로젝트의 sbAuth()는 "결과 객체"를 반환 (SbAuthResult/AuthOk)
  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;
  return { user, authErr };
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return jsonError(400, "id is required");
    }

    // ✅ 1) 세션 통일: 결과 객체 방식
    const { user, authErr } = await getUserFromSbAuth();
    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

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
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
    }

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return jsonError(400, "id is required");
    }

    // ✅ 1) 세션 통일: 결과 객체 방식
    const { user, authErr } = await getUserFromSbAuth();
    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

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
    if (!wm) {
      return jsonError(403, "Forbidden: you are not a member of this workspace");
    }

    // (선택) 수정 권한을 role로 제한하고 싶으면 여기서 체크 가능
    // if (!["owner", "admin", "editor"].includes(wm.role)) { ... }

    // ✅ 4) body 파싱 + patch 구성
    const body = await req.json().catch(() => ({}));

    const title = typeof body.title === "string" ? body.title.trim() : undefined;

    // date는 "YYYY-MM-DD" 문자열 또는 null을 허용
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
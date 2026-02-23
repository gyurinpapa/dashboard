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

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    // ✅ 1) 세션 통일: 서버에서 쿠키 기반 user 읽기
    const sb = await sbAuth();
    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized (no session). Please sign in." },
        { status: 401 }
      );
    }

    // ✅ 2) report 조회 (workspace_id 확보 포함)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select(
        "id, workspace_id, report_type_id, title, status, period_start, period_end, meta, created_at, updated_at, created_by"
      )
      .eq("id", id)
      .maybeSingle();

    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 400 });
    if (!report) return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });

    // ✅ 3) workspace 멤버십 체크 (권한 확인)
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return NextResponse.json({ ok: false, error: wmErr.message }, { status: 500 });
    if (!wm) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: you are not a member of this workspace" },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = asString(idRaw);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    // ✅ 1) 세션 통일
    const sb = await sbAuth();
    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized (no session). Please sign in." },
        { status: 401 }
      );
    }

    // ✅ 2) report 먼저 조회 (workspace_id 확보)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 400 });
    if (!report) return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });

    // ✅ 3) 멤버십 체크
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return NextResponse.json({ ok: false, error: wmErr.message }, { status: 500 });
    if (!wm) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: you are not a member of this workspace" },
        { status: 403 }
      );
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
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    // ✅ 5) update
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("reports")
      .update(patch)
      .eq("id", id)
      .select("id, workspace_id, report_type_id, title, status, period_start, period_end, meta, updated_at")
      .maybeSingle();

    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 400 });
    if (!updated) return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });

    return NextResponse.json({ ok: true, report: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
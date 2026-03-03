// app/api/reports/create/route.ts
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

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaultPeriod() {
  // ✅ 기본값: 최근 7일 (필요시 기존 프로젝트 규칙으로 변경 가능)
  const today = new Date();
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  return { period_start: toYMD(start), period_end: toYMD(end) };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // ✅ auth: sbAuth() 결과객체 방식 통일
    const auth = await sbAuth();
    const user = (auth as any)?.user ?? null;
    const authErr = (auth as any)?.error ?? null;

    if (authErr || !user) {
      return jsonError(401, "Unauthorized (no session). Please sign in.");
    }

    const workspace_id = asNonEmpty(body.workspace_id);
    const report_type_id = asNonEmpty(body.report_type_id);
    const title = asNonEmpty(body.title) ?? "새 리포트";

    if (!workspace_id) return jsonError(400, "workspace_id is required");
    if (!report_type_id) return jsonError(400, "report_type_id is required");

    // ✅ membership 체크
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    // ✅ period 자동 세팅 (body가 주면 우선, 없으면 기본값)
    const hasStart = Object.prototype.hasOwnProperty.call(body, "period_start");
    const hasEnd = Object.prototype.hasOwnProperty.call(body, "period_end");
    const fallback = defaultPeriod();

    const period_start = hasStart ? (body.period_start ?? null) : fallback.period_start;
    const period_end = hasEnd ? (body.period_end ?? null) : fallback.period_end;

    const meta = body.meta !== undefined ? body.meta : {};

    const insertPayload: any = {
      workspace_id,
      report_type_id,
      title,
      status: "draft",
      period_start,
      period_end,
      meta,
      created_by: user.id,
    };

    const { data: created, error: cErr } = await supabaseAdmin
      .from("reports")
      .insert(insertPayload)
      .select("id, workspace_id, report_type_id, title, status, period_start, period_end, meta, created_at")
      .maybeSingle();

    if (cErr) return jsonError(400, cErr.message);
    if (!created) return jsonError(500, "CREATE_FAILED");

    return NextResponse.json({ ok: true, report: created });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}
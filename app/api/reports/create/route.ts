// app/api/reports/create/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

type CreateBody = {
  workspace_id?: string;
  report_type_id?: string;
  title?: string;
  status?: string;
  meta?: any;
  period_start?: string | null;
  period_end?: string | null;
};

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const workspace_id = body.workspace_id?.trim();
    const report_type_id = body.report_type_id?.trim();
    const title = body.title?.trim();
    const status = body.status?.trim() || "draft";
    const meta = body.meta ?? {};

    // period는 "들어오면 우선", 없으면 자동세팅
    const period_start_in = body.period_start ?? null;
    const period_end_in = body.period_end ?? null;

    if (!workspace_id) return jsonError(400, "workspace_id is required");
    if (!report_type_id) return jsonError(400, "report_type_id is required");

    // ✅ 1) 서버 쿠키 세션으로 user 확인 (단일 방식)
    const sb = await sbAuth();
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    const user = userRes?.user ?? null;
    if (userErr || !user) return jsonError(401, "Unauthorized (no session). Please sign in.");

    const created_by = user.id;

    // ✅ 2) 멤버십 체크 (workspace_members)
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", created_by)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    // ✅ 3) period 자동세팅 (없을 때만)
    let period_start = period_start_in;
    let period_end = period_end_in;

    if (!period_start || !period_end) {
      const { data: minRows, error: minErr } = await supabaseAdmin
        .from("metrics_daily")
        .select("date")
        .eq("workspace_id", workspace_id)
        .order("date", { ascending: true })
        .limit(1);

      const { data: maxRows, error: maxErr } = await supabaseAdmin
        .from("metrics_daily")
        .select("date")
        .eq("workspace_id", workspace_id)
        .order("date", { ascending: false })
        .limit(1);

      // 조회 실패는 create를 막지 않고(초기엔 데이터 없을 수 있음) null 유지
      if (!minErr && !maxErr) {
        const minDate = (minRows?.[0] as any)?.date ?? null;
        const maxDate = (maxRows?.[0] as any)?.date ?? null;

        if (!period_start && minDate) period_start = minDate;
        if (!period_end && maxDate) period_end = maxDate;
      }
    }

    // ✅ 4) reports insert (service role)
    const { data, error } = await supabaseAdmin
      .from("reports")
      .insert({
        workspace_id,
        report_type_id,
        title: title ?? "New Report - Draft",
        status,
        period_start,
        period_end,
        created_by,
        meta,
      })
      .select("id, workspace_id, report_type_id, title, status, period_start, period_end, created_at")
      .single();

    if (error) return jsonError(400, error.message);

    return NextResponse.json({ ok: true, report: data });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}
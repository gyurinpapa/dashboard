// app/api/share/[token]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function asToken(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

/**
 * GET /api/share/[token]
 * - share_token 으로 reports 조회
 * - status = 'ready' 인 경우만 허용
 * - workspace 권한 체크 없음 (공유 링크이므로)
 * - token 존재 여부만 체크
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const shareToken = asToken(token);

  if (!shareToken) return jsonError(400, "Missing share token");

  const sb = getSupabaseAdmin();

  const { data: report, error } = await sb
    .from("reports")
    .select(
      [
        "id",
        "title",
        "status",
        "created_at",
        "updated_at",
        "workspace_id",
        "created_by",
        "report_type_id",
        "meta",
        "period_start",
        "period_end",
        "share_token",
        "published_at",
      ].join(",")
    )
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error) return jsonError(500, error.message || "DB error");
  if (!report) return jsonError(404, "Invalid share token");

  // ✅ TS 타입가드 추가 (report.status 접근 전에)
  if (!report || typeof report !== "object" || !("status" in report)) {
  return jsonError(404, "Invalid share token");
}

  const status = (report as any)?.status;
if (!status) return jsonError(404, "Invalid share token");

if (status !== "ready") {
  // draft/기타 상태는 공유로 노출 금지
  return jsonError(403, "Report is not published");
}

  return NextResponse.json({ ok: true, report }, { status: 200 });
}
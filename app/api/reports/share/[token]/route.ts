// app/api/reports/share/[token]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const shareToken = String(token || "").trim();
    if (!shareToken) return jsonError(400, "Missing token");

    // ✅ 핵심: meta 포함해서 가져오기
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, title, status, meta, share_token, updated_at, created_at")
      .eq("share_token", shareToken)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // ✅ 발행(ready)만 공개 열람 허용
    if (report.status !== "ready") {
      return jsonError(404, "Report not found");
      // (보안상 ready 아닌 경우도 404로 숨김)
    }

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
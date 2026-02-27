// app/api/reports/share/[token]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sbAdmin() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const shareToken = String(token || "").trim();
    if (!shareToken) return jsonError(400, "Missing share token");

    const sb = sbAdmin();

    const { data: report, error } = await sb
      .from("reports")
      .select(
        "id,title,status,meta,share_token,period_start,period_end,created_at,updated_at"
      )
      .eq("share_token", shareToken)
      .maybeSingle();

    if (error) return jsonError(500, error.message);
    if (!report) return jsonError(404, "Share token not found");
    if (report.status !== "ready") return jsonError(403, "Report is not published");

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return jsonError(500, e?.message || "Server error");
  }
}
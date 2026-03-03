import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function randToken(len = 32) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;

  if (authErr || !user) return jsonError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const reportId = String(id || "").trim();
  if (!reportId) return jsonError(400, "BAD_REPORT_ID");

  const sb = getSupabaseAdmin();

  const { data: report, error: repErr } = await sb
    .from("reports")
    .select("id, share_token")
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "DB error");
  if (!report) return jsonError(404, "REPORT_NOT_FOUND");

  const token = (report as any).share_token || randToken(32);
  const now = new Date().toISOString();

  // ✅ published_at 컬럼을 건드리지 않는 안전모드
  const { error: upErr } = await sb
    .from("reports")
    .update({
      share_token: token,
      status: "ready",
      updated_at: now,
    })
    .eq("id", reportId);

  if (upErr) return jsonError(500, upErr.message || "PUBLISH_FAILED");

  return NextResponse.json(
    { ok: true, sharePath: `/share/${token}`, status: "ready" },
    { status: 200 }
  );
}
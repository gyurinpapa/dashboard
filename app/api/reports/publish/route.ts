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

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Not authenticated");

    // ✅ 토큰으로 유저 검증
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr) return jsonError(401, "Not authenticated");
    const userId = userRes.user?.id;
    if (!userId) return jsonError(401, "Not authenticated");

    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const reportId = String(body.reportId || "");
    if (!reportId) return jsonError(400, "Missing reportId");

    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // ✅ role 확인 (admin 이상만 발행)
    const { data: wm, error: wErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return jsonError(500, wErr.message);

    const role = wm?.role;
    const canPublish = role === "admin" || role === "director" || role === "master";
    if (!canPublish) return jsonError(403, "No permission to publish");

    const nowIso = new Date().toISOString();

    const { error: upErr } = await supabaseAdmin
      .from("reports")
      .update({ status: "ready", updated_at: nowIso })
      .eq("id", reportId);

    if (upErr) return jsonError(500, upErr.message);

    return NextResponse.json({ ok: true, status: "ready" });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
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

function makeToken(len = 24) {
  // URL-safe token
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Not authenticated");

    const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userRes.user?.id) return jsonError(401, "Not authenticated");
    const userId = userRes.user.id;

    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const reportId = String(body.reportId || "");
    if (!reportId) return jsonError(400, "Missing reportId");

    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, status, share_token")
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // 발행(ready)만 공유 허용
    if (report.status !== "ready") {
      return jsonError(400, "Only ready reports can be shared");
    }

    // role 확인: admin 이상만 공유 토큰 생성
    const { data: wm, error: wErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return jsonError(500, wErr.message);

    const role = wm?.role;
    const canShare = role === "admin" || role === "director" || role === "master";
    if (!canShare) return jsonError(403, "No permission to create share link");

    // 이미 share_token 있으면 재사용
    if (report.share_token) {
      return NextResponse.json({ ok: true, token: report.share_token });
    }

    // 충돌 대비: 최대 5번 재시도
    let newToken = "";
    for (let i = 0; i < 5; i++) {
      newToken = makeToken(28);
      const { error: upErr } = await supabaseAdmin
        .from("reports")
        .update({ share_token: newToken, updated_at: new Date().toISOString() })
        .eq("id", reportId)
        .is("share_token", null); // 이미 누가 세팅했으면 업데이트 안 함

      if (!upErr) break;
      // unique 충돌 등 발생 시 재시도
      if (i === 4) return jsonError(500, upErr.message);
    }

    // 최종 토큰 재조회
    const { data: r2, error: r2Err } = await supabaseAdmin
      .from("reports")
      .select("share_token")
      .eq("id", reportId)
      .maybeSingle();

    if (r2Err) return jsonError(500, r2Err.message);

    return NextResponse.json({ ok: true, token: r2?.share_token });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
// app/api/uploads/signed-url/route.ts
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

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizePath(p: string) {
  return p.replace(/^\/+/, "").replace(/\/+/g, "/");
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await safeJson(req);
    if (!body) return jsonError(400, "Invalid JSON body");

    const bucket = asString(body.bucket) || "report_uploads"; // ✅ 기본 고정
    const path = normalizePath(asString(body.path));
    const shareToken = asString(body.shareToken);

    if (!path) return jsonError(400, "Missing path");

    const sb = sbAdmin();

    // =========================================================
    // ✅ 1) 공유 모드: shareToken이 있으면 workspace 체크 없이 허용
    // =========================================================
    if (shareToken) {
      const { data: report, error } = await sb
        .from("reports")
        .select("id,status,share_token")
        .eq("share_token", shareToken)
        .maybeSingle();

      if (error) return jsonError(500, error.message);
      if (!report) return jsonError(404, "Share token not found");
      if (report.status !== "ready") return jsonError(403, "Report is not published");

      const reportId = String(report.id);
      const allowedPrefix = `reports/${reportId}/`;

      if (!path.startsWith(allowedPrefix)) {
        return jsonError(403, `Invalid path (must start with ${allowedPrefix})`);
      }

      const { data, error: signErr } = await sb.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 10);

      if (signErr) return jsonError(500, signErr.message);
      return NextResponse.json({ ok: true, url: data?.signedUrl || null });
    }

    // =========================================================
    // ✅ 2) 로그인 모드: 기존 정책 유지 (workspace context required 등)
    // - 네 프로젝트의 기존 코드를 여기로 "그대로" 두면 됨
    // - 최소 안전 버전: Bearer 없으면 403
    // =========================================================
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const accessToken = m?.[1];
    if (!accessToken) return jsonError(403, "Missing Authorization");

    // 토큰 유효성만 확인 (기존 workspace 검사 로직이 있다면 여기 아래에 넣어)
    const { data: userRes, error: userErr } = await sb.auth.getUser(accessToken);
    if (userErr || !userRes?.user) return jsonError(403, "Invalid session");

    // 기존처럼 path 검증 (최소)
    if (!path.startsWith("reports/")) return jsonError(403, "Invalid path");

    const { data, error: signErr } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10);

    if (signErr) return jsonError(500, signErr.message);
    return NextResponse.json({ ok: true, url: data?.signedUrl || null });
  } catch (e: any) {
    return jsonError(500, e?.message || "Server error");
  }
}
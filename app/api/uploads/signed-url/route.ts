// app/api/uploads/signed-url/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // ✅ 인증
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Not authenticated");

    const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userRes.user?.id) return jsonError(401, "Not authenticated");
    const userId = userRes.user.id;

    // ✅ body
    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const reportId = asString(body.reportId);
    const bucket = asString(body.bucket) || "report_uploads";
    const path = asString(body.path);

    if (!reportId) return jsonError(400, "Missing reportId");
    if (!path) return jsonError(400, "Missing path");

    // ✅ report 조회
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, meta")
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // ✅ 권한 체크
    const { data: wm, error: wErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return jsonError(500, wErr.message);

    const role = wm?.role;
    const canRead = role === "admin" || role === "director" || role === "master";
    if (!canRead) return jsonError(403, "No permission");

    // ✅ 허용된 path 확인 (meta.upload 안에 있어야)
    const meta = safeObj(report.meta);
    const upload = safeObj(meta.upload);

    /**
     * ✅ CSV 허용 경로 계산 (로직 유지 + 호환성만 강화)
     * - 기존: upload.csv가 "객체"일 때 csv.path
     * - 표준: upload.csv가 "배열"일 때 각 item.path
     */
    const csvPaths: string[] = [];

    const csvAny = (upload as any).csv;

    // (1) 표준: 배열
    if (Array.isArray(csvAny)) {
      for (const it of csvAny) {
        const p = it?.path ? String(it.path) : "";
        if (p) csvPaths.push(p);
      }
    } else {
      // (2) 레거시: 객체
      const csvObj = safeObj(csvAny);
      const p = (csvObj as any)?.path ? String((csvObj as any).path) : "";
      if (p) csvPaths.push(p);
    }

    // images
    const images = Array.isArray((upload as any).images) ? (upload as any).images : [];
    const imagePaths = images
      .map((it: any) => (it?.path ? String(it.path) : ""))
      .filter(Boolean);

    const allowed = csvPaths.includes(path) || imagePaths.includes(path);
    if (!allowed) return jsonError(403, "Path not allowed");

    // ✅ signed url 생성
    const { data, error: sErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10);

    if (sErr) return jsonError(500, sErr.message);

    return NextResponse.json({ ok: true, url: data?.signedUrl });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
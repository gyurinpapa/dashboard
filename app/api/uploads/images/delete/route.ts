// app/api/uploads/images/delete/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function ensureUpload(meta: any) {
  const m = meta && typeof meta === "object" ? meta : {};
  if (!m.upload || typeof m.upload !== "object") m.upload = {};
  if (!Array.isArray(m.upload.images)) m.upload.images = [];
  return m;
}

function isAllowedRole(role?: string | null) {
  return role === "admin" || role === "director" || role === "master";
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Not authenticated");

    // ✅ 토큰으로 유저 검증
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userRes.user?.id) return jsonError(401, "Not authenticated");
    const userId = userRes.user.id;

    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const reportId = String(body.reportId || "");
    const bucket = String(body.bucket || "report_uploads");
    const path = String(body.path || "");

    if (!reportId) return jsonError(400, "Missing reportId");
    if (!path) return jsonError(400, "Missing path");

    // 1) report 확인
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, meta")
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // 2) role 확인
    const { data: wm, error: wErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return jsonError(500, wErr.message);
    if (!isAllowedRole(wm?.role)) return jsonError(403, "No permission to delete images");

    // 3) meta에서 해당 이미지 제거 (존재 확인)
    const meta = ensureUpload(report.meta);
    const before = Array.isArray(meta.upload.images) ? meta.upload.images : [];
    const next = before.filter((it: any) => String(it?.path || "") !== path);

    if (next.length === before.length) {
      // meta에 없으면 굳이 storage 삭제를 강제하지 않음(안전)
      return jsonError(404, "Image not found in report meta");
    }

    meta.upload.images = next;

    // 4) storage 삭제 (실패해도 meta 업데이트는 진행하도록 “소프트” 처리)
    const { error: sErr } = await supabaseAdmin.storage.from(bucket).remove([path]);
    // sErr가 있어도 계속 진행(이미 삭제된 파일일 수 있음)

    // 5) report meta 저장
    const { error: upErr } = await supabaseAdmin
      .from("reports")
      .update({ meta, updated_at: new Date().toISOString() })
      .eq("id", reportId);

    if (upErr) return jsonError(500, upErr.message);

    return NextResponse.json({
      ok: true,
      removed: { bucket, path },
      storageRemoved: !sErr,
      storageError: sErr?.message || null,
      imagesCount: meta.upload.images.length,
    });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
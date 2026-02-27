// app/api/uploads/images/delete-many/route.ts
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

    const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userRes.user?.id) return jsonError(401, "Not authenticated");
    const userId = userRes.user.id;

    const body = await req.json().catch(() => null);
    if (!body) return jsonError(400, "Invalid JSON");

    const reportId = String(body.reportId || "");
    const bucket = String(body.bucket || "report_uploads");
    const pathsRaw = body.paths;

    if (!reportId) return jsonError(400, "Missing reportId");
    if (!Array.isArray(pathsRaw)) return jsonError(400, "Missing paths");

    const paths = Array.from(
      new Set(
        pathsRaw
          .map((x: any) => String(x || "").trim())
          .filter((x: string) => !!x)
      )
    );

    if (!paths.length) return jsonError(400, "Empty paths");

    // 1) report 조회
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

    // 3) meta에서 제거 대상 필터링
    const meta = ensureUpload(report.meta);
    const before: any[] = Array.isArray(meta.upload.images) ? meta.upload.images : [];

    const removeSet = new Set(paths);
    const kept = before.filter((it: any) => !removeSet.has(String(it?.path || "")));
    const removedMetaCount = before.length - kept.length;

    if (removedMetaCount <= 0) {
      return jsonError(404, "No matching images in report meta");
    }

    meta.upload.images = kept;

    // 4) Storage 삭제 (여러개)
    const { error: sErr } = await supabaseAdmin.storage.from(bucket).remove(paths);

    // 5) meta 저장
    const { error: upErr } = await supabaseAdmin
      .from("reports")
      .update({ meta, updated_at: new Date().toISOString() })
      .eq("id", reportId);

    if (upErr) return jsonError(500, upErr.message);

    return NextResponse.json({
      ok: true,
      requested: { bucket, count: paths.length },
      removedFromMeta: removedMetaCount,
      storageRemoved: !sErr,
      storageError: sErr?.message || null,
      imagesCount: meta.upload.images.length,
    });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
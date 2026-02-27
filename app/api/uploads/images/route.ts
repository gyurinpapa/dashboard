// app/api/uploads/images/route.ts
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

function safeJson(v: any) {
  return v && typeof v === "object" ? v : {};
}

function okImageMime(type: string) {
  return (
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/webp"
  );
}

function safeName(name: string) {
  // 파일명에 위험 문자 제거 (경로 인젝션 방지)
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120) || "image";
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // ✅ 1) 인증: Bearer token → getUser
    const token = getBearerToken(req);
    if (!token) return jsonError(401, "Not authenticated");

    const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token);
    if (uErr || !userRes.user?.id) return jsonError(401, "Not authenticated");
    const userId = userRes.user.id;

    // ✅ 2) formData 파싱
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError(400, "Invalid multipart form");

    const reportId = String(form.get("report_id") || "").trim();
    if (!reportId) return jsonError(400, "Missing report_id");

    const files = form.getAll("files").filter(Boolean) as File[];
    if (!files.length) return jsonError(400, "Missing files");

    // ✅ 3) report 조회 (workspace / meta 필요)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, status, meta")
      .eq("id", reportId)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "Report not found");

    // ✅ 4) 권한 체크 (admin/director/master)
    const { data: wm, error: wErr } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return jsonError(500, wErr.message);

    const role = wm?.role;
    const canUpload = role === "admin" || role === "director" || role === "master";
    if (!canUpload) return jsonError(403, "No permission to upload images");

    // ✅ 5) Storage 업로드
    const bucket = "report_uploads";

    const uploadedItems: Array<{
      bucket: string;
      path: string;
      name: string;
      size: number;
      uploaded_at: string;
      mime?: string;
    }> = [];

    for (const f of files) {
      if (!(f instanceof File)) continue;

      const mime = f.type || "";
      if (!okImageMime(mime)) {
        return jsonError(400, `Invalid image type: ${mime || "unknown"}`);
      }

      const filename = safeName(f.name || "image");
      const ext = filename.includes(".") ? filename.split(".").pop() : "";
      const rand = Math.random().toString(36).slice(2, 10);
      const ts = Date.now();
      const path = `reports/${reportId}/images/${ts}_${rand}${ext ? "." + ext : ""}`;

      const arrayBuffer = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const { error: upErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(path, bytes, {
          contentType: mime || "application/octet-stream",
          upsert: false,
        });

      if (upErr) return jsonError(500, upErr.message);

      uploadedItems.push({
        bucket,
        path,
        name: filename,
        size: f.size || bytes.byteLength || 0,
        uploaded_at: nowIso(),
        mime,
      });
    }

    // ✅ 6) reports.meta.upload.images[] 누적 저장 (merge)
    const prevMeta = safeJson(report.meta);
    const prevUpload = safeJson(prevMeta.upload);
    const prevImages = Array.isArray(prevUpload.images) ? prevUpload.images : [];

    const nextMeta = {
      ...prevMeta,
      upload: {
        ...prevUpload,
        images: [...prevImages, ...uploadedItems],
      },
    };

    const { error: mErr } = await supabaseAdmin
      .from("reports")
      .update({ meta: nextMeta, updated_at: nowIso() })
      .eq("id", reportId);

    if (mErr) return jsonError(500, mErr.message);

    return NextResponse.json({ ok: true, uploaded: uploadedItems, count: uploadedItems.length });
  } catch (e: any) {
    return jsonError(500, e?.message ?? "Server error");
  }
}
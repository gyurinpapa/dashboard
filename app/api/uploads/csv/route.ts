// app/api/uploads/csv/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "report_uploads";
const MAX_BYTES = 20 * 1024 * 1024;

type CsvItem = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  path: string;
  created_at: string;
};

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureUploadShape(meta: any) {
  const safe = meta && typeof meta === "object" ? meta : {};
  const upload = safe.upload && typeof safe.upload === "object" ? safe.upload : {};
  const csv = Array.isArray(upload.csv) ? upload.csv : [];
  const images = Array.isArray(upload.images) ? upload.images : [];
  return {
    ...safe,
    upload: {
      ...upload,
      csv,
      images,
    },
  };
}

/**
 * ✅ Bearer 우선 + 쿠키 fallback
 * - 프론트가 Authorization: Bearer 를 보내면 그걸로 인증
 * - 없으면 sbAuth()로 쿠키 세션을 읽어 인증
 */
async function getUserId(req: Request, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data?.user?.id) {
      return { ok: false as const, status: 401, message: "Unauthorized (bad bearer)" };
    }
    return { ok: true as const, userId: data.user.id };
  }

  const auth = await sbAuth();
  if (!auth?.user?.id) {
    return { ok: false as const, status: 401, message: "Unauthorized (no session)" };
  }
  return { ok: true as const, userId: auth.user.id };
}

async function assertCanAccessReport(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  reportId: string;
  userId: string;
}) {
  const { supabaseAdmin, reportId, userId } = params;

  const { data: report, error: repErr } = await supabaseAdmin
    .from("reports")
    .select("id, workspace_id, created_by, meta")
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) throw new Error(`reports read error: ${repErr.message}`);
  if (!report) return { ok: false as const, status: 404, message: "Report not found" };

  if (report.created_by === userId) return { ok: true as const, report };

  const { data: wm, error: wmErr } = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", report.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (wmErr) throw new Error(`workspace_members read error: ${wmErr.message}`);
  if (!wm) return { ok: false as const, status: 403, message: "Forbidden" };

  return { ok: true as const, report };
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  // ✅ 인증
  const uid = await getUserId(req, supabaseAdmin);
  if (!uid.ok) return jsonError(uid.status, uid.message);
  const userId = uid.userId;

  // ✅ form-data
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return jsonError(400, "Invalid form-data");
  }

  const reportId = asString(fd.get("reportId"));
  const file = fd.get("file");

  if (!reportId) return jsonError(400, "Missing reportId");
  if (!file || !(file instanceof File)) return jsonError(400, "Missing file");
  if (!file.name) return jsonError(400, "File name is required");

  const contentType = file.type || "text/csv";
  const size = file.size ?? 0;

  if (size <= 0) return jsonError(400, "Empty file");
  if (size > MAX_BYTES) return jsonError(413, `File too large (max ${MAX_BYTES} bytes)`);

  const lower = file.name.toLowerCase();
  const isCsv = lower.endsWith(".csv") || contentType.includes("csv") || contentType === "text/plain";
  if (!isCsv) {
    return jsonError(415, "Only CSV files are allowed", {
      got: { name: file.name, type: contentType },
    });
  }

  // ✅ 권한 체크 + meta 읽기
  let report: any;
  try {
    const access = await assertCanAccessReport({ supabaseAdmin, reportId, userId });
    if (!access.ok) return jsonError(access.status, access.message);
    report = access.report;
  } catch (e: any) {
    return jsonError(500, "Access check failed", { detail: e?.message });
  }

  // ✅ storage upload
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-()\s]/g, "_");
  const path = `reports/${reportId}/csv/${id}-${safeName}`;

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return jsonError(400, "Failed to read file bytes");
  }

  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
    cacheControl: "3600",
  });

  if (upErr) {
    return jsonError(500, "Storage upload failed", { detail: upErr.message, bucket: BUCKET, path });
  }

  // ✅ meta 업데이트
  const meta0 = ensureUploadShape(report.meta);
  const item: CsvItem = {
    id,
    name: file.name,
    size,
    contentType,
    path,
    created_at: nowIso(),
  };

  const nextMeta = {
    ...meta0,
    upload: {
      ...meta0.upload,
      csv: [item, ...(meta0.upload.csv ?? [])],
    },
  };

  const { error: updErr } = await supabaseAdmin
    .from("reports")
    .update({ meta: nextMeta, updated_at: nowIso() })
    .eq("id", reportId);

  if (updErr) {
    // 롤백: storage 삭제
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
    return jsonError(500, "Failed to update report meta (rolled back storage)", {
      detail: updErr.message,
    });
  }

  return NextResponse.json({ ok: true, item, csv: nextMeta.upload.csv });
}
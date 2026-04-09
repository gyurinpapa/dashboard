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
  bucket?: string;
};

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function asNonEmpty(v: any) {
  const s = asString(v);
  return s ? s : null;
}

function nowIso() {
  return new Date().toISOString();
}

function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

// Bearer 우선, 없으면 쿠키(session) fallback
async function getUserId(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data?.user?.id) {
      return {
        ok: false as const,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }
    return { ok: true as const, userId: data.user.id };
  }

  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;

  if (authErr || !user?.id) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized (no session)",
    };
  }

  return { ok: true as const, userId: user.id };
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
  if (!report) {
    return { ok: false as const, status: 404, message: "Report not found" };
  }

  if ((report as any).created_by && (report as any).created_by === userId) {
    return { ok: true as const, report };
  }

  const { data: wm, error: wmErr } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", (report as any).workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (wmErr) throw new Error(`workspace_members read error: ${wmErr.message}`);

  const role = (wm as any)?.role ?? null;
  const canWrite =
    role === "admin" || role === "director" || role === "master";

  if (!canWrite) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }

  return { ok: true as const, report };
}

function cleanFileName(name: string) {
  let base = name.split("/").pop() || name;
  base = base.replace(/[\\]/g, "_");
  base = base.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  try {
    base = base.normalize("NFC");
  } catch {}

  return base || "upload.csv";
}

function isCsvItemLike(v: any): v is CsvItem {
  return !!v && typeof v === "object";
}

function normalizeCsvItem(input: any): CsvItem | null {
  if (!isCsvItemLike(input)) return null;

  const id = asString(input.id) || String(Date.now());
  const name = cleanFileName(asString(input.name) || "upload.csv");
  const sizeRaw = Number(input.size);
  const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : 0;
  const contentType = asString(input.contentType) || "text/csv";
  const path = asString(input.path);
  const created_at = asString(input.created_at) || nowIso();
  const bucket = asString(input.bucket) || BUCKET;

  if (!path) return null;

  return {
    id,
    name,
    size,
    contentType,
    path,
    created_at,
    bucket,
  };
}

function toCsvList(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
}

function buildNextMetaWithCsvItem(reportMeta: any, item: CsvItem) {
  const meta = safeObj(reportMeta);
  const upload = safeObj((meta as any).upload);

  // 기존 구조 지원
  const uploadCsvAny = (upload as any).csv;
  const uploadCsvList = toCsvList(uploadCsvAny);

  // ingestion가 기대하는 구조 지원
  const csvUploadsAny = (meta as any).csv_uploads;
  const csvUploadsList = toCsvList(csvUploadsAny);

  const merged = [...csvUploadsList, ...uploadCsvList].filter(Boolean);

  const deduped = merged.filter((x, idx, arr) => {
    const path = asString(x?.path);
    if (!path) return false;
    return arr.findIndex((y) => asString(y?.path) === path) === idx;
  });

  const dedupedWithoutCurrent = deduped.filter(
    (x) => asString(x?.path) !== item.path
  );

  const nextCsv = [item, ...dedupedWithoutCurrent].slice(0, 20);

  return {
    ...meta,

    // ingestion/run/route.ts 가 읽는 현재 실사용 구조
    csv_uploads: nextCsv,

    // 기존 UI/레거시 호환 유지
    upload: {
      ...upload,
      csv: nextCsv,
    },
  };
}

async function handleFinalizeMode(params: {
  req: Request;
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  userId: string;
}) {
  const { req, supabaseAdmin, userId } = params;

  const body = await req.json().catch(() => null);
  const mode = asString(body?.mode);

  if (mode !== "finalize") {
    return null;
  }

  const reportId = asNonEmpty(body?.reportId);
  const item = normalizeCsvItem(body?.item);

  if (!reportId) {
    return jsonError(400, "Missing reportId");
  }

  if (!item) {
    return jsonError(400, "Invalid finalize item");
  }

  let report: any;
  try {
    const access = await assertCanAccessReport({
      supabaseAdmin,
      reportId,
      userId,
    });

    if (!access.ok) return jsonError(access.status, access.message);
    report = access.report;
  } catch (e: any) {
    return jsonError(500, "Access check failed", { detail: e?.message });
  }

  const nextMeta = buildNextMetaWithCsvItem(report?.meta, item);

  const { error: updErr } = await supabaseAdmin
    .from("reports")
    .update({ meta: nextMeta, updated_at: nowIso() })
    .eq("id", reportId);

  if (updErr) {
    return jsonError(500, "Failed to update report meta", {
      detail: updErr.message,
      path: item.path,
      mode: "finalize",
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "finalize",
    item,
    meta_csv_uploads_count: Array.isArray(nextMeta?.csv_uploads)
      ? nextMeta.csv_uploads.length
      : 0,
  });
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  const uid = await getUserId(req);
  if (!uid.ok) return jsonError(uid.status, uid.message);

  // 1) 새 구조: finalize 전용 JSON 요청
  const contentType = asString(req.headers.get("content-type")).toLowerCase();
  if (contentType.includes("application/json")) {
    const finalizeRes = await handleFinalizeMode({
      req,
      supabaseAdmin,
      userId: uid.userId,
    });
    if (finalizeRes) return finalizeRes;

    return jsonError(400, "Unsupported JSON request");
  }

  // 2) 기존 구조: multipart/form-data 업로드도 계속 지원
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return jsonError(400, "Invalid form data");
  }

  const reportId = asNonEmpty(fd.get("reportId"));
  const file = fd.get("file");

  if (!reportId) return jsonError(400, "Missing reportId");
  if (!(file instanceof File)) return jsonError(400, "Missing file");

  if (file.size > MAX_BYTES) {
    return jsonError(413, "File too large", { maxBytes: MAX_BYTES });
  }

  let report: any;
  try {
    const access = await assertCanAccessReport({
      supabaseAdmin,
      reportId,
      userId: uid.userId,
    });
    if (!access.ok) return jsonError(access.status, access.message);
    report = access.report;
  } catch (e: any) {
    return jsonError(500, "Access check failed", { detail: e?.message });
  }

  const fileName = cleanFileName(file.name || "upload.csv");
  const ts = Date.now();
  const path = `workspaces/${report.workspace_id}/reports/${reportId}/csv/${ts}_${fileName}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "text/csv",
    });

  if (upErr) {
    return jsonError(500, "CSV upload failed", {
      detail: upErr.message,
      path,
      mode: "multipart",
    });
  }

  const item: CsvItem = {
    id: `${ts}`,
    name: fileName,
    size: file.size,
    contentType: file.type || "text/csv",
    path,
    created_at: nowIso(),
    bucket: BUCKET,
  };

  const nextMeta = buildNextMetaWithCsvItem(report?.meta, item);

  const { error: updErr } = await supabaseAdmin
    .from("reports")
    .update({ meta: nextMeta, updated_at: nowIso() })
    .eq("id", reportId);

  if (updErr) {
    return jsonError(500, "Failed to update report meta", {
      detail: updErr.message,
      path,
      mode: "multipart",
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "multipart",
    item,
    meta_csv_uploads_count: Array.isArray(nextMeta?.csv_uploads)
      ? nextMeta.csv_uploads.length
      : 0,
  });
}
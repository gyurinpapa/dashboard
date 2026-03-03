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
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

// ✅ Bearer 우선, 없으면 쿠키(session) fallback
async function getUserId(req: Request, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const bearer = getBearerToken(req);

  // 1) Bearer 토큰이 있으면 admin으로 검증
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data?.user?.id) {
      return { ok: false as const, status: 401, message: "Unauthorized (invalid bearer token)" };
    }
    return { ok: true as const, userId: data.user.id };
  }

  // 2) 없으면 쿠키 기반 서버 세션으로 user 확인 (✅ sbAuth 결과객체 방식)
  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;

  if (authErr || !user?.id) {
    return { ok: false as const, status: 401, message: "Unauthorized (no session)" };
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
  if (!report) return { ok: false as const, status: 404, message: "Report not found" };

  if (report.created_by === userId) return { ok: true as const, report };

  const { data: wm, error: wmErr } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", report.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (wmErr) throw new Error(`workspace_members read error: ${wmErr.message}`);

  const role = wm?.role;
  const canWrite = role === "admin" || role === "director" || role === "master";
  if (!canWrite) return { ok: false as const, status: 403, message: "Forbidden" };

  return { ok: true as const, report };
}

function cleanFileName(name: string) {
  // path traversal 방지 + 너무 공격적인 치환은 하지 않음
  const base = name.split("/").pop() || name;
  return base.replace(/[\\]/g, "_");
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  // auth
  const uid = await getUserId(req, supabaseAdmin);
  if (!uid.ok) return jsonError(uid.status, uid.message);

  // formdata
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

  if (file.size > MAX_BYTES) return jsonError(413, "File too large", { maxBytes: MAX_BYTES });

  // access + read meta
  let report: any;
  try {
    const access = await assertCanAccessReport({ supabaseAdmin, reportId, userId: uid.userId });
    if (!access.ok) return jsonError(access.status, access.message);
    report = access.report;
  } catch (e: any) {
    return jsonError(500, "Access check failed", { detail: e?.message });
  }

  const fileName = cleanFileName(file.name || "upload.csv");
  const ts = Date.now();
  const path = `workspaces/${report.workspace_id}/reports/${reportId}/csv/${ts}_${fileName}`;

  // upload to storage
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "text/csv",
  });

  if (upErr) return jsonError(500, "CSV upload failed", { detail: upErr.message, path });

  const item: CsvItem = {
    id: `${ts}`,
    name: fileName,
    size: file.size,
    contentType: file.type || "text/csv",
    path,
    created_at: nowIso(),
  };

  // ✅ meta.upload.csv 배열/객체 모두 지원 → 표준: 배열 유지
  const meta = safeObj(report.meta);
  const upload = safeObj((meta as any).upload);

  const csvAny = (upload as any).csv;
  const csvList: any[] = Array.isArray(csvAny) ? csvAny : csvAny ? [csvAny] : [];

  const nextCsv = [item, ...csvList].slice(0, 20); // 최근 20개만 유지(안전)

  const nextMeta = {
    ...meta,
    upload: {
      ...upload,
      csv: nextCsv,
    },
  };

  const { error: updErr } = await supabaseAdmin
    .from("reports")
    .update({ meta: nextMeta, updated_at: nowIso() })
    .eq("id", reportId);

  if (updErr) {
    return jsonError(500, "Failed to update report meta", { detail: updErr.message, path });
  }

  return NextResponse.json({ ok: true, item });
}
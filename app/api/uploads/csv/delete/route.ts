// app/api/uploads/csv/delete/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
}

function nowIso() {
  return new Date().toISOString();
}

// Bearer 우선, 없으면 쿠키 fallback
async function getUserId(req: Request, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data?.user?.id) {
      return { ok: false as const, status: 401, message: "Unauthorized (invalid bearer token)" };
    }
    return { ok: true as const, userId: data.user.id };
  }

  const auth = await sbAuth();
  if (!auth?.user?.id) return { ok: false as const, status: 401, message: "Unauthorized (no session)" };
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

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  // auth
  const uid = await getUserId(req, supabaseAdmin);
  if (!uid.ok) return jsonError(uid.status, uid.message);

  // body
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const reportId = asString(body?.reportId);
  const bucket = asString(body?.bucket) || "report_uploads";
  const path = asString(body?.path);

  if (!reportId) return jsonError(400, "Missing reportId");
  if (!path) return jsonError(400, "Missing path");

  // access + read meta
  let report: any;
  try {
    const access = await assertCanAccessReport({ supabaseAdmin, reportId, userId: uid.userId });
    if (!access.ok) return jsonError(access.status, access.message);
    report = access.report;
  } catch (e: any) {
    return jsonError(500, "Access check failed", { detail: e?.message });
  }

  // ✅ meta.upload.csv 배열/객체 모두 지원
  const meta = safeObj(report.meta);
  const upload = safeObj(meta.upload);

  const csvAny = (upload as any).csv;

  const csvList: any[] = Array.isArray(csvAny) ? csvAny : csvAny ? [csvAny] : [];

  // path가 meta.upload.csv 안에 없으면 차단
  const exists = csvList.some((it) => String(it?.path || "") === path);
  if (!exists) return jsonError(403, "Path not allowed");

  // 1) storage remove
  const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove([path]);
  if (rmErr) return jsonError(500, "Storage remove failed", { detail: rmErr.message, bucket, path });

  // 2) meta에서 제거
  const nextCsv = csvList.filter((it) => String(it?.path || "") !== path);

  const nextMeta = {
    ...meta,
    upload: {
      ...upload,
      csv: nextCsv, // ✅ 표준: 배열 유지
    },
  };

  const { error: updErr } = await supabaseAdmin
    .from("reports")
    .update({ meta: nextMeta, updated_at: nowIso() })
    .eq("id", reportId);

  if (updErr) {
    // 여기서 롤백은 어려움(이미 스토리지 삭제됨). 대신 명확히 에러 리턴.
    return jsonError(500, "Failed to update report meta", { detail: updErr.message });
  }

  return NextResponse.json({ ok: true, removed: { bucket, path }, csv: nextCsv });
}
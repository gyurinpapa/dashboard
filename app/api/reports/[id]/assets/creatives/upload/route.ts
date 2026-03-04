// app/api/reports/[id]/assets/creatives/upload/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = "report_uploads";
const MAX_BYTES = 20 * 1024 * 1024; // 20MB per file

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function randId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * ✅ "원본 파일명"을 최대한 보존하는 정규화
 * - 경로 제거 (C:\ / url path)
 * - NBSP -> space
 * - 공백 정리
 * - NFC 정규화 (macOS NFD 이슈 방지)
 */
function normalizeOriginalFileName(name: string) {
  let n = String(name ?? "").trim();
  if (!n) return "creative";

  n = n.replace(/\\/g, "/");
  n = n.split("?")[0].split("#")[0];
  n = n.split("/").pop() || n;

  n = n.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  try {
    n = n.normalize("NFC");
  } catch {}

  return n || "creative";
}

/**
 * ✅ storage 파일명은 "랜덤 + ext"로 안전하게
 */
function pickExt(originalName: string) {
  const base = String(originalName ?? "").trim();
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  const ext = base.slice(i + 1).trim();
  if (!ext || ext.length > 10) return "";
  return ext;
}

async function removeFolderFiles(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  folder: string
) {
  let removed = 0;

  for (let i = 0; i < 30; i++) {
    const { data: list, error: lErr } = await supabase.storage.from(bucket).list(folder, {
      limit: 100,
      offset: i * 100,
      sortBy: { column: "name", order: "asc" },
    });

    if (lErr) break;

    const items = (list ?? []).filter((x) => x?.name);
    if (!items.length) break;

    const paths = items.map((x) => `${folder}/${x.name}`);
    const { error: rErr } = await supabase.storage.from(bucket).remove(paths);

    if (!rErr) removed += paths.length;
    if (items.length < 100) break;
  }

  return { removed };
}

/**
 * ✅ Bearer 우선 + 쿠키(session) fallback
 * - 프론트에서 Authorization: Bearer ... 를 보내면 이걸 먼저 검증
 * - 없으면 sbAuth() 쿠키 세션으로 user 확인
 */
async function getUserId(req: Request) {
  const admin = getSupabaseAdmin();

  const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  // 1) Bearer
  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    const userId = data?.user?.id ?? null;

    if (error || !userId) {
      return { ok: false as const, status: 401, message: "Unauthorized (invalid bearer token)" };
    }
    return { ok: true as const, userId };
  }

  // 2) Cookie session (sbAuth는 프로젝트마다 반환 형태가 달라서 any로 안전 처리)
  const auth = await sbAuth();
  const user = (auth as any)?.user ?? null;
  const authErr = (auth as any)?.error ?? null;

  if (authErr || !user?.id) {
    return { ok: false as const, status: 401, message: "Unauthorized (no session)" };
  }

  return { ok: true as const, userId: user.id as string };
}

export async function POST(req: Request, ctx: Ctx) {
  const t0 = Date.now();

  try {
    // 1) Auth
    const auth = await getUserId(req);
    if (!auth.ok) return jsonError(auth.status, "UNAUTHORIZED", { detail: auth.message });
    const userId = auth.userId;

    // 2) reportId
    const { id } = await ctx.params;
    const reportId = asString(id);
    if (!reportId) return jsonError(400, "MISSING_REPORT_ID");

    const supabase = getSupabaseAdmin();

    // 3) report 조회 (created_by 포함: 멤버십 없어도 생성자는 허용)
    const { data: report, error: repErr } = await supabase
      .from("reports")
      .select("id, workspace_id, advertiser_id, created_by")
      .eq("id", reportId)
      .maybeSingle();

    if (repErr) return jsonError(500, "REPORT_SELECT_FAILED", { detail: repErr.message });
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    const workspaceId = asString((report as any).workspace_id);
    const advertiserIdRaw = (report as any).advertiser_id;
    const advertiserId = advertiserIdRaw ? asString(advertiserIdRaw) : null;

    if (!workspaceId) return jsonError(500, "REPORT_WORKSPACE_ID_MISSING");

    // 4) 권한 체크: 생성자 or workspace_members
    const createdBy = asString((report as any).created_by);
    if (createdBy !== userId) {
      const { data: wm, error: wmErr } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();

      if (wmErr) return jsonError(500, "WORKSPACE_MEMBER_CHECK_FAILED", { detail: wmErr.message });
      if (!wm) return jsonError(403, "FORBIDDEN");
    }

    // 5) form-data (파싱 실패를 명확하게)
    let form: FormData;
    try {
      form = await req.formData();
    } catch (e: any) {
      const ct = req.headers.get("content-type") || "";
      return jsonError(400, "FORMDATA_PARSE_FAILED", {
        detail: String(e?.message ?? e),
        contentType: ct,
        hint: "fetch + FormData 전송 시 Content-Type을 직접 설정하면 안 됩니다. (브라우저가 boundary를 설정해야 함)",
      });
    }

    // ✅ files는 여기서 딱 1번만 선언
    const files = form.getAll("files");
    if (!files?.length) return jsonError(400, "NO_FILES");

    // 옵션: storage까지 지울지 (기본 true)
    const deleteStorage = asString(form.get("deleteStorage") as any);
    const shouldDeleteStorage = deleteStorage
      ? deleteStorage === "1" || deleteStorage.toLowerCase() === "true"
      : true;

    // ✅ (핵심) batch_id 재사용: 클라가 보내면 이어붙이고, 없으면 "첫 배치"로 새로 생성
    const batchFromClient = asString(form.get("batch_id") as any);
    const isFirstBatch = !batchFromClient;
    const batchId = batchFromClient || randomUUID();

    // 6) REPLACE: 첫 배치에서만 DB 먼저 삭제
    if (isFirstBatch) {
      const { error: delErr } = await supabase.from("report_creatives").delete().eq("report_id", reportId);
      if (delErr) return jsonError(500, "DB_DELETE_FAILED", { detail: delErr.message });
    }

    // 7) REPLACE: 첫 배치에서만 Storage 폴더 삭제(옵션)
    const folder = `reports/${reportId}/creatives`;
    let storageRemoved = 0;

    if (isFirstBatch && shouldDeleteStorage) {
      const { removed } = await removeFolderFiles(supabase, BUCKET, folder);
      storageRemoved = removed;
    }

    // 8) 업로드 + insert
    const inserted: any[] = [];
    const uploaded: any[] = [];
    const itemsResult: any[] = [];

    for (const item of files) {
      if (!(item instanceof File)) continue;

      if (item.size > MAX_BYTES) {
        return jsonError(400, "FILE_TOO_LARGE", {
          name: (item as any).name,
          size: item.size,
          max: MAX_BYTES,
        });
      }

      const originalName = normalizeOriginalFileName(item.name || "creative");
      const ext = pickExt(originalName);
      const storedFileName = ext ? `${randId()}.${ext}` : randId();

      const creativeKey = originalName; // ✅ 매칭 키는 원본 파일명
      const storagePath = `${folder}/${storedFileName}`;

      const arrayBuffer = await item.arrayBuffer();
      const contentType = item.type || "application/octet-stream";

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, arrayBuffer, {
        contentType,
        upsert: true,
        cacheControl: "3600",
      });

      if (upErr) {
        return jsonError(500, "STORAGE_UPLOAD_FAILED", {
          detail: upErr.message,
          name: originalName,
          path: storagePath,
        });
      }

      uploaded.push({
        name: originalName,
        size: item.size,
        contentType,
        bucket: BUCKET,
        path: storagePath,
      });

      inserted.push({
        report_id: reportId,
        workspace_id: workspaceId,
        advertiser_id: advertiserId,
        batch_id: batchId,

        creative_key: creativeKey,
        file_name: originalName,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        mime_type: contentType,
        bytes: item.size,
        uploaded_by: userId,
      });

      itemsResult.push({
        ok: true,
        file: originalName,
        creative_key: creativeKey,
        storage_path: storagePath,
      });
    }

    if (!inserted.length) return jsonError(400, "NO_VALID_FILES");

    const { data: insData, error: insErr } = await supabase
      .from("report_creatives")
      .insert(inserted)
      .select(
        "report_id, workspace_id, advertiser_id, batch_id, creative_key, file_name, storage_bucket, storage_path, mime_type, bytes, created_at"
      );

    if (insErr) return jsonError(500, "DB_INSERT_FAILED", { detail: insErr.message });

    // 9) reports.current_creatives_batch_id 갱신 (배치 업로드 중에도 동일 batchId 유지)
    const { error: upRepErr } = await supabase
      .from("reports")
      .update({ current_creatives_batch_id: batchId, updated_at: nowIso() })
      .eq("id", reportId);

    if (upRepErr) return jsonError(500, "REPORT_UPDATE_FAILED", { detail: upRepErr.message });

    return NextResponse.json({
      ok: true,
      mode: isFirstBatch ? "replace" : "append",
      report_id: reportId,
      workspace_id: workspaceId,
      advertiser_id: advertiserId,
      batch_id: batchId,

      // 첫 배치에서만 의미가 있는 값들
      deleteStorage: isFirstBatch ? shouldDeleteStorage : false,
      storage_folder: folder,
      storage_removed_count: storageRemoved,

      uploaded_count: uploaded.length,
      inserted_count: insData?.length ?? 0,
      items: itemsResult,
      uploaded,
      rows: insData ?? [],
      ms: Date.now() - t0,
    });
  } catch (e: any) {
    return jsonError(500, "SERVER_ERROR", { detail: String(e?.message ?? e) });
  }
}
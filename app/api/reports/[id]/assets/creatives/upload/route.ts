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
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
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

  // path strip (windows / url)
  n = n.replace(/\\/g, "/");
  n = n.split("?")[0].split("#")[0];
  n = n.split("/").pop() || n;

  // NBSP -> space, collapse spaces
  n = n.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  try {
    n = n.normalize("NFC");
  } catch {}

  return n || "creative";
}

/**
 * ✅ storage 파일명은 "랜덤 + ext"로 안전하게
 * (한글/특수문자 전혀 필요 없음)
 */
function pickExt(originalName: string) {
  const base = String(originalName ?? "").trim();
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  const ext = base.slice(i + 1).trim();
  // ext는 너무 길거나 이상하면 버림
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

export async function POST(req: Request, ctx: Ctx) {
  const t0 = Date.now();

  try {
    // 1) Auth
    const { user, error: authErr } = await sbAuth();
    if (authErr || !user) return jsonError(401, "UNAUTHORIZED");

    // 2) reportId
    const { id } = await ctx.params;
    const reportId = asString(id);
    if (!reportId) return jsonError(400, "MISSING_REPORT_ID");

    const supabase = getSupabaseAdmin();

    // 3) report에서 workspace_id / advertiser_id 가져오기
    const { data: report, error: repErr } = await supabase
      .from("reports")
      .select("id, workspace_id, advertiser_id")
      .eq("id", reportId)
      .maybeSingle();

    if (repErr) return jsonError(500, "REPORT_SELECT_FAILED", { detail: repErr.message });
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    const workspaceId = asString((report as any).workspace_id);
    const advertiserIdRaw = (report as any).advertiser_id;
    const advertiserId = advertiserIdRaw ? asString(advertiserIdRaw) : null;

    if (!workspaceId) return jsonError(500, "REPORT_WORKSPACE_ID_MISSING");

    // 4) form-data
    const form = await req.formData();
    const files = form.getAll("files");
    if (!files?.length) return jsonError(400, "NO_FILES");

    // 옵션: storage까지 지울지 (기본 true)
    const deleteStorage = asString(form.get("deleteStorage") as any);
    const shouldDeleteStorage = deleteStorage
      ? deleteStorage === "1" || deleteStorage.toLowerCase() === "true"
      : true;

    // ✅ 이번 업로드 배치 id 발급 (A에서 만든 세션 분리용)
    const batchId = randomUUID();

    // 5) REPLACE: DB 먼저 삭제 (report_id 기준)
    const { error: delErr } = await supabase
      .from("report_creatives")
      .delete()
      .eq("report_id", reportId);

    if (delErr) return jsonError(500, "DB_DELETE_FAILED", { detail: delErr.message });

    // 6) REPLACE: Storage 폴더 삭제(옵션)
    const folder = `reports/${reportId}/creatives`;
    let storageRemoved = 0;

    if (shouldDeleteStorage) {
      const { removed } = await removeFolderFiles(supabase, BUCKET, folder);
      storageRemoved = removed;
    }

    // 7) 새 업로드 + 새 insert
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

      // ✅ 핵심: DB에 저장할 "원본 파일명"은 한글 포함 그대로 보존
      const originalName = normalizeOriginalFileName(item.name || "creative");

      const ext = pickExt(originalName);
      const fileId = randId();
      const storedFileName = ext ? `${fileId}.${ext}` : fileId;

      // ✅ 핵심: 매칭 키 = "원본 파일명"
      const creativeKey = originalName;

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

        // ✅ A 세션 분리
        batch_id: batchId,

        creative_key: creativeKey,
        file_name: originalName,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        mime_type: contentType,
        bytes: item.size,
        uploaded_by: user.id,
      });

      itemsResult.push({
        ok: true,
        file: originalName,
        creative_key: creativeKey,
        storage_path: storagePath,
      });
    }

    const { data: insData, error: insErr } = await supabase
      .from("report_creatives")
      .insert(inserted)
      .select(
        "report_id, workspace_id, advertiser_id, batch_id, creative_key, file_name, storage_bucket, storage_path, mime_type, bytes, created_at"
      );

    if (insErr) return jsonError(500, "DB_INSERT_FAILED", { detail: insErr.message });

    // ✅ reports.current_creatives_batch_id 갱신
    const { error: upRepErr } = await supabase
      .from("reports")
      .update({ current_creatives_batch_id: batchId, updated_at: nowIso() })
      .eq("id", reportId);

    if (upRepErr) return jsonError(500, "REPORT_UPDATE_FAILED", { detail: upRepErr.message });

    return NextResponse.json({
      ok: true,
      mode: "replace",
      report_id: reportId,
      workspace_id: workspaceId,
      advertiser_id: advertiserId,
      batch_id: batchId,
      deleteStorage: shouldDeleteStorage,
      storage_folder: folder,
      storage_removed_count: storageRemoved,
      uploaded_count: uploaded.length,
      inserted_count: insData?.length ?? 0,

      // ✅ 프론트에서 "이번 업로드 결과" 보여줄 수 있게
      items: itemsResult,

      uploaded,
      rows: insData ?? [],
      ms: Date.now() - t0,
    });
  } catch (e: any) {
    return jsonError(500, "SERVER_ERROR", { detail: String(e?.message ?? e) });
  }
}
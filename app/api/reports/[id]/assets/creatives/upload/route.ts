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
const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
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
 * ✅ published batch가 존재할 때는 이전 draft creative의 storage만 제거
 * - published creative storage path는 절대 삭제하지 않는다
 * - 기존 removeFolderFiles()와 동일하게 storage 정리는 best-effort
 */
async function removeStorageFilesByRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: any[]
) {
  let removed = 0;

  const pathsByBucket = new Map<string, Set<string>>();

  for (const row of rows ?? []) {
    const bucket = asString(row?.storage_bucket) || BUCKET;
    const path = asString(row?.storage_path);

    if (!bucket || !path) continue;

    const existing = pathsByBucket.get(bucket) ?? new Set<string>();
    existing.add(path);
    pathsByBucket.set(bucket, existing);
  }

  for (const [bucket, pathSet] of pathsByBucket.entries()) {
    const paths = Array.from(pathSet);

    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      if (!chunk.length) continue;

      const { error } = await supabase.storage.from(bucket).remove(chunk);

      if (!error) {
        removed += chunk.length;
      }
    }
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

async function getProfileEmailByUserId(userId: string) {
  const id = asString(userId);
  if (!id) return "";

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_EMAIL_FETCH_FAILED:${error.message}`);
  }

  return normalizeEmail((data as any)?.email);
}

async function getWorkspaceRole(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) return "";

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wid)
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`WORKSPACE_ROLE_CHECK_FAILED:${error.message}`);
  }

  return asString((data as any)?.role).toLowerCase();
}

async function isTrueMasterUser(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) return false;

  const email = await getProfileEmailByUserId(id);

  if (email !== ONLY_MASTER_EMAIL) {
    return false;
  }

  const role = await getWorkspaceRole(id, wid);

  return role === "master";
}

function canUploadCreatives(role: string, isTrueMaster: boolean) {
  if (isTrueMaster) return true;
  return role === "director" || role === "admin" || role === "staff";
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

    // 3) report 조회
    const { data: report, error: repErr } = await supabase
      .from("reports")
      .select(
        "id, workspace_id, advertiser_id, created_by, current_creatives_batch_id, published_creatives_batch_id"
      )
      .eq("id", reportId)
      .maybeSingle();

    if (repErr) return jsonError(500, "REPORT_SELECT_FAILED", { detail: repErr.message });
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    const workspaceId = asString((report as any).workspace_id);
    const advertiserIdRaw = (report as any).advertiser_id;
    const advertiserId = advertiserIdRaw ? asString(advertiserIdRaw) : null;
    const currentCreativesBatchId =
      asString((report as any).current_creatives_batch_id) || null;
    const publishedCreativesBatchId =
      asString((report as any).published_creatives_batch_id) || null;

    if (!workspaceId) return jsonError(500, "REPORT_WORKSPACE_ID_MISSING");

    // 4) 권한 체크: staff/admin/director/true master만 허용
    const role = await getWorkspaceRole(userId, workspaceId);
    const isTrueMaster = await isTrueMasterUser(userId, workspaceId);

    if (!canUploadCreatives(role, isTrueMaster)) {
      return jsonError(403, "FORBIDDEN_CREATIVE_UPLOAD_PERMISSION", {
        role: role || null,
        message: "소재 업로드 권한이 없습니다.",
      });
    }

    // 5) form-data
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

    const rawFiles = form.getAll("files");
    const files = rawFiles.filter((item): item is File => item instanceof File);

    if (!files.length) return jsonError(400, "NO_FILES");

    // 어떤 DB/storage mutation보다 먼저 현재 chunk 전체를 검증한다.
    for (const item of files) {
      if (item.size > MAX_BYTES) {
        return jsonError(400, "FILE_TOO_LARGE", {
          name: item.name,
          size: item.size,
          max: MAX_BYTES,
        });
      }
    }

    const batchFromClient = asString(form.get("batch_id") as any);
    const finalizeRaw = asString(form.get("finalize") as any).toLowerCase();
    const finalizeRequested = finalizeRaw
      ? finalizeRaw === "1" || finalizeRaw === "true" || finalizeRaw === "yes"
      : true;

    const EXPECTED_NULL_BATCH = "__NULL__";
    const expectedFieldName = "expected_current_creatives_batch_id";

    let expectedCurrentCreativesBatchId: string | null;
    let batchId: string;

    if (batchFromClient) {
      if (!form.has(expectedFieldName)) {
        return jsonError(400, "MISSING_EXPECTED_CURRENT_CREATIVE_BATCH");
      }

      const expectedRaw = asString(form.get(expectedFieldName) as any);
      if (!expectedRaw) {
        return jsonError(400, "INVALID_EXPECTED_CURRENT_CREATIVE_BATCH");
      }

      expectedCurrentCreativesBatchId =
        expectedRaw === EXPECTED_NULL_BATCH ? null : expectedRaw;
      batchId = batchFromClient;

      if (currentCreativesBatchId !== expectedCurrentCreativesBatchId) {
        return jsonError(409, "CREATIVE_CURRENT_CHANGED", {
          expected_current_creatives_batch_id: expectedCurrentCreativesBatchId,
          actual_current_creatives_batch_id: currentCreativesBatchId,
        });
      }

      if (
        batchId === currentCreativesBatchId ||
        batchId === publishedCreativesBatchId
      ) {
        return jsonError(409, "CREATIVE_CANDIDATE_NOT_ISOLATED");
      }

      const { count: candidateCount, error: candidateCountErr } = await supabase
        .from("report_creatives")
        .select("id", { count: "exact", head: true })
        .eq("report_id", reportId)
        .eq("workspace_id", workspaceId)
        .eq("batch_id", batchId);

      if (candidateCountErr) {
        return jsonError(500, "CREATIVE_CANDIDATE_SELECT_FAILED", {
          detail: candidateCountErr.message,
        });
      }

      if (Number(candidateCount ?? 0) <= 0) {
        return jsonError(409, "CREATIVE_CANDIDATE_NOT_FOUND");
      }
    } else {
      expectedCurrentCreativesBatchId = currentCreativesBatchId;
      batchId = randomUUID();
    }

    const folder = `reports/${reportId}/creatives`;

    // 6) candidate storage upload
    // - current / published rows는 절대 선삭제하지 않는다.
    // - 같은 candidate batch에만 chunk를 이어붙인다.
    const inserted: any[] = [];
    const uploaded: any[] = [];
    const uploadedStorageRows: any[] = [];
    const itemsResult: any[] = [];

    for (const item of files) {
      const originalName = normalizeOriginalFileName(item.name || "creative");
      const ext = pickExt(originalName);
      const storedFileName = ext ? `${randId()}.${ext}` : randId();

      const creativeKey = originalName;
      const storagePath = `${folder}/${storedFileName}`;

      const arrayBuffer = await item.arrayBuffer();
      const contentType = item.type || "application/octet-stream";

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, arrayBuffer, {
          contentType,
          upsert: true,
          cacheControl: "3600",
        });

      if (upErr) {
        if (uploadedStorageRows.length > 0) {
          await removeStorageFilesByRows(supabase, uploadedStorageRows);
        }

        return jsonError(500, "STORAGE_UPLOAD_FAILED", {
          detail: upErr.message,
          name: originalName,
          path: storagePath,
        });
      }

      uploadedStorageRows.push({
        storage_bucket: BUCKET,
        storage_path: storagePath,
      });

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

    if (!inserted.length) {
      if (uploadedStorageRows.length > 0) {
        await removeStorageFilesByRows(supabase, uploadedStorageRows);
      }
      return jsonError(400, "NO_VALID_FILES");
    }

    const { data: insData, error: insErr } = await supabase
      .from("report_creatives")
      .insert(inserted)
      .select(
        "report_id, workspace_id, advertiser_id, batch_id, creative_key, file_name, storage_bucket, storage_path, mime_type, bytes, created_at"
      );

    if (insErr) {
      await removeStorageFilesByRows(supabase, uploadedStorageRows);
      return jsonError(500, "DB_INSERT_FAILED", { detail: insErr.message });
    }

    // 중간 chunk는 candidate에만 존재하며 current/published에는 노출하지 않는다.
    if (!finalizeRequested) {
      return NextResponse.json({
        ok: true,
        mode: batchFromClient ? "append" : "replace",
        finalized: false,
        report_id: reportId,
        workspace_id: workspaceId,
        advertiser_id: advertiserId,
        batch_id: batchId,
        expected_current_creatives_batch_id: expectedCurrentCreativesBatchId,
        current_creatives_batch_id: currentCreativesBatchId,
        deleteStorage: false,
        storage_folder: folder,
        storage_removed_count: 0,
        uploaded_count: uploaded.length,
        inserted_count: insData?.length ?? 0,
        items: itemsResult,
        uploaded,
        rows: insData ?? [],
        ms: Date.now() - t0,
      });
    }

    // 7) 마지막 chunk에서만 current pointer를 CAS 전환한다.
    let activationQuery = supabase
      .from("reports")
      .update({
        current_creatives_batch_id: batchId,
        updated_at: nowIso(),
      })
      .eq("id", reportId)
      .eq("workspace_id", workspaceId);

    activationQuery = expectedCurrentCreativesBatchId
      ? activationQuery.eq(
          "current_creatives_batch_id",
          expectedCurrentCreativesBatchId
        )
      : activationQuery.is("current_creatives_batch_id", null);

    const { data: activationRows, error: activationErr } = await activationQuery
      .select("id, current_creatives_batch_id")
      .limit(1);

    if (activationErr) {
      return jsonError(500, "CREATIVE_ACTIVATION_FAILED", {
        detail: activationErr.message,
        candidate_batch_id: batchId,
      });
    }

    if (!activationRows?.length) {
      return jsonError(409, "CREATIVE_ACTIVATION_CONFLICT", {
        expected_current_creatives_batch_id: expectedCurrentCreativesBatchId,
        candidate_batch_id: batchId,
      });
    }

    // 8) 이전 current/published snapshot은 여기서 삭제하지 않는다.
    // cleanup은 pointer와 dataset을 원자적으로 보호할 수 있는 별도 authority에서만 수행한다.
    // upload request 내부의 read-then-delete는 concurrent publish와 경쟁할 수 있으므로 금지한다.
    const storageRemoved = 0;
    const rowsRemoved = 0;

    return NextResponse.json({
      ok: true,
      mode: batchFromClient ? "append" : "replace",
      finalized: true,
      report_id: reportId,
      workspace_id: workspaceId,
      advertiser_id: advertiserId,
      batch_id: batchId,
      expected_current_creatives_batch_id: expectedCurrentCreativesBatchId,
      current_creatives_batch_id: batchId,
      deleteStorage: false,
      storage_folder: folder,
      storage_removed_count: storageRemoved,
      rows_removed_count: rowsRemoved,
      cleanup_warning: null,
      uploaded_count: uploaded.length,
      inserted_count: insData?.length ?? 0,
      items: itemsResult,
      uploaded,
      rows: insData ?? [],
      ms: Date.now() - t0,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg.startsWith("PROFILE_EMAIL_FETCH_FAILED:")) {
      return jsonError(500, "PROFILE_EMAIL_FETCH_FAILED", {
        detail: msg.replace("PROFILE_EMAIL_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("WORKSPACE_ROLE_CHECK_FAILED:")) {
      return jsonError(500, "WORKSPACE_ROLE_CHECK_FAILED", {
        detail: msg.replace("WORKSPACE_ROLE_CHECK_FAILED:", ""),
      });
    }

    return jsonError(500, "SERVER_ERROR", { detail: msg });
  }
}

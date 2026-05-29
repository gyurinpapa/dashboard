// app/api/reports/delete/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_CHUNK_SIZE = 100;
const DELETE_CHUNK_SIZE = 10;
const REPORT_ROWS_DELETE_BATCH_SIZE = 10000;
const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

type FailedItem = {
  id: string;
  step: string;
  error: string;
};

type DeletableReportRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
};

type DeletePermission = {
  allowed: boolean;
  role: string;
  scope: "true_master" | "workspace" | "own_created" | "none";
  isTrueMaster: boolean;
};

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status }
  );
}

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeEmail(v: any) {
  return asString(v).toLowerCase();
}

function getBearerToken(req: Request) {
  const auth =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  if (!auth) return "";

  const [type, token] = auth.split(" ");

  if (String(type).toLowerCase() !== "bearer") return "";

  return asString(token);
}

async function resolveUser(req: Request) {
  const bearer = getBearerToken(req);

  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);

    if (!error && data?.user) {
      return {
        user: data.user,
        error: null,
      };
    }
  }

  const { user, error } = await sbAuth();

  return {
    user,
    error,
  };
}

async function getProfileEmailByUserId(userId: string) {
  const id = asString(userId);

  if (!id) return "";

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_EMAIL_FETCH_FAILED:${error.message}`);
  }

  return normalizeEmail(data?.email);
}

async function getWorkspaceRole(userId: string, workspaceId: string) {
  const id = asString(userId);
  const wid = asString(workspaceId);

  if (!id || !wid) return "";

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wid)
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`REPORT_DELETE_PERMISSION_CHECK_FAILED:${error.message}`);
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

async function resolveDeletePermission(
  userId: string,
  workspaceId: string
): Promise<DeletePermission> {
  const role = await getWorkspaceRole(userId, workspaceId);
  const isTrueMaster = await isTrueMasterUser(userId, workspaceId);

  if (isTrueMaster) {
    return {
      allowed: true,
      role: "master",
      scope: "true_master",
      isTrueMaster: true,
    };
  }

  if (role === "director" || role === "admin") {
    return {
      allowed: true,
      role,
      scope: "workspace",
      isTrueMaster: false,
    };
  }

  if (role === "staff") {
    return {
      allowed: true,
      role,
      scope: "own_created",
      isTrueMaster: false,
    };
  }

  return {
    allowed: false,
    role,
    scope: "none",
    isTrueMaster: false,
  };
}

function isMissingTableError(message: string) {
  const msg = String(message || "").toLowerCase();

  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

function uniqueStrings(values: any[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const s = asString(value);

    if (!s || seen.has(s)) continue;

    seen.add(s);
    out.push(s);
  }

  return out;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (!Array.isArray(arr) || arr.length === 0) return [];

  if (size <= 0) return [arr.slice()];

  const chunks: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }

  return chunks;
}

/**
 * workspace isolation + role scope 검증 포함
 * - body.workspace_id만 믿지 않는다.
 * - 실제 reports.workspace_id 일치 검증.
 * - staff는 reports.created_by가 본인인 리포트만 삭제 가능.
 */
async function fetchDeletableReports(params: {
  workspaceId: string;
  requestedIds: string[];
  actorUserId: string;
  permission: DeletePermission;
}) {
  const { workspaceId, requestedIds, actorUserId, permission } = params;

  const verified = new Map<string, DeletableReportRow>();

  for (const idsChunk of chunkArray(requestedIds, VERIFY_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id, created_by")
      .eq("workspace_id", workspaceId)
      .in("id", idsChunk);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      const rowId = asString((row as any)?.id);
      const rowWorkspaceId = asString((row as any)?.workspace_id);
      const rowCreatedBy = asString((row as any)?.created_by) || null;

      if (!rowId) continue;
      if (rowWorkspaceId !== workspaceId) continue;

      if (permission.scope === "own_created" && rowCreatedBy !== actorUserId) {
        continue;
      }

      if (
        permission.scope !== "true_master" &&
        permission.scope !== "workspace" &&
        permission.scope !== "own_created"
      ) {
        continue;
      }

      verified.set(rowId, {
        id: rowId,
        workspace_id: rowWorkspaceId,
        created_by: rowCreatedBy,
      });
    }
  }

  return requestedIds
    .map((id) => verified.get(id))
    .filter(Boolean) as DeletableReportRow[];
}

async function deleteOptionalTableByReportId(
  tableName: string,
  reportId: string,
  step: string
) {
  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .eq("report_id", reportId);

  if (error && !isMissingTableError(error.message || "")) {
    return {
      ok: false as const,
      step,
      error: error.message || `${step}_FAILED`,
    };
  }

  return {
    ok: true as const,
  };
}

async function deleteRequiredTableByReportId(
  tableName: string,
  reportId: string,
  step: string
) {
  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .eq("report_id", reportId);

  if (error) {
    return {
      ok: false as const,
      step,
      error: error.message || `${step}_FAILED`,
    };
  }

  return {
    ok: true as const,
  };
}

/**
 * 대용량 report_rows 삭제 전용 batch delete
 *
 * 기존 방식:
 * - delete from report_rows where report_id = reportId
 * - 12만 건 이상일 때 statement timeout 발생
 *
 * 변경 방식:
 * - DB RPC delete_report_rows_batch를 사용해 report_rows를 짧은 batch로 삭제
 * - 각 batch가 짧게 끝나도록 쪼개서 timeout 가능성을 낮춘다
 *
 * 전제:
 * - public.report_rows(report_id) 인덱스 권장
 * - public.delete_report_rows_batch(p_report_id, p_limit) RPC 존재 권장
 */
async function deleteReportRowsByReportIdInBatches(reportId: string) {
  let deletedCount = 0;

  for (let guard = 0; guard < 1000; guard += 1) {
    const { data, error } = await supabaseAdmin.rpc(
      "delete_report_rows_batch",
      {
        p_report_id: reportId,
        p_limit: REPORT_ROWS_DELETE_BATCH_SIZE,
      }
    );

    if (error) {
      if (isMissingTableError(error.message || "")) {
        return {
          ok: true as const,
          deleted_count: deletedCount,
        };
      }

      return {
        ok: false as const,
        step: "delete_report_rows_rpc_batch",
        error: error.message || "delete_report_rows_rpc_batch_FAILED",
        deleted_count: deletedCount,
      };
    }

    const deletedThisBatch = Number(data ?? 0);

    if (!Number.isFinite(deletedThisBatch) || deletedThisBatch < 0) {
      return {
        ok: false as const,
        step: "delete_report_rows_rpc_batch",
        error: "delete_report_rows_batch returned invalid count",
        deleted_count: deletedCount,
      };
    }

    deletedCount += deletedThisBatch;

    if (deletedThisBatch === 0) {
      return {
        ok: true as const,
        deleted_count: deletedCount,
      };
    }

    if (deletedThisBatch < REPORT_ROWS_DELETE_BATCH_SIZE) {
      return {
        ok: true as const,
        deleted_count: deletedCount,
      };
    }
  }

  return {
    ok: false as const,
    step: "delete_report_rows_rpc_batch_guard",
    error: "report_rows rpc batch delete exceeded guard limit",
    deleted_count: deletedCount,
  };
}

async function deleteSingleReport(workspaceId: string, reportId: string) {
  const reportRowsDeleteResult =
    await deleteReportRowsByReportIdInBatches(reportId);

  if (!reportRowsDeleteResult.ok) {
    return {
      ok: false as const,
      step: reportRowsDeleteResult.step,
      error: reportRowsDeleteResult.error,
    };
  }

  /**
   * reports를 직접 참조하는 FK 확인 결과:
   * - insights.report_id → reports.id ON DELETE CASCADE
   * - report_creatives.report_id → reports.id ON DELETE CASCADE
   *
   * 따라서 report_creatives는 먼저 수동 삭제하지 않는다.
   * reports 삭제 시 DB cascade에 맡기는 것이 더 안전하다.
   *
   * upload 기록은 FK cascade가 없을 수 있으므로 기존처럼 선삭제하되,
   * 테이블이 없는 경우에는 optional로 통과시킨다.
   */
  const steps = [
    () =>
      deleteOptionalTableByReportId(
        "report_csv_uploads",
        reportId,
        "delete_report_csv_uploads"
      ),

    () =>
      deleteOptionalTableByReportId(
        "report_image_uploads",
        reportId,
        "delete_report_image_uploads"
      ),
  ];

  for (const run of steps) {
    const result = await run();

    if (!result.ok) {
      return {
        ok: false as const,
        step: result.step,
        error: result.error,
      };
    }
  }

  const { error: reportDeleteError } = await supabaseAdmin
    .from("reports")
    .delete()
    .eq("id", reportId)
    .eq("workspace_id", workspaceId);

  if (reportDeleteError) {
    return {
      ok: false as const,
      step: "delete_reports",
      error: reportDeleteError.message || "delete_reports_FAILED",
    };
  }

  return {
    ok: true as const,
  };
}

export async function POST(req: Request) {
  try {
    const { user, error: authErr } = await resolveUser(req);

    if (authErr || !user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));

    const workspace_id = asString(body?.workspace_id);

    const report_ids_raw = Array.isArray(body?.report_ids)
      ? body.report_ids
      : [];

    const report_ids = uniqueStrings(report_ids_raw);

    if (!workspace_id) {
      return jsonError(400, "WORKSPACE_ID_REQUIRED");
    }

    if (report_ids.length === 0) {
      return jsonError(400, "REPORT_IDS_REQUIRED");
    }

    const permission = await resolveDeletePermission(user.id, workspace_id);

    if (!permission.allowed) {
      return jsonError(403, "FORBIDDEN_DELETE_PERMISSION", {
        role: permission.role || null,
        access_scope: permission.scope,
      });
    }

    const deletableReports = await fetchDeletableReports({
      workspaceId: workspace_id,
      requestedIds: report_ids,
      actorUserId: asString(user.id),
      permission,
    });

    const deletableIds = deletableReports.map((report) => report.id);

    if (deletableIds.length === 0) {
      return jsonError(404, "NO_REPORTS_FOUND_OR_NOT_ALLOWED", {
        role: permission.role || null,
        access_scope: permission.scope,
      });
    }

    const deletedIds: string[] = [];
    const failed: FailedItem[] = [];

    for (const idsChunk of chunkArray(deletableIds, DELETE_CHUNK_SIZE)) {
      for (const reportId of idsChunk) {
        const result = await deleteSingleReport(workspace_id, reportId);

        if (result.ok) {
          deletedIds.push(reportId);
        } else {
          failed.push({
            id: reportId,
            step: result.step,
            error: result.error,
          });
        }
      }
    }

    const deletedSet = new Set(deletedIds);
    const failedSet = new Set(failed.map((item) => item.id));
    const matchedSet = new Set(deletableIds);

    const notFoundIds = report_ids.filter((id) => {
      if (matchedSet.has(id)) return false;
      if (deletedSet.has(id)) return false;
      if (failedSet.has(id)) return false;
      return true;
    });

    return NextResponse.json({
      ok: failed.length === 0,
      workspace_id,
      requested_count: report_ids.length,
      deletable_count: deletableIds.length,
      deleted_count: deletedIds.length,
      failed_count: failed.length,
      not_found_count: notFoundIds.length,
      deleted_ids: deletedIds,
      failed,
      not_found_ids: notFoundIds,
      role: permission.role || null,
      access_scope: permission.scope,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg.startsWith("PROFILE_EMAIL_FETCH_FAILED:")) {
      return jsonError(500, "PROFILE_EMAIL_FETCH_FAILED", {
        detail: msg.replace("PROFILE_EMAIL_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("REPORT_DELETE_PERMISSION_CHECK_FAILED:")) {
      return jsonError(500, "REPORT_DELETE_PERMISSION_CHECK_FAILED", {
        detail: msg.replace("REPORT_DELETE_PERMISSION_CHECK_FAILED:", ""),
      });
    }

    return jsonError(500, "INTERNAL_ERROR", {
      detail: e?.message || String(e),
    });
  }
}
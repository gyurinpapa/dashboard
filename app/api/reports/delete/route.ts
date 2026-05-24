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

async function canDeleteReports(userId: string, workspaceId: string) {
  const { data: member, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `REPORT_DELETE_PERMISSION_CHECK_FAILED:${error.message}`
    );
  }

  if (!member) return false;

  const role = asString(member.role).toLowerCase();

  if (role === "director") {
    return true;
  }

  if (role !== "master") {
    return false;
  }

  const email = await getProfileEmailByUserId(userId);

  return email === ONLY_MASTER_EMAIL;
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
 * workspace isolation 검증 포함
 * - body.workspace_id만 믿지 않는다
 * - 실제 reports.workspace_id 일치 검증
 */
async function fetchDeletableIds(
  workspaceId: string,
  requestedIds: string[]
) {
  const verified = new Set<string>();

  for (const idsChunk of chunkArray(requestedIds, VERIFY_CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("reports")
      .select("id, workspace_id")
      .eq("workspace_id", workspaceId)
      .in("id", idsChunk);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      const rowId = asString((row as any)?.id);
      const rowWorkspaceId = asString(
        (row as any)?.workspace_id
      );

      if (!rowId) continue;
      if (rowWorkspaceId !== workspaceId) continue;

      verified.add(rowId);
    }
  }

  return requestedIds.filter((id) => verified.has(id));
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
 * - report_id 기준으로 id만 batch 조회
 * - 조회된 id 묶음만 .in("id", ids)로 삭제
 * - 각 batch가 짧게 끝나도록 쪼개서 timeout 가능성을 낮춘다
 *
 * 전제:
 * - public.report_rows(report_id) 인덱스 권장
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

async function deleteSingleReport(
  workspaceId: string,
  reportId: string
) {
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
      error:
        reportDeleteError.message ||
        "delete_reports_FAILED",
    };
  }

  return {
    ok: true as const,
  };
}

export async function POST(req: Request) {
  try {
    const { user, error: authErr } =
      await resolveUser(req);

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

    const canDelete = await canDeleteReports(
      user.id,
      workspace_id
    );

    if (!canDelete) {
      return jsonError(
        403,
        "FORBIDDEN_DELETE_PERMISSION"
      );
    }

    const deletableIds = await fetchDeletableIds(
      workspace_id,
      report_ids
    );

    if (deletableIds.length === 0) {
      return jsonError(404, "NO_REPORTS_FOUND");
    }

    const deletedIds: string[] = [];

    const failed: FailedItem[] = [];

    for (const idsChunk of chunkArray(
      deletableIds,
      DELETE_CHUNK_SIZE
    )) {
      for (const reportId of idsChunk) {
        const result = await deleteSingleReport(
          workspace_id,
          reportId
        );

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

    const failedIds = failed.map((x) => x.id);

    const notFoundIds = report_ids.filter(
      (id) => !deletableIds.includes(id)
    );

    return NextResponse.json({
      ok: true,

      deleted_ids: deletedIds,
      deleted_count: deletedIds.length,

      failed_ids: failedIds,
      failed_count: failedIds.length,

      failed,

      requested_count: report_ids.length,
      matched_count: deletableIds.length,

      not_found_ids: notFoundIds,

      message:
        failedIds.length > 0
          ? `일부 삭제만 완료되었습니다. 성공 ${deletedIds.length}건 / 실패 ${failedIds.length}건`
          : `리포트 ${deletedIds.length}개 삭제 완료`,
    });
  } catch (e: any) {
    const msg = e?.message ?? "";

    if (
      String(msg).startsWith(
        "PROFILE_EMAIL_FETCH_FAILED:"
      )
    ) {
      return jsonError(
        500,
        "PROFILE_EMAIL_FETCH_FAILED",
        {
          detail: String(msg).replace(
            "PROFILE_EMAIL_FETCH_FAILED:",
            ""
          ),
        }
      );
    }

    if (
      String(msg).startsWith(
        "REPORT_DELETE_PERMISSION_CHECK_FAILED:"
      )
    ) {
      return jsonError(
        500,
        "REPORT_DELETE_PERMISSION_CHECK_FAILED",
        {
          detail: String(msg).replace(
            "REPORT_DELETE_PERMISSION_CHECK_FAILED:",
            ""
          ),
        }
      );
    }

    return jsonError(
      500,
      e?.message || "DELETE_REPORTS_FAILED"
    );
  }
}
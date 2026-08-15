// app/api/reports/[id]/publish/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import {
  commitReportPublishSnapshot,
  ReportPublishSnapshotError,
} from "@/src/lib/report/publish-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function asString(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function normalizeEmail(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function isOnlyMasterEmail(email: any) {
  return normalizeEmail(email) === ONLY_MASTER_EMAIL;
}

function getRole(member: any) {
  return String(member?.role ?? "").trim().toLowerCase();
}

function canPublishReport(
  member: any,
  userEmail: any,
  reportCreatedBy: any,
  userId: any
) {
  const role = getRole(member);

  if (role === "master") return isOnlyMasterEmail(userEmail);
  if (role === "director") return true;
  if (role === "admin") return true;

  if (role === "staff") {
    const createdBy = asString(reportCreatedBy);
    const actorUserId = asString(userId);

    return !!createdBy && !!actorUserId && createdBy === actorUserId;
  }

  return false;
}

/**
 * Bearer 우선 + 쿠키(session) fallback
 */
async function getUser(req: Request) {
  const sb = getSupabaseAdmin();

  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await sb.auth.getUser(bearer);
    const user = data?.user ?? null;

    if (error || !user?.id) {
      return {
        ok: false as const,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return { ok: true as const, user };
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

  return { ok: true as const, user };
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await getUser(req);
  if (!auth.ok) {
    return jsonError(auth.status, "UNAUTHORIZED", { detail: auth.message });
  }

  const user = auth.user;
  const userId = user.id;
  const userEmail = user.email;

  const { id } = await ctx.params;
  const reportId = asString(id);
  if (!reportId) return jsonError(400, "BAD_REPORT_ID");

  const sb = getSupabaseAdmin();

  const { data: report, error: repErr } = await sb
    .from("reports")
    .select(
      [
        "id",
        "workspace_id",
        "created_by",
        "share_token",
        "status",
        "current_ingestion_id",
        "current_creatives_batch_id",
        "draft_period_start",
        "draft_period_end",
        "period_start",
        "period_end",
      ].join(", ")
    )
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "DB error");
  if (!report) return jsonError(404, "REPORT_NOT_FOUND");

  const workspaceId = asString((report as any).workspace_id);
  if (!workspaceId) {
    return jsonError(500, "REPORT_WORKSPACE_MISSING");
  }

  const { data: wm, error: wmErr } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (wmErr) {
    return jsonError(500, wmErr.message || "WORKSPACE_MEMBER_CHECK_FAILED");
  }

  if (!wm) return jsonError(403, "FORBIDDEN");

  if (
    !canPublishReport(
      wm,
      userEmail,
      (report as any).created_by,
      userId
    )
  ) {
    return jsonError(403, "FORBIDDEN_PUBLISH_PERMISSION");
  }

  const currentIngestionId = asString((report as any).current_ingestion_id);

  if (!currentIngestionId) {
    return jsonError(400, "PUBLISH_BLOCKED_NO_CURRENT_SESSION", {
      hint: "CSV 업로드 + ingestion/run 성공 후에만 발행 가능합니다 (current_ingestion_id 없음).",
    });
  }

  const { count, error: cntErr } = await sb
    .from("report_rows")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId)
    .eq("ingestion_id", currentIngestionId);

  if (cntErr) return jsonError(500, cntErr.message || "COUNT_FAILED");

  const rowsCount = Number(count ?? 0);
  if (rowsCount <= 0) {
    return jsonError(400, "PUBLISH_BLOCKED_EMPTY_CURRENT_SESSION", {
      hint: "이번 세션에 rows가 0개입니다. ingestion/run 결과(inserted)를 확인하세요.",
      current_ingestion_id: currentIngestionId,
      rows_count: rowsCount,
    });
  }

  const sourceShareToken =
    typeof (report as any).share_token === "string"
      ? (report as any).share_token
      : null;

  const currentCreativesBatchId =
    asString((report as any).current_creatives_batch_id) || null;

  const draftPeriodStart = asString((report as any).draft_period_start) || null;
  const draftPeriodEnd = asString((report as any).draft_period_end) || null;
  const periodStart = asString((report as any).period_start) || null;
  const periodEnd = asString((report as any).period_end) || null;

  let publishResult;

  try {
    publishResult = await commitReportPublishSnapshot({
      snapshot: {
        reportId,
        sourceShareToken,
        currentIngestionId,
        currentCreativesBatchId,
        draftPeriodStart,
        draftPeriodEnd,
        periodStart,
        periodEnd,
      },
      includePublishedAt: true,
    });
  } catch (error) {
    if (
      error instanceof ReportPublishSnapshotError &&
      error.code === "PUBLISH_CONFLICT"
    ) {
      return jsonError(409, "PUBLISH_CONFLICT", {
        hint: "발행 중 현재 snapshot 또는 발행 원본이 변경되었습니다. 최신 상태에서 다시 발행하세요.",
      });
    }

    const message =
      error instanceof Error && error.message
        ? error.message
        : "PUBLISH_FAILED";

    return jsonError(500, message);
  }

  const token = publishResult.shareToken;

  return NextResponse.json(
    {
      ok: true,
      share_token: token,
      sharePath: `/share/${token}`,
      status: "ready",
      published_ingestion_id: currentIngestionId,
      published_creatives_batch_id: currentCreativesBatchId,
      published_period_start: draftPeriodStart,
      published_period_end: draftPeriodEnd,
    },
    { status: 200 }
  );
}
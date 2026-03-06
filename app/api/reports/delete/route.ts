// app/api/reports/delete/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeleteBody = {
  workspace_id?: string;
  report_ids?: string[];
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

function asIdList(v: any) {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(
      v
        .map((x) => asString(x))
        .filter(Boolean)
    )
  );
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function resolveUser(req: Request) {
  const sb = getSupabaseAdmin();

  // 1) Bearer 우선
  const bearer = getBearerToken(req);
  if (bearer) {
    const { data, error } = await sb.auth.getUser(bearer);
    if (!error && data?.user) {
      return { user: data.user, method: "bearer" as const };
    }
  }

  // 2) 쿠키 fallback
  const { user, error } = await sbAuth();
  if (!error && user) {
    return { user, method: "cookie" as const };
  }

  return { user: null, method: "none" as const };
}

export async function POST(req: Request) {
  try {
    const auth = await resolveUser(req);
    if (!auth.user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const body = (await req.json().catch(() => ({}))) as DeleteBody;

    const workspace_id = asString(body.workspace_id);
    const report_ids = asIdList(body.report_ids);

    if (!workspace_id) {
      return jsonError(400, "MISSING_WORKSPACE_ID");
    }

    if (!report_ids.length) {
      return jsonError(400, "MISSING_REPORT_IDS");
    }

    const sb = getSupabaseAdmin();

    // ✅ 사용자가 해당 workspace 구성원인지 확인
    const { data: member, error: memberErr } = await sb
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (memberErr) {
      return jsonError(500, memberErr.message || "WORKSPACE_MEMBER_CHECK_FAILED");
    }

    if (!member?.workspace_id) {
      return jsonError(403, "FORBIDDEN_WORKSPACE");
    }

    // ✅ 실제 대상 리포트 조회
    const { data: reports, error: reportsErr } = await sb
      .from("reports")
      .select("id, workspace_id, status")
      .eq("workspace_id", workspace_id)
      .in("id", report_ids);

    if (reportsErr) {
      return jsonError(500, reportsErr.message || "REPORT_LOOKUP_FAILED");
    }

    const targetIds = (reports ?? [])
      .map((r: any) => asString(r.id))
      .filter(Boolean);

    if (!targetIds.length) {
      return jsonError(404, "REPORTS_NOT_FOUND");
    }

    // ✅ 소프트 삭제: archived 처리
    const { data: updated, error: updateErr } = await sb
      .from("reports")
      .update({
        status: "archived",
      })
      .in("id", targetIds)
      .eq("workspace_id", workspace_id)
      .select("id,status");

    if (updateErr) {
      return jsonError(500, updateErr.message || "REPORT_ARCHIVE_FAILED");
    }

    return NextResponse.json({
      ok: true,
      workspace_id,
      auth_method: auth.method,
      requested_count: report_ids.length,
      archived_count: updated?.length ?? 0,
      report_ids: (updated ?? [])
        .map((x: any) => asString(x.id))
        .filter(Boolean),
    });
  } catch (e: any) {
    return jsonError(500, e?.message || "UNKNOWN_DELETE_ERROR");
  }
}
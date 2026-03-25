import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/src/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function randToken(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function asString(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

/**
 * Bearer 우선 + 쿠키(session) fallback
 */
async function getUserId(req: Request) {
  const sb = getSupabaseAdmin();

  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await sb.auth.getUser(bearer);
    const userId = data?.user?.id ?? null;

    if (error || !userId) {
      return {
        ok: false as const,
        status: 401,
        message: "Unauthorized (invalid bearer token)",
      };
    }

    return { ok: true as const, userId };
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

export async function POST(req: Request, ctx: Ctx) {
  const auth = await getUserId(req);
  if (!auth.ok) {
    return jsonError(auth.status, "UNAUTHORIZED", { detail: auth.message });
  }

  const userId = auth.userId;

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
        "share_token",
        "current_ingestion_id",
        "current_creatives_batch_id",
        "draft_period_start",
        "draft_period_end",
      ].join(", ")
    )
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "DB error");
  if (!report) return jsonError(404, "REPORT_NOT_FOUND");

  const { data: wm, error: wmErr } = await sb
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", (report as any).workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (wmErr) {
    return jsonError(500, wmErr.message || "WORKSPACE_MEMBER_CHECK_FAILED");
  }
  if (!wm) return jsonError(403, "FORBIDDEN");

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

  const token = asString((report as any).share_token) || randToken(32);
  const now = new Date().toISOString();

  const currentCreativesBatchId =
    asString((report as any).current_creatives_batch_id) || null;

  const draftPeriodStart = asString((report as any).draft_period_start) || null;
  const draftPeriodEnd = asString((report as any).draft_period_end) || null;

  const { error: upErr } = await sb
    .from("reports")
    .update({
      share_token: token,
      status: "ready",
      updated_at: now,

      published_ingestion_id: currentIngestionId,
      published_creatives_batch_id: currentCreativesBatchId,

      published_period_start: draftPeriodStart,
      published_period_end: draftPeriodEnd,

      // legacy 호환
      period_start: draftPeriodStart,
      period_end: draftPeriodEnd,
    })
    .eq("id", reportId);

  if (upErr) return jsonError(500, upErr.message || "PUBLISH_FAILED");

  return NextResponse.json(
    {
      ok: true,
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
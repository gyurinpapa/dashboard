// app/api/reports/[id]/publish/route.ts
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
  return String(v).trim();
}

export async function POST(_req: Request, ctx: Ctx) {
  const { user, error: authErr } = await sbAuth();
  if (authErr || !user) return jsonError(401, "UNAUTHORIZED");

  const { id } = await ctx.params;
  const reportId = asString(id);
  if (!reportId) return jsonError(400, "BAD_REPORT_ID");

  const sb = getSupabaseAdmin();

  // ✅ 리포트 조회: current_ingestion_id / current_creatives_batch_id 필요
  const { data: report, error: repErr } = await sb
    .from("reports")
    .select("id, share_token, status, meta, current_ingestion_id, current_creatives_batch_id")
    .eq("id", reportId)
    .maybeSingle();

  if (repErr) return jsonError(500, repErr.message || "DB error");
  if (!report) return jsonError(404, "REPORT_NOT_FOUND");

  const currentIngestionId = (report as any).current_ingestion_id
    ? String((report as any).current_ingestion_id)
    : "";

  if (!currentIngestionId) {
    return jsonError(400, "PUBLISH_BLOCKED_NO_CURRENT_SESSION", {
      hint: "CSV 업로드 + ingestion/run 성공 후에만 발행 가능합니다 (current_ingestion_id 없음).",
    });
  }

  // ✅ '이번 세션' row count로 검증
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

  const token = (report as any).share_token || randToken(32);
  const now = new Date().toISOString();

  const currentCreativesBatchId = (report as any).current_creatives_batch_id
    ? String((report as any).current_creatives_batch_id)
    : null;

  // ✅ 발행 스냅샷 고정: published_* = current_*
  const { error: upErr } = await sb
    .from("reports")
    .update({
      share_token: token,
      status: "ready",
      published_at: now,
      updated_at: now,

      published_ingestion_id: currentIngestionId,
      published_creatives_batch_id: currentCreativesBatchId,
    })
    .eq("id", reportId);

  if (upErr) return jsonError(500, upErr.message || "PUBLISH_FAILED");

  return NextResponse.json(
    {
      ok: true,
      share_token: token,
      status: "ready",
      published_ingestion_id: currentIngestionId,
      published_creatives_batch_id: currentCreativesBatchId,
    },
    { status: 200 }
  );
}
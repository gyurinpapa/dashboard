// app/api/reports/[id]/rows/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * ✅ Bearer 우선 + 쿠키(session) fallback
 * - 프론트에서 Authorization: Bearer ... 를 보내면 이걸 먼저 검증
 * - 없으면 sbAuth() 쿠키 세션으로 user 확인
 *
 * 반환:
 *  - { ok: true, userId }
 *  - { ok: false, status, message }
 */
async function getUserId(req: Request) {
  const admin = getSupabaseAdmin();

  // 1) Bearer 토큰 우선
  const authz = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim();

  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
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

  // 2) 쿠키 세션 fallback
  const auth = await sbAuth();
  if (!auth.ok || !auth.user?.id) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized (no session). Please sign in.",
    };
  }

  return { ok: true as const, userId: auth.user.id };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    // ✅ auth 통일 (Bearer 우선 + 쿠키 fallback)
    const auth = await getUserId(req);
    if (!auth.ok) {
      return jsonError(auth.status, auth.message);
    }
    const userId = auth.userId;

    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();

    // 1) report 조회
    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id, current_ingestion_id")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    // 2) membership 체크  ✅ id 컬럼 쓰지 말 것
    const { data: wm, error: wmErr } = await admin
      .from("workspace_members")
      .select("role") // 또는 "workspace_id"
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    // 3) ingestion 없으면 빈 배열
    const ingestionId = (report as any).current_ingestion_id;
    if (!ingestionId) return NextResponse.json({ ok: true, rows: [] });

    // 4) rows 로드
    const { data: rows, error: rowsErr } = await admin
      .from("report_rows")
      .select("id, report_id, ingestion_id, row, created_at")
      .eq("report_id", id)
      .eq("ingestion_id", ingestionId)
      .order("created_at", { ascending: true });

    if (rowsErr) return jsonError(500, rowsErr.message);

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}
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
  const authz =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
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
  if (auth.error || !auth.user?.id) {
    return {
      ok: false as const,
      status: 401,
      message: "Unauthorized (no session). Please sign in.",
    };
  }

  return { ok: true as const, userId: auth.user.id };
}

function tryParseJson(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function asStr(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * ✅ report_rows.row 를 top-level로 안전하게 펼친다.
 * - 편집 화면(/reports/[id])이 share 페이지와 최대한 유사한 row shape를 받도록 맞춤
 * - 원본 row도 유지
 */
function flattenRow(rec: any) {
  const parsed = tryParseJson(rec?.row) || {};
  const out: any = {
    ...parsed,

    // 원본 메타 유지
    id: rec?.id ?? parsed?.id ?? null,
    __row_id: rec?.id ?? parsed?.__row_id ?? parsed?.id ?? null,
    report_id: rec?.report_id ?? null,
    ingestion_id: rec?.ingestion_id ?? null,
    created_at: rec?.created_at ?? null,

    // 원본 row 보존
    row: parsed,
  };

  // 자주 쓰는 alias 보강
  if (out.imagepath == null && out.imagePath != null) out.imagepath = out.imagePath;
  if (out.imagePath == null && out.imagepath != null) out.imagePath = out.imagepath;

  if (out.creative_file == null && out.creativeFile != null) {
    out.creative_file = out.creativeFile;
  }
  if (out.creativeFile == null && out.creative_file != null) {
    out.creativeFile = out.creative_file;
  }

  if (out.campaign_name == null && out.campaign != null) out.campaign_name = out.campaign;
  if (out.group_name == null && out.group != null) out.group_name = out.group;

  if (out.impressions == null && out.impr != null) out.impressions = out.impr;
  if (out.clicks == null && out.click != null) out.clicks = out.click;
  if (out.clicks == null && out.clk != null) out.clicks = out.clk;
  if (out.cost == null && out.spend != null) out.cost = out.spend;
  if (out.conversions == null && out.conv != null) out.conversions = out.conv;
  if (out.conversions == null && out.cv != null) out.conversions = out.cv;
  if (out.revenue == null && out.sales != null) out.revenue = out.sales;
  if (out.revenue == null && out.gmv != null) out.revenue = out.gmv;

  return out;
}

/**
 * ✅ ingestion_id 기준 rows 전체 조회
 * - Supabase select 기본 1000개 제한을 피하기 위해 range pagination 사용
 * - 기존 정렬/반환 구조는 유지
 */
async function fetchRowsByIngestion(
  admin: ReturnType<typeof getSupabaseAdmin>,
  reportId: string,
  ingestionId: string
) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await admin
      .from("report_rows")
      .select("id, report_id, ingestion_id, row, created_at")
      .eq("report_id", reportId)
      .eq("ingestion_id", ingestionId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    if (!data || data.length === 0) {
      break;
    }

    all.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return all;
}

async function findLatestIngestionId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  reportId: string
) {
  const { data, error } = await admin
    .from("report_rows")
    .select("ingestion_id, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);

  const latest = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return asStr(latest?.ingestion_id);
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
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    const currentIngestionId = asStr((report as any).current_ingestion_id);

    let ingestionIdUsed = currentIngestionId;
    let fallbackUsed = false;
    let rawRows: any[] = [];

    // 3) current_ingestion_id 우선
    if (currentIngestionId) {
      rawRows = await fetchRowsByIngestion(admin, id, currentIngestionId);
    }

    // 4) ✅ fallback:
    // current_ingestion_id가 없거나, 거기에 rows가 없으면
    // report_rows 기준 최신 ingestion_id를 찾아서 사용
    if (!rawRows.length) {
      const latestIngestionId = await findLatestIngestionId(admin, id);

      if (latestIngestionId) {
        const latestRows = await fetchRowsByIngestion(admin, id, latestIngestionId);

        if (latestRows.length) {
          rawRows = latestRows;
          ingestionIdUsed = latestIngestionId;
          fallbackUsed = latestIngestionId !== currentIngestionId;
        }
      }
    }

    // 5) 그래도 없으면 빈 배열
    if (!rawRows.length) {
      return NextResponse.json({
        ok: true,
        rows: [],
        ingestion_id_used: ingestionIdUsed || null,
        fallback_used: fallbackUsed,
        rows_count: 0,
      });
    }

    // 6) ✅ row 펼쳐서 반환
    const rows = rawRows.map(flattenRow);

    const dates = rows
      .map((r: any) => r?.date ?? r?.report_date ?? r?.day ?? "")
      .filter(Boolean)
      .map((v: any) => String(v));

    const uniqueMonths = Array.from(new Set(dates.map((d) => d.slice(0, 7))));

    console.log("[rows:route]", {
      reportId: id,
      currentIngestionId,
      ingestionIdUsed,
      fallbackUsed,
      rawRowsLen: rawRows.length,
      rowsLen: rows.length,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      uniqueMonths,
    });

    return NextResponse.json({
      ok: true,
      rows,
      ingestion_id_used: ingestionIdUsed || null,
      fallback_used: fallbackUsed,
      rows_count: rows.length,
    });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}
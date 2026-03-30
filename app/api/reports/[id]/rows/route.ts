import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

async function getUserId(req: Request) {
  const admin = getSupabaseAdmin();

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

function flattenRow(rec: any) {
  const parsed = tryParseJson(rec?.row) || {};

  const canonicalDate =
    asStr(rec?.date) ||
    asStr(parsed?.date) ||
    asStr(parsed?.report_date) ||
    asStr(parsed?.day) ||
    asStr(parsed?.ymd) ||
    asStr(parsed?.dt) ||
    asStr(parsed?.segment_date) ||
    asStr(parsed?.stat_date) ||
    "";

  const out: any = {
    ...parsed,

    id: rec?.id ?? parsed?.id ?? null,
    __row_id: rec?.id ?? parsed?.__row_id ?? parsed?.id ?? null,
    report_id: rec?.report_id ?? null,
    ingestion_id: rec?.ingestion_id ?? null,
    created_at: rec?.created_at ?? null,

    // ✅ DB canonical date 우선
    date: canonicalDate,
    report_date: asStr(parsed?.report_date) || canonicalDate,
    day: asStr(parsed?.day) || canonicalDate,
    ymd: asStr(parsed?.ymd) || canonicalDate,

    channel: rec?.channel ?? parsed?.channel ?? null,
    device: rec?.device ?? parsed?.device ?? parsed?.device_type ?? null,
    source: rec?.source ?? parsed?.source ?? parsed?.site_source ?? null,

    row: parsed,
  };

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
      .select(
        "id, report_id, ingestion_id, row, created_at, date, channel, device, source"
      )
      .eq("report_id", reportId)
      .eq("ingestion_id", ingestionId)
      .order("row_index", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function findBestIngestionIdByRows(
  admin: ReturnType<typeof getSupabaseAdmin>,
  reportId: string
) {
  const pageSize = 1000;
  let from = 0;

  const stats = new Map<
    string,
    {
      count: number;
      latestCreatedAt: string;
    }
  >();

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await admin
      .from("report_rows")
      .select("ingestion_id, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const ingestionId = asStr(row?.ingestion_id);
      if (!ingestionId) continue;

      const createdAt = asStr(row?.created_at);
      const prev = stats.get(ingestionId);

      if (!prev) {
        stats.set(ingestionId, {
          count: 1,
          latestCreatedAt: createdAt,
        });
      } else {
        prev.count += 1;
        if (createdAt && (!prev.latestCreatedAt || createdAt > prev.latestCreatedAt)) {
          prev.latestCreatedAt = createdAt;
        }
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const ranked = Array.from(stats.entries())
    .map(([ingestionId, s]) => ({
      ingestionId,
      count: s.count,
      latestCreatedAt: s.latestCreatedAt,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.latestCreatedAt).localeCompare(String(a.latestCreatedAt));
    });

  return {
    bestIngestionId: ranked[0]?.ingestionId ?? "",
    ranked,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserId(req);
    if (!auth.ok) {
      return jsonError(auth.status, auth.message);
    }
    const userId = auth.userId;

    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();

    const { data: report, error: rErr } = await admin
      .from("reports")
      .select("id, workspace_id, current_ingestion_id")
      .eq("id", id)
      .maybeSingle();

    if (rErr) return jsonError(500, rErr.message);
    if (!report) return jsonError(404, "REPORT_NOT_FOUND");

    const { data: wm, error: wmErr } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "FORBIDDEN");

    const currentIngestionId = asStr((report as any).current_ingestion_id);

    const { bestIngestionId, ranked } = await findBestIngestionIdByRows(admin, id);

    const ingestionIdUsed = bestIngestionId || currentIngestionId || "";
    const fallbackUsed =
      !!ingestionIdUsed &&
      !!currentIngestionId &&
      ingestionIdUsed !== currentIngestionId;

    if (!ingestionIdUsed) {
      return NextResponse.json({
        ok: true,
        rows: [],
        ingestion_id_used: null,
        fallback_used: false,
        rows_count: 0,
        ingestion_ranked: [],
      });
    }

    const rawRows = await fetchRowsByIngestion(admin, id, ingestionIdUsed);

    if (!rawRows.length) {
      return NextResponse.json({
        ok: true,
        rows: [],
        ingestion_id_used: ingestionIdUsed || null,
        fallback_used: fallbackUsed,
        rows_count: 0,
        ingestion_ranked: ranked,
      });
    }

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
      ranked: ranked.slice(0, 10),
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
      ingestion_ranked: ranked,
    });
  } catch (e: any) {
    return jsonError(500, e?.message || String(e));
  }
}
// app/api/reports/[id]/ppt/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isPlatformOwner } from "@/src/lib/supabase/platform-role";

import { buildPptReportData } from "@/src/lib/report/ppt/build-ppt-data";
import { buildPptInsights } from "@/src/lib/report/ppt/build-ppt-insights";
import { writePptxBufferFromReportDeck } from "@/src/lib/report/ppt/render-ppt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ONLY_MASTER_EMAIL = "gyurinpapakimdh@gmail.com";
const REPORT_ROWS_PAGE_SIZE = 1000;
const MAX_REPORT_ROWS_FOR_PPT = 150000;

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status },
  );
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
  return asString(v).toLowerCase();
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

async function getActor(req: Request) {
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
    throw new Error(`WORKSPACE_ROLE_CHECK_FAILED:${error.message}`);
  }

  return asString((data as any)?.role).toLowerCase();
}

async function hasMasterMembership(userId: string) {
  const id = asString(userId);
  if (!id) return false;

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", id)
    .eq("role", "master")
    .limit(1);

  if (error) {
    throw new Error(`MASTER_MEMBERSHIP_CHECK_FAILED:${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function isTrueMasterUser(userId: string, workspaceId?: string) {
  const id = asString(userId);
  if (!id) return false;

  const email = await getProfileEmailByUserId(id);

  if (email !== ONLY_MASTER_EMAIL) {
    return false;
  }

  if (workspaceId) {
    const role = await getWorkspaceRole(id, workspaceId);
    return role === "master";
  }

  return await hasMasterMembership(id);
}

function canReadReport(role: string) {
  return (
    role === "master" ||
    role === "director" ||
    role === "admin" ||
    role === "staff" ||
    role === "client"
  );
}

function getMetaObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function sanitizeFileName(v: any) {
  const s = asString(v) || "Etrylue_Performance_Report";
  return s
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDownloadFileName(args: {
  advertiserName: string;
  reportTypeName: string;
  reportId: string;
}) {
  const advertiser = sanitizeFileName(args.advertiserName || "advertiser");
  const reportType = sanitizeFileName(args.reportTypeName || "report");
  const shortId = sanitizeFileName(args.reportId).slice(0, 8);

  return `${advertiser}_${reportType}_${shortId}.pptx`;
}

async function fetchReportDetail(reportId: string) {
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select(
      [
        "id",
        "workspace_id",
        "advertiser_id",
        "report_type_id",
        "title",
        "status",
        "share_token",
        "period_start",
        "period_end",
        "draft_period_start",
        "draft_period_end",
        "published_period_start",
        "published_period_end",
        "published_at",
        "current_ingestion_id",
        "meta",
        "created_by",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    throw new Error(`REPORT_FETCH_FAILED:${error.message}`);
  }

  return data ?? null;
}

async function fetchAdvertiserInfo(advertiserId: string) {
  const id = asString(advertiserId);
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from("advertisers")
    .select("id, name, workspace_id, public_slug")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`ADVERTISER_FETCH_FAILED:${error.message}`);
  }

  return data ?? null;
}

async function fetchReportTypeInfo(reportTypeId: string) {
  const id = asString(reportTypeId);
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from("report_types")
    .select("id, key, name")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`REPORT_TYPE_FETCH_FAILED:${error.message}`);
  }

  return data ?? null;
}

function normalizeReportRowRecord(rec: any) {
  const rowRaw = (rec as any)?.row ?? (rec as any)?.data ?? (rec as any)?.payload;

  if (rowRaw && typeof rowRaw === "object" && !Array.isArray(rowRaw)) {
    return {
      ...rowRaw,
      id: (rec as any)?.id ?? rowRaw.id ?? null,
      __row_id: (rec as any)?.id ?? rowRaw.__row_id ?? rowRaw.id ?? null,
      report_id: (rec as any)?.report_id ?? rowRaw.report_id ?? null,
      ingestion_id: (rec as any)?.ingestion_id ?? rowRaw.ingestion_id ?? null,
      row_level: (rec as any)?.row_level ?? rowRaw.row_level ?? null,
      data_level: (rec as any)?.data_level ?? rowRaw.data_level ?? null,
      created_at: (rec as any)?.created_at ?? rowRaw.created_at ?? null,
      date:
        asString((rec as any)?.date) ||
        asString(rowRaw.date) ||
        asString(rowRaw.report_date) ||
        asString(rowRaw.day) ||
        asString(rowRaw.ymd) ||
        asString(rowRaw.dt) ||
        asString(rowRaw.segment_date) ||
        asString(rowRaw.stat_date) ||
        "",
      channel: (rec as any)?.channel ?? rowRaw.channel ?? null,
      device:
        (rec as any)?.device ??
        rowRaw.device ??
        rowRaw.device_type ??
        null,
      source:
        (rec as any)?.source ??
        rowRaw.source ??
        rowRaw.site_source ??
        null,
    };
  }

  if (typeof rowRaw === "string") {
    try {
      const parsed = JSON.parse(rowRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          ...parsed,
          id: (rec as any)?.id ?? parsed.id ?? null,
          __row_id: (rec as any)?.id ?? parsed.__row_id ?? parsed.id ?? null,
          report_id: (rec as any)?.report_id ?? parsed.report_id ?? null,
          ingestion_id:
            (rec as any)?.ingestion_id ?? parsed.ingestion_id ?? null,
          row_level: (rec as any)?.row_level ?? parsed.row_level ?? null,
          data_level: (rec as any)?.data_level ?? parsed.data_level ?? null,
          created_at: (rec as any)?.created_at ?? parsed.created_at ?? null,
          date:
            asString((rec as any)?.date) ||
            asString(parsed.date) ||
            asString(parsed.report_date) ||
            asString(parsed.day) ||
            asString(parsed.ymd) ||
            asString(parsed.dt) ||
            asString(parsed.segment_date) ||
            asString(parsed.stat_date) ||
            "",
          channel: (rec as any)?.channel ?? parsed.channel ?? null,
          device:
            (rec as any)?.device ??
            parsed.device ??
            parsed.device_type ??
            null,
          source:
            (rec as any)?.source ??
            parsed.source ??
            parsed.site_source ??
            null,
        };
      }
    } catch {
      // ignore and fallback to rec object
    }
  }

  return { ...(rec ?? {}) };
}

async function fetchReportRowsByIngestion(args: {
  reportId: string;
  ingestionId: string;
}) {
  const { reportId, ingestionId } = args;
  const rows: any[] = [];

  for (
    let from = 0;
    from <= MAX_REPORT_ROWS_FOR_PPT;
    from += REPORT_ROWS_PAGE_SIZE
  ) {
    const to = from + REPORT_ROWS_PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("report_rows")
      .select(
            [
                "id",
                "report_id",
                "ingestion_id",
                "row_index",
                "row",
                "created_at",
                "date",
                "channel",
                "device",
                "source",
            ].join(", "),
        )
      .eq("report_id", reportId)
    .eq("ingestion_id", ingestionId)
      .order("row_index", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`REPORT_ROWS_FETCH_FAILED:${error.message}`);
    }

    const chunk = Array.isArray(data) ? data : [];

    for (const item of chunk) {
      rows.push(normalizeReportRowRecord(item));
    }

    if (rows.length > MAX_REPORT_ROWS_FOR_PPT) {
      throw new Error(
        `REPORT_ROWS_TOO_LARGE_FOR_PPT:${rows.length}:${MAX_REPORT_ROWS_FOR_PPT}`,
      );
    }

    if (chunk.length < REPORT_ROWS_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function fetchReportRowsLegacy(args: {
  reportId: string;
}) {
  const { reportId } = args;
  const rows: any[] = [];

  for (
    let from = 0;
    from <= MAX_REPORT_ROWS_FOR_PPT;
    from += REPORT_ROWS_PAGE_SIZE
  ) {
    const to = from + REPORT_ROWS_PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("report_rows")
      .select(
        [
            "id",
            "report_id",
            "ingestion_id",
            "row_index",
            "row",
            "created_at",
            "date",
            "channel",
            "device",
            "source",
        ].join(", "),
        )
      .eq("report_id", reportId)
      .order("row_index", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`REPORT_ROWS_FETCH_FAILED:${error.message}`);
    }

    const chunk = Array.isArray(data) ? data : [];

    for (const item of chunk) {
      rows.push(normalizeReportRowRecord(item));
    }

    if (rows.length > MAX_REPORT_ROWS_FOR_PPT) {
      throw new Error(
        `REPORT_ROWS_TOO_LARGE_FOR_PPT:${rows.length}:${MAX_REPORT_ROWS_FOR_PPT}`,
      );
    }

    if (chunk.length < REPORT_ROWS_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function findBestIngestionIdByRows(reportId: string) {
  const stats = new Map<
    string,
    {
      count: number;
      latestCreatedAt: string;
    }
  >();

  for (
    let from = 0;
    from <= MAX_REPORT_ROWS_FOR_PPT;
    from += REPORT_ROWS_PAGE_SIZE
  ) {
    const to = from + REPORT_ROWS_PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("report_rows")
      .select("ingestion_id, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`REPORT_ROWS_INGESTION_LOOKUP_FAILED:${error.message}`);
    }

    const chunk = Array.isArray(data) ? data : [];

    for (const row of chunk) {
      const ingestionId = asString((row as any)?.ingestion_id);
      if (!ingestionId) continue;

      const createdAt = asString((row as any)?.created_at);
      const prev = stats.get(ingestionId);

      if (!prev) {
        stats.set(ingestionId, {
          count: 1,
          latestCreatedAt: createdAt,
        });
      } else {
        prev.count += 1;
        if (
          createdAt &&
          (!prev.latestCreatedAt || createdAt > prev.latestCreatedAt)
        ) {
          prev.latestCreatedAt = createdAt;
        }
      }
    }

    if (chunk.length < REPORT_ROWS_PAGE_SIZE) {
      break;
    }
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

async function fetchRowsForPpt(args: {
  reportId: string;
  currentIngestionId: string;
}) {
  const { reportId, currentIngestionId } = args;

  if (currentIngestionId) {
    const rows = await fetchReportRowsByIngestion({
      reportId,
      ingestionId: currentIngestionId,
    });

    if (rows.length > 0) {
      return {
        rows,
        ingestionIdUsed: currentIngestionId,
        fallbackUsed: false,
      };
    }
  }

  const fallback = await findBestIngestionIdByRows(reportId);

  if (fallback.bestIngestionId) {
    const rows = await fetchReportRowsByIngestion({
      reportId,
      ingestionId: fallback.bestIngestionId,
    });

    if (rows.length > 0) {
      return {
        rows,
        ingestionIdUsed: fallback.bestIngestionId,
        fallbackUsed: !!currentIngestionId,
      };
    }
  }

  const legacyRows = await fetchReportRowsLegacy({
    reportId,
  });

  return {
    rows: legacyRows,
    ingestionIdUsed: currentIngestionId || fallback.bestIngestionId || "",
    fallbackUsed: !!currentIngestionId || !!fallback.bestIngestionId,
  };
}

async function assertReportAccess(args: {
  userId: string;
  report: any;
}) {
  const { userId, report } = args;

  const workspaceId = asString(report?.workspace_id);

  if (!workspaceId) {
    return {
      ok: false as const,
      status: 500,
      message: "REPORT_WORKSPACE_MISSING",
      role: "",
      isTrueMaster: false,
    };
  }

  const actorIsPlatformOwner = await isPlatformOwner(userId);
  const actorIsTrueMaster = await isTrueMasterUser(userId, workspaceId);

  /**
   * platform_owner 단독으로는 우회하지 않는다.
   * true master 조건을 만족해야만 전체/특수 권한으로 본다.
   */
  if (actorIsTrueMaster) {
    return {
      ok: true as const,
      role: "master",
      isTrueMaster: true,
      platformRole: actorIsPlatformOwner ? "platform_owner" : null,
    };
  }

  const role = await getWorkspaceRole(userId, workspaceId);

  if (!canReadReport(role)) {
    return {
      ok: false as const,
      status: 403,
      message: "REPORT_ACCESS_DENIED",
      role,
      isTrueMaster: false,
    };
  }

  return {
    ok: true as const,
    role,
    isTrueMaster: false,
    platformRole: actorIsPlatformOwner ? "platform_owner" : null,
  };
}

function pickAdvertiserName(args: {
  report: any;
  advertiser: any;
}) {
  const meta = getMetaObject(args.report?.meta);

  return (
    asString(args.advertiser?.name) ||
    asString(args.report?.advertiser_name) ||
    asString(args.report?.advertiserName) ||
    asString(meta?.advertiser_name) ||
    asString(meta?.advertiserName) ||
    asString(meta?.advertiser) ||
    "광고주"
  );
}

function pickReportTypeName(args: {
  report: any;
  reportType: any;
}) {
  const meta = getMetaObject(args.report?.meta);

  const key =
    asString(args.reportType?.key) ||
    asString(args.report?.report_type_key) ||
    asString(args.report?.reportTypeKey) ||
    asString(meta?.report_type_key) ||
    asString(meta?.reportTypeKey) ||
    asString(meta?.report_type);

  const name =
    asString(args.reportType?.name) ||
    asString(args.report?.report_type_name) ||
    asString(args.report?.reportTypeName) ||
    asString(meta?.report_type_name) ||
    asString(meta?.reportTypeName);

  const keyLower = key.toLowerCase();

  if (keyLower === "traffic") return "트래픽 리포트";
  if (keyLower === "commerce") return name || "커머스 매출 리포트";
  if (keyLower === "db_acquisition") return name || "DB획득 리포트";

  return name || "성과 보고서";
}

function pickReportTypeKey(args: {
  report: any;
  reportType: any;
}) {
  const meta = getMetaObject(args.report?.meta);

  return (
    asString(args.reportType?.key) ||
    asString(args.report?.report_type_key) ||
    asString(args.report?.reportTypeKey) ||
    asString(meta?.report_type_key) ||
    asString(meta?.reportTypeKey) ||
    asString(meta?.report_type) ||
    ""
  );
}

function pickReportTitle(args: {
  report: any;
  advertiserName: string;
  reportTypeName: string;
}) {
  return (
    asString(args.report?.title) ||
    `${args.advertiserName || "광고주"} ${args.reportTypeName || "성과 보고서"}`
  );
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id: idRaw } = await ctx.params;
    const reportId = asString(idRaw);

    if (!reportId) {
      return jsonError(400, "REPORT_ID_REQUIRED");
    }

    const { user, error: authErr } = await getActor(req);

    if (authErr || !user) {
      return jsonError(401, "UNAUTHORIZED");
    }

    const report = await fetchReportDetail(reportId);

    if (!report) {
      return jsonError(404, "REPORT_NOT_FOUND");
    }

    const access = await assertReportAccess({
      userId: user.id,
      report,
    });

    if (!access.ok) {
      return jsonError(access.status, access.message, {
        role: access.role || null,
      });
    }

    const [advertiser, reportType] = await Promise.all([
      fetchAdvertiserInfo(asString((report as any)?.advertiser_id)),
      fetchReportTypeInfo(asString((report as any)?.report_type_id)),
    ]);

    const rowsResult = await fetchRowsForPpt({
      reportId,
      currentIngestionId: asString((report as any)?.current_ingestion_id),
    });

    const rows = rowsResult.rows;

    if (!rows.length) {
      return jsonError(409, "REPORT_ROWS_EMPTY", {
        message: "PPT를 생성할 rows를 찾지 못했습니다.",
        ingestion_id_used: rowsResult.ingestionIdUsed || null,
        fallback_used: rowsResult.fallbackUsed,
      });
    }

    const advertiserName = pickAdvertiserName({
      report,
      advertiser,
    });

    const reportTypeName = pickReportTypeName({
      report,
      reportType,
    });

    const reportTypeKey = pickReportTypeKey({
      report,
      reportType,
    });

    const reportTitle = pickReportTitle({
      report,
      advertiserName,
      reportTypeName,
    });

    const deck = buildPptReportData({
      rows,
      advertiserName,
      reportTypeName,
      reportTypeKey,
      reportTitle,
    });

    const insights = buildPptInsights({
      deck,
    });

    const fileName = buildDownloadFileName({
      advertiserName,
      reportTypeName,
      reportId,
    });

    const buffer = await writePptxBufferFromReportDeck({
      deck,
      insights,
      fileName,
    });

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          fileName,
        )}`,
        "Cache-Control": "no-store",
        "X-Report-Id": reportId,
        "X-Report-Rows-Count": String(rows.length),
        "X-Report-Ingestion-Id": rowsResult.ingestionIdUsed || "",
        "X-Report-Ingestion-Fallback": rowsResult.fallbackUsed ? "1" : "0",
        "X-PPT-Slides-Count": String(deck.slides.length + 2),
        "X-PPT-Mode": "data-driven",
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");

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

    if (msg.startsWith("MASTER_MEMBERSHIP_CHECK_FAILED:")) {
      return jsonError(500, "MASTER_MEMBERSHIP_CHECK_FAILED", {
        detail: msg.replace("MASTER_MEMBERSHIP_CHECK_FAILED:", ""),
      });
    }

    if (msg.startsWith("REPORT_FETCH_FAILED:")) {
      return jsonError(500, "REPORT_FETCH_FAILED", {
        detail: msg.replace("REPORT_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("ADVERTISER_FETCH_FAILED:")) {
      return jsonError(500, "ADVERTISER_FETCH_FAILED", {
        detail: msg.replace("ADVERTISER_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("REPORT_TYPE_FETCH_FAILED:")) {
      return jsonError(500, "REPORT_TYPE_FETCH_FAILED", {
        detail: msg.replace("REPORT_TYPE_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("REPORT_ROWS_FETCH_FAILED:")) {
      return jsonError(500, "REPORT_ROWS_FETCH_FAILED", {
        detail: msg.replace("REPORT_ROWS_FETCH_FAILED:", ""),
      });
    }

    if (msg.startsWith("REPORT_ROWS_INGESTION_LOOKUP_FAILED:")) {
      return jsonError(500, "REPORT_ROWS_INGESTION_LOOKUP_FAILED", {
        detail: msg.replace("REPORT_ROWS_INGESTION_LOOKUP_FAILED:", ""),
      });
    }

    if (msg.startsWith("REPORT_ROWS_TOO_LARGE_FOR_PPT:")) {
      const parts = msg.split(":");
      return jsonError(413, "REPORT_ROWS_TOO_LARGE_FOR_PPT", {
        rows_count: Number(parts[1] || 0),
        max_rows: Number(parts[2] || MAX_REPORT_ROWS_FOR_PPT),
        message:
          "현재 PPT 생성은 최대 150,000 rows까지 지원합니다. 이후 aggregate snapshot 구조로 확장할 수 있습니다.",
      });
    }

    return jsonError(500, "PPT_GENERATION_FAILED", {
      detail: e?.message || String(e),
    });
  }
}
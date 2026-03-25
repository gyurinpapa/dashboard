// app/report-builder/[id]/export-builder/page.tsx

import { notFound, redirect } from "next/navigation";
import ExportBuilderClient from "@/app/components/export-builder/ExportBuilderClient";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { buildExportPayloadsFromRows } from "@/src/lib/export-builder/buildExportPayloadsFromRows";
import type { ExportPeriod } from "@/src/lib/export-builder/period";
import {
  buildExportPeriodLabel,
  createInitialExportPeriod,
  filterRowsByExportPeriod,
  normalizeExportPeriod,
} from "@/src/lib/export-builder/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    advertiserName?: string;
    reportTypeName?: string;
    periodLabel?: string;
    periodStart?: string;
    periodEnd?: string;
    periodPreset?:
      | "this_month"
      | "last_month"
      | "last_7_days"
      | "last_30_days"
      | "custom";
    preset?: "starter-default" | "starter-summary-focused" | "starter-executive";
  }>;
};

function asString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
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

function flattenRow(rec: any) {
  const parsed = tryParseJson(rec?.row) || {};

  const out: any = {
    ...parsed,

    id: rec?.id ?? parsed?.id ?? null,
    __row_id: rec?.id ?? parsed?.__row_id ?? parsed?.id ?? null,
    report_id: rec?.report_id ?? null,
    ingestion_id: rec?.ingestion_id ?? null,
    created_at: rec?.created_at ?? null,

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
      .select("id, report_id, ingestion_id, row, created_at")
      .eq("report_id", reportId)
      .eq("ingestion_id", ingestionId)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

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

  if (error) {
    throw new Error(error.message);
  }

  const latest = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return asString((latest as any)?.ingestion_id);
}

function buildRedirectToReportDetail(reportId: string, message: string) {
  const qs = new URLSearchParams();
  qs.set("eb_notice", message);
  return `/reports/${reportId}?${qs.toString()}`;
}

function buildPeriodLabelFromInputs(args: {
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
}) {
  const periodLabel = asString(args.periodLabel);
  if (periodLabel) return periodLabel;

  const periodStart = asString(args.periodStart);
  const periodEnd = asString(args.periodEnd);

  if (periodStart && periodEnd) return `${periodStart} ~ ${periodEnd}`;
  if (periodStart) return periodStart;
  if (periodEnd) return periodEnd;

  return "기간 미정";
}

function normalizePeriodPreset(
  value: unknown
):
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days"
  | "custom" {
  return value === "this_month" ||
    value === "last_month" ||
    value === "last_7_days" ||
    value === "last_30_days" ||
    value === "custom"
    ? value
    : "custom";
}

function createInitialExportPeriodFromSearch(args: {
  rows: any[];
  periodStart?: string;
  periodEnd?: string;
  periodPreset?: "this_month" | "last_month" | "last_7_days" | "last_30_days" | "custom";
  periodLabel?: string;
}): ExportPeriod {
  const periodStart = asString(args.periodStart);
  const periodEnd = asString(args.periodEnd);
  const preset = normalizePeriodPreset(args.periodPreset);

  if (periodStart || periodEnd) {
    return normalizeExportPeriod({
      preset,
      start: periodStart || null,
      end: periodEnd || null,
      label:
        asString(args.periodLabel) ||
        buildExportPeriodLabel(periodStart || null, periodEnd || null),
    });
  }

  return createInitialExportPeriod(args.rows ?? []);
}

export default async function ReportExportBuilderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : undefined;

  const reportId = asString(id);

  if (!reportId) {
    console.log("[export-builder] invalid report id", { rawId: id });
    notFound();
  }

  const advertiserName = asString(sp?.advertiserName) || "광고주";
  const reportTypeName = asString(sp?.reportTypeName) || "리포트";

  const periodStart = asString(sp?.periodStart);
  const periodEnd = asString(sp?.periodEnd);
  const periodPreset = normalizePeriodPreset(sp?.periodPreset);

  const periodLabel = buildPeriodLabelFromInputs({
    periodLabel: sp?.periodLabel,
    periodStart,
    periodEnd,
  });

  const preset =
    sp?.preset === "starter-summary-focused" ||
    sp?.preset === "starter-executive" ||
    sp?.preset === "starter-default"
      ? sp.preset
      : "starter-default";

  const auth = await sbAuth();

  console.log("[export-builder auth]", {
    reportId,
    hasUser: !!auth.user,
    userId: auth.user?.id ?? null,
    error: auth.error ?? null,
  });

  if (auth.error || !auth.user?.id) {
    console.log("[export-builder redirect] auth failed -> /report-builder", {
      reportId,
      error: auth.error ?? null,
    });
    redirect("/report-builder");
  }

  const userId = auth.user.id;
  const admin = getSupabaseAdmin();

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, workspace_id, current_ingestion_id")
    .eq("id", reportId)
    .maybeSingle();

  console.log("[export-builder report]", {
    reportId,
    reportExists: !!report,
    workspaceId: report?.workspace_id ?? null,
    currentIngestionId: (report as any)?.current_ingestion_id ?? null,
    reportError: reportError ?? null,
  });

  if (reportError) {
    throw new Error(reportError.message);
  }

  if (!report) {
    console.log("[export-builder notFound] report not found", { reportId });
    notFound();
  }

  const { data: wm, error: wmError } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", report.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();

  console.log("[export-builder membership]", {
    reportId,
    userId,
    reportWorkspaceId: report.workspace_id ?? null,
    hasMembership: !!wm,
    role: wm?.role ?? null,
    membershipError: wmError ?? null,
  });

  if (wmError) {
    throw new Error(wmError.message);
  }

  if (!wm) {
    console.log("[export-builder redirect] membership missing -> /report-builder", {
      reportId,
      userId,
      reportWorkspaceId: report.workspace_id ?? null,
    });
    redirect("/report-builder");
  }

  const currentIngestionId = asString((report as any).current_ingestion_id);

  let rawRows: any[] = [];
  let ingestionIdUsed = currentIngestionId;
  let fallbackUsed = false;

  if (currentIngestionId) {
    rawRows = await fetchRowsByIngestion(admin, reportId, currentIngestionId);

    console.log("[export-builder rows] current ingestion fetch", {
      reportId,
      currentIngestionId,
      rawRowsLen: rawRows.length,
    });
  }

  if (!rawRows.length) {
    const latestIngestionId = await findLatestIngestionId(admin, reportId);

    console.log("[export-builder rows] latest ingestion lookup", {
      reportId,
      latestIngestionId: latestIngestionId || null,
    });

    if (latestIngestionId) {
      const latestRows = await fetchRowsByIngestion(admin, reportId, latestIngestionId);

      console.log("[export-builder rows] latest ingestion fetch", {
        reportId,
        latestIngestionId,
        latestRowsLen: latestRows.length,
      });

      if (latestRows.length) {
        rawRows = latestRows;
        ingestionIdUsed = latestIngestionId;
        fallbackUsed = latestIngestionId !== currentIngestionId;
      }
    }
  }

  if (!rawRows.length) {
    const notice =
      "Export Builder를 열 수 없습니다. 먼저 보고서 상세 페이지에서 CSV 업로드 + 파싱을 완료해 실제 rows를 생성해 주세요.";

    console.log("[export-builder redirect] no rows found -> /reports/[id]", {
      reportId,
      currentIngestionId: currentIngestionId || null,
      ingestionIdUsed: ingestionIdUsed || null,
      fallbackUsed,
      notice,
    });

    redirect(buildRedirectToReportDetail(reportId, notice));
  }

  const rows = rawRows.map(flattenRow);

  /**
   * export-builder 초기 진입 시점의 초기 export 기간
   * - searchParams 기간이 있으면 그것을 우선 사용
   * - 없으면 실제 rows date range 기준으로 custom 초기화
   */
  const initialExportPeriod = createInitialExportPeriodFromSearch({
    rows,
    periodStart,
    periodEnd,
    periodPreset,
    periodLabel,
  });

  /**
   * 초기 렌더용 rows
   * - client 내부와 동일하게 export-builder period 유틸 기준으로 맞춤
   * - 이후 실제 편집 중 재계산 기준 원본은 ExportBuilderClient의 allRows + exportPeriod
   */
  const rowsForInitialExport = filterRowsByExportPeriod(
    rows ?? [],
    initialExportPeriod
  );

  if ((periodStart || periodEnd) && !rowsForInitialExport.length) {
    console.log(
      "[export-builder period filter] rows became empty after initial period filter",
      {
        reportId,
        rawRowsLen: rows.length,
        rowsForInitialExportLen: rowsForInitialExport.length,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        periodPreset,
      }
    );
  }

  const initialSectionPayloads = buildExportPayloadsFromRows(
    rowsForInitialExport ?? []
  );

  const reportTitle = `${advertiserName} 광고 성과 리포트`;
  const generatedAtLabel = ingestionIdUsed ? `ingestion ${ingestionIdUsed}` : undefined;

  console.log("[export-builder payloads]", {
    reportId,
    rawRowsLen: rows.length,
    rowsForInitialExportLen: rowsForInitialExport.length,
    ingestionIdUsed: ingestionIdUsed || null,
    fallbackUsed,
    payloadKeys: Object.keys(initialSectionPayloads ?? {}),
    periodStart: initialExportPeriod.start || null,
    periodEnd: initialExportPeriod.end || null,
    periodPreset: initialExportPeriod.preset,
    periodLabel: initialExportPeriod.label || null,
  });

  return (
    <ExportBuilderClient
      initialInput={{
        reportId,
        advertiserName,
        reportTypeName,
        periodLabel: initialExportPeriod.label || periodLabel,
        preset,
      }}
      meta={{
        advertiserName,
        reportTitle,
        reportTypeName,
        periodLabel: initialExportPeriod.label || periodLabel,
        preset,
        generatedAtLabel,
      }}
      sectionPayloads={initialSectionPayloads}
      allRows={rows}
      initialExportPeriod={initialExportPeriod}
    />
  );
}
// app/report-builder/[id]/export-builder/page.tsx

import { notFound, redirect } from "next/navigation";
import ExportBuilderClient from "@/app/components/export-builder/ExportBuilderClient";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";
import { isTrueMasterUser } from "@/src/lib/true-master-access";
import type { ExportPeriodPreset } from "@/src/lib/export-builder/period";
import {
  buildExportPeriodLabel,
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
    periodPreset?: ExportPeriodPreset;
    preset?:
      | "starter-default"
      | "starter-summary-focused"
      | "starter-executive";
  }>;
};

type ReportRecord = {
  id: string;
  workspace_id: string | null;
  advertiser_id: string | null;
  report_type_id: string | null;
  title: string | null;
  status: string | null;
  current_ingestion_id: string | null;
  draft_period_start: string | null;
  draft_period_end: string | null;
  published_period_start: string | null;
  published_period_end: string | null;
  period_start: string | null;
  period_end: string | null;
  meta: any;
};

function asString(value: unknown) {
  if (value == null) return "";

  const text = String(value).trim();

  if (!text) return "";
  if (text.toLowerCase() === "null") return "";
  if (text.toLowerCase() === "undefined") return "";

  return text;
}

function getMetaObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, any>;
}

function normalizePeriodPreset(value: unknown): ExportPeriodPreset {
  if (
    value === "this_month" ||
    value === "last_month" ||
    value === "last_7_days" ||
    value === "last_14_days" ||
    value === "last_30_days" ||
    value === "custom"
  ) {
    return value;
  }

  return "custom";
}

function buildRedirectToReportDetail(reportId: string, message: string) {
  const qs = new URLSearchParams();
  qs.set("eb_notice", message);

  return `/reports/${reportId}?${qs.toString()}`;
}

function pickInitialDateRange(args: {
  report: ReportRecord;
  periodStart?: string;
  periodEnd?: string;
}) {
  const searchStart = asString(args.periodStart);
  const searchEnd = asString(args.periodEnd);

  if (searchStart || searchEnd) {
    return {
      dateFrom: searchStart || undefined,
      dateTo: searchEnd || undefined,
    };
  }

  const report = args.report;

  const dateFrom =
    asString(report.draft_period_start) ||
    asString(report.published_period_start) ||
    asString(report.period_start);

  const dateTo =
    asString(report.draft_period_end) ||
    asString(report.published_period_end) ||
    asString(report.period_end);

  return {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
}

async function hasReportRows(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  reportId: string;
  currentIngestionId: string;
}) {
  const { admin, reportId, currentIngestionId } = args;

  if (currentIngestionId) {
    const { data, error } = await admin
      .from("report_rows")
      .select("id")
      .eq("report_id", reportId)
      .eq("ingestion_id", currentIngestionId)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    if (Array.isArray(data) && data.length > 0) {
      return true;
    }
  }

  const { data, error } = await admin
    .from("report_rows")
    .select("id")
    .eq("report_id", reportId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) && data.length > 0;
}

export default async function ReportExportBuilderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : undefined;

  const reportId = asString(id);

  if (!reportId) {
    notFound();
  }

  const auth = await sbAuth();

  if (auth.error || !auth.user?.id) {
    redirect("/report-builder");
  }

  const userId = auth.user.id;
  const admin = getSupabaseAdmin();

  const { data: rawReport, error: reportError } = await admin
    .from("reports")
    .select(
      [
        "id",
        "workspace_id",
        "advertiser_id",
        "report_type_id",
        "title",
        "status",
        "current_ingestion_id",
        "draft_period_start",
        "draft_period_end",
        "published_period_start",
        "published_period_end",
        "period_start",
        "period_end",
        "meta",
      ].join(", "),
    )
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    throw new Error(reportError.message);
  }

  if (!rawReport) {
    notFound();
  }

  const report = rawReport as unknown as ReportRecord;
  const workspaceId = asString(report.workspace_id);

  if (!workspaceId) {
    redirect(
      buildRedirectToReportDetail(
        reportId,
        "PPT Export Builder를 열 수 없습니다. 보고서의 workspace 정보를 확인해 주세요.",
      ),
    );
  }

  const actorIsTrueMaster = await isTrueMasterUser(userId);

  if (!actorIsTrueMaster) {
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      throw new Error(membershipError.message);
    }

    if (!membership) {
      redirect("/report-builder");
    }
  }

  const currentIngestionId = asString(report.current_ingestion_id);

  const rowsExist = await hasReportRows({
    admin,
    reportId,
    currentIngestionId,
  });

  if (!rowsExist) {
    redirect(
      buildRedirectToReportDetail(
        reportId,
        "PPT Export Builder를 열 수 없습니다. 먼저 CSV 업로드와 파싱을 완료해 실제 rows를 생성해 주세요.",
      ),
    );
  }

  const advertiserId = asString(report.advertiser_id);
  const reportTypeId = asString(report.report_type_id);

  const [advertiserResult, reportTypeResult] = await Promise.all([
    advertiserId
      ? admin
          .from("advertisers")
          .select("id, name")
          .eq("id", advertiserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reportTypeId
      ? admin
          .from("report_types")
          .select("id, key, name")
          .eq("id", reportTypeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (advertiserResult.error) {
    throw new Error(advertiserResult.error.message);
  }

  if (reportTypeResult.error) {
    throw new Error(reportTypeResult.error.message);
  }

  const meta = getMetaObject(report.meta);

  const advertiserName =
    asString(advertiserResult.data?.name) ||
    asString(sp?.advertiserName) ||
    asString(meta.advertiser_name) ||
    asString(meta.advertiserName) ||
    "광고주";

  const reportTypeName =
    asString(reportTypeResult.data?.name) ||
    asString(sp?.reportTypeName) ||
    asString(meta.report_type_name) ||
    asString(meta.reportTypeName) ||
    "리포트";

  const reportTypeKey =
    asString(reportTypeResult.data?.key) ||
    asString(meta.report_type_key) ||
    asString(meta.reportTypeKey) ||
    asString(meta.report_type);

  const initialDateRange = pickInitialDateRange({
    report,
    periodStart: sp?.periodStart,
    periodEnd: sp?.periodEnd,
  });

  const initialPeriod = normalizeExportPeriod({
    preset: normalizePeriodPreset(sp?.periodPreset),
    start: initialDateRange.dateFrom ?? null,
    end: initialDateRange.dateTo ?? null,
    label:
      asString(sp?.periodLabel) ||
      buildExportPeriodLabel(
        initialDateRange.dateFrom ?? null,
        initialDateRange.dateTo ?? null,
      ),
  });

  return (
    <ExportBuilderClient
      reportId={reportId}
      initialMeta={{
        advertiserName,
        reportTypeName,
        reportTypeKey,
        reportTitle: asString(report.title) || reportTypeName,
        periodLabel:
          initialPeriod.label ||
          buildExportPeriodLabel(
            initialDateRange.dateFrom ?? null,
            initialDateRange.dateTo ?? null,
          ),
      }}
      initialPeriod={initialPeriod}
    />
  );
}
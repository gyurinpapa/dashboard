"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ReportTemplate from "@/app/components/ReportTemplate";
import type { ReportPeriod } from "@/src/lib/report/period";
import { getRowsDateRange } from "@/src/lib/report/period";

type ReportRow = {
  id: string;
  title: string;
  status: "draft" | "ready" | "archived";
  meta: any;
  share_token?: string | null;

  // legacy
  period_start?: string | null;
  period_end?: string | null;

  // draft
  draft_period_start?: string | null;
  draft_period_end?: string | null;
  draft_period_preset?: string | null;
  draft_period_label?: string | null;

  // published
  published_period_start?: string | null;
  published_period_end?: string | null;
  published_period_preset?: string | null;
  published_period_label?: string | null;
  published_at?: string | null;

  advertiser_id?: string | null;
  advertiser_name?: string | null;
  report_type_name?: string | null;
  report_type_key?: string | null;
  updated_at?: string | null;
};

async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return { __nonjson: true, status: res.status, text: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { __nonjson: true, status: res.status, text };
  }
}

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function pickAdvertiserName(report: ReportRow | null) {
  if (!report) return "";
  return (
    asStr((report as any)?.advertiser_name) ||
    asStr(report?.meta?.advertiser_name) ||
    asStr(report?.meta?.advertiserName) ||
    ""
  );
}

function pickReportTypeName(report: ReportRow | null) {
  if (!report) return "";
  return (
    asStr((report as any)?.report_type_name) ||
    asStr((report as any)?.report_type_key) ||
    asStr(report?.meta?.report_type_name) ||
    asStr(report?.meta?.reportTypeName) ||
    asStr(report?.meta?.report_type_key) ||
    asStr(report?.meta?.reportTypeKey) ||
    ""
  );
}

function pickReportTypeKey(report: ReportRow | null) {
  if (!report) return "";
  return (
    asStr((report as any)?.report_type_key) ||
    asStr(report?.meta?.report_type_key) ||
    asStr(report?.meta?.reportTypeKey) ||
    ""
  );
}

const MemoReportTemplate = memo(ReportTemplate);

export default function ShareReportPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => String(params?.token ?? "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const advertiserName = useMemo(() => pickAdvertiserName(report), [report]);
  const reportTypeName = useMemo(() => pickReportTypeName(report), [report]);
  const reportTypeKey = useMemo(() => pickReportTypeKey(report), [report]);

  const shareReportPeriod = useMemo<ReportPeriod>(() => {
    const publishedStart = asStr(report?.published_period_start);
    const publishedEnd = asStr(report?.published_period_end);

    if (publishedStart && publishedEnd) {
      return {
        preset: "custom",
        startDate: publishedStart,
        endDate: publishedEnd,
      };
    }

    const legacyStart = asStr(report?.period_start);
    const legacyEnd = asStr(report?.period_end);

    if (legacyStart && legacyEnd) {
      return {
        preset: "custom",
        startDate: legacyStart,
        endDate: legacyEnd,
      };
    }

    const range = getRowsDateRange(rows as any[]);
    if (range?.startDate && range?.endDate) {
      return {
        preset: "custom",
        startDate: range.startDate,
        endDate: range.endDate,
      };
    }

    return {
      preset: "custom",
      startDate: "",
      endDate: "",
    };
  }, [
    report?.published_period_start,
    report?.published_period_end,
    report?.period_start,
    report?.period_end,
    rows,
  ]);

  useEffect(() => {
    if (!token) {
      setError("공유 토큰이 없습니다.");
      setLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/share/${token}`, {
          cache: "no-store",
        });

        const json = await safeReadJson(res);

        if (!alive) return;

        if (!res.ok || !json?.ok) {
          setError(asStr(json?.error) || "공유 리포트 조회 실패");
          return;
        }

        setReport((json.report ?? null) as ReportRow | null);
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setCreativesMap(
          json.creativesMap && typeof json.creativesMap === "object"
            ? json.creativesMap
            : {}
        );
      } catch (e: any) {
        if (!alive) return;
        setError(asStr(e?.message) || "Unknown error");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) {
    return <main className="p-6">Loading...</main>;
  }

  if (error) {
    return <main className="p-6">{error}</main>;
  }

  return (
    <MemoReportTemplate
      rows={rows}
      isLoading={false}
      creativesMap={creativesMap}
      advertiserName={advertiserName}
      reportTypeName={reportTypeName}
      reportTypeKey={reportTypeKey}
      reportPeriod={shareReportPeriod}
      onChangeReportPeriod={() => {}}
      hidePeriodEditor={true}
      hideTabPeriodText={true}
    />
  );
}
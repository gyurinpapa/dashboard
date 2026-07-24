"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  period_start?: string | null;
  period_end?: string | null;

  draft_period_start?: string | null;
  draft_period_end?: string | null;
  draft_period_preset?: string | null;
  draft_period_label?: string | null;

  published_period_start?: string | null;
  published_period_end?: string | null;
  published_period_preset?: string | null;
  published_period_label?: string | null;
  published_at?: string | null;

  advertiser_id?: string | null;
  advertiser_name?: string | null;
  report_type_name?: string | null;
  report_type_key?: string | null;
  workspace_logo_url?: string | null;
  updated_at?: string | null;
};

type MonthGoalDraft = {
  revenue?: string | number | null;
  cost?: string | number | null;
  roas?: string | number | null;
  conversions?: string | number | null;
  clicks?: string | number | null;
  ctr?: string | number | null;
  cvr?: string | number | null;
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

function pickMonthGoal(report: ReportRow | null): MonthGoalDraft | null {
  const meta = report?.meta && typeof report.meta === "object" ? report.meta : {};
  const monthGoal =
    meta?.month_goal && typeof meta.month_goal === "object"
      ? meta.month_goal
      : null;

  if (!monthGoal) return null;

  return {
    revenue: asStr(monthGoal.revenue),
    cost: asStr(monthGoal.cost),
    roas: asStr(monthGoal.roas),
    conversions: asStr(monthGoal.conversions),
    clicks: asStr(monthGoal.clicks),
    ctr: asStr(monthGoal.ctr),
    cvr: asStr(monthGoal.cvr),
  };
}

function pickBrandSearchContracts(report: ReportRow | null) {
  const meta = report?.meta && typeof report.meta === "object" ? report.meta : {};
  const source =
    meta?.brand_search_contracts && typeof meta.brand_search_contracts === "object"
      ? meta.brand_search_contracts
      : null;

  if (!source || Array.isArray(source)) return null;

  const out: Record<string, { pc?: string | number | null; mobile?: string | number | null }> = {};

  for (const [month, value] of Object.entries(source)) {
    const monthKey = asStr(month);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    out[monthKey] = {
      pc: asStr((value as any)?.pc),
      mobile: asStr((value as any)?.mobile),
    };
  }

  return Object.keys(out).length ? out : null;
}

function LoadingShell({
  title,
  description,
  report,
}: {
  title: string;
  description: string;
  report?: ReportRow | null;
}) {
  const advertiserName = pickAdvertiserName(report ?? null);
  const reportTypeName = pickReportTypeName(report ?? null);

  return (
    <main className="min-h-screen bg-[#F7F8FA] p-6 text-slate-900">
      <section className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            리포트 준비 중
          </div>

          <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

          {report ? (
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">
                {report.title || "공개 리포트"}
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                {advertiserName ? <p>광고주: {advertiserName}</p> : null}
                {reportTypeName ? <p>리포트 유형: {reportTypeName}</p> : null}
                <p>
                  데이터 양에 따라 브라우저에서 분석 화면을 준비하는 데
                  시간이 걸릴 수 있습니다.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

const MemoReportTemplate = memo(ReportTemplate);

export default function ClientSlugReportPage() {
  const params = useParams<{ slug: string }>();
  const slug = useMemo(() => String(params?.slug ?? "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [creativesMap, setCreativesMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const [fallbackRowsRange, setFallbackRowsRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);

  const deferredRows = useDeferredValue(rows);
  const deferredCreativesMap = useDeferredValue(creativesMap);

  const creativesCommitTimerRef = useRef<number | null>(null);
  const rowsRangeTimerRef = useRef<number | null>(null);

  const advertiserName = useMemo(() => pickAdvertiserName(report), [report]);
  const reportTypeName = useMemo(() => pickReportTypeName(report), [report]);
  const reportTypeKey = useMemo(() => pickReportTypeKey(report), [report]);
  const workspaceLogoUrl = useMemo(
    () => asStr(report?.workspace_logo_url),
    [report?.workspace_logo_url],
  );
  const monthGoal = useMemo(() => pickMonthGoal(report), [report]);
  const brandSearchContracts = useMemo(() => pickBrandSearchContracts(report), [report]);

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

    if (fallbackRowsRange?.startDate && fallbackRowsRange?.endDate) {
      return {
        preset: "custom",
        startDate: fallbackRowsRange.startDate,
        endDate: fallbackRowsRange.endDate,
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
    fallbackRowsRange?.startDate,
    fallbackRowsRange?.endDate,
  ]);

  const hasRenderableRows = deferredRows.length > 0;

  useEffect(() => {
    const publishedStart = asStr(report?.published_period_start);
    const publishedEnd = asStr(report?.published_period_end);
    const legacyStart = asStr(report?.period_start);
    const legacyEnd = asStr(report?.period_end);

    const hasReportPeriod =
      (publishedStart && publishedEnd) || (legacyStart && legacyEnd);

    if (rowsRangeTimerRef.current !== null) {
      window.clearTimeout(rowsRangeTimerRef.current);
      rowsRangeTimerRef.current = null;
    }

    if (hasReportPeriod) {
      setFallbackRowsRange((prev) => (prev === null ? prev : null));
      return;
    }

    if (!rows.length) {
      setFallbackRowsRange((prev) => (prev === null ? prev : null));
      return;
    }

    rowsRangeTimerRef.current = window.setTimeout(() => {
      const range = getRowsDateRange(rows as any[]);
      const nextRange =
        range?.startDate && range?.endDate
          ? {
              startDate: range.startDate,
              endDate: range.endDate,
            }
          : null;

      setFallbackRowsRange((prev) => {
        const prevStart = prev?.startDate ?? "";
        const prevEnd = prev?.endDate ?? "";
        const nextStart = nextRange?.startDate ?? "";
        const nextEnd = nextRange?.endDate ?? "";

        if (prevStart === nextStart && prevEnd === nextEnd) {
          return prev;
        }

        return nextRange;
      });
    }, 0);

    return () => {
      if (rowsRangeTimerRef.current !== null) {
        window.clearTimeout(rowsRangeTimerRef.current);
        rowsRangeTimerRef.current = null;
      }
    };
  }, [
    report?.published_period_start,
    report?.published_period_end,
    report?.period_start,
    report?.period_end,
    rows,
  ]);

  useEffect(() => {
    if (!slug) {
      setError("광고주 URL이 없습니다.");
      setLoading(false);
      setRowsLoading(false);
      return;
    }

    let alive = true;

    if (creativesCommitTimerRef.current !== null) {
      window.clearTimeout(creativesCommitTimerRef.current);
      creativesCommitTimerRef.current = null;
    }
    if (rowsRangeTimerRef.current !== null) {
      window.clearTimeout(rowsRangeTimerRef.current);
      rowsRangeTimerRef.current = null;
    }

    setLoading(true);
    setRowsLoading(false);
    setError("");
    setReport(null);
    setRows([]);
    setCreativesMap({});
    setFallbackRowsRange(null);

    (async () => {
      try {
        const clientRes = await fetch(`/api/client/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });

        const clientJson = await safeReadJson(clientRes);

        if (!alive) return;

        if (!clientRes.ok || !clientJson?.ok) {
          setError(asStr(clientJson?.detail) || asStr(clientJson?.error) || "광고주 리포트 조회 실패");
          setLoading(false);
          setRowsLoading(false);
          return;
        }

        const shareToken = asStr(clientJson?.report?.share_token);

        if (!shareToken) {
          setError("발행된 공유 리포트가 없습니다.");
          setLoading(false);
          setRowsLoading(false);
          return;
        }

        const lightShareRes = await fetch(
          `/api/share/${encodeURIComponent(shareToken)}?includeRows=0`,
          {
            cache: "no-store",
          }
        );

        const lightShareJson = await safeReadJson(lightShareRes);

        if (!alive) return;

        if (!lightShareRes.ok || !lightShareJson?.ok) {
          setError(asStr(lightShareJson?.error) || "공유 리포트 조회 실패");
          setLoading(false);
          setRowsLoading(false);
          return;
        }

        const lightReport = (lightShareJson.report ?? null) as ReportRow | null;
        const lightCreativesMap =
          lightShareJson.creativesMap && typeof lightShareJson.creativesMap === "object"
            ? lightShareJson.creativesMap
            : {};

        setReport(lightReport);
        setRows([]);
        setLoading(false);
        setRowsLoading(true);

        creativesCommitTimerRef.current = window.setTimeout(() => {
          if (!alive) return;
          setCreativesMap(lightCreativesMap);
        }, 0);

        const fullShareRes = await fetch(
          `/api/share/${encodeURIComponent(shareToken)}?includeRows=1`,
          {
            cache: "no-store",
          }
        );

        const fullShareJson = await safeReadJson(fullShareRes);

        if (!alive) return;

        if (!fullShareRes.ok || !fullShareJson?.ok) {
          setError(asStr(fullShareJson?.error) || "공유 리포트 데이터 조회 실패");
          setRowsLoading(false);
          return;
        }

        const nextReport = (fullShareJson.report ?? lightReport ?? null) as ReportRow | null;
        const nextRows = Array.isArray(fullShareJson.rows) ? fullShareJson.rows : [];
        const nextCreativesMap =
          fullShareJson.creativesMap && typeof fullShareJson.creativesMap === "object"
            ? fullShareJson.creativesMap
            : lightCreativesMap;

        setReport(nextReport);
        setRows(nextRows);
        setRowsLoading(false);

        creativesCommitTimerRef.current = window.setTimeout(() => {
          if (!alive) return;
          setCreativesMap(nextCreativesMap);
        }, 0);
      } catch (e: any) {
        if (!alive) return;
        setError(asStr(e?.message) || "Unknown error");
        setLoading(false);
        setRowsLoading(false);
      }
    })();

    return () => {
      alive = false;

      if (creativesCommitTimerRef.current !== null) {
        window.clearTimeout(creativesCommitTimerRef.current);
        creativesCommitTimerRef.current = null;
      }

      if (rowsRangeTimerRef.current !== null) {
        window.clearTimeout(rowsRangeTimerRef.current);
        rowsRangeTimerRef.current = null;
      }
    };
  }, [slug]);

  if (loading) {
    return (
      <LoadingShell
        title="공개 리포트를 찾는 중입니다"
        description="광고주 고정 URL에서 최신 발행 리포트를 확인하고 있습니다."
        report={null}
      />
    );
  }

  if (error) {
    return <main className="p-6">{error}</main>;
  }

  if (rowsLoading) {
    return (
      <LoadingShell
        title="리포트 분석 데이터를 준비하고 있습니다"
        description="리포트 기본 정보는 확인되었습니다. 현재 리포트의 rows 데이터를 불러와 분석 화면을 준비하는 중입니다."
        report={report}
      />
    );
  }

  if (!hasRenderableRows) {
    return (
      <LoadingShell
        title="리포트 rows 데이터가 아직 없습니다"
        description="발행 리포트는 확인되었지만 분석 화면에 전달할 rows 데이터가 비어 있습니다. published ingestion 상태와 rows 저장 결과를 확인해 주세요."
        report={report}
      />
    );
  }

  return (
    <MemoReportTemplate
      rows={deferredRows}
      isLoading={false}
      creativesMap={deferredCreativesMap}
      advertiserName={advertiserName}
      reportTypeName={reportTypeName}
      reportTypeKey={reportTypeKey}
      workspaceLogoUrl={workspaceLogoUrl}
      reportPeriod={shareReportPeriod}
      monthGoal={monthGoal}
      brandSearchContracts={brandSearchContracts}
      onChangeReportPeriod={() => {}}
      hidePeriodEditor={true}
      hideTabPeriodText={true}
    />
  );
}
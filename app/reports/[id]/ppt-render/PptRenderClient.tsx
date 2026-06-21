"use client";

import { useEffect, useMemo, useState } from "react";
import ReportTemplate from "@/app/components/ReportTemplate";
import type { ReportPeriod } from "@/src/lib/report/period";
import type { TabKey } from "@/src/lib/report/types";
import type {
  PptExportFilterValues,
  PptExportPage,
} from "@/src/lib/report/ppt/export-config";
import {
  resolvePptExportFilters,
  validatePptExportRequestBody,
} from "@/src/lib/report/ppt/export-config";

type Props = {
  reportId: string;
  encodedPayload: string;
};

type ReportDetail = {
  id: string;
  title?: string | null;
  meta?: any;
  workspace_id?: string | null;
  advertiser_name?: string | null;
  advertiserName?: string | null;
  advertiser?: string | null;
  report_type_name?: string | null;
  reportTypeName?: string | null;
  report_type_key?: string | null;
  reportTypeKey?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  draft_period_start?: string | null;
  draft_period_end?: string | null;
  published_period_start?: string | null;
  published_period_end?: string | null;
};

type RenderPayload = {
  version?: number;
  globalFilters?: PptExportFilterValues | null;
  page?: PptExportPage | null;
};

type RenderData = {
  report: ReportDetail;
  rows: any[];
  creativesMap: Record<string, string>;
  workspaceLogoUrl: string;
  page: PptExportPage;
  filters: PptExportFilterValues;
};

type CaptureTarget = {
  tab: TabKey;
  slideIndex?: number;
};

function asString(value: any) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (text.toLowerCase() === "null") return "";
  if (text.toLowerCase() === "undefined") return "";
  return text;
}

function safeJsonParse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fetchJson(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: new Headers(init?.headers || undefined),
  });

  const raw = await response.text().catch(() => "");
  const json = safeJsonParse(raw);

  if (!response.ok || !json?.ok) {
    throw new Error(
      asString(json?.error) ||
        asString(json?.message) ||
        `REQUEST_FAILED_${response.status}`,
    );
  }

  return json;
}

function parsePayload(encodedPayload: string) {
  if (!encodedPayload) {
    throw new Error("PPT_RENDER_PAYLOAD_REQUIRED");
  }

  let decoded = "";

  try {
    decoded = decodeBase64Url(encodedPayload);
  } catch {
    throw new Error("PPT_RENDER_PAYLOAD_DECODE_FAILED");
  }

  const parsed = safeJsonParse(decoded) as RenderPayload | null;

  if (!parsed?.page) {
    throw new Error("PPT_RENDER_PAGE_REQUIRED");
  }

  const validation = validatePptExportRequestBody({
    config: {
      version: parsed.version ?? 1,
      globalFilters: parsed.globalFilters ?? {},
      pages: [parsed.page],
    },
  });

  if (!validation.ok) {
    const firstIssue = validation.issues?.[0];
    throw new Error(
      asString((firstIssue as any)?.message) ||
        asString((firstIssue as any)?.code) ||
        "INVALID_PPT_RENDER_PAYLOAD",
    );
  }

  const page = validation.config.pages[0];

  if (!page || !page.enabled) {
    throw new Error("PPT_RENDER_PAGE_DISABLED");
  }

  return {
    page,
    filters: resolvePptExportFilters({
      globalFilters: validation.config.globalFilters,
      pageFilters: page.filters,
    }),
  };
}

function getRawRow(row: any) {
  const raw = row?.row ?? row?.data ?? row?.payload ?? null;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(row ?? {}), ...raw };
  }

  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...(row ?? {}), ...parsed };
    }
  }

  return row ?? {};
}

function firstValue(row: any, keys: string[]) {
  const raw = getRawRow(row);

  for (const key of keys) {
    const value = asString(raw?.[key]);
    if (value) return value;
  }

  return "";
}

function normalizeComparable(value: any) {
  return asString(value).toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

function normalizeDate(value: any) {
  const raw = asString(value);
  if (!raw) return "";

  const match = raw.match(/^(\d{4})[.\/-]?(\d{1,2})[.\/-]?(\d{1,2})/);
  if (!match) return raw.slice(0, 10);

  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(
    match[3],
  ).padStart(2, "0")}`;
}

function matchesAllowed(value: string, allowed?: string[]) {
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  const normalized = normalizeComparable(value);
  return allowed.some((item) => normalizeComparable(item) === normalized);
}

function filterRows(rows: any[], filters: PptExportFilterValues) {
  const dateFrom = asString(filters.dateFrom);
  const dateTo = asString(filters.dateTo);

  return rows.filter((row) => {
    const date = normalizeDate(
      firstValue(row, [
        "date",
        "report_date",
        "day",
        "ymd",
        "dt",
        "segment_date",
        "stat_date",
      ]),
    );

    if (dateFrom && (!date || date < dateFrom)) return false;
    if (dateTo && (!date || date > dateTo)) return false;
    if (
      Array.isArray(filters.month) &&
      filters.month.length > 0 &&
      (!date || !matchesAllowed(date.slice(0, 7), filters.month))
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, [
          "source",
          "platform",
          "media_source",
          "media",
          "publisher",
          "매체",
        ]),
        filters.source,
      )
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, [
          "channel",
          "channel_name",
          "channelName",
          "media_channel",
          "채널",
        ]),
        filters.channel,
      )
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, [
          "device",
          "device_type",
          "deviceType",
          "platform_device",
          "기기",
        ]),
        filters.device,
      )
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, ["campaign_name", "campaignName", "campaign", "캠페인"]),
        filters.campaign,
      )
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, [
          "group_name",
          "adgroup_name",
          "ad_group_name",
          "groupName",
          "adgroupName",
          "group",
          "ad_group",
          "광고그룹",
          "그룹",
        ]),
        filters.group,
      )
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, [
          "keyword",
          "keyword_name",
          "search_term",
          "query",
          "term",
          "키워드",
        ]),
        filters.keyword,
      )
    ) {
      return false;
    }

    if (
      !matchesAllowed(
        firstValue(row, [
          "creative",
          "creative_name",
          "creativeName",
          "creative_file",
          "creativeFile",
          "imagepath",
          "imagePath",
          "image_path",
          "소재",
        ]),
        filters.creative,
      )
    ) {
      return false;
    }

    return true;
  });
}

function mapPageToCaptureTarget(page: PptExportPage): CaptureTarget {
  switch (page.type) {
    case "executive-summary":
      return { tab: "summary", slideIndex: 0 };
    case "source-overview":
      return { tab: "structure", slideIndex: 0 };
    case "source-detail":
      return { tab: "structure", slideIndex: 1 };
    case "campaign-review":
      return { tab: "structure", slideIndex: 2 };
    case "keyword-review":
      return { tab: "keyword", slideIndex: 0 };
    case "creative-analysis":
      return { tab: "creative", slideIndex: 0 };
    case "creative-review":
      return { tab: "creativeDetail", slideIndex: 0 };
    case "action-plan":
      return { tab: "decision" };
    case "priority-closing":
      return { tab: "hypothesis1" };
    case "thank-you":
      return { tab: "summary", slideIndex: 0 };
    default:
      return { tab: "summary", slideIndex: 0 };
  }
}

function pickMeta(report: ReportDetail) {
  return report?.meta && typeof report.meta === "object" && !Array.isArray(report.meta)
    ? report.meta
    : {};
}

function pickAdvertiserName(report: ReportDetail) {
  const meta = pickMeta(report);
  return (
    asString(report.advertiser_name) ||
    asString(report.advertiserName) ||
    asString(report.advertiser) ||
    asString(meta.advertiser_name) ||
    asString(meta.advertiserName) ||
    asString(meta.advertiser)
  );
}

function pickReportTypeName(report: ReportDetail) {
  const meta = pickMeta(report);
  return (
    asString(report.report_type_name) ||
    asString(report.reportTypeName) ||
    asString(meta.report_type_name) ||
    asString(meta.reportTypeName)
  );
}

function pickReportTypeKey(report: ReportDetail) {
  const meta = pickMeta(report);
  return (
    asString(report.report_type_key) ||
    asString(report.reportTypeKey) ||
    asString(meta.report_type_key) ||
    asString(meta.reportTypeKey)
  );
}

function pickMonthGoal(report: ReportDetail) {
  const meta = pickMeta(report);
  return meta.month_goal ?? meta.monthGoal ?? null;
}

function pickBrandSearchContracts(report: ReportDetail) {
  const meta = pickMeta(report);
  return meta.brand_search_contracts ?? meta.brandSearchContracts ?? null;
}

function buildReportPeriod(report: ReportDetail, filters: PptExportFilterValues): ReportPeriod {
  const meta = pickMeta(report);
  const startDate =
    asString(filters.dateFrom) ||
    asString(report.draft_period_start) ||
    asString(report.published_period_start) ||
    asString(report.period_start) ||
    asString(meta.draft_period_start) ||
    asString(meta.period_start);
  const endDate =
    asString(filters.dateTo) ||
    asString(report.draft_period_end) ||
    asString(report.published_period_end) ||
    asString(report.period_end) ||
    asString(meta.draft_period_end) ||
    asString(meta.period_end);

  return {
    preset: "custom",
    startDate,
    endDate,
  } as ReportPeriod;
}

async function loadRenderData(reportId: string, encodedPayload: string): Promise<RenderData> {
  const { page, filters } = parsePayload(encodedPayload);

  const [reportJson, rowsJson, creativesJson] = await Promise.all([
    fetchJson(`/api/reports/${encodeURIComponent(reportId)}`),
    fetchJson(`/api/reports/${encodeURIComponent(reportId)}/rows`),
    fetchJson(
      `/api/reports/${encodeURIComponent(
        reportId,
      )}/assets/creatives/map?expiresIn=3600&mode=expanded`,
    ).catch(() => ({ creativesMap: {} })),
  ]);

  const report = (reportJson.report ?? {}) as ReportDetail;
  const rows = Array.isArray(rowsJson.rows) ? rowsJson.rows : [];
  const filteredRows = filterRows(rows, filters);

  let workspaceLogoUrl = "";
  const workspaceId = asString(report.workspace_id);

  if (workspaceId) {
    const workspaceJson = await fetchJson("/api/workspaces/list").catch(() => null);
    const workspaces = Array.isArray(workspaceJson?.workspaces)
      ? workspaceJson.workspaces
      : [];
    const matched = workspaces.find(
      (item: any) => asString(item?.workspace_id) === workspaceId,
    );
    workspaceLogoUrl = asString(matched?.workspace_logo_url);
  }

  return {
    report,
    rows: filteredRows,
    creativesMap:
      creativesJson?.creativesMap && typeof creativesJson.creativesMap === "object"
        ? creativesJson.creativesMap
        : {},
    workspaceLogoUrl,
    page,
    filters,
  };
}

function setDocumentRenderState(state: "loading" | "ready" | "error", message = "") {
  document.documentElement.dataset.pptRenderState = state;
  document.documentElement.dataset.pptRenderMessage = message;
}

export default function PptRenderClient({ reportId, encodedPayload }: Props) {
  const [data, setData] = useState<RenderData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDocumentRenderState("loading");

    loadRenderData(reportId, encodedPayload)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError("");
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message || "PPT_RENDER_FAILED");
        setData(null);
        setDocumentRenderState("error", message || "PPT_RENDER_FAILED");
      });

    return () => {
      cancelled = true;
    };
  }, [encodedPayload, reportId]);

  const target = useMemo(
    () => (data ? mapPageToCaptureTarget(data.page) : null),
    [data],
  );

  useEffect(() => {
    if (!data || !target) return;

    let cancelled = false;

    const markReady = async () => {
      try {
        await document.fonts.ready;

        const images = Array.from(document.images);
        await Promise.all(
          images.map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            });
          }),
        );

        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });

        if (!cancelled) {
          setDocumentRenderState("ready");
        }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : String(cause);
          setDocumentRenderState("error", message || "PPT_RENDER_READY_FAILED");
        }
      }
    };

    void markReady();

    return () => {
      cancelled = true;
    };
  }, [data, target]);

  if (error) {
    return (
      <main className="flex h-[900px] w-[1600px] items-center justify-center bg-white p-16">
        <div
          data-ppt-render-error="true"
          className="max-w-3xl rounded-3xl border border-rose-200 bg-rose-50 px-8 py-7 text-center"
        >
          <h1 className="text-xl font-semibold text-rose-900">PPT 렌더링 실패</h1>
          <p className="mt-3 break-words text-sm leading-6 text-rose-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!data || !target) {
    return (
      <main className="flex h-[900px] w-[1600px] items-center justify-center bg-white">
        <div data-ppt-render-loading="true" className="text-sm font-semibold text-slate-500">
          PPT 화면을 준비하고 있습니다.
        </div>
      </main>
    );
  }

  if (data.page.type === "thank-you") {
    return (
      <main
        data-ppt-capture-root="true"
        data-ppt-ready="true"
        data-ppt-tab="thank-you"
        data-ppt-slide-index="0"
        className="flex h-[900px] w-[1600px] items-center justify-center overflow-hidden bg-[#F8F4ED] p-20"
      >
        <div className="w-full max-w-5xl text-center">
          <div className="text-sm font-semibold tracking-[0.28em] text-[#7FA6C4]">
            ETRYLUE PERFORMANCE
          </div>
          <h1 className="mt-8 text-6xl font-semibold tracking-[-0.04em] text-slate-900">
            {asString((data.page as any).title) || "Thank you"}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-2xl leading-10 text-slate-600">
            {asString((data.page as any).subtitle) || "성과를 다음 실행으로 연결합니다."}
          </p>
          <div className="mx-auto mt-12 h-1 w-40 rounded-full bg-[#7FA6C4]" />
        </div>
      </main>
    );
  }

  const reportPeriod = buildReportPeriod(data.report, data.filters);

  return (
    <main
      data-ppt-render-page="true"
      className="h-[900px] w-[1600px] overflow-hidden bg-white"
    >
      <ReportTemplate
        rows={data.rows}
        creativesMap={data.creativesMap}
        advertiserName={pickAdvertiserName(data.report)}
        reportTypeName={pickReportTypeName(data.report)}
        reportTypeKey={pickReportTypeKey(data.report)}
        workspaceLogoUrl={data.workspaceLogoUrl}
        reportPeriod={reportPeriod}
        onChangeReportPeriod={() => undefined}
        monthGoal={pickMonthGoal(data.report)}
        brandSearchContracts={pickBrandSearchContracts(data.report)}
        readOnlyHeader
        hidePeriodEditor
        hideTabPeriodText
        forcedTab={target.tab}
        forcedSlideIndex={target.slideIndex}
        exportMode
      />
    </main>
  );
}

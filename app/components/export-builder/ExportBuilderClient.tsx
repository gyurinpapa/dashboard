// app/components/export-builder/ExportBuilderClient.tsx
"use client";

import { useMemo, useState } from "react";
import type {
  PptExportConfig,
  PptExportFilterValues,
  PptExportPage,
  PptExportPageDefinition,
  PptExportPageOptions,
  PptExportPageType,
} from "@/src/lib/report/ppt/export-config";
import {
  DEFAULT_PPT_EXPORT_PAGE_TYPES,
  getPptExportPageDefinition,
  MAX_PPT_EXPORT_LIMIT,
  MAX_PPT_EXPORT_PAGES,
  normalizePptExportFilters,
  PPT_EXPORT_CONFIG_VERSION,
  PPT_EXPORT_PAGE_DEFINITIONS,
} from "@/src/lib/report/ppt/export-config";
import type {
  ExportPeriod,
  ExportPeriodPreset,
} from "@/src/lib/export-builder/period";
import {
  buildExportPeriodLabel,
  normalizeExportPeriod,
  resolveExportPeriodPreset,
} from "@/src/lib/export-builder/period";

type Props = {
  reportId: string;
  initialMeta: {
    advertiserName: string;
    reportTypeName: string;
    reportTypeKey?: string;
    reportTitle?: string;
    periodLabel?: string;
  };
  initialPeriod: ExportPeriod;
};

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

const PERIOD_PRESET_OPTIONS: ReadonlyArray<{
  value: ExportPeriodPreset;
  label: string;
}> = [
  { value: "this_month", label: "이번 달" },
  { value: "last_month", label: "지난 달" },
  { value: "last_7_days", label: "최근 7일" },
  { value: "last_14_days", label: "최근 14일" },
  { value: "last_30_days", label: "최근 30일" },
  { value: "custom", label: "직접 선택" },
];

const SORT_OPTIONS = [
  { value: "", label: "기본 정렬" },
  { value: "cost", label: "비용" },
  { value: "revenue", label: "매출" },
  { value: "conversions", label: "전환" },
  { value: "clicks", label: "클릭" },
  { value: "impressions", label: "노출" },
  { value: "roas", label: "ROAS" },
  { value: "ctr", label: "CTR" },
  { value: "cvr", label: "CVR" },
  { value: "cpc", label: "CPC" },
  { value: "cpa", label: "CPA" },
] as const;

const CATEGORY_LABELS: Record<
  PptExportPageDefinition["category"],
  string
> = {
  summary: "요약",
  performance: "성과",
  detail: "상세",
  insight: "인사이트",
  closing: "마무리",
};

function createPageId() {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `ppt-page-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildInitialPage(
  type: PptExportPageType,
  index: number,
): PptExportPage {
  const definition = getPptExportPageDefinition(type);

  return {
    id: `initial-${type}-${index + 1}`,
    type,
    enabled: true,
    filters: {},
    options: {
      title: definition.defaultTitle,
      subtitle: definition.defaultSubtitle ?? "",
      sortDirection: "desc",
      limit: definition.supports.limit ? 10 : undefined,
      includeChart: definition.supports.chart ? true : undefined,
      includeTable: definition.supports.table ? true : undefined,
      includeInsight: definition.supports.insight ? true : undefined,
    },
  };
}

function buildInitialConfig(initialPeriod: ExportPeriod): PptExportConfig {
  return {
    version: PPT_EXPORT_CONFIG_VERSION,
    globalFilters: normalizePptExportFilters({
      dateFrom: initialPeriod.start ?? undefined,
      dateTo: initialPeriod.end ?? undefined,
    }),
    pages: DEFAULT_PPT_EXPORT_PAGE_TYPES.map(buildInitialPage),
  };
}

function clonePage(page: PptExportPage): PptExportPage {
  return {
    ...page,
    id: createPageId(),
    filters: {
      ...(page.filters ?? {}),
      month: page.filters?.month ? [...page.filters.month] : undefined,
      source: page.filters?.source ? [...page.filters.source] : undefined,
      channel: page.filters?.channel ? [...page.filters.channel] : undefined,
      device: page.filters?.device ? [...page.filters.device] : undefined,
      campaign: page.filters?.campaign
        ? [...page.filters.campaign]
        : undefined,
      group: page.filters?.group ? [...page.filters.group] : undefined,
      keyword: page.filters?.keyword ? [...page.filters.keyword] : undefined,
      creative: page.filters?.creative ? [...page.filters.creative] : undefined,
    },
    options: {
      ...(page.options ?? {}),
    },
  };
}

function parseCommaSeparatedValues(value: string): string[] | undefined {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length ? Array.from(new Set(values)) : undefined;
}

function formatCommaSeparatedValues(values?: string[]) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function toInputDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function pageTypeLabel(type: PptExportPageType) {
  return getPptExportPageDefinition(type).label;
}

function countEnabledPages(config: PptExportConfig) {
  return config.pages.filter((page) => page.enabled).length;
}

export default function ExportBuilderClient({
  reportId,
  initialMeta,
  initialPeriod,
}: Props) {
  const normalizedInitialPeriod = useMemo(
    () => normalizeExportPeriod(initialPeriod),
    [initialPeriod],
  );

  const [config, setConfig] = useState<PptExportConfig>(() =>
    buildInitialConfig(normalizedInitialPeriod),
  );

  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    () => config.pages[0]?.id ?? null,
  );

  const [period, setPeriod] = useState<ExportPeriod>(
    normalizedInitialPeriod,
  );

  const [toast, setToast] = useState<ToastState>(null);
  const [showPayload, setShowPayload] = useState(false);

  const selectedPage = useMemo(() => {
    return (
      config.pages.find((page) => page.id === selectedPageId) ??
      config.pages[0] ??
      null
    );
  }, [config.pages, selectedPageId]);

  const selectedDefinition = useMemo(() => {
    if (!selectedPage) return null;
    return getPptExportPageDefinition(selectedPage.type);
  }, [selectedPage]);

  const groupedLibrary = useMemo(() => {
    const out = new Map<
      PptExportPageDefinition["category"],
      PptExportPageDefinition[]
    >();

    for (const definition of PPT_EXPORT_PAGE_DEFINITIONS) {
      const current = out.get(definition.category) ?? [];
      current.push(definition);
      out.set(definition.category, current);
    }

    return out;
  }, []);

  const payload = useMemo<PptExportConfig>(() => {
    return {
      version: PPT_EXPORT_CONFIG_VERSION,
      globalFilters: normalizePptExportFilters(config.globalFilters),
      pages: config.pages.map((page) => ({
        ...page,
        filters: normalizePptExportFilters(page.filters),
        options: {
          ...(page.options ?? {}),
          title: page.options?.title?.trim() || undefined,
          subtitle: page.options?.subtitle?.trim() || undefined,
          metric: page.options?.metric?.trim() || undefined,
          sortBy: page.options?.sortBy?.trim() || undefined,
          limit:
            typeof page.options?.limit === "number"
              ? Math.min(
                  MAX_PPT_EXPORT_LIMIT,
                  Math.max(1, Math.round(page.options.limit)),
                )
              : undefined,
        },
      })),
    };
  }, [config]);

  function updateGlobalFilters(
    patch: Partial<PptExportFilterValues>,
  ) {
    setConfig((prev) => ({
      ...prev,
      globalFilters: normalizePptExportFilters({
        ...prev.globalFilters,
        ...patch,
      }),
    }));
  }

  function updatePage(
    pageId: string,
    updater: (page: PptExportPage) => PptExportPage,
  ) {
    setConfig((prev) => ({
      ...prev,
      pages: prev.pages.map((page) =>
        page.id === pageId ? updater(page) : page,
      ),
    }));
  }

  function patchSelectedPageOptions(
    patch: Partial<PptExportPageOptions>,
  ) {
    if (!selectedPage) return;

    updatePage(selectedPage.id, (page) => ({
      ...page,
      options: {
        ...(page.options ?? {}),
        ...patch,
      },
    }));
  }

  function patchSelectedPageFilters(
    patch: Partial<PptExportFilterValues>,
  ) {
    if (!selectedPage) return;

    updatePage(selectedPage.id, (page) => ({
      ...page,
      filters: normalizePptExportFilters({
        ...(page.filters ?? {}),
        ...patch,
      }),
    }));
  }

  function handleAddPage(type: PptExportPageType) {
    if (config.pages.length >= MAX_PPT_EXPORT_PAGES) {
      setToast({
        type: "error",
        message: `본문 페이지는 최대 ${MAX_PPT_EXPORT_PAGES}장까지 구성할 수 있습니다.`,
      });
      return;
    }

    const definition = getPptExportPageDefinition(type);

    const nextPage: PptExportPage = {
      id: createPageId(),
      type,
      enabled: true,
      filters: {},
      options: {
        title: definition.defaultTitle,
        subtitle: definition.defaultSubtitle ?? "",
        sortDirection: "desc",
        limit: definition.supports.limit ? 10 : undefined,
        includeChart: definition.supports.chart ? true : undefined,
        includeTable: definition.supports.table ? true : undefined,
        includeInsight: definition.supports.insight ? true : undefined,
      },
    };

    setConfig((prev) => ({
      ...prev,
      pages: [...prev.pages, nextPage],
    }));

    setSelectedPageId(nextPage.id);
    setToast({
      type: "success",
      message: `${definition.label} 페이지를 추가했습니다.`,
    });
  }

  function handleDuplicatePage(pageId: string) {
    if (config.pages.length >= MAX_PPT_EXPORT_PAGES) {
      setToast({
        type: "error",
        message: `본문 페이지는 최대 ${MAX_PPT_EXPORT_PAGES}장까지 구성할 수 있습니다.`,
      });
      return;
    }

    const index = config.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;

    const cloned = clonePage(config.pages[index]);

    setConfig((prev) => {
      const pages = [...prev.pages];
      pages.splice(index + 1, 0, cloned);

      return {
        ...prev,
        pages,
      };
    });

    setSelectedPageId(cloned.id);
    setToast({
      type: "success",
      message: `${pageTypeLabel(cloned.type)} 페이지를 복제했습니다.`,
    });
  }

  function handleDeletePage(pageId: string) {
    if (config.pages.length <= 1) {
      setToast({
        type: "error",
        message: "본문 페이지는 최소 1장 이상 유지해야 합니다.",
      });
      return;
    }

    const index = config.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;

    const nextPages = config.pages.filter((page) => page.id !== pageId);

    setConfig((prev) => ({
      ...prev,
      pages: nextPages,
    }));

    if (selectedPageId === pageId) {
      setSelectedPageId(
        nextPages[Math.min(index, nextPages.length - 1)]?.id ?? null,
      );
    }

    setToast({
      type: "success",
      message: "페이지를 삭제했습니다.",
    });
  }

  function handleMovePage(pageId: string, direction: -1 | 1) {
    const index = config.pages.findIndex((page) => page.id === pageId);
    const targetIndex = index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >= config.pages.length
    ) {
      return;
    }

    setConfig((prev) => {
      const pages = [...prev.pages];
      const [moved] = pages.splice(index, 1);
      pages.splice(targetIndex, 0, moved);

      return {
        ...prev,
        pages,
      };
    });
  }

  function handleChangePeriodPreset(nextPreset: ExportPeriodPreset) {
    if (nextPreset === "custom") {
      setPeriod((prev) => ({
        ...prev,
        preset: "custom",
        label: buildExportPeriodLabel(prev.start, prev.end),
      }));
      return;
    }

    const resolved = resolveExportPeriodPreset(nextPreset);

    setPeriod(resolved);
    updateGlobalFilters({
      dateFrom: resolved.start ?? undefined,
      dateTo: resolved.end ?? undefined,
    });
  }

  function handleChangePeriodStart(value: string) {
    const next = normalizeExportPeriod({
      ...period,
      preset: "custom",
      start: value || null,
    });

    setPeriod(next);
    updateGlobalFilters({
      dateFrom: value || undefined,
    });
  }

  function handleChangePeriodEnd(value: string) {
    const next = normalizeExportPeriod({
      ...period,
      preset: "custom",
      end: value || null,
    });

    setPeriod(next);
    updateGlobalFilters({
      dateTo: value || undefined,
    });
  }

  function handleResetConfig() {
    const next = buildInitialConfig(normalizedInitialPeriod);

    setConfig(next);
    setPeriod(normalizedInitialPeriod);
    setSelectedPageId(next.pages[0]?.id ?? null);
    setToast({
      type: "info",
      message: "기본 PPT 페이지 구성으로 초기화했습니다.",
    });
  }

  function handlePreparePayload() {
    if (!countEnabledPages(payload)) {
      setToast({
        type: "error",
        message: "PPT에 포함할 페이지를 1장 이상 활성화해 주세요.",
      });
      return;
    }

    setShowPayload(true);
    setToast({
      type: "success",
      message:
        "PPT 생성 요청 payload 구성이 완료되었습니다. 서버 POST 연결은 다음 단계에서 진행합니다.",
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-5 px-4 py-5 xl:px-6">
        <header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#5F87A3]">
                Etrylue Performance
              </div>

              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                PPT Export Builder
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                {initialMeta.advertiserName} · {initialMeta.reportTypeName} ·{" "}
                {period.label || initialMeta.periodLabel || "기간 미정"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  표지 자동 포함
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  목차 자동 포함
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  본문 {config.pages.length}장
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  활성 {countEnabledPages(config)}장
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  16:9
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPayload((prev) => !prev)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {showPayload ? "Payload 닫기" : "Payload 확인"}
              </button>

              <button
                type="button"
                onClick={handleResetConfig}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                기본 구성 복원
              </button>

              <button
                type="button"
                onClick={handlePreparePayload}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                PPT 생성 준비
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3">
              <div className="text-sm font-bold text-slate-900">
                PPT 전체 공통 기간
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                페이지별 기간을 지정하면 이 공통 기간보다 우선 적용됩니다.
                현재 단계에서는 설정 payload만 구성합니다.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_180px_180px_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  기간 Preset
                </span>
                <select
                  value={period.preset}
                  onChange={(event) =>
                    handleChangePeriodPreset(
                      event.target.value as ExportPeriodPreset,
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                >
                  {PERIOD_PRESET_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  시작일
                </span>
                <input
                  type="date"
                  value={toInputDate(period.start)}
                  onChange={(event) =>
                    handleChangePeriodStart(event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  종료일
                </span>
                <input
                  type="date"
                  value={toInputDate(period.end)}
                  onChange={(event) =>
                    handleChangePeriodEnd(event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                />
              </label>

              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  적용 기간
                </span>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  {period.label || "기간 미설정"}
                </div>
              </div>
            </div>
          </div>

          {toast ? (
            <div
              className={[
                "mt-4 rounded-2xl border px-4 py-3 text-sm font-medium",
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : toast.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-blue-200 bg-blue-50 text-blue-700",
              ].join(" ")}
            >
              {toast.message}
            </div>
          ) : null}
        </header>

        {showPayload ? (
          <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white">
                  POST 요청 예정 Payload
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  다음 단계에서 `/api/reports/{reportId}/ppt`로 전달합니다.
                </div>
              </div>
            </div>

            <pre className="max-h-[480px] overflow-auto rounded-2xl bg-black/30 p-4 text-xs leading-6 text-slate-200">
              {JSON.stringify({ config: payload }, null, 2)}
            </pre>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[300px_minmax(420px,0.9fr)_minmax(460px,1.1fr)]">
          <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <div className="text-sm font-bold text-slate-900">
                페이지 라이브러리
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                현재 데이터 기반 PPT가 실제 지원하는 페이지 유형만
                제공합니다.
              </p>
            </div>

            <div className="mb-4 rounded-2xl border border-[#B7D7E3] bg-[#B7D7E3]/20 p-3">
              <div className="text-xs font-bold text-slate-700">
                고정 페이지
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div>✓ 표지</div>
                <div>✓ 목차</div>
              </div>
            </div>

            <div className="space-y-5">
              {Array.from(groupedLibrary.entries()).map(
                ([category, definitions]) => (
                  <div key={category}>
                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                      {CATEGORY_LABELS[category]}
                    </div>

                    <div className="space-y-2">
                      {definitions.map((definition) => (
                        <button
                          key={definition.type}
                          type="button"
                          onClick={() => handleAddPage(definition.type)}
                          className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#7FA6C4] hover:bg-[#B7D7E3]/15"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-slate-900">
                                {definition.label}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {definition.description}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">
                              추가
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </aside>

          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <div className="text-sm font-bold text-slate-900">
                선택된 PPT 페이지
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                배열 순서가 최종 PPT 출력 순서가 됩니다.
              </p>
            </div>

            <div className="space-y-3">
              {config.pages.map((page, index) => {
                const definition = getPptExportPageDefinition(page.type);
                const selected = selectedPage?.id === page.id;

                return (
                  <article
                    key={page.id}
                    className={[
                      "rounded-2xl border p-3 transition",
                      selected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPageId(page.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={[
                              "text-[11px] font-bold uppercase tracking-[0.14em]",
                              selected ? "text-slate-400" : "text-slate-400",
                            ].join(" ")}
                          >
                            Page {String(index + 1).padStart(2, "0")}
                          </div>

                          <div className="mt-1 truncate text-sm font-bold">
                            {page.options?.title?.trim() || definition.label}
                          </div>

                          <div
                            className={[
                              "mt-1 truncate text-xs",
                              selected ? "text-slate-300" : "text-slate-500",
                            ].join(" ")}
                          >
                            {definition.label}
                          </div>
                        </div>

                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold",
                            page.enabled
                              ? selected
                                ? "bg-emerald-400/15 text-emerald-200"
                                : "bg-emerald-50 text-emerald-700"
                              : selected
                                ? "bg-white/10 text-slate-300"
                                : "bg-slate-100 text-slate-500",
                          ].join(" ")}
                        >
                          {page.enabled ? "포함" : "제외"}
                        </span>
                      </div>
                    </button>

                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => handleMovePage(page.id, -1)}
                        disabled={index === 0}
                        className={[
                          "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                          index === 0
                            ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-500"
                            : selected
                              ? "border-white/20 bg-white/10 text-white"
                              : "border-slate-200 bg-white text-slate-600",
                        ].join(" ")}
                      >
                        위
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMovePage(page.id, 1)}
                        disabled={index === config.pages.length - 1}
                        className={[
                          "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                          index === config.pages.length - 1
                            ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-500"
                            : selected
                              ? "border-white/20 bg-white/10 text-white"
                              : "border-slate-200 bg-white text-slate-600",
                        ].join(" ")}
                      >
                        아래
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDuplicatePage(page.id)}
                        className={[
                          "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                          selected
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-slate-200 bg-white text-slate-600",
                        ].join(" ")}
                      >
                        복제
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePage(page.id)}
                        className={[
                          "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                          selected
                            ? "border-rose-300/30 bg-rose-400/10 text-rose-100"
                            : "border-rose-200 bg-rose-50 text-rose-600",
                        ].join(" ")}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            {!selectedPage || !selectedDefinition ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                설정할 페이지를 선택해 주세요.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    선택 페이지 설정
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {selectedDefinition.label} · {selectedDefinition.description}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        PPT 포함
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        비활성화하면 payload에는 남지만 PPT에서는 제외됩니다.
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={selectedPage.enabled}
                      onChange={(event) =>
                        updatePage(selectedPage.id, (page) => ({
                          ...page,
                          enabled: event.target.checked,
                        }))
                      }
                      className="h-5 w-5"
                    />
                  </label>
                </div>

                {selectedDefinition.supports.title ? (
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      페이지 제목
                    </span>
                    <input
                      value={selectedPage.options?.title ?? ""}
                      onChange={(event) =>
                        patchSelectedPageOptions({
                          title: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                    />
                  </label>
                ) : null}

                {selectedDefinition.supports.subtitle ? (
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      페이지 부제
                    </span>
                    <input
                      value={selectedPage.options?.subtitle ?? ""}
                      onChange={(event) =>
                        patchSelectedPageOptions({
                          subtitle: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                    />
                  </label>
                ) : null}

                {selectedDefinition.supports.dateRange ? (
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      페이지별 기간 Override
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="date"
                        value={toInputDate(selectedPage.filters?.dateFrom)}
                        onChange={(event) =>
                          patchSelectedPageFilters({
                            dateFrom: event.target.value || undefined,
                          })
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                      />

                      <input
                        type="date"
                        value={toInputDate(selectedPage.filters?.dateTo)}
                        onChange={(event) =>
                          patchSelectedPageFilters({
                            dateTo: event.target.value || undefined,
                          })
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                      />
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      비워두면 PPT 전체 공통 기간을 사용합니다.
                    </p>
                  </div>
                ) : null}

                {selectedDefinition.supports.month ? (
                  <FilterTextInput
                    label="월"
                    placeholder="예: 2026-05, 2026-06"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.month,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        month: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.source ? (
                  <FilterTextInput
                    label="소스"
                    placeholder="예: 네이버, 구글"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.source,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        source: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.channel ? (
                  <FilterTextInput
                    label="채널"
                    placeholder="예: search, display"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.channel,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        channel: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.device ? (
                  <FilterTextInput
                    label="기기"
                    placeholder="예: PC, MOBILE"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.device,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        device: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.campaign ? (
                  <FilterTextInput
                    label="캠페인"
                    placeholder="캠페인명 여러 개는 쉼표로 구분"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.campaign,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        campaign: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.group ? (
                  <FilterTextInput
                    label="그룹"
                    placeholder="그룹명 여러 개는 쉼표로 구분"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.group,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        group: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.keyword ? (
                  <FilterTextInput
                    label="키워드"
                    placeholder="키워드 여러 개는 쉼표로 구분"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.keyword,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        keyword: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.creative ? (
                  <FilterTextInput
                    label="소재"
                    placeholder="소재명 여러 개는 쉼표로 구분"
                    value={formatCommaSeparatedValues(
                      selectedPage.filters?.creative,
                    )}
                    onChange={(value) =>
                      patchSelectedPageFilters({
                        creative: parseCommaSeparatedValues(value),
                      })
                    }
                  />
                ) : null}

                {selectedDefinition.supports.sort ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                        정렬 기준
                      </span>
                      <select
                        value={selectedPage.options?.sortBy ?? ""}
                        onChange={(event) =>
                          patchSelectedPageOptions({
                            sortBy: event.target.value || undefined,
                          })
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                      >
                        {SORT_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                        정렬 방향
                      </span>
                      <select
                        value={
                          selectedPage.options?.sortDirection ?? "desc"
                        }
                        onChange={(event) =>
                          patchSelectedPageOptions({
                            sortDirection:
                              event.target.value === "asc" ? "asc" : "desc",
                          })
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                      >
                        <option value="desc">내림차순</option>
                        <option value="asc">오름차순</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {selectedDefinition.supports.limit ? (
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      출력 개수
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_PPT_EXPORT_LIMIT}
                      value={selectedPage.options?.limit ?? 10}
                      onChange={(event) =>
                        patchSelectedPageOptions({
                          limit: Math.min(
                            MAX_PPT_EXPORT_LIMIT,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400"
                    />
                  </label>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {selectedDefinition.supports.chart ? (
                    <OptionToggle
                      label="차트 포함"
                      checked={
                        selectedPage.options?.includeChart !== false
                      }
                      onChange={(checked) =>
                        patchSelectedPageOptions({
                          includeChart: checked,
                        })
                      }
                    />
                  ) : null}

                  {selectedDefinition.supports.table ? (
                    <OptionToggle
                      label="표 포함"
                      checked={
                        selectedPage.options?.includeTable !== false
                      }
                      onChange={(checked) =>
                        patchSelectedPageOptions({
                          includeTable: checked,
                        })
                      }
                    />
                  ) : null}

                  {selectedDefinition.supports.insight ? (
                    <OptionToggle
                      label="인사이트 포함"
                      checked={
                        selectedPage.options?.includeInsight !== false
                      }
                      onChange={(checked) =>
                        patchSelectedPageOptions({
                          includeInsight: checked,
                        })
                      }
                    />
                  ) : null}
                </div>

                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-700">
                    필터 옵션 연결 상태
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    현재는 UI와 payload 골격 단계입니다. 소스·캠페인·그룹
                    등의 실제 선택 목록은 다음 단계의 경량 옵션 API에서
                    연결합니다. raw rows는 브라우저로 전달하지 않습니다.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function FilterTextInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400"
      />
    </label>
  );
}

function OptionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}
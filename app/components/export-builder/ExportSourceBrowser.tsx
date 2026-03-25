// app/components/export-builder/ExportSourceBrowser.tsx
"use client";

import {
  getExportSection,
  isSectionAllowedForTemplateSlot,
} from "@/src/lib/export-builder/registry";
import type {
  ExportSectionKey,
  ExportTemplateKey,
} from "@/src/lib/export-builder/types";
import type { ExportTemplateSlotDefinition } from "@/src/lib/export-builder/types";
import {
  SOURCE_BROWSER_TABS,
  getSourceBrowserBlocksByTab,
  getSourceBrowserTab,
} from "@/src/lib/export-builder/source-browser-registry";
import type {
  SourceBrowserFilterState,
  SourceBrowserTabKey,
} from "@/src/lib/export-builder/source-browser-types";

type Props = {
  templateKey: ExportTemplateKey;
  slot: ExportTemplateSlotDefinition;
  activeTab: SourceBrowserTabKey;
  onChangeTab: (tab: SourceBrowserTabKey) => void;
  filters: SourceBrowserFilterState;
  onChangeFilters: (next: SourceBrowserFilterState) => void;
  monthOptions: string[];
  weekOptions: Array<{ weekKey: string; label: string }>;
  deviceOptions: string[];
  channelOptions: string[];
  onPickSection: (sectionKey: ExportSectionKey) => void;
};

function getCategoryLabel(category: string) {
  switch (category) {
    case "summary":
      return "요약";
    case "summary2":
      return "요약2";
    case "keyword":
      return "키워드";
    case "creative":
      return "소재";
    default:
      return category;
  }
}

function getViewTypeLabel(viewType?: string) {
  switch (viewType) {
    case "kpi":
      return "KPI";
    case "chart":
      return "차트";
    case "heatmap":
      return "히트맵";
    case "funnel":
      return "퍼널";
    case "goal":
      return "목표";
    case "table":
      return "표";
    default:
      return "섹션";
  }
}

export default function ExportSourceBrowser({
  templateKey,
  slot,
  activeTab,
  onChangeTab,
  filters,
  onChangeFilters,
  monthOptions,
  weekOptions,
  deviceOptions,
  channelOptions,
  onPickSection,
}: Props) {
  const activeTabInfo = getSourceBrowserTab(activeTab);
  const blocks = getSourceBrowserBlocksByTab(activeTab);

  const preferredSections = slot.preferredSections ?? [];
  const allowedSections = slot.allowedSections ?? [];

  const isSlotAllowed = (sectionKey: ExportSectionKey) => {
    const allowedByRegistry = isSectionAllowedForTemplateSlot(
      templateKey,
      slot.id,
      sectionKey
    );

    const allowedBySlot =
      allowedSections.length === 0 ? true : allowedSections.includes(sectionKey);

    return allowedByRegistry && allowedBySlot;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex flex-wrap gap-2">
        {SOURCE_BROWSER_TABS.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChangeTab(tab.key)}
              className={[
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                isActive
                  ? "border border-slate-900 bg-slate-900 text-white"
                  : tab.enabled
                  ? "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  : "border border-slate-200 bg-slate-100 text-slate-400",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Source Filters
        </div>

        <div className="grid grid-cols-1 gap-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              월
            </label>
            <select
              value={filters.selectedMonth}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  selectedMonth: e.target.value,
                  selectedWeek: "all",
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-slate-400"
            >
              <option value="all">전체</option>
              {monthOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              주차
            </label>
            <select
              value={filters.selectedWeek}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  selectedWeek: e.target.value,
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-slate-400"
            >
              <option value="all">전체</option>
              {weekOptions.map((item) => (
                <option key={item.weekKey} value={item.weekKey}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              기기
            </label>
            <select
              value={filters.selectedDevice}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  selectedDevice: e.target.value,
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-slate-400"
            >
              <option value="all">전체</option>
              {deviceOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              채널
            </label>
            <select
              value={filters.selectedChannel}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  selectedChannel: e.target.value,
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-slate-400"
            >
              <option value="all">전체</option>
              {channelOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          이 필터는 export-builder 내부 payload 계산에만 적용돼.
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-700">
            {activeTabInfo?.label ?? "탭"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {activeTabInfo?.description ?? ""}
          </div>
        </div>

        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">
          Slot: {slot.label}
        </div>
      </div>

      {!activeTabInfo?.enabled ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm text-slate-500">
          이 탭은 다음 단계에서 ReportTemplate 원본 구조와 더 가깝게 연결할 예정이야.
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm text-slate-500">
          현재 탭에서 선택 가능한 블록이 없어.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {blocks.map((item) => {
            if (!item.sectionKey) {
              return (
                <div
                  key={item.key}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left"
                >
                  <div className="text-xs font-semibold text-slate-900">
                    {item.label}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {item.description}
                  </div>
                </div>
              );
            }

            const section = getExportSection(item.sectionKey);
            const allowed = isSlotAllowed(item.sectionKey);
            const isPreferred = preferredSections.includes(item.sectionKey);
            const isRecommended =
              isPreferred || section.recommendedTemplates.includes(templateKey);

            return (
              <button
                key={item.key}
                type="button"
                disabled={!allowed}
                onClick={() => {
                  if (!allowed) return;
                  onPickSection(item.sectionKey!);
                }}
                className={[
                  "rounded-xl border px-3 py-3 text-left transition",
                  allowed
                    ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className={[
                        "truncate text-xs font-semibold",
                        allowed ? "text-slate-900" : "text-slate-400",
                      ].join(" ")}
                    >
                      {item.label}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {getCategoryLabel(section.category)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {getViewTypeLabel(section.viewType)}
                      </span>
                      {item.badge ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          {item.badge}
                        </span>
                      ) : null}
                      {allowed ? (
                        isPreferred ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            적합
                          </span>
                        ) : isRecommended ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                            추천
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            가능
                          </span>
                        )
                      ) : (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                          이 슬롯에는 부적합
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={[
                    "mt-2 line-clamp-2 text-[11px]",
                    allowed ? "text-slate-500" : "text-slate-400",
                  ].join(" ")}
                >
                  {item.description}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
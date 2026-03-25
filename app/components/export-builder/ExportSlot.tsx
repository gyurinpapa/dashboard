"use client";

import { useMemo, useState } from "react";
import {
  getExportSection,
  getFittedSectionsForTemplateSlot,
  isSectionAllowedForTemplateSlot,
} from "@/src/lib/export-builder/registry";
import type {
  ExportBlock,
  ExportPage,
  ExportSectionDefinition,
  ExportSectionKey,
  ExportTemplateSlotDefinition,
} from "@/src/lib/export-builder/types";

import type {
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "@/src/lib/export-builder/section-props";
import { buildSectionProps } from "@/src/lib/export-builder/section-resolver";
import { buildAutoInsight } from "@/src/lib/export-builder/insights";
import type {
  SourceBrowserFilterState,
  SourceBrowserTabKey,
} from "@/src/lib/export-builder/source-browser-types";
import ExportSourceBrowser from "./ExportSourceBrowser";

import ExportSummaryKPI from "./sections/ExportSummaryKPI";
import ExportSummaryChart from "./sections/ExportSummaryChart";
import ExportSummaryGoal from "./sections/ExportSummaryGoal";
import ExportSummary2Heatmap from "./sections/ExportSummary2Heatmap";
import ExportSummary2Funnel from "./sections/ExportSummary2Funnel";
import ExportKeywordTop10 from "./sections/ExportKeywordTop10";
import ExportCreativeTop8 from "./sections/ExportCreativeTop8";

type Props = {
  page: ExportPage;
  slot: ExportTemplateSlotDefinition;
  onAssignSection: (
    pageId: string,
    slotId: string,
    sectionKey: ExportSectionKey
  ) => void;
  onRemoveBlock: (pageId: string, blockId: string) => void;
  selectedSlotId?: string | null;
  onSelectSlot?: (pageId: string, slotId: string) => void;
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;

  sourceFilters: SourceBrowserFilterState;
  monthOptions: string[];
  weekOptions: Array<{ weekKey: string; label: string }>;
  deviceOptions: string[];
  channelOptions: string[];
  onChangeSourceFilters: (next: SourceBrowserFilterState) => void;
};

type ExportRenderLayoutMode =
  | "full"
  | "wide"
  | "compact"
  | "side-compact";

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

function getInsightPolicyLabel(policy?: ExportTemplateSlotDefinition["insightPolicy"]) {
  switch (policy) {
    case "normal":
      return "인사이트 3~5줄";
    case "short":
      return "인사이트 짧게";
    case "hidden":
      return "인사이트 숨김";
    default:
      return "인사이트 기본";
  }
}

function getRenderLayoutMode(
  templateKey: ExportPage["templateKey"],
  slotId: string
): ExportRenderLayoutMode {
  if (templateKey === "full-single") return "full";

  if (templateKey === "top-bottom") {
    if (slotId === "top") return "compact";
    if (slotId === "bottom") return "compact";
  }

  if (templateKey === "two-column-equal") {
    return "compact";
  }

  if (templateKey === "left-wide-right-stack") {
    if (slotId === "left") return "full";
    if (slotId === "right-top" || slotId === "right-bottom") {
      return "side-compact";
    }
  }

  if (templateKey === "grid-2x2") {
    return "side-compact";
  }

  return "compact";
}

function FallbackPreview({
  block,
  onRemove,
}: {
  block: ExportBlock;
  onRemove: () => void;
}) {
  const section = getExportSection(block.sectionKey);

  const viewHint = useMemo(() => {
    switch (section.viewType) {
      case "kpi":
        return "KPI 카드형 미리보기";
      case "chart":
        return "차트형 미리보기";
      case "heatmap":
        return "히트맵형 미리보기";
      case "funnel":
        return "퍼널형 미리보기";
      case "goal":
        return "목표/달성률 미리보기";
      case "table":
        return "표/리스트형 미리보기";
      default:
        return "섹션 미리보기";
    }
  }, [section.viewType]);

  const customTitle = block.title?.trim();
  const customSubtitle = block.subtitle?.trim();

  return (
    <div className="relative flex h-full min-h-[160px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {customTitle || customSubtitle ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          {customTitle ? (
            <div className="truncate text-sm font-semibold text-slate-900">
              {customTitle}
            </div>
          ) : null}
          {customSubtitle ? (
            <div className="mt-1 truncate text-[11px] text-slate-500">
              {customSubtitle}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
            {getCategoryLabel(section.category)}
          </div>
          <div className="truncate text-sm font-semibold text-slate-900">
            {section.label}
          </div>
          <div className="mt-1 text-xs text-slate-500">{viewHint}</div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          제거
        </button>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
        {section.viewType === "kpi" && (
          <div className="grid h-full grid-cols-2 gap-2 md:grid-cols-4">
            {["광고비", "매출", "전환", "ROAS"].map((label) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="text-[11px] text-slate-500">{label}</div>
                <div className="mt-2 h-4 w-16 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-10 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {section.viewType === "chart" && (
          <div className="flex h-full flex-col justify-end rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 h-4 w-32 rounded bg-slate-200" />
            <div className="flex h-[180px] items-end gap-2">
              {[32, 68, 48, 84, 62, 95, 74].map((h, i) => (
                <div key={i} className="flex flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-slate-300"
                    style={{ height: `${h}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {section.viewType === "heatmap" && (
          <div className="grid h-full grid-cols-7 gap-2 rounded-xl border border-slate-200 bg-white p-4">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square rounded-md ${
                  i % 5 === 0
                    ? "bg-slate-400"
                    : i % 4 === 0
                    ? "bg-slate-300"
                    : i % 3 === 0
                    ? "bg-slate-200"
                    : "bg-slate-100"
                }`}
              />
            ))}
          </div>
        )}

        {section.viewType === "funnel" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            {["노출", "클릭", "전환"].map((label, idx) => {
              const widths = ["90%", "70%", "50%"];
              return (
                <div
                  key={label}
                  className="flex h-12 items-center justify-center rounded-xl bg-slate-300 text-sm font-semibold text-slate-700"
                  style={{ width: widths[idx] }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}

        {section.viewType === "goal" && (
          <div className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">목표</div>
                <div className="mt-2 h-4 w-20 rounded bg-slate-200" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">실적</div>
                <div className="mt-2 h-4 w-20 rounded bg-slate-200" />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>달성률</span>
                <span>73%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-[73%] rounded-full bg-slate-400" />
              </div>
            </div>
          </div>
        )}

        {section.viewType === "table" && (
          <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 grid grid-cols-4 gap-2 text-[11px] font-semibold text-slate-500">
              <div>항목</div>
              <div>광고비</div>
              <div>매출</div>
              <div>ROAS</div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-xs text-slate-600"
                >
                  <div className="truncate">Row {i + 1}</div>
                  <div className="h-3 w-10 rounded bg-slate-200" />
                  <div className="h-3 w-10 rounded bg-slate-200" />
                  <div className="h-3 w-8 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InsightPreview({
  text,
  policy,
}: {
  text: string;
  policy?: ExportTemplateSlotDefinition["insightPolicy"];
}) {
  const safeText = text.trim();
  if (!safeText) return null;
  if (policy === "hidden") return null;

  if (policy === "short") {
    const firstLine = safeText.split("\n").find((line) => line.trim()) ?? safeText;

    return (
      <div className="mt-2 shrink-0 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Insight
        </div>
        <div className="mt-1 truncate text-[11px] leading-5 text-slate-600">
          {firstLine}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 shrink-0 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Insight
      </div>
      <div className="mt-1 whitespace-pre-line text-[11px] leading-5 text-slate-600">
        {safeText}
      </div>
    </div>
  );
}

function RenderAssignedSection({
  page,
  slot,
  block,
  onRemove,
  meta,
  sectionPayloads,
}: {
  page: ExportPage;
  slot: ExportTemplateSlotDefinition;
  block: ExportBlock;
  onRemove: () => void;
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
}) {
  const customTitle = block.title?.trim();
  const customSubtitle = block.subtitle?.trim();
  const layoutMode = getRenderLayoutMode(page.templateKey, slot.id);
  const insightPolicy = slot.insightPolicy;

  const overlayHeader =
    customTitle || customSubtitle ? (
      <div className="absolute left-3 top-3 z-20 max-w-[70%] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
        {customTitle ? (
          <div className="truncate text-sm font-semibold text-slate-900">
            {customTitle}
          </div>
        ) : null}
        {customSubtitle ? (
          <div className="mt-1 truncate text-[11px] text-slate-500">
            {customSubtitle}
          </div>
        ) : null}
      </div>
    ) : null;

  switch (block.sectionKey) {
    case "summary-kpi": {
      const props = buildSectionProps("summary-kpi", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "summary-kpi",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportSummaryKPI
              meta={props.meta}
              data={props.data}
              layoutMode={layoutMode}
            />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    case "summary-chart": {
      const props = buildSectionProps("summary-chart", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "summary-chart",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportSummaryChart
              meta={props.meta}
              data={props.data}
              layoutMode={layoutMode}
            />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    case "summary-goal": {
      const props = buildSectionProps("summary-goal", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "summary-goal",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportSummaryGoal meta={props.meta} data={props.data} />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    case "summary2-heatmap": {
      const props = buildSectionProps("summary2-heatmap", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "summary2-heatmap",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportSummary2Heatmap meta={props.meta} data={props.data} />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    case "summary2-funnel": {
      const props = buildSectionProps("summary2-funnel", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "summary2-funnel",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportSummary2Funnel meta={props.meta} data={props.data} />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    case "keyword-top10": {
      const props = buildSectionProps("keyword-top10", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "keyword-top10",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportKeywordTop10 meta={props.meta} data={props.data} />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    case "creative-top8": {
      const props = buildSectionProps("creative-top8", {
        meta,
        sectionPayloads,
      });

      const resolvedInsightText =
        (block.insightMode ?? "auto") === "manual"
          ? block.insightText?.trim() ?? ""
          : buildAutoInsight({
              sectionKey: "creative-top8",
              data: props.data,
              meta: props.meta,
            });

      return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {overlayHeader}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              제거
            </button>
            <ExportCreativeTop8 meta={props.meta} data={props.data} />
          </div>

          <InsightPreview text={resolvedInsightText} policy={insightPolicy} />
        </div>
      );
    }

    default:
      return <FallbackPreview block={block} onRemove={onRemove} />;
  }
}

function HiddenSectionPreview({
  block,
  onRemove,
}: {
  block: ExportBlock;
  onRemove: () => void;
}) {
  const section = getExportSection(block.sectionKey);
  const customTitle = block.title?.trim();
  const customSubtitle = block.subtitle?.trim();

  return (
    <div className="flex h-full min-h-[160px] flex-col rounded-2xl border border-dashed border-slate-300 bg-slate-100/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
            숨김 처리됨
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-slate-900">
            {customTitle || section.label}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {customSubtitle || "Inspector에서 다시 표시할 수 있어."}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          제거
        </button>
      </div>

      <div className="mt-4 flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 text-xs text-slate-500">
        이 섹션은 현재 미리보기에서 숨김 상태야.
      </div>
    </div>
  );
}

export default function ExportSlot({
  page,
  slot,
  onAssignSection,
  onRemoveBlock,
  selectedSlotId,
  onSelectSlot,
  meta,
  sectionPayloads,
  sourceFilters,
  monthOptions,
  weekOptions,
  deviceOptions,
  channelOptions,
  onChangeSourceFilters,
}: Props) {
  const [openPicker, setOpenPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<SourceBrowserTabKey>("summary");

  const assignedBlock = useMemo(
    () => page.blocks.find((block) => block.slotId === slot.id) ?? null,
    [page.blocks, slot.id]
  );

  const fittedSections = useMemo<ExportSectionDefinition[]>(() => {
    const base = getFittedSectionsForTemplateSlot(page.templateKey, slot.id);
    const allowedSections = slot.allowedSections ?? [];

    if (allowedSections.length === 0) return base;

    return base.filter((section) => allowedSections.includes(section.key));
  }, [page.templateKey, slot.id, slot.allowedSections]);

  const preferredSections = slot.preferredSections ?? [];

  const preferredSortedSections = useMemo<ExportSectionDefinition[]>(() => {
    if (preferredSections.length === 0) return fittedSections;

    const preferredSet = new Set(preferredSections);

    const preferred = preferredSections
      .map((key) => fittedSections.find((section) => section.key === key))
      .filter(Boolean) as ExportSectionDefinition[];

    const rest = fittedSections.filter((section) => !preferredSet.has(section.key));

    return [...preferred, ...rest];
  }, [fittedSections, preferredSections]);

  const recommendedSections = useMemo<ExportSectionDefinition[]>(() => {
    const recommendedFromTemplate = preferredSortedSections.filter((section) =>
      section.recommendedTemplates.includes(page.templateKey)
    );

    if (recommendedFromTemplate.length > 0) return recommendedFromTemplate;

    return preferredSortedSections;
  }, [preferredSortedSections, page.templateKey]);

  function handleAssign(sectionKey: ExportSectionKey) {
    const allowedByRegistry = isSectionAllowedForTemplateSlot(
      page.templateKey,
      slot.id,
      sectionKey
    );

    const allowedBySlot =
      !slot.allowedSections || slot.allowedSections.length === 0
        ? true
        : slot.allowedSections.includes(sectionKey);

    if (!allowedByRegistry || !allowedBySlot) return;

    onAssignSection(page.id, slot.id, sectionKey);
    setOpenPicker(false);
  }

  const isSelected = selectedSlotId === slot.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectSlot?.(page.id, slot.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectSlot?.(page.id, slot.id);
        }
      }}
      className={[
        "flex h-full min-h-[180px] cursor-pointer flex-col rounded-2xl border bg-slate-50/70 p-3 transition",
        isSelected
          ? "border-slate-900 ring-2 ring-slate-900/10"
          : "border-slate-200 hover:border-slate-300",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-700">{slot.label}</div>
            {isSelected ? (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                선택됨
              </span>
            ) : null}
          </div>

          {slot.description ? (
            <div className="mt-0.5 text-[11px] text-slate-500">
              {slot.description}
            </div>
          ) : null}

          <div className="mt-1 flex flex-wrap gap-1.5">
            {slot.slotRole ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {slot.slotRole}
              </span>
            ) : null}

            {slot.insightPolicy ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                {getInsightPolicyLabel(slot.insightPolicy)}
              </span>
            ) : null}
          </div>
        </div>

        {!assignedBlock ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenPicker((v) => !v);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {openPicker ? "선택창 닫기" : "섹션 선택"}
          </button>
        ) : null}
      </div>

      {assignedBlock ? (
        <div className="flex-1 overflow-hidden rounded-2xl">
          {assignedBlock.hidden ? (
            <HiddenSectionPreview
              block={assignedBlock}
              onRemove={() => onRemoveBlock(page.id, assignedBlock.id)}
            />
          ) : (
            <RenderAssignedSection
              page={page}
              slot={slot}
              block={assignedBlock}
              onRemove={() => onRemoveBlock(page.id, assignedBlock.id)}
              meta={meta}
              sectionPayloads={sectionPayloads}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white/70 p-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Empty Slot
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  이 슬롯에 섹션을 배치해줘
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  리포트 탭과 필터 기준으로 원하는 블록을 골라서 바로 넣을 수 있어.
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                  추천 {recommendedSections.length}개
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenPicker((v) => !v);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {openPicker ? "선택 패널 닫기" : "탭 기준으로 고르기"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {preferredSortedSections.slice(0, 3).map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAssign(section.key);
                  }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>

          {openPicker ? (
            <div className="mt-3 min-h-0 flex-1">
              <ExportSourceBrowser
                templateKey={page.templateKey}
                slot={slot}
                activeTab={activeTab}
                onChangeTab={setActiveTab}
                filters={sourceFilters}
                onChangeFilters={onChangeSourceFilters}
                monthOptions={monthOptions}
                weekOptions={weekOptions}
                deviceOptions={deviceOptions}
                channelOptions={channelOptions}
                onPickSection={handleAssign}
              />
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
              상단 버튼을 눌러 요약 / 요약2 / 키워드 / 소재 탭 기준으로 고를 수 있어.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
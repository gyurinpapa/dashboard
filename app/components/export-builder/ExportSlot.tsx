"use client";

import { useMemo, useState } from "react";
import {
  EXPORT_SECTION_REGISTRY,
  getExportSection,
} from "@/src/lib/export-builder/registry";
import type {
  ExportBlock,
  ExportPage,
  ExportSectionKey,
  ExportTemplateSlotDefinition,
} from "@/src/lib/export-builder/types";

import type {
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "@/src/lib/export-builder/section-props";
import { buildSectionProps } from "@/src/lib/export-builder/section-resolver";

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

  /**
   * Step 17-9
   * 공통 section meta / payload 주입용
   * 아직 실제 데이터가 없어도 optional로 열어둔다.
   */
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
};

type PickerFilterKey =
  | "recommended"
  | "all"
  | "summary"
  | "summary2"
  | "keyword"
  | "creative";

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

  return (
    <div className="flex h-full min-h-[160px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

function RenderAssignedSection({
  block,
  onRemove,
  meta,
  sectionPayloads,
}: {
  block: ExportBlock;
  onRemove: () => void;
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
}) {
  switch (block.sectionKey) {
    case "summary-kpi": {
      const props = buildSectionProps("summary-kpi", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportSummaryKPI meta={props.meta} data={props.data} />
        </div>
      );
    }

    case "summary-chart": {
      const props = buildSectionProps("summary-chart", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportSummaryChart meta={props.meta} data={props.data} />
        </div>
      );
    }

    case "summary-goal": {
      const props = buildSectionProps("summary-goal", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportSummaryGoal meta={props.meta} data={props.data} />
        </div>
      );
    }

    case "summary2-heatmap": {
      const props = buildSectionProps("summary2-heatmap", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportSummary2Heatmap meta={props.meta} data={props.data} />
        </div>
      );
    }

    case "summary2-funnel": {
      const props = buildSectionProps("summary2-funnel", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportSummary2Funnel meta={props.meta} data={props.data} />
        </div>
      );
    }

    case "keyword-top10": {
      const props = buildSectionProps("keyword-top10", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportKeywordTop10 meta={props.meta} data={props.data} />
        </div>
      );
    }

    case "creative-top8": {
      const props = buildSectionProps("creative-top8", {
        meta,
        sectionPayloads,
      });

      return (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
          <ExportCreativeTop8 meta={props.meta} data={props.data} />
        </div>
      );
    }

    default:
      return <FallbackPreview block={block} onRemove={onRemove} />;
  }
}

export default function ExportSlot({
  page,
  slot,
  onAssignSection,
  onRemoveBlock,
  meta,
  sectionPayloads,
}: Props) {
  const [openPicker, setOpenPicker] = useState(false);
  const [filterKey, setFilterKey] = useState<PickerFilterKey>("recommended");

  const assignedBlock = useMemo(
    () => page.blocks.find((block) => block.slotId === slot.id) ?? null,
    [page.blocks, slot.id]
  );

  const recommendedSections = useMemo(() => {
    return EXPORT_SECTION_REGISTRY.filter((section) =>
      section.recommendedTemplates.includes(page.templateKey)
    );
  }, [page.templateKey]);

  const filteredSections = useMemo(() => {
    if (filterKey === "recommended") {
      return recommendedSections;
    }

    if (filterKey === "all") {
      return EXPORT_SECTION_REGISTRY;
    }

    return EXPORT_SECTION_REGISTRY.filter(
      (section) => section.category === filterKey
    );
  }, [filterKey, recommendedSections]);

  function handleAssign(sectionKey: ExportSectionKey) {
    onAssignSection(page.id, slot.id, sectionKey);
    setOpenPicker(false);
  }

  const filterTabs: Array<{ key: PickerFilterKey; label: string }> = [
    { key: "recommended", label: "추천" },
    { key: "all", label: "전체" },
    { key: "summary", label: "요약" },
    { key: "summary2", label: "요약2" },
    { key: "keyword", label: "키워드" },
    { key: "creative", label: "소재" },
  ];

  return (
    <div className="flex h-full min-h-[180px] flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-700">{slot.label}</div>
          {slot.description ? (
            <div className="mt-0.5 text-[11px] text-slate-500">
              {slot.description}
            </div>
          ) : null}
        </div>

        {!assignedBlock ? (
          <button
            type="button"
            onClick={() => setOpenPicker((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {openPicker ? "선택창 닫기" : "섹션 선택"}
          </button>
        ) : null}
      </div>

      {assignedBlock ? (
        <div className="flex-1 overflow-hidden rounded-2xl">
          <RenderAssignedSection
            block={assignedBlock}
            onRemove={() => onRemoveBlock(page.id, assignedBlock.id)}
            meta={meta}
            sectionPayloads={sectionPayloads}
          />
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
                  현재 템플릿 <span className="font-medium text-slate-700">{page.templateKey}</span> 에
                  잘 맞는 추천 섹션부터 빠르게 넣을 수 있어.
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                  추천 {recommendedSections.length}개
                </div>
                <button
                  type="button"
                  onClick={() => setOpenPicker((v) => !v)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {openPicker ? "선택 패널 닫기" : "전체 섹션 보기"}
                </button>
              </div>
            </div>

            {recommendedSections.length > 0 ? (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Quick Picks
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {recommendedSections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => handleAssign(section.key)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {section.label}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            {getCategoryLabel(section.category)}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                            {getViewTypeLabel(section.viewType)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                        {section.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {openPicker ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {filterTabs.map((tab) => {
                  const isActive = filterKey === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilterKey(tab.key)}
                      className={[
                        "rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                        isActive
                          ? "border border-slate-900 bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">
                  {filterKey === "recommended"
                    ? "추천 섹션"
                    : filterKey === "all"
                    ? "전체 섹션"
                    : `${getCategoryLabel(filterKey)} 섹션`}
                </div>
                <div className="text-[11px] text-slate-500">
                  {filteredSections.length}개
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {filteredSections.map((section) => {
                  const isRecommended = recommendedSections.some(
                    (item) => item.key === section.key
                  );

                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => handleAssign(section.key)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">
                            {section.label}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              {getCategoryLabel(section.category)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              {getViewTypeLabel(section.viewType)}
                            </span>
                            {isRecommended ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                추천
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 line-clamp-2 text-[11px] text-slate-500">
                        {section.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-500">
              추천 섹션에서 바로 선택하거나, <span className="font-medium text-slate-700">전체 섹션 보기</span>로
              카테고리별 탐색을 할 수 있어.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
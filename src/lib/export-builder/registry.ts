// src/lib/export-builder/registry.ts

import type {
  ExportCategory,
  ExportSectionDefinition,
  ExportSectionKey,
  ExportTemplateKey,
} from "./types";

export const EXPORT_SECTION_REGISTRY: ExportSectionDefinition[] = [
  {
    key: "summary-kpi",
    label: "요약 KPI",
    description: "광고비, 매출, 전환, ROAS 등 핵심 KPI를 카드 형태로 요약",
    category: "summary",
    recommendedTemplates: [
      "top-bottom",
      "two-column-equal",
      "grid-2x2",
      "left-wide-right-stack",
    ],
    minHeightPreset: "sm",
    viewType: "kpi",
  },
  {
    key: "summary-chart",
    label: "요약 차트",
    description: "월/기간 성과 추이와 핵심 시계열 차트를 보여주는 영역",
    category: "summary",
    recommendedTemplates: [
      "full-single",
      "top-bottom",
      "left-wide-right-stack",
    ],
    minHeightPreset: "lg",
    viewType: "chart",
  },
  {
    key: "summary-goal",
    label: "목표 / 달성현황",
    description: "월 목표 대비 현재 실적 및 달성률을 요약",
    category: "summary",
    recommendedTemplates: [
      "grid-2x2",
      "two-column-equal",
      "top-bottom",
      "left-wide-right-stack",
    ],
    minHeightPreset: "sm",
    viewType: "goal",
  },
  {
    key: "summary2-heatmap",
    label: "일자별 성과 히트맵",
    description: "일자 단위 성과 강약을 한눈에 보는 히트맵",
    category: "summary2",
    recommendedTemplates: [
      "full-single",
      "two-column-equal",
      "left-wide-right-stack",
    ],
    minHeightPreset: "lg",
    viewType: "heatmap",
  },
  {
    key: "summary2-funnel",
    label: "성과 퍼널",
    description: "노출 > 클릭 > 전환 흐름을 퍼널 구조로 요약",
    category: "summary2",
    recommendedTemplates: [
      "full-single",
      "two-column-equal",
      "grid-2x2",
      "left-wide-right-stack",
    ],
    minHeightPreset: "md",
    viewType: "funnel",
  },
  {
    key: "keyword-top10",
    label: "키워드 TOP10",
    description: "성과 상위 키워드만 고정 개수로 요약한 테이블",
    category: "keyword",
    recommendedTemplates: [
      "full-single",
      "left-wide-right-stack",
      "top-bottom",
    ],
    minHeightPreset: "md",
    viewType: "table",
  },
  {
    key: "creative-top8",
    label: "소재 TOP8",
    description: "성과 상위 소재를 카드/목록 형태로 요약",
    category: "creative",
    recommendedTemplates: [
      "full-single",
      "left-wide-right-stack",
      "top-bottom",
      "two-column-equal",
    ],
    minHeightPreset: "md",
    viewType: "table",
  },
];

export const EXPORT_SECTION_MAP: Record<ExportSectionKey, ExportSectionDefinition> =
  EXPORT_SECTION_REGISTRY.reduce(
    (acc, section) => {
      acc[section.key] = section;
      return acc;
    },
    {} as Record<ExportSectionKey, ExportSectionDefinition>
  );

export function getExportSection(sectionKey: ExportSectionKey): ExportSectionDefinition {
  return EXPORT_SECTION_MAP[sectionKey];
}

export function getExportSectionsByCategory(category: ExportCategory) {
  return EXPORT_SECTION_REGISTRY.filter((section) => section.category === category);
}

export function getRecommendedSectionKeysForTemplate(templateKey: ExportTemplateKey) {
  return EXPORT_SECTION_REGISTRY.filter((section) =>
    section.recommendedTemplates.includes(templateKey)
  ).map((section) => section.key);
}

/**
 * Step19-5
 * 템플릿/슬롯 적합 규칙
 *
 * 원칙:
 * - 큰 차트/히트맵/테이블은 큰 슬롯 위주
 * - KPI/Goal/Funnel은 중소형 슬롯 위주
 * - 망가지는 조합은 picker에서 처음부터 숨긴다
 */
const TEMPLATE_SLOT_FIT_RULES: Record<
  ExportTemplateKey,
  Record<string, ExportSectionKey[]>
> = {
  "full-single": {
    main: [
      "summary-kpi",
      "summary-chart",
      "summary-goal",
      "summary2-heatmap",
      "summary2-funnel",
      "keyword-top10",
      "creative-top8",
    ],
  },

  "top-bottom": {
    top: [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
    bottom: [
      "summary-chart",
      "summary2-heatmap",
    ],
  },

  "two-column-equal": {
    left: [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
    right: [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
  },

  "left-wide-right-stack": {
    left: [
      "summary-chart",
      "summary2-heatmap",
      "summary2-funnel",
      "keyword-top10",
      "creative-top8",
    ],
    "right-top": [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
    "right-bottom": [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
  },

  "grid-2x2": {
    "top-left": [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
    "top-right": [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
    "bottom-left": [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
    "bottom-right": [
      "summary-kpi",
      "summary-goal",
      "summary2-funnel",
    ],
  },
};

export function getAllowedSectionKeysForTemplateSlot(
  templateKey: ExportTemplateKey,
  slotId: string
): ExportSectionKey[] {
  const templateRule = TEMPLATE_SLOT_FIT_RULES[templateKey];
  if (!templateRule) return [];
  return templateRule[slotId] ?? [];
}

export function isSectionAllowedForTemplateSlot(
  templateKey: ExportTemplateKey,
  slotId: string,
  sectionKey: ExportSectionKey
): boolean {
  return getAllowedSectionKeysForTemplateSlot(templateKey, slotId).includes(
    sectionKey
  );
}

export function getFittedSectionsForTemplateSlot(
  templateKey: ExportTemplateKey,
  slotId: string
): ExportSectionDefinition[] {
  const allowedKeys = getAllowedSectionKeysForTemplateSlot(templateKey, slotId);
  return EXPORT_SECTION_REGISTRY.filter((section) =>
    allowedKeys.includes(section.key)
  );
}
// src/lib/export-builder/templates.ts

import type { ExportTemplateDefinition } from "./types";

export const EXPORT_TEMPLATES: ExportTemplateDefinition[] = [
  {
    key: "full-single",
    label: "풀 와이드 1단",
    description: "한 장표에 하나의 큰 메시지를 보여주는 전체 영역 템플릿",
    slots: [
      {
        id: "main",
        label: "메인",
        description: "페이지 전체 영역",
        slotRole: "hero-main",
        insightPolicy: "normal",
        preferredSections: [
          "summary-chart",
          "keyword-top10",
          "creative-top8",
          "summary2-heatmap",
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-chart",
          "summary-goal",
          "summary2-heatmap",
          "summary2-funnel",
          "keyword-top10",
          "creative-top8",
        ],
      },
    ],
  },
  {
    key: "top-bottom",
    label: "상하 2단",
    description: "상단 요약 + 하단 상세 시각화/근거 구조에 적합한 템플릿",
    slots: [
      {
        id: "top",
        label: "상단",
        description: "핵심 요약 영역",
        slotRole: "hero-summary",
        insightPolicy: "short",
        preferredSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
      },
      {
        id: "bottom",
        label: "하단",
        description: "상세 시각화 / 근거 영역",
        slotRole: "detail-main",
        insightPolicy: "normal",
        preferredSections: [
          "summary-chart",
          "summary2-heatmap",
          "keyword-top10",
          "creative-top8",
          "summary2-funnel",
          "summary-goal",
        ],
        allowedSections: [
          "summary-chart",
          "summary2-heatmap",
          "summary2-funnel",
          "summary-goal",
          "keyword-top10",
          "creative-top8",
        ],
      },
    ],
  },
  {
    key: "two-column-equal",
    label: "좌우 2단 균등",
    description: "좌/우 두 개의 분할 메인 카드를 나란히 배치하는 템플릿",
    slots: [
      {
        id: "left",
        label: "좌측",
        description: "좌측 분할 메인",
        slotRole: "split-main-a",
        insightPolicy: "short",
        preferredSections: [
          "summary-chart",
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-chart",
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary2-heatmap",
        ],
      },
      {
        id: "right",
        label: "우측",
        description: "우측 분할 메인",
        slotRole: "split-main-b",
        insightPolicy: "short",
        preferredSections: [
          "summary-chart",
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-chart",
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary2-heatmap",
        ],
      },
    ],
  },
  {
    key: "left-wide-right-stack",
    label: "좌측 와이드 + 우측 2단",
    description: "좌측 대형 본문과 우측 보조 요약 2개를 조합하는 템플릿",
    slots: [
      {
        id: "left",
        label: "좌측 메인",
        description: "가장 넓은 주 콘텐츠 영역",
        slotRole: "wide-primary",
        insightPolicy: "normal",
        preferredSections: [
          "summary-chart",
          "keyword-top10",
          "creative-top8",
          "summary2-heatmap",
        ],
        allowedSections: [
          "summary-chart",
          "summary-kpi",
          "summary2-heatmap",
          "keyword-top10",
          "creative-top8",
        ],
      },
      {
        id: "right-top",
        label: "우측 상단",
        description: "보조 요약 카드 상단",
        slotRole: "compact-support-top",
        insightPolicy: "hidden",
        preferredSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
      },
      {
        id: "right-bottom",
        label: "우측 하단",
        description: "보조 요약 카드 하단",
        slotRole: "compact-support-bottom",
        insightPolicy: "hidden",
        preferredSections: [
          "summary-goal",
          "summary2-funnel",
          "summary-kpi",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary2-heatmap",
        ],
      },
    ],
  },
  {
    key: "grid-2x2",
    label: "2x2 그리드",
    description: "작은 요약 카드 4개를 균형 있게 배치하는 템플릿",
    slots: [
      {
        id: "top-left",
        label: "좌상단",
        description: "콤팩트 요약 카드",
        slotRole: "compact-grid",
        insightPolicy: "hidden",
        preferredSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
      },
      {
        id: "top-right",
        label: "우상단",
        description: "콤팩트 요약 카드",
        slotRole: "compact-grid",
        insightPolicy: "hidden",
        preferredSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
      },
      {
        id: "bottom-left",
        label: "좌하단",
        description: "콤팩트 요약 카드",
        slotRole: "compact-grid",
        insightPolicy: "hidden",
        preferredSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
      },
      {
        id: "bottom-right",
        label: "우하단",
        description: "콤팩트 요약 카드",
        slotRole: "compact-grid",
        insightPolicy: "hidden",
        preferredSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
        ],
        allowedSections: [
          "summary-kpi",
          "summary-goal",
          "summary2-funnel",
          "summary-chart",
        ],
      },
    ],
  },
];

export function getExportTemplate(key: ExportTemplateDefinition["key"]) {
  return (
    EXPORT_TEMPLATES.find((template) => template.key === key) ??
    EXPORT_TEMPLATES[0]
  );
}

export function getExportTemplateSlots(key: ExportTemplateDefinition["key"]) {
  return getExportTemplate(key).slots;
}

export function getFirstSlotIdForTemplate(key: ExportTemplateDefinition["key"]) {
  return getExportTemplateSlots(key)[0]?.id ?? null;
}
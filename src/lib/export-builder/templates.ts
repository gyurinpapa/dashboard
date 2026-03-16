// src/lib/export-builder/templates.ts

import type {
  ExportSlotId,
  ExportTemplateDefinition,
  ExportTemplateKey,
} from "./types";

export const EXPORT_CANVAS_RATIO = "16:9" as const;

/**
 * Step 17-1에서는 "페이지 템플릿"을 완전 고정 정의로 관리한다.
 * 이후 UI에서는 이 slots를 기준으로 배치 영역을 렌더하면 된다.
 */
export const EXPORT_TEMPLATES: ExportTemplateDefinition[] = [
  {
    key: "full-single",
    label: "풀 와이드 1단",
    description: "큰 차트, 히트맵, 퍼널처럼 단일 핵심 섹션을 크게 보여줄 때 적합",
    slots: [
      {
        id: "main",
        label: "메인",
        description: "페이지 전체 영역",
      },
    ],
  },
  {
    key: "top-bottom",
    label: "상하 2단",
    description: "상단 요약 + 하단 차트처럼 위아래 구조에 적합",
    slots: [
      {
        id: "top",
        label: "상단",
        description: "상단 전체폭",
      },
      {
        id: "bottom",
        label: "하단",
        description: "하단 전체폭",
      },
    ],
  },
  {
    key: "two-column-equal",
    label: "좌우 2단",
    description: "좌우 동일 비율 2열 배치",
    slots: [
      {
        id: "left",
        label: "좌측",
        description: "좌측 1열",
      },
      {
        id: "right",
        label: "우측",
        description: "우측 1열",
      },
    ],
  },
  {
    key: "left-wide-right-stack",
    label: "좌대형 + 우측 2단",
    description: "왼쪽 큰 차트 + 오른쪽 보조 2개 섹션 배치",
    slots: [
      {
        id: "left",
        label: "좌측 대형",
        description: "좌측 넓은 영역",
      },
      {
        id: "right-top",
        label: "우측 상단",
        description: "우측 상단 보조 영역",
      },
      {
        id: "right-bottom",
        label: "우측 하단",
        description: "우측 하단 보조 영역",
      },
    ],
  },
  {
    key: "grid-2x2",
    label: "2x2 그리드",
    description: "4개의 카드/요약 섹션을 균형 있게 배치",
    slots: [
      {
        id: "top-left",
        label: "좌상",
        description: "좌상단",
      },
      {
        id: "top-right",
        label: "우상",
        description: "우상단",
      },
      {
        id: "bottom-left",
        label: "좌하",
        description: "좌하단",
      },
      {
        id: "bottom-right",
        label: "우하",
        description: "우하단",
      },
    ],
  },
];

export const EXPORT_TEMPLATE_MAP: Record<ExportTemplateKey, ExportTemplateDefinition> =
  EXPORT_TEMPLATES.reduce(
    (acc, template) => {
      acc[template.key] = template;
      return acc;
    },
    {} as Record<ExportTemplateKey, ExportTemplateDefinition>
  );

export function getExportTemplate(templateKey: ExportTemplateKey): ExportTemplateDefinition {
  return EXPORT_TEMPLATE_MAP[templateKey];
}

export function getExportTemplateSlots(templateKey: ExportTemplateKey) {
  return getExportTemplate(templateKey)?.slots ?? [];
}

export function isValidSlotIdForTemplate(
  templateKey: ExportTemplateKey,
  slotId: ExportSlotId
): boolean {
  const slots = getExportTemplateSlots(templateKey);
  return slots.some((slot) => slot.id === slotId);
}

export function getFirstSlotIdForTemplate(
  templateKey: ExportTemplateKey
): ExportSlotId | null {
  const slots = getExportTemplateSlots(templateKey);
  return slots[0]?.id ?? null;
}
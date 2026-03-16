// src/lib/export-builder/defaults.ts

import { getFirstSlotIdForTemplate, getExportTemplateSlots } from "./templates";
import type {
  CreateExportDocumentInput,
  ExportBlock,
  ExportDocument,
  ExportPage,
  ExportSectionKey,
  ExportStarterPresetKey,
  ExportTemplateKey,
} from "./types";

/**
 * 브라우저/서버 어디서든 최대한 안전하게 동작하도록 id 생성기 분리
 */
function createId(prefix: string) {
  const random =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}_${random}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function createExportBlock(
  sectionKey: ExportSectionKey,
  slotId: string
): ExportBlock {
  return {
    id: createId("block"),
    sectionKey,
    slotId,
  };
}

export function createEmptyExportPage(
  templateKey: ExportTemplateKey = "full-single",
  title?: string
): ExportPage {
  return {
    id: createId("page"),
    templateKey,
    title,
    blocks: [],
  };
}

export function createExportPageWithBlocks(input: {
  templateKey: ExportTemplateKey;
  title?: string;
  blocks?: Array<{
    sectionKey: ExportSectionKey;
    slotId?: string;
  }>;
}): ExportPage {
  const page = createEmptyExportPage(input.templateKey, input.title);
  const validSlots = getExportTemplateSlots(input.templateKey);

  const blocks =
    input.blocks?.flatMap((item) => {
      const resolvedSlotId =
        item.slotId && validSlots.some((slot) => slot.id === item.slotId)
          ? item.slotId
          : getFirstSlotIdForTemplate(input.templateKey);

      if (!resolvedSlotId) return [];

      return [createExportBlock(item.sectionKey, resolvedSlotId)];
    }) ?? [];

  return {
    ...page,
    blocks,
  };
}

/**
 * 템플릿 교체 시 기존 block을 그대로 들고 가면 slot mismatch가 생길 수 있으므로
 * Step 17 MVP에서는 가장 안전하게 "blocks 초기화" 정책으로 간다.
 */
export function resetPageTemplate(
  page: ExportPage,
  nextTemplateKey: ExportTemplateKey
): ExportPage {
  return {
    ...page,
    templateKey: nextTemplateKey,
    blocks: [],
  };
}

export function createStarterPages(
  preset: ExportStarterPresetKey = "starter-default"
): ExportPage[] {
  switch (preset) {
    case "starter-summary-focused":
      return [
        createExportPageWithBlocks({
          templateKey: "top-bottom",
          title: "요약",
          blocks: [
            { sectionKey: "summary-kpi", slotId: "top" },
            { sectionKey: "summary-chart", slotId: "bottom" },
          ],
        }),
        createExportPageWithBlocks({
          templateKey: "two-column-equal",
          title: "핵심 성과 구조",
          blocks: [
            { sectionKey: "summary2-heatmap", slotId: "left" },
            { sectionKey: "summary2-funnel", slotId: "right" },
          ],
        }),
      ];

    case "starter-executive":
      return [
        createExportPageWithBlocks({
          templateKey: "grid-2x2",
          title: "Executive Summary",
          blocks: [
            { sectionKey: "summary-kpi", slotId: "top-left" },
            { sectionKey: "summary-goal", slotId: "top-right" },
            { sectionKey: "summary2-funnel", slotId: "bottom-left" },
            { sectionKey: "creative-top8", slotId: "bottom-right" },
          ],
        }),
        createExportPageWithBlocks({
          templateKey: "full-single",
          title: "Performance Trend",
          blocks: [{ sectionKey: "summary-chart", slotId: "main" }],
        }),
      ];

    case "starter-default":
    default:
      return [
        createExportPageWithBlocks({
          templateKey: "top-bottom",
          title: "요약",
          blocks: [
            { sectionKey: "summary-kpi", slotId: "top" },
            { sectionKey: "summary-chart", slotId: "bottom" },
          ],
        }),
        createExportPageWithBlocks({
          templateKey: "two-column-equal",
          title: "일자별/퍼널",
          blocks: [
            { sectionKey: "summary2-heatmap", slotId: "left" },
            { sectionKey: "summary2-funnel", slotId: "right" },
          ],
        }),
        createExportPageWithBlocks({
          templateKey: "full-single",
          title: "키워드 TOP10",
          blocks: [{ sectionKey: "keyword-top10", slotId: "main" }],
        }),
      ];
  }
}

export function createExportDocument(
  input: CreateExportDocumentInput
): ExportDocument {
  const now = nowIso();

  return {
    id: createId("export_doc"),
    ratio: "16:9",
    meta: {
      reportId: input.reportId,
      advertiserName: input.advertiserName ?? "",
      reportTypeName: input.reportTypeName ?? "",
      periodLabel: input.periodLabel ?? "",
    },
    pages: createStarterPages(input.preset ?? "starter-default"),
    createdAt: now,
    updatedAt: now,
  };
}

export function touchExportDocument(doc: ExportDocument): ExportDocument {
  return {
    ...doc,
    updatedAt: nowIso(),
  };
}

export function cloneExportPage(page: ExportPage): ExportPage {
  return {
    ...page,
    id: createId("page"),
    blocks: page.blocks.map((block) => ({
      ...block,
      id: createId("block"),
    })),
  };
}

export function createBlankPageForTemplate(
  templateKey: ExportTemplateKey,
  title?: string
): ExportPage {
  return createEmptyExportPage(templateKey, title);
}
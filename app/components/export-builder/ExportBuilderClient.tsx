"use client";

import { useEffect, useMemo, useState } from "react";
import ExportPageView from "./ExportPageView";
import {
  cloneExportPage,
  createBlankPageForTemplate,
  createExportBlock,
  createExportDocument,
  resetPageTemplate,
  touchExportDocument,
} from "@/src/lib/export-builder/defaults";
import { EXPORT_TEMPLATES } from "@/src/lib/export-builder/templates";
import { buildExportPayloadsFromRows } from "@/src/lib/export-builder/buildExportPayloadsFromRows";
import type {
  CreateExportDocumentInput,
  ExportBlock,
  ExportDocument,
  ExportInsightMode,
  ExportPage,
  ExportSectionKey,
  ExportTemplateKey,
} from "@/src/lib/export-builder/types";
import type {
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "@/src/lib/export-builder/section-props";
import type {
  ExportPeriod,
  ExportPeriodPreset,
} from "@/src/lib/export-builder/period";
import {
  buildExportPeriodLabel,
  createInitialExportPeriod,
  filterRowsByExportPeriod,
  normalizeExportPeriod,
  resolveExportPeriodPreset,
} from "@/src/lib/export-builder/period";
import {
  buildOptions,
  buildWeekOptions,
  filterRows,
} from "@/src/lib/report/aggregate";
import type { Row } from "@/src/lib/report/types";
import type { SourceBrowserFilterState } from "@/src/lib/export-builder/source-browser-types";

type Props = {
  initialInput: CreateExportDocumentInput;
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
  allRows?: any[];
  initialExportPeriod?: ExportPeriod;
};

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type BuilderState = {
  doc: ExportDocument;
  selectedPageId: string | null;
  selectedSlotId: string | null;
};

type BlockPatch = Partial<
  Pick<
    ExportBlock,
    "title" | "subtitle" | "hidden" | "insightMode" | "insightText"
  >
>;

const EXPORT_PERIOD_PRESET_OPTIONS: Array<{
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

function createInitialBuilderState(
  initialInput: CreateExportDocumentInput
): BuilderState {
  const initialDoc = createExportDocument(initialInput);

  return {
    doc: initialDoc,
    selectedPageId: initialDoc.pages[0]?.id ?? null,
    selectedSlotId: null,
  };
}

function replacePage(doc: ExportDocument, nextPage: ExportPage): ExportDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => (page.id === nextPage.id ? nextPage : page)),
  };
}

function removeBlockById(page: ExportPage, blockId: string): ExportPage {
  return {
    ...page,
    blocks: page.blocks.filter((block) => block.id !== blockId),
  };
}

function upsertBlockForSlot(
  page: ExportPage,
  slotId: string,
  sectionKey: ExportSectionKey
): ExportPage {
  const filteredBlocks = page.blocks.filter((block) => block.slotId !== slotId);
  const nextBlock = createExportBlock(sectionKey, slotId);

  return {
    ...page,
    blocks: [...filteredBlocks, nextBlock],
  };
}

function patchBlockById(
  page: ExportPage,
  blockId: string,
  patch: BlockPatch
): ExportPage {
  return {
    ...page,
    blocks: page.blocks.map((block) =>
      block.id === blockId ? { ...block, ...patch } : block
    ),
  };
}

function resetBlockOverrides(page: ExportPage, blockId: string): ExportPage {
  return {
    ...page,
    blocks: page.blocks.map((block) => {
      if (block.id !== blockId) return block;

      return {
        id: block.id,
        sectionKey: block.sectionKey,
        slotId: block.slotId,
        insightMode: "auto",
        insightText: "",
      };
    }),
  };
}

function moveBlockToSlot(
  page: ExportPage,
  blockId: string,
  targetSlotId: string
): ExportPage {
  const currentBlock = page.blocks.find((block) => block.id === blockId);
  if (!currentBlock) return page;
  if (currentBlock.slotId === targetSlotId) return page;

  const targetBlock =
    page.blocks.find((block) => block.slotId === targetSlotId) ?? null;

  return {
    ...page,
    blocks: page.blocks.map((block) => {
      if (block.id === currentBlock.id) {
        return {
          ...block,
          slotId: targetSlotId,
        };
      }

      if (targetBlock && block.id === targetBlock.id) {
        return {
          ...block,
          slotId: currentBlock.slotId,
        };
      }

      return block;
    }),
  };
}

function duplicateBlockToSlot(
  page: ExportPage,
  sourceBlockId: string,
  targetSlotId: string
): ExportPage {
  const sourceBlock = page.blocks.find((block) => block.id === sourceBlockId);
  if (!sourceBlock) return page;

  const nextBlock: ExportBlock = {
    ...createExportBlock(sourceBlock.sectionKey, targetSlotId),
    title: sourceBlock.title,
    subtitle: sourceBlock.subtitle,
    hidden: sourceBlock.hidden,
    insightMode: sourceBlock.insightMode,
    insightText: sourceBlock.insightText,
  };

  return {
    ...page,
    blocks: [...page.blocks, nextBlock],
  };
}

function normalizeDocForDirtyCheck(doc: ExportDocument) {
  return JSON.stringify({
    ratio: doc.ratio,
    meta: doc.meta,
    pages: doc.pages,
  });
}

function toInputDate(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function getStringOptionValue(
  item: unknown,
  candidateKeys: string[]
): string | null {
  if (typeof item === "string") {
    const v = item.trim();
    return v || null;
  }

  if (!item || typeof item !== "object") return null;

  for (const key of candidateKeys) {
    const value = (item as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export default function ExportBuilderClient({
  initialInput,
  meta,
  sectionPayloads,
  allRows = [],
  initialExportPeriod,
}: Props) {
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>(() => {
    if (initialExportPeriod) return normalizeExportPeriod(initialExportPeriod);
    return createInitialExportPeriod(allRows ?? []);
  });
  const [sourceFilters, setSourceFilters] = useState<SourceBrowserFilterState>({
    selectedMonth: "all",
    selectedWeek: "all",
    selectedDevice: "all",
    selectedChannel: "all",
  });

  useEffect(() => {
    const initialBuilder = createInitialBuilderState(initialInput);
    setBuilder(initialBuilder);
    setSavedSnapshot(normalizeDocForDirtyCheck(initialBuilder.doc));
  }, [initialInput]);

  useEffect(() => {
    setExportPeriod((prev) => {
      if (prev?.start || prev?.end) return prev;
      if (initialExportPeriod) return normalizeExportPeriod(initialExportPeriod);
      return createInitialExportPeriod(allRows ?? []);
    });
  }, [initialExportPeriod, allRows]);

  const slotMeta = useMemo<Partial<ExportSectionMeta>>(() => {
    return {
      advertiserName: meta?.advertiserName ?? initialInput.advertiserName ?? "",
      reportTitle: meta?.reportTitle ?? "광고 성과 리포트",
      reportTypeName: meta?.reportTypeName ?? initialInput.reportTypeName ?? "",
      periodLabel: meta?.periodLabel ?? initialInput.periodLabel ?? "",
      generatedAtLabel: meta?.generatedAtLabel,
      preset: meta?.preset ?? initialInput.preset ?? "starter",
    };
  }, [
    meta?.advertiserName,
    meta?.generatedAtLabel,
    meta?.periodLabel,
    meta?.preset,
    meta?.reportTitle,
    meta?.reportTypeName,
    initialInput.advertiserName,
    initialInput.periodLabel,
    initialInput.preset,
    initialInput.reportTypeName,
  ]);

  const normalizedRows = useMemo<Row[]>(() => {
    return Array.isArray(allRows) ? (allRows as Row[]) : [];
  }, [allRows]);

  const periodScopedRows = useMemo(() => {
    return filterRowsByExportPeriod(normalizedRows ?? [], exportPeriod);
  }, [normalizedRows, exportPeriod]);

  const optionState = useMemo(() => {
    return buildOptions(periodScopedRows);
  }, [periodScopedRows]);

  const weekOptions = useMemo(() => {
    return buildWeekOptions(periodScopedRows, sourceFilters.selectedMonth);
  }, [periodScopedRows, sourceFilters.selectedMonth]);

  useEffect(() => {
    const monthValid =
      sourceFilters.selectedMonth === "all" ||
      optionState.monthOptions.some((item) => {
        const value = getStringOptionValue(item, [
          "monthKey",
          "value",
          "key",
          "label",
        ]);
        return value === sourceFilters.selectedMonth;
      });

    const deviceValid =
      sourceFilters.selectedDevice === "all" ||
      optionState.deviceOptions.some((item) => {
        const value = getStringOptionValue(item, [
          "value",
          "deviceKey",
          "key",
          "label",
        ]);
        return value === sourceFilters.selectedDevice;
      });

    const channelValid =
      sourceFilters.selectedChannel === "all" ||
      optionState.channelOptions.some((item) => {
        const value = getStringOptionValue(item, [
          "value",
          "channelKey",
          "sourceKey",
          "key",
          "label",
        ]);
        return value === sourceFilters.selectedChannel;
      });

    const weekValid =
      sourceFilters.selectedWeek === "all" ||
      weekOptions.some((item) => {
        const value = getStringOptionValue(item, [
          "weekKey",
          "value",
          "key",
          "label",
        ]);
        return value === sourceFilters.selectedWeek;
      });

    if (monthValid && deviceValid && channelValid && weekValid) return;

    setSourceFilters((prev) => ({
      selectedMonth: monthValid ? prev.selectedMonth : "all",
      selectedWeek: weekValid ? prev.selectedWeek : "all",
      selectedDevice: deviceValid ? prev.selectedDevice : "all",
      selectedChannel: channelValid ? prev.selectedChannel : "all",
    }));
  }, [
    optionState.monthOptions,
    optionState.deviceOptions,
    optionState.channelOptions,
    weekOptions,
    sourceFilters.selectedMonth,
    sourceFilters.selectedWeek,
    sourceFilters.selectedDevice,
    sourceFilters.selectedChannel,
  ]);

  const exportRows = useMemo(() => {
    return filterRows({
      rows: periodScopedRows,
      selectedMonth: sourceFilters.selectedMonth,
      selectedWeek: sourceFilters.selectedWeek,
      selectedDevice: sourceFilters.selectedDevice,
      selectedChannel: sourceFilters.selectedChannel,
    });
  }, [periodScopedRows, sourceFilters]);

  const resolvedSectionPayloads = useMemo<
    ExportSectionPayloadMap | undefined
  >(() => {
    const basePayloads: ExportSectionPayloadMap = {
      ...(sectionPayloads ?? {}),
    };

    try {
      if (!normalizedRows.length) {
        return Object.keys(basePayloads).length ? basePayloads : undefined;
      }

      const rowPayloads = buildExportPayloadsFromRows(exportRows ?? []);

      return {
        ...basePayloads,
        ...(rowPayloads ?? {}),
      };
    } catch (e) {
      console.error("buildExportPayloadsFromRows failed:", e);
      return Object.keys(basePayloads).length ? basePayloads : undefined;
    }
  }, [normalizedRows.length, exportRows, sectionPayloads]);

  const effectiveSlotMeta = useMemo<Partial<ExportSectionMeta>>(() => {
    return {
      ...slotMeta,
      periodLabel: exportPeriod?.label || slotMeta.periodLabel || "",
    };
  }, [slotMeta, exportPeriod]);

  const doc = builder?.doc ?? null;
  const selectedPageId = builder?.selectedPageId ?? null;
  const selectedSlotId = builder?.selectedSlotId ?? null;

  const selectedPage = useMemo(() => {
    if (!doc) return null;
    return (
      doc.pages.find((page) => page.id === selectedPageId) ??
      doc.pages[0] ??
      null
    );
  }, [doc, selectedPageId]);

  const selectedBlock = useMemo(() => {
    if (!selectedPage || !selectedSlotId) return null;
    return (
      selectedPage.blocks.find((block) => block.slotId === selectedSlotId) ??
      null
    );
  }, [selectedPage, selectedSlotId]);

  const selectedTemplate = useMemo(() => {
    if (!selectedPage) return null;
    return (
      EXPORT_TEMPLATES.find(
        (template) => template.key === selectedPage.templateKey
      ) ?? null
    );
  }, [selectedPage]);

  const selectedSlotDefinition = useMemo(() => {
    if (!selectedTemplate || !selectedSlotId) return null;
    return (
      selectedTemplate.slots.find((slot) => slot.id === selectedSlotId) ?? null
    );
  }, [selectedTemplate, selectedSlotId]);

  const selectedSectionLabel = useMemo(() => {
    if (!selectedBlock) return null;
    return selectedBlock.sectionKey;
  }, [selectedBlock]);

  const selectedInsightMode: ExportInsightMode =
    selectedBlock?.insightMode ?? "auto";
  const selectedInsightText = selectedBlock?.insightText ?? "";

  const slotIdsInOrder = useMemo(() => {
    return selectedTemplate?.slots.map((slot) => slot.id) ?? [];
  }, [selectedTemplate]);

  const selectedSlotIndex = useMemo(() => {
    if (!selectedSlotId) return -1;
    return slotIdsInOrder.findIndex((slotId) => slotId === selectedSlotId);
  }, [slotIdsInOrder, selectedSlotId]);

  const previousSlotId =
    selectedSlotIndex > 0 ? slotIdsInOrder[selectedSlotIndex - 1] : null;
  const nextSlotId =
    selectedSlotIndex >= 0 && selectedSlotIndex < slotIdsInOrder.length - 1
      ? slotIdsInOrder[selectedSlotIndex + 1]
      : null;

  const emptySlotIds = useMemo(() => {
    if (!selectedPage) return [];
    const usedSlotIds = new Set(selectedPage.blocks.map((block) => block.slotId));
    return slotIdsInOrder.filter((slotId) => !usedSlotIds.has(slotId));
  }, [selectedPage, slotIdsInOrder]);

  const nextEmptySlotIdForDuplicate = useMemo(() => {
    if (!selectedSlotId) return emptySlotIds[0] ?? null;

    const currentIndex = slotIdsInOrder.findIndex(
      (slotId) => slotId === selectedSlotId
    );
    if (currentIndex < 0) return emptySlotIds[0] ?? null;

    const nextEmptyAfterCurrent =
      slotIdsInOrder
        .slice(currentIndex + 1)
        .find((slotId) => emptySlotIds.includes(slotId)) ?? null;

    return nextEmptyAfterCurrent ?? emptySlotIds[0] ?? null;
  }, [emptySlotIds, selectedSlotId, slotIdsInOrder]);

  const canMoveUp = !!selectedBlock && !!previousSlotId;
  const canMoveDown = !!selectedBlock && !!nextSlotId;
  const canDuplicate = !!selectedBlock && !!nextEmptySlotIdForDuplicate;
  const canRemove = !!selectedBlock;

  const currentSnapshot = useMemo(() => {
    if (!doc) return null;
    return normalizeDocForDirtyCheck(doc);
  }, [doc]);

  const isDirty = !!doc && !!savedSnapshot && currentSnapshot !== savedSnapshot;

  const documentTitle = useMemo(() => {
    if (!doc) {
      const advertiser = initialInput.advertiserName?.trim() || "광고주";
      const reportType = initialInput.reportTypeName?.trim() || "리포트";
      const period =
        exportPeriod?.label?.trim() ||
        initialInput.periodLabel?.trim() ||
        "기간미정";
      return `${advertiser} / ${reportType} / ${period}`;
    }

    const advertiser = doc.meta.advertiserName?.trim() || "광고주";
    const reportType = doc.meta.reportTypeName?.trim() || "리포트";
    const period =
      exportPeriod?.label?.trim() || doc.meta.periodLabel?.trim() || "기간미정";
    return `${advertiser} / ${reportType} / ${period}`;
  }, [
    doc,
    exportPeriod,
    initialInput.advertiserName,
    initialInput.reportTypeName,
    initialInput.periodLabel,
  ]);

  function handleChangeExportPreset(nextPreset: ExportPeriodPreset) {
    if (nextPreset === "custom") {
      setExportPeriod((prev) =>
        normalizeExportPeriod({
          ...prev,
          preset: "custom",
          label: buildExportPeriodLabel(prev.start, prev.end),
        })
      );
      return;
    }

    const resolved = resolveExportPeriodPreset(nextPreset);

    setExportPeriod(
      normalizeExportPeriod({
        preset: nextPreset,
        start: resolved.start,
        end: resolved.end,
        label: resolved.label,
      })
    );
  }

  function handleChangeExportStart(value: string) {
    setExportPeriod((prev) =>
      normalizeExportPeriod({
        ...prev,
        preset: "custom",
        start: value || null,
        end: prev.end ?? null,
        label: buildExportPeriodLabel(value || null, prev.end ?? null),
      })
    );
  }

  function handleChangeExportEnd(value: string) {
    setExportPeriod((prev) =>
      normalizeExportPeriod({
        ...prev,
        preset: "custom",
        start: prev.start ?? null,
        end: value || null,
        label: buildExportPeriodLabel(prev.start ?? null, value || null),
      })
    );
  }

  if (!builder || !doc) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-center px-4 py-10 xl:px-6">
          <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-8 text-sm text-slate-500 shadow-sm">
            Export Builder 불러오는 중...
          </div>
        </div>
      </div>
    );
  }

  const currentDoc: ExportDocument = doc;
  const currentSelectedPageId: string | null = selectedPageId;
  const currentSelectedSlotId: string | null = selectedSlotId;

  function updateBuilder(
    nextDoc: ExportDocument,
    nextSelectedPageId?: string | null,
    nextSelectedSlotId?: string | null,
    nextToast?: ToastState
  ) {
    const touched = touchExportDocument(nextDoc);

    setBuilder((prev) => {
      if (!prev) {
        return {
          doc: touched,
          selectedPageId:
            nextSelectedPageId !== undefined
              ? nextSelectedPageId
              : touched.pages[0]?.id ?? null,
          selectedSlotId:
            nextSelectedSlotId !== undefined ? nextSelectedSlotId : null,
        };
      }

      return {
        doc: touched,
        selectedPageId:
          nextSelectedPageId !== undefined
            ? nextSelectedPageId
            : prev.selectedPageId,
        selectedSlotId:
          nextSelectedSlotId !== undefined
            ? nextSelectedSlotId
            : prev.selectedSlotId,
      };
    });

    if (nextToast) setToast(nextToast);
  }

  function handleSaveReady() {
    setSavedSnapshot(normalizeDocForDirtyCheck(currentDoc));
    setToast({
      type: "success",
      message: "현재 상태를 저장 기준으로 확정했어.",
    });
  }

  function handleResetChanges() {
    if (!savedSnapshot) return;

    try {
      const parsed = JSON.parse(savedSnapshot) as Pick<
        ExportDocument,
        "ratio" | "meta" | "pages"
      >;

      const restoredDoc: ExportDocument = {
        ...currentDoc,
        ratio: parsed.ratio,
        meta: parsed.meta,
        pages: parsed.pages,
      };

      const restoredSelectedPageId =
        restoredDoc.pages.some((page) => page.id === currentSelectedPageId)
          ? currentSelectedPageId
          : restoredDoc.pages[0]?.id ?? null;

      const restoredSelectedPage =
        restoredDoc.pages.find((page) => page.id === restoredSelectedPageId) ??
        restoredDoc.pages[0] ??
        null;

      const restoredSelectedSlotId =
        currentSelectedSlotId &&
        restoredSelectedPage?.blocks.some(
          (block) => block.slotId === currentSelectedSlotId
        )
          ? currentSelectedSlotId
          : null;

      updateBuilder(restoredDoc, restoredSelectedPageId, restoredSelectedSlotId, {
        type: "info",
        message: "마지막 저장 기준 상태로 되돌렸어.",
      });
    } catch {
      setToast({
        type: "error",
        message: "저장 기준 복원 중 문제가 발생했어.",
      });
    }
  }

  function handleSelectPage(pageId: string) {
    setBuilder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selectedPageId: pageId,
        selectedSlotId: null,
      };
    });
  }

  function handleSelectSlot(pageId: string, slotId: string) {
    setBuilder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selectedPageId: pageId,
        selectedSlotId: slotId,
      };
    });
  }

  function handleAddPage(templateKey: ExportTemplateKey = "full-single") {
    const newPage = createBlankPageForTemplate(
      templateKey,
      `페이지 ${currentDoc.pages.length + 1}`
    );

    updateBuilder(
      {
        ...currentDoc,
        pages: [...currentDoc.pages, newPage],
      },
      newPage.id,
      null,
      {
        type: "success",
        message: "새 페이지가 추가되었어.",
      }
    );
  }

  function handleDeletePage(pageId: string) {
    if (currentDoc.pages.length <= 1) {
      setToast({
        type: "error",
        message: "최소 1개의 페이지는 유지되어야 해.",
      });
      return;
    }

    const nextPages = currentDoc.pages.filter((page) => page.id !== pageId);
    const nextSelectedPageId =
      currentSelectedPageId === pageId
        ? nextPages[0]?.id ?? null
        : currentSelectedPageId;

    updateBuilder(
      {
        ...currentDoc,
        pages: nextPages,
      },
      nextSelectedPageId,
      null,
      {
        type: "success",
        message: "페이지가 삭제되었어.",
      }
    );
  }

  function handleDuplicatePage(pageId: string) {
    const target = currentDoc.pages.find((page) => page.id === pageId);
    if (!target) return;

    const cloned = cloneExportPage({
      ...target,
      title: `${target.title || "페이지"} 복사본`,
    });

    const targetIndex = currentDoc.pages.findIndex((page) => page.id === pageId);
    const nextPages = [...currentDoc.pages];
    nextPages.splice(targetIndex + 1, 0, cloned);

    updateBuilder(
      {
        ...currentDoc,
        pages: nextPages,
      },
      cloned.id,
      null,
      {
        type: "success",
        message: "페이지가 복제되었어.",
      }
    );
  }

  function handleChangePageTitle(pageId: string, title: string) {
    const page = currentDoc.pages.find((item) => item.id === pageId);
    if (!page) return;

    updateBuilder({
      ...currentDoc,
      pages: currentDoc.pages.map((item) =>
        item.id === pageId ? { ...item, title } : item
      ),
    });
  }

  function handleChangeTemplate(pageId: string, templateKey: ExportTemplateKey) {
    const page = currentDoc.pages.find((item) => item.id === pageId);
    if (!page) return;

    const nextPage = resetPageTemplate(page, templateKey);

    updateBuilder(replacePage(currentDoc, nextPage), currentSelectedPageId, null, {
      type: "info",
      message: "템플릿이 변경되었고, 기존 슬롯 배치는 초기화되었어.",
    });
  }

  function handleAssignSection(
    pageId: string,
    slotId: string,
    sectionKey: ExportSectionKey
  ) {
    const page = currentDoc.pages.find((item) => item.id === pageId);
    if (!page) return;

    const nextPage = upsertBlockForSlot(page, slotId, sectionKey);

    updateBuilder(replacePage(currentDoc, nextPage), currentSelectedPageId, slotId, {
      type: "success",
      message: "섹션이 배치되었어.",
    });
  }

  function handleRemoveBlock(pageId: string, blockId: string) {
    const page = currentDoc.pages.find((item) => item.id === pageId);
    if (!page) return;

    const removedBlock = page.blocks.find((block) => block.id === blockId) ?? null;
    const nextPage = removeBlockById(page, blockId);

    updateBuilder(
      replacePage(currentDoc, nextPage),
      currentSelectedPageId,
      removedBlock?.slotId ?? currentSelectedSlotId,
      {
        type: "success",
        message: "섹션이 제거되었어.",
      }
    );
  }

  function handlePatchSelectedBlock(patch: BlockPatch) {
    if (!selectedPage || !selectedBlock) return;

    const nextPage = patchBlockById(selectedPage, selectedBlock.id, patch);

    updateBuilder(replacePage(currentDoc, nextPage));
  }

  function handleChangeSelectedInsightMode(mode: ExportInsightMode) {
    if (!selectedBlock) return;

    handlePatchSelectedBlock({
      insightMode: mode,
    });
  }

  function handleResetSelectedBlock() {
    if (!selectedPage || !selectedBlock) return;

    const nextPage = resetBlockOverrides(selectedPage, selectedBlock.id);

    updateBuilder(
      replacePage(currentDoc, nextPage),
      currentSelectedPageId,
      currentSelectedSlotId,
      {
        type: "info",
        message: "슬롯 설정이 기본값으로 초기화되었어.",
      }
    );
  }

  function handleMoveSelectedBlockUp() {
    if (!selectedPage || !selectedBlock || !previousSlotId) return;

    const nextPage = moveBlockToSlot(selectedPage, selectedBlock.id, previousSlotId);

    updateBuilder(
      replacePage(currentDoc, nextPage),
      currentSelectedPageId,
      previousSlotId,
      {
        type: "success",
        message: "섹션을 이전 슬롯으로 이동했어.",
      }
    );
  }

  function handleMoveSelectedBlockDown() {
    if (!selectedPage || !selectedBlock || !nextSlotId) return;

    const nextPage = moveBlockToSlot(selectedPage, selectedBlock.id, nextSlotId);

    updateBuilder(
      replacePage(currentDoc, nextPage),
      currentSelectedPageId,
      nextSlotId,
      {
        type: "success",
        message: "섹션을 다음 슬롯으로 이동했어.",
      }
    );
  }

  function handleDuplicateSelectedBlock() {
    if (!selectedPage || !selectedBlock) return;

    if (!nextEmptySlotIdForDuplicate) {
      setToast({
        type: "error",
        message: "복제할 빈 슬롯이 없어.",
      });
      return;
    }

    const nextPage = duplicateBlockToSlot(
      selectedPage,
      selectedBlock.id,
      nextEmptySlotIdForDuplicate
    );

    updateBuilder(
      replacePage(currentDoc, nextPage),
      currentSelectedPageId,
      nextEmptySlotIdForDuplicate,
      {
        type: "success",
        message: "섹션을 다른 빈 슬롯으로 복제했어.",
      }
    );
  }

  function handleRemoveSelectedBlock() {
    if (!selectedPage || !selectedBlock) return;
    handleRemoveBlock(selectedPage.id, selectedBlock.id);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-4 py-6 xl:px-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Export Builder MVP
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                16:9 슬라이드형 리포트 편집
              </h1>
              <p className="mt-2 text-sm text-slate-500">{documentTitle}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  페이지 {currentDoc.pages.length}장
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  비율 16:9
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Report ID: {currentDoc.meta.reportId}
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Export 기간: {exportPeriod?.label || "기간 미정"}
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  기간 적용 행 수: {periodScopedRows.length.toLocaleString()}
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  최종 반영 행 수: {exportRows.length.toLocaleString()}
                </div>
                <div
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    isDirty
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  ].join(" ")}
                >
                  {isDirty ? "Unsaved changes" : "Saved"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddPage("full-single")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                풀와이드 페이지 추가
              </button>

              <button
                type="button"
                onClick={() => handleAddPage("two-column-equal")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                2단 페이지 추가
              </button>

              <button
                type="button"
                onClick={handleSaveReady}
                disabled={!isDirty}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-medium transition",
                  isDirty
                    ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                Save
              </button>

              <button
                type="button"
                onClick={handleResetChanges}
                disabled={!isDirty}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-medium transition",
                  isDirty
                    ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                Reset Changes
              </button>

              <button
                type="button"
                disabled
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
                title="Step 17 초안에서는 export 연결 전"
              >
                PDF Export (예정)
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Export 기간 조정
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  이 설정은 export-builder에서만 사용되고, reports / share 화면에는 영향을 주지 않아.
                </div>
              </div>

              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">
                포함 행 수: {exportRows.length.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_180px_180px_minmax(0,1fr)]">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Preset
                </label>
                <select
                  value={exportPeriod.preset}
                  onChange={(e) =>
                    handleChangeExportPreset(e.target.value as ExportPeriodPreset)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400"
                >
                  {EXPORT_PERIOD_PRESET_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Start Date
                </label>
                <input
                  type="date"
                  value={toInputDate(exportPeriod.start)}
                  onChange={(e) => handleChangeExportStart(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  End Date
                </label>
                <input
                  type="date"
                  value={toInputDate(exportPeriod.end)}
                  onChange={(e) => handleChangeExportEnd(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Applied Period
                </label>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  {exportPeriod.label || "기간 미정"}
                </div>
              </div>
            </div>
          </div>

          {toast ? (
            <div
              className={[
                "mt-4 rounded-2xl border px-4 py-3 text-sm",
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : toast.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-blue-200 bg-blue-50 text-blue-700",
              ].join(" ")}
            >
              {toast.message}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">페이지 목록</div>
                <div className="mt-1 text-xs text-slate-500">
                  페이지 선택 / 순서 확인
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {currentDoc.pages.map((page, index) => {
                const isSelected = selectedPage?.id === page.id;

                return (
                  <div
                    key={page.id}
                    className={[
                      "rounded-2xl border p-3 transition",
                      isSelected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectPage(page.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={[
                              "text-[11px] font-semibold uppercase tracking-[0.16em]",
                              isSelected ? "text-slate-300" : "text-slate-400",
                            ].join(" ")}
                          >
                            Page {index + 1}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold">
                            {page.title?.trim() || `페이지 ${index + 1}`}
                          </div>
                          <div
                            className={[
                              "mt-1 truncate text-xs",
                              isSelected ? "text-slate-300" : "text-slate-500",
                            ].join(" ")}
                          >
                            {page.templateKey}
                          </div>
                        </div>

                        <div
                          className={[
                            "rounded-full px-2 py-1 text-[10px] font-medium",
                            isSelected
                              ? "bg-white/10 text-white"
                              : "bg-slate-100 text-slate-500",
                          ].join(" ")}
                        >
                          {page.blocks.length} blocks
                        </div>
                      </div>
                    </button>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleDuplicatePage(page.id)}
                        className={[
                          "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                          isSelected
                            ? "border-white/20 bg-white/10 text-white hover:bg-white/15"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        복제
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePage(page.id)}
                        className={[
                          "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                          isSelected
                            ? "border-red-300/30 bg-red-400/10 text-red-100 hover:bg-red-400/15"
                            : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
                        ].join(" ")}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-6">
            {selectedPage ? (
              <>
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        페이지 제목
                      </label>
                      <input
                        value={selectedPage.title ?? ""}
                        onChange={(e) =>
                          handleChangePageTitle(selectedPage.id, e.target.value)
                        }
                        placeholder="예: 월간 성과 요약"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        페이지 템플릿
                      </label>
                      <select
                        value={selectedPage.templateKey}
                        onChange={(e) =>
                          handleChangeTemplate(
                            selectedPage.id,
                            e.target.value as ExportTemplateKey
                          )
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400"
                      >
                        {EXPORT_TEMPLATES.map((template) => (
                          <option key={template.key} value={template.key}>
                            {template.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs text-slate-500">
                        템플릿 변경 시 기존 슬롯 배치는 안전하게 초기화돼.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Slot Inspector
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        슬롯을 클릭해서 title / subtitle / hidden / insight / reset 을 조정해.
                      </div>
                    </div>

                    {selectedSlotDefinition ? (
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                        {selectedSlotDefinition.label}
                      </div>
                    ) : null}
                  </div>

                  {!selectedSlotId ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      우측 슬라이드에서 슬롯을 클릭해 선택해줘.
                    </div>
                  ) : !selectedBlock ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      현재 선택한 슬롯에는 아직 섹션이 없어. 먼저 섹션을 배치해줘.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Section Key
                          </label>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                            {selectedSectionLabel}
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            숨김 처리
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              handlePatchSelectedBlock({
                                hidden: !(selectedBlock.hidden ?? false),
                              })
                            }
                            className={[
                              "w-full rounded-2xl border px-4 py-3 text-sm font-medium transition",
                              selectedBlock.hidden
                                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            {selectedBlock.hidden ? "숨김 해제" : "숨김 처리"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                        <button
                          type="button"
                          onClick={handleMoveSelectedBlockUp}
                          disabled={!canMoveUp}
                          className={[
                            "rounded-xl border px-4 py-2 text-sm font-medium transition",
                            canMoveUp
                              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                          ].join(" ")}
                        >
                          이전 슬롯
                        </button>

                        <button
                          type="button"
                          onClick={handleMoveSelectedBlockDown}
                          disabled={!canMoveDown}
                          className={[
                            "rounded-xl border px-4 py-2 text-sm font-medium transition",
                            canMoveDown
                              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                          ].join(" ")}
                        >
                          다음 슬롯
                        </button>

                        <button
                          type="button"
                          onClick={handleDuplicateSelectedBlock}
                          disabled={!canDuplicate}
                          className={[
                            "rounded-xl border px-4 py-2 text-sm font-medium transition",
                            canDuplicate
                              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                          ].join(" ")}
                        >
                          복제
                        </button>

                        <button
                          type="button"
                          onClick={handleRemoveSelectedBlock}
                          disabled={!canRemove}
                          className={[
                            "rounded-xl border px-4 py-2 text-sm font-medium transition",
                            canRemove
                              ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                          ].join(" ")}
                        >
                          제거
                        </button>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Custom Title
                        </label>
                        <input
                          value={selectedBlock.title ?? ""}
                          onChange={(e) =>
                            handlePatchSelectedBlock({ title: e.target.value })
                          }
                          placeholder="비워두면 기본 표시를 유지해."
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Custom Subtitle
                        </label>
                        <input
                          value={selectedBlock.subtitle ?? ""}
                          onChange={(e) =>
                            handlePatchSelectedBlock({ subtitle: e.target.value })
                          }
                          placeholder="필요한 경우에만 보조 문구를 넣어줘."
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                        />
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Insight Mode
                          </label>
                          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-medium text-slate-500">
                            {selectedInsightMode === "manual" ? "직접작성" : "자동작성"}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleChangeSelectedInsightMode("auto")}
                            className={[
                              "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                              selectedInsightMode === "auto"
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            자동 인사이트
                          </button>

                          <button
                            type="button"
                            onClick={() => handleChangeSelectedInsightMode("manual")}
                            className={[
                              "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                              selectedInsightMode === "manual"
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            수동 입력
                          </button>
                        </div>

                        {selectedInsightMode === "manual" ? (
                          <textarea
                            value={selectedInsightText}
                            onChange={(e) =>
                              handlePatchSelectedBlock({
                                insightMode: "manual",
                                insightText: e.target.value,
                              })
                            }
                            placeholder={
                              "예:\n- 주요 KPI는 전월 대비 전반적으로 개선됐어.\n- 매출 증가율이 광고비 증가율을 상회해 효율이 좋아졌어.\n- 상위 캠페인 중심으로 성과가 집중되는 흐름이 보여."
                            }
                            rows={5}
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                          />
                        ) : (
                          <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            자동 인사이트는 다음 단계에서 실제 데이터 기반으로 생성될 예정이야. 현재는 구조만 먼저 연결되어 있고, 자동 모드에서는 수동 입력 문구가 장표에 표시되지 않아.
                          </div>
                        )}

                        <div className="mt-2 text-xs text-slate-500">
                          수동 입력은 현재 장표에 즉시 반영되고, 자동 모드는 다음 단계의 payload/insight generator와 연결될 예정이야.
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleResetSelectedBlock}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Reset to Default
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <ExportPageView
                  page={selectedPage}
                  pageNumber={
                    Math.max(
                      0,
                      currentDoc.pages.findIndex((page) => page.id === selectedPage.id)
                    ) + 1
                  }
                  onAssignSection={handleAssignSection}
                  onRemoveBlock={handleRemoveBlock}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={handleSelectSlot}
                  meta={effectiveSlotMeta}
                  sectionPayloads={resolvedSectionPayloads}
                  sourceFilters={sourceFilters}
                  monthOptions={optionState.monthOptions}
                  weekOptions={weekOptions}
                  deviceOptions={optionState.deviceOptions}
                  channelOptions={optionState.channelOptions}
                  onChangeSourceFilters={setSourceFilters}
                />

                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">현재 페이지 상태</div>
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <pre className="text-xs leading-6 text-slate-700">
{JSON.stringify(selectedPage, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
                페이지가 없어.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
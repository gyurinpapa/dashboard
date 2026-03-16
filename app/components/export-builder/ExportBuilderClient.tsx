"use client";

import { useMemo, useState } from "react";
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
import type {
  CreateExportDocumentInput,
  ExportDocument,
  ExportPage,
  ExportSectionKey,
  ExportTemplateKey,
} from "@/src/lib/export-builder/types";
import type {
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "@/src/lib/export-builder/section-props";

type Props = {
  initialInput: CreateExportDocumentInput;
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
};

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type BuilderState = {
  doc: ExportDocument;
  selectedPageId: string | null;
};

function createInitialBuilderState(
  initialInput: CreateExportDocumentInput
): BuilderState {
  const initialDoc = createExportDocument(initialInput);

  return {
    doc: initialDoc,
    selectedPageId: initialDoc.pages[0]?.id ?? null,
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

export default function ExportBuilderClient({
  initialInput,
  meta,
  sectionPayloads,
}: Props) {
  const [builder, setBuilder] = useState<BuilderState>(() =>
    createInitialBuilderState(initialInput)
  );
  const [toast, setToast] = useState<ToastState>(null);

  const { doc, selectedPageId } = builder;

  const selectedPage = useMemo(
    () => doc.pages.find((page) => page.id === selectedPageId) ?? doc.pages[0] ?? null,
    [doc.pages, selectedPageId]
  );

  /**
   * Step 17-9
   * Export section 공통 meta 주입용
   * - route/page.tsx에서 넘어온 meta 우선
   * - 없으면 doc.meta / initialInput 기준 fallback
   */
  const slotMeta = useMemo<Partial<ExportSectionMeta>>(() => {
    return {
      advertiserName:
        meta?.advertiserName ??
        doc.meta.advertiserName ??
        initialInput.advertiserName ??
        "",
      reportTitle:
        meta?.reportTitle ??
        "광고 성과 리포트",
      reportTypeName:
        meta?.reportTypeName ??
        doc.meta.reportTypeName ??
        initialInput.reportTypeName ??
        "",
      periodLabel:
        meta?.periodLabel ??
        doc.meta.periodLabel ??
        initialInput.periodLabel ??
        "",
      generatedAtLabel:
        meta?.generatedAtLabel,
      preset:
        meta?.preset ??
        initialInput.preset ??
        "starter",
    };
  }, [
    meta?.advertiserName,
    meta?.generatedAtLabel,
    meta?.periodLabel,
    meta?.preset,
    meta?.reportTitle,
    meta?.reportTypeName,
    doc.meta.advertiserName,
    doc.meta.periodLabel,
    doc.meta.reportTypeName,
    initialInput.advertiserName,
    initialInput.periodLabel,
    initialInput.preset,
    initialInput.reportTypeName,
  ]);

  const documentTitle = useMemo(() => {
    const advertiser = doc.meta.advertiserName?.trim() || "광고주";
    const reportType = doc.meta.reportTypeName?.trim() || "리포트";
    const period = doc.meta.periodLabel?.trim() || "기간미정";
    return `${advertiser} / ${reportType} / ${period}`;
  }, [doc.meta.advertiserName, doc.meta.reportTypeName, doc.meta.periodLabel]);

  function updateBuilder(
    nextDoc: ExportDocument,
    nextSelectedPageId?: string | null,
    nextToast?: ToastState
  ) {
    const touched = touchExportDocument(nextDoc);

    setBuilder((prev) => ({
      doc: touched,
      selectedPageId:
        nextSelectedPageId !== undefined
          ? nextSelectedPageId
          : prev.selectedPageId,
    }));

    if (nextToast) setToast(nextToast);
  }

  function handleSelectPage(pageId: string) {
    setBuilder((prev) => ({
      ...prev,
      selectedPageId: pageId,
    }));
  }

  function handleAddPage(templateKey: ExportTemplateKey = "full-single") {
    const newPage = createBlankPageForTemplate(
      templateKey,
      `페이지 ${doc.pages.length + 1}`
    );

    updateBuilder(
      {
        ...doc,
        pages: [...doc.pages, newPage],
      },
      newPage.id,
      {
        type: "success",
        message: "새 페이지가 추가되었어.",
      }
    );
  }

  function handleDeletePage(pageId: string) {
    if (doc.pages.length <= 1) {
      setToast({
        type: "error",
        message: "최소 1개의 페이지는 유지되어야 해.",
      });
      return;
    }

    const nextPages = doc.pages.filter((page) => page.id !== pageId);
    const nextSelectedPageId =
      selectedPageId === pageId ? nextPages[0]?.id ?? null : selectedPageId;

    updateBuilder(
      {
        ...doc,
        pages: nextPages,
      },
      nextSelectedPageId,
      {
        type: "success",
        message: "페이지가 삭제되었어.",
      }
    );
  }

  function handleDuplicatePage(pageId: string) {
    const target = doc.pages.find((page) => page.id === pageId);
    if (!target) return;

    const cloned = cloneExportPage({
      ...target,
      title: `${target.title || "페이지"} 복사본`,
    });

    const targetIndex = doc.pages.findIndex((page) => page.id === pageId);
    const nextPages = [...doc.pages];
    nextPages.splice(targetIndex + 1, 0, cloned);

    updateBuilder(
      {
        ...doc,
        pages: nextPages,
      },
      cloned.id,
      {
        type: "success",
        message: "페이지가 복제되었어.",
      }
    );
  }

  function handleChangePageTitle(pageId: string, title: string) {
    const page = doc.pages.find((item) => item.id === pageId);
    if (!page) return;

    updateBuilder({
      ...doc,
      pages: doc.pages.map((item) =>
        item.id === pageId ? { ...item, title } : item
      ),
    });
  }

  function handleChangeTemplate(pageId: string, templateKey: ExportTemplateKey) {
    const page = doc.pages.find((item) => item.id === pageId);
    if (!page) return;

    const nextPage = resetPageTemplate(page, templateKey);

    updateBuilder(replacePage(doc, nextPage), selectedPageId, {
      type: "info",
      message: "템플릿이 변경되었고, 기존 슬롯 배치는 초기화되었어.",
    });
  }

  function handleAssignSection(
    pageId: string,
    slotId: string,
    sectionKey: ExportSectionKey
  ) {
    const page = doc.pages.find((item) => item.id === pageId);
    if (!page) return;

    const nextPage = upsertBlockForSlot(page, slotId, sectionKey);

    updateBuilder(replacePage(doc, nextPage), selectedPageId, {
      type: "success",
      message: "섹션이 배치되었어.",
    });
  }

  function handleRemoveBlock(pageId: string, blockId: string) {
    const page = doc.pages.find((item) => item.id === pageId);
    if (!page) return;

    const nextPage = removeBlockById(page, blockId);

    updateBuilder(replacePage(doc, nextPage), selectedPageId, {
      type: "success",
      message: "섹션이 제거되었어.",
    });
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
                  페이지 {doc.pages.length}장
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  비율 16:9
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  Report ID: {doc.meta.reportId}
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
                disabled
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
                title="Step 17 초안에서는 export 연결 전"
              >
                PDF Export (예정)
              </button>
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
              {doc.pages.map((page, index) => {
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

                <ExportPageView
                  page={selectedPage}
                  pageNumber={
                    Math.max(
                      0,
                      doc.pages.findIndex((page) => page.id === selectedPage.id)
                    ) + 1
                  }
                  onAssignSection={handleAssignSection}
                  onRemoveBlock={handleRemoveBlock}
                  meta={slotMeta}
                  sectionPayloads={sectionPayloads}
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
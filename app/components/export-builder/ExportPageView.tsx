"use client";

import ExportSlot from "./ExportSlot";
import { getExportTemplate } from "@/src/lib/export-builder/templates";
import type {
  ExportPage,
  ExportSectionKey,
} from "@/src/lib/export-builder/types";
import type {
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "@/src/lib/export-builder/section-props";

type Props = {
  page: ExportPage;
  pageNumber: number;
  onAssignSection: (
    pageId: string,
    slotId: string,
    sectionKey: ExportSectionKey
  ) => void;
  onRemoveBlock: (pageId: string, blockId: string) => void;

  /**
   * Step 17-9
   * Export section 공통 입력
   */
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
};

function getGridClass(templateKey: ExportPage["templateKey"]) {
  switch (templateKey) {
    case "full-single":
      return "grid-cols-1 grid-rows-1";
    case "top-bottom":
      return "grid-cols-1 grid-rows-2";
    case "two-column-equal":
      return "grid-cols-2 grid-rows-1";
    case "left-wide-right-stack":
      return "grid-cols-12 grid-rows-2";
    case "grid-2x2":
      return "grid-cols-2 grid-rows-2";
    default:
      return "grid-cols-1 grid-rows-1";
  }
}

function getSlotSpanClass(
  templateKey: ExportPage["templateKey"],
  slotId: string
) {
  if (templateKey === "full-single") {
    return "col-span-1 row-span-1";
  }

  if (templateKey === "top-bottom") {
    if (slotId === "top") return "col-span-1 row-span-1";
    if (slotId === "bottom") return "col-span-1 row-span-1";
  }

  if (templateKey === "two-column-equal") {
    if (slotId === "left") return "col-span-1 row-span-1";
    if (slotId === "right") return "col-span-1 row-span-1";
  }

  if (templateKey === "left-wide-right-stack") {
    if (slotId === "left") return "col-span-8 row-span-2";
    if (slotId === "right-top") return "col-span-4 row-span-1";
    if (slotId === "right-bottom") return "col-span-4 row-span-1";
  }

  if (templateKey === "grid-2x2") {
    if (slotId === "top-left") return "col-span-1 row-span-1";
    if (slotId === "top-right") return "col-span-1 row-span-1";
    if (slotId === "bottom-left") return "col-span-1 row-span-1";
    if (slotId === "bottom-right") return "col-span-1 row-span-1";
  }

  return "col-span-1 row-span-1";
}

export default function ExportPageView({
  page,
  pageNumber,
  onAssignSection,
  onRemoveBlock,
  meta,
  sectionPayloads,
}: Props) {
  const template = getExportTemplate(page.templateKey);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Page {pageNumber}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {page.title?.trim() || `페이지 ${pageNumber}`}
          </div>
          <div className="mt-1 text-xs text-slate-500">{template.label}</div>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
          16:9 Preview
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100 p-4">
        <div
          className="relative mx-auto aspect-[16/9] w-full overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-inner"
          data-export-page-id={page.id}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.08),_transparent_40%)]" />

          <div
            className={[
              "relative z-10 grid h-full w-full gap-4 p-5",
              getGridClass(page.templateKey),
            ].join(" ")}
          >
            {template.slots.map((slot) => (
              <div
                key={slot.id}
                className={getSlotSpanClass(page.templateKey, slot.id)}
              >
                <ExportSlot
                  page={page}
                  slot={slot}
                  onAssignSection={onAssignSection}
                  onRemoveBlock={onRemoveBlock}
                  meta={meta}
                  sectionPayloads={sectionPayloads}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
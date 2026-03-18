"use client";

import SummaryKPICardView, {
  type SummaryKPICardDensity,
  type SummaryKPICardTone,
} from "@/app/components/sections/summary/SummaryKPICardView";
import type {
  ExportSectionMeta,
  ExportSummaryKPIData,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type KPIItem = {
  label: string;
  value: string;
  subValue?: string;
};

type LayoutMode = "full" | "wide" | "compact" | "side-compact";

type Props = {
  /**
   * Step 17 이전 호환용
   */
  title?: string;
  items?: KPIItem[];

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportSummaryKPIData>;

  /**
   * Step 19-6
   * 슬롯 크기별 렌더 밀도 분기
   */
  layoutMode?: LayoutMode;
};

const DEFAULT_ITEMS: KPIItem[] = [
  {
    label: "광고비",
    value: "₩12,480,000",
    subValue: "전월 대비 +8.2%",
  },
  {
    label: "매출",
    value: "₩38,920,000",
    subValue: "전월 대비 +14.6%",
  },
  {
    label: "전환",
    value: "1,284",
    subValue: "전월 대비 +6.8%",
  },
  {
    label: "ROAS",
    value: "312%",
    subValue: "전월 대비 +18pt",
  },
];

function normalizeLegacyItems(items: KPIItem[]): ExportSummaryKPIData["cards"] {
  return items.map((item, index) => ({
    key: `legacy-${index}-${item.label}`,
    label: item.label,
    value: item.value,
    subValue: item.subValue,
    tone: "neutral" as const,
  }));
}

function toCardDensity(layoutMode: LayoutMode): SummaryKPICardDensity {
  if (layoutMode === "full") return "export-full";
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  return "export-side-compact";
}

function toSafeTone(tone: unknown): SummaryKPICardTone {
  if (tone === "cost") return "cost";
  if (tone === "revenue") return "revenue";
  if (tone === "roas") return "roas";
  return "neutral";
}

export default function ExportSummaryKPI({
  title = "핵심 KPI 요약",
  items,
  meta,
  data,
  layoutMode = "wide",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-kpi", {
    ...(items ? { cards: normalizeLegacyItems(items) } : {}),
    ...(data ?? {}),
    ...(!items && !data ? { cards: normalizeLegacyItems(DEFAULT_ITEMS) } : {}),
  });

  const safeCards = (resolvedData.cards ?? []).slice(0, 4);
  const displayTitle = title || "핵심 KPI 요약";
  const cardDensity = toCardDensity(layoutMode);

  const isFull = layoutMode === "full";
  const isWide = layoutMode === "wide";
  const isCompact = layoutMode === "compact";
  const isSideCompact = layoutMode === "side-compact";

  const sectionClass = [
    "flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm",
    isFull
      ? "px-5 py-4"
      : isWide
      ? "px-4 py-3.5"
      : isCompact
      ? "px-3 py-2.5"
      : "px-2.5 py-2",
  ].join(" ");

  const headerWrapClass = [
    "flex items-start justify-between gap-3",
    isSideCompact ? "mb-1.5" : isCompact ? "mb-2" : "mb-3",
  ].join(" ");

  const eyebrowClass = [
    "font-semibold uppercase tracking-[0.18em] text-slate-400",
    isSideCompact ? "text-[9px]" : "text-[10px]",
  ].join(" ");

  const titleClass = [
    "mt-1 truncate font-semibold tracking-tight text-slate-900",
    isFull
      ? "text-[20px]"
      : isWide
      ? "text-[18px]"
      : isCompact
      ? "text-[15px]"
      : "text-[13px]",
  ].join(" ");

  const metaClass = [
    "mt-1 truncate text-slate-500",
    isSideCompact ? "text-[9px]" : isCompact ? "text-[10px]" : "text-[11px]",
  ].join(" ");

  const badgeClass = [
    "shrink-0 rounded-full border border-slate-200 bg-slate-50 font-medium text-slate-500",
    isSideCompact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
  ].join(" ");

  const gridClass = [
    "grid flex-1 min-h-0 grid-cols-2 items-stretch",
    isSideCompact ? "gap-1.5" : isCompact ? "gap-2" : "gap-3",
  ].join(" ");

  return (
    <section className={sectionClass}>
      <div className={headerWrapClass}>
        <div className="min-w-0">
          <div className={eyebrowClass}>Summary</div>
          <h3 className={titleClass}>{displayTitle}</h3>
          {resolvedMeta.reportTypeName || resolvedMeta.periodLabel ? (
            <div className={metaClass}>
              {[resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </div>

        {!isSideCompact ? <div className={badgeClass}>KPI</div> : null}
      </div>

      <div className={gridClass}>
        {safeCards.map((item, index) => (
          <SummaryKPICardView
            key={item.key || `${item.label}-${index}`}
            title={item.label}
            value={item.value}
            subValue={item.subValue ?? item.changeLabel}
            tone={toSafeTone(item.tone)}
            density={cardDensity}
          />
        ))}
      </div>
    </section>
  );
}
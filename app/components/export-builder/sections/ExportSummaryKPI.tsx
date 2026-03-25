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
  title?: string;
  items?: KPIItem[];
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportSummaryKPIData>;
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

function getVisibleCardCount(layoutMode: LayoutMode) {
  if (layoutMode === "full") return 10;
  if (layoutMode === "wide") return 6;
  if (layoutMode === "compact") return 4;
  return 4;
}

function getGridClass(layoutMode: LayoutMode) {
  if (layoutMode === "full") {
    return "grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5";
  }
  if (layoutMode === "wide") {
    return "grid grid-cols-2 gap-3 sm:grid-cols-3";
  }
  if (layoutMode === "compact") {
    return "grid grid-cols-2 gap-2";
  }
  return "grid grid-cols-2 gap-1.5";
}

export default function ExportSummaryKPI({
  title,
  items,
  meta,
  data,
  layoutMode = "wide",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-kpi", {
    ...(items ? { cards: normalizeLegacyItems(items) } : {}),
    ...(data ?? {}),
  });

  const fallbackCards = normalizeLegacyItems(DEFAULT_ITEMS);
  const baseCards =
    Array.isArray(resolvedData.cards) && resolvedData.cards.length > 0
      ? resolvedData.cards
      : fallbackCards;

  const visibleCount = getVisibleCardCount(layoutMode);
  const safeCards = baseCards.slice(0, visibleCount);
  const cardDensity = toCardDensity(layoutMode);

  const displayTitle = title || "기간 성과 요약";
  const displaySubtitle = "현재 조회 조건 기준 핵심 지표";

  const metaText = [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
    .filter(Boolean)
    .join(" · ");

  const isSideCompact = layoutMode === "side-compact";
  const isCompact = layoutMode === "compact";
  const isWide = layoutMode === "wide";
  const isFull = layoutMode === "full";

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div
        className={[
          "border-b border-gray-200",
          isFull
            ? "px-5 py-4 sm:px-6 sm:py-5"
            : isWide
            ? "px-4 py-3.5"
            : isCompact
            ? "px-3 py-3"
            : "px-2.5 py-2.5",
        ].join(" ")}
      >
        <div
          className={[
            "font-semibold tracking-[-0.01em] text-gray-900",
            isFull
              ? "text-[15px] sm:text-[16px]"
              : isWide
              ? "text-[15px]"
              : isCompact
              ? "text-[13px]"
              : "text-[12px]",
          ].join(" ")}
        >
          {displayTitle}
        </div>

        <div
          className={[
            "mt-1 font-medium text-gray-500",
            isSideCompact ? "text-[10px]" : "text-xs sm:text-[12px]",
          ].join(" ")}
        >
          {displaySubtitle}
        </div>

        {metaText ? (
          <div
            className={[
              "mt-1 text-gray-400",
              isSideCompact ? "text-[9px]" : "text-[11px]",
            ].join(" ")}
          >
            {metaText}
          </div>
        ) : null}
      </div>

      <div
        className={[
          isFull
            ? "px-4 py-4 sm:px-6 sm:py-5"
            : isWide
            ? "px-4 py-4"
            : isCompact
            ? "px-3 py-3"
            : "px-2.5 py-2.5",
        ].join(" ")}
      >
        <div className={getGridClass(layoutMode)}>
          {safeCards.map((card, index) => (
            <SummaryKPICardView
              key={card.key || `${card.label}-${index}`}
              title={card.label}
              value={card.value}
              subValue={card.subValue ?? card.changeLabel}
              tone={toSafeTone(card.tone)}
              density={cardDensity}
              footerText={card.footerText}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
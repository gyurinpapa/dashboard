"use client";

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

export default function ExportSummaryKPI({
  title = "핵심 KPI 요약",
  items,
  meta,
  data,
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-kpi", {
    ...(items ? { cards: normalizeLegacyItems(items) } : {}),
    ...(data ?? {}),
    ...(!items && !data ? { cards: normalizeLegacyItems(DEFAULT_ITEMS) } : {}),
  });

  const safeCards = (resolvedData.cards ?? []).slice(0, 6);
  const displayTitle = title || "핵심 KPI 요약";

  return (
    <section className="flex h-full min-h-[220px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Summary
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {displayTitle}
          </h3>
          {(resolvedMeta.reportTypeName || resolvedMeta.periodLabel) ? (
            <div className="mt-1 text-xs text-slate-500">
              {[resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
          KPI
        </div>
      </div>

      <div
        className={[
          "grid flex-1 gap-3",
          safeCards.length <= 2
            ? "grid-cols-2"
            : safeCards.length <= 4
            ? "grid-cols-2 xl:grid-cols-4"
            : "grid-cols-2 xl:grid-cols-3",
        ].join(" ")}
      >
        {safeCards.map((item, index) => (
          <div
            key={item.key || `${item.label}-${index}`}
            className="flex min-h-[120px] flex-col justify-between rounded-[20px] border border-slate-200 bg-slate-50 p-4"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {item.label}
            </div>

            <div className="mt-3">
              <div className="text-xl font-semibold tracking-tight text-slate-900">
                {item.value}
              </div>
              {item.subValue ? (
                <div className="mt-2 text-xs font-medium text-slate-500">
                  {item.subValue}
                </div>
              ) : item.changeLabel ? (
                <div className="mt-2 text-xs font-medium text-slate-500">
                  {item.changeLabel}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
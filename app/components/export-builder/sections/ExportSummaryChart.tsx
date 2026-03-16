"use client";

import type {
  ExportSectionMeta,
  ExportSummaryChartData,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type ChartPoint = {
  label: string;
  cost: number;
  revenue: number;
};

type Props = {
  /**
   * Step 17 이전 호환용
   */
  title?: string;
  subtitle?: string;
  data?: ChartPoint[] | Partial<ExportSummaryChartData>;

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;
};

const DEFAULT_DATA: ChartPoint[] = [
  { label: "1주차", cost: 42, revenue: 65 },
  { label: "2주차", cost: 48, revenue: 74 },
  { label: "3주차", cost: 45, revenue: 70 },
  { label: "4주차", cost: 58, revenue: 92 },
  { label: "5주차", cost: 54, revenue: 88 },
];

function getMaxValue(data: Array<{ cost?: number; revenue?: number }>) {
  return Math.max(
    1,
    ...data.flatMap((item) => [item.cost || 0, item.revenue || 0])
  );
}

function formatCompactCurrency(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 100000000) return `₩${(value / 100000000).toFixed(1)}억`;
  if (value >= 1000000) return `₩${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `₩${Math.round(value / 1000)}K`;
  return `₩${Math.round(value)}`;
}

function formatRoasLabel(roas?: number) {
  const value = Number(roas);
  if (!Number.isFinite(value)) return "312%";
  const percent = value <= 10 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function isLegacyChartPointArray(
  value: Props["data"]
): value is ChartPoint[] {
  return Array.isArray(value);
}

function normalizeLegacyData(data: ChartPoint[]): ExportSummaryChartData["points"] {
  return data.map((item) => ({
    label: item.label,
    cost: item.cost,
    revenue: item.revenue,
  }));
}

export default function ExportSummaryChart({
  title = "기간 성과 추이",
  subtitle = "광고비 / 매출 흐름",
  data,
  meta,
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-chart", {
    ...(isLegacyChartPointArray(data)
      ? { points: normalizeLegacyData(data) }
      : (data ?? {})),
    ...(!data ? { points: normalizeLegacyData(DEFAULT_DATA) } : {}),
  });

  const safeData = (resolvedData.points ?? []).slice(0, 8);
  const maxValue = getMaxValue(safeData);

  const totalCost = safeData.reduce((sum, item) => sum + (item.cost || 0), 0);
  const totalRevenue = safeData.reduce((sum, item) => sum + (item.revenue || 0), 0);

  const bestPoint =
    safeData.reduce<{
      label: string;
      revenue: number;
    } | null>((best, item) => {
      const revenue = item.revenue || 0;
      if (!best || revenue > best.revenue) {
        return { label: item.label, revenue };
      }
      return best;
    }, null) ?? null;

  const avgRoas = totalCost > 0 ? (totalRevenue / totalCost) * 100 : undefined;

  const displayTitle = resolvedData.title || title;
  const displaySubtitle =
    subtitle ||
    [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
      .filter(Boolean)
      .join(" · ") ||
    "광고비 / 매출 흐름";

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Summary
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {displayTitle}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{displaySubtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
            Cost
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
            Revenue
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-full gap-4">
          {safeData.map((item, index) => {
            const costHeight = `${Math.max(8, ((item.cost || 0) / maxValue) * 100)}%`;
            const revenueHeight = `${Math.max(
              8,
              ((item.revenue || 0) / maxValue) * 100
            )}%`;

            return (
              <div
                key={`${item.label}-${index}`}
                className="flex flex-1 flex-col justify-end"
              >
                <div className="flex h-full items-end justify-center gap-2">
                  <div className="flex h-full w-full max-w-[28px] items-end">
                    <div
                      className="w-full rounded-t-lg border border-slate-300 bg-slate-300"
                      style={{ height: costHeight }}
                    />
                  </div>

                  <div className="flex h-full w-full max-w-[28px] items-end">
                    <div
                      className="w-full rounded-t-lg border border-slate-400 bg-slate-500"
                      style={{ height: revenueHeight }}
                    />
                  </div>
                </div>

                <div className="mt-3 text-center text-[11px] font-medium text-slate-500">
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">총 광고비</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {totalCost > 0 ? formatCompactCurrency(totalCost) : "₩12.5M"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">총 매출</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {totalRevenue > 0 ? formatCompactCurrency(totalRevenue) : "₩38.9M"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">최고 성과 구간</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {bestPoint?.label || "4주차"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">평균 ROAS</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatRoasLabel(avgRoas)}
          </div>
        </div>
      </div>
    </section>
  );
}
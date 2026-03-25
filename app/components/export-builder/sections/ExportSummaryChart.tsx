"use client";

import SummaryChartView, {
  type SummaryChartViewDensity,
  type SummaryChartViewPoint,
} from "@/app/components/sections/summary/SummaryChartView";
import { KRW, toSafeNumber } from "@/src/lib/report/format";
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

type LayoutMode = "full" | "wide" | "compact" | "side-compact";

type Props = {
  title?: string;
  subtitle?: string;
  data?: ChartPoint[] | Partial<ExportSummaryChartData>;
  meta?: Partial<ExportSectionMeta>;
  layoutMode?: LayoutMode;
};

const DEFAULT_DATA: ChartPoint[] = [
  { label: "1주차", cost: 42, revenue: 65 },
  { label: "2주차", cost: 48, revenue: 74 },
  { label: "3주차", cost: 45, revenue: 70 },
  { label: "4주차", cost: 58, revenue: 92 },
  { label: "5주차", cost: 54, revenue: 88 },
];

function isLegacyChartPointArray(
  value: Props["data"]
): value is ChartPoint[] {
  return Array.isArray(value);
}

function normalizeLegacyData(
  data: ChartPoint[]
): ExportSummaryChartData["points"] {
  return data.map((item) => ({
    label: item.label,
    cost: item.cost,
    revenue: item.revenue,
  }));
}

function toChartDensity(layoutMode: LayoutMode): SummaryChartViewDensity {
  if (layoutMode === "full") return "export-full";
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  return "export-side-compact";
}

function buildInsight(chartData: SummaryChartViewPoint[]) {
  if (!chartData.length) {
    return {
      currentLabel: "-",
      maxRevenueLabel: "-",
      minCostLabel: "-",
    };
  }

  const latest = chartData[chartData.length - 1];

  const maxRevenueRow = chartData.reduce((best, row) =>
    toSafeNumber(row?.revenue) > toSafeNumber(best?.revenue) ? row : best
  );

  const minCostRow = chartData.reduce((best, row) =>
    toSafeNumber(row?.cost) < toSafeNumber(best?.cost) ? row : best
  );

  return {
    currentLabel: String(latest?.label || "-"),
    maxRevenueLabel: `${String(maxRevenueRow?.label || "-")} · ${KRW(
      toSafeNumber(maxRevenueRow?.revenue)
    )}`,
    minCostLabel: `${String(minCostRow?.label || "-")} · ${KRW(
      toSafeNumber(minCostRow?.cost)
    )}`,
  };
}

export default function ExportSummaryChart({
  title,
  subtitle,
  data,
  meta,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-chart", {
    ...(isLegacyChartPointArray(data)
      ? { points: normalizeLegacyData(data) }
      : (data ?? {})),
  });

  const fallbackPoints = normalizeLegacyData(DEFAULT_DATA);
  const sourcePoints =
    Array.isArray(resolvedData.points) && resolvedData.points.length > 0
      ? resolvedData.points
      : fallbackPoints;

  const safeData = sourcePoints.slice(0, 8);

  const chartData: SummaryChartViewPoint[] = safeData.map((item) => ({
    label: String(item?.label || ""),
    cost: toSafeNumber(item?.cost),
    revenue: toSafeNumber(item?.revenue),
    roas: toSafeNumber(item?.roas),
  }));

  const baseSubtitle = "최근 월별 핵심 성과 흐름";
  const metaText = [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
    .filter(Boolean)
    .join(" · ");

  const displayTitle =
    resolvedData.title || title || "월별 비용 · 전환매출 · ROAS";

  const displaySubtitle =
    subtitle || (metaText ? `${baseSubtitle} · ${metaText}` : baseSubtitle);

  return (
    <SummaryChartView
      title={displayTitle}
      subtitle={displaySubtitle}
      data={chartData}
      density={toChartDensity(layoutMode)}
      insight={buildInsight(chartData)}
    />
  );
}
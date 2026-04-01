"use client";

import { useMemo } from "react";
import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  formatPercentFromRate,
} from "../../../../src/lib/report/format";
import SummaryChartView from "./SummaryChartView";
import type { SummaryChartViewPoint } from "./SummaryChartView";

type Props = {
  reportType?: "commerce" | "traffic";
  data: any[];
};

export default function SummaryChart({ reportType, data }: Props) {
  const isTraffic = reportType === "traffic";

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const insight = useMemo(() => {
    if (!safeData.length) {
      return {
        currentLabel: "-",
        maxRevenueLabel: "-",
        minCostLabel: "-",
      };
    }

    const latest = safeData[safeData.length - 1];

    if (isTraffic) {
      const maxClicksRow = safeData.reduce((best: any, row: any) =>
        toSafeNumber(row?.clicks) > toSafeNumber(best?.clicks) ? row : best
      );

      const maxCtrRow = safeData.reduce((best: any, row: any) =>
        normalizeRate01(row?.ctr) > normalizeRate01(best?.ctr) ? row : best
      );

      return {
        currentLabel: String(latest?.label || "-"),
        maxRevenueLabel: `${String(maxClicksRow?.label || "-")} · ${toSafeNumber(
          maxClicksRow?.clicks
        ).toLocaleString()}`,
        minCostLabel: `${String(maxCtrRow?.label || "-")} · ${formatPercentFromRate(
          maxCtrRow?.ctr,
          2
        )}`,
      };
    }

    const maxRevenueRow = safeData.reduce((best: any, row: any) =>
      toSafeNumber(row?.revenue) > toSafeNumber(best?.revenue) ? row : best
    );

    const minCostRow = safeData.reduce((best: any, row: any) =>
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
  }, [isTraffic, safeData]);

  const chartData: SummaryChartViewPoint[] = useMemo(() => {
    if (isTraffic) {
      return safeData.map((item: any) => ({
        label: String(item?.label || ""),
        cost: toSafeNumber(item?.impressions ?? item?.impr),
        revenue: toSafeNumber(item?.clicks),
        roas: normalizeRate01(item?.ctr),
      }));
    }

    return safeData.map((item: any) => ({
      label: String(item?.label || ""),
      cost: toSafeNumber(item?.cost),
      revenue: toSafeNumber(item?.revenue),
      roas: toSafeNumber(item?.roas),
    }));
  }, [isTraffic, safeData]);

  return (
    <SummaryChartView
      title={isTraffic ? "📈 주차별 노출 · 클릭 · CTR" : "📈 주차별 비용 · 전환매출 · ROAS"}
      subtitle="최근 주차별 핵심 성과 흐름을 시각적으로 살펴봅니다"
      data={chartData}
      density="report"
      insight={insight}
      reportType={reportType}
    />
  );
}
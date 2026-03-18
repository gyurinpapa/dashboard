"use client";

import { useMemo } from "react";
import { KRW, toSafeNumber } from "../../../../src/lib/report/format";
import SummaryChartView, {
  type SummaryChartViewPoint,
} from "./SummaryChartView";

type Props = {
  data: any[];
};

export default function SummaryChart({ data }: Props) {
  const safeData = useMemo(
    () => (Array.isArray(data) ? data : []),
    [data]
  );

  const insight = useMemo(() => {
    if (!safeData.length) {
      return {
        currentLabel: "-",
        maxRevenueLabel: "-",
        minCostLabel: "-",
      };
    }

    const latest = safeData[safeData.length - 1];

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
  }, [safeData]);

  const chartData: SummaryChartViewPoint[] = useMemo(
    () =>
      safeData.map((item: any) => ({
        label: String(item?.label || ""),
        cost: toSafeNumber(item?.cost),
        revenue: toSafeNumber(item?.revenue),
        roas: toSafeNumber(item?.roas),
      })),
    [safeData]
  );

  return (
    <SummaryChartView
      title="월별 비용 · 전환매출 · ROAS"
      subtitle="최근 월별 핵심 성과 흐름"
      data={chartData}
      density="report"
      insight={insight}
    />
  );
}
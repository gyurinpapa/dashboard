"use client";

import { memo, useMemo } from "react";
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

type SummaryChartInsight = {
  currentLabel: string;
  maxRevenueLabel: string;
  minCostLabel: string;
};

const EMPTY_INSIGHT: SummaryChartInsight = {
  currentLabel: "-",
  maxRevenueLabel: "-",
  minCostLabel: "-",
};

const REPORT_SUBTITLE = "최근 주차별 핵심 성과 흐름을 시각적으로 살펴봅니다";
const TRAFFIC_TITLE = "📈 주차별 노출 · 클릭 · CTR";
const COMMERCE_TITLE = "📈 주차별 비용 · 전환매출 · ROAS";

function buildChartModel(
  safeData: any[],
  isTraffic: boolean
): {
  insight: SummaryChartInsight;
  chartData: SummaryChartViewPoint[];
} {
  if (!safeData.length) {
    return {
      insight: EMPTY_INSIGHT,
      chartData: [],
    };
  }

  const latest = safeData[safeData.length - 1];
  const chartData = new Array<SummaryChartViewPoint>(safeData.length);

  // 성능 최적화 포인트:
  // - safeData를 insight용 / chartData용으로 여러 번 순회하지 않고
  //   한 번의 루프에서 함께 계산
  if (isTraffic) {
    let maxClicksRow = safeData[0];
    let maxCtrRow = safeData[0];

    for (let i = 0; i < safeData.length; i += 1) {
      const item = safeData[i];

      const impressions = toSafeNumber(item?.impressions ?? item?.impr);
      const clicks = toSafeNumber(item?.clicks);
      const ctr = normalizeRate01(item?.ctr);

      chartData[i] = {
        label: String(item?.label || ""),
        cost: impressions,
        revenue: clicks,
        roas: ctr,
      };

      if (clicks > toSafeNumber(maxClicksRow?.clicks)) {
        maxClicksRow = item;
      }

      if (ctr > normalizeRate01(maxCtrRow?.ctr)) {
        maxCtrRow = item;
      }
    }

    return {
      insight: {
        currentLabel: String(latest?.label || "-"),
        maxRevenueLabel: `${String(maxClicksRow?.label || "-")} · ${toSafeNumber(
          maxClicksRow?.clicks
        ).toLocaleString()}`,
        minCostLabel: `${String(maxCtrRow?.label || "-")} · ${formatPercentFromRate(
          maxCtrRow?.ctr,
          2
        )}`,
      },
      chartData,
    };
  }

  let maxRevenueRow = safeData[0];
  let minCostRow = safeData[0];

  for (let i = 0; i < safeData.length; i += 1) {
    const item = safeData[i];

    const cost = toSafeNumber(item?.cost);
    const revenue = toSafeNumber(item?.revenue);
    const roas = toSafeNumber(item?.roas);

    chartData[i] = {
      label: String(item?.label || ""),
      cost,
      revenue,
      roas,
    };

    if (revenue > toSafeNumber(maxRevenueRow?.revenue)) {
      maxRevenueRow = item;
    }

    if (cost < toSafeNumber(minCostRow?.cost)) {
      minCostRow = item;
    }
  }

  return {
    insight: {
      currentLabel: String(latest?.label || "-"),
      maxRevenueLabel: `${String(maxRevenueRow?.label || "-")} · ${KRW(
        toSafeNumber(maxRevenueRow?.revenue)
      )}`,
      minCostLabel: `${String(minCostRow?.label || "-")} · ${KRW(
        toSafeNumber(minCostRow?.cost)
      )}`,
    },
    chartData,
  };
}

function SummaryChart({ reportType, data }: Props) {
  const isTraffic = reportType === "traffic";

  // 성능 최적화 포인트:
  // - 외부 props 구조는 유지하면서 배열 안정성만 보강
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // 성능 최적화 포인트:
  // - chartData / insight를 한 번에 계산하여 불필요한 반복 순회 제거
  const { insight, chartData } = useMemo(() => {
    return buildChartModel(safeData, isTraffic);
  }, [safeData, isTraffic]);

  const title = isTraffic ? TRAFFIC_TITLE : COMMERCE_TITLE;

  return (
    <SummaryChartView
      title={title}
      subtitle={REPORT_SUBTITLE}
      data={chartData}
      density="report"
      insight={insight}
      reportType={reportType}
    />
  );
}

export default memo(SummaryChart);
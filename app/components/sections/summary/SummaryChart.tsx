"use client";

import { memo, useMemo } from "react";
import type { ReportType } from "../../../../src/lib/report/types";
import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
} from "../../../../src/lib/report/format";
import SummaryChartView from "./SummaryChartView";
import type { SummaryChartViewPoint } from "./SummaryChartView";

type Props = {
  reportType?: ReportType;
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

const EMPTY_DATA: any[] = [];

const TRAFFIC_TITLE = "📈 주차별 노출 · 클릭 · CTR";
const DB_ACQUISITION_TITLE = "📈 주차별 비용 · 전환 · CPA";
const COMMERCE_TITLE = "📈 주차별 비용 · 전환매출 · ROAS";

function getChartSubtitle(reportType: ReportType) {
  if (reportType === "traffic") {
    return "최근 주차별 유입 중심 핵심 성과 흐름을 시각적으로 살펴봅니다";
  }

  if (reportType === "db_acquisition") {
    return "최근 주차별 DB 확보·전환 효율 흐름을 시각적으로 살펴봅니다";
  }

  return "최근 주차별 핵심 성과 흐름을 시각적으로 살펴봅니다";
}

function buildTrafficChartModel(safeData: any[]): {
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

  let maxClicksRow = safeData[0];
  let maxCtrRow = safeData[0];

  for (let i = 0; i < safeData.length; i += 1) {
    const item = safeData[i];

    const impressions = toSafeNumber(item?.impressions ?? item?.impr);
    const clicks = toSafeNumber(item?.clicks ?? item?.click);
    const ctr = normalizeRate01(item?.ctr);

    chartData[i] = {
      label: String(item?.label ?? ""),
      cost: impressions,
      revenue: clicks,
      roas: ctr,
    };

    if (
      clicks >
      toSafeNumber(maxClicksRow?.clicks ?? maxClicksRow?.click)
    ) {
      maxClicksRow = item;
    }

    if (ctr > normalizeRate01(maxCtrRow?.ctr)) {
      maxCtrRow = item;
    }
  }

  return {
    insight: {
      currentLabel: String(latest?.label ?? "-"),
      maxRevenueLabel: `${String(maxClicksRow?.label ?? "-")} · ${toSafeNumber(
        maxClicksRow?.clicks ?? maxClicksRow?.click
      ).toLocaleString()}`,
      minCostLabel: `${String(maxCtrRow?.label ?? "-")} · ${formatPercentFromRate(
        maxCtrRow?.ctr,
        2
      )}`,
    },
    chartData,
  };
}

function buildDbAcquisitionChartModel(safeData: any[]): {
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

  let maxConvRow = safeData[0];
  let minCpaRow = safeData[0];

  for (let i = 0; i < safeData.length; i += 1) {
    const item = safeData[i];

    const cost = toSafeNumber(item?.cost);
    const conversions = toSafeNumber(item?.conversions ?? item?.conv);
    const cpa = toSafeNumber(item?.cpa);

    chartData[i] = {
      label: String(item?.label ?? ""),
      cost,
      revenue: conversions,
      roas: cpa,
    };

    if (
      conversions >
      toSafeNumber(maxConvRow?.conversions ?? maxConvRow?.conv)
    ) {
      maxConvRow = item;
    }

    const currentMinCpa = toSafeNumber(minCpaRow?.cpa);
    if (
      (currentMinCpa <= 0 && cpa > 0) ||
      (cpa > 0 && currentMinCpa > 0 && cpa < currentMinCpa)
    ) {
      minCpaRow = item;
    }
  }

  return {
    insight: {
      currentLabel: String(latest?.label ?? "-"),
      maxRevenueLabel: `${String(maxConvRow?.label ?? "-")} · ${toSafeNumber(
        maxConvRow?.conversions ?? maxConvRow?.conv
      ).toLocaleString()}`,
      minCostLabel: `${String(minCpaRow?.label ?? "-")} · ${KRW(
        toSafeNumber(minCpaRow?.cpa)
      )}`,
    },
    chartData,
  };
}

function buildCommerceChartModel(safeData: any[]): {
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

  let maxRevenueRow = safeData[0];
  let minCostRow = safeData[0];

  for (let i = 0; i < safeData.length; i += 1) {
    const item = safeData[i];

    const cost = toSafeNumber(item?.cost);
    const revenue = toSafeNumber(item?.revenue ?? item?.sales);
    const roas = normalizeRoas01(item?.roas);

    chartData[i] = {
      label: String(item?.label ?? ""),
      cost,
      revenue,
      roas,
    };

    if (
      revenue >
      toSafeNumber(maxRevenueRow?.revenue ?? maxRevenueRow?.sales)
    ) {
      maxRevenueRow = item;
    }

    const currentMinCost = toSafeNumber(minCostRow?.cost);
    if (
      (currentMinCost <= 0 && cost > 0) ||
      (cost > 0 && currentMinCost > 0 && cost < currentMinCost)
    ) {
      minCostRow = item;
    }
  }

  return {
    insight: {
      currentLabel: String(latest?.label ?? "-"),
      maxRevenueLabel: `${String(maxRevenueRow?.label ?? "-")} · ${KRW(
        toSafeNumber(maxRevenueRow?.revenue ?? maxRevenueRow?.sales)
      )}`,
      minCostLabel: `${String(minCostRow?.label ?? "-")} · ${KRW(
        toSafeNumber(minCostRow?.cost)
      )}`,
    },
    chartData,
  };
}

function buildChartModel(
  safeData: any[],
  reportType: ReportType
): {
  insight: SummaryChartInsight;
  chartData: SummaryChartViewPoint[];
} {
  if (reportType === "traffic") {
    return buildTrafficChartModel(safeData);
  }

  if (reportType === "db_acquisition") {
    return buildDbAcquisitionChartModel(safeData);
  }

  return buildCommerceChartModel(safeData);
}

function getChartTitle(reportType: ReportType) {
  if (reportType === "traffic") return TRAFFIC_TITLE;
  if (reportType === "db_acquisition") return DB_ACQUISITION_TITLE;
  return COMMERCE_TITLE;
}

function SummaryChart({ reportType = "commerce", data }: Props) {
  const safeData = useMemo(() => (Array.isArray(data) ? data : EMPTY_DATA), [data]);

  const { insight, chartData } = useMemo(() => {
    return buildChartModel(safeData, reportType);
  }, [safeData, reportType]);

  const title = useMemo(() => getChartTitle(reportType), [reportType]);
  const subtitle = useMemo(() => getChartSubtitle(reportType), [reportType]);

  return (
    <SummaryChartView
      title={title}
      subtitle={subtitle}
      data={chartData}
      density="report"
      insight={insight}
      reportType={reportType}
    />
  );
}

export default memo(SummaryChart);
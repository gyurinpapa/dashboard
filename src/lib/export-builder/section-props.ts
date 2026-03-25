// src/lib/export-builder/section-props.ts

import type { ExportSectionKey } from "./types";

export type ExportBuilderPresetKey = "starter" | "blank" | string;

export type ExportSectionMeta = {
  advertiserName: string;
  reportTitle: string;
  reportTypeName: string;
  periodLabel: string;
  generatedAtLabel?: string;
  preset?: ExportBuilderPresetKey;
};

export type ExportSectionBaseProps<TData> = {
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<TData>;
};

export type ExportKpiCardItem = {
  key: string;
  label: string;
  value: string;
  subValue?: string;
  changeLabel?: string;
  tone?: "neutral" | "good" | "bad" | "accent";
  footerText?: string;
};

export type ExportSummaryMetricRow = {
  label: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  conversions: number;
  cvr: number;
  cpa: number;
  revenue: number;
  roas: number;
};

export type ExportSummaryKPIData = {
  cards: ExportKpiCardItem[];

  /**
   * 다음 단계에서 Summary 확장 렌더에 사용할 보조 payload
   * - 기존 KPI 카드 렌더에는 영향 없음
   */
  monthRows?: ExportSummaryMetricRow[];
  weekRows?: ExportSummaryMetricRow[];
  sourceRows?: ExportSummaryMetricRow[];
};

export type ExportChartMetricKey =
  | "cost"
  | "revenue"
  | "roas"
  | "clicks"
  | "impressions"
  | "conversions";

export type ExportChartPoint = {
  label: string;
  cost?: number;
  revenue?: number;
  roas?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
};

export type ExportSummaryChartData = {
  title?: string;
  leftMetric?: ExportChartMetricKey;
  rightMetric?: ExportChartMetricKey;
  points: ExportChartPoint[];

  /**
   * 다음 단계에서 Summary 확장 렌더에 사용할 보조 payload
   * - 기존 차트 렌더에는 영향 없음
   */
  monthRows?: ExportSummaryMetricRow[];
  weekRows?: ExportSummaryMetricRow[];
  sourceRows?: ExportSummaryMetricRow[];
};

export type ExportGoalItem = {
  key: string;
  label: string;
  actual: number;
  goal: number;
  unit?: string;
  progress?: number; // 0~1
  actualLabel?: string;
  goalLabel?: string;
};

export type ExportSummaryGoalData = {
  goals: ExportGoalItem[];
};

export type ExportHeatmapMetricKey =
  | "revenue"
  | "roas"
  | "conversions"
  | "cost"
  | "clicks"
  | "impressions";

export type ExportHeatmapDay = {
  dayLabel: string;
  value: number;
  intensity?: number; // 0~1
};

export type ExportSummary2HeatmapData = {
  metricKey: ExportHeatmapMetricKey;
  days: ExportHeatmapDay[];
};

export type ExportFunnelStep = {
  key: string;
  label: string;
  value: number;
  displayValue?: string;
  ratioFromPrev?: number; // 0~1
};

export type ExportSummary2FunnelData = {
  steps: ExportFunnelStep[];
};

export type ExportKeywordRow = {
  rank: number;
  keyword: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cost?: number;
  revenue?: number;
  roas?: number;
};

export type ExportKeywordTop10Data = {
  rows: ExportKeywordRow[];
};

export type ExportCreativeRow = {
  rank: number;
  name: string;
  imageUrl?: string | null;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cost?: number;
  revenue?: number;
  roas?: number;
};

export type ExportCreativeTop8Data = {
  rows: ExportCreativeRow[];
};

export type ExportSectionDataMap = {
  "summary-kpi": ExportSummaryKPIData;
  "summary-chart": ExportSummaryChartData;
  "summary-goal": ExportSummaryGoalData;
  "summary2-heatmap": ExportSummary2HeatmapData;
  "summary2-funnel": ExportSummary2FunnelData;
  "keyword-top10": ExportKeywordTop10Data;
  "creative-top8": ExportCreativeTop8Data;
};

export type ExportSectionPayloadMap = Partial<{
  [K in ExportSectionKey]: Partial<ExportSectionDataMap[K]>;
}>;

export type ExportSummaryKPIProps =
  ExportSectionBaseProps<ExportSummaryKPIData>;

export type ExportSummaryChartProps =
  ExportSectionBaseProps<ExportSummaryChartData>;

export type ExportSummaryGoalProps =
  ExportSectionBaseProps<ExportSummaryGoalData>;

export type ExportSummary2HeatmapProps =
  ExportSectionBaseProps<ExportSummary2HeatmapData>;

export type ExportSummary2FunnelProps =
  ExportSectionBaseProps<ExportSummary2FunnelData>;

export type ExportKeywordTop10Props =
  ExportSectionBaseProps<ExportKeywordTop10Data>;

export type ExportCreativeTop8Props =
  ExportSectionBaseProps<ExportCreativeTop8Data>;

export type ExportBuilderSectionInput = {
  meta?: Partial<ExportSectionMeta>;
  sectionPayloads?: ExportSectionPayloadMap;
};

/**
 * 다음 단계에서 기존 Nature Report aggregate를 Export Builder용 payload로 변환할 때 사용할 입력 타입 뼈대.
 * 아직 실제 프로젝트 aggregate 구조를 강제하지 않기 위해 넓게 열어둔다.
 */
export type ExportReportAggregateInput = {
  meta?: Partial<ExportSectionMeta>;
  summary?: Record<string, any>;
  summaryChart?: Record<string, any>;
  summaryGoal?: Record<string, any>;
  heatmap?: Record<string, any>;
  funnel?: Record<string, any>;
  keywords?: Record<string, any>[];
  creatives?: Record<string, any>[];
  rows?: Record<string, any>[];
};
"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { ReportType } from "../../../../src/lib/report/types";
import {
  KRW,
  toSafeNumber,
  formatPercentFromRoas,
  formatPercentFromRate,
  formatCurrencyAxisCompact,
  formatPercentAxisFromRoas,
  formatCount,
} from "../../../../src/lib/report/format";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  Cell,
  ReferenceLine,
} from "recharts";

export type SummaryChartViewDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

export type SummaryChartViewPoint = {
  label: string;
  cost?: number;
  revenue?: number;
  roas?: number;
};

type SummaryChartInsight = {
  currentLabel: string;
  maxRevenueLabel: string;
  minCostLabel: string;
};

type Props = {
  title?: string;
  subtitle?: string;
  data: SummaryChartViewPoint[];
  density?: SummaryChartViewDensity;
  insight?: Partial<SummaryChartInsight>;
  className?: string;
  reportType?: ReportType;
  hideHeader?: boolean;
};

type DensityClasses = {
  shell: string;
  headerWrap: string;
  title: string;
  subtitle: string;
  topStripWrap: string;
  topStrip: string;
  chartWrap: string;
  chartMinHeight: number;
  legendPill: string;
  insightLabel: string;
  insightValue: string;
  xTick1: number;
  xTick2Offset: number;
  yTick: number;
  xHeight: number;
  tickMargin: number;
  rightWidth: number;
  leftWidth: number;
  lineWidth: number;
  lineWidthActive: number;
  maxBarSize: number;
};

type MetricViewMode = {
  isTraffic: boolean;
  isDbAcquisition: boolean;
  metricSummaryText: string;
  costLabel: string;
  revenueLabel: string;
  roasLabel: string;
  maxRevenueInsightLabel: string;
  minCostInsightLabel: string;
  costValueFormatter: (value: any) => string;
  revenueValueFormatter: (value: any) => string;
  roasValueFormatter: (value: any) => string;
  leftAxisFormatter: (value: any) => string;
  rightAxisFormatter: (value: any) => string;
  renderRevenueAsBar: boolean;
  useHiddenRevenueAxis: boolean;
  revenueAxisId: "left" | "right" | "revenue_hidden";
};

const TOKENS = {
  metric: {
    cost: "#CFC2B1",
    costSoft: "#F3E4D2",
    revenue: "#7FA6C4",
    revenueSoft: "#B7D7E3",
    roas: "#5F8FAA",
  },
  text: {
    strong: "#0F172A",
    base: "#334155",
    muted: "#64748B",
    faint: "#94A3B8",
  },
  surface: {
    card: "#FFFAF3",
    subtle: "#F7F3EC",
    strip: "rgba(243,228,210,0.58)",
    border: "#D9CDBC",
    grid: "#D9CDBC",
    hoverBand: "rgba(127,166,196,0.10)",
    crosshair: "#7FA6C4",
  },
};


const EMPTY_INSIGHT: SummaryChartInsight = {
  currentLabel: "-",
  maxRevenueLabel: "-",
  minCostLabel: "-",
};

const EMPTY_DATA: SummaryChartViewPoint[] = [];

const TOOLTIP_CURSOR = { fill: TOKENS.surface.hoverBand };
const HIDDEN_AXIS_DOMAIN: ["auto", "auto"] = ["auto", "auto"];

const REPORT_DENSITY: DensityClasses = {
  shell:
    "overflow-hidden rounded-[20px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] shadow-[0_4px_14px_rgba(127,166,196,0.07)]",
  headerWrap:
    "relative border-b border-[var(--nature-border)] bg-[var(--nature-surface)] px-5 py-4 sm:px-6 sm:py-5",
  title: "text-[15px] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[16px]",
  subtitle: "mt-1.5 text-xs font-medium text-slate-500 sm:text-[12px]",
  topStripWrap: "px-4 pt-4 sm:px-6 sm:pt-5",
  topStrip:
    "rounded-[16px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/12 px-3 py-2.5",
  chartWrap: "h-[430px] px-4 pb-4 pt-3 sm:h-[470px] sm:px-6 sm:pb-5 sm:pt-4",
  chartMinHeight: 340,
  legendPill:
    "inline-flex h-7 items-center gap-2 rounded-full border border-[var(--nature-border)] bg-white px-3 text-[11px] font-semibold tracking-[-0.01em] text-slate-700",
  insightLabel: "text-[10px]",
  insightValue:
    "max-w-[220px] truncate text-[12px] font-semibold tracking-[-0.01em] text-slate-800",
  xTick1: 11,
  xTick2Offset: 15,
  yTick: 11,
  xHeight: 56,
  tickMargin: 14,
  rightWidth: 68,
  leftWidth: 76,
  lineWidth: 3,
  lineWidthActive: 3.5,
  maxBarSize: 28,
};

const EXPORT_FULL_DENSITY: DensityClasses = {
  shell:
    "overflow-hidden rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,1))] shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
  headerWrap:
    "relative border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(255,255,255,0.98))] px-5 py-4 sm:px-6 sm:py-5",
  title: "text-[15px] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[16px]",
  subtitle: "mt-1.5 text-xs font-medium text-slate-500 sm:text-[12px]",
  topStripWrap: "px-4 pt-4 sm:px-6 sm:pt-5",
  topStrip:
    "rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
  chartWrap: "h-[380px] px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4",
  chartMinHeight: 300,
  legendPill:
    "inline-flex h-7 items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 text-[11px] font-semibold tracking-[-0.01em] text-slate-700 shadow-sm",
  insightLabel: "text-[10px]",
  insightValue:
    "max-w-[220px] truncate text-[12px] font-semibold tracking-[-0.01em] text-slate-800",
  xTick1: 11,
  xTick2Offset: 15,
  yTick: 11,
  xHeight: 56,
  tickMargin: 14,
  rightWidth: 68,
  leftWidth: 76,
  lineWidth: 3,
  lineWidthActive: 3.5,
  maxBarSize: 28,
};

const EXPORT_WIDE_DENSITY: DensityClasses = {
  shell:
    "overflow-hidden rounded-[20px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,1))] shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
  headerWrap:
    "relative border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(255,255,255,0.98))] px-4 py-3.5",
  title: "text-[14px] font-semibold tracking-[-0.02em] text-slate-900",
  subtitle: "mt-1.5 text-[11px] font-medium text-slate-500",
  topStripWrap: "px-4 pt-3.5",
  topStrip:
    "rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
  chartWrap: "h-[320px] px-4 pb-4 pt-3",
  chartMinHeight: 250,
  legendPill:
    "inline-flex h-7 items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 text-[10px] font-semibold tracking-[-0.01em] text-slate-700 shadow-sm",
  insightLabel: "text-[9px]",
  insightValue:
    "max-w-[180px] truncate text-[11px] font-semibold tracking-[-0.01em] text-slate-800",
  xTick1: 10,
  xTick2Offset: 14,
  yTick: 10,
  xHeight: 52,
  tickMargin: 12,
  rightWidth: 60,
  leftWidth: 68,
  lineWidth: 3,
  lineWidthActive: 3.25,
  maxBarSize: 24,
};

const EXPORT_COMPACT_DENSITY: DensityClasses = {
  shell:
    "overflow-hidden rounded-[18px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,1))] shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
  headerWrap:
    "relative border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(255,255,255,0.98))] px-3 py-2.5",
  title: "text-[13px] font-semibold tracking-[-0.02em] text-slate-900",
  subtitle: "mt-1 text-[10px] font-medium text-slate-500",
  topStripWrap: "px-3 pt-2.5",
  topStrip:
    "rounded-[16px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
  chartWrap: "h-[240px] px-3 pb-3 pt-2.5",
  chartMinHeight: 180,
  legendPill:
    "inline-flex h-6 items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2.5 text-[9px] font-semibold tracking-[-0.01em] text-slate-700 shadow-sm",
  insightLabel: "text-[8px]",
  insightValue:
    "max-w-[130px] truncate text-[10px] font-semibold tracking-[-0.01em] text-slate-800",
  xTick1: 9,
  xTick2Offset: 12,
  yTick: 9,
  xHeight: 46,
  tickMargin: 10,
  rightWidth: 50,
  leftWidth: 56,
  lineWidth: 2.75,
  lineWidthActive: 3,
  maxBarSize: 18,
};

const EXPORT_SIDE_COMPACT_DENSITY: DensityClasses = {
  shell:
    "overflow-hidden rounded-[16px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,1))] shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
  headerWrap:
    "relative border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(255,255,255,0.98))] px-2.5 py-2",
  title: "text-[12px] font-semibold tracking-[-0.02em] text-slate-900",
  subtitle: "mt-1 text-[9px] font-medium text-slate-500",
  topStripWrap: "px-2.5 pt-2",
  topStrip:
    "rounded-[14px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
  chartWrap: "h-[200px] px-2.5 pb-2.5 pt-2",
  chartMinHeight: 150,
  legendPill:
    "inline-flex h-5 items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2 text-[8px] font-semibold tracking-[-0.01em] text-slate-700 shadow-sm",
  insightLabel: "text-[8px]",
  insightValue:
    "max-w-[100px] truncate text-[9px] font-semibold tracking-[-0.01em] text-slate-800",
  xTick1: 8,
  xTick2Offset: 11,
  yTick: 8,
  xHeight: 40,
  tickMargin: 8,
  rightWidth: 44,
  leftWidth: 48,
  lineWidth: 2.5,
  lineWidthActive: 2.75,
  maxBarSize: 14,
};

function splitXAxisLabel(raw: any) {
  const label = String(raw || "").trim();
  if (!label) return ["", ""];

  const normalized = label.replace(/\s+/g, " ");
  const weekMatch = normalized.match(/(.*?)(\d+주차)$/);

  if (weekMatch) {
    return [weekMatch[1].trim(), weekMatch[2].trim()];
  }

  const tokens = normalized.split(" ");
  if (tokens.length >= 2) {
    return [tokens.slice(0, -1).join(" "), tokens[tokens.length - 1]];
  }

  return [normalized, ""];
}

function formatCountAxisCompact(value: any) {
  const n = toSafeNumber(value);

  if (n >= 100000000) return `${(n / 100000000).toFixed(n >= 1000000000 ? 0 : 1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}천`;
  return formatCount(n);
}

function getDensityClasses(density: SummaryChartViewDensity): DensityClasses {
  switch (density) {
    case "export-full":
      return EXPORT_FULL_DENSITY;
    case "export-wide":
      return EXPORT_WIDE_DENSITY;
    case "export-compact":
      return EXPORT_COMPACT_DENSITY;
    case "export-side-compact":
      return EXPORT_SIDE_COMPACT_DENSITY;
    case "report":
    default:
      return REPORT_DENSITY;
  }
}

function getMetricViewMode(reportType?: ReportType): MetricViewMode {
  const resolvedType: ReportType = reportType ?? "commerce";
  const isTraffic = resolvedType === "traffic";
  const isDbAcquisition = resolvedType === "db_acquisition";

  if (isTraffic) {
    return {
      isTraffic: true,
      isDbAcquisition: false,
      metricSummaryText: "Impr · Click · CTR",
      costLabel: "노출",
      revenueLabel: "클릭",
      roasLabel: "CTR",
      maxRevenueInsightLabel: "최대 클릭",
      minCostInsightLabel: "최고 CTR",
      costValueFormatter: (value: any) => formatCount(toSafeNumber(value)),
      revenueValueFormatter: (value: any) => formatCount(toSafeNumber(value)),
      roasValueFormatter: (value: any) => formatPercentFromRate(value, 2),
      leftAxisFormatter: (value: any) => formatCountAxisCompact(value),
      rightAxisFormatter: (value: any) => formatPercentFromRate(value, 2),
      renderRevenueAsBar: false,
      useHiddenRevenueAxis: true,
      revenueAxisId: "revenue_hidden",
    };
  }

  if (isDbAcquisition) {
    return {
      isTraffic: false,
      isDbAcquisition: true,
      metricSummaryText: "Cost · Conv · CPA",
      costLabel: "비용",
      revenueLabel: "전환",
      roasLabel: "CPA",
      maxRevenueInsightLabel: "최대 전환",
      minCostInsightLabel: "최저 CPA",
      costValueFormatter: (value: any) => KRW(toSafeNumber(value)),
      revenueValueFormatter: (value: any) => formatCount(toSafeNumber(value)),
      roasValueFormatter: (value: any) => KRW(toSafeNumber(value)),
      leftAxisFormatter: (value: any) => formatCurrencyAxisCompact(value),
      rightAxisFormatter: (value: any) => formatCurrencyAxisCompact(value),
      renderRevenueAsBar: true,
      useHiddenRevenueAxis: true,
      revenueAxisId: "revenue_hidden",
    };
  }

  return {
    isTraffic: false,
    isDbAcquisition: false,
    metricSummaryText: "Cost · Revenue · ROAS",
    costLabel: "비용",
    revenueLabel: "전환매출",
    roasLabel: "ROAS",
    maxRevenueInsightLabel: "최대 매출",
    minCostInsightLabel: "최소 비용",
    costValueFormatter: (value: any) => KRW(toSafeNumber(value)),
    revenueValueFormatter: (value: any) => KRW(toSafeNumber(value)),
    roasValueFormatter: (value: any) => formatPercentFromRoas(value, 1),
    leftAxisFormatter: (value: any) => formatCurrencyAxisCompact(value),
    rightAxisFormatter: (value: any) => formatPercentAxisFromRoas(value),
    renderRevenueAsBar: true,
    useHiddenRevenueAxis: false,
    revenueAxisId: "left",
  };
}

const CustomXAxisTick = memo(function CustomXAxisTick({
  x,
  y,
  payload,
  xTick1,
  xTick2Offset,
}: any & { xTick1: number; xTick2Offset: number }) {
  const [line1, line2] = splitXAxisLabel(payload?.value);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill={TOKENS.text.muted}
        fontSize={xTick1}
        fontWeight={500}
      >
        <tspan x={0}>{line1}</tspan>
        {line2 ? (
          <tspan x={0} dy={xTick2Offset}>
            {line2}
          </tspan>
        ) : null}
      </text>
    </g>
  );
});

const CustomTooltip = memo(function CustomTooltip({
  active,
  payload,
  label,
  reportType,
}: any & { reportType?: ReportType }) {
  if (!active || !payload?.length) return null;

  const mode = getMetricViewMode(reportType);

  const costItem = payload.find((item: any) => item?.dataKey === "cost");
  const revenueItem = payload.find((item: any) => item?.dataKey === "revenue");
  const roasItem = payload.find((item: any) => item?.dataKey === "roas");

  return (
    <div className="min-w-[220px] rounded-[16px] border border-[var(--nature-border-blue)] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(127,166,196,0.12)]">
      <div className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">
        {label}
      </div>

      <div className="mt-2 h-px bg-[var(--nature-border)]" />

      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.cost }}
            />
            <span className="font-medium">{mode.costLabel}</span>
          </div>
          <div className="font-semibold text-slate-900">
            {mode.costValueFormatter(costItem?.value)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.revenue }}
            />
            <span className="font-medium">{mode.revenueLabel}</span>
          </div>
          <div className="font-semibold text-slate-900">
            {mode.revenueValueFormatter(revenueItem?.value)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.roas }}
            />
            <span className="font-medium">{mode.roasLabel}</span>
          </div>
          <div className="font-semibold text-slate-900">
            {mode.roasValueFormatter(roasItem?.value)}
          </div>
        </div>
      </div>
    </div>
  );
});

const SlimLegendItem = memo(function SlimLegendItem({
  color,
  label,
  pillClass,
}: {
  color: string;
  label: string;
  pillClass: string;
}) {
  return (
    <div className={pillClass}>
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
});

const StatusDivider = memo(function StatusDivider() {
  return <div className="hidden h-4 w-px bg-[var(--nature-border)] sm:block" />;
});

const InlineInsight = memo(function InlineInsight({
  label,
  value,
  tone = "neutral",
  labelClassName,
  valueClassName,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "sky" | "amber";
  labelClassName: string;
  valueClassName: string;
}) {
  const dotClass =
  tone === "sky"
    ? "bg-[var(--nature-blue)]"
    : tone === "amber"
      ? "bg-[var(--nature-warm-gray)]"
      : "bg-slate-400";

const labelToneClass =
  tone === "sky"
    ? "text-sky-700"
    : tone === "amber"
      ? "text-stone-600"
      : "text-slate-500";

  return (
    <div className="inline-flex min-w-0 items-center gap-2.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span
        className={`shrink-0 font-semibold uppercase tracking-[0.08em] ${labelToneClass} ${labelClassName}`}
      >
        {label}
      </span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
});

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
};

const HoverAwareDot = memo(function HoverAwareDot({
  cx,
  cy,
  index,
  activeIndex,
  fill,
}: DotProps & { activeIndex: number | null; fill: string }) {
  if (cx == null || cy == null) return null;

  const isActive = activeIndex === index;

  return (
    <g>
      {isActive && <circle cx={cx} cy={cy} r={10} fill="rgba(127,166,196,0.10)" />}
      <circle cx={cx} cy={cy} r={isActive ? 6 : 5} fill="#FFFFFF" />
      <circle
        cx={cx}
        cy={cy}
        r={isActive ? 5 : 4}
        fill={fill}
        stroke="#FFFFFF"
        strokeWidth={2}
      />
    </g>
  );
});

function SummaryChartView({
  data,
  density = "report",
  insight,
  className,
  reportType = "commerce",
  hideHeader = false,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);

  const safeData = useMemo(() => (Array.isArray(data) ? data : EMPTY_DATA), [data]);
  const densityClasses = useMemo(() => getDensityClasses(density), [density]);
  const mode = useMemo(() => getMetricViewMode(reportType), [reportType]);

  const resolvedInsight = useMemo<SummaryChartInsight>(() => {
    return {
      currentLabel: insight?.currentLabel ?? EMPTY_INSIGHT.currentLabel,
      maxRevenueLabel: insight?.maxRevenueLabel ?? EMPTY_INSIGHT.maxRevenueLabel,
      minCostLabel: insight?.minCostLabel ?? EMPTY_INSIGHT.minCostLabel,
    };
  }, [insight]);

  const activeLabel = useMemo(() => {
    if (activeIndex == null) return null;
    return String(safeData[activeIndex]?.label || "");
  }, [activeIndex, safeData]);

  const rootClassName = useMemo(() => {
    return [densityClasses.shell, className ?? ""].filter(Boolean).join(" ");
  }, [densityClasses.shell, className]);

  const handleMouseMove = useCallback((state: any) => {
    const nextIndex =
      typeof state?.activeTooltipIndex === "number"
        ? state.activeTooltipIndex
        : null;

    if (activeIndexRef.current === nextIndex) return;

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (activeIndexRef.current === null) return;
    activeIndexRef.current = null;
    setActiveIndex(null);
  }, []);

  const renderXAxisTick = useCallback(
    (props: any) => (
      <CustomXAxisTick
        {...props}
        xTick1={densityClasses.xTick1}
        xTick2Offset={densityClasses.xTick2Offset}
      />
    ),
    [densityClasses.xTick1, densityClasses.xTick2Offset]
  );

  const renderTooltip = useCallback(
    (props: any) => <CustomTooltip {...props} reportType={reportType} />,
    [reportType]
  );

  const renderRevenueDot = useCallback(
    (props: any) => (
      <HoverAwareDot
        {...props}
        activeIndex={activeIndex}
        fill={TOKENS.metric.revenue}
      />
    ),
    [activeIndex]
  );

  const renderRoasDot = useCallback(
    (props: any) => (
      <HoverAwareDot
        {...props}
        activeIndex={activeIndex}
        fill={TOKENS.metric.roas}
      />
    ),
    [activeIndex]
  );

  const revenueActiveDot = useMemo(
    () => ({
      r: 7,
      stroke: "#FFFFFF",
      strokeWidth: 3,
      fill: TOKENS.metric.revenue,
    }),
    []
  );

  const roasActiveDot = useMemo(
    () => ({
      r: 7,
      stroke: "#FFFFFF",
      strokeWidth: 3,
      fill: TOKENS.metric.roas,
    }),
    []
  );

  const lineStrokeWidth =
    activeIndex !== null
      ? densityClasses.lineWidthActive
      : densityClasses.lineWidth;

  const costCells = useMemo(() => {
    const hasActive = activeIndex !== null;

    return safeData.map((_: SummaryChartViewPoint, index: number) => {
      const isActiveCell = activeIndex === index;

      return (
        <Cell
          key={`cost-cell-${index}`}
          fill={
            isActiveCell
              ? TOKENS.metric.cost
              : hasActive
                ? TOKENS.metric.costSoft
                : TOKENS.metric.cost
          }
          fillOpacity={isActiveCell ? 1 : hasActive ? 0.58 : 0.95}
        />
      );
    });
  }, [safeData, activeIndex]);

  const revenueCells = useMemo(() => {
    if (!mode.renderRevenueAsBar) return null;

    const hasActive = activeIndex !== null;

    return safeData.map((_: SummaryChartViewPoint, index: number) => {
      const isActiveCell = activeIndex === index;

      return (
        <Cell
          key={`revenue-cell-${index}`}
          fill={
            isActiveCell
              ? TOKENS.metric.revenue
              : hasActive
                ? TOKENS.metric.revenueSoft
                : TOKENS.metric.revenue
          }
          fillOpacity={isActiveCell ? 1 : hasActive ? 0.58 : 0.95}
        />
      );
    });
  }, [safeData, activeIndex, mode.renderRevenueAsBar]);

  return (
    <div className={rootClassName}>
      {!hideHeader ? (
        <div className={densityClasses.headerWrap}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
        </div>
      ) : null}

      <div
        className={[
          densityClasses.topStripWrap,
          hideHeader ? "!pt-3 sm:!pt-3" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={densityClasses.topStrip}>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <SlimLegendItem
                color={TOKENS.metric.roas}
                label={mode.roasLabel}
                pillClass={densityClasses.legendPill}
              />
              <SlimLegendItem
                color={TOKENS.metric.cost}
                label={mode.costLabel}
                pillClass={densityClasses.legendPill}
              />
              <SlimLegendItem
                color={TOKENS.metric.revenue}
                label={mode.revenueLabel}
                pillClass={densityClasses.legendPill}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <InlineInsight
                label="현재"
                value={resolvedInsight.currentLabel}
                labelClassName={densityClasses.insightLabel}
                valueClassName={densityClasses.insightValue}
              />
              <StatusDivider />
              <InlineInsight
                label={mode.maxRevenueInsightLabel}
                value={resolvedInsight.maxRevenueLabel}
                tone="sky"
                labelClassName={densityClasses.insightLabel}
                valueClassName={densityClasses.insightValue}
              />
              <StatusDivider />
              <InlineInsight
                label={mode.minCostInsightLabel}
                value={resolvedInsight.minCostLabel}
                tone="amber"
                labelClassName={densityClasses.insightLabel}
                valueClassName={densityClasses.insightValue}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={densityClasses.chartWrap}>
        <div className="h-full rounded-[16px] border border-[var(--nature-border)] bg-white px-2 py-2 sm:px-3 sm:py-3">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={densityClasses.chartMinHeight}
            debounce={80}
          >
            <ComposedChart
              data={safeData}
              margin={{ top: 10, right: 12, left: 2, bottom: 18 }}
              barCategoryGap="24%"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <CartesianGrid
                vertical={false}
                stroke={TOKENS.surface.grid}
                strokeDasharray="2 5"
                strokeOpacity={0.62}
              />

              {activeLabel ? (
                <ReferenceLine
                  x={activeLabel}
                  stroke={TOKENS.surface.crosshair}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              ) : null}

              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                interval={0}
                height={densityClasses.xHeight}
                tickMargin={densityClasses.tickMargin}
                minTickGap={12}
                tick={renderXAxisTick}
              />

              <YAxis
                yAxisId="left"
                width={densityClasses.leftWidth}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                minTickGap={14}
                tick={{ fontSize: densityClasses.yTick, fill: TOKENS.text.muted }}
                tickFormatter={mode.leftAxisFormatter}
              />

              {mode.useHiddenRevenueAxis ? (
                <YAxis yAxisId="revenue_hidden" hide domain={HIDDEN_AXIS_DOMAIN} />
              ) : null}

              <YAxis
                yAxisId="right"
                orientation="right"
                width={densityClasses.rightWidth}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                minTickGap={14}
                tick={{ fontSize: densityClasses.yTick, fill: TOKENS.text.muted }}
                tickFormatter={mode.rightAxisFormatter}
              />

              <Tooltip
                cursor={TOOLTIP_CURSOR}
                content={renderTooltip}
                animationDuration={0}
              />

              <Bar
                yAxisId="left"
                dataKey="cost"
                name={mode.costLabel}
                fill={TOKENS.metric.cost}
                radius={[6, 6, 0, 0]}
                maxBarSize={densityClasses.maxBarSize}
                isAnimationActive={false}
              >
                {costCells}
              </Bar>

              {mode.renderRevenueAsBar ? (
                <Bar
                  yAxisId={mode.revenueAxisId}
                  dataKey="revenue"
                  name={mode.revenueLabel}
                  fill={TOKENS.metric.revenue}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={densityClasses.maxBarSize}
                  isAnimationActive={false}
                >
                  {revenueCells}
                </Bar>
              ) : (
                <Line
                  yAxisId={mode.revenueAxisId}
                  type="monotone"
                  dataKey="revenue"
                  name={mode.revenueLabel}
                  stroke={TOKENS.metric.revenue}
                  strokeWidth={lineStrokeWidth}
                  strokeOpacity={1}
                  connectNulls
                  dot={renderRevenueDot}
                  activeDot={revenueActiveDot}
                  isAnimationActive={false}
                />
              )}

              <Line
                yAxisId="right"
                type="natural"
                dataKey="roas"
                name={mode.roasLabel}
                stroke={TOKENS.metric.roas}
                strokeWidth={lineStrokeWidth}
                strokeOpacity={1}
                connectNulls
                dot={renderRoasDot}
                activeDot={roasActiveDot}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default memo(SummaryChartView);
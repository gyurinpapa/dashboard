"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
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
  title: string;
  subtitle: string;
  data: SummaryChartViewPoint[];
  density?: SummaryChartViewDensity;
  insight?: Partial<SummaryChartInsight>;
  className?: string;
  reportType?: "commerce" | "traffic";
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

const TOKENS = {
  metric: {
    cost: "#F59E0B",
    costSoft: "#FDE7B0",
    revenue: "#0EA5E9",
    revenueSoft: "#CFEFFF",
    roas: "#EF4444",
  },
  text: {
    strong: "#0F172A",
    base: "#334155",
    muted: "#64748B",
    faint: "#94A3B8",
  },
  surface: {
    card: "#FFFFFF",
    subtle: "#F8FAFC",
    strip: "rgba(248,250,252,0.72)",
    border: "#E2E8F0",
    grid: "#E2E8F0",
    hoverBand: "rgba(148, 163, 184, 0.10)",
    crosshair: "#CBD5E1",
  },
};

const MOTION = {
  barDuration: 700,
  lineDuration: 950,
};

const EMPTY_INSIGHT: SummaryChartInsight = {
  currentLabel: "-",
  maxRevenueLabel: "-",
  minCostLabel: "-",
};

const TOOLTIP_CURSOR = { fill: TOKENS.surface.hoverBand };
const HIDDEN_AXIS_DOMAIN: ["auto", "auto"] = ["auto", "auto"];

const REPORT_DENSITY: DensityClasses = {
  shell:
    "overflow-hidden rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,1))] shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
  headerWrap:
    "relative border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.86),rgba(255,255,255,0.98))] px-5 py-4 sm:px-6 sm:py-5",
  title: "text-[15px] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[16px]",
  subtitle: "mt-1.5 text-xs font-medium text-slate-500 sm:text-[12px]",
  topStripWrap: "px-4 pt-4 sm:px-6 sm:pt-5",
  topStrip:
    "rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
  chartWrap: "h-[430px] px-4 pb-4 pt-3 sm:h-[470px] sm:px-6 sm:pb-5 sm:pt-4",
  chartMinHeight: 340,
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
}: any & { reportType?: "commerce" | "traffic" }) {
  if (!active || !payload?.length) return null;

  const isTraffic = reportType === "traffic";

  const costItem = payload.find((item: any) => item?.dataKey === "cost");
  const revenueItem = payload.find((item: any) => item?.dataKey === "revenue");
  const roasItem = payload.find((item: any) => item?.dataKey === "roas");

  return (
    <div className="min-w-[220px] rounded-[20px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
      <div className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">
        {label}
      </div>

      <div className="mt-2 h-px bg-slate-100" />

      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.cost }}
            />
            <span className="font-medium">{isTraffic ? "노출" : "비용"}</span>
          </div>
          <div className="font-semibold text-slate-900">
            {isTraffic
              ? formatCount(toSafeNumber(costItem?.value))
              : KRW(toSafeNumber(costItem?.value))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.revenue }}
            />
            <span className="font-medium">
              {isTraffic ? "클릭" : "전환매출"}
            </span>
          </div>
          <div className="font-semibold text-slate-900">
            {isTraffic
              ? formatCount(toSafeNumber(revenueItem?.value))
              : KRW(toSafeNumber(revenueItem?.value))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.roas }}
            />
            <span className="font-medium">{isTraffic ? "CTR" : "ROAS"}</span>
          </div>
          <div className="font-semibold text-slate-900">
            {isTraffic
              ? formatPercentFromRate(roasItem?.value, 2)
              : formatPercentFromRoas(roasItem?.value, 1)}
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
  return <div className="hidden h-4 w-px bg-slate-200 sm:block" />;
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
      ? "bg-sky-500"
      : tone === "amber"
      ? "bg-amber-500"
      : "bg-slate-400";

  const labelToneClass =
    tone === "sky"
      ? "text-sky-600"
      : tone === "amber"
      ? "text-amber-600"
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
      {isActive && <circle cx={cx} cy={cy} r={13} fill="rgba(148,163,184,0.10)" />}
      {isActive && <circle cx={cx} cy={cy} r={9} fill="rgba(148,163,184,0.12)" />}
      <circle cx={cx} cy={cy} r={isActive ? 6.5 : 5.5} fill="#FFFFFF" />
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
  title,
  subtitle,
  data,
  density = "report",
  insight,
  className,
  reportType,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);

  const isTraffic = reportType === "traffic";

  // 성능 최적화 포인트:
  // - 부모가 동일 참조를 유지하면 하위 chart 계산도 그대로 유지
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // 성능 최적화 포인트:
  // - density 분기 계산 1회만 수행
  const densityClasses = useMemo(() => getDensityClasses(density), [density]);

  const resolvedInsight = useMemo<SummaryChartInsight>(() => {
    return {
      currentLabel: insight?.currentLabel ?? EMPTY_INSIGHT.currentLabel,
      maxRevenueLabel: insight?.maxRevenueLabel ?? EMPTY_INSIGHT.maxRevenueLabel,
      minCostLabel: insight?.minCostLabel ?? EMPTY_INSIGHT.minCostLabel,
    };
  }, [insight]);

  // 성능 최적화 포인트:
  // - activeLabel을 별도 state로 들지 않고 activeIndex에서 파생
  const activeLabel = useMemo(() => {
    if (activeIndex == null) return null;
    return String(safeData[activeIndex]?.label || "");
  }, [activeIndex, safeData]);

  const rootClassName = useMemo(() => {
    return [densityClasses.shell, className ?? ""].join(" ");
  }, [densityClasses.shell, className]);

  const leftAxisFormatter = useCallback(
    (value: any) => {
      return isTraffic ? formatCountAxisCompact(value) : formatCurrencyAxisCompact(value);
    },
    [isTraffic]
  );

  const rightAxisFormatter = useCallback(
    (value: any) => {
      return isTraffic ? formatPercentFromRate(value, 2) : formatPercentAxisFromRoas(value);
    },
    [isTraffic]
  );

  const handleMouseMove = useCallback((state: any) => {
    const nextIndex =
      typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : null;

    // 성능 최적화 포인트:
    // - 같은 index hover에서는 state 업데이트를 생략해
    //   불필요한 chart 재렌더를 줄임
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
    activeIndex !== null ? densityClasses.lineWidthActive : densityClasses.lineWidth;

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
    if (isTraffic) return null;

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
  }, [safeData, activeIndex, isTraffic]);

  return (
    <div className={rootClassName}>
      <div className={densityClasses.headerWrap}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-sm">
              Chart View
            </div>
            <div className={densityClasses.title}>{title}</div>
            <div className={densityClasses.subtitle}>{subtitle}</div>
          </div>

          <div className="hidden shrink-0 rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-2 text-right shadow-sm sm:block">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Metric
            </div>
            <div className="mt-1 text-[12px] font-semibold text-slate-700">
              {isTraffic ? "Impr · Click · CTR" : "Cost · Revenue · ROAS"}
            </div>
          </div>
        </div>
      </div>

      <div className={densityClasses.topStripWrap}>
        <div className={densityClasses.topStrip}>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <SlimLegendItem
                color={TOKENS.metric.roas}
                label={isTraffic ? "CTR" : "ROAS"}
                pillClass={densityClasses.legendPill}
              />
              <SlimLegendItem
                color={TOKENS.metric.cost}
                label={isTraffic ? "노출" : "비용"}
                pillClass={densityClasses.legendPill}
              />
              <SlimLegendItem
                color={TOKENS.metric.revenue}
                label={isTraffic ? "클릭" : "전환매출"}
                pillClass={densityClasses.legendPill}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <InlineInsight
                label="Current"
                value={resolvedInsight.currentLabel}
                labelClassName={densityClasses.insightLabel}
                valueClassName={densityClasses.insightValue}
              />
              <StatusDivider />
              <InlineInsight
                label={isTraffic ? "Max Clicks" : "Max Revenue"}
                value={resolvedInsight.maxRevenueLabel}
                tone="sky"
                labelClassName={densityClasses.insightLabel}
                valueClassName={densityClasses.insightValue}
              />
              <StatusDivider />
              <InlineInsight
                label={isTraffic ? "Max CTR" : "Min Cost"}
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
        <div className="h-full rounded-[20px] border border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.76))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-3 sm:py-3">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={densityClasses.chartMinHeight}
            debounce={40}
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
                strokeDasharray="3 4"
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
                tickFormatter={leftAxisFormatter}
              />

              {isTraffic ? (
                <YAxis yAxisId="clicks" hide domain={HIDDEN_AXIS_DOMAIN} />
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
                tickFormatter={rightAxisFormatter}
              />

              <Tooltip
                cursor={TOOLTIP_CURSOR}
                content={renderTooltip}
                animationDuration={180}
              />

              <Bar
                yAxisId="left"
                dataKey="cost"
                name={isTraffic ? "노출" : "비용"}
                fill={TOKENS.metric.cost}
                radius={[10, 10, 0, 0]}
                maxBarSize={densityClasses.maxBarSize}
                isAnimationActive
                animationBegin={0}
                animationDuration={MOTION.barDuration}
                animationEasing="ease-out"
              >
                {costCells}
              </Bar>

              {isTraffic ? (
                <Line
                  yAxisId="clicks"
                  type="monotone"
                  dataKey="revenue"
                  name="클릭"
                  stroke={TOKENS.metric.revenue}
                  strokeWidth={lineStrokeWidth}
                  strokeOpacity={1}
                  connectNulls
                  dot={renderRevenueDot}
                  activeDot={revenueActiveDot}
                  isAnimationActive
                  animationBegin={80}
                  animationDuration={MOTION.lineDuration}
                  animationEasing="ease-out"
                />
              ) : (
                <Bar
                  yAxisId="left"
                  dataKey="revenue"
                  name="전환매출"
                  fill={TOKENS.metric.revenue}
                  radius={[10, 10, 0, 0]}
                  maxBarSize={densityClasses.maxBarSize}
                  isAnimationActive
                  animationBegin={80}
                  animationDuration={MOTION.barDuration}
                  animationEasing="ease-out"
                >
                  {revenueCells}
                </Bar>
              )}

              <Line
                yAxisId="right"
                type="natural"
                dataKey="roas"
                name={isTraffic ? "CTR" : "ROAS"}
                stroke={TOKENS.metric.roas}
                strokeWidth={lineStrokeWidth}
                strokeOpacity={1}
                connectNulls
                dot={renderRoasDot}
                activeDot={roasActiveDot}
                isAnimationActive
                animationBegin={160}
                animationDuration={MOTION.lineDuration}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default memo(SummaryChartView);
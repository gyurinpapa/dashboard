"use client";

import { useMemo, useState } from "react";
import {
  KRW,
  toSafeNumber,
  formatPercentFromRoas,
  formatCurrencyAxisCompact,
  formatPercentAxisFromRoas,
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
    strong: "#111827",
    base: "#374151",
    muted: "#6B7280",
    faint: "#9CA3AF",
  },
  surface: {
    card: "#FFFFFF",
    subtle: "#F8FAFC",
    strip: "rgba(248,250,252,0.72)",
    border: "#E5E7EB",
    grid: "#E5E7EB",
    hoverBand: "rgba(148, 163, 184, 0.08)",
    crosshair: "#CBD5E1",
  },
};

const MOTION = {
  barDuration: 700,
  lineDuration: 950,
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

function getDensityClasses(density: SummaryChartViewDensity) {
  if (density === "export-full") {
    return {
      shell: "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm",
      headerWrap: "border-b border-gray-200 px-5 py-4 sm:px-6 sm:py-5",
      title: "text-[15px] font-semibold tracking-[-0.01em] text-gray-900 sm:text-[16px]",
      subtitle: "mt-1 text-xs font-medium text-gray-500 sm:text-[12px]",
      topStripWrap: "px-4 pt-4 sm:px-6 sm:pt-5",
      topStrip: "rounded-2xl border border-gray-200/80 bg-gray-50/55 px-3 py-2.5",
      chartWrap: "h-[380px] px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4",
      chartMinHeight: 300,
      legendPill: "inline-flex h-7 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-semibold tracking-[-0.01em] text-gray-700 shadow-sm",
      insightLabel: "text-[10px]",
      insightValue: "max-w-[220px] truncate text-[12px] font-semibold tracking-[-0.01em] text-gray-800",
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
  }

  if (density === "export-wide") {
    return {
      shell: "overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-sm",
      headerWrap: "border-b border-gray-200 px-4 py-3.5",
      title: "text-[14px] font-semibold tracking-[-0.01em] text-gray-900",
      subtitle: "mt-1 text-[11px] font-medium text-gray-500",
      topStripWrap: "px-4 pt-3.5",
      topStrip: "rounded-[18px] border border-gray-200/80 bg-gray-50/55 px-3 py-2.5",
      chartWrap: "h-[320px] px-4 pb-4 pt-3",
      chartMinHeight: 250,
      legendPill: "inline-flex h-7 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[10px] font-semibold tracking-[-0.01em] text-gray-700 shadow-sm",
      insightLabel: "text-[9px]",
      insightValue: "max-w-[180px] truncate text-[11px] font-semibold tracking-[-0.01em] text-gray-800",
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
  }

  if (density === "export-compact") {
    return {
      shell: "overflow-hidden rounded-[18px] border border-gray-200 bg-white shadow-sm",
      headerWrap: "border-b border-gray-200 px-3 py-2.5",
      title: "text-[13px] font-semibold tracking-[-0.01em] text-gray-900",
      subtitle: "mt-1 text-[10px] font-medium text-gray-500",
      topStripWrap: "px-3 pt-2.5",
      topStrip: "rounded-[16px] border border-gray-200/80 bg-gray-50/55 px-2.5 py-2",
      chartWrap: "h-[240px] px-3 pb-3 pt-2.5",
      chartMinHeight: 180,
      legendPill: "inline-flex h-6 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 text-[9px] font-semibold tracking-[-0.01em] text-gray-700 shadow-sm",
      insightLabel: "text-[8px]",
      insightValue: "max-w-[130px] truncate text-[10px] font-semibold tracking-[-0.01em] text-gray-800",
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
  }

  if (density === "export-side-compact") {
    return {
      shell: "overflow-hidden rounded-[16px] border border-gray-200 bg-white shadow-sm",
      headerWrap: "border-b border-gray-200 px-2.5 py-2",
      title: "text-[12px] font-semibold tracking-[-0.01em] text-gray-900",
      subtitle: "mt-1 text-[9px] font-medium text-gray-500",
      topStripWrap: "px-2.5 pt-2",
      topStrip: "rounded-[14px] border border-gray-200/80 bg-gray-50/55 px-2 py-1.5",
      chartWrap: "h-[200px] px-2.5 pb-2.5 pt-2",
      chartMinHeight: 150,
      legendPill: "inline-flex h-5 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 text-[8px] font-semibold tracking-[-0.01em] text-gray-700 shadow-sm",
      insightLabel: "text-[8px]",
      insightValue: "max-w-[100px] truncate text-[9px] font-semibold tracking-[-0.01em] text-gray-800",
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
  }

  return {
    shell: "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm",
    headerWrap: "border-b border-gray-200 px-5 py-4 sm:px-6 sm:py-5",
    title: "text-[15px] font-semibold tracking-[-0.01em] text-gray-900 sm:text-[16px]",
    subtitle: "mt-1 text-xs font-medium text-gray-500 sm:text-[12px]",
    topStripWrap: "px-4 pt-4 sm:px-6 sm:pt-5",
    topStrip: "rounded-2xl border border-gray-200/80 bg-gray-50/55 px-3 py-2.5",
    chartWrap: "h-[430px] px-4 pb-4 pt-3 sm:h-[470px] sm:px-6 sm:pb-5 sm:pt-4",
    chartMinHeight: 340,
    legendPill: "inline-flex h-7 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-semibold tracking-[-0.01em] text-gray-700 shadow-sm",
    insightLabel: "text-[10px]",
    insightValue: "max-w-[220px] truncate text-[12px] font-semibold tracking-[-0.01em] text-gray-800",
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
}

function CustomXAxisTick(props: any & { density: SummaryChartViewDensity }) {
  const { x, y, payload, density } = props;
  const [line1, line2] = splitXAxisLabel(payload?.value);
  const densityClasses = getDensityClasses(density);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill={TOKENS.text.muted}
        fontSize={densityClasses.xTick1}
        fontWeight={500}
      >
        <tspan x={0}>{line1}</tspan>
        {line2 ? (
          <tspan x={0} dy={densityClasses.xTick2Offset}>
            {line2}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

function CustomTooltip(props: any) {
  const { active, payload, label } = props;

  if (!active || !payload?.length) return null;

  const costItem = payload.find((item: any) => item?.dataKey === "cost");
  const revenueItem = payload.find((item: any) => item?.dataKey === "revenue");
  const roasItem = payload.find((item: any) => item?.dataKey === "roas");

  return (
    <div className="min-w-[210px] rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
      <div className="text-[12px] font-semibold tracking-[-0.01em] text-gray-900">
        {label}
      </div>

      <div className="mt-2 h-px bg-gray-100" />

      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-gray-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.cost }}
            />
            <span className="font-medium">비용</span>
          </div>
          <div className="font-semibold text-gray-900">
            {KRW(toSafeNumber(costItem?.value))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-gray-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.revenue }}
            />
            <span className="font-medium">전환매출</span>
          </div>
          <div className="font-semibold text-gray-900">
            {KRW(toSafeNumber(revenueItem?.value))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-2 text-gray-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TOKENS.metric.roas }}
            />
            <span className="font-medium">ROAS</span>
          </div>
          <div className="font-semibold text-gray-900">
            {formatPercentFromRoas(roasItem?.value, 1)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlimLegendItem({
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
}

function StatusDivider() {
  return <div className="hidden h-4 w-px bg-gray-200 sm:block" />;
}

function InlineInsight({
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
      : "bg-gray-400";

  const labelToneClass =
    tone === "sky"
      ? "text-sky-600"
      : tone === "amber"
      ? "text-amber-600"
      : "text-gray-500";

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
}

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
};

function HoverAwareDot({
  cx,
  cy,
  index,
  activeIndex,
}: DotProps & { activeIndex: number | null }) {
  if (cx == null || cy == null) return null;

  const isActive = activeIndex === index;

  return (
    <g>
      {isActive && <circle cx={cx} cy={cy} r={13} fill="rgba(239,68,68,0.10)" />}
      {isActive && <circle cx={cx} cy={cy} r={9} fill="rgba(239,68,68,0.12)" />}
      <circle cx={cx} cy={cy} r={isActive ? 6.5 : 5.5} fill="#FFFFFF" />
      <circle
        cx={cx}
        cy={cy}
        r={isActive ? 5 : 4}
        fill={TOKENS.metric.roas}
        stroke="#FFFFFF"
        strokeWidth={2}
      />
    </g>
  );
}

export default function SummaryChartView({
  title,
  subtitle,
  data,
  density = "report",
  insight,
  className,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const densityClasses = getDensityClasses(density);

  const resolvedInsight = useMemo(() => {
    return {
      currentLabel: insight?.currentLabel ?? "-",
      maxRevenueLabel: insight?.maxRevenueLabel ?? "-",
      minCostLabel: insight?.minCostLabel ?? "-",
    };
  }, [insight]);

  return (
    <div className={[densityClasses.shell, className ?? ""].join(" ")}>
      <div className={densityClasses.headerWrap}>
        <div className={densityClasses.title}>{title}</div>
        <div className={densityClasses.subtitle}>{subtitle}</div>
      </div>

      <div className={densityClasses.topStripWrap}>
        <div className={densityClasses.topStrip}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <SlimLegendItem
                color={TOKENS.metric.roas}
                label="ROAS"
                pillClass={densityClasses.legendPill}
              />
              <SlimLegendItem
                color={TOKENS.metric.cost}
                label="비용"
                pillClass={densityClasses.legendPill}
              />
              <SlimLegendItem
                color={TOKENS.metric.revenue}
                label="전환매출"
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
                label="Max Revenue"
                value={resolvedInsight.maxRevenueLabel}
                tone="sky"
                labelClassName={densityClasses.insightLabel}
                valueClassName={densityClasses.insightValue}
              />
              <StatusDivider />
              <InlineInsight
                label="Min Cost"
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
        <ResponsiveContainer
          width="100%"
          height="100%"
          minHeight={densityClasses.chartMinHeight}
          debounce={40}
        >
          <ComposedChart
            data={safeData}
            margin={{ top: 8, right: 10, left: 0, bottom: 18 }}
            barCategoryGap="24%"
            onMouseMove={(state: any) => {
              if (typeof state?.activeTooltipIndex === "number") {
                setActiveIndex(state.activeTooltipIndex);
                const row = safeData[state.activeTooltipIndex];
                setActiveLabel(String(row?.label || null));
              } else {
                setActiveIndex(null);
                setActiveLabel(null);
              }
            }}
            onMouseLeave={() => {
              setActiveIndex(null);
              setActiveLabel(null);
            }}
          >
            <CartesianGrid
              vertical={false}
              stroke={TOKENS.surface.grid}
              strokeDasharray="3 4"
            />

            {activeLabel && (
              <ReferenceLine
                x={activeLabel}
                stroke={TOKENS.surface.crosshair}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              height={densityClasses.xHeight}
              tickMargin={densityClasses.tickMargin}
              minTickGap={12}
              tick={(props) => <CustomXAxisTick {...props} density={density} />}
            />

            <YAxis
              yAxisId="left"
              width={densityClasses.leftWidth}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={14}
              tick={{ fontSize: densityClasses.yTick, fill: TOKENS.text.muted }}
              tickFormatter={(v: any) => formatCurrencyAxisCompact(v)}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              width={densityClasses.rightWidth}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={14}
              tick={{ fontSize: densityClasses.yTick, fill: TOKENS.text.muted }}
              tickFormatter={(v: any) => formatPercentAxisFromRoas(v)}
            />

            <Tooltip
              cursor={{ fill: TOKENS.surface.hoverBand }}
              content={(props) => <CustomTooltip {...props} />}
              animationDuration={180}
            />

            <Bar
              yAxisId="left"
              dataKey="cost"
              name="비용"
              fill={TOKENS.metric.cost}
              radius={[10, 10, 0, 0]}
              maxBarSize={densityClasses.maxBarSize}
              isAnimationActive
              animationBegin={0}
              animationDuration={MOTION.barDuration}
              animationEasing="ease-out"
            >
              {safeData.map((_: any, index: number) => {
                const isActive = activeIndex === index;
                const hasActive = activeIndex !== null;

                return (
                  <Cell
                    key={`cost-cell-${index}`}
                    fill={
                      isActive
                        ? TOKENS.metric.cost
                        : hasActive
                        ? TOKENS.metric.costSoft
                        : TOKENS.metric.cost
                    }
                    fillOpacity={isActive ? 1 : hasActive ? 0.58 : 0.95}
                  />
                );
              })}
            </Bar>

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
              {safeData.map((_: any, index: number) => {
                const isActive = activeIndex === index;
                const hasActive = activeIndex !== null;

                return (
                  <Cell
                    key={`revenue-cell-${index}`}
                    fill={
                      isActive
                        ? TOKENS.metric.revenue
                        : hasActive
                        ? TOKENS.metric.revenueSoft
                        : TOKENS.metric.revenue
                    }
                    fillOpacity={isActive ? 1 : hasActive ? 0.58 : 0.95}
                  />
                );
              })}
            </Bar>

            <Line
              yAxisId="right"
              type="natural"
              dataKey="roas"
              name="ROAS"
              stroke={TOKENS.metric.roas}
              strokeWidth={
                activeIndex !== null
                  ? densityClasses.lineWidthActive
                  : densityClasses.lineWidth
              }
              strokeOpacity={1}
              connectNulls
              dot={(props: any) => (
                <HoverAwareDot {...props} activeIndex={activeIndex} />
              )}
              activeDot={{
                r: 7,
                stroke: "#FFFFFF",
                strokeWidth: 3,
                fill: TOKENS.metric.roas,
              }}
              isAnimationActive
              animationBegin={160}
              animationDuration={MOTION.lineDuration}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
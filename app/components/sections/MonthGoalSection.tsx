// app/components/sections/MonthGoalSection.tsx
"use client";

import { memo, useMemo } from "react";
import type { ReportType } from "@/src/lib/report/types";
import { KRW, toSafeNumber } from "@/src/lib/report/format";
import SummaryGoal from "./summary/SummaryGoal";

type GoalMetricKey = "clicks" | "conversions" | "revenue";

type GoalProgressModel = {
  metricKey: GoalMetricKey;
  metricLabel: string;
  targetLabel: string;
  actualLabel: string;
  achievementLabel: string;
  gapLabel: string;
  forecastLabel: string;
  forecastMemo: string;
  insight: string;
  target: number;
  actual: number;
  achievementRate: number | null;
  gap: number;
  forecast: number | null;
  hasGoal: boolean;
};

type Props = {
  reportType?: ReportType;
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: string;
  lastDataDate?: string;
  goalProgressCurrentMonthKey?: string;
  goalProgressCurrentMonthActual?: any;
  goalProgressCurrentMonthGoalComputed?: any;
  goalProgressByDay?: readonly any[];
};

const EMPTY_LIST: readonly any[] = Object.freeze([]);

function toGoalNumber(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value)
    .replace(/[₩,%\s]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toRate01(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value > 1 ? value / 100 : value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const hasPercent = raw.includes("%");
  const n = toGoalNumber(raw);

  if (!Number.isFinite(n) || n <= 0) return 0;

  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
}

function toRoasMultiplier(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value > 10 ? value / 100 : value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const hasPercent = raw.includes("%");
  const n = toGoalNumber(raw);

  if (!Number.isFinite(n) || n <= 0) return 0;
  if (hasPercent) return n / 100;

  return n > 10 ? n / 100 : n;
}

function roundGoal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function buildComputedDbMonthGoal(monthGoal: any) {
  const safeGoal =
    monthGoal && typeof monthGoal === "object" && !Array.isArray(monthGoal)
      ? monthGoal
      : {};

  const targetConversions = toGoalNumber(safeGoal.conversions);
  const targetCvrRate = toRate01(safeGoal.cvr);
  const targetCost = toGoalNumber(safeGoal.cost);

  const computedClicks =
    targetConversions > 0 && targetCvrRate > 0
      ? roundGoal(targetConversions / targetCvrRate)
      : toGoalNumber(safeGoal.clicks);

  const computedCpc =
    targetCost > 0 && computedClicks > 0
      ? roundGoal(targetCost / computedClicks)
      : toGoalNumber(safeGoal.cpc);

  const computedCpa =
    targetCost > 0 && targetConversions > 0
      ? roundGoal(targetCost / targetConversions)
      : toGoalNumber(safeGoal.cpa);

  return {
    ...safeGoal,
    clicks: computedClicks || safeGoal.clicks || "",
    cpc: computedCpc || safeGoal.cpc || "",
    cpa: computedCpa || safeGoal.cpa || "",
    computed_clicks: computedClicks || "",
    computed_cpc: computedCpc || "",
    computed_cpa: computedCpa || "",
  };
}

function buildComputedDbGoalComputed(currentMonthGoalComputed: any, monthGoal: any) {
  const safeComputed =
    currentMonthGoalComputed &&
    typeof currentMonthGoalComputed === "object" &&
    !Array.isArray(currentMonthGoalComputed)
      ? currentMonthGoalComputed
      : {};

  const computedGoal = buildComputedDbMonthGoal(monthGoal);

  return {
    ...safeComputed,
    clicks: computedGoal.clicks,
    cpc: computedGoal.cpc,
    cpa: computedGoal.cpa,
    computed_clicks: computedGoal.computed_clicks,
    computed_cpc: computedGoal.computed_cpc,
    computed_cpa: computedGoal.computed_cpa,
  };
}

function getGoalMetricConfig(reportType?: ReportType): {
  metricKey: GoalMetricKey;
  metricLabel: string;
  actualLabel: string;
  targetLabel: string;
  unit: "count" | "currency";
} {
  if (reportType === "traffic") {
    return {
      metricKey: "clicks",
      metricLabel: "클릭",
      actualLabel: "현재 클릭",
      targetLabel: "클릭 목표",
      unit: "count",
    };
  }

  if (reportType === "db_acquisition") {
    return {
      metricKey: "conversions",
      metricLabel: "전환",
      actualLabel: "현재 전환",
      targetLabel: "전환 목표",
      unit: "count",
    };
  }

  return {
    metricKey: "revenue",
    metricLabel: "매출",
    actualLabel: "현재 매출",
    targetLabel: "매출 목표",
    unit: "currency",
  };
}

function formatGoalNumber(value: number, unit: "count" | "currency") {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  if (unit === "currency") return KRW(n);
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function formatAchievementRate(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

function pickDateString(row: any) {
  const raw =
    row?.date ??
    row?.dateKey ??
    row?.day ??
    row?.ymd ??
    row?.report_date ??
    row?.reportDate ??
    row?.segment_date ??
    row?.stat_date ??
    "";

  const s = String(raw ?? "").trim();
  return s ? s.slice(0, 10) : "";
}

function daysInMonthFromDateString(dateString: string) {
  const s = String(dateString ?? "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;

  const year = Number(m[1]);
  const month = Number(m[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month)) return 0;

  return new Date(year, month, 0).getDate();
}

function dayOfMonthFromDateString(dateString: string) {
  const s = String(dateString ?? "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;

  const day = Number(m[3]);
  return Number.isFinite(day) ? day : 0;
}

function buildTrendForecastFromDays({
  rows,
  metricKey,
  actual,
  currentMonthKey,
}: {
  rows: readonly any[];
  metricKey: GoalMetricKey;
  actual: number;
  currentMonthKey?: string;
}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let latestDate = "";
  let observedValue = 0;

  for (const row of rows) {
    const dateString = pickDateString(row);
    if (!dateString) continue;

    const monthKey = dateString.slice(0, 7);
    const targetMonthKey = String(currentMonthKey ?? "").trim();

    if (targetMonthKey && monthKey !== targetMonthKey) continue;

    if (!latestDate || dateString > latestDate) {
      latestDate = dateString;
    }

    observedValue += toSafeNumber(row?.[metricKey]);
  }

  if (!latestDate) return null;

  const elapsedDay = dayOfMonthFromDateString(latestDate);
  const totalDays = daysInMonthFromDateString(latestDate);

  if (elapsedDay <= 0 || totalDays <= 0) return null;

  const baseActual = observedValue > 0 ? observedValue : actual;
  if (baseActual <= 0) return 0;

  return Math.round((baseActual / elapsedDay) * totalDays);
}

function buildGoalProgressModel(input: {
  reportType?: ReportType;
  monthGoal?: any;
  currentMonthActual?: any;
  currentMonthGoalComputed?: any;
  byDay?: readonly any[];
  currentMonthKey?: string;
  monthGoalInsight?: string;
}): GoalProgressModel {
  const config = getGoalMetricConfig(input.reportType);
  const metricKey = config.metricKey;

  const rawTarget =
    input.monthGoal?.[metricKey] ??
    input.currentMonthGoalComputed?.[metricKey] ??
    0;

  const target = toGoalNumber(rawTarget);
  const actual = toSafeNumber(input.currentMonthActual?.[metricKey]);
  const hasGoal = target > 0;
  const achievementRate = hasGoal ? (actual / target) * 100 : null;
  const gap = hasGoal ? Math.max(0, target - actual) : 0;

  const forecastFromComputed = toGoalNumber(
    input.currentMonthGoalComputed?.forecast?.[metricKey] ??
      input.currentMonthGoalComputed?.projected?.[metricKey] ??
      input.currentMonthGoalComputed?.expected?.[metricKey]
  );

  const forecast =
    forecastFromComputed > 0
      ? forecastFromComputed
      : buildTrendForecastFromDays({
          rows: input.byDay ?? EMPTY_LIST,
          metricKey,
          actual,
          currentMonthKey: input.currentMonthKey,
        });

  const forecastMemo =
    forecast == null
      ? "일자별 데이터가 부족해 현재 추세 예상치를 계산하지 않았습니다."
      : hasGoal
        ? forecast >= target
          ? "현재 일평균 흐름 기준으로는 목표 도달 가능성이 있습니다."
          : "현재 일평균 흐름 기준으로는 목표에 미달할 가능성이 있습니다."
        : "목표값을 입력하면 예상 달성치와 목표 차이를 함께 판단할 수 있습니다.";

  const insight =
    input.monthGoalInsight ||
    (hasGoal
      ? `${config.metricLabel} 목표 ${formatGoalNumber(
          target,
          config.unit
        )} 대비 현재 ${formatGoalNumber(
          actual,
          config.unit
        )}까지 달성했습니다.`
      : `${config.targetLabel}가 아직 입력되지 않았습니다. 편집 화면에서 목표값을 저장하면 달성률과 부족분을 계산합니다.`);

  return {
    metricKey,
    metricLabel: config.metricLabel,
    targetLabel: config.targetLabel,
    actualLabel: config.actualLabel,
    achievementLabel: formatAchievementRate(achievementRate),
    gapLabel: hasGoal ? formatGoalNumber(gap, config.unit) : "-",
    forecastLabel:
      forecast == null ? "-" : formatGoalNumber(forecast, config.unit),
    forecastMemo,
    insight,
    target,
    actual,
    achievementRate,
    gap,
    forecast,
    hasGoal,
  };
}

const GoalGaugeRing = memo(function GoalGaugeRing({
  rate,
  label,
  tone = "blue",
}: {
  rate: number | null;
  label: string;
  tone?: "blue" | "amber" | "emerald";
}) {
  const safeRate =
    rate == null || !Number.isFinite(rate)
      ? 0
      : Math.max(0, Math.min(100, rate));

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeRate / 100);

  const toneClass =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : "text-[#5C9BC2]";

  return (
    <div className="relative h-[158px] w-[158px] shrink-0 self-center transition-transform duration-200 ease-out group-hover:scale-[1.08]">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90 overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-slate-100"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={toneClass}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[25px] font-bold leading-[0.94] tracking-[-0.045em] text-slate-900">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
});

const GoalGaugeCard = memo(function GoalGaugeCard({
  eyebrow,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  rate,
  rateLabel,
  footer,
  tone = "blue",
}: {
  eyebrow: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  rate: number | null;
  rateLabel: string;
  footer?: string;
  tone?: "blue" | "amber" | "emerald";
}) {
  return (
    <div className="group flex h-full min-w-0 items-stretch justify-between gap-3 rounded-[18px] border border-slate-200/85 bg-white px-4 py-3 shadow-[0_3px_10px_rgba(127,166,196,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--nature-border-blue)]/60 hover:shadow-[0_6px_18px_rgba(127,166,196,0.12)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[30px] items-start pt-1.5 text-[10px] font-bold uppercase tracking-[0.10em] text-slate-500">
          {eyebrow}
        </div>

        <div className="mt-3 space-y-2">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.06em] text-slate-400">
              {primaryLabel}
            </div>
            <div className="mt-0.5 text-[18px] font-bold tracking-[-0.03em] text-slate-900">
              {primaryValue}
            </div>
          </div>

          {secondaryLabel && secondaryValue ? (
            <div>
              <div className="text-[10px] font-semibold tracking-[0.06em] text-slate-400">
                {secondaryLabel}
              </div>
              <div className="mt-0.5 text-[15px] font-semibold tracking-[-0.02em] text-slate-700">
                {secondaryValue}
              </div>
            </div>
          ) : null}
        </div>

        {footer ? (
          <div className="mt-2 text-[10px] font-medium leading-4 text-slate-500">
            {footer}
          </div>
        ) : null}
      </div>

      <GoalGaugeRing
        rate={rate}
        label={rateLabel}
        tone={tone}
      />
    </div>
  );
});

const GoalProgressPanel = memo(function GoalProgressPanel({
  model,
  reportType,
  monthGoal,
  currentMonthActual,
}: {
  model: GoalProgressModel;
  reportType?: ReportType;
  monthGoal?: any;
  currentMonthActual?: any;
}) {
  const isCommerce = reportType === "commerce";

  const targetRoas = isCommerce
    ? toRoasMultiplier(monthGoal?.roas)
    : 0;

  const currentRoas = isCommerce
    ? toSafeNumber(currentMonthActual?.roas)
    : 0;

  const primaryRate = isCommerce
    ? targetRoas > 0
      ? (currentRoas / targetRoas) * 100
      : null
    : model.hasGoal && model.forecast != null
      ? (model.forecast / model.target) * 100
      : null;

  const primaryRateLabel =
    primaryRate == null
      ? "-"
      : formatAchievementRate(primaryRate);

  const achievementTone =
    model.achievementRate == null
      ? "blue"
      : model.achievementRate >= 90
        ? "emerald"
        : model.achievementRate >= 70
          ? "blue"
          : "amber";

  const primaryTone = "blue";

  const targetValue = isCommerce
    ? targetRoas > 0
      ? `${(targetRoas * 100).toFixed(1)}%`
      : "-"
    : model.hasGoal
      ? formatGoalNumber(
          model.target,
          model.metricKey === "revenue" ? "currency" : "count"
        )
      : "-";

  const projectedValue = isCommerce
    ? currentRoas > 0
      ? `${(currentRoas * 100).toFixed(1)}%`
      : "-"
    : model.forecastLabel;

  const firstPrimaryLabel = isCommerce
    ? "목표 ROAS"
    : model.targetLabel;

  const firstSecondaryLabel = isCommerce
    ? "현재 ROAS"
    : reportType === "db_acquisition"
      ? "현재 추세 예상 전환"
      : reportType === "traffic"
        ? "현재 추세 예상 클릭"
        : "현재 추세 예상 달성치";

  return (
    <div className="h-full bg-transparent p-0">
      <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2">
        <GoalGaugeCard
          eyebrow="FORECAST"
          primaryLabel={firstPrimaryLabel}
          primaryValue={targetValue}
          secondaryLabel={firstSecondaryLabel}
          secondaryValue={projectedValue}
          rate={primaryRate}
          rateLabel={primaryRateLabel}
          tone={primaryTone}
        />

        <GoalGaugeCard
          eyebrow="ACHIEVEMENT"
          primaryLabel="목표 대비 부족분"
          primaryValue={model.gapLabel}
          secondaryLabel=""
          secondaryValue=""
          rate={model.achievementRate}
          rateLabel={model.achievementLabel}
          tone={achievementTone}
        />
      </div>
    </div>
  );
});

export default function MonthGoalSection({
  reportType = "commerce",
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
  lastDataDate,
  goalProgressCurrentMonthKey,
  goalProgressCurrentMonthActual,
  goalProgressCurrentMonthGoalComputed,
  goalProgressByDay,
}: Props) {
  const resolvedMonthGoal = useMemo(() => {
    if (reportType !== "db_acquisition") return monthGoal;
    return buildComputedDbMonthGoal(monthGoal);
  }, [monthGoal, reportType]);

  const resolvedCurrentMonthGoalComputed = useMemo(() => {
    if (reportType !== "db_acquisition") return currentMonthGoalComputed;
    return buildComputedDbGoalComputed(currentMonthGoalComputed, monthGoal);
  }, [currentMonthGoalComputed, monthGoal, reportType]);

  const goalProgressModel = useMemo(
    () =>
      buildGoalProgressModel({
        reportType,
        monthGoal,
        currentMonthActual: goalProgressCurrentMonthActual,
        currentMonthGoalComputed: goalProgressCurrentMonthGoalComputed,
        byDay: goalProgressByDay ?? EMPTY_LIST,
        currentMonthKey: goalProgressCurrentMonthKey,
        monthGoalInsight,
      }),
    [
      reportType,
      monthGoal,
      goalProgressCurrentMonthActual,
      goalProgressCurrentMonthGoalComputed,
      goalProgressByDay,
      goalProgressCurrentMonthKey,
      monthGoalInsight,
    ]
  );

  return (
    <section className="mb-5 mt-2">
      <div className="overflow-hidden rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] shadow-[0_5px_16px_rgba(127,166,196,0.08)]">
        <div className="px-5 py-4 sm:px-6">
          <SummaryGoal
            reportType={reportType}
            currentMonthKey={currentMonthKey}
            currentMonthActual={currentMonthActual}
            currentMonthGoalComputed={resolvedCurrentMonthGoalComputed}
            monthGoal={resolvedMonthGoal}
            setMonthGoal={setMonthGoal}
            monthGoalInsight={monthGoalInsight}
            lastDataDate={lastDataDate}
            goalProgressContent={
              <GoalProgressPanel
                model={goalProgressModel}
                reportType={reportType}
                monthGoal={monthGoal}
                currentMonthActual={goalProgressCurrentMonthActual}
              />
            }
          />
        </div>
      </div>
    </section>
  );
}
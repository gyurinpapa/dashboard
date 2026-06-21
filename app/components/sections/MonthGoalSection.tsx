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

const GoalProgressCard = memo(function GoalProgressCard({
  title,
  value,
  description,
  tone = "slate",
}: {
  title: string;
  value: string;
  description: string;
  tone?: "slate" | "blue" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/70 text-amber-800"
        : tone === "blue"
          ? "border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/35 text-slate-800"
          : "border-slate-200 bg-white/78 text-slate-800";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <div className="text-[11px] font-semibold tracking-[0.12em] opacity-70">
        {title}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">
        {value}
      </div>
      <p className="mt-2 text-xs font-medium leading-5 opacity-80">
        {description}
      </p>
    </div>
  );
});

const GoalProgressPanel = memo(function GoalProgressPanel({
  model,
}: {
  model: GoalProgressModel;
}) {
  const achievementTone =
    model.achievementRate == null
      ? "slate"
      : model.achievementRate >= 100
        ? "emerald"
        : model.achievementRate >= 70
          ? "blue"
          : "amber";

  return (
    <div className="mt-3 bg-transparent p-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <GoalProgressCard
          title={model.targetLabel}
          value={
            model.hasGoal
              ? formatGoalNumber(
                  model.target,
                  model.metricKey === "revenue" ? "currency" : "count"
                )
              : "-"
          }
          description="편집 화면에서 저장한 월 목표값입니다."
          tone="slate"
        />

        <GoalProgressCard
          title="목표 대비 달성률"
          value={model.achievementLabel}
          description={`${model.actualLabel} 기준으로 계산한 목표 달성률입니다.`}
          tone={achievementTone}
        />

        <GoalProgressCard
          title="목표 대비 부족분"
          value={model.gapLabel}
          description={
            model.hasGoal
              ? "남은 기간 동안 추가로 확보해야 하는 목표 차이입니다."
              : "목표값이 없으면 부족분을 계산하지 않습니다."
          }
          tone={model.gap > 0 ? "amber" : "emerald"}
        />

        <GoalProgressCard
          title="현재 추세 예상 달성치"
          value={model.forecastLabel}
          description={model.forecastMemo}
          tone={
            model.forecast != null &&
            model.hasGoal &&
            model.forecast >= model.target
              ? "emerald"
              : "blue"
          }
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
    <section className="mb-8 mt-2">
      <div className="overflow-hidden rounded-[28px] border border-[var(--nature-border-blue)] bg-gradient-to-br from-[var(--nature-surface)] via-[var(--nature-surface)] to-[var(--nature-cream)]/70 shadow-[0_14px_36px_rgba(127,166,196,0.16)]">
        <div className="px-5 py-5 sm:px-6">
          <SummaryGoal
            reportType={reportType}
            currentMonthKey={currentMonthKey}
            currentMonthActual={currentMonthActual}
            currentMonthGoalComputed={resolvedCurrentMonthGoalComputed}
            monthGoal={resolvedMonthGoal}
            setMonthGoal={setMonthGoal}
            monthGoalInsight={monthGoalInsight}
            lastDataDate={lastDataDate}
            goalProgressContent={<GoalProgressPanel model={goalProgressModel} />}
          />
        </div>
      </div>
    </section>
  );
}
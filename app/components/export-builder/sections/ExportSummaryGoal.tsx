"use client";

import SummaryGoalMetricCardView, {
  type SummaryGoalMetricCardDensity,
} from "@/app/components/sections/summary/SummaryGoalMetricCardView";
import type {
  ExportSectionMeta,
  ExportSummaryGoalData,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type GoalMetric = {
  label: string;
  target: string;
  actual: string;
  rate: number; // 0 ~ 100
};

type LayoutMode = "full" | "wide" | "compact" | "side-compact";

type Props = {
  title?: string;
  subtitle?: string;
  metrics?: GoalMetric[];
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportSummaryGoalData>;
  layoutMode?: LayoutMode;
};

const DEFAULT_METRICS: GoalMetric[] = [
  {
    label: "매출",
    target: "₩45,000,000",
    actual: "₩38,920,000",
    rate: 86,
  },
  {
    label: "전환",
    target: "1,500",
    actual: "1,284",
    rate: 86,
  },
  {
    label: "ROAS",
    target: "330%",
    actual: "312%",
    rate: 95,
  },
];

function clampRate(rate: number) {
  if (!Number.isFinite(rate)) return 0;
  return Math.max(0, Math.min(100, rate));
}

function normalizeProgressToPercent(
  progress?: number,
  actual?: number,
  goal?: number
) {
  const safeProgress = Number(progress);
  if (Number.isFinite(safeProgress)) {
    return safeProgress <= 1 ? safeProgress * 100 : safeProgress;
  }

  const safeActual = Number(actual);
  const safeGoal = Number(goal);

  if (
    Number.isFinite(safeActual) &&
    Number.isFinite(safeGoal) &&
    safeGoal > 0
  ) {
    return (safeActual / safeGoal) * 100;
  }

  return 0;
}

function formatFallbackValue(value?: number, unit?: string) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return "-";

  if (unit === "KRW") {
    return `₩${safe.toLocaleString("ko-KR")}`;
  }

  if (unit === "ratio") {
    const percent = safe <= 10 ? safe * 100 : safe;
    return `${Math.round(percent)}%`;
  }

  return safe.toLocaleString("ko-KR");
}

function normalizeLegacyMetrics(
  metrics: GoalMetric[]
): ExportSummaryGoalData["goals"] {
  return metrics.map((metric, index) => ({
    key: `legacy-goal-${index}-${metric.label}`,
    label: metric.label,
    actual: 0,
    goal: 0,
    actualLabel: metric.actual,
    goalLabel: metric.target,
    progress: metric.rate / 100,
  }));
}

function toCardDensity(layoutMode: LayoutMode): SummaryGoalMetricCardDensity {
  if (layoutMode === "full") return "export-full";
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  return "export-side-compact";
}

function getVisibleGoalCount(layoutMode: LayoutMode) {
  if (layoutMode === "full") return 4;
  if (layoutMode === "wide") return 4;
  if (layoutMode === "compact") return 3;
  return 2;
}

function getGridClass(layoutMode: LayoutMode) {
  if (layoutMode === "full") {
    return "grid gap-3 md:grid-cols-2";
  }
  if (layoutMode === "wide") {
    return "grid gap-3 md:grid-cols-2";
  }
  if (layoutMode === "compact") {
    return "grid gap-2";
  }
  return "grid gap-1.5";
}

export default function ExportSummaryGoal({
  title,
  subtitle,
  metrics,
  meta,
  data,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-goal", {
    ...(metrics ? { goals: normalizeLegacyMetrics(metrics) } : {}),
    ...(data ?? {}),
  });

  const fallbackGoals = normalizeLegacyMetrics(DEFAULT_METRICS);
  const baseGoals =
    Array.isArray(resolvedData.goals) && resolvedData.goals.length > 0
      ? resolvedData.goals
      : fallbackGoals;

  const visibleCount = getVisibleGoalCount(layoutMode);
  const safeGoals = baseGoals.slice(0, visibleCount);

  const metaText = [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
    .filter(Boolean)
    .join(" · ");

  const displayTitle = title || "목표 입력 & 달성 현황";
  const displaySubtitle =
    subtitle ||
    (metaText
      ? `월 목표 대비 현재 실적 및 달성률 · ${metaText}`
      : "월 목표 대비 현재 실적 및 달성률");

  const cardDensity = toCardDensity(layoutMode);

  const isSideCompact = layoutMode === "side-compact";
  const isCompact = layoutMode === "compact";
  const isWide = layoutMode === "wide";
  const isFull = layoutMode === "full";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className={[
          "border-b border-slate-200",
          isFull
            ? "px-5 py-4"
            : isWide
            ? "px-4 py-3.5"
            : isCompact
            ? "px-3 py-3"
            : "px-2.5 py-2.5",
        ].join(" ")}
      >
        <h3
          className={[
            "font-semibold tracking-tight text-slate-900",
            isFull
              ? "text-lg"
              : isWide
              ? "text-[16px]"
              : isCompact
              ? "text-[14px]"
              : "text-[12px]",
          ].join(" ")}
        >
          {displayTitle}
        </h3>

        <p
          className={[
            "mt-1 text-slate-500",
            isSideCompact ? "text-[9px]" : "text-sm",
          ].join(" ")}
        >
          {displaySubtitle}
        </p>
      </div>

      <div
        className={[
          isFull
            ? "px-5 py-4"
            : isWide
            ? "px-4 py-4"
            : isCompact
            ? "px-3 py-3"
            : "px-2.5 py-2.5",
        ].join(" ")}
      >
        <div className={getGridClass(layoutMode)}>
          {safeGoals.map((goal, index) => {
            const rate = clampRate(
              normalizeProgressToPercent(goal.progress, goal.actual, goal.goal)
            );

            const displayGoal =
              goal.goalLabel || formatFallbackValue(goal.goal, goal.unit);
            const displayActual =
              goal.actualLabel || formatFallbackValue(goal.actual, goal.unit);

            return (
              <SummaryGoalMetricCardView
                key={goal.key || `${goal.label}-${index}`}
                label={goal.label}
                goalLabel={displayGoal}
                actualLabel={displayActual}
                rate={rate}
                density={cardDensity}
              />
            );
          })}
        </div>

        {!isSideCompact ? (
          <p className="mt-3 text-xs text-slate-500">
            * 목표/달성 현황은 슬라이드용 요약 뷰입니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
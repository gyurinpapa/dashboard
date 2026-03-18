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
  /**
   * Step 17 이전 호환용
   */
  title?: string;
  subtitle?: string;
  metrics?: GoalMetric[];

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportSummaryGoalData>;

  /**
   * 향후 layout 대응을 위한 안전 확장
   * 기존 호출부가 없어도 기본값으로 안전 동작
   */
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

function normalizeProgressToPercent(progress?: number, actual?: number, goal?: number) {
  const safeProgress = Number(progress);
  if (Number.isFinite(safeProgress)) {
    return safeProgress <= 1 ? safeProgress * 100 : safeProgress;
  }

  const safeActual = Number(actual);
  const safeGoal = Number(goal);

  if (Number.isFinite(safeActual) && Number.isFinite(safeGoal) && safeGoal > 0) {
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

export default function ExportSummaryGoal({
  title = "목표 / 달성현황",
  subtitle = "월 목표 대비 현재 실적 요약",
  metrics,
  meta,
  data,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary-goal", {
    ...(metrics ? { goals: normalizeLegacyMetrics(metrics) } : {}),
    ...(data ?? {}),
    ...(!metrics && !data ? { goals: normalizeLegacyMetrics(DEFAULT_METRICS) } : {}),
  });

  const safeGoals = (resolvedData.goals ?? []).slice(0, 4);

  const displayTitle = title || "목표 / 달성현황";
  const displaySubtitle =
    subtitle ||
    [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
      .filter(Boolean)
      .join(" · ") ||
    "월 목표 대비 현재 실적 요약";

  const cardDensity = toCardDensity(layoutMode);

  const sectionClass = [
    "flex h-full min-h-[240px] flex-col rounded-[24px] border border-slate-200 bg-white shadow-sm",
    layoutMode === "full"
      ? "p-5"
      : layoutMode === "wide"
      ? "p-4"
      : layoutMode === "compact"
      ? "p-3"
      : "p-2.5",
  ].join(" ");

  const headerWrapClass = [
    "flex items-start justify-between gap-3",
    layoutMode === "side-compact" ? "mb-2" : "mb-4",
  ].join(" ");

  const eyebrowClass = [
    "font-semibold uppercase tracking-[0.16em] text-slate-400",
    layoutMode === "side-compact" ? "text-[9px]" : "text-[11px]",
  ].join(" ");

  const titleClass = [
    "mt-1 font-semibold tracking-tight text-slate-900",
    layoutMode === "full"
      ? "text-base"
      : layoutMode === "wide"
      ? "text-[15px]"
      : layoutMode === "compact"
      ? "text-[14px]"
      : "text-[12px]",
  ].join(" ");

  const subtitleClass = [
    "mt-1 text-slate-500",
    layoutMode === "side-compact" ? "text-[9px]" : "text-xs",
  ].join(" ");

  const badgeClass = [
    "rounded-full border border-slate-200 bg-slate-50 font-medium text-slate-500",
    layoutMode === "side-compact"
      ? "px-2 py-0.5 text-[9px]"
      : "px-3 py-1 text-[11px]",
  ].join(" ");

  const gridClass = [
    "grid flex-1",
    layoutMode === "side-compact" ? "gap-2" : "gap-3",
  ].join(" ");

  return (
    <section className={sectionClass}>
      <div className={headerWrapClass}>
        <div>
          <div className={eyebrowClass}>Summary</div>
          <h3 className={titleClass}>{displayTitle}</h3>
          <p className={subtitleClass}>{displaySubtitle}</p>
        </div>

        <div className={badgeClass}>Goal</div>
      </div>

      <div className={gridClass}>
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
    </section>
  );
}
"use client";

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

export default function ExportSummaryGoal({
  title = "목표 / 달성현황",
  subtitle = "월 목표 대비 현재 실적 요약",
  metrics,
  meta,
  data,
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

  return (
    <section className="flex h-full min-h-[240px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Summary
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {displayTitle}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{displaySubtitle}</p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
          Goal
        </div>
      </div>

      <div className="grid flex-1 gap-3">
        {safeGoals.map((goal, index) => {
          const rate = clampRate(
            normalizeProgressToPercent(goal.progress, goal.actual, goal.goal)
          );

          const displayGoal =
            goal.goalLabel || formatFallbackValue(goal.goal, goal.unit);
          const displayActual =
            goal.actualLabel || formatFallbackValue(goal.actual, goal.unit);

          return (
            <div
              key={goal.key || `${goal.label}-${index}`}
              className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  {goal.label}
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {Math.round(rate)}%
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <div className="text-[11px] text-slate-500">목표</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {displayGoal}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <div className="text-[11px] text-slate-500">실적</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {displayActual}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>달성률</span>
                  <span>{Math.round(rate)}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-500 transition-none"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
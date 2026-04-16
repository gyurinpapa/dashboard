// app/components/decision/GoalCommandCenter.tsx
"use client";

import { memo, useMemo } from "react";
import type { GoalMetric, GoalSnapshot } from "@/src/lib/decision/types";

type Props = {
  snapshot: GoalSnapshot;
};

function metricLabel(metric: GoalMetric): string {
  switch (metric) {
    case "impressions":
      return "노출";
    case "clicks":
      return "클릭";
    case "conversions":
      return "전환";
    case "revenue":
      return "매출";
    case "spend":
      return "비용";
    case "ctr":
      return "CTR";
    case "cvr":
      return "CVR";
    case "cpc":
      return "CPC";
    case "cpa":
      return "CPA";
    case "roas":
      return "ROAS";
    default:
      return metric;
  }
}

function objectiveLabel(objective: GoalSnapshot["objective"]): string {
  switch (objective) {
    case "traffic_growth":
      return "트래픽 성장";
    case "lead_acquisition":
      return "DB/리드 획득";
    case "commerce_revenue":
      return "커머스 매출";
    default:
      return "목표 운영";
  }
}

function statusLabel(status: GoalSnapshot["pacingStatus"]): string {
  switch (status) {
    case "ahead":
      return "목표 초과 페이스";
    case "on_track":
      return "목표 달성 페이스";
    case "behind":
    default:
      return "목표 미달 위험";
  }
}

function statusTone(status: GoalSnapshot["pacingStatus"]): string {
  switch (status) {
    case "ahead":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "on_track":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "behind":
    default:
      return "bg-rose-50 text-rose-700 ring-rose-200";
  }
}

function formatMetricValue(metric: GoalMetric, value: number): string {
  const safe = Number.isFinite(value) ? value : 0;

  switch (metric) {
    case "ctr":
    case "cvr":
    case "roas":
      return `${(safe * 100).toFixed(1)}%`;

    case "spend":
    case "revenue":
    case "cpc":
    case "cpa":
      return `${Math.round(safe).toLocaleString()}`;

    case "impressions":
    case "clicks":
    case "conversions":
    default:
      return `${Math.round(safe).toLocaleString()}`;
  }
}

function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

function isLowerBetterMetric(metric: GoalMetric): boolean {
  return metric === "cpa" || metric === "cpc";
}

function progressWidth(rate: number): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  const clamped = Math.max(0, Math.min(1, safe));
  return `${clamped * 100}%`;
}

function summaryText(snapshot: GoalSnapshot): {
  gapTitle: string;
  gapValueText: string;
  forecastTitle: string;
  forecastValueText: string;
} {
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);
  const metric = snapshot.primaryMetric;

  if (lowerBetter) {
    return {
      gapTitle: "목표 초과분",
      gapValueText: formatMetricValue(metric, snapshot.gapValue),
      forecastTitle: "월말 예상치",
      forecastValueText: formatMetricValue(metric, snapshot.forecastValue),
    };
  }

  return {
    gapTitle: "부족분",
    gapValueText: formatMetricValue(metric, snapshot.gapValue),
    forecastTitle: "월말 예상 달성치",
    forecastValueText: formatMetricValue(metric, snapshot.forecastValue),
  };
}

const StatCard = memo(function StatCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      {subValue ? (
        <div className="mt-1 text-xs text-slate-500">{subValue}</div>
      ) : null}
    </div>
  );
});

function GoalCommandCenterComponent({ snapshot }: Props) {
  const primaryMetricName = useMemo(
    () => metricLabel(snapshot.primaryMetric),
    [snapshot.primaryMetric],
  );

  const {
    gapTitle,
    gapValueText,
    forecastTitle,
    forecastValueText,
  } = useMemo(() => summaryText(snapshot), [snapshot]);

  const actualText = useMemo(
    () => formatMetricValue(snapshot.primaryMetric, snapshot.actualValue),
    [snapshot.actualValue, snapshot.primaryMetric],
  );

  const goalText = useMemo(
    () => formatMetricValue(snapshot.primaryMetric, snapshot.goalValue),
    [snapshot.goalValue, snapshot.primaryMetric],
  );

  const attainmentText = useMemo(
    () => formatPercent(snapshot.attainmentRate),
    [snapshot.attainmentRate],
  );

  const forecastAttainmentText = useMemo(
    () => formatPercent(snapshot.forecastAttainmentRate),
    [snapshot.forecastAttainmentRate],
  );

  const paceText = useMemo(() => {
    if (!Number.isFinite(snapshot.paceRatio) || snapshot.paceRatio <= 0) return "0.00x";
    return `${snapshot.paceRatio.toFixed(2)}x`;
  }, [snapshot.paceRatio]);

  const timeProgressText = useMemo(
    () => formatPercent(snapshot.timeProgressRate),
    [snapshot.timeProgressRate],
  );

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
                DECISION ENGINE
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {objectiveLabel(snapshot.objective)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusTone(
                  snapshot.pacingStatus,
                )}`}
              >
                {statusLabel(snapshot.pacingStatus)}
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              이번 달 {primaryMetricName} 목표 달성 현황
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {snapshot.message}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <StatCard
              label="목표 KPI"
              value={primaryMetricName}
              subValue="현재 운영 목적 기준"
            />
            <StatCard
              label="시간 진도율"
              value={timeProgressText}
              subValue={`${snapshot.elapsedDays}일 경과 / ${snapshot.totalDays}일 기준`}
            />
            <StatCard
              label="현재 달성률"
              value={attainmentText}
              subValue="현재 누적 기준"
            />
            <StatCard
              label="페이스 배수"
              value={paceText}
              subValue="시간 진도 대비 속도"
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                현재 달성률
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {attainmentText}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                월말 예상 달성률
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {forecastAttainmentText}
              </div>
            </div>
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-[width]"
              style={{ width: progressWidth(snapshot.forecastAttainmentRate) }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="현재 실적"
          value={actualText}
          subValue={`${primaryMetricName} 누적 기준`}
        />
        <StatCard
          label="월 목표"
          value={goalText}
          subValue={`${primaryMetricName} 목표값`}
        />
        <StatCard
          label={forecastTitle}
          value={forecastValueText}
          subValue="현재 페이스 유지 가정"
        />
        <StatCard
          label={gapTitle}
          value={gapValueText}
          subValue={`남은 기간 ${snapshot.remainingDays}일 기준`}
        />
      </div>
    </section>
  );
}

export default memo(GoalCommandCenterComponent);
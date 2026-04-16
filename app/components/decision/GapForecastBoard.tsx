// app/components/decision/GapForecastBoard.tsx
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

function isRateMetric(metric: GoalMetric) {
  return (
    metric === "ctr" ||
    metric === "cvr" ||
    metric === "roas" ||
    metric === "cpc" ||
    metric === "cpa"
  );
}

function isLowerBetterMetric(metric: GoalMetric) {
  return metric === "cpa" || metric === "cpc";
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

function formatPercent(rate: number) {
  const safe = Number.isFinite(rate) ? rate : 0;
  return `${(safe * 100).toFixed(1)}%`;
}

const InfoRow = memo(function InfoRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
});

function GapForecastBoardComponent({ snapshot }: Props) {
  const metricName = useMemo(() => metricLabel(snapshot.primaryMetric), [snapshot.primaryMetric]);

  const lowerBetter = useMemo(
    () => isLowerBetterMetric(snapshot.primaryMetric),
    [snapshot.primaryMetric],
  );

  const rateMetric = useMemo(
    () => isRateMetric(snapshot.primaryMetric),
    [snapshot.primaryMetric],
  );

  const gapTitle = lowerBetter ? "목표 초과분" : "예상 부족분";

  const paceNarrative = useMemo(() => {
    if (snapshot.pacingStatus === "ahead") {
      return "현재 시간 진도 대비 실적 페이스가 앞서 있습니다. 지금 추세를 유지하면 목표 초과 달성 가능성이 높습니다.";
    }
    if (snapshot.pacingStatus === "on_track") {
      return "현재 시간 진도와 실적 페이스가 거의 맞물려 있습니다. 큰 흔들림 없이 운영하면 목표선 방어가 가능한 상태입니다.";
    }
    return "현재 시간 진도 대비 실적 페이스가 뒤처지고 있습니다. 남은 기간 내 부족분을 메우기 위한 액션 우선순위가 필요합니다.";
  }, [snapshot.pacingStatus]);

  const kpiBridgeText = useMemo(() => {
    if (snapshot.primaryMetric === "conversions") {
      return "전환 부족분은 결국 클릭 볼륨 확대 또는 CVR 개선으로 해석할 수 있습니다.";
    }
    if (snapshot.primaryMetric === "revenue") {
      return "매출 부족분은 전환 수 확대, ROAS 개선, 또는 고매출 구간 집중으로 분해해 볼 수 있습니다.";
    }
    if (snapshot.primaryMetric === "clicks") {
      return "클릭 부족분은 노출 확대 또는 CTR 개선 액션으로 직접 연결할 수 있습니다.";
    }
    if (snapshot.primaryMetric === "impressions") {
      return "노출 부족분은 예산·게재량·도달 구간 확장으로 연결됩니다.";
    }
    if (snapshot.primaryMetric === "cpa") {
      return "CPA 초과분은 CVR 개선 또는 비효율 지면/시간/소재 차단으로 해석해야 합니다.";
    }
    if (snapshot.primaryMetric === "roas") {
      return "ROAS 부족은 고효율 구간 집중과 저효율 비용 축소의 조합으로 접근해야 합니다.";
    }
    return "현재 KPI 부족분은 다음 단계에서 가설 엔진을 통해 실행 액션 단위로 분해됩니다.";
  }, [snapshot.primaryMetric]);

  const simpleForecastLogic = useMemo(() => {
    if (rateMetric) {
      return "비율형 KPI는 현재 상태값을 월말 예상치의 기준값으로 유지해 해석합니다.";
    }
    return "절대값 KPI는 현재 누적 실적을 경과일로 나누고 총일수로 확장한 pace 기반 forecast를 사용합니다.";
  }, [rateMetric]);

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              GAP & FORECAST BOARD
            </div>

            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              목표와 현재 상태 사이의 부족분 해석
            </h3>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {paceNarrative}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              기준 KPI <span className="font-semibold text-slate-900">{metricName}</span>
            </div>
            <div className="mt-1">
              남은 기간 <span className="font-semibold text-slate-900">{snapshot.remainingDays}일</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoRow
            label="현재 달성률"
            value={formatPercent(snapshot.attainmentRate)}
            sub="현재 누적 기준"
          />
          <InfoRow
            label="월말 예상 달성률"
            value={formatPercent(snapshot.forecastAttainmentRate)}
            sub="현재 pace 유지 가정"
          />
          <InfoRow
            label={gapTitle}
            value={formatMetricValue(snapshot.primaryMetric, snapshot.gapValue)}
            sub={`${metricName} 기준`}
          />
          <InfoRow
            label="페이스 상태"
            value={
              snapshot.pacingStatus === "ahead"
                ? "Ahead"
                : snapshot.pacingStatus === "on_track"
                ? "On Track"
                : "Behind"
            }
            sub={`시간 진도율 ${formatPercent(snapshot.timeProgressRate)} 기준`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">현재 문제 정의</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            현재 운영 목표 KPI는 <span className="font-semibold text-slate-900">{metricName}</span>이며,
            현재 pace 기준 월말 예상치는{" "}
            <span className="font-semibold text-slate-900">
              {formatMetricValue(snapshot.primaryMetric, snapshot.forecastValue)}
            </span>
            입니다.{" "}
            {lowerBetter
              ? "목표 대비 초과 구간을 줄이는 액션이 우선입니다."
              : "목표 대비 부족분을 채우는 액션이 우선입니다."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">운영 해석</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{kpiBridgeText}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">현재 계산 방식</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{simpleForecastLogic}</p>
        </div>
      </div>
    </section>
  );
}

export default memo(GapForecastBoardComponent);
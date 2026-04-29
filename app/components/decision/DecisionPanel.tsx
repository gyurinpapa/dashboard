// app/components/decision/DecisionPanel.tsx
"use client";

import { memo, useCallback, useMemo, type ReactNode } from "react";
import GoalCommandCenter from "./GoalCommandCenter";
import GapForecastBoard from "./GapForecastBoard";
import { buildDecisionEngineInput } from "@/src/lib/decision/input";
import { buildGoalSnapshot } from "@/src/lib/decision/goal";
import { buildHypotheses } from "@/src/lib/decision/hypothesis";
import { buildSimulationResults } from "@/src/lib/decision/simulator";
import {
  buildPriorityQueue,
  type PriorityItem,
} from "@/src/lib/decision/priority";
import type { ReportType } from "@/src/lib/report/types";

type Props = {
  reportType?: ReportType;
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed?: any;
  monthGoal?: any;
  lastDataDate?: string;
  rows?: any[];
  byCampaign?: any[];
  byAdGroup?: any[];
  byKeyword?: any[];
  byCreative?: any[];
  byDevice?: any[];
  byChannel?: any[];
  byRegion?: any[];
  byWeekday?: any[];
  byHour?: any[];
  byDate?: any[];
  byWeek?: any[];
  byMonth?: any[];
  reportPeriod?: {
    startDate?: string | null;
    endDate?: string | null;
  };
  onSelectHypothesisTab?: (hypothesisIndex: number) => void;
};

const DecisionHero = memo(function DecisionHero() {
  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 text-white md:px-7">
        <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-white/80">
          DECISION ENGINE
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
          목표현황과 핵심 가설 1~5를 먼저 고르는 운영 출발점
        </h1>

        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">
          이 화면은 실행과 리뷰를 직접 처리하지 않습니다. 현재 목표 상태를
          먼저 해석하고, 목표 달성을 위해 우선 검토할 가설 1~5만 요약합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-200 bg-slate-50/70 md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-5">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-indigo-600">
            STEP 01
          </div>
          <div className="mt-2 text-base font-semibold text-slate-900">
            목표현황
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            현재 목표 대비 달성 흐름과 gap을 먼저 확인합니다.
          </p>
        </div>

        <div className="p-5">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-indigo-600">
            STEP 02
          </div>
          <div className="mt-2 text-base font-semibold text-slate-900">
            가설 1~5 선택
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            어떤 가설부터 계획·실행·리뷰할지 선택합니다.
          </p>
        </div>
      </div>
    </section>
  );
});

const DecisionSection = memo(function DecisionSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-slate-50/70 p-4 shadow-sm md:p-5">
      <div className="mb-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-indigo-700">
          {eyebrow}
        </div>

        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>

      <div className="space-y-5">{children}</div>
    </section>
  );
});

function getHypothesisSummary(item: PriorityItem) {
  return String(
    (item as any)?.summary ||
      (item as any)?.description ||
      (item as any)?.reason ||
      "이 가설은 현재 목표 달성 가능성을 높이기 위해 우선 검토할 후보입니다.",
  );
}

function getHypothesisMetricLabel(item: PriorityItem) {
  return String(
    (item as any)?.targetMetric ||
      (item as any)?.metricType ||
      (item as any)?.primaryMetric ||
      "목표 KPI",
  );
}

function percentLabel(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}`;
}

const HypothesisRouteCard = memo(function HypothesisRouteCard({
  index,
  item,
  onSelect,
}: {
  index: number;
  item: PriorityItem;
  onSelect?: (hypothesisIndex: number) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect?.(index);
  }, [index, onSelect]);

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-indigo-700">
              가설 {index}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              PRIORITY #{item.rank}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              {getHypothesisMetricLabel(item)}
            </span>
          </div>

          <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            {item.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {getHypothesisSummary(item)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleClick}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          가설 {index} 탭으로 이동
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Impact
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {percentLabel((item as any)?.impact)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Confidence
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {percentLabel((item as any)?.confidence)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Ease
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {percentLabel((item as any)?.ease)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Score
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {(item.score * 100).toFixed(1)}
          </div>
        </div>
      </div>
    </article>
  );
});

const HypothesisRouteList = memo(function HypothesisRouteList({
  items,
  onSelect,
}: {
  items: PriorityItem[];
  onSelect?: (hypothesisIndex: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm leading-6 text-slate-600">
        현재 표시할 가설이 없습니다. 목표/데이터가 들어오면 가설 1~5가 이
        영역에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((item, index) => (
        <HypothesisRouteCard
          key={item.hypothesisId}
          index={index + 1}
          item={item}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});

function DecisionPanelComponent(props: Props) {
  const decisionInput = useMemo(
    () =>
      buildDecisionEngineInput({
        reportType: props.reportType,
        currentMonthKey: props.currentMonthKey,
        currentMonthActual: props.currentMonthActual,
        currentMonthGoalComputed: props.currentMonthGoalComputed,
        monthGoal: props.monthGoal,
        lastDataDate: props.lastDataDate,
        rows: props.rows,
        byCampaign: props.byCampaign,
        byAdGroup: props.byAdGroup,
        byKeyword: props.byKeyword,
        byCreative: props.byCreative,
        byDevice: props.byDevice,
        byChannel: props.byChannel,
        byRegion: props.byRegion,
        byWeekday: props.byWeekday,
        byHour: props.byHour,
        byDate: props.byDate,
        byWeek: props.byWeek,
        byMonth: props.byMonth,
        reportPeriod: props.reportPeriod,
      }),
    [
      props.reportType,
      props.currentMonthKey,
      props.currentMonthActual,
      props.currentMonthGoalComputed,
      props.monthGoal,
      props.lastDataDate,
      props.rows,
      props.byCampaign,
      props.byAdGroup,
      props.byKeyword,
      props.byCreative,
      props.byDevice,
      props.byChannel,
      props.byRegion,
      props.byWeekday,
      props.byHour,
      props.byDate,
      props.byWeek,
      props.byMonth,
      props.reportPeriod,
    ],
  );

  const goalSnapshot = useMemo(
    () => buildGoalSnapshot(decisionInput),
    [decisionInput],
  );

  const hypotheses = useMemo(
    () => buildHypotheses(decisionInput, goalSnapshot),
    [decisionInput, goalSnapshot],
  );

  const simulationResults = useMemo(
    () => buildSimulationResults(decisionInput, goalSnapshot, hypotheses),
    [decisionInput, goalSnapshot, hypotheses],
  );

  const priorityItems = useMemo(
    () => buildPriorityQueue(hypotheses, simulationResults, []),
    [hypotheses, simulationResults],
  );

  const topFiveHypotheses = useMemo(
    () => priorityItems.slice(0, 5),
    [priorityItems],
  );

  return (
    <div className="space-y-7">
      <DecisionHero />

      <DecisionSection
        eyebrow="GOAL STATUS"
        title="목표현황"
        description="현재 목표 달성 상태를 먼저 확인합니다. 이 Decision 화면에서는 실행/리뷰를 직접 처리하지 않고, 목표 해석과 가설 선택까지만 담당합니다."
      >
        <GoalCommandCenter snapshot={goalSnapshot} />
        <GapForecastBoard snapshot={goalSnapshot} />
      </DecisionSection>

      <DecisionSection
        eyebrow="HYPOTHESIS 1-5"
        title="가설 1~5"
        description="현재 목표를 달성하기 위해 우선 검토할 Top 5 가설입니다. 각 카드는 가설별 탭의 계획 → 실행 → 리뷰 → 다음 액션 제안 흐름과 연결됩니다."
      >
        <HypothesisRouteList
          items={topFiveHypotheses}
          onSelect={props.onSelectHypothesisTab}
        />
      </DecisionSection>
    </div>
  );
}

export default memo(DecisionPanelComponent);
"use client";

import { memo, useCallback, useMemo, useState } from "react";
import GoalCommandCenter from "./GoalCommandCenter";
import GapForecastBoard from "./GapForecastBoard";
import HypothesisCards from "./HypothesisCards";
import PriorityQueue, {
  type PriorityQueueLearningSummary,
} from "./PriorityQueue";
import ExecutionLog, { type ExecutionEvaluation } from "./ExecutionLog";
import { buildDecisionEngineInput } from "@/src/lib/decision/input";
import { buildGoalSnapshot } from "@/src/lib/decision/goal";
import { buildHypotheses } from "@/src/lib/decision/hypothesis";
import { buildSimulationResults } from "@/src/lib/decision/simulator";
import {
  buildPriorityQueue,
  type PriorityItem,
  type PriorityLearningHistoryItem,
} from "@/src/lib/decision/priority";
import {
  appendPriorityLearningHistory,
  createExecutionItemFromPriority,
  hasLearningHistoryForExecution,
  shouldAppendLearningHistoryOnStatusChange,
  shouldCaptureBaselineOnStatusChange,
  updateExecutionItemStatus,
  type ExecutionItem,
  type ExecutionStatus,
} from "@/src/lib/decision/execution";
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
};

type ExecutionSummaryStripItem = {
  key: "improved" | "worsened" | "neutral";
  title: string;
  count: number;
  description: string;
  tone: string;
};

type LearningHistorySummary = PriorityQueueLearningSummary;

const InfoCard = memo(function InfoCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
});

const SummaryStripCard = memo(function SummaryStripCard({
  title,
  count,
  description,
  tone,
}: {
  title: string;
  count: number;
  description: string;
  tone: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Execution Summary
          </div>
          <div className="mt-2 text-base font-semibold text-slate-900">
            {title}
          </div>
        </div>

        <div
          className={[
            "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
            tone,
          ].join(" ")}
        >
          {count}개
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
});

const ExecutionSummaryStrip = memo(function ExecutionSummaryStrip({
  items,
}: {
  items: ExecutionSummaryStripItem[];
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              EXECUTION RESULT STRIP
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              이번 달 실행 결과 요약
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              실행 완료(done)된 항목 중 baseline 대비 현재 KPI 변화 방향을
              기준으로 효과 있었던 실행, 악화된 실행, 판단 보류 실행을 빠르게
              요약합니다. 기존 리포트 집계값은 건드리지 않고 execution overlay
              평가만 사용합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {items.map((item) => (
          <SummaryStripCard
            key={item.key}
            title={item.title}
            count={item.count}
            description={item.description}
            tone={item.tone}
          />
        ))}
      </div>
    </section>
  );
});

const LearningHistoryStatCard = memo(function LearningHistoryStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div
        className={["mt-2 text-base font-semibold", tone ?? "text-slate-900"].join(
          " ",
        )}
      >
        {value}
      </div>
    </div>
  );
});

const LearningHistoryPanel = memo(function LearningHistoryPanel({
  summary,
}: {
  summary: LearningHistorySummary;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              LEARNING HISTORY
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              누적 학습 데이터 현황
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              실행 완료 후 평가된 결과가 learning history에 누적된 현황입니다.
              이 값은 다음 Priority Queue 계산의 미세 보정 근거로 사용됩니다.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              총 반영 execution 수{" "}
              <span className="font-semibold text-slate-900">
                {summary.totalCount}개
              </span>
            </div>
            <div className="mt-1">
              이번 추천 반영 learning{" "}
              <span className="font-semibold text-slate-900">
                {summary.totalCount}개
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LearningHistoryStatCard
          label="Total Reflected"
          value={`${summary.totalCount}개`}
        />
        <LearningHistoryStatCard
          label="Improved"
          value={`${summary.improvedCount}개`}
          tone="text-emerald-700"
        />
        <LearningHistoryStatCard
          label="Worsened"
          value={`${summary.worsenedCount}개`}
          tone="text-rose-700"
        />
        <LearningHistoryStatCard
          label="Neutral"
          value={`${summary.neutralCount}개`}
          tone="text-slate-700"
        />
      </div>
    </section>
  );
});

function resolveBaselineMetricValue(
  targetMetric: string,
  actual: Record<string, any> | undefined,
  fallbackPrimaryMetric?: string,
): number {
  if (!actual || typeof actual !== "object") return 0;

  const normalizedTarget = String(targetMetric || "").trim().toUpperCase();
  const normalizedPrimary = String(fallbackPrimaryMetric || "")
    .trim()
    .toLowerCase();

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = actual[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (value != null) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
    }
    return 0;
  };

  switch (normalizedTarget) {
    case "IMPRESSIONS":
      return pick("impressions");
    case "CLICKS":
      return pick("clicks");
    case "CONVERSIONS":
      return pick("conversions");
    case "REVENUE":
      return pick("revenue");
    case "CTR":
      return pick("ctr");
    case "CVR":
      return pick("cvr");
    case "CPC":
      return pick("cpc");
    case "CPA":
      return pick("cpa");
    case "ROAS":
      return pick("roas");
    case "PRIMARY_METRIC":
    default:
      switch (normalizedPrimary) {
        case "impressions":
          return pick("impressions");
        case "clicks":
          return pick("clicks");
        case "conversions":
          return pick("conversions");
        case "revenue":
          return pick("revenue");
        case "ctr":
          return pick("ctr");
        case "cvr":
          return pick("cvr");
        case "cpc":
          return pick("cpc");
        case "cpa":
          return pick("cpa");
        case "roas":
          return pick("roas");
        case "spend":
          return pick("spend");
        default:
          return 0;
      }
  }
}

function isLowerBetterMetric(targetMetric: string): boolean {
  const normalized = String(targetMetric || "").trim().toUpperCase();
  return normalized === "CPA" || normalized === "CPC";
}

function buildExecutionEvaluationMap(args: {
  items: ExecutionItem[];
  actual: Record<string, any> | undefined;
  fallbackPrimaryMetric?: string;
}): Record<string, ExecutionEvaluation> {
  const { items, actual, fallbackPrimaryMetric } = args;
  const result: Record<string, ExecutionEvaluation> = {};

  for (const item of items) {
    if (item.baselineValue == null || !Number.isFinite(item.baselineValue)) {
      continue;
    }

    const currentValue = resolveBaselineMetricValue(
      item.targetMetric,
      actual,
      fallbackPrimaryMetric,
    );

    const diffValue = currentValue - item.baselineValue;
    const diffRate =
      item.baselineValue !== 0 ? diffValue / item.baselineValue : 0;

    let direction: ExecutionEvaluation["direction"] = "neutral";

    if (Math.abs(diffValue) > 1e-9) {
      if (isLowerBetterMetric(item.targetMetric)) {
        direction = diffValue < 0 ? "improved" : "worsened";
      } else {
        direction = diffValue > 0 ? "improved" : "worsened";
      }
    }

    result[item.executionId] = {
      executionId: item.executionId,
      currentValue,
      diffValue,
      diffRate,
      direction,
    };
  }

  return result;
}

function buildExecutionSummaryStrip(args: {
  items: ExecutionItem[];
  evaluations: Record<string, ExecutionEvaluation>;
}): ExecutionSummaryStripItem[] {
  const { items, evaluations } = args;

  let improvedCount = 0;
  let worsenedCount = 0;
  let neutralCount = 0;

  for (const item of items) {
    if (item.status !== "done") continue;

    const evaluation = evaluations[item.executionId];
    if (!evaluation) {
      neutralCount += 1;
      continue;
    }

    if (evaluation.direction === "improved") {
      improvedCount += 1;
      continue;
    }

    if (evaluation.direction === "worsened") {
      worsenedCount += 1;
      continue;
    }

    neutralCount += 1;
  }

  return [
    {
      key: "improved",
      title: "이번 달 실제로 효과 있었던 실행",
      count: improvedCount,
      description:
        improvedCount > 0
          ? `baseline 대비 KPI가 개선된 완료 실행이 ${improvedCount}개 있습니다. 유지·확대 후보를 먼저 검토하세요.`
          : "아직 baseline 대비 개선으로 판정된 완료 실행이 없습니다.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    {
      key: "worsened",
      title: "이번 달 악화된 실행",
      count: worsenedCount,
      description:
        worsenedCount > 0
          ? `baseline 대비 KPI가 악화된 완료 실행이 ${worsenedCount}개 있습니다. 중단·수정 우선 후보입니다.`
          : "현재까지 baseline 대비 악화로 판정된 완료 실행은 없습니다.",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    },
    {
      key: "neutral",
      title: "이번 달 판단 보류 실행",
      count: neutralCount,
      description:
        neutralCount > 0
          ? `변화가 미미하거나 아직 명확히 해석하기 어려운 완료 실행이 ${neutralCount}개 있습니다. 추가 관찰이 필요합니다.`
          : "현재까지 판단 보류로 남아 있는 완료 실행은 없습니다.",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    },
  ];
}

function buildLearningReflectionMap(
  history: PriorityLearningHistoryItem[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};

  for (const item of history) {
    if (!item.executionId) continue;
    result[item.executionId] = true;
  }

  return result;
}

function buildLearningHistorySummary(
  history: PriorityLearningHistoryItem[],
): LearningHistorySummary {
  let improvedCount = 0;
  let worsenedCount = 0;
  let neutralCount = 0;

  for (const item of history) {
    if (item.direction === "improved") {
      improvedCount += 1;
      continue;
    }

    if (item.direction === "worsened") {
      worsenedCount += 1;
      continue;
    }

    neutralCount += 1;
  }

  return {
    improvedCount,
    worsenedCount,
    neutralCount,
    totalCount: history.length,
  };
}

function DecisionPanelComponent(props: Props) {
  const [executionItems, setExecutionItems] = useState<ExecutionItem[]>([]);
  const [learningHistory, setLearningHistory] = useState<
    PriorityLearningHistoryItem[]
  >([]);

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

  const executionEvaluations = useMemo(
    () =>
      buildExecutionEvaluationMap({
        items: executionItems,
        actual: decisionInput.actual,
        fallbackPrimaryMetric: goalSnapshot.primaryMetric,
      }),
    [executionItems, decisionInput.actual, goalSnapshot.primaryMetric],
  );

  const learningReflections = useMemo(
    () => buildLearningReflectionMap(learningHistory),
    [learningHistory],
  );

  const learningHistorySummary = useMemo(
    () => buildLearningHistorySummary(learningHistory),
    [learningHistory],
  );

  const priorityItems = useMemo(
    () => buildPriorityQueue(hypotheses, simulationResults, learningHistory),
    [hypotheses, simulationResults, learningHistory],
  );

  const executionSummaryStripItems = useMemo(
    () =>
      buildExecutionSummaryStrip({
        items: executionItems,
        evaluations: executionEvaluations,
      }),
    [executionItems, executionEvaluations],
  );

  const handleExecute = useCallback((item: PriorityItem) => {
    setExecutionItems((prev) => {
      const alreadyExists = prev.some(
        (execution) => execution.hypothesisId === item.hypothesisId,
      );

      if (alreadyExists) {
        return prev;
      }

      const nextItem = createExecutionItemFromPriority(item);
      return [nextItem, ...prev];
    });
  }, []);

  const handleChangeExecutionStatus = useCallback(
    (executionId: string, status: ExecutionStatus) => {
      const targetItem = executionItems.find(
        (item) => item.executionId === executionId,
      );

      if (!targetItem) {
        return;
      }

      const shouldCaptureBaseline = shouldCaptureBaselineOnStatusChange(
        targetItem,
        status,
      );

      const baselineValue = shouldCaptureBaseline
        ? resolveBaselineMetricValue(
            targetItem.targetMetric,
            decisionInput.actual,
            goalSnapshot.primaryMetric,
          )
        : targetItem.baselineValue;

      const nextItem = updateExecutionItemStatus(targetItem, status, {
        baselineValue,
      });

      setExecutionItems((prev) =>
        prev.map((item) => (item.executionId === executionId ? nextItem : item)),
      );

      if (shouldAppendLearningHistoryOnStatusChange(targetItem, status)) {
        const evaluation = executionEvaluations[executionId];

        if (evaluation) {
          setLearningHistory((prev) => {
            if (hasLearningHistoryForExecution(prev, nextItem.executionId)) {
              return prev;
            }

            return appendPriorityLearningHistory({
              history: prev,
              item: nextItem,
              direction: evaluation.direction,
              evaluatedAt: nextItem.updatedAt,
            });
          });
        }
      }
    },
    [
      executionItems,
      executionEvaluations,
      decisionInput.actual,
      goalSnapshot.primaryMetric,
    ],
  );

  return (
    <div className="space-y-6">
      <GoalCommandCenter snapshot={goalSnapshot} />

      <GapForecastBoard snapshot={goalSnapshot} />

      <PriorityQueue
        items={priorityItems}
        onExecute={handleExecute}
        learningSummary={learningHistorySummary}
      />

      <HypothesisCards items={hypotheses} simulations={simulationResults} />

      <ExecutionSummaryStrip items={executionSummaryStripItems} />

      <ExecutionLog
        items={executionItems}
        evaluations={executionEvaluations}
        learningReflections={learningReflections}
        onChangeStatus={handleChangeExecutionStatus}
      />

      <LearningHistoryPanel summary={learningHistorySummary} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <InfoCard
          title="Impact Simulator"
          description="현재 단계에서는 각 가설별로 예산 재배치·효율 개선·주차 회복 시나리오를 적용했을 때 월말 예상 달성률 개선폭을 계산합니다. 다음 단계에서는 축별 부분 적용률과 영향 계수를 더 정교하게 분리합니다."
        />
        <InfoCard
          title="Priority Queue"
          description="현재 단계에서는 Impact / Confidence / Ease 기반으로 ICE 성격의 우선순위 점수를 계산해 지금 당장 실행해야 할 Top 액션 순서를 자동으로 정렬합니다."
        />
      </section>

      <section className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-5">
        <div className="text-sm font-semibold text-slate-900">
          현재 연결 상태
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Objective
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {goalSnapshot.objective}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Primary Metric
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {goalSnapshot.primaryMetric}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Last Data Date
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {decisionInput.period.lastDataDate ?? "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Current Month Key
            </div>
            <div className="mt-2 text-base font-semibold text-slate-900">
              {decisionInput.period.currentMonthKey}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default memo(DecisionPanelComponent);
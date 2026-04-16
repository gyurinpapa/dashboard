"use client";

import { memo } from "react";
import type { DecisionHypothesis } from "@/src/lib/decision/hypothesis";
import type { HypothesisSimulationResult } from "@/src/lib/decision/simulator";

type Props = {
  items: DecisionHypothesis[];
  simulations?: HypothesisSimulationResult[];
};

function formatPercentPoint(rate: number): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  const signed = safe >= 0 ? "+" : "";
  return `${signed}${(safe * 100).toFixed(1)}%p`;
}

const LabelChip = memo(function LabelChip({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-slate-600">
      {children}
    </span>
  );
});

const HypothesisCard = memo(function HypothesisCard({
  item,
  index,
  simulation,
}: {
  item: DecisionHypothesis;
  index: number;
  simulation?: HypothesisSimulationResult;
}) {
  const confidenceText =
    item.confidence === "high"
      ? "HIGH CONFIDENCE"
      : item.confidence === "medium"
      ? "MEDIUM CONFIDENCE"
      : "LOW CONFIDENCE";

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <LabelChip>{`HYPOTHESIS ${index + 1}`}</LabelChip>
            <LabelChip>{confidenceText}</LabelChip>
            {simulation ? <LabelChip>{simulation.scenarioLabel}</LabelChip> : null}
          </div>

          <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
            {item.title}
          </h3>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            Axis · {item.axis}
          </div>

          {simulation ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              예상 달성률 개선 {formatPercentPoint(simulation.expectedAttainmentRateDelta)}
            </div>
          ) : null}
        </div>
      </div>

      {simulation ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="text-sm font-semibold text-emerald-900">시뮬레이션 결과</div>
          <p className="mt-2 text-sm leading-6 text-emerald-800">
            {simulation.summary}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="text-sm font-semibold text-slate-900">현재 문제</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.currentProblem}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="text-sm font-semibold text-slate-900">원인 추정</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.causeEstimate}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="text-sm font-semibold text-slate-900">실행 액션</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.action}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="text-sm font-semibold text-slate-900">예상 결과 변화</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.expectedChange}</p>
        </div>
      </div>
    </article>
  );
});

function HypothesisCardsComponent({ items, simulations = [] }: Props) {
  const simulationMap = new Map(
    simulations.map((simulation) => [simulation.hypothesisId, simulation]),
  );

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              HYPOTHESIS ENGINE V1
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              목표 부족분을 실행 가설로 분해
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              현재 목표 상태를 기준으로 문제 → 원인 → 액션 → 예상 결과 변화 구조의
              1차 운영 가설을 생성합니다. 이번 버전은 기존 집계 구조를 유지한 채
              캠페인·주차 축 중심의 rule-based 해석만 추가합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              생성 가설 <span className="font-semibold text-slate-900">{items.length}개</span>
            </div>
            <div className="mt-1">
              방식 <span className="font-semibold text-slate-900">Rule Based</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {items.map((item, index) => (
          <HypothesisCard
            key={item.id}
            item={item}
            index={index}
            simulation={simulationMap.get(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

export default memo(HypothesisCardsComponent);
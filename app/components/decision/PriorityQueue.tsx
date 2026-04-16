"use client";

import { memo } from "react";
import type { PriorityItem } from "@/src/lib/decision/priority";

export type PriorityQueueLearningSummary = {
  improvedCount: number;
  worsenedCount: number;
  neutralCount: number;
  totalCount: number;
};

type Props = {
  items: PriorityItem[];
  onExecute?: (item: PriorityItem) => void;
  learningSummary?: PriorityQueueLearningSummary;
};

function formatScore(score: number) {
  const safe = Number.isFinite(score) ? score : 0;
  return (safe * 100).toFixed(1);
}

function formatPercent(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return (safe * 100).toFixed(1);
}

function formatSignedPercent(value?: number) {
  const safe = Number.isFinite(value ?? NaN) ? (value as number) : 0;
  const sign = safe > 0 ? "+" : "";
  return `${sign}${(safe * 100).toFixed(1)}%`;
}

function formatRatioPercent(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}%`;
}

const ScoreRow = memo(function ScoreRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
});

const LearningMetricCard = memo(function LearningMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
});

const PriorityCard = memo(function PriorityCard({
  item,
  onExecute,
  learningSummary,
}: {
  item: PriorityItem;
  onExecute?: (item: PriorityItem) => void;
  learningSummary?: PriorityQueueLearningSummary;
}) {
  const hasLearningSignal = Boolean(item.learningSignal?.totalCount);
  const learningAdjustment = item.learningAdjustment ?? 0;
  const baseConfidence = item.baseConfidence ?? item.confidence;
  const improvedCount = item.learningSignal?.improvedCount ?? 0;
  const worsenedCount = item.learningSignal?.worsenedCount ?? 0;
  const neutralCount = item.learningSignal?.neutralCount ?? 0;
  const relatedLearningCount = item.learningSignal?.totalCount ?? 0;
  const totalLearningCount = learningSummary?.totalCount ?? 0;
  const reflectedRatio =
    totalLearningCount > 0
      ? (relatedLearningCount / totalLearningCount) * 100
      : 0;

  const learningTone =
    learningAdjustment > 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : learningAdjustment < 0
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
          PRIORITY {item.rank}
        </div>

        <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">
          SCORE {formatScore(item.score)}
        </div>
      </div>

      <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
        {item.title}
      </h3>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ScoreRow label="Impact" value={formatPercent(item.impact)} />
        <ScoreRow label="Confidence" value={formatPercent(item.confidence)} />
        <ScoreRow label="Ease" value={formatPercent(item.ease)} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Learning Adjustment
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              과거 실행 결과를 confidence에 미세 반영한 설명 영역입니다. 기존
              정렬 구조는 유지하고, 왜 우선순위가 바뀌었는지만 보여줍니다.
            </p>
          </div>

          <div
            className={[
              "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
              learningTone,
            ].join(" ")}
          >
            {formatSignedPercent(learningAdjustment)}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <LearningMetricCard
            label="Confidence Shift"
            value={`${formatPercent(baseConfidence)} → ${formatPercent(
              item.confidence,
            )}`}
          />
          <LearningMetricCard
            label="Improved / Worsened"
            value={`${improvedCount} / ${worsenedCount}`}
          />
          <LearningMetricCard
            label="Neutral / Total"
            value={`${neutralCount} / ${relatedLearningCount}`}
          />
        </div>

        <div className="mt-3 text-xs leading-5 text-slate-500">
          {hasLearningSignal
            ? `누적 학습 데이터가 반영되었습니다. improved ${improvedCount}건, worsened ${worsenedCount}건, neutral ${neutralCount}건 기준으로 confidence가 보정되었습니다.`
            : "아직 누적 학습 데이터가 없어 기본 confidence로 계산되었습니다."}
        </div>

        <div className="mt-2 text-[11px] leading-5 text-slate-500">
          {totalLearningCount > 0
            ? `관련 learning ${relatedLearningCount} / 전체 ${totalLearningCount} · 반영 비중 ${formatRatioPercent(
                reflectedRatio,
              )}`
            : "전체 learning 데이터가 아직 없어 카드별 반영 비중을 계산하지 않았습니다."}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{item.summary}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          hypothesisId{" "}
          <span className="font-semibold text-slate-700">
            {item.hypothesisId}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onExecute?.(item)}
          className="inline-flex items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          실행
        </button>
      </div>
    </article>
  );
});

function PriorityQueueComponent({
  items,
  onExecute,
  learningSummary,
}: Props) {
  const top3 = items.slice(0, 3);
  const totalLearningCount = learningSummary?.totalCount ?? 0;

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              PRIORITY QUEUE V1
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              실행 우선순위 TOP 3
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Impact × Confidence × Ease 기준으로 지금 당장 실행해야 할 액션을
              자동 정렬합니다. 현재 단계에서는 simulation 기반 개선폭을 Impact로
              사용하고, 가설 신뢰도와 실행 난이도를 함께 반영합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              정렬 기준{" "}
              <span className="font-semibold text-slate-900">
                ICE 성격 점수
              </span>
            </div>
            <div className="mt-1">
              노출 카드{" "}
              <span className="font-semibold text-slate-900">
                {top3.length}개
              </span>
            </div>
            <div className="mt-1">
              이번 추천 반영 learning{" "}
              <span className="font-semibold text-slate-900">
                {totalLearningCount}개
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {top3.map((item) => (
          <PriorityCard
            key={item.hypothesisId}
            item={item}
            onExecute={onExecute}
            learningSummary={learningSummary}
          />
        ))}
      </div>
    </section>
  );
}

export default memo(PriorityQueueComponent);
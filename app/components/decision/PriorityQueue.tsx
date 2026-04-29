"use client";

import { memo, useState } from "react";
import type { PriorityItem } from "@/src/lib/decision/priority";

export type PriorityQueueLearningSummary = {
  improvedCount: number;
  worsenedCount: number;
  neutralCount: number;
  totalCount: number;
};

export type PriorityQueueLearningDetailItem = {
  executionId: string;
  hypothesisId: string;
  direction: "improved" | "worsened" | "neutral";
  evaluatedAt?: string;
};

export type PriorityRankSnapshot = {
  hypothesisId: string;
  previousRank?: number;
  currentRank: number;
  direction: "up" | "down" | "same" | "new";
  changedAt?: string;
};

type Props = {
  items: PriorityItem[];
  onExecute?: (item: PriorityItem) => void;
  learningSummary?: PriorityQueueLearningSummary;
  latestLearningEvaluatedAtByHypothesis?: Record<string, string | undefined>;
  learningDetailsByHypothesis?: Record<string, PriorityQueueLearningDetailItem[]>;
  executionTitleById?: Record<string, string>;
  rankSnapshotsByHypothesis?: Record<string, PriorityRankSnapshot>;
  highlightedHypothesisId?: string | null;
  recentlyFocusedHypothesisId?: string | null;
};

const FOCUSED_PRIORITY_CARD_CLASS =
  "border-indigo-300 ring-2 ring-indigo-200 shadow-[0_0_0_6px_rgba(99,102,241,0.08)]";

const RECENTLY_FOCUSED_PRIORITY_CARD_CLASS =
  "border-indigo-200 bg-indigo-50/40 shadow-sm";

const FOCUSED_PRIORITY_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-indigo-700";

const RECENTLY_FOCUSED_PRIORITY_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-indigo-600";

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

function formatRecentDate(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatDateTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    hour12: false,
  });
}

function getLearningImpactLabel(adjustment: number) {
  const size = Math.abs(Number.isFinite(adjustment) ? adjustment : 0);

  if (size >= 0.08) return "high";
  if (size >= 0.03) return "medium";
  return "low";
}

function buildLearningConfidenceLine(args: {
  baseConfidence: number;
  finalConfidence: number;
  learningAdjustment: number;
}) {
  const { baseConfidence, finalConfidence, learningAdjustment } = args;

  return `Base ${formatPercent(baseConfidence)}% + Learning ${formatSignedPercent(
    learningAdjustment,
  )} → Final ${formatPercent(finalConfidence)}%`;
}

function buildPriorityReasonText(args: {
  impact: number;
  confidence: number;
  ease: number;
  learningAdjustment: number;
  improvedCount: number;
  worsenedCount: number;
}) {
  const {
    impact,
    confidence,
    ease,
    learningAdjustment,
    improvedCount,
    worsenedCount,
  } = args;

  const parts: string[] = [];

  if (impact >= 0.75) {
    parts.push("영향도 높음");
  } else if (impact >= 0.6) {
    parts.push("영향도 유의미");
  }

  if (confidence >= 0.75) {
    parts.push("신뢰도 높음");
  }

  if (ease >= 0.75) {
    parts.push("빠른 실행 가능");
  }

  if (learningAdjustment > 0 && improvedCount >= worsenedCount) {
    parts.push("학습 기반 신뢰도 상승");
  } else if (learningAdjustment < 0 && worsenedCount > improvedCount) {
    parts.push("최근 성과 악화로 재검토 필요");
  }

  const selected = parts.slice(0, 3);

  if (selected.length === 0) {
    return "복합 지표 기준 우선 실행 후보";
  }

  return `${selected.join(" + ")}로 우선 실행 권장`;
}

function resolveKpiLabelsFromItem(item: PriorityItem): string[] {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const kpis: string[] = [];

  if (
    text.includes("전환") ||
    text.includes("conversion") ||
    text.includes("cvr")
  ) {
    kpis.push("전환율", "CPA");
  }

  if (
    text.includes("매출") ||
    text.includes("revenue") ||
    text.includes("roas")
  ) {
    kpis.push("ROAS", "매출");
  }

  if (
    text.includes("클릭") ||
    text.includes("click") ||
    text.includes("ctr") ||
    text.includes("cpc")
  ) {
    kpis.push("CTR", "클릭수");
  }

  if (
    text.includes("노출") ||
    text.includes("impression") ||
    text.includes("도달")
  ) {
    kpis.push("노출수");
  }

  if (kpis.length === 0) {
    return ["핵심 KPI 영향 가능"];
  }

  return Array.from(new Set(kpis)).slice(0, 3);
}

function getDirectionTone(direction: "improved" | "worsened" | "neutral") {
  switch (direction) {
    case "improved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "worsened":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getDirectionLabel(direction: "improved" | "worsened" | "neutral") {
  switch (direction) {
    case "improved":
      return "개선";
    case "worsened":
      return "악화";
    default:
      return "보류";
  }
}

function getRankTrendTone(direction: PriorityRankSnapshot["direction"]) {
  switch (direction) {
    case "up":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "down":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "new":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "same":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getRankTrendLabel(direction: PriorityRankSnapshot["direction"]) {
  switch (direction) {
    case "up":
      return "상승";
    case "down":
      return "하락";
    case "new":
      return "신규";
    case "same":
    default:
      return "유지";
  }
}

function buildRankTrendText(snapshot?: PriorityRankSnapshot) {
  if (!snapshot) {
    return "이전 rank snapshot이 없어 현재 순위만 표시합니다.";
  }

  if (snapshot.direction === "new") {
    return `이번 계산에서 새롭게 Priority Rank #${snapshot.currentRank}로 진입했습니다.`;
  }

  if (snapshot.direction === "up") {
    return `이전 #${snapshot.previousRank} → 현재 #${snapshot.currentRank}로 상승했습니다.`;
  }

  if (snapshot.direction === "down") {
    return `이전 #${snapshot.previousRank} → 현재 #${snapshot.currentRank}로 하락했습니다.`;
  }

  return `이전 #${snapshot.previousRank ?? snapshot.currentRank} → 현재 #${snapshot.currentRank}로 순위가 유지되었습니다.`;
}

function buildExecutionReflectionText(args: {
  direction?: "improved" | "worsened" | "neutral";
  executionTitle?: string;
}) {
  const { direction, executionTitle } = args;

  const executionLabel = executionTitle ? `‘${executionTitle}’` : "최근 실행 결과";

  if (direction === "improved") {
    return `${executionLabel}가 긍정 신호로 반영되어 현재 추천 보정 근거에 포함되었습니다.`;
  }

  if (direction === "worsened") {
    return `${executionLabel}가 주의 신호로 반영되어 현재 추천 재검토 근거에 포함되었습니다.`;
  }

  if (direction === "neutral") {
    return `${executionLabel}가 관찰 신호로 반영되어 현재 추천 보정 근거에 포함되었습니다.`;
  }

  return "아직 연결된 실행 반영 결과가 없어 기본 추천 근거 중심으로 계산되었습니다.";
}

function buildPriorityChangeReasonLine(args: {
  snapshot?: PriorityRankSnapshot;
  latestDirection?: "improved" | "worsened" | "neutral";
}) {
  const { snapshot, latestDirection } = args;

  if (!snapshot) {
    return "이전 rank 기준점이 없어 현재 순위만 표시합니다.";
  }

  if (snapshot.direction === "new") {
    return `이번 계산에서 새롭게 #${snapshot.currentRank} 진입`;
  }

  if (snapshot.direction === "up") {
    if (latestDirection === "improved") {
      return `최근 개선 실행 반영으로 #${snapshot.previousRank} → #${snapshot.currentRank} 상승`;
    }
    if (latestDirection === "neutral") {
      return `관찰 신호 반영으로 #${snapshot.previousRank} → #${snapshot.currentRank} 상승`;
    }
    return `복합 보정 반영으로 #${snapshot.previousRank} → #${snapshot.currentRank} 상승`;
  }

  if (snapshot.direction === "down") {
    if (latestDirection === "worsened") {
      return `악화 이력 누적으로 #${snapshot.previousRank} → #${snapshot.currentRank} 조정`;
    }
    if (latestDirection === "neutral") {
      return `관찰 단계 재평가로 #${snapshot.previousRank} → #${snapshot.currentRank} 조정`;
    }
    return `복합 보정 반영으로 #${snapshot.previousRank} → #${snapshot.currentRank} 조정`;
  }

  if (latestDirection === "improved") {
    return `개선 신호 반영에도 현재 #${snapshot.currentRank} 유지`;
  }

  if (latestDirection === "worsened") {
    return `주의 신호 반영으로 현재 #${snapshot.currentRank} 유지`;
  }

  if (latestDirection === "neutral") {
    return `관찰 단계 유지로 현재 #${snapshot.currentRank} 유지`;
  }

  return `현재 #${snapshot.currentRank} 유지`;
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

const EvidenceMetricCard = memo(function EvidenceMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
      {helper ? (
        <div className="mt-1 text-[11px] leading-4 text-slate-500">{helper}</div>
      ) : null}
    </div>
  );
});

const LearningDirectionSummary = memo(function LearningDirectionSummary({
  improved,
  worsened,
  neutral,
}: {
  improved: number;
  worsened: number;
  neutral: number;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
        ▲ {improved}
      </span>

      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700">
        ▼ {worsened}
      </span>

      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
        ● {neutral}
      </span>
    </div>
  );
});

const LearningRatioBar = memo(function LearningRatioBar({
  relatedCount,
  totalCount,
  ratio,
}: {
  relatedCount: number;
  totalCount: number;
  ratio: number;
}) {
  const safeRatio = Math.max(0, Math.min(100, ratio));

  return (
    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Learning Mix
        </div>
        <div className="text-[11px] font-semibold text-slate-700">
          {formatRatioPercent(safeRatio)}
        </div>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width]"
          style={{ width: `${safeRatio}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span>
          관련 {relatedCount} / 전체 {totalCount}
        </span>
        <span className="font-semibold text-slate-700">
          {relatedCount} / {totalCount} learning
        </span>
      </div>
    </div>
  );
});

const PriorityCard = memo(function PriorityCard({
  item,
  onExecute,
  learningSummary,
  latestLearningEvaluatedAtByHypothesis,
  learningDetailsByHypothesis,
  executionTitleById,
  rankSnapshotsByHypothesis,
  highlightedHypothesisId,
  recentlyFocusedHypothesisId,
}: {
  item: PriorityItem;
  onExecute?: (item: PriorityItem) => void;
  learningSummary?: PriorityQueueLearningSummary;
  latestLearningEvaluatedAtByHypothesis?: Record<string, string | undefined>;
  learningDetailsByHypothesis?: Record<string, PriorityQueueLearningDetailItem[]>;
  executionTitleById?: Record<string, string>;
  rankSnapshotsByHypothesis?: Record<string, PriorityRankSnapshot>;
  highlightedHypothesisId?: string | null;
  recentlyFocusedHypothesisId?: string | null;
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const hasLearningSignal = Boolean(item.learningSignal?.totalCount);
  const learningAdjustment = item.learningAdjustment ?? 0;
  const baseConfidence = item.baseConfidence ?? item.confidence;
  const improvedCount = item.learningSignal?.improvedCount ?? 0;
  const worsenedCount = item.learningSignal?.worsenedCount ?? 0;
  const neutralCount = item.learningSignal?.neutralCount ?? 0;
  const relatedLearningCount = item.learningSignal?.totalCount ?? 0;
  const recentLearningCount = item.recentLearningCount ?? 0;
  const totalLearningCount = learningSummary?.totalCount ?? 0;
  const reflectedRatio =
    totalLearningCount > 0
      ? (relatedLearningCount / totalLearningCount) * 100
      : 0;
  const learningImpactLabel = getLearningImpactLabel(learningAdjustment);
  const confidenceBreakdownLine = buildLearningConfidenceLine({
    baseConfidence,
    finalConfidence: item.confidence,
    learningAdjustment,
  });

  const latestEvaluatedAt =
    latestLearningEvaluatedAtByHypothesis?.[item.hypothesisId];
  const recentLearningLabel = formatRecentDate(latestEvaluatedAt);
  const learningDetails = learningDetailsByHypothesis?.[item.hypothesisId] ?? [];
  const hasLearningDetails = learningDetails.length > 0;
  const latestLearningDetail = learningDetails[0];
  const latestExecutionTitle = latestLearningDetail
    ? executionTitleById?.[latestLearningDetail.executionId]
    : undefined;
  const rankSnapshot = rankSnapshotsByHypothesis?.[item.hypothesisId];
  const isHighlighted = highlightedHypothesisId === item.hypothesisId;
  const isRecentlyFocused =
    !isHighlighted && recentlyFocusedHypothesisId === item.hypothesisId;

  const learningTone =
    learningAdjustment > 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : learningAdjustment < 0
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  const reasonText = buildPriorityReasonText({
    impact: item.impact,
    confidence: item.confidence,
    ease: item.ease,
    learningAdjustment,
    improvedCount,
    worsenedCount,
  });

  const kpiLabels = resolveKpiLabelsFromItem(item);
  const executionReflectionText = buildExecutionReflectionText({
    direction: latestLearningDetail?.direction,
    executionTitle: latestExecutionTitle,
  });
  const rankTrendText = buildRankTrendText(rankSnapshot);
  const priorityChangeReasonLine = buildPriorityChangeReasonLine({
    snapshot: rankSnapshot,
    latestDirection: latestLearningDetail?.direction,
  });

  const learningDriverLine =
    item.learningDriverLine ??
    "아직 learning driver 설명이 없어 기본 추천 근거 중심으로 표시합니다.";
  const strategyBridgeLine =
    item.strategyBridgeLine ??
    "아직 Strategy 연결 설명이 없어 Priority 점수 중심으로 표시합니다.";
  const learningTrendLabel = item.recentLearningTrend ?? "flat";
  const learningTrendStrength = item.learningTrendStrength ?? 0;
  const evidenceWeight = item.learningEvidenceWeight ?? 0;

  const actionHelperText = isHighlighted
    ? "현재 상단 카드와 연결됨 · 선택된 Hot Priority 요약과 같은 항목입니다."
    : isRecentlyFocused
      ? "최근 확인한 Priority입니다 · 흐름을 이어서 바로 실행할 수 있습니다."
      : "상단에서 선택하면 이 카드가 잠시 강조되고, 여기서 바로 실행으로 이어집니다.";

  const actionButtonText = isHighlighted
    ? "지금 실행"
    : isRecentlyFocused
      ? "이어서 실행"
      : "실행";

  return (
    <article
      id={`priority-card-${item.hypothesisId}`}
      className={[
        "rounded-[24px] border bg-white p-5 shadow-sm scroll-mt-24 transition-all duration-500",
        isHighlighted
          ? FOCUSED_PRIORITY_CARD_CLASS
          : isRecentlyFocused
            ? RECENTLY_FOCUSED_PRIORITY_CARD_CLASS
            : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
          PRIORITY {item.rank}
        </div>

        <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">
          SCORE {formatScore(item.score)}
        </div>
      </div>

      {isHighlighted ? (
        <div className={["mt-3", FOCUSED_PRIORITY_BADGE_CLASS].join(" ")}>
          FOCUSED PRIORITY
        </div>
      ) : null}

      {isRecentlyFocused ? (
        <div
          className={["mt-3", RECENTLY_FOCUSED_PRIORITY_BADGE_CLASS].join(" ")}
        >
          RECENTLY FOCUSED
        </div>
      ) : null}

      <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
        {item.title}
      </h3>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ScoreRow label="Impact" value={formatPercent(item.impact)} />
        <ScoreRow label="Confidence" value={formatPercent(item.confidence)} />
        <ScoreRow label="Ease" value={formatPercent(item.ease)} />
      </div>

      <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
              Evidence-Based Priority
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
              {learningDriverLine}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {strategyBridgeLine}
            </p>
          </div>

          <div className="inline-flex items-center self-start rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-indigo-700">
            {learningTrendLabel}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <EvidenceMetricCard
            label="Recent Learning"
            value={`${recentLearningCount}건`}
            helper="최근 반영 표본"
          />
          <EvidenceMetricCard
            label="Trend Strength"
            value={`${formatPercent(learningTrendStrength)}%`}
            helper="최근 방향성 강도"
          />
          <EvidenceMetricCard
            label="Evidence Weight"
            value={`${formatPercent(evidenceWeight)}%`}
            helper="confidence 반영 가중치"
          />
          <EvidenceMetricCard
            label="Learning Mix"
            value={`▲${improvedCount} / ▼${worsenedCount} / ●${neutralCount}`}
            helper={`총 ${relatedLearningCount}건`}
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Learning Adjustment
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              과거 실행 결과를 confidence에 미세 반영한 설명 영역입니다. 기존
              정렬 구조는 유지하고, 왜 우선순위가 바뀌었는지만 보여줍니다.
            </p>

            <div className="mt-2 text-sm font-semibold text-slate-900">
              {confidenceBreakdownLine}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>
                Learning impact:{" "}
                <span className="font-semibold text-slate-700">
                  {formatSignedPercent(learningAdjustment)}
                </span>
              </span>
              <span>·</span>
              <span>
                strength{" "}
                <span className="font-semibold uppercase text-slate-700">
                  {learningImpactLabel}
                </span>
              </span>
              <span>·</span>
              <span>
                ▲{improvedCount} / ▼{worsenedCount} / ●{neutralCount}
              </span>
            </div>
          </div>

          <div
            className={[
              "inline-flex items-center self-start rounded-full border px-3 py-1 text-sm font-semibold",
              learningTone,
            ].join(" ")}
          >
            {formatSignedPercent(learningAdjustment)}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <LearningMetricCard
            label="Base Confidence"
            value={`${formatPercent(baseConfidence)}%`}
          />
          <LearningMetricCard
            label="Learning Shift"
            value={formatSignedPercent(learningAdjustment)}
          />
          <LearningMetricCard
            label="Final Confidence"
            value={`${formatPercent(item.confidence)}%`}
          />
          <LearningMetricCard
            label="Learning Strength"
            value={learningImpactLabel.toUpperCase()}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <LearningMetricCard label="Improved" value={`${improvedCount}`} />
          <LearningMetricCard label="Worsened" value={`${worsenedCount}`} />
          <LearningMetricCard
            label="Neutral / Total"
            value={`${neutralCount} / ${relatedLearningCount}`}
          />
        </div>

        <LearningDirectionSummary
          improved={improvedCount}
          worsened={worsenedCount}
          neutral={neutralCount}
        />

        <div className="mt-3 text-xs leading-5 text-slate-500">
          {hasLearningSignal
            ? `누적 학습 데이터가 반영되었습니다. base confidence ${formatPercent(
                baseConfidence,
              )}%에 learning adjustment ${formatSignedPercent(
                learningAdjustment,
              )}가 더해져 final confidence ${formatPercent(
                item.confidence,
              )}%로 계산되었습니다.`
            : "아직 누적 학습 데이터가 없어 base confidence 그대로 계산되었습니다."}
        </div>

        <div className="mt-2 text-[11px] leading-5 text-slate-500">
          {totalLearningCount > 0
            ? `관련 learning ${relatedLearningCount} / 전체 ${totalLearningCount} · 반영 비중 ${formatRatioPercent(
                reflectedRatio,
              )}`
            : "전체 learning 데이터가 아직 없어 카드별 반영 비중을 계산하지 않았습니다."}
        </div>

        {totalLearningCount > 0 ? (
          <LearningRatioBar
            relatedCount={relatedLearningCount}
            totalCount={totalLearningCount}
            ratio={reflectedRatio}
          />
        ) : null}

        <div className="mt-1 text-[11px] leading-5 text-slate-500">
          {recentLearningLabel
            ? `최근 반영: ${recentLearningLabel}`
            : "최근 반영 이력 없음"}
        </div>

        {latestExecutionTitle ? (
          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            → execution:{" "}
            <span className="font-semibold text-slate-700">
              {latestExecutionTitle}
            </span>
          </div>
        ) : null}

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setIsDetailOpen((prev) => !prev)}
            disabled={!hasLearningDetails}
            className={[
              "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              hasLearningDetails
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400",
            ].join(" ")}
          >
            {isDetailOpen ? "학습 상세 닫기" : "학습 상세 보기"}
          </button>
        </div>

        {isDetailOpen && hasLearningDetails ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
                LEARNING DETAILS
              </div>
              <div className="text-[11px] text-slate-500">
                최근 반영 execution {learningDetails.length}건
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              {learningDetails.map((detail) => {
                const executionTitle = executionTitleById?.[detail.executionId];

                return (
                  <div
                    key={detail.executionId}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        className={[
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          getDirectionTone(detail.direction),
                        ].join(" ")}
                      >
                        {detail.direction}
                      </div>

                      <div className="text-[11px] text-slate-500">
                        {formatRecentDate(detail.evaluatedAt) || "-"}
                      </div>
                    </div>

                    {executionTitle ? (
                      <div className="mt-2 text-xs text-slate-500">
                        execution{" "}
                        <span className="font-semibold text-slate-700">
                          {executionTitle}
                        </span>
                      </div>
                    ) : null}

                    <div className="mt-2 text-xs text-slate-500">
                      executionId{" "}
                      <span className="font-semibold text-slate-700">
                        {detail.executionId}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-xs font-semibold text-indigo-600">
        추천 이유: {reasonText}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="text-slate-500">→ 예상 영향 KPI:</span>

        {kpiLabels.map((kpi) => (
          <span
            key={kpi}
            className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700"
          >
            {kpi}
          </span>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Priority Change Reason
        </div>

        <p className="mt-2 text-sm font-semibold text-slate-900">
          {priorityChangeReasonLine}
        </p>

        <div className="mt-3">
          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              getRankTrendTone(rankSnapshot?.direction ?? "same"),
            ].join(" ")}
          >
            {getRankTrendLabel(rankSnapshot?.direction ?? "same")}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Priority Trend
        </div>

        <p className="mt-2 text-sm leading-6 text-slate-700">{rankTrendText}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <LearningMetricCard
            label="Previous Rank"
            value={
              rankSnapshot?.previousRank != null
                ? `#${rankSnapshot.previousRank}`
                : "-"
            }
          />
          <LearningMetricCard
            label="Current Rank"
            value={`#${rankSnapshot?.currentRank ?? item.rank}`}
          />
          <LearningMetricCard
            label="Trend"
            value={getRankTrendLabel(rankSnapshot?.direction ?? "same")}
          />
          <LearningMetricCard
            label="Changed At"
            value={formatDateTime(rankSnapshot?.changedAt)}
          />
        </div>

        <div className="mt-3">
          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              getRankTrendTone(rankSnapshot?.direction ?? "same"),
            ].join(" ")}
          >
            {getRankTrendLabel(rankSnapshot?.direction ?? "same")}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Execution Reflection
        </div>

        <p className="mt-2 text-sm leading-6 text-slate-700">
          {executionReflectionText}
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <LearningMetricCard
            label="Latest Execution"
            value={latestExecutionTitle ?? "-"}
          />
          <LearningMetricCard
            label="Latest Result"
            value={
              latestLearningDetail
                ? getDirectionLabel(latestLearningDetail.direction)
                : "-"
            }
          />
          <LearningMetricCard
            label="Current Priority Rank"
            value={`#${item.rank}`}
          />
        </div>

        {latestLearningDetail ? (
          <div className="mt-3">
            <span
              className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                getDirectionTone(latestLearningDetail.direction),
              ].join(" ")}
            >
              {getDirectionLabel(latestLearningDetail.direction)}
            </span>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{item.summary}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs leading-5 text-slate-500">{actionHelperText}</div>

        <button
          type="button"
          onClick={() => onExecute?.(item)}
          className="inline-flex items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {actionButtonText}
        </button>
      </div>
    </article>
  );
});

function PriorityQueueComponent({
  items,
  onExecute,
  learningSummary,
  latestLearningEvaluatedAtByHypothesis,
  learningDetailsByHypothesis,
  executionTitleById,
  rankSnapshotsByHypothesis,
  highlightedHypothesisId,
  recentlyFocusedHypothesisId,
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
            latestLearningEvaluatedAtByHypothesis={
              latestLearningEvaluatedAtByHypothesis
            }
            learningDetailsByHypothesis={learningDetailsByHypothesis}
            executionTitleById={executionTitleById}
            rankSnapshotsByHypothesis={rankSnapshotsByHypothesis}
            highlightedHypothesisId={highlightedHypothesisId}
            recentlyFocusedHypothesisId={recentlyFocusedHypothesisId}
          />
        ))}
      </div>
    </section>
  );
}

export default memo(PriorityQueueComponent);
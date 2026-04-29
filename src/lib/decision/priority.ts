import type { DecisionHypothesis } from "./hypothesis";
import type { HypothesisSimulationResult } from "./simulator";

export type PriorityLearningHistoryItem = {
  executionId: string;
  hypothesisId: string;
  direction: "improved" | "worsened" | "neutral";
  evaluatedAt?: string;
};

export type PriorityLearningTrend =
  | "improving"
  | "weakening"
  | "unstable"
  | "flat";

export type PriorityItem = {
  hypothesisId: string;
  title: string;

  impact: number; // 0~1
  confidence: number; // 0~1 (보정 후 최종 confidence)
  ease: number; // 0~1

  score: number; // impact * confidence * ease

  rank: number;

  summary: string;

  // learning overlay
  baseConfidence?: number;
  learningAdjustment?: number;
  learningSignal?: {
    improvedCount: number;
    worsenedCount: number;
    neutralCount: number;
    totalCount: number;
  };

  recentImprovedCount?: number;
  recentWorsenedCount?: number;
  recentNeutralCount?: number;
  recentLearningCount?: number;
  recentLearningTrend?: PriorityLearningTrend;
  learningTrendStrength?: number;
  learningEvidenceWeight?: number;
  learningDriverLine?: string;
  strategyBridgeLine?: string;
};

type LearningSignal = {
  improvedCount: number;
  worsenedCount: number;
  neutralCount: number;
  totalCount: number;
};

type LearningAdjustmentBreakdown = {
  improvedBonus: number;
  worsenedPenalty: number;
  neutralDamping: number;
  netDirectionalEffect: number;
  evidenceWeight: number;
  rawAdjustment: number;
  cappedAdjustment: number;
};

const LEARNING_WEIGHTS = {
  improvedBonusPerCase: 0.05,
  worsenedPenaltyPerCase: 0.05,
  neutralDampingPerCase: 0.015,
  maxEvidenceCount: 5,
  maxAbsoluteAdjustment: 0.15,
} as const;

const RECENT_LEARNING_LIMIT = 5;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function clampRange(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v <= min) return min;
  if (v >= max) return max;
  return v;
}

function formatPercent(value: number, digits = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  return (safe * 100).toFixed(digits);
}

function resolveLearningTime(item: PriorityLearningHistoryItem): number {
  const time = item.evaluatedAt ? new Date(item.evaluatedAt).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

/**
 * Impact = simulation delta 기반
 * expectedAttainmentRateDelta가 +0.05면 5%p 개선이므로
 * 우선순위 점수 계산용으로 완만하게 scale-up 한다.
 */
function resolveImpact(sim?: HypothesisSimulationResult): number {
  if (!sim) return 0;

  const raw = Math.abs(sim.expectedAttainmentRateDelta);
  return clamp01(raw * 3);
}

/**
 * Confidence = hypothesis 그대로 매핑
 */
function resolveBaseConfidence(
  level: DecisionHypothesis["confidence"],
): number {
  switch (level) {
    case "high":
      return 0.9;
    case "medium":
      return 0.6;
    case "low":
      return 0.3;
    default:
      return 0.5;
  }
}

/**
 * Ease = 실행 난이도 (rule-based)
 * 지금 단계는 실제 오퍼레이션 부담도를 단순 규칙으로 표현한다.
 */
function resolveEase(hypothesis: DecisionHypothesis): number {
  switch (hypothesis.id) {
    case "campaign-reallocation":
      return 0.8; // 바로 실행 가능성이 높음
    case "pace-gap":
      return 0.7;
    case "weekly-deterioration":
    case "weekly-expansion":
      return 0.6;
    case "weekly-stability":
      return 0.5;
    default:
      return 0.5;
  }
}

function buildLearningSignal(
  hypothesisId: string,
  history: PriorityLearningHistoryItem[],
): LearningSignal {
  let improvedCount = 0;
  let worsenedCount = 0;
  let neutralCount = 0;

  for (const item of history) {
    if (item.hypothesisId !== hypothesisId) continue;

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

  const totalCount = improvedCount + worsenedCount + neutralCount;

  return {
    improvedCount,
    worsenedCount,
    neutralCount,
    totalCount,
  };
}

function buildRecentLearningSignal(
  hypothesisId: string,
  history: PriorityLearningHistoryItem[],
  limit = RECENT_LEARNING_LIMIT,
): LearningSignal {
  const recent = history
    .filter((item) => item.hypothesisId === hypothesisId)
    .slice()
    .sort((a, b) => resolveLearningTime(b) - resolveLearningTime(a))
    .slice(0, limit);

  let improvedCount = 0;
  let worsenedCount = 0;
  let neutralCount = 0;

  for (const item of recent) {
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
    totalCount: recent.length,
  };
}

function resolveLearningTrendMeta(signal: LearningSignal): {
  recentLearningTrend: PriorityLearningTrend;
  learningTrendStrength: number;
} {
  if (!signal.totalCount) {
    return {
      recentLearningTrend: "flat",
      learningTrendStrength: 0,
    };
  }

  const net = signal.improvedCount - signal.worsenedCount;
  const absNet = Math.abs(net);
  const hasMixedSignals =
    signal.improvedCount > 0 && signal.worsenedCount > 0;

  const sampleStrength = clamp01(signal.totalCount / RECENT_LEARNING_LIMIT);
  const directionalStrength = clamp01(absNet / signal.totalCount);
  const learningTrendStrength = clampRange(
    directionalStrength * 0.75 + sampleStrength * 0.25,
    0,
    1,
  );

  if (hasMixedSignals && absNet <= 1) {
    return {
      recentLearningTrend: "unstable",
      learningTrendStrength,
    };
  }

  if (
    signal.improvedCount >= 2 &&
    signal.improvedCount > signal.worsenedCount &&
    directionalStrength >= 0.34
  ) {
    return {
      recentLearningTrend: "improving",
      learningTrendStrength,
    };
  }

  if (
    signal.worsenedCount >= 2 &&
    signal.worsenedCount > signal.improvedCount &&
    directionalStrength >= 0.34
  ) {
    return {
      recentLearningTrend: "weakening",
      learningTrendStrength,
    };
  }

  if (
    signal.neutralCount >= Math.max(signal.improvedCount, signal.worsenedCount)
  ) {
    return {
      recentLearningTrend: "flat",
      learningTrendStrength,
    };
  }

  if (net > 0) {
    return {
      recentLearningTrend: "improving",
      learningTrendStrength,
    };
  }

  if (net < 0) {
    return {
      recentLearningTrend: "weakening",
      learningTrendStrength,
    };
  }

  return {
    recentLearningTrend: "flat",
    learningTrendStrength,
  };
}

/**
 * execution learning history를 confidence 보정으로만 안전하게 반영한다.
 *
 * 핵심 원칙:
 * - improved: confidence 가산
 * - worsened: confidence 감산
 * - neutral: 순방향/역방향 효과를 모두 완만하게 깎는 damping
 * - evidenceWeight: 학습 건수가 적을 때 반영량을 축소
 * - maxAbsoluteAdjustment: 기존 추천 구조를 흔들지 않도록 최종 보정폭 제한
 *
 * 이렇게 분리하면 이후 UI에서도
 * "왜 순위가 바뀌었는지"를 구조적으로 설명할 수 있다.
 */
function resolveLearningAdjustmentBreakdown(
  signal: LearningSignal,
): LearningAdjustmentBreakdown {
  if (!signal.totalCount) {
    return {
      improvedBonus: 0,
      worsenedPenalty: 0,
      neutralDamping: 0,
      netDirectionalEffect: 0,
      evidenceWeight: 0,
      rawAdjustment: 0,
      cappedAdjustment: 0,
    };
  }

  const improvedBonus =
    signal.improvedCount * LEARNING_WEIGHTS.improvedBonusPerCase;

  const worsenedPenalty =
    signal.worsenedCount * LEARNING_WEIGHTS.worsenedPenaltyPerCase;

  const directionalDelta = improvedBonus - worsenedPenalty;

  /**
   * neutral은 방향성 자체를 만들지 않는다.
   * 대신 "이 hypothesis의 실행 결과가 뚜렷하게 좋거나 나빴다고 단정하기 어려움"을 뜻하므로
   * 순방향/역방향 효과를 모두 damping 한다.
   *
   * ex) improved 2 / worsened 0 / neutral 2 이면
   * 순가산 효과는 남기되, neutral 수만큼 그 효과를 일부 상쇄한다.
   */
  const directionalSign =
    directionalDelta > 0 ? 1 : directionalDelta < 0 ? -1 : 0;

  const neutralDampingMagnitude =
    signal.neutralCount * LEARNING_WEIGHTS.neutralDampingPerCase;

  const neutralDamping = directionalSign * neutralDampingMagnitude;

  const netDirectionalEffect = directionalDelta - neutralDamping;

  /**
   * 학습 건수가 너무 적으면 결과를 과신하지 않도록 반영량을 축소한다.
   * 1건이면 20%, 3건이면 60%, 5건 이상이면 100%.
   */
  const evidenceWeight = clamp01(
    signal.totalCount / LEARNING_WEIGHTS.maxEvidenceCount,
  );

  const rawAdjustment = netDirectionalEffect * evidenceWeight;

  const cappedAdjustment = clampRange(
    rawAdjustment,
    -LEARNING_WEIGHTS.maxAbsoluteAdjustment,
    LEARNING_WEIGHTS.maxAbsoluteAdjustment,
  );

  return {
    improvedBonus,
    worsenedPenalty,
    neutralDamping,
    netDirectionalEffect,
    evidenceWeight,
    rawAdjustment,
    cappedAdjustment,
  };
}

function resolveLearningAdjustment(signal: LearningSignal): number {
  return resolveLearningAdjustmentBreakdown(signal).cappedAdjustment;
}

function resolveHypothesisLabel(hypothesisId: string): string {
  switch (hypothesisId) {
    case "campaign-reallocation":
      return "캠페인 기여도 검증";
    case "weekly-expansion":
      return "최근 주차 강세 검증";
    case "weekly-deterioration":
      return "최근 주차 하락 보정";
    case "weekly-stability":
      return "주차 안정성 검증";
    case "pace-hold":
      return "초과 달성 유지";
    case "pace-gap":
      return "목표 pace 보정";
    case "fallback-structure":
      return "성과 유지 구조 검증";
    default:
      return "현재 가설";
  }
}

function buildLearningDriverLine(args: {
  recentSignal: LearningSignal;
  recentLearningTrend: PriorityLearningTrend;
  learningTrendStrength: number;
  learningAdjustment: number;
}): string {
  const {
    recentSignal,
    recentLearningTrend,
    learningTrendStrength,
    learningAdjustment,
  } = args;

  if (!recentSignal.totalCount) {
    return "아직 execution 기반 learning 표본이 없어, 현재 Priority는 가설의 기본 impact / confidence / ease 기준으로만 판단 중입니다.";
  }

  const strengthLabel =
    learningTrendStrength >= 0.7
      ? "강하게"
      : learningTrendStrength >= 0.45
        ? "분명하게"
        : "완만하게";

  if (recentLearningTrend === "improving") {
    return `최근 ${recentSignal.totalCount}건 learning에서 improved ${recentSignal.improvedCount} / worsened ${recentSignal.worsenedCount} / neutral ${recentSignal.neutralCount}로 개선 추세가 ${strengthLabel} 누적되어 confidence 보정 ${learningAdjustment >= 0 ? "+" : ""}${formatPercent(learningAdjustment, 0)}가 반영되었습니다.`;
  }

  if (recentLearningTrend === "weakening") {
    return `최근 ${recentSignal.totalCount}건 learning에서 worsened ${recentSignal.worsenedCount} / improved ${recentSignal.improvedCount} / neutral ${recentSignal.neutralCount}로 악화 추세가 ${strengthLabel} 누적되어 confidence 보정 ${formatPercent(learningAdjustment, 0)}가 반영되었습니다.`;
  }

  if (recentLearningTrend === "unstable") {
    return `최근 ${recentSignal.totalCount}건 learning에서 improved ${recentSignal.improvedCount}와 worsened ${recentSignal.worsenedCount}가 함께 섞여 있어, 우선순위는 급격히 바꾸기보다 부분 검증과 관찰 성격이 강화되었습니다.`;
  }

  return `최근 ${recentSignal.totalCount}건 learning에서 neutral ${recentSignal.neutralCount} 비중이 높아, 강한 방향 전환보다 추가 검증이 필요한 상태로 판단했습니다.`;
}

function buildStrategyBridgeLine(args: {
  hypothesisId: string;
  impact: number;
  confidence: number;
  ease: number;
  recentLearningTrend: PriorityLearningTrend;
  learningTrendStrength: number;
  recentSignal: LearningSignal;
}): string {
  const {
    hypothesisId,
    impact,
    confidence,
    ease,
    recentLearningTrend,
    learningTrendStrength,
    recentSignal,
  } = args;

  const label = resolveHypothesisLabel(hypothesisId);

  if (!recentSignal.totalCount) {
    if (impact >= 0.5 && confidence >= 0.45 && ease >= 0.45) {
      return `${label} 가설은 Priority 단계에서 실행 후보 강도는 충분하지만, 아직 execution 검증 데이터가 없어 Strategy 단계에서는 강한 실행보다 observe 또는 소규모 검증이 더 안전합니다.`;
    }

    return `${label} 가설은 Priority 단계에서 기본 후보로 유지되지만, Strategy 단계에서는 추가 execution 표본 확보 전 observe 중심 설명이 더 자연스럽습니다.`;
  }

  if (
    recentLearningTrend === "improving" &&
    learningTrendStrength >= 0.45
  ) {
    if (impact >= 0.5 && confidence >= 0.45 && ease >= 0.45) {
      return `${label} 가설은 최근 learning에서 긍정 신호가 누적되어, Strategy 단계에서는 observe를 넘어 optimize 또는 제한적 확장 검토 근거가 강해집니다.`;
    }

    return `${label} 가설은 긍정 learning이 누적되고 있으나 impact/ease 강도가 아직 제한적이어서, Strategy 단계에서는 부분 optimize 관점이 더 자연스럽습니다.`;
  }

  if (
    recentLearningTrend === "weakening" &&
    learningTrendStrength >= 0.4
  ) {
    return `${label} 가설은 최근 learning에서 약화 신호가 확인되어, Priority 후보로 남아 있어도 Strategy 단계에서는 review 중심 접근이 더 안전합니다.`;
  }

  if (recentLearningTrend === "unstable") {
    return `${label} 가설은 learning 결과가 혼재되어 있어, Priority 단계에서는 급격한 강등보다 유지가 가능하지만 Strategy 단계에서는 observe 또는 부분 검증이 우선입니다.`;
  }

  return `${label} 가설은 아직 뚜렷한 learning 방향성이 없어, Strategy 단계에서는 추가 execution 누적 전 observe 중심 설명이 더 자연스럽습니다.`;
}

function buildSummary(args: {
  title: string;
  impact: number;
  confidence: number;
  ease: number;
  learningAdjustment: number;
  learningSignal: LearningSignal;
  recentSignal: LearningSignal;
  recentLearningTrend: PriorityLearningTrend;
  learningTrendStrength: number;
}): string {
  const {
    title,
    impact,
    confidence,
    ease,
    learningAdjustment,
    learningSignal,
    recentSignal,
    recentLearningTrend,
    learningTrendStrength,
  } = args;

  const baseText = `${title}는 Impact ${formatPercent(
    impact,
    1,
  )} / Confidence ${formatPercent(
    confidence,
    0,
  )} / Ease ${formatPercent(
    ease,
    0,
  )} 수준으로, 현재 우선순위 판단 기준에 포함됩니다.`;

  if (!learningSignal.totalCount) {
    return `${baseText} 아직 누적 실행 학습 데이터는 반영되지 않아, 현재 판단은 가설 기반 점수 중심입니다.`;
  }

  const adjustmentLabel =
    learningAdjustment > 0
      ? `학습 보정 +${formatPercent(learningAdjustment, 0)}`
      : learningAdjustment < 0
        ? `학습 보정 ${formatPercent(learningAdjustment, 0)}`
        : "학습 보정 0";

  const recentTrendText =
    recentSignal.totalCount > 0
      ? ` 최근 ${recentSignal.totalCount}건 기준 ${recentLearningTrend} 추세(${formatPercent(
          learningTrendStrength,
          0,
        )} 강도)가 함께 반영되었습니다.`
      : "";

  return `${baseText} 과거 실행 결과 기준 improved ${learningSignal.improvedCount}건 / worsened ${learningSignal.worsenedCount}건 / neutral ${learningSignal.neutralCount}건이 반영되어 ${adjustmentLabel}가 적용되었습니다.${recentTrendText}`;
}

export function buildPriorityQueue(
  hypotheses: DecisionHypothesis[],
  simulations: HypothesisSimulationResult[],
  learningHistory: PriorityLearningHistoryItem[] = [],
): PriorityItem[] {
  const simulationMap = new Map(
    simulations.map((simulation) => [simulation.hypothesisId, simulation]),
  );

  const items: PriorityItem[] = hypotheses.map((hypothesis) => {
    const simulation = simulationMap.get(hypothesis.id);

    const impact = resolveImpact(simulation);
    const baseConfidence = resolveBaseConfidence(hypothesis.confidence);
    const ease = resolveEase(hypothesis);

    const learningSignal = buildLearningSignal(hypothesis.id, learningHistory);
    const recentSignal = buildRecentLearningSignal(
      hypothesis.id,
      learningHistory,
      RECENT_LEARNING_LIMIT,
    );
    const learningAdjustmentBreakdown =
      resolveLearningAdjustmentBreakdown(learningSignal);
    const learningAdjustment = learningAdjustmentBreakdown.cappedAdjustment;
    const confidence = clamp01(baseConfidence + learningAdjustment);

    const {
      recentLearningTrend,
      learningTrendStrength,
    } = resolveLearningTrendMeta(recentSignal);

    const score = impact * confidence * ease;

    return {
      hypothesisId: hypothesis.id,
      title: hypothesis.title,
      impact,
      confidence,
      ease,
      score,
      rank: 0,
      summary: buildSummary({
        title: hypothesis.title,
        impact,
        confidence,
        ease,
        learningAdjustment,
        learningSignal,
        recentSignal,
        recentLearningTrend,
        learningTrendStrength,
      }),
      baseConfidence,
      learningAdjustment,
      learningSignal,
      recentImprovedCount: recentSignal.improvedCount,
      recentWorsenedCount: recentSignal.worsenedCount,
      recentNeutralCount: recentSignal.neutralCount,
      recentLearningCount: recentSignal.totalCount,
      recentLearningTrend,
      learningTrendStrength,
      learningEvidenceWeight: learningAdjustmentBreakdown.evidenceWeight,
      learningDriverLine: buildLearningDriverLine({
        recentSignal,
        recentLearningTrend,
        learningTrendStrength,
        learningAdjustment,
      }),
      strategyBridgeLine: buildStrategyBridgeLine({
        hypothesisId: hypothesis.id,
        impact,
        confidence,
        ease,
        recentLearningTrend,
        learningTrendStrength,
        recentSignal,
      }),
    };
  });

  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.impact !== a.impact) return b.impact - a.impact;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.ease - a.ease;
  });

  return sorted.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}
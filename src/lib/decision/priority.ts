import type { DecisionHypothesis } from "./hypothesis";
import type { HypothesisSimulationResult } from "./simulator";

export type PriorityLearningHistoryItem = {
  executionId: string;
  hypothesisId: string;
  direction: "improved" | "worsened" | "neutral";
  evaluatedAt?: string;
};

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
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function formatPercent(value: number, digits = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  return (safe * 100).toFixed(digits);
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
) {
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

/**
 * learningAdjustment는 confidence에만 미세 보정으로 반영한다.
 * - improved 누적이 많을수록 소폭 가산
 * - worsened 누적이 많을수록 소폭 감산
 * - neutral은 직접 보정보다는 totalCount만 늘려 과도한 변동을 줄임
 *
 * 범위를 작게 제한해서 기존 추천 구조를 절대 깨지 않도록 한다.
 */
function resolveLearningAdjustment(signal: {
  improvedCount: number;
  worsenedCount: number;
  neutralCount: number;
  totalCount: number;
}): number {
  if (!signal.totalCount) return 0;

  const net = signal.improvedCount - signal.worsenedCount;

  /**
   * 1건당 0.05 수준으로 보정하되,
   * 최대 ±0.15에서 고정하여 base confidence를 과도하게 흔들지 않는다.
   */
  const rawAdjustment = net * 0.05;

  if (rawAdjustment > 0.15) return 0.15;
  if (rawAdjustment < -0.15) return -0.15;
  return rawAdjustment;
}

function buildSummary(args: {
  title: string;
  impact: number;
  confidence: number;
  ease: number;
  learningAdjustment: number;
  learningSignal: {
    improvedCount: number;
    worsenedCount: number;
    neutralCount: number;
    totalCount: number;
  };
}): string {
  const {
    title,
    impact,
    confidence,
    ease,
    learningAdjustment,
    learningSignal,
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
  )} 수준으로, 즉시 실행 우선순위 판단 기준에서 높은 점수를 갖습니다.`;

  if (!learningSignal.totalCount) {
    return `${baseText} 아직 누적 실행 학습 데이터는 반영되지 않았습니다.`;
  }

  const adjustmentLabel =
    learningAdjustment > 0
      ? `학습 보정 +${formatPercent(learningAdjustment, 0)}`
      : learningAdjustment < 0
        ? `학습 보정 ${formatPercent(learningAdjustment, 0)}`
        : "학습 보정 0";

  return `${baseText} 과거 실행 결과 기준 improved ${learningSignal.improvedCount}건 / worsened ${learningSignal.worsenedCount}건 / neutral ${learningSignal.neutralCount}건이 반영되어 ${adjustmentLabel}가 적용되었습니다.`;
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
    const learningAdjustment = resolveLearningAdjustment(learningSignal);
    const confidence = clamp01(baseConfidence + learningAdjustment);

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
      }),
      baseConfidence,
      learningAdjustment,
      learningSignal,
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
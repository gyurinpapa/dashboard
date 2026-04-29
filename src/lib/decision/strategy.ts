// src/lib/decision/strategy.ts

import type { GoalSnapshot } from "./types";
import type { PriorityItem } from "./priority";
import type { ExecutionItem } from "./execution";
import type { ExecutionEvaluation } from "@/app/components/decision/ExecutionLog";
import type { PriorityRankSnapshot } from "@/app/components/decision/PriorityQueue";

export type StrategyBucketKey = "expand" | "optimize" | "review" | "observe";

export type StrategySeverity = "critical" | "high" | "medium" | "low";

export type StrategyDriver =
  | "rank_up"
  | "positive_learning"
  | "negative_learning"
  | "high_impact_low_confidence"
  | "neutral_observation"
  | "stable_priority"
  | "new_priority"
  | "execution_improved"
  | "execution_worsened"
  | "execution_neutral";

export type StrategyActionType = "scale" | "tune" | "pause" | "monitor";

export type RecentExecutionTrend =
  | "improving"
  | "weakening"
  | "unstable"
  | "flat";

export type StrategyItem = {
  hypothesisId: string;
  title: string;
  score: number;
  rank: number;
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
  rankSnapshot?: PriorityRankSnapshot;
  severity: StrategySeverity;
  driver: StrategyDriver;
  actionType: StrategyActionType;
  actionPriority: number;
  metricType: string;
  latestExecution?: {
    executionId: string;
    status: string;
    targetMetric: string;
    updatedAt?: string;
  };
  latestExecutionEvaluation?: {
    direction: "improved" | "worsened" | "neutral";
    currentValue: number;
    diffValue: number;
    diffRate: number;
  };
  recentImprovedCount?: number;
  recentWorsenedCount?: number;
  recentNeutralCount?: number;
  recentExecutionCount?: number;
  recentExecutionTrend?: RecentExecutionTrend;
  trendStrength?: number;
  reasonLine: string;
  actionLine: string;
  riskLine: string;
};

export type StrategyBucket = {
  key: StrategyBucketKey;
  title: string;
  description: string;
  items: StrategyItem[];
};

export type StrategyPlaybook = {
  buckets: StrategyBucket[];
};

type HypothesisContextKey =
  | "campaign_reallocation"
  | "weekly_expansion"
  | "creative_refresh"
  | "keyword_tuning"
  | "channel_mix"
  | "general";

const RECENT_EXECUTION_LIMIT = 5;

function toSafeNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getLearningSignal(item: PriorityItem) {
  return {
    improvedCount: item.learningSignal?.improvedCount ?? 0,
    worsenedCount: item.learningSignal?.worsenedCount ?? 0,
    neutralCount: item.learningSignal?.neutralCount ?? 0,
    totalCount: item.learningSignal?.totalCount ?? 0,
  };
}

function getTrendDirection(snapshot?: PriorityRankSnapshot) {
  return snapshot?.direction ?? "same";
}

function resolveMetricType(item: PriorityItem): string {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  if (text.includes("roas")) return "ROAS";
  if (text.includes("cpa")) return "CPA";
  if (text.includes("cpc")) return "CPC";
  if (text.includes("ctr")) return "CTR";
  if (text.includes("cvr")) return "CVR";
  if (text.includes("conversion") || text.includes("전환")) return "CONVERSIONS";
  if (text.includes("revenue") || text.includes("매출")) return "REVENUE";
  if (text.includes("click") || text.includes("클릭")) return "CLICKS";
  if (text.includes("impression") || text.includes("노출")) return "IMPRESSIONS";

  return "GENERAL";
}

function resolveHypothesisContext(item: PriorityItem): HypothesisContextKey {
  const id = String(item.hypothesisId || "").toLowerCase();
  const text = `${item.title} ${item.summary}`.toLowerCase();

  if (
    id.includes("campaign-reallocation") ||
    id.includes("campaign_reallocation") ||
    text.includes("캠페인 재배분") ||
    (text.includes("campaign") && text.includes("reallocation"))
  ) {
    return "campaign_reallocation";
  }

  if (
    id.includes("weekly-expansion") ||
    id.includes("weekly_expansion") ||
    text.includes("주차 확장") ||
    (text.includes("week") && text.includes("expansion"))
  ) {
    return "weekly_expansion";
  }

  if (
    id.includes("creative") ||
    text.includes("소재") ||
    text.includes("creative")
  ) {
    return "creative_refresh";
  }

  if (
    id.includes("keyword") ||
    text.includes("키워드") ||
    text.includes("keyword")
  ) {
    return "keyword_tuning";
  }

  if (
    id.includes("channel") ||
    text.includes("채널") ||
    text.includes("매체") ||
    text.includes("channel")
  ) {
    return "channel_mix";
  }

  return "general";
}

function buildLatestExecutionMap(
  executionItems: ExecutionItem[] = [],
): Record<string, ExecutionItem | undefined> {
  const result: Record<string, ExecutionItem | undefined> = {};

  for (const item of executionItems) {
    const current = result[item.hypothesisId];
    if (!current) {
      result[item.hypothesisId] = item;
      continue;
    }

    const currentTime = current.updatedAt ? new Date(current.updatedAt).getTime() : NaN;
    const nextTime = item.updatedAt ? new Date(item.updatedAt).getTime() : NaN;

    if (Number.isNaN(currentTime) && !Number.isNaN(nextTime)) {
      result[item.hypothesisId] = item;
      continue;
    }

    if (
      !Number.isNaN(currentTime) &&
      !Number.isNaN(nextTime) &&
      nextTime > currentTime
    ) {
      result[item.hypothesisId] = item;
      continue;
    }

    if (Number.isNaN(currentTime) && Number.isNaN(nextTime)) {
      if (String(item.updatedAt || "") > String(current.updatedAt || "")) {
        result[item.hypothesisId] = item;
      }
    }
  }

  return result;
}

function resolveExecutionTime(item: ExecutionItem): number {
  const value = item.updatedAt ? new Date(item.updatedAt).getTime() : NaN;
  return Number.isFinite(value) ? value : 0;
}

function buildRecentExecutionTrendMap(args: {
  executionItems?: ExecutionItem[];
  executionEvaluations?: Record<string, ExecutionEvaluation>;
  limit?: number;
}): Record<
  string,
  {
    recentImprovedCount: number;
    recentWorsenedCount: number;
    recentNeutralCount: number;
    recentExecutionCount: number;
    recentExecutionTrend: RecentExecutionTrend;
    trendStrength: number;
  }
> {
  const {
    executionItems = [],
    executionEvaluations = {},
    limit = RECENT_EXECUTION_LIMIT,
  } = args;

  const grouped: Record<string, ExecutionItem[]> = {};

  for (const item of executionItems) {
    if (!item.hypothesisId) continue;
    if (item.status !== "done") continue;

    if (!grouped[item.hypothesisId]) {
      grouped[item.hypothesisId] = [];
    }

    grouped[item.hypothesisId].push(item);
  }

  const result: Record<
    string,
    {
      recentImprovedCount: number;
      recentWorsenedCount: number;
      recentNeutralCount: number;
      recentExecutionCount: number;
      recentExecutionTrend: RecentExecutionTrend;
      trendStrength: number;
    }
  > = {};

  for (const hypothesisId of Object.keys(grouped)) {
    const recentItems = grouped[hypothesisId]
      .slice()
      .sort((a, b) => resolveExecutionTime(b) - resolveExecutionTime(a))
      .slice(0, limit);

    let recentImprovedCount = 0;
    let recentWorsenedCount = 0;
    let recentNeutralCount = 0;

    for (const item of recentItems) {
      const evaluation = executionEvaluations[item.executionId];

      if (!evaluation || evaluation.direction === "neutral") {
        recentNeutralCount += 1;
        continue;
      }

      if (evaluation.direction === "improved") {
        recentImprovedCount += 1;
        continue;
      }

      recentWorsenedCount += 1;
    }

    const recentExecutionCount =
      recentImprovedCount + recentWorsenedCount + recentNeutralCount;

    const net = recentImprovedCount - recentWorsenedCount;
    const absNet = Math.abs(net);
    const sampleStrength =
      recentExecutionCount > 0
        ? clamp(recentExecutionCount / limit, 0, 1)
        : 0;
    const directionalStrength =
      recentExecutionCount > 0
        ? clamp(absNet / recentExecutionCount, 0, 1)
        : 0;

    const trendStrength = clamp(
      directionalStrength * 0.75 + sampleStrength * 0.25,
      0,
      1,
    );

    let recentExecutionTrend: RecentExecutionTrend = "flat";

    const hasMixedSignals =
      recentImprovedCount > 0 && recentWorsenedCount > 0;

    if (recentExecutionCount === 0) {
      recentExecutionTrend = "flat";
    } else if (hasMixedSignals && absNet <= 1) {
      recentExecutionTrend = "unstable";
    } else if (
      recentImprovedCount >= 2 &&
      recentImprovedCount > recentWorsenedCount &&
      directionalStrength >= 0.34
    ) {
      recentExecutionTrend = "improving";
    } else if (
      recentWorsenedCount >= 2 &&
      recentWorsenedCount > recentImprovedCount &&
      directionalStrength >= 0.34
    ) {
      recentExecutionTrend = "weakening";
    } else if (
      recentNeutralCount >= Math.max(recentImprovedCount, recentWorsenedCount)
    ) {
      recentExecutionTrend = "flat";
    } else if (net > 0) {
      recentExecutionTrend = "improving";
    } else if (net < 0) {
      recentExecutionTrend = "weakening";
    } else {
      recentExecutionTrend = "flat";
    }

    result[hypothesisId] = {
      recentImprovedCount,
      recentWorsenedCount,
      recentNeutralCount,
      recentExecutionCount,
      recentExecutionTrend,
      trendStrength,
    };
  }

  return result;
}

function getRecentExecutionTrendMeta(
  hypothesisId: string,
  recentTrendByHypothesis: Record<
    string,
    {
      recentImprovedCount: number;
      recentWorsenedCount: number;
      recentNeutralCount: number;
      recentExecutionCount: number;
      recentExecutionTrend: RecentExecutionTrend;
      trendStrength: number;
    }
  >,
) {
  return (
    recentTrendByHypothesis[hypothesisId] ?? {
      recentImprovedCount: 0,
      recentWorsenedCount: 0,
      recentNeutralCount: 0,
      recentExecutionCount: 0,
      recentExecutionTrend: "flat" as RecentExecutionTrend,
      trendStrength: 0,
    }
  );
}

function resolveBucketKey(args: {
  item: PriorityItem;
  rankSnapshot?: PriorityRankSnapshot;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
  recentImprovedCount: number;
  recentWorsenedCount: number;
  recentExecutionCount: number;
  goalSnapshot?: GoalSnapshot;
}): StrategyBucketKey {
  const {
    item,
    rankSnapshot,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
    recentImprovedCount,
    recentWorsenedCount,
    recentExecutionCount,
    goalSnapshot,
  } = args;

  const signal = getLearningSignal(item);
  const improved = signal.improvedCount;
  const worsened = signal.worsenedCount;
  const neutral = signal.neutralCount;
  const trend = getTrendDirection(rankSnapshot);

  const isAhead = goalSnapshot?.pacingStatus === "ahead";
  const hasNoGap = (goalSnapshot?.gapValue ?? 0) <= 0;
  const hasNoRecentExecution =
    recentExecutionCount <= 0 && !latestExecutionEvaluation;
  const isEarlyCandidate =
    trend === "new" || trend === "same" || recentExecutionTrend === "flat";

  if (
    hasNoRecentExecution &&
    isAhead &&
    hasNoGap &&
    isEarlyCandidate
  ) {
    return "observe";
  }

  if (
    latestExecutionEvaluation?.direction === "improved" &&
    (
      trend === "up" ||
      trend === "new" ||
      item.score >= 0.2 ||
      (recentExecutionTrend === "improving" && trendStrength >= 0.45)
    )
  ) {
    return "expand";
  }

  if (
    latestExecutionEvaluation?.direction === "worsened" ||
    trend === "down" ||
    worsened > improved ||
    (recentExecutionTrend === "weakening" && trendStrength >= 0.4)
  ) {
    return "review";
  }

  if (
    recentExecutionTrend === "unstable" &&
    recentExecutionCount >= 3 &&
    trendStrength >= 0.4
  ) {
    return "review";
  }

  if (
    latestExecutionEvaluation?.direction === "neutral" ||
    recentExecutionTrend === "flat" ||
    (neutral >= improved && neutral >= worsened)
  ) {
    return "observe";
  }

  if (
    item.impact >= 0.5 &&
    item.confidence >= 0.45 &&
    item.ease >= 0.45 &&
    recentExecutionTrend !== "weakening"
  ) {
    return "optimize";
  }

  if (
    (trend === "up" || trend === "new" || recentExecutionTrend === "improving") &&
    improved >= worsened &&
    recentImprovedCount >= recentWorsenedCount &&
    item.score >= 0.18
  ) {
    return "expand";
  }

  if (recentWorsenedCount > recentImprovedCount) {
    return "review";
  }

  return "observe";
}

function resolveDriver(args: {
  item: PriorityItem;
  rankSnapshot?: PriorityRankSnapshot;
  bucketKey: StrategyBucketKey;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
  recentExecutionCount: number;
}): StrategyDriver {
  const {
    item,
    rankSnapshot,
    bucketKey,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
    recentExecutionCount,
  } = args;

  const signal = getLearningSignal(item);
  const trend = getTrendDirection(rankSnapshot);

  if (latestExecutionEvaluation?.direction === "improved") {
    return "execution_improved";
  }

  if (latestExecutionEvaluation?.direction === "worsened") {
    return "execution_worsened";
  }

  if (latestExecutionEvaluation?.direction === "neutral") {
    return "execution_neutral";
  }

  if (
    recentExecutionCount >= 2 &&
    recentExecutionTrend === "improving" &&
    trendStrength >= 0.35
  ) {
    return "positive_learning";
  }

  if (
    recentExecutionCount >= 2 &&
    recentExecutionTrend === "weakening" &&
    trendStrength >= 0.35
  ) {
    return "negative_learning";
  }

  if (
    recentExecutionCount >= 2 &&
    (recentExecutionTrend === "unstable" || recentExecutionTrend === "flat")
  ) {
    return "neutral_observation";
  }

  if (trend === "new") return "new_priority";
  if (trend === "up") return "rank_up";
  if (signal.improvedCount > signal.worsenedCount) return "positive_learning";

  if (signal.worsenedCount > signal.improvedCount) {
    return "negative_learning";
  }

  if (
    bucketKey === "optimize" &&
    item.impact >= 0.5 &&
    item.confidence < 0.65
  ) {
    return "high_impact_low_confidence";
  }

  if (bucketKey === "observe") return "neutral_observation";

  return "stable_priority";
}

function resolveSeverity(args: {
  item: PriorityItem;
  rankSnapshot?: PriorityRankSnapshot;
  bucketKey: StrategyBucketKey;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
  recentWorsenedCount: number;
  recentExecutionCount: number;
}): StrategySeverity {
  const {
    item,
    rankSnapshot,
    bucketKey,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
    recentWorsenedCount,
    recentExecutionCount,
  } = args;

  const signal = getLearningSignal(item);
  const trend = getTrendDirection(rankSnapshot);

  if (
    latestExecutionEvaluation?.direction === "worsened" &&
    (bucketKey === "review" || item.confidence < 0.45)
  ) {
    return "critical";
  }

  if (
    recentExecutionTrend === "weakening" &&
    recentExecutionCount >= 2 &&
    trendStrength >= 0.55 &&
    (bucketKey === "review" || item.confidence < 0.5)
  ) {
    return "critical";
  }

  if (
    bucketKey === "review" &&
    (
      trend === "down" ||
      signal.worsenedCount >= 2 ||
      recentWorsenedCount >= 2 ||
      item.confidence < 0.4
    )
  ) {
    return "critical";
  }

  if (
    recentExecutionTrend === "unstable" &&
    recentExecutionCount >= 3 &&
    trendStrength >= 0.45
  ) {
    return "high";
  }

  if (
    latestExecutionEvaluation?.direction === "improved" &&
    item.score >= 0.24
  ) {
    return "high";
  }

  if (
    bucketKey === "expand" &&
    (
      (item.score >= 0.28 && (trend === "up" || trend === "new")) ||
      (recentExecutionTrend === "improving" && trendStrength >= 0.45)
    )
  ) {
    return "high";
  }

  if (bucketKey === "optimize" && item.impact >= 0.65) {
    return "high";
  }

  if (bucketKey === "review") {
    return "high";
  }

  if (bucketKey === "expand" || bucketKey === "optimize") {
    return "medium";
  }

  return "low";
}

function resolveActionType(bucketKey: StrategyBucketKey): StrategyActionType {
  if (bucketKey === "expand") return "scale";
  if (bucketKey === "optimize") return "tune";
  if (bucketKey === "review") return "pause";
  return "monitor";
}

function resolveActionPriority(args: {
  item: PriorityItem;
  bucketKey: StrategyBucketKey;
  severity: StrategySeverity;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
  recentExecutionCount: number;
}): number {
  const {
    item,
    bucketKey,
    severity,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
    recentExecutionCount,
  } = args;

  const severityWeight =
    severity === "critical"
      ? 400
      : severity === "high"
        ? 300
        : severity === "medium"
          ? 200
          : 100;

  const bucketWeight =
    bucketKey === "review"
      ? 40
      : bucketKey === "expand"
        ? 30
        : bucketKey === "optimize"
          ? 20
          : 10;

  const executionWeight =
    latestExecutionEvaluation?.direction === "worsened"
      ? 35
      : latestExecutionEvaluation?.direction === "improved"
        ? 25
        : latestExecutionEvaluation?.direction === "neutral"
          ? 10
          : 0;

  const trendWeight =
    recentExecutionCount <= 0
      ? 0
      : recentExecutionTrend === "weakening"
        ? Math.round(18 * trendStrength)
        : recentExecutionTrend === "improving"
          ? Math.round(14 * trendStrength)
          : recentExecutionTrend === "unstable"
            ? Math.round(10 * trendStrength)
            : Math.round(4 * trendStrength);

  const scoreWeight = Math.round(item.score * 100);

  return severityWeight + bucketWeight + executionWeight + trendWeight + scoreWeight;
}

function buildTrendReasonFragment(args: {
  recentImprovedCount: number;
  recentWorsenedCount: number;
  recentNeutralCount: number;
  recentExecutionCount: number;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
}) {
  const {
    recentImprovedCount,
    recentWorsenedCount,
    recentNeutralCount,
    recentExecutionCount,
    recentExecutionTrend,
    trendStrength,
  } = args;

  if (recentExecutionCount <= 0) {
    return "최근 execution 누적 표본이 아직 없어 단일 최신 신호와 현재 priority 상태를 중심으로 판단했습니다.";
  }

  const strengthText =
    trendStrength >= 0.7
      ? "강하게"
      : trendStrength >= 0.45
        ? "분명하게"
        : "완만하게";

  if (recentExecutionTrend === "improving") {
    return `최근 ${recentExecutionCount}건 execution에서 improved ${recentImprovedCount} / worsened ${recentWorsenedCount} / neutral ${recentNeutralCount}로 개선 추세가 ${strengthText} 누적되어 있습니다.`;
  }

  if (recentExecutionTrend === "weakening") {
    return `최근 ${recentExecutionCount}건 execution에서 worsened ${recentWorsenedCount} / improved ${recentImprovedCount} / neutral ${recentNeutralCount}로 악화 추세가 ${strengthText} 누적되어 있습니다.`;
  }

  if (recentExecutionTrend === "unstable") {
    return `최근 ${recentExecutionCount}건 execution에서 improved ${recentImprovedCount}와 worsened ${recentWorsenedCount}가 함께 섞여 있어 추세가 아직 불안정합니다.`;
  }

  return `최근 ${recentExecutionCount}건 execution에서 neutral ${recentNeutralCount} 비중이 높아 아직 추세가 평평한 상태입니다.`;
}

function buildPriorityBridgePrefix(item: PriorityItem): string {
  const line = String(item.strategyBridgeLine || "").trim();
  if (!line) return "";

  if (line.startsWith("Priority 단계에서는")) {
    return `${line} `;
  }

  return `Priority 단계에서는 ${line} `;
}

function buildObserveReasonTail(args: {
  context: HypothesisContextKey;
  item: PriorityItem;
  goalSnapshot?: GoalSnapshot;
}) {
  const { context, item, goalSnapshot } = args;
  const metricLabel = item.title;

  if (
    goalSnapshot?.pacingStatus === "ahead" &&
    (goalSnapshot?.gapValue ?? 0) <= 0
  ) {
    if (context === "campaign_reallocation") {
      return "현재는 목표 pace가 이미 앞서 있으므로, 캠페인 간 예산 재배분을 바로 강하게 적용하기보다 어떤 캠페인이 초과 성과를 안정적으로 유지하는지 먼저 확인하는 편이 더 자연스럽습니다.";
    }

    if (context === "weekly_expansion") {
      return "현재는 목표 pace가 이미 앞서 있으므로, 주차 확장을 바로 밀어붙이기보다 최근 주차 강세가 일시적인지 반복 가능한지 먼저 확인하는 편이 더 자연스럽습니다.";
    }

    if (context === "creative_refresh") {
      return "현재는 목표 pace가 이미 앞서 있으므로, 소재 확장을 서두르기보다 현재 성과 소재가 안정적으로 유지되는지 먼저 확인하는 편이 더 자연스럽습니다.";
    }

    if (context === "keyword_tuning") {
      return "현재는 목표 pace가 이미 앞서 있으므로, 키워드 조건을 크게 조정하기보다 상위 쿼리/매치타입 신호가 반복되는지 먼저 확인하는 편이 더 자연스럽습니다.";
    }

    if (context === "channel_mix") {
      return "현재는 목표 pace가 이미 앞서 있으므로, 채널 믹스를 급하게 바꾸기보다 어떤 채널이 초과 달성 흐름을 실제로 만들고 있는지 먼저 확인하는 편이 더 자연스럽습니다.";
    }

    return `${metricLabel}는 현재 목표 달성 pace가 이미 앞서 있어, 강한 액션보다 신호 안정성 확인이 더 자연스럽습니다.`;
  }

  if (context === "campaign_reallocation") {
    return "캠페인 재배분은 실행 전후 효율 차이가 실제로 반복 확인되어야 신뢰도가 높아집니다.";
  }

  if (context === "weekly_expansion") {
    return "주차 확장은 특정 주차 강세가 반복 관측될 때 신뢰도가 높아집니다.";
  }

  if (context === "creative_refresh") {
    return "소재 판단은 단기 반응이 흔들릴 수 있어 추가 표본 확보가 필요합니다.";
  }

  if (context === "keyword_tuning") {
    return "키워드 조정은 클릭·전환 축의 후속 확인이 있어야 신뢰도가 높아집니다.";
  }

  if (context === "channel_mix") {
    return "채널 믹스 조정은 예산 이동 전후 성과 차이를 추가로 확인해야 신뢰도가 높아집니다.";
  }

  return "아직 execution 표본이 충분하지 않아 강한 결론보다 추가 확인이 우선입니다.";
}

function buildObserveActionLine(args: {
  context: HypothesisContextKey;
  item: PriorityItem;
  recentExecutionTrend: RecentExecutionTrend;
}) {
  const { context, item, recentExecutionTrend } = args;

  if (context === "campaign_reallocation") {
    return "캠페인 재배분 가설은 대규모 이동보다 상위/하위 캠페인 구간을 소폭 조정해 추가 execution 데이터를 먼저 확보하세요.";
  }

  if (context === "weekly_expansion") {
    return "최근 주차 확장 가설은 특정 주차 예산·노출을 소규모로 늘려 반응을 확인한 뒤 확대 여부를 다시 판단하세요.";
  }

  if (context === "creative_refresh") {
    return "소재 관련 가설은 신규 소재를 대량 확장하기보다 변형안 1~2개만 추가해 반응 차이를 먼저 확인하세요.";
  }

  if (context === "keyword_tuning") {
    return "키워드 관련 가설은 입찰/매치타입/검색어 제외를 소폭 조정해 후속 execution 표본을 먼저 쌓으세요.";
  }

  if (context === "channel_mix") {
    return "채널 믹스 가설은 큰 예산 이동보다 일부 채널 비중만 소폭 조정해 반응 차이를 확인하세요.";
  }

  if (recentExecutionTrend === "flat" || recentExecutionTrend === "unstable") {
    return `최근 실행 결과가 아직 중립적이거나 불안정하므로 ${item.title}는 강한 액션보다 추가 execution 데이터를 확보하세요.`;
  }

  return `${item.title}는 관찰군으로 유지하고 추가 데이터 확보 후 판단하세요.`;
}

function buildObserveRiskLine(args: {
  context: HypothesisContextKey;
  item: PriorityItem;
}) {
  const { context, item } = args;

  if (context === "campaign_reallocation") {
    return "캠페인 간 예산을 성급히 재배분하면 이미 잘 나오는 캠페인의 초과 성과를 오히려 깎을 수 있습니다.";
  }

  if (context === "weekly_expansion") {
    return "일부 주차 강세만 보고 확장하면 일시적 변동을 추세로 오인할 수 있습니다.";
  }

  if (context === "creative_refresh") {
    return "소재 판단을 너무 빨리 내리면 일시적 반응 차이를 구조적 우위로 오해할 수 있습니다.";
  }

  if (context === "keyword_tuning") {
    return "키워드 조건을 성급히 조정하면 볼륨과 효율을 동시에 흔들 수 있습니다.";
  }

  if (context === "channel_mix") {
    return "채널 믹스를 급하게 바꾸면 현재 안정적 성과를 내는 채널 구조가 깨질 수 있습니다.";
  }

  return `${item.title}는 현재 신호가 충분히 잠기지 않은 상태라 성급한 판단이 성과를 왜곡할 수 있습니다.`;
}

function buildScaleActionLine(args: {
  context: HypothesisContextKey;
  item: PriorityItem;
  metricType: string;
  severity: StrategySeverity;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
}) {
  const {
    context,
    item,
    metricType,
    severity,
    recentExecutionTrend,
    trendStrength,
  } = args;

  if (context === "campaign_reallocation") {
    if (metricType === "ROAS" || metricType === "REVENUE") {
      return "성과 상위 캠페인에만 예산을 점진적으로 증액하고, 하위 캠페인은 즉시 중단보다 감액 테스트로 ROAS 희석 여부를 확인하세요.";
    }

    if (metricType === "CPA" || metricType === "CPC") {
      return "비용 효율이 좋은 캠페인으로 일부 예산을 옮기되, CPA/CPC가 튀는 구간은 일 단위로 제한선을 두고 확대하세요.";
    }

    return "캠페인 재배분은 전면 이동보다 상위 캠페인 증액과 하위 캠페인 감액을 동시에 작게 실행해 실제 효율 차이를 검증하세요.";
  }

  if (context === "weekly_expansion") {
    return "성과가 확인된 주차 구간에만 예산·노출을 제한적으로 확대하고, 다른 주차까지 일괄 확장하지 말고 동일 조건 반복성을 먼저 확인하세요.";
  }

  if (context === "creative_refresh") {
    if (metricType === "CTR") {
      return "CTR이 좋은 소재의 메시지·후킹 구조를 유지한 변형안을 추가하고, 기존 우수 소재 예산은 피로도 모니터링 조건으로만 확대하세요.";
    }

    if (metricType === "CVR" || metricType === "CONVERSIONS") {
      return "전환 기여 소재의 랜딩/오퍼 메시지를 유지한 채 변형 소재를 소량 확장하고, 전환율이 유지되는지 먼저 확인하세요.";
    }

    return "성과 소재를 그대로 대량 복제하기보다 핵심 메시지 축을 유지한 변형안을 소량 확장해 피로도와 반응률을 함께 확인하세요.";
  }

  if (context === "keyword_tuning") {
    return "성과가 확인된 키워드·검색어 조합의 입찰을 소폭 상향하고, 확장 검색어는 제외어 관리와 함께 제한적으로 넓히세요.";
  }

  if (context === "channel_mix") {
    return "성과가 확인된 채널 비중만 단계적으로 늘리고, 전체 예산 이동은 보류한 채 채널별 CPA/ROAS 변동을 같이 확인하세요.";
  }

  if (metricType === "ROAS") {
    return recentExecutionTrend === "improving" && trendStrength >= 0.45
      ? "ROAS 개선 execution 추세가 누적되고 있으므로 고효율 캠페인/소재 중심 예산 확대를 우선 실행하세요."
      : "ROAS 상승 신호 기반으로 고효율 캠페인/소재 중심 예산 확대를 우선 실행하세요.";
  }

  if (metricType === "CTR") {
    return "CTR 개선 신호 기반으로 성과 좋은 소재를 확장하고 유사 크리에이티브를 추가 생성하세요.";
  }

  if (metricType === "CLICKS") {
    return "유입 확대 전략으로 노출 및 클릭 볼륨을 키우는 방향으로 집행 범위를 넓히세요.";
  }

  if (metricType === "REVENUE") {
    return "매출 기여 구간 중심으로 고효율 구조를 확대하고 상위 성과 캠페인에 자원을 집중하세요.";
  }

  return `${item.title} 관련 전략을 ${
    severity === "high" || severity === "critical" ? "즉시 확대" : "우선 확대"
  }하고 동일 KPI 축에서 집행 비중을 늘리세요.`;
}

function buildTuneActionLine(args: {
  context: HypothesisContextKey;
  item: PriorityItem;
  metricType: string;
  recentExecutionTrend: RecentExecutionTrend;
}) {
  const { context, item, metricType, recentExecutionTrend } = args;

  if (context === "campaign_reallocation") {
    return "캠페인 재배분은 전면 수정보다 상위/하위 캠페인 비중만 소폭 조정한 뒤 다시 execution 표본을 쌓아 재평가하세요.";
  }

  if (context === "weekly_expansion") {
    return "주차 확장은 전체 확대보다 특정 주차만 소규모로 테스트한 뒤 다시 execution 표본을 쌓아 재평가하세요.";
  }

  if (context === "creative_refresh") {
    return "소재는 대량 교체보다 메시지·썸네일·후킹 문구 중 하나만 바꾼 변형안을 테스트해 어떤 요소가 반응을 만드는지 분리하세요.";
  }

  if (context === "keyword_tuning") {
    return "키워드는 입찰가, 매치타입, 검색어 제외를 한 번에 바꾸지 말고 하나씩 조정해 클릭 품질과 전환 변화를 분리해서 확인하세요.";
  }

  if (context === "channel_mix") {
    return "채널 믹스는 전체 이동보다 채널별 예산 상한과 소재 조합을 먼저 조정해 효율 저하 구간을 좁히세요.";
  }

  if (metricType === "CPA") {
    return "CPA 안정화를 위해 비효율 그룹/키워드를 제거하고 입찰가 및 타겟 조건을 재조정하세요.";
  }

  if (metricType === "CPC") {
    return "CPC 안정화를 위해 클릭 단가가 높은 구간을 줄이고 입찰 및 매체 배분을 조정하세요.";
  }

  if (metricType === "CVR") {
    return "전환율 개선을 위해 랜딩 페이지, 유입 경로, 소재 메시지 정합성을 우선 점검하세요.";
  }

  if (recentExecutionTrend === "flat" || recentExecutionTrend === "unstable") {
    return `${item.title}는 확대보다 타겟, 그룹, 소재 단위 조건을 먼저 조정한 뒤 다시 execution 표본을 쌓아 재평가하세요.`;
  }

  return `${item.title}는 확대보다 타겟, 그룹, 소재 단위 조건을 먼저 조정한 뒤 재평가하세요.`;
}

function buildPauseActionLine(args: {
  context: HypothesisContextKey;
  item: PriorityItem;
  metricType: string;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
}) {
  const {
    context,
    item,
    metricType,
    latestExecutionEvaluation,
    recentExecutionTrend,
  } = args;

  if (context === "campaign_reallocation") {
    return "재배분 후보 캠페인의 추가 증액은 멈추고, 악화된 캠페인의 비용·전환·ROAS를 분리해 어떤 축이 문제인지 먼저 확인하세요.";
  }

  if (context === "weekly_expansion") {
    return "해당 주차 확장은 일단 중단하고, 주차 효과인지 외부 변동인지 구분하기 위해 직전/직후 주차와 같은 조건으로 비교하세요.";
  }

  if (context === "creative_refresh") {
    return "성과가 악화된 소재 확장은 중단하고, 동일 타겟에서 기존 소재와 신규 소재의 CTR/CVR 차이를 먼저 재검증하세요.";
  }

  if (context === "keyword_tuning") {
    return "악화된 키워드 확장은 중단하고, 비용을 소진한 검색어와 실제 전환 검색어를 분리해 제외/입찰 조정을 먼저 하세요.";
  }

  if (context === "channel_mix") {
    return "악화된 채널 증액은 멈추고, 채널별 유입 품질과 전환 비용을 비교해 예산 회수 여부를 먼저 판단하세요.";
  }

  if (metricType === "CPA") {
    return "CPA 악화 구간으로 판단되므로 신규 집행을 중단하고 비용 구조를 재검토하세요.";
  }

  if (metricType === "ROAS") {
    return "ROAS 악화 신호가 확인되었으므로 저효율 구간 집행을 멈추고 매출 기여 구조를 재점검하세요.";
  }

  if (
    latestExecutionEvaluation?.direction === "worsened" ||
    recentExecutionTrend === "weakening"
  ) {
    return "최근 실제 execution 결과와 누적 추세가 모두 악화 쪽이므로 추가 집행을 멈추고 원인 분석부터 먼저 수행하세요.";
  }

  return `${item.title}는 신규 집행을 중단하고 최근 악화 원인을 먼저 확인하세요.`;
}

function buildExpandRiskLine(args: {
  context: HypothesisContextKey;
  metricType: string;
  signalTotalCount: number;
  recentExecutionCount: number;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
}) {
  const {
    context,
    metricType,
    signalTotalCount,
    recentExecutionCount,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
  } = args;

  if (context === "campaign_reallocation") {
    return "예산을 너무 빠르게 재배분하면 상위 캠페인의 효율이 희석되고, 하위 캠페인의 잔여 전환 기회를 놓칠 수 있습니다.";
  }

  if (context === "weekly_expansion") {
    return "특정 주차 강세가 일시적 시즌/프로모션 영향이면 확장 후 동일 효율이 반복되지 않을 수 있습니다.";
  }

  if (context === "creative_refresh") {
    return "소재 확장은 초기 반응이 좋아도 피로도가 빠르게 누적될 수 있으므로 CTR과 CVR을 동시에 봐야 합니다.";
  }

  if (context === "keyword_tuning") {
    return "키워드 확장은 노출과 클릭은 늘릴 수 있지만 검색 의도가 넓어지면 전환 효율이 희석될 수 있습니다.";
  }

  if (context === "channel_mix") {
    return "채널 비중 확대는 채널 간 중복 도달과 예산 잠식이 생길 수 있어 전체 ROAS를 함께 확인해야 합니다.";
  }

  if (metricType === "ROAS") {
    return "ROAS 확대 시 예산 증가로 효율이 희석될 수 있으므로, 상위 구간 중심으로 점진적 확대가 필요합니다.";
  }

  if (metricType === "CTR") {
    return "CTR 기반 확장은 소재 피로도에 의해 빠르게 하락할 수 있으므로 지속 모니터링이 필요합니다.";
  }

  if (
    latestExecutionEvaluation?.direction === "improved" ||
    (recentExecutionTrend === "improving" && trendStrength >= 0.45)
  ) {
    return "최근 실행 결과와 누적 execution 추세는 좋지만 단기 반등일 수 있으므로, 다음 execution에서도 동일 KPI 흐름이 유지되는지 확인해야 합니다.";
  }

  return `확대 전략이지만 learning 표본 ${signalTotalCount}건과 recent execution ${recentExecutionCount}건이 아직 충분하지 않을 수 있습니다.`;
}

function buildOptimizeRiskLine(args: {
  context: HypothesisContextKey;
  metricType: string;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
}) {
  const {
    context,
    metricType,
    latestExecutionEvaluation,
    recentExecutionTrend,
  } = args;

  if (context === "campaign_reallocation") {
    return "캠페인 조건을 동시에 많이 조정하면 어떤 변경이 효율 개선을 만들었는지 분리하기 어려워집니다.";
  }

  if (context === "weekly_expansion") {
    return "주차 단위 조정은 요일/프로모션/입찰 경쟁 영향을 함께 받기 때문에 단일 주차 결과만으로 판단하면 왜곡될 수 있습니다.";
  }

  if (context === "creative_refresh") {
    return "소재 조정 폭이 크면 메시지, 이미지, 타겟 중 어떤 요소가 성과 변화를 만든 것인지 해석이 어려워집니다.";
  }

  if (context === "keyword_tuning") {
    return "키워드 조건을 과하게 조정하면 클릭 볼륨이 줄어 학습 표본 자체가 부족해질 수 있습니다.";
  }

  if (context === "channel_mix") {
    return "채널 조건을 조정하는 동안 유입 품질과 전환 지연이 동시에 변해 단기 결과가 불안정할 수 있습니다.";
  }

  if (metricType === "CPA") {
    return "CPA 조정 과정에서 볼륨이 급감할 수 있으므로 트래픽 감소를 함께 모니터링해야 합니다.";
  }

  if (
    latestExecutionEvaluation?.direction === "neutral" ||
    recentExecutionTrend === "flat" ||
    recentExecutionTrend === "unstable"
  ) {
    return "최근 실행 결과가 아직 뚜렷하지 않아, 조정 폭이 과하면 신호 해석이 더 어려워질 수 있습니다.";
  }

  return "조건 조정 실패 시 성과 변동성이 커질 수 있습니다.";
}

function buildReviewRiskLine(args: {
  context: HypothesisContextKey;
  severity: StrategySeverity;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
}) {
  const {
    context,
    severity,
    latestExecutionEvaluation,
    recentExecutionTrend,
  } = args;

  if (
    latestExecutionEvaluation?.direction === "worsened" ||
    recentExecutionTrend === "weakening"
  ) {
    if (context === "campaign_reallocation") {
      return "재배분 후 악화 신호가 있는 상태에서 계속 밀면 비용이 비효율 캠페인에 더 묶일 수 있습니다.";
    }

    if (context === "weekly_expansion") {
      return "주차 확장 후 악화 신호가 있는 상태에서 예산을 유지하면 특정 기간 변동을 구조적 기회로 오판할 수 있습니다.";
    }

    if (context === "creative_refresh") {
      return "소재 악화 신호를 무시하면 피로도와 낮은 전환율이 동시에 누적될 수 있습니다.";
    }

    if (context === "keyword_tuning") {
      return "키워드 악화 신호를 방치하면 저의도 검색어에 비용이 계속 소진될 수 있습니다.";
    }

    if (context === "channel_mix") {
      return "채널 악화 신호를 방치하면 전체 예산 효율이 빠르게 희석될 수 있습니다.";
    }

    return "최근 실제 execution 결과 또는 누적 execution 추세가 악화된 상태이므로, 원인 점검 없이 집행을 지속하면 손실이 더 누적될 수 있습니다.";
  }

  if (recentExecutionTrend === "unstable") {
    return "최근 execution 신호가 상충되고 있어 성급한 유지도, 성급한 확대도 모두 리스크가 있습니다.";
  }

  return severity === "critical"
    ? "현재 상태를 유지하면 손실이 누적될 가능성이 매우 높습니다."
    : "재검토 없이 집행을 유지하면 악화 신호가 지속될 수 있습니다.";
}

function buildReasonLine(args: {
  item: PriorityItem;
  bucketKey: StrategyBucketKey;
  driver: StrategyDriver;
  rankSnapshot?: PriorityRankSnapshot;
  latestExecution?: ExecutionItem;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentImprovedCount: number;
  recentWorsenedCount: number;
  recentNeutralCount: number;
  recentExecutionCount: number;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
  goalSnapshot?: GoalSnapshot;
}) {
  const {
    item,
    bucketKey,
    driver,
    rankSnapshot,
    latestExecution,
    latestExecutionEvaluation,
    recentImprovedCount,
    recentWorsenedCount,
    recentNeutralCount,
    recentExecutionCount,
    recentExecutionTrend,
    trendStrength,
    goalSnapshot,
  } = args;

  const signal = getLearningSignal(item);
  const trend = getTrendDirection(rankSnapshot);
  const context = resolveHypothesisContext(item);
  const trendReason = buildTrendReasonFragment({
    recentImprovedCount,
    recentWorsenedCount,
    recentNeutralCount,
    recentExecutionCount,
    recentExecutionTrend,
    trendStrength,
  });
  const priorityBridgePrefix = buildPriorityBridgePrefix(item);

  if (
    goalSnapshot?.pacingStatus === "ahead" &&
    (goalSnapshot?.gapValue ?? 0) <= 0 &&
    recentExecutionCount <= 0 &&
    !latestExecutionEvaluation
  ) {
    return `${priorityBridgePrefix}Strategy 단계에서는 ${trendReason} ${buildObserveReasonTail({
      context,
      item,
      goalSnapshot,
    })}`;
  }

  if (driver === "execution_improved") {
    return `${priorityBridgePrefix}Strategy 단계에서는 최근 execution '${latestExecution?.title ?? item.title}' 결과에서 ${latestExecution?.targetMetric ?? "KPI"}가 실제 개선되었고, ${trendReason} 이 신호가 현재 strategy 판단에 직접 반영되어 ${bucketKey} 전략으로 분류했습니다.`;
  }

  if (driver === "execution_worsened") {
    return `${priorityBridgePrefix}Strategy 단계에서는 최근 execution '${latestExecution?.title ?? item.title}' 결과에서 ${latestExecution?.targetMetric ?? "KPI"}가 악화되었고, ${trendReason} 현재 추천을 그대로 확대하기보다 재검토가 우선인 전략으로 분류했습니다.`;
  }

  if (driver === "execution_neutral") {
    return `${priorityBridgePrefix}Strategy 단계에서는 최근 execution 결과는 방향성이 크지 않았지만, ${trendReason} ${buildObserveReasonTail({
      context,
      item,
      goalSnapshot,
    })}`;
  }

  if (driver === "rank_up") {
    return `${priorityBridgePrefix}Strategy 단계에서는 최근 learning 반영 이후 priority rank가 ${
      trend === "new"
        ? `새롭게 #${rankSnapshot?.currentRank}`
        : `#${rankSnapshot?.previousRank} → #${rankSnapshot?.currentRank}`
    }로 움직였고, ${trendReason} 현재 score ${(item.score * 100).toFixed(
      1,
    )} 기준으로 실행 가치가 높아 ${bucketKey} 전략으로 분류했습니다.`;
  }

  if (driver === "positive_learning") {
    return `${priorityBridgePrefix}Strategy 단계에서는 improved ${signal.improvedCount}건 / worsened ${signal.worsenedCount}건의 긍정 학습 신호에 더해, ${trendReason} 현재 추천을 확대 또는 유지하는 쪽이 더 유리하다고 판단했습니다.`;
  }

  if (driver === "negative_learning") {
    return `${priorityBridgePrefix}Strategy 단계에서는 worsened ${signal.worsenedCount}건이 improved ${signal.improvedCount}건보다 많고, ${trendReason} 지금은 추가 집행보다 재검토가 먼저 필요한 전략으로 판단했습니다.`;
  }

  if (driver === "high_impact_low_confidence") {
    return `${priorityBridgePrefix}Strategy 단계에서는 impact ${Math.round(item.impact * 100)}는 높지만 confidence ${Math.round(
      item.confidence * 100,
    )}가 아직 완전히 높지 않고, ${trendReason} 바로 확대보다 조건 조정이 우선이라고 판단했습니다.`;
  }

  if (driver === "neutral_observation") {
    return `${priorityBridgePrefix}Strategy 단계에서는 neutral ${signal.neutralCount}건 중심으로 아직 방향성이 충분히 쌓이지 않았고, ${trendReason} ${buildObserveReasonTail({
      context,
      item,
      goalSnapshot,
    })}`;
  }

  if (driver === "new_priority") {
    return `${priorityBridgePrefix}Strategy 단계에서는 이번 계산에서 새롭게 priority 후보로 진입했고, ${trendReason} ${buildObserveReasonTail({
      context,
      item,
      goalSnapshot,
    })}`;
  }

  if (latestExecutionEvaluation) {
    return `${priorityBridgePrefix}Strategy 단계에서는 최근 execution 결과와 현재 priority score ${(item.score * 100).toFixed(
      1,
    )}를 함께 반영했고, ${trendReason} 이를 종합해 운영 전략을 분류했습니다.`;
  }

  return `${priorityBridgePrefix}Strategy 단계에서는 현재 priority score ${(item.score * 100).toFixed(
    1,
  )}와 누적 학습 신호를 종합했고, ${trendReason} 이를 기준으로 운영 우선순위를 분류했습니다.`;
}

function buildActionLine(args: {
  item: PriorityItem;
  bucketKey: StrategyBucketKey;
  actionType: StrategyActionType;
  severity: StrategySeverity;
  metricType: string;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
}) {
  const {
    item,
    actionType,
    severity,
    metricType,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
  } = args;

  const context = resolveHypothesisContext(item);

  if (actionType === "scale") {
    return buildScaleActionLine({
      context,
      item,
      metricType,
      severity,
      recentExecutionTrend,
      trendStrength,
    });
  }

  if (actionType === "tune") {
    return buildTuneActionLine({
      context,
      item,
      metricType,
      recentExecutionTrend,
    });
  }

  if (actionType === "pause") {
    return buildPauseActionLine({
      context,
      item,
      metricType,
      latestExecutionEvaluation,
      recentExecutionTrend,
    });
  }

  return buildObserveActionLine({
    context,
    item,
    recentExecutionTrend,
  });
}

function buildRiskLine(args: {
  item: PriorityItem;
  bucketKey: StrategyBucketKey;
  driver: StrategyDriver;
  severity: StrategySeverity;
  metricType: string;
  latestExecutionEvaluation?: ExecutionEvaluation;
  recentExecutionTrend: RecentExecutionTrend;
  trendStrength: number;
  recentExecutionCount: number;
}) {
  const {
    item,
    bucketKey,
    driver,
    severity,
    metricType,
    latestExecutionEvaluation,
    recentExecutionTrend,
    trendStrength,
    recentExecutionCount,
  } = args;

  const signal = getLearningSignal(item);
  const context = resolveHypothesisContext(item);

  if (bucketKey === "expand") {
    return buildExpandRiskLine({
      context,
      metricType,
      signalTotalCount: signal.totalCount,
      recentExecutionCount,
      latestExecutionEvaluation,
      recentExecutionTrend,
      trendStrength,
    });
  }

  if (bucketKey === "optimize") {
    return buildOptimizeRiskLine({
      context,
      metricType,
      latestExecutionEvaluation,
      recentExecutionTrend,
    });
  }

  if (bucketKey === "review") {
    return buildReviewRiskLine({
      context,
      severity,
      latestExecutionEvaluation,
      recentExecutionTrend,
    });
  }

  if (
    driver === "neutral_observation" ||
    latestExecutionEvaluation?.direction === "neutral" ||
    recentExecutionTrend === "flat" ||
    recentExecutionTrend === "unstable"
  ) {
    return buildObserveRiskLine({
      context,
      item,
    });
  }

  return "현재 신호는 유효하지만 다음 실행 결과에 따라 전략 버킷이 다시 바뀔 수 있습니다.";
}

function createEmptyBuckets(): Record<StrategyBucketKey, StrategyBucket> {
  return {
    expand: {
      key: "expand",
      title: "Expand",
      description: "지금 바로 확대할 전략",
      items: [],
    },
    optimize: {
      key: "optimize",
      title: "Optimize",
      description: "조건 조정 후 성과를 키울 전략",
      items: [],
    },
    review: {
      key: "review",
      title: "Review",
      description: "즉시 재검토가 필요한 전략",
      items: [],
    },
    observe: {
      key: "observe",
      title: "Observe",
      description: "관찰 우선 전략",
      items: [],
    },
  };
}

export function buildStrategyPlaybook(args: {
  priorityItems: PriorityItem[];
  rankSnapshotsByHypothesis?: Record<string, PriorityRankSnapshot>;
  executionItems?: ExecutionItem[];
  executionEvaluations?: Record<string, ExecutionEvaluation>;
  goalSnapshot?: GoalSnapshot;
}): StrategyPlaybook {
  const {
    priorityItems,
    rankSnapshotsByHypothesis,
    executionItems = [],
    executionEvaluations = {},
    goalSnapshot,
  } = args;

  const buckets = createEmptyBuckets();
  const latestExecutionByHypothesis = buildLatestExecutionMap(executionItems);
  const recentTrendByHypothesis = buildRecentExecutionTrendMap({
    executionItems,
    executionEvaluations,
    limit: RECENT_EXECUTION_LIMIT,
  });

  for (const item of priorityItems.slice(0, 8)) {
    const rankSnapshot = rankSnapshotsByHypothesis?.[item.hypothesisId];
    const latestExecution = latestExecutionByHypothesis[item.hypothesisId];
    const latestExecutionEvaluation = latestExecution
      ? executionEvaluations[latestExecution.executionId]
      : undefined;

    const recentTrendMeta = getRecentExecutionTrendMeta(
      item.hypothesisId,
      recentTrendByHypothesis,
    );

    const metricType = resolveMetricType(item);
    const bucketKey = resolveBucketKey({
      item,
      rankSnapshot,
      latestExecutionEvaluation,
      recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
      trendStrength: recentTrendMeta.trendStrength,
      recentImprovedCount: recentTrendMeta.recentImprovedCount,
      recentWorsenedCount: recentTrendMeta.recentWorsenedCount,
      recentExecutionCount: recentTrendMeta.recentExecutionCount,
      goalSnapshot,
    });
    const driver = resolveDriver({
      item,
      rankSnapshot,
      bucketKey,
      latestExecutionEvaluation,
      recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
      trendStrength: recentTrendMeta.trendStrength,
      recentExecutionCount: recentTrendMeta.recentExecutionCount,
    });
    const severity = resolveSeverity({
      item,
      rankSnapshot,
      bucketKey,
      latestExecutionEvaluation,
      recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
      trendStrength: recentTrendMeta.trendStrength,
      recentWorsenedCount: recentTrendMeta.recentWorsenedCount,
      recentExecutionCount: recentTrendMeta.recentExecutionCount,
    });
    const actionType = resolveActionType(bucketKey);
    const actionPriority = resolveActionPriority({
      item,
      bucketKey,
      severity,
      latestExecutionEvaluation,
      recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
      trendStrength: recentTrendMeta.trendStrength,
      recentExecutionCount: recentTrendMeta.recentExecutionCount,
    });

    const strategyItem: StrategyItem = {
      hypothesisId: item.hypothesisId,
      title: item.title,
      score: toSafeNumber(item.score),
      rank: toSafeNumber(item.rank),
      impact: toSafeNumber(item.impact),
      confidence: toSafeNumber(item.confidence),
      ease: toSafeNumber(item.ease),
      learningAdjustment: toSafeNumber(item.learningAdjustment),
      learningSignal: getLearningSignal(item),
      rankSnapshot,
      severity,
      driver,
      actionType,
      actionPriority,
      metricType,
      latestExecution: latestExecution
        ? {
            executionId: latestExecution.executionId,
            status: latestExecution.status,
            targetMetric: latestExecution.targetMetric,
            updatedAt: latestExecution.updatedAt,
          }
        : undefined,
      latestExecutionEvaluation: latestExecutionEvaluation
        ? {
            direction: latestExecutionEvaluation.direction,
            currentValue: latestExecutionEvaluation.currentValue,
            diffValue: latestExecutionEvaluation.diffValue,
            diffRate: latestExecutionEvaluation.diffRate,
          }
        : undefined,
      recentImprovedCount: recentTrendMeta.recentImprovedCount,
      recentWorsenedCount: recentTrendMeta.recentWorsenedCount,
      recentNeutralCount: recentTrendMeta.recentNeutralCount,
      recentExecutionCount: recentTrendMeta.recentExecutionCount,
      recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
      trendStrength: recentTrendMeta.trendStrength,
      reasonLine: buildReasonLine({
        item,
        bucketKey,
        driver,
        rankSnapshot,
        latestExecution,
        latestExecutionEvaluation,
        recentImprovedCount: recentTrendMeta.recentImprovedCount,
        recentWorsenedCount: recentTrendMeta.recentWorsenedCount,
        recentNeutralCount: recentTrendMeta.recentNeutralCount,
        recentExecutionCount: recentTrendMeta.recentExecutionCount,
        recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
        trendStrength: recentTrendMeta.trendStrength,
        goalSnapshot,
      }),
      actionLine: buildActionLine({
        item,
        bucketKey,
        actionType,
        severity,
        metricType,
        latestExecutionEvaluation,
        recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
        trendStrength: recentTrendMeta.trendStrength,
      }),
      riskLine: buildRiskLine({
        item,
        bucketKey,
        driver,
        severity,
        metricType,
        latestExecutionEvaluation,
        recentExecutionTrend: recentTrendMeta.recentExecutionTrend,
        trendStrength: recentTrendMeta.trendStrength,
        recentExecutionCount: recentTrendMeta.recentExecutionCount,
      }),
    };

    buckets[bucketKey].items.push(strategyItem);
  }

  const orderedKeys: StrategyBucketKey[] = [
    "expand",
    "optimize",
    "review",
    "observe",
  ];

  for (const key of orderedKeys) {
    buckets[key].items.sort((a, b) => {
      if (b.actionPriority !== a.actionPriority) {
        return b.actionPriority - a.actionPriority;
      }
      if (b.score !== a.score) return b.score - a.score;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.impact - a.impact;
    });
  }

  return {
    buckets: orderedKeys.map((key) => buckets[key]),
  };
}
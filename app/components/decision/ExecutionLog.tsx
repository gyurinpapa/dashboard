"use client";

import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import {
  getNextExecutionStatuses,
  type ExecutionItem,
  type ExecutionStatus,
  type ExecutionOutcomePrioritySnapshot,
  type ExecutionOutcomeStrategySnapshot,
} from "@/src/lib/decision/execution";
import type { PriorityItem } from "@/src/lib/decision/priority";
import type { PriorityRankSnapshot } from "./PriorityQueue";

export type ExecutionEvaluation = {
  executionId: string;
  currentValue: number;
  diffValue: number;
  diffRate: number;
  direction: "improved" | "worsened" | "neutral";
};

type StrategyBucketSnapshot = {
  hypothesisId: string;
  previousBucket?: "expand" | "optimize" | "review" | "observe";
  currentBucket: "expand" | "optimize" | "review" | "observe";
  direction: "shifted" | "same" | "new";
  changedAt?: string;
};

type PrioritySnapshotLike =
  | ExecutionOutcomePrioritySnapshot
  | PriorityRankSnapshot
  | undefined;

type StrategySnapshotLike =
  | ExecutionOutcomeStrategySnapshot
  | StrategyBucketSnapshot
  | undefined;

type BadgeTone =
  | "border-emerald-200 bg-emerald-50 text-emerald-700"
  | "border-rose-200 bg-rose-50 text-rose-700"
  | "border-indigo-200 bg-indigo-50 text-indigo-700"
  | "border-slate-200 bg-slate-50 text-slate-700"
  | "border-amber-200 bg-amber-50 text-amber-700"
  | "border-blue-200 bg-blue-50 text-blue-700"
  | "border-violet-200 bg-violet-50 text-violet-700";

type ImpactBadge = {
  key: string;
  label: string;
  tone: BadgeTone;
};

type Props = {
  items: ExecutionItem[];
  onChangeStatus?: (executionId: string, status: ExecutionStatus) => void;
  evaluations?: Record<string, ExecutionEvaluation>;
  learningReflections?: Record<string, boolean>;
  priorityItems?: PriorityItem[];
  rankSnapshotsByHypothesis?: Record<string, PriorityRankSnapshot>;
  strategyBucketSnapshotsByHypothesis?: Record<string, StrategyBucketSnapshot>;
  highlightedPriorityHypothesisId?: string | null;
  recentlyFocusedPriorityHypothesisId?: string | null;
  highlightedExecutionIds?: string[];
  recentlyFocusedExecutionIds?: string[];
  onFocusPriority?: (hypothesisId: string) => void;
};

const FOCUSED_PRIORITY_CARD_CLASS =
  "border-indigo-300 ring-2 ring-indigo-200 shadow-[0_0_0_6px_rgba(99,102,241,0.08)]";

const RECENTLY_FOCUSED_PRIORITY_CARD_CLASS =
  "border-indigo-200 bg-indigo-50/40 shadow-sm";

const FOCUSED_EXECUTION_CARD_CLASS =
  "border-violet-300 ring-2 ring-violet-200 shadow-[0_0_0_6px_rgba(139,92,246,0.10)]";

const RECENTLY_FOCUSED_EXECUTION_CARD_CLASS =
  "border-violet-200 bg-violet-50/40 shadow-sm";

const FOCUSED_PRIORITY_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-indigo-700";

const RECENTLY_FOCUSED_PRIORITY_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-indigo-600";

const EXECUTION_META_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600";

const EXECUTION_ID_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-slate-600";

const FOCUSED_EXECUTION_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-violet-700";

const RECENTLY_FOCUSED_EXECUTION_BADGE_CLASS =
  "inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-violet-600";

function formatDateTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    hour12: false,
  });
}

function formatMetricValue(value?: number) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  });
}

function formatSignedMetricValue(value?: number) {
  if (value == null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedPercent(value?: number) {
  if (value == null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function formatKpiFlowText(args: {
  targetMetric: string;
  baselineValue?: number;
  currentValue?: number;
}) {
  const { targetMetric, baselineValue, currentValue } = args;

  const baselineText = formatMetricValue(baselineValue);
  const currentText = formatMetricValue(currentValue);

  return `${targetMetric} ${baselineText} → ${currentText}`;
}

function getPrioritySnapshotPreviousRank(snapshot?: PrioritySnapshotLike) {
  if (!snapshot) return undefined;

  if ("beforeRank" in snapshot && typeof snapshot.beforeRank === "number") {
    return snapshot.beforeRank;
  }

  if ("previousRank" in snapshot && typeof snapshot.previousRank === "number") {
    return snapshot.previousRank;
  }

  return undefined;
}

function getPrioritySnapshotCurrentRank(snapshot?: PrioritySnapshotLike) {
  if (!snapshot) return undefined;

  if ("afterRank" in snapshot && typeof snapshot.afterRank === "number") {
    return snapshot.afterRank;
  }

  if ("currentRank" in snapshot && typeof snapshot.currentRank === "number") {
    return snapshot.currentRank;
  }

  return undefined;
}

function getPrioritySnapshotChangedAt(snapshot?: PrioritySnapshotLike) {
  if (!snapshot) return undefined;
  return snapshot.changedAt;
}

function getPrioritySnapshotDirection(
  snapshot?: PrioritySnapshotLike,
): "up" | "down" | "same" | "new" | undefined {
  if (!snapshot) return undefined;
  return snapshot.direction;
}

function formatPriorityRankFlow(snapshot?: PrioritySnapshotLike) {
  if (!snapshot) return "-";

  const previousRank = getPrioritySnapshotPreviousRank(snapshot);
  const currentRank = getPrioritySnapshotCurrentRank(snapshot);
  const direction = getPrioritySnapshotDirection(snapshot);

  if (direction === "new") {
    return `NEW → #${currentRank ?? "-"}`;
  }

  if (previousRank == null) {
    return `- → #${currentRank ?? "-"}`;
  }

  return `#${previousRank} → #${currentRank ?? "-"}`;
}

function formatStrategyBucketLabel(
  bucket?: "expand" | "optimize" | "review" | "observe",
) {
  if (!bucket) return "-";
  return bucket;
}

function getStrategySnapshotPreviousBucket(snapshot?: StrategySnapshotLike) {
  if (!snapshot) return undefined;
  if ("beforeBucket" in snapshot) return snapshot.beforeBucket;
  return snapshot.previousBucket;
}

function getStrategySnapshotCurrentBucket(snapshot?: StrategySnapshotLike) {
  if (!snapshot) return undefined;
  if ("afterBucket" in snapshot && snapshot.afterBucket != null) {
    return snapshot.afterBucket;
  }
  return snapshot.currentBucket;
}

function getStrategySnapshotChangedAt(snapshot?: StrategySnapshotLike) {
  if (!snapshot) return undefined;
  return snapshot.changedAt;
}

function getStrategySnapshotDirection(
  snapshot?: StrategySnapshotLike,
): "shifted" | "same" | "new" | undefined {
  if (!snapshot) return undefined;
  return snapshot.direction;
}

function formatStrategyBucketFlow(snapshot?: StrategySnapshotLike) {
  if (!snapshot) return "-";

  const previousBucket = getStrategySnapshotPreviousBucket(snapshot);
  const currentBucket = getStrategySnapshotCurrentBucket(snapshot);
  const direction = getStrategySnapshotDirection(snapshot);

  if (direction === "new") {
    return `NEW → ${currentBucket ?? "-"}`;
  }

  if (!previousBucket) {
    return `- → ${currentBucket ?? "-"}`;
  }

  return `${previousBucket} → ${currentBucket}`;
}

function getStatusTone(status: ExecutionStatus) {
  switch (status) {
    case "planned":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "running":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getStatusLabel(status: ExecutionStatus) {
  switch (status) {
    case "planned":
      return "Planned";
    case "running":
      return "Running";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function getEvaluationTone(direction: ExecutionEvaluation["direction"]) {
  switch (direction) {
    case "improved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "worsened":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "neutral":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getEvaluationLabel(direction: ExecutionEvaluation["direction"]) {
  switch (direction) {
    case "improved":
      return "개선";
    case "worsened":
      return "악화";
    case "neutral":
    default:
      return "보류";
  }
}

function getEvaluationDescription(direction: ExecutionEvaluation["direction"]) {
  switch (direction) {
    case "improved":
      return "실행 이후 KPI가 baseline 대비 개선되었습니다.";
    case "worsened":
      return "실행 이후 KPI가 baseline 대비 악화되었습니다.";
    case "neutral":
    default:
      return "현재까지 KPI 변화가 미미하거나 추가 관찰이 필요합니다.";
  }
}

function getRankTrendTone(direction: "up" | "down" | "same" | "new") {
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

function getRankTrendLabel(direction: "up" | "down" | "same" | "new") {
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

function getStrategyShiftTone(direction: "shifted" | "same" | "new") {
  switch (direction) {
    case "shifted":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "new":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "same":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getStrategyShiftLabel(direction: "shifted" | "same" | "new") {
  switch (direction) {
    case "shifted":
      return "전환";
    case "new":
      return "신규";
    case "same":
    default:
      return "유지";
  }
}

function buildExecutionTopSummaryLine(args: {
  item: ExecutionItem;
  evaluation?: ExecutionEvaluation;
  prioritySnapshot?: PrioritySnapshotLike;
  strategySnapshot?: StrategySnapshotLike;
}) {
  const { item, evaluation, prioritySnapshot, strategySnapshot } = args;

  const parts: string[] = [];

  if (item.status === "done" && evaluation) {
    parts.push(`${getEvaluationLabel(evaluation.direction)} 실행`);
  } else {
    parts.push(getStatusLabel(item.status));
  }

  const priorityDirection = getPrioritySnapshotDirection(prioritySnapshot);
  if (priorityDirection === "up") {
    parts.push("Priority 상승");
  } else if (priorityDirection === "down") {
    parts.push("Priority 하락");
  } else if (priorityDirection === "new") {
    parts.push("Priority 신규 진입");
  } else if (prioritySnapshot) {
    parts.push("Priority 유지");
  }

  const currentBucket = getStrategySnapshotCurrentBucket(strategySnapshot);
  const strategyDirection = getStrategySnapshotDirection(strategySnapshot);

  if (strategyDirection === "shifted" || strategyDirection === "new") {
    if (currentBucket === "expand") {
      parts.push("Expand 전환");
    } else if (currentBucket === "optimize") {
      parts.push("Optimize 전환");
    } else if (currentBucket === "review") {
      parts.push("Review 전환");
    } else if (currentBucket === "observe") {
      parts.push("Observe 전환");
    } else {
      parts.push("Strategy 전환");
    }
  } else if (currentBucket) {
    if (currentBucket === "expand") {
      parts.push("Expand 유지");
    } else if (currentBucket === "optimize") {
      parts.push("Optimize 유지");
    } else if (currentBucket === "review") {
      parts.push("Review 유지");
    } else {
      parts.push("Observe 유지");
    }
  }

  return parts.join(" · ");
}

function buildExecutionImpactBadges(args: {
  item: ExecutionItem;
  evaluation?: ExecutionEvaluation;
  prioritySnapshot?: PrioritySnapshotLike;
  strategySnapshot?: StrategySnapshotLike;
}): ImpactBadge[] {
  const { item, evaluation, prioritySnapshot, strategySnapshot } = args;
  const badges: ImpactBadge[] = [];

  const priorityDirection = getPrioritySnapshotDirection(prioritySnapshot);
  const strategyDirection = getStrategySnapshotDirection(strategySnapshot);
  const currentBucket = getStrategySnapshotCurrentBucket(strategySnapshot);

  if (priorityDirection === "up") {
    badges.push({
      key: "priority_up",
      label: "RANK UP",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    });
  } else if (priorityDirection === "down") {
    badges.push({
      key: "priority_down",
      label: "RANK DOWN",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    });
  } else if (priorityDirection === "new") {
    badges.push({
      key: "priority_new",
      label: "NEW PRIORITY",
      tone: "border-indigo-200 bg-indigo-50 text-indigo-700",
    });
  }

  if (strategyDirection === "shifted" || strategyDirection === "new") {
    if (currentBucket === "review") {
      badges.push({
        key: "strategy_review",
        label: "REVIEW SHIFT",
        tone: "border-amber-200 bg-amber-50 text-amber-700",
      });
    } else if (currentBucket === "expand") {
      badges.push({
        key: "strategy_expand",
        label: "EXPAND SHIFT",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      });
    } else if (currentBucket === "optimize") {
      badges.push({
        key: "strategy_optimize",
        label: "OPTIMIZE SHIFT",
        tone: "border-indigo-200 bg-indigo-50 text-indigo-700",
      });
    } else if (currentBucket === "observe") {
      badges.push({
        key: "strategy_observe",
        label: "OBSERVE SHIFT",
        tone: "border-violet-200 bg-violet-50 text-violet-700",
      });
    } else {
      badges.push({
        key: "strategy_shift",
        label: "STRATEGY SHIFT",
        tone: "border-violet-200 bg-violet-50 text-violet-700",
      });
    }
  }

  if (badges.length > 0) {
    return badges.slice(0, 2);
  }

  if (evaluation?.direction === "improved") {
    return [
      {
        key: "evaluation_improved",
        label: "IMPROVED",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      },
    ];
  }

  if (evaluation?.direction === "worsened") {
    return [
      {
        key: "evaluation_worsened",
        label: "WORSENED",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      },
    ];
  }

  if (evaluation?.direction === "neutral") {
    return [
      {
        key: "evaluation_neutral",
        label: "NEUTRAL",
        tone: "border-slate-200 bg-slate-50 text-slate-700",
      },
    ];
  }

  if (item.status === "running") {
    return [
      {
        key: "status_running",
        label: "RUNNING",
        tone: "border-blue-200 bg-blue-50 text-blue-700",
      },
    ];
  }

  if (item.status === "failed") {
    return [
      {
        key: "status_failed",
        label: "FAILED",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      },
    ];
  }

  return [
    {
      key: "status_planned",
      label: "PLANNED",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    },
  ];
}

function buildPriorityFeedbackText(args: {
  linkedPriority?: PriorityItem;
  evaluation?: ExecutionEvaluation;
  learningReflected?: boolean;
  rankSnapshot?: PrioritySnapshotLike;
}) {
  const { linkedPriority, evaluation, learningReflected, rankSnapshot } = args;

  if (!learningReflected) {
    return "아직 learning history 반영 전이므로 현재 Priority Queue 변화와 직접 연결되지 않았습니다.";
  }

  if (!linkedPriority && !rankSnapshot) {
    return "이 실행 결과는 learning history에 반영되었지만 현재 TOP Priority 카드에는 노출되지 않았습니다.";
  }

  if (!rankSnapshot) {
    return linkedPriority
      ? `이 실행 결과는 현재 Priority Rank #${linkedPriority.rank} 계산에 반영 중입니다.`
      : "현재 Priority 변화 기준점은 없습니다.";
  }

  const previousRank = getPrioritySnapshotPreviousRank(rankSnapshot);
  const currentRank = getPrioritySnapshotCurrentRank(rankSnapshot);
  const direction = getPrioritySnapshotDirection(rankSnapshot);

  if (direction === "up") {
    return `이 실행 결과는 Priority Rank #${previousRank ?? "-"} → #${currentRank ?? "-"} 상승 흐름과 함께 반영 중입니다.`;
  }

  if (direction === "down") {
    return `이 실행 결과는 Priority Rank #${previousRank ?? "-"} → #${currentRank ?? "-"} 하락 흐름과 함께 반영 중입니다.`;
  }

  if (direction === "new") {
    return `이 실행 결과는 이번 계산에서 신규 Priority Rank #${currentRank ?? "-"} 진입 흐름과 함께 반영 중입니다.`;
  }

  if (!evaluation) {
    return linkedPriority
      ? `이 실행 결과는 현재 Priority Rank #${linkedPriority.rank} 유지 계산에 반영 중입니다.`
      : "이 실행 결과는 현재 Priority 유지 계산에 반영 중입니다.";
  }

  if (evaluation.direction === "improved") {
    return "개선된 실행 결과가 현재 Priority 유지/보정 근거로 반영 중입니다.";
  }

  if (evaluation.direction === "worsened") {
    return "악화된 실행 결과가 현재 Priority 재검토 근거로 반영 중입니다.";
  }

  return "판단 보류 실행 결과가 현재 Priority 관찰 근거로 반영 중입니다.";
}

function buildPriorityChangeReasonLine(args: {
  rankSnapshot?: PrioritySnapshotLike;
  evaluation?: ExecutionEvaluation;
  linkedPriority?: PriorityItem;
  learningReflected?: boolean;
}) {
  const { rankSnapshot, evaluation, linkedPriority, learningReflected } = args;

  if (!learningReflected) {
    return "아직 Priority 변화 연결 전";
  }

  if (!rankSnapshot) {
    return linkedPriority
      ? `현재 #${linkedPriority.rank} 반영 중`
      : "현재 Priority 카드 미노출";
  }

  const currentRank = getPrioritySnapshotCurrentRank(rankSnapshot);
  const previousRank = getPrioritySnapshotPreviousRank(rankSnapshot);
  const direction = getPrioritySnapshotDirection(rankSnapshot);

  if (direction === "new") {
    return `이번 계산에서 새롭게 #${currentRank ?? "-"} 진입`;
  }

  if (direction === "up") {
    if (evaluation?.direction === "improved") {
      return `개선 실행 반영으로 #${previousRank ?? "-"} → #${currentRank ?? "-"} 상승`;
    }
    if (evaluation?.direction === "neutral") {
      return `관찰 신호 반영으로 #${previousRank ?? "-"} → #${currentRank ?? "-"} 상승`;
    }
    return `복합 보정으로 #${previousRank ?? "-"} → #${currentRank ?? "-"} 상승`;
  }

  if (direction === "down") {
    if (evaluation?.direction === "worsened") {
      return `악화 실행 반영으로 #${previousRank ?? "-"} → #${currentRank ?? "-"} 조정`;
    }
    if (evaluation?.direction === "neutral") {
      return `관찰 단계 재평가로 #${previousRank ?? "-"} → #${currentRank ?? "-"} 조정`;
    }
    return `복합 보정으로 #${previousRank ?? "-"} → #${currentRank ?? "-"} 조정`;
  }

  if (evaluation?.direction === "improved") {
    return `개선 신호 반영에도 #${currentRank ?? "-"} 유지`;
  }

  if (evaluation?.direction === "worsened") {
    return `주의 신호 반영으로 #${currentRank ?? "-"} 유지`;
  }

  if (evaluation?.direction === "neutral") {
    return `관찰 단계 유지로 #${currentRank ?? "-"} 유지`;
  }

  return `현재 #${currentRank ?? "-"} 유지`;
}

function buildExecutionPriorityImpactLine(args: {
  learningReflected?: boolean;
  evaluation?: ExecutionEvaluation;
  rankSnapshot?: PrioritySnapshotLike;
  linkedPriority?: PriorityItem;
}) {
  const { learningReflected, evaluation, rankSnapshot, linkedPriority } = args;

  if (!learningReflected) {
    return "아직 이 실행은 Priority 변화 계산에 반영되지 않았습니다.";
  }

  if (!rankSnapshot) {
    return linkedPriority
      ? `이 실행은 현재 Priority #${linkedPriority.rank} 계산 근거에 반영 중입니다.`
      : "이 실행은 learning history에 반영되었지만 현재 Top Priority 카드에는 직접 노출되지 않습니다.";
  }

  const direction = getPrioritySnapshotDirection(rankSnapshot);

  if (direction === "up") {
    return `이 실행 반영 후 Priority ${formatPriorityRankFlow(rankSnapshot)} 상승`;
  }

  if (direction === "down") {
    return `이 실행 반영 후 Priority ${formatPriorityRankFlow(rankSnapshot)} 조정`;
  }

  if (direction === "new") {
    return `이 실행 반영 후 Priority ${formatPriorityRankFlow(rankSnapshot)} 진입`;
  }

  if (evaluation?.direction === "improved") {
    return `이 실행은 개선 신호였지만 Priority ${formatPriorityRankFlow(rankSnapshot)} 유지`;
  }

  if (evaluation?.direction === "worsened") {
    return `이 실행은 악화 신호였고 Priority ${formatPriorityRankFlow(rankSnapshot)} 유지`;
  }

  if (evaluation?.direction === "neutral") {
    return `이 실행은 관찰 신호였고 Priority ${formatPriorityRankFlow(rankSnapshot)} 유지`;
  }

  return `이 실행 반영 후 Priority ${formatPriorityRankFlow(rankSnapshot)} 유지`;
}

function buildExecutionStrategyImpactLine(args: {
  learningReflected?: boolean;
  evaluation?: ExecutionEvaluation;
  strategyBucketSnapshot?: StrategySnapshotLike;
}) {
  const { learningReflected, evaluation, strategyBucketSnapshot } = args;

  if (!learningReflected) {
    return "아직 이 실행은 Strategy 변화 계산에 반영되지 않았습니다.";
  }

  if (!strategyBucketSnapshot) {
    return "이 실행은 learning history에 반영되었지만 현재 Strategy bucket 변화 기준점은 아직 없습니다.";
  }

  const direction = getStrategySnapshotDirection(strategyBucketSnapshot);

  if (direction === "new") {
    return `이 실행 반영 후 Strategy ${formatStrategyBucketFlow(strategyBucketSnapshot)} 진입`;
  }

  if (direction === "shifted") {
    return `이 실행 반영 후 Strategy ${formatStrategyBucketFlow(strategyBucketSnapshot)} 전환`;
  }

  if (evaluation?.direction === "improved") {
    return `이 실행은 개선 신호였지만 Strategy ${formatStrategyBucketFlow(strategyBucketSnapshot)} 유지`;
  }

  if (evaluation?.direction === "worsened") {
    return `이 실행은 악화 신호였고 Strategy ${formatStrategyBucketFlow(strategyBucketSnapshot)} 유지`;
  }

  if (evaluation?.direction === "neutral") {
    return `이 실행은 관찰 신호였고 Strategy ${formatStrategyBucketFlow(strategyBucketSnapshot)} 유지`;
  }

  return `이 실행 반영 후 Strategy ${formatStrategyBucketFlow(strategyBucketSnapshot)} 유지`;
}

function buildStrategyChangeReasonLine(args: {
  strategyBucketSnapshot?: StrategySnapshotLike;
  evaluation?: ExecutionEvaluation;
  learningReflected?: boolean;
}) {
  const { strategyBucketSnapshot, evaluation, learningReflected } = args;

  if (!learningReflected) {
    return "아직 Strategy 변화 연결 전";
  }

  if (!strategyBucketSnapshot) {
    return "현재 Strategy bucket 기준점 없음";
  }

  const previousBucket = getStrategySnapshotPreviousBucket(strategyBucketSnapshot);
  const currentBucket = getStrategySnapshotCurrentBucket(strategyBucketSnapshot);
  const direction = getStrategySnapshotDirection(strategyBucketSnapshot);

  if (direction === "new") {
    return `이번 계산에서 새롭게 ${currentBucket ?? "-"} 진입`;
  }

  if (
    direction === "shifted" &&
    previousBucket &&
    previousBucket !== currentBucket
  ) {
    if (evaluation?.direction === "improved") {
      return `개선 실행 반영으로 ${previousBucket} → ${currentBucket} 전환`;
    }
    if (evaluation?.direction === "worsened") {
      return `악화 실행 반영으로 ${previousBucket} → ${currentBucket} 전환`;
    }
    if (evaluation?.direction === "neutral") {
      return `관찰 신호 반영으로 ${previousBucket} → ${currentBucket} 전환`;
    }
    return `복합 보정으로 ${previousBucket} → ${currentBucket} 전환`;
  }

  if (evaluation?.direction === "improved") {
    return `${currentBucket ?? "-"} 유지 · 개선 신호 반영`;
  }

  if (evaluation?.direction === "worsened") {
    return `${currentBucket ?? "-"} 유지 · 주의 신호 반영`;
  }

  if (evaluation?.direction === "neutral") {
    return `${currentBucket ?? "-"} 유지 · 관찰 신호 반영`;
  }

  return `${currentBucket ?? "-"} 유지`;
}

function buildEffectivePrioritySnapshot(args: {
  item: ExecutionItem;
  liveRankSnapshot?: PriorityRankSnapshot;
}): PrioritySnapshotLike {
  const { item, liveRankSnapshot } = args;
  return item.executionOutcomeSnapshot?.priority ?? liveRankSnapshot;
}

function buildEffectiveStrategySnapshot(args: {
  item: ExecutionItem;
  liveStrategySnapshot?: StrategyBucketSnapshot;
}): StrategySnapshotLike {
  const { item, liveStrategySnapshot } = args;
  return item.executionOutcomeSnapshot?.strategy ?? liveStrategySnapshot;
}

function buildSelectedExecutionSummaryText(args: {
  selectedCount: number;
  isHighlighted: boolean;
  isRecentlyFocused: boolean;
}) {
  const { selectedCount, isHighlighted, isRecentlyFocused } = args;

  if (selectedCount <= 0) {
    return "";
  }

  if (isHighlighted) {
    return `현재 ${selectedCount}개 execution이 선택되어 강조 표시 중입니다. 위 요약 카드에서 클릭한 조건과 연결된 실행 묶음입니다.`;
  }

  if (isRecentlyFocused) {
    return `방금 확인한 ${selectedCount}개 execution이 최근 선택 상태로 남아 있습니다. 왜 여러 카드가 함께 강조됐는지 확인할 수 있습니다.`;
  }

  return `${selectedCount}개 execution이 선택되었습니다.`;
}

const StatusButton = memo(function StatusButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
});

const MetricCard = memo(function MetricCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
});

const FocusPriorityButton = memo(function FocusPriorityButton({
  onClick,
  children,
  className,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!onClick) {
    return <>{children}</>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-200",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
});

const ExecutionSelectionSummaryBar = memo(function ExecutionSelectionSummaryBar({
  selectedItems,
  selectedCount,
  isHighlighted,
  isRecentlyFocused,
}: {
  selectedItems: ExecutionItem[];
  selectedCount: number;
  isHighlighted: boolean;
  isRecentlyFocused: boolean;
}) {
  if (selectedCount <= 0) return null;

  const summaryText = buildSelectedExecutionSummaryText({
    selectedCount,
    isHighlighted,
    isRecentlyFocused,
  });

  const visibleTitles = selectedItems.slice(0, 3);
  const hiddenCount = Math.max(0, selectedItems.length - visibleTitles.length);

  return (
    <div
      className={[
        "rounded-[28px] border p-5 shadow-sm",
        isHighlighted
          ? "border-violet-200 bg-violet-50"
          : isRecentlyFocused
            ? "border-violet-100 bg-violet-50/60"
            : "border-slate-200 bg-slate-50",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-violet-700">
            SELECTED EXECUTION GROUP
          </div>

          <h3 className="mt-3 text-base font-semibold text-slate-900">
            현재 {selectedCount}개 실행이 함께 강조됨
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {summaryText}
          </p>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-violet-700">
          선택 execution{" "}
          <span className="font-semibold text-violet-900">
            {selectedCount}개
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        {visibleTitles.map((item) => (
          <div
            key={item.executionId}
            className="rounded-2xl border border-violet-100 bg-white px-4 py-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-500">
              {item.status}
            </div>
            <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
              {item.title}
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 ? (
        <div className="mt-3 text-xs font-semibold text-violet-700">
          외 {hiddenCount}개 실행이 함께 선택되어 있습니다.
        </div>
      ) : null}
    </div>
  );
});

const ExecutionCard = memo(function ExecutionCard({
  item,
  evaluation,
  learningReflected,
  onChangeStatus,
  priorityItems,
  rankSnapshotsByHypothesis,
  strategyBucketSnapshotsByHypothesis,
  highlightedPriorityHypothesisId,
  recentlyFocusedPriorityHypothesisId,
  highlightedExecutionIds,
  recentlyFocusedExecutionIds,
  onFocusPriority,
}: {
  item: ExecutionItem;
  evaluation?: ExecutionEvaluation;
  learningReflected?: boolean;
  onChangeStatus?: (executionId: string, status: ExecutionStatus) => void;
  priorityItems?: PriorityItem[];
  rankSnapshotsByHypothesis?: Record<string, PriorityRankSnapshot>;
  strategyBucketSnapshotsByHypothesis?: Record<string, StrategyBucketSnapshot>;
  highlightedPriorityHypothesisId?: string | null;
  recentlyFocusedPriorityHypothesisId?: string | null;
  highlightedExecutionIds?: string[];
  recentlyFocusedExecutionIds?: string[];
  onFocusPriority?: (hypothesisId: string) => void;
}) {
  const nextStatuses = getNextExecutionStatuses(item.status);
  const isTerminal = nextStatuses.length === 0;
  const showLearningFeedback = item.status === "done";

  const linkedPriority = useMemo(() => {
    if (!priorityItems || priorityItems.length === 0) return undefined;
    return priorityItems.find(
      (priority) => priority.hypothesisId === item.hypothesisId,
    );
  }, [priorityItems, item.hypothesisId]);

  const effectivePrioritySnapshot = buildEffectivePrioritySnapshot({
    item,
    liveRankSnapshot: rankSnapshotsByHypothesis?.[item.hypothesisId],
  });

  const effectiveStrategySnapshot = buildEffectiveStrategySnapshot({
    item,
    liveStrategySnapshot: strategyBucketSnapshotsByHypothesis?.[item.hypothesisId],
  });

  const isPriorityHighlighted =
    highlightedPriorityHypothesisId === item.hypothesisId;
  const isPriorityRecentlyFocused =
    !isPriorityHighlighted &&
    recentlyFocusedPriorityHypothesisId === item.hypothesisId;

  const isExecutionHighlighted =
    highlightedExecutionIds?.includes(item.executionId) ?? false;
  const isExecutionRecentlyFocused =
    !isExecutionHighlighted &&
    (recentlyFocusedExecutionIds?.includes(item.executionId) ?? false);

  const priorityFeedbackText = buildPriorityFeedbackText({
    linkedPriority,
    evaluation,
    learningReflected,
    rankSnapshot: effectivePrioritySnapshot,
  });

  const priorityChangeReasonLine = buildPriorityChangeReasonLine({
    rankSnapshot: effectivePrioritySnapshot,
    evaluation,
    linkedPriority,
    learningReflected,
  });

  const executionPriorityImpactLine = buildExecutionPriorityImpactLine({
    learningReflected,
    evaluation,
    rankSnapshot: effectivePrioritySnapshot,
    linkedPriority,
  });

  const executionStrategyImpactLine = buildExecutionStrategyImpactLine({
    learningReflected,
    evaluation,
    strategyBucketSnapshot: effectiveStrategySnapshot,
  });

  const strategyChangeReasonLine = buildStrategyChangeReasonLine({
    strategyBucketSnapshot: effectiveStrategySnapshot,
    evaluation,
    learningReflected,
  });

  const referenceHelperText = isPriorityHighlighted
    ? "현재 포커스된 Priority와 연결된 execution 항목입니다."
    : isPriorityRecentlyFocused
      ? "최근 확인한 Priority와 연결된 execution 항목입니다."
      : linkedPriority
        ? "현재 Priority Queue와 연결된 execution reference입니다."
        : "현재 Priority Queue와 직접 연결되지 않은 execution reference입니다.";

  const executionTopSummaryLine = buildExecutionTopSummaryLine({
    item,
    evaluation,
    prioritySnapshot: effectivePrioritySnapshot,
    strategySnapshot: effectiveStrategySnapshot,
  });

  const impactBadges = buildExecutionImpactBadges({
    item,
    evaluation,
    prioritySnapshot: effectivePrioritySnapshot,
    strategySnapshot: effectiveStrategySnapshot,
  });

  const handleFocusPriorityClick = () => {
    onFocusPriority?.(item.hypothesisId);
  };

  return (
    <article
      id={`execution-card-${item.executionId}`}
      className={[
        "rounded-[24px] border bg-white p-5 shadow-sm transition-all duration-500",
        isExecutionHighlighted
          ? FOCUSED_EXECUTION_CARD_CLASS
          : isExecutionRecentlyFocused
            ? RECENTLY_FOCUSED_EXECUTION_CARD_CLASS
            : isPriorityHighlighted
              ? FOCUSED_PRIORITY_CARD_CLASS
              : isPriorityRecentlyFocused
                ? RECENTLY_FOCUSED_PRIORITY_CARD_CLASS
                : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className={EXECUTION_META_BADGE_CLASS}>
                EXECUTION {item.priorityRank ? `P${item.priorityRank}` : "LOG"}
              </div>

              <FocusPriorityButton
                onClick={onFocusPriority ? handleFocusPriorityClick : undefined}
              >
                <span className={EXECUTION_ID_BADGE_CLASS}>
                  ID {item.hypothesisId}
                </span>
              </FocusPriorityButton>

              {linkedPriority ? (
                <FocusPriorityButton
                  onClick={onFocusPriority ? handleFocusPriorityClick : undefined}
                >
                  <span className={EXECUTION_ID_BADGE_CLASS}>
                    CURRENT PRIORITY #{linkedPriority.rank}
                  </span>
                </FocusPriorityButton>
              ) : (
                <span className={EXECUTION_ID_BADGE_CLASS}>
                  PRIORITY UNLINKED
                </span>
              )}

              {isPriorityHighlighted ? (
                <span className={FOCUSED_PRIORITY_BADGE_CLASS}>
                  FOCUSED PRIORITY
                </span>
              ) : null}

              {isPriorityRecentlyFocused ? (
                <span className={RECENTLY_FOCUSED_PRIORITY_BADGE_CLASS}>
                  RECENTLY FOCUSED
                </span>
              ) : null}

              {isExecutionHighlighted ? (
                <span className={FOCUSED_EXECUTION_BADGE_CLASS}>
                  FOCUSED EXECUTION
                </span>
              ) : null}

              {isExecutionRecentlyFocused ? (
                <span className={RECENTLY_FOCUSED_EXECUTION_BADGE_CLASS}>
                  RECENTLY FOCUSED EXECUTION
                </span>
              ) : null}
            </div>

            <div
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
                getStatusTone(item.status),
              ].join(" ")}
            >
              {item.status.toUpperCase()}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FocusPriorityButton
              onClick={onFocusPriority ? handleFocusPriorityClick : undefined}
              className="rounded-full"
            >
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-slate-700">
                {executionTopSummaryLine}
              </span>
            </FocusPriorityButton>

            {impactBadges.map((badge) => (
              <FocusPriorityButton
                key={badge.key}
                onClick={onFocusPriority ? handleFocusPriorityClick : undefined}
                className="rounded-full"
              >
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.08em]",
                    badge.tone,
                  ].join(" ")}
                >
                  {badge.label}
                </span>
              </FocusPriorityButton>
            ))}
          </div>

          <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            {item.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
        </div>
      </div>

      <div
        className={[
          "mt-4 rounded-2xl border px-4 py-3",
          isPriorityHighlighted
            ? "border-indigo-200 bg-indigo-50"
            : isPriorityRecentlyFocused
              ? "border-indigo-100 bg-indigo-50/60"
              : "border-slate-200 bg-slate-50",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Priority Reference
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FocusPriorityButton
              onClick={onFocusPriority ? handleFocusPriorityClick : undefined}
            >
              <span className={EXECUTION_ID_BADGE_CLASS}>
                ID {item.hypothesisId}
              </span>
            </FocusPriorityButton>

            {linkedPriority ? (
              <FocusPriorityButton
                onClick={onFocusPriority ? handleFocusPriorityClick : undefined}
              >
                <span className={EXECUTION_ID_BADGE_CLASS}>
                  CURRENT PRIORITY #{linkedPriority.rank}
                </span>
              </FocusPriorityButton>
            ) : (
              <span className={EXECUTION_ID_BADGE_CLASS}>
                PRIORITY UNLINKED
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-700">
          <div>
            {linkedPriority ? (
              <>
                현재 Priority Rank{" "}
                <span className="font-semibold text-slate-900">
                  #{linkedPriority.rank}
                </span>{" "}
                · PriorityQueue 반영 중
              </>
            ) : (
              "현재 PriorityQueue에는 포함되지 않음"
            )}
          </div>

          <div className="mt-2 text-xs leading-5 text-slate-500">
            {referenceHelperText}
          </div>

          {onFocusPriority ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleFocusPriorityClick}
                className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-indigo-700 transition hover:bg-indigo-50"
              >
                연결된 Priority 보기
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Target KPI" value={item.targetMetric} />
        <MetricCard label="Created" value={formatDateTime(item.createdAt)} />
        <MetricCard label="Updated" value={formatDateTime(item.updatedAt)} />
        <MetricCard label="Hypothesis ID" value={item.hypothesisId} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetricCard
          label="Baseline Value"
          value={formatMetricValue(item.baselineValue)}
        />
        <MetricCard
          label="Baseline Captured At"
          value={formatDateTime(item.baselineCapturedAt)}
        />
      </div>

      {item.status === "done" && evaluation ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Result Evaluation
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                실행 시작 시점 baseline과 현재 KPI를 비교한 overlay 평가입니다.
                기존 리포트 집계값은 변경하지 않습니다.
              </p>
            </div>

            <div
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold",
                getEvaluationTone(evaluation.direction),
              ].join(" ")}
            >
              {getEvaluationLabel(evaluation.direction)}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              KPI Change Flow
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatKpiFlowText({
                targetMetric: item.targetMetric,
                baselineValue: item.baselineValue,
                currentValue: evaluation.currentValue,
              })}
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {getEvaluationDescription(evaluation.direction)}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricCard label="Impact KPI" value={item.targetMetric} />
            <MetricCard
              label="Baseline"
              value={formatMetricValue(item.baselineValue)}
            />
            <MetricCard
              label="Current Value"
              value={formatMetricValue(evaluation.currentValue)}
            />
            <MetricCard
              label="Direction"
              value={
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                    getEvaluationTone(evaluation.direction),
                  ].join(" ")}
                >
                  {getEvaluationLabel(evaluation.direction)}
                </span>
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Delta"
              value={formatSignedMetricValue(evaluation.diffValue)}
            />
            <MetricCard
              label="Delta Rate"
              value={formatSignedPercent(evaluation.diffRate)}
            />
            <MetricCard
              label="Execution Result"
              value={`${item.targetMetric} 변화 반영`}
            />
          </div>
        </div>
      ) : null}

      {showLearningFeedback ? (
        <div
          className={[
            "mt-4 rounded-2xl border px-4 py-3",
            learningReflected
              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-slate-50 text-slate-700",
          ].join(" ")}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">
            Learning Feedback
          </div>
          <p className="mt-2 text-sm leading-6">
            {learningReflected
              ? "이번 실행 결과는 learning history에 반영되었고, 다음 Priority Queue 계산부터 보정 근거로 사용됩니다."
              : "이번 실행 결과는 아직 learning history 반영 대기 상태입니다."}
          </p>
        </div>
      ) : null}

      {showLearningFeedback ? (
        <>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Execution → Priority Impact
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-900">
              {executionPriorityImpactLine}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <MetricCard
                label="Previous Rank"
                value={
                  getPrioritySnapshotPreviousRank(effectivePrioritySnapshot) != null
                    ? `#${getPrioritySnapshotPreviousRank(effectivePrioritySnapshot)}`
                    : getPrioritySnapshotDirection(effectivePrioritySnapshot) === "new"
                      ? "NEW"
                      : "-"
                }
              />
              <MetricCard
                label="Current Rank"
                value={
                  getPrioritySnapshotCurrentRank(effectivePrioritySnapshot) != null
                    ? `#${getPrioritySnapshotCurrentRank(effectivePrioritySnapshot)}`
                    : linkedPriority
                      ? `#${linkedPriority.rank}`
                      : "-"
                }
              />
              <MetricCard
                label="Rank Flow"
                value={formatPriorityRankFlow(effectivePrioritySnapshot)}
              />
              <MetricCard
                label="Changed At"
                value={formatDateTime(
                  getPrioritySnapshotChangedAt(effectivePrioritySnapshot),
                )}
              />
            </div>

            {getPrioritySnapshotDirection(effectivePrioritySnapshot) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    getRankTrendTone(
                      getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                        "same",
                    ),
                  ].join(" ")}
                >
                  {getRankTrendLabel(
                    getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                      "same",
                  )}
                </span>

                {onFocusPriority ? (
                  <button
                    type="button"
                    onClick={handleFocusPriorityClick}
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-indigo-700 transition hover:bg-indigo-50"
                  >
                    Priority 카드 보기
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Priority Change Reason
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-900">
              {priorityChangeReasonLine}
            </p>

            {getPrioritySnapshotDirection(effectivePrioritySnapshot) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    getRankTrendTone(
                      getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                        "same",
                    ),
                  ].join(" ")}
                >
                  {getRankTrendLabel(
                    getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                      "same",
                  )}
                </span>

                {onFocusPriority ? (
                  <button
                    type="button"
                    onClick={handleFocusPriorityClick}
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-indigo-700 transition hover:bg-indigo-50"
                  >
                    연결 Priority 보기
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Priority Feedback
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              {priorityFeedbackText}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <MetricCard
                label="Previous Rank"
                value={
                  getPrioritySnapshotPreviousRank(effectivePrioritySnapshot) != null
                    ? `#${getPrioritySnapshotPreviousRank(effectivePrioritySnapshot)}`
                    : getPrioritySnapshotDirection(effectivePrioritySnapshot) === "new"
                      ? "NEW"
                      : "-"
                }
              />
              <MetricCard
                label="Current Rank"
                value={
                  getPrioritySnapshotCurrentRank(effectivePrioritySnapshot) != null
                    ? `#${getPrioritySnapshotCurrentRank(effectivePrioritySnapshot)}`
                    : linkedPriority
                      ? `#${linkedPriority.rank}`
                      : "-"
                }
              />
              <MetricCard
                label="Trend"
                value={
                  getPrioritySnapshotDirection(effectivePrioritySnapshot)
                    ? getRankTrendLabel(
                        getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                          "same",
                      )
                    : "-"
                }
              />
              <MetricCard
                label="Changed At"
                value={formatDateTime(
                  getPrioritySnapshotChangedAt(effectivePrioritySnapshot),
                )}
              />
            </div>

            {getPrioritySnapshotDirection(effectivePrioritySnapshot) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    getRankTrendTone(
                      getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                        "same",
                    ),
                  ].join(" ")}
                >
                  {getRankTrendLabel(
                    getPrioritySnapshotDirection(effectivePrioritySnapshot) ??
                      "same",
                  )}
                </span>

                {onFocusPriority ? (
                  <button
                    type="button"
                    onClick={handleFocusPriorityClick}
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-indigo-700 transition hover:bg-indigo-50"
                  >
                    PriorityQueue 이동
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Execution → Strategy Impact
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-900">
              {executionStrategyImpactLine}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <MetricCard
                label="Previous Strategy"
                value={formatStrategyBucketLabel(
                  getStrategySnapshotPreviousBucket(effectiveStrategySnapshot),
                )}
              />
              <MetricCard
                label="Current Strategy"
                value={formatStrategyBucketLabel(
                  getStrategySnapshotCurrentBucket(effectiveStrategySnapshot),
                )}
              />
              <MetricCard
                label="Strategy Flow"
                value={formatStrategyBucketFlow(effectiveStrategySnapshot)}
              />
              <MetricCard
                label="Changed At"
                value={formatDateTime(
                  getStrategySnapshotChangedAt(effectiveStrategySnapshot),
                )}
              />
            </div>

            {getStrategySnapshotDirection(effectiveStrategySnapshot) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    getStrategyShiftTone(
                      getStrategySnapshotDirection(effectiveStrategySnapshot) ??
                        "same",
                    ),
                  ].join(" ")}
                >
                  {getStrategyShiftLabel(
                    getStrategySnapshotDirection(effectiveStrategySnapshot) ??
                      "same",
                  )}
                </span>

                {onFocusPriority ? (
                  <button
                    type="button"
                    onClick={handleFocusPriorityClick}
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-indigo-700 transition hover:bg-indigo-50"
                  >
                    연결 Priority 보기
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Strategy Change Reason
            </div>

            <p className="mt-2 text-sm font-semibold text-slate-900">
              {strategyChangeReasonLine}
            </p>

            {getStrategySnapshotDirection(effectiveStrategySnapshot) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    getStrategyShiftTone(
                      getStrategySnapshotDirection(effectiveStrategySnapshot) ??
                        "same",
                    ),
                  ].join(" ")}
                >
                  {getStrategyShiftLabel(
                    getStrategySnapshotDirection(effectiveStrategySnapshot) ??
                      "same",
                  )}
                </span>

                {onFocusPriority ? (
                  <button
                    type="button"
                    onClick={handleFocusPriorityClick}
                    className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-indigo-700 transition hover:bg-indigo-50"
                  >
                    Priority로 이동
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Status Flow
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">
            Current: {getStatusLabel(item.status)}
          </span>

          {isTerminal ? (
            <span className="text-slate-500">
              이 상태는 종료 상태이므로 추가 전이가 없습니다.
            </span>
          ) : (
            <span className="text-slate-500">
              다음 가능 상태:{" "}
              <span className="font-semibold text-slate-700">
                {nextStatuses.map(getStatusLabel).join(", ")}
              </span>
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <StatusButton active={item.status === "planned"} disabled>
            Planned
          </StatusButton>

          <StatusButton
            active={item.status === "running"}
            disabled={!nextStatuses.includes("running")}
            onClick={() => onChangeStatus?.(item.executionId, "running")}
          >
            Running
          </StatusButton>

          <StatusButton
            active={item.status === "done"}
            disabled={!nextStatuses.includes("done")}
            onClick={() => onChangeStatus?.(item.executionId, "done")}
          >
            Done
          </StatusButton>

          <StatusButton
            active={item.status === "failed"}
            disabled={!nextStatuses.includes("failed")}
            onClick={() => onChangeStatus?.(item.executionId, "failed")}
          >
            Failed
          </StatusButton>
        </div>
      </div>

      <div className="mt-1 hidden text-[10px] text-transparent" aria-hidden="true">
        execution-priority-visual-alignment-guard
      </div>
    </article>
  );
});

function ExecutionLogComponent({
  items,
  onChangeStatus,
  evaluations = {},
  learningReflections = {},
  priorityItems,
  rankSnapshotsByHypothesis,
  strategyBucketSnapshotsByHypothesis,
  highlightedPriorityHypothesisId,
  recentlyFocusedPriorityHypothesisId,
  highlightedExecutionIds = [],
  recentlyFocusedExecutionIds = [],
  onFocusPriority,
}: Props) {
  const selectedExecutionIds =
    highlightedExecutionIds.length > 0
      ? highlightedExecutionIds
      : recentlyFocusedExecutionIds;

  const selectedExecutionItems = useMemo(() => {
    if (selectedExecutionIds.length === 0) return [];
    const selectedIdSet = new Set(selectedExecutionIds);
    return items.filter((item) => selectedIdSet.has(item.executionId));
  }, [items, selectedExecutionIds]);

  const hasHighlightedExecutions = highlightedExecutionIds.length > 0;
  const hasRecentlyFocusedExecutions =
    !hasHighlightedExecutions && recentlyFocusedExecutionIds.length > 0;

  return (
    <section id="execution-log-section" className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              ACTION EXECUTION LAYER V1
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              실행 로그
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              추천된 액션을 실제 운영 실행 단위로 기록합니다. 현재 단계에서는
              execution metadata만 안전하게 관리하며, 기존 리포트 집계값과는
              완전히 분리된 overlay 레이어로 동작합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              누적 실행 수{" "}
              <span className="font-semibold text-slate-900">{items.length}개</span>
            </div>
          </div>
        </div>
      </div>

      <ExecutionSelectionSummaryBar
        selectedItems={selectedExecutionItems}
        selectedCount={selectedExecutionItems.length}
        isHighlighted={hasHighlightedExecutions}
        isRecentlyFocused={hasRecentlyFocusedExecutions}
      />

      {items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm leading-6 text-slate-600">
          아직 실행된 액션이 없습니다. Priority Queue에서 실행 버튼을 눌러
          추천 → 실행 → 결과 측정 루프를 시작하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => (
            <ExecutionCard
              key={item.executionId}
              item={item}
              evaluation={evaluations[item.executionId]}
              learningReflected={learningReflections[item.executionId]}
              onChangeStatus={onChangeStatus}
              priorityItems={priorityItems}
              rankSnapshotsByHypothesis={rankSnapshotsByHypothesis}
              strategyBucketSnapshotsByHypothesis={
                strategyBucketSnapshotsByHypothesis
              }
              highlightedPriorityHypothesisId={highlightedPriorityHypothesisId}
              recentlyFocusedPriorityHypothesisId={recentlyFocusedPriorityHypothesisId}
              highlightedExecutionIds={highlightedExecutionIds}
              recentlyFocusedExecutionIds={recentlyFocusedExecutionIds}
              onFocusPriority={onFocusPriority}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(ExecutionLogComponent);
import type {
  PriorityItem,
  PriorityLearningHistoryItem,
} from "@/src/lib/decision/priority";

export type ExecutionStatus = "planned" | "running" | "done" | "failed";

export type ExecutionStrategyBucketKey =
  | "expand"
  | "optimize"
  | "review"
  | "observe";

export type ExecutionOutcomePrioritySnapshot = {
  beforeRank?: number;
  afterRank?: number;
  direction: "up" | "down" | "same" | "new";
  changedAt?: string;
};

export type ExecutionOutcomeStrategySnapshot = {
  beforeBucket?: ExecutionStrategyBucketKey;
  afterBucket?: ExecutionStrategyBucketKey;
  direction: "shifted" | "same" | "new";
  changedAt?: string;
};

export type ExecutionOutcomeSnapshot = {
  recordedAt?: string;
  priority?: ExecutionOutcomePrioritySnapshot;
  strategy?: ExecutionOutcomeStrategySnapshot;
};

export type ExecutionItem = {
  executionId: string;
  hypothesisId: string;
  priorityRank?: number;
  title: string;
  summary: string;
  targetMetric: string;
  status: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
  note?: string;

  baselineValue?: number;
  baselineCapturedAt?: string;

  executionOutcomeSnapshot?: ExecutionOutcomeSnapshot;
};

type UpdateExecutionStatusOptions = {
  baselineValue?: number;
  baselineCapturedAt?: string;
};

type AppendLearningHistoryArgs = {
  history: PriorityLearningHistoryItem[];
  item: ExecutionItem;
  direction: PriorityLearningHistoryItem["direction"];
  evaluatedAt?: string;
};

type AttachExecutionOutcomeSnapshotArgs = {
  beforePriorityRank?: number;
  afterPriorityRank?: number;
  beforeStrategyBucket?: ExecutionStrategyBucketKey;
  afterStrategyBucket?: ExecutionStrategyBucketKey;
  changedAt?: string;
};

const EXECUTION_STATUS_TRANSITIONS: Record<
  ExecutionStatus,
  readonly ExecutionStatus[]
> = {
  planned: ["running", "failed"],
  running: ["done", "failed"],
  done: [],
  failed: [],
};

function nowIso() {
  return new Date().toISOString();
}

function createExecutionId() {
  return `execution_${Math.random().toString(36).slice(2, 10)}`;
}

function inferTargetMetricFromPriorityItem(item: PriorityItem): string {
  const title = String(item.title || "").toLowerCase();
  const summary = String(item.summary || "").toLowerCase();
  const text = `${title} ${summary}`;

  if (text.includes("roas")) return "ROAS";
  if (text.includes("cvr")) return "CVR";
  if (text.includes("ctr")) return "CTR";
  if (text.includes("cpc")) return "CPC";
  if (text.includes("cpa")) return "CPA";
  if (text.includes("conversion") || text.includes("전환")) return "CONVERSIONS";
  if (text.includes("revenue") || text.includes("매출")) return "REVENUE";
  if (text.includes("click") || text.includes("클릭")) return "CLICKS";
  if (text.includes("impression") || text.includes("노출")) return "IMPRESSIONS";

  return "PRIMARY_METRIC";
}

function resolvePriorityOutcomeDirection(args: {
  beforePriorityRank?: number;
  afterPriorityRank?: number;
}): ExecutionOutcomePrioritySnapshot["direction"] {
  const { beforePriorityRank, afterPriorityRank } = args;

  if (afterPriorityRank == null) return "same";
  if (beforePriorityRank == null) return "new";
  if (afterPriorityRank < beforePriorityRank) return "up";
  if (afterPriorityRank > beforePriorityRank) return "down";
  return "same";
}

function resolveStrategyOutcomeDirection(args: {
  beforeStrategyBucket?: ExecutionStrategyBucketKey;
  afterStrategyBucket?: ExecutionStrategyBucketKey;
}): ExecutionOutcomeStrategySnapshot["direction"] {
  const { beforeStrategyBucket, afterStrategyBucket } = args;

  if (!afterStrategyBucket) return "same";
  if (!beforeStrategyBucket) return "new";
  if (beforeStrategyBucket !== afterStrategyBucket) return "shifted";
  return "same";
}

export function createExecutionItemFromPriority(item: PriorityItem): ExecutionItem {
  const now = nowIso();

  return {
    executionId: createExecutionId(),
    hypothesisId: item.hypothesisId,
    priorityRank: item.rank,
    title: item.title,
    summary: item.summary,
    targetMetric: inferTargetMetricFromPriorityItem(item),
    status: "planned",
    createdAt: now,
    updatedAt: now,
    note: "",
  };
}

export function canTransitionExecutionStatus(
  currentStatus: ExecutionStatus,
  nextStatus: ExecutionStatus,
): boolean {
  if (currentStatus === nextStatus) return true;
  return EXECUTION_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

export function getNextExecutionStatuses(
  status: ExecutionStatus,
): ExecutionStatus[] {
  return [...EXECUTION_STATUS_TRANSITIONS[status]];
}

export function shouldCaptureBaselineOnStatusChange(
  item: ExecutionItem,
  nextStatus: ExecutionStatus,
): boolean {
  return (
    item.status === "planned" &&
    nextStatus === "running" &&
    item.baselineValue == null &&
    !item.baselineCapturedAt
  );
}

export function shouldAppendLearningHistoryOnStatusChange(
  item: ExecutionItem,
  nextStatus: ExecutionStatus,
): boolean {
  return item.status === "running" && nextStatus === "done";
}

export function hasLearningHistoryForExecution(
  history: PriorityLearningHistoryItem[],
  executionId: string,
): boolean {
  return history.some((item) => item.executionId === executionId);
}

export function updateExecutionItemStatus(
  item: ExecutionItem,
  status: ExecutionStatus,
  options?: UpdateExecutionStatusOptions,
): ExecutionItem {
  if (!canTransitionExecutionStatus(item.status, status)) {
    return item;
  }

  if (item.status === status) {
    return item;
  }

  const updatedAt = nowIso();
  const shouldCaptureBaseline = shouldCaptureBaselineOnStatusChange(item, status);

  return {
    ...item,
    status,
    updatedAt,
    baselineValue: shouldCaptureBaseline
      ? options?.baselineValue
      : item.baselineValue,
    baselineCapturedAt: shouldCaptureBaseline
      ? options?.baselineCapturedAt ?? updatedAt
      : item.baselineCapturedAt,
  };
}

export function attachExecutionOutcomeSnapshot(
  item: ExecutionItem,
  args: AttachExecutionOutcomeSnapshotArgs,
): ExecutionItem {
  const {
    beforePriorityRank,
    afterPriorityRank,
    beforeStrategyBucket,
    afterStrategyBucket,
    changedAt,
  } = args;

  const safeChangedAt = changedAt ?? item.updatedAt ?? nowIso();

  return {
    ...item,
    executionOutcomeSnapshot: {
      recordedAt: safeChangedAt,
      priority: {
        beforeRank: beforePriorityRank,
        afterRank: afterPriorityRank,
        direction: resolvePriorityOutcomeDirection({
          beforePriorityRank,
          afterPriorityRank,
        }),
        changedAt: safeChangedAt,
      },
      strategy: {
        beforeBucket: beforeStrategyBucket,
        afterBucket: afterStrategyBucket,
        direction: resolveStrategyOutcomeDirection({
          beforeStrategyBucket,
          afterStrategyBucket,
        }),
        changedAt: safeChangedAt,
      },
    },
  };
}

export function appendPriorityLearningHistory(
  args: AppendLearningHistoryArgs,
): PriorityLearningHistoryItem[] {
  const { history, item, direction, evaluatedAt } = args;

  if (hasLearningHistoryForExecution(history, item.executionId)) {
    return history;
  }

  const nextEntry: PriorityLearningHistoryItem = {
    executionId: item.executionId,
    hypothesisId: item.hypothesisId,
    direction,
    evaluatedAt: evaluatedAt ?? nowIso(),
  };

  return [...history, nextEntry];
}
"use client";

import { memo, useState } from "react";
import type {
  StrategyActionType,
  StrategyPlaybook,
  StrategySeverity,
  StrategyBucket,
  StrategyDriver,
  RecentExecutionTrend,
} from "@/src/lib/decision/strategy";

type StrategyBucketSnapshot = {
  hypothesisId: string;
  previousBucket?: StrategyBucket["key"];
  currentBucket: StrategyBucket["key"];
  direction: "shifted" | "same" | "new";
  changedAt?: string;
};

type Props = {
  playbook: StrategyPlaybook;
  strategyBucketSnapshotsByHypothesis?: Record<string, StrategyBucketSnapshot>;
  onFocusPriority?: (hypothesisId: string) => void;
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

function getBucketTone(key: StrategyBucket["key"]) {
  switch (key) {
    case "expand":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "optimize":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "review":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "observe":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getSeverityTone(severity: StrategySeverity) {
  switch (severity) {
    case "critical":
      return "border-rose-300 bg-rose-100 text-rose-800";
    case "high":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "medium":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "low":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getActionTypeTone(actionType: StrategyActionType) {
  switch (actionType) {
    case "scale":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "tune":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "pause":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "monitor":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getDriverLabel(driver: StrategyDriver) {
  switch (driver) {
    case "rank_up":
      return "rank up";
    case "positive_learning":
      return "positive learning";
    case "negative_learning":
      return "negative learning";
    case "high_impact_low_confidence":
      return "high impact / low confidence";
    case "neutral_observation":
      return "neutral observation";
    case "new_priority":
      return "new priority";
    case "execution_improved":
      return "execution improved";
    case "execution_worsened":
      return "execution worsened";
    case "execution_neutral":
      return "execution neutral";
    case "stable_priority":
    default:
      return "stable priority";
  }
}

function getTrendLabel(direction?: "up" | "down" | "same" | "new") {
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

function getRecentExecutionTrendLabel(trend?: RecentExecutionTrend) {
  switch (trend) {
    case "improving":
      return "improving";
    case "weakening":
      return "weakening";
    case "unstable":
      return "unstable";
    case "flat":
    default:
      return "flat";
  }
}

function getRecentExecutionTrendTone(trend?: RecentExecutionTrend) {
  switch (trend) {
    case "improving":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "weakening":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "unstable":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "flat":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getStrategyShiftTone(direction: StrategyBucketSnapshot["direction"]) {
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

function getOperatingStageLabel(bucketKey: StrategyBucket["key"]) {
  switch (bucketKey) {
    case "expand":
      return "STEP 03 · 실행 확대";
    case "optimize":
      return "STEP 03 · 실행 최적화";
    case "review":
      return "STEP 04 · 리뷰/재검토";
    case "observe":
    default:
      return "STEP 04 · 관찰";
  }
}

function getOperatingStageDescription(bucketKey: StrategyBucket["key"]) {
  switch (bucketKey) {
    case "expand":
      return "성과 신호가 있는 항목을 더 밀어붙이는 실행 구간입니다.";
    case "optimize":
      return "효율을 개선하거나 조건을 조정해 목표 gap을 줄이는 실행 구간입니다.";
    case "review":
      return "악화·불확실 신호를 다시 점검해 손실 확산을 막는 리뷰 구간입니다.";
    case "observe":
    default:
      return "무리하게 움직이지 않고 추가 표본과 추세를 기다리는 관찰 구간입니다.";
  }
}

function getActionInstructionLabel(actionType: StrategyActionType) {
  switch (actionType) {
    case "scale":
      return "확대 실행";
    case "tune":
      return "조건 조정";
    case "pause":
      return "중단/재검토";
    case "monitor":
    default:
      return "관찰 유지";
  }
}

function formatSignedPercent(value?: number) {
  if (value == null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function formatMetricValue(value?: number) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  });
}

function formatTrendStrength(value?: number) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}`;
}

function formatStrategyBucketLabel(bucket?: StrategyBucket["key"]) {
  if (!bucket) return "-";
  return bucket;
}

function buildRecentExecutionSummaryLine(
  item: StrategyBucket["items"][number],
) {
  const count = item.recentExecutionCount ?? 0;
  const improved = item.recentImprovedCount ?? 0;
  const worsened = item.recentWorsenedCount ?? 0;
  const neutral = item.recentNeutralCount ?? 0;

  if (count <= 0) {
    return "최근 execution 표본 없음";
  }

  return `최근 ${count}건 · +${improved} / -${worsened} / =${neutral}`;
}

function buildStrategyShiftLine(
  snapshot: StrategyBucketSnapshot | undefined,
  fallbackBucketKey: StrategyBucket["key"],
) {
  if (!snapshot) {
    return `전략 변화 기준점이 없어 현재 ${fallbackBucketKey} 전략만 표시합니다.`;
  }

  if (snapshot.direction === "new") {
    return `전략 변화: 새롭게 ${snapshot.currentBucket} 진입`;
  }

  if (
    snapshot.direction === "shifted" &&
    snapshot.previousBucket &&
    snapshot.previousBucket !== snapshot.currentBucket
  ) {
    return `전략 변화: ${snapshot.previousBucket} → ${snapshot.currentBucket}`;
  }

  return `전략 변화: ${snapshot.currentBucket} 유지`;
}

function buildCompactStrategySummary(item: StrategyBucket["items"][number]) {
  const trend = getRecentExecutionTrendLabel(item.recentExecutionTrend);
  const driver = getDriverLabel(item.driver);
  const count = item.recentExecutionCount ?? 0;

  if (count > 0) {
    return `${item.metricType} 기준 · ${driver} · 최근 ${count}건 ${trend} 흐름으로 ${item.actionType} 판단`;
  }

  return `${item.metricType} 기준 · ${driver} · execution 표본 전 ${item.actionType} 판단`;
}

const DetailBlock = memo(function DetailBlock({
  title,
  children,
  strong,
}: {
  title: string;
  children: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </div>
      <p
        className={[
          "mt-2 text-sm leading-6",
          strong ? "font-semibold text-slate-900" : "text-slate-700",
        ].join(" ")}
      >
        {children}
      </p>
    </div>
  );
});

const StrategyItemCard = memo(function StrategyItemCard({
  item,
  bucketKey,
  strategyBucketSnapshot,
  onFocusPriority,
  highlightedHypothesisId,
  recentlyFocusedHypothesisId,
}: {
  item: StrategyBucket["items"][number];
  bucketKey: StrategyBucket["key"];
  strategyBucketSnapshot?: StrategyBucketSnapshot;
  onFocusPriority?: (hypothesisId: string) => void;
  highlightedHypothesisId?: string | null;
  recentlyFocusedHypothesisId?: string | null;
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const isHighlighted = highlightedHypothesisId === item.hypothesisId;
  const isRecentlyFocused =
    !isHighlighted && recentlyFocusedHypothesisId === item.hypothesisId;

  const hasRecentExecutionTrend = (item.recentExecutionCount ?? 0) > 0;
  const strategyShiftLine = buildStrategyShiftLine(
    strategyBucketSnapshot,
    bucketKey,
  );
  const compactSummary = buildCompactStrategySummary(item);

  return (
    <article
      className={[
        "rounded-[24px] border bg-white p-5 shadow-sm transition-all duration-500",
        isHighlighted
          ? FOCUSED_PRIORITY_CARD_CLASS
          : isRecentlyFocused
            ? RECENTLY_FOCUSED_PRIORITY_CARD_CLASS
            : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em]",
              getBucketTone(bucketKey),
            ].join(" ")}
          >
            {bucketKey.toUpperCase()}
          </span>

          <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-indigo-700">
            {getOperatingStageLabel(bucketKey)}
          </span>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
            PRIORITY #{item.rank}
          </span>

          <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-indigo-700">
            SCORE {(item.score * 100).toFixed(1)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isHighlighted ? (
            <span className={FOCUSED_PRIORITY_BADGE_CLASS}>FOCUSED PRIORITY</span>
          ) : null}

          {isRecentlyFocused ? (
            <span className={RECENTLY_FOCUSED_PRIORITY_BADGE_CLASS}>
              RECENTLY FOCUSED
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Operating Sheet Position
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
          {getOperatingStageDescription(bucketKey)}
        </p>
      </div>

      <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>

      <p className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm font-semibold leading-6 text-slate-900">
        {compactSummary}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            1. 판단 근거
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {getDriverLabel(item.driver)} 신호와 {item.metricType} 기준으로 현재
            전략 버킷이 정해졌습니다.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            2. 실행 지시
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
            {getActionInstructionLabel(item.actionType)} · {item.actionLine}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            3. 리뷰 기준
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {buildRecentExecutionSummaryLine(item)} 기준으로 다음 Priority와
            Strategy 이동 여부를 확인합니다.
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>metric {item.metricType}</span>
        {item.latestExecution ? (
          <>
            <span>·</span>
            <span>latest execution {item.latestExecution.targetMetric}</span>
          </>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={[
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            getSeverityTone(item.severity),
          ].join(" ")}
        >
          severity {item.severity}
        </span>

        <span
          className={[
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            getActionTypeTone(item.actionType),
          ].join(" ")}
        >
          action {item.actionType}
        </span>

        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          driver {getDriverLabel(item.driver)}
        </span>

        {hasRecentExecutionTrend ? (
          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              getRecentExecutionTrendTone(item.recentExecutionTrend),
            ].join(" ")}
          >
            recent {getRecentExecutionTrendLabel(item.recentExecutionTrend)}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>{buildRecentExecutionSummaryLine(item)}</span>
        {hasRecentExecutionTrend ? (
          <>
            <span>·</span>
            <span>strength {formatTrendStrength(item.trendStrength)}</span>
          </>
        ) : null}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Strategy Change
        </div>

        <p className="mt-2 text-sm font-semibold text-slate-900">
          {strategyShiftLine}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={[
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              getStrategyShiftTone(strategyBucketSnapshot?.direction ?? "same"),
            ].join(" ")}
          >
            {strategyBucketSnapshot?.direction === "shifted"
              ? "shifted"
              : strategyBucketSnapshot?.direction === "new"
                ? "new"
                : "same"}
          </span>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            prev {formatStrategyBucketLabel(strategyBucketSnapshot?.previousBucket)}
          </span>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            now {formatStrategyBucketLabel(strategyBucketSnapshot?.currentBucket ?? bucketKey)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Impact
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Math.round(item.impact * 100)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Confidence
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Math.round(item.confidence * 100)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Ease
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Math.round(item.ease * 100)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Trend
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {getTrendLabel(item.rankSnapshot?.direction)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Action Priority
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {item.actionPriority}
          </div>
        </div>
      </div>

      {item.latestExecutionEvaluation ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Latest Execution Signal
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Direction
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {item.latestExecutionEvaluation.direction}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Current Value
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatMetricValue(item.latestExecutionEvaluation.currentValue)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Delta
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatMetricValue(item.latestExecutionEvaluation.diffValue)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Delta Rate
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatSignedPercent(item.latestExecutionEvaluation.diffRate)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasRecentExecutionTrend ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Recent Execution Trend
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                getRecentExecutionTrendTone(item.recentExecutionTrend),
              ].join(" ")}
            >
              {getRecentExecutionTrendLabel(item.recentExecutionTrend)}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              recent {item.recentExecutionCount ?? 0}건
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              + {item.recentImprovedCount ?? 0}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700">
              - {item.recentWorsenedCount ?? 0}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              = {item.recentNeutralCount ?? 0}
            </span>

            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              strength {formatTrendStrength(item.trendStrength)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setIsDetailOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {isDetailOpen ? "전략 근거 접기" : "전략 근거 자세히 보기"}
        </button>
      </div>

      {isDetailOpen ? (
        <div className="mt-4 grid grid-cols-1 gap-3">
          <DetailBlock title="Strategy Reason">{item.reasonLine}</DetailBlock>
          <DetailBlock title="Action Now" strong>
            {item.actionLine}
          </DetailBlock>
          <DetailBlock title="Risk Check">{item.riskLine}</DetailBlock>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs leading-5 text-slate-500">
          hypothesisId: {item.hypothesisId}
        </div>

        <button
          type="button"
          onClick={() => onFocusPriority?.(item.hypothesisId)}
          className="inline-flex items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          해당 Priority 보기
        </button>
      </div>
    </article>
  );
});

const StrategyBucketSection = memo(function StrategyBucketSection({
  bucket,
  strategyBucketSnapshotsByHypothesis,
  onFocusPriority,
  highlightedHypothesisId,
  recentlyFocusedHypothesisId,
}: {
  bucket: StrategyBucket;
  strategyBucketSnapshotsByHypothesis?: Record<string, StrategyBucketSnapshot>;
  onFocusPriority?: (hypothesisId: string) => void;
  highlightedHypothesisId?: string | null;
  recentlyFocusedHypothesisId?: string | null;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={[
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em]",
                  getBucketTone(bucket.key),
                ].join(" ")}
              >
                {bucket.title.toUpperCase()}
              </div>

              <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-indigo-700">
                {getOperatingStageLabel(bucket.key)}
              </div>
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              {bucket.title}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {bucket.description}
            </p>

            <p className="mt-3 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-800">
              {getOperatingStageDescription(bucket.key)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              전략 수{" "}
              <span className="font-semibold text-slate-900">
                {bucket.items.length}개
              </span>
            </div>
          </div>
        </div>
      </div>

      {bucket.items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm leading-6 text-slate-600">
          현재 이 버킷에 분류된 전략이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {bucket.items.map((item) => (
            <StrategyItemCard
              key={`${bucket.key}-${item.hypothesisId}`}
              item={item}
              bucketKey={bucket.key}
              strategyBucketSnapshot={
                strategyBucketSnapshotsByHypothesis?.[item.hypothesisId]
              }
              onFocusPriority={onFocusPriority}
              highlightedHypothesisId={highlightedHypothesisId}
              recentlyFocusedHypothesisId={recentlyFocusedHypothesisId}
            />
          ))}
        </div>
      )}
    </section>
  );
});

function StrategyPlaybookComponent({
  playbook,
  strategyBucketSnapshotsByHypothesis,
  onFocusPriority,
  highlightedHypothesisId,
  recentlyFocusedHypothesisId,
}: Props) {
  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
              STRATEGY PLAYBOOK
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              이번 달 목표 달성을 위한 실행 전략 묶음
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              현재 Priority Queue를 운영 실행 관점으로 재분류한 전략 레이어입니다.
              점수 계산은 그대로 두고, 지금 무엇을 확대/최적화/재검토/관찰해야
              하는지만 정리합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div>
              전체 전략 버킷{" "}
              <span className="font-semibold text-slate-900">
                {playbook.buckets.length}개
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Expand
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              성과 신호가 있는 실행 확대
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Optimize
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              목표 gap을 줄이는 조건 조정
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Review
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              악화 신호의 원인 재검토
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Observe
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              추가 표본을 기다리는 관찰
            </p>
          </div>
        </div>
      </div>

      {playbook.buckets.map((bucket) => (
        <StrategyBucketSection
          key={bucket.key}
          bucket={bucket}
          strategyBucketSnapshotsByHypothesis={strategyBucketSnapshotsByHypothesis}
          onFocusPriority={onFocusPriority}
          highlightedHypothesisId={highlightedHypothesisId}
          recentlyFocusedHypothesisId={recentlyFocusedHypothesisId}
        />
      ))}
    </section>
  );
}

export default memo(StrategyPlaybookComponent);
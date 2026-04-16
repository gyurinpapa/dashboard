"use client";

import { memo } from "react";
import type { ReactNode } from "react";
import {
  getNextExecutionStatuses,
  type ExecutionItem,
  type ExecutionStatus,
} from "@/src/lib/decision/execution";

export type ExecutionEvaluation = {
  executionId: string;
  currentValue: number;
  diffValue: number;
  diffRate: number;
  direction: "improved" | "worsened" | "neutral";
};

type Props = {
  items: ExecutionItem[];
  onChangeStatus?: (executionId: string, status: ExecutionStatus) => void;
  evaluations?: Record<string, ExecutionEvaluation>;
  learningReflections?: Record<string, boolean>;
};

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

const ExecutionCard = memo(function ExecutionCard({
  item,
  evaluation,
  learningReflected,
  onChangeStatus,
}: {
  item: ExecutionItem;
  evaluation?: ExecutionEvaluation;
  learningReflected?: boolean;
  onChangeStatus?: (executionId: string, status: ExecutionStatus) => void;
}) {
  const nextStatuses = getNextExecutionStatuses(item.status);
  const isTerminal = nextStatuses.length === 0;
  const showLearningFeedback = item.status === "done";

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
            EXECUTION {item.priorityRank ? `P${item.priorityRank}` : "LOG"}
          </div>

          <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
            {item.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
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

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              label="Current Value"
              value={formatMetricValue(evaluation.currentValue)}
            />
            <MetricCard
              label="Delta"
              value={formatSignedMetricValue(evaluation.diffValue)}
            />
            <MetricCard
              label="Delta Rate"
              value={formatSignedPercent(evaluation.diffRate)}
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
    </article>
  );
});

function ExecutionLogComponent({
  items,
  onChangeStatus,
  evaluations = {},
  learningReflections = {},
}: Props) {
  return (
    <section className="space-y-4">
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
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(ExecutionLogComponent);
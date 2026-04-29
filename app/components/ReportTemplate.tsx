// app/components/ReportTemplate.tsx
"use client";

import dynamic from "next/dynamic";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  GoalState,
  MonthKey,
  ReportType,
  TabKey,
  WeekKey,
} from "@/src/lib/report/types";

import type { ReportPeriod } from "@/src/lib/report/period";
import { filterRowsByReportPeriod } from "@/src/lib/report/period";

import { groupByKeyword } from "@/src/lib/report/keyword";
import { useLocalStorageState } from "@/src/useLocalStorageState";
import { useInsights } from "@/app/hooks/useInsights";

import { useReportAggregates } from "@/src/lib/report/useReportAggregates";
import { buildKeywordInsight } from "@/src/lib/report/insights/buildKeywordInsight";
import { buildDailySummaryRows } from "@/src/lib/report/aggregate";

import { buildDecisionEngineInput } from "@/src/lib/decision/input";
import { buildGoalSnapshot } from "@/src/lib/decision/goal";
import { buildHypotheses } from "@/src/lib/decision/hypothesis";
import { buildSimulationResults } from "@/src/lib/decision/simulator";
import {
  buildPriorityQueue,
  type PriorityItem,
} from "@/src/lib/decision/priority";

import HeaderBar from "@/app/components/sections/HeaderBar";
import FloatingFilterRail from "./floating/FloatingFilterRail";
import FloatingTabRail from "./floating/FloatingTabRail";

const SummarySection = dynamic(
  () => import("@/app/components/sections/SummarySection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const Summary2Section = dynamic(
  () => import("@/app/components/sections/Summary2Section"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const StructureSection = dynamic(
  () => import("@/app/components/sections/StructureSection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const KeywordSection = dynamic(
  () => import("@/app/components/sections/KeywordSection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const KeywordDetailSection = dynamic(
  () => import("@/app/components/sections/KeywordDetailSection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const CreativeSection = dynamic(
  () => import("@/app/components/sections/CreativeSection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const CreativeDetailSection = dynamic(
  () => import("@/app/components/sections/CreativeDetailSection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const MonthGoalSection = dynamic(
  () => import("@/app/components/sections/MonthGoalSection"),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const DecisionPanel = dynamic(
  () =>
    import("@/app/components/decision/DecisionPanel").then(
      (mod) => mod.default,
    ),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const MemoHeaderBar = memo(HeaderBar);
const MemoFloatingFilterRail = memo(FloatingFilterRail);
const MemoFloatingTabRail = memo(FloatingTabRail);

const MONTH_GOAL_KEY = "nature_report_month_goal_v1";

const DEFAULT_GOAL: GoalState = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

const EMPTY_ROWS: any[] = [];
const EMPTY_STRING = "";
const EMPTY_SET = new Set<string>();

const AGGREGATE_FLAGS = {
  needCurrentMonthActual: true,
  needTotals: true,
  needBySource: true,
  needByCampaign: true,
  needByGroup: false,
  needByWeek: true,
  needByMonth: true,
  needHydratedFilteredRows: true,
} as const;

type Props = {
  rows: any[];
  isLoading?: boolean;
  creativesMap?: Record<string, string>;
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;
  reportPeriod: ReportPeriod;
  onChangeReportPeriod: (next: ReportPeriod) => void;
  readOnlyHeader?: boolean;
  hidePeriodEditor?: boolean;
  hideTabPeriodText?: boolean;
};

type ReportFilterKey = FilterKey;
type HeaderBarProps = ComponentProps<typeof HeaderBar>;

type HypothesisTabKey =
  | "hypothesis1"
  | "hypothesis2"
  | "hypothesis3"
  | "hypothesis4"
  | "hypothesis5";

function isHypothesisTab(tab: TabKey): tab is HypothesisTabKey {
  return (
    tab === "hypothesis1" ||
    tab === "hypothesis2" ||
    tab === "hypothesis3" ||
    tab === "hypothesis4" ||
    tab === "hypothesis5"
  );
}

function hypothesisNumberOf(tab: HypothesisTabKey) {
  return Number(tab.replace("hypothesis", ""));
}

function getPrioritySummary(item?: PriorityItem | null) {
  if (!item) return "";
  const value =
    (item as any)?.summary ||
    (item as any)?.description ||
    (item as any)?.reason ||
    "현재 목표 달성을 위해 우선 검토할 가설입니다.";
  return String(value);
}

function getPriorityMetric(item?: PriorityItem | null) {
  if (!item) return "목표 KPI";
  const value =
    (item as any)?.targetMetric ||
    (item as any)?.metricType ||
    (item as any)?.primaryMetric ||
    "목표 KPI";
  return String(value);
}

function pctLabel(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}`;
}

const HypothesisOperationPanel = memo(function HypothesisOperationPanel({
  index,
  item,
}: {
  index: number;
  item?: PriorityItem | null;
}) {
  const [executionStatus, setExecutionStatus] = useState<
    "not_started" | "running" | "done" | "stopped"
  >("not_started");
  const [executionStartDate, setExecutionStartDate] = useState("");
  const [executionMemo, setExecutionMemo] = useState("");
  const [reviewResult, setReviewResult] = useState<
    "improved" | "worsened" | "hold" | ""
  >("");

  if (!item) {
    return (
      <section className="space-y-5 rounded-[28px] border border-dashed border-slate-300 bg-white p-5 shadow-sm">
        <div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
            HYPOTHESIS {index}
          </div>

          <h2 className="mt-3 text-xl font-semibold text-slate-900">
            가설 {index} 데이터가 아직 없습니다
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Decision 탭의 Top 5 가설 계산 결과에 가설 {index}이 생성되면 이
            페이지에 자동 연결됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {[
            {
              title: "계획",
              desc: "가설 제목/요약, 목표 KPI, 실행 전 확인 기준을 준비합니다.",
            },
            {
              title: "실행",
              desc: "실행 상태, 실행 시작일, 실행 메모를 기록할 자리를 준비합니다.",
            },
            {
              title: "리뷰",
              desc: "리뷰일, 결과 판단, 개선/악화/보류 판단을 준비합니다.",
            },
            {
              title: "다음 액션 제안",
              desc: "확대, 유지, 중단, 재검토 방향을 정리할 자리를 준비합니다.",
            },
          ].map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                STEP {i + 1}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {step.title}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const targetMetric = getPriorityMetric(item);
  const prioritySummary = getPrioritySummary(item);
  const score = Number((item as any)?.score ?? 0);
  const impact = Number((item as any)?.impact ?? 0);
  const confidence = Number((item as any)?.confidence ?? 0);
  const ease = Number((item as any)?.ease ?? 0);

  const executionStatusLabel =
    executionStatus === "running"
      ? "실행중"
      : executionStatus === "done"
        ? "완료"
        : executionStatus === "stopped"
          ? "중단"
          : "미시작";

  const executionStatusTone =
    executionStatus === "running"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : executionStatus === "done"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : executionStatus === "stopped"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  const reviewResultLabel =
    reviewResult === "improved"
      ? "개선"
      : reviewResult === "worsened"
        ? "악화"
        : reviewResult === "hold"
          ? "보류"
          : "미선택";

  const reviewResultTone =
    reviewResult === "improved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : reviewResult === "worsened"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : reviewResult === "hold"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  const reviewResultSummary =
    reviewResult === "improved"
      ? "개선 판단이 선택되어 다음 액션 제안이 확대 검토 방향으로 보정됩니다."
      : reviewResult === "worsened"
        ? "악화 판단이 선택되어 다음 액션 제안이 중단/재검토 방향으로 보정됩니다."
        : reviewResult === "hold"
          ? "보류 판단이 선택되어 다음 액션 제안이 추가 관찰 방향으로 보정됩니다."
          : "";

  const hasExecutionMemo = executionMemo.trim().length > 0;
  const hasExecutionStartDate = executionStartDate.trim().length > 0;
  const hasExecutionStarted =
    executionStatus !== "not_started" ||
    hasExecutionStartDate ||
    hasExecutionMemo;

  const executionStartDateTone = hasExecutionStartDate
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  const executionMemoTone = hasExecutionMemo
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  const operationCompletionCount =
    (executionStatus !== "not_started" ? 1 : 0) +
    (hasExecutionStartDate ? 1 : 0) +
    (hasExecutionMemo ? 1 : 0) +
    (reviewResult ? 1 : 0);

  const operationCompletionLabel = `${operationCompletionCount}/4 작성됨`;

  const operationCompletionTone =
    operationCompletionCount <= 1
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : operationCompletionCount <= 3
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  const actionDirection =
    score >= 0.7 || (impact >= 0.7 && confidence >= 0.55)
      ? "확대 검토"
      : confidence >= 0.6 && ease >= 0.55
        ? "유지/반복 검증"
        : impact < 0.35 || confidence < 0.35
          ? "재검토"
          : "보류 후 추가 확인";

  const actionTone =
    actionDirection === "확대 검토"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : actionDirection === "재검토"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : actionDirection === "보류 후 추가 확인"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-indigo-200 bg-indigo-50 text-indigo-700";

  const reviewAwareActionDirection =
    reviewResult === "improved"
      ? "확대 검토"
      : reviewResult === "worsened"
        ? "중단/재검토"
        : reviewResult === "hold"
          ? "유지 후 추가 관찰"
          : actionDirection;

  const reviewAwareActionMemo =
    reviewResult === "improved"
      ? `${targetMetric} 기준으로 개선 신호가 선택되었습니다. 동일 조건에서 예산, 소재, 키워드, 캠페인 범위를 확대할 수 있는지 우선 검토합니다.`
      : reviewResult === "worsened"
        ? `${targetMetric} 기준으로 악화 신호가 선택되었습니다. 동일 액션의 확대는 보류하고, 실행 범위/소재/입찰/타겟 조건을 재검토합니다.`
        : reviewResult === "hold"
          ? `${targetMetric} 기준으로 아직 명확한 개선 판단을 내리기 어렵습니다. 최소 1회 더 관찰하거나 비교 기간을 늘려 추가 검증합니다.`
          : `현재 우선순위 점수와 영향도/신뢰도/실행 난이도를 기준으로는 ${actionDirection} 방향을 먼저 검토합니다. 실제 최종 판단은 실행 후 리뷰 데이터가 연결되면 더 정교하게 보정합니다.`;

  const reviewAwareActionTone =
    reviewResult === "improved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : reviewResult === "worsened"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : reviewResult === "hold"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : actionTone;

  const executionStatusGuide =
    executionStatus === "running"
      ? "실행중입니다. 지금부터 실행 전 기준값 대비 KPI 변화를 추적하세요."
      : executionStatus === "done"
        ? "실행 완료 상태입니다. 이제 리뷰 단계에서 개선/악화/보류 판단을 남겨주세요."
        : executionStatus === "stopped"
          ? "중단 상태입니다. 중단 사유와 당시 KPI 상황을 실행 메모에 남기는 것이 좋습니다."
          : "아직 미시작 상태입니다. 실행 전 기준값과 실행 계획을 먼저 확인하세요.";

  const reviewActionBridgeSummary =
    reviewResult === "improved"
      ? "이번 리뷰 판단에 따라 다음 액션 방향이 ‘확대 검토’로 전환되었습니다."
      : reviewResult === "worsened"
        ? "이번 리뷰 판단에 따라 다음 액션 방향이 ‘중단/재검토’로 전환되었습니다."
        : reviewResult === "hold"
          ? "이번 리뷰 판단에 따라 다음 액션 방향이 ‘유지 후 추가 관찰’로 전환되었습니다."
          : "";

  const isReviewActionAdjusted = !!reviewResult;

  const reviewActionAdjustedLabel = isReviewActionAdjusted
    ? "리뷰 반영됨"
    : "기본 추천";

  const reviewActionAdjustedTone = isReviewActionAdjusted
    ? reviewAwareActionTone
    : "border-slate-200 bg-white text-slate-600";

  const actionFlowSummary =
    reviewResult && reviewAwareActionDirection !== actionDirection
      ? `기본 추천: ${actionDirection} → 리뷰 반영: ${reviewAwareActionDirection}`
      : "";

  const isActionDirectionChanged =
    !!reviewResult && reviewAwareActionDirection !== actionDirection;

  const actionDirectionChangeLabel = isActionDirectionChanged
    ? "추천 변경됨"
    : "추천 동일";

  const actionDirectionChangeMemo =
    !reviewResult || isActionDirectionChanged
      ? ""
      : "기본 추천과 리뷰 반영 방향이 같습니다. 현재 선택한 리뷰 결과는 기존 추천 방향을 유지하는 근거로 활용됩니다.";

  const finalActionChecklist =
    reviewAwareActionDirection === "확대 검토"
      ? [
          "개선 KPI가 일시적 변동인지 재확인",
          "확대 예산/범위 설정",
          "동일 조건의 캠페인·키워드·소재로 확장",
        ]
      : reviewAwareActionDirection === "중단/재검토"
        ? [
            "악화 원인 구간 확인",
            "동일 액션 확대 중단",
            "소재·입찰·타겟 조건 재점검",
          ]
        : reviewAwareActionDirection === "유지 후 추가 관찰"
          ? [
              "관찰 기간 연장",
              "비교 기준값 재확인",
              "추가 데이터 확보 후 재판단",
            ]
          : ["현재 추천 방향 확인", "실행 조건 정리", "리뷰 결과 입력 후 재판단"];

  const finalActionChecklistTone =
    reviewResult || reviewAwareActionDirection !== actionDirection
      ? reviewAwareActionTone
      : "border-slate-200 bg-white text-slate-600";

  const shouldHighlightReviewRequired =
    executionStatus === "done" && !reviewResult;

  const shouldWarnStoppedButImproved =
    executionStatus === "stopped" && reviewResult === "improved";

  const shouldWarnRunningButFinalSelected =
    executionStatus === "running" &&
    (reviewResult === "improved" || reviewResult === "worsened");

  const operationGuardMessages = [
    reviewResult && executionStatus === "not_started"
      ? "리뷰 결과가 선택됐지만 실행 상태가 아직 미시작입니다. 실행 상태를 실행중 또는 완료로 바꾼 뒤 리뷰하는 것이 안전합니다."
      : "",
    shouldWarnStoppedButImproved
      ? "중단 상태에서 개선 판단이 선택되었습니다. 실제 개선 확인 후 완료 또는 실행중으로 상태를 조정하는 것이 좋습니다."
      : "",
    shouldHighlightReviewRequired
      ? "실행 완료 상태입니다. 개선/악화/보류 중 하나를 선택해 리뷰를 남겨주세요."
      : "",
    shouldWarnRunningButFinalSelected
      ? "아직 실행중입니다. 최종 개선/악화 판단은 완료 후 확정하는 것이 안전합니다."
      : "",
  ].filter(Boolean);

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-indigo-700">
            HYPOTHESIS {index}
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
            PRIORITY #{item.rank}
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
            {targetMetric}
          </div>
        </div>

        <h2 className="mt-3 text-xl font-semibold text-slate-900">
          가설 {index}. {item.title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          {prioritySummary}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              IMPACT
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {pctLabel(impact)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              CONFIDENCE
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {pctLabel(confidence)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              EASE
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {pctLabel(ease)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              SCORE
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {(score * 100).toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.14em] text-indigo-600">
              CURRENT OPERATION STATUS
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              현재 실행 기록 요약
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${executionStatusTone}`}
            >
              상태: {executionStatusLabel}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${executionStartDateTone}`}
            >
              시작일: {executionStartDate || "미입력"}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${executionMemoTone}`}
            >
              메모: {hasExecutionMemo ? "작성됨" : "미작성"}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${reviewResultTone}`}
            >
              리뷰: {reviewResultLabel}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${operationCompletionTone}`}
            >
              완성도: {operationCompletionLabel}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-indigo-700">
          {hasExecutionStarted
            ? "현재 화면에서 입력한 실행 정보 기준으로 요약됩니다. 아직 저장 구조는 연결하지 않았습니다."
            : "아직 실행 기록이 없습니다. 실행 상태, 시작일, 메모를 입력하면 이 영역에 즉시 반영됩니다."}
        </p>

        <p className="mt-2 rounded-2xl border border-white/70 bg-white px-4 py-3 text-xs font-semibold leading-5 text-slate-700">
          {executionStatusGuide}
        </p>

        {reviewActionBridgeSummary ? (
          <p
            className={`mt-2 rounded-2xl border px-4 py-3 text-xs font-semibold leading-5 ${reviewAwareActionTone}`}
          >
            {reviewActionBridgeSummary}
          </p>
        ) : null}

        {operationGuardMessages.length > 0 ? (
          <div className="mt-3 space-y-2">
            {operationGuardMessages.map((message) => (
              <div
                key={message}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800"
              >
                {message}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
            STEP 1
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-900">계획</h3>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                가설 제목/요약
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {item.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {prioritySummary}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                목표 KPI
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {targetMetric}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                실행 전 확인할 기준
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                실행 전 {targetMetric} 기준값, 현재 목표 달성률, 비용 효율,
                전환 품질을 먼저 확인합니다.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
            STEP 2
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-900">실행</h3>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                실행 상태
              </div>
              <select
                value={executionStatus}
                onChange={(e) =>
                  setExecutionStatus(
                    e.target.value as
                      | "not_started"
                      | "running"
                      | "done"
                      | "stopped",
                  )
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              >
                <option value="not_started">미시작</option>
                <option value="running">실행중</option>
                <option value="done">완료</option>
                <option value="stopped">중단</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                저장 없이 현재 화면에서만 유지됩니다.
              </p>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                실행 시작일
              </div>
              <input
                type="date"
                value={executionStartDate}
                onChange={(e) => setExecutionStartDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                실행 메모
              </div>
              <textarea
                value={executionMemo}
                onChange={(e) => setExecutionMemo(e.target.value)}
                placeholder="예: 캠페인 예산 20% 이동, 고효율 키워드 입찰 상향, 저효율 소재 OFF 등"
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
        </div>

        <div
          className={`rounded-3xl border px-5 py-5 ${
            shouldHighlightReviewRequired
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
            STEP 3
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-900">리뷰</h3>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                리뷰일
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                실행 후 확인 시점에 입력 예정
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                결과 판단
              </div>

              {shouldHighlightReviewRequired ? (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                  실행 완료 상태입니다. 개선/악화/보류 중 하나를 선택해 리뷰를 남겨주세요.
                </p>
              ) : null}

              {shouldWarnStoppedButImproved ? (
                <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-800">
                  중단 상태에서 개선 판단이 선택되었습니다. 실제 개선 확인 후 완료 또는 실행중으로 상태를 조정하는 것이 좋습니다.
                </p>
              ) : null}

              {shouldWarnRunningButFinalSelected ? (
                <p className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold leading-5 text-indigo-800">
                  아직 실행중입니다. 최종 개선/악화 판단은 완료 후 확정하는 것이 안전합니다.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { key: "improved", label: "개선" },
                  { key: "worsened", label: "악화" },
                  { key: "hold", label: "보류" },
                ].map((option) => {
                  const selected = reviewResult === option.key;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setReviewResult((prev) =>
                          prev === option.key
                            ? ""
                            : (option.key as
                                | "improved"
                                | "worsened"
                                | "hold"),
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {reviewResultSummary ? (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
                  {reviewResultSummary}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                판단 기준
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                실행 전 기준값 대비 {targetMetric} 변화, 목표 달성률 변화,
                비용 효율, 전환 품질을 함께 확인합니다.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                현재 선택값:{" "}
                <span className="font-semibold text-slate-700">
                  {reviewResultLabel === "미선택"
                    ? "아직 선택 안 함"
                    : reviewResultLabel}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                STEP 4
              </div>
              <h3 className="mt-2 text-base font-semibold text-slate-900">
                다음 액션 제안
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${reviewAwareActionTone}`}
              >
                {reviewAwareActionDirection}
              </span>

              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${reviewActionAdjustedTone}`}
              >
                {reviewActionAdjustedLabel}
              </span>

              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  isActionDirectionChanged
                    ? "border-purple-200 bg-purple-50 text-purple-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {actionDirectionChangeLabel}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                운영 방향
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                현재 추천 방향: {reviewAwareActionDirection}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                제안 메모
              </div>

              {actionFlowSummary ? (
                <p className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                  {actionFlowSummary}
                </p>
              ) : null}

              {actionDirectionChangeMemo ? (
                <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
                  {actionDirectionChangeMemo}
                </p>
              ) : null}

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {reviewAwareActionMemo}
              </p>
            </div>

            <div
              className={`rounded-2xl border px-4 py-3 ${finalActionChecklistTone}`}
            >
              <div className="text-[11px] font-semibold tracking-[0.14em] opacity-70">
                최종 액션 체크리스트
              </div>

              <ul className="mt-2 space-y-1 text-sm font-semibold leading-6">
                {finalActionChecklist.map((text) => (
                  <li key={text}>• {text}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function safeDecode(s: string) {
  const v = String(s ?? "");
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function firstNonEmpty(...values: any[]) {
  for (const v of values) {
    const s = asStr(v);
    if (s) return s;
  }
  return "";
}

function normalizeKey(s: any) {
  let v = String(s ?? "");
  v = safeDecode(v);
  v = v.replace(/\\/g, "/");
  v = v.replace(/\u00A0/g, " ");
  v = v.trim();
  v = v.replace(/\s+/g, " ");
  try {
    v = v.normalize("NFC");
  } catch {}
  return v;
}

function resolveReportTypeFromProps(input: {
  reportTypeKey?: string | null;
  reportTypeName?: string | null;
}): ReportType {
  const key = firstNonEmpty(input.reportTypeKey).toLowerCase();
  const name = firstNonEmpty(input.reportTypeName).toLowerCase();
  const source = `${key} ${name}`;

  if (
    source.includes("db_acquisition") ||
    source.includes("db acquisition") ||
    source.includes("db획득") ||
    source.includes("db 획득")
  ) {
    return "db_acquisition";
  }

  if (source.includes("traffic") || source.includes("트래픽")) {
    return "traffic";
  }

  if (
    source.includes("commerce") ||
    source.includes("커머스") ||
    source.includes("매출") ||
    source.includes("e-commerce") ||
    source.includes("ecommerce")
  ) {
    return "commerce";
  }

  return "commerce";
}

function basenameOf(v: string) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const noQs = raw.split("?")[0].split("#")[0];
  const base = noQs.split("/").pop() || noQs;
  return String(safeDecode(base)).trim();
}

function stripExt(name: string) {
  const base = basenameOf(name);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}

function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function tryParseJson(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return p && typeof p === "object" ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeIncomingRow(rec: any) {
  const raw = rec?.row ?? rec?.data ?? rec?.payload ?? null;
  const rowObj = tryParseJson(raw) || null;

  const base = rowObj ? { ...rowObj } : { ...(rec ?? {}) };

  if (base.date == null) {
    base.date =
      rec?.date ??
      base?.report_date ??
      base?.day ??
      base?.ymd ??
      base?.dt ??
      base?.segment_date ??
      base?.stat_date ??
      null;
  }

  if (base.channel == null) {
    base.channel =
      rec?.channel ??
      base?.ad_channel ??
      base?.media ??
      base?.media_type ??
      null;
  }

  if (base.device == null) {
    base.device = rec?.device ?? base?.device_type ?? null;
  }

  if (base.source == null) {
    base.source = rec?.source ?? base?.site_source ?? base?.publisher ?? null;
  }

  if (base.platform == null) {
    base.platform =
      rec?.platform ?? base?.media_source ?? base?.ad_platform ?? null;
  }

  if (base.product == null) {
    base.product =
      rec?.product ??
      base?.platform ??
      base?.product_name ??
      base?.productName ??
      null;
  }

  if (base.campaign_name == null && base.campaign != null) {
    base.campaign_name = base.campaign;
  }
  if (base.campaign_name == null && base.campaignName != null) {
    base.campaign_name = base.campaignName;
  }

  if (base.group_name == null && base.group != null) base.group_name = base.group;
  if (base.group_name == null && base.groupName != null) {
    base.group_name = base.groupName;
  }
  if (base.group_name == null && base.adgroup_name != null) {
    base.group_name = base.adgroup_name;
  }

  if (base.keyword == null && base.keyword_name != null) {
    base.keyword = base.keyword_name;
  }
  if (base.keyword == null && base.search_term != null) {
    base.keyword = base.search_term;
  }

  if (base.imagepath == null && base.imagePath != null) {
    base.imagepath = base.imagePath;
  }
  if (base.imagePath == null && base.imagepath != null) {
    base.imagePath = base.imagepath;
  }
  if (base.image_path == null && base.imagepath != null) {
    base.image_path = base.imagepath;
  }
  if (base.imagepath_raw == null && base.image_raw != null) {
    base.imagepath_raw = base.image_raw;
  }

  if (base.creative_file == null && base.creativeFile != null) {
    base.creative_file = base.creativeFile;
  }
  if (base.creativeFile == null && base.creative_file != null) {
    base.creativeFile = base.creative_file;
  }

  if (base.impressions == null && base.impr != null) base.impressions = base.impr;
  if (base.clicks == null && base.click != null) base.clicks = base.click;
  if (base.clicks == null && base.clk != null) base.clicks = base.clk;
  if (base.cost == null && base.spend != null) base.cost = base.spend;
  if (base.cost == null && base.ad_cost != null) base.cost = base.ad_cost;
  if (base.conversions == null && base.conv != null) base.conversions = base.conv;
  if (base.conversions == null && base.cv != null) base.conversions = base.cv;
  if (base.revenue == null && base.sales != null) base.revenue = base.sales;
  if (base.revenue == null && base.purchase_amount != null) {
    base.revenue = base.purchase_amount;
  }
  if (base.revenue == null && base.gmv != null) base.revenue = base.gmv;

  if (base.__row_id == null && rec?.id != null) base.__row_id = rec.id;
  if (base.id == null && rec?.id != null) base.id = rec.id;

  return base;
}

function pickHeaderFallbackFromRows(rows: any[]) {
  let advertiser = "";
  let reportType = "";

  for (const r of rows ?? []) {
    advertiser =
      advertiser ||
      firstNonEmpty(
        r?.advertiser_name,
        r?.advertiserName,
        r?.advertiser,
        r?.account,
        r?.account_name,
        r?.accountName,
        r?.campaign_name,
        r?.campaignName,
        r?.brand_name,
        r?.brandName,
        r?.client_name,
        r?.clientName,
      );

    reportType =
      reportType ||
      firstNonEmpty(
        r?.report_type_name,
        r?.reportTypeName,
        r?.report_type_key,
        r?.reportTypeKey,
        r?.report_type,
        r?.reportType,
        r?.type_name,
        r?.typeName,
        r?.type,
      );

    if (advertiser && reportType) break;
  }

  return {
    advertiserName: advertiser,
    reportTypeName: reportType,
  };
}

function creativeCandidatesOfRow(row: any): string[] {
  const rawCandidates: any[] = [
    row?.creative_key,
    row?.creativeKey,
    row?.creative_file,
    row?.creativeFile,
    row?.creative,
    row?.imagepath_raw,
    row?.imagepath,
    row?.imagePath,
    row?.image_path,
    row?.image_url,
    row?.imageUrl,
    row?.thumbnail?.imagePath,
    row?.thumbnail?.imagepath,
    row?.thumbUrl,
    row?.thumb_url,
    row?.thumbnailUrl,
    row?.thumbnail_url,
    row?.extras?.creative_key,
    row?.extras?.creativeKey,
    row?.extras?.creative_file,
    row?.extras?.creativeFile,
    row?.extras?.creative,
    row?.extras?.imagepath_raw,
    row?.extras?.imagepath,
    row?.extras?.imagePath,
    row?.extras?.image_path,
  ];

  const rawStrs = uniq(
    rawCandidates
      .filter(Boolean)
      .map((v) => normalizeKey(v))
      .map((v) => String(v).trim()),
  );

  const baseNames: string[] = [];
  for (const s of rawStrs) {
    const b = basenameOf(s);
    if (!b) continue;
    baseNames.push(normalizeKey(b));
    baseNames.push(normalizeKey(stripExt(b)));
  }

  const pathForms: string[] = [];
  for (const b of baseNames) {
    if (!b) continue;
    pathForms.push(normalizeKey(`/creatives/${b}`));
    pathForms.push(normalizeKey(`C:/creatives/${b}`));
  }

  const all = uniq([...rawStrs, ...baseNames, ...pathForms]).map(normalizeKey);

  const withPrefix: string[] = [];
  for (const k of all) {
    const kk = normalizeKey(k);
    if (!kk) continue;

    if (kk.startsWith("C:")) {
      withPrefix.push(kk);
      withPrefix.push(normalizeKey(kk.slice(2)));
    } else {
      withPrefix.push(normalizeKey(`C:${kk}`));
      withPrefix.push(kk);
    }
  }

  return uniq(withPrefix.map(normalizeKey));
}

function normalizeCreativesMap(map: Record<string, string>) {
  const out: Record<string, string> = {};

  for (const [k0, url] of Object.entries(map || {})) {
    if (!url) continue;

    const kRaw = normalizeKey(k0);
    if (!kRaw) continue;

    const base = normalizeKey(basenameOf(kRaw));
    const noext = normalizeKey(stripExt(base));

    const p1 = base ? normalizeKey(`/creatives/${base}`) : "";
    const p1n = noext ? normalizeKey(`/creatives/${noext}`) : "";
    const c1 = base ? normalizeKey(`C:/creatives/${base}`) : "";
    const c1n = noext ? normalizeKey(`C:/creatives/${noext}`) : "";

    const keys = uniq([
      kRaw,
      base,
      noext,
      p1,
      p1n,
      c1,
      c1n,
      kRaw.startsWith("C:")
        ? normalizeKey(kRaw.slice(2))
        : normalizeKey(`C:${kRaw}`),
      base
        ? base.startsWith("C:")
          ? normalizeKey(base.slice(2))
          : normalizeKey(`C:${base}`)
        : "",
      noext
        ? noext.startsWith("C:")
          ? normalizeKey(noext.slice(2))
          : normalizeKey(`C:${noext}`)
        : "",
      p1
        ? p1.startsWith("C:")
          ? normalizeKey(p1.slice(2))
          : normalizeKey(`C:${p1}`)
        : "",
      c1
        ? c1.startsWith("C:")
          ? normalizeKey(c1.slice(2))
          : normalizeKey(`C:${c1}`)
        : "",
    ])
      .map(normalizeKey)
      .filter(Boolean);

    for (const kk of keys) {
      if (!out[kk]) out[kk] = url;
    }
  }

  return out;
}

function pickDateStrLoose(r: any) {
  const v =
    r?.date ??
    r?.ymd ??
    r?.day ??
    r?.dt ??
    r?.report_date ??
    r?.segment_date ??
    r?.stat_date;

  if (v == null) return "";

  const s = String(v).trim();
  if (!s) return "";

  const parts = s
    .slice(0, 20)
    .replace(/[^\d]/g, "-")
    .split("-")
    .filter(Boolean);

  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return "";

  const mm = String(Number(m)).padStart(2, "0");
  const dd = String(Number(d)).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function formatYmd(ymd: string) {
  if (!ymd) return "";
  return ymd.replaceAll("-", ".");
}

function minMaxYmd(rows: any[]) {
  let min = "";
  let max = "";
  for (const r of rows || []) {
    const d = pickDateStrLoose(r);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }

  return { min, max };
}

function shallowEqualStable(a: any, b: any) {
  if (Object.is(a, b)) return true;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  const aIsObj = !!a && typeof a === "object";
  const bIsObj = !!b && typeof b === "object";

  if (!aIsObj || !bIsObj) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }

  return true;
}

function equalSetValues(a: Set<string>, b: Set<string>) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function useStableShallowValue<T>(value: T): T {
  const ref = useRef(value);

  if (!shallowEqualStable(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
}

function useStableSetValue(value: Set<string>): Set<string> {
  const ref = useRef(value);

  if (!equalSetValues(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
}

function parseLooseDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const rawNum = String(value);
    if (/^\d{8}$/.test(rawNum)) {
      const y = rawNum.slice(0, 4);
      const m = rawNum.slice(4, 6);
      const d = rawNum.slice(6, 8);
      const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const fullMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (fullMatch) {
    const y = fullMatch[1];
    const m = fullMatch[2].padStart(2, "0");
    const d = fullMatch[3].padStart(2, "0");
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const compactMatch = normalized.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (compactMatch) {
    const y = compactMatch[1];
    const m = compactMatch[2];
    const d = compactMatch[3];
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const direct = new Date(normalized.replace(" ", "T"));
  if (!Number.isNaN(direct.getTime())) return direct;

  return null;
}

function toYmd(date: Date | null) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDateFromCurrentMonth(
  currentMonthKey: string,
  month: number,
  day: number,
): Date | null {
  if (!/^\d{4}-\d{2}$/.test(currentMonthKey)) return null;
  const [yy] = currentMonthKey.split("-").map(Number);
  if (!yy || !month || !day) return null;
  const parsed = new Date(
    `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateFromCurrentMonthDay(
  currentMonthKey: string,
  day: number,
): Date | null {
  if (!/^\d{4}-\d{2}$/.test(currentMonthKey)) return null;
  const [yy, mm] = currentMonthKey.split("-").map(Number);
  if (!yy || !mm || !day) return null;
  const parsed = new Date(
    `${yy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateCandidateWithMonthContext(
  value: any,
  currentMonthKey: string,
): Date | null {
  const direct = parseLooseDate(value);
  if (direct) return direct;

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const mdMatch = normalized.match(/\b(\d{1,2})-(\d{1,2})\b/);
  if (mdMatch) {
    return buildDateFromCurrentMonth(
      currentMonthKey,
      Number(mdMatch[1]),
      Number(mdMatch[2]),
    );
  }

  const dayKorMatch = normalized.match(/\b(\d{1,2})일\b/);
  if (dayKorMatch) {
    return buildDateFromCurrentMonthDay(currentMonthKey, Number(dayKorMatch[1]));
  }

  const dayOnlyMatch = normalized.match(/^\d{1,2}$/);
  if (dayOnlyMatch) {
    return buildDateFromCurrentMonthDay(currentMonthKey, Number(dayOnlyMatch[0]));
  }

  return null;
}

function getLastDateFromRows(
  rows: readonly any[],
  currentMonthKey: string,
): string {
  let last: Date | null = null;

  const candidateKeys = [
    "date",
    "dateKey",
    "day",
    "ymd",
    "report_date",
    "reportDate",
    "fullDate",
    "rawDate",
    "startDate",
    "label",
  ];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;

    let parsed: Date | null = null;

    for (const key of candidateKeys) {
      parsed = parseDateCandidateWithMonthContext(row?.[key], currentMonthKey);
      if (parsed) break;
    }

    if (!parsed) continue;

    if (!last || parsed.getTime() > last.getTime()) {
      last = parsed;
    }
  }

  return toYmd(last);
}

function getRowsForMonthKey(rows: readonly any[], monthKey: string) {
  if (!monthKey) return EMPTY_ROWS;
  const prefix = `${monthKey}-`;
  const out: any[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const ymd = pickDateStrLoose(row);
    if (!ymd) continue;
    if (!ymd.startsWith(prefix)) continue;
    out.push(row);
  }

  return out;
}

function getReportTypeDisplayName(
  resolvedType: ReportType,
  rawName: string,
): string {
  if (resolvedType === "traffic") return "트래픽 리포트";
  if (resolvedType === "db_acquisition") return "DB획득 리포트";
  if (resolvedType === "commerce") return "커머스 매출 리포트";
  return rawName;
}

const HeaderSurface = memo(function HeaderSurface(props: HeaderBarProps) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <MemoHeaderBar {...props} />
    </div>
  );
});

export default function ReportTemplate({
  rows,
  isLoading,
  creativesMap,
  advertiserName,
  reportTypeName,
  reportTypeKey,
  reportPeriod,
  onChangeReportPeriod,
  readOnlyHeader = false,
  hidePeriodEditor = false,
  hideTabPeriodText = false,
}: Props) {
  const [tab, setTab] = useState<TabKey>("summary");

  const [filterKey, setFilterKey] = useState<ReportFilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>("all");
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>("all");
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>("all");
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");

  const deferredTab = useDeferredValue(tab);
  const deferredSelectedMonth = useDeferredValue(selectedMonth);
  const deferredSelectedWeek = useDeferredValue(selectedWeek);
  const deferredSelectedDevice = useDeferredValue(selectedDevice);
  const deferredSelectedChannel = useDeferredValue(selectedChannel);
  const deferredSelectedSource = useDeferredValue(selectedSource);
  const deferredSelectedProduct = useDeferredValue(selectedProduct);

  const [monthGoal, setMonthGoal] = useLocalStorageState<GoalState>(
    MONTH_GOAL_KEY,
    DEFAULT_GOAL,
  );

  const stableReportPeriod = useStableShallowValue(reportPeriod);
  const stableCreativesMapInput = useStableShallowValue(creativesMap ?? {});
  const stableMonthGoal = useStableShallowValue(monthGoal);

  const normalizedRows = useMemo(() => {
    if (!rows?.length) return EMPTY_ROWS;
    return rows.map(normalizeIncomingRow);
  }, [rows]);

  const reportPeriodRows = useMemo(() => {
    if (!normalizedRows.length) return EMPTY_ROWS;
    return filterRowsByReportPeriod(normalizedRows as any[], stableReportPeriod);
  }, [normalizedRows, stableReportPeriod]);

  const headerFallback = useMemo(() => {
    if (!normalizedRows.length) {
      return {
        advertiserName: "",
        reportTypeName: "",
      };
    }
    return pickHeaderFallbackFromRows(normalizedRows);
  }, [normalizedRows]);

  const effectiveAdvertiserName = useMemo(() => {
    return firstNonEmpty(advertiserName, headerFallback.advertiserName);
  }, [advertiserName, headerFallback.advertiserName]);

  const effectiveReportTypeKey = useMemo<ReportType>(() => {
    return resolveReportTypeFromProps({
      reportTypeKey,
      reportTypeName: firstNonEmpty(reportTypeName, headerFallback.reportTypeName),
    });
  }, [reportTypeKey, reportTypeName, headerFallback.reportTypeName]);

  const effectiveReportTypeName = useMemo(() => {
    const rawName = firstNonEmpty(reportTypeName, headerFallback.reportTypeName);
    return getReportTypeDisplayName(effectiveReportTypeKey, rawName);
  }, [effectiveReportTypeKey, reportTypeName, headerFallback.reportTypeName]);

  const reportType = effectiveReportTypeKey;

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("debugRows") !== "1") return;
      (window as any).__ROWS__ = normalizedRows;
      (window as any).__CREATIVES_MAP__ = stableCreativesMapInput;
    } catch {}
  }, [normalizedRows, stableCreativesMapInput]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (tab !== "keyword" && tab !== "keywordDetail") return;

    if (selectedChannel === ("display" as ChannelKey)) {
      setSelectedChannel("search" as ChannelKey);
    }
  }, [tab, selectedChannel, readOnlyHeader]);

  const needCreativeRows =
    deferredTab === "structure" ||
    deferredTab === "keywordDetail" ||
    deferredTab === "creative" ||
    deferredTab === "creativeDetail";

  const originalRowById = useMemo(() => {
    if (!needCreativeRows || !normalizedRows.length) return null;

    const m = new Map<string, any>();
    for (const r of normalizedRows) {
      const id = r?.__row_id ?? r?.id;
      const key = id == null ? "" : String(id);
      if (!key) continue;
      if (!m.has(key)) m.set(key, r);
    }
    return m;
  }, [needCreativeRows, normalizedRows]);

  const handleInvalidWeek = useCallback(() => {
    setSelectedWeek("all");
  }, []);

  const noopInvalidWeek = useCallback(() => {}, []);

  const reportAggregatesParams = useMemo(() => {
    return {
      rows: reportPeriodRows as any,
      rowsArePreNormalized: true,
      selectedMonth: deferredSelectedMonth,
      selectedWeek: deferredSelectedWeek,
      selectedDevice: deferredSelectedDevice,
      selectedChannel: deferredSelectedChannel,
      selectedSource: deferredSelectedSource,
      selectedProduct: deferredSelectedProduct,
      monthGoal: stableMonthGoal,
      onInvalidWeek: handleInvalidWeek,
      ...AGGREGATE_FLAGS,
    };
  }, [
    reportPeriodRows,
    deferredSelectedMonth,
    deferredSelectedWeek,
    deferredSelectedDevice,
    deferredSelectedChannel,
    deferredSelectedSource,
    deferredSelectedProduct,
    stableMonthGoal,
    handleInvalidWeek,
  ]);

  const stableReportAggregatesParams =
    useStableShallowValue(reportAggregatesParams);

  const {
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    sourceOptions,
    productOptions,
    enabledMonthKeySet,
    enabledWeekKeySet,
    filteredRows,
    period,
    currentMonthKey,
    currentMonthActual,
    currentMonthGoalComputed,
    totals,
    bySource,
    byCampaign,
    byWeekOnly,
    byWeekChart,
    byMonth,
  } = useReportAggregates(stableReportAggregatesParams);

  const summaryGoalAggregatesParams = useMemo(() => {
    return {
      rows: reportPeriodRows as any,
      rowsArePreNormalized: true,
      selectedMonth: "all" as MonthKey,
      selectedWeek: "all" as WeekKey,
      selectedDevice: "all" as DeviceKey,
      selectedChannel: "all" as ChannelKey,
      selectedSource: "all",
      selectedProduct: "all",
      monthGoal: stableMonthGoal,
      onInvalidWeek: noopInvalidWeek,
      ...AGGREGATE_FLAGS,
    };
  }, [reportPeriodRows, stableMonthGoal, noopInvalidWeek]);

  const stableSummaryGoalAggregatesParams = useStableShallowValue(
    summaryGoalAggregatesParams,
  );

  const {
    currentMonthKey: summaryGoalCurrentMonthKey,
    currentMonthActual: summaryGoalCurrentMonthActual,
    currentMonthGoalComputed: summaryGoalCurrentMonthGoalComputed,
  } = useReportAggregates(stableSummaryGoalAggregatesParams);

  const summaryGoalBaseRows = useMemo(() => {
    if (!reportPeriodRows.length) return EMPTY_ROWS;
    if (!summaryGoalCurrentMonthKey) return EMPTY_ROWS;
    return getRowsForMonthKey(
      reportPeriodRows as any[],
      summaryGoalCurrentMonthKey,
    );
  }, [reportPeriodRows, summaryGoalCurrentMonthKey]);

  const summaryGoalLastDataDate = useMemo(() => {
    if (!summaryGoalBaseRows.length) return EMPTY_STRING;
    return getLastDateFromRows(
      summaryGoalBaseRows as any[],
      summaryGoalCurrentMonthKey,
    );
  }, [summaryGoalBaseRows, summaryGoalCurrentMonthKey]);

  const stableMonthOptions = useStableShallowValue(monthOptions ?? EMPTY_ROWS);
  const stableWeekOptions = useStableShallowValue(weekOptions ?? EMPTY_ROWS);
  const stableDeviceOptions = useStableShallowValue(deviceOptions ?? EMPTY_ROWS);
  const stableChannelOptions = useStableShallowValue(channelOptions ?? EMPTY_ROWS);
  const stableSourceOptions = useStableShallowValue(sourceOptions ?? EMPTY_ROWS);
  const stableProductOptions = useStableShallowValue(productOptions ?? EMPTY_ROWS);

  const stableEnabledMonthKeySet = useStableSetValue(
    enabledMonthKeySet ?? EMPTY_SET,
  );
  const stableEnabledWeekKeySet = useStableSetValue(
    enabledWeekKeySet ?? EMPTY_SET,
  );

  const allowedDeviceSet = useMemo(() => {
    return new Set((stableDeviceOptions ?? []).map((x: any) => String(x)));
  }, [stableDeviceOptions]);

  const allowedChannelSet = useMemo(() => {
    return new Set((stableChannelOptions ?? []).map((x: any) => String(x)));
  }, [stableChannelOptions]);

  const allowedSourceSet = useMemo(() => {
    return new Set((stableSourceOptions ?? []).map((x: any) => String(x)));
  }, [stableSourceOptions]);

  const allowedProductSet = useMemo(() => {
    return new Set((stableProductOptions ?? []).map((x: any) => String(x)));
  }, [stableProductOptions]);

  const byDay = useMemo(() => {
    if (deferredTab !== "summary") return EMPTY_ROWS;
    if (!(filteredRows as any[])?.length) return EMPTY_ROWS;
    return buildDailySummaryRows(filteredRows as any[]);
  }, [deferredTab, filteredRows]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (
      deferredSelectedMonth !== "all" &&
      !stableEnabledMonthKeySet.has(deferredSelectedMonth)
    ) {
      setSelectedMonth("all");
    }
  }, [deferredSelectedMonth, stableEnabledMonthKeySet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (
      deferredSelectedWeek !== "all" &&
      !stableEnabledWeekKeySet.has(deferredSelectedWeek)
    ) {
      setSelectedWeek("all");
    }
  }, [deferredSelectedWeek, stableEnabledWeekKeySet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (
      deferredSelectedDevice !== "all" &&
      !allowedDeviceSet.has(String(deferredSelectedDevice))
    ) {
      setSelectedDevice("all");
    }
  }, [deferredSelectedDevice, allowedDeviceSet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (
      deferredSelectedChannel !== "all" &&
      !allowedChannelSet.has(String(deferredSelectedChannel))
    ) {
      setSelectedChannel("all");
    }
  }, [deferredSelectedChannel, allowedChannelSet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (
      deferredSelectedSource !== "all" &&
      !allowedSourceSet.has(String(deferredSelectedSource))
    ) {
      setSelectedSource("all");
    }
  }, [deferredSelectedSource, allowedSourceSet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (
      deferredSelectedProduct !== "all" &&
      !allowedProductSet.has(String(deferredSelectedProduct))
    ) {
      setSelectedProduct("all");
    }
  }, [deferredSelectedProduct, allowedProductSet, readOnlyHeader]);

  const fullPeriod = useMemo(() => {
    if (!normalizedRows.length) return "";
    const mm = minMaxYmd(normalizedRows as any[]);
    if (!mm.min || !mm.max) return "";
    return `${formatYmd(mm.min)} ~ ${formatYmd(mm.max)}`;
  }, [normalizedRows]);

  const periodFixed = useMemo(() => {
    if (!(filteredRows as any[])?.length) return period;
    const mm = minMaxYmd(filteredRows as any[]);
    if (!mm.min || !mm.max) return period;
    return `${formatYmd(mm.min)} ~ ${formatYmd(mm.max)}`;
  }, [filteredRows, period]);

  const stableFullPeriod = useStableShallowValue(fullPeriod);
  const stablePeriodFixed = useStableShallowValue(periodFixed);

  const insightsCurrentMonthActual = useMemo(() => {
    if (deferredTab !== "summary") {
      return {
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        cpc: 0,
        cvr: 0,
        cpa: 0,
        roas: 0,
      };
    }

    return {
      impressions: Number(currentMonthActual?.impressions ?? 0),
      clicks: Number(currentMonthActual?.clicks ?? 0),
      cost: Number(currentMonthActual?.cost ?? 0),
      conversions: Number(currentMonthActual?.conversions ?? 0),
      revenue: Number(currentMonthActual?.revenue ?? 0),
      ctr: Number(currentMonthActual?.ctr ?? 0),
      cpc: Number(currentMonthActual?.cpc ?? 0),
      cvr: Number(currentMonthActual?.cvr ?? 0),
      cpa: Number(currentMonthActual?.cpa ?? 0),
      roas: Number(currentMonthActual?.roas ?? 0),
    };
  }, [deferredTab, currentMonthActual]);

  const stableInsightsCurrentMonthActual =
    useStableShallowValue(insightsCurrentMonthActual);

  const insightsParams = useMemo(() => {
    return {
      byMonth,
      rowsLength: reportPeriodRows.length,
      currentMonthKey,
      monthGoal: stableMonthGoal,
      currentMonthActual: stableInsightsCurrentMonthActual,
      currentMonthGoalComputed,
      enableMonthlyInsight: deferredTab === "summary",
      enableMonthGoalInsight: deferredTab === "summary",
      reportType,
    };
  }, [
    byMonth,
    reportPeriodRows.length,
    currentMonthKey,
    stableMonthGoal,
    stableInsightsCurrentMonthActual,
    currentMonthGoalComputed,
    deferredTab,
    reportType,
  ]);

  const stableInsightsParams = useStableShallowValue(insightsParams);
  const { monthGoalInsight } = useInsights(stableInsightsParams);

  const keywordAgg = useMemo(() => {
    if (deferredTab !== "keyword") return EMPTY_ROWS;
    if (!(filteredRows as any[])?.length) return EMPTY_ROWS;
    return groupByKeyword(filteredRows as any[]);
  }, [deferredTab, filteredRows]);

  const keywordInsight = useMemo(() => {
    if (deferredTab !== "keyword") return "";
    return buildKeywordInsight({
      keywordAgg: keywordAgg as any[],
      keywordBaseRows: filteredRows as any[],
      currentMonthActual: currentMonthActual as any,
      currentMonthGoalComputed: currentMonthGoalComputed as any,
      reportType,
    });
  }, [
    deferredTab,
    keywordAgg,
    filteredRows,
    currentMonthActual,
    currentMonthGoalComputed,
    reportType,
  ]);

  const creativesMapNormalized = useMemo(() => {
    if (!needCreativeRows) return {};
    return normalizeCreativesMap(stableCreativesMapInput);
  }, [needCreativeRows, stableCreativesMapInput]);

  const filteredRowsWithCreatives = useMemo(() => {
    if (!needCreativeRows) return filteredRows as any[];
    if (!(filteredRows as any[])?.length) return EMPTY_ROWS;

    const map = creativesMapNormalized;
    const originalRowMap = originalRowById;

    return (filteredRows as any[]).map((r) => {
      const ridValue = r?.__row_id ?? r?.id;
      const rid = ridValue == null ? "" : String(ridValue);
      const orig = rid && originalRowMap ? originalRowMap.get(rid) : null;

      const baseForCandidates = orig ?? r;
      const candidates = creativeCandidatesOfRow(baseForCandidates);

      let matchedKey: string | null = null;
      let matchedUrl: string | null = null;

      for (const k of candidates) {
        const kk = normalizeKey(k);
        const url = map[kk];
        if (url) {
          matchedKey = kk;
          matchedUrl = url;
          break;
        }
      }

      const displayUrl = matchedUrl || null;

      const out: any = {
        ...r,
        creative_key: matchedKey,
        creative_url: matchedUrl,
        creativeKey: matchedKey,
        creativeUrl: matchedUrl,
      };

      if (displayUrl) {
        const thumbObj = { imagePath: displayUrl, imagepath: displayUrl };

        out.imagePath = displayUrl;
        out.imagepath = displayUrl;
        out.image_path = displayUrl;
        out.thumbnail = thumbObj;
        out.thumbUrl = displayUrl;
        out.thumb_url = displayUrl;
        out.thumbnailUrl = displayUrl;
        out.thumbnail_url = displayUrl;
        out.image_url = displayUrl;
        out.imageUrl = displayUrl;
      } else {
        out.imagePath = null;
        out.imagepath = null;
        out.image_path = null;
        out.thumbnail = null;
        out.thumbUrl = null;
        out.thumb_url = null;
        out.thumbnailUrl = null;
        out.thumbnail_url = null;
        out.image_url = null;
        out.imageUrl = null;
      }

      return out;
    });
  }, [needCreativeRows, filteredRows, creativesMapNormalized, originalRowById]);

  const creativeBaseRows = useMemo(() => {
    if (deferredTab !== "creative" && deferredTab !== "creativeDetail") {
      return EMPTY_ROWS;
    }
    const list = (filteredRowsWithCreatives as any[]) ?? EMPTY_ROWS;
    if (!list.length) return EMPTY_ROWS;
    return list.filter((r) => !!r?.creative_url);
  }, [deferredTab, filteredRowsWithCreatives]);

  const stableSummaryGoalCurrentMonthActual = useStableShallowValue(
    summaryGoalCurrentMonthActual,
  );
  const stableSummaryGoalCurrentMonthGoalComputed = useStableShallowValue(
    summaryGoalCurrentMonthGoalComputed,
  );

  const stableCurrentMonthActual = useStableShallowValue(currentMonthActual);
  const stableCurrentMonthGoalComputed =
    useStableShallowValue(currentMonthGoalComputed);
  const stableTotals = useStableShallowValue(totals);
  const stableByCampaign = useStableShallowValue(byCampaign);
  const stableByMonth = useStableShallowValue(byMonth);
  const stableByWeekOnly = useStableShallowValue(byWeekOnly);
  const stableByWeekChart = useStableShallowValue(byWeekChart);
  const stableBySource = useStableShallowValue(bySource);
  const stableByDay = useStableShallowValue(byDay);
  const stableMonthGoalInsight = useStableShallowValue(monthGoalInsight);

  const decisionEngineInput = useMemo(
    () =>
      buildDecisionEngineInput({
        reportType,
        currentMonthKey: summaryGoalCurrentMonthKey,
        currentMonthActual: stableSummaryGoalCurrentMonthActual,
        currentMonthGoalComputed: stableSummaryGoalCurrentMonthGoalComputed,
        monthGoal: stableMonthGoal,
        lastDataDate: summaryGoalLastDataDate,
        rows: reportPeriodRows as any[],
        byCampaign: stableByCampaign,
        byWeek: stableByWeekOnly,
        byMonth: stableByMonth,
        reportPeriod: stableReportPeriod,
      }),
    [
      reportType,
      summaryGoalCurrentMonthKey,
      stableSummaryGoalCurrentMonthActual,
      stableSummaryGoalCurrentMonthGoalComputed,
      stableMonthGoal,
      summaryGoalLastDataDate,
      reportPeriodRows,
      stableByCampaign,
      stableByWeekOnly,
      stableByMonth,
      stableReportPeriod,
    ],
  );

  const decisionGoalSnapshot = useMemo(
    () => buildGoalSnapshot(decisionEngineInput),
    [decisionEngineInput],
  );

  const decisionHypotheses = useMemo(
    () => buildHypotheses(decisionEngineInput, decisionGoalSnapshot),
    [decisionEngineInput, decisionGoalSnapshot],
  );

  const decisionSimulationResults = useMemo(
    () =>
      buildSimulationResults(
        decisionEngineInput,
        decisionGoalSnapshot,
        decisionHypotheses,
      ),
    [decisionEngineInput, decisionGoalSnapshot, decisionHypotheses],
  );

  const topFiveHypotheses = useMemo(
    () =>
      buildPriorityQueue(decisionHypotheses, decisionSimulationResults, []).slice(
        0,
        5,
      ),
    [decisionHypotheses, decisionSimulationResults],
  );

  const monthGoalSectionProps = useMemo(() => {
    return {
      reportType,
      currentMonthKey: summaryGoalCurrentMonthKey,
      currentMonthActual: stableSummaryGoalCurrentMonthActual,
      currentMonthGoalComputed: stableSummaryGoalCurrentMonthGoalComputed,
      monthGoal: stableMonthGoal,
      setMonthGoal,
      monthGoalInsight: stableMonthGoalInsight,
      lastDataDate: summaryGoalLastDataDate,
    };
  }, [
    reportType,
    summaryGoalCurrentMonthKey,
    stableSummaryGoalCurrentMonthActual,
    stableSummaryGoalCurrentMonthGoalComputed,
    stableMonthGoal,
    setMonthGoal,
    stableMonthGoalInsight,
    summaryGoalLastDataDate,
  ]);

  const summarySectionProps = useMemo(() => {
    return {
      reportType,
      totals: stableTotals,
      byMonth: stableByMonth,
      byWeekOnly: stableByWeekOnly,
      byWeekChart: stableByWeekChart,
      bySource: stableBySource,
      byDay: stableByDay,
      currentMonthKey,
      currentMonthActual: stableCurrentMonthActual,
      currentMonthGoalComputed: stableCurrentMonthGoalComputed,
      monthGoal: stableMonthGoal,
      setMonthGoal,
      monthGoalInsight: stableMonthGoalInsight,
    };
  }, [
    reportType,
    stableTotals,
    stableByMonth,
    stableByWeekOnly,
    stableByWeekChart,
    stableBySource,
    stableByDay,
    currentMonthKey,
    stableCurrentMonthActual,
    stableCurrentMonthGoalComputed,
    stableMonthGoal,
    setMonthGoal,
    stableMonthGoalInsight,
  ]);

  const handleSelectHypothesisTab = useCallback((hypothesisIndex: number) => {
    if (
      hypothesisIndex !== 1 &&
      hypothesisIndex !== 2 &&
      hypothesisIndex !== 3 &&
      hypothesisIndex !== 4 &&
      hypothesisIndex !== 5
    ) {
      return;
    }

    setTab(`hypothesis${hypothesisIndex}` as TabKey);
  }, []);

  const decisionPanelProps = useMemo(() => {
    return {
      reportType,
      currentMonthKey: summaryGoalCurrentMonthKey,
      currentMonthActual: stableSummaryGoalCurrentMonthActual,
      currentMonthGoalComputed: stableSummaryGoalCurrentMonthGoalComputed,
      monthGoal: stableMonthGoal,
      lastDataDate: summaryGoalLastDataDate,
      rows: reportPeriodRows as any[],
      byCampaign: stableByCampaign,
      byWeek: stableByWeekOnly,
      byMonth: stableByMonth,
      reportPeriod: stableReportPeriod,
      onSelectHypothesisTab: handleSelectHypothesisTab,
    };
  }, [
    reportType,
    summaryGoalCurrentMonthKey,
    stableSummaryGoalCurrentMonthActual,
    stableSummaryGoalCurrentMonthGoalComputed,
    stableMonthGoal,
    summaryGoalLastDataDate,
    reportPeriodRows,
    stableByCampaign,
    stableByWeekOnly,
    stableByMonth,
    stableReportPeriod,
    handleSelectHypothesisTab,
  ]);

  const headerBarProps = useMemo<HeaderBarProps>(() => {
    return {
      tab,
      setTab,
      filterKey,
      setFilterKey,
      selectedMonth,
      setSelectedMonth,
      selectedWeek,
      setSelectedWeek,
      selectedDevice,
      setSelectedDevice,
      selectedChannel,
      setSelectedChannel,
      selectedSource,
      setSelectedSource,
      selectedProduct,
      setSelectedProduct,
      monthOptions: stableMonthOptions,
      weekOptions: stableWeekOptions,
      deviceOptions: stableDeviceOptions,
      channelOptions: stableChannelOptions,
      sourceOptions: stableSourceOptions,
      productOptions: stableProductOptions,
      enabledMonthKeySet: stableEnabledMonthKeySet,
      enabledWeekKeySet: stableEnabledWeekKeySet,
      fullPeriod: stableFullPeriod,
      period: stablePeriodFixed,
      advertiserName: effectiveAdvertiserName,
      reportTypeName: effectiveReportTypeName,
      reportTypeKey: effectiveReportTypeKey,
      reportPeriod: stableReportPeriod,
      onChangeReportPeriod,
      readOnlyHeader,
      hidePeriodEditor,
      hideTabPeriodText,
    };
  }, [
    tab,
    filterKey,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    selectedSource,
    selectedProduct,
    stableMonthOptions,
    stableWeekOptions,
    stableDeviceOptions,
    stableChannelOptions,
    stableSourceOptions,
    stableProductOptions,
    stableEnabledMonthKeySet,
    stableEnabledWeekKeySet,
    stableFullPeriod,
    stablePeriodFixed,
    effectiveAdvertiserName,
    effectiveReportTypeName,
    effectiveReportTypeKey,
    stableReportPeriod,
    onChangeReportPeriod,
    readOnlyHeader,
    hidePeriodEditor,
    hideTabPeriodText,
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <HeaderSurface {...headerBarProps} />

      <div className="px-4 pb-10 pt-2 sm:px-6 lg:px-8 lg:pt-3">
        <div className="mx-auto w-full max-w-[1660px]">
          {isLoading ? (
            <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                <div className="text-sm font-medium text-slate-600">
                  Loading rows...
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative flex items-start justify-center gap-5 xl:gap-6">
            <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
              <MemoFloatingFilterRail
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                monthOptions={stableMonthOptions}
                selectedWeek={selectedWeek}
                setSelectedWeek={setSelectedWeek}
                weekOptions={stableWeekOptions}
                selectedDevice={selectedDevice}
                setSelectedDevice={setSelectedDevice}
                deviceOptions={stableDeviceOptions}
                selectedChannel={selectedChannel}
                setSelectedChannel={setSelectedChannel}
                channelOptions={stableChannelOptions}
                selectedSource={selectedSource}
                setSelectedSource={setSelectedSource}
                sourceOptions={stableSourceOptions}
                selectedProduct={selectedProduct}
                setSelectedProduct={setSelectedProduct}
                productOptions={stableProductOptions}
                enabledMonthKeySet={stableEnabledMonthKeySet}
                enabledWeekKeySet={stableEnabledWeekKeySet}
                readOnly={readOnlyHeader}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1440px]">
                <div className="space-y-8">
                  {deferredTab === "summary" && (
                    <>
                      <div className="rounded-2xl">
                        <MonthGoalSection {...(monthGoalSectionProps as any)} />
                      </div>

                      <div className="rounded-2xl">
                        <SummarySection {...(summarySectionProps as any)} />
                      </div>
                    </>
                  )}

                  {deferredTab === "decision" && (
                    <div className="rounded-2xl">
                      <DecisionPanel {...(decisionPanelProps as any)} />
                    </div>
                  )}

                  {isHypothesisTab(deferredTab) && (
                    <div className="rounded-2xl">
                      <HypothesisOperationPanel
                        index={hypothesisNumberOf(deferredTab)}
                        item={
                          topFiveHypotheses[hypothesisNumberOf(deferredTab) - 1]
                        }
                      />
                    </div>
                  )}

                  {deferredTab === "summary2" && (
                    <div className="rounded-2xl">
                      <Summary2Section
                        {...({ reportType } as any)}
                        rows={filteredRows as any[]}
                      />
                    </div>
                  )}

                  {deferredTab === "structure" && (
                    <div className="rounded-2xl">
                      <StructureSection
                        {...({ reportType } as any)}
                        bySource={bySource}
                        byCampaign={byCampaign}
                        rows={filteredRowsWithCreatives}
                        monthGoal={stableMonthGoal}
                      />
                    </div>
                  )}

                  {deferredTab === "keyword" && (
                    <div className="rounded-2xl">
                      <KeywordSection
                        {...({ reportType } as any)}
                        keywordAgg={keywordAgg}
                        keywordInsight={keywordInsight}
                      />
                    </div>
                  )}

                  {deferredTab === "keywordDetail" && (
                    <div className="rounded-2xl">
                      <KeywordDetailSection
                        {...({ reportType } as any)}
                        rows={filteredRowsWithCreatives as any[]}
                      />
                    </div>
                  )}

                  {deferredTab === "creative" && (
                    <div className="rounded-2xl">
                      <CreativeSection
                        {...({ reportType } as any)}
                        rows={creativeBaseRows}
                      />
                    </div>
                  )}

                  {deferredTab === "creativeDetail" && (
                    <div className="rounded-2xl">
                      <CreativeDetailSection
                        {...({ reportType } as any)}
                        rows={creativeBaseRows as any[]}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
              <MemoFloatingTabRail
                tab={tab}
                setTab={setTab}
                readOnly={readOnlyHeader}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
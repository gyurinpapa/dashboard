// app/components/ReportTemplate.tsx
"use client";

import type { ReportTheme } from "@/src/lib/report/theme";
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
  type SetStateAction,
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

const SummarySection = dynamic(
  () => import("@/app/components/sections/SummarySection").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const Summary2Section = dynamic(
  () => import("@/app/components/sections/Summary2Section").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const StructureSection = dynamic(
  () => import("@/app/components/sections/StructureSection").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const KeywordSection = dynamic(
  () => import("@/app/components/sections/KeywordSection").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const KeywordDetailSection = dynamic(
  () => import("@/app/components/sections/KeywordDetailSection").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const CreativeSection = dynamic(
  () => import("@/app/components/sections/CreativeSection").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const CreativeDetailSection = dynamic(
  () => import("@/app/components/sections/CreativeDetailSection").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <div className="rounded-2xl" />,
  },
);

const MonthGoalSection = dynamic(
  () => import("@/app/components/sections/MonthGoalSection").then((mod) => mod.default),
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

const MONTH_GOAL_KEY = "nature_report_month_goal_v1";

const DEFAULT_GOAL: GoalState = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

type MonthGoalState = GoalState & {
  roas?: number;
  ctr?: number;
  cvr?: number;
  cpc?: number;
  cpa?: number;
};

type MonthGoalProp =
  | {
      impressions?: string | number | null;
      clicks?: string | number | null;
      cost?: string | number | null;
      conversions?: string | number | null;
      revenue?: string | number | null;
      roas?: string | number | null;
      ctr?: string | number | null;
      cvr?: string | number | null;
      cpc?: string | number | null;
      cpa?: string | number | null;
    }
  | null
  | undefined;

type BrandSearchContractsProp =
  | Record<
      string,
      {
        pc?: string | number | null;
        mobile?: string | number | null;
      }
    >
  | null
  | undefined;

type NormalizedBrandSearchContracts = Record<
  string,
  {
    pc: number;
    mobile: number;
  }
>;

type BrandSearchDebugBucket = {
  key: string;
  month: string;
  device: string;
  matchedRows: number;
  appliedRows: number;
  contractAmount: number;
  allocatedCost: number;
};

function hasMonthGoalValue(v: any) {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0 && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined";
}

function parseMonthGoalNumber(v: any) {
  if (!hasMonthGoalValue(v)) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const n = Number(
    String(v)
      .replace(/[%₩,\s]/g, "")
      .trim(),
  );

  return Number.isFinite(n) ? n : 0;
}

function normalizeMonthGoalProp(input: MonthGoalProp): MonthGoalState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const hasAnyGoal = [
    (input as any).impressions,
    (input as any).clicks,
    (input as any).cost,
    (input as any).conversions,
    (input as any).revenue,
    (input as any).roas,
    (input as any).ctr,
    (input as any).cvr,
    (input as any).cpc,
    (input as any).cpa,
  ].some(hasMonthGoalValue);

  if (!hasAnyGoal) return null;

  return {
    impressions: parseMonthGoalNumber((input as any).impressions),
    clicks: parseMonthGoalNumber((input as any).clicks),
    cost: parseMonthGoalNumber((input as any).cost),
    conversions: parseMonthGoalNumber((input as any).conversions),
    revenue: parseMonthGoalNumber((input as any).revenue),

    // DB/Traffic/Commerce 목표 계산용 보조 목표값 보존
    roas: parseMonthGoalNumber((input as any).roas),
    ctr: parseMonthGoalNumber((input as any).ctr),
    cvr: parseMonthGoalNumber((input as any).cvr),
    cpc: parseMonthGoalNumber((input as any).cpc),
    cpa: parseMonthGoalNumber((input as any).cpa),
  };
}

function parseBrandSearchContractAmount(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0;

  const cleaned = String(v)
    .replace(/[₩,%\s]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeBrandSearchContractsProp(
  input: BrandSearchContractsProp,
): NormalizedBrandSearchContracts {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const out: NormalizedBrandSearchContracts = {};

  for (const [monthKeyRaw, value] of Object.entries(input)) {
    const monthKey = String(monthKeyRaw ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const pc = parseBrandSearchContractAmount((value as any).pc);
    const mobile = parseBrandSearchContractAmount((value as any).mobile);

    if (pc <= 0 && mobile <= 0) continue;

    out[monthKey] = {
      pc,
      mobile,
    };
  }

  return out;
}

const EMPTY_ROWS: any[] = [];
const EMPTY_STRING = "";
const EMPTY_SET = new Set<string>();

type Props = {
  rows: any[];
  isLoading?: boolean;
  creativesMap?: Record<string, string>;
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;
  workspaceLogoUrl?: string | null;
  reportTheme?: ReportTheme;
  reportPeriod: ReportPeriod;
  onChangeReportPeriod: (next: ReportPeriod) => void;
  monthGoal?: MonthGoalProp;
  brandSearchContracts?: BrandSearchContractsProp;
  readOnlyHeader?: boolean;
  hidePeriodEditor?: boolean;
  hideTabPeriodText?: boolean;
  /**
   * PPT/PDF export 전용: 특정 탭을 강제로 렌더링한다.
   * 기존 화면의 탭 state/setTab 동작은 건드리지 않는다.
   */
  forcedTab?: TabKey;
  /**
   * PPT 캡처 전용 모드.
   * 기존 일반 화면에는 영향을 주지 않고 header/navigation chrome을 제거한다.
   */
  exportMode?: boolean;
  /**
   * forcedTab 내부의 슬라이드 번호를 0부터 강제 지정한다.
   */
  forcedSlideIndex?: number;
};

type ReportFilterKey = FilterKey;
type SummarySlideIndex = 0 | 1 | 2;
type SummaryWebSlideIndex = 0 | 1 | 2 | 3;
type HeaderBarProps = ComponentProps<typeof HeaderBar>;

type HypothesisTabKey =
  | "hypothesis1"
  | "hypothesis2"
  | "hypothesis3"
  | "hypothesis4"
  | "hypothesis5";

const HYPOTHESIS_TABS: readonly HypothesisTabKey[] = [
  "hypothesis1",
  "hypothesis2",
  "hypothesis3",
  "hypothesis4",
  "hypothesis5",
];

type ManualHypothesisDraft = {
  title: string;
  summary: string;
  targetMetric: string;
  impact: number;
  confidence: number;
  ease: number;
};

type ReportRowLevel = "keyword" | "creative" | "mixed" | "unknown";

type ReportRowLevelBuckets = {
  keywordRows: any[];
  creativeRows: any[];
  mixedRows: any[];
  unknownRows: any[];
  representativeRows: any[];
  representativeLevel: ReportRowLevel;
};

type RowLevelBucketBuildOptions = {
  /**
   * 대용량 rows 최적화:
   * 현재 탭에서 실제로 필요한 bucket 배열만 반환해 메모리 보유량을 줄인다.
   * representativeRows 계산은 기존과 동일하게 유지한다.
   */
  needKeywordRows?: boolean;
  needCreativeRows?: boolean;
  needUnknownRows?: boolean;
};

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

function clampManualScore(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.75, Math.max(0.35, value));
}

function normalizeManualHypothesisText(...values: any[]) {
  return values
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, " ")
    .trim();
}

function hasAnyManualSignal(input: {
  title?: string;
  summary?: string;
  targetMetric?: string;
}) {
  return [input.title, input.summary, input.targetMetric].some(
    (value) => String(value ?? "").trim().length > 0,
  );
}

function countManualKeywordHits(text: string, keywords: string[]) {
  if (!text) return 0;
  return keywords.reduce((count, keyword) => {
    return text.includes(keyword.toLowerCase()) ? count + 1 : count;
  }, 0);
}

function boundedManualBoost(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(-max, value));
}

function inferManualHypothesisScores({
  title,
  summary,
  targetMetric,
  reportType,
}: {
  title?: string;
  summary?: string;
  targetMetric?: string;
  reportType: ReportType;
}) {
  if (!hasAnyManualSignal({ title, summary, targetMetric })) {
    return {
      impact: 0.5,
      confidence: 0.5,
      ease: 0.5,
    };
  }

  const source = normalizeManualHypothesisText(title, summary, targetMetric);
  const metricText = normalizeManualHypothesisText(targetMetric);

  const trafficGoalHits = countManualKeywordHits(source, [
    "클릭",
    "클릭수",
    "ctr",
    "유입",
    "방문",
    "트래픽",
    "노출",
    "도달",
    "impression",
    "impressions",
    "click",
    "clicks",
  ]);

  const conversionGoalHits = countManualKeywordHits(source, [
    "전환",
    "전환수",
    "cvr",
    "구매",
    "주문",
    "회원가입",
    "상담",
    "문의",
    "신청",
    "db",
    "lead",
    "리드",
    "cpa",
  ]);

  const commerceGoalHits = countManualKeywordHits(source, [
    "매출",
    "roas",
    "객단가",
    "구매액",
    "상품",
    "장바구니",
    "결제",
    "revenue",
    "sales",
    "gmv",
  ]);

  const efficiencyGoalHits = countManualKeywordHits(source, [
    "효율",
    "cpc",
    "cpa",
    "비용",
    "단가",
    "낭비",
    "저효율",
    "고효율",
    "비용 효율",
  ]);

  const keywordDimensionHits = countManualKeywordHits(source, [
    "키워드",
    "검색어",
    "쿼리",
    "대표키워드",
    "확장 키워드",
  ]);

  const creativeDimensionHits = countManualKeywordHits(source, [
    "소재",
    "카피",
    "문구",
    "이미지",
    "배너",
    "썸네일",
    "creative",
  ]);

  const campaignDimensionHits = countManualKeywordHits(source, [
    "캠페인",
    "광고그룹",
    "그룹",
    "세트",
    "adset",
    "campaign",
  ]);

  const segmentDimensionHits = countManualKeywordHits(source, [
    "기기",
    "디바이스",
    "요일",
    "시간대",
    "지역",
    "성별",
    "연령",
    "타겟",
    "잠재고객",
    "오디언스",
    "소스",
    "매체",
    "플랫폼",
  ]);

  const productDimensionHits = countManualKeywordHits(source, [
    "상품",
    "제품",
    "카테고리",
    "sku",
    "핵심 상품",
    "주력 상품",
  ]);

  const expansionActionHits = countManualKeywordHits(source, [
    "확장",
    "확대",
    "추가",
    "추가 등록",
    "등록",
    "스케일",
    "늘리",
    "증가",
    "증액",
    "확보",
  ]);

  const optimizationActionHits = countManualKeywordHits(source, [
    "조정",
    "최적화",
    "개선",
    "재배분",
    "이동",
    "분리",
    "상향",
    "하향",
    "제외",
    "중단",
    "off",
    "on",
  ]);

  const heavyActionHits = countManualKeywordHits(source, [
    "구조 개편",
    "전면 개편",
    "랜딩",
    "랜딩페이지",
    "상품 전략",
    "가격",
    "프로모션",
    "대규모",
    "개발",
    "연동",
    "설계",
    "리뉴얼",
  ]);

  const evidenceHits = countManualKeywordHits(source, [
    "기존",
    "검증",
    "데이터",
    "성과 좋은",
    "고효율",
    "상위",
    "대표",
    "핵심",
    "우수",
    "전월",
    "최근",
    "이미",
    "확인",
  ]);

  const uncertaintyHits = countManualKeywordHits(source, [
    "신규",
    "테스트",
    "실험",
    "탐색",
    "불확실",
    "확인 필요",
    "가설",
    "파일럿",
    "초기",
    "시도",
    "추정",
  ]);

  const sizeOrComplexityHits = countManualKeywordHits(source, [
    "대량",
    "대규모",
    "전체",
    "전면",
    "일괄",
    "모든",
    "전체 캠페인",
  ]);

  const hasMetric = metricText.length > 0 && metricText !== "목표 kpi";
  const hasSpecificDimension =
    keywordDimensionHits +
      creativeDimensionHits +
      campaignDimensionHits +
      segmentDimensionHits +
      productDimensionHits >
    0;
  const hasClearAction = expansionActionHits + optimizationActionHits + heavyActionHits > 0;

  const reportGoalAlignment =
    reportType === "traffic"
      ? trafficGoalHits * 0.035 + keywordDimensionHits * 0.018 + creativeDimensionHits * 0.012
      : reportType === "db_acquisition"
        ? conversionGoalHits * 0.035 + efficiencyGoalHits * 0.018 + segmentDimensionHits * 0.012
        : commerceGoalHits * 0.035 + conversionGoalHits * 0.02 + productDimensionHits * 0.018;

  const crossReportGoalSupport =
    trafficGoalHits * 0.012 +
    conversionGoalHits * 0.018 +
    commerceGoalHits * 0.018 +
    efficiencyGoalHits * 0.014;

  const dimensionSupport =
    keywordDimensionHits * 0.016 +
    creativeDimensionHits * 0.014 +
    campaignDimensionHits * 0.014 +
    segmentDimensionHits * 0.012 +
    productDimensionHits * 0.014;

  const actionImpactSupport =
    expansionActionHits * 0.016 +
    optimizationActionHits * 0.014 +
    heavyActionHits * 0.012;

  const actionEaseSupport =
    keywordDimensionHits * 0.018 +
    creativeDimensionHits * 0.018 +
    optimizationActionHits * 0.018 +
    expansionActionHits * 0.012;

  const impact = clampManualScore(
    0.5 +
      boundedManualBoost(reportGoalAlignment, 0.12) +
      boundedManualBoost(crossReportGoalSupport, 0.08) +
      boundedManualBoost(dimensionSupport, 0.07) +
      boundedManualBoost(actionImpactSupport, 0.06) +
      (hasMetric ? 0.015 : 0) -
      (!hasClearAction ? 0.015 : 0),
  );

  const confidence = clampManualScore(
    0.5 +
      boundedManualBoost(evidenceHits * 0.026, 0.13) +
      boundedManualBoost(hasSpecificDimension ? 0.025 : -0.015, 0.03) +
      boundedManualBoost(hasClearAction ? 0.025 : -0.015, 0.03) -
      boundedManualBoost(uncertaintyHits * 0.035, 0.14) -
      boundedManualBoost(heavyActionHits * 0.018, 0.08),
  );

  const ease = clampManualScore(
    0.5 +
      boundedManualBoost(actionEaseSupport, 0.14) +
      boundedManualBoost(campaignDimensionHits * 0.008 + segmentDimensionHits * 0.008, 0.03) -
      boundedManualBoost(heavyActionHits * 0.045, 0.16) -
      boundedManualBoost(sizeOrComplexityHits * 0.025, 0.08),
  );

  return {
    impact,
    confidence,
    ease,
  };
}


function inferManualHypothesisScoreReason({
  title,
  summary,
  targetMetric,
  reportType,
}: {
  title?: string;
  summary?: string;
  targetMetric?: string;
  reportType: ReportType;
}) {
  if (!hasAnyManualSignal({ title, summary, targetMetric })) {
    return "입력된 수동 가설이 아직 없어 기본값으로 표시됩니다.";
  }

  const source = normalizeManualHypothesisText(title, summary, targetMetric);
  const reportTypeLabel =
    reportType === "traffic"
      ? "트래픽 목적"
      : reportType === "db_acquisition"
        ? "DB획득 목적"
        : "커머스 목적";

  const trafficGoalHits = countManualKeywordHits(source, ["클릭", "클릭수", "ctr", "유입", "방문", "트래픽", "노출", "도달"]);
  const conversionGoalHits = countManualKeywordHits(source, ["전환", "전환수", "cvr", "구매", "주문", "회원가입", "상담", "문의", "신청", "db", "lead", "리드", "cpa"]);
  const commerceGoalHits = countManualKeywordHits(source, ["매출", "roas", "객단가", "구매액", "상품", "장바구니", "결제"]);
  const keywordDimensionHits = countManualKeywordHits(source, ["키워드", "검색어", "쿼리", "대표키워드", "확장 키워드"]);
  const creativeDimensionHits = countManualKeywordHits(source, ["소재", "카피", "문구", "이미지", "배너", "썸네일"]);
  const campaignDimensionHits = countManualKeywordHits(source, ["캠페인", "광고그룹", "그룹", "세트"]);
  const segmentDimensionHits = countManualKeywordHits(source, ["기기", "디바이스", "요일", "시간대", "지역", "성별", "연령", "타겟", "잠재고객", "오디언스", "소스", "매체", "플랫폼"]);
  const productDimensionHits = countManualKeywordHits(source, ["상품", "제품", "카테고리", "sku", "핵심 상품", "주력 상품"]);
  const expansionActionHits = countManualKeywordHits(source, ["확장", "확대", "추가", "추가 등록", "등록", "스케일", "늘리", "증가", "증액", "확보"]);
  const optimizationActionHits = countManualKeywordHits(source, ["조정", "최적화", "개선", "재배분", "이동", "분리", "상향", "하향", "제외", "중단", "off", "on"]);
  const heavyActionHits = countManualKeywordHits(source, ["구조 개편", "전면 개편", "랜딩", "랜딩페이지", "상품 전략", "가격", "프로모션", "대규모", "개발", "연동", "설계", "리뉴얼"]);
  const evidenceHits = countManualKeywordHits(source, ["기존", "검증", "데이터", "성과 좋은", "고효율", "상위", "대표", "핵심", "우수", "전월", "최근", "이미", "확인"]);
  const uncertaintyHits = countManualKeywordHits(source, ["신규", "테스트", "실험", "탐색", "불확실", "확인 필요", "가설", "파일럿", "초기", "시도", "추정"]);

  const goalLabel =
    trafficGoalHits >= conversionGoalHits && trafficGoalHits >= commerceGoalHits && trafficGoalHits > 0
      ? "트래픽/클릭 개선 목표"
      : conversionGoalHits >= trafficGoalHits && conversionGoalHits >= commerceGoalHits && conversionGoalHits > 0
        ? "전환/DB 개선 목표"
        : commerceGoalHits > 0
          ? "매출/ROAS 개선 목표"
          : targetMetric?.trim()
            ? "입력된 목표 KPI"
            : "목표 KPI 미입력";

  const dimensionLabel =
    keywordDimensionHits > 0
      ? "키워드 기준"
      : creativeDimensionHits > 0
        ? "소재 기준"
        : campaignDimensionHits > 0
          ? "캠페인/그룹 기준"
          : segmentDimensionHits > 0
            ? "세그먼트 기준"
            : productDimensionHits > 0
              ? "상품 기준"
              : "측정기준 미지정";

  const actionLabel =
    heavyActionHits > 0
      ? "구조 변경성 액션"
      : optimizationActionHits > 0
        ? "최적화 액션"
        : expansionActionHits > 0
          ? "확장 액션"
          : "액션 미지정";

  const confidenceLabel =
    evidenceHits > uncertaintyHits
      ? "근거 표현이 있어 신뢰도를 소폭 높였습니다"
      : uncertaintyHits > evidenceHits
        ? "테스트/불확실 표현이 있어 신뢰도는 보수적으로 잡았습니다"
        : "근거와 불확실 표현이 중립이라 신뢰도는 중간값에 가깝게 유지했습니다";

  const easeLabel =
    heavyActionHits > 0
      ? "구조·랜딩·전략성 작업은 실행 난이도를 보수적으로 반영했습니다"
      : expansionActionHits + optimizationActionHits > 0
        ? "추가·조정·제외처럼 바로 실행 가능한 표현은 실행 용이성을 높였습니다"
        : "실행 방식이 명확하지 않아 실행 용이성은 중간값에 가깝게 유지했습니다";

  return reportTypeLabel + "에서 " + goalLabel + ", " + dimensionLabel + ", " + actionLabel + "으로 해석했습니다. " + confidenceLabel + ". " + easeLabel + ".";
}

const HypothesisOperationPanel = memo(function HypothesisOperationPanel({
  index,
  item,
  isManual = false,
  onChangeManualHypothesis,
}: {
  index: number;
  item?: PriorityItem | null;
  isManual?: boolean;
  onChangeManualHypothesis?: (next: ManualHypothesisDraft) => void;
}) {
  const [executionStatus, setExecutionStatus] = useState<
    "not_started" | "running" | "done" | "stopped"
  >("not_started");
  const [executionStartDate, setExecutionStartDate] = useState("");
  const [executionEndDate, setExecutionEndDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");
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
            Decision 탭의 자동 추천 또는 운영자 수동 가설이 생성되면 가설{" "}
            {index}이 이 페이지에 연결됩니다.
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
              desc: "실행 종료일, 리뷰일, 결과 판단, 개선/악화/보류 판단을 준비합니다.",
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

  const prioritySummary = getPrioritySummary(item);
  const targetMetric = getPriorityMetric(item);
  const score = Number((item as any)?.score ?? 0);
  const impact = Number((item as any)?.impact ?? 0);
  const confidence = Number((item as any)?.confidence ?? 0);
  const ease = Number((item as any)?.ease ?? 0);

  const manualTitle = String((item as any)?.title ?? "");
  const manualSummary = prioritySummary;
  const manualTargetMetric = targetMetric;
  const manualScoreReason = String(
    (item as any)?.manualScoreReason ||
      "수동 가설의 목표 KPI, 측정기준, 액션 유형을 기준으로 자동 추정합니다.",
  );

  const updateManualHypothesis = (patch: Partial<ManualHypothesisDraft>) => {
    if (!isManual || !onChangeManualHypothesis) return;

    onChangeManualHypothesis({
      title: manualTitle,
      summary: manualSummary,
      targetMetric: manualTargetMetric,
      impact,
      confidence,
      ease,
      ...patch,
    });
  };

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
  const hasExecutionEndDate = executionEndDate.trim().length > 0;
  const hasReviewDate = reviewDate.trim().length > 0;
  const hasExecutionStarted =
    executionStatus !== "not_started" ||
    hasExecutionStartDate ||
    hasExecutionEndDate ||
    hasReviewDate ||
    hasExecutionMemo;

  const executionStartDateTone = hasExecutionStartDate
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  const executionEndDateTone = hasExecutionEndDate
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  const reviewDateTone = hasReviewDate
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  const executionMemoTone = hasExecutionMemo
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-slate-200 bg-slate-50 text-slate-600";

  const operationCompletionCount =
    (executionStatus !== "not_started" ? 1 : 0) +
    (hasExecutionStartDate ? 1 : 0) +
    (hasExecutionEndDate ? 1 : 0) +
    (hasReviewDate ? 1 : 0) +
    (hasExecutionMemo ? 1 : 0) +
    (reviewResult ? 1 : 0);

  const operationCompletionLabel = `${operationCompletionCount}/6 작성됨`;

  const operationCompletionTone =
    operationCompletionCount <= 2
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : operationCompletionCount <= 5
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
          {isManual ? (
            <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-violet-700">
              MANUAL
            </div>
          ) : null}
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

        {isManual ? (
          <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs font-semibold leading-5 text-violet-700">
            규칙 기반 자동 추정: {manualScoreReason}
          </div>
        ) : null}
      </div>

      {isManual ? (
        <div className="rounded-3xl border border-violet-200 bg-violet-50/70 px-4 py-4">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-violet-700">
            MANUAL HYPOTHESIS
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="rounded-2xl border border-violet-100 bg-white px-4 py-3 md:col-span-2">
              <div className="text-xs font-semibold text-slate-600">
                수동 가설 제목
              </div>
              <input
                value={manualTitle}
                onChange={(e) =>
                  updateManualHypothesis({ title: e.target.value })
                }
                placeholder="예: 고효율 상품군 중심으로 예산을 재배분한다"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>

            <label className="rounded-2xl border border-violet-100 bg-white px-4 py-3">
              <div className="text-xs font-semibold text-slate-600">
                목표 KPI
              </div>
              <input
                value={manualTargetMetric}
                onChange={(e) =>
                  updateManualHypothesis({ targetMetric: e.target.value })
                }
                placeholder="예: ROAS / CPA / 전환수 / 매출"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>

            <label className="rounded-2xl border border-violet-100 bg-white px-4 py-3">
              <div className="text-xs font-semibold text-slate-600">요약</div>
              <input
                value={manualSummary}
                onChange={(e) =>
                  updateManualHypothesis({ summary: e.target.value })
                }
                placeholder="이 가설을 실행하는 이유를 짧게 입력"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
            </label>
          </div>
        </div>
      ) : null}

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
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${executionEndDateTone}`}
            >
              종료일: {executionEndDate || "미입력"}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${reviewDateTone}`}
            >
              리뷰일: {reviewDate || "미입력"}
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
            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                실행 종료일
              </div>
              <input
                type="date"
                value={executionEndDate}
                onChange={(e) => setExecutionEndDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                실제 액션을 멈추거나 완료한 날짜를 기록합니다.
              </p>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                리뷰일
              </div>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                실행 결과를 확인하고 판단한 날짜를 기록합니다.
              </p>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
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

  if (base.row_level == null && rec?.row_level != null) {
    base.row_level = rec.row_level;
  }
  if (base.rowLevel == null && rec?.rowLevel != null) {
    base.rowLevel = rec.rowLevel;
  }
  if (base.data_level == null && rec?.data_level != null) {
    base.data_level = rec.data_level;
  }
  if (base.dataLevel == null && rec?.dataLevel != null) {
    base.dataLevel = rec.dataLevel;
  }

  if (base.__row_id == null && rec?.id != null) base.__row_id = rec.id;
  if (base.id == null && rec?.id != null) base.id = rec.id;

  return base;
}

function normalizeBrandSearchText(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[\s_\-\/\.]+/g, "")
    .trim();
}

function getBrandSearchMonthKey(row: any) {
  const ymd = pickDateStrLoose(row);
  return ymd ? ymd.slice(0, 7) : "";
}

function getBrandSearchDeviceBucket(row: any): "pc" | "mobile" | "" {
  const raw = firstNonEmpty(
    row?.device,
    row?.device_type,
    row?.deviceType,
    row?.platform_device,
    row?.platformDevice,
    row?.device_name,
    row?.deviceName,
    row?.placement,
    row?.placement_name,
    row?.campaign_name,
    row?.campaignName,
    row?.campaign,
    row?.group_name,
    row?.groupName,
    row?.adgroup_name,
    row?.ad_group,
    row?.product,
    row?.product_name,
    row?.productName,
    row?.media_product,
    row?.mediaProduct,
    row?.["디바이스"],
    row?.["기기"],
    row?.["매체"],
    row?.["광고상품"],
    row?.["상품"],
    row?.["캠페인"],
    row?.["캠페인명"],
    row?.["광고그룹"],
    row?.["광고그룹명"],
    row?.["노출위치"],
  );

  const compact = normalizeBrandSearchText(raw);
  if (!compact) return "";

  if (
    compact.includes("mobile") ||
    compact.includes("mo") ||
    compact === "m" ||
    compact.includes("모바일") ||
    compact.includes("스마트폰") ||
    compact.includes("휴대폰")
  ) {
    return "mobile";
  }

  if (
    compact.includes("pc") ||
    compact.includes("desktop") ||
    compact.includes("desk") ||
    compact.includes("데스크탑") ||
    compact.includes("데스크톱") ||
    compact.includes("피씨") ||
    compact.includes("컴퓨터")
  ) {
    return "pc";
  }

  return "";
}

function isNaverBrandSearchRow(row: any) {
  const values = [
    row?.source,
    row?.site_source,
    row?.publisher,
    row?.inventory_source,
    row?.platform,
    row?.media_source,
    row?.ad_platform,
    row?.channel,
    row?.ad_channel,
    row?.media,
    row?.media_type,
    row?.media_product,
    row?.mediaProduct,
    row?.campaign_name,
    row?.campaignName,
    row?.campaign,
    row?.group_name,
    row?.groupName,
    row?.adgroup_name,
    row?.ad_group,
    row?.group,
    row?.product,
    row?.product_name,
    row?.productName,
    row?.report_type_name,
    row?.reportTypeName,
    row?.["매체"],
    row?.["매체명"],
    row?.["광고상품"],
    row?.["광고 상품"],
    row?.["상품"],
    row?.["상품명"],
    row?.["광고유형"],
    row?.["광고 유형"],
    row?.["캠페인"],
    row?.["캠페인명"],
    row?.["광고그룹"],
    row?.["광고그룹명"],
    row?.["채널"],
    row?.["소스"],
    row?.["플랫폼"],
  ];

  const compact = values.map(normalizeBrandSearchText).filter(Boolean).join("|");

  if (!compact) return false;

  const hasBrandSearchSignal =
    compact.includes("브랜드검색") ||
    compact.includes("brandsearch") ||
    compact.includes("brandad") ||
    compact.includes("brandkeyword");

  if (!hasBrandSearchSignal) return false;

  const hasKoreanBrandSearchSignal = compact.includes("브랜드검색");
  const hasNaverSignal =
    compact.includes("naver") ||
    compact.includes("nvr") ||
    compact.includes("네이버");

  return hasKoreanBrandSearchSignal || hasNaverSignal;
}

function buildBrandSearchCostDebugSummary(
  rows: any[],
  contracts: NormalizedBrandSearchContracts,
) {
  const buckets = new Map<string, BrandSearchDebugBucket>();
  const samples: any[] = [];

  let matchedRows = 0;
  let appliedRows = 0;
  let skippedNoMonth = 0;
  let skippedNoContractMonth = 0;
  let skippedNoDevice = 0;
  let skippedNoAmount = 0;

  for (const row of rows ?? []) {
    if (!isNaverBrandSearchRow(row)) continue;

    matchedRows += 1;

    const monthKey = getBrandSearchMonthKey(row);
    const deviceBucket = getBrandSearchDeviceBucket(row);
    const contractAmount =
      monthKey && (deviceBucket === "pc" || deviceBucket === "mobile")
        ? contracts?.[monthKey]?.[deviceBucket] ?? 0
        : 0;

    if (!monthKey) skippedNoMonth += 1;
    if (monthKey && !contracts?.[monthKey]) skippedNoContractMonth += 1;
    if (deviceBucket !== "pc" && deviceBucket !== "mobile") skippedNoDevice += 1;
    if (monthKey && contracts?.[monthKey] && (deviceBucket === "pc" || deviceBucket === "mobile") && contractAmount <= 0) {
      skippedNoAmount += 1;
    }

    if (monthKey && (deviceBucket === "pc" || deviceBucket === "mobile")) {
      const key = `${monthKey}:${deviceBucket}`;
      const prev = buckets.get(key) ?? {
        key,
        month: monthKey,
        device: deviceBucket,
        matchedRows: 0,
        appliedRows: 0,
        contractAmount,
        allocatedCost: 0,
      };

      prev.matchedRows += 1;
      prev.contractAmount = contractAmount;

      if ((row as any)?.brand_search_contract_cost_applied) {
        prev.appliedRows += 1;
        appliedRows += 1;
      }

      prev.allocatedCost =
        prev.appliedRows > 0 && prev.contractAmount > 0
          ? prev.contractAmount / prev.appliedRows
          : 0;

      buckets.set(key, prev);
    }

    if (samples.length < 20) {
      samples.push({
        month: monthKey,
        device: deviceBucket,
        applied: !!(row as any)?.brand_search_contract_cost_applied,
        cost: row?.cost ?? row?.spend ?? row?.ad_cost ?? null,
        originalCost: row?.brand_search_original_cost ?? null,
        source: row?.source ?? row?.media_source ?? row?.platform ?? row?.["매체"] ?? null,
        channel: row?.channel ?? row?.ad_channel ?? row?.media ?? row?.["광고상품"] ?? null,
        campaign: row?.campaign_name ?? row?.campaignName ?? row?.campaign ?? row?.["캠페인명"] ?? null,
        group: row?.group_name ?? row?.groupName ?? row?.adgroup_name ?? row?.["광고그룹명"] ?? null,
        deviceRaw: row?.device ?? row?.device_type ?? row?.["기기"] ?? row?.["디바이스"] ?? null,
      });
    }
  }

  const byMonthDevice = Array.from(buckets.values()).sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  return {
    totalRows: rows?.length ?? 0,
    contractMonths: Object.keys(contracts ?? {}).sort(),
    matchedRows,
    appliedRows,
    skippedNoMonth,
    skippedNoContractMonth,
    skippedNoDevice,
    skippedNoAmount,
    byMonthDevice,
    samples,
  };
}

function applyBrandSearchContractCostsToRows(
  rows: any[],
  contracts: NormalizedBrandSearchContracts,
) {
  if (!rows?.length) return EMPTY_ROWS;

  const monthKeys = Object.keys(contracts ?? {});
  if (!monthKeys.length) return rows;

  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!isNaverBrandSearchRow(row)) continue;

    const monthKey = getBrandSearchMonthKey(row);
    if (!monthKey || !contracts[monthKey]) continue;

    const deviceBucket = getBrandSearchDeviceBucket(row);
    if (deviceBucket !== "pc" && deviceBucket !== "mobile") continue;

    const contractAmount = contracts[monthKey]?.[deviceBucket] ?? 0;
    if (!Number.isFinite(contractAmount) || contractAmount <= 0) continue;

    const key = `${monthKey}:${deviceBucket}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) return rows;

  let changed = false;

  const nextRows = rows.map((row) => {
    if (!isNaverBrandSearchRow(row)) return row;

    const monthKey = getBrandSearchMonthKey(row);
    if (!monthKey || !contracts[monthKey]) return row;

    const deviceBucket = getBrandSearchDeviceBucket(row);
    if (deviceBucket !== "pc" && deviceBucket !== "mobile") return row;

    const contractAmount = contracts[monthKey]?.[deviceBucket] ?? 0;
    if (!Number.isFinite(contractAmount) || contractAmount <= 0) return row;

    const key = `${monthKey}:${deviceBucket}`;
    const rowCount = counts.get(key) ?? 0;
    if (rowCount <= 0) return row;

    const allocatedCost = contractAmount / rowCount;
    if (!Number.isFinite(allocatedCost) || allocatedCost <= 0) return row;

    changed = true;

    return {
      ...row,
      cost: allocatedCost,
      spend: allocatedCost,
      ad_cost: allocatedCost,
      brand_search_contract_cost_applied: true,
      brand_search_contract_month: monthKey,
      brand_search_contract_device: deviceBucket,
      brand_search_contract_amount: contractAmount,
      brand_search_contract_row_count: rowCount,
      brand_search_original_cost:
        row?.brand_search_original_cost ??
        row?.cost ??
        row?.spend ??
        row?.ad_cost ??
        null,
    };
  });

  return changed ? nextRows : rows;
}

function getNormalizedRowLevelValue(row: any): ReportRowLevel {
  const raw = firstNonEmpty(
    row?.row_level,
    row?.rowLevel,
    row?.data_level,
    row?.dataLevel,
    row?.level,
  ).toLowerCase();

  if (raw === "keyword") return "keyword";
  if (raw === "creative") return "creative";
  if (raw === "mixed") return "mixed";
  return "unknown";
}

function hasKeywordSignal(row: any) {
  return !!firstNonEmpty(
    row?.keyword,
    row?.keyword_name,
    row?.keywordName,
    row?.search_term,
    row?.searchTerm,
    row?.query,
    row?.검색어,
    row?.키워드,
  );
}

function hasCreativeSignal(row: any) {
  return !!firstNonEmpty(
    row?.creative,
    row?.creative_name,
    row?.creativeName,
    row?.creative_file,
    row?.creativeFile,
    row?.creative_key,
    row?.creativeKey,
    row?.imagepath,
    row?.imagePath,
    row?.image_path,
    row?.image_url,
    row?.imageUrl,
    row?.thumbnail?.imagePath,
    row?.thumbUrl,
    row?.소재,
    row?.소재명,
  );
}

function normalizeAdChannelValue(row: any) {
  return firstNonEmpty(
    row?.channel,
    row?.ad_channel,
    row?.media,
    row?.media_type,
    row?.campaign_channel,
  )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isSearchAdRow(row: any) {
  const channel = normalizeAdChannelValue(row);

  return (
    channel === "search ad" ||
    channel === "search" ||
    channel.includes("search ad") ||
    channel.includes("검색")
  );
}

function isDisplayAdRow(row: any) {
  const channel = normalizeAdChannelValue(row);

  return (
    channel === "display ad" ||
    channel === "display" ||
    channel.includes("display ad") ||
    channel.includes("디스플레이")
  );
}

function isNaverSearchAdsAuthoritativeShoppingCreativeRow(row: any) {
  const provider = firstNonEmpty(row?.provider)
    .toLowerCase()
    .trim();

  const rowLevel = firstNonEmpty(
    row?.row_level,
    row?.rowLevel,
  )
    .toLowerCase()
    .trim();

  const dataLevel = firstNonEmpty(
    row?.data_level,
    row?.dataLevel,
  )
    .toLowerCase()
    .trim();

  const rowLevelReason = firstNonEmpty(
    row?.row_level_reason,
    row?.rowLevelReason,
  )
    .toLowerCase()
    .trim();

  return (
    provider === "naver_searchad" &&
    rowLevel === "creative" &&
    dataLevel === "creative" &&
    rowLevelReason ===
      "naver_searchad_shopping_ad_daily_stats"
  );
}

function shouldIncludeCreativeRowInRepresentativeRows(row: any) {
  /**
   * Naver SHOPPING의 creative row는 소재 상세 중복 행이 아니라
   * 해당 캠페인의 유일한 authoritative 성과 행이므로 대표 집계에 포함한다.
   */
  if (isNaverSearchAdsAuthoritativeShoppingCreativeRow(row)) {
    return true;
  }

  if (isSearchAdRow(row)) return false;
  if (isDisplayAdRow(row)) return true;

  /**
   * channel 값이 애매한 creative-only row는 전체 성과에서 누락되면 더 위험하다.
   * keyword 신호가 없고 creative 신호만 있는 경우는 display/meta 계열일 가능성이 높으므로 포함한다.
   */
  return !hasKeywordSignal(row);
}

function resolveLegacyRowLevel(row: any): ReportRowLevel {
  const keywordSignal = hasKeywordSignal(row);
  const creativeSignal = hasCreativeSignal(row);

  if (keywordSignal && creativeSignal) return "mixed";
  if (keywordSignal) return "keyword";
  if (creativeSignal) return "creative";
  return "unknown";
}

function createEmptyRowLevelBuckets(): ReportRowLevelBuckets {
  return {
    keywordRows: EMPTY_ROWS,
    creativeRows: EMPTY_ROWS,
    mixedRows: EMPTY_ROWS,
    unknownRows: EMPTY_ROWS,
    representativeRows: EMPTY_ROWS,
    representativeLevel: "unknown",
  };
}

function resolveRepresentativeRowLevel(input: {
  keywordRows: any[];
  creativeRows: any[];
  mixedRows: any[];
  unknownRows: any[];
}): ReportRowLevel {
  if (input.keywordRows.length > 0) return "keyword";
  if (input.creativeRows.length > 0) return "creative";
  if (input.mixedRows.length > 0) return "mixed";
  return "unknown";
}

function pickRepresentativeRows(input: {
  keywordRows: any[];
  creativeRows: any[];
  mixedRows: any[];
  unknownRows: any[];
}) {
  const representativeRows = [
    /**
     * search ad는 keyword rows를 전체 성과 기준으로 사용한다.
     * 네이버처럼 keyword/creative가 별도 rows로 들어오는 경우,
     * creative rows까지 전체 성과에 포함하면 중복 집계될 수 있다.
     */
    ...input.keywordRows,

    /**
     * creative rows는 display ad, keyword 신호가 없는 creative-only row,
     * 또는 Naver SHOPPING authoritative creative row만 전체 성과 기준에 포함한다.
     * 그 외 search ad creative rows는 소재 탭에서는 사용하지만 전체 성과에서는 제외한다.
     */
    ...input.creativeRows.filter((row) =>
      shouldIncludeCreativeRowInRepresentativeRows(row),
    ),

    /**
     * mixed/unknown은 기존처럼 전체 성과 기준에 포함한다.
     */
    ...input.mixedRows,
    ...input.unknownRows,
  ];

  return representativeRows.length > 0 ? representativeRows : EMPTY_ROWS;
}

export function buildRowLevelBuckets(
  rows: any[],
  options: RowLevelBucketBuildOptions = {},
): ReportRowLevelBuckets {
  if (!rows?.length) return createEmptyRowLevelBuckets();

  const needKeywordRows = options.needKeywordRows ?? true;
  const needCreativeRows = options.needCreativeRows ?? true;
  const needMixedRows = needKeywordRows || needCreativeRows;
  const needUnknownRows = options.needUnknownRows ?? true;

  const keywordRows: any[] = [];
  const creativeRows: any[] = [];
  const mixedRows: any[] = [];
  const unknownRows: any[] = [];

  let knownTaggedRowCount = 0;

  /**
   * 신규 ingestion 이후에는 row.row_level/data_level 값이 이미 저장된다.
   * 이 경우 렌더링 단계에서 키워드/소재 신호를 다시 판별하지 않고,
   * 저장된 row_level만 읽어서 3만 행 재판단 비용을 줄인다.
   */
  for (const row of rows ?? []) {
    const explicitLevel = getNormalizedRowLevelValue(row);

    if (explicitLevel === "keyword") {
      knownTaggedRowCount += 1;
      keywordRows.push(row);
      continue;
    }

    if (explicitLevel === "creative") {
      knownTaggedRowCount += 1;
      creativeRows.push(row);
      continue;
    }

    if (explicitLevel === "mixed") {
      knownTaggedRowCount += 1;
      mixedRows.push(row);
      continue;
    }

    unknownRows.push(row);
  }

  if (knownTaggedRowCount > 0) {
    const representativeRows = pickRepresentativeRows({
      keywordRows,
      creativeRows,
      mixedRows,
      unknownRows,
    });
    const representativeLevel = resolveRepresentativeRowLevel({
      keywordRows,
      creativeRows,
      mixedRows,
      unknownRows,
    });

    return {
      keywordRows: needKeywordRows ? keywordRows : EMPTY_ROWS,
      creativeRows: needCreativeRows ? creativeRows : EMPTY_ROWS,
      mixedRows: needMixedRows ? mixedRows : EMPTY_ROWS,
      unknownRows: needUnknownRows ? unknownRows : EMPTY_ROWS,
      representativeRows,
      representativeLevel,
    };
  }

  /**
   * legacy fallback:
   * 과거에 업로드되어 row_level이 없는 rows만 있을 때만 신호 기반 판별을 수행한다.
   * 신규 데이터에서는 이 경로를 타지 않는다.
   */
  const legacyKeywordRows: any[] = [];
  const legacyCreativeRows: any[] = [];
  const legacyMixedRows: any[] = [];
  const legacyUnknownRows: any[] = [];

  for (const row of rows ?? []) {
    const legacyLevel = resolveLegacyRowLevel(row);

    if (legacyLevel === "keyword") {
      legacyKeywordRows.push(row);
      continue;
    }

    if (legacyLevel === "creative") {
      legacyCreativeRows.push(row);
      continue;
    }

    if (legacyLevel === "mixed") {
      legacyMixedRows.push(row);
      continue;
    }

    legacyUnknownRows.push(row);
  }

  const representativeRows = pickRepresentativeRows({
    keywordRows: legacyKeywordRows,
    creativeRows: legacyCreativeRows,
    mixedRows: legacyMixedRows,
    unknownRows: legacyUnknownRows,
  });
  const representativeLevel = resolveRepresentativeRowLevel({
    keywordRows: legacyKeywordRows,
    creativeRows: legacyCreativeRows,
    mixedRows: legacyMixedRows,
    unknownRows: legacyUnknownRows,
  });

  return {
    keywordRows: needKeywordRows ? legacyKeywordRows : EMPTY_ROWS,
    creativeRows: needCreativeRows ? legacyCreativeRows : EMPTY_ROWS,
    mixedRows: needMixedRows ? legacyMixedRows : EMPTY_ROWS,
    unknownRows: needUnknownRows ? legacyUnknownRows : EMPTY_ROWS,
    representativeRows,
    representativeLevel,
  };
}

function pickKeywordRowsForTabs(buckets: ReportRowLevelBuckets) {
  if (buckets.keywordRows.length > 0) return buckets.keywordRows;
  if (buckets.mixedRows.length > 0) return buckets.mixedRows;
  return EMPTY_ROWS;
}

function pickCreativeRowsForTabs(buckets: ReportRowLevelBuckets) {
  if (buckets.creativeRows.length > 0) return buckets.creativeRows;
  if (buckets.mixedRows.length > 0) return buckets.mixedRows;
  return EMPTY_ROWS;
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

type HeaderSurfaceProps = HeaderBarProps & {
  exportMode?: boolean;
};

function clampSlideIndex(value: unknown, max: number, fallback: SummarySlideIndex) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(0, Math.trunc(numeric))) as SummarySlideIndex;
}

const HeaderSurface = memo(function HeaderSurface({
  exportMode = false,
  ...props
}: HeaderSurfaceProps) {
  return (
    <div
      className={
        exportMode
          ? "relative z-[1] isolate w-full self-start"
          : "sticky top-0 z-[200] isolate w-full self-start"
      }
    >
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(248,244,237,0.985)_0%,rgba(244,233,218,0.975)_38%,rgba(222,239,244,0.965)_72%,rgba(190,220,232,0.965)_100%)] shadow-[0_10px_30px_rgba(90,117,136,0.10)] backdrop-blur-xl" />
      <MemoHeaderBar {...props} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(127,166,196,0.50)_18%,rgba(127,166,196,0.50)_82%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-full h-8 bg-[linear-gradient(180deg,rgba(90,117,136,0.15)_0%,rgba(127,166,196,0.07)_34%,rgba(255,255,255,0)_100%)]" />
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
  workspaceLogoUrl,
  reportTheme = "light",
  reportPeriod,
  onChangeReportPeriod,
  monthGoal: incomingMonthGoal,
  brandSearchContracts: incomingBrandSearchContracts,
  readOnlyHeader = false,
  hidePeriodEditor = false,
  hideTabPeriodText = false,
  forcedTab,
  exportMode = false,
  forcedSlideIndex,
}: Props) {
  const isStudioTheme = reportTheme === "studio";

  const [internalTab, setInternalTab] = useState<TabKey>("summary");
  const [summarySlide, setSummarySlide] = useState<SummaryWebSlideIndex>(0);
  const [summary2Slide, setSummary2Slide] = useState<SummarySlideIndex>(0);
  const [structureSlide, setStructureSlide] = useState<SummarySlideIndex>(0);
  const [keywordSlide, setKeywordSlide] = useState<SummarySlideIndex>(0);
  const [keywordDetailSlide, setKeywordDetailSlide] =
    useState<SummarySlideIndex>(0);
  const [creativeSlide, setCreativeSlide] = useState<SummarySlideIndex>(0);
  const [creativeDetailSlide, setCreativeDetailSlide] =
    useState<SummarySlideIndex>(0);

  const tab = forcedTab ?? internalTab;

  const setTab = useCallback((next: SetStateAction<TabKey>) => {
    if (forcedTab) return;
    setInternalTab(next);
  }, [forcedTab]);

  const goToPreviousSummarySlide = useCallback(() => {
    setSummarySlide((current) =>
      Math.max(0, current - 1) as SummaryWebSlideIndex,
    );
  }, []);

  const goToNextSummarySlide = useCallback(() => {
    setSummarySlide((current) =>
      Math.min(3, current + 1) as SummaryWebSlideIndex,
    );
  }, []);

  const goToPreviousStructureSlide = useCallback(() => {
    setStructureSlide((current) =>
      Math.max(0, current - 1) as SummarySlideIndex,
    );
  }, []);

  const goToNextStructureSlide = useCallback(() => {
    setStructureSlide((current) =>
      Math.min(2, current + 1) as SummarySlideIndex,
    );
  }, []);

  const goToPreviousKeywordSlide = useCallback(() => {
    setKeywordSlide((current) =>
      Math.max(0, current - 1) as SummarySlideIndex,
    );
  }, []);

  const goToNextKeywordSlide = useCallback(() => {
    setKeywordSlide((current) =>
      Math.min(1, current + 1) as SummarySlideIndex,
    );
  }, []);

  const goToPreviousKeywordDetailSlide = useCallback(() => {
    setKeywordDetailSlide((current) =>
      Math.max(0, current - 1) as SummarySlideIndex,
    );
  }, []);

  const goToNextKeywordDetailSlide = useCallback(() => {
    setKeywordDetailSlide((current) =>
      Math.min(2, current + 1) as SummarySlideIndex,
    );
  }, []);

  const goToPreviousCreativeSlide = useCallback(() => {
    setCreativeSlide((current) =>
      Math.max(0, current - 1) as SummarySlideIndex,
    );
  }, []);

  const goToNextCreativeSlide = useCallback(() => {
    setCreativeSlide((current) =>
      Math.min(1, current + 1) as SummarySlideIndex,
    );
  }, []);

  const goToPreviousCreativeDetailSlide = useCallback(() => {
    setCreativeDetailSlide((current) =>
      Math.max(0, current - 1) as SummarySlideIndex,
    );
  }, []);

  const goToNextCreativeDetailSlide = useCallback(() => {
    setCreativeDetailSlide((current) =>
      Math.min(2, current + 1) as SummarySlideIndex,
    );
  }, []);

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

  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(() =>
    new Set<TabKey>(["summary"]),
  );

  useEffect(() => {
    if (forcedTab) return;
    setVisitedTabs((current) => {
      if (current.has(deferredTab)) return current;
      const next = new Set(current);
      next.add(deferredTab);
      return next;
    });
  }, [deferredTab, forcedTab]);

  const hasVisitedTab = useCallback(
    (candidate: TabKey) => {
      if (forcedTab) return forcedTab === candidate;
      return candidate === deferredTab || visitedTabs.has(candidate);
    },
    [deferredTab, forcedTab, visitedTabs],
  );

  const [storedMonthGoal, setStoredMonthGoal] = useLocalStorageState<GoalState>(
    MONTH_GOAL_KEY,
    DEFAULT_GOAL,
  );

  const monthGoalFromProp = useMemo(() => {
    return normalizeMonthGoalProp(incomingMonthGoal);
  }, [incomingMonthGoal]);

  const brandSearchContractsFromProp = useMemo(() => {
    return normalizeBrandSearchContractsProp(incomingBrandSearchContracts);
  }, [incomingBrandSearchContracts]);

  const monthGoal = monthGoalFromProp ?? storedMonthGoal;

  const setMonthGoal = useCallback(
    (next: any) => {
      if (monthGoalFromProp) return;
      setStoredMonthGoal(next);
    },
    [monthGoalFromProp, setStoredMonthGoal],
  );

  const [manualHypothesisDrafts, setManualHypothesisDrafts] = useState<
    Record<number, ManualHypothesisDraft>
  >({});

  const stableReportPeriod = useStableShallowValue(reportPeriod);
  const stableCreativesMapInput = useStableShallowValue(creativesMap ?? {});
  const stableMonthGoal = useStableShallowValue(monthGoal);
  const stableBrandSearchContracts = useStableShallowValue(
    brandSearchContractsFromProp,
  );

  const normalizedRows = useMemo(() => {
    if (!rows?.length) return EMPTY_ROWS;
    return rows.map(normalizeIncomingRow);
  }, [rows]);

  const brandSearchCostAppliedRows = useMemo(() => {
    if (!normalizedRows.length) return EMPTY_ROWS;
    return applyBrandSearchContractCostsToRows(
      normalizedRows,
      stableBrandSearchContracts,
    );
  }, [normalizedRows, stableBrandSearchContracts]);

  const reportPeriodRows = useMemo(() => {
    if (!brandSearchCostAppliedRows.length) return EMPTY_ROWS;
    return filterRowsByReportPeriod(
      brandSearchCostAppliedRows as any[],
      stableReportPeriod,
    );
  }, [brandSearchCostAppliedRows, stableReportPeriod]);

  const shouldRetainKeywordRowsForActiveTab =
    hasVisitedTab("keyword") || hasVisitedTab("keywordDetail");

  const shouldRetainCreativeRowsForActiveTab =
    hasVisitedTab("creative") || hasVisitedTab("creativeDetail");

  const rowLevelBuckets = useMemo(() => {
    if (!reportPeriodRows.length) {
      return buildRowLevelBuckets(EMPTY_ROWS);
    }

    /**
     * ✅ 대용량 rows 메모리 최적화
     * - representativeRows는 Summary/Structure/Decision 기준값에 필요하므로 항상 유지한다.
     * - keywordRows/creativeRows/mixedRows/unknownRows는 현재 탭에서 필요할 때만 반환한다.
     * - row_level 판별 규칙과 representativeRows 구성 순서는 기존과 동일하게 유지한다.
     */
    return buildRowLevelBuckets(reportPeriodRows as any[], {
      needKeywordRows: shouldRetainKeywordRowsForActiveTab,
      needCreativeRows: shouldRetainCreativeRowsForActiveTab,
      needUnknownRows: false,
    });
  }, [
    reportPeriodRows,
    shouldRetainKeywordRowsForActiveTab,
    shouldRetainCreativeRowsForActiveTab,
  ]);

  const representativeReportRows = useMemo(() => {
    return rowLevelBuckets.representativeRows;
  }, [rowLevelBuckets]);

  const keywordReportRows = useMemo(() => {
    return pickKeywordRowsForTabs(rowLevelBuckets);
  }, [rowLevelBuckets]);

  const creativeReportRows = useMemo(() => {
    return pickCreativeRowsForTabs(rowLevelBuckets);
  }, [rowLevelBuckets]);

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

  const summary2SlideCount = reportType === "traffic" ? 1 : 3;
  const summary2LastSlide = (summary2SlideCount - 1) as SummarySlideIndex;

  const effectiveSummarySlide =
    forcedTab === "summary"
      ? clampSlideIndex(
          forcedSlideIndex,
          2,
          Math.min(2, summarySlide) as SummarySlideIndex,
        )
      : summarySlide;
  const effectiveSummary2Slide =
    forcedTab === "summary2"
      ? clampSlideIndex(forcedSlideIndex, summary2SlideCount - 1, summary2Slide)
      : summary2Slide;
  const effectiveStructureSlide =
    forcedTab === "structure"
      ? clampSlideIndex(forcedSlideIndex, 2, structureSlide)
      : structureSlide;
  const effectiveKeywordSlide =
    forcedTab === "keyword"
      ? clampSlideIndex(forcedSlideIndex, 1, keywordSlide)
      : keywordSlide;
  const effectiveKeywordDetailSlide =
    forcedTab === "keywordDetail"
      ? clampSlideIndex(forcedSlideIndex, 2, keywordDetailSlide)
      : keywordDetailSlide;
  const effectiveCreativeSlide =
    forcedTab === "creative"
      ? clampSlideIndex(forcedSlideIndex, 1, creativeSlide)
      : creativeSlide;
  const effectiveCreativeDetailSlide =
    forcedTab === "creativeDetail"
      ? clampSlideIndex(forcedSlideIndex, 2, creativeDetailSlide)
      : creativeDetailSlide;

  const effectiveCaptureSlideIndex =
    deferredTab === "summary"
      ? effectiveSummarySlide
      : deferredTab === "summary2"
        ? effectiveSummary2Slide
        : deferredTab === "structure"
          ? effectiveStructureSlide
          : deferredTab === "keyword"
            ? effectiveKeywordSlide
            : deferredTab === "keywordDetail"
              ? effectiveKeywordDetailSlide
              : deferredTab === "creative"
                ? effectiveCreativeSlide
                : deferredTab === "creativeDetail"
                  ? effectiveCreativeDetailSlide
                  : 0;

  const goToPreviousSummary2Slide = useCallback(() => {
    setSummary2Slide((current) =>
      Math.max(0, current - 1) as SummarySlideIndex,
    );
  }, []);

  const goToNextSummary2Slide = useCallback(() => {
    setSummary2Slide((current) =>
      Math.min(summary2LastSlide, current + 1) as SummarySlideIndex,
    );
  }, [summary2LastSlide]);

  useEffect(() => {
    setSummary2Slide((current) =>
      Math.min(summary2LastSlide, current) as SummarySlideIndex,
    );
  }, [summary2LastSlide]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("debugRows") !== "1") return;
      (window as any).__ROWS__ = brandSearchCostAppliedRows;
      (window as any).__RAW_ROWS__ = normalizedRows;
      (window as any).__CREATIVES_MAP__ = stableCreativesMapInput;
    } catch {}
  }, [brandSearchCostAppliedRows, normalizedRows, stableCreativesMapInput]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("debugBrandSearch") !== "1") return;

      const summary = buildBrandSearchCostDebugSummary(
        brandSearchCostAppliedRows,
        stableBrandSearchContracts,
      );

      (window as any).__BRAND_SEARCH_COST_DEBUG__ = summary;

      console.log("[brand-search-cost] summary", summary);
      if (summary.byMonthDevice.length) {
        console.table(summary.byMonthDevice);
      }
      if (summary.samples.length) {
        console.table(summary.samples);
      }
    } catch {}
  }, [brandSearchCostAppliedRows, stableBrandSearchContracts]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (tab !== "keyword" && tab !== "keywordDetail") return;

    if (selectedChannel === ("display" as ChannelKey)) {
      setSelectedChannel("search" as ChannelKey);
    }
  }, [tab, selectedChannel, readOnlyHeader]);

  /**
   * ✅ 대용량 rows 렌더링 최적화
   * - useReportAggregates는 내부에서 filteredRows, options, totals, bySource,
   *   byCampaign, byWeek, byMonth 등을 계산할 수 있다.
   * - 기존에는 모든 aggregate 호출에서 대부분의 계산이 항상 켜져 있었다.
   * - 여기서는 탭별로 실제 화면/Decision에 필요한 계산만 켠다.
   * - rows/필터/집계 결과 자체는 바꾸지 않고, 비활성 탭의 불필요한 계산만 건너뛴다.
   */
  const isSummaryTab = deferredTab === "summary";
  const isSummary2Tab = deferredTab === "summary2";
  const isStructureTab = deferredTab === "structure";
  const isKeywordTab = deferredTab === "keyword";
  const isKeywordDetailTab = deferredTab === "keywordDetail";
  const isCreativeTab = deferredTab === "creative";
  const isCreativeDetailTab = deferredTab === "creativeDetail";
  const isDecisionTab = deferredTab === "decision";
  const isHypothesisOperationTab = isHypothesisTab(deferredTab);
  const isDecisionLikeTab = isDecisionTab || isHypothesisOperationTab;

  const needsSummaryData = hasVisitedTab("summary");
  const needsStructureData = hasVisitedTab("structure");
  const needsKeywordData = hasVisitedTab("keyword");
  const needsKeywordDetailData = hasVisitedTab("keywordDetail");
  const needsCreativeData = hasVisitedTab("creative");
  const needsCreativeDetailData = hasVisitedTab("creativeDetail");
  const needsDecisionData =
    hasVisitedTab("decision") || HYPOTHESIS_TABS.some(hasVisitedTab);
  const needsKeywordFamilyData = needsKeywordData || needsKeywordDetailData;
  const needsCreativeFamilyData = needsCreativeData || needsCreativeDetailData;

  const needCreativeRows =
    needsStructureData ||
    needsKeywordDetailData ||
    needsCreativeFamilyData;

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
      rows: representativeReportRows as any,
      rowsArePreNormalized: true,
      selectedMonth: deferredSelectedMonth,
      selectedWeek: deferredSelectedWeek,
      selectedDevice: deferredSelectedDevice,
      selectedChannel: deferredSelectedChannel,
      selectedSource: deferredSelectedSource,
      selectedProduct: deferredSelectedProduct,
      monthGoal: stableMonthGoal,
      onInvalidWeek: handleInvalidWeek,

      /**
       * ✅ 메인 representative aggregate는 Header 옵션/filteredRows는 항상 유지하되,
       * 무거운 표/차트 집계는 현재 탭에서 필요한 것만 계산한다.
       */
      needCurrentMonthActual: needsSummaryData || needsKeywordData,
      needTotals: needsSummaryData,
      needBySource: needsSummaryData || needsStructureData,
      needByCampaign: needsStructureData || needsDecisionData,
      needByGroup: false,
      needByWeek: needsSummaryData || needsDecisionData,
      needByMonth: needsSummaryData || needsDecisionData,
      needHydratedFilteredRows: needsStructureData,
      needOptions: true,
      needFilteredRows: true,
      needPeriodText: true,
    };
  }, [
    representativeReportRows,
    deferredSelectedMonth,
    deferredSelectedWeek,
    deferredSelectedDevice,
    deferredSelectedChannel,
    deferredSelectedSource,
    deferredSelectedProduct,
    stableMonthGoal,
    handleInvalidWeek,
    needsSummaryData,
    needsKeywordData,
    needsStructureData,
    needsDecisionData,
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
    filteredRows: summaryFilteredRows,
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

  const keywordRowsForActiveTab = useMemo(() => {
    if (!needsKeywordFamilyData) return EMPTY_ROWS;
    return keywordReportRows;
  }, [needsKeywordFamilyData, keywordReportRows]);

  const keywordAggregatesParams = useMemo(() => {
    return {
      rows: keywordRowsForActiveTab as any,
      rowsArePreNormalized: true,
      selectedMonth: deferredSelectedMonth,
      selectedWeek: deferredSelectedWeek,
      selectedDevice: deferredSelectedDevice,
      selectedChannel: deferredSelectedChannel,
      selectedSource: deferredSelectedSource,
      selectedProduct: deferredSelectedProduct,
      monthGoal: stableMonthGoal,
      onInvalidWeek: noopInvalidWeek,

      /**
       * ✅ keyword 전용 aggregate는 filteredRows만 필요하다.
       * - KeywordSection의 keywordAgg는 아래 groupByKeyword(keywordOnlyRows)에서 계산한다.
       * - KeywordDetail은 rows만 필요하므로 hydrate만 detail 탭에서 켠다.
       */
      needCurrentMonthActual: false,
      needTotals: false,
      needBySource: false,
      needByCampaign: false,
      needByGroup: false,
      needByWeek: false,
      needByMonth: false,
      needHydratedFilteredRows: needsKeywordDetailData,
      needOptions: false,
      needFilteredRows: true,
      needPeriodText: false,
    };
  }, [
    keywordRowsForActiveTab,
    deferredSelectedMonth,
    deferredSelectedWeek,
    deferredSelectedDevice,
    deferredSelectedChannel,
    deferredSelectedSource,
    deferredSelectedProduct,
    stableMonthGoal,
    noopInvalidWeek,
    needsKeywordDetailData,
  ]);

  const stableKeywordAggregatesParams =
    useStableShallowValue(keywordAggregatesParams);

  const { filteredRows: keywordOnlyRows } = useReportAggregates(
    stableKeywordAggregatesParams,
  );

  const creativeRowsForActiveTab = useMemo(() => {
    if (!needsCreativeFamilyData) return EMPTY_ROWS;
    return creativeReportRows;
  }, [needsCreativeFamilyData, creativeReportRows]);

  const creativeAggregatesParams = useMemo(() => {
    return {
      rows: creativeRowsForActiveTab as any,
      rowsArePreNormalized: true,
      selectedMonth: deferredSelectedMonth,
      selectedWeek: deferredSelectedWeek,
      selectedDevice: deferredSelectedDevice,
      selectedChannel: deferredSelectedChannel,
      selectedSource: deferredSelectedSource,
      selectedProduct: deferredSelectedProduct,
      monthGoal: stableMonthGoal,
      onInvalidWeek: noopInvalidWeek,

      /**
       * ✅ creative 전용 aggregate도 filteredRows만 필요하다.
       * - CreativeSection / CreativeDetailSection은 rows를 받아 내부에서 표시한다.
       * - 소재 이미지 보강을 위해 creative 탭에서만 hydrate를 켠다.
       */
      needCurrentMonthActual: false,
      needTotals: false,
      needBySource: false,
      needByCampaign: false,
      needByGroup: false,
      needByWeek: false,
      needByMonth: false,
      needHydratedFilteredRows: needsCreativeFamilyData,
      needOptions: false,
      needFilteredRows: true,
      needPeriodText: false,
    };
  }, [
    creativeRowsForActiveTab,
    deferredSelectedMonth,
    deferredSelectedWeek,
    deferredSelectedDevice,
    deferredSelectedChannel,
    deferredSelectedSource,
    deferredSelectedProduct,
    stableMonthGoal,
    noopInvalidWeek,
    needsCreativeFamilyData,
  ]);

  const stableCreativeAggregatesParams =
    useStableShallowValue(creativeAggregatesParams);

  const { filteredRows: creativeOnlyRows } = useReportAggregates(
    stableCreativeAggregatesParams,
  );

  const summaryGoalAggregatesParams = useMemo(() => {
    return {
      rows: representativeReportRows as any,
      rowsArePreNormalized: true,
      selectedMonth: "all" as MonthKey,
      selectedWeek: "all" as WeekKey,
      selectedDevice: "all" as DeviceKey,
      selectedChannel: "all" as ChannelKey,
      selectedSource: "all",
      selectedProduct: "all",
      monthGoal: stableMonthGoal,
      onInvalidWeek: noopInvalidWeek,

      /**
       * ✅ 월 목표/Decision 기준값 산출용 aggregate
       * - 전체 기간/필터 무시 기준의 currentMonthActual/currentMonthGoalComputed만 필요하다.
       * - bySource/byCampaign/byWeek/byMonth/totals/hydrate는 여기서 계산하지 않는다.
       */
      needCurrentMonthActual: true,
      needTotals: false,
      needBySource: false,
      needByCampaign: false,
      needByGroup: false,
      needByWeek: false,
      needByMonth: false,
      needHydratedFilteredRows: false,
      needOptions: false,
      needFilteredRows: false,
      needPeriodText: false,
    };
  }, [representativeReportRows, stableMonthGoal, noopInvalidWeek]);

  const stableSummaryGoalAggregatesParams = useStableShallowValue(
    summaryGoalAggregatesParams,
  );

  const {
    currentMonthKey: summaryGoalCurrentMonthKey,
    currentMonthActual: summaryGoalCurrentMonthActual,
    currentMonthGoalComputed: summaryGoalCurrentMonthGoalComputed,
  } = useReportAggregates(stableSummaryGoalAggregatesParams);

  const summaryGoalBaseRows = useMemo(() => {
    if (!representativeReportRows.length) return EMPTY_ROWS;
    if (!summaryGoalCurrentMonthKey) return EMPTY_ROWS;
    return getRowsForMonthKey(
      representativeReportRows as any[],
      summaryGoalCurrentMonthKey,
    );
  }, [representativeReportRows, summaryGoalCurrentMonthKey]);

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
    if (!needsSummaryData) return EMPTY_ROWS;
    if (!(summaryFilteredRows as any[])?.length) return EMPTY_ROWS;
    return buildDailySummaryRows(summaryFilteredRows as any[]);
  }, [needsSummaryData, summaryFilteredRows]);

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
    if (!(summaryFilteredRows as any[])?.length) return period;
    const mm = minMaxYmd(summaryFilteredRows as any[]);
    if (!mm.min || !mm.max) return period;
    return `${formatYmd(mm.min)} ~ ${formatYmd(mm.max)}`;
  }, [summaryFilteredRows, period]);

  const stableFullPeriod = useStableShallowValue(fullPeriod);
  const stablePeriodFixed = useStableShallowValue(periodFixed);

  const insightsCurrentMonthActual = useMemo(() => {
    if (!needsSummaryData) {
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
  }, [needsSummaryData, currentMonthActual]);

  const stableInsightsCurrentMonthActual =
    useStableShallowValue(insightsCurrentMonthActual);

  const insightsParams = useMemo(() => {
    return {
      byMonth,
      rowsLength: representativeReportRows.length,
      currentMonthKey,
      monthGoal: stableMonthGoal,
      currentMonthActual: stableInsightsCurrentMonthActual,
      currentMonthGoalComputed,
      enableMonthlyInsight: needsSummaryData,
      enableMonthGoalInsight: needsSummaryData,
      reportType,
    };
  }, [
    byMonth,
    representativeReportRows.length,
    currentMonthKey,
    stableMonthGoal,
    stableInsightsCurrentMonthActual,
    currentMonthGoalComputed,
    needsSummaryData,
    reportType,
  ]);

  const stableInsightsParams = useStableShallowValue(insightsParams);
  const { monthGoalInsight } = useInsights(stableInsightsParams);

  const keywordAgg = useMemo(() => {
    if (!needsKeywordData) return EMPTY_ROWS;
    if (!(keywordOnlyRows as any[])?.length) return EMPTY_ROWS;
    return groupByKeyword(keywordOnlyRows as any[]);
  }, [needsKeywordData, keywordOnlyRows]);

  const keywordInsight = useMemo(() => {
    if (!needsKeywordData) return "";
    return buildKeywordInsight({
      keywordAgg: keywordAgg as any[],
      keywordBaseRows: keywordOnlyRows as any[],
      currentMonthActual: currentMonthActual as any,
      currentMonthGoalComputed: currentMonthGoalComputed as any,
      reportType,
    });
  }, [
    needsKeywordData,
    keywordAgg,
    keywordOnlyRows,
    currentMonthActual,
    currentMonthGoalComputed,
    reportType,
  ]);

  const creativesMapNormalized = useMemo(() => {
    if (!needCreativeRows) return {};
    return normalizeCreativesMap(stableCreativesMapInput);
  }, [needCreativeRows, stableCreativesMapInput]);

  const rowsForCreativeHydration = useMemo(() => {
    if (deferredTab === "creative" || deferredTab === "creativeDetail") {
      return (creativeOnlyRows as any[]) ?? EMPTY_ROWS;
    }

    if (deferredTab === "keywordDetail") {
      return (keywordOnlyRows as any[]) ?? EMPTY_ROWS;
    }

    return (summaryFilteredRows as any[]) ?? EMPTY_ROWS;
  }, [deferredTab, summaryFilteredRows, keywordOnlyRows, creativeOnlyRows]);

  const summaryFilteredRowsWithCreatives = useMemo(() => {
    if (!needCreativeRows) return rowsForCreativeHydration as any[];
    if (!(rowsForCreativeHydration as any[])?.length) return EMPTY_ROWS;

    const map = creativesMapNormalized;
    const originalRowMap = originalRowById;

    return (rowsForCreativeHydration as any[]).map((r) => {
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
  }, [needCreativeRows, rowsForCreativeHydration, creativesMapNormalized, originalRowById]);

  const creativeBaseRows = useMemo(() => {
    if (!needsCreativeFamilyData) return EMPTY_ROWS;
    const list = (summaryFilteredRowsWithCreatives as any[]) ?? EMPTY_ROWS;
    if (!list.length) return EMPTY_ROWS;
    return list.filter((r) => !!r?.creative_url);
  }, [needsCreativeFamilyData, summaryFilteredRowsWithCreatives]);

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
        rows: representativeReportRows as any[],
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
      representativeReportRows,
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

  const manualHypotheses = useMemo<PriorityItem[]>(() => {
    const autoCount = topFiveHypotheses.length;
    const missingCount = Math.max(0, 5 - autoCount);

    return Array.from({ length: missingCount }).map((_, i) => {
      const rank = autoCount + i + 1;
      const draft = manualHypothesisDrafts[rank];

      const inferredScores = inferManualHypothesisScores({
        title: draft?.title,
        summary: draft?.summary,
        targetMetric: draft?.targetMetric,
        reportType,
      });
      const manualScoreReason = inferManualHypothesisScoreReason({
        title: draft?.title,
        summary: draft?.summary,
        targetMetric: draft?.targetMetric,
        reportType,
      });

      const impact = inferredScores.impact;
      const confidence = inferredScores.confidence;
      const ease = inferredScores.ease;

      return {
        hypothesisId: `manual-hypothesis-${rank}`,
        title: draft?.title || `운영자 수동 가설 ${rank}`,
        summary:
          draft?.summary ||
          "자동 추천으로 채워지지 않은 슬롯입니다. 운영자가 직접 가설 제목, 목표 KPI, 실행 계획을 정리해서 사용할 수 있습니다.",
        targetMetric: draft?.targetMetric || "목표 KPI",
        impact,
        confidence,
        ease,
        score: impact * confidence * ease,
        rank,
        manualScoreReason,
      } as PriorityItem;
    });
  }, [topFiveHypotheses, manualHypothesisDrafts, reportType]);

  const operationHypotheses = useMemo(() => {
    return [...topFiveHypotheses, ...manualHypotheses].slice(0, 5);
  }, [topFiveHypotheses, manualHypotheses]);

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
      goalProgressCurrentMonthKey: currentMonthKey,
      goalProgressCurrentMonthActual: stableCurrentMonthActual,
      goalProgressCurrentMonthGoalComputed: stableCurrentMonthGoalComputed,
      goalProgressByDay: stableByDay,
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
    currentMonthKey,
    stableCurrentMonthActual,
    stableCurrentMonthGoalComputed,
    stableByDay,
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
      rows: representativeReportRows as any[],
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
    representativeReportRows,
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
      workspaceLogoUrl: workspaceLogoUrl || null,
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
    workspaceLogoUrl,
    stableReportPeriod,
    onChangeReportPeriod,
    readOnlyHeader,
    hidePeriodEditor,
    hideTabPeriodText,
  ]);

    return (
    <main
      data-report-theme={reportTheme}
      data-ppt-export-mode={exportMode ? "true" : undefined}
      style={
        isStudioTheme
          ? {
              background:
                "radial-gradient(circle at top right, rgba(33, 223, 243, 0.18), transparent 30%), radial-gradient(circle at top left, rgba(124, 92, 255, 0.22), transparent 34%), linear-gradient(180deg, rgba(42, 33, 87, 1) 0%, rgba(53, 40, 103, 0.98) 52%, rgba(46, 35, 94, 1) 100%)",
            }
          : undefined
      }
      className={[
        "min-h-screen w-full min-w-0 max-w-full overflow-x-clip bg-[radial-gradient(circle_at_top_right,rgba(183,215,227,0.28),transparent_28%),linear-gradient(180deg,var(--nature-page)_0%,rgba(250,247,241,0.96)_100%)] text-slate-900",
        exportMode
          ? "[&_*]:!animate-none [&_*]:!transition-none"
          : "",
      ].join(" ")}
    >
      {!exportMode ? <HeaderSurface {...headerBarProps} /> : null}

      <div className="relative -mt-1 px-4 pb-12 pt-0 sm:px-6 lg:px-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(183,215,227,0.13)_0%,rgba(243,228,210,0.08)_48%,transparent_100%)]"
          style={
            isStudioTheme
              ? {
                  background:
                    "linear-gradient(180deg, rgba(33, 223, 243, 0.10) 0%, rgba(124, 92, 255, 0.08) 48%, transparent 100%)",
                }
              : undefined
          }
        />

        <div
          className="relative mx-auto w-full min-w-0 max-w-[1680px] overflow-visible rounded-b-[36px] rounded-t-[26px] bg-[linear-gradient(145deg,rgba(255,253,249,0.94)_0%,rgba(249,246,240,0.92)_58%,rgba(239,247,249,0.90)_100%)] p-3.5 shadow-[0_28px_70px_rgba(90,117,136,0.14),0_4px_14px_rgba(90,117,136,0.07)] sm:p-4"
          style={
            isStudioTheme
              ? {
                  background:
                    "linear-gradient(145deg, rgba(53, 40, 103, 0.96) 0%, rgba(42, 33, 87, 0.94) 58%, rgba(46, 35, 94, 0.96) 100%)",
                }
              : undefined
          }
        >
          <div
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.96)_18%,rgba(255,255,255,0.96)_82%,transparent_100%)]"
            style={
              isStudioTheme
                ? {
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(33, 223, 243, 0.72) 24%, rgba(124, 92, 255, 0.72) 76%, transparent 100%)",
                  }
                : undefined
            }
          />

          {isLoading ? (
            <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] shadow-sm">
                <div className="flex items-center gap-3 px-5 py-4">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--nature-blue)]" />
                <div className="text-sm font-medium text-slate-600">
                  Loading rows...
                </div>
              </div>
            </div>
          ) : null}

          <div
            className="relative min-w-0 max-w-full"
            data-ppt-capture-root={exportMode ? "true" : undefined}
            data-ppt-ready={exportMode ? (isLoading ? "false" : "true") : undefined}
            data-ppt-tab={exportMode ? deferredTab : undefined}
            data-ppt-slide-index={
              exportMode ? String(effectiveCaptureSlideIndex) : undefined
            }
          >
            <div className="min-w-0 w-full">
              <div className="mx-auto w-full min-w-0 max-w-full">
                <div className="space-y-8 pt-0">
                                    {hasVisitedTab("summary") && (
                    <div
                      className={deferredTab === "summary" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "summary"}
                    >
                      {forcedTab === "summary" ? (
                      <>
                        {effectiveSummarySlide === 0 ? (
                          <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(145deg,rgba(255,253,249,0.97)_0%,rgba(255,250,242,0.94)_56%,rgba(241,248,250,0.94)_100%)] shadow-[0_18px_46px_rgba(90,117,136,0.10)] [&>section]:rounded-[32px] [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
                            <MonthGoalSection {...(monthGoalSectionProps as any)} />
                          </div>
                        ) : null}

                        <div className={effectiveSummarySlide === 0 ? "mt-6 rounded-2xl" : "rounded-2xl"}>
                          <SummarySection
                            {...(summarySectionProps as any)}
                            activeSlide={(effectiveSummarySlide + 1) as 1 | 2 | 3}
                          />
                        </div>
                      </>
                    ) : (
                      <section aria-label="요약 슬라이드" data-summary-slide={summarySlide + 1} className="space-y-4">
                        <div className="flex flex-col items-center justify-between gap-3 rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)]/88 px-4 py-3 shadow-[0_8px_22px_rgba(127,166,196,0.10)] sm:flex-row">
                          <button
                            type="button"
                            onClick={goToPreviousSummarySlide}
                            disabled={summarySlide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {summarySlide + 1} / 4
                            </div>

                            <div className="flex items-center gap-2" aria-label="요약 슬라이드 선택">
                              {([0, 1, 2, 3] as const).map((slideIndex) => (
                                <button
                                  key={slideIndex}
                                  type="button"
                                  onClick={() => setSummarySlide(slideIndex)}
                                  aria-label={`슬라이드 ${slideIndex + 1}로 이동`}
                                  aria-current={
                                    summarySlide === slideIndex ? "page" : undefined
                                  }
                                  className={[
                                    "h-2.5 rounded-full transition-all",
                                    summarySlide === slideIndex
                                      ? "w-8 bg-[var(--nature-blue)]"
                                      : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                  ].join(" ")}
                                />
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextSummarySlide}
                            disabled={summarySlide === 3}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>
                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <div
                              className={
                                summarySlide === 1
                                  ? "block"
                                  : "hidden"
                              }
                              aria-hidden={summarySlide !== 1}
                            >
                              <div className="relative overflow-hidden rounded-[28px] bg-transparent [&>section]:mb-0 [&>section]:mt-0 [&>section]:rounded-[28px] [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
                                <MonthGoalSection
                                  {...(monthGoalSectionProps as any)}
                                />
                              </div>
                            </div>

                            <div className={summarySlide === 1 ? "mt-6" : "mt-0"}>
                              <SummarySection
                                {...(summarySectionProps as any)}
                                activeSlide={summarySlide}
                              />
                            </div>
                          </div>
                        </div>

                      </section>
                    )}
                    </div>
                  )}

                                    {hasVisitedTab("decision") && (
                    <div
                      className={deferredTab === "decision" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "decision"}
                    >
                      {<div className="rounded-2xl">
                      <DecisionPanel {...(decisionPanelProps as any)} />
                    </div>}
                    </div>
                  )}

                                    {HYPOTHESIS_TABS.map((hypothesisTab) => {
                    if (!hasVisitedTab(hypothesisTab)) return null;

                    const isActiveHypothesis = deferredTab === hypothesisTab;
                    const hypothesisIndex = hypothesisNumberOf(hypothesisTab);
                    const hypothesisItem = operationHypotheses[hypothesisIndex - 1];

                    return (
                      <div
                        key={hypothesisTab}
                        className={isActiveHypothesis ? "rounded-2xl" : "hidden"}
                        aria-hidden={!isActiveHypothesis}
                      >
                        <HypothesisOperationPanel
                          index={hypothesisIndex}
                          item={hypothesisItem}
                          isManual={String(
                            (hypothesisItem as any)?.hypothesisId ?? "",
                          ).startsWith("manual-hypothesis-")}
                          onChangeManualHypothesis={(next) => {
                            setManualHypothesisDrafts((prev) => ({
                              ...prev,
                              [hypothesisIndex]: next,
                            }));
                          }}
                        />
                      </div>
                    );
                  })}

                                    {hasVisitedTab("summary2") && (
                    <div
                      className={deferredTab === "summary2" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "summary2"}
                    >
                      {forcedTab === "summary2" ? (
                      <div className="rounded-2xl">
                        <Summary2Section
                          {...({ reportType } as any)}
                          rows={summaryFilteredRows as any[]}
                          activeSlide={effectiveSummary2Slide}
                        />
                      </div>
                    ) : (
                      <section aria-label="요약2 슬라이드" className="space-y-4">
                        <div className="flex flex-col items-center justify-between gap-3 rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)]/88 px-4 py-3 shadow-[0_8px_22px_rgba(127,166,196,0.10)] sm:flex-row">
                          <button
                            type="button"
                            onClick={goToPreviousSummary2Slide}
                            disabled={summary2Slide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {summary2Slide + 1} / {summary2SlideCount}
                            </div>

                            <div className="flex items-center gap-2" aria-label="요약2 슬라이드 선택">
                              {Array.from({ length: summary2SlideCount }, (_, index) => index as SummarySlideIndex).map((slideIndex) => (
                                <button
                                  key={slideIndex}
                                  type="button"
                                  onClick={() => setSummary2Slide(slideIndex)}
                                  aria-label={`슬라이드 ${slideIndex + 1}로 이동`}
                                  aria-current={
                                    summary2Slide === slideIndex ? "page" : undefined
                                  }
                                  className={[
                                    "h-2.5 rounded-full transition-all",
                                    summary2Slide === slideIndex
                                      ? "w-8 bg-[var(--nature-blue)]"
                                      : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                  ].join(" ")}
                                />
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextSummary2Slide}
                            disabled={summary2Slide === summary2LastSlide}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>

                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <Summary2Section
                              {...({ reportType } as any)}
                              rows={summaryFilteredRows as any[]}
                              activeSlide={summary2Slide}
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>
                  )}

                                    {hasVisitedTab("structure") && (
                    <div
                      className={deferredTab === "structure" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "structure"}
                    >
                      {forcedTab === "structure" ? (
                      <div className="rounded-2xl">
                        <StructureSection
                          {...({ reportType } as any)}
                          bySource={bySource}
                          byCampaign={byCampaign}
                          rows={summaryFilteredRowsWithCreatives}
                          monthGoal={stableMonthGoal}
                          activeSlide={effectiveStructureSlide}
                        />
                      </div>
                    ) : (
                      <section aria-label="구조 슬라이드" className="space-y-4">
                        <div className="flex flex-col items-center justify-between gap-3 rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)]/88 px-4 py-3 shadow-[0_8px_22px_rgba(127,166,196,0.10)] sm:flex-row">
                          <button
                            type="button"
                            onClick={goToPreviousStructureSlide}
                            disabled={structureSlide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {structureSlide + 1} / 3
                            </div>

                            <div
                              className="flex items-center gap-2"
                              aria-label="구조 슬라이드 선택"
                            >
                              {([0, 1, 2] as SummarySlideIndex[]).map(
                                (slideIndex) => (
                                  <button
                                    key={slideIndex}
                                    type="button"
                                    onClick={() => setStructureSlide(slideIndex)}
                                    aria-label={`슬라이드 ${slideIndex + 1}로 이동`}
                                    aria-current={
                                      structureSlide === slideIndex
                                        ? "page"
                                        : undefined
                                    }
                                    className={[
                                      "h-2.5 rounded-full transition-all",
                                      structureSlide === slideIndex
                                        ? "w-8 bg-[var(--nature-blue)]"
                                        : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                    ].join(" ")}
                                  />
                                ),
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextStructureSlide}
                            disabled={structureSlide === 2}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>

                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <StructureSection
                              {...({ reportType } as any)}
                              bySource={bySource}
                              byCampaign={byCampaign}
                              rows={summaryFilteredRowsWithCreatives}
                              monthGoal={stableMonthGoal}
                              activeSlide={structureSlide}
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>
                  )}

                                    {hasVisitedTab("keyword") && (
                    <div
                      className={deferredTab === "keyword" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "keyword"}
                    >
                      {forcedTab === "keyword" ? (
                      <div className="rounded-2xl">
                        <KeywordSection
                          {...({ reportType } as any)}
                          keywordAgg={keywordAgg}
                          keywordInsight={keywordInsight}
                          activeSlide={effectiveKeywordSlide}
                        />
                      </div>
                    ) : (
                      <section aria-label="키워드 슬라이드" className="space-y-4">
                        <div className="flex flex-col items-center justify-between gap-3 rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)]/88 px-4 py-3 shadow-[0_8px_22px_rgba(127,166,196,0.10)] sm:flex-row">
                          <button
                            type="button"
                            onClick={goToPreviousKeywordSlide}
                            disabled={keywordSlide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {keywordSlide + 1} / 2
                            </div>

                            <div
                              className="flex items-center gap-2"
                              aria-label="키워드 슬라이드 선택"
                            >
                              {([0, 1] as SummarySlideIndex[]).map(
                                (slideIndex) => (
                                  <button
                                    key={slideIndex}
                                    type="button"
                                    onClick={() => setKeywordSlide(slideIndex)}
                                    aria-label={`슬라이드 ${slideIndex + 1}로 이동`}
                                    aria-current={
                                      keywordSlide === slideIndex
                                        ? "page"
                                        : undefined
                                    }
                                    className={[
                                      "h-2.5 rounded-full transition-all",
                                      keywordSlide === slideIndex
                                        ? "w-8 bg-[var(--nature-blue)]"
                                        : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                    ].join(" ")}
                                  />
                                ),
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextKeywordSlide}
                            disabled={keywordSlide === 1}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>

                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <KeywordSection
                              {...({ reportType } as any)}
                              keywordAgg={keywordAgg}
                              keywordInsight={keywordInsight}
                              activeSlide={keywordSlide}
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>
                  )}

                                    {hasVisitedTab("keywordDetail") && (
                    <div
                      className={deferredTab === "keywordDetail" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "keywordDetail"}
                    >
                      {forcedTab === "keywordDetail" ? (
                      <div className="rounded-2xl">
                        <KeywordDetailSection
                          {...({ reportType } as any)}
                          rows={keywordOnlyRows as any[]}
                          activeSlide={effectiveKeywordDetailSlide}
                        />
                      </div>
                    ) : (
                      <section aria-label="키워드 상세 슬라이드" className="space-y-4">
                        <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[var(--nature-border-blue)] bg-white/88 px-4 py-3 shadow-[0_10px_26px_rgba(90,117,136,0.08)] backdrop-blur sm:px-5">
                          <button
                            type="button"
                            onClick={goToPreviousKeywordDetailSlide}
                            disabled={keywordDetailSlide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {keywordDetailSlide + 1} / 3
                            </div>

                            <div
                              className="flex items-center gap-2"
                              aria-label="키워드 상세 슬라이드 선택"
                            >
                              {([0, 1, 2] as SummarySlideIndex[]).map(
                                (slideIndex) => (
                                  <button
                                    key={slideIndex}
                                    type="button"
                                    onClick={() =>
                                      setKeywordDetailSlide(slideIndex)
                                    }
                                    aria-label={`슬라이드 ${
                                      slideIndex + 1
                                    }로 이동`}
                                    aria-current={
                                      keywordDetailSlide === slideIndex
                                        ? "page"
                                        : undefined
                                    }
                                    className={[
                                      "h-2.5 rounded-full transition-all",
                                      keywordDetailSlide === slideIndex
                                        ? "w-8 bg-[var(--nature-blue)]"
                                        : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                    ].join(" ")}
                                  />
                                ),
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextKeywordDetailSlide}
                            disabled={keywordDetailSlide === 2}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>

                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <KeywordDetailSection
                              {...({ reportType } as any)}
                              rows={keywordOnlyRows as any[]}
                              activeSlide={keywordDetailSlide}
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>
                  )}

                                    {hasVisitedTab("creative") && (
                    <div
                      className={deferredTab === "creative" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "creative"}
                    >
                      {forcedTab === "creative" ? (
                      <div className="rounded-2xl">
                        <CreativeSection
                          {...({ reportType } as any)}
                          rows={summaryFilteredRowsWithCreatives as any[]}
                          activeSlide={effectiveCreativeSlide as 0 | 1}
                        />
                      </div>
                    ) : (
                      <section aria-label="소재 슬라이드" className="space-y-4">
                        <div className="flex flex-col items-center justify-between gap-3 rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)]/88 px-4 py-3 shadow-[0_8px_22px_rgba(127,166,196,0.10)] sm:flex-row">
                          <button
                            type="button"
                            onClick={goToPreviousCreativeSlide}
                            disabled={creativeSlide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {creativeSlide + 1} / 2
                            </div>

                            <div
                              className="flex items-center gap-2"
                              aria-label="소재 슬라이드 선택"
                            >
                              {([0, 1] as SummarySlideIndex[]).map(
                                (slideIndex) => (
                                  <button
                                    key={slideIndex}
                                    type="button"
                                    onClick={() => setCreativeSlide(slideIndex)}
                                    aria-label={`슬라이드 ${slideIndex + 1}로 이동`}
                                    aria-current={
                                      creativeSlide === slideIndex
                                        ? "page"
                                        : undefined
                                    }
                                    className={[
                                      "h-2.5 rounded-full transition-all",
                                      creativeSlide === slideIndex
                                        ? "w-8 bg-[var(--nature-blue)]"
                                        : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                    ].join(" ")}
                                  />
                                ),
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextCreativeSlide}
                            disabled={creativeSlide === 1}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>

                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <CreativeSection
                              {...({ reportType } as any)}
                              rows={summaryFilteredRowsWithCreatives as any[]}
                              activeSlide={creativeSlide as 0 | 1}
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>
                  )}

                                    {hasVisitedTab("creativeDetail") && (
                    <div
                      className={deferredTab === "creativeDetail" ? "block" : "hidden"}
                      aria-hidden={deferredTab !== "creativeDetail"}
                    >
                      {forcedTab === "creativeDetail" ? (
                      <div className="rounded-2xl">
                        <CreativeDetailSection
                          {...({ reportType } as any)}
                          rows={summaryFilteredRowsWithCreatives as any[]}
                          activeSlide={effectiveCreativeDetailSlide}
                        />
                      </div>
                    ) : (
                      <section
                        aria-label="소재 상세 슬라이드"
                        className="space-y-4"
                      >
                        <div className="flex flex-col items-center justify-between gap-3 rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)]/88 px-4 py-3 shadow-[0_8px_22px_rgba(127,166,196,0.10)] sm:flex-row">
                          <button
                            type="button"
                            onClick={goToPreviousCreativeDetailSlide}
                            disabled={creativeDetailSlide === 0}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            ‹ 이전
                          </button>

                          <div className="flex flex-col items-center gap-2">
                            <div className="text-xs font-semibold tracking-[0.08em] text-slate-600">
                              슬라이드 {creativeDetailSlide + 1} / 3
                            </div>

                            <div
                              className="flex items-center gap-2"
                              aria-label="소재 상세 슬라이드 선택"
                            >
                              {([0, 1, 2] as SummarySlideIndex[]).map(
                                (slideIndex) => (
                                  <button
                                    key={slideIndex}
                                    type="button"
                                    onClick={() =>
                                      setCreativeDetailSlide(slideIndex)
                                    }
                                    aria-label={`슬라이드 ${
                                      slideIndex + 1
                                    }로 이동`}
                                    aria-current={
                                      creativeDetailSlide === slideIndex
                                        ? "page"
                                        : undefined
                                    }
                                    className={[
                                      "h-2.5 rounded-full transition-all",
                                      creativeDetailSlide === slideIndex
                                        ? "w-8 bg-[var(--nature-blue)]"
                                        : "w-2.5 bg-slate-300 hover:bg-[var(--nature-blue-light)]",
                                    ].join(" ")}
                                  />
                                ),
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={goToNextCreativeDetailSlide}
                            disabled={creativeDetailSlide === 2}
                            className="inline-flex h-9 min-w-[104px] items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-[var(--nature-blue-light)]/25 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            다음 ›
                          </button>
                        </div>

                        <div className="relative mx-auto w-full overflow-hidden rounded-[32px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(255,250,242,0.96)_56%,rgba(241,248,250,0.96)_100%)] shadow-[0_22px_54px_rgba(90,117,136,0.14)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.98)_18%,rgba(255,255,255,0.98)_82%,transparent_100%)]" />

                          <div className="relative min-h-[680px] p-4 sm:p-5 lg:min-h-[760px] lg:p-6 xl:p-7">
                            <CreativeDetailSection
                              {...({ reportType } as any)}
                              rows={summaryFilteredRowsWithCreatives as any[]}
                              activeSlide={creativeDetailSlide}
                            />
                          </div>
                        </div>
                      </section>
                    )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
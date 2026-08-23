"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import type { ReportType } from "../../../src/lib/report/types";
import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
  formatPercentFromRoas,
  formatCount,
  formatCurrencyAxisCompact,
  formatPercentAxisFromRoas,
  diffRatio,
} from "../../../src/lib/report/format";

import SummaryChart from "./summary/SummaryChart";
import SummaryChartView from "./summary/SummaryChartView";
import SummaryKPI from "./summary/SummaryKPI";
import SummaryTable from "./summary/SummaryTable";
import TrendCell from "../ui/TrendCell";
import DataBarCell from "../ui/DataBarCell";
import SourceBrand from "../ui/SourceBrand";

type Props = {
  reportType?: ReportType;

  totals: any;
  byMonth: any;

  byWeekOnly: any;
  byWeekChart: any;

  bySource: any;
  byDay?: any;

  currentMonthKey?: string;
  currentMonthActual?: any;
  currentMonthGoalComputed?: any;
  monthGoal?: any;
  setMonthGoal?: (next: any) => void;
  monthGoalInsight?: string;

  /**
   * 웹 요약 탭 슬라이드 전용 표시 인덱스.
   * undefined이면 기존 전체 요약 구조를 그대로 렌더링한다.
   */
  activeSlide?: 0 | 1 | 2 | 3;
};

const TH_CLASS =
  "px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";

const TD_CLASS =
  "px-4 py-3.5 text-right text-sm text-slate-700 whitespace-nowrap align-middle";

const FIRST_TH_CLASS =
  "px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";

const FIRST_TD_CLASS =
  "px-4 py-3.5 text-left text-sm font-medium text-slate-900 whitespace-nowrap align-middle";

const TABLE_SURFACE_CLASS =
  "overflow-x-auto rounded-[20px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] shadow-[0_4px_14px_rgba(127,166,196,0.07)]";

const SOURCE_TABLE_SURFACE_CLASS =
  "max-h-[720px] overflow-auto rounded-[20px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] shadow-[0_4px_14px_rgba(127,166,196,0.07)]";

const DAILY_TABLE_SURFACE_CLASS =
  "overflow-x-auto rounded-[20px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] shadow-[0_4px_14px_rgba(127,166,196,0.07)]";

const TABLE_HEAD_CLASS =
  "sticky top-0 z-10 border-b border-[var(--nature-border)] bg-[var(--nature-cream)]/85";

const EMPTY_STATE_CLASS =
  "px-4 py-10 text-center text-sm font-medium text-slate-500";

const CHART_SURFACE_CLASS = "mt-0";

const TRAFFIC_TABLE_CLASS = "w-full table-fixed text-sm min-w-[860px]";
const DB_ACQUISITION_TABLE_CLASS = "w-full table-fixed text-sm min-w-[1080px]";
const COMMERCE_TABLE_CLASS = "w-full table-fixed text-sm min-w-[1320px]";

const EMPTY_LIST: readonly any[] = Object.freeze([]);
const EMPTY_MUTABLE_LIST: any[] = [];

const SOURCE_ROW_HEIGHT = 57;
const DAILY_ROW_HEIGHT = 57;
const DAILY_VISIBLE_ROW_COUNT = 10;
const DAILY_TABLE_HEADER_HEIGHT = 48;
const DAILY_TABLE_SCROLL_HEIGHT =
  DAILY_TABLE_HEADER_HEIGHT + DAILY_ROW_HEIGHT * DAILY_VISIBLE_ROW_COUNT;
const TABLE_OVERSCAN = 8;
const TABLE_FALLBACK_VIEWPORT_HEIGHT = 720;
const DAILY_ACTIVATION_ROOT_MARGIN = "1200px 0px";

type MetricMode = {
  isTraffic: boolean;
  isDbAcquisition: boolean;
  showConversions: boolean;
  showCvr: boolean;
  showCpa: boolean;
  showRevenue: boolean;
  showRoas: boolean;
  tableClassName: string;
  colSpan: number;
};

type SummaryCopy = {
  kpiTitle: string;
  kpiDescription: string;
  monthTitle: string;
  monthDescription: string;
  weeklyTitle: string;
  weeklyDescription: string;
  chartTitle: string;
  chartDescription: string;
  sourceTitle: string;
  sourceDescription: string;
  dailyTitle: string;
  dailyDescription: string;
};

function getMetricMode(reportType?: ReportType): MetricMode {
  const resolvedType: ReportType = reportType ?? "commerce";
  const isTraffic = resolvedType === "traffic";
  const isDbAcquisition = resolvedType === "db_acquisition";

  return {
    isTraffic,
    isDbAcquisition,
    showConversions: !isTraffic,
    showCvr: !isTraffic,
    showCpa: !isTraffic,
    showRevenue: resolvedType === "commerce",
    showRoas: resolvedType === "commerce",
    tableClassName: isTraffic
      ? TRAFFIC_TABLE_CLASS
      : isDbAcquisition
        ? DB_ACQUISITION_TABLE_CLASS
        : COMMERCE_TABLE_CLASS,
    colSpan: isTraffic ? 6 : isDbAcquisition ? 9 : 11,
  };
}

function getSummaryCopy(reportType?: ReportType): SummaryCopy {
  const resolvedType: ReportType = reportType ?? "commerce";

  if (resolvedType === "traffic") {
    return {
      kpiTitle: "기간 성과 요약",
      kpiDescription: "현재 필터 조건 기준의 유입 중심 핵심 KPI를 빠르게 확인합니다.",
      monthTitle: "월별 성과 (최근 3개월)",
      monthDescription: "최근 월별 유입 성과를 비교합니다.",
      weeklyTitle: "주차별 성과",
      weeklyDescription: "최근 주차별 유입 흐름과 전주 대비 변화량을 빠르게 확인합니다.",
      chartTitle: "주차별 추이",
      chartDescription:
        "유입 중심 핵심 성과 흐름을 시각적으로 비교해 변화 구간을 빠르게 파악합니다.",
      sourceTitle: "소스별 성과",
      sourceDescription:
        "소스별 유입 효율 차이를 비교해 예산과 운영 우선순위를 점검합니다.",
      dailyTitle: "일자별 성과",
      dailyDescription:
        "일 단위 유입 흐름을 확인해 변동이 큰 날짜와 이슈 구간을 찾습니다.",
    };
  }

  if (resolvedType === "db_acquisition") {
    return {
      kpiTitle: "기간 성과 요약",
      kpiDescription:
        "현재 필터 조건 기준의 DB 확보·전환 효율 중심 핵심 KPI를 빠르게 확인합니다.",
      monthTitle: "월별 DB 확보 성과 (최근 3개월)",
      monthDescription: "최근 월별 DB 확보·리드 확보 성과를 비교합니다.",
      weeklyTitle: "주차별 DB 확보 성과",
      weeklyDescription:
        "최근 주차별 전환 흐름과 전주 대비 변화량을 빠르게 확인합니다.",
      chartTitle: "주차별 전환 추이",
      chartDescription:
        "전환·CPA 중심 핵심 성과 흐름을 시각적으로 비교해 변화 구간을 빠르게 파악합니다.",
      sourceTitle: "소스별 리드 확보 성과",
      sourceDescription:
        "소스별 리드 확보 효율 차이를 비교해 예산과 운영 우선순위를 점검합니다.",
      dailyTitle: "일자별 전환 성과",
      dailyDescription:
        "일 단위 전환 흐름을 확인해 변동이 큰 날짜와 이슈 구간을 찾습니다.",
    };
  }

  return {
    kpiTitle: "기간 성과 요약",
    kpiDescription: "현재 필터 조건 기준의 핵심 KPI를 빠르게 확인합니다.",
    monthTitle: "월별 성과 (최근 3개월)",
    monthDescription: "최근 월별 핵심 성과를 비교합니다.",
    weeklyTitle: "주차별 성과",
    weeklyDescription: "최근 주차 흐름과 전주 대비 변화량을 빠르게 확인합니다.",
    chartTitle: "주차별 추이",
    chartDescription:
      "핵심 성과 흐름을 시각적으로 비교해 변화 구간을 빠르게 파악합니다.",
    sourceTitle: "소스별 성과",
    sourceDescription:
      "소스별 효율 차이를 비교해 예산과 운영 우선순위를 점검합니다.",
    dailyTitle: "일자별 성과",
    dailyDescription:
      "일 단위 흐름을 확인해 변동이 큰 날짜와 이슈 구간을 찾습니다.",
  };
}

const SectionIntro = memo(function SectionIntro({
  badge,
  title,
  description,
  compact = false,
}: {
  badge: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? "mb-5 flex flex-col gap-2" : "mb-6 flex flex-col gap-2.5"
      }
    >
      <div className="inline-flex w-fit items-center rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/24 px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-slate-600">
        {badge}
      </div>

      <div>
        <h3
          className={[
            "font-semibold tracking-[-0.02em] text-slate-900",
            compact ? "text-[18px]" : "text-[20px]",
          ].join(" ")}
        >
          {title}
        </h3>
        <p
          className={[
            "text-slate-500",
            compact ? "mt-1.5 text-sm leading-6" : "mt-2 text-sm leading-6",
          ].join(" ")}
        >
          {description}
        </p>
      </div>
    </div>
  );
});

function weekSortKey(w: any) {
  const k = w?.weekKey ?? w?.startDate ?? w?.weekStart ?? w?.dateKey;
  if (k) return String(k);

  const m = String(w?.label ?? "").match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})주차/
  );
  if (!m) return String(w?.label ?? "");
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const wk = m[3].padStart(2, "0");
  return `${y}-${mo}-${wk}`;
}

function daySortKey(row: any) {
  return String(
    row?.date ??
      row?.dateKey ??
      row?.day ??
      row?.ymd ??
      row?.report_date ??
      row?.reportDate ??
      row?.label ??
      ""
  );
}

function dayLabel(row: any) {
  return String(
    row?.date ??
      row?.dateKey ??
      row?.day ??
      row?.ymd ??
      row?.report_date ??
      row?.reportDate ??
      row?.label ??
      "-"
  );
}

function getMaxValue<T>(rows: readonly T[], getter: (row: T) => number) {
  let max = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const v = getter(rows[i]);
    if (v > max) max = v;
  }
  return max;
}

function buildWeeklyDisplayRows(rows: readonly any[]): WeeklyDisplayRow[] {
  return rows.map((w: any, idx: number) => {
    const impressions = toSafeNumber(w?.impressions ?? w?.impr);
    const clicks = toSafeNumber(w?.clicks);
    const cost = toSafeNumber(w?.cost);
    const conversions = toSafeNumber(w?.conversions ?? w?.conv);
    const revenue = toSafeNumber(w?.revenue);
    const cpc = toSafeNumber(w?.cpc);
    const cpa = toSafeNumber(w?.cpa);

    return {
      key: w?.weekKey ?? `${weekSortKey(w)}-${idx}`,
      title: String(w?.label ?? ""),
      label: w?.label,
      impressions,
      clicks,
      ctrText: formatPercentFromRate(w?.ctr, 2),
      cpcText: KRW(cpc),
      cost,
      costText: KRW(cost),
      conversions,
      cvrText: formatPercentFromRate(w?.cvr, 2),
      cpaText: KRW(cpa),
      revenue,
      revenueText: KRW(revenue),
      roasText: formatPercentFromRoas(w?.roas, 1),
    };
  });
}

function buildSourceDisplayRows(rows: readonly any[]): SourceDisplayRow[] {
  return rows.map((r: any, idx: number) => {
    const impressions = toSafeNumber(r?.impressions ?? r?.impr);
    const clicks = toSafeNumber(r?.clicks);
    const cost = toSafeNumber(r?.cost);
    const conversions = toSafeNumber(r?.conversions ?? r?.conv);
    const revenue = toSafeNumber(r?.revenue);
    const cpc = toSafeNumber(r?.cpc);
    const cpa = toSafeNumber(r?.cpa);

    return {
      key: r?.source ?? idx,
      title: String(r?.source ?? ""),
      source: r?.source,
      impressions,
      clicks,
      ctrText: formatPercentFromRate(r?.ctr, 2),
      cpcText: KRW(cpc),
      cost,
      costText: KRW(cost),
      conversions,
      cvrText: formatPercentFromRate(r?.cvr, 2),
      cpaText: KRW(cpa),
      revenue,
      revenueText: KRW(revenue),
      roasText: formatPercentFromRoas(r?.roas, 1),
    };
  });
}

function buildDailyDisplayRows(rows: readonly any[]): DailyDisplayRow[] {
  return rows.map((d: any, idx: number) => {
    const impressions = toSafeNumber(d?.impressions ?? d?.impr);
    const clicks = toSafeNumber(d?.clicks);
    const cost = toSafeNumber(d?.cost);
    const conversions = toSafeNumber(d?.conversions ?? d?.conv);
    const revenue = toSafeNumber(d?.revenue);
    const cpc = toSafeNumber(d?.cpc);
    const cpa = toSafeNumber(d?.cpa);
    const roas = normalizeRoas01(d?.roas);
    const label = dayLabel(d);

    return {
      key:
        d?.date ??
        d?.dateKey ??
        d?.day ??
        d?.ymd ??
        d?.report_date ??
        d?.reportDate ??
        `${daySortKey(d)}-${idx}`,
      title: label,
      label,
      impressions,
      clicks,
      ctrText: formatPercentFromRate(d?.ctr, 2),
      cpc,
      cpcText: KRW(cpc),
      cost,
      costText: KRW(cost),
      conversions,
      cvrText: formatPercentFromRate(d?.cvr, 2),
      cpa,
      cpaText: KRW(cpa),
      revenue,
      revenueText: KRW(revenue),
      roas,
      roasText: formatPercentFromRoas(d?.roas, 1),
    };
  });
}

function useActivateWhenNearViewport<T extends HTMLElement>(
  rootMargin = DAILY_ACTIVATION_ROOT_MARGIN
) {
  const ref = useRef<T | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isActive) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          setIsActive(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [isActive, rootMargin]);

  return { ref, isActive };
}

const MetricColGroup = memo(function MetricColGroup({
  mode,
}: {
  mode: MetricMode;
}) {
  return (
    <colgroup>
      <col className="w-[180px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[110px]" />
      {mode.showConversions && <col className="w-[90px]" />}
      {mode.showCvr && <col className="w-[90px]" />}
      {mode.showCpa && <col className="w-[90px]" />}
      {mode.showRevenue && <col className="w-[120px]" />}
      {mode.showRoas && <col className="w-[90px]" />}
    </colgroup>
  );
});

const SLIDE2_TABLE_HEAD_CLASS =
  "border-b border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/34";
const SLIDE2_TH_CLASS =
  "whitespace-nowrap border-l border-[var(--nature-border-blue)]/45 px-3 py-3.5 text-center text-[13px] font-bold uppercase tracking-[0.03em] text-slate-700";
const SLIDE2_FIRST_TH_CLASS =
  "whitespace-nowrap px-3 py-3.5 text-center text-[13px] font-bold uppercase tracking-[0.03em] text-slate-700";
const SLIDE2_TD_CLASS =
  "whitespace-nowrap border-l border-slate-200/65 px-3 py-3.5 text-center text-[15px] font-medium text-slate-800 align-middle tabular-nums";
const SLIDE2_FIRST_TD_CLASS =
  "whitespace-nowrap px-3 py-3.5 text-center text-[15px] font-bold text-slate-900 align-middle";
const SLIDE3_TABLE_HEAD_CLASS =
  `${SLIDE2_TABLE_HEAD_CLASS} sticky top-0 z-10`;

const WeeklyTableHead = memo(function WeeklyTableHead({
  mode,
}: {
  mode: MetricMode;
}) {
  return (
    <thead className={SLIDE2_TABLE_HEAD_CLASS}>
      <tr>
        <th className={SLIDE2_FIRST_TH_CLASS}>Week</th>
        <th className={SLIDE2_TH_CLASS}>Impr</th>
        <th className={SLIDE2_TH_CLASS}>Clicks</th>
        <th className={SLIDE2_TH_CLASS}>CTR</th>
        <th className={SLIDE2_TH_CLASS}>CPC</th>
        <th className={SLIDE2_TH_CLASS}>Cost</th>
        {mode.showConversions && <th className={SLIDE2_TH_CLASS}>Conv</th>}
        {mode.showCvr && <th className={SLIDE2_TH_CLASS}>CVR</th>}
        {mode.showCpa && <th className={SLIDE2_TH_CLASS}>CPA</th>}
        {mode.showRevenue && <th className={SLIDE2_TH_CLASS}>Revenue</th>}
        {mode.showRoas && <th className={SLIDE2_TH_CLASS}>ROAS</th>}
      </tr>
    </thead>
  );
});

const SourceTableHead = memo(function SourceTableHead({
  mode,
}: {
  mode: MetricMode;
}) {
  return (
    <thead className={SLIDE3_TABLE_HEAD_CLASS}>
      <tr>
        <th className={SLIDE2_FIRST_TH_CLASS}>Source</th>
        <th className={SLIDE2_TH_CLASS}>Impr</th>
        <th className={SLIDE2_TH_CLASS}>Clicks</th>
        <th className={SLIDE2_TH_CLASS}>CTR</th>
        <th className={SLIDE2_TH_CLASS}>CPC</th>
        <th className={SLIDE2_TH_CLASS}>Cost</th>
        {mode.showConversions && <th className={SLIDE2_TH_CLASS}>Conv</th>}
        {mode.showCvr && <th className={SLIDE2_TH_CLASS}>CVR</th>}
        {mode.showCpa && <th className={SLIDE2_TH_CLASS}>CPA</th>}
        {mode.showRevenue && <th className={SLIDE2_TH_CLASS}>Revenue</th>}
        {mode.showRoas && <th className={SLIDE2_TH_CLASS}>ROAS</th>}
      </tr>
    </thead>
  );
});

const DailyTableHead = memo(function DailyTableHead({
  mode,
}: {
  mode: MetricMode;
}) {
  return (
    <thead className={SLIDE3_TABLE_HEAD_CLASS}>
      <tr>
        <th className={SLIDE2_FIRST_TH_CLASS}>Date</th>
        <th className={SLIDE2_TH_CLASS}>Impr</th>
        <th className={SLIDE2_TH_CLASS}>Clicks</th>
        <th className={SLIDE2_TH_CLASS}>CTR</th>
        <th className={SLIDE2_TH_CLASS}>CPC</th>
        <th className={SLIDE2_TH_CLASS}>Cost</th>
        {mode.showConversions && <th className={SLIDE2_TH_CLASS}>Conv</th>}
        {mode.showCvr && <th className={SLIDE2_TH_CLASS}>CVR</th>}
        {mode.showCpa && <th className={SLIDE2_TH_CLASS}>CPA</th>}
        {mode.showRevenue && <th className={SLIDE2_TH_CLASS}>Revenue</th>}
        {mode.showRoas && <th className={SLIDE2_TH_CLASS}>ROAS</th>}
      </tr>
    </thead>
  );
});

type WeeklyDisplayRow = {
  key: string;
  title: string;
  label: string;
  impressions: number;
  clicks: number;
  ctrText: string;
  cpcText: string;
  cost: number;
  costText: string;
  conversions: number;
  cvrText: string;
  cpaText: string;
  revenue: number;
  revenueText: string;
  roasText: string;
};

const WeeklyDeltaRow = memo(function WeeklyDeltaRow({
  mode,
  prevRow,
  lastRow,
}: {
  mode: MetricMode;
  prevRow: any;
  lastRow: any;
}) {
  if (!lastRow || !prevRow) return null;

  return (
    <tr className="border-b border-[var(--nature-border-blue)]/55 bg-[var(--nature-cream)]/72 font-medium text-slate-800">
      <td className={`${SLIDE2_FIRST_TD_CLASS} truncate`}>증감(최근주-전주)</td>

      <td className={SLIDE2_TD_CLASS}>
        <TrendCell
          v={
            diffRatio(
              lastRow?.impressions ?? 0,
              prevRow?.impressions ?? 0
            ) ?? 0
          }
        />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <TrendCell
          v={diffRatio(lastRow?.clicks ?? 0, prevRow?.clicks ?? 0) ?? 0}
        />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <TrendCell
          v={
            diffRatio(
              normalizeRate01(lastRow?.ctr),
              normalizeRate01(prevRow?.ctr)
            ) ?? 0
          }
          digits={2}
        />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <TrendCell
          v={diffRatio(lastRow?.cpc ?? 0, prevRow?.cpc ?? 0) ?? 0}
          digits={2}
        />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <TrendCell v={diffRatio(lastRow?.cost ?? 0, prevRow?.cost ?? 0) ?? 0} />
      </td>

      {mode.showConversions && (
        <td className={SLIDE2_TD_CLASS}>
          <TrendCell
            v={
              diffRatio(
                lastRow?.conversions ?? 0,
                prevRow?.conversions ?? 0
              ) ?? 0
            }
          />
        </td>
      )}

      {mode.showCvr && (
        <td className={SLIDE2_TD_CLASS}>
          <TrendCell
            v={
              diffRatio(
                normalizeRate01(lastRow?.cvr),
                normalizeRate01(prevRow?.cvr)
              ) ?? 0
            }
            digits={2}
          />
        </td>
      )}

      {mode.showCpa && (
        <td className={SLIDE2_TD_CLASS}>
          <TrendCell
            v={diffRatio(lastRow?.cpa ?? 0, prevRow?.cpa ?? 0) ?? 0}
            digits={2}
          />
        </td>
      )}

      {mode.showRevenue && (
        <td className={SLIDE2_TD_CLASS}>
          <TrendCell
            v={diffRatio(lastRow?.revenue ?? 0, prevRow?.revenue ?? 0) ?? 0}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={SLIDE2_TD_CLASS}>
          <TrendCell
            v={
              diffRatio(
                normalizeRoas01(lastRow?.roas),
                normalizeRoas01(prevRow?.roas)
              ) ?? 0
            }
            digits={2}
          />
        </td>
      )}
    </tr>
  );
});

const WeeklyPerformanceRow = memo(function WeeklyPerformanceRow({
  mode,
  row,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  mode: MetricMode;
  row: WeeklyDisplayRow;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  return (
    <tr className="border-t border-slate-200 bg-white even:bg-[var(--nature-blue-light)]/14 hover:bg-[var(--nature-blue-light)]/22">
      <td className={`${SLIDE2_FIRST_TD_CLASS} truncate`} title={row.title}>
        {row.label}
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.impressions} max={maxImpr} />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.clicks} max={maxClicks} />
      </td>

      <td className={`${SLIDE2_TD_CLASS} font-medium text-[#4F7F9E]`}>
        {row.ctrText}
      </td>

      <td className={SLIDE2_TD_CLASS}>{row.cpcText}</td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.cost} max={maxCost} label={row.costText} />
      </td>

      {mode.showConversions && (
        <td className={SLIDE2_TD_CLASS}>
          <DataBarCell emphasized value={row.conversions} max={maxConv} />
        </td>
      )}

      {mode.showCvr && (
        <td className={`${SLIDE2_TD_CLASS} font-medium text-[#4F7F9E]`}>
          {row.cvrText}
        </td>
      )}

      {mode.showCpa && <td className={SLIDE2_TD_CLASS}>{row.cpaText}</td>}

      {mode.showRevenue && (
        <td className={SLIDE2_TD_CLASS}>
          <DataBarCell emphasized
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={`${SLIDE2_TD_CLASS} font-semibold text-[#4F7F9E]`}>
          {row.roasText}
        </td>
      )}
    </tr>
  );
});

const WeeklyPerformanceTable = memo(function WeeklyPerformanceTable({
  mode,
  rows,
  prevRow,
  lastRow,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  mode: MetricMode;
  rows: readonly WeeklyDisplayRow[];
  prevRow: any;
  lastRow: any;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table className={mode.tableClassName}>
        <MetricColGroup mode={mode} />
        <WeeklyTableHead mode={mode} />

        <tbody>
          <WeeklyDeltaRow mode={mode} prevRow={prevRow} lastRow={lastRow} />

          {rows.map((row) => (
            <WeeklyPerformanceRow
              key={row.key}
              mode={mode}
              row={row}
              maxImpr={maxImpr}
              maxClicks={maxClicks}
              maxCost={maxCost}
              maxConv={maxConv}
              maxRev={maxRev}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

type SourceDisplayRow = {
  key: string | number;
  title: string;
  source: any;
  impressions: number;
  clicks: number;
  ctrText: string;
  cpcText: string;
  cost: number;
  costText: string;
  conversions: number;
  cvrText: string;
  cpaText: string;
  revenue: number;
  revenueText: string;
  roasText: string;
};

const SourceEmptyRow = memo(function SourceEmptyRow({
  colSpan,
}: {
  colSpan: number;
}) {
  return (
    <tr className="border-t border-[var(--nature-border)]">
      <td className={EMPTY_STATE_CLASS} colSpan={colSpan}>
        데이터가 없습니다.
      </td>
    </tr>
  );
});

const TableSpacerRow = memo(function TableSpacerRow({
  colSpan,
  height,
}: {
  colSpan: number;
  height: number;
}) {
  if (height <= 0) return null;

  return (
    <tr aria-hidden="true">
      <td
        colSpan={colSpan}
        style={{
          height: `${height}px`,
          padding: 0,
          border: 0,
        }}
      />
    </tr>
  );
});

const SourcePerformanceRow = memo(function SourcePerformanceRow({
  mode,
  row,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  mode: MetricMode;
  row: SourceDisplayRow;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  return (
    <tr
      className="border-t border-slate-200 bg-white even:bg-[var(--nature-blue-light)]/14 hover:bg-[var(--nature-blue-light)]/22"
      style={{ height: `${SOURCE_ROW_HEIGHT}px` }}
    >
      <td
        className="whitespace-nowrap px-3 py-3.5 text-left text-[15px] font-bold text-slate-900 align-middle truncate"
        title={row.title}
      >
        <SourceBrand source={row.source} />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.impressions} max={maxImpr} />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.clicks} max={maxClicks} />
      </td>

      <td className={`${SLIDE2_TD_CLASS} font-medium text-[#4F7F9E]`}>
        {row.ctrText}
      </td>

      <td className={SLIDE2_TD_CLASS}>{row.cpcText}</td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.cost} max={maxCost} label={row.costText} />
      </td>

      {mode.showConversions && (
        <td className={SLIDE2_TD_CLASS}>
          <DataBarCell emphasized value={row.conversions} max={maxConv} />
        </td>
      )}

      {mode.showCvr && (
        <td className={`${SLIDE2_TD_CLASS} font-medium text-[#4F7F9E]`}>
          {row.cvrText}
        </td>
      )}

      {mode.showCpa && <td className={SLIDE2_TD_CLASS}>{row.cpaText}</td>}

      {mode.showRevenue && (
        <td className={SLIDE2_TD_CLASS}>
          <DataBarCell emphasized
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={`${SLIDE2_TD_CLASS} font-semibold text-[#4F7F9E]`}>
          {row.roasText}
        </td>
      )}
    </tr>
  );
});

const SourcePerformanceTable = memo(function SourcePerformanceTable({
  mode,
  rows,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  mode: MetricMode;
  rows: readonly SourceDisplayRow[];
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const rangeRef = useRef({ startIndex: 0, endIndex: 0 });

  const [viewportHeight, setViewportHeight] = useState(
    TABLE_FALLBACK_VIEWPORT_HEIGHT
  );
  const [visibleRange, setVisibleRange] = useState({
    startIndex: 0,
    endIndex: 0,
  });

  const updateVisibleRange = useCallback(
    (nextScrollTop: number, nextViewportHeight: number, total: number) => {
      if (total <= 0) {
        const emptyRange = { startIndex: 0, endIndex: 0 };
        const prev = rangeRef.current;

        if (
          prev.startIndex !== emptyRange.startIndex ||
          prev.endIndex !== emptyRange.endIndex
        ) {
          rangeRef.current = emptyRange;
          setVisibleRange(emptyRange);
        }
        return;
      }

      const nextStartIndex = Math.max(
        0,
        Math.floor(nextScrollTop / SOURCE_ROW_HEIGHT) - TABLE_OVERSCAN
      );

      const nextEndIndex = Math.min(
        total,
        Math.ceil((nextScrollTop + nextViewportHeight) / SOURCE_ROW_HEIGHT) +
          TABLE_OVERSCAN
      );

      const prev = rangeRef.current;
      if (
        prev.startIndex === nextStartIndex &&
        prev.endIndex === nextEndIndex
      ) {
        return;
      }

      const nextRange = {
        startIndex: nextStartIndex,
        endIndex: nextEndIndex,
      };

      rangeRef.current = nextRange;
      setVisibleRange(nextRange);
    },
    []
  );

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const nextScrollTop = e.currentTarget.scrollTop;
      const nextViewportHeight =
        e.currentTarget.clientHeight || TABLE_FALLBACK_VIEWPORT_HEIGHT;
      const total = rows.length;

      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        updateVisibleRange(nextScrollTop, nextViewportHeight, total);
      });
    },
    [rows.length, updateVisibleRange]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateViewportHeightAndRange = () => {
      const nextHeight = el.clientHeight || TABLE_FALLBACK_VIEWPORT_HEIGHT;

      setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      updateVisibleRange(el.scrollTop, nextHeight, rows.length);
    };

    updateViewportHeightAndRange();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportHeightAndRange);
      return () => {
        window.removeEventListener("resize", updateViewportHeightAndRange);
      };
    }

    const observer = new ResizeObserver(() => {
      updateViewportHeightAndRange();
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [rows.length, updateVisibleRange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const maxScrollTop = Math.max(
      0,
      rows.length * SOURCE_ROW_HEIGHT - viewportHeight
    );

    if (el.scrollTop > maxScrollTop) {
      el.scrollTop = maxScrollTop;
    }

    updateVisibleRange(el.scrollTop, viewportHeight, rows.length);
  }, [rows.length, viewportHeight, updateVisibleRange]);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const { visibleRows, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    const total = rows.length;
    const startIndex = Math.min(visibleRange.startIndex, total);
    const endIndex = Math.min(
      Math.max(visibleRange.endIndex, startIndex),
      total
    );

    return {
      visibleRows: rows.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * SOURCE_ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (total - endIndex) * SOURCE_ROW_HEIGHT),
    };
  }, [rows, visibleRange]);

  return (
    <div
      ref={containerRef}
      className={SOURCE_TABLE_SURFACE_CLASS}
      onScroll={handleScroll}
    >
      <table className={mode.tableClassName}>
        <MetricColGroup mode={mode} />
        <SourceTableHead mode={mode} />

        <tbody>
          {rows.length === 0 ? (
            <SourceEmptyRow colSpan={mode.colSpan} />
          ) : (
            <>
              <TableSpacerRow
                colSpan={mode.colSpan}
                height={topSpacerHeight}
              />

              {visibleRows.map((row) => (
                <SourcePerformanceRow
                  key={row.key}
                  mode={mode}
                  row={row}
                  maxImpr={maxImpr}
                  maxClicks={maxClicks}
                  maxCost={maxCost}
                  maxConv={maxConv}
                  maxRev={maxRev}
                />
              ))}

              <TableSpacerRow
                colSpan={mode.colSpan}
                height={bottomSpacerHeight}
              />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
});

type DailyDisplayRow = {
  key: string;
  title: string;
  label: string;
  impressions: number;
  clicks: number;
  ctrText: string;
  cpc: number;
  cpcText: string;
  cost: number;
  costText: string;
  conversions: number;
  cvrText: string;
  cpa: number;
  cpaText: string;
  revenue: number;
  revenueText: string;
  roas: number;
  roasText: string;
};

function formatDailyCountAxisCompact(value: any) {
  const n = toSafeNumber(value);

  if (n >= 100000000) {
    return `${(n / 100000000).toFixed(n >= 1000000000 ? 0 : 1)}억`;
  }

  if (n >= 10000) {
    return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만`;
  }

  if (n >= 1000) {
    return `${Math.round(n / 100) / 10}천`;
  }

  return formatCount(n);
}

const DAILY_CHART_LINE_COLOR = "#F97316";

const DailyDualPerformanceCharts = memo(function DailyDualPerformanceCharts({
  reportType,
  rows,
  dashboardOnly = false,
}: {
  reportType?: ReportType;
  rows: readonly DailyDisplayRow[];
  dashboardOnly?: boolean;
}) {
  const resolvedType: ReportType = reportType ?? "commerce";

  const inflowData = useMemo(
    () =>
      rows.map((row) => ({
        label: row.label,
        revenue: row.clicks,
        roas: row.cpc,
      })),
    [rows]
  );

  const inflowMode = useMemo(
    () => ({
      isTraffic: false,
      isDbAcquisition: false,
      metricSummaryText: "클릭수 · CPC",
      costLabel: "",
      revenueLabel: "클릭수",
      roasLabel: "CPC",
      maxRevenueInsightLabel: "",
      minCostInsightLabel: "",
      costValueFormatter: (value: any) =>
        formatCount(toSafeNumber(value)),
      revenueValueFormatter: (value: any) =>
        formatCount(toSafeNumber(value)),
      roasValueFormatter: (value: any) =>
        KRW(toSafeNumber(value)),
      leftAxisFormatter: (value: any) =>
        formatDailyCountAxisCompact(value),
      rightAxisFormatter: (value: any) =>
        formatCurrencyAxisCompact(value),
      renderRevenueAsBar: true,
      useHiddenRevenueAxis: false,
      revenueAxisId: "left" as const,
    }),
    []
  );

  const resultChart = useMemo(() => {
    if (resolvedType === "db_acquisition") {
      return {
        title: "일자별 전환 성과",
        description: "전환수와 CPA의 일별 흐름을 함께 확인합니다.",
        data: rows.map((row) => ({
          label: row.label,
          revenue: row.conversions,
          roas: row.cpa,
        })),
        mode: {
          isTraffic: false,
          isDbAcquisition: false,
          metricSummaryText: "전환수 · CPA",
          costLabel: "",
          revenueLabel: "전환수",
          roasLabel: "CPA",
          maxRevenueInsightLabel: "",
          minCostInsightLabel: "",
          costValueFormatter: (value: any) =>
            formatCount(toSafeNumber(value)),
          revenueValueFormatter: (value: any) =>
            formatCount(toSafeNumber(value)),
          roasValueFormatter: (value: any) =>
            KRW(toSafeNumber(value)),
          leftAxisFormatter: (value: any) =>
            formatDailyCountAxisCompact(value),
          rightAxisFormatter: (value: any) =>
            formatCurrencyAxisCompact(value),
          renderRevenueAsBar: true,
          useHiddenRevenueAxis: false,
          revenueAxisId: "left" as const,
        },
      };
    }

    if (resolvedType === "traffic") {
      return {
        title: "일자별 비용 성과",
        description: "클릭수와 총비용의 일별 흐름을 함께 확인합니다.",
        data: rows.map((row) => ({
          label: row.label,
          revenue: row.clicks,
          roas: row.cost,
        })),
        mode: {
          isTraffic: false,
          isDbAcquisition: false,
          metricSummaryText: "클릭수 · 총비용",
          costLabel: "",
          revenueLabel: "클릭수",
          roasLabel: "총비용",
          maxRevenueInsightLabel: "",
          minCostInsightLabel: "",
          costValueFormatter: (value: any) =>
            formatCount(toSafeNumber(value)),
          revenueValueFormatter: (value: any) =>
            formatCount(toSafeNumber(value)),
          roasValueFormatter: (value: any) =>
            KRW(toSafeNumber(value)),
          leftAxisFormatter: (value: any) =>
            formatDailyCountAxisCompact(value),
          rightAxisFormatter: (value: any) =>
            formatCurrencyAxisCompact(value),
          renderRevenueAsBar: true,
          useHiddenRevenueAxis: false,
          revenueAxisId: "left" as const,
        },
      };
    }

    return {
      title: "일자별 매출 성과",
      description: "전환매출과 ROAS의 일별 흐름을 함께 확인합니다.",
      data: rows.map((row) => ({
        label: row.label,
        revenue: row.revenue,
        roas: row.roas,
      })),
      mode: {
        isTraffic: false,
        isDbAcquisition: false,
        metricSummaryText: "전환매출 · ROAS",
        costLabel: "",
        revenueLabel: "전환매출",
        roasLabel: "ROAS",
        maxRevenueInsightLabel: "",
        minCostInsightLabel: "",
        costValueFormatter: (value: any) =>
          KRW(toSafeNumber(value)),
        revenueValueFormatter: (value: any) =>
          KRW(toSafeNumber(value)),
        roasValueFormatter: (value: any) =>
          formatPercentFromRoas(value, 1),
        leftAxisFormatter: (value: any) =>
          formatCurrencyAxisCompact(value),
        rightAxisFormatter: (value: any) =>
          formatPercentAxisFromRoas(value),
        renderRevenueAsBar: true,
        useHiddenRevenueAxis: false,
        revenueAxisId: "left" as const,
      },
    };
  }, [resolvedType, rows]);

  if (dashboardOnly) {
    return (
      <SummaryChartView
        data={resultChart.data}
        density="export-side-compact"
        reportType={reportType}
        hideHeader
        hideInsights
        hideCostSeries
        modeOverride={resultChart.mode}
        lineColor={DAILY_CHART_LINE_COLOR}
        xAxisMode="daily-auto"
        barGapOverride={4}
        barCategoryGapOverride="18%"
        transparentChartSurface
        className="!overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none [&>div:first-child]:!px-0 [&>div:first-child]:!pt-1 [&>div:first-child>div]:!rounded-none [&>div:first-child>div]:!border-0 [&>div:first-child>div]:!bg-transparent [&>div:first-child>div]:!px-0 [&>div:first-child>div]:!py-1 [&>div:first-child>div]:!shadow-none [&>div:last-child]:!h-[380px] [&>div:last-child]:!px-0 [&>div:last-child]:!pb-0 [&>div:last-child]:!pt-1 [&>div:last-child>div]:!rounded-none [&>div:last-child>div]:!border-0 [&>div:last-child>div]:!bg-transparent [&>div:last-child>div]:!px-0 [&>div:last-child>div]:!py-0"
      />
    );
  }

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-3">
          <h4 className="text-[15px] font-bold tracking-[-0.02em] text-slate-900">
            일자별 유입 성과
          </h4>
          <p className="mt-1 text-[12px] font-medium leading-5 text-slate-500">
            클릭수와 CPC의 일별 흐름을 함께 확인합니다.
          </p>
        </div>

        <SummaryChartView
          data={inflowData}
          density="report"
          reportType={reportType}
          hideHeader
          hideInsights
          hideCostSeries
          modeOverride={inflowMode}
          lineColor={DAILY_CHART_LINE_COLOR}
          xAxisMode="daily-auto"
          barGapOverride={4}
          barCategoryGapOverride="18%"
        />
      </div>

      <div className="min-w-0">
        <div className="mb-3">
          <h4 className="text-[15px] font-bold tracking-[-0.02em] text-slate-900">
            {resultChart.title}
          </h4>
          <p className="mt-1 text-[12px] font-medium leading-5 text-slate-500">
            {resultChart.description}
          </p>
        </div>

        <SummaryChartView
          data={resultChart.data}
          density="report"
          reportType={reportType}
          hideHeader
          hideInsights
          hideCostSeries
          modeOverride={resultChart.mode}
          lineColor={DAILY_CHART_LINE_COLOR}
          xAxisMode="daily-auto"
          barCategoryGapOverride="18%"
        />
      </div>
    </div>
  );
});


const DailyEmptyRow = memo(function DailyEmptyRow({
  colSpan,
}: {
  colSpan: number;
}) {
  return (
    <tr
      className="border-t border-[var(--nature-border)] even:bg-[var(--nature-cream)]/16 hover:bg-[var(--nature-blue-light)]/14"
      style={{ height: `${DAILY_ROW_HEIGHT}px` }}
    >
      <td className={EMPTY_STATE_CLASS} colSpan={colSpan}>
        데이터가 없습니다.
      </td>
    </tr>
  );
});

const DailyPerformanceRow = memo(function DailyPerformanceRow({
  mode,
  row,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  mode: MetricMode;
  row: DailyDisplayRow;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  return (
    <tr
      className="border-t border-slate-200 bg-white even:bg-[var(--nature-blue-light)]/14 hover:bg-[var(--nature-blue-light)]/22"
      style={{ height: `${DAILY_ROW_HEIGHT}px` }}
    >
      <td className={`${SLIDE2_FIRST_TD_CLASS} truncate`} title={row.title}>
        {row.label}
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.impressions} max={maxImpr} />
      </td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.clicks} max={maxClicks} />
      </td>

      <td className={`${SLIDE2_TD_CLASS} font-medium text-[#4F7F9E]`}>
        {row.ctrText}
      </td>

      <td className={SLIDE2_TD_CLASS}>{row.cpcText}</td>

      <td className={SLIDE2_TD_CLASS}>
        <DataBarCell emphasized value={row.cost} max={maxCost} label={row.costText} />
      </td>

      {mode.showConversions && (
        <td className={SLIDE2_TD_CLASS}>
          <DataBarCell emphasized value={row.conversions} max={maxConv} />
        </td>
      )}

      {mode.showCvr && (
        <td className={`${SLIDE2_TD_CLASS} font-medium text-[#4F7F9E]`}>
          {row.cvrText}
        </td>
      )}

      {mode.showCpa && <td className={SLIDE2_TD_CLASS}>{row.cpaText}</td>}

      {mode.showRevenue && (
        <td className={SLIDE2_TD_CLASS}>
          <DataBarCell emphasized
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={`${SLIDE2_TD_CLASS} font-semibold text-[#4F7F9E]`}>
          {row.roasText}
        </td>
      )}
    </tr>
  );
});

const DailyPerformanceTable = memo(function DailyPerformanceTable({
  mode,
  rows,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
  constrainToTenRows = false,
}: {
  mode: MetricMode;
  rows: readonly DailyDisplayRow[];
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
  constrainToTenRows?: boolean;
}) {
  const activation = useActivateWhenNearViewport<HTMLDivElement>();
  const wrapperRef = activation.ref;
  const isActive = activation.isActive;

  const frameRef = useRef<number | null>(null);
  const rangeRef = useRef({ startIndex: 0, endIndex: 0 });

  const [viewportHeight, setViewportHeight] = useState(
    TABLE_FALLBACK_VIEWPORT_HEIGHT
  );
  const [visibleRange, setVisibleRange] = useState({
    startIndex: 0,
    endIndex: 0,
  });

  const updateVisibleRange = useCallback(
    (nextScrollTop: number, nextViewportHeight: number, total: number) => {
      if (total <= 0) {
        const emptyRange = { startIndex: 0, endIndex: 0 };
        const prev = rangeRef.current;

        if (
          prev.startIndex !== emptyRange.startIndex ||
          prev.endIndex !== emptyRange.endIndex
        ) {
          rangeRef.current = emptyRange;
          setVisibleRange(emptyRange);
        }
        return;
      }

      const nextStartIndex = Math.max(
        0,
        Math.floor(nextScrollTop / DAILY_ROW_HEIGHT) - TABLE_OVERSCAN
      );

      const nextEndIndex = Math.min(
        total,
        Math.ceil((nextScrollTop + nextViewportHeight) / DAILY_ROW_HEIGHT) +
          TABLE_OVERSCAN
      );

      const prev = rangeRef.current;
      if (
        prev.startIndex === nextStartIndex &&
        prev.endIndex === nextEndIndex
      ) {
        return;
      }

      const nextRange = {
        startIndex: nextStartIndex,
        endIndex: nextEndIndex,
      };

      rangeRef.current = nextRange;
      setVisibleRange(nextRange);
    },
    []
  );

  const updateFromInternalScroll = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const nextViewportHeight = Math.max(
      DAILY_ROW_HEIGHT,
      el.clientHeight - DAILY_TABLE_HEADER_HEIGHT
    );
    const nextScrollTop = Math.max(
      0,
      el.scrollTop - DAILY_TABLE_HEADER_HEIGHT
    );

    setViewportHeight((prev) =>
      prev === nextViewportHeight ? prev : nextViewportHeight
    );

    updateVisibleRange(nextScrollTop, nextViewportHeight, rows.length);
  }, [rows.length, updateVisibleRange, wrapperRef]);

  const updateFromWindowScroll = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;

    if (constrainToTenRows) {
      updateFromInternalScroll();
      return;
    }

    const rect = el.getBoundingClientRect();
    const elementHeight = el.offsetHeight || TABLE_FALLBACK_VIEWPORT_HEIGHT;

    const visibleTop = Math.max(0, -rect.top);
    const visibleBottom = Math.min(elementHeight, window.innerHeight - rect.top);
    const nextViewportHeight =
      Math.max(0, visibleBottom - visibleTop) || TABLE_FALLBACK_VIEWPORT_HEIGHT;

    setViewportHeight((prev) =>
      prev === nextViewportHeight ? prev : nextViewportHeight
    );

    updateVisibleRange(visibleTop, nextViewportHeight, rows.length);
  }, [
    constrainToTenRows,
    rows.length,
    updateFromInternalScroll,
    updateVisibleRange,
    wrapperRef,
  ]);

  const handleInternalScroll = useCallback(() => {
    if (!constrainToTenRows) return;

    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      updateFromInternalScroll();
    });
  }, [constrainToTenRows, updateFromInternalScroll]);

  useEffect(() => {
    if (!isActive) return;

    const handleWindowScroll = () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        updateFromWindowScroll();
      });
    };

    handleWindowScroll();

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener("resize", handleWindowScroll);

    let observer: ResizeObserver | null = null;
    const el = wrapperRef.current;

    if (el && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        handleWindowScroll();
      });
      observer.observe(el);
    }

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
      window.removeEventListener("resize", handleWindowScroll);

      if (observer) observer.disconnect();

      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isActive, updateFromWindowScroll, wrapperRef]);

  useEffect(() => {
    if (!isActive) return;
    updateFromWindowScroll();
  }, [isActive, rows.length, updateFromWindowScroll]);

  const { visibleRows, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (!isActive) {
      const eagerCount = Math.min(rows.length, 12);
      return {
        visibleRows: rows.slice(0, eagerCount),
        topSpacerHeight: 0,
        bottomSpacerHeight: Math.max(
          0,
          (rows.length - eagerCount) * DAILY_ROW_HEIGHT
        ),
      };
    }

    const total = rows.length;
    const startIndex = Math.min(visibleRange.startIndex, total);
    const endIndex = Math.min(
      Math.max(visibleRange.endIndex, startIndex),
      total
    );

    return {
      visibleRows: rows.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * DAILY_ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (total - endIndex) * DAILY_ROW_HEIGHT),
    };
  }, [isActive, rows, visibleRange]);

  return (
    <div
      ref={wrapperRef}
      className={DAILY_TABLE_SURFACE_CLASS}
      onScroll={constrainToTenRows ? handleInternalScroll : undefined}
      style={
        constrainToTenRows
          ? {
              maxHeight: `${DAILY_TABLE_SCROLL_HEIGHT}px`,
              overflowY: "auto",
            }
          : undefined
      }
    >
      <table className={mode.tableClassName}>
        <MetricColGroup mode={mode} />
        <DailyTableHead mode={mode} />

        <tbody>
          {rows.length === 0 ? (
            <DailyEmptyRow colSpan={mode.colSpan} />
          ) : (
            <>
              <TableSpacerRow
                colSpan={mode.colSpan}
                height={topSpacerHeight}
              />

              {visibleRows.map((row) => (
                <DailyPerformanceRow
                  key={row.key}
                  mode={mode}
                  row={row}
                  maxImpr={maxImpr}
                  maxClicks={maxClicks}
                  maxCost={maxCost}
                  maxConv={maxConv}
                  maxRev={maxRev}
                />
              ))}

              <TableSpacerRow
                colSpan={mode.colSpan}
                height={bottomSpacerHeight}
              />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
});

function SummarySectionComponent(props: Props) {
  const {
    reportType = "commerce",
    totals,
    byMonth,
    byWeekOnly,
    byWeekChart,
    bySource,
    byDay,
    activeSlide,
  } = props;

  const mode = useMemo(() => getMetricMode(reportType), [reportType]);
  const copy = useMemo(() => getSummaryCopy(reportType), [reportType]);

  const months = useMemo<any[]>(
    () => (Array.isArray(byMonth) ? byMonth : EMPTY_MUTABLE_LIST),
    [byMonth]
  );
  const weeks = useMemo(
    () => (Array.isArray(byWeekOnly) ? byWeekOnly : EMPTY_LIST),
    [byWeekOnly]
  );
  const weekChartData = useMemo<any[]>(
    () => (Array.isArray(byWeekChart) ? byWeekChart : EMPTY_MUTABLE_LIST),
    [byWeekChart]
  );
  const sources = useMemo(
    () => (Array.isArray(bySource) ? bySource : EMPTY_LIST),
    [bySource]
  );
  const days = useMemo(
    () => (Array.isArray(byDay) ? byDay : EMPTY_LIST),
    [byDay]
  );

  const stableTotals = totals;
  const stableMonths = months;
  const stableWeekChartData = weekChartData;

  const showAllSections = activeSlide == null;
  const isDashboardSlideActive = activeSlide === 0;
  const isGoalSlideActive = showAllSections || activeSlide === 1;
  const isTrendSlideActive = showAllSections || activeSlide === 2;
  const isSourceSlideActive = showAllSections || activeSlide === 3;

  /**
   * 일반 웹에서는 현재 슬라이드만 최초 계산·mount하고,
   * 한 번 방문한 슬라이드는 이후 hidden 상태로 유지한다.
   * export(activeSlide 미지정)에서는 기존처럼 전체 섹션을 계산·렌더링한다.
   */
  const visitedSlidesRef = useRef({
    goal: isGoalSlideActive,
    trend: isTrendSlideActive,
    source: isSourceSlideActive,
  });

  if (isGoalSlideActive) {
    visitedSlidesRef.current.goal = true;
  }
  if (isTrendSlideActive) {
    visitedSlidesRef.current.trend = true;
  }
  if (isSourceSlideActive) {
    visitedSlidesRef.current.source = true;
  }

  const shouldRenderGoalSlide =
    showAllSections || visitedSlidesRef.current.goal;
  const shouldRenderTrendSlide =
    showAllSections || visitedSlidesRef.current.trend;
  const shouldRenderSourceSlide =
    showAllSections || visitedSlidesRef.current.source;

  const trendDerived = useMemo(() => {
    if (!shouldRenderTrendSlide) {
      return {
        prevWeekSorted: null,
        lastWeekSorted: null,
        weeklyDisplayRows: EMPTY_LIST as readonly WeeklyDisplayRow[],
        maxImpr: 0,
        maxClicks: 0,
        maxCost: 0,
        maxConv: 0,
        maxRev: 0,
      };
    }

    const sortedWeeks = [...weeks].sort((a, b) =>
      weekSortKey(a).localeCompare(weekSortKey(b))
    );
    const weeklyDisplayRows = buildWeeklyDisplayRows(sortedWeeks);

    return {
      prevWeekSorted: sortedWeeks.at(-2) ?? null,
      lastWeekSorted: sortedWeeks.at(-1) ?? null,
      weeklyDisplayRows,
      maxImpr: getMaxValue(weeklyDisplayRows, (r) => r.impressions),
      maxClicks: getMaxValue(weeklyDisplayRows, (r) => r.clicks),
      maxCost: getMaxValue(weeklyDisplayRows, (r) => r.cost),
      maxConv: getMaxValue(weeklyDisplayRows, (r) => r.conversions),
      maxRev: getMaxValue(weeklyDisplayRows, (r) => r.revenue),
    };
  }, [weeks, shouldRenderTrendSlide]);

  const sourceDerived = useMemo(() => {
    if (!shouldRenderSourceSlide && !isDashboardSlideActive) {
      return {
        sourceDisplayRows: EMPTY_LIST as readonly SourceDisplayRow[],
        dailyDisplayRows: EMPTY_LIST as readonly DailyDisplayRow[],
        srcMaxImpr: 0,
        srcMaxClicks: 0,
        srcMaxCost: 0,
        srcMaxConv: 0,
        srcMaxRev: 0,
        dayMaxImpr: 0,
        dayMaxClicks: 0,
        dayMaxCost: 0,
        dayMaxConv: 0,
        dayMaxRev: 0,
      };
    }

    const sourceDisplayRows = buildSourceDisplayRows(sources);
    const srcMaxImpr = getMaxValue(sourceDisplayRows, (r) => r.impressions);
    const srcMaxClicks = getMaxValue(sourceDisplayRows, (r) => r.clicks);
    const srcMaxCost = getMaxValue(sourceDisplayRows, (r) => r.cost);
    const srcMaxConv = getMaxValue(sourceDisplayRows, (r) => r.conversions);
    const srcMaxRev = getMaxValue(sourceDisplayRows, (r) => r.revenue);

    const sortedDays = [...days].sort((a, b) =>
      daySortKey(a).localeCompare(daySortKey(b))
    );
    const dailyDisplayRows = buildDailyDisplayRows(sortedDays);

    return {
      sourceDisplayRows,
      dailyDisplayRows,
      srcMaxImpr,
      srcMaxClicks,
      srcMaxCost,
      srcMaxConv,
      srcMaxRev,
      dayMaxImpr: getMaxValue(dailyDisplayRows, (r) => r.impressions),
      dayMaxClicks: getMaxValue(dailyDisplayRows, (r) => r.clicks),
      dayMaxCost: getMaxValue(dailyDisplayRows, (r) => r.cost),
      dayMaxConv: getMaxValue(dailyDisplayRows, (r) => r.conversions),
      dayMaxRev: getMaxValue(dailyDisplayRows, (r) => r.revenue),
    };
  }, [days, isDashboardSlideActive, sources, shouldRenderSourceSlide]);

  const dashboardHero = useMemo(() => {
    if (!isDashboardSlideActive) return null;

    const impressions = toSafeNumber(stableTotals?.impressions ?? stableTotals?.impr);
    const clicks = toSafeNumber(stableTotals?.clicks ?? stableTotals?.click);
    const ctr = normalizeRate01(stableTotals?.ctr);
    const cpc = toSafeNumber(stableTotals?.cpc);
    const cost = toSafeNumber(stableTotals?.cost);
    const conversions = toSafeNumber(
      stableTotals?.conversions ?? stableTotals?.conv
    );
    const cvr = normalizeRate01(stableTotals?.cvr);
    const revenue = toSafeNumber(stableTotals?.revenue ?? stableTotals?.sales);
    const cpa = toSafeNumber(stableTotals?.cpa);
    const roas = normalizeRoas01(stableTotals?.roas);

    if (reportType === "traffic") {
      return {
        eyebrow: "TRAFFIC PERFORMANCE",
        primaryLabel: "Clicks",
        primaryValue: formatCount(clicks),
        primaryMemo: "현재 필터 기준 핵심 유입 성과",
        efficiencyLabel: "CTR · CPC",
        efficiency: [
          { label: "CTR", value: formatPercentFromRate(ctr, 2) },
          { label: "CPC", value: KRW(cpc) },
        ],
        supporting: [
          { label: "Impressions", value: formatCount(impressions) },
          { label: "CTR", value: formatPercentFromRate(ctr, 2) },
          { label: "CPC", value: KRW(cpc) },
          { label: "Cost", value: KRW(cost) },
        ],
      };
    }

    if (reportType === "db_acquisition") {
      return {
        eyebrow: "DB ACQUISITION PERFORMANCE",
        primaryLabel: "Conversions",
        primaryValue: formatCount(conversions),
        primaryMemo: "현재 필터 기준 핵심 전환 성과",
        efficiencyLabel: "CVR · CPA · CPC",
        efficiency: [
          { label: "CVR", value: formatPercentFromRate(cvr, 2) },
          { label: "CPA", value: KRW(cpa) },
          { label: "CPC", value: KRW(cpc) },
        ],
        supporting: [
          { label: "Clicks", value: formatCount(clicks) },
          { label: "CVR", value: formatPercentFromRate(cvr, 2) },
          { label: "CPA", value: KRW(cpa) },
          { label: "Cost", value: KRW(cost) },
        ],
      };
    }

    return {
      eyebrow: "COMMERCE PERFORMANCE",
      primaryLabel: "Revenue",
      primaryValue: KRW(revenue),
      primaryMemo: "현재 필터 기준 핵심 매출 성과",
      efficiencyLabel: "ROAS · CVR · CPA · CPC",
      efficiency: [
        { label: "ROAS", value: formatPercentFromRoas(roas, 1) },
        { label: "CVR", value: formatPercentFromRate(cvr, 2) },
        { label: "CPA", value: KRW(cpa) },
        { label: "CPC", value: KRW(cpc) },
      ],
      supporting: [
        { label: "ROAS", value: formatPercentFromRoas(roas, 1) },
        { label: "Conversions", value: formatCount(conversions) },
        { label: "CPA", value: KRW(cpa) },
        { label: "Cost", value: KRW(cost) },
      ],
    };
  }, [isDashboardSlideActive, reportType, stableTotals]);

  const [dashboardHeatmapPage, setDashboardHeatmapPage] = useState(0);

  const dashboardHeatmap = useMemo(() => {
    if (!isDashboardSlideActive) return null;

    const metricLabel =
      reportType === "traffic"
        ? "Clicks"
        : reportType === "db_acquisition"
          ? "Conversions"
          : "Revenue";

    const metricLabelKor =
      reportType === "traffic"
        ? "클릭수"
        : reportType === "db_acquisition"
          ? "전환수"
          : "매출";

    const metricValue = (row: DailyDisplayRow) =>
      reportType === "traffic"
        ? row.clicks
        : reportType === "db_acquisition"
          ? row.conversions
          : row.revenue;

    const formatValue = (value: number) =>
      reportType === "commerce" ? KRW(value) : formatCount(value);

    const palette = [
      "bg-[#F3E4D2]/35 border-[#CFC2B1]/45 text-[#7A8794]",
      "bg-[#B7D7E3]/18 border-[#B7D7E3]/35 text-[#5F87A3]",
      "bg-[#B7D7E3]/28 border-[#B7D7E3]/45 text-[#5F87A3]",
      "bg-[#B7D7E3]/42 border-[#B7D7E3]/60 text-[#27364A]",
      "bg-[#7FA6C4]/55 border-[#7FA6C4]/65 text-white",
      "bg-[#7FA6C4]/75 border-[#7FA6C4]/80 text-white",
      "bg-[#5F87A3] border-[#5F87A3] text-white",
    ] as const;

    const parseDate = (value: unknown) => {
      const raw = String(value ?? "").trim();
      const match = raw.match(
        /^(\d{4})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})/
      );

      if (!match) return null;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);

      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }

      date.setHours(0, 0, 0, 0);
      return date;
    };

    const toDateKey = (date: Date) =>
      [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

    const entries: Array<{
      row: DailyDisplayRow;
      date: Date;
      dateKey: string;
      value: number;
    }> = [];

    for (const row of sourceDerived.dailyDisplayRows) {
      const date = parseDate(row.key);

      if (!date) continue;

      entries.push({
        row,
        date,
        dateKey: toDateKey(date),
        value: Math.max(0, metricValue(row)),
      });
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    const positiveValues = entries
      .map((entry) => entry.value)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);

    const percentile = (ratio: number) => {
      if (!positiveValues.length) return 0;

      const index = Math.min(
        positiveValues.length - 1,
        Math.max(
          0,
          Math.round((positiveValues.length - 1) * ratio)
        )
      );

      return positiveValues[index];
    };

    const thresholds = {
      p10: percentile(0.1),
      p30: percentile(0.3),
      p50: percentile(0.5),
      p70: percentile(0.7),
      p85: percentile(0.85),
      hasValues: positiveValues.length > 0,
      singleValueOnly: positiveValues.length === 1,
    };

    const levelFor = (value: number) => {
      if (!thresholds.hasValues || value <= 0) return 0;
      if (thresholds.singleValueOnly) return 6;
      if (value <= thresholds.p10) return 1;
      if (value <= thresholds.p30) return 2;
      if (value <= thresholds.p50) return 3;
      if (value <= thresholds.p70) return 4;
      if (value <= thresholds.p85) return 5;
      return 6;
    };

    if (!entries.length) {
      return {
        metricLabel,
        metricLabelKor,
        palette,
        totalWeeks: 0,
        page: 0,
        maxPage: 0,
        canOlder: false,
        canNewer: false,
        rangeLabel: "-",
        weekLabels: [] as string[],
        gridRows: [] as Array<
          Array<{
            dateKey: string;
            level: number;
            title: string;
            outsideRange: boolean;
          }>
        >,
        navigatorLeft: 0,
        navigatorWidth: 100,
      };
    }

    const entryMap = new Map(
      entries.map((entry) => [entry.dateKey, entry] as const)
    );

    const firstDate = entries[0].date;
    const lastDate = entries[entries.length - 1].date;

    const calendarStart = new Date(firstDate);
    const firstMondayOffset = (calendarStart.getDay() + 6) % 7;
    calendarStart.setDate(
      calendarStart.getDate() - firstMondayOffset
    );

    const calendarEnd = new Date(lastDate);
    const lastMondayOffset = (calendarEnd.getDay() + 6) % 7;
    calendarEnd.setDate(
      calendarEnd.getDate() + (6 - lastMondayOffset)
    );

    const weeks: Date[][] = [];

    for (
      let weekStart = new Date(calendarStart);
      weekStart <= calendarEnd;
      weekStart.setDate(weekStart.getDate() + 7)
    ) {
      const week: Date[] = [];

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + dayIndex);
        week.push(date);
      }

      weeks.push(week);
    }

    const viewportWeeks = 8;
    const maxPage = Math.max(
      0,
      Math.ceil(weeks.length / viewportWeeks) - 1
    );
    const page = Math.min(dashboardHeatmapPage, maxPage);

    const endWeekIndex = Math.max(
      0,
      weeks.length - page * viewportWeeks
    );
    const startWeekIndex = Math.max(
      0,
      endWeekIndex - viewportWeeks
    );

    const visibleWeeks = weeks.slice(
      startWeekIndex,
      endWeekIndex
    );

    const weekLabels = visibleWeeks.map((week) => {
      const date = week[0];
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const gridRows = Array.from({ length: 7 }).map(
      (_, dayIndex) =>
        visibleWeeks.map((week) => {
          const date = week[dayIndex];
          const dateKey = toDateKey(date);
          const entry = entryMap.get(dateKey);
          const value = entry?.value ?? 0;
          const outsideRange =
            date.getTime() < firstDate.getTime() ||
            date.getTime() > lastDate.getTime();

          return {
            dateKey,
            level: levelFor(value),
            title: entry
              ? `${dateKey} · ${metricLabelKor} ${formatValue(value)}`
              : dateKey,
            outsideRange,
          };
        })
    );

    const visibleFirst =
      visibleWeeks[0]?.[0] ?? firstDate;
    const lastWeek =
      visibleWeeks[visibleWeeks.length - 1];
    const visibleLast =
      lastWeek?.[6] ?? lastDate;

    const shortDate = (date: Date) =>
      `${String(date.getMonth() + 1).padStart(2, "0")}.${String(
        date.getDate()
      ).padStart(2, "0")}`;

    const totalWeeks = weeks.length;
    const navigatorLeft =
      totalWeeks > 0
        ? (startWeekIndex / totalWeeks) * 100
        : 0;
    const navigatorWidth =
      totalWeeks > 0
        ? (visibleWeeks.length / totalWeeks) * 100
        : 100;

    return {
      metricLabel,
      metricLabelKor,
      palette,
      totalWeeks,
      page,
      maxPage,
      canOlder: startWeekIndex > 0,
      canNewer: endWeekIndex < totalWeeks,
      rangeLabel: `${shortDate(visibleFirst)} - ${shortDate(
        visibleLast
      )}`,
      weekLabels,
      gridRows,
      navigatorLeft,
      navigatorWidth,
    };
  }, [
    dashboardHeatmapPage,
    isDashboardSlideActive,
    reportType,
    sourceDerived.dailyDisplayRows,
  ]);

  const dashboardSource = useMemo(() => {
    if (!isDashboardSlideActive) return null;

    const rows = sourceDerived.sourceDisplayRows.slice(0, 3);

    if (reportType === "traffic") {
      return {
        metricLabel: "Clicks",
        maxValue: sourceDerived.srcMaxClicks,
        rows: rows.map((row) => ({
          row,
          value: row.clicks,
          valueText: formatCount(row.clicks),
        })),
      };
    }

    if (reportType === "db_acquisition") {
      return {
        metricLabel: "Conversions",
        maxValue: sourceDerived.srcMaxConv,
        rows: rows.map((row) => ({
          row,
          value: row.conversions,
          valueText: formatCount(row.conversions),
        })),
      };
    }

    return {
      metricLabel: "Revenue",
      maxValue: sourceDerived.srcMaxRev,
      rows: rows.map((row) => ({
        row,
        value: row.revenue,
        valueText: KRW(row.revenue),
      })),
    };
  }, [isDashboardSlideActive, reportType, sourceDerived]);

  return (
    <div
      className={[
        activeSlide == null ? "mt-6 space-y-12 lg:space-y-14" : "space-y-0",
      ].join(" ")}
    >
      {isDashboardSlideActive && dashboardHero ? (
        <section aria-label="Executive Performance Cockpit" className="space-y-4">
          <SectionIntro
            badge="PERFORMANCE COCKPIT"
            title="성과 한눈에 보기"
            description="핵심 성과를 중심에 두고 주차·Source·일자·효율 흐름을 한 화면에서 빠르게 확인합니다."
            compact
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(380px,1.28fr)_minmax(0,0.9fr)] xl:grid-rows-2">
            <div className="relative order-1 min-h-[420px] overflow-hidden rounded-[28px] border border-[var(--nature-border-blue)] bg-[linear-gradient(145deg,rgba(255,253,249,0.98)_0%,rgba(243,228,210,0.42)_45%,rgba(183,215,227,0.34)_100%)] p-6 shadow-[0_14px_34px_rgba(90,117,136,0.12)] sm:p-7 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:min-h-[520px]">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-[var(--nature-blue-light)]/35" />
              <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[var(--nature-blue-light)]/14" />
              <div className="pointer-events-none absolute -left-24 top-[32%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(243,228,210,0.38)_0%,rgba(243,228,210,0)_70%)]" />

              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex rounded-full border border-[var(--nature-border-blue)] bg-white/80 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-[#5F87A3]">
                    {dashboardHero.eyebrow}
                  </span>

                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Performance Core
                  </span>
                </div>

                <div className="relative mx-auto mt-8 flex h-[300px] w-full max-w-[520px] items-center justify-center">
                  <div className="pointer-events-none absolute h-[264px] w-[264px] rounded-full border border-[#B7D7E3]/45" />
                  <div className="pointer-events-none absolute h-[210px] w-[210px] rounded-full border border-[#7FA6C4]/28" />
                  <div className="pointer-events-none absolute h-[156px] w-[156px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.92)_0%,rgba(183,215,227,0.22)_52%,rgba(183,215,227,0)_76%)]" />

                  <svg
                    viewBox="0 0 500 250"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    aria-hidden="true"
                  >
                    <path
                      d="M72 54 C150 72 180 105 250 125"
                      fill="none"
                      stroke="#B7D7E3"
                      strokeWidth="1.5"
                      strokeDasharray="4 7"
                      opacity="0.75"
                    />
                    <path
                      d="M428 58 C348 72 320 104 250 125"
                      fill="none"
                      stroke="#7FA6C4"
                      strokeWidth="1.5"
                      strokeDasharray="4 7"
                      opacity="0.62"
                    />
                    <path
                      d="M95 202 C158 178 190 150 250 125"
                      fill="none"
                      stroke="#CFC2B1"
                      strokeWidth="1.5"
                      strokeDasharray="4 7"
                      opacity="0.64"
                    />
                    <path
                      d="M405 200 C342 178 308 150 250 125"
                      fill="none"
                      stroke="#B7D7E3"
                      strokeWidth="1.5"
                      strokeDasharray="4 7"
                      opacity="0.68"
                    />

                    <circle cx="72" cy="54" r="6" fill="#F3E4D2" stroke="#CFC2B1" />
                    <circle cx="428" cy="58" r="6" fill="#B7D7E3" stroke="#7FA6C4" />
                    <circle cx="95" cy="202" r="5" fill="#CFC2B1" />
                    <circle cx="405" cy="200" r="5" fill="#B7D7E3" />
                    <circle cx="250" cy="125" r="8" fill="#7FA6C4" />
                    <circle
                      cx="250"
                      cy="125"
                      r="15"
                      fill="none"
                      stroke="#7FA6C4"
                      strokeWidth="1"
                      opacity="0.34"
                    />
                  </svg>

                  <div className="relative z-10 max-w-[90%] text-center">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5F87A3]">
                      {dashboardHero.primaryLabel}
                    </div>

                    <div className="mt-2 whitespace-nowrap text-[clamp(44px,3.9vw,70px)] font-bold leading-none tracking-[-0.058em] text-slate-900">
                      {dashboardHero.primaryValue}
                    </div>

                    <div className="mx-auto mt-3 h-px w-16 bg-[linear-gradient(90deg,transparent,#7FA6C4,transparent)]" />

                    <p className="mt-3 text-[11px] font-medium text-slate-500">
                      {dashboardHero.primaryMemo}
                    </p>
                  </div>
                </div>

                <div className="mt-9">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(127,166,196,0.38))]" />
                    <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Performance Signals
                    </div>
                    <div className="h-px flex-1 bg-[linear-gradient(90deg,rgba(127,166,196,0.38),transparent)]" />
                  </div>

                  <div className="grid grid-cols-3">
                    {dashboardHero.supporting
                      .filter((item) => item.label !== "Cost")
                      .slice(0, 3)
                      .map((item, index) => {
                        const isRateMetric = ["CTR", "CVR", "ROAS"].includes(
                          item.label,
                        );
                        const isEfficiencyMetric = ["CPC", "CPA"].includes(
                          item.label,
                        );

                        const semanticLabel = isRateMetric
                          ? "Transformation"
                          : isEfficiencyMetric
                            ? "Efficiency Control"
                            : "Volume Flow";

                        return (
                          <div
                            key={item.label}
                            className={[
                              "relative min-w-0 px-2 text-center sm:px-3",
                              index > 0
                                ? "border-l border-[var(--nature-border-blue)]/45"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <div className="relative mx-auto flex h-[86px] w-[86px] items-center justify-center">
                              {isRateMetric ? (
                                <svg
                                  viewBox="0 0 86 86"
                                  className="h-full w-full"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M14 22 H72"
                                    stroke="#B7D7E3"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M21 35 H65"
                                    stroke="#B7D7E3"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    opacity="0.8"
                                  />
                                  <path
                                    d="M29 48 H57"
                                    stroke="#7FA6C4"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    opacity="0.82"
                                  />
                                  <path
                                    d="M38 61 H48"
                                    stroke="#5F87A3"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="43" cy="70" r="4" fill="#5F87A3" />
                                </svg>
                              ) : isEfficiencyMetric ? (
                                <svg
                                  viewBox="0 0 86 86"
                                  className="h-full w-full"
                                  aria-hidden="true"
                                >
                                  <circle
                                    cx="43"
                                    cy="43"
                                    r="31"
                                    fill="none"
                                    stroke="#B7D7E3"
                                    strokeWidth="5"
                                    opacity="0.72"
                                  />
                                  <circle
                                    cx="43"
                                    cy="43"
                                    r="20"
                                    fill="none"
                                    stroke="#7FA6C4"
                                    strokeWidth="3"
                                    opacity="0.78"
                                  />
                                  <path
                                    d="M43 12 V22 M43 64 V74 M12 43 H22 M64 43 H74"
                                    stroke="#CFC2B1"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="43" cy="43" r="7" fill="#5F87A3" />
                                </svg>
                              ) : (
                                <svg
                                  viewBox="0 0 86 86"
                                  className="h-full w-full"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M11 22 C30 22 32 39 47 43 C58 46 65 55 75 64"
                                    fill="none"
                                    stroke="#B7D7E3"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M11 43 C30 43 34 43 47 43 C61 43 67 43 76 43"
                                    fill="none"
                                    stroke="#7FA6C4"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M11 64 C29 64 32 49 47 43 C59 38 66 30 75 22"
                                    fill="none"
                                    stroke="#CFC2B1"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="11" cy="22" r="4" fill="#F3E4D2" />
                                  <circle cx="11" cy="43" r="4" fill="#B7D7E3" />
                                  <circle cx="11" cy="64" r="4" fill="#CFC2B1" />
                                  <circle cx="47" cy="43" r="6" fill="#7FA6C4" />
                                  <circle cx="76" cy="43" r="4" fill="#5F87A3" />
                                </svg>
                              )}
                            </div>

                            <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.13em] text-slate-400">
                              {semanticLabel}
                            </div>

                            <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5F87A3]">
                              {item.label}
                            </div>

                            <div className="mt-1 truncate text-[18px] font-bold tabular-nums tracking-[-0.03em] text-slate-800">
                              {item.value}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div
                  data-cost-horizon="shell"
                  className="relative mb-12 mt-16 overflow-hidden pt-10 text-center"
                >
                  <div
                    data-cost-horizon="light"
                    data-light-horizon="ambient"
                    className="pointer-events-none absolute"
                  />
                  <div
                    data-cost-horizon="light"
                    data-light-horizon="orbit"
                    className="pointer-events-none absolute"
                  />
                  <div
                    data-cost-horizon="light"
                    data-light-horizon="beam"
                    className="pointer-events-none absolute"
                  />

                  <div data-cost-horizon="studio" aria-hidden="true">
                    <span data-cost-horizon="arc-primary" />
                    <span data-cost-horizon="arc-secondary" />
                    <span data-cost-horizon="beam" />
                    <span data-cost-horizon="glow" />
                    <span data-cost-horizon="ray" data-ray="-2" />
                    <span data-cost-horizon="ray" data-ray="-1" />
                    <span data-cost-horizon="ray" data-ray="0" />
                    <span data-cost-horizon="ray" data-ray="1" />
                    <span data-cost-horizon="ray" data-ray="2" />
                  </div>

                  <div className="relative z-10 pb-2">
                    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5F87A3]">
                      Investment Horizon
                    </div>

                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400">
                      Total Media Cost
                    </div>

                    <div className="mt-2 truncate text-[clamp(28px,2.6vw,46px)] font-bold tabular-nums leading-none tracking-[-0.045em] text-slate-900">
                      {dashboardHero.supporting.find(
                        (item) => item.label === "Cost",
                      )?.value ?? "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div data-studio-chart="weekly" className="order-2 min-h-[220px] overflow-hidden rounded-[24px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] p-4 shadow-[0_7px_20px_rgba(127,166,196,0.08)] sm:p-5 xl:col-start-1 xl:row-start-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#5F87A3]">
                    WEEKLY PERFORMANCE
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-slate-900">
                    주차별 성과 흐름
                  </div>
                </div>

                <div className="shrink-0 rounded-full bg-[var(--nature-blue-light)]/20 px-3 py-1.5 text-[10px] font-semibold text-[#5F87A3]">
                  {stableWeekChartData.length}개 구간
                </div>
              </div>

              {stableWeekChartData.length > 0 ? (
                <div className="mt-2 min-w-0">
                  <SummaryChart
                    reportType={reportType}
                    data={stableWeekChartData}
                    density="export-wide"
                    hideInsights
                    lineColor={
                      reportType === "db_acquisition"
                        ? DAILY_CHART_LINE_COLOR
                        : undefined
                    }
                    transparentChartSurface
                    className="!overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none [&>div:first-child]:!px-0 [&>div:first-child]:!pt-1 [&>div:first-child>div]:!rounded-none [&>div:first-child>div]:!border-0 [&>div:first-child>div]:!bg-transparent [&>div:first-child>div]:!px-0 [&>div:first-child>div]:!py-1 [&>div:first-child>div]:!shadow-none [&>div:first-child_.inline-flex]:!h-6 [&>div:first-child_.inline-flex]:!gap-1.5 [&>div:first-child_.inline-flex]:!px-2.5 [&>div:first-child_.inline-flex]:!text-[9px] [&>div:first-child_.inline-flex>span:first-child]:!h-[9px] [&>div:first-child_.inline-flex>span:first-child]:!w-[9px] [&>div:last-child]:!h-[380px] [&>div:last-child]:!px-0 [&>div:last-child]:!pb-0 [&>div:last-child]:!pt-1 [&>div:last-child>div]:!rounded-none [&>div:last-child>div]:!border-0 [&>div:last-child>div]:!bg-transparent [&>div:last-child>div]:!px-0 [&>div:last-child>div]:!py-0"
                  />
                </div>
              ) : (
                <div className="mt-4 flex h-[380px] items-center justify-center text-xs font-medium text-slate-400">
                  표시할 주차별 데이터가 없습니다.
                </div>
              )}
            </div>

            <div className="order-5 flex min-h-[220px] flex-col rounded-[24px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] p-5 shadow-[0_7px_20px_rgba(127,166,196,0.08)] xl:col-start-3 xl:row-start-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#5F87A3]">
                    PERFORMANCE HEATMAP
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-slate-900">
                    일자 성과 강도
                  </div>
                </div>

                {dashboardHeatmap ? (
                  <div className="shrink-0 rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/14 px-2.5 py-1 text-[10px] font-semibold text-[#5F87A3]">
                    {dashboardHeatmap.metricLabel}
                  </div>
                ) : null}
              </div>

              {dashboardHeatmap && dashboardHeatmap.totalWeeks > 0 ? (
                <div className="mt-4 flex flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDashboardHeatmapPage(
                          Math.min(
                            dashboardHeatmap.maxPage,
                            dashboardHeatmap.page + 1
                          )
                        )
                      }
                      disabled={!dashboardHeatmap.canOlder}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white text-xs font-bold text-slate-600 transition hover:bg-[var(--nature-blue-light)]/18 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="이전 8주 보기"
                    >
                      ‹
                    </button>

                    <div className="text-center">
                      <div className="text-[11px] font-bold tabular-nums text-slate-700">
                        {dashboardHeatmap.rangeLabel}
                      </div>
                      <div className="mt-0.5 text-[9px] font-semibold text-slate-400">
                        최대 8주 · 전체 {dashboardHeatmap.totalWeeks}주
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setDashboardHeatmapPage(
                          Math.max(
                            0,
                            dashboardHeatmap.page - 1
                          )
                        )
                      }
                      disabled={!dashboardHeatmap.canNewer}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--nature-border-blue)] bg-white text-xs font-bold text-slate-600 transition hover:bg-[var(--nature-blue-light)]/18 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="다음 8주 보기"
                    >
                      ›
                    </button>
                  </div>

                  <div
                    className="mt-4 grid gap-1.5"
                    style={{
                      gridTemplateColumns: `28px repeat(${dashboardHeatmap.weekLabels.length}, minmax(0, 1fr))`,
                    }}
                  >
                    <div />
                    {dashboardHeatmap.weekLabels.map(
                      (label, weekIndex) => (
                        <div
                          key={`heat-week-${weekIndex}`}
                          className="truncate text-center text-[8px] font-semibold tabular-nums text-slate-400"
                        >
                          {label}
                        </div>
                      )
                    )}

                    {dashboardHeatmap.gridRows.map(
                      (row, dayIndex) => (
                        <Fragment key={`heat-row-${dayIndex}`}>
                          <div
                            key={`heat-day-${dayIndex}`}
                            className="flex h-7 items-center text-[9px] font-semibold text-slate-400"
                          >
                            {
                              ["월", "화", "수", "목", "금", "토", "일"][
                                dayIndex
                              ]
                            }
                          </div>

                          {row.map((cell) => (
                            <div
                              key={cell.dateKey}
                              title={cell.title}
                              className={[
                                "h-7 rounded-[7px] border transition-transform hover:scale-[1.06]",
                                dashboardHeatmap.palette[cell.level],
                                cell.outsideRange ? "opacity-30" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            />
                          ))}
                        </Fragment>
                      )
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[9px] font-semibold text-slate-400">
                        전체 기간 위치
                      </div>
                      <div className="text-[9px] font-semibold text-slate-400">
                        Hover 시 일자별 값 확인
                      </div>
                    </div>

                    <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="absolute inset-y-0 rounded-full bg-[var(--nature-blue)]"
                        style={{
                          left: `${dashboardHeatmap.navigatorLeft}%`,
                          width: `${dashboardHeatmap.navigatorWidth}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-1">
                    <span className="mr-1 text-[9px] font-semibold text-slate-400">
                      낮음
                    </span>
                    {dashboardHeatmap.palette.map(
                      (heatClass, index) => (
                        <span
                          key={`heat-legend-${index}`}
                          className={[
                            "h-2.5 w-4 rounded-[4px] border",
                            heatClass,
                          ].join(" ")}
                        />
                      )
                    )}
                    <span className="ml-1 text-[9px] font-semibold text-slate-400">
                      높음
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center py-10 text-xs font-medium text-slate-400">
                  표시할 일자별 데이터가 없습니다.
                </div>
              )}
            </div>

            <div data-studio-chart="daily" className="order-4 min-h-[220px] overflow-hidden rounded-[24px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] p-4 shadow-[0_7px_20px_rgba(127,166,196,0.08)] sm:p-5 xl:col-start-3 xl:row-start-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#5F87A3]">
                    DAILY MOVEMENT
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-slate-900">
                    일자별 움직임
                  </div>
                </div>

                <div className="shrink-0 rounded-full bg-[var(--nature-blue-light)]/20 px-3 py-1.5 text-[10px] font-semibold text-[#5F87A3]">
                  {sourceDerived.dailyDisplayRows.length}개 일자
                </div>
              </div>

              {sourceDerived.dailyDisplayRows.length > 0 ? (
                <div className="mt-2 min-w-0">
                  <DailyDualPerformanceCharts
                    reportType={reportType}
                    rows={sourceDerived.dailyDisplayRows}
                    dashboardOnly
                  />
                </div>
              ) : (
                <div className="mt-4 flex h-[380px] items-center justify-center text-xs font-medium text-slate-400">
                  표시할 일자별 데이터가 없습니다.
                </div>
              )}
            </div>

            <div className="order-3 flex min-h-[220px] flex-col rounded-[24px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] p-5 shadow-[0_7px_20px_rgba(127,166,196,0.08)] xl:col-start-1 xl:row-start-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#5F87A3]">
                    SOURCE LADDER
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-slate-900">
                    Source별 성과
                  </div>
                </div>

                <div className="shrink-0 rounded-full bg-[var(--nature-cream)]/70 px-3 py-1.5 text-[10px] font-semibold text-slate-600">
                  {sources.length}개 Source
                </div>
              </div>

              {dashboardSource && dashboardSource.rows.length > 0 ? (
                dashboardSource.rows.length === 1 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-4">
                    <div className="flex h-52 w-52 shrink-0 items-center justify-center rounded-full border-[16px] border-[var(--nature-blue-light)]/45 bg-white/80 shadow-[0_12px_30px_rgba(90,117,136,0.11)]">
                      <div className="px-3 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5F87A3]">
                          {dashboardSource.metricLabel}
                        </div>

                        <div className="mt-2.5 text-[42px] font-bold leading-none tabular-nums tracking-[-0.055em] text-slate-900">
                          {dashboardSource.rows[0].valueText}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex min-w-0 max-w-full justify-center">
                      <SourceBrand
                        source={dashboardSource.rows[0].row.source}
                        className="min-w-0"
                        logoClassName="!h-5 !w-5"
                        textClassName="text-[14px] font-bold text-slate-800"
                      />
                    </div>

                    <div className="mt-2 text-[10px] font-semibold text-slate-400">
                      현재 필터 기준 단일 Source
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-1 flex-col justify-center gap-5">
                    {dashboardSource.rows.map((item, index) => {
                      const width =
                        dashboardSource.maxValue > 0
                          ? Math.max(
                              8,
                              Math.min(
                                100,
                                (item.value / dashboardSource.maxValue) * 100,
                              ),
                            )
                          : 0;

                      const barClass =
                        [
                          "bg-[#7FA6C4]",
                          "bg-[#B7D7E3]",
                          "bg-[#CFC2B1]",
                        ][index] ?? "bg-[#B7D7E3]";

                      return (
                        <div key={item.row.key} className="min-w-0">
                          <div className="flex min-w-0 items-center justify-between gap-4">
                            <SourceBrand
                              source={item.row.source}
                              className="min-w-0"
                              logoClassName="!h-4 !w-4"
                              textClassName="truncate text-[12px] font-bold text-slate-700"
                            />

                            <div className="shrink-0 text-[16px] font-bold tabular-nums tracking-[-0.025em] text-slate-800">
                              {item.valueText}
                            </div>
                          </div>

                          <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-[var(--nature-blue-light)]/16">
                            <div
                              className={[
                                "h-full rounded-full",
                                barClass,
                              ].join(" ")}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {sources.length > dashboardSource.rows.length ? (
                      <div className="text-right text-[10px] font-semibold text-slate-400">
                        외 {sources.length - dashboardSource.rows.length}개 Source
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                <div className="flex flex-1 items-center justify-center py-10 text-xs font-medium text-slate-400">
                  표시할 Source 데이터가 없습니다.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {shouldRenderGoalSlide ? (
        <div
          className={isGoalSlideActive ? "block" : "hidden"}
          aria-hidden={!isGoalSlideActive}
        >
          <SectionIntro
            badge="KPI"
            title={copy.kpiTitle}
            description={copy.kpiDescription}
            compact
          />

          <div className="rounded-[22px] border border-[var(--nature-border-blue)] bg-[var(--nature-surface)] p-2.5 shadow-[0_4px_14px_rgba(127,166,196,0.07)] sm:p-3">
            <SummaryKPI reportType={reportType} totals={stableTotals} />
          </div>
        </div>
      ) : null}

      {shouldRenderTrendSlide ? (
        <section
          className={
            isTrendSlideActive
              ? activeSlide == null
                ? "space-y-12 lg:space-y-14"
                : "space-y-8 lg:space-y-10"
              : "hidden"
          }
          aria-hidden={!isTrendSlideActive}
        >
          <div>
            <SectionIntro
              badge="SUMMARY TABLE"
              title={copy.monthTitle}
              description={copy.monthDescription}
              compact
            />
            <SummaryTable reportType={reportType} byMonth={stableMonths} />
          </div>

          <div>
            <SectionIntro
              badge="WEEKLY"
              title={copy.weeklyTitle}
              description={copy.weeklyDescription}
              compact
            />

            <div className="space-y-4">
              <WeeklyPerformanceTable
                mode={mode}
                rows={trendDerived.weeklyDisplayRows}
                prevRow={trendDerived.prevWeekSorted}
                lastRow={trendDerived.lastWeekSorted}
                maxImpr={trendDerived.maxImpr}
                maxClicks={trendDerived.maxClicks}
                maxCost={trendDerived.maxCost}
                maxConv={trendDerived.maxConv}
                maxRev={trendDerived.maxRev}
              />

              <div data-summary-weekly-trend-chart="true" className={CHART_SURFACE_CLASS}>
                <SummaryChart reportType={reportType} data={stableWeekChartData} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {shouldRenderSourceSlide ? (
        <section
          className={
            isSourceSlideActive
              ? activeSlide == null
                ? "space-y-12 lg:space-y-14"
                : "space-y-8 lg:space-y-10"
              : "hidden"
          }
          aria-hidden={!isSourceSlideActive}
        >
          <div>
            <SectionIntro
              badge="SOURCE"
              title={copy.sourceTitle}
              description={copy.sourceDescription}
              compact
            />

            <SourcePerformanceTable
              mode={mode}
              rows={sourceDerived.sourceDisplayRows}
              maxImpr={sourceDerived.srcMaxImpr}
              maxClicks={sourceDerived.srcMaxClicks}
              maxCost={sourceDerived.srcMaxCost}
              maxConv={sourceDerived.srcMaxConv}
              maxRev={sourceDerived.srcMaxRev}
            />
          </div>

          <div data-summary-daily-performance="true">
            <SectionIntro
              badge="DAILY"
              title={copy.dailyTitle}
              description={copy.dailyDescription}
              compact
            />

            {sourceDerived.dailyDisplayRows.length > 0 ? (
              <DailyDualPerformanceCharts
                reportType={reportType}
                rows={sourceDerived.dailyDisplayRows}
              />
            ) : null}

            <DailyPerformanceTable
              mode={mode}
              constrainToTenRows={activeSlide != null}
              rows={sourceDerived.dailyDisplayRows}
              maxImpr={sourceDerived.dayMaxImpr}
              maxClicks={sourceDerived.dayMaxClicks}
              maxCost={sourceDerived.dayMaxCost}
              maxConv={sourceDerived.dayMaxConv}
              maxRev={sourceDerived.dayMaxRev}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function areSummarySectionPropsEqual(prev: Props, next: Props) {
  return (
    prev.reportType === next.reportType &&
    prev.totals === next.totals &&
    prev.byMonth === next.byMonth &&
    prev.byWeekOnly === next.byWeekOnly &&
    prev.byWeekChart === next.byWeekChart &&
    prev.bySource === next.bySource &&
    prev.byDay === next.byDay &&
    prev.currentMonthKey === next.currentMonthKey &&
    prev.currentMonthActual === next.currentMonthActual &&
    prev.currentMonthGoalComputed === next.currentMonthGoalComputed &&
    prev.monthGoal === next.monthGoal &&
    prev.monthGoalInsight === next.monthGoalInsight &&
    prev.activeSlide === next.activeSlide
  );
}

export default memo(SummarySectionComponent, areSummarySectionPropsEqual);

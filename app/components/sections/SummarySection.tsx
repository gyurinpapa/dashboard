"use client";

import {
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
  activeSlide?: 0 | 1 | 2;
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
}: {
  reportType?: ReportType;
  rows: readonly DailyDisplayRow[];
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
}: {
  mode: MetricMode;
  rows: readonly DailyDisplayRow[];
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
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

  const updateFromWindowScroll = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;

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
  }, [rows.length, updateVisibleRange, wrapperRef]);

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
    <div ref={wrapperRef} className={DAILY_TABLE_SURFACE_CLASS}>
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
  const isGoalSlideActive = showAllSections || activeSlide === 0;
  const isTrendSlideActive = showAllSections || activeSlide === 1;
  const isSourceSlideActive = showAllSections || activeSlide === 2;

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
    if (!shouldRenderSourceSlide) {
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

    const sortedDays = [...days].sort((a, b) =>
      daySortKey(a).localeCompare(daySortKey(b))
    );
    const sourceDisplayRows = buildSourceDisplayRows(sources);
    const dailyDisplayRows = buildDailyDisplayRows(sortedDays);

    return {
      sourceDisplayRows,
      dailyDisplayRows,
      srcMaxImpr: getMaxValue(sourceDisplayRows, (r) => r.impressions),
      srcMaxClicks: getMaxValue(sourceDisplayRows, (r) => r.clicks),
      srcMaxCost: getMaxValue(sourceDisplayRows, (r) => r.cost),
      srcMaxConv: getMaxValue(sourceDisplayRows, (r) => r.conversions),
      srcMaxRev: getMaxValue(sourceDisplayRows, (r) => r.revenue),
      dayMaxImpr: getMaxValue(dailyDisplayRows, (r) => r.impressions),
      dayMaxClicks: getMaxValue(dailyDisplayRows, (r) => r.clicks),
      dayMaxCost: getMaxValue(dailyDisplayRows, (r) => r.cost),
      dayMaxConv: getMaxValue(dailyDisplayRows, (r) => r.conversions),
      dayMaxRev: getMaxValue(dailyDisplayRows, (r) => r.revenue),
    };
  }, [days, sources, shouldRenderSourceSlide]);

  return (
    <div
      className={[
        activeSlide == null ? "mt-6 space-y-12 lg:space-y-14" : "space-y-0",
      ].join(" ")}
    >
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

              <div className={CHART_SURFACE_CLASS}>
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

          <div>
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
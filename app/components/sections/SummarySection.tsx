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
  diffRatio,
} from "../../../src/lib/report/format";

import SummaryChart from "./summary/SummaryChart";
import SummaryKPI from "./summary/SummaryKPI";
import SummaryTable from "./summary/SummaryTable";
import TrendCell from "../ui/TrendCell";
import DataBarCell from "../ui/DataBarCell";

type Props = {
  reportType?: ReportType;

  totals: any;
  byMonth: any;

  byWeekOnly: any;
  byWeekChart: any;

  bySource: any;
  byDay?: any;
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
  "overflow-x-auto rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_1px_3px_rgba(15,23,42,0.03)] ring-1 ring-white/60";

const SOURCE_TABLE_SURFACE_CLASS =
  "overflow-auto rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_1px_3px_rgba(15,23,42,0.03)] ring-1 ring-white/60 max-h-[720px]";

const DAILY_TABLE_SURFACE_CLASS =
  "overflow-x-auto rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_1px_3px_rgba(15,23,42,0.03)] ring-1 ring-white/60";

const TABLE_HEAD_CLASS =
  "sticky top-0 z-10 border-b border-slate-200/90 bg-slate-50/95";

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
      <div className="inline-flex w-fit items-center rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-slate-500 shadow-sm">
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
      cpcText: KRW(cpc),
      cost,
      costText: KRW(cost),
      conversions,
      cvrText: formatPercentFromRate(d?.cvr, 2),
      cpaText: KRW(cpa),
      revenue,
      revenueText: KRW(revenue),
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

const WeeklyTableHead = memo(function WeeklyTableHead({
  mode,
}: {
  mode: MetricMode;
}) {
  return (
    <thead className={TABLE_HEAD_CLASS}>
      <tr>
        <th className={FIRST_TH_CLASS}>Week</th>
        <th className={TH_CLASS}>Impr</th>
        <th className={TH_CLASS}>Clicks</th>
        <th className={TH_CLASS}>CTR</th>
        <th className={TH_CLASS}>CPC</th>
        <th className={TH_CLASS}>Cost</th>
        {mode.showConversions && <th className={TH_CLASS}>Conv</th>}
        {mode.showCvr && <th className={TH_CLASS}>CVR</th>}
        {mode.showCpa && <th className={TH_CLASS}>CPA</th>}
        {mode.showRevenue && <th className={TH_CLASS}>Revenue</th>}
        {mode.showRoas && <th className={TH_CLASS}>ROAS</th>}
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
    <thead className={TABLE_HEAD_CLASS}>
      <tr>
        <th className={FIRST_TH_CLASS}>Source</th>
        <th className={TH_CLASS}>Impr</th>
        <th className={TH_CLASS}>Clicks</th>
        <th className={TH_CLASS}>CTR</th>
        <th className={TH_CLASS}>CPC</th>
        <th className={TH_CLASS}>Cost</th>
        {mode.showConversions && <th className={TH_CLASS}>Conv</th>}
        {mode.showCvr && <th className={TH_CLASS}>CVR</th>}
        {mode.showCpa && <th className={TH_CLASS}>CPA</th>}
        {mode.showRevenue && <th className={TH_CLASS}>Revenue</th>}
        {mode.showRoas && <th className={TH_CLASS}>ROAS</th>}
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
    <thead className={TABLE_HEAD_CLASS}>
      <tr>
        <th className={FIRST_TH_CLASS}>Date</th>
        <th className={TH_CLASS}>Impr</th>
        <th className={TH_CLASS}>Clicks</th>
        <th className={TH_CLASS}>CTR</th>
        <th className={TH_CLASS}>CPC</th>
        <th className={TH_CLASS}>Cost</th>
        {mode.showConversions && <th className={TH_CLASS}>Conv</th>}
        {mode.showCvr && <th className={TH_CLASS}>CVR</th>}
        {mode.showCpa && <th className={TH_CLASS}>CPA</th>}
        {mode.showRevenue && <th className={TH_CLASS}>Revenue</th>}
        {mode.showRoas && <th className={TH_CLASS}>ROAS</th>}
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
    <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.9),rgba(248,250,252,0.96))] font-medium text-slate-800">
      <td className={`${FIRST_TD_CLASS} truncate`}>증감(최근주-전주)</td>

      <td className={TD_CLASS}>
        <TrendCell
          v={
            diffRatio(
              lastRow?.impressions ?? 0,
              prevRow?.impressions ?? 0
            ) ?? 0
          }
        />
      </td>

      <td className={TD_CLASS}>
        <TrendCell
          v={diffRatio(lastRow?.clicks ?? 0, prevRow?.clicks ?? 0) ?? 0}
        />
      </td>

      <td className={TD_CLASS}>
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

      <td className={TD_CLASS}>
        <TrendCell
          v={diffRatio(lastRow?.cpc ?? 0, prevRow?.cpc ?? 0) ?? 0}
          digits={2}
        />
      </td>

      <td className={TD_CLASS}>
        <TrendCell v={diffRatio(lastRow?.cost ?? 0, prevRow?.cost ?? 0) ?? 0} />
      </td>

      {mode.showConversions && (
        <td className={TD_CLASS}>
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
        <td className={TD_CLASS}>
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
        <td className={TD_CLASS}>
          <TrendCell
            v={diffRatio(lastRow?.cpa ?? 0, prevRow?.cpa ?? 0) ?? 0}
            digits={2}
          />
        </td>
      )}

      {mode.showRevenue && (
        <td className={TD_CLASS}>
          <TrendCell
            v={diffRatio(lastRow?.revenue ?? 0, prevRow?.revenue ?? 0) ?? 0}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={TD_CLASS}>
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
    <tr className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-sky-50/55 transition-colors">
      <td className={`${FIRST_TD_CLASS} truncate`} title={row.title}>
        {row.label}
      </td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.impressions} max={maxImpr} />
      </td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.clicks} max={maxClicks} />
      </td>

      <td className={`${TD_CLASS} font-medium text-violet-600`}>
        {row.ctrText}
      </td>

      <td className={TD_CLASS}>{row.cpcText}</td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.cost} max={maxCost} label={row.costText} />
      </td>

      {mode.showConversions && (
        <td className={TD_CLASS}>
          <DataBarCell value={row.conversions} max={maxConv} />
        </td>
      )}

      {mode.showCvr && (
        <td className={`${TD_CLASS} font-medium text-violet-600`}>
          {row.cvrText}
        </td>
      )}

      {mode.showCpa && <td className={TD_CLASS}>{row.cpaText}</td>}

      {mode.showRevenue && (
        <td className={TD_CLASS}>
          <DataBarCell
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
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
    <tr className="border-t border-slate-200/90">
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
      className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-emerald-50/45 transition-colors"
      style={{ height: `${SOURCE_ROW_HEIGHT}px` }}
    >
      <td className={`${FIRST_TD_CLASS} truncate`} title={row.title}>
        {row.source}
      </td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.impressions} max={maxImpr} />
      </td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.clicks} max={maxClicks} />
      </td>

      <td className={`${TD_CLASS} font-medium text-violet-600`}>
        {row.ctrText}
      </td>

      <td className={TD_CLASS}>{row.cpcText}</td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.cost} max={maxCost} label={row.costText} />
      </td>

      {mode.showConversions && (
        <td className={TD_CLASS}>
          <DataBarCell value={row.conversions} max={maxConv} />
        </td>
      )}

      {mode.showCvr && (
        <td className={`${TD_CLASS} font-medium text-violet-600`}>
          {row.cvrText}
        </td>
      )}

      {mode.showCpa && <td className={TD_CLASS}>{row.cpaText}</td>}

      {mode.showRevenue && (
        <td className={TD_CLASS}>
          <DataBarCell
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
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

const DailyEmptyRow = memo(function DailyEmptyRow({
  colSpan,
}: {
  colSpan: number;
}) {
  return (
    <tr className="border-t border-slate-200/90">
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
      className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-amber-50/45 transition-colors"
      style={{ height: `${DAILY_ROW_HEIGHT}px` }}
    >
      <td className={`${FIRST_TD_CLASS} truncate`} title={row.title}>
        {row.label}
      </td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.impressions} max={maxImpr} />
      </td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.clicks} max={maxClicks} />
      </td>

      <td className={`${TD_CLASS} font-medium text-violet-600`}>
        {row.ctrText}
      </td>

      <td className={TD_CLASS}>{row.cpcText}</td>

      <td className={TD_CLASS}>
        <DataBarCell value={row.cost} max={maxCost} label={row.costText} />
      </td>

      {mode.showConversions && (
        <td className={TD_CLASS}>
          <DataBarCell value={row.conversions} max={maxConv} />
        </td>
      )}

      {mode.showCvr && (
        <td className={`${TD_CLASS} font-medium text-violet-600`}>
          {row.cvrText}
        </td>
      )}

      {mode.showCpa && <td className={TD_CLASS}>{row.cpaText}</td>}

      {mode.showRevenue && (
        <td className={TD_CLASS}>
          <DataBarCell
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {mode.showRoas && (
        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
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

  const derived = useMemo(() => {
    const sortedWeeks = [...weeks].sort((a, b) =>
      weekSortKey(a).localeCompare(weekSortKey(b))
    );

    const sortedDays = [...days].sort((a, b) =>
      daySortKey(a).localeCompare(daySortKey(b))
    );

    const weeklyDisplayRows = buildWeeklyDisplayRows(sortedWeeks);
    const sourceDisplayRows = buildSourceDisplayRows(sources);
    const dailyDisplayRows = buildDailyDisplayRows(sortedDays);

    return {
      sortedWeeks,
      prevWeekSorted: sortedWeeks.at(-2),
      lastWeekSorted: sortedWeeks.at(-1),

      weeklyDisplayRows,
      sourceDisplayRows,
      dailyDisplayRows,

      maxImpr: getMaxValue(
        weeklyDisplayRows,
        (r) => r.impressions
      ),
      maxClicks: getMaxValue(weeklyDisplayRows, (r) => r.clicks),
      maxCost: getMaxValue(weeklyDisplayRows, (r) => r.cost),
      maxConv: getMaxValue(weeklyDisplayRows, (r) => r.conversions),
      maxRev: getMaxValue(weeklyDisplayRows, (r) => r.revenue),

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
  }, [weeks, days, sources]);

  return (
    <div className="mt-6 space-y-12 lg:space-y-14">
      <div>
        <SectionIntro
          badge="📊 KPI"
          title={copy.kpiTitle}
          description={copy.kpiDescription}
          compact
        />

        <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.72))] p-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.035)] sm:p-3">
          <SummaryKPI reportType={reportType} totals={stableTotals} />
        </div>
      </div>

      <div>
        <SectionIntro
          badge="📋 SUMMARY TABLE"
          title={copy.monthTitle}
          description={copy.monthDescription}
          compact
        />
        <SummaryTable reportType={reportType} byMonth={stableMonths} />
      </div>

      <section className="space-y-12 lg:space-y-14">
        <div>
          <SectionIntro
            badge="📅 WEEKLY"
            title={copy.weeklyTitle}
            description={copy.weeklyDescription}
            compact
          />

          <WeeklyPerformanceTable
            mode={mode}
            rows={derived.weeklyDisplayRows}
            prevRow={derived.prevWeekSorted}
            lastRow={derived.lastWeekSorted}
            maxImpr={derived.maxImpr}
            maxClicks={derived.maxClicks}
            maxCost={derived.maxCost}
            maxConv={derived.maxConv}
            maxRev={derived.maxRev}
          />
        </div>

        <div>
          <SectionIntro
            badge="📈 CHART"
            title={copy.chartTitle}
            description={copy.chartDescription}
            compact
          />

          <div className={CHART_SURFACE_CLASS}>
            <SummaryChart reportType={reportType} data={stableWeekChartData} />
          </div>
        </div>

        <div>
          <SectionIntro
            badge="🧭 SOURCE"
            title={copy.sourceTitle}
            description={copy.sourceDescription}
            compact
          />

          <SourcePerformanceTable
            mode={mode}
            rows={derived.sourceDisplayRows}
            maxImpr={derived.srcMaxImpr}
            maxClicks={derived.srcMaxClicks}
            maxCost={derived.srcMaxCost}
            maxConv={derived.srcMaxConv}
            maxRev={derived.srcMaxRev}
          />
        </div>

        <div>
          <SectionIntro
            badge="🗓️ DAILY"
            title={copy.dailyTitle}
            description={copy.dailyDescription}
            compact
          />

          <DailyPerformanceTable
            mode={mode}
            rows={derived.dailyDisplayRows}
            maxImpr={derived.dayMaxImpr}
            maxClicks={derived.dayMaxClicks}
            maxCost={derived.dayMaxCost}
            maxConv={derived.dayMaxConv}
            maxRev={derived.dayMaxRev}
          />
        </div>
      </section>
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
    prev.byDay === next.byDay
  );
}

export default memo(SummarySectionComponent, areSummarySectionPropsEqual);
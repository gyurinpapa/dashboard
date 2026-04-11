"use client";

import { memo, useMemo } from "react";
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
  reportType?: "commerce" | "traffic";

  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: any;

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
  "overflow-x-auto rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/60";

const TABLE_HEAD_CLASS =
  "sticky top-0 z-10 border-b border-slate-200/90 bg-[rgba(248,250,252,0.9)] backdrop-blur supports-[backdrop-filter]:bg-[rgba(248,250,252,0.82)]";

const EMPTY_STATE_CLASS =
  "px-4 py-10 text-center text-sm font-medium text-slate-500";

const CHART_SURFACE_CLASS = "mt-0";

const TRAFFIC_TABLE_CLASS = "w-full table-fixed text-sm min-w-[860px]";
const COMMERCE_TABLE_CLASS = "w-full table-fixed text-sm min-w-[1320px]";

const EMPTY_LIST: readonly any[] = Object.freeze([]);

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
  return String(row?.date ?? row?.dateKey ?? row?.label ?? "");
}

function dayLabel(row: any) {
  return String(row?.date ?? row?.dateKey ?? row?.label ?? "-");
}

function getMaxValue<T>(rows: readonly T[], getter: (row: T) => number) {
  let max = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const v = getter(rows[i]);
    if (v > max) max = v;
  }
  return max;
}

const MetricColGroup = memo(function MetricColGroup({
  isTraffic,
}: {
  isTraffic: boolean;
}) {
  return (
    <colgroup>
      <col className="w-[180px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[110px]" />
      {!isTraffic && <col className="w-[90px]" />}
      {!isTraffic && <col className="w-[90px]" />}
      {!isTraffic && <col className="w-[90px]" />}
      {!isTraffic && <col className="w-[120px]" />}
      {!isTraffic && <col className="w-[90px]" />}
    </colgroup>
  );
});

const WeeklyTableHead = memo(function WeeklyTableHead({
  isTraffic,
}: {
  isTraffic: boolean;
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
        {!isTraffic && <th className={TH_CLASS}>Conv</th>}
        {!isTraffic && <th className={TH_CLASS}>CVR</th>}
        {!isTraffic && <th className={TH_CLASS}>CPA</th>}
        {!isTraffic && <th className={TH_CLASS}>Revenue</th>}
        {!isTraffic && <th className={TH_CLASS}>ROAS</th>}
      </tr>
    </thead>
  );
});

const SourceTableHead = memo(function SourceTableHead({
  isTraffic,
}: {
  isTraffic: boolean;
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
        {!isTraffic && <th className={TH_CLASS}>Conv</th>}
        {!isTraffic && <th className={TH_CLASS}>CVR</th>}
        {!isTraffic && <th className={TH_CLASS}>CPA</th>}
        {!isTraffic && <th className={TH_CLASS}>Revenue</th>}
        {!isTraffic && <th className={TH_CLASS}>ROAS</th>}
      </tr>
    </thead>
  );
});

const DailyTableHead = memo(function DailyTableHead({
  isTraffic,
}: {
  isTraffic: boolean;
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
        {!isTraffic && <th className={TH_CLASS}>Conv</th>}
        {!isTraffic && <th className={TH_CLASS}>CVR</th>}
        {!isTraffic && <th className={TH_CLASS}>CPA</th>}
        {!isTraffic && <th className={TH_CLASS}>Revenue</th>}
        {!isTraffic && <th className={TH_CLASS}>ROAS</th>}
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
  isTraffic,
  prevRow,
  lastRow,
}: {
  isTraffic: boolean;
  prevRow: any;
  lastRow: any;
}) {
  if (!lastRow || !prevRow) return null;

  return (
    <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.9),rgba(248,250,252,0.96))] font-medium text-slate-800">
      <td className={`${FIRST_TD_CLASS} truncate`}>증감(최근주-전주)</td>

      <td className={TD_CLASS}>
        <TrendCell v={diffRatio(lastRow?.impressions, prevRow?.impressions)} />
      </td>

      <td className={TD_CLASS}>
        <TrendCell v={diffRatio(lastRow?.clicks, prevRow?.clicks)} />
      </td>

      <td className={TD_CLASS}>
        <TrendCell
          v={diffRatio(
            normalizeRate01(lastRow?.ctr),
            normalizeRate01(prevRow?.ctr)
          )}
          digits={2}
        />
      </td>

      <td className={TD_CLASS}>
        <TrendCell v={diffRatio(lastRow?.cpc, prevRow?.cpc)} digits={2} />
      </td>

      <td className={TD_CLASS}>
        <TrendCell v={diffRatio(lastRow?.cost, prevRow?.cost)} />
      </td>

      {!isTraffic && (
        <td className={TD_CLASS}>
          <TrendCell
            v={diffRatio(lastRow?.conversions, prevRow?.conversions)}
          />
        </td>
      )}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <TrendCell
            v={diffRatio(
              normalizeRate01(lastRow?.cvr),
              normalizeRate01(prevRow?.cvr)
            )}
            digits={2}
          />
        </td>
      )}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <TrendCell v={diffRatio(lastRow?.cpa, prevRow?.cpa)} digits={2} />
        </td>
      )}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <TrendCell v={diffRatio(lastRow?.revenue, prevRow?.revenue)} />
        </td>
      )}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <TrendCell
            v={diffRatio(
              normalizeRoas01(lastRow?.roas),
              normalizeRoas01(prevRow?.roas)
            )}
            digits={2}
          />
        </td>
      )}
    </tr>
  );
});

const WeeklyPerformanceRow = memo(function WeeklyPerformanceRow({
  isTraffic,
  row,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  isTraffic: boolean;
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

      {!isTraffic && (
        <td className={TD_CLASS}>
          <DataBarCell value={row.conversions} max={maxConv} />
        </td>
      )}

      {!isTraffic && (
        <td className={`${TD_CLASS} font-medium text-violet-600`}>
          {row.cvrText}
        </td>
      )}

      {!isTraffic && <td className={TD_CLASS}>{row.cpaText}</td>}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <DataBarCell
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {!isTraffic && (
        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
          {row.roasText}
        </td>
      )}
    </tr>
  );
});

const WeeklyPerformanceTable = memo(function WeeklyPerformanceTable({
  isTraffic,
  rows,
  prevRow,
  lastRow,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  isTraffic: boolean;
  rows: readonly any[];
  prevRow: any;
  lastRow: any;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  const tableClassName = isTraffic ? TRAFFIC_TABLE_CLASS : COMMERCE_TABLE_CLASS;

  const displayRows = useMemo<WeeklyDisplayRow[]>(
    () =>
      rows.map((w: any, idx: number) => {
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
      }),
    [rows]
  );

  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table className={tableClassName}>
        <MetricColGroup isTraffic={isTraffic} />
        <WeeklyTableHead isTraffic={isTraffic} />

        <tbody>
          <WeeklyDeltaRow
            isTraffic={isTraffic}
            prevRow={prevRow}
            lastRow={lastRow}
          />

          {displayRows.map((row) => (
            <WeeklyPerformanceRow
              key={row.key}
              isTraffic={isTraffic}
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

const SourcePerformanceRow = memo(function SourcePerformanceRow({
  isTraffic,
  row,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  isTraffic: boolean;
  row: SourceDisplayRow;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  return (
    <tr className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-emerald-50/45 transition-colors">
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

      {!isTraffic && (
        <td className={TD_CLASS}>
          <DataBarCell value={row.conversions} max={maxConv} />
        </td>
      )}

      {!isTraffic && (
        <td className={`${TD_CLASS} font-medium text-violet-600`}>
          {row.cvrText}
        </td>
      )}

      {!isTraffic && <td className={TD_CLASS}>{row.cpaText}</td>}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <DataBarCell
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {!isTraffic && (
        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
          {row.roasText}
        </td>
      )}
    </tr>
  );
});

const SourcePerformanceTable = memo(function SourcePerformanceTable({
  isTraffic,
  rows,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  isTraffic: boolean;
  rows: readonly any[];
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  const tableClassName = isTraffic ? TRAFFIC_TABLE_CLASS : COMMERCE_TABLE_CLASS;

  const displayRows = useMemo<SourceDisplayRow[]>(
    () =>
      rows.map((r: any, idx: number) => {
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
      }),
    [rows]
  );

  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table className={tableClassName}>
        <MetricColGroup isTraffic={isTraffic} />
        <SourceTableHead isTraffic={isTraffic} />

        <tbody>
          {displayRows.map((row) => (
            <SourcePerformanceRow
              key={row.key}
              isTraffic={isTraffic}
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
  isTraffic,
  row,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  isTraffic: boolean;
  row: DailyDisplayRow;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  return (
    <tr className="border-t border-slate-200/90 even:bg-slate-50/45 hover:bg-amber-50/45 transition-colors">
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

      {!isTraffic && (
        <td className={TD_CLASS}>
          <DataBarCell value={row.conversions} max={maxConv} />
        </td>
      )}

      {!isTraffic && (
        <td className={`${TD_CLASS} font-medium text-violet-600`}>
          {row.cvrText}
        </td>
      )}

      {!isTraffic && <td className={TD_CLASS}>{row.cpaText}</td>}

      {!isTraffic && (
        <td className={TD_CLASS}>
          <DataBarCell
            value={row.revenue}
            max={maxRev}
            label={row.revenueText}
          />
        </td>
      )}

      {!isTraffic && (
        <td className={`${TD_CLASS} font-semibold text-orange-600`}>
          {row.roasText}
        </td>
      )}
    </tr>
  );
});

const DailyPerformanceTable = memo(function DailyPerformanceTable({
  isTraffic,
  rows,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
}: {
  isTraffic: boolean;
  rows: readonly any[];
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
}) {
  const tableClassName = isTraffic ? TRAFFIC_TABLE_CLASS : COMMERCE_TABLE_CLASS;

  const displayRows = useMemo<DailyDisplayRow[]>(
    () =>
      rows.map((d: any, idx: number) => {
        const impressions = toSafeNumber(d?.impressions ?? d?.impr);
        const clicks = toSafeNumber(d?.clicks);
        const cost = toSafeNumber(d?.cost);
        const conversions = toSafeNumber(d?.conversions ?? d?.conv);
        const revenue = toSafeNumber(d?.revenue);
        const cpc = toSafeNumber(d?.cpc);
        const cpa = toSafeNumber(d?.cpa);
        const label = dayLabel(d);

        return {
          key: d?.date ?? d?.dateKey ?? `${daySortKey(d)}-${idx}`,
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
      }),
    [rows]
  );

  return (
    <div className={TABLE_SURFACE_CLASS}>
      <table className={tableClassName}>
        <MetricColGroup isTraffic={isTraffic} />
        <DailyTableHead isTraffic={isTraffic} />

        <tbody>
          {displayRows.length === 0 ? (
            <DailyEmptyRow colSpan={isTraffic ? 6 : 11} />
          ) : (
            displayRows.map((row) => (
              <DailyPerformanceRow
                key={row.key}
                isTraffic={isTraffic}
                row={row}
                maxImpr={maxImpr}
                maxClicks={maxClicks}
                maxCost={maxCost}
                maxConv={maxConv}
                maxRev={maxRev}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
});

function SummarySectionComponent(props: Props) {
  const {
    reportType,
    totals,
    byMonth,
    byWeekOnly,
    byWeekChart,
    bySource,
    byDay,
  } = props;

  const isTraffic = reportType === "traffic";

  const months = useMemo(
    () => (Array.isArray(byMonth) ? byMonth : EMPTY_LIST),
    [byMonth]
  );
  const weeks = useMemo(
    () => (Array.isArray(byWeekOnly) ? byWeekOnly : EMPTY_LIST),
    [byWeekOnly]
  );
  const weekChartData = useMemo(
    () => (Array.isArray(byWeekChart) ? byWeekChart : EMPTY_LIST),
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

  const {
    sortedWeeks,
    sortedDays,
    prevWeekSorted,
    lastWeekSorted,
    maxImpr,
    maxClicks,
    maxCost,
    maxConv,
    maxRev,
    srcMaxImpr,
    srcMaxClicks,
    srcMaxCost,
    srcMaxConv,
    srcMaxRev,
    dayMaxImpr,
    dayMaxClicks,
    dayMaxCost,
    dayMaxConv,
    dayMaxRev,
  } = useMemo(() => {
    const nextSortedWeeks = [...weeks].sort((a, b) =>
      weekSortKey(a).localeCompare(weekSortKey(b))
    );

    const nextSortedDays = [...days].sort((a, b) =>
      daySortKey(a).localeCompare(daySortKey(b))
    );

    return {
      sortedWeeks: nextSortedWeeks,
      sortedDays: nextSortedDays,
      prevWeekSorted: nextSortedWeeks.at(-2),
      lastWeekSorted: nextSortedWeeks.at(-1),

      maxImpr: getMaxValue(
        nextSortedWeeks,
        (r: any) => toSafeNumber(r?.impressions ?? r?.impr)
      ),
      maxClicks: getMaxValue(nextSortedWeeks, (r: any) =>
        toSafeNumber(r?.clicks)
      ),
      maxCost: getMaxValue(nextSortedWeeks, (r: any) => toSafeNumber(r?.cost)),
      maxConv: getMaxValue(nextSortedWeeks, (r: any) =>
        toSafeNumber(r?.conversions ?? r?.conv)
      ),
      maxRev: getMaxValue(nextSortedWeeks, (r: any) =>
        toSafeNumber(r?.revenue)
      ),

      srcMaxImpr: getMaxValue(sources, (r: any) =>
        toSafeNumber(r?.impressions ?? r?.impr)
      ),
      srcMaxClicks: getMaxValue(sources, (r: any) => toSafeNumber(r?.clicks)),
      srcMaxCost: getMaxValue(sources, (r: any) => toSafeNumber(r?.cost)),
      srcMaxConv: getMaxValue(sources, (r: any) =>
        toSafeNumber(r?.conversions ?? r?.conv)
      ),
      srcMaxRev: getMaxValue(sources, (r: any) => toSafeNumber(r?.revenue)),

      dayMaxImpr: getMaxValue(nextSortedDays, (r: any) =>
        toSafeNumber(r?.impressions ?? r?.impr)
      ),
      dayMaxClicks: getMaxValue(nextSortedDays, (r: any) =>
        toSafeNumber(r?.clicks)
      ),
      dayMaxCost: getMaxValue(nextSortedDays, (r: any) =>
        toSafeNumber(r?.cost)
      ),
      dayMaxConv: getMaxValue(nextSortedDays, (r: any) =>
        toSafeNumber(r?.conversions ?? r?.conv)
      ),
      dayMaxRev: getMaxValue(nextSortedDays, (r: any) =>
        toSafeNumber(r?.revenue)
      ),
    };
  }, [weeks, days, sources]);

  return (
    <div className="mt-6 space-y-12 lg:space-y-14">
      <div>
        <SectionIntro
          badge="📊 KPI"
          title="기간 성과 요약"
          description="현재 필터 조건 기준의 핵심 KPI를 빠르게 확인합니다."
          compact
        />

        <div className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.72))] p-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.035)] sm:p-3">
          <SummaryKPI reportType={reportType} totals={stableTotals} />
        </div>
      </div>

      <div>
        <SectionIntro
          badge="📋 SUMMARY TABLE"
          title="월별 성과 (최근 3개월)"
          description="최근 월별 핵심 성과를 비교합니다."
          compact
        />
        <SummaryTable reportType={reportType} byMonth={stableMonths} />
      </div>

      <section className="space-y-12 lg:space-y-14">
        <div>
          <SectionIntro
            badge="📅 WEEKLY"
            title="주차별 성과"
            description="최근 주차 흐름과 전주 대비 변화량을 빠르게 확인합니다."
            compact
          />

          <WeeklyPerformanceTable
            isTraffic={isTraffic}
            rows={sortedWeeks}
            prevRow={prevWeekSorted}
            lastRow={lastWeekSorted}
            maxImpr={maxImpr}
            maxClicks={maxClicks}
            maxCost={maxCost}
            maxConv={maxConv}
            maxRev={maxRev}
          />
        </div>

        <div>
          <SectionIntro
            badge="📈 CHART"
            title="주차별 추이"
            description="핵심 성과 흐름을 시각적으로 비교해 변화 구간을 빠르게 파악합니다."
            compact
          />

          <div className={CHART_SURFACE_CLASS}>
            <SummaryChart reportType={reportType} data={stableWeekChartData} />
          </div>
        </div>

        <div>
          <SectionIntro
            badge="🧭 SOURCE"
            title="소스별 성과"
            description="소스별 효율 차이를 비교해 예산과 운영 우선순위를 점검합니다."
            compact
          />

          <SourcePerformanceTable
            isTraffic={isTraffic}
            rows={sources}
            maxImpr={srcMaxImpr}
            maxClicks={srcMaxClicks}
            maxCost={srcMaxCost}
            maxConv={srcMaxConv}
            maxRev={srcMaxRev}
          />
        </div>

        <div>
          <SectionIntro
            badge="🗓️ DAILY"
            title="일자별 성과"
            description="일 단위 흐름을 확인해 변동이 큰 날짜와 이슈 구간을 찾습니다."
            compact
          />

          <DailyPerformanceTable
            isTraffic={isTraffic}
            rows={sortedDays}
            maxImpr={dayMaxImpr}
            maxClicks={dayMaxClicks}
            maxCost={dayMaxCost}
            maxConv={dayMaxConv}
            maxRev={dayMaxRev}
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
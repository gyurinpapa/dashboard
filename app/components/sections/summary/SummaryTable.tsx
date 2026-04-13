// app/components/sections/summary/SummaryTable.tsx
"use client";

import { memo, useMemo } from "react";
import type { ReportType } from "../../../../src/lib/report/types";
import TrendCell from "../../ui/TrendCell";
import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
  formatPercentFromRoas,
  diffRatio,
} from "../../../../src/lib/report/format";
import DataBarCell from "../../ui/DataBarCell";

type Props = {
  reportType?: ReportType;
  byMonth: any[];
};

const EMPTY_MONTHS: any[] = [];

const monthKey = (m: any) => {
  const k = m?.monthKey ?? m?.month ?? m?.key ?? m?.label;
  if (!k) return "";
  const s = String(k);
  const match = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (!match) return s;
  return `${match[1]}-${match[2].padStart(2, "0")}`;
};

const monthLabel = (m: any) => {
  return String(m?.month ?? m?.label ?? monthKey(m) ?? "-");
};

type TableMetrics = {
  sortedMonths: any[];
  lastMonth: any;
  prevMonth: any;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
};

type MetricMode = {
  isTraffic: boolean;
  isDbAcquisition: boolean;
  showConversions: boolean;
  showCvr: boolean;
  showCpa: boolean;
  showRevenue: boolean;
  showRoas: boolean;
  tableClassName: string;
  emptyColSpan: number;
};

type HeaderLabels = {
  month: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cost: string;
  conversions: string;
  cvr: string;
  cpa: string;
  revenue: string;
  roas: string;
};

type HeaderProps = {
  mode: MetricMode;
  labels: HeaderLabels;
};

type DeltaCellItem = {
  key: string;
  value: number;
  digits?: number;
};

type DeltaRowModel = {
  label: string;
  items: DeltaCellItem[];
};

type DeltaRowProps = {
  model: DeltaRowModel | null;
};

type MonthRowCell =
  | {
      key: string;
      kind: "text";
      value: string;
      className: string;
    }
  | {
      key: string;
      kind: "bar";
      value: number;
      max: number;
      className: string;
      label?: string;
    };

type MonthRowModel = {
  rowKey: string;
  monthLabel: string;
  trClassName: string;
  cells: MonthRowCell[];
};

type MonthRowProps = {
  model: MonthRowModel;
};

const TABLE_HEAD_TH_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5";
const TABLE_HEAD_FIRST_TH_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5";
const TD_TEXT_RIGHT_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right sm:px-5";
const TD_TEXT_LEFT_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-left font-semibold tracking-[-0.01em] text-slate-900 sm:px-5";
const TD_TEXT_RIGHT_MEDIUM_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-700 sm:px-5";
const TD_TEXT_RIGHT_STRONG_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right font-semibold text-rose-600 sm:px-5";
const TD_BAR_CLASS =
  "whitespace-nowrap px-4 py-3.5 text-right align-middle sm:px-5";

const WRAPPER_CLASS_NAME =
  "overflow-auto rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";
const TRAFFIC_TABLE_CLASS_NAME = "w-full min-w-[760px] text-sm";
const DB_ACQUISITION_TABLE_CLASS_NAME = "w-full min-w-[980px] text-sm";
const COMMERCE_TABLE_CLASS_NAME = "w-full min-w-[1120px] text-sm";
const EMPTY_ROW_CLASS_NAME =
  "px-4 py-12 text-center text-sm font-medium text-slate-400";
const MONTH_ROW_TR_CLASS_NAME =
  "border-t border-slate-200/80 transition-colors odd:bg-white even:bg-slate-50/55 hover:bg-sky-50/45";
const DELTA_ROW_TR_CLASS_NAME =
  "border-b border-slate-200/90 bg-[linear-gradient(180deg,rgba(241,245,249,0.88),rgba(248,250,252,0.94))] text-slate-800";

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
      ? TRAFFIC_TABLE_CLASS_NAME
      : isDbAcquisition
        ? DB_ACQUISITION_TABLE_CLASS_NAME
        : COMMERCE_TABLE_CLASS_NAME,
    emptyColSpan: isTraffic ? 6 : isDbAcquisition ? 9 : 11,
  };
}

function getHeaderLabels(reportType?: ReportType): HeaderLabels {
  const resolvedType: ReportType = reportType ?? "commerce";

  if (resolvedType === "traffic") {
    return {
      month: "Month",
      impressions: "Impr",
      clicks: "Clicks",
      ctr: "CTR",
      cpc: "CPC",
      cost: "Cost",
      conversions: "Conv",
      cvr: "CVR",
      cpa: "CPA",
      revenue: "Revenue",
      roas: "ROAS",
    };
  }

  if (resolvedType === "db_acquisition") {
    return {
      month: "Month",
      impressions: "Impr",
      clicks: "Clicks",
      ctr: "CTR",
      cpc: "CPC",
      cost: "Cost",
      conversions: "Conv",
      cvr: "CVR",
      cpa: "CPA",
      revenue: "Revenue",
      roas: "ROAS",
    };
  }

  return {
    month: "Month",
    impressions: "Impr",
    clicks: "Clicks",
    ctr: "CTR",
    cpc: "CPC",
    cost: "Cost",
    conversions: "Conv",
    cvr: "CVR",
    cpa: "CPA",
    revenue: "Revenue",
    roas: "ROAS",
  };
}

const SummaryTableHeader = memo(function SummaryTableHeader({
  mode,
  labels,
}: HeaderProps) {
  return (
    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-[rgba(248,250,252,0.94)] backdrop-blur">
      <tr>
        <th className={TABLE_HEAD_FIRST_TH_CLASS}>{labels.month}</th>
        <th className={TABLE_HEAD_TH_CLASS}>{labels.impressions}</th>
        <th className={TABLE_HEAD_TH_CLASS}>{labels.clicks}</th>
        <th className={TABLE_HEAD_TH_CLASS}>{labels.ctr}</th>
        <th className={TABLE_HEAD_TH_CLASS}>{labels.cpc}</th>
        <th className={TABLE_HEAD_TH_CLASS}>{labels.cost}</th>
        {mode.showConversions && (
          <th className={TABLE_HEAD_TH_CLASS}>{labels.conversions}</th>
        )}
        {mode.showCvr && <th className={TABLE_HEAD_TH_CLASS}>{labels.cvr}</th>}
        {mode.showCpa && <th className={TABLE_HEAD_TH_CLASS}>{labels.cpa}</th>}
        {mode.showRevenue && (
          <th className={TABLE_HEAD_TH_CLASS}>{labels.revenue}</th>
        )}
        {mode.showRoas && (
          <th className={TABLE_HEAD_TH_CLASS}>{labels.roas}</th>
        )}
      </tr>
    </thead>
  );
});

const SummaryTableDeltaRow = memo(function SummaryTableDeltaRow({
  model,
}: DeltaRowProps) {
  if (!model) return null;

  return (
    <tr className={DELTA_ROW_TR_CLASS_NAME}>
      <td className={TD_TEXT_LEFT_CLASS}>
        <span>{model.label}</span>
      </td>

      {model.items.map((item) => (
        <td key={item.key} className={TD_TEXT_RIGHT_CLASS}>
          <TrendCell v={item.value} digits={item.digits} />
        </td>
      ))}
    </tr>
  );
});

const SummaryTableMonthRow = memo(function SummaryTableMonthRow({
  model,
}: MonthRowProps) {
  return (
    <tr className={model.trClassName}>
      <td className={TD_TEXT_LEFT_CLASS}>{model.monthLabel}</td>

      {model.cells.map((cell) => {
        if (cell.kind === "bar") {
          return (
            <td key={cell.key} className={cell.className}>
              <DataBarCell
                value={cell.value}
                max={cell.max}
                label={cell.label}
              />
            </td>
          );
        }

        return (
          <td key={cell.key} className={cell.className}>
            {cell.value}
          </td>
        );
      })}
    </tr>
  );
});

function SummaryTableComponent({ reportType = "commerce", byMonth }: Props) {
  const mode = useMemo(() => getMetricMode(reportType), [reportType]);
  const headerLabels = useMemo(
    () => getHeaderLabels(reportType),
    [reportType]
  );
  const months = Array.isArray(byMonth) ? byMonth : EMPTY_MONTHS;

  const {
    sortedMonths,
    lastMonth,
    prevMonth,
    maxImpr,
    maxClicks,
    maxCost,
    maxConv,
    maxRev,
  } = useMemo<TableMetrics>(() => {
    const sorted = [...months].sort((a, b) =>
      monthKey(b).localeCompare(monthKey(a))
    );

    let nextMaxImpr = 0;
    let nextMaxClicks = 0;
    let nextMaxCost = 0;
    let nextMaxConv = 0;
    let nextMaxRev = 0;

    for (let i = 0; i < sorted.length; i += 1) {
      const row = sorted[i];

      const impr = toSafeNumber(row?.impressions ?? row?.impr);
      const clicks = toSafeNumber(row?.clicks ?? row?.click);
      const cost = toSafeNumber(row?.cost);
      const conv = toSafeNumber(row?.conversions ?? row?.conv);
      const rev = toSafeNumber(row?.revenue ?? row?.sales);

      if (impr > nextMaxImpr) nextMaxImpr = impr;
      if (clicks > nextMaxClicks) nextMaxClicks = clicks;
      if (cost > nextMaxCost) nextMaxCost = cost;
      if (conv > nextMaxConv) nextMaxConv = conv;
      if (rev > nextMaxRev) nextMaxRev = rev;
    }

    return {
      sortedMonths: sorted,
      lastMonth: sorted[0],
      prevMonth: sorted[1],
      maxImpr: nextMaxImpr,
      maxClicks: nextMaxClicks,
      maxCost: nextMaxCost,
      maxConv: nextMaxConv,
      maxRev: nextMaxRev,
    };
  }, [months]);

  const deltaRowModel = useMemo<DeltaRowModel | null>(() => {
    if (!lastMonth || !prevMonth) return null;

    const items: DeltaCellItem[] = [
      {
        key: "delta-impr",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.impressions ?? lastMonth?.impr),
            toSafeNumber(prevMonth?.impressions ?? prevMonth?.impr)
          ) ?? 0,
      },
      {
        key: "delta-clicks",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.clicks ?? lastMonth?.click),
            toSafeNumber(prevMonth?.clicks ?? prevMonth?.click)
          ) ?? 0,
      },
      {
        key: "delta-ctr",
        value:
          diffRatio(
            normalizeRate01(lastMonth?.ctr),
            normalizeRate01(prevMonth?.ctr)
          ) ?? 0,
        digits: 2,
      },
      {
        key: "delta-cpc",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.cpc),
            toSafeNumber(prevMonth?.cpc)
          ) ?? 0,
        digits: 2,
      },
      {
        key: "delta-cost",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.cost),
            toSafeNumber(prevMonth?.cost)
          ) ?? 0,
      },
    ];

    if (mode.showConversions) {
      items.push({
        key: "delta-conv",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.conversions ?? lastMonth?.conv),
            toSafeNumber(prevMonth?.conversions ?? prevMonth?.conv)
          ) ?? 0,
      });
    }

    if (mode.showCvr) {
      items.push({
        key: "delta-cvr",
        value:
          diffRatio(
            normalizeRate01(lastMonth?.cvr),
            normalizeRate01(prevMonth?.cvr)
          ) ?? 0,
        digits: 2,
      });
    }

    if (mode.showCpa) {
      items.push({
        key: "delta-cpa",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.cpa),
            toSafeNumber(prevMonth?.cpa)
          ) ?? 0,
        digits: 2,
      });
    }

    if (mode.showRevenue) {
      items.push({
        key: "delta-revenue",
        value:
          diffRatio(
            toSafeNumber(lastMonth?.revenue ?? lastMonth?.sales),
            toSafeNumber(prevMonth?.revenue ?? prevMonth?.sales)
          ) ?? 0,
      });
    }

    if (mode.showRoas) {
      items.push({
        key: "delta-roas",
        value:
          diffRatio(
            normalizeRoas01(lastMonth?.roas),
            normalizeRoas01(prevMonth?.roas)
          ) ?? 0,
        digits: 2,
      });
    }

    return {
      label: "증감(최근월-전월)",
      items,
    };
  }, [mode, lastMonth, prevMonth]);

  const monthRowModels = useMemo<MonthRowModel[]>(() => {
    return sortedMonths.map((row: any, idx: number) => {
      const rowKey =
        row?.monthKey ?? row?.month ?? row?.label ?? row?.key ?? `month-${idx}`;

      const impressionsValue = toSafeNumber(row?.impressions ?? row?.impr);
      const clicksValue = toSafeNumber(row?.clicks ?? row?.click);
      const costValue = toSafeNumber(row?.cost);
      const convValue = toSafeNumber(row?.conversions ?? row?.conv);
      const revenueValue = toSafeNumber(row?.revenue ?? row?.sales);

      const ctrText = formatPercentFromRate(row?.ctr, 2);
      const cpcText = KRW(toSafeNumber(row?.cpc));
      const costText = KRW(costValue);
      const cvrText = formatPercentFromRate(row?.cvr, 2);
      const cpaText = KRW(toSafeNumber(row?.cpa));
      const revenueText = KRW(revenueValue);
      const roasText = formatPercentFromRoas(row?.roas, 1);

      const cells: MonthRowCell[] = [
        {
          key: `${rowKey}-impr`,
          kind: "bar",
          value: impressionsValue,
          max: maxImpr,
          className: TD_BAR_CLASS,
        },
        {
          key: `${rowKey}-clicks`,
          kind: "bar",
          value: clicksValue,
          max: maxClicks,
          className: TD_BAR_CLASS,
        },
        {
          key: `${rowKey}-ctr`,
          kind: "text",
          value: ctrText,
          className: TD_TEXT_RIGHT_MEDIUM_CLASS,
        },
        {
          key: `${rowKey}-cpc`,
          kind: "text",
          value: cpcText,
          className: TD_TEXT_RIGHT_MEDIUM_CLASS,
        },
        {
          key: `${rowKey}-cost`,
          kind: "bar",
          value: costValue,
          max: maxCost,
          label: costText,
          className: TD_BAR_CLASS,
        },
      ];

      if (mode.showConversions) {
        cells.push({
          key: `${rowKey}-conv`,
          kind: "bar",
          value: convValue,
          max: maxConv,
          className: TD_BAR_CLASS,
        });
      }

      if (mode.showCvr) {
        cells.push({
          key: `${rowKey}-cvr`,
          kind: "text",
          value: cvrText,
          className: TD_TEXT_RIGHT_MEDIUM_CLASS,
        });
      }

      if (mode.showCpa) {
        cells.push({
          key: `${rowKey}-cpa`,
          kind: "text",
          value: cpaText,
          className: TD_TEXT_RIGHT_MEDIUM_CLASS,
        });
      }

      if (mode.showRevenue) {
        cells.push({
          key: `${rowKey}-revenue`,
          kind: "bar",
          value: revenueValue,
          max: maxRev,
          label: revenueText,
          className: TD_BAR_CLASS,
        });
      }

      if (mode.showRoas) {
        cells.push({
          key: `${rowKey}-roas`,
          kind: "text",
          value: roasText,
          className: TD_TEXT_RIGHT_STRONG_CLASS,
        });
      }

      return {
        rowKey: String(rowKey),
        monthLabel: monthLabel(row),
        trClassName: MONTH_ROW_TR_CLASS_NAME,
        cells,
      };
    });
  }, [mode, maxClicks, maxConv, maxCost, maxImpr, maxRev, sortedMonths]);

  return (
    <div className={WRAPPER_CLASS_NAME}>
      <table className={mode.tableClassName}>
        <SummaryTableHeader mode={mode} labels={headerLabels} />

        <tbody>
          <SummaryTableDeltaRow model={deltaRowModel} />

          {monthRowModels.map((model) => (
            <SummaryTableMonthRow key={model.rowKey} model={model} />
          ))}

          {!monthRowModels.length && (
            <tr>
              <td colSpan={mode.emptyColSpan} className={EMPTY_ROW_CLASS_NAME}>
                표시할 월별 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const SummaryTable = memo(SummaryTableComponent);

export default SummaryTable;
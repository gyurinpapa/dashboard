// app/components/sections/summary/SummaryTable.tsx
"use client";

import { memo, useMemo } from "react";
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
  reportType?: "commerce" | "traffic";
  byMonth: any[];
};

const monthKey = (m: any) => {
  const k = m?.monthKey ?? m?.month ?? m?.key ?? m?.label;
  if (!k) return "";
  const s = String(k);
  const match = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (!match) return s;
  return `${match[1]}-${match[2].padStart(2, "0")}`;
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

type HeaderProps = {
  isTraffic: boolean;
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
  isTraffic: boolean;
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
const COMMERCE_TABLE_CLASS_NAME = "w-full min-w-[1120px] text-sm";
const EMPTY_ROW_CLASS_NAME =
  "px-4 py-12 text-center text-sm font-medium text-slate-400";
const MONTH_ROW_TR_CLASS_NAME =
  "border-t border-slate-200/80 transition-colors odd:bg-white even:bg-slate-50/55 hover:bg-sky-50/45";
const DELTA_ROW_TR_CLASS_NAME =
  "border-b border-slate-200/90 bg-[linear-gradient(180deg,rgba(241,245,249,0.88),rgba(248,250,252,0.94))] text-slate-800";

const SummaryTableHeader = memo(function SummaryTableHeader({
  isTraffic,
}: HeaderProps) {
  return (
    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-[rgba(248,250,252,0.94)] backdrop-blur">
      <tr>
        <th className={TABLE_HEAD_FIRST_TH_CLASS}>Month</th>
        <th className={TABLE_HEAD_TH_CLASS}>Impr</th>
        <th className={TABLE_HEAD_TH_CLASS}>Clicks</th>
        <th className={TABLE_HEAD_TH_CLASS}>CTR</th>
        <th className={TABLE_HEAD_TH_CLASS}>CPC</th>
        <th className={TABLE_HEAD_TH_CLASS}>Cost</th>
        {!isTraffic && <th className={TABLE_HEAD_TH_CLASS}>Conv</th>}
        {!isTraffic && <th className={TABLE_HEAD_TH_CLASS}>CVR</th>}
        {!isTraffic && <th className={TABLE_HEAD_TH_CLASS}>CPA</th>}
        {!isTraffic && <th className={TABLE_HEAD_TH_CLASS}>Revenue</th>}
        {!isTraffic && <th className={TABLE_HEAD_TH_CLASS}>ROAS</th>}
      </tr>
    </thead>
  );
});

const SummaryTableDeltaRow = memo(function SummaryTableDeltaRow({
  isTraffic,
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

      {!isTraffic && model.items.length < 10 && null}
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

function SummaryTableComponent({ reportType, byMonth }: Props) {
  const isTraffic = reportType === "traffic";
  const months = Array.isArray(byMonth) ? byMonth : [];

  // 성능 최적화:
  // - 정렬/최근월/전월/max 스캔을 1회 useMemo로 고정
  // - map 내부 계산용 원시값도 여기서 먼저 정리
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
      const clicks = toSafeNumber(row?.clicks);
      const cost = toSafeNumber(row?.cost);
      const conv = toSafeNumber(row?.conversions ?? row?.conv);
      const rev = toSafeNumber(row?.revenue);

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

  // 성능 최적화:
  // - TrendCell에 넘길 diffRatio / normalize 계산을 상위에서 미리 고정
  // - DeltaRow 내부 inline 계산 제거
  const deltaRowModel = useMemo<DeltaRowModel | null>(() => {
    if (!lastMonth || !prevMonth) return null;

    const items: DeltaCellItem[] = [
      {
        key: "delta-impr",
        value: diffRatio(lastMonth?.impressions, prevMonth?.impressions),
      },
      {
        key: "delta-clicks",
        value: diffRatio(lastMonth?.clicks, prevMonth?.clicks),
      },
      {
        key: "delta-ctr",
        value: diffRatio(
          normalizeRate01(lastMonth?.ctr),
          normalizeRate01(prevMonth?.ctr)
        ),
        digits: 2,
      },
      {
        key: "delta-cpc",
        value: diffRatio(lastMonth?.cpc, prevMonth?.cpc),
        digits: 2,
      },
      {
        key: "delta-cost",
        value: diffRatio(lastMonth?.cost, prevMonth?.cost),
      },
    ];

    if (!isTraffic) {
      items.push(
        {
          key: "delta-conv",
          value: diffRatio(lastMonth?.conversions, prevMonth?.conversions),
        },
        {
          key: "delta-cvr",
          value: diffRatio(
            normalizeRate01(lastMonth?.cvr),
            normalizeRate01(prevMonth?.cvr)
          ),
          digits: 2,
        },
        {
          key: "delta-cpa",
          value: diffRatio(lastMonth?.cpa, prevMonth?.cpa),
          digits: 2,
        },
        {
          key: "delta-revenue",
          value: diffRatio(lastMonth?.revenue, prevMonth?.revenue),
        },
        {
          key: "delta-roas",
          value: diffRatio(
            normalizeRoas01(lastMonth?.roas),
            normalizeRoas01(prevMonth?.roas)
          ),
          digits: 2,
        }
      );
    }

    return {
      label: "증감(최근월-전월)",
      items,
    };
  }, [isTraffic, lastMonth, prevMonth]);

  // 성능 최적화:
  // - 월 row 렌더 전 formatter / safe number / label / bar props를 전부 선계산
  // - map 내부에서는 이미 만들어진 model만 렌더
  const monthRowModels = useMemo<MonthRowModel[]>(() => {
    return sortedMonths.map((row: any, idx: number) => {
      const rowKey =
        row?.monthKey ?? row?.month ?? row?.label ?? row?.key ?? `month-${idx}`;

      const impressionsValue = toSafeNumber(row?.impressions ?? row?.impr);
      const clicksValue = toSafeNumber(row?.clicks);
      const costValue = toSafeNumber(row?.cost);
      const convValue = toSafeNumber(row?.conversions ?? row?.conv);
      const revenueValue = toSafeNumber(row?.revenue);

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

      if (!isTraffic) {
        cells.push(
          {
            key: `${rowKey}-conv`,
            kind: "bar",
            value: convValue,
            max: maxConv,
            className: TD_BAR_CLASS,
          },
          {
            key: `${rowKey}-cvr`,
            kind: "text",
            value: cvrText,
            className: TD_TEXT_RIGHT_MEDIUM_CLASS,
          },
          {
            key: `${rowKey}-cpa`,
            kind: "text",
            value: cpaText,
            className: TD_TEXT_RIGHT_MEDIUM_CLASS,
          },
          {
            key: `${rowKey}-revenue`,
            kind: "bar",
            value: revenueValue,
            max: maxRev,
            label: revenueText,
            className: TD_BAR_CLASS,
          },
          {
            key: `${rowKey}-roas`,
            kind: "text",
            value: roasText,
            className: TD_TEXT_RIGHT_STRONG_CLASS,
          }
        );
      }

      return {
        rowKey,
        monthLabel: row?.month ?? row?.label ?? "-",
        trClassName: MONTH_ROW_TR_CLASS_NAME,
        cells,
      };
    });
  }, [isTraffic, maxClicks, maxConv, maxCost, maxImpr, maxRev, sortedMonths]);

  // 성능 최적화:
  // - className / colSpan도 stable reference로 고정
  const tableClassName = useMemo(
    () => (isTraffic ? TRAFFIC_TABLE_CLASS_NAME : COMMERCE_TABLE_CLASS_NAME),
    [isTraffic]
  );

  const emptyColSpan = isTraffic ? 6 : 11;

  return (
    <div className={WRAPPER_CLASS_NAME}>
      <table className={tableClassName}>
        <SummaryTableHeader isTraffic={isTraffic} />

        <tbody>
          <SummaryTableDeltaRow isTraffic={isTraffic} model={deltaRowModel} />

          {monthRowModels.map((model) => (
            <SummaryTableMonthRow key={model.rowKey} model={model} />
          ))}

          {!monthRowModels.length && (
            <tr>
              <td colSpan={emptyColSpan} className={EMPTY_ROW_CLASS_NAME}>
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
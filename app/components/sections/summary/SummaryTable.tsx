"use client";

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

export default function SummaryTable({ byMonth }: Props) {
  const months = Array.isArray(byMonth) ? byMonth : [];

  const sortedMonths = [...months].sort((a, b) =>
    monthKey(b).localeCompare(monthKey(a))
  );

  const lastMonth = sortedMonths[0];
  const prevMonth = sortedMonths[1];

  const maxImpr = Math.max(
    0,
    ...sortedMonths.map((r: any) => toSafeNumber(r?.impressions ?? r?.impr))
  );
  const maxClicks = Math.max(
    0,
    ...sortedMonths.map((r: any) => toSafeNumber(r?.clicks))
  );
  const maxCost = Math.max(
    0,
    ...sortedMonths.map((r: any) => toSafeNumber(r?.cost))
  );
  const maxConv = Math.max(
    0,
    ...sortedMonths.map((r: any) => toSafeNumber(r?.conversions ?? r?.conv))
  );
  const maxRev = Math.max(
    0,
    ...sortedMonths.map((r: any) => toSafeNumber(r?.revenue))
  );

  return (
    <section className="mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4 sm:px-6 sm:py-5">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900 sm:text-[16px]">
          월별 성과 (최근 3개월)
        </div>
        <div className="mt-1 text-xs font-medium text-gray-500 sm:text-[12px]">
          최근 월별 핵심 성과 비교
        </div>
      </div>

      <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
        <div className="overflow-auto rounded-2xl border border-gray-200/80">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
              <tr>
                <th className="whitespace-nowrap px-4 py-3.5 text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  Month
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  Impr
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  Clicks
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  CTR
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  CPC
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  Cost
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  Conv
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  CVR
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  CPA
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  Revenue
                </th>
                <th className="whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600">
                  ROAS
                </th>
              </tr>
            </thead>

            <tbody>
              {lastMonth && prevMonth && (
                <tr className="border-b border-gray-200 bg-slate-50/90 font-medium text-gray-800">
                  <td className="whitespace-nowrap px-4 py-3.5 text-left font-semibold text-gray-900">
                    증감(최근월-전월)
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.impressions, prevMonth?.impressions)}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.clicks, prevMonth?.clicks)}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(
                        normalizeRate01(lastMonth?.ctr),
                        normalizeRate01(prevMonth?.ctr)
                      )}
                      digits={2}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.cpc, prevMonth?.cpc)}
                      digits={2}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.cost, prevMonth?.cost)}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.conversions, prevMonth?.conversions)}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(
                        normalizeRate01(lastMonth?.cvr),
                        normalizeRate01(prevMonth?.cvr)
                      )}
                      digits={2}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.cpa, prevMonth?.cpa)}
                      digits={2}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(lastMonth?.revenue, prevMonth?.revenue)}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffRatio(
                        normalizeRoas01(lastMonth?.roas),
                        normalizeRoas01(prevMonth?.roas)
                      )}
                      digits={2}
                    />
                  </td>
                </tr>
              )}

              {sortedMonths.map((row: any, idx: number) => (
                <tr
                  key={row?.monthKey ?? row?.month ?? row?.label ?? idx}
                  className="border-t border-gray-200 even:bg-gray-50/60 transition-colors hover:bg-blue-50/40"
                >
                  <td className="whitespace-nowrap px-4 py-3.5 text-left font-medium text-gray-900">
                    {row?.month ?? row?.label ?? "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle">
                    <DataBarCell
                      value={toSafeNumber(row?.impressions ?? row?.impr)}
                      max={maxImpr}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle">
                    <DataBarCell
                      value={toSafeNumber(row?.clicks)}
                      max={maxClicks}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-gray-700">
                    {formatPercentFromRate(row?.ctr, 2)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-gray-700">
                    {KRW(toSafeNumber(row?.cpc))}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle">
                    <DataBarCell
                      value={toSafeNumber(row?.cost)}
                      max={maxCost}
                      label={KRW(toSafeNumber(row?.cost))}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle">
                    <DataBarCell
                      value={toSafeNumber(row?.conversions ?? row?.conv)}
                      max={maxConv}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-gray-700">
                    {formatPercentFromRate(row?.cvr, 2)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-gray-700">
                    {KRW(toSafeNumber(row?.cpa))}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle">
                    <DataBarCell
                      value={toSafeNumber(row?.revenue)}
                      max={maxRev}
                      label={KRW(toSafeNumber(row?.revenue))}
                    />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-rose-600">
                    {formatPercentFromRoas(row?.roas, 1)}
                  </td>
                </tr>
              ))}

              {!sortedMonths.length && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-10 text-center text-sm font-medium text-gray-400"
                  >
                    표시할 월별 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
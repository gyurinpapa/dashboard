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

export default function SummaryTable({ reportType, byMonth }: Props) {
  const isTraffic = reportType === "traffic";
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
    <div className="overflow-auto rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <table
        className={[
          "w-full text-sm",
          isTraffic ? "min-w-[760px]" : "min-w-[1120px]",
        ].join(" ")}
      >
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-[rgba(248,250,252,0.94)] backdrop-blur">
          <tr>
            <th className="whitespace-nowrap px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              Month
            </th>
            <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              Impr
            </th>
            <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              Clicks
            </th>
            <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              CTR
            </th>
            <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              CPC
            </th>
            <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
              Cost
            </th>
            {!isTraffic && (
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                Conv
              </th>
            )}
            {!isTraffic && (
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                CVR
              </th>
            )}
            {!isTraffic && (
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                CPA
              </th>
            )}
            {!isTraffic && (
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                Revenue
              </th>
            )}
            {!isTraffic && (
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                ROAS
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {lastMonth && prevMonth && (
            <tr className="border-b border-slate-200/90 bg-[linear-gradient(180deg,rgba(241,245,249,0.88),rgba(248,250,252,0.94))] text-slate-800">
              <td className="whitespace-nowrap px-4 py-3.5 text-left font-semibold tracking-[-0.01em] text-slate-900 sm:px-5">
                <span>증감(최근월-전월)</span>
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                <TrendCell
                  v={diffRatio(lastMonth?.impressions, prevMonth?.impressions)}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                <TrendCell
                  v={diffRatio(lastMonth?.clicks, prevMonth?.clicks)}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                <TrendCell
                  v={diffRatio(
                    normalizeRate01(lastMonth?.ctr),
                    normalizeRate01(prevMonth?.ctr)
                  )}
                  digits={2}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                <TrendCell
                  v={diffRatio(lastMonth?.cpc, prevMonth?.cpc)}
                  digits={2}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                <TrendCell
                  v={diffRatio(lastMonth?.cost, prevMonth?.cost)}
                />
              </td>

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                  <TrendCell
                    v={diffRatio(
                      lastMonth?.conversions,
                      prevMonth?.conversions
                    )}
                  />
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                  <TrendCell
                    v={diffRatio(
                      normalizeRate01(lastMonth?.cvr),
                      normalizeRate01(prevMonth?.cvr)
                    )}
                    digits={2}
                  />
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                  <TrendCell
                    v={diffRatio(lastMonth?.cpa, prevMonth?.cpa)}
                    digits={2}
                  />
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                  <TrendCell
                    v={diffRatio(lastMonth?.revenue, prevMonth?.revenue)}
                  />
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-5">
                  <TrendCell
                    v={diffRatio(
                      normalizeRoas01(lastMonth?.roas),
                      normalizeRoas01(prevMonth?.roas)
                    )}
                    digits={2}
                  />
                </td>
              )}
            </tr>
          )}

          {sortedMonths.map((row: any, idx: number) => (
            <tr
              key={row?.monthKey ?? row?.month ?? row?.label ?? idx}
              className="border-t border-slate-200/80 transition-colors odd:bg-white even:bg-slate-50/55 hover:bg-sky-50/45"
            >
              <td className="whitespace-nowrap px-4 py-3.5 text-left font-semibold tracking-[-0.01em] text-slate-900 sm:px-5">
                {row?.month ?? row?.label ?? "-"}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle sm:px-5">
                <DataBarCell
                  value={toSafeNumber(row?.impressions ?? row?.impr)}
                  max={maxImpr}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle sm:px-5">
                <DataBarCell
                  value={toSafeNumber(row?.clicks)}
                  max={maxClicks}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-700 sm:px-5">
                {formatPercentFromRate(row?.ctr, 2)}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-700 sm:px-5">
                {KRW(toSafeNumber(row?.cpc))}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle sm:px-5">
                <DataBarCell
                  value={toSafeNumber(row?.cost)}
                  max={maxCost}
                  label={KRW(toSafeNumber(row?.cost))}
                />
              </td>

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle sm:px-5">
                  <DataBarCell
                    value={toSafeNumber(row?.conversions ?? row?.conv)}
                    max={maxConv}
                  />
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-700 sm:px-5">
                  {formatPercentFromRate(row?.cvr, 2)}
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-700 sm:px-5">
                  {KRW(toSafeNumber(row?.cpa))}
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle sm:px-5">
                  <DataBarCell
                    value={toSafeNumber(row?.revenue)}
                    max={maxRev}
                    label={KRW(toSafeNumber(row?.revenue))}
                  />
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-rose-600 sm:px-5">
                  {formatPercentFromRoas(row?.roas, 1)}
                </td>
              )}
            </tr>
          ))}

          {!sortedMonths.length && (
            <tr>
              <td
                colSpan={isTraffic ? 6 : 11}
                className="px-4 py-12 text-center text-sm font-medium text-slate-400"
              >
                표시할 월별 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
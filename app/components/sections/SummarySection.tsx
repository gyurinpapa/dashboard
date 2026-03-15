"use client";

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
};

const TH_CLASS =
  "px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600 whitespace-nowrap";

const TD_CLASS =
  "px-4 py-3.5 text-right text-sm text-gray-700 whitespace-nowrap align-middle";

const FIRST_TH_CLASS =
  "px-4 py-3.5 text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600 whitespace-nowrap";

const FIRST_TD_CLASS =
  "px-4 py-3.5 text-left text-sm font-medium text-gray-900 whitespace-nowrap align-middle";

const SECTION_TITLE_CLASS =
  "mb-4 text-lg font-semibold tracking-tight text-gray-900";

const TABLE_SURFACE_CLASS =
  "overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm";

const CHART_SURFACE_CLASS = "mt-0";

export default function SummarySection(props: Props) {
  const { totals, byMonth, byWeekOnly, byWeekChart, bySource } = props;

  const months = Array.isArray(byMonth) ? byMonth : [];
  const weeks = Array.isArray(byWeekOnly) ? byWeekOnly : [];
  const weekChartData = Array.isArray(byWeekChart) ? byWeekChart : [];
  const sources = Array.isArray(bySource) ? bySource : [];

  const weekSortKey = (w: any) => {
    const k = w?.weekKey ?? w?.startDate ?? w?.weekStart ?? w?.dateKey;
    if (k) return String(k);

    const m = String(w?.label ?? "").match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})주차/);
    if (!m) return String(w?.label ?? "");
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const wk = m[3].padStart(2, "0");
    return `${y}-${mo}-${wk}`;
  };

  const sortedWeeks = [...weeks].sort((a, b) =>
    weekSortKey(a).localeCompare(weekSortKey(b))
  );

  const prevWeekSorted = sortedWeeks.at(-2);
  const lastWeekSorted = sortedWeeks.at(-1);

  const maxImpr = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.impressions ?? r?.impr))
  );
  const maxClicks = Math.max(0, ...sortedWeeks.map((r: any) => toSafeNumber(r?.clicks)));
  const maxCost = Math.max(0, ...sortedWeeks.map((r: any) => toSafeNumber(r?.cost)));
  const maxConv = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toSafeNumber(r?.conversions ?? r?.conv))
  );
  const maxRev = Math.max(0, ...sortedWeeks.map((r: any) => toSafeNumber(r?.revenue)));

  const srcMaxImpr = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.impressions ?? r?.impr))
  );
  const srcMaxClicks = Math.max(0, ...sources.map((r: any) => toSafeNumber(r?.clicks)));
  const srcMaxCost = Math.max(0, ...sources.map((r: any) => toSafeNumber(r?.cost)));
  const srcMaxConv = Math.max(
    0,
    ...sources.map((r: any) => toSafeNumber(r?.conversions ?? r?.conv))
  );
  const srcMaxRev = Math.max(0, ...sources.map((r: any) => toSafeNumber(r?.revenue)));

  return (
    <>
      <section className="mt-6 space-y-10">
        <div>
          <h2 className={SECTION_TITLE_CLASS}>기간 성과</h2>

          <div className="mt-0">
            <SummaryKPI totals={totals} />
          </div>
        </div>

        <div>
          <SummaryTable byMonth={months} />
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            주차별 성과 (최근 5주)
          </h2>
        </div>

        <div className={TABLE_SURFACE_CLASS}>
          <table className="w-full min-w-[1320px] table-fixed text-sm">
            <colgroup>
              <col className="w-[180px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[120px]" />
              <col className="w-[90px]" />
            </colgroup>

            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
              <tr>
                <th className={FIRST_TH_CLASS}>Week</th>
                <th className={TH_CLASS}>Impr</th>
                <th className={TH_CLASS}>Clicks</th>
                <th className={TH_CLASS}>CTR</th>
                <th className={TH_CLASS}>CPC</th>
                <th className={TH_CLASS}>Cost</th>
                <th className={TH_CLASS}>Conv</th>
                <th className={TH_CLASS}>CVR</th>
                <th className={TH_CLASS}>CPA</th>
                <th className={TH_CLASS}>Revenue</th>
                <th className={TH_CLASS}>ROAS</th>
              </tr>
            </thead>

            <tbody>
              {lastWeekSorted && prevWeekSorted && (
                <tr className="border-b border-gray-200 bg-slate-50/90 font-medium text-gray-800">
                  <td className={`${FIRST_TD_CLASS} truncate`}>
                    증감(최근주-전주)
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(
                        lastWeekSorted?.impressions,
                        prevWeekSorted?.impressions
                      )}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(lastWeekSorted?.clicks, prevWeekSorted?.clicks)}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(
                        normalizeRate01(lastWeekSorted?.ctr),
                        normalizeRate01(prevWeekSorted?.ctr)
                      )}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(lastWeekSorted?.cpc, prevWeekSorted?.cpc)}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(lastWeekSorted?.cost, prevWeekSorted?.cost)}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(
                        lastWeekSorted?.conversions,
                        prevWeekSorted?.conversions
                      )}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(
                        normalizeRate01(lastWeekSorted?.cvr),
                        normalizeRate01(prevWeekSorted?.cvr)
                      )}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(lastWeekSorted?.cpa, prevWeekSorted?.cpa)}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(lastWeekSorted?.revenue, prevWeekSorted?.revenue)}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffRatio(
                        normalizeRoas01(lastWeekSorted?.roas),
                        normalizeRoas01(prevWeekSorted?.roas)
                      )}
                      digits={2}
                    />
                  </td>
                </tr>
              )}

              {sortedWeeks.map((w: any, idx: number) => (
                <tr
                  key={w?.weekKey ?? `${weekSortKey(w)}-${idx}`}
                  className="border-t border-gray-200 even:bg-gray-50/60 hover:bg-blue-50/40 transition-colors"
                >
                  <td
                    className={`${FIRST_TD_CLASS} truncate`}
                    title={String(w?.label ?? "")}
                  >
                    {w?.label}
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(w?.impressions ?? w?.impr)}
                      max={maxImpr}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell value={toSafeNumber(w?.clicks)} max={maxClicks} />
                  </td>

                  <td className={TD_CLASS}>
                    {formatPercentFromRate(w?.ctr, 2)}
                  </td>

                  <td className={TD_CLASS}>{KRW(toSafeNumber(w?.cpc))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(w?.cost)}
                      max={maxCost}
                      label={KRW(toSafeNumber(w?.cost))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(w?.conversions ?? w?.conv)}
                      max={maxConv}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {formatPercentFromRate(w?.cvr, 2)}
                  </td>

                  <td className={TD_CLASS}>{KRW(toSafeNumber(w?.cpa))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(w?.revenue)}
                      max={maxRev}
                      label={KRW(toSafeNumber(w?.revenue))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {formatPercentFromRoas(w?.roas, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            최근 5주 주간 성과
          </h2>
        </div>

        <div className={CHART_SURFACE_CLASS}>
          <SummaryChart data={weekChartData} />
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            소스별 요약
          </h2>
        </div>

        <div className={TABLE_SURFACE_CLASS}>
          <table className="w-full min-w-[1320px] table-fixed text-sm">
            <colgroup>
              <col className="w-[180px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[120px]" />
              <col className="w-[90px]" />
            </colgroup>

            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
              <tr>
                <th className={FIRST_TH_CLASS}>Source</th>
                <th className={TH_CLASS}>Impr</th>
                <th className={TH_CLASS}>Clicks</th>
                <th className={TH_CLASS}>CTR</th>
                <th className={TH_CLASS}>CPC</th>
                <th className={TH_CLASS}>Cost</th>
                <th className={TH_CLASS}>Conv</th>
                <th className={TH_CLASS}>CVR</th>
                <th className={TH_CLASS}>CPA</th>
                <th className={TH_CLASS}>Revenue</th>
                <th className={TH_CLASS}>ROAS</th>
              </tr>
            </thead>

            <tbody>
              {sources.map((r: any, idx: number) => (
                <tr
                  key={r?.source ?? idx}
                  className="border-t border-gray-200 even:bg-gray-50/60 hover:bg-blue-50/40 transition-colors"
                >
                  <td
                    className={`${FIRST_TD_CLASS} truncate`}
                    title={String(r?.source ?? "")}
                  >
                    {r?.source}
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(r?.impressions ?? r?.impr)}
                      max={srcMaxImpr}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell value={toSafeNumber(r?.clicks)} max={srcMaxClicks} />
                  </td>

                  <td className={TD_CLASS}>
                    {formatPercentFromRate(r?.ctr, 2)}
                  </td>

                  <td className={TD_CLASS}>{KRW(toSafeNumber(r?.cpc))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(r?.cost)}
                      max={srcMaxCost}
                      label={KRW(toSafeNumber(r?.cost))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(r?.conversions ?? r?.conv)}
                      max={srcMaxConv}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {formatPercentFromRate(r?.cvr, 2)}
                  </td>

                  <td className={TD_CLASS}>{KRW(toSafeNumber(r?.cpa))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toSafeNumber(r?.revenue)}
                      max={srcMaxRev}
                      label={KRW(toSafeNumber(r?.revenue))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {formatPercentFromRoas(r?.roas, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
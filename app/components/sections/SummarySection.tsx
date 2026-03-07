"use client";

import { KRW } from "../../../src/lib/report/format";

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

// ===== 숫자/비율 안전 유틸 =====
const toNum = (v: any) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

// CTR/CVR: 2.42(%) 또는 0.0242(비율) 모두 허용
const toRate01 = (v: any) => {
  const n = toNum(v);
  return n > 1 ? n / 100 : n;
};

// ROAS: 1.246(비율)도 정상. 10 초과면 퍼센트(124.6)로 보고 /100
const toRoas01 = (v: any) => {
  const n = toNum(v);
  return n > 10 ? n / 100 : n;
};

// 증감율(%). 분모 0이면 null
const diffPct = (cur: any, prev: any) => {
  const c = toNum(cur);
  const p = toNum(prev);
  if (p === 0) return null;
  return (c - p) / p;
};

const TH_CLASS =
  "px-4 py-3 text-right text-sm font-semibold text-gray-700 whitespace-nowrap";
const TD_CLASS =
  "px-4 py-4 text-right text-sm text-gray-800 whitespace-nowrap align-middle";
const FIRST_TH_CLASS =
  "px-4 py-3 text-left text-sm font-semibold text-gray-700 whitespace-nowrap";
const FIRST_TD_CLASS =
  "px-4 py-4 text-left text-sm font-medium text-gray-800 whitespace-nowrap align-middle";

export default function SummarySection(props: Props) {
  const {
    totals,
    byMonth,
    byWeekOnly,
    byWeekChart,
    bySource,
  } = props;

  // ✅ 안전 배열 처리
  const months = Array.isArray(byMonth) ? byMonth : [];
  const weeks = Array.isArray(byWeekOnly) ? byWeekOnly : [];
  const weekChartData = Array.isArray(byWeekChart) ? byWeekChart : [];
  const sources = Array.isArray(bySource) ? bySource : [];

  // label이 "2022년 7월 4주차" 형태면 정렬용 키를 만들어줌
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

  // ✅ 표 렌더/증감 계산 모두 같은 정렬 배열 사용
  const sortedWeeks = [...weeks].sort((a, b) =>
    weekSortKey(a).localeCompare(weekSortKey(b))
  );

  const prevWeekSorted = sortedWeeks.at(-2);
  const lastWeekSorted = sortedWeeks.at(-1);

  // ✅ 주차표 막대그래프용 Max
  const maxImpr = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toNum(r?.impressions ?? r?.impr))
  );
  const maxClicks = Math.max(0, ...sortedWeeks.map((r: any) => toNum(r?.clicks)));
  const maxCost = Math.max(0, ...sortedWeeks.map((r: any) => toNum(r?.cost)));
  const maxConv = Math.max(
    0,
    ...sortedWeeks.map((r: any) => toNum(r?.conversions ?? r?.conv))
  );
  const maxRev = Math.max(0, ...sortedWeeks.map((r: any) => toNum(r?.revenue)));

  // ✅ 소스별 표 막대그래프용 Max
  const srcMaxImpr = Math.max(
    0,
    ...sources.map((r: any) => toNum(r?.impressions ?? r?.impr))
  );
  const srcMaxClicks = Math.max(0, ...sources.map((r: any) => toNum(r?.clicks)));
  const srcMaxCost = Math.max(0, ...sources.map((r: any) => toNum(r?.cost)));
  const srcMaxConv = Math.max(
    0,
    ...sources.map((r: any) => toNum(r?.conversions ?? r?.conv))
  );
  const srcMaxRev = Math.max(0, ...sources.map((r: any) => toNum(r?.revenue)));

  return (
    <>
      {/* 기간 성과 */}
      <div className="mt-10 mb-3">
        <h2 className="text-lg font-semibold">기간 성과</h2>
      </div>

      {/* KPI */}
      <SummaryKPI totals={totals} />

      {/* 월별 성과 */}
      <SummaryTable byMonth={months} />

      {/* 주차별 표 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">주차별 성과 (최근 5주)</h2>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
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

            <thead className="bg-gray-50">
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
                <tr className="bg-gray-100 font-medium border-t border-gray-200">
                  <td className={`${FIRST_TD_CLASS} truncate`}>
                    증감(최근주-전주)
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(
                        lastWeekSorted?.impressions,
                        prevWeekSorted?.impressions
                      )}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(lastWeekSorted?.clicks, prevWeekSorted?.clicks)}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(
                        toRate01(lastWeekSorted?.ctr),
                        toRate01(prevWeekSorted?.ctr)
                      )}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(lastWeekSorted?.cpc, prevWeekSorted?.cpc)}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(lastWeekSorted?.cost, prevWeekSorted?.cost)}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(
                        lastWeekSorted?.conversions,
                        prevWeekSorted?.conversions
                      )}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(
                        toRate01(lastWeekSorted?.cvr),
                        toRate01(prevWeekSorted?.cvr)
                      )}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(lastWeekSorted?.cpa, prevWeekSorted?.cpa)}
                      digits={2}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(lastWeekSorted?.revenue, prevWeekSorted?.revenue)}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <TrendCell
                      v={diffPct(
                        toRoas01(lastWeekSorted?.roas),
                        toRoas01(prevWeekSorted?.roas)
                      )}
                      digits={2}
                    />
                  </td>
                </tr>
              )}

              {sortedWeeks.map((w: any, idx: number) => (
                <tr
                  key={w?.weekKey ?? `${weekSortKey(w)}-${idx}`}
                  className="border-t border-gray-200"
                >
                  <td className={`${FIRST_TD_CLASS} truncate`} title={String(w?.label ?? "")}>
                    {w?.label}
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(w?.impressions ?? w?.impr)}
                      max={maxImpr}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell value={toNum(w?.clicks)} max={maxClicks} />
                  </td>

                  <td className={TD_CLASS}>
                    {(toRate01(w?.ctr) * 100).toFixed(2)}%
                  </td>

                  <td className={TD_CLASS}>{KRW(toNum(w?.cpc))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(w?.cost)}
                      max={maxCost}
                      label={KRW(toNum(w?.cost))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(w?.conversions ?? w?.conv)}
                      max={maxConv}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {(toRate01(w?.cvr) * 100).toFixed(2)}%
                  </td>

                  <td className={TD_CLASS}>{KRW(toNum(w?.cpa))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(w?.revenue)}
                      max={maxRev}
                      label={KRW(toNum(w?.revenue))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {(toRoas01(w?.roas) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 주간 차트 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">최근 5주 주간 성과</h2>
        <SummaryChart data={weekChartData} />
      </section>

      {/* 소스별 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">소스별 요약</h2>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
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

            <thead className="bg-gray-50 text-gray-600">
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
                <tr key={r?.source ?? idx} className="border-t border-gray-200">
                  <td
                    className={`${FIRST_TD_CLASS} truncate`}
                    title={String(r?.source ?? "")}
                  >
                    {r?.source}
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(r?.impressions ?? r?.impr)}
                      max={srcMaxImpr}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell value={toNum(r?.clicks)} max={srcMaxClicks} />
                  </td>

                  <td className={TD_CLASS}>
                    {(toRate01(r?.ctr) * 100).toFixed(2)}%
                  </td>

                  <td className={TD_CLASS}>{KRW(toNum(r?.cpc))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(r?.cost)}
                      max={srcMaxCost}
                      label={KRW(toNum(r?.cost))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(r?.conversions ?? r?.conv)}
                      max={srcMaxConv}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {(toRate01(r?.cvr) * 100).toFixed(2)}%
                  </td>

                  <td className={TD_CLASS}>{KRW(toNum(r?.cpa))}</td>

                  <td className={TD_CLASS}>
                    <DataBarCell
                      value={toNum(r?.revenue)}
                      max={srcMaxRev}
                      label={KRW(toNum(r?.revenue))}
                    />
                  </td>

                  <td className={TD_CLASS}>
                    {(toRoas01(r?.roas) * 100).toFixed(1)}%
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
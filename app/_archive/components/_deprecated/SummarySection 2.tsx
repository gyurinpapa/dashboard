"use client";

import { useMemo } from "react";

import KPI from "../../../components/ui/KPI";
import InsightBox from "../../../components/ui/InsightBox"; // (남겨도 되고, 안 쓰면 지워도 됨)
import { KRW } from "../../../../src/lib/report/format";

import SummaryChart from "./summary/SummaryChart";
import SummaryKPI from "./summary/SummaryKPI";
import SummaryTable from "./summary/SummaryTable";
import SummaryGoal from "./summary/SummaryGoal";
import SummaryInsight from "./summary/SummaryInsight"; // ✅ 추가
import TrendCell from "../../../components/ui/TrendCell";

type Props = {
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: any; // ✅ string 고정 X (배열/객체일 수도 있어서 any로)

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
  return isFinite(n) ? n : 0;
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

export default function SummarySection(props: Props) {
  const {
    currentMonthKey,
    currentMonthActual,
    currentMonthGoalComputed,
    monthGoal,
    setMonthGoal,
    monthGoalInsight,
    totals,
    byMonth,
    byWeekOnly,
    byWeekChart,
    bySource,
  } = props;

  // ✅ 주차 데이터 배열 안전 처리
  const weeks = Array.isArray(byWeekOnly) ? byWeekOnly : [];

  // label이 "2022년 7월 4주차" 형태면 정렬용 키를 만들어줌
  const weekSortKey = (w: any) => {
    const k = w.weekKey ?? w.startDate ?? w.weekStart ?? w.dateKey;
    if (k) return String(k);

    const m = String(w.label ?? "").match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})주차/);
    if (!m) return String(w.label ?? "");
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const wk = m[3].padStart(2, "0");
    return `${y}-${mo}-${wk}`;
  };

  const sortedWeeks = [...weeks].sort((a, b) => weekSortKey(a).localeCompare(weekSortKey(b)));
  const prevWeekSorted = sortedWeeks.at(-2);
  const lastWeekSorted = sortedWeeks.at(-1);

  return (
    <>
      {/* ✅ 당월 목표/결과/진도율 (목표 인사이트만) */}
      {/* (현재 파일에서는 SummaryGoal을 렌더링하지 않고 있었음. 필요하면 여기에 넣으면 됨) */}

      {/* 기간 성과 */}
      <div className="mt-10 mb-3">
        <h2 className="text-lg font-semibold">기간 성과</h2>
      </div>

      {/* KPI */}
      <SummaryKPI totals={totals} />

      {/* 월별 성과 */}
      <SummaryTable byMonth={byMonth} />

      {/* 주차별 표 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">주차별 성과 (최근 5주)</h2>

        <div className="overflow-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Week</th>
                <th className="text-right p-3">Impr</th>
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">CTR</th>
                <th className="text-right p-3">CPC</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Conv</th>
                <th className="text-right p-3">CVR</th>
                <th className="text-right p-3">CPA</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {lastWeekSorted && prevWeekSorted && (
                <tr className="bg-gray-100 font-medium">
                  <td className="p-3">증감(최근주-전주)</td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.impressions, prevWeekSorted.impressions)} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.clicks, prevWeekSorted.clicks)} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(toRate01(lastWeekSorted.ctr), toRate01(prevWeekSorted.ctr))} digits={2} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.cpc, prevWeekSorted.cpc)} digits={2} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.cost, prevWeekSorted.cost)} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.conversions, prevWeekSorted.conversions)} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(toRate01(lastWeekSorted.cvr), toRate01(prevWeekSorted.cvr))} digits={2} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.cpa, prevWeekSorted.cpa)} digits={2} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(lastWeekSorted.revenue, prevWeekSorted.revenue)} />
                  </td>

                  <td className="p-3 text-right">
                    <TrendCell v={diffPct(toRoas01(lastWeekSorted.roas), toRoas01(prevWeekSorted.roas))} digits={2} />
                  </td>
                </tr>
              )}

              {weeks.map((w: any, idx: number) => (
                <tr key={w.weekKey ?? `${weekSortKey(w)}-${idx}`} className="border-t">
                  <td className="p-3 font-medium">{w.label}</td>
                  <td className="p-3 text-right">{toNum(w.impressions).toLocaleString()}</td>
                  <td className="p-3 text-right">{toNum(w.clicks).toLocaleString()}</td>
                  <td className="p-3 text-right">{(toRate01(w.ctr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(w.cpc))}</td>
                  <td className="p-3 text-right">{KRW(toNum(w.cost))}</td>
                  <td className="p-3 text-right">{toNum(w.conversions).toLocaleString()}</td>
                  <td className="p-3 text-right">{(toRate01(w.cvr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(w.cpa))}</td>
                  <td className="p-3 text-right">{KRW(toNum(w.revenue))}</td>
                  <td className="p-3 text-right">{(toRoas01(w.roas) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 주간 차트 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">최근 5주 주간 성과</h2>
        <SummaryChart data={byWeekChart} />
      </section>

      {/* 소스별 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">소스별 요약</h2>

        <div className="overflow-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Source</th>
                <th className="text-right p-3">Impr</th>
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">CTR</th>
                <th className="text-right p-3">CPC</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Conv</th>
                <th className="text-right p-3">CVR</th>
                <th className="text-right p-3">CPA</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {(Array.isArray(bySource) ? bySource : []).map((r: any, idx: number) => (
                <tr key={r.source ?? idx} className="border-t">
                  <td className="p-3 font-medium">{r.source}</td>
                  <td className="p-3 text-right">{toNum(r.impressions).toLocaleString()}</td>
                  <td className="p-3 text-right">{toNum(r.clicks).toLocaleString()}</td>
                  <td className="p-3 text-right">{(toRate01(r.ctr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cpc))}</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cost))}</td>
                  <td className="p-3 text-right">{toNum(r.conversions).toLocaleString()}</td>
                  <td className="p-3 text-right">{(toRate01(r.cvr) * 100).toFixed(2)}%</td>
                  <td className="p-3 text-right">{KRW(toNum(r.cpa))}</td>
                  <td className="p-3 text-right">{KRW(toNum(r.revenue))}</td>
                  <td className="p-3 text-right">{(toRoas01(r.roas) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ✅ 요약 인사이트 (구조탭과 동일하게 InsightBox 기반으로 렌더) */}
      <section className="mt-6">
        <SummaryInsight monthGoalInsight={monthGoalInsight} />
      </section>
    </>
  );
}

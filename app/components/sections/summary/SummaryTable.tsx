"use client";

import TrendCell from "../../ui/TrendCell";
import { KRW } from "../../../lib/report/format";
import DataBarCell from "../../ui/DataBarCell";


type Props = {
  byMonth: any[];
};

// 숫자 파싱 (문자열/₩/,% 등 안전 처리)
const toNum = (v: any) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};

// CTR/CVR: 2.42(%) 또는 0.0242(비율) 모두 허용 → 0~1 비율로 통일
const toRate01 = (v: any) => {
  const n = toNum(v);
  return n > 1 ? n / 100 : n;
};

// ROAS: 124.6(%) 또는 1.246(비율) 모두 허용 → 비율로 통일
const toRoas01 = (v: any) => {
  const n = toNum(v);
  return n > 10 ? n / 100 : n;
};

// 월 키 정규화: "2022-7", "2022/07", "2022.07" → "2022-07"
const monthKey = (m: any) => {
  const k = m.monthKey ?? m.month ?? m.key ?? m.label;
  if (!k) return "";
  const s = String(k);
  const match = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (!match) return s;
  return `${match[1]}-${match[2].padStart(2, "0")}`;
};

/**
 * 증감 계산 (비율 반환)
 * TrendCell이 내부에서 *100 해서 "-21.65%"처럼 출력하게끔 "비율"로 맞춤
 */
const diffPctRatio = (cur: any, prev: any) => {
  const c = toNum(cur);
  const p = toNum(prev);
  if (!isFinite(c) || !isFinite(p) || p === 0) return null;
  return (c - p) / p; // ✅ 비율
};

export default function SummaryTable({ byMonth }: Props) {
  const months = Array.isArray(byMonth) ? byMonth : [];

  // ✅ 최근월 → 전월 → 전전월 (내림차순)
  const sortedMonths = [...months].sort((a, b) =>
    monthKey(b).localeCompare(monthKey(a))
  );

  // ✅ 증감: 최근월(0) vs 전월(1)
  const lastMonth = sortedMonths[0];
  const prevMonth = sortedMonths[1];

  const maxImpr = Math.max(...byMonth.map(r => r.impressions || 0));
  const maxClicks = Math.max(...byMonth.map(r => r.clicks || 0));
  const maxCost = Math.max(...byMonth.map(r => r.cost || 0));
  const maxConv = Math.max(...byMonth.map(r => r.conversions || 0));
  const maxRev = Math.max(...byMonth.map(r => r.revenue || 0));


  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold mb-3">월별 성과 (최근 3개월)</h2>

      <div className="overflow-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left p-3">Month</th>
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
            {lastMonth && prevMonth && (
              <tr className="bg-gray-100 font-medium">
                <td className="p-3">증감(최근월-전월)</td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.impressions, prevMonth.impressions)} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.clicks, prevMonth.clicks)} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell
                    v={diffPctRatio(toRate01(lastMonth.ctr), toRate01(prevMonth.ctr))}
                    digits={2}
                  />
                </td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.cpc, prevMonth.cpc)} digits={2} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.cost, prevMonth.cost)} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.conversions, prevMonth.conversions)} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell
                    v={diffPctRatio(toRate01(lastMonth.cvr), toRate01(prevMonth.cvr))}
                    digits={2}
                  />
                </td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.cpa, prevMonth.cpa)} digits={2} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell v={diffPctRatio(lastMonth.revenue, prevMonth.revenue)} />
                </td>

                <td className="p-3 text-right">
                  <TrendCell
                    v={diffPctRatio(toRoas01(lastMonth.roas), toRoas01(prevMonth.roas))}
                    digits={2}
                  />
                </td>
              </tr>
            )}

            {sortedMonths.map((row: any, idx: number) => (
              <tr key={row?.monthKey ?? row?.month ?? row?.label ?? idx} className="border-t">
                <td className="text-left p-3">{row?.month ?? row?.label ?? "-"}</td>

                <td className="p-3">
                    <DataBarCell
                        value={row?.impressions ?? row?.impr ?? 0}
                        max={maxImpr}
                    />
                    </td>


                <td className="p-3">
                    <DataBarCell
                        value={row?.clicks ?? 0}
                        max={maxClicks}
                    />
                    </td>


                <td className="p-3 text-right">{(toRate01(row?.ctr) * 100).toFixed(2)}%</td>

                {/* ✅ 원화 표기 통일 */}
                <td className="text-right p-3">{KRW(row?.cpc)}</td>
                <td className="p-3">
                    <DataBarCell
                        value={row?.cost ?? 0}
                        max={maxCost}
                        label={KRW(row?.cost)}
                    />
                    </td>


                <td className="p-3">
                    <DataBarCell
                        value={row?.conversions ?? row?.conv ?? 0}
                        max={maxConv}
                    />
                    </td>


                <td className="p-3 text-right">{(toRate01(row?.cvr) * 100).toFixed(2)}%</td>

                {/* ✅ 원화 표기 통일 */}
                <td className="text-right p-3">{KRW(row?.cpa)}</td>
                <td className="p-3">
                    <DataBarCell
                        value={row?.revenue ?? 0}
                        max={maxRev}
                        label={KRW(row?.revenue)}
                    />
                    </td>


                <td className="p-3 text-right">{(toRoas01(row?.roas) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

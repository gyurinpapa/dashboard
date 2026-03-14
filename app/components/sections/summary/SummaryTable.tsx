"use client";

import TrendCell from "../../ui/TrendCell";
import { KRW } from "../../../../src/lib/report/format";
import DataBarCell from "../../ui/DataBarCell";

type Props = {
  byMonth: any[];
};

const toNum = (v: any) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};

const toRate01 = (v: any) => {
  const n = toNum(v);
  return n > 1 ? n / 100 : n;
};

const toRoas01 = (v: any) => {
  const n = toNum(v);
  return n > 10 ? n / 100 : n;
};

const monthKey = (m: any) => {
  const k = m.monthKey ?? m.month ?? m.key ?? m.label;
  if (!k) return "";
  const s = String(k);
  const match = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (!match) return s;
  return `${match[1]}-${match[2].padStart(2, "0")}`;
};

const diffPctRatio = (cur: any, prev: any) => {
  const c = toNum(cur);
  const p = toNum(prev);
  if (!isFinite(c) || !isFinite(p) || p === 0) return null;
  return (c - p) / p;
};

export default function SummaryTable({ byMonth }: Props) {
  const months = Array.isArray(byMonth) ? byMonth : [];

  const sortedMonths = [...months].sort((a, b) =>
    monthKey(b).localeCompare(monthKey(a))
  );

  const lastMonth = sortedMonths[0];
  const prevMonth = sortedMonths[1];

  const maxImpr = Math.max(...byMonth.map((r) => r.impressions || 0));
  const maxClicks = Math.max(...byMonth.map((r) => r.clicks || 0));
  const maxCost = Math.max(...byMonth.map((r) => r.cost || 0));
  const maxConv = Math.max(...byMonth.map((r) => r.conversions || 0));
  const maxRev = Math.max(...byMonth.map((r) => r.revenue || 0));

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">
          월별 성과 (최근 3개월)
        </h2>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600 backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3.5 font-semibold">Month</th>
                <th className="text-right px-4 py-3.5 font-semibold">Impr</th>
                <th className="text-right px-4 py-3.5 font-semibold">Clicks</th>
                <th className="text-right px-4 py-3.5 font-semibold">CTR</th>
                <th className="text-right px-4 py-3.5 font-semibold">CPC</th>
                <th className="text-right px-4 py-3.5 font-semibold">Cost</th>
                <th className="text-right px-4 py-3.5 font-semibold">Conv</th>
                <th className="text-right px-4 py-3.5 font-semibold">CVR</th>
                <th className="text-right px-4 py-3.5 font-semibold">CPA</th>
                <th className="text-right px-4 py-3.5 font-semibold">Revenue</th>
                <th className="text-right px-4 py-3.5 font-semibold">ROAS</th>
              </tr>
            </thead>

            <tbody>
              {lastMonth && prevMonth && (
                <tr className="border-b border-gray-200 bg-slate-50/90 font-medium text-gray-800">
                  <td className="px-4 py-3.5">증감(최근월-전월)</td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(lastMonth.impressions, prevMonth.impressions)}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell v={diffPctRatio(lastMonth.clicks, prevMonth.clicks)} />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(toRate01(lastMonth.ctr), toRate01(prevMonth.ctr))}
                      digits={2}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(lastMonth.cpc, prevMonth.cpc)}
                      digits={2}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell v={diffPctRatio(lastMonth.cost, prevMonth.cost)} />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(lastMonth.conversions, prevMonth.conversions)}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(toRate01(lastMonth.cvr), toRate01(prevMonth.cvr))}
                      digits={2}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(lastMonth.cpa, prevMonth.cpa)}
                      digits={2}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell v={diffPctRatio(lastMonth.revenue, prevMonth.revenue)} />
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <TrendCell
                      v={diffPctRatio(toRoas01(lastMonth.roas), toRoas01(prevMonth.roas))}
                      digits={2}
                    />
                  </td>
                </tr>
              )}

              {sortedMonths.map((row: any, idx: number) => (
                <tr
                  key={row?.monthKey ?? row?.month ?? row?.label ?? idx}
                  className="border-t border-gray-200 even:bg-gray-50/60 hover:bg-blue-50/40 transition-colors"
                >
                  <td className="text-left px-4 py-3.5 font-medium text-gray-900">
                    {row?.month ?? row?.label ?? "-"}
                  </td>

                  <td className="px-4 py-3.5">
                    <DataBarCell
                      value={row?.impressions ?? row?.impr ?? 0}
                      max={maxImpr}
                    />
                  </td>

                  <td className="px-4 py-3.5">
                    <DataBarCell value={row?.clicks ?? 0} max={maxClicks} />
                  </td>

                  <td className="px-4 py-3.5 text-right text-gray-700">
                    {(toRate01(row?.ctr) * 100).toFixed(2)}%
                  </td>

                  <td className="text-right px-4 py-3.5 text-gray-700">
                    {KRW(row?.cpc)}
                  </td>

                  <td className="px-4 py-3.5">
                    <DataBarCell
                      value={row?.cost ?? 0}
                      max={maxCost}
                      label={KRW(row?.cost)}
                    />
                  </td>

                  <td className="px-4 py-3.5">
                    <DataBarCell
                      value={row?.conversions ?? row?.conv ?? 0}
                      max={maxConv}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right text-gray-700">
                    {(toRate01(row?.cvr) * 100).toFixed(2)}%
                  </td>

                  <td className="text-right px-4 py-3.5 text-gray-700">
                    {KRW(row?.cpa)}
                  </td>

                  <td className="px-4 py-3.5">
                    <DataBarCell
                      value={row?.revenue ?? 0}
                      max={maxRev}
                      label={KRW(row?.revenue)}
                    />
                  </td>

                  <td className="px-4 py-3.5 text-right text-gray-700">
                    {(toRoas01(row?.roas) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
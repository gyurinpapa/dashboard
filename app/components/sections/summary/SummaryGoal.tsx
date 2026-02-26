"use client";

import { useEffect, useState } from "react";
import { progressRate, formatNumber, KRW, parseNumberInput } from "../../../../src/lib/report/format";

type Props = {
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;

  monthGoal: any;
  setMonthGoal: any;

  monthGoalInsight: string;
};

export default function SummaryGoal({
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
}: Props) {
  // ✅ Hydration mismatch 방지: 첫 렌더(SSR/초기)에서는 0으로 통일, 마운트 후 계산
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const goalImpr = mounted ? Number(monthGoal?.impressions ?? 0) : 0;
  const goalClicks = mounted ? Number(monthGoal?.clicks ?? 0) : 0;
  const goalCost = mounted ? Number(monthGoal?.cost ?? 0) : 0;
  const goalConv = mounted ? Number(monthGoal?.conversions ?? 0) : 0;
  const goalRev = mounted ? Number(monthGoal?.revenue ?? 0) : 0;

  const goalCTR = goalImpr > 0 ? goalClicks / goalImpr : 0;
  const goalCPC = goalClicks > 0 ? goalCost / goalClicks : 0;
  const goalCVR = goalClicks > 0 ? goalConv / goalClicks : 0;
  const goalCPA = goalConv > 0 ? goalCost / goalConv : 0;
  const goalROAS = goalCost > 0 ? goalRev / goalCost : 0;

  const pct2 = (v: any) => {
    const n = Number(v);
    const safe = Number.isFinite(n) ? n : 0;
    return (safe * 100).toFixed(2) + "%";
  };

  const pct1 = (v: any) => {
    const n = Number(v);
    const safe = Number.isFinite(n) ? n : 0;
    return (safe * 100).toFixed(1) + "%";
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">목표 입력 &amp; 달성 현황</h2>

      <div className="overflow-auto border-3 border-gray-900 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left p-3 w-[120px]">구분</th>
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
            {/* 1) 목표 (수기입력) */}
            <tr className="border-t">
              <td className="p-3 font-medium">목표</td>

              <td className="p-3 text-right align-middle">
                <input
                  className="w-full text-right border rounded-md px-2 py-1"
                  value={formatNumber(monthGoal?.impressions ?? 0)}
                  onChange={(e) =>
                    setMonthGoal((p: any) => ({
                      ...p,
                      impressions: parseNumberInput(e.target.value),
                    }))
                  }
                />
              </td>

              <td className="p-3 text-right align-middle">
                <input
                  className="w-full text-right border rounded-md px-2 py-1"
                  value={formatNumber(monthGoal?.clicks ?? 0)}
                  onChange={(e) =>
                    setMonthGoal((p: any) => ({
                      ...p,
                      clicks: parseNumberInput(e.target.value),
                    }))
                  }
                />
              </td>

              <td className="p-3 text-right">{((mounted ? goalCTR : 0) * 100).toFixed(2)}%</td>
              <td className="p-3 text-right">{KRW(goalCPC)}</td>

              <td className="p-3 text-right align-middle">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
                  <input
                    className="w-full text-right border rounded-md pl-6 pr-2 py-1"
                    value={formatNumber(monthGoal?.cost ?? 0)}
                    onChange={(e) =>
                      setMonthGoal((p: any) => ({
                        ...p,
                        cost: parseNumberInput(e.target.value),
                      }))
                    }
                  />
                </div>
              </td>

              <td className="p-3 text-right align-middle">
                <input
                  className="w-full text-right border rounded-md px-2 py-1"
                  value={formatNumber(monthGoal?.conversions ?? 0)}
                  onChange={(e) =>
                    setMonthGoal((p: any) => ({
                      ...p,
                      conversions: parseNumberInput(e.target.value),
                    }))
                  }
                />
              </td>

              <td className="p-3 text-right">{((mounted ? goalCVR : 0) * 100).toFixed(2)}%</td>
              <td className="p-3 text-right">{KRW(goalCPA)}</td>

              <td className="p-3 text-right align-middle">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
                  <input
                    className="w-full text-right border rounded-md pl-6 pr-2 py-1"
                    value={formatNumber(monthGoal?.revenue ?? 0)}
                    onChange={(e) =>
                      setMonthGoal((p: any) => ({
                        ...p,
                        revenue: parseNumberInput(e.target.value),
                      }))
                    }
                  />
                </div>
              </td>

              <td className="p-3 text-right">{((mounted ? goalROAS : 0) * 100).toFixed(1)}%</td>
            </tr>

            {/* 2) 결과(실적) */}
            <tr className="border-t bg-gray-50">
              <td className="p-3 font-bold text-gray-900">결과</td>

              <td className="p-3 text-right font-semibold text-gray-900">
                {formatNumber(currentMonthActual?.impressions ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-gray-900">
                {formatNumber(currentMonthActual?.clicks ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-blue-600">
                {pct2(currentMonthActual?.ctr ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-gray-900">
                {KRW(currentMonthActual?.cpc ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-gray-900">
                {KRW(currentMonthActual?.cost ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-gray-900">
                {formatNumber(currentMonthActual?.conversions ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-blue-600">
                {pct2(currentMonthActual?.cvr ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-gray-900">
                {KRW(currentMonthActual?.cpa ?? 0)}
              </td>

              <td className="p-3 text-right font-semibold text-green-600">
                {KRW(currentMonthActual?.revenue ?? 0)}
              </td>

              <td className="p-3 text-right font-bold text-orange-600">
                {pct1(currentMonthActual?.roas ?? 0)}
              </td>
            </tr>

            {/* 3) 달성률 (결과 / 목표) */}
            <tr className="border-t bg-gray-50">
              <td className="p-3 font-medium">달성률</td>
              <td className="p-3 text-right">{pct1(progressRate(currentMonthActual?.impressions, currentMonthGoalComputed?.impressions))}</td>
              <td className="p-3 text-right">{pct1(progressRate(currentMonthActual?.clicks, currentMonthGoalComputed?.clicks))}</td>
              <td className="p-3 text-right text-gray-400">-</td>
              <td className="p-3 text-right text-gray-400">-</td>
              <td className="p-3 text-right">{pct1(progressRate(currentMonthActual?.cost, currentMonthGoalComputed?.cost))}</td>
              <td className="p-3 text-right">{pct1(progressRate(currentMonthActual?.conversions, currentMonthGoalComputed?.conversions))}</td>
              <td className="p-3 text-right text-gray-400">-</td>
              <td className="p-3 text-right text-gray-400">-</td>
              <td className="p-3 text-right">{pct1(progressRate(currentMonthActual?.revenue, currentMonthGoalComputed?.revenue))}</td>
              <td className="p-3 text-right text-gray-400">-</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-2">
  * 목표&달성현황은 필터의 영향을 받지 않습니다.
</p>

      {/* 인사이트*/}
      {monthGoalInsight ? (
        <div className="mt-6">
          <div className="border rounded-xl p-4 bg-white">
            <div className="text-sm text-gray-600 mb-1">요약 인사이트</div>
            <div className="text-gray-900 whitespace-pre-wrap">{monthGoalInsight}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

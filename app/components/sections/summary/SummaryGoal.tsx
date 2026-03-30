"use client";

import { useEffect, useState } from "react";
import {
  progressRate,
  formatNumber,
  KRW,
  parseNumberInput,
} from "../../../../src/lib/report/format";

type Props = {
  reportType?: "commerce" | "traffic";
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: string;
};

export default function SummaryGoal({
  reportType,
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
}: Props) {
  const isTraffic = reportType === "traffic";
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

  const headClass =
    "whitespace-nowrap px-4 py-3.5 text-right text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600";
  const firstHeadClass =
    "whitespace-nowrap px-4 py-3.5 text-left text-[12px] font-semibold uppercase tracking-[0.04em] text-gray-600";
  const tdClass =
    "whitespace-nowrap px-4 py-3.5 text-right text-sm text-slate-800 align-middle";
  const firstTdClass =
    "whitespace-nowrap px-4 py-3.5 text-left text-sm font-medium text-slate-900 align-middle";

  const inputClass =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400";

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          목표 입력 &amp; 달성 현황
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          월 목표값을 입력하고 현재 실적 및 달성률을 확인합니다.
        </p>
      </div>

      <div className="overflow-auto rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <table
          className={[
            "w-full text-sm",
            isTraffic ? "min-w-[760px]" : "min-w-[1320px]",
          ].join(" ")}
        >
          <thead className="border-b border-slate-200 bg-gray-50/95">
            <tr>
              <th className={`${firstHeadClass} w-[120px]`}>구분</th>
              <th className={headClass}>Impr</th>
              <th className={headClass}>Clicks</th>
              <th className={headClass}>CTR</th>
              <th className={headClass}>CPC</th>
              <th className={headClass}>Cost</th>
              {!isTraffic && <th className={headClass}>Conv</th>}
              {!isTraffic && <th className={headClass}>CVR</th>}
              {!isTraffic && <th className={headClass}>CPA</th>}
              {!isTraffic && <th className={headClass}>Revenue</th>}
              {!isTraffic && <th className={headClass}>ROAS</th>}
            </tr>
          </thead>

          <tbody>
            <tr className="border-t border-slate-200">
              <td className={firstTdClass}>목표</td>

              <td className={tdClass}>
                <input
                  className={inputClass}
                  value={formatNumber(monthGoal?.impressions ?? 0)}
                  onChange={(e) =>
                    setMonthGoal((p: any) => ({
                      ...p,
                      impressions: parseNumberInput(e.target.value),
                    }))
                  }
                />
              </td>

              <td className={tdClass}>
                <input
                  className={inputClass}
                  value={formatNumber(monthGoal?.clicks ?? 0)}
                  onChange={(e) =>
                    setMonthGoal((p: any) => ({
                      ...p,
                      clicks: parseNumberInput(e.target.value),
                    }))
                  }
                />
              </td>

              <td className={tdClass}>
                {((mounted ? goalCTR : 0) * 100).toFixed(2)}%
              </td>

              <td className={tdClass}>{KRW(goalCPC)}</td>

              <td className={tdClass}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    ₩
                  </span>
                  <input
                    className={`${inputClass} pl-7`}
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

              {!isTraffic && (
                <td className={tdClass}>
                  <input
                    className={inputClass}
                    value={formatNumber(monthGoal?.conversions ?? 0)}
                    onChange={(e) =>
                      setMonthGoal((p: any) => ({
                        ...p,
                        conversions: parseNumberInput(e.target.value),
                      }))
                    }
                  />
                </td>
              )}

              {!isTraffic && (
                <td className={tdClass}>
                  {((mounted ? goalCVR : 0) * 100).toFixed(2)}%
                </td>
              )}

              {!isTraffic && <td className={tdClass}>{KRW(goalCPA)}</td>}

              {!isTraffic && (
                <td className={tdClass}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      ₩
                    </span>
                    <input
                      className={`${inputClass} pl-7`}
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
              )}

              {!isTraffic && (
                <td className={tdClass}>
                  {((mounted ? goalROAS : 0) * 100).toFixed(1)}%
                </td>
              )}
            </tr>

            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td className="whitespace-nowrap px-4 py-3.5 text-left text-sm font-bold text-slate-900">
                결과
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                {formatNumber(currentMonthActual?.impressions ?? 0)}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                {formatNumber(currentMonthActual?.clicks ?? 0)}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-blue-600">
                {pct2(currentMonthActual?.ctr ?? 0)}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                {KRW(currentMonthActual?.cpc ?? 0)}
              </td>

              <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                {KRW(currentMonthActual?.cost ?? 0)}
              </td>

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                  {formatNumber(currentMonthActual?.conversions ?? 0)}
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-blue-600">
                  {pct2(currentMonthActual?.cvr ?? 0)}
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-slate-900">
                  {KRW(currentMonthActual?.cpa ?? 0)}
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold text-emerald-600">
                  {KRW(currentMonthActual?.revenue ?? 0)}
                </td>
              )}

              {!isTraffic && (
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-bold text-orange-600">
                  {pct1(currentMonthActual?.roas ?? 0)}
                </td>
              )}
            </tr>

            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td className={firstTdClass}>달성률</td>
              <td className={tdClass}>
                {pct1(
                  progressRate(
                    currentMonthActual?.impressions,
                    currentMonthGoalComputed?.impressions
                  )
                )}
              </td>
              <td className={tdClass}>
                {pct1(
                  progressRate(
                    currentMonthActual?.clicks,
                    currentMonthGoalComputed?.clicks
                  )
                )}
              </td>
              <td className={`${tdClass} text-slate-400`}>-</td>
              <td className={`${tdClass} text-slate-400`}>-</td>
              <td className={tdClass}>
                {pct1(
                  progressRate(
                    currentMonthActual?.cost,
                    currentMonthGoalComputed?.cost
                  )
                )}
              </td>

              {!isTraffic && (
                <td className={tdClass}>
                  {pct1(
                    progressRate(
                      currentMonthActual?.conversions,
                      currentMonthGoalComputed?.conversions
                    )
                  )}
                </td>
              )}

              {!isTraffic && <td className={`${tdClass} text-slate-400`}>-</td>}
              {!isTraffic && <td className={`${tdClass} text-slate-400`}>-</td>}

              {!isTraffic && (
                <td className={tdClass}>
                  {pct1(
                    progressRate(
                      currentMonthActual?.revenue,
                      currentMonthGoalComputed?.revenue
                    )
                  )}
                </td>
              )}

              {!isTraffic && <td className={`${tdClass} text-slate-400`}>-</td>}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        * 목표&달성현황은 필터의 영향을 받지 않습니다.
      </p>

      {monthGoalInsight ? (
        <div className="mt-6">
          <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-600">
              요약 인사이트
            </div>
            <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-900">
              {monthGoalInsight}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
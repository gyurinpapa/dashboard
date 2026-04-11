"use client";

import { useEffect, useMemo, useState } from "react";
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
  lastDataDate?: string;
};

function toSafeNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseLooseDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const rawNum = String(value);
    if (/^\d{8}$/.test(rawNum)) {
      const y = rawNum.slice(0, 4);
      const m = rawNum.slice(4, 6);
      const d = rawNum.slice(6, 8);
      const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const fullMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (fullMatch) {
    const y = fullMatch[1];
    const m = fullMatch[2].padStart(2, "0");
    const d = fullMatch[3].padStart(2, "0");
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const compactMatch = normalized.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (compactMatch) {
    const y = compactMatch[1];
    const m = compactMatch[2];
    const d = compactMatch[3];
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const direct = new Date(normalized.replace(" ", "T"));
  if (!Number.isNaN(direct.getTime())) return direct;

  return null;
}

function toYmd(date: Date | null) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthLastDate(monthKey: string): Date | null {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [yy, mm] = monthKey.split("-").map(Number);
  if (!yy || !mm) return null;
  return new Date(yy, mm, 0);
}

function getMonthKeyFromDate(date: Date | null) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function SummaryGoal({
  reportType,
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
  lastDataDate,
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
    "whitespace-nowrap px-2.5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.03em] text-slate-500";
  const firstHeadClass =
    "whitespace-nowrap px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.03em] text-slate-500";
  const tdClass =
    "whitespace-nowrap px-2.5 py-3 text-right text-[13px] text-slate-800 align-middle tabular-nums";
  const firstTdClass =
    "whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold text-slate-900 align-middle";

  const inputClass =
    "h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-right text-[13px] font-semibold text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(148,163,184,0.10)]";

  const {
    mainProgressRate,
    progressPercent,
    progressLastDateLabel,
    progressMonthEndLabel,
    progressBaseMonthKey,
    isCalendarProgressApplied,
  } = useMemo(() => {
    const fallback = clamp01(
      Number(
        progressRate(
          currentMonthActual?.cost,
          currentMonthGoalComputed?.cost
        ) ?? 0
      )
    );

    const parsedLastDataDate = parseLooseDate(lastDataDate);

    if (parsedLastDataDate) {
      const baseMonthKey = getMonthKeyFromDate(parsedLastDataDate);
      const monthEndDate = getMonthLastDate(baseMonthKey);

      if (monthEndDate) {
        const monthTotalDays = monthEndDate.getDate();
        const lastDay = parsedLastDataDate.getDate();
        const calendarRate =
          monthTotalDays > 0 ? clamp01(lastDay / monthTotalDays) : fallback;

        return {
          mainProgressRate: calendarRate,
          progressPercent: Math.round(calendarRate * 1000) / 10,
          progressLastDateLabel: toYmd(parsedLastDataDate),
          progressMonthEndLabel: toYmd(monthEndDate),
          progressBaseMonthKey: baseMonthKey,
          isCalendarProgressApplied: true,
        };
      }
    }

    const fallbackMonthEndDate = getMonthLastDate(currentMonthKey);

    return {
      mainProgressRate: fallback,
      progressPercent: Math.round(fallback * 1000) / 10,
      progressLastDateLabel: "",
      progressMonthEndLabel: fallbackMonthEndDate
        ? toYmd(fallbackMonthEndDate)
        : "",
      progressBaseMonthKey: currentMonthKey || "",
      isCalendarProgressApplied: false,
    };
  }, [currentMonthActual, currentMonthGoalComputed, currentMonthKey, lastDataDate]);

  const progressPercentSafe = clamp01(mainProgressRate) * 100;
  const runnerLeft = `calc(${progressPercentSafe}% - 18px)`;
  const isFinalSprint = mainProgressRate >= 0.85;
  const isMidSprint = mainProgressRate >= 0.45 && mainProgressRate < 0.85;
  const runnerFace = isFinalSprint ? "🙌" : isMidSprint ? "🥵" : "🏃";
  const runnerCaption = isFinalSprint
    ? "목표 지점 도착 직전"
    : isMidSprint
    ? "열심히 달리는 중"
    : "출발 후 페이스 업";

  const progressGuideText = isCalendarProgressApplied
    ? `${progressLastDateLabel} / ${progressMonthEndLabel} 기준`
    : "최신 데이터 기준";

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-slate-500 shadow-sm">
            🎯 MONTH GOAL
          </div>

          <h2 className="mt-3 text-[22px] font-semibold tracking-tight text-slate-900">
            목표 &amp; 달성 현황
          </h2>

          <p className="mt-1.5 text-sm leading-6 text-slate-500/90">
            월 목표값을 입력하고 현재 실적 및 달성률을 확인합니다.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
            Focus Month
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {currentMonthKey || "-"}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-white px-5 py-4">
          <div className="mx-auto max-w-[720px]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Monthly Progress Run
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  이번 달 목표를 향해 달리는 중
                </div>
                <div className="mt-1 text-[11px] font-medium text-slate-400">
                  {progressGuideText}
                </div>
                {progressBaseMonthKey ? (
                  <div className="mt-1 text-[11px] font-medium text-slate-400">
                    진행 기준 월: {progressBaseMonthKey}
                  </div>
                ) : null}
                {!isCalendarProgressApplied && lastDataDate ? (
                  <div className="mt-1 text-[11px] font-medium text-amber-600">
                    전달받은 lastDataDate: {String(lastDataDate)}
                  </div>
                ) : null}
              </div>

              <div className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                진행률 {progressPercent}%
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200/80 bg-gradient-to-r from-sky-50 via-white to-amber-50 px-4 py-4">
              <div className="relative h-[96px] overflow-hidden rounded-[18px] border border-slate-200/70 bg-white/80 px-4">
                <div className="pointer-events-none absolute inset-x-4 top-[18px] flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  <span>Start</span>
                  <span>Finish</span>
                </div>

                <div className="absolute inset-x-4 top-[42px] h-[10px] rounded-full bg-slate-100 shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400 transition-all duration-700 ease-out"
                    style={{ width: `${progressPercentSafe}%` }}
                  />
                </div>

                <div className="pointer-events-none absolute inset-x-4 top-[45px] flex items-center justify-between px-[6px]">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-white ring-1 ring-slate-200"
                    />
                  ))}
                </div>

                <div className="absolute left-4 top-[27px] z-[1] flex flex-col items-start gap-1">
                  <span className="text-[16px] leading-none drop-shadow-[0_2px_3px_rgba(15,23,42,0.16)]">
                    🚩
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    1일
                  </span>
                </div>

                <div
                  className="absolute top-[10px] z-10 transition-all duration-700 ease-out"
                  style={{ left: runnerLeft }}
                >
                  <div className="relative flex flex-col items-center">
                    {!isFinalSprint ? (
                      <span className="absolute -left-4 top-1 text-[11px] opacity-70 animate-pulse">
                        {isMidSprint ? "💨" : "✨"}
                      </span>
                    ) : (
                      <span className="absolute -left-5 -top-1 text-[12px] animate-bounce">
                        🎉
                      </span>
                    )}

                    <span
                      className={[
                        "relative z-10 inline-block text-[30px] leading-none drop-shadow-[0_6px_10px_rgba(15,23,42,0.22)]",
                        isFinalSprint
                          ? "animate-bounce"
                          : "animate-[bounce_1.8s_ease-in-out_infinite]",
                      ].join(" ")}
                    >
                      <span className="inline-block -scale-x-100">
                        {runnerFace}
                      </span>
                    </span>

                    <span className="absolute left-1/2 top-[24px] h-[8px] w-[24px] -translate-x-1/2 rounded-full bg-slate-900/10 blur-[2px]" />

                    <span className="mt-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      {runnerCaption}
                    </span>
                  </div>
                </div>

                <div className="absolute right-4 top-[12px] z-10 flex flex-col items-center">
                  <span
                    className={[
                      "inline-block text-[30px] leading-none drop-shadow-[0_6px_10px_rgba(15,23,42,0.18)] transition-all duration-500",
                      isFinalSprint ? "scale-110" : "scale-100 opacity-90",
                    ].join(" ")}
                  >
                    🏁
                  </span>
                  <span className="mt-1 h-[8px] w-[18px] rounded-full bg-slate-900/10 blur-[2px]" />
                </div>

                <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between text-[10px] font-medium text-slate-400">
                  <span>월 초</span>
                  <span>중간 점검</span>
                  <span>말일</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              {isTraffic ? (
                <>
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[16%]" />
                </>
              ) : (
                <>
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                </>
              )}
            </colgroup>

            <thead className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
              <tr>
                <th className={firstHeadClass}>구분</th>
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
              <tr className="border-t border-slate-200 bg-white">
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

                <td className={`${tdClass} font-semibold text-violet-600`}>
                  {((mounted ? goalCTR : 0) * 100).toFixed(2)}%
                </td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {KRW(goalCPC)}
                </td>

                <td className={tdClass}>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">
                      ₩
                    </span>
                    <input
                      className={`${inputClass} pl-6`}
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
                  <td className={`${tdClass} font-semibold text-violet-600`}>
                    {((mounted ? goalCVR : 0) * 100).toFixed(2)}%
                  </td>
                )}

                {!isTraffic && (
                  <td className={`${tdClass} font-semibold text-slate-900`}>
                    {KRW(goalCPA)}
                  </td>
                )}

                {!isTraffic && (
                  <td className={tdClass}>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">
                        ₩
                      </span>
                      <input
                        className={`${inputClass} pl-6`}
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
                  <td className={`${tdClass} font-semibold text-orange-600`}>
                    {((mounted ? goalROAS : 0) * 100).toFixed(1)}%
                  </td>
                )}
              </tr>

              <tr className="border-t border-slate-200 bg-gradient-to-r from-sky-50 via-blue-50 to-white">
                <td className="whitespace-nowrap px-3 py-3 text-left text-[13px] font-bold text-slate-900">
                  결과
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {formatNumber(currentMonthActual?.impressions ?? 0)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {formatNumber(currentMonthActual?.clicks ?? 0)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-violet-600 tabular-nums">
                  {pct2(currentMonthActual?.ctr ?? 0)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {KRW(currentMonthActual?.cpc ?? 0)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {KRW(currentMonthActual?.cost ?? 0)}
                </td>

                {!isTraffic && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                    {formatNumber(currentMonthActual?.conversions ?? 0)}
                  </td>
                )}

                {!isTraffic && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-violet-600 tabular-nums">
                    {pct2(currentMonthActual?.cvr ?? 0)}
                  </td>
                )}

                {!isTraffic && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                    {KRW(currentMonthActual?.cpa ?? 0)}
                  </td>
                )}

                {!isTraffic && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-emerald-600 tabular-nums">
                    {KRW(currentMonthActual?.revenue ?? 0)}
                  </td>
                )}

                {!isTraffic && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-orange-600 tabular-nums">
                    {pct1(currentMonthActual?.roas ?? 0)}
                  </td>
                )}
              </tr>

              <tr className="border-t border-slate-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-white">
                <td className={firstTdClass}>달성률</td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {pct1(
                    progressRate(
                      currentMonthActual?.impressions,
                      currentMonthGoalComputed?.impressions
                    )
                  )}
                </td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {pct1(
                    progressRate(
                      currentMonthActual?.clicks,
                      currentMonthGoalComputed?.clicks
                    )
                  )}
                </td>

                <td className={`${tdClass} text-slate-400`}>-</td>
                <td className={`${tdClass} text-slate-400`}>-</td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {pct1(
                    progressRate(
                      currentMonthActual?.cost,
                      currentMonthGoalComputed?.cost
                    )
                  )}
                </td>

                {!isTraffic && (
                  <td className={`${tdClass} font-semibold text-slate-900`}>
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
                  <td className={`${tdClass} font-semibold text-slate-900`}>
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
      </div>

      <p className="mt-3 text-xs text-slate-500">
        * 목표 &amp; 달성현황은 필터의 영향을 받지 않습니다.
      </p>

      {monthGoalInsight ? (
        <div className="mt-6">
          <div className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-gradient-to-br from-amber-50 via-white to-rose-50 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                  💡
                </span>
                <span>이번 달 목표 인사이트</span>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-900">
                {monthGoalInsight}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
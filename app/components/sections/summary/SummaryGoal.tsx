"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ReportType } from "../../../../src/lib/report/types";
import {
  progressRate,
  formatNumber,
  KRW,
  parseNumberInput,
} from "../../../../src/lib/report/format";

type Props = {
  reportType?: ReportType;
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: string;
  lastDataDate?: string;
  goalProgressContent?: ReactNode;
};

function toSafeNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toGoalNumber(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value)
    .replace(/[₩,%\s]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toRate01(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value > 1 ? value / 100 : value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const hasPercent = raw.includes("%");
  const cleaned = raw
    .replace(/[₩,%\s]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;

  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
}

function toRoasMultiplier(value: any) {
  if (value == null) return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value > 10 ? value / 100 : value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const hasPercent = raw.includes("%");
  const cleaned = raw
    .replace(/[₩,%\s]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;

  if (hasPercent) return n / 100;
  return n > 10 ? n / 100 : n;
}

function roundGoal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
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

function getMonthLastDate(monthKey: string): Date | null {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [yy, mm] = monthKey.split("-").map(Number);
  if (!yy || !mm) return null;
  return new Date(yy, mm, 0);
}

type GoalMode = {
  isTraffic: boolean;
  isDbAcquisition: boolean;
  showConversions: boolean;
  showCvr: boolean;
  showCpa: boolean;
  showRevenue: boolean;
  showRoas: boolean;
  titleText: string;
  focusLabel: string;
};

function getGoalMode(reportType?: ReportType): GoalMode {
  const resolvedType: ReportType = reportType ?? "commerce";
  const isTraffic = resolvedType === "traffic";
  const isDbAcquisition = resolvedType === "db_acquisition";

  if (isTraffic) {
    return {
      isTraffic: true,
      isDbAcquisition: false,
      showConversions: false,
      showCvr: false,
      showCpa: false,
      showRevenue: false,
      showRoas: false,
      titleText: "이번 달 유입 목표를 향해 달리는 중",
      focusLabel: "Focus Month",
    };
  }

  if (isDbAcquisition) {
    return {
      isTraffic: false,
      isDbAcquisition: true,
      showConversions: true,
      showCvr: true,
      showCpa: true,
      showRevenue: false,
      showRoas: false,
      titleText: "이번 달 DB 확보 목표를 향해 달리는 중",
      focusLabel: "Focus Month",
    };
  }

  return {
    isTraffic: false,
    isDbAcquisition: false,
    showConversions: true,
    showCvr: true,
    showCpa: true,
    showRevenue: true,
    showRoas: true,
    titleText: "이번 달 목표를 향해 달리는 중",
    focusLabel: "Focus Month",
  };
}

export default function SummaryGoal({
  reportType = "commerce",
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
  lastDataDate,
  goalProgressContent,
}: Props) {
  const mode = useMemo(() => getGoalMode(reportType), [reportType]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const actualImpr = toSafeNumber(
    currentMonthActual?.impressions ?? currentMonthActual?.impr
  );
  const actualClicks = toSafeNumber(
    currentMonthActual?.clicks ?? currentMonthActual?.click
  );
  const actualCost = toSafeNumber(currentMonthActual?.cost);
  const actualConv = toSafeNumber(
    currentMonthActual?.conversions ?? currentMonthActual?.conv
  );
  const actualRevenue = toSafeNumber(
    currentMonthActual?.revenue ?? currentMonthActual?.sales
  );
  const actualCtr = toSafeNumber(currentMonthActual?.ctr);
  const actualCpc = toSafeNumber(currentMonthActual?.cpc);
  const actualCvr = toSafeNumber(currentMonthActual?.cvr);
  const actualCpa = toSafeNumber(currentMonthActual?.cpa);
  const actualRoas = toSafeNumber(currentMonthActual?.roas);

  const rawGoalImpr = mounted
    ? toGoalNumber(monthGoal?.impressions ?? monthGoal?.impr)
    : 0;
  const rawGoalClicks = mounted
    ? toGoalNumber(monthGoal?.clicks ?? monthGoal?.click)
    : 0;
  const rawGoalCost = mounted ? toGoalNumber(monthGoal?.cost) : 0;
  const rawGoalConv = mounted
    ? toGoalNumber(monthGoal?.conversions ?? monthGoal?.conv)
    : 0;
  const rawGoalRev = mounted
    ? toGoalNumber(monthGoal?.revenue ?? monthGoal?.sales)
    : 0;

  const savedGoalCvrRate = mounted ? toRate01(monthGoal?.cvr) : 0;
  const savedGoalRoasMultiplier = mounted ? toRoasMultiplier(monthGoal?.roas) : 0;

  const isCommerceGoal = !mode.isTraffic && !mode.isDbAcquisition;

  const goalCtrRateFromActual =
    actualCtr > 0 ? actualCtr : mounted ? toRate01(monthGoal?.ctr) : 0;

  const goalCvrRateFromActual =
    actualCvr > 0 ? actualCvr : savedGoalCvrRate;

  const computedTrafficImpr =
    mode.isTraffic && rawGoalClicks > 0 && goalCtrRateFromActual > 0
      ? roundGoal(rawGoalClicks / goalCtrRateFromActual)
      : 0;

  const computedDbClicks =
    mode.isDbAcquisition && rawGoalConv > 0 && savedGoalCvrRate > 0
      ? roundGoal(rawGoalConv / savedGoalCvrRate)
      : 0;

  const computedDbImpr =
    mode.isDbAcquisition && computedDbClicks > 0 && goalCtrRateFromActual > 0
      ? roundGoal(computedDbClicks / goalCtrRateFromActual)
      : 0;

  const computedCommerceRevenue =
    isCommerceGoal && rawGoalCost > 0 && savedGoalRoasMultiplier > 0
      ? roundGoal(rawGoalCost * savedGoalRoasMultiplier)
      : 0;

  const computedCommerceClicks =
    isCommerceGoal && rawGoalConv > 0 && goalCvrRateFromActual > 0
      ? roundGoal(rawGoalConv / goalCvrRateFromActual)
      : 0;

  const computedCommerceImpr =
    isCommerceGoal && computedCommerceClicks > 0 && goalCtrRateFromActual > 0
      ? roundGoal(computedCommerceClicks / goalCtrRateFromActual)
      : 0;

  const goalImpr = mode.isTraffic
    ? computedTrafficImpr || rawGoalImpr
    : mode.isDbAcquisition
      ? computedDbImpr || rawGoalImpr
      : isCommerceGoal
        ? computedCommerceImpr || rawGoalImpr
        : rawGoalImpr;

  const goalClicks = mode.isDbAcquisition
    ? computedDbClicks || rawGoalClicks
    : isCommerceGoal
      ? computedCommerceClicks || rawGoalClicks
      : rawGoalClicks;

  const goalCost = rawGoalCost;
  const goalConv = rawGoalConv;

  const goalRev = isCommerceGoal
    ? computedCommerceRevenue || rawGoalRev
    : rawGoalRev;

  const goalCTR =
    (mode.isTraffic || mode.isDbAcquisition || isCommerceGoal) &&
    goalCtrRateFromActual > 0
      ? goalCtrRateFromActual
      : goalImpr > 0
        ? goalClicks / goalImpr
        : 0;

  const goalCPC = goalClicks > 0 ? goalCost / goalClicks : 0;

  const goalCVR =
    mode.isDbAcquisition && savedGoalCvrRate > 0
      ? savedGoalCvrRate
      : isCommerceGoal && goalCvrRateFromActual > 0
        ? goalCvrRateFromActual
        : goalClicks > 0
          ? goalConv / goalClicks
          : 0;

  const goalCPA = goalConv > 0 ? goalCost / goalConv : 0;

  const goalROAS =
    isCommerceGoal && savedGoalRoasMultiplier > 0
      ? savedGoalRoasMultiplier
      : goalCost > 0
        ? goalRev / goalCost
        : 0;

  const goalComputedImpr =
    (mode.isTraffic || mode.isDbAcquisition || isCommerceGoal) && goalImpr > 0
      ? goalImpr
      : toSafeNumber(
          currentMonthGoalComputed?.impressions ?? currentMonthGoalComputed?.impr
        );

  const goalComputedClicks =
    (mode.isDbAcquisition || isCommerceGoal) && goalClicks > 0
      ? goalClicks
      : toSafeNumber(
          currentMonthGoalComputed?.clicks ?? currentMonthGoalComputed?.click
        );
  const goalComputedCost = toSafeNumber(currentMonthGoalComputed?.cost);
  const goalComputedConv = toSafeNumber(
    currentMonthGoalComputed?.conversions ?? currentMonthGoalComputed?.conv
  );
  const goalComputedRevenue =
    isCommerceGoal && goalRev > 0
      ? goalRev
      : toSafeNumber(
          currentMonthGoalComputed?.revenue ?? currentMonthGoalComputed?.sales
        );

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

  const readonlyTargetClass =
    "inline-flex h-9 w-full items-center justify-end rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[13px] font-semibold text-slate-700";

  const { mainProgressRate, progressPercent } = useMemo(() => {
    const fallback = clamp01(
      Number(progressRate(actualCost, goalComputedCost) ?? 0)
    );

    const parsedLastDataDate = parseLooseDate(lastDataDate);

    if (parsedLastDataDate) {
      const parsedMonthKey =
        String(parsedLastDataDate.getFullYear()) +
        "-" +
        String(parsedLastDataDate.getMonth() + 1).padStart(2, "0");
      const monthEndDate = getMonthLastDate(parsedMonthKey);

      if (monthEndDate) {
        const monthTotalDays = monthEndDate.getDate();
        const lastDay = parsedLastDataDate.getDate();
        const calendarRate =
          monthTotalDays > 0 ? clamp01(lastDay / monthTotalDays) : fallback;

        return {
          mainProgressRate: calendarRate,
          progressPercent: Math.round(calendarRate * 1000) / 10,
        };
      }
    }

    return {
      mainProgressRate: fallback,
      progressPercent: Math.round(fallback * 1000) / 10,
    };
  }, [actualCost, goalComputedCost, currentMonthKey, lastDataDate]);

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

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
            {mode.focusLabel}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {currentMonthKey || "-"}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-white px-5 py-3">
          <div className="mx-auto max-w-[720px]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Monthly Progress Run
                </div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">
                  {mode.titleText}
                </div>
              </div>

              <div className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                진행률 {progressPercent}%
              </div>
            </div>

            <div className="rounded-[20px] border border-slate-200/80 bg-gradient-to-r from-sky-50 via-white to-amber-50 px-3 py-3">
              <div className="relative h-[82px] overflow-hidden rounded-[16px] border border-slate-200/70 bg-white/80 px-4">
                <div className="pointer-events-none absolute inset-x-4 top-[6px] flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  <span>Start</span>
                  <span>Finish</span>
                </div>

                <div className="absolute inset-x-4 top-[34px] h-[10px] rounded-full bg-slate-100 shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400 transition-all duration-700 ease-out"
                    style={{ width: `${progressPercentSafe}%` }}
                  />
                </div>

                <div className="pointer-events-none absolute inset-x-4 top-[37px] flex items-center justify-between px-[6px]">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-white ring-1 ring-slate-200"
                    />
                  ))}
                </div>

                <div className="absolute left-4 top-[21px] z-[1] flex flex-col items-start gap-1">
                  <span className="text-[16px] leading-none drop-shadow-[0_2px_3px_rgba(15,23,42,0.16)]">
                    🚩
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    1일
                  </span>
                </div>

                <div
                  className="absolute top-[4px] z-10 transition-all duration-700 ease-out"
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

                <div className="absolute right-4 top-[6px] z-10 flex flex-col items-center">
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

                <div className="absolute bottom-1.5 left-4 right-4 flex items-center justify-between text-[10px] font-medium text-slate-400">
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
              {mode.isTraffic ? (
                <>
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[16%]" />
                </>
              ) : mode.isDbAcquisition ? (
                <>
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[10%]" />
                  <col className="w-[14%]" />
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
                {mode.showConversions && <th className={headClass}>Conv</th>}
                {mode.showCvr && <th className={headClass}>CVR</th>}
                {mode.showCpa && <th className={headClass}>CPA</th>}
                {mode.showRevenue && <th className={headClass}>Revenue</th>}
                {mode.showRoas && <th className={headClass}>ROAS</th>}
              </tr>
            </thead>

            <tbody>
              <tr className="border-t border-slate-200 bg-white">
                <td className={firstTdClass}>목표</td>

                <td className={tdClass}>
                  {mode.isTraffic || mode.isDbAcquisition || isCommerceGoal ? (
                    <span className={readonlyTargetClass}>
                      {formatNumber(goalImpr)}
                    </span>
                  ) : (
                    <input
                      className={inputClass}
                      value={formatNumber(
                        monthGoal?.impressions ?? monthGoal?.impr ?? 0
                      )}
                      onChange={(e) =>
                        setMonthGoal((p: any) => ({
                          ...p,
                          impressions: parseNumberInput(e.target.value),
                        }))
                      }
                    />
                  )}
                </td>

                <td className={tdClass}>
                  {mode.isDbAcquisition || isCommerceGoal ? (
                    <span className={readonlyTargetClass}>
                      {formatNumber(goalClicks)}
                    </span>
                  ) : (
                    <input
                      className={inputClass}
                      value={formatNumber(
                        monthGoal?.clicks ?? monthGoal?.click ?? 0
                      )}
                      onChange={(e) =>
                        setMonthGoal((p: any) => ({
                          ...p,
                          clicks: parseNumberInput(e.target.value),
                        }))
                      }
                    />
                  )}
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

                {mode.showConversions && (
                  <td className={tdClass}>
                    <input
                      className={inputClass}
                      value={formatNumber(
                        monthGoal?.conversions ?? monthGoal?.conv ?? 0
                      )}
                      onChange={(e) =>
                        setMonthGoal((p: any) => ({
                          ...p,
                          conversions: parseNumberInput(e.target.value),
                        }))
                      }
                    />
                  </td>
                )}

                {mode.showCvr && (
                  <td className={`${tdClass} font-semibold text-violet-600`}>
                    {((mounted ? goalCVR : 0) * 100).toFixed(2)}%
                  </td>
                )}

                {mode.showCpa && (
                  <td className={`${tdClass} font-semibold text-slate-900`}>
                    {KRW(goalCPA)}
                  </td>
                )}

                {mode.showRevenue && (
                  <td className={tdClass}>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">
                        ₩
                      </span>
                      <span className={`${readonlyTargetClass} pl-6`}>
                        {formatNumber(goalRev)}
                      </span>
                    </div>
                  </td>
                )}

                {mode.showRoas && (
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
                  {formatNumber(actualImpr)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {formatNumber(actualClicks)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-violet-600 tabular-nums">
                  {pct2(actualCtr)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {KRW(actualCpc)}
                </td>

                <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  {KRW(actualCost)}
                </td>

                {mode.showConversions && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                    {formatNumber(actualConv)}
                  </td>
                )}

                {mode.showCvr && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-violet-600 tabular-nums">
                    {pct2(actualCvr)}
                  </td>
                )}

                {mode.showCpa && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                    {KRW(actualCpa)}
                  </td>
                )}

                {mode.showRevenue && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-emerald-600 tabular-nums">
                    {KRW(actualRevenue)}
                  </td>
                )}

                {mode.showRoas && (
                  <td className="whitespace-nowrap px-2.5 py-3 text-right text-[13px] font-bold text-orange-600 tabular-nums">
                    {pct1(actualRoas)}
                  </td>
                )}
              </tr>

              <tr className="border-t border-slate-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-white">
                <td className={firstTdClass}>달성률</td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {pct1(progressRate(actualImpr, goalComputedImpr))}
                </td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {pct1(progressRate(actualClicks, goalComputedClicks))}
                </td>

                <td className={`${tdClass} text-slate-400`}>-</td>
                <td className={`${tdClass} text-slate-400`}>-</td>

                <td className={`${tdClass} font-semibold text-slate-900`}>
                  {pct1(progressRate(actualCost, goalComputedCost))}
                </td>

                {mode.showConversions && (
                  <td className={`${tdClass} font-semibold text-slate-900`}>
                    {pct1(progressRate(actualConv, goalComputedConv))}
                  </td>
                )}

                {mode.showCvr && <td className={`${tdClass} text-slate-400`}>-</td>}
                {mode.showCpa && <td className={`${tdClass} text-slate-400`}>-</td>}

                {mode.showRevenue && (
                  <td className={`${tdClass} font-semibold text-slate-900`}>
                    {pct1(progressRate(actualRevenue, goalComputedRevenue))}
                  </td>
                )}

                {mode.showRoas && <td className={`${tdClass} text-slate-400`}>-</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        * 목표 &amp; 달성현황은 필터의 영향을 받지 않습니다.
      </p>

      {goalProgressContent}

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
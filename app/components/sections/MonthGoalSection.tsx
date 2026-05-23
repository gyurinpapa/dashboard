// app/components/sections/MonthGoalSection.tsx
"use client";

import { useMemo } from "react";
import type { ReportType } from "@/src/lib/report/types";
import SummaryGoal from "./summary/SummaryGoal";

type Props = {
  reportType?: ReportType;
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: string;
  lastDataDate?: string;
};

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
  const n = toGoalNumber(raw);

  if (!Number.isFinite(n) || n <= 0) return 0;

  if (hasPercent) return n / 100;
  return n > 1 ? n / 100 : n;
}

function roundGoal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function buildComputedDbMonthGoal(monthGoal: any) {
  const safeGoal =
    monthGoal && typeof monthGoal === "object" && !Array.isArray(monthGoal)
      ? monthGoal
      : {};

  const targetConversions = toGoalNumber(safeGoal.conversions);
  const targetCvrRate = toRate01(safeGoal.cvr);
  const targetCost = toGoalNumber(safeGoal.cost);

  const computedClicks =
    targetConversions > 0 && targetCvrRate > 0
      ? roundGoal(targetConversions / targetCvrRate)
      : toGoalNumber(safeGoal.clicks);

  const computedCpc =
    targetCost > 0 && computedClicks > 0
      ? roundGoal(targetCost / computedClicks)
      : toGoalNumber(safeGoal.cpc);

  const computedCpa =
    targetCost > 0 && targetConversions > 0
      ? roundGoal(targetCost / targetConversions)
      : toGoalNumber(safeGoal.cpa);

  return {
    ...safeGoal,

    // DB 리포트 자동 계산 목표
    clicks: computedClicks || safeGoal.clicks || "",
    cpc: computedCpc || safeGoal.cpc || "",
    cpa: computedCpa || safeGoal.cpa || "",

    // 계산 근거 표시/디버깅용. 기존 로직이 모르면 무시됩니다.
    computed_clicks: computedClicks || "",
    computed_cpc: computedCpc || "",
    computed_cpa: computedCpa || "",
  };
}

function buildComputedDbGoalComputed(currentMonthGoalComputed: any, monthGoal: any) {
  const safeComputed =
    currentMonthGoalComputed &&
    typeof currentMonthGoalComputed === "object" &&
    !Array.isArray(currentMonthGoalComputed)
      ? currentMonthGoalComputed
      : {};

  const computedGoal = buildComputedDbMonthGoal(monthGoal);

  return {
    ...safeComputed,
    clicks: computedGoal.clicks,
    cpc: computedGoal.cpc,
    cpa: computedGoal.cpa,
    computed_clicks: computedGoal.computed_clicks,
    computed_cpc: computedGoal.computed_cpc,
    computed_cpa: computedGoal.computed_cpa,
  };
}

export default function MonthGoalSection({
  reportType = "commerce",
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
  lastDataDate,
}: Props) {
  const resolvedMonthGoal = useMemo(() => {
    if (reportType !== "db_acquisition") return monthGoal;
    return buildComputedDbMonthGoal(monthGoal);
  }, [monthGoal, reportType]);

  const resolvedCurrentMonthGoalComputed = useMemo(() => {
    if (reportType !== "db_acquisition") return currentMonthGoalComputed;

    return buildComputedDbGoalComputed(currentMonthGoalComputed, monthGoal);
  }, [currentMonthGoalComputed, monthGoal, reportType]);

  return (
    <section className="mb-8 mt-2">
      <div className="overflow-hidden rounded-[28px] border border-[var(--nature-border-blue)] bg-gradient-to-br from-[var(--nature-surface)] via-[var(--nature-surface)] to-[var(--nature-cream)]/70 shadow-[0_14px_36px_rgba(127,166,196,0.16)]">
        <div className="px-5 py-5 sm:px-6">
          <SummaryGoal
            reportType={reportType}
            currentMonthKey={currentMonthKey}
            currentMonthActual={currentMonthActual}
            currentMonthGoalComputed={resolvedCurrentMonthGoalComputed}
            monthGoal={resolvedMonthGoal}
            setMonthGoal={setMonthGoal}
            monthGoalInsight={monthGoalInsight}
            lastDataDate={lastDataDate}
          />
        </div>
      </div>
    </section>
  );
}
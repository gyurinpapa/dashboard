// app/components/sections/MonthGoalSection.tsx
"use client";

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
  return (
    <section className="mb-8 mt-2">
      <div className="overflow-hidden rounded-[28px] border border-[var(--nature-border-blue)] bg-gradient-to-br from-[var(--nature-surface)] via-[var(--nature-surface)] to-[var(--nature-cream)]/70 shadow-[0_14px_36px_rgba(127,166,196,0.16)]">
        <div className="px-5 py-5 sm:px-6">
          <SummaryGoal
            reportType={reportType}
            currentMonthKey={currentMonthKey}
            currentMonthActual={currentMonthActual}
            currentMonthGoalComputed={currentMonthGoalComputed}
            monthGoal={monthGoal}
            setMonthGoal={setMonthGoal}
            monthGoalInsight={monthGoalInsight}
            lastDataDate={lastDataDate}
          />
        </div>
      </div>
    </section>
  );
}
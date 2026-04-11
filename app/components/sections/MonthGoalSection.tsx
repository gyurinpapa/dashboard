// app/components/sections/MonthGoalSection.tsx
"use client";

import SummaryGoal from "./summary/SummaryGoal";

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

export default function MonthGoalSection({
  reportType,
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
      <div className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-gradient-to-br from-white via-white to-slate-50 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
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
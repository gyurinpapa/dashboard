"use client";

import SummaryGoal from "./summary/SummaryGoal";

type Props = {
  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  setMonthGoal: any;
  monthGoalInsight: string;
};

export default function MonthGoalSection({
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  setMonthGoal,
  monthGoalInsight,
}: Props) {
  return (
    <section className="mt-2 mb-8">
      <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-5 sm:px-6">
          <SummaryGoal
            currentMonthKey={currentMonthKey}
            currentMonthActual={currentMonthActual}
            currentMonthGoalComputed={currentMonthGoalComputed}
            monthGoal={monthGoal}
            setMonthGoal={setMonthGoal}
            monthGoalInsight={monthGoalInsight}
          />
        </div>
      </div>
    </section>
  );
}
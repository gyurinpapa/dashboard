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
    <section>
      <SummaryGoal
        currentMonthKey={currentMonthKey}
        currentMonthActual={currentMonthActual}
        currentMonthGoalComputed={currentMonthGoalComputed}
        monthGoal={monthGoal}
        setMonthGoal={setMonthGoal}
        monthGoalInsight={monthGoalInsight}
      />
    </section>
  );
}

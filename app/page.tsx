"use client";

import { useMemo, useState } from "react";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  GoalState,
  MonthKey,
  TabKey,
  WeekKey,
} from "../src/lib/report/types";

import { groupByKeyword } from "../src/lib/report/keyword";

import { useLocalStorageState } from "../src/useLocalStorageState";
import { useInsights } from "./hooks/useInsights";

import { useReportRows } from "../src/lib/report/useReportRows";
import { useReportAggregates } from "../src/lib/report/useReportAggregates";
import { buildKeywordInsight } from "../src/lib/report/insights/buildKeywordInsight";

import HeaderBar from "./components/sections/HeaderBar";
import StructureSection from "./components/sections/StructureSection";
import KeywordSection from "./components/sections/KeywordSection";
import KeywordDetailSection from "./components/sections/KeywordDetailSection";
import SummarySection from "./components/sections/SummarySection";
import CreativeSection from "./components/sections/CreativeSection";
import CreativeDetailSection from "./components/sections/CreativeDetailSection";
import MonthGoalSection from "./components/sections/MonthGoalSection";

const MONTH_GOAL_KEY = "nature_report_month_goal_v1";

const DEFAULT_GOAL: GoalState = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

export default function Page() {
  // ✅ CSV rows 로딩 (나중에 DB로 교체 가능)
  const { rows, isLoading } = useReportRows("/data/acc_001.csv");

  // ===== state =====
  const [tab, setTab] = useState<TabKey>("summary");

  const [filterKey, setFilterKey] = useState<FilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>("all");
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>("all");
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>("all");
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("all");

  const [monthGoal, setMonthGoal] = useLocalStorageState<GoalState>(
    MONTH_GOAL_KEY,
    DEFAULT_GOAL
  );

  // ✅ 집계/옵션/기간/그룹핑은 전부 훅에서
  const {
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    enabledMonthKeySet,
    enabledWeekKeySet,

    filteredRows,
    period,

    currentMonthKey,
    currentMonthActual,
    currentMonthGoalComputed,

    totals,
    bySource,
    byCampaign,
    // byGroup 는 여기서 받아도 되지만, StructureSection Props에 없으면 넘기지 말자.
    // byGroup,
    byWeekOnly,
    byWeekChart,
    byMonth,
  } = useReportAggregates({
    rows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    monthGoal,
    onInvalidWeek: () => setSelectedWeek("all"),
  });

  const { monthGoalInsight } = useInsights({
    byMonth,
    rowsLength: rows.length,
    currentMonthKey,
    monthGoal,
    currentMonthActual: {
      impressions: currentMonthActual.impressions,
      clicks: currentMonthActual.clicks,
      cost: currentMonthActual.cost,
      conversions: currentMonthActual.conversions,
      revenue: currentMonthActual.revenue,
      ctr: currentMonthActual.ctr,
      cpc: currentMonthActual.cpc,
      cvr: currentMonthActual.cvr,
      cpa: currentMonthActual.cpa,
      roas: currentMonthActual.roas,
    },
    currentMonthGoalComputed,
  });

  // ============================
  // ✅ Keyword 탭 데이터 (좌측 필터만 적용)
  // ============================
  const keywordBaseRows = useMemo(() => filteredRows, [filteredRows]);

  const keywordAgg = useMemo(
    () => groupByKeyword(keywordBaseRows as any[]),
    [keywordBaseRows]
  );

  const keywordInsight = useMemo(() => {
    return buildKeywordInsight({
      keywordAgg: keywordAgg as any[],
      keywordBaseRows: keywordBaseRows as any[],
      currentMonthActual: currentMonthActual as any,
      currentMonthGoalComputed: currentMonthGoalComputed as any,
    });
  }, [keywordAgg, keywordBaseRows, currentMonthActual, currentMonthGoalComputed]);

  // ============================
  // ✅ Creative 탭 데이터
  // ============================
  const creativeBaseRows = useMemo(() => filteredRows, [filteredRows]);
  const creativeInsight = useMemo(() => "", []);

  return (
    <main className="min-h-screen">
      <HeaderBar
        tab={tab}
        setTab={setTab}
        filterKey={filterKey}
        setFilterKey={setFilterKey}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedWeek={selectedWeek}
        setSelectedWeek={setSelectedWeek}
        selectedDevice={selectedDevice}
        setSelectedDevice={setSelectedDevice}
        selectedChannel={selectedChannel}
        setSelectedChannel={setSelectedChannel}
        monthOptions={monthOptions}
        weekOptions={weekOptions}
        deviceOptions={deviceOptions}
        channelOptions={channelOptions}
        enabledMonthKeySet={enabledMonthKeySet}
        enabledWeekKeySet={enabledWeekKeySet}
        period={period}
      />

      <div className="px-8 pt-10 pb-8">
        <div className="mx-auto w-full max-w-[1400px]">
          {tab === "summary" && (
            <>
              <MonthGoalSection
                currentMonthKey={currentMonthKey}
                currentMonthActual={currentMonthActual}
                currentMonthGoalComputed={currentMonthGoalComputed}
                monthGoal={monthGoal}
                setMonthGoal={setMonthGoal}
                monthGoalInsight={monthGoalInsight}
              />

              {/* ✅ SummarySection은 props를 optional로 완화했으므로 여기 호출은 안전 */}
              <SummarySection
                totals={totals}
                byMonth={byMonth}
                byWeekOnly={byWeekOnly}
                byWeekChart={byWeekChart}
                bySource={bySource}
              />
            </>
          )}

          {tab === "structure" && (
            /**
             * ✅ 빌드 안정화:
             * - StructureSection Props에 없는 값(byGroup/isLoading 등)을 넘기면 타입 에러로 빌드가 터짐
             * - 따라서 "확실히 존재하는 props"만 넘긴다.
             */
            <StructureSection
              bySource={bySource}
              byCampaign={byCampaign}
              rows={filteredRows}
              monthGoal={monthGoal}
            />
          )}

          {tab === "keyword" && (
            <KeywordSection
              keywordAgg={keywordAgg}
              keywordInsight={keywordInsight}
            />
          )}

          {tab === "keywordDetail" && (
            <KeywordDetailSection rows={filteredRows as any[]} />
          )}

          {tab === "creative" && (
            <CreativeSection
              rows={creativeBaseRows}
              creativeInsight={creativeInsight}
            />
          )}

          {tab === "creativeDetail" && (
            <CreativeDetailSection rows={filteredRows as any[]} />
          )}

          {/* ✅ 로딩 UI는 Page 레벨에서만 가볍게 처리 (StructureSection에 넘기지 않음) */}
          {isLoading && (
            <div className="mt-6 text-sm text-gray-500">Loading…</div>
          )}
        </div>
      </div>
    </main>
  );
}
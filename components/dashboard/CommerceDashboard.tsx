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
} from "../../src/lib/report/types";

import { groupByKeyword } from "../../src/lib/report/keyword";

import { useLocalStorageState } from "../../src/useLocalStorageState";
import { useInsights } from "../../app/hooks/useInsights";

import { useReportRows } from "../../src/lib/report/useReportRows";
import { useReportAggregates } from "../../src/lib/report/useReportAggregates";
import { buildKeywordInsight } from "../../src/lib/report/insights/buildKeywordInsight";

import HeaderBar from "../../app/components/sections/HeaderBar";
import StructureSection from "../../app/components/sections/StructureSection";
import KeywordSection from "../../app/components/sections/KeywordSection";
import KeywordDetailSection from "../../app/components/sections/KeywordDetailSection";
import SummarySection from "../../app/components/sections/SummarySection";
import CreativeSection from "../../app/components/sections/CreativeSection";
import CreativeDetailSection from "../../app/components/sections/CreativeDetailSection";
import MonthGoalSection from "../../app/components/sections/MonthGoalSection";

const MONTH_GOAL_KEY = "nature_report_month_goal_v1";

const DEFAULT_GOAL: GoalState = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

type DashboardInit = {
  tab?: TabKey;
  selectedMonth?: MonthKey;
  selectedWeek?: WeekKey;
  selectedDevice?: DeviceKey;
  selectedChannel?: ChannelKey;
  period?: { from?: string; to?: string };
};

// ✅ 추가: rows 단계 필터 옵션
type RowOptions = {
  from?: string;
  to?: string;
  channels?: ("search" | "display")[];
};

type Props = {
  dataUrl?: string;
  init?: DashboardInit;
  rowOptions?: RowOptions; // ✅ NEW
};

export default function CommerceDashboard({
  dataUrl = "/data/acc_001.csv",
  init,
  rowOptions,
}: Props) {
  // ✅ 가장 안전: rows 단계에서 먼저 자르기(기간 + 채널)
  const { rows, isLoading } = useReportRows(dataUrl, {
    from: rowOptions?.from ?? init?.period?.from,
    to: rowOptions?.to ?? init?.period?.to,
    channels: rowOptions?.channels,
  });

  // ===== state =====
  const [tab, setTab] = useState<TabKey>(init?.tab ?? "summary");

  const [filterKey, setFilterKey] = useState<FilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(init?.selectedMonth ?? "all");
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>(init?.selectedWeek ?? "all");
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>(init?.selectedDevice ?? "all");
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>(init?.selectedChannel ?? "all");

  const [monthGoal, setMonthGoal] = useLocalStorageState<GoalState>(
    MONTH_GOAL_KEY,
    DEFAULT_GOAL
  );

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
    byGroup,
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

  // Keyword 탭 데이터
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

  // Creative 탭 데이터
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
            <StructureSection
              bySource={bySource}
              byCampaign={byCampaign}
              byGroup={byGroup}
              rows={filteredRows}
              monthGoal={monthGoal}
              isLoading={isLoading}
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
            <CreativeSection rows={creativeBaseRows} creativeInsight={creativeInsight} />
          )}

          {tab === "creativeDetail" && (
            <CreativeDetailSection rows={filteredRows as any[]} />
          )}
        </div>
      </div>
    </main>
  );
}
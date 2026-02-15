"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  GoalState,
  MonthKey,
  Row,
  TabKey,
  WeekKey,
} from "./lib/report/types";

import {
  buildOptions,
  buildWeekOptions,
  filterRows,
  getCurrentMonthKeyByData,
  groupByMonthRecent3,
  groupBySource,
  groupByCampaign,
  groupByGroup,
  groupByWeekRecent5,
  normalizeCsvRows,
  periodText,
  summarize,
} from "./lib/report/aggregate";

import { monthKeyOfDate, parseDateLoose } from "./lib/report/date";
import { useLocalStorageState } from "./lib/useLocalStorageState";
import { useInsights } from "./hooks/useInsights";

import HeaderBar from "./components/sections/HeaderBar";
import StructureSection from "./components/sections/StructureSection";
import SummarySection from "./components/sections/SummarySection";
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
  // ===== state =====
  const [rows, setRows] = useState<Row[]>([]);
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

  // ===== CSV load =====
  useEffect(() => {
    fetch(`/data/acc_001.csv?ts=${Date.now()}`)
      .then((res) => res.text())
      .then((csv) => {
        const parsed = Papa.parse<Row>(csv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        setRows(normalizeCsvRows(parsed.data as any[]));
      });
  }, []);

  // ===== options =====
  const { monthOptions, deviceOptions, channelOptions } = useMemo(
    () => buildOptions(rows),
    [rows]
  );
  const weekOptions = useMemo(
    () => buildWeekOptions(rows, selectedMonth),
    [rows, selectedMonth]
  );

  // dim logic (표시만 dim, 클릭은 가능)
  const selectedWeekMonthKey = useMemo(
    () => (selectedWeek === "all" ? "" : selectedWeek.slice(0, 7)),
    [selectedWeek]
  );

  const enabledWeekKeySet = useMemo(() => {
    const set = new Set<string>();

    weekOptions.forEach((w) => {
      const wk = w.weekKey;
      if (!wk) return;

      if (selectedMonth !== "all") {
        if (wk.slice(0, 7) === selectedMonth) set.add(wk);
        return;
      }

      if (selectedWeek !== "all") {
        if (wk.slice(0, 7) === selectedWeekMonthKey) set.add(wk);
        return;
      }

      set.add(wk);
    });

    return set;
  }, [weekOptions, selectedMonth, selectedWeek, selectedWeekMonthKey]);

  const enabledMonthKeySet = useMemo(() => {
    const set = new Set<string>();

    if (selectedMonth !== "all") {
      set.add(selectedMonth);
      return set;
    }

    if (selectedWeek !== "all" && selectedWeekMonthKey) {
      set.add(selectedWeekMonthKey);
      return set;
    }

    monthOptions.forEach((m) => set.add(m));
    return set;
  }, [monthOptions, selectedMonth, selectedWeek, selectedWeekMonthKey]);

  // 월 변경으로 주차가 사라지면 reset
  useEffect(() => {
    if (selectedWeek === "all") return;
    const exists = weekOptions.some((w) => w.weekKey === selectedWeek);
    if (!exists) setSelectedWeek("all");
  }, [selectedMonth, weekOptions, selectedWeek]);

  // ===== filtered rows =====
  const filteredRows = useMemo(
    () =>
      filterRows({
        rows,
        selectedMonth,
        selectedWeek,
        selectedDevice,
        selectedChannel,
      }),
    [rows, selectedMonth, selectedWeek, selectedDevice, selectedChannel]
  );

  // ===== period text =====
  const period = useMemo(
    () => periodText({ rows, selectedMonth, selectedWeek }),
    [rows, selectedMonth, selectedWeek]
  );

  // ===== 당월(데이터 최신 월) =====
  const currentMonthKey = useMemo(() => getCurrentMonthKeyByData(rows), [rows]);

  const currentMonthActual = useMemo(() => {
    if (!rows.length || currentMonthKey === "all") return summarize([]);

    const scope = rows.filter((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return false;
      return monthKeyOfDate(d) === currentMonthKey;
    });

    return summarize(scope);
  }, [rows, currentMonthKey]);

  const currentMonthGoalComputed = useMemo(() => {
    const impressions = Number(monthGoal.impressions) || 0;
    const clicks = Number(monthGoal.clicks) || 0;
    const cost = Number(monthGoal.cost) || 0;
    const conversions = Number(monthGoal.conversions) || 0;
    const revenue = Number(monthGoal.revenue) || 0;

    return summarize([
      { date: "", impressions, clicks, cost, conversions, revenue } as any,
    ]);
  }, [monthGoal]);

  // ===== totals =====
  const totals = useMemo(() => summarize(filteredRows), [filteredRows]);

  // ===== tables =====
  const bySource = useMemo(() => groupBySource(filteredRows), [filteredRows]);
  const byCampaign = useMemo(() => groupByCampaign(filteredRows), [filteredRows]);
  const byGroup = useMemo(() => groupByGroup(filteredRows), [filteredRows]);

  const byWeek = useMemo(() => groupByWeekRecent5(filteredRows), [filteredRows]);
  const byWeekOnly = useMemo(
    () => byWeek.filter((w) => String(w.label).includes("주차")),
    [byWeek]
  );
  const byWeekChart = useMemo(() => [...byWeekOnly].reverse(), [byWeekOnly]);

  const byMonth = useMemo(
    () =>
      groupByMonthRecent3({
        rows,
        selectedMonth,
        selectedDevice,
        selectedChannel,
      }),
    [rows, selectedMonth, selectedDevice, selectedChannel]
  );

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
              isLoading={rows.length === 0}
            />
          )}

          {tab === "keyword" && (
            <div className="mt-10 border rounded-xl p-6 text-gray-600">
              키워드 탭(준비중)
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

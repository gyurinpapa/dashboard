"use client";

import { useEffect, useMemo } from "react";

import type { ChannelKey, DeviceKey, GoalState, MonthKey, Row, WeekKey } from "./types";

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
  periodText,
  summarize,
} from "./aggregate";

import { monthKeyOfDate, parseDateLoose } from "./date";

type Args = {
  rows: Row[];

  selectedMonth: MonthKey;
  selectedWeek: WeekKey;
  selectedDevice: DeviceKey;
  selectedChannel: ChannelKey;

  monthGoal: GoalState;

  // 주차가 사라졌을 때 page 쪽에서 selectedWeek를 "all"로 리셋하도록 호출
  onInvalidWeek?: () => void;
};

export function useReportAggregates({
  rows,
  selectedMonth,
  selectedWeek,
  selectedDevice,
  selectedChannel,
  monthGoal,
  onInvalidWeek,
}: Args) {
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
    () => (selectedWeek === "all" ? "" : String(selectedWeek).slice(0, 7)),
    [selectedWeek]
  );

  const enabledWeekKeySet = useMemo(() => {
    const set = new Set<string>();

    weekOptions.forEach((w: any) => {
      const wk = w.weekKey;
      if (!wk) return;

      if (selectedMonth !== "all") {
        if (String(wk).slice(0, 7) === selectedMonth) set.add(wk);
        return;
      }

      if (selectedWeek !== "all") {
        if (String(wk).slice(0, 7) === selectedWeekMonthKey) set.add(wk);
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

    monthOptions.forEach((m: any) => set.add(m));
    return set;
  }, [monthOptions, selectedMonth, selectedWeek, selectedWeekMonthKey]);

  // 월 변경으로 주차가 사라지면 reset (page 쪽 setter 호출)
  useEffect(() => {
    if (!onInvalidWeek) return;
    if (selectedWeek === "all") return;
    const exists = weekOptions.some((w: any) => w.weekKey === selectedWeek);
    if (!exists) onInvalidWeek();
  }, [onInvalidWeek, selectedMonth, weekOptions, selectedWeek]);

  // ===== filtered rows (좌측 필터 적용) =====
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
      const d = parseDateLoose((r as any).date);
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
    () => byWeek.filter((w: any) => String(w.label).includes("주차")),
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

  return {
    // options
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    enabledMonthKeySet,
    enabledWeekKeySet,

    // core
    filteredRows,
    period,

    // current month + goal computed
    currentMonthKey,
    currentMonthActual,
    currentMonthGoalComputed,

    // aggregates
    totals,
    bySource,
    byCampaign,
    byGroup,
    byWeekOnly,
    byWeekChart,
    byMonth,
  };
}

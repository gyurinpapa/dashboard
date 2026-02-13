"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

import type { ChannelKey, DeviceKey, FilterKey, GoalState, MonthKey, Row, TabKey, WeekKey } from "./lib/report/types";
import { KRW, formatNumber, parseNumberInput, progressRate } from "./lib/report/format";
import {
  buildOptions,
  buildWeekOptions,
  diffPct,
  filterRows,
  getCurrentMonthKeyByData,
  groupByMonthRecent3,
  groupBySource,
  groupByWeekRecent5,
  normalizeCsvRows,
  periodText,
  summarize,
} from "./lib/report/aggregate";
import { monthLabelOf, monthKeyOfDate, parseDateLoose } from "./lib/report/date";
import { useLocalStorageState } from "./lib/useLocalStorageState";
import { useInsights } from "./hooks/useInsights";
import TrendCell from "./components/TrendCell";
import FilterBtn from "./components/FilterBtn";
import ArrowDot from "./components/ArrowDot";
import KPI from "./components/KPI";
import InsightBox from "./components/InsightBox";


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

  // 목표(수기입력) + 로컬 저장
  const [monthGoal, setMonthGoal] = useLocalStorageState<GoalState>(MONTH_GOAL_KEY, DEFAULT_GOAL);

  const toggleFilter = (k: Exclude<FilterKey, null>) => setFilterKey((prev) => (prev === k ? null : k));

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
  const { monthOptions, deviceOptions, channelOptions } = useMemo(() => buildOptions(rows), [rows]);
  const weekOptions = useMemo(() => buildWeekOptions(rows, selectedMonth), [rows, selectedMonth]);

  // dim logic (표시만 dim, 클릭은 가능)
  const selectedWeekMonthKey = useMemo(() => (selectedWeek === "all" ? "" : selectedWeek.slice(0, 7)), [selectedWeek]);

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
  const period = useMemo(() => periodText({ rows, selectedMonth, selectedWeek }), [rows, selectedMonth, selectedWeek]);

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
      {
        date: "",
        impressions,
        clicks,
        cost,
        conversions,
        revenue,
      } as any,
    ]);
  }, [monthGoal]);

  // ===== totals =====
  const totals = useMemo(() => summarize(filteredRows), [filteredRows]);

  // ===== tables =====
  const bySource = useMemo(() => groupBySource(filteredRows), [filteredRows]);

  const byWeek = useMemo(() => groupByWeekRecent5(filteredRows), [filteredRows]);
  const byWeekOnly = useMemo(() => byWeek.filter((w) => String(w.label).includes("주차")), [byWeek]);
  const byWeekChart = useMemo(() => [...byWeekOnly].reverse(), [byWeekOnly]);

  const lastWeek = byWeekOnly[0];
  const prevWeek = byWeekOnly[1];

  // ✅ 너가 말한 “당월용 데이터 배열 = byMonth”
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
  

  const { monthlyInsight, monthGoalInsight } = useInsights({
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

 // ===== UI =====
return (
  <main className="min-h-screen">
    {/* ✅ STICKY HEADER (제목+필터+탭만) */}
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
      {/* ✅ 헤더도 본문과 동일한 폭/패딩 */}
      <div className="p-8 pb-4">
        <div className="mx-auto w-full max-w-[1400px]">
          {/* 제목 */}
          <div className="mb-6 text-center pt-4">
            <h1 className="text-3xl font-semibold tracking-tight">네이처컬렉션 온라인광고 보고서</h1>
            <div className="mt-4 border-t border-gray-400" />
            <div className="mt-1 border-t border-gray-300" />
          </div>

          {/* 상단: 필터 + 탭 */}
          <div className="flex items-start justify-between mb-2">
            {/* LEFT: Filters */}
            <div className="relative inline-block">
              <div className="flex gap-2">
                <FilterBtn active={filterKey === "month"} onClick={() => toggleFilter("month")}>
                  월
                </FilterBtn>
                <FilterBtn active={filterKey === "week"} onClick={() => toggleFilter("week")}>
                  주차
                </FilterBtn>
                <FilterBtn active={filterKey === "device"} onClick={() => toggleFilter("device")}>
                  기기
                </FilterBtn>
                <FilterBtn active={filterKey === "channel"} onClick={() => toggleFilter("channel")}>
                  채널
                </FilterBtn>
              </div>

              {/* 기간 */}
              {period && (
                <div className="mt-3 mb-2 text-sm text-gray-600">
                  기간: <span className="font-semibold text-gray-900">{period}</span>
                </div>
              )}

              {/* 월 패널 */}
              {filterKey === "month" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedMonth === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      전체
                    </button>

                    {monthOptions.map((m) => {
                      const dim = !enabledMonthKeySet.has(m);

                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(m);
                            setFilterKey(null);
                          }}
                          className={[
                            "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                            selectedMonth === m
                              ? "bg-orange-700 text-white border-orange-700"
                              : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                            dim ? "opacity-40" : "",
                          ].join(" ")}
                        >
                          {monthLabelOf(m)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 주차 패널 */}
              {filterKey === "week" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWeek("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedWeek === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      전체
                    </button>

                    {weekOptions.map((w) => {
                      const wk = w.weekKey;
                      const dim = !enabledWeekKeySet.has(wk);

                      return (
                        <button
                          key={wk}
                          type="button"
                          onClick={() => {
                            setSelectedWeek(wk);
                            setFilterKey(null);
                          }}
                          className={[
                            "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                            selectedWeek === wk
                              ? "bg-orange-700 text-white border-orange-700"
                              : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                            dim ? "opacity-40" : "",
                          ].join(" ")}
                        >
                          {w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 기기 패널 */}
              {filterKey === "device" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDevice("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedDevice === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      전체
                    </button>

                    {deviceOptions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setSelectedDevice(d);
                          setFilterKey(null);
                        }}
                        className={[
                          "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                          selectedDevice === d
                            ? "bg-orange-700 text-white border-orange-700"
                            : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                        ].join(" ")}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 채널 패널 */}
              {filterKey === "channel" && (
                <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                  <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedChannel("all");
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedChannel === "all"
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      전체
                    </button>

                    {channelOptions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setSelectedChannel(c);
                          setFilterKey(null);
                        }}
                        className={[
                          "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                          selectedChannel === c
                            ? "bg-orange-700 text-white border-orange-700"
                            : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                        ].join(" ")}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Tabs + VAT */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTab("summary")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "summary"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  요약
                </button>

                <button
                  type="button"
                  onClick={() => setTab("structure")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "structure"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  구조
                </button>

                <button
                  type="button"
                  onClick={() => setTab("keyword")}
                  className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                    tab === "keyword"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  키워드
                </button>
              </div>

              <div className="text-sm text-gray-600">[+VAT]</div>
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* ✅ BODY (스크롤 영역) - 헤더와 동일한 폭/패딩 */}
    <div className="p-8 pt-6">
      <div className="mx-auto w-full max-w-[1400px]">
        {/* TAB: SUMMARY */}
        {tab === "summary" && (
          <>
            {/* 당월 목표/결과/진도율 */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">당월 목표/결과/진도율</h2>

              <div className="text-sm text-gray-600 mb-2">
                기준 월: <span className="font-semibold text-gray-900">{currentMonthKey}</span>
              </div>

              <div className="overflow-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left p-3">KPI</th>
                      <th className="text-right p-3">Impr</th>
                      <th className="text-right p-3">Clicks</th>
                      <th className="text-right p-3">CTR</th>
                      <th className="text-right p-3">CPC</th>
                      <th className="text-right p-3">Cost</th>
                      <th className="text-right p-3">Conv</th>
                      <th className="text-right p-3">CVR</th>
                      <th className="text-right p-3">CPA</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">ROAS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* 목표 */}
                    <tr className="border-t">
                      <td className="p-3 font-medium">목표(수기입력)</td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[140px] text-right border rounded-md px-2 py-1"
                          value={formatNumber(monthGoal.impressions)}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              impressions: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[140px] text-right border rounded-md px-2 py-1"
                          value={formatNumber(monthGoal.clicks)}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              clicks: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">{(currentMonthGoalComputed.ctr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthGoalComputed.cpc)}</td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[160px] text-right border rounded-md px-2 py-1"
                          value={monthGoal.cost ? KRW(monthGoal.cost) : ""}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              cost: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[140px] text-right border rounded-md px-2 py-1"
                          value={formatNumber(monthGoal.conversions)}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              conversions: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">{(currentMonthGoalComputed.cvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthGoalComputed.cpa)}</td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[160px] text-right border rounded-md px-2 py-1"
                          value={monthGoal.revenue ? KRW(monthGoal.revenue) : ""}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              revenue: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">{(currentMonthGoalComputed.roas * 100).toFixed(1)}%</td>
                    </tr>

                    {/* 결과 */}
                    <tr className="border-t">
                      <td className="p-3 font-medium">결과</td>
                      <td className="p-3 text-right">{currentMonthActual.impressions.toLocaleString()}</td>
                      <td className="p-3 text-right">{currentMonthActual.clicks.toLocaleString()}</td>
                      <td className="p-3 text-right">{(currentMonthActual.ctr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.cpc)}</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.cost)}</td>
                      <td className="p-3 text-right">{currentMonthActual.conversions.toLocaleString()}</td>
                      <td className="p-3 text-right">{(currentMonthActual.cvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.cpa)}</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.revenue)}</td>
                      <td className="p-3 text-right">{(currentMonthActual.roas * 100).toFixed(1)}%</td>
                    </tr>

                    {/* 달성율 */}
                    <tr className="border-t bg-gray-100 font-semibold">
                      <td className="p-3">달성율</td>

                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.impressions, currentMonthGoalComputed.impressions) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.clicks, currentMonthGoalComputed.clicks) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.ctr, currentMonthGoalComputed.ctr) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.cpc, currentMonthGoalComputed.cpc) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.cost, currentMonthGoalComputed.cost) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.conversions, currentMonthGoalComputed.conversions) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.cvr, currentMonthGoalComputed.cvr) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.cpa, currentMonthGoalComputed.cpa) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.revenue, currentMonthGoalComputed.revenue) * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        {(progressRate(currentMonthActual.roas, currentMonthGoalComputed.roas) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <InsightBox text={monthGoalInsight} />
            </section>

            {/* 기간 성과 */}
            <div className="mt-10 mb-3">
              <h2 className="text-lg font-semibold">기간 성과</h2>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <KPI title="노출" value={totals.impressions.toLocaleString()} />
              <KPI title="클릭" value={totals.clicks.toLocaleString()} />
              <KPI title="CTR" value={(totals.ctr * 100).toFixed(2) + "%"} />
              <KPI title="CPC" value={KRW(totals.cpc)} />
              <KPI title="비용" value={KRW(totals.cost)} />

              <KPI title="전환수" value={totals.conversions.toLocaleString()} />
              <KPI title="CVR" value={(totals.cvr * 100).toFixed(2) + "%"} />
              <KPI title="전환매출" value={KRW(totals.revenue)} />
              <KPI title="CPA" value={KRW(totals.cpa)} />
              <KPI title="ROAS" value={(totals.roas * 100).toFixed(1) + "%"} />
            </div>

            {/* 월별 성과 */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold mb-3">월별 성과 (최근 3개월)</h2>

              <div className="overflow-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left p-3">Month</th>
                      <th className="text-right p-3">Impr</th>
                      <th className="text-right p-3">Clicks</th>
                      <th className="text-right p-3">CTR</th>
                      <th className="text-right p-3">CPC</th>
                      <th className="text-right p-3">Cost</th>
                      <th className="text-right p-3">Conv</th>
                      <th className="text-right p-3">CVR</th>
                      <th className="text-right p-3">CPA</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">ROAS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {byMonth.length >= 2 &&
                      (() => {
                        const last = byMonth[0];
                        const prev = byMonth[1];

                        return (
                          <tr className="border-t bg-gray-100 font-semibold">
                            <td className="p-3">증감 (최근월-전월)</td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.impressions, prev.impressions)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.clicks, prev.clicks)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.ctr, prev.ctr)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cpc, prev.cpc)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cost, prev.cost)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.conversions, prev.conversions)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cvr, prev.cvr)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cpa, prev.cpa)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.revenue, prev.revenue)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.roas, prev.roas)} digits={2} />
                            </td>
                          </tr>
                        );
                      })()}

                    {byMonth.map((m) => (
                      <tr key={m.month} className="border-t">
                        <td className="p-3 font-medium">{m.month}</td>
                        <td className="p-3 text-right">{m.impressions.toLocaleString()}</td>
                        <td className="p-3 text-right">{m.clicks.toLocaleString()}</td>
                        <td className="p-3 text-right">{(m.ctr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{KRW(m.cpc)}</td>
                        <td className="p-3 text-right">{KRW(m.cost)}</td>
                        <td className="p-3 text-right">{m.conversions.toLocaleString()}</td>
                        <td className="p-3 text-right">{(m.cvr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{KRW(m.cpa)}</td>
                        <td className="p-3 text-right">{KRW(m.revenue)}</td>
                        <td className="p-3 text-right">{(m.roas * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <InsightBox text={monthlyInsight} />
            </section>

            {/* 주차별 표 */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold mb-3">주차별 성과 (최근 5주)</h2>

              <div className="overflow-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3">Week</th>
                      <th className="text-right p-3">Impr</th>
                      <th className="text-right p-3">Clicks</th>
                      <th className="text-right p-3">CTR</th>
                      <th className="text-right p-3">CPC</th>
                      <th className="text-right p-3">Cost</th>
                      <th className="text-right p-3">Conv</th>
                      <th className="text-right p-3">CVR</th>
                      <th className="text-right p-3">CPA</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">ROAS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lastWeek && prevWeek && (
                      <tr className="bg-gray-100 font-medium">
                        <td className="p-3">증감(최근주-전주)</td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.impressions, prevWeek.impressions)} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.clicks, prevWeek.clicks)} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.ctr, prevWeek.ctr)} digits={2} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.cpc, prevWeek.cpc)} digits={2} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.cost, prevWeek.cost)} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.conversions, prevWeek.conversions)} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.cvr, prevWeek.cvr)} digits={2} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.cpa, prevWeek.cpa)} digits={2} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.revenue, prevWeek.revenue)} />
                        </td>
                        <td className="p-3 text-right">
                          <TrendCell v={diffPct(lastWeek.roas, prevWeek.roas)} digits={2} />
                        </td>
                      </tr>
                    )}

                    {byWeekOnly.map((w) => (
                      <tr key={w.weekKey} className="border-t">
                        <td className="p-3 font-medium">{w.label}</td>
                        <td className="p-3 text-right">{w.impressions.toLocaleString()}</td>
                        <td className="p-3 text-right">{w.clicks.toLocaleString()}</td>
                        <td className="p-3 text-right">{(w.ctr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{KRW(w.cpc)}</td>
                        <td className="p-3 text-right">{KRW(w.cost)}</td>
                        <td className="p-3 text-right">{w.conversions.toLocaleString()}</td>
                        <td className="p-3 text-right">{(w.cvr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{KRW(w.cpa)}</td>
                        <td className="p-3 text-right">{KRW(w.revenue)}</td>
                        <td className="p-3 text-right">{(w.roas * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 주간 차트 */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold mb-3">최근 5주 주간 성과</h2>

              <div className="w-full h-[420px] border rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={byWeekChart} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10 }}
                      width={70}
                      tickFormatter={(v: any) => Number(v).toLocaleString()}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      width={60}
                      tickFormatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
                    />

                    <Tooltip
                      formatter={(value: any, name: any, item: any) => {
                        const key = item?.dataKey ?? name;
                        if (key === "roas") return [`${(Number(value) * 100).toFixed(1)}%`, "ROAS"];
                        if (key === "cost") return [`${KRW(Number(value))}`, "비용"];
                        if (key === "revenue") return [`${KRW(Number(value))}`, "전환매출"];
                        return [value, name];
                      }}
                    />
                    <Legend />

                    <Bar yAxisId="left" dataKey="cost" stackId="a" name="비용" fill="#F59E0B" />
                    <Bar yAxisId="left" dataKey="revenue" stackId="a" name="전환매출" fill="#38BDF8" />

                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="roas"
                      name="ROAS"
                      stroke="#EF4444"
                      strokeWidth={3}
                      dot={(props) => <ArrowDot {...props} data={byWeekChart} />}
                      activeDot={{ r: 7 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 소스별 */}
            <section className="mt-10">
              <h2 className="text-lg font-semibold mb-3">소스별 요약</h2>

              <div className="overflow-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left p-3">Source</th>
                      <th className="text-right p-3">Impr</th>
                      <th className="text-right p-3">Clicks</th>
                      <th className="text-right p-3">CTR</th>
                      <th className="text-right p-3">CPC</th>
                      <th className="text-right p-3">Cost</th>
                      <th className="text-right p-3">Conv</th>
                      <th className="text-right p-3">CVR</th>
                      <th className="text-right p-3">CPA</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">ROAS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {bySource.map((r) => (
                      <tr key={r.source} className="border-t">
                        <td className="p-3 font-medium">{r.source}</td>
                        <td className="p-3 text-right">{r.impressions.toLocaleString()}</td>
                        <td className="p-3 text-right">{r.clicks.toLocaleString()}</td>
                        <td className="p-3 text-right">{(r.ctr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{KRW(r.cpc)}</td>
                        <td className="p-3 text-right">{KRW(r.cost)}</td>
                        <td className="p-3 text-right">{r.conversions.toLocaleString()}</td>
                        <td className="p-3 text-right">{(r.cvr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{KRW(r.cpa)}</td>
                        <td className="p-3 text-right">{KRW(r.revenue)}</td>
                        <td className="p-3 text-right">{(r.roas * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "structure" && <div className="mt-10 border rounded-xl p-6 text-gray-600">구조 탭(준비중)</div>}
        {tab === "keyword" && <div className="mt-10 border rounded-xl p-6 text-gray-600">키워드 탭(준비중)</div>}
      </div>
    </div>
  </main>
);
}
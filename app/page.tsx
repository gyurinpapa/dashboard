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
  groupByKeyword,
  normalizeCsvRows,
  periodText,
  summarize,
} from "./lib/report/aggregate";

import { monthKeyOfDate, parseDateLoose } from "./lib/report/date";
import { useLocalStorageState } from "./lib/useLocalStorageState";
import { useInsights } from "./hooks/useInsights";

import HeaderBar from "./components/sections/HeaderBar";
import StructureSection from "./components/sections/StructureSection";
import KeywordSection from "./components/sections/KeywordSection";
import SummarySection from "./components/sections/SummarySection";
import CreativeSection from "./components/sections/CreativeSection";
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

  // ============================
  // ✅ Keyword 탭 데이터 (좌측 필터만 적용)
  // ============================
  const keywordBaseRows = useMemo(() => filteredRows, [filteredRows]);
  const keywordAgg = useMemo(() => groupByKeyword(keywordBaseRows as any[]), [keywordBaseRows]);

  // ✅ keywordInsight 생성 (keywordAgg 만든 후 + 목표/결과/키워드/소스/기기/평균노출순위(있으면))
    // ✅ keywordInsight 생성 (keywordAgg 만든 후 + 목표/결과/키워드/소스/기기/평균노출순위(있으면))
  const keywordInsight = useMemo(() => {
    // --- 안전 숫자 변환 ---
    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const pct01 = (v01: number) => `${(v01 * 100).toFixed(1)}%`;
    const pct100 = (v100: number) => `${v100.toFixed(1)}%`;

    // (A) 목표/결과 기반 갭
    const goal = currentMonthGoalComputed as any;
    const actual = currentMonthActual as any;

    const goalCost = num(goal?.cost);
    const goalRev = num(goal?.revenue);
    const goalConv = num(goal?.conversions);
    const goalClicks = num(goal?.clicks);

    const actCost = num(actual?.cost);
    const actRev = num(actual?.revenue);
    const actConv = num(actual?.conversions);
    const actClicks = num(actual?.clicks);

    const goalROAS = goalCost > 0 ? goalRev / goalCost : 0;
    const actROAS = actCost > 0 ? actRev / actCost : 0;

    const goalCVR = goalClicks > 0 ? goalConv / goalClicks : 0;
    const actCVR = actClicks > 0 ? actConv / actClicks : 0;

    const progressConv = goalConv > 0 ? actConv / goalConv : 0;
    const progressRev = goalRev > 0 ? actRev / goalRev : 0;
    const progressCost = goalCost > 0 ? actCost / goalCost : 0;

    // (B) 키워드 집계에서 TOP/집중도 파악
    const kw = (keywordAgg || []).map((r: any) => ({
      keyword: String(r.keyword ?? r.label ?? r.name ?? ""),
      clicks: num(r.clicks),
      conversions: num(r.conversions ?? r.conv),
      roas: num(r.roas),
      cost: num(r.cost),
      revenue: num(r.revenue),
      // 평균노출순위 컬럼명이 다르면 여기만 추가로 붙이면 됨
      avgPos:
        num((r as any).avgPosition) ||
        num((r as any).avg_position) ||
        num((r as any).avgRank) ||
        num((r as any).avg_rank),
    }));

    const sumClicks = kw.reduce((a, b) => a + b.clicks, 0);
    const sumConv = kw.reduce((a, b) => a + b.conversions, 0);

    const top5Clicks = [...kw].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
    const top5Conv = [...kw].sort((a, b) => b.conversions - a.conversions).slice(0, 5);

    const topClicksShare =
      sumClicks > 0 ? top5Clicks.reduce((a, b) => a + b.clicks, 0) / sumClicks : 0;
    const topConvShare =
      sumConv > 0 ? top5Conv.reduce((a, b) => a + b.conversions, 0) / sumConv : 0;

    // (C) 원본 rows에서 소스/기기 요약
    const bySource = new Map<string, { clicks: number; conv: number; cost: number; rev: number }>();
    const byDevice = new Map<string, { clicks: number; conv: number; cost: number; rev: number }>();

    for (const r of keywordBaseRows as any[]) {
      const source = String(
        (r as any).source ?? (r as any).platform ?? (r as any).medium ?? "unknown"
      );
      const device = String((r as any).device ?? "unknown");
      const clicks = num((r as any).clicks);
      const conv = num((r as any).conversions ?? (r as any).conv);
      const cost = num((r as any).cost);
      const rev = num((r as any).revenue);

      const s = bySource.get(source) ?? { clicks: 0, conv: 0, cost: 0, rev: 0 };
      s.clicks += clicks;
      s.conv += conv;
      s.cost += cost;
      s.rev += rev;
      bySource.set(source, s);

      const d = byDevice.get(device) ?? { clicks: 0, conv: 0, cost: 0, rev: 0 };
      d.clicks += clicks;
      d.conv += conv;
      d.cost += cost;
      d.rev += rev;
      byDevice.set(device, d);
    }

    const pickBest = (
      m: Map<string, { clicks: number; conv: number; cost: number; rev: number }>,
      key: "rev" | "conv" | "clicks"
    ) => {
      const arr = Array.from(m.entries()).map(([k, v]) => ({ k, ...v }));
      arr.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
      return arr[0];
    };

    const bestSource =
      pickBest(bySource, "rev") || pickBest(bySource, "conv") || pickBest(bySource, "clicks");
    const bestDevice =
      pickBest(byDevice, "rev") || pickBest(byDevice, "conv") || pickBest(byDevice, "clicks");

    const bestSourceROAS = bestSource?.cost > 0 ? bestSource.rev / bestSource.cost : 0;
    const bestDeviceROAS = bestDevice?.cost > 0 ? bestDevice.rev / bestDevice.cost : 0;

    // (D) 평균노출순위가 있으면 사용
    const hasAvgPos = kw.some((x) => x.avgPos > 0);
    const avgPosOverall = hasAvgPos
      ? kw.filter((x) => x.avgPos > 0).reduce((a, b) => a + b.avgPos, 0) /
        Math.max(1, kw.filter((x) => x.avgPos > 0).length)
      : 0;

    // --- 문장 구성 (✅ “요약 인사이트는 …입니다.” 톤) ---
    const lines: string[] = [];
    lines.push(
      `- 키워드 분포는 클릭 Top5가 전체 클릭의 ${pct100(topClicksShare * 100)}, 전환 Top5가 전체 전환의 ${pct100(
        topConvShare * 100
      )}로 상위 키워드 집중도가 높은 편입니다.`
    );

    if (bestSource?.k) {
      lines.push(
        `- 성과 중심 소스는 ${bestSource.k}이며, 해당 구간 ROAS는 ${pct100(
          bestSourceROAS * 100
        )}입니다.`
      );
    }

    if (bestDevice?.k) {
      lines.push(
        `- 성과 중심 기기는 ${bestDevice.k}이며, 해당 구간 ROAS는 ${pct100(
          bestDeviceROAS * 100
        )}입니다.`
      );
    }

    if (hasAvgPos) {
      lines.push(
        `- 평균 노출 순위(추정)는 ${avgPosOverall.toFixed(
          2
        )}이며, 전환 기여 키워드는 순위 유지가 유리하고 비전환 키워드는 노출/입찰 조정으로 비용 통제가 필요합니다.`
      );
    }

    lines.push("");
    lines.push(
      "- 전환 Top 키워드는 현재 구조를 유지하면서 입찰을 점진적으로 상향해 전환 볼륨을 확대하는 방향이 적절합니다."
    );
    lines.push(
      "- 클릭은 높지만 전환이 낮은 키워드는 의도 불일치 가능성이 있어 네거티브 확장과 랜딩/소재 분리 테스트가 필요합니다."
    );
    lines.push(
      "- ROAS가 높은 키워드는 동일 의도의 롱테일 확장과 예산 분리를 통해 효율을 보호하면서 확장하는 운영이 유리합니다."
    );
    lines.push(
      "- 비용 비중이 큰 구간은 매칭 타입을 보수적으로 조정하고 상한 CPC를 설정해 CPA 안정화가 필요합니다."
    );
    lines.push(
      "- 소스/기기 편차가 큰 경우 성과가 좋은 구간에 예산을 집중하고 약한 구간은 노출·입찰을 낮춰 재배분하는 것이 효율적입니다."
    );

    return lines.join("\n");
  }, [keywordAgg, keywordBaseRows, currentMonthActual, currentMonthGoalComputed]);


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
            <KeywordSection
              keywordAgg={keywordAgg}
              keywordInsight={keywordInsight}
            />
          )}

          {tab === "creative" && (
            <CreativeSection />
          )}


        </div>
      </div>
    </main>
  );
}

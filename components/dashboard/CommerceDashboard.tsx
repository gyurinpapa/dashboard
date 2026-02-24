"use client";

import { useMemo, useState } from "react";
import { parseDateLoose } from "../../src/lib/report/date";

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

// ✅ DB 훅
import { useReportRowsDb } from "@/lib/report/useReportRowsDb";

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

// ✅ rows 단계 필터 옵션
type RowOptions = {
  from?: string;
  to?: string;
  channels?: ("search" | "display")[];
};

type Props = {
  dataUrl?: string;
  init?: DashboardInit;
  rowOptions?: RowOptions;

  workspaceId?: string;
  rowsOverride?: any[];
};

/** =========================
 * RowOptions filtering (safe, dashboard-level guarantee)
 * ========================= */

function toDateOrNull(v?: string) {
  if (!v) return null;
  const d = parseDateLoose(v);
  return d && Number.isFinite(d.getTime()) ? d : null;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function getRowDate(row: any): Date | null {
  const candidates = [
    row?.date,
    row?.day,
    row?.ymd,
    row?.period_date,
    row?.metric_date,
    row?.report_date,
    row?.dt,
  ];

  for (const c of candidates) {
    if (!c) continue;
    if (c instanceof Date && Number.isFinite(c.getTime())) return c;
    const d = parseDateLoose(String(c));
    if (d && Number.isFinite(d.getTime())) return d;
  }
  return null;
}

function getRowChannelGroup(row: any): "search" | "display" | null {
  const direct =
    row?.channelGroup ??
    row?.channel_group ??
    row?.channelType ??
    row?.channel_type ??
    row?.mediaType ??
    row?.media_type ??
    row?.inventoryType ??
    row?.inventory_type;

  if (direct === "search" || direct === "display") return direct;

  const maybe = String(
    row?.channel ??
      row?.source ??
      row?.media ??
      row?.platform ??
      row?.campaignType ??
      ""
  ).toLowerCase();

  if (!maybe) return null;

  if (
    maybe.includes("search") ||
    maybe.includes("sa") ||
    maybe.includes("powerlink") ||
    maybe.includes("shopping")
  ) {
    return "search";
  }

  if (
    maybe.includes("display") ||
    maybe.includes("gdn") ||
    maybe.includes("gfa") ||
    maybe.includes("da") ||
    maybe.includes("banner")
  ) {
    return "display";
  }

  return null;
}

function isWithinRangeInclusive(d: Date, from: Date | null, to: Date | null) {
  const t = d.getTime();
  const fromT = from ? startOfDay(from).getTime() : null;
  const toT = to ? endOfDay(to).getTime() : null;

  if (fromT != null && t < fromT) return false;
  if (toT != null && t > toT) return false;
  return true;
}

function applyRowOptions<T extends any>(rows: T[], options?: RowOptions) {
  if (!options) return rows;

  const fromD = toDateOrNull(options.from);
  const toD = toDateOrNull(options.to);
  const channels = options.channels?.length ? options.channels : null;

  if (!fromD && !toD && !channels) return rows;

  return rows.filter((row: any) => {
    if (fromD || toD) {
      const d = getRowDate(row);
      if (!d) return false;
      if (!isWithinRangeInclusive(d, fromD, toD)) return false;
    }

    if (channels) {
      const g = getRowChannelGroup(row);
      if (!g) return false;
      if (!channels.includes(g)) return false;
    }

    return true;
  });
}

/** =========================
 * KPI helpers
 * ========================= */

function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function fmtInt(n: any) {
  const v = safeNum(n);
  return Math.round(v).toLocaleString();
}

function fmtWon(n: any) {
  const v = safeNum(n);
  return `${Math.round(v).toLocaleString()}원`;
}

function fmtPct01(n: any) {
  const v = safeNum(n);
  return `${(v * 100).toFixed(2)}%`;
}

function fmtPct100(n: any) {
  const v = safeNum(n);
  return `${(v * 100).toFixed(1)}%`;
}

function fmtX(n: any) {
  const v = safeNum(n);
  return `${v.toFixed(2)}x`;
}

function diffPct(cur: number, prev: number) {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return (cur - prev) / prev;
}

function fmtDeltaPct(v: number | null) {
  if (v == null) return "-";
  const s = v >= 0 ? "+" : "";
  return `${s}${(v * 100).toFixed(1)}%`;
}

/**
 * series에서 (현재, 이전) 값을 뽑는다.
 * - selectedKey가 "all"이면: 최신 2개
 * - selectedKey가 특정 값이면: 해당 항목과 그 직전 항목
 * key를 최대한 유연하게 찾는다.
 */
function pickCurrentPrevFromSeries(
  series: any[],
  selectedKey: string | null,
  keyCandidates: string[]
): { cur: any | null; prev: any | null } {
  if (!Array.isArray(series) || series.length === 0) return { cur: null, prev: null };

  const getKey = (x: any) => {
    for (const k of keyCandidates) {
      if (x?.[k]) return String(x[k]);
    }
    return "";
  };

  const sorted = [...series]
    .map((x) => ({ x, k: getKey(x) }))
    .filter((p) => p.k)
    .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : 0))
    .map((p) => p.x);

  if (sorted.length === 0) return { cur: null, prev: null };

  // all이면 최신 2개
  if (!selectedKey || selectedKey === "all") {
    return { cur: sorted[0] ?? null, prev: sorted[1] ?? null };
  }

  const idx = sorted.findIndex((x) => getKey(x) === String(selectedKey));
  if (idx < 0) {
    // 못 찾으면 안전하게 최신 2개
    return { cur: sorted[0] ?? null, prev: sorted[1] ?? null };
  }
  return { cur: sorted[idx] ?? null, prev: sorted[idx + 1] ?? null };
}

function calcTotalsDerived(totals: any) {
  const impressions = safeNum(totals?.impressions);
  const clicks = safeNum(totals?.clicks);
  const cost = safeNum(totals?.cost);
  const conversions = safeNum(totals?.conversions);
  const revenue = safeNum(totals?.revenue);

  const ctr = totals?.ctr ?? (impressions ? clicks / impressions : 0);
  const cvr = totals?.cvr ?? (clicks ? conversions / clicks : 0);
  const cpc = totals?.cpc ?? (clicks ? cost / clicks : 0);
  const cpa = totals?.cpa ?? (conversions ? cost / conversions : 0);
  const roas = totals?.roas ?? (cost ? revenue / cost : 0);

  return { impressions, clicks, cost, conversions, revenue, ctr, cvr, cpc, cpa, roas };
}

function ChannelKpiCard({
  title,
  subtitle,
  totals,
  allTotals,
  wow,
  mom,
}: {
  title: string;
  subtitle?: string;
  totals: any;
  allTotals: any; // contribution 기준(전체 all 채널)
  wow: { revenue: string; cost: string; roas: string; conv: string; cpa: string };
  mom: { revenue: string; cost: string; roas: string; conv: string; cpa: string };
}) {
  const t = calcTotalsDerived(totals);
  const all = calcTotalsDerived(allTotals);

  const contribCost = all.cost ? t.cost / all.cost : null;
  const contribRev = all.revenue ? t.revenue / all.revenue : null;
  const contribConv = all.conversions ? t.conversions / all.conversions : null;

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-zinc-500">{subtitle}</div> : null}
        </div>

        {/* 기여도 */}
        <div className="text-right">
          <div className="text-[11px] text-zinc-500">기여도(전체 대비)</div>
          <div className="mt-1 text-xs font-semibold text-zinc-900">
            Cost {contribCost == null ? "-" : fmtPct100(contribCost)} · Revenue{" "}
            {contribRev == null ? "-" : fmtPct100(contribRev)} · Conv{" "}
            {contribConv == null ? "-" : fmtPct100(contribConv)}
          </div>
        </div>
      </div>

      {/* 핵심 KPI */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">Cost</div>
          <div className="mt-1 text-base font-semibold">{fmtWon(t.cost)}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">Revenue</div>
          <div className="mt-1 text-base font-semibold">{fmtWon(t.revenue)}</div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">ROAS</div>
          <div className="mt-1 text-base font-semibold">{fmtX(t.roas)}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">Conversions</div>
          <div className="mt-1 text-base font-semibold">{fmtInt(t.conversions)}</div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">Clicks / CTR</div>
          <div className="mt-1 text-sm font-semibold">
            {fmtInt(t.clicks)} <span className="text-zinc-500">({fmtPct01(t.ctr)})</span>
          </div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">CPC / CVR</div>
          <div className="mt-1 text-sm font-semibold">
            {fmtWon(t.cpc)} <span className="text-zinc-500">({fmtPct01(t.cvr)})</span>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">CPA</div>
          <div className="mt-1 text-base font-semibold">{fmtWon(t.cpa)}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] text-zinc-500">Impressions</div>
          <div className="mt-1 text-base font-semibold">{fmtInt(t.impressions)}</div>
        </div>
      </div>

      {/* 증감 */}
      <div className="mt-4 rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-zinc-900">증감</div>
          <div className="text-[11px] text-zinc-500">전주 / 전월</div>
        </div>

        <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
          <div className="rounded-lg bg-zinc-50 p-2">
            <div className="text-[11px] text-zinc-500">Revenue</div>
            <div className="mt-1 font-semibold">
              {wow.revenue} <span className="text-zinc-400">/</span> {mom.revenue}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2">
            <div className="text-[11px] text-zinc-500">Cost</div>
            <div className="mt-1 font-semibold">
              {wow.cost} <span className="text-zinc-400">/</span> {mom.cost}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2">
            <div className="text-[11px] text-zinc-500">ROAS</div>
            <div className="mt-1 font-semibold">
              {wow.roas} <span className="text-zinc-400">/</span> {mom.roas}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2">
            <div className="text-[11px] text-zinc-500">Conv</div>
            <div className="mt-1 font-semibold">
              {wow.conv} <span className="text-zinc-400">/</span> {mom.conv}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2">
            <div className="text-[11px] text-zinc-500">CPA</div>
            <div className="mt-1 font-semibold">
              {wow.cpa} <span className="text-zinc-400">/</span> {mom.cpa}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CommerceDashboard({
  dataUrl = "/data/acc_001.csv",
  init,
  rowOptions,
  workspaceId,
  rowsOverride,
}: Props) {
  const effectiveRowOptions: RowOptions | undefined = useMemo(() => {
    const from = rowOptions?.from ?? init?.period?.from;
    const to = rowOptions?.to ?? init?.period?.to;
    const channels = rowOptions?.channels;

    if (!from && !to && (!channels || channels.length === 0)) return undefined;
    return { from, to, channels };
  }, [
    rowOptions?.from,
    rowOptions?.to,
    rowOptions?.channels,
    init?.period?.from,
    init?.period?.to,
  ]);

  const {
    rows: dbRows,
    isLoading: isDbLoading,
    error: dbError,
  } = useReportRowsDb({
    workspaceId: workspaceId ?? "",
    from: effectiveRowOptions?.from,
    to: effectiveRowOptions?.to,
  });

  if (dbError) console.error("[useReportRowsDb]", dbError);

  const { rows: csvRows, isLoading: isCsvLoading } = useReportRows(dataUrl, {
    from: effectiveRowOptions?.from,
    to: effectiveRowOptions?.to,
    channels: effectiveRowOptions?.channels,
  });

  const baseRows = useMemo(() => {
    if (rowsOverride && rowsOverride.length > 0) return rowsOverride;

    if (workspaceId) {
      if (dbRows && dbRows.length > 0) return dbRows;
      return csvRows;
    }

    return csvRows;
  }, [rowsOverride, workspaceId, dbRows, csvRows]);

  const isLoading = useMemo(() => {
    if (rowsOverride && rowsOverride.length > 0) return false;
    if (workspaceId) return isDbLoading;
    return isCsvLoading;
  }, [rowsOverride, workspaceId, isDbLoading, isCsvLoading]);

  const rowsByRowOptions = useMemo(() => {
    return applyRowOptions(baseRows as any[], effectiveRowOptions);
  }, [baseRows, effectiveRowOptions]);

  // ===== state =====
  const [tab, setTab] = useState<TabKey>(init?.tab ?? "summary");

  const [filterKey, setFilterKey] = useState<FilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(
    init?.selectedMonth ?? "all"
  );
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>(
    init?.selectedWeek ?? "all"
  );
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>(
    init?.selectedDevice ?? "all"
  );
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>(
    init?.selectedChannel ?? "all"
  );

  const [monthGoal, setMonthGoal] = useLocalStorageState<GoalState>(
    MONTH_GOAL_KEY,
    DEFAULT_GOAL
  );

  const agg = useReportAggregates({
    rows: rowsByRowOptions as any[],
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    monthGoal,
    onInvalidWeek: () => setSelectedWeek("all"),
  });

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
  } = agg;

  /**
   * ✅ baseline(전체 all 채널) — 기여도 계산용
   * - 월/주/디바이스는 동일, 채널만 all로 고정
   */
  const allAgg = useReportAggregates({
    rows: rowsByRowOptions as any[],
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel: "all" as any,
    monthGoal,
    onInvalidWeek: () => {},
  });

  /**
   * ✅ search / display 고정 집계(카드 + 증감 계산용)
   */
  const searchAgg = useReportAggregates({
    rows: rowsByRowOptions as any[],
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel: "search" as any,
    monthGoal,
    onInvalidWeek: () => {},
  });

  const displayAgg = useReportAggregates({
    rows: rowsByRowOptions as any[],
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel: "display" as any,
    monthGoal,
    onInvalidWeek: () => {},
  });

  // ✅ (전주/전월) 증감 계산
  const deltas = useMemo(() => {
    const make = (a: any) => {
      // 전주
      const w = pickCurrentPrevFromSeries(
        a?.byWeekOnly ?? [],
        selectedWeek as any,
        ["weekKey", "week", "key", "label"]
      );
      const wCur = w.cur ? calcTotalsDerived(w.cur) : null;
      const wPrev = w.prev ? calcTotalsDerived(w.prev) : null;

      // 전월
      const m = pickCurrentPrevFromSeries(
        a?.byMonth ?? [],
        selectedMonth as any,
        ["monthKey", "month", "key", "label"]
      );
      const mCur = m.cur ? calcTotalsDerived(m.cur) : null;
      const mPrev = m.prev ? calcTotalsDerived(m.prev) : null;

      const wow = {
        revenue: fmtDeltaPct(
          wCur && wPrev ? diffPct(wCur.revenue, wPrev.revenue) : null
        ),
        cost: fmtDeltaPct(wCur && wPrev ? diffPct(wCur.cost, wPrev.cost) : null),
        roas: fmtDeltaPct(wCur && wPrev ? diffPct(wCur.roas, wPrev.roas) : null),
        conv: fmtDeltaPct(
          wCur && wPrev ? diffPct(wCur.conversions, wPrev.conversions) : null
        ),
        cpa: fmtDeltaPct(wCur && wPrev ? diffPct(wCur.cpa, wPrev.cpa) : null),
      };

      const mom = {
        revenue: fmtDeltaPct(
          mCur && mPrev ? diffPct(mCur.revenue, mPrev.revenue) : null
        ),
        cost: fmtDeltaPct(mCur && mPrev ? diffPct(mCur.cost, mPrev.cost) : null),
        roas: fmtDeltaPct(mCur && mPrev ? diffPct(mCur.roas, mPrev.roas) : null),
        conv: fmtDeltaPct(
          mCur && mPrev ? diffPct(mCur.conversions, mPrev.conversions) : null
        ),
        cpa: fmtDeltaPct(mCur && mPrev ? diffPct(mCur.cpa, mPrev.cpa) : null),
      };

      return { wow, mom };
    };

    return {
      search: make(searchAgg),
      display: make(displayAgg),
    };
  }, [searchAgg, displayAgg, selectedWeek, selectedMonth]);

  const { monthGoalInsight } = useInsights({
    byMonth,
    rowsLength: rowsByRowOptions.length,
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
              {/* ✅ Search / Display KPI cards + 기여도 + 전주/전월 증감 */}
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <ChannelKpiCard
                  title="Search 성과 요약"
                  subtitle="선택한 월/주/디바이스 조건 기준 (채널만 Search 고정)"
                  totals={searchAgg.totals}
                  allTotals={allAgg.totals}
                  wow={deltas.search.wow}
                  mom={deltas.search.mom}
                />
                <ChannelKpiCard
                  title="Display 성과 요약"
                  subtitle="선택한 월/주/디바이스 조건 기준 (채널만 Display 고정)"
                  totals={displayAgg.totals}
                  allTotals={allAgg.totals}
                  wow={deltas.display.wow}
                  mom={deltas.display.mom}
                />
              </div>

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
            <KeywordSection keywordAgg={keywordAgg} keywordInsight={keywordInsight} />
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
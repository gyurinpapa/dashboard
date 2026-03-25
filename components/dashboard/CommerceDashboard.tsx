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

import type { ReportPeriod } from "../../src/lib/report/period";
import { resolvePresetPeriod } from "../../src/lib/report/period";

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

type RowOptions = {
  from?: string;
  to?: string;
  channels?: ("search" | "display")[];
};

type Props = {
  dataUrl?: string;
  init?: DashboardInit;
  rowOptions?: RowOptions;
  rowsOverride?: any[];
};

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

export default function CommerceDashboard({
  dataUrl = "/data/TEST_ver1.csv",
  init,
  rowOptions,
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

  const { rows: csvRows, isLoading } = useReportRows(dataUrl, {
    from: effectiveRowOptions?.from,
    to: effectiveRowOptions?.to,
    channels: effectiveRowOptions?.channels,
  });

  const baseRows = useMemo(() => {
    if (rowsOverride && rowsOverride.length > 0) return rowsOverride;
    return csvRows;
  }, [rowsOverride, csvRows]);

  const rowsByRowOptions = useMemo(() => {
    return applyRowOptions(baseRows as any[], effectiveRowOptions);
  }, [baseRows, effectiveRowOptions]);

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

  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(() =>
    resolvePresetPeriod()
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
    rows: rowsByRowOptions as any[],
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    monthGoal,
    onInvalidWeek: () => setSelectedWeek("all"),
  });

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
        fullPeriod={period}
        period={period}
        reportPeriod={reportPeriod}
        onChangeReportPeriod={setReportPeriod}
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

              {(() => {
                const currentMonthKey = (totals as any)?.currentMonthKey ?? null;
                const currentMonthActual = (totals as any)?.currentMonthActual ?? totals;

                const monthGoal = (totals as any)?.monthGoal ?? null;

                const currentMonthGoalComputed =
                  (totals as any)?.currentMonthGoalComputed ?? {
                    imp: 0,
                    click: 0,
                    cost: 0,
                    conv: 0,
                    revenue: 0,
                    ctr: 0,
                    cpc: 0,
                    cvr: 0,
                    cpa: 0,
                    roas: 0,
                  };

                const setMonthGoal = () => {};
                const monthGoalInsight = null;

                return (
                  <SummarySection
                    totals={totals as any}
                    byMonth={byMonth as any}
                    byWeekOnly={byWeekOnly as any}
                    byWeekChart={byWeekChart as any}
                    bySource={bySource as any}
                    currentMonthKey={currentMonthKey}
                    currentMonthActual={currentMonthActual}
                    currentMonthGoalComputed={currentMonthGoalComputed}
                    monthGoal={monthGoal}
                    setMonthGoal={setMonthGoal}
                    monthGoalInsight={monthGoalInsight}
                  />
                );
              })()}
            </>
          )}

          {tab === "structure" && (
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

          {tab === "creative" && <CreativeSection rows={creativeBaseRows} />}

          {tab === "creativeDetail" && (
            <CreativeDetailSection rows={filteredRows as any[]} />
          )}
        </div>
      </div>
    </main>
  );
}
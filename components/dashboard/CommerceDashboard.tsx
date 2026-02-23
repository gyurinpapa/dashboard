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
  from?: string; // e.g. "2026-02-01" or "2026. 02. 01."
  to?: string; // e.g. "2026-02-29" or "2026. 02. 29."
  channels?: ("search" | "display")[];
};

type Props = {
  dataUrl?: string;
  init?: DashboardInit;
  rowOptions?: RowOptions;

  /**
   * ✅ NEW: DB(metrics_daily) 등에서 만든 "Row 배열"을 주입하는 통로
   * - 값이 있으면 CSV rows 대신 이것을 우선 사용
   */
  rowsOverride?: any[];
};

/** =========================
 * RowOptions filtering (safe, dashboard-level guarantee)
 * ========================= */

function toDateOrNull(v?: string) {
  if (!v) return null;
  const d = parseDateLoose(v); // ✅ 점(.) 포맷까지 안전 처리
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

// row에서 날짜 필드 후보들을 최대한 안전하게 탐색
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

    // Date 객체면 그대로 사용
    if (c instanceof Date && Number.isFinite(c.getTime())) return c;

    const d = parseDateLoose(String(c));
    if (d && Number.isFinite(d.getTime())) return d;
  }
  return null;
}

// row에서 채널 그룹(search/display) 필드 후보 탐색
function getRowChannelGroup(row: any): "search" | "display" | null {
  // ✅ 가장 가능성 높은 후보들
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

  // ✅ 혹시 문자열에 힌트가 들어있는 경우(너무 공격적이지 않게)
  const maybe = String(
    row?.channel ??
      row?.source ??
      row?.media ??
      row?.platform ??
      row?.campaignType ??
      ""
  ).toLowerCase();

  if (!maybe) return null;

  // search 힌트
  if (
    maybe.includes("search") ||
    maybe.includes("sa") || // naver sa 같은 케이스
    maybe.includes("powerlink") ||
    maybe.includes("shopping")
  ) {
    return "search";
  }

  // display 힌트
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

  // 옵션이 사실상 비어있으면 그대로 반환
  if (!fromD && !toD && !channels) return rows;

  return rows.filter((row: any) => {
    // 기간 필터
    if (fromD || toD) {
      const d = getRowDate(row);
      // 날짜 필드가 없으면 "기간필터 적용 불가" → 안전하게 제외(=필터 의도에 맞춤)
      if (!d) return false;
      if (!isWithinRangeInclusive(d, fromD, toD)) return false;
    }

    // 채널 그룹 필터(search/display)
    if (channels) {
      const g = getRowChannelGroup(row);
      // 채널 구분이 불가능하면 안전하게 제외
      if (!g) return false;
      if (!channels.includes(g)) return false;
    }

    return true;
  });
}

export default function CommerceDashboard({
  dataUrl = "/data/acc_001.csv",
  init,
  rowOptions,
  rowsOverride, // ✅ NEW
}: Props) {
  // ✅ rowOptions 우선, 없으면 init.period fallback
  const effectiveRowOptions: RowOptions | undefined = useMemo(() => {
    const from = rowOptions?.from ?? init?.period?.from;
    const to = rowOptions?.to ?? init?.period?.to;
    const channels = rowOptions?.channels;

    // 모두 없으면 undefined로 (불필요한 리렌더/필터 방지)
    if (!from && !to && (!channels || channels.length === 0)) return undefined;

    return { from, to, channels };
  }, [
    rowOptions?.from,
    rowOptions?.to,
    rowOptions?.channels,
    init?.period?.from,
    init?.period?.to,
  ]);

  // ✅ CSV rows도 로드(테스트/백업). 실제 운영은 rowsOverride로 주입
  const { rows: csvRows, isLoading } = useReportRows(dataUrl, {
    from: effectiveRowOptions?.from,
    to: effectiveRowOptions?.to,
    channels: effectiveRowOptions?.channels,
  });

  // ✅ rows source 선택: rowsOverride가 있으면 우선 사용
  const baseRows = useMemo(() => {
    if (rowsOverride && rowsOverride.length > 0) return rowsOverride;
    return csvRows;
  }, [rowsOverride, csvRows]);

  // ✅ Dashboard 레벨에서 필터 보장
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
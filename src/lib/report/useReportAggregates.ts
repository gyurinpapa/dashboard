// src/lib/report/useReportAggregates.ts
"use client";

import { useEffect, useMemo } from "react";

import type {
  ChannelKey,
  DeviceKey,
  GoalState,
  MonthKey,
  Row,
  WeekKey,
} from "./types";

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

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}
function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getImagePathAny(r: any) {
  return (
    asStr(r?.imagepath_raw) ||
    asStr(r?.imagePath) ||
    asStr(r?.imagepath) ||
    asStr(r?.image_path) ||
    asStr(r?.image_raw) ||
    ""
  );
}
function hasCreativeAny(r: any) {
  return (
    !!asStr(r?.creative) ||
    !!getImagePathAny(r) ||
    !!asStr(r?.creative_file) ||
    !!asStr(r?.creativeFile)
  );
}

/**
 * ✅ Row를 “원본 매칭용 signature”로 만드는 함수
 */
function sigOfRow(r: any) {
  const rid = asStr(r?.__row_id ?? r?.id);
  if (rid) return `ID:${rid}`;

  const d = parseDateLoose(
    r?.date ??
      r?.report_date ??
      r?.day ??
      r?.segment_date ??
      r?.stat_date ??
      r?.period_start
  );
  const ymd = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    : asStr(
        r?.date ??
          r?.report_date ??
          r?.day ??
          r?.segment_date ??
          r?.stat_date ??
          r?.period_start
      );

  const channel = asStr(r?.channel ?? r?.media ?? r?.ad_channel);
  const source = asStr(r?.source ?? r?.site_source ?? r?.publisher);
  const device = asStr(r?.device ?? r?.device_type);

  const platform = asStr(r?.platform ?? r?.media_source);
  const campaign = asStr(
    r?.campaign_name ?? r?.campaignName ?? r?.campaign ?? r?.campaign_nm
  );
  const group = asStr(
    r?.group_name ?? r?.groupName ?? r?.adgroup_name ?? r?.ad_group ?? r?.group
  );
  const keyword = asStr(r?.keyword ?? r?.keyword_name ?? r?.search_term);

  const imp = asNum(r?.impressions ?? r?.impr ?? r?.views);
  const clk = asNum(r?.clicks ?? r?.click ?? r?.clk);
  const cost = asNum(r?.cost ?? r?.spend ?? r?.ad_cost);
  const conv = asNum(r?.conversions ?? r?.conv ?? r?.cv);
  const rev = asNum(r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv);
  const rank = asStr(r?.rank);

  return [
    `D:${ymd}`,
    `C:${channel}`,
    `S:${source}`,
    `DV:${device}`,
    `P:${platform}`,
    `CP:${campaign}`,
    `G:${group}`,
    `K:${keyword}`,
    `I:${imp}`,
    `CL:${clk}`,
    `CO:${cost}`,
    `CV:${conv}`,
    `R:${rev}`,
    `RK:${rank}`,
  ].join("|");
}

/**
 * ✅ filterRows가 “새 객체”를 만들어 원본 필드(id/creative/imagePath 등)를 날리는 경우를 복구(hydrate)
 */
function hydrateFilteredRows(filteredRows: any[], originalRows: any[]) {
  const origBySig = new Map<string, any>();
  for (const o of originalRows ?? []) {
    const sig = sigOfRow(o);
    if (!origBySig.has(sig)) origBySig.set(sig, o);
  }

  return (filteredRows ?? []).map((fr) => {
    const sig = sigOfRow(fr);
    const orig = origBySig.get(sig);

    if (!orig) return fr;

    const origId = orig?.__row_id ?? orig?.id ?? null;
    const frId = fr?.__row_id ?? fr?.id ?? null;

    const origImagePath =
      orig?.imagePath ?? orig?.imagepath ?? orig?.image_path ?? null;
    const frImagePath = fr?.imagePath ?? fr?.imagepath ?? fr?.image_path ?? null;

    const origCreativeFile = orig?.creative_file ?? orig?.creativeFile ?? null;
    const frCreativeFile = fr?.creative_file ?? fr?.creativeFile ?? null;

    const origCreative = orig?.creative ?? null;
    const frCreative = fr?.creative ?? null;

    return {
      ...fr,

      id: frId ?? origId ?? fr?.id,
      __row_id: frId ?? origId ?? fr?.__row_id,

      creative: asStr(frCreative) ? frCreative : origCreative,
      creative_file: asStr(frCreativeFile) ? frCreativeFile : origCreativeFile,
      creativeFile: asStr(fr?.creativeFile)
        ? fr.creativeFile
        : asStr(orig?.creativeFile)
        ? orig.creativeFile
        : undefined,

      imagePath: asStr(fr?.imagePath)
        ? fr.imagePath
        : asStr(frImagePath)
        ? frImagePath
        : asStr(origImagePath)
        ? origImagePath
        : fr?.imagePath,
      imagepath: asStr(fr?.imagepath)
        ? fr.imagepath
        : asStr(frImagePath)
        ? frImagePath
        : asStr(origImagePath)
        ? origImagePath
        : fr?.imagepath,
      image_path: asStr(fr?.image_path)
        ? fr.image_path
        : asStr(frImagePath)
        ? frImagePath
        : asStr(orig?.image_path)
        ? orig.image_path
        : fr?.image_path,

      imagepath_raw: asStr((fr as any)?.imagepath_raw)
        ? (fr as any).imagepath_raw
        : asStr((orig as any)?.imagepath_raw)
        ? (orig as any).imagepath_raw
        : (fr as any)?.imagepath_raw,
    };
  });
}

export function useReportAggregates({
  rows,
  selectedMonth,
  selectedWeek,
  selectedDevice,
  selectedChannel,
  monthGoal,
  onInvalidWeek,
}: Args) {
  // ============================================================
  // ✅ 가장 중요한 보강
  // raw rows를 먼저 normalize 한 뒤,
  // 모든 옵션/필터/집계가 같은 기준으로 계산되게 통일
  // ============================================================
  const normalizedRows = useMemo(
    () => normalizeCsvRows((rows ?? []) as any[]),
    [rows]
  );

  // ===== options =====
  const { monthOptions, deviceOptions, channelOptions } = useMemo(
    () => buildOptions(normalizedRows as any),
    [normalizedRows]
  );

  const weekOptions = useMemo(
    () => buildWeekOptions(normalizedRows as any, selectedMonth),
    [normalizedRows, selectedMonth]
  );

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

  useEffect(() => {
    if (!onInvalidWeek) return;
    if (selectedWeek === "all") return;
    const exists = weekOptions.some((w: any) => w.weekKey === selectedWeek);
    if (!exists) onInvalidWeek();
  }, [onInvalidWeek, selectedMonth, weekOptions, selectedWeek]);

  // ===== filtered rows (좌측 필터 적용) =====
  const filteredRowsRaw = useMemo(
    () =>
      filterRows({
        rows: normalizedRows as any,
        selectedMonth,
        selectedWeek,
        selectedDevice,
        selectedChannel,
      }),
    [normalizedRows, selectedMonth, selectedWeek, selectedDevice, selectedChannel]
  );

  // ✅ 집계용 row는 normalize 기준이지만,
  // creative/imagePath/id 매칭은 원본 rows 기준으로 다시 hydrate
  const filteredRows = useMemo(
    () => hydrateFilteredRows(filteredRowsRaw as any[], rows as any[]),
    [filteredRowsRaw, rows]
  );

  // ============================================================
  // ✅ DEBUG (유지)
  // ============================================================
  useEffect(() => {
    if (!rows?.length) return;

    const cnt = (rows as any[]).reduce(
      (acc, r) => acc + (hasCreativeAny(r) ? 1 : 0),
      0
    );
    const sample = (rows as any[]).find((r) => hasCreativeAny(r));

    console.log("UA.DEBUG INPUT len=", rows.length, "creativeCnt=", cnt, {
      selectedMonth,
      selectedWeek,
      selectedDevice,
      selectedChannel,
    });

    if (sample) {
      console.log("UA.DEBUG INPUT firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG INPUT firstCreativeSample = NONE");
    }
  }, [rows, selectedMonth, selectedWeek, selectedDevice, selectedChannel]);

  useEffect(() => {
    if (!normalizedRows?.length) return;

    const cnt = (normalizedRows as any[]).reduce(
      (acc, r) => acc + (hasCreativeAny(r) ? 1 : 0),
      0
    );
    const sample = (normalizedRows as any[]).find((r) => hasCreativeAny(r));

    console.log("UA.DEBUG NORMALIZED len=", normalizedRows.length, "creativeCnt=", cnt);

    if (sample) {
      console.log("UA.DEBUG NORMALIZED firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG NORMALIZED firstCreativeSample = NONE");
    }
  }, [normalizedRows]);

  useEffect(() => {
    const list = filteredRowsRaw as any[];
    if (!list?.length) {
      console.log("UA.DEBUG FILTERED_RAW len=0");
      return;
    }

    const cnt = list.reduce((acc, r) => acc + (hasCreativeAny(r) ? 1 : 0), 0);
    const sample = list.find((r) => hasCreativeAny(r));

    console.log("UA.DEBUG FILTERED_RAW len=", list.length, "creativeCnt=", cnt);

    if (sample) {
      console.log("UA.DEBUG FILTERED_RAW firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG FILTERED_RAW firstCreativeSample = NONE");
    }
  }, [filteredRowsRaw]);

  useEffect(() => {
    const list = filteredRows as any[];
    if (!list?.length) {
      console.log("UA.DEBUG HYDRATED len=0");
      return;
    }

    const cnt = list.reduce((acc, r) => acc + (hasCreativeAny(r) ? 1 : 0), 0);
    const sample = list.find((r) => hasCreativeAny(r));

    console.log("UA.DEBUG HYDRATED len=", list.length, "creativeCnt=", cnt);

    if (sample) {
      console.log("UA.DEBUG HYDRATED firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG HYDRATED firstCreativeSample = NONE");
    }
  }, [filteredRows]);

  // ===== period text =====
  const period = useMemo(
    () =>
      periodText({
        rows: normalizedRows as any,
        selectedMonth,
        selectedWeek,
      }),
    [normalizedRows, selectedMonth, selectedWeek]
  );

  // ===== 당월(데이터 최신 월) =====
  const currentMonthKey = useMemo(
    () => getCurrentMonthKeyByData(normalizedRows as any),
    [normalizedRows]
  );

  const currentMonthActual = useMemo(() => {
    if (!normalizedRows.length || currentMonthKey === "all") return summarize([]);

    const scope = normalizedRows.filter((r) => {
      const d = parseDateLoose((r as any).date);
      if (!d) return false;
      return monthKeyOfDate(d) === currentMonthKey;
    });

    return summarize(scope as any);
  }, [normalizedRows, currentMonthKey]);

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
  const totals = useMemo(() => summarize(filteredRows as any), [filteredRows]);

  // ===== tables =====
  const bySource = useMemo(() => groupBySource(filteredRows as any), [filteredRows]);
  const byCampaign = useMemo(() => groupByCampaign(filteredRows as any), [filteredRows]);
  const byGroup = useMemo(() => groupByGroup(filteredRows as any), [filteredRows]);

  const byWeek = useMemo(() => groupByWeekRecent5(filteredRows as any), [filteredRows]);
  const byWeekOnly = useMemo(
    () => byWeek.filter((w: any) => String(w.label).includes("주차")),
    [byWeek]
  );
  const byWeekChart = useMemo(() => [...byWeekOnly].reverse(), [byWeekOnly]);

  const byMonth = useMemo(
    () =>
      groupByMonthRecent3({
        rows: normalizedRows as any,
        selectedMonth,
        selectedDevice,
        selectedChannel,
      }),
    [normalizedRows, selectedMonth, selectedDevice, selectedChannel]
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
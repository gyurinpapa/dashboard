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
  selectedSource?: string | "all";
  selectedProduct?: string | "all";

  monthGoal: GoalState;
  onInvalidWeek?: () => void;

  /**
   * [수정 포인트]
   * 탭 비활성 상태에서 무거운 집계를 건너뛰기 위한 플래그
   * - 기존 결과 의미는 그대로 유지
   * - 필요한 집계만 계산
   */
  needCurrentMonthActual?: boolean;
  needTotals?: boolean;
  needBySource?: boolean;
  needByCampaign?: boolean;
  needByGroup?: boolean;
  needByWeek?: boolean;
  needByMonth?: boolean;

  /**
   * [수정 포인트]
   * filteredRows hydrate(creative/image 원본 보강)가 실제 필요한 탭에서만 돌도록 제어
   * - summary / summary2 / keyword 에서는 생략 가능
   * - structure / keywordDetail / creative / creativeDetail 에서만 필요
   */
  needHydratedFilteredRows?: boolean;
};

const EMPTY_LIST: any[] = [];
const EMPTY_SUMMARY = summarize([] as any);

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

function normalizeProductValue(r: any) {
  return (
    asStr(r?.platform) ||
    asStr(r?.media_source) ||
    asStr(r?.ad_platform) ||
    ""
  );
}

function applyProductFilter(rows: any[], selectedProduct: string | "all" = "all") {
  if (selectedProduct === "all") return rows ?? [];
  return (rows ?? []).filter(
    (r) => normalizeProductValue(r) === String(selectedProduct)
  );
}

function buildProductOptions(rows: any[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const r of rows ?? []) {
    const v = normalizeProductValue(r);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }

  return out;
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
  selectedSource = "all",
  selectedProduct = "all",
  monthGoal,
  onInvalidWeek,

  needCurrentMonthActual = true,
  needTotals = true,
  needBySource = true,
  needByCampaign = true,
  needByGroup = true,
  needByWeek = true,
  needByMonth = true,
  needHydratedFilteredRows = true,
}: Args) {
  const normalizedRows = useMemo(
    () => normalizeCsvRows((rows ?? []) as any[]),
    [rows]
  );

  /**
   * [수정 포인트]
   * 기본 상태에서는 UA debug 로그를 완전히 비활성화
   * - debugUA=1일 때만 상세 로그 활성
   * - 불필요한 전체 순회/콘솔 비용 제거
   */
  const debugUA = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("debugUA") === "1";
    } catch {
      return false;
    }
  }, []);

  // ===== 전체 기준 옵션 중 month/device만 사용 =====
  const { monthOptions, deviceOptions } = useMemo(
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

  // ============================================================
  // 공통 base filtered rows
  // month / week / device 만 적용
  // channel / source / product 는 이후 baseFilteredRows 기준으로 재구성
  // ============================================================
  const baseFilteredRows = useMemo(
    () =>
      filterRows({
        rows: normalizedRows as any,
        selectedMonth,
        selectedWeek,
        selectedDevice,
        selectedChannel: "all",
        selectedSource: "all",
      }) as any[],
    [normalizedRows, selectedMonth, selectedWeek, selectedDevice]
  );

  // ============================================================
  // 채널 옵션용 base rows
  // source / product 만 적용
  // channel 은 아직 적용하지 않음
  // ============================================================
  const channelBaseRows = useMemo(
    () =>
      applyProductFilter(
        (baseFilteredRows as any[]).filter((r) => {
          if (selectedSource === "all") return true;
          return asStr(r?.source) === String(selectedSource);
        }),
        selectedProduct
      ),
    [baseFilteredRows, selectedSource, selectedProduct]
  );

  const { channelOptions } = useMemo(
    () => buildOptions(channelBaseRows as any),
    [channelBaseRows]
  );

  // ============================================================
  // 소스 옵션용 base rows
  // channel / product 만 적용
  // source 는 아직 적용하지 않음
  // ============================================================
  const sourceBaseRows = useMemo(
    () =>
      applyProductFilter(
        (baseFilteredRows as any[]).filter((r) => {
          if (selectedChannel === "all") return true;
          return asStr(r?.channel) === String(selectedChannel);
        }),
        selectedProduct
      ),
    [baseFilteredRows, selectedChannel, selectedProduct]
  );

  const { sourceOptions } = useMemo(
    () => buildOptions(sourceBaseRows as any),
    [sourceBaseRows]
  );

  // ============================================================
  // 상품 옵션용 base rows
  // channel / source 까지만 적용
  // product 는 아직 적용하지 않음
  // ============================================================
  const productBaseRows = useMemo(
    () =>
      (baseFilteredRows as any[]).filter((r) => {
        const channelOk =
          selectedChannel === "all" ||
          asStr(r?.channel) === String(selectedChannel);
        if (!channelOk) return false;

        const sourceOk =
          selectedSource === "all" ||
          asStr(r?.source) === String(selectedSource);
        return sourceOk;
      }),
    [baseFilteredRows, selectedChannel, selectedSource]
  );

  const productOptions = useMemo(
    () => buildProductOptions(productBaseRows as any[]),
    [productBaseRows]
  );

  // ===== 최종 filtered rows (channel + source + product 모두 적용) =====
  const filteredRowsRaw = useMemo(
    () =>
      applyProductFilter(
        (baseFilteredRows as any[]).filter((r) => {
          const channelOk =
            selectedChannel === "all" ||
            asStr(r?.channel) === String(selectedChannel);
          if (!channelOk) return false;

          const sourceOk =
            selectedSource === "all" ||
            asStr(r?.source) === String(selectedSource);
          return sourceOk;
        }),
        selectedProduct
      ),
    [baseFilteredRows, selectedChannel, selectedSource, selectedProduct]
  );

  /**
   * [수정 포인트]
   * creative/image 원본 hydrate는 실제 필요한 탭에서만 수행
   * - summary / summary2 / keyword 에서는 filteredRowsRaw 그대로 사용
   * - 대용량 환경에서 map + signature lookup 비용을 크게 줄임
   */
  const filteredRows = useMemo(() => {
    if (!needHydratedFilteredRows) return filteredRowsRaw as any[];
    return hydrateFilteredRows(filteredRowsRaw as any[], rows as any[]);
  }, [needHydratedFilteredRows, filteredRowsRaw, rows]);

  // ===== DEBUG =====
  useEffect(() => {
    if (!debugUA) return;
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
      selectedSource,
      selectedProduct,
    });

    if (sample) {
      console.log("UA.DEBUG INPUT firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        source: sample.source,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG INPUT firstCreativeSample = NONE");
    }
  }, [
    debugUA,
    rows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    selectedSource,
    selectedProduct,
  ]);

  useEffect(() => {
    if (!debugUA) return;
    if (!normalizedRows?.length) return;

    const cnt = (normalizedRows as any[]).reduce(
      (acc, r) => acc + (hasCreativeAny(r) ? 1 : 0),
      0
    );
    const sample = (normalizedRows as any[]).find((r) => hasCreativeAny(r));

    console.log(
      "UA.DEBUG NORMALIZED len=",
      normalizedRows.length,
      "creativeCnt=",
      cnt
    );

    if (sample) {
      console.log("UA.DEBUG NORMALIZED firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        source: sample.source,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG NORMALIZED firstCreativeSample = NONE");
    }
  }, [debugUA, normalizedRows]);

  useEffect(() => {
    if (!debugUA) return;
    const list = channelBaseRows as any[];
    console.log("UA.DEBUG CHANNEL_BASE len=", list.length, {
      selectedMonth,
      selectedWeek,
      selectedDevice,
      selectedSource,
      selectedProduct,
      channelOptions,
    });
  }, [
    debugUA,
    channelBaseRows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedSource,
    selectedProduct,
    channelOptions,
  ]);

  useEffect(() => {
    if (!debugUA) return;
    const list = sourceBaseRows as any[];
    console.log("UA.DEBUG SOURCE_BASE len=", list.length, {
      selectedMonth,
      selectedWeek,
      selectedDevice,
      selectedChannel,
      selectedProduct,
      sourceOptions,
    });
  }, [
    debugUA,
    sourceBaseRows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    selectedProduct,
    sourceOptions,
  ]);

  useEffect(() => {
    if (!debugUA) return;
    const list = filteredRowsRaw as any[];
    if (!list?.length) {
      console.log("UA.DEBUG FILTERED_RAW len=0");
      return;
    }

    const cnt = list.reduce((acc, r) => acc + (hasCreativeAny(r) ? 1 : 0), 0);
    const sample = list.find((r) => hasCreativeAny(r));

    console.log("UA.DEBUG FILTERED_RAW len=", list.length, "creativeCnt=", cnt, {
      selectedChannel,
      selectedSource,
      selectedProduct,
    });

    if (sample) {
      console.log("UA.DEBUG FILTERED_RAW firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        source: sample.source,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG FILTERED_RAW firstCreativeSample = NONE");
    }
  }, [debugUA, filteredRowsRaw, selectedChannel, selectedSource, selectedProduct]);

  useEffect(() => {
    if (!debugUA) return;
    const list = filteredRows as any[];
    if (!list?.length) {
      console.log("UA.DEBUG HYDRATED len=0");
      return;
    }

    const cnt = list.reduce((acc, r) => acc + (hasCreativeAny(r) ? 1 : 0), 0);
    const sample = list.find((r) => hasCreativeAny(r));

    console.log("UA.DEBUG HYDRATED len=", list.length, "creativeCnt=", cnt, {
      selectedChannel,
      selectedSource,
      selectedProduct,
    });

    if (sample) {
      console.log("UA.DEBUG HYDRATED firstCreativeSample", {
        keys: Object.keys(sample),
        id: sample.id,
        __row_id: sample.__row_id,
        date: sample.date,
        channel: sample.channel,
        source: sample.source,
        creative: sample.creative,
        imagePath: sample.imagePath,
        imagepath: sample.imagepath,
        imagepath_raw: sample.imagepath_raw,
        creative_file: sample.creative_file ?? sample.creativeFile,
      });
    } else {
      console.log("UA.DEBUG HYDRATED firstCreativeSample = NONE");
    }
  }, [debugUA, filteredRows, selectedChannel, selectedSource, selectedProduct]);

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

  /**
   * [수정 포인트]
   * summary/keyword 비활성 상태에서는 currentMonthActual 계산 생략
   */
  const currentMonthActual = useMemo(() => {
    if (!needCurrentMonthActual) return EMPTY_SUMMARY;
    if (!normalizedRows.length || currentMonthKey === "all") return EMPTY_SUMMARY;

    const scope = normalizedRows.filter((r) => {
      const d = parseDateLoose((r as any).date);
      if (!d) return false;
      return monthKeyOfDate(d) === currentMonthKey;
    });

    return summarize(scope as any);
  }, [needCurrentMonthActual, normalizedRows, currentMonthKey]);

  /**
   * [수정 포인트]
   * currentMonthGoalComputed도 실제 필요 탭에서만 계산
   */
  const currentMonthGoalComputed = useMemo(() => {
    if (!needCurrentMonthActual) return EMPTY_SUMMARY;

    const impressions = Number(monthGoal.impressions) || 0;
    const clicks = Number(monthGoal.clicks) || 0;
    const cost = Number(monthGoal.cost) || 0;
    const conversions = Number(monthGoal.conversions) || 0;
    const revenue = Number(monthGoal.revenue) || 0;

    return summarize([
      { date: "", impressions, clicks, cost, conversions, revenue } as any,
    ]);
  }, [needCurrentMonthActual, monthGoal]);

  // ===== totals =====
  const totals = useMemo(() => {
    if (!needTotals) return EMPTY_SUMMARY;
    return summarize(filteredRows as any);
  }, [needTotals, filteredRows]);

  // ===== tables =====
  const bySource = useMemo(() => {
    if (!needBySource) return EMPTY_LIST;
    return groupBySource(filteredRows as any);
  }, [needBySource, filteredRows]);

  const byCampaign = useMemo(() => {
    if (!needByCampaign) return EMPTY_LIST;
    return groupByCampaign(filteredRows as any);
  }, [needByCampaign, filteredRows]);

  const byGroup = useMemo(() => {
    if (!needByGroup) return EMPTY_LIST;
    return groupByGroup(filteredRows as any);
  }, [needByGroup, filteredRows]);

  const byWeek = useMemo(() => {
    if (!needByWeek) return EMPTY_LIST;
    return groupByWeekRecent5(filteredRows as any);
  }, [needByWeek, filteredRows]);

  const byWeekOnly = useMemo(() => {
    if (!needByWeek) return EMPTY_LIST;
    return (byWeek as any[]).filter((w: any) => String(w.label).includes("주차"));
  }, [needByWeek, byWeek]);

  const byWeekChart = useMemo(() => {
    if (!needByWeek) return EMPTY_LIST;
    return [...(byWeekOnly as any[])].reverse();
  }, [needByWeek, byWeekOnly]);

  const byMonth = useMemo(() => {
    if (!needByMonth) return EMPTY_LIST;
    return groupByMonthRecent3({
      rows: applyProductFilter(productBaseRows as any[], selectedProduct),
      selectedMonth,
      selectedDevice,
      selectedChannel,
      selectedSource,
    } as any);
  }, [
    needByMonth,
    productBaseRows,
    selectedMonth,
    selectedDevice,
    selectedChannel,
    selectedSource,
    selectedProduct,
  ]);

  return {
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    sourceOptions,
    productOptions,
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
  };
}
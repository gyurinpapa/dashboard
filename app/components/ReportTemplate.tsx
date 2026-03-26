// app/components/ReportTemplate.tsx
"use client";
console.log("🔥 ReportTemplate RENDERED");
import { useEffect, useMemo, useState } from "react";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  GoalState,
  MonthKey,
  TabKey,
  WeekKey,
} from "@/src/lib/report/types";

import type { ReportPeriod } from "@/src/lib/report/period";
import { filterRowsByReportPeriod } from "@/src/lib/report/period";

import { groupByKeyword } from "@/src/lib/report/keyword";
import { useLocalStorageState } from "@/src/useLocalStorageState";
import { useInsights } from "@/app/hooks/useInsights";

import { useReportAggregates } from "@/src/lib/report/useReportAggregates";
import { buildKeywordInsight } from "@/src/lib/report/insights/buildKeywordInsight";

import HeaderBar from "@/app/components/sections/HeaderBar";
import StructureSection from "@/app/components/sections/StructureSection";
import KeywordSection from "@/app/components/sections/KeywordSection";
import KeywordDetailSection from "@/app/components/sections/KeywordDetailSection";
import SummarySection from "@/app/components/sections/SummarySection";
import Summary2Section from "@/app/components/sections/Summary2Section";
import CreativeSection from "@/app/components/sections/CreativeSection";
import CreativeDetailSection from "@/app/components/sections/CreativeDetailSection";
import MonthGoalSection from "@/app/components/sections/MonthGoalSection";

if (typeof window !== "undefined") {
  const checks: Record<string, any> = {
    HeaderBar,
    StructureSection,
    KeywordSection,
    KeywordDetailSection,
    SummarySection,
    Summary2Section,
    CreativeSection,
    CreativeDetailSection,
    MonthGoalSection,
  };

  const bad = Object.entries(checks)
    .filter(([, v]) => typeof v !== "function")
    .map(([k, v]) => ({ name: k, type: typeof v, value: v }));

  if (bad.length) {
    console.error("❌ Invalid React component imports:", bad);
  } else {
    console.log("✅ All section imports are functions");
  }
}

const MONTH_GOAL_KEY = "nature_report_month_goal_v1";

const DEFAULT_GOAL: GoalState = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

type Props = {
  rows: any[];
  isLoading?: boolean;
  creativesMap?: Record<string, string>;
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportPeriod: ReportPeriod;
  onChangeReportPeriod: (next: ReportPeriod) => void;
  readOnlyHeader?: boolean;

  // ✅ 직접 선택 / 날짜 입력 UI만 숨김
  hidePeriodEditor?: boolean;

  // ✅ 오른쪽 하단 "기준 기간 ..." 텍스트만 숨김 (+VAT 유지)
  hideTabPeriodText?: boolean;
};

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function safeDecode(s: string) {
  const v = String(s ?? "");
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function firstNonEmpty(...values: any[]) {
  for (const v of values) {
    const s = asStr(v);
    if (s) return s;
  }
  return "";
}

function normalizeKey(s: any) {
  let v = String(s ?? "");
  v = safeDecode(v);
  v = v.replace(/\\/g, "/");
  v = v.replace(/\u00A0/g, " ");
  v = v.trim();
  v = v.replace(/\s+/g, " ");
  try {
    v = v.normalize("NFC");
  } catch {}
  return v;
}

function basenameOf(v: string) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const noQs = raw.split("?")[0].split("#")[0];
  const base = noQs.split("/").pop() || noQs;
  return String(safeDecode(base)).trim();
}

function stripExt(name: string) {
  const base = basenameOf(name);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}

function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function tryParseJson(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return p && typeof p === "object" ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeIncomingRow(rec: any) {
  const raw = rec?.row ?? rec?.data ?? rec?.payload ?? null;
  const rowObj = tryParseJson(raw) || null;

  const base = rowObj ? { ...rowObj } : { ...(rec ?? {}) };

  if (base.date == null) {
    base.date =
      rec?.date ??
      base?.report_date ??
      base?.day ??
      base?.ymd ??
      base?.dt ??
      base?.segment_date ??
      base?.stat_date ??
      null;
  }

  if (base.channel == null) {
    base.channel =
      rec?.channel ?? base?.ad_channel ?? base?.media ?? base?.media_type ?? null;
  }

  if (base.device == null) {
    base.device = rec?.device ?? base?.device_type ?? null;
  }

  if (base.source == null) {
    base.source = rec?.source ?? base?.site_source ?? base?.publisher ?? null;
  }

  if (base.platform == null) {
    base.platform = rec?.platform ?? base?.media_source ?? base?.ad_platform ?? null;
  }

  if (base.campaign_name == null && base.campaign != null)
    base.campaign_name = base.campaign;
  if (base.campaign_name == null && base.campaignName != null)
    base.campaign_name = base.campaignName;

  if (base.group_name == null && base.group != null) base.group_name = base.group;
  if (base.group_name == null && base.groupName != null)
    base.group_name = base.groupName;
  if (base.group_name == null && base.adgroup_name != null)
    base.group_name = base.adgroup_name;

  if (base.keyword == null && base.keyword_name != null)
    base.keyword = base.keyword_name;
  if (base.keyword == null && base.search_term != null)
    base.keyword = base.search_term;

  if (base.imagepath == null && base.imagePath != null)
    base.imagepath = base.imagePath;
  if (base.imagePath == null && base.imagepath != null)
    base.imagePath = base.imagepath;
  if (base.image_path == null && base.imagepath != null)
    base.image_path = base.imagepath;
  if (base.imagepath_raw == null && base.image_raw != null)
    base.imagepath_raw = base.image_raw;

  if (base.creative_file == null && base.creativeFile != null)
    base.creative_file = base.creativeFile;
  if (base.creativeFile == null && base.creative_file != null)
    base.creativeFile = base.creative_file;

  if (base.impressions == null && base.impr != null) base.impressions = base.impr;
  if (base.clicks == null && base.click != null) base.clicks = base.click;
  if (base.clicks == null && base.clk != null) base.clicks = base.clk;
  if (base.cost == null && base.spend != null) base.cost = base.spend;
  if (base.cost == null && base.ad_cost != null) base.cost = base.ad_cost;
  if (base.conversions == null && base.conv != null) base.conversions = base.conv;
  if (base.conversions == null && base.cv != null) base.conversions = base.cv;
  if (base.revenue == null && base.sales != null) base.revenue = base.sales;
  if (base.revenue == null && base.purchase_amount != null)
    base.revenue = base.purchase_amount;
  if (base.revenue == null && base.gmv != null) base.revenue = base.gmv;

  if (base.__row_id == null && rec?.id != null) base.__row_id = rec.id;
  if (base.id == null && rec?.id != null) base.id = rec.id;

  return base;
}

function pickHeaderFallbackFromRows(rows: any[]) {
  let advertiser = "";
  let reportType = "";

  for (const r of rows ?? []) {
    advertiser =
      advertiser ||
      firstNonEmpty(
        r?.advertiser_name,
        r?.advertiserName,
        r?.advertiser,
        r?.account,
        r?.account_name,
        r?.accountName,
        r?.campaign_name,
        r?.campaignName,
        r?.brand_name,
        r?.brandName,
        r?.client_name,
        r?.clientName
      );

    reportType =
      reportType ||
      firstNonEmpty(
        r?.report_type_name,
        r?.reportTypeName,
        r?.report_type_key,
        r?.reportTypeKey,
        r?.report_type,
        r?.reportType,
        r?.type_name,
        r?.typeName,
        r?.type
      );

    if (advertiser && reportType) break;
  }

  return {
    advertiserName: advertiser,
    reportTypeName: reportType,
  };
}

function creativeCandidatesOfRow(row: any): string[] {
  const rawCandidates: any[] = [
    row?.creative_key,
    row?.creativeKey,
    row?.creative_file,
    row?.creativeFile,
    row?.creative,
    row?.imagepath_raw,
    row?.imagepath,
    row?.imagePath,
    row?.image_path,
    row?.image_url,
    row?.imageUrl,
    row?.thumbnail?.imagePath,
    row?.thumbnail?.imagepath,
    row?.thumbUrl,
    row?.thumb_url,
    row?.thumbnailUrl,
    row?.thumbnail_url,
    row?.extras?.creative_key,
    row?.extras?.creativeKey,
    row?.extras?.creative_file,
    row?.extras?.creativeFile,
    row?.extras?.creative,
    row?.extras?.imagepath_raw,
    row?.extras?.imagepath,
    row?.extras?.imagePath,
    row?.extras?.image_path,
  ];

  const rawStrs = uniq(
    rawCandidates
      .filter(Boolean)
      .map((v) => normalizeKey(v))
      .map((v) => String(v).trim())
  );

  const baseNames: string[] = [];
  for (const s of rawStrs) {
    const b = basenameOf(s);
    if (!b) continue;
    baseNames.push(normalizeKey(b));
    baseNames.push(normalizeKey(stripExt(b)));
  }

  const pathForms: string[] = [];
  for (const b of baseNames) {
    if (!b) continue;
    pathForms.push(normalizeKey(`/creatives/${b}`));
    pathForms.push(normalizeKey(`C:/creatives/${b}`));
  }

  const all = uniq([...rawStrs, ...baseNames, ...pathForms]).map(normalizeKey);

  const withPrefix: string[] = [];
  for (const k of all) {
    const kk = normalizeKey(k);
    if (!kk) continue;

    if (kk.startsWith("C:")) {
      withPrefix.push(kk);
      withPrefix.push(normalizeKey(kk.slice(2)));
    } else {
      withPrefix.push(normalizeKey(`C:${kk}`));
      withPrefix.push(kk);
    }
  }

  return uniq(withPrefix.map(normalizeKey));
}

function normalizeCreativesMap(map: Record<string, string>) {
  const out: Record<string, string> = {};

  for (const [k0, url] of Object.entries(map || {})) {
    if (!url) continue;

    const kRaw = normalizeKey(k0);
    if (!kRaw) continue;

    const base = normalizeKey(basenameOf(kRaw));
    const noext = normalizeKey(stripExt(base));

    const p1 = base ? normalizeKey(`/creatives/${base}`) : "";
    const p1n = noext ? normalizeKey(`/creatives/${noext}`) : "";
    const c1 = base ? normalizeKey(`C:/creatives/${base}`) : "";
    const c1n = noext ? normalizeKey(`C:/creatives/${noext}`) : "";

    const keys = uniq([
      kRaw,
      base,
      noext,
      p1,
      p1n,
      c1,
      c1n,
      kRaw.startsWith("C:")
        ? normalizeKey(kRaw.slice(2))
        : normalizeKey(`C:${kRaw}`),
      base
        ? base.startsWith("C:")
          ? normalizeKey(base.slice(2))
          : normalizeKey(`C:${base}`)
        : "",
      noext
        ? noext.startsWith("C:")
          ? normalizeKey(noext.slice(2))
          : normalizeKey(`C:${noext}`)
        : "",
      p1
        ? p1.startsWith("C:")
          ? normalizeKey(p1.slice(2))
          : normalizeKey(`C:${p1}`)
        : "",
      c1
        ? c1.startsWith("C:")
          ? normalizeKey(c1.slice(2))
          : normalizeKey(`C:${c1}`)
        : "",
    ])
      .map(normalizeKey)
      .filter(Boolean);

    for (const kk of keys) {
      if (!out[kk]) out[kk] = url;
    }
  }

  return out;
}

function pickDateStrLoose(r: any) {
  const v =
    r?.date ??
    r?.ymd ??
    r?.day ??
    r?.dt ??
    r?.report_date ??
    r?.segment_date ??
    r?.stat_date;

  if (v == null) return "";

  const s = String(v).trim();
  if (!s) return "";

  const parts = s
    .slice(0, 20)
    .replace(/[^\d]/g, "-")
    .split("-")
    .filter(Boolean);

  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return "";

  const mm = String(Number(m)).padStart(2, "0");
  const dd = String(Number(d)).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function formatYmd(ymd: string) {
  if (!ymd) return "";
  return ymd.replaceAll("-", ".");
}

function minMaxYmd(rows: any[]) {
  let min = "";
  let max = "";
  for (const r of rows || []) {
    const d = pickDateStrLoose(r);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return { min, max };
}

export default function ReportTemplate({
  rows,
  isLoading,
  creativesMap,
  advertiserName,
  reportTypeName,
  reportPeriod,
  onChangeReportPeriod,
  readOnlyHeader = false,
  hidePeriodEditor = false,
  hideTabPeriodText = false,
}: Props) {
  const [tab, setTab] = useState<TabKey>("summary");

  const [filterKey, setFilterKey] = useState<FilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>("all");
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>("all");
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>("all");
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");

  const [monthGoal, setMonthGoal] = useLocalStorageState<GoalState>(
    MONTH_GOAL_KEY,
    DEFAULT_GOAL
  );

  const normalizedRows = useMemo(() => {
    return (rows ?? []).map(normalizeIncomingRow);
  }, [rows]);

  const reportPeriodRows = useMemo(() => {
    return filterRowsByReportPeriod(normalizedRows as any[], reportPeriod);
  }, [normalizedRows, reportPeriod]);

  const headerFallback = useMemo(() => {
    return pickHeaderFallbackFromRows(normalizedRows);
  }, [normalizedRows]);

  const effectiveAdvertiserName = useMemo(() => {
    return firstNonEmpty(advertiserName, headerFallback.advertiserName);
  }, [advertiserName, headerFallback.advertiserName]);

  const effectiveReportTypeName = useMemo(() => {
    return firstNonEmpty(reportTypeName, headerFallback.reportTypeName);
  }, [reportTypeName, headerFallback.reportTypeName]);

  const templateRenderKey = useMemo(() => {
    const first = normalizedRows?.[0];
    const last = normalizedRows?.[normalizedRows.length - 1];
    const firstKey =
      asStr(first?.id) ||
      asStr(first?.__row_id) ||
      asStr(first?.date) ||
      asStr(first?.campaign_name) ||
      "first";
    const lastKey =
      asStr(last?.id) ||
      asStr(last?.__row_id) ||
      asStr(last?.date) ||
      asStr(last?.campaign_name) ||
      "last";

    return [
      effectiveAdvertiserName,
      effectiveReportTypeName,
      normalizedRows.length,
      firstKey,
      lastKey,
      Object.keys(creativesMap || {}).length,
    ].join("|");
  }, [
    effectiveAdvertiserName,
    effectiveReportTypeName,
    normalizedRows,
    creativesMap,
  ]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("debugRows") !== "1") return;
      (window as any).__ROWS__ = normalizedRows;
      (window as any).__CREATIVES_MAP__ = creativesMap ?? {};
      console.log("✅ debugRows=1: window.__ROWS__ / window.__CREATIVES_MAP__ set");
      console.log("sample __ROWS__[0] =", normalizedRows?.[0] ?? null);
    } catch {}
  }, [normalizedRows, creativesMap]);

  const originalRowById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of normalizedRows ?? []) {
      const id = r?.__row_id ?? r?.id;
      const key = id == null ? "" : String(id);
      if (!key) continue;
      if (!m.has(key)) m.set(key, r);
    }
    return m;
  }, [normalizedRows]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const on = sp.get("debugCreative") === "1";
      if (!on) return;

      console.log("===== CREATIVE DEBUG =====");
      console.log(
        "[normalizedRows sample keys]",
        normalizedRows?.[0] ? Object.keys(normalizedRows[0]) : null
      );
      console.log("[normalizedRows sample]", normalizedRows?.slice(0, 5));
      console.log("[effectiveAdvertiserName]", effectiveAdvertiserName);
      console.log("[effectiveReportTypeName]", effectiveReportTypeName);
    } catch {}
  }, [normalizedRows, effectiveAdvertiserName, effectiveReportTypeName]);

  useEffect(() => {
    if (readOnlyHeader) return;

    if (tab !== "keyword" && tab !== "keywordDetail") return;
    if (selectedChannel === ("display" as ChannelKey)) {
      setSelectedChannel("search" as ChannelKey);
    }
  }, [tab, selectedChannel, readOnlyHeader]);

  const {
    monthOptions,
    weekOptions,
    deviceOptions,
    channelOptions,
    sourceOptions,
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
    rows: reportPeriodRows as any,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    selectedSource,
    monthGoal,
    onInvalidWeek: () => setSelectedWeek("all"),
  });

  useEffect(() => {
    if (readOnlyHeader) return;
    if (selectedMonth !== "all" && !enabledMonthKeySet.has(selectedMonth)) {
      setSelectedMonth("all");
    }
  }, [selectedMonth, enabledMonthKeySet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (selectedWeek !== "all" && !enabledWeekKeySet.has(selectedWeek)) {
      setSelectedWeek("all");
    }
  }, [selectedWeek, enabledWeekKeySet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    const allowed = new Set((deviceOptions ?? []).map((x: any) => String(x)));
    if (selectedDevice !== "all" && !allowed.has(String(selectedDevice))) {
      setSelectedDevice("all");
    }
  }, [selectedDevice, deviceOptions, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    const allowed = new Set((channelOptions ?? []).map((x: any) => String(x)));
    if (selectedChannel !== "all" && !allowed.has(String(selectedChannel))) {
      setSelectedChannel("all");
    }
  }, [selectedChannel, channelOptions, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    const allowed = new Set((sourceOptions ?? []).map((x: any) => String(x)));
    if (selectedSource !== "all" && !allowed.has(String(selectedSource))) {
      setSelectedSource("all");
    }
  }, [selectedSource, sourceOptions, readOnlyHeader]);

  const fullPeriod = useMemo(() => {
    const mm = minMaxYmd(normalizedRows as any[]);
    if (!mm.min || !mm.max) return "";
    return `${formatYmd(mm.min)} ~ ${formatYmd(mm.max)}`;
  }, [normalizedRows]);

  const periodFixed = useMemo(() => {
    const mm = minMaxYmd(filteredRows as any[]);
    if (!mm.min || !mm.max) return period;
    return `${formatYmd(mm.min)} ~ ${formatYmd(mm.max)}`;
  }, [filteredRows, period]);

  const { monthGoalInsight } = useInsights({
    byMonth,
    rowsLength: reportPeriodRows.length,
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

  const creativesMapNormalized = useMemo(() => {
    return normalizeCreativesMap(creativesMap ?? {});
  }, [creativesMap]);

  const filteredRowsWithCreatives = useMemo(() => {
    const map = creativesMapNormalized;

    return (filteredRows as any[]).map((r) => {
      const ridValue = r?.__row_id ?? r?.id;
      const rid = ridValue == null ? "" : String(ridValue);
      const orig = rid ? originalRowById.get(rid) : null;

      const baseForCandidates = orig ?? r;
      const candidates = creativeCandidatesOfRow(baseForCandidates);

      let matchedKey: string | null = null;
      let matchedUrl: string | null = null;

      for (const k of candidates) {
        const kk = normalizeKey(k);
        const url = map[kk];
        if (url) {
          matchedKey = kk;
          matchedUrl = url;
          break;
        }
      }

      const displayUrl = matchedUrl || null;

      const out: any = {
        ...r,
        creative_key: matchedKey,
        creative_url: matchedUrl,
        creativeKey: matchedKey,
        creativeUrl: matchedUrl,
        __dbg_used_orig: !!orig,
        __imagepath_raw:
          baseForCandidates?.imagepath_raw ??
          baseForCandidates?.imagepath ??
          baseForCandidates?.imagePath ??
          "",
        __creative_raw: baseForCandidates?.creative ?? "",
        __creative_file_raw:
          baseForCandidates?.creative_file ??
          baseForCandidates?.creativeFile ??
          undefined,
        __creative_candidates: candidates,
        __dbg_hit_candidates: candidates
          .map((x: any) => normalizeKey(x))
          .filter((x: string) => !!map[x])
          .slice(0, 10),
      };

      if (displayUrl) {
        const thumbObj = { imagePath: displayUrl, imagepath: displayUrl };

        out.imagePath = displayUrl;
        out.imagepath = displayUrl;
        out.image_path = displayUrl;
        out.thumbnail = thumbObj;
        out.thumbUrl = displayUrl;
        out.thumb_url = displayUrl;
        out.thumbnailUrl = displayUrl;
        out.thumbnail_url = displayUrl;
        out.image_url = displayUrl;
        out.imageUrl = displayUrl;
      } else {
        out.imagePath = null;
        out.imagepath = null;
        out.image_path = null;
        out.thumbnail = null;
        out.thumbUrl = null;
        out.thumb_url = null;
        out.thumbnailUrl = null;
        out.thumbnail_url = null;
        out.image_url = null;
        out.imageUrl = null;
      }

      return out;
    });
  }, [filteredRows, creativesMapNormalized, originalRowById]);

  const creativeBaseRows = useMemo(() => {
    const list = (filteredRowsWithCreatives as any[]) ?? [];
    return list.filter((r) => !!r?.creative_url);
  }, [filteredRowsWithCreatives]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const on = sp.get("debugCreative") === "1";
      if (!on) return;

      if (tab !== "creative" && tab !== "creativeDetail") return;

      const first = (creativeBaseRows as any[]).slice(0, 8).map((r) => ({
        used_orig: r?.__dbg_used_orig,
        creative: r?.__creative_raw,
        creative_file: r?.__creative_file_raw,
        imagepath_raw: r?.__imagepath_raw,
        matchedKey: r?.creative_key,
        matchedUrl: r?.creative_url,
        imagePath_for_display: r?.imagePath ?? null,
        thumbnail_for_display: r?.thumbnail?.imagePath ?? null,
        candidates: r?.__creative_candidates?.slice(0, 20) ?? [],
        hitCandidates: r?.__dbg_hit_candidates ?? [],
      }));

      console.log("===== CREATIVE DEBUG =====");
      console.log(
        "creativesMap keys =",
        Object.keys(creativesMapNormalized).slice(0, 200)
      );
      console.log("creativeBaseRows len =", creativeBaseRows.length);
      console.log("rows sample =", first);
    } catch {}
  }, [tab, creativeBaseRows, creativesMapNormalized]);

  return (
    <main
      key={templateRenderKey}
      className="min-h-screen bg-slate-50 text-slate-900"
    >
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-100/90 via-slate-50/70 to-transparent" />
        <div className="relative z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur-md shadow-[0_1px_0_rgba(15,23,42,0.03)]">
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
            selectedSource={selectedSource}
            setSelectedSource={setSelectedSource}
            monthOptions={monthOptions}
            weekOptions={weekOptions}
            deviceOptions={deviceOptions}
            channelOptions={channelOptions}
            sourceOptions={sourceOptions}
            enabledMonthKeySet={enabledMonthKeySet}
            enabledWeekKeySet={enabledWeekKeySet}
            fullPeriod={fullPeriod}
            period={periodFixed}
            advertiserName={effectiveAdvertiserName}
            reportTypeName={effectiveReportTypeName}
            reportPeriod={reportPeriod}
            onChangeReportPeriod={onChangeReportPeriod}
            readOnlyHeader={readOnlyHeader}
            hidePeriodEditor={hidePeriodEditor}
            hideTabPeriodText={hideTabPeriodText}
          />
        </div>
      </div>

      <div className="px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div className="mx-auto w-full max-w-[1440px]">
          {isLoading ? (
            <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                <div className="text-sm font-medium text-slate-600">
                  Loading rows...
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-8">
            {tab === "summary" && (
              <>
                <div className="rounded-2xl">
                  <MonthGoalSection
                    currentMonthKey={currentMonthKey}
                    currentMonthActual={currentMonthActual}
                    currentMonthGoalComputed={currentMonthGoalComputed}
                    monthGoal={monthGoal}
                    setMonthGoal={setMonthGoal}
                    monthGoalInsight={monthGoalInsight}
                  />
                </div>

                <div className="rounded-2xl">
                  <SummarySection
                    totals={totals as any}
                    byMonth={byMonth as any}
                    byWeekOnly={byWeekOnly as any}
                    byWeekChart={byWeekChart as any}
                    bySource={bySource as any}
                    currentMonthKey={currentMonthKey as any}
                    currentMonthActual={currentMonthActual as any}
                    currentMonthGoalComputed={currentMonthGoalComputed as any}
                    monthGoal={monthGoal as any}
                    setMonthGoal={setMonthGoal as any}
                    monthGoalInsight={monthGoalInsight as any}
                  />
                </div>
              </>
            )}

            {tab === "summary2" && (
              <div className="rounded-2xl">
                <Summary2Section rows={filteredRows as any[]} />
              </div>
            )}

            {tab === "structure" && (
              <div className="rounded-2xl">
                <StructureSection
                  bySource={bySource}
                  byCampaign={byCampaign}
                  rows={filteredRowsWithCreatives}
                  monthGoal={monthGoal}
                />
              </div>
            )}

            {tab === "keyword" && (
              <div className="rounded-2xl">
                <KeywordSection
                  keywordAgg={keywordAgg}
                  keywordInsight={keywordInsight}
                />
              </div>
            )}

            {tab === "keywordDetail" && (
              <div className="rounded-2xl">
                <KeywordDetailSection rows={filteredRowsWithCreatives as any[]} />
              </div>
            )}

            {tab === "creative" && (
              <div className="rounded-2xl">
                <CreativeSection rows={creativeBaseRows} />
              </div>
            )}

            {tab === "creativeDetail" && (
              <div className="rounded-2xl">
                <CreativeDetailSection rows={creativeBaseRows as any[]} />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
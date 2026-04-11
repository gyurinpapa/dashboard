// app/components/ReportTemplate.tsx
"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { buildDailySummaryRows } from "@/src/lib/report/aggregate";

import HeaderBar from "@/app/components/sections/HeaderBar";
import StructureSection from "@/app/components/sections/StructureSection";
import KeywordSection from "@/app/components/sections/KeywordSection";
import KeywordDetailSection from "@/app/components/sections/KeywordDetailSection";
import SummarySection from "@/app/components/sections/SummarySection";
import Summary2Section from "@/app/components/sections/Summary2Section";
import CreativeSection from "@/app/components/sections/CreativeSection";
import CreativeDetailSection from "@/app/components/sections/CreativeDetailSection";
import MonthGoalSection from "@/app/components/sections/MonthGoalSection";
import FloatingFilterRail from "./floating/FloatingFilterRail";
import FloatingTabRail from "./floating/FloatingTabRail";

const MemoHeaderBar = memo(HeaderBar);
const MemoStructureSection = memo(StructureSection);
const MemoKeywordSection = memo(KeywordSection);
const MemoKeywordDetailSection = memo(KeywordDetailSection);
const MemoSummarySection = memo(SummarySection);
const MemoSummary2Section = memo(Summary2Section);
const MemoCreativeSection = memo(CreativeSection);
const MemoCreativeDetailSection = memo(CreativeDetailSection);
const MemoMonthGoalSection = memo(MonthGoalSection);

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
  reportTypeKey?: string | null;
  reportPeriod: ReportPeriod;
  onChangeReportPeriod: (next: ReportPeriod) => void;
  readOnlyHeader?: boolean;
  hidePeriodEditor?: boolean;
  hideTabPeriodText?: boolean;
};

type ReportUiType = "commerce" | "traffic";
type ReportFilterKey = FilterKey | "source" | "product";

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
      rec?.channel ??
      base?.ad_channel ??
      base?.media ??
      base?.media_type ??
      null;
  }

  if (base.device == null) {
    base.device = rec?.device ?? base?.device_type ?? null;
  }

  if (base.source == null) {
    base.source = rec?.source ?? base?.site_source ?? base?.publisher ?? null;
  }

  if (base.platform == null) {
    base.platform =
      rec?.platform ?? base?.media_source ?? base?.ad_platform ?? null;
  }

  if (base.campaign_name == null && base.campaign != null) {
    base.campaign_name = base.campaign;
  }
  if (base.campaign_name == null && base.campaignName != null) {
    base.campaign_name = base.campaignName;
  }

  if (base.group_name == null && base.group != null) base.group_name = base.group;
  if (base.group_name == null && base.groupName != null) {
    base.group_name = base.groupName;
  }
  if (base.group_name == null && base.adgroup_name != null) {
    base.group_name = base.adgroup_name;
  }

  if (base.keyword == null && base.keyword_name != null) {
    base.keyword = base.keyword_name;
  }
  if (base.keyword == null && base.search_term != null) {
    base.keyword = base.search_term;
  }

  if (base.imagepath == null && base.imagePath != null) {
    base.imagepath = base.imagePath;
  }
  if (base.imagePath == null && base.imagepath != null) {
    base.imagePath = base.imagepath;
  }
  if (base.image_path == null && base.imagepath != null) {
    base.image_path = base.imagepath;
  }
  if (base.imagepath_raw == null && base.image_raw != null) {
    base.imagepath_raw = base.image_raw;
  }

  if (base.creative_file == null && base.creativeFile != null) {
    base.creative_file = base.creativeFile;
  }
  if (base.creativeFile == null && base.creative_file != null) {
    base.creativeFile = base.creative_file;
  }

  if (base.impressions == null && base.impr != null) base.impressions = base.impr;
  if (base.clicks == null && base.click != null) base.clicks = base.click;
  if (base.clicks == null && base.clk != null) base.clicks = base.clk;
  if (base.cost == null && base.spend != null) base.cost = base.spend;
  if (base.cost == null && base.ad_cost != null) base.cost = base.ad_cost;
  if (base.conversions == null && base.conv != null) base.conversions = base.conv;
  if (base.conversions == null && base.cv != null) base.conversions = base.cv;
  if (base.revenue == null && base.sales != null) base.revenue = base.sales;
  if (base.revenue == null && base.purchase_amount != null) {
    base.revenue = base.purchase_amount;
  }
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

function shallowEqualStable(a: any, b: any) {
  if (Object.is(a, b)) return true;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  const aIsObj = !!a && typeof a === "object";
  const bIsObj = !!b && typeof b === "object";

  if (!aIsObj || !bIsObj) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }

  return true;
}

function useStableShallowValue<T>(value: T): T {
  const ref = useRef(value);

  if (!shallowEqualStable(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
}

function parseLooseDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const rawNum = String(value);
    if (/^\d{8}$/.test(rawNum)) {
      const y = rawNum.slice(0, 4);
      const m = rawNum.slice(4, 6);
      const d = rawNum.slice(6, 8);
      const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const fullMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (fullMatch) {
    const y = fullMatch[1];
    const m = fullMatch[2].padStart(2, "0");
    const d = fullMatch[3].padStart(2, "0");
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const compactMatch = normalized.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (compactMatch) {
    const y = compactMatch[1];
    const m = compactMatch[2];
    const d = compactMatch[3];
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const direct = new Date(normalized.replace(" ", "T"));
  if (!Number.isNaN(direct.getTime())) return direct;

  return null;
}

function toYmd(date: Date | null) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDateFromCurrentMonth(
  currentMonthKey: string,
  month: number,
  day: number
): Date | null {
  if (!/^\d{4}-\d{2}$/.test(currentMonthKey)) return null;
  const [yy] = currentMonthKey.split("-").map(Number);
  if (!yy || !month || !day) return null;
  const parsed = new Date(
    `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateFromCurrentMonthDay(
  currentMonthKey: string,
  day: number
): Date | null {
  if (!/^\d{4}-\d{2}$/.test(currentMonthKey)) return null;
  const [yy, mm] = currentMonthKey.split("-").map(Number);
  if (!yy || !mm || !day) return null;
  const parsed = new Date(
    `${yy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateCandidateWithMonthContext(
  value: any,
  currentMonthKey: string
): Date | null {
  const direct = parseLooseDate(value);
  if (direct) return direct;

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const mdMatch = normalized.match(/\b(\d{1,2})-(\d{1,2})\b/);
  if (mdMatch) {
    return buildDateFromCurrentMonth(
      currentMonthKey,
      Number(mdMatch[1]),
      Number(mdMatch[2])
    );
  }

  const dayKorMatch = normalized.match(/\b(\d{1,2})일\b/);
  if (dayKorMatch) {
    return buildDateFromCurrentMonthDay(currentMonthKey, Number(dayKorMatch[1]));
  }

  const dayOnlyMatch = normalized.match(/^\d{1,2}$/);
  if (dayOnlyMatch) {
    return buildDateFromCurrentMonthDay(currentMonthKey, Number(dayOnlyMatch[0]));
  }

  return null;
}

function getLastDateFromRows(
  rows: readonly any[],
  currentMonthKey: string
): string {
  let last: Date | null = null;

  const candidateKeys = [
    "date",
    "dateKey",
    "day",
    "ymd",
    "report_date",
    "reportDate",
    "fullDate",
    "rawDate",
    "startDate",
    "label",
  ];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;

    let parsed: Date | null = null;

    for (const key of candidateKeys) {
      parsed = parseDateCandidateWithMonthContext(row?.[key], currentMonthKey);
      if (parsed) break;
    }

    if (!parsed) continue;

    if (!last || parsed.getTime() > last.getTime()) {
      last = parsed;
    }
  }

  return toYmd(last);
}

export default function ReportTemplate({
  rows,
  isLoading,
  creativesMap,
  advertiserName,
  reportTypeName,
  reportTypeKey,
  reportPeriod,
  onChangeReportPeriod,
  readOnlyHeader = false,
  hidePeriodEditor = false,
  hideTabPeriodText = false,
}: Props) {
  const [tab, setTab] = useState<TabKey>("summary");

  const [filterKey, setFilterKey] = useState<ReportFilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>("all");
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>("all");
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>("all");
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");

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

  const effectiveReportTypeKey = useMemo(() => {
    const rawKey = firstNonEmpty(reportTypeKey);
    const keyLower = rawKey.toLowerCase();

    if (keyLower.includes("traffic") || keyLower.includes("트래픽")) {
      return "traffic";
    }

    if (
      keyLower.includes("commerce") ||
      keyLower.includes("커머스") ||
      keyLower.includes("e-commerce") ||
      keyLower.includes("매출")
    ) {
      return "commerce";
    }

    const rawName = firstNonEmpty(reportTypeName, headerFallback.reportTypeName);
    const nameLower = rawName.toLowerCase();

    if (nameLower.includes("traffic") || nameLower.includes("트래픽")) {
      return "traffic";
    }

    if (
      nameLower.includes("commerce") ||
      nameLower.includes("커머스") ||
      nameLower.includes("e-commerce") ||
      nameLower.includes("매출")
    ) {
      return "commerce";
    }

    return "";
  }, [reportTypeKey, reportTypeName, headerFallback.reportTypeName]);

  const effectiveReportTypeName = useMemo(() => {
    if (effectiveReportTypeKey === "traffic") return "트래픽 리포트";
    if (effectiveReportTypeKey === "commerce") return "커머스 매출 리포트";

    return firstNonEmpty(reportTypeName, headerFallback.reportTypeName);
  }, [effectiveReportTypeKey, reportTypeName, headerFallback.reportTypeName]);

  const reportType = useMemo<ReportUiType>(() => {
    return effectiveReportTypeKey === "traffic" ? "traffic" : "commerce";
  }, [effectiveReportTypeKey]);

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
    if (readOnlyHeader) return;
    if (tab !== "keyword" && tab !== "keywordDetail") return;

    if (selectedChannel === ("display" as ChannelKey)) {
      setSelectedChannel("search" as ChannelKey);
    }
  }, [tab, selectedChannel, readOnlyHeader]);

  const needSummaryAggregates = tab === "summary";
  const needStructureAggregates = tab === "structure";
  const needKeywordAggregates = tab === "keyword";

  const needCurrentMonthActual = needSummaryAggregates || needKeywordAggregates;
  const needTotals = needSummaryAggregates;
  const needBySource = needSummaryAggregates || needStructureAggregates;
  const needByCampaign = needStructureAggregates;
  const needByGroup = false;
  const needByWeek = needSummaryAggregates;
  const needByMonth = needSummaryAggregates;

  const needCreativeRows = useMemo(() => {
    return (
      tab === "structure" ||
      tab === "keywordDetail" ||
      tab === "creative" ||
      tab === "creativeDetail"
    );
  }, [tab]);

  const handleInvalidWeek = useCallback(() => {
    setSelectedWeek("all");
  }, []);

  const reportAggregatesParams = useMemo(() => {
    return {
      rows: reportPeriodRows as any,
      selectedMonth,
      selectedWeek,
      selectedDevice,
      selectedChannel,
      selectedSource,
      selectedProduct,
      monthGoal,
      onInvalidWeek: handleInvalidWeek,
      needCurrentMonthActual,
      needTotals,
      needBySource,
      needByCampaign,
      needByGroup,
      needByWeek,
      needByMonth,
      needHydratedFilteredRows: needCreativeRows,
    };
  }, [
    reportPeriodRows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    selectedSource,
    selectedProduct,
    monthGoal,
    handleInvalidWeek,
    needCurrentMonthActual,
    needTotals,
    needBySource,
    needByCampaign,
    needByGroup,
    needByWeek,
    needByMonth,
    needCreativeRows,
  ]);

  const {
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
    byWeekOnly,
    byWeekChart,
    byMonth,
  } = useReportAggregates(reportAggregatesParams);

  const allowedDeviceSet = useMemo(() => {
    return new Set((deviceOptions ?? []).map((x: any) => String(x)));
  }, [deviceOptions]);

  const allowedChannelSet = useMemo(() => {
    return new Set((channelOptions ?? []).map((x: any) => String(x)));
  }, [channelOptions]);

  const allowedSourceSet = useMemo(() => {
    return new Set((sourceOptions ?? []).map((x: any) => String(x)));
  }, [sourceOptions]);

  const allowedProductSet = useMemo(() => {
    return new Set((productOptions ?? []).map((x: any) => String(x)));
  }, [productOptions]);

  const byDay = useMemo(() => {
    if (tab !== "summary") return [];
    return buildDailySummaryRows(filteredRows as any[]);
  }, [tab, filteredRows]);

  const lastDataDate = useMemo(() => {
    return getLastDateFromRows(filteredRows as any[], currentMonthKey);
  }, [filteredRows, currentMonthKey]);

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
    if (selectedDevice !== "all" && !allowedDeviceSet.has(String(selectedDevice))) {
      setSelectedDevice("all");
    }
  }, [selectedDevice, allowedDeviceSet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (selectedChannel !== "all" && !allowedChannelSet.has(String(selectedChannel))) {
      setSelectedChannel("all");
    }
  }, [selectedChannel, allowedChannelSet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (selectedSource !== "all" && !allowedSourceSet.has(String(selectedSource))) {
      setSelectedSource("all");
    }
  }, [selectedSource, allowedSourceSet, readOnlyHeader]);

  useEffect(() => {
    if (readOnlyHeader) return;
    if (selectedProduct !== "all" && !allowedProductSet.has(String(selectedProduct))) {
      setSelectedProduct("all");
    }
  }, [selectedProduct, allowedProductSet, readOnlyHeader]);

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

  const insightsCurrentMonthActual = useMemo(() => {
    return {
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
    };
  }, [currentMonthActual]);

  const insightsParams = useMemo(() => {
    return {
      byMonth,
      rowsLength: reportPeriodRows.length,
      currentMonthKey,
      monthGoal,
      currentMonthActual: insightsCurrentMonthActual,
      currentMonthGoalComputed,
      enableMonthlyInsight: tab === "summary",
      enableMonthGoalInsight: tab === "summary",
    };
  }, [
    byMonth,
    reportPeriodRows.length,
    currentMonthKey,
    monthGoal,
    insightsCurrentMonthActual,
    currentMonthGoalComputed,
    tab,
  ]);

  const { monthGoalInsight } = useInsights(insightsParams);

  const keywordAgg = useMemo(() => {
    if (tab !== "keyword") return [];
    return groupByKeyword(filteredRows as any[]);
  }, [tab, filteredRows]);

  const keywordInsight = useMemo(() => {
    if (tab !== "keyword") return "";
    return buildKeywordInsight({
      keywordAgg: keywordAgg as any[],
      keywordBaseRows: filteredRows as any[],
      currentMonthActual: currentMonthActual as any,
      currentMonthGoalComputed: currentMonthGoalComputed as any,
    });
  }, [tab, keywordAgg, filteredRows, currentMonthActual, currentMonthGoalComputed]);

  const creativesMapNormalized = useMemo(() => {
    if (!needCreativeRows) return {};
    return normalizeCreativesMap(creativesMap ?? {});
  }, [needCreativeRows, creativesMap]);

  const filteredRowsWithCreatives = useMemo(() => {
    if (!needCreativeRows) return filteredRows as any[];

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
  }, [needCreativeRows, filteredRows, creativesMapNormalized, originalRowById]);

  const creativeBaseRows = useMemo(() => {
    if (tab !== "creative" && tab !== "creativeDetail") return [];
    const list = (filteredRowsWithCreatives as any[]) ?? [];
    return list.filter((r) => !!r?.creative_url);
  }, [tab, filteredRowsWithCreatives]);

  const stableMonthGoal = useStableShallowValue(monthGoal);
  const stableCurrentMonthActual = useStableShallowValue(currentMonthActual);
  const stableCurrentMonthGoalComputed =
    useStableShallowValue(currentMonthGoalComputed);
  const stableTotals = useStableShallowValue(totals);
  const stableByMonth = useStableShallowValue(byMonth);
  const stableByWeekOnly = useStableShallowValue(byWeekOnly);
  const stableByWeekChart = useStableShallowValue(byWeekChart);
  const stableBySource = useStableShallowValue(bySource);
  const stableByDay = useStableShallowValue(byDay);
  const stableMonthGoalInsight = useStableShallowValue(monthGoalInsight);

  const monthGoalSectionProps = useMemo(() => {
    return {
      reportType,
      currentMonthKey,
      currentMonthActual: stableCurrentMonthActual,
      currentMonthGoalComputed: stableCurrentMonthGoalComputed,
      monthGoal: stableMonthGoal,
      setMonthGoal,
      monthGoalInsight: stableMonthGoalInsight,
      lastDataDate,
    };
  }, [
    reportType,
    currentMonthKey,
    stableCurrentMonthActual,
    stableCurrentMonthGoalComputed,
    stableMonthGoal,
    setMonthGoal,
    stableMonthGoalInsight,
    lastDataDate,
  ]);

  const summarySectionProps = useMemo(() => {
    return {
      reportType,
      totals: stableTotals,
      byMonth: stableByMonth,
      byWeekOnly: stableByWeekOnly,
      byWeekChart: stableByWeekChart,
      bySource: stableBySource,
      byDay: stableByDay,
      currentMonthKey,
      currentMonthActual: stableCurrentMonthActual,
      currentMonthGoalComputed: stableCurrentMonthGoalComputed,
      monthGoal: stableMonthGoal,
      setMonthGoal,
      monthGoalInsight: stableMonthGoalInsight,
    };
  }, [
    reportType,
    stableTotals,
    stableByMonth,
    stableByWeekOnly,
    stableByWeekChart,
    stableBySource,
    stableByDay,
    currentMonthKey,
    stableCurrentMonthActual,
    stableCurrentMonthGoalComputed,
    stableMonthGoal,
    setMonthGoal,
    stableMonthGoalInsight,
  ]);

  return (
    <main
      key={templateRenderKey}
      className="min-h-screen bg-slate-50 text-slate-900"
    >
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-100/90 via-slate-50/70 to-transparent" />

        <div className="relative z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur-md shadow-[0_1px_0_rgba(15,23,42,0.03)]">
          <MemoHeaderBar
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
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            monthOptions={monthOptions}
            weekOptions={weekOptions}
            deviceOptions={deviceOptions}
            channelOptions={channelOptions}
            sourceOptions={sourceOptions}
            productOptions={productOptions}
            enabledMonthKeySet={enabledMonthKeySet}
            enabledWeekKeySet={enabledWeekKeySet}
            fullPeriod={fullPeriod}
            period={periodFixed}
            advertiserName={effectiveAdvertiserName}
            reportTypeName={effectiveReportTypeName}
            reportTypeKey={effectiveReportTypeKey}
            reportPeriod={reportPeriod}
            onChangeReportPeriod={onChangeReportPeriod}
            readOnlyHeader={readOnlyHeader}
            hidePeriodEditor={hidePeriodEditor}
            hideTabPeriodText={hideTabPeriodText}
          />
        </div>
      </div>

      <div className="px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div className="mx-auto w-full max-w-[1660px]">
          {isLoading ? (
            <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                <div className="text-sm font-medium text-slate-600">
                  Loading rows...
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative flex items-start justify-center gap-5 xl:gap-6">
            <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
              <FloatingFilterRail
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                monthOptions={monthOptions}
                selectedWeek={selectedWeek}
                setSelectedWeek={setSelectedWeek}
                weekOptions={weekOptions}
                selectedDevice={selectedDevice}
                setSelectedDevice={setSelectedDevice}
                deviceOptions={deviceOptions}
                selectedChannel={selectedChannel}
                setSelectedChannel={setSelectedChannel}
                channelOptions={channelOptions}
                selectedSource={selectedSource}
                setSelectedSource={setSelectedSource}
                sourceOptions={sourceOptions}
                selectedProduct={selectedProduct}
                setSelectedProduct={setSelectedProduct}
                productOptions={productOptions}
                enabledMonthKeySet={enabledMonthKeySet}
                enabledWeekKeySet={enabledWeekKeySet}
                readOnly={readOnlyHeader}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1440px]">
                <div className="space-y-8">
                  {tab === "summary" && (
                    <>
                      <div className="rounded-2xl">
                        <MemoMonthGoalSection {...(monthGoalSectionProps as any)} />
                      </div>

                      <div className="rounded-2xl">
                        <MemoSummarySection {...(summarySectionProps as any)} />
                      </div>
                    </>
                  )}

                  {tab === "summary2" && (
                    <div className="rounded-2xl">
                      <MemoSummary2Section
                        {...({ reportType } as any)}
                        rows={filteredRows as any[]}
                      />
                    </div>
                  )}

                  {tab === "structure" && (
                    <div className="rounded-2xl">
                      <MemoStructureSection
                        {...({ reportType } as any)}
                        bySource={bySource}
                        byCampaign={byCampaign}
                        rows={filteredRowsWithCreatives}
                        monthGoal={monthGoal}
                      />
                    </div>
                  )}

                  {tab === "keyword" && (
                    <div className="rounded-2xl">
                      <MemoKeywordSection
                        {...({ reportType } as any)}
                        keywordAgg={keywordAgg}
                        keywordInsight={keywordInsight}
                      />
                    </div>
                  )}

                  {tab === "keywordDetail" && (
                    <div className="rounded-2xl">
                      <MemoKeywordDetailSection
                        {...({ reportType } as any)}
                        rows={filteredRowsWithCreatives as any[]}
                      />
                    </div>
                  )}

                  {tab === "creative" && (
                    <div className="rounded-2xl">
                      <MemoCreativeSection
                        {...({ reportType } as any)}
                        rows={creativeBaseRows}
                      />
                    </div>
                  )}

                  {tab === "creativeDetail" && (
                    <div className="rounded-2xl">
                      <MemoCreativeDetailSection
                        {...({ reportType } as any)}
                        rows={creativeBaseRows as any[]}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
              <FloatingTabRail
                tab={tab}
                setTab={setTab}
                readOnly={readOnlyHeader}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
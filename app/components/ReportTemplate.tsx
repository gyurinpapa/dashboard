// app/components/ReportTemplate.tsx
"use client";

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
import CreativeSection from "@/app/components/sections/CreativeSection";
import CreativeDetailSection from "@/app/components/sections/CreativeDetailSection";
import MonthGoalSection from "@/app/components/sections/MonthGoalSection";

// ✅ 어떤 컴포넌트가 object인지 즉시 찾기 (dev에서만)
if (typeof window !== "undefined") {
  const checks: Record<string, any> = {
    HeaderBar,
    StructureSection,
    KeywordSection,
    KeywordDetailSection,
    SummarySection,
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

  /**
   * key = report_creatives.creative_key (일반적으로 "파일명.확장자")
   * value = signed_url
   */
  creativesMap?: Record<string, string>;
};

function asStr(v: any) {
  if (v == null) return "";
  return String(v).trim();
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

/**
 * ✅ 핵심: "눈에 같은 파일명"인데 매칭이 안 되는 가장 큰 원인 = 유니코드 정규화(NFD/NFC)
 */
function normalizeKey(s: any) {
  let v = String(s ?? "");
  v = safeDecode(v);
  v = v.replace(/\\/g, "/"); // windows slash
  v = v.replace(/\u00A0/g, " "); // NBSP -> space
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
  const raw = rec?.row ?? rec?.data ?? null;
  const rowObj = tryParseJson(raw) || null;

  const base = rowObj ? { ...rowObj } : { ...(rec ?? {}) };

  if (base.date == null && rec?.date != null) base.date = rec.date;
  if (base.channel == null && rec?.channel != null) base.channel = rec.channel;
  if (base.device == null && rec?.device != null) base.device = rec.device;
  if (base.source == null && rec?.source != null) base.source = rec.source;

  if (base.imagepath == null && base.imagePath != null) base.imagepath = base.imagePath;
  if (base.imagePath == null && base.imagepath != null) base.imagePath = base.imagepath;

  if (base.creative_file == null && base.creativeFile != null) base.creative_file = base.creativeFile;
  if (base.creativeFile == null && base.creative_file != null) base.creativeFile = base.creative_file;

  if (base.__row_id == null && rec?.id != null) base.__row_id = rec.id;
  if (base.id == null && rec?.id != null) base.id = rec.id;

  return base;
}

/**
 * ✅ row에서 creative 후보 수집 (매칭용)
 */
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
    // CSV에 "/creatives/파일명" 형태가 남아있는 케이스를 위해 후보로 유지
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

      kRaw.startsWith("C:") ? normalizeKey(kRaw.slice(2)) : normalizeKey(`C:${kRaw}`),
      base ? (base.startsWith("C:") ? normalizeKey(base.slice(2)) : normalizeKey(`C:${base}`)) : "",
      noext ? (noext.startsWith("C:") ? normalizeKey(noext.slice(2)) : normalizeKey(`C:${noext}`)) : "",
      p1 ? (p1.startsWith("C:") ? normalizeKey(p1.slice(2)) : normalizeKey(`C:${p1}`)) : "",
      c1 ? (c1.startsWith("C:") ? normalizeKey(c1.slice(2)) : normalizeKey(`C:${c1}`)) : "",
    ])
      .map(normalizeKey)
      .filter(Boolean);

    for (const kk of keys) {
      if (!out[kk]) out[kk] = url;
    }
  }

  return out;
}

export default function ReportTemplate({ rows, isLoading, creativesMap }: Props) {
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

  const normalizedRows = useMemo(() => {
    return (rows ?? []).map(normalizeIncomingRow);
  }, [rows]);

  // ✅ [INSERT HERE] 디버깅 편의: 콘솔에서 window.__ROWS__[0] 확인 가능
  // - URL에 ?debugRows=1 붙였을 때만 노출
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
      const id = (r?.__row_id ?? r?.id) ? String(r.__row_id ?? r.id) : "";
      if (!id) continue;
      if (!m.has(id)) m.set(id, r);
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
    } catch {}
  }, [normalizedRows]);

  useEffect(() => {
    if (tab !== "keyword") return;
    if (selectedChannel === ("display" as ChannelKey)) {
      setSelectedChannel("search" as ChannelKey);
    }
  }, [tab, selectedChannel, setSelectedChannel]);

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
    rows: normalizedRows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    monthGoal,
    onInvalidWeek: () => setSelectedWeek("all"),
  });

  const { monthGoalInsight } = useInsights({
    byMonth,
    rowsLength: normalizedRows.length,
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
      const rid = (r?.__row_id ?? r?.id) ? String(r.__row_id ?? r.id) : "";
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
        __creative_candidates: candidates,
        __creative_raw: baseForCandidates?.creative ?? "",
        __creative_file_raw:
          baseForCandidates?.creative_file ??
          baseForCandidates?.creativeFile ??
          undefined,

        __dbg_hit_candidates: candidates
          .map((x: any) => normalizeKey(x))
          .filter((x: string) => !!map[x])
          .slice(0, 10),
      };

      if (displayUrl) {
        // ✅ 매칭 성공: signed url로 강제 주입
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
        // ✅ [CHANGE] 매칭 실패: CSV에 남아있는 "/creatives/..." 같은 '옛 경로' 렌더링을 100% 차단
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

  // ✅ [CHANGE] 기존 "후보정보 있으면 소재로 취급" => 완전 금지
  // ✅ 업로드된 소재(=매칭 성공, creative_url 존재)만 소재 탭에 노출
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
      console.log("creativesMap keys =", Object.keys(creativesMapNormalized).slice(0, 200));
      console.log("creativeBaseRows len =", creativeBaseRows.length);
      console.log("rows sample =", first);
    } catch {}
  }, [tab, creativeBaseRows, creativesMapNormalized]);

  return (
    <main className="min-h-screen bg-white">
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
          {isLoading ? (
            <div style={{ padding: 12, opacity: 0.7 }}>Loading rows...</div>
          ) : null}

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
                const currentMonthKey2 = (totals as any)?.currentMonthKey ?? null;
                const currentMonthActual2 = (totals as any)?.currentMonthActual ?? totals;

                const monthGoal2 = (totals as any)?.monthGoal ?? null;

                const currentMonthGoalComputed2 =
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

                const setMonthGoalDummy = () => {};
                const monthGoalInsightDummy = null;

                return (
                  <SummarySection
                    totals={totals as any}
                    byMonth={byMonth as any}
                    byWeekOnly={byWeekOnly as any}
                    byWeekChart={byWeekChart as any}
                    bySource={bySource as any}
                    currentMonthKey={currentMonthKey2}
                    currentMonthActual={currentMonthActual2}
                    currentMonthGoalComputed={currentMonthGoalComputed2}
                    monthGoal={monthGoal2}
                    setMonthGoal={setMonthGoalDummy}
                    monthGoalInsight={monthGoalInsightDummy}
                  />
                );
              })()}
            </>
          )}

          {tab === "structure" && (
            <StructureSection
              bySource={bySource}
              byCampaign={byCampaign}
              rows={filteredRowsWithCreatives}
              monthGoal={monthGoal}
            />
          )}

          {tab === "keyword" && (
            <KeywordSection keywordAgg={keywordAgg} keywordInsight={keywordInsight} />
          )}

          {tab === "keywordDetail" && (
            <KeywordDetailSection rows={filteredRowsWithCreatives as any[]} />
          )}

          {tab === "creative" && <CreativeSection rows={creativeBaseRows} />}

          {tab === "creativeDetail" && (
            <CreativeDetailSection rows={creativeBaseRows as any[]} />
          )}
        </div>
      </div>
    </main>
  );
}
// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ChannelKey,
  DeviceKey,
  FilterKey,
  GoalState,
  MonthKey,
  TabKey,
  WeekKey,
} from "../src/lib/report/types";

import { groupByKeyword } from "../src/lib/report/keyword";

import { useLocalStorageState } from "../src/useLocalStorageState";
import { useInsights } from "./hooks/useInsights";

import { useReportRows } from "../src/lib/report/useReportRows";
import { useReportAggregates } from "../src/lib/report/useReportAggregates";
import { buildKeywordInsight } from "../src/lib/report/insights/buildKeywordInsight";

import HeaderBar from "./components/sections/HeaderBar";
import StructureSection from "./components/sections/StructureSection";
import KeywordSection from "./components/sections/KeywordSection";
import KeywordDetailSection from "./components/sections/KeywordDetailSection";
import SummarySection from "./components/sections/SummarySection";
import CreativeSection from "./components/sections/CreativeSection";
import CreativeDetailSection from "./components/sections/CreativeDetailSection";
import MonthGoalSection from "./components/sections/MonthGoalSection";

const MONTH_GOAL_KEY = "nature_report_month_goal_v1";
const LAST_SHARE_TOKEN_KEY = "nature_report_last_share_token_v1";

const DEFAULT_GOAL: GoalState = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

function safeDecodeURIComponent(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function extractShareTokenFromText(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  // 1) 혹시 전체 URL이 들어오는 경우 ( /share/{token} or /api/share/{token} )
  //    - querystring 제거 후 경로에서 token 추출
  const noHash = raw.split("#")[0];
  const noQs = noHash.split("?")[0];

  // /share/<token>
  const m1 = noQs.match(/\/share\/([^\/\s]+)\s*$/i);
  if (m1?.[1]) return safeDecodeURIComponent(m1[1]).trim();

  // /api/share/<token>
  const m2 = noQs.match(/\/api\/share\/([^\/\s]+)\s*$/i);
  if (m2?.[1]) return safeDecodeURIComponent(m2[1]).trim();

  // 2) token=... 형태로 들어오는 경우
  const m3 = raw.match(/[?&]token=([^&\s#]+)/i);
  if (m3?.[1]) return safeDecodeURIComponent(m3[1]).trim();

  // 3) 그냥 token만 들어오는 경우
  //    - 공백/따옴표 제거
  return raw.replace(/^["'\s]+|["'\s]+$/g, "").trim();
}

function getLastShareToken() {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(LAST_SHARE_TOKEN_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function setLastShareToken(token: string) {
  try {
    if (typeof window === "undefined") return;
    const t = String(token ?? "").trim();
    if (!t) return;
    window.localStorage.setItem(LAST_SHARE_TOKEN_KEY, t);
  } catch {
    // ignore
  }
}

export default function Page() {
  const router = useRouter();

  // ✅ CSV rows 로딩 (나중에 DB로 교체 가능)
  const { rows, isLoading } = useReportRows("/data/TEST_ver1.csv");

  // ===== state =====
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

  // ============================
  // ✅ 홈: 공유 링크 입력 UI 상태
  // ============================
  const [shareInput, setShareInput] = useState("");
  const [lastShareToken, setLastShareTokenState] = useState("");

  useEffect(() => {
    // 최초 로드 시 최근 토큰 로드
    setLastShareTokenState(getLastShareToken());
  }, []);

  const shareToken = useMemo(() => extractShareTokenFromText(shareInput), [shareInput]);

  const goShare = (tokenLike: string) => {
    const t = extractShareTokenFromText(tokenLike);
    if (!t) return;
    setLastShareToken(t);
    setLastShareTokenState(t);
    router.push(`/share/${encodeURIComponent(t)}`);
  };

  // ============================
  // ✅ Keyword 탭에서는 "display" 채널 선택을 막는다 (상태 가드)
  // - UI(회색/disabled)는 HeaderBar에서 처리
  // - 여기서는 "선택되어버리는 상황" 자체를 방지/자동해제
  // ============================
  useEffect(() => {
    if (tab !== "keyword") return;

    // ChannelKey가 "all" | "search" | "display" 구조라고 가정
    // 키워드 탭에서는 display 단독 선택을 허용하지 않음
    if (selectedChannel === ("display" as ChannelKey)) {
      setSelectedChannel("search" as ChannelKey);
    }
  }, [tab, selectedChannel, setSelectedChannel]);

  // ✅ 집계/옵션/기간/그룹핑은 전부 훅에서
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
    rows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    monthGoal,
    onInvalidWeek: () => setSelectedWeek("all"),
  });

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

  // ============================
  // ✅ Creative 탭 데이터
  // ============================
  const creativeBaseRows = useMemo(() => filteredRows, [filteredRows]);
  const creativeInsight = useMemo(() => "", []);

  return (
    <main className="min-h-screen">
      {/* ✅ 홈: 공유 링크 입력 (기존 구조/기능에 영향 최소) */}
      <div className="px-8 pt-6">
        <div
          className="mx-auto w-full max-w-[1400px]"
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
            공유 리포트 열기
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={shareInput}
              onChange={(e) => setShareInput(e.target.value)}
              onPaste={(e) => {
                // 붙여넣기 즉시 token 추출해서 입력칸을 깔끔하게 정리
                const text = e.clipboardData?.getData("text") ?? "";
                const t = extractShareTokenFromText(text);
                if (t) {
                  e.preventDefault();
                  setShareInput(t);
                }
              }}
              placeholder="공유 링크 또는 토큰을 붙여넣으세요 (예: /share/xxxx 또는 xxxx)"
              style={{
                flex: "1 1 520px",
                minWidth: 260,
                height: 40,
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "0 12px",
                background: "#fff",
                outline: "none",
              }}
            />

            <button
              onClick={() => goShare(shareInput)}
              disabled={!shareToken}
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: shareToken ? "#111" : "#999",
                color: "#fff",
                fontWeight: 800,
                cursor: shareToken ? "pointer" : "not-allowed",
              }}
            >
              열기
            </button>

            <button
              onClick={() => {
                if (!lastShareToken) return;
                goShare(lastShareToken);
              }}
              disabled={!lastShareToken}
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                fontWeight: 700,
                cursor: lastShareToken ? "pointer" : "not-allowed",
              }}
              title={lastShareToken ? `마지막 토큰: ${lastShareToken}` : ""}
            >
              최근 링크
            </button>

            <button
              onClick={() => {
                setShareInput("");
              }}
              style={{
                height: 40,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid #eee",
                background: "#fff",
                color: "#666",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              비우기
            </button>
          </div>

          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            {lastShareToken ? (
              <>
                최근 토큰: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{lastShareToken}</span>
              </>
            ) : (
              <>최근 토큰: 없음</>
            )}
          </div>
        </div>
      </div>

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

              {/* Summary */}
              {(() => {
                const currentMonthKey = (totals as any)?.currentMonthKey ?? null;
                const currentMonthActual =
                  (totals as any)?.currentMonthActual ?? totals;

                // page.tsx는 totals가 typed object일 가능성이 높아서 monthGoal은 없을 수 있음 → null로 안전 처리
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
            <KeywordSection keywordAgg={keywordAgg} keywordInsight={keywordInsight} />
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
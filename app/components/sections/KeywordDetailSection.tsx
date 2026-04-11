// app/components/sections/KeywordDetailSection.tsx
"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { Row } from "../../../src/lib/report/types";

import SummarySection from "./SummarySection";

import {
  summarize,
  groupBySource,
  groupByDevice,
  groupByWeekRecent5,
  groupByMonthRecent3,
} from "../../../src/lib/report/aggregate";

import {
  toSafeNumber,
  diffRatio,
  formatDeltaPercentFromRatio,
  formatPercentFromRate,
  formatPercentFromRoas,
} from "../../../src/lib/report/format";

/** =========================
 * Utils
 * ========================= */
function safePct(n: number) {
  return formatPercentFromRate(n, 1);
}

function safePct0(n: number) {
  return formatPercentFromRate(n, 0);
}

function safeRoasPct0(n: number) {
  return formatPercentFromRoas(n, 0);
}

function signPct(n: number) {
  return formatDeltaPercentFromRatio(n, 1, "0.0%");
}

function pickDeviceLabel(raw: string) {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("mobile") || s === "m") return "모바일";
  if (s.includes("pc") || s.includes("desktop")) return "PC";
  if (s.includes("tablet")) return "태블릿";
  if (s.includes("unknown") || !s.trim()) return "미지정";
  return raw;
}

function normalizeKeywordSearchText(value: any) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * ✅ Avg.rank (키워드 상세 탭 전용) 가중평균
 * - 기본: impressions 가중평균 (Σ(rank*imp) / Σ(imp))
 * - fallback: impressions가 없으면 단순평균
 * - 값이 없으면 null
 */
function calcAvgRankWeighted(rows: Row[]) {
  let wSum = 0;
  let w = 0;
  let sSum = 0;
  let sCnt = 0;

  for (const r of rows) {
    const rank = Number((r as any).avgRank);
    if (!Number.isFinite(rank)) continue;

    const imp = toSafeNumber((r as any).impressions);
    if (imp > 0) {
      wSum += rank * imp;
      w += imp;
    }
    sSum += rank;
    sCnt += 1;
  }

  if (w > 0) return wSum / w;
  if (sCnt > 0) return sSum / sCnt;
  return null;
}

function extractKeywords(rows: Row[]) {
  const set = new Set<string>();
  for (const r of rows) {
    const k = (r.keyword ?? "").toString().trim();
    if (k) set.add(k);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}

function filterByKeyword(rows: Row[], keyword: string | null) {
  if (!keyword) return rows;
  return rows.filter((r) => (r.keyword ?? "").toString().trim() === keyword);
}

function normalizeDateKey(value: any): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const compact = raw.replace(/\./g, "-").replace(/\//g, "-").replace(/\s+/g, "");
  const matched = compact.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (matched) {
    const [, y, m, d] = matched;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }

  return "";
}

function extractRowDateKey(row: Row): string {
  const candidates = [
    (row as any)?.dateKey,
    (row as any)?.date,
    (row as any)?.day,
    (row as any)?.ymd,
    (row as any)?.reportDate,
    (row as any)?.segmentDate,
    (row as any)?.daily,
    (row as any)?.["일자"],
    (row as any)?.["날짜"],
    (row as any)?.["date"],
  ];

  for (const value of candidates) {
    const normalized = normalizeDateKey(value);
    if (normalized) return normalized;
  }

  return "";
}

function groupByDayFromRows(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const row of rows) {
    const dateKey = extractRowDateKey(row);
    if (!dateKey) continue;

    const list = map.get(dateKey) ?? [];
    list.push(row);
    map.set(dateKey, list);
  }

  return Array.from(map.entries())
    .map(([dateKey, bucket]) => {
      const s = summarize(bucket);
      return {
        date: dateKey,
        dateKey,
        label: dateKey,
        impressions: toSafeNumber((s as any)?.impressions ?? (s as any)?.impr),
        impr: toSafeNumber((s as any)?.impressions ?? (s as any)?.impr),
        clicks: toSafeNumber((s as any)?.clicks),
        ctr: toSafeNumber((s as any)?.ctr),
        cpc: toSafeNumber((s as any)?.cpc),
        cost: toSafeNumber((s as any)?.cost),
        conversions: toSafeNumber((s as any)?.conversions ?? (s as any)?.conv),
        conv: toSafeNumber((s as any)?.conversions ?? (s as any)?.conv),
        cvr: toSafeNumber((s as any)?.cvr),
        cpa: toSafeNumber((s as any)?.cpa),
        revenue: toSafeNumber((s as any)?.revenue),
        roas: toSafeNumber((s as any)?.roas),
      };
    })
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
}

/**
 * ✅ rows 기준 keyword 목록 + bucket 사전 계산
 */
function buildKeywordIndex(rows: Row[]) {
  const keywordSet = new Set<string>();
  const keywordBuckets = new Map<string, Row[]>();

  for (const row of rows) {
    const keyword = (row.keyword ?? "").toString().trim();
    if (!keyword) continue;

    keywordSet.add(keyword);

    const bucket = keywordBuckets.get(keyword);
    if (bucket) {
      bucket.push(row);
    } else {
      keywordBuckets.set(keyword, [row]);
    }
  }

  const keywords = Array.from(keywordSet).sort((a, b) => a.localeCompare(b, "ko"));
  const keywordLookup = new Set(keywords);

  return {
    keywords,
    keywordBuckets,
    keywordLookup,
  };
}

/**
 * ✅ 변경 지점:
 * 키워드 선택 때마다 무거운 집계 재계산이 몰리지 않도록
 * 키워드별 집계 결과를 최초 rows 기준으로 한 번 사전 계산
 */
function buildKeywordMetricsIndex(rows: Row[]) {
  const { keywords, keywordBuckets, keywordLookup } = buildKeywordIndex(rows);
  const metricsMap = new Map<
    string,
    {
      filteredRows: Row[];
      avgRank: number | null;
      totals: any;
      bySource: any[];
      byDevice: any[];
      byWeekOnly: any[];
      byWeekChart: any[];
      byDay: any[];
      byMonth: any[];
      currentMonthGoalComputed: any;
      currentMonthKey: any;
      currentMonthActual: any;
      monthGoal: any;
      monthGoalInsight: any;
    }
  >();

  for (const keyword of keywords) {
    const filteredRows = keywordBuckets.get(keyword) ?? [];
    const avgRank = calcAvgRankWeighted(filteredRows);
    const totals = summarize(filteredRows);
    const bySource = groupBySource(filteredRows);
    const byDevice = groupByDevice(filteredRows);
    const byWeekOnly = groupByWeekRecent5(filteredRows);

    const byWeekChart = [...byWeekOnly].sort((a, b) =>
      String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
    );

    const byDay = groupByDayFromRows(filteredRows);

    const byMonth = groupByMonthRecent3({
      rows: filteredRows,
      selectedMonth: "all",
      selectedDevice: "all",
      selectedChannel: "all",
    });

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

    const currentMonthKey = (totals as any)?.currentMonthKey ?? null;
    const currentMonthActual = (totals as any)?.currentMonthActual ?? totals;
    const monthGoal = (totals as any)?.monthGoal ?? null;
    const monthGoalInsight = null;

    metricsMap.set(keyword, {
      filteredRows,
      avgRank,
      totals,
      bySource,
      byDevice,
      byWeekOnly,
      byWeekChart,
      byDay,
      byMonth,
      currentMonthGoalComputed,
      currentMonthKey,
      currentMonthActual,
      monthGoal,
      monthGoalInsight,
    });
  }

  return {
    keywords,
    keywordBuckets,
    keywordLookup,
    metricsMap,
  };
}

/**
 * ✅ 인사이트 생성(근거 기반 v2: 기기 근거 포함)
 * - 선택 키워드 실적/효율 + 전체 대비 기여도 + 최근 주간 추세 + 소스별 + 기기별(Top 비교)
 * - 다음 액션(클릭/전환/ROAS 개선)까지 문장으로
 */
function buildKeywordDetailInsight(args: {
  keyword: string | null;
  allRowsScope: Row[];
  keywordRows: Row[];
  byWeekOnly: any[];
  bySource: any[];
  byDevice: any[];
  avgRank: number | null;
}) {
  const { keyword, allRowsScope, keywordRows, byWeekOnly, bySource, byDevice, avgRank } = args;

  if (!keyword) {
    return {
      title: "선택 키워드 요약 인사이트",
      bullets: ["키워드를 선택하면 해당 키워드의 실적/기여도/추세/기기 근거 기반 인사이트가 표시됩니다."],
      actions: [],
    };
  }

  const all = summarize(allRowsScope);
  const me = summarize(keywordRows);

  const shareCost = all.cost ? me.cost / all.cost : 0;
  const shareRev = all.revenue ? me.revenue / all.revenue : 0;
  const shareConv = all.conversions ? me.conversions / all.conversions : 0;

  const weeks = [...(byWeekOnly || [])].sort((a, b) =>
    String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
  );
  const wLast = weeks.length ? weeks[weeks.length - 1] : null;
  const wPrev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;

  const roasWoW = wLast && wPrev ? diffRatio(toSafeNumber(wLast.roas), toSafeNumber(wPrev.roas)) ?? 0 : 0;
  const clickWoW = wLast && wPrev ? diffRatio(toSafeNumber(wLast.clicks), toSafeNumber(wPrev.clicks)) ?? 0 : 0;
  const convWoW =
    wLast && wPrev ? diffRatio(toSafeNumber(wLast.conversions), toSafeNumber(wPrev.conversions)) ?? 0 : 0;
  const costWoW = wLast && wPrev ? diffRatio(toSafeNumber(wLast.cost), toSafeNumber(wPrev.cost)) ?? 0 : 0;

  const sources = [...(bySource || [])].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  const topS1 = sources[0] ?? null;
  const topS2 = sources[1] ?? null;

  const devices = [...(byDevice || [])].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  const topD1 = devices[0] ?? null;
  const topD2 = devices[1] ?? null;

  const efficiencyLabel =
    me.roas >= 1.0
      ? "ROAS가 100% 이상으로 효율이 양호"
      : me.roas >= 0.7
      ? "ROAS가 70~100% 구간으로 개선 여지"
      : "ROAS가 70% 미만으로 효율 개선이 우선";

  const trendLabel =
    wLast && wPrev
      ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(convWoW)}, ROAS ${signPct(
          roasWoW
        )} (비용 ${signPct(costWoW)})`
      : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

  const bullets: string[] = [];
  bullets.push(
    `선택 키워드 “${keyword}” 성과: 클릭 ${Math.round(me.clicks)} / 전환 ${toSafeNumber(me.conversions).toFixed(
      1
    )} / ROAS ${safeRoasPct0(me.roas)} · ${efficiencyLabel}`
  );
  bullets.push(
    `기여도(현재 탭 범위 대비): 비용 ${safePct(shareCost)}, 전환 ${safePct(shareConv)}, 매출 ${safePct(shareRev)}`
  );
  bullets.push(trendLabel);

  if (avgRank != null) {
    bullets.push(`평균노출순위(Avg.rank): ${avgRank.toFixed(2)} (낮을수록 상단 노출)`);
  } else {
    bullets.push("평균노출순위(Avg.rank): 데이터 없음");
  }

  if (topD1) {
    const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
    const d1Roas = toSafeNumber(topD1.roas);
    const d1Cvr = toSafeNumber(topD1.cvr);
    const d1Ctr = toSafeNumber(topD1.ctr);

    let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(ROAS ${safeRoasPct0(d1Roas)}, CTR ${safePct(
      d1Ctr
    )}, CVR ${safePct(d1Cvr)}).`;

    if (topD2) {
      const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
      const d2Roas = toSafeNumber(topD2.roas);
      deviceLine += ` 비교: “${d2}” ROAS ${safeRoasPct0(d2Roas)}.`;
    }

    bullets.push(deviceLine);
  } else {
    bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
  }

  const actions: string[] = [];

  if (me.ctr < 0.02 && me.impressions > 0) {
    actions.push(
      "클릭 개선: CTR이 낮습니다. 광고문구/확장소재(가격·혜택·신뢰요소) A/B, 매칭타입/제외키워드 정리로 클릭 품질을 먼저 끌어올리세요."
    );
  } else {
    actions.push(
      "클릭 확장: CTR이 극단적으로 낮지 않습니다. 동일 의도 키워드 확장(유사어/지역/상황)과 입찰·예산 분배로 노출을 단계적으로 늘려보세요."
    );
  }

  if (me.cvr < 0.01 && me.clicks >= 30) {
    actions.push(
      "전환 개선: CVR이 낮습니다. 랜딩 첫 화면(USP+신뢰+CTA) 간소화, 폼 필드 축소, 상담/전화 CTA 가시성 개선을 우선 적용하세요."
    );
  } else {
    actions.push(
      "전환 유지/확대: CVR이 급격히 낮지 않습니다. 전환 상위 구간(기기/요일/소스)을 찾아 그 구간 중심으로 예산을 이동하세요."
    );
  }

  if (topS1) {
    const s1 = `소스: 비용 상위 “${String(topS1.source)}”(ROAS ${safeRoasPct0(
      toSafeNumber(topS1.roas)
    )}).`;
    if (toSafeNumber(topS1.roas) >= me.roas) {
      actions.push(`${s1} 효율이 평균 이상이면, 동일 소스 내 세분화(기기/시간대) 후 증액이 안전합니다.`);
    } else {
      actions.push(`${s1} 효율이 평균 미만이면, 저효율 구간을 먼저 차단하고 예산을 분산하세요.`);
    }
  }

  if (topS2) {
    actions.push(
      `소스 비교: 2순위 “${String(topS2.source)}”(ROAS ${safeRoasPct0(
        toSafeNumber(topS2.roas)
      )})와 함께 증액/유지/축소 기준을 명확히 하세요.`
    );
  }

  if (topD1 && topD2) {
    const d1 = String(topD1.device ?? "unknown");
    const d2 = String(topD2.device ?? "unknown");
    const d1Roas = toSafeNumber(topD1.roas);
    const d2Roas = toSafeNumber(topD2.roas);

    if (d1Roas > d2Roas * 1.1) {
      actions.push(
        `기기 최적화: “${pickDeviceLabel(d1)}” ROAS가 “${pickDeviceLabel(d2)}” 대비 높습니다. 기기 분리 운영(입찰/예산/광고문구) 후 성과 좋은 기기에 예산을 우선 배분하세요.`
      );
    } else if (d2Roas > d1Roas * 1.1) {
      actions.push(
        `기기 최적화: “${pickDeviceLabel(d2)}” ROAS가 더 높습니다. 낮은 ROAS 기기는 노출/입찰을 줄이고 높은 ROAS 기기에 예산을 이동하세요.`
      );
    } else {
      actions.push(
        "기기 최적화: 기기 간 ROAS 차이가 크지 않습니다. CTR/CVR이 갈리는 구간이 있는지 확인 후, 랜딩/카피를 기기별로 미세 조정하세요."
      );
    }
  } else if (topD1) {
    actions.push(
      `기기 최적화: “${pickDeviceLabel(String(topD1.device))}” 중심으로 데이터가 모였습니다. 다른 기기의 데이터가 충분히 쌓이도록 최소 노출을 확보한 뒤 비교 최적화하세요.`
    );
  }

  return {
    title: "선택 키워드 요약 인사이트",
    bullets,
    actions,
  };
}

/** =========================
 * Perf-safe constants
 * ========================= */

const NOOP_SET_MONTH_GOAL = () => {};

/** =========================
 * Memoized UI blocks
 * ========================= */

type KeywordListItemProps = {
  keyword: string;
  active: boolean;
  onSelect: (keyword: string) => void;
};

const KeywordListItem = memo(function KeywordListItem({
  keyword,
  active,
  onSelect,
}: KeywordListItemProps) {
  const handleClick = useCallback(() => {
    onSelect(keyword);
  }, [onSelect, keyword]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "block w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
        "overflow-hidden text-ellipsis whitespace-nowrap",
        active
          ? "border-orange-700 bg-orange-700 text-white"
          : "border-gray-200 bg-white text-gray-900 hover:border-orange-200 hover:bg-orange-50",
      ].join(" ")}
      title={keyword}
    >
      {keyword}
    </button>
  );
});

type KeywordListPanelProps = {
  keywords: string[];
  selectedKeyword: string | null;
  keywordQuery: string;
  onChangeKeywordQuery: (value: string) => void;
  onSelectKeyword: (keyword: string) => void;
};

const KeywordListPanel = memo(function KeywordListPanel({
  keywords,
  selectedKeyword,
  keywordQuery,
  onChangeKeywordQuery,
  onSelectKeyword,
}: KeywordListPanelProps) {
  const hasQuery = String(keywordQuery ?? "").trim().length > 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChangeKeywordQuery(e.target.value);
    },
    [onChangeKeywordQuery]
  );

  return (
    <aside className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">키워드 리스트</div>
        <div className="min-w-0 truncate text-xs text-gray-500">
          {selectedKeyword ? `선택: ${selectedKeyword}` : "선택 없음"}
        </div>
      </div>

      <div className="mt-3">
        <input
          type="text"
          value={keywordQuery}
          onChange={handleChange}
          placeholder="키워드 검색"
          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
        />
      </div>

      <div className="mt-3 overflow-auto pr-1 lg:max-h-[calc(100vh-17rem)]">
        <div className="flex flex-col gap-2">
          {keywords.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              {hasQuery ? "검색 결과가 없습니다." : "키워드 데이터가 없습니다."}
            </div>
          ) : (
            keywords.map((k) => (
              <KeywordListItem
                key={k}
                keyword={k}
                active={k === selectedKeyword}
                onSelect={onSelectKeyword}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
        <b>메모</b>
        <div className="mt-1">오른쪽은 선택 키워드 기준으로 “요약탭 구성(월3/주5/그래프/소스별)”을 재사용합니다.</div>
      </div>
    </aside>
  );
});

type InsightPanelProps = {
  title: string;
  selectedKeyword: string | null;
  avgRank: number | null;
  bullets: string[];
  actions: string[];
};

const InsightPanel = memo(function InsightPanel({
  title,
  selectedKeyword,
  avgRank,
  bullets,
  actions,
}: InsightPanelProps) {
  return (
    <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <div className="mt-1 truncate text-xs text-gray-500">
            {selectedKeyword ? `키워드: ${selectedKeyword}` : "키워드를 선택하세요"}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs text-gray-500">Avg.rank</div>
          <div className="mt-1 text-lg font-semibold">{avgRank == null ? "-" : avgRank.toFixed(2)}</div>
        </div>
      </div>

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl bg-gray-50 p-4">
        <div className="text-sm font-semibold text-gray-900">
          다음 운영 액션(클릭 · 전환 · ROAS)
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>
    </section>
  );
});

type SummarySectionBlockProps = {
  reportType?: "commerce" | "traffic";
  totals: any;
  byMonth: any;
  byWeekOnly: any;
  byWeekChart: any;
  bySource: any;
  byDay: any;
  currentMonthKey: any;
  currentMonthActual: any;
  currentMonthGoalComputed: any;
  monthGoal: any;
  monthGoalInsight: any;
};

const SummarySectionBlock = memo(function SummarySectionBlock({
  reportType,
  totals,
  byMonth,
  byWeekOnly,
  byWeekChart,
  bySource,
  byDay,
  currentMonthKey,
  currentMonthActual,
  currentMonthGoalComputed,
  monthGoal,
  monthGoalInsight,
}: SummarySectionBlockProps) {
  return (
    <div className="keyword-detail-week-table-fix min-w-0">
      <div className="min-w-0">
        <SummarySection
          reportType={reportType}
          totals={totals as any}
          byMonth={byMonth as any}
          byWeekOnly={byWeekOnly as any}
          byWeekChart={byWeekChart as any}
          bySource={bySource as any}
          byDay={byDay as any}
          currentMonthKey={currentMonthKey}
          currentMonthActual={currentMonthActual}
          currentMonthGoalComputed={currentMonthGoalComputed}
          monthGoal={monthGoal}
          setMonthGoal={NOOP_SET_MONTH_GOAL}
          monthGoalInsight={monthGoalInsight}
        />
      </div>
    </div>
  );
});

/** =========================
 * Component
 * ========================= */

type Props = {
  reportType?: "commerce" | "traffic";
  rows: Row[];
};

export default function KeywordDetailSection(props: Props) {
  const { reportType, rows } = props;
  const isTraffic = reportType === "traffic";

  // ✅ 변경 지점:
  // 키워드별 bucket + 집계 결과 전체를 rows 기준으로 한 번 사전 계산
  const { keywords, keywordLookup, metricsMap } = useMemo(() => buildKeywordMetricsIndex(rows), [rows]);

  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(keywords[0] ?? null);
  const [keywordQuery, setKeywordQuery] = useState<string>("");

  useEffect(() => {
    if (!keywords.length) {
      if (selectedKeyword !== null) setSelectedKeyword(null);
      return;
    }

    if (!selectedKeyword || !keywordLookup.has(selectedKeyword)) {
      setSelectedKeyword(keywords[0]);
    }
  }, [keywords, keywordLookup, selectedKeyword]);

  const handleSelectKeyword = useCallback((keyword: string) => {
    setSelectedKeyword((prev) => (prev === keyword ? prev : keyword));
  }, []);

  const handleChangeKeywordQuery = useCallback((value: string) => {
    setKeywordQuery(value);
  }, []);

  const filteredKeywordList = useMemo(() => {
    const query = normalizeKeywordSearchText(keywordQuery);
    if (!query) return keywords;

    return keywords.filter((keyword) =>
      normalizeKeywordSearchText(keyword).includes(query)
    );
  }, [keywords, keywordQuery]);

  // ✅ 변경 지점:
  // 선택 변경 시 계산이 아니라 사전 계산 결과 조회만 수행
  const selectedMetrics = useMemo(() => {
    if (!selectedKeyword) return null;
    return metricsMap.get(selectedKeyword) ?? null;
  }, [selectedKeyword, metricsMap]);

  const filteredRows = selectedMetrics?.filteredRows ?? rows;
  const avgRank = selectedMetrics?.avgRank ?? null;
  const totals = selectedMetrics?.totals ?? summarize(filteredRows);
  const bySource = selectedMetrics?.bySource ?? groupBySource(filteredRows);
  const byDevice = selectedMetrics?.byDevice ?? groupByDevice(filteredRows);
  const byWeekOnly = selectedMetrics?.byWeekOnly ?? groupByWeekRecent5(filteredRows);
  const byWeekChart =
    selectedMetrics?.byWeekChart ??
    [...byWeekOnly].sort((a, b) => String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? "")));
  const byDay = selectedMetrics?.byDay ?? groupByDayFromRows(filteredRows);
  const byMonth =
    selectedMetrics?.byMonth ??
    groupByMonthRecent3({
      rows: filteredRows,
      selectedMonth: "all",
      selectedDevice: "all",
      selectedChannel: "all",
    });

  const insight = useMemo(
    () =>
      buildKeywordDetailInsight({
        keyword: selectedKeyword,
        allRowsScope: rows,
        keywordRows: filteredRows,
        byWeekOnly,
        bySource,
        byDevice,
        avgRank,
      }),
    [selectedKeyword, rows, filteredRows, byWeekOnly, bySource, byDevice, avgRank]
  );

  const currentMonthGoalComputed =
    selectedMetrics?.currentMonthGoalComputed ??
    ((totals as any)?.currentMonthGoalComputed ?? {
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
    });

  const currentMonthKey = selectedMetrics?.currentMonthKey ?? (totals as any)?.currentMonthKey ?? null;
  const currentMonthActual =
    selectedMetrics?.currentMonthActual ?? (totals as any)?.currentMonthActual ?? totals;
  const monthGoal = selectedMetrics?.monthGoal ?? (totals as any)?.monthGoal ?? null;
  const monthGoalInsight = selectedMetrics?.monthGoalInsight ?? null;

  return (
    <section className="w-full min-w-0">
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <KeywordListPanel
          keywords={filteredKeywordList}
          selectedKeyword={selectedKeyword}
          keywordQuery={keywordQuery}
          onChangeKeywordQuery={handleChangeKeywordQuery}
          onSelectKeyword={handleSelectKeyword}
        />

        <div className="min-w-0 space-y-6">
          <InsightPanel
            title={insight.title}
            selectedKeyword={selectedKeyword}
            avgRank={avgRank}
            bullets={insight.bullets}
            actions={insight.actions}
          />

          <SummarySectionBlock
            reportType={reportType}
            totals={totals}
            byMonth={byMonth}
            byWeekOnly={byWeekOnly}
            byWeekChart={byWeekChart}
            bySource={bySource}
            byDay={byDay}
            currentMonthKey={currentMonthKey}
            currentMonthActual={currentMonthActual}
            currentMonthGoalComputed={currentMonthGoalComputed}
            monthGoal={monthGoal}
            monthGoalInsight={monthGoalInsight}
          />
        </div>
      </div>

      <style jsx global>{`
        .keyword-detail-week-table-fix {
          min-width: 0;
          width: 100%;
        }

        .keyword-detail-week-table-fix > * {
          min-width: 0;
        }

        .keyword-detail-week-table-fix table {
          width: 100%;
          table-layout: fixed;
        }

        .keyword-detail-week-table-fix table th:first-child,
        .keyword-detail-week-table-fix table td:first-child {
          white-space: nowrap !important;
          width: 180px;
          max-width: 180px;
        }

        .keyword-detail-week-table-fix table td:first-child {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        ${isTraffic
          ? `
        .keyword-detail-week-table-fix table {
          min-width: 860px !important;
        }
        `
          : `
        .keyword-detail-week-table-fix table {
          min-width: 1320px !important;
        }
        `}
      `}</style>
    </section>
  );
}
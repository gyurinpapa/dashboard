"use client";

import { useEffect, useMemo, useState } from "react";
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
 * Component
 * ========================= */

type Props = {
  rows: Row[];
};

export default function KeywordDetailSection(props: Props) {
  const { rows } = props;

  const keywords = useMemo(() => extractKeywords(rows), [rows]);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(keywords[0] ?? null);

  useEffect(() => {
    if (!keywords.length) {
      if (selectedKeyword !== null) setSelectedKeyword(null);
      return;
    }

    if (!selectedKeyword || !keywords.includes(selectedKeyword)) {
      setSelectedKeyword(keywords[0]);
    }
  }, [keywords, selectedKeyword]);

  const filteredRows = useMemo(() => filterByKeyword(rows, selectedKeyword), [rows, selectedKeyword]);
  const avgRank = useMemo(() => calcAvgRankWeighted(filteredRows), [filteredRows]);

  const totals = useMemo(() => summarize(filteredRows), [filteredRows]);
  const bySource = useMemo(() => groupBySource(filteredRows), [filteredRows]);
  const byDevice = useMemo(() => groupByDevice(filteredRows), [filteredRows]);
  const byWeekOnly = useMemo(() => groupByWeekRecent5(filteredRows), [filteredRows]);

  const byWeekChart = useMemo(() => {
    const arr = [...byWeekOnly];
    arr.sort((a, b) => String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? "")));
    return arr;
  }, [byWeekOnly]);

  const byMonth = useMemo(
    () =>
      groupByMonthRecent3({
        rows: filteredRows,
        selectedMonth: "all",
        selectedDevice: "all",
        selectedChannel: "all",
      }),
    [filteredRows]
  );

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

  return (
    <section className="w-full min-w-0">
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* LEFT: 키워드 리스트 */}
        <aside className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">키워드 리스트</div>
            <div className="min-w-0 truncate text-xs text-gray-500">
              {selectedKeyword ? `선택: ${selectedKeyword}` : "선택 없음"}
            </div>
          </div>

          <div className="mt-3 overflow-auto pr-1 lg:max-h-[calc(100vh-14rem)]">
            <div className="flex flex-col gap-2">
              {keywords.length === 0 ? (
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">키워드 데이터가 없습니다.</div>
              ) : (
                keywords.map((k) => {
                  const active = k === selectedKeyword;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedKeyword(k)}
                      className={[
                        "block w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                        "overflow-hidden text-ellipsis whitespace-nowrap",
                        active
                          ? "border-orange-700 bg-orange-700 text-white"
                          : "border-gray-200 bg-white text-gray-900 hover:border-orange-200 hover:bg-orange-50",
                      ].join(" ")}
                      title={k}
                    >
                      {k}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            <b>메모</b>
            <div className="mt-1">오른쪽은 선택 키워드 기준으로 “요약탭 구성(월3/주5/그래프/소스별)”을 재사용합니다.</div>
          </div>
        </aside>

        {/* RIGHT */}
        <div className="min-w-0 space-y-6">
          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{insight.title}</h3>
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
              {insight.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">다음 운영 액션(클릭 · 전환 · ROAS)</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {insight.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </section>

          <div className="keyword-detail-week-table-fix min-w-0">
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
                <div className="min-w-0">
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
                </div>
              );
            })()}
          </div>
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
      `}</style>
    </section>
  );
}
"use client";

import { useMemo, useState } from "react";
import type { Row } from "../../../src/lib/report/types";

import SummarySection from "./SummarySection";

import {
  summarize,
  groupBySource,
  groupByDevice,
  groupByWeekRecent5,
  groupByMonthRecent3,
} from "../../../src/lib/report/aggregate";

/** =========================
 * Utils
 * ========================= */
function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function diffPct(a: number, b: number) {
  if (!b) return 0;
  return (a - b) / b;
}

function signPct(n: number) {
  const v = n * 100;
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function safePct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

function safePct0(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(0)}%`;
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
    // ✅ CSV 원본이 rank 라면 normalize 단계에서 avgRank로 매핑되어 있어야 함
    const rank = Number((r as any).avgRank);
    if (!Number.isFinite(rank)) continue;

    const imp = safeNum((r as any).impressions);
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
  allRowsScope: Row[]; // (현재 상위 필터 적용된) 탭 범위 전체 rows
  keywordRows: Row[]; // 선택 키워드 rows
  byWeekOnly: any[]; // 최근5주 (키워드 기준)
  bySource: any[]; // 소스별 (키워드 기준)
  byDevice: any[]; // 기기별 (키워드 기준)
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

  // 기여도(탭 범위 대비)
  const shareCost = all.cost ? me.cost / all.cost : 0;
  const shareRev = all.revenue ? me.revenue / all.revenue : 0;
  const shareConv = all.conversions ? me.conversions / all.conversions : 0;

  // 최근 5주 추세: 최신주 vs 직전주 (weekKey 기준 정렬)
  const weeks = [...(byWeekOnly || [])].sort((a, b) =>
    String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
  );
  const wLast = weeks.length ? weeks[weeks.length - 1] : null;
  const wPrev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;

  const roasWoW = wLast && wPrev ? diffPct(safeNum(wLast.roas), safeNum(wPrev.roas)) : 0;
  const clickWoW = wLast && wPrev ? diffPct(safeNum(wLast.clicks), safeNum(wPrev.clicks)) : 0;
  const convWoW = wLast && wPrev ? diffPct(safeNum(wLast.conversions), safeNum(wPrev.conversions)) : 0;
  const costWoW = wLast && wPrev ? diffPct(safeNum(wLast.cost), safeNum(wPrev.cost)) : 0;

  // 소스별: 비용 상위 1~2개
  const sources = [...(bySource || [])].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  const topS1 = sources[0] ?? null;
  const topS2 = sources[1] ?? null;

  // 기기별: 비용 상위 1~2개
  const devices = [...(byDevice || [])].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  const topD1 = devices[0] ?? null;
  const topD2 = devices[1] ?? null;

  // 평가 라벨(간단 규칙)
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
    `선택 키워드 “${keyword}” 성과: 클릭 ${Math.round(me.clicks)} / 전환 ${safeNum(me.conversions).toFixed(
      1
    )} / ROAS ${safePct0(me.roas)} · ${efficiencyLabel}`
  );
  bullets.push(`기여도(현재 탭 범위 대비): 비용 ${safePct(shareCost)}, 전환 ${safePct(shareConv)}, 매출 ${safePct(shareRev)}`);
  bullets.push(trendLabel);

  if (avgRank != null) {
    bullets.push(`평균노출순위(Avg.rank): ${avgRank.toFixed(2)} (낮을수록 상단 노출)`);
  } else {
    bullets.push("평균노출순위(Avg.rank): 데이터 없음");
  }

  // 기기 근거 문장
  if (topD1) {
    const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
    const d1Roas = safeNum(topD1.roas);
    const d1Cvr = safeNum(topD1.cvr);
    const d1Ctr = safeNum(topD1.ctr);

    let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(ROAS ${safePct0(d1Roas)}, CTR ${safePct(d1Ctr)}, CVR ${safePct(d1Cvr)}).`;

    if (topD2) {
      const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
      const d2Roas = safeNum(topD2.roas);
      deviceLine += ` 비교: “${d2}” ROAS ${safePct0(d2Roas)}.`;
    }

    bullets.push(deviceLine);
  } else {
    bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
  }

  // 액션 추천(클릭/전환/ROAS + 기기 기반)
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
    const s1 = `소스: 비용 상위 “${String(topS1.source)}”(ROAS ${safePct0(safeNum(topS1.roas))}).`;
    if (safeNum(topS1.roas) >= me.roas) {
      actions.push(`${s1} 효율이 평균 이상이면, 동일 소스 내 세분화(기기/시간대) 후 증액이 안전합니다.`);
    } else {
      actions.push(`${s1} 효율이 평균 미만이면, 저효율 구간을 먼저 차단하고 예산을 분산하세요.`);
    }
  }
  if (topS2) {
    actions.push(
      `소스 비교: 2순위 “${String(topS2.source)}”(ROAS ${safePct0(
        safeNum(topS2.roas)
      )})와 함께 증액/유지/축소 기준을 명확히 하세요.`
    );
  }

  if (topD1 && topD2) {
    const d1 = String(topD1.device ?? "unknown");
    const d2 = String(topD2.device ?? "unknown");
    const d1Roas = safeNum(topD1.roas);
    const d2Roas = safeNum(topD2.roas);

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
  /** page.tsx에서 넘어오는 현재 필터(월/주차/기기/채널) 적용된 rows */
  rows: Row[];
};

export default function KeywordDetailSection(props: Props) {
  const { rows } = props;

  const keywords = useMemo(() => extractKeywords(rows), [rows]);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(keywords[0] ?? null);

  // ✅ 선택 키워드 rows
  const filteredRows = useMemo(() => filterByKeyword(rows, selectedKeyword), [rows, selectedKeyword]);

  // ✅ 키워드 상세 탭 전용 Avg.rank
  const avgRank = useMemo(() => calcAvgRankWeighted(filteredRows), [filteredRows]);

  // ✅ 선택 키워드 기준 집계
  const totals = useMemo(() => summarize(filteredRows), [filteredRows]);
  const bySource = useMemo(() => groupBySource(filteredRows), [filteredRows]);
  const byDevice = useMemo(() => groupByDevice(filteredRows), [filteredRows]);

  const byWeekOnly = useMemo(() => groupByWeekRecent5(filteredRows), [filteredRows]);

  // ✅ 그래프는 과거 → 최신(오른쪽이 최신)으로 정렬
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

  // ✅ 인사이트 생성(기기 근거 포함)
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
    <section className="w-full">
      <h2 className="text-xl font-semibold">키워드 상세</h2>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_1fr]">
        {/* LEFT: 키워드 리스트 */}
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col sticky top-24 max-h-[calc(100vh-6rem)]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">키워드 리스트</div>
            <div className="text-xs text-gray-500">{selectedKeyword ? `선택: ${selectedKeyword}` : "선택 없음"}</div>
          </div>

          <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1">
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
                        "w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                        active
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-gray-900 border-gray-200 hover:bg-orange-50 hover:border-orange-200",
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
        <div className="space-y-6">
          {/* ✅ 상단: 선택 키워드 요약 인사이트(기기 근거 포함) */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">{insight.title}</h3>
                <div className="mt-1 text-xs text-gray-500">
                  {selectedKeyword ? `키워드: ${selectedKeyword}` : "키워드를 선택하세요"}
                </div>
              </div>

              {/* Avg.rank 강조 */}
              <div className="text-right">
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

          {/* ✅ A안 적용: 키워드 상세 탭에서만 Week 첫 컬럼 줄바꿈 금지 */}
          <div className="keyword-detail-week-table-fix">
            {/* ✅ Summary */}
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
          </div>
        </div>
      </div>

      {/* ✅ A안: 키워드 상세 탭에서만 적용되는 전용 CSS */}
      <style jsx global>{`
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

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

/** =========================
 * Utils (안전 방어)
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

function getCreativeKey(r: Row) {
  const anyR = r as any;
  return (
    anyR.creativeName ||
    anyR.creative ||
    anyR.adCreative ||
    anyR.material ||
    anyR.asset ||
    anyR.adName ||
    anyR.creativeId ||
    anyR.adId ||
    ""
  )
    .toString()
    .trim();
}

/** ✅ 선택 소재 이미지 URL 추출 */
function getCreativePreviewUrl(r: Row) {
  const anyR = r as any;
  return (
    anyR.imagePath ||
    anyR.creativeImageUrl ||
    anyR.thumbnailUrl ||
    anyR.thumbUrl ||
    anyR.imageUrl ||
    anyR.previewUrl ||
    anyR.assetUrl ||
    ""
  )
    .toString()
    .trim();
}

function extractCreatives(rows: Row[]) {
  const set = new Set<string>();
  for (const r of rows) {
    const k = getCreativeKey(r);
    if (k) set.add(k);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}

function filterByCreative(rows: Row[], creative: string | null) {
  if (!creative) return rows;
  return rows.filter((r) => getCreativeKey(r) === creative);
}

/** ✅ 절대 안 터지는 safe wrappers */
function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.error(e);
    return fallback;
  }
}

/** =========================
 * Badge helpers (TOP3)
 * ========================= */
type BadgeKey = "ctr" | "conversions" | "roas";

const BADGE_META: Record<
  BadgeKey,
  { label: string; className: string }
> = {
  ctr: { label: "TOP CTR", className: "bg-blue-600 text-white" },
  conversions: { label: "TOP 전환", className: "bg-orange-600 text-white" },
  roas: { label: "TOP ROAS", className: "bg-emerald-600 text-white" },
};

function BadgePill({ k }: { k: BadgeKey }) {
  const meta = BADGE_META[k];
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.className,
      ].join(" ")}
      title={meta.label}
    >
      🥇 {meta.label}
    </span>
  );
}

/** =========================
 * Insight
 * ========================= */
function buildCreativeDetailInsight(args: {
  creative: string | null;
  allRowsScope: Row[];
  creativeRows: Row[];
  byWeekOnly: any[];
  bySource: any[];
  byDevice: any[];
}) {
  const { creative, allRowsScope, creativeRows, byWeekOnly, bySource, byDevice } =
    args;

  if (!creative) {
    return {
      title: "선택 소재 요약 인사이트",
      bullets: [
        "소재를 선택하면 해당 소재의 실적/기여도/추세/기기 근거 기반 인사이트가 표시됩니다.",
      ],
      actions: [],
    };
  }

  const all = safeCall(() => summarize(allRowsScope as any), {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
    ctr: 0,
    cpc: 0,
    cvr: 0,
    cpa: 0,
    roas: 0,
  } as any);

  const me = safeCall(() => summarize(creativeRows as any), {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
    ctr: 0,
    cpc: 0,
    cvr: 0,
    cpa: 0,
    roas: 0,
  } as any);

  const shareCost = all.cost ? safeNum(me.cost) / safeNum(all.cost) : 0;
  const shareRev = all.revenue ? safeNum(me.revenue) / safeNum(all.revenue) : 0;
  const shareConv = all.conversions
    ? safeNum(me.conversions) / safeNum(all.conversions)
    : 0;

  const weeks = [...(byWeekOnly || [])].sort((a, b) =>
    String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
  );
  const wLast = weeks.length ? weeks[weeks.length - 1] : null;
  const wPrev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;

  const roasWoW =
    wLast && wPrev ? diffPct(safeNum(wLast.roas), safeNum(wPrev.roas)) : 0;
  const clickWoW =
    wLast && wPrev
      ? diffPct(safeNum(wLast.clicks), safeNum(wPrev.clicks))
      : 0;
  const convWoW =
    wLast && wPrev
      ? diffPct(safeNum(wLast.conversions), safeNum(wPrev.conversions))
      : 0;
  const costWoW =
    wLast && wPrev ? diffPct(safeNum(wLast.cost), safeNum(wPrev.cost)) : 0;

  const sources = [...(bySource || [])].sort(
    (a, b) => safeNum(b.cost) - safeNum(a.cost)
  );
  const topS1 = sources[0] ?? null;
  const topS2 = sources[1] ?? null;

  const devices = [...(byDevice || [])].sort(
    (a, b) => safeNum(b.cost) - safeNum(a.cost)
  );
  const topD1 = devices[0] ?? null;
  const topD2 = devices[1] ?? null;

  const efficiencyLabel =
    safeNum(me.roas) >= 1.0
      ? "ROAS가 100% 이상으로 효율이 양호"
      : safeNum(me.roas) >= 0.7
      ? "ROAS가 70~100% 구간으로 개선 여지"
      : "ROAS가 70% 미만으로 효율 개선이 우선";

  const trendLabel =
    wLast && wPrev
      ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(
          convWoW
        )}, ROAS ${signPct(roasWoW)} (비용 ${signPct(costWoW)})`
      : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

  const bullets: string[] = [];
  bullets.push(
    `선택 소재 “${creative}” 성과: 클릭 ${Math.round(
      safeNum(me.clicks)
    )} / 전환 ${safeNum(me.conversions).toFixed(1)} / ROAS ${safePct0(
      safeNum(me.roas)
    )} · ${efficiencyLabel}`
  );
  bullets.push(
    `기여도(현재 탭 범위 대비): 비용 ${safePct(
      shareCost
    )}, 전환 ${safePct(shareConv)}, 매출 ${safePct(shareRev)}`
  );
  bullets.push(trendLabel);

  if (topD1) {
    const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
    let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(ROAS ${safePct0(
      safeNum(topD1.roas)
    )}).`;
    if (topD2) {
      const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
      deviceLine += ` 비교: “${d2}” ROAS ${safePct0(safeNum(topD2.roas))}.`;
    }
    bullets.push(deviceLine);
  } else {
    bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
  }

  const actions: string[] = [];

  if (safeNum(me.ctr) < 0.02 && safeNum(me.impressions) > 0) {
    actions.push(
      "클릭 개선: CTR이 낮습니다. 썸네일/첫 프레임/헤드라인/CTA 훅을 2~3종으로 분리 테스트하고, 저반응 소재는 빠르게 교체하세요."
    );
  } else {
    actions.push(
      "클릭 확장: CTR이 극단적으로 낮지 않습니다. 성과 좋은 훅/메시지를 다른 포맷(이미지/영상/캐러셀)로 확장하여 노출을 늘려보세요."
    );
  }

  if (safeNum(me.cvr) < 0.01 && safeNum(me.clicks) >= 30) {
    actions.push(
      "전환 개선: CVR이 낮습니다. 랜딩 첫 화면(USP+신뢰+CTA) 간소화, 폼 필드 축소, 상담/전화 CTA 가시성 개선을 우선 적용하세요."
    );
  } else {
    actions.push(
      "전환 유지/확대: CVR이 급격히 낮지 않습니다. 전환 상위 구간(기기/요일/소스)을 찾아 그 구간 중심으로 예산을 이동하세요."
    );
  }

  if (topS1) {
    actions.push(
      `소스 기준: 비용 상위 “${String(topS1.source)}”(ROAS ${safePct0(
        safeNum(topS1.roas)
      )})를 중심으로 예산/세팅 최적화를 우선하세요.`
    );
  }
  if (topS2) {
    actions.push(
      `소스 비교: 2순위 “${String(topS2.source)}”(ROAS ${safePct0(
        safeNum(topS2.roas)
      )})와 함께 유지/축소 기준을 명확히 하세요.`
    );
  }

  return { title: "선택 소재 요약 인사이트", bullets, actions };
}

/** =========================
 * Component
 * ========================= */
type Props = {
  rows: Row[];
};

type CreativePerf = {
  creative: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  ctr: number;
  roas: number;
};

export default function CreativeDetailSection({ rows }: Props) {
  const creatives = useMemo(() => extractCreatives(rows), [rows]);
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);

  // ✅ creatives가 생기면 자동으로 첫 항목 선택
  useEffect(() => {
    if (!selectedCreative && creatives.length > 0) {
      setSelectedCreative(creatives[0]);
    }
  }, [creatives, selectedCreative]);

  /** =========================
   * ✅ Performance aggregation (전체 rows 기준)
   * ========================= */
  const perfList: CreativePerf[] = useMemo(() => {
    const map = new Map<string, CreativePerf>();

    for (const r of rows ?? []) {
      const k = getCreativeKey(r);
      if (!k) continue;

      const anyR = r as any;
      const impr = safeNum(anyR.impressions ?? anyR.impr ?? anyR.imp ?? 0);
      const clk = safeNum(anyR.clicks ?? anyR.clk ?? 0);
      const cost = safeNum(anyR.cost ?? 0);
      const conv = safeNum(anyR.conversions ?? anyR.conv ?? 0);
      const rev = safeNum(anyR.revenue ?? 0);

      const prev = map.get(k) ?? {
        creative: k,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        roas: 0,
      };

      prev.impressions += impr;
      prev.clicks += clk;
      prev.cost += cost;
      prev.conversions += conv;
      prev.revenue += rev;

      map.set(k, prev);
    }

    const arr = Array.from(map.values()).map((x) => {
      const ctr = x.impressions > 0 ? x.clicks / x.impressions : 0;
      const roas = x.cost > 0 ? x.revenue / x.cost : 0;
      return { ...x, ctr, roas };
    });

    return arr;
  }, [rows]);

  // ✅ badgeMap: creative -> BadgeKey[]
  const badgeMap = useMemo(() => {
    const map = new Map<string, BadgeKey[]>();

    const top3 = (key: BadgeKey) => {
      const sorted = [...perfList].sort((a, b) => {
        const av = safeNum((a as any)[key]);
        const bv = safeNum((b as any)[key]);
        return bv - av;
      });

      const picked = sorted.filter((x) => safeNum((x as any)[key]) > 0).slice(0, 3);

      for (const it of picked) {
        const prev = map.get(it.creative) ?? [];
        if (!prev.includes(key)) prev.push(key);
        map.set(it.creative, prev);
      }
    };

    top3("ctr");
    top3("conversions");
    top3("roas");

    return map;
  }, [perfList]);

  const selectedBadges = useMemo(() => {
    if (!selectedCreative) return [] as BadgeKey[];
    return badgeMap.get(selectedCreative) ?? [];
  }, [badgeMap, selectedCreative]);

  const filteredRows = useMemo(
    () => filterByCreative(rows, selectedCreative),
    [rows, selectedCreative]
  );

  /** ✅ 최상단 프리뷰용 URL (선택 소재 이미지) */
  const selectedPreviewUrl = useMemo(() => {
    if (!selectedCreative) return "";
    const sampleRow = rows.find((r) => getCreativeKey(r) === selectedCreative);
    if (!sampleRow) return "";
    return getCreativePreviewUrl(sampleRow);
  }, [rows, selectedCreative]);

  // ✅ "리스트 순서대로" 5개 썸네일
  const sideThumbs = useMemo(() => {
    if (!creatives.length) return [] as { creative: string; url: string }[];

    const idx = selectedCreative ? creatives.indexOf(selectedCreative) : -1;
    const start = idx >= 0 ? idx + 1 : 0;

    const picked: string[] = [];
    for (let i = start; i < creatives.length && picked.length < 5; i++) {
      picked.push(creatives[i]);
    }

    for (let i = 0; i < creatives.length && picked.length < 5; i++) {
      const k = creatives[i];
      if (k === selectedCreative) continue;
      if (picked.includes(k)) continue;
      picked.push(k);
    }

    return picked
      .map((k) => {
        const row = rows.find((r) => getCreativeKey(r) === k);
        const url = row ? getCreativePreviewUrl(row) : "";
        return { creative: k, url };
      })
      .filter((x) => x.url);
  }, [creatives, selectedCreative, rows]);

  const totals = useMemo(
    () =>
      safeCall(() => summarize(filteredRows as any), {
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
        cpc: 0,
        cvr: 0,
        cpa: 0,
        roas: 0,
      } as any),
    [filteredRows]
  );

  const bySource = useMemo(
    () => safeCall(() => groupBySource(filteredRows as any), [] as any[]),
    [filteredRows]
  );
  const byDevice = useMemo(
    () => safeCall(() => groupByDevice(filteredRows as any), [] as any[]),
    [filteredRows]
  );
  const byWeekOnly = useMemo(
    () => safeCall(() => groupByWeekRecent5(filteredRows as any), [] as any[]),
    [filteredRows]
  );

  const byWeekChart = useMemo(() => {
    const arr = [...(byWeekOnly || [])];
    arr.sort((a, b) => String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? "")));
    return arr;
  }, [byWeekOnly]);

  const byMonth = useMemo(
    () =>
      safeCall(
        () =>
          groupByMonthRecent3({
            rows: filteredRows as any,
            selectedMonth: "all",
            selectedDevice: "all",
            selectedChannel: "all",
          }),
        [] as any[]
      ),
    [filteredRows]
  );

  const insight = useMemo(
    () =>
      buildCreativeDetailInsight({
        creative: selectedCreative,
        allRowsScope: rows,
        creativeRows: filteredRows,
        byWeekOnly,
        bySource,
        byDevice,
      }),
    [selectedCreative, rows, filteredRows, byWeekOnly, bySource, byDevice]
  );

  return (
    <section className="w-full min-w-0">
      <h2 className="text-xl font-semibold">소재 상세</h2>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* LEFT: 소재 리스트 */}
        <aside className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">소재 리스트</div>
            <div className="min-w-0 truncate text-xs text-gray-500">
              {selectedCreative ? `선택: ${selectedCreative}` : "선택 없음"}
            </div>
          </div>

          <div className="mt-3 lg:max-h-[calc(100vh-14rem)] overflow-auto pr-1">
            <div className="flex flex-col gap-2">
              {creatives.length === 0 ? (
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                  소재 데이터가 없습니다. (소재 컬럼 매핑 필요)
                </div>
              ) : (
                creatives.map((k) => {
                  const active = k === selectedCreative;
                  const badges = badgeMap.get(k) ?? [];

                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedCreative(k)}
                      className={[
                        "block w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                        "overflow-hidden text-ellipsis whitespace-nowrap",
                        active
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-gray-900 border-gray-200 hover:bg-orange-50 hover:border-orange-200",
                      ].join(" ")}
                      title={k}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">{k}</span>

                        {badges.length > 0 && (
                          <span className="flex shrink-0 gap-1">
                            {badges.slice(0, 2).map((b) => (
                              <span
                                key={b}
                                className={[
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                                  active ? "bg-white/20 text-white" : BADGE_META[b].className,
                                ].join(" ")}
                              >
                                {active
                                  ? `TOP ${
                                      b === "ctr" ? "CTR" : b === "roas" ? "ROAS" : "전환"
                                    }`
                                  : BADGE_META[b].label}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            <b>메모</b>
            <div className="mt-1">
              오른쪽은 선택 소재 기준으로 SummarySection(월3/주5/그래프/소스별)을 재사용합니다.
            </div>
          </div>
        </aside>

        {/* RIGHT */}
        <div className="min-w-0 space-y-6">
          {/* 선택 소재 카드 */}
          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-2">
                <div className="font-semibold">선택 소재</div>

                {selectedBadges.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedBadges.map((b) => (
                      <BadgePill key={b} k={b} />
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-0 truncate text-xs text-gray-500">
                {selectedCreative ? `선택: ${selectedCreative}` : "선택 없음"}
              </div>
            </div>

            {!selectedCreative ? (
              <div className="mt-3 text-sm text-gray-500">
                차트/표에서 소재를 클릭하면 이미지가 표시됩니다.
              </div>
            ) : (
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                {/* LEFT: 메인 프리뷰 */}
                <div className="min-w-0 rounded-2xl bg-white h-[420px] flex items-center justify-center overflow-hidden">
                  {selectedPreviewUrl ? (
                    <img
                      src={selectedPreviewUrl}
                      alt={selectedCreative}
                      className="max-w-[680px] max-h-[420px] object-contain rounded-xl"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-sm text-gray-500 p-4">
                      imagePath(또는 썸네일 URL) 데이터가 없어 이미지를 표시할 수 없습니다.
                    </div>
                  )}
                </div>

                {/* RIGHT: 다음 소재 미리보기 */}
                <div className="min-w-0 flex flex-col gap-3">
                  <div className="text-xs font-semibold text-gray-600">다음 소재 미리보기</div>

                  {sideThumbs.length === 0 ? (
                    <div className="rounded-xl border bg-gray-50 p-4 text-xs text-gray-600">
                      표시할 썸네일이 없습니다. (thumbnail/imagePath 매핑 확인)
                    </div>
                  ) : (
                    sideThumbs.map((t) => {
                      const badges = badgeMap.get(t.creative) ?? [];
                      return (
                        <button
                          key={t.creative}
                          type="button"
                          onClick={() => setSelectedCreative(t.creative)}
                          className="w-full rounded-xl border bg-white p-2 text-left transition hover:border-orange-300 hover:bg-orange-50"
                          title={t.creative}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative w-[92px] h-[64px] rounded-lg overflow-hidden border bg-white flex items-center justify-center">
                              <img
                                src={t.url}
                                alt={t.creative}
                                className="w-full h-full object-cover grayscale opacity-80 transition hover:grayscale-0 hover:opacity-100"
                                loading="lazy"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-gray-900 leading-4 break-words line-clamp-2">
                                {t.creative}
                              </div>

                              {badges.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {badges.slice(0, 3).map((b) => (
                                    <span
                                      key={b}
                                      className={[
                                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                        BADGE_META[b].className,
                                      ].join(" ")}
                                    >
                                      {BADGE_META[b].label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 인사이트 */}
          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{insight.title}</h3>
                <div className="mt-1 truncate text-xs text-gray-500">
                  {selectedCreative ? `소재: ${selectedCreative}` : "소재를 선택하세요"}
                </div>
              </div>
            </div>

            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {insight.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>

            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">
                다음 운영 액션(클릭 · 전환 · ROAS)
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {insight.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Summary */}
          <div className="creative-detail-week-table-fix min-w-0">
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
        .creative-detail-week-table-fix {
          min-width: 0;
          width: 100%;
        }

        .creative-detail-week-table-fix > * {
          min-width: 0;
        }

        .creative-detail-week-table-fix table {
          width: 100%;
          table-layout: fixed;
        }

        .creative-detail-week-table-fix table th:first-child,
        .creative-detail-week-table-fix table td:first-child {
          white-space: nowrap !important;
          width: 180px;
          max-width: 180px;
        }

        .creative-detail-week-table-fix table td:first-child {
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </section>
  );
}
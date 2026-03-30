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
 * Utils (안전 방어)
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

const BADGE_META: Record<BadgeKey, { label: string; className: string }> = {
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
  reportType?: "commerce" | "traffic";
  creative: string | null;
  allRowsScope: Row[];
  creativeRows: Row[];
  byWeekOnly: any[];
  bySource: any[];
  byDevice: any[];
}) {
  const { reportType, creative, allRowsScope, creativeRows, byWeekOnly, bySource, byDevice } =
    args;

  const isTraffic = reportType === "traffic";

  if (!creative) {
    return {
      title: "선택 소재 요약 인사이트",
      bullets: [
        "소재를 선택하면 해당 소재의 실적/기여도/추세/기기 근거 기반 인사이트가 표시됩니다.",
      ],
      actions: [],
    };
  }

  const all = safeCall(
    () => summarize(allRowsScope as any),
    {
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
    } as any
  );

  const me = safeCall(
    () => summarize(creativeRows as any),
    {
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
    } as any
  );

  const shareCost = all.cost ? toSafeNumber(me.cost) / toSafeNumber(all.cost) : 0;
  const shareRev = all.revenue ? toSafeNumber(me.revenue) / toSafeNumber(all.revenue) : 0;
  const shareConv = all.conversions
    ? toSafeNumber(me.conversions) / toSafeNumber(all.conversions)
    : 0;
  const shareClick = all.clicks ? toSafeNumber(me.clicks) / toSafeNumber(all.clicks) : 0;
  const shareImpr = all.impressions
    ? toSafeNumber(me.impressions) / toSafeNumber(all.impressions)
    : 0;

  const weeks = [...(byWeekOnly || [])].sort((a, b) =>
    String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
  );
  const wLast = weeks.length ? weeks[weeks.length - 1] : null;
  const wPrev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;

  const roasWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.roas), toSafeNumber(wPrev.roas)) ?? 0
      : 0;
  const clickWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.clicks), toSafeNumber(wPrev.clicks)) ?? 0
      : 0;
  const convWoW =
    wLast && wPrev
      ? diffRatio(
          toSafeNumber(wLast.conversions),
          toSafeNumber(wPrev.conversions)
        ) ?? 0
      : 0;
  const costWoW =
    wLast && wPrev
      ? diffRatio(toSafeNumber(wLast.cost), toSafeNumber(wPrev.cost)) ?? 0
      : 0;

  const sources = [...(bySource || [])].sort(
    (a, b) => toSafeNumber(b.cost) - toSafeNumber(a.cost)
  );
  const topS1 = sources[0] ?? null;
  const topS2 = sources[1] ?? null;

  const devices = [...(byDevice || [])].sort(
    (a, b) => toSafeNumber(b.cost) - toSafeNumber(a.cost)
  );
  const topD1 = devices[0] ?? null;
  const topD2 = devices[1] ?? null;

  const bullets: string[] = [];

  if (isTraffic) {
    const efficiencyLabel =
      toSafeNumber(me.ctr) >= 0.02
        ? "CTR이 2% 이상으로 반응성이 양호"
        : toSafeNumber(me.ctr) >= 0.01
        ? "CTR이 1~2% 구간으로 개선 여지"
        : "CTR이 1% 미만으로 클릭 반응 개선이 우선";

    const trendLabel =
      wLast && wPrev
        ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 광고비 ${signPct(costWoW)}`
        : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

    bullets.push(
      `선택 소재 “${creative}” 성과: 노출 ${Math.round(toSafeNumber(me.impressions))} / 클릭 ${Math.round(
        toSafeNumber(me.clicks)
      )} / CTR ${safePct(toSafeNumber(me.ctr))} · ${efficiencyLabel}`
    );
    bullets.push(
      `기여도(현재 탭 범위 대비): 노출 ${safePct(shareImpr)}, 클릭 ${safePct(shareClick)}, 비용 ${safePct(
        shareCost
      )}`
    );
    bullets.push(trendLabel);

    if (topD1) {
      const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
      const d1Ctr = toSafeNumber(topD1.ctr);
      let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(CTR ${safePct(d1Ctr)}).`;

      if (topD2) {
        const d2 = pickDeviceLabel(String(topD2.device ?? "unknown"));
        const d2Ctr = toSafeNumber(topD2.ctr);
        deviceLine += ` 비교: “${d2}” CTR ${safePct(d2Ctr)}.`;
      }

      bullets.push(deviceLine);
    } else {
      bullets.push("기기별: 데이터가 부족하여 비교가 제한적입니다.");
    }

    const actions: string[] = [];

    if (toSafeNumber(me.ctr) < 0.02 && toSafeNumber(me.impressions) > 0) {
      actions.push(
        "클릭 개선: CTR이 낮습니다. 썸네일/첫 프레임/헤드라인/CTA 훅을 2~3종으로 분리 테스트하고, 저반응 소재는 빠르게 교체하세요."
      );
    } else {
      actions.push(
        "클릭 확장: CTR이 극단적으로 낮지 않습니다. 성과 좋은 훅/메시지를 다른 포맷(이미지/영상/캐러셀)로 확장하여 노출을 늘려보세요."
      );
    }

    if (topS1) {
      actions.push(
        `소스 기준: 비용 상위 “${String(topS1.source)}”(CTR ${safePct(
          toSafeNumber(topS1.ctr)
        )})를 중심으로 예산/세팅 최적화를 우선하세요.`
      );
    }

    if (topS2) {
      actions.push(
        `소스 비교: 2순위 “${String(topS2.source)}”(CTR ${safePct(
          toSafeNumber(topS2.ctr)
        )})와 함께 유지/축소 기준을 명확히 하세요.`
      );
    }

    return { title: "선택 소재 요약 인사이트", bullets, actions };
  }

  const efficiencyLabel =
    toSafeNumber(me.roas) >= 1.0
      ? "ROAS가 100% 이상으로 효율이 양호"
      : toSafeNumber(me.roas) >= 0.7
      ? "ROAS가 70~100% 구간으로 개선 여지"
      : "ROAS가 70% 미만으로 효율 개선이 우선";

  const trendLabel =
    wLast && wPrev
      ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(convWoW)}, ROAS ${signPct(
          roasWoW
        )} (비용 ${signPct(costWoW)})`
      : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

  bullets.push(
    `선택 소재 “${creative}” 성과: 클릭 ${Math.round(toSafeNumber(me.clicks))} / 전환 ${toSafeNumber(
      me.conversions
    ).toFixed(1)} / ROAS ${safeRoasPct0(toSafeNumber(me.roas))} · ${efficiencyLabel}`
  );
  bullets.push(
    `기여도(현재 탭 범위 대비): 비용 ${safePct(shareCost)}, 전환 ${safePct(
      shareConv
    )}, 매출 ${safePct(shareRev)}`
  );
  bullets.push(trendLabel);

  if (topD1) {
    const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
    const d1Roas = toSafeNumber(topD1.roas);
    const d1Cvr = toSafeNumber(topD1.cvr);
    const d1Ctr = toSafeNumber(topD1.ctr);

    let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(ROAS ${safeRoasPct0(
      d1Roas
    )}, CTR ${safePct(d1Ctr)}, CVR ${safePct(d1Cvr)}).`;

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

  if (toSafeNumber(me.ctr) < 0.02 && toSafeNumber(me.impressions) > 0) {
    actions.push(
      "클릭 개선: CTR이 낮습니다. 썸네일/첫 프레임/헤드라인/CTA 훅을 2~3종으로 분리 테스트하고, 저반응 소재는 빠르게 교체하세요."
    );
  } else {
    actions.push(
      "클릭 확장: CTR이 극단적으로 낮지 않습니다. 성과 좋은 훅/메시지를 다른 포맷(이미지/영상/캐러셀)로 확장하여 노출을 늘려보세요."
    );
  }

  if (toSafeNumber(me.cvr) < 0.01 && toSafeNumber(me.clicks) >= 30) {
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
      `소스 기준: 비용 상위 “${String(topS1.source)}”(ROAS ${safeRoasPct0(
        toSafeNumber(topS1.roas)
      )})를 중심으로 예산/세팅 최적화를 우선하세요.`
    );
  }
  if (topS2) {
    actions.push(
      `소스 비교: 2순위 “${String(topS2.source)}”(ROAS ${safeRoasPct0(
        toSafeNumber(topS2.roas)
      )})와 함께 유지/축소 기준을 명확히 하세요.`
    );
  }

  return { title: "선택 소재 요약 인사이트", bullets, actions };
}

/** =========================
 * Component
 * ========================= */
type Props = {
  reportType?: "commerce" | "traffic";
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

export default function CreativeDetailSection({ reportType, rows }: Props) {
  const isTraffic = reportType === "traffic";

  const creatives = useMemo(() => extractCreatives(rows), [rows]);
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCreative && creatives.length > 0) {
      setSelectedCreative(creatives[0]);
      return;
    }

    if (selectedCreative && !creatives.includes(selectedCreative)) {
      setSelectedCreative(creatives[0] ?? null);
    }
  }, [creatives, selectedCreative]);

  /** =========================
   * ✅ Performance aggregation
   * ========================= */
  const perfList: CreativePerf[] = useMemo(() => {
    const map = new Map<string, CreativePerf>();

    for (const r of rows ?? []) {
      const k = getCreativeKey(r);
      if (!k) continue;

      const anyR = r as any;
      const impr = toSafeNumber(anyR.impressions ?? anyR.impr ?? anyR.imp ?? 0);
      const clk = toSafeNumber(anyR.clicks ?? anyR.clk ?? anyR.click ?? 0);
      const cost = toSafeNumber(anyR.cost ?? 0);
      const conv = toSafeNumber(anyR.conversions ?? anyR.conv ?? 0);
      const rev = toSafeNumber(anyR.revenue ?? 0);

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

  const badgeMap = useMemo(() => {
    const map = new Map<string, BadgeKey[]>();

    const top3 = (key: BadgeKey) => {
      const sorted = [...perfList].sort((a, b) => {
        const av = toSafeNumber((a as any)[key]);
        const bv = toSafeNumber((b as any)[key]);
        return bv - av;
      });

      const picked = sorted
        .filter((x) => toSafeNumber((x as any)[key]) > 0)
        .slice(0, 3);

      for (const it of picked) {
        const prev = map.get(it.creative) ?? [];
        if (!prev.includes(key)) prev.push(key);
        map.set(it.creative, prev);
      }
    };

    top3("ctr");
    if (!isTraffic) {
      top3("conversions");
      top3("roas");
    }

    return map;
  }, [perfList, isTraffic]);

  const selectedBadges = useMemo(() => {
    if (!selectedCreative) return [] as BadgeKey[];
    return badgeMap.get(selectedCreative) ?? [];
  }, [badgeMap, selectedCreative]);

  const filteredRows = useMemo(
    () => filterByCreative(rows, selectedCreative),
    [rows, selectedCreative]
  );

  const selectedPreviewUrl = useMemo(() => {
    if (!selectedCreative) return "";
    const sampleRow = rows.find((r) => getCreativeKey(r) === selectedCreative);
    if (!sampleRow) return "";
    return getCreativePreviewUrl(sampleRow);
  }, [rows, selectedCreative]);

  const sideThumbs = useMemo(() => {
    if (!creatives.length) return [] as { creative: string; url: string }[];

    const idx = selectedCreative ? creatives.indexOf(selectedCreative) : -1;
    const start = idx >= 0 ? idx + 1 : 0;

    const rotated = [
      ...creatives.slice(start),
      ...creatives.slice(0, start),
    ].filter((c) => c !== selectedCreative);

    const out: { creative: string; url: string }[] = [];
    for (const creative of rotated) {
      const sample = rows.find((r) => getCreativeKey(r) === creative);
      const url = sample ? getCreativePreviewUrl(sample) : "";
      if (url) out.push({ creative, url });
      if (out.length >= 4) break;
    }
    return out;
  }, [creatives, rows, selectedCreative]);

  const totals = useMemo(
    () =>
      safeCall(
        () => summarize(filteredRows as any),
        {
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
        } as any
      ),
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
        reportType,
        creative: selectedCreative,
        allRowsScope: rows,
        creativeRows: filteredRows,
        byWeekOnly,
        bySource,
        byDevice,
      }),
    [reportType, selectedCreative, rows, filteredRows, byWeekOnly, bySource, byDevice]
  );

  return (
    <section className="w-full min-w-0">
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">소재 리스트</div>
            <div className="min-w-0 truncate text-xs text-gray-500">
              {selectedCreative ? `선택: ${selectedCreative}` : "선택 없음"}
            </div>
          </div>

          <div className="mt-3 overflow-auto pr-1 lg:max-h-[calc(100vh-14rem)]">
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
                                      b === "ctr"
                                        ? "CTR"
                                        : b === "roas"
                                        ? "ROAS"
                                        : "전환"
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
              오른쪽은 선택 소재 기준으로 “요약탭 구성(월3/주5/그래프/소스별)”을 재사용합니다.
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">{insight.title}</h3>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {selectedCreative ? `소재: ${selectedCreative}` : "소재를 선택하세요"}
                    </div>
                  </div>

                  {selectedBadges.length > 0 && (
                    <div className="hidden shrink-0 gap-2 sm:flex">
                      {selectedBadges.map((b) => (
                        <BadgePill key={b} k={b} />
                      ))}
                    </div>
                  )}
                </div>

                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {insight.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>

                <div className="mt-4 rounded-xl bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    다음 운영 액션
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                    {insight.actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="min-w-0">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">선택 소재 미리보기</div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {selectedPreviewUrl ? (
                      <img
                        src={selectedPreviewUrl}
                        alt={selectedCreative ?? "creative preview"}
                        className="h-[240px] w-full object-contain bg-white"
                      />
                    ) : (
                      <div className="flex h-[240px] items-center justify-center text-sm text-gray-400">
                        미리보기 이미지 없음
                      </div>
                    )}
                  </div>

                  {sideThumbs.length > 0 && (
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {sideThumbs.map((item) => (
                        <button
                          key={item.creative}
                          type="button"
                          onClick={() => setSelectedCreative(item.creative)}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white hover:border-orange-300"
                          title={item.creative}
                        >
                          <img
                            src={item.url}
                            alt={item.creative}
                            className="h-16 w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="creative-detail-week-table-fix creative-detail-hide-date-table min-w-0">
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
                    reportType={reportType}
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

        .creative-detail-hide-date-table > div > section:last-of-type {
          display: none !important;
        }

        ${isTraffic
          ? `
        .creative-detail-week-table-fix table {
          min-width: 860px !important;
        }
        `
          : `
        .creative-detail-week-table-fix table {
          min-width: 1320px !important;
        }
        `}
      `}</style>
    </section>
  );
}
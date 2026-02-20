"use client";

import { useMemo, useState } from "react";
import type { Row } from "../../lib/report/types";

import SummarySection from "./SummarySection";

import {
  summarize,
  groupBySource,
  groupByDevice,
  groupByWeekRecent5,
  groupByMonthRecent3,
} from "../../lib/report/aggregate";

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
    // 서버 콘솔에서 원인 확인 가능
    console.error(e);
    return fallback;
  }
}

function buildCreativeDetailInsight(args: {
  creative: string | null;
  allRowsScope: Row[];
  creativeRows: Row[];
  byWeekOnly: any[];
  bySource: any[];
  byDevice: any[];
}) {
  const { creative, allRowsScope, creativeRows, byWeekOnly, bySource, byDevice } = args;

  if (!creative) {
    return {
      title: "선택 소재 요약 인사이트",
      bullets: ["소재를 선택하면 해당 소재의 실적/기여도/추세/기기 근거 기반 인사이트가 표시됩니다."],
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
  const shareConv = all.conversions ? safeNum(me.conversions) / safeNum(all.conversions) : 0;

  const weeks = [...(byWeekOnly || [])].sort((a, b) =>
    String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
  );
  const wLast = weeks.length ? weeks[weeks.length - 1] : null;
  const wPrev = weeks.length >= 2 ? weeks[weeks.length - 2] : null;

  const roasWoW = wLast && wPrev ? diffPct(safeNum(wLast.roas), safeNum(wPrev.roas)) : 0;
  const clickWoW = wLast && wPrev ? diffPct(safeNum(wLast.clicks), safeNum(wPrev.clicks)) : 0;
  const convWoW = wLast && wPrev ? diffPct(safeNum(wLast.conversions), safeNum(wPrev.conversions)) : 0;
  const costWoW = wLast && wPrev ? diffPct(safeNum(wLast.cost), safeNum(wPrev.cost)) : 0;

  const sources = [...(bySource || [])].sort((a, b) => (safeNum(b.cost) - safeNum(a.cost)));
  const topS1 = sources[0] ?? null;
  const topS2 = sources[1] ?? null;

  const devices = [...(byDevice || [])].sort((a, b) => (safeNum(b.cost) - safeNum(a.cost)));
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
      ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(convWoW)}, ROAS ${signPct(
          roasWoW
        )} (비용 ${signPct(costWoW)})`
      : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

  const bullets: string[] = [];
  bullets.push(
    `선택 소재 “${creative}” 성과: 클릭 ${Math.round(safeNum(me.clicks))} / 전환 ${safeNum(me.conversions).toFixed(
      1
    )} / ROAS ${safePct0(safeNum(me.roas))} · ${efficiencyLabel}`
  );
  bullets.push(
    `기여도(현재 탭 범위 대비): 비용 ${safePct(shareCost)}, 전환 ${safePct(shareConv)}, 매출 ${safePct(shareRev)}`
  );
  bullets.push(trendLabel);

  if (topD1) {
    const d1 = pickDeviceLabel(String(topD1.device ?? "unknown"));
    let deviceLine = `기기별: “${d1}” 비중이 가장 큽니다(ROAS ${safePct0(safeNum(topD1.roas))}).`;
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
      `소스 기준: 비용 상위 “${String(topS1.source)}”(ROAS ${safePct0(safeNum(topS1.roas))})를 중심으로 예산/세팅 최적화를 우선하세요.`
    );
  }
  if (topS2) {
    actions.push(
      `소스 비교: 2순위 “${String(topS2.source)}”(ROAS ${safePct0(safeNum(topS2.roas))})와 함께 유지/축소 기준을 명확히 하세요.`
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

export default function CreativeDetailSection({ rows }: Props) {
  const creatives = useMemo(() => extractCreatives(rows), [rows]);

  // ✅ 리스트가 늦게 로딩될 수 있으니, 초기 선택값도 안전하게
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);

  // ✅ creatives가 생기면 자동으로 첫 항목 선택 (KeywordDetailSection의 “초기 1회” 문제 방지)
  useMemo(() => {
    if (!selectedCreative && creatives.length > 0) {
      setSelectedCreative(creatives[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatives]);

  const filteredRows = useMemo(
    () => filterByCreative(rows, selectedCreative),
    [rows, selectedCreative]
  );

  // ✅ 여기서부터는 절대 안 터지게 safeCall로 감싼다
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

  const bySource = useMemo(() => safeCall(() => groupBySource(filteredRows as any), [] as any[]), [filteredRows]);
  const byDevice = useMemo(() => safeCall(() => groupByDevice(filteredRows as any), [] as any[]), [filteredRows]);
  const byWeekOnly = useMemo(() => safeCall(() => groupByWeekRecent5(filteredRows as any), [] as any[]), [filteredRows]);

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
    <section className="w-full">
      <h2 className="text-xl font-semibold">소재 상세</h2>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_1fr]">
        {/* LEFT: 소재 리스트 */}
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col sticky top-24 max-h-[calc(100vh-6rem)]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">소재 리스트</div>
            <div className="text-xs text-gray-500">
              {selectedCreative ? `선택: ${selectedCreative}` : "선택 없음"}
            </div>
          </div>

          <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1">
            <div className="flex flex-col gap-2">
              {creatives.length === 0 ? (
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                  소재 데이터가 없습니다. (소재 컬럼 매핑 필요)
                </div>
              ) : (
                creatives.map((k) => {
                  const active = k === selectedCreative;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedCreative(k)}
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
            <div className="mt-1">
              오른쪽은 선택 소재 기준으로 SummarySection(월3/주5/그래프/소스별)을 재사용합니다.
            </div>
          </div>
        </aside>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* 인사이트 */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">{insight.title}</h3>
                <div className="mt-1 text-xs text-gray-500">
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
              <div className="text-sm font-semibold text-gray-900">다음 운영 액션(클릭 · 전환 · ROAS)</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {insight.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Summary */}
          <div className="creative-detail-week-table-fix">
            <SummarySection
              totals={totals as any}
              byMonth={byMonth as any}
              byWeekOnly={byWeekOnly as any}
              byWeekChart={byWeekChart as any}
              bySource={bySource as any}
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
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
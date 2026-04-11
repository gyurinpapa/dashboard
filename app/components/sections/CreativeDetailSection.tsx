"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Row } from "../../../src/lib/report/types";

import SummaryGoal from "./summary/SummaryGoal";

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

/** ✅ creative별 rows bucket 사전 계산 */
function buildCreativeRowsMap(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const row of rows ?? []) {
    const creative = getCreativeKey(row);
    if (!creative) continue;

    const bucket = map.get(creative);
    if (bucket) {
      bucket.push(row);
    } else {
      map.set(creative, [row]);
    }
  }

  return map;
}

function extractCreativesFromMap(creativeRowsMap: Map<string, Row[]>) {
  return Array.from(creativeRowsMap.keys()).sort((a, b) =>
    a.localeCompare(b, "ko")
  );
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

function normalizeDateKey(value: any): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const compact = raw
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, "");
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
  const anyR = row as any;
  const candidates = [
    anyR.dateKey,
    anyR.date,
    anyR.day,
    anyR.ymd,
    anyR.reportDate,
    anyR.segmentDate,
    anyR.daily,
    anyR["일자"],
    anyR["날짜"],
    anyR["date"],
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

    const bucket = map.get(dateKey) ?? [];
    bucket.push(row);
    map.set(dateKey, bucket);
  }

  return Array.from(map.entries())
    .map(([dateKey, bucket]) => {
      const s = safeCall(
        () => summarize(bucket as any),
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
        conversions: toSafeNumber(
          (s as any)?.conversions ?? (s as any)?.conv
        ),
        conv: toSafeNumber((s as any)?.conversions ?? (s as any)?.conv),
        cvr: toSafeNumber((s as any)?.cvr),
        cpa: toSafeNumber((s as any)?.cpa),
        revenue: toSafeNumber((s as any)?.revenue),
        roas: toSafeNumber((s as any)?.roas),
      };
    })
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
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

const BadgePill = memo(function BadgePill({ k }: { k: BadgeKey }) {
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
});

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
  const {
    reportType,
    creative,
    allRowsScope,
    creativeRows,
    byWeekOnly,
    bySource,
    byDevice,
  } = args;

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
  const shareRev = all.revenue
    ? toSafeNumber(me.revenue) / toSafeNumber(all.revenue)
    : 0;
  const shareConv = all.conversions
    ? toSafeNumber(me.conversions) / toSafeNumber(all.conversions)
    : 0;
  const shareClick = all.clicks
    ? toSafeNumber(me.clicks) / toSafeNumber(all.clicks)
    : 0;
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
      `선택 소재 “${creative}” 성과: 노출 ${Math.round(
        toSafeNumber(me.impressions)
      )} / 클릭 ${Math.round(
        toSafeNumber(me.clicks)
      )} / CTR ${safePct(toSafeNumber(me.ctr))} · ${efficiencyLabel}`
    );
    bullets.push(
      `기여도(현재 탭 범위 대비): 노출 ${safePct(shareImpr)}, 클릭 ${safePct(
        shareClick
      )}, 비용 ${safePct(shareCost)}`
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
      ? `최근 1주 기준: 클릭 ${signPct(clickWoW)}, 전환 ${signPct(
          convWoW
        )}, ROAS ${signPct(roasWoW)} (비용 ${signPct(costWoW)})`
      : "최근 주간 데이터가 부족하여 추세 비교는 제한적입니다.";

  bullets.push(
    `선택 소재 “${creative}” 성과: 클릭 ${Math.round(
      toSafeNumber(me.clicks)
    )} / 전환 ${toSafeNumber(me.conversions).toFixed(
      1
    )} / ROAS ${safeRoasPct0(toSafeNumber(me.roas))} · ${efficiencyLabel}`
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

type CreativePreviewMeta = {
  url: string;
};

type CreativeOptionButtonProps = {
  creative: string;
  active: boolean;
  badges: BadgeKey[];
  previewUrl: string;
  onSelect: (creative: string) => void;
};

const CreativeOptionButton = memo(function CreativeOptionButton({
  creative,
  active,
  badges,
  previewUrl,
  onSelect,
}: CreativeOptionButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(creative);
  }, [onSelect, creative]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "group relative block w-full overflow-hidden rounded-2xl border text-left transition-all",
        active
          ? "border-orange-300 bg-[linear-gradient(180deg,rgba(255,247,237,1),rgba(255,255,255,1))] shadow-[0_10px_24px_rgba(249,115,22,0.14)]"
          : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40 hover:shadow-sm",
      ].join(" ")}
      title={creative}
    >
      <div
        className={[
          "absolute inset-y-0 left-0 w-1 transition-all",
          active ? "bg-orange-500" : "bg-transparent group-hover:bg-orange-200",
        ].join(" ")}
      />

      <div className="flex items-start gap-3 px-3.5 py-3.5">
        <div className="shrink-0">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={creative}
                className="h-12 w-12 object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center text-[10px] font-semibold text-slate-400">
                NO
                <br />
                IMG
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={[
                  "truncate text-sm font-semibold",
                  active ? "text-slate-900" : "text-slate-800",
                ].join(" ")}
              >
                {creative}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {previewUrl ? "이미지 미리보기 가능" : "이미지 미리보기 없음"}
              </div>
            </div>

            <div
              className={[
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                active
                  ? "bg-orange-100 text-orange-700"
                  : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              {active ? "선택됨" : "선택"}
            </div>
          </div>

          {badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges.slice(0, 3).map((b) => (
                <span
                  key={b}
                  className={[
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    active
                      ? "bg-white text-slate-700 border border-orange-200"
                      : BADGE_META[b].className,
                  ].join(" ")}
                >
                  {BADGE_META[b].label}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-slate-400">
              성과 배지 없음
            </div>
          )}
        </div>
      </div>
    </button>
  );
});

type SideThumbButtonProps = {
  creative: string;
  url: string;
  onSelect: (creative: string) => void;
};

const SideThumbButton = memo(function SideThumbButton({
  creative,
  url,
  onSelect,
}: SideThumbButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(creative);
  }, [onSelect, creative]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="overflow-hidden rounded-lg border border-gray-200 bg-white hover:border-orange-300"
      title={creative}
    >
      <img
        src={url}
        alt={creative}
        className="h-16 w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </button>
  );
});

export default function CreativeDetailSection({ reportType, rows }: Props) {
  const isTraffic = reportType === "traffic";

  const creativeRowsMap = useMemo(() => buildCreativeRowsMap(rows), [rows]);
  const creatives = useMemo(
    () => extractCreativesFromMap(creativeRowsMap),
    [creativeRowsMap]
  );

  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const handleSelectCreative = useCallback((creative: string) => {
    setSelectedCreative((prev) => (prev === creative ? prev : creative));
  }, []);

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

  const filteredCreatives = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return creatives;
    return creatives.filter((name) => String(name).toLowerCase().includes(q));
  }, [creatives, searchText]);

  const filteredRows = useMemo(() => {
    if (!selectedCreative) return rows;
    return creativeRowsMap.get(selectedCreative) ?? [];
  }, [rows, selectedCreative, creativeRowsMap]);

  const byDay = useMemo(() => groupByDayFromRows(filteredRows), [filteredRows]);

  /** ✅ rows.find 반복 제거용 preview 사전 계산 */
  const previewMetaByCreative = useMemo(() => {
    const map = new Map<string, CreativePreviewMeta>();

    for (const row of rows ?? []) {
      const creative = getCreativeKey(row);
      if (!creative || map.has(creative)) continue;

      map.set(creative, {
        url: getCreativePreviewUrl(row),
      });
    }

    return map;
  }, [rows]);

  const selectedPreviewUrl = useMemo(() => {
    if (!selectedCreative) return "";
    return previewMetaByCreative.get(selectedCreative)?.url ?? "";
  }, [previewMetaByCreative, selectedCreative]);

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
      const url = previewMetaByCreative.get(creative)?.url ?? "";
      if (url) out.push({ creative, url });
      if (out.length >= 4) break;
    }
    return out;
  }, [creatives, previewMetaByCreative, selectedCreative]);

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
    arr.sort((a, b) =>
      String(a.weekKey ?? "").localeCompare(String(b.weekKey ?? ""))
    );
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

  const emptyCurrentMonthGoalComputed = useMemo(
    () => ({
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
    }),
    []
  );

  const currentMonthKey = useMemo(() => {
    const candidate = (totals as any)?.currentMonthKey;
    return candidate == null ? "" : String(candidate);
  }, [totals]);

  const currentMonthActual = useMemo(
    () => (totals as any)?.currentMonthActual ?? totals,
    [totals]
  );

  const monthGoal = useMemo(
    () =>
      (totals as any)?.monthGoal ?? {
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
      },
    [totals]
  );

  const currentMonthGoalComputed = useMemo(
    () =>
      (totals as any)?.currentMonthGoalComputed ??
      emptyCurrentMonthGoalComputed,
    [totals, emptyCurrentMonthGoalComputed]
  );

  const lastDataDate = useMemo(() => {
    let latest = "";
    for (const row of filteredRows) {
      const key = extractRowDateKey(row);
      if (key && key > latest) latest = key;
    }
    return latest || undefined;
  }, [filteredRows]);

  const setMonthGoal = useCallback((_updater: any) => {}, []);
  const monthGoalInsight = "";

  const summarySectionNode = useMemo(
    () => (
      <SummaryGoal
        reportType={reportType}
        currentMonthKey={currentMonthKey}
        currentMonthActual={currentMonthActual}
        currentMonthGoalComputed={currentMonthGoalComputed}
        monthGoal={monthGoal}
        setMonthGoal={setMonthGoal}
        monthGoalInsight={monthGoalInsight}
        lastDataDate={lastDataDate}
      />
    ),
    [
      reportType,
      currentMonthKey,
      currentMonthActual,
      currentMonthGoalComputed,
      monthGoal,
      setMonthGoal,
      monthGoalInsight,
      lastDataDate,
    ]
  );

  return (
    <section className="w-full min-w-0">
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-orange-700">
                  Creative Selector
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  소재 리스트
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  선택한 소재 기준으로 우측 상세 성과와 인사이트가 함께 갱신됩니다.
                </div>
              </div>

              <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Total
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {creatives.length}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Search
              </label>
              <div className="relative">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="소재명 검색"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-4 focus:ring-orange-100"
                />
                {searchText ? (
                  <button
                    type="button"
                    onClick={() => setSearchText("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-300"
                    title="검색 초기화"
                  >
                    초기화
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Current Selection
                </div>
                <div className="mt-1 truncate text-xs font-medium text-slate-700">
                  {selectedCreative || "선택 없음"}
                </div>
              </div>

              <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                {filteredCreatives.length}개 표시
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-auto pr-1 lg:max-h-[calc(100vh-20rem)]">
            <div className="flex flex-col gap-2.5">
              {creatives.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  소재 데이터가 없습니다. (소재 컬럼 매핑 필요)
                </div>
              ) : filteredCreatives.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
                  <div className="text-sm font-semibold text-slate-700">
                    검색 결과가 없습니다
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    다른 검색어로 시도하거나 검색어를 초기화해 주세요.
                  </div>
                </div>
              ) : (
                filteredCreatives.map((creative) => (
                  <CreativeOptionButton
                    key={creative}
                    creative={creative}
                    active={creative === selectedCreative}
                    badges={badgeMap.get(creative) ?? []}
                    previewUrl={previewMetaByCreative.get(creative)?.url ?? ""}
                    onSelect={handleSelectCreative}
                  />
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-5 text-slate-600">
            <b className="text-slate-800">메모</b>
            <div className="mt-1">
              검색과 선택만 담당하는 패널입니다. 우측 상세 성과 영역의 데이터 흐름은 그대로 유지됩니다.
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
                      {selectedCreative
                        ? `소재: ${selectedCreative}`
                        : "소재를 선택하세요"}
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
                  <div className="text-sm font-semibold text-gray-900">
                    선택 소재 미리보기
                  </div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {selectedPreviewUrl ? (
                      <img
                        src={selectedPreviewUrl}
                        alt={selectedCreative ?? "creative preview"}
                        className="h-[240px] w-full object-contain bg-white"
                        loading="eager"
                        decoding="async"
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
                        <SideThumbButton
                          key={item.creative}
                          creative={item.creative}
                          url={item.url}
                          onSelect={handleSelectCreative}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="creative-detail-week-table-fix min-w-0">
            <div className="min-w-0">{summarySectionNode}</div>
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
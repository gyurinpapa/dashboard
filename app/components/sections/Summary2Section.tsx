"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KRW,
  toSafeNumber,
  formatPercentFromRate,
  formatPercentFromRoas,
  formatCount,
  diffRatio,
  formatDeltaPercentFromRatio,
} from "../../../src/lib/report/format";

type ReportType = "commerce" | "traffic" | "db_acquisition";

type Summary2SlideIndex = 0 | 1 | 2;

type Props = {
  reportType?: ReportType;
  rows: any[];
  activeSlide?: Summary2SlideIndex;
};

type HeatmapMetricKey =
  | "revenue"
  | "roas"
  | "conversions"
  | "cost"
  | "clicks"
  | "impressions"
  | "cvr"
  | "cpa";

type DayAgg = {
  dateKey: string;
  date: Date;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cvr: number;
  cpa: number;
  roas: number;
};

type SankeyLink = {
  source: string;
  target: string;
  value: number;
  sourceType: "channel" | "device";
  targetType: "device" | "outcome";
};

type ChannelDeviceAgg = {
  channel: string;
  device: string;
  value: number;
};

type ChannelMetricAgg = {
  channel: string;
  revenue: number;
  conversions: number;
  cost: number;
  clicks: number;
  roas: number;
  cvr: number;
  cpa: number;
};

type ChannelInsightNarrative = {
  key: string;
  text: string;
};

type FunnelItem = {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  widthPct: number;
  color: string;
  sharePctText: string;
  peakPctText: string;
  dayDiffText: string;
};

type HeatmapThresholds = {
  p10: number;
  p30: number;
  p50: number;
  p70: number;
  p85: number;
  hasValues: boolean;
  singleValueOnly: boolean;
};

type HeatmapRenderCell = {
  id: string;
  cellKey: string;
  dateKey: string;
  agg: DayAgg | null;
  value: number;
  level: number;
};

const TRAFFIC_METRIC_BUTTONS: Array<{
  key: HeatmapMetricKey;
  label: string;
}> = [
  { key: "cost", label: "광고비" },
  { key: "clicks", label: "클릭수" },
  { key: "impressions", label: "노출수" },
];

const COMMERCE_METRIC_BUTTONS: Array<{
  key: HeatmapMetricKey;
  label: string;
}> = [
  { key: "revenue", label: "매출" },
  { key: "roas", label: "ROAS" },
  { key: "conversions", label: "전환수" },
  { key: "cost", label: "광고비" },
  { key: "clicks", label: "클릭수" },
  { key: "impressions", label: "노출수" },
];

const DB_ACQUISITION_METRIC_BUTTONS: Array<{
  key: HeatmapMetricKey;
  label: string;
}> = [
  { key: "conversions", label: "전환수" },
  { key: "cpa", label: "CPA" },
  { key: "cvr", label: "CVR" },
  { key: "cost", label: "광고비" },
  { key: "clicks", label: "클릭수" },
  { key: "impressions", label: "노출수" },
];

const HEAT_LEGEND_PALETTE = [
  "bg-[#F3E4D2]/35 border-[#CFC2B1]/45",
  "bg-[#B7D7E3]/18 border-[#B7D7E3]/35",
  "bg-[#B7D7E3]/28 border-[#B7D7E3]/45",
  "bg-[#B7D7E3]/42 border-[#B7D7E3]/60",
  "bg-[#7FA6C4]/55 border-[#7FA6C4]/65",
  "bg-[#7FA6C4]/75 border-[#7FA6C4]/80",
  "bg-[#5F87A3] border-[#5F87A3]",
] as const;

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function parseDateLooseAny(v: any) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})/);
  if (!m) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function monthLabel(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayLabelKor(idx: number) {
  return ["월", "화", "수", "목", "금", "토", "일"][idx] || "";
}

function formatMetricValue(
  metric: HeatmapMetricKey | "ctr" | "cvr" | "cpa",
  v: number,
) {
  if (metric === "roas") {
    return formatPercentFromRoas(v, 1);
  }
  if (metric === "ctr" || metric === "cvr") {
    return formatPercentFromRate(v, 1);
  }
  if (metric === "cost" || metric === "revenue" || metric === "cpa") {
    return KRW(v);
  }
  return formatCount(v);
}

function buildHeatThresholds(values: number[]): HeatmapThresholds {
  const positives = values
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (!positives.length) {
    return {
      p10: 0,
      p30: 0,
      p50: 0,
      p70: 0,
      p85: 0,
      hasValues: false,
      singleValueOnly: false,
    };
  }

  if (positives.length === 1) {
    const only = positives[0];
    return {
      p10: only,
      p30: only,
      p50: only,
      p70: only,
      p85: only,
      hasValues: true,
      singleValueOnly: true,
    };
  }

  const pick = (ratio: number) =>
    positives[
      Math.min(positives.length - 1, Math.floor((positives.length - 1) * ratio))
    ];

  return {
    p10: pick(0.1),
    p30: pick(0.3),
    p50: pick(0.5),
    p70: pick(0.7),
    p85: pick(0.85),
    hasValues: true,
    singleValueOnly: false,
  };
}

function quantizeWithThresholds(value: number, thresholds: HeatmapThresholds) {
  if (!thresholds.hasValues || value <= 0) return 0;
  if (thresholds.singleValueOnly) return 6;
  if (value <= thresholds.p10) return 1;
  if (value <= thresholds.p30) return 2;
  if (value <= thresholds.p50) return 3;
  if (value <= thresholds.p70) return 4;
  if (value <= thresholds.p85) return 5;
  return 6;
}

function heatColorClass(level: number) {
  const palette = [
    "bg-[#F3E4D2]/35 border-[#CFC2B1]/45 text-[#7A8794]",
    "bg-[#B7D7E3]/18 border-[#B7D7E3]/35 text-[#5F87A3]",
    "bg-[#B7D7E3]/28 border-[#B7D7E3]/45 text-[#5F87A3]",
    "bg-[#B7D7E3]/42 border-[#B7D7E3]/60 text-[#27364A]",
    "bg-[#7FA6C4]/55 border-[#7FA6C4]/65 text-white",
    "bg-[#7FA6C4]/75 border-[#7FA6C4]/80 text-white",
    "bg-[#5F87A3] border-[#5F87A3] text-white",
  ];

  return palette[Math.max(0, Math.min(level, palette.length - 1))];
}

function normalizeChannel(v: any) {
  const s = asStr(v).toLowerCase();
  if (!s) return "기타";
  if (s.includes("naver")) return "Naver";
  if (s.includes("google")) return "Google";
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram"))
    return "Meta";
  if (s.includes("kakao")) return "Kakao";
  if (s.includes("tiktok")) return "TikTok";
  if (s.includes("criteo")) return "Criteo";
  if (s.includes("display")) return "Display";
  if (s.includes("search")) return "Search";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeDevice(v: any) {
  const s = asStr(v).toLowerCase();
  if (!s) return "Unknown";
  if (
    s.includes("mobile") ||
    s === "mo" ||
    s.includes("mweb") ||
    s.includes("app")
  )
    return "Mobile";
  if (s.includes("pc") || s.includes("desktop") || s.includes("web"))
    return "PC";
  if (s.includes("tablet") || s.includes("tab")) return "Tablet";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function channelColor(channel: string) {
  const map: Record<string, string> = {
    Naver: "#10b981",
    Google: "#3b82f6",
    Meta: "#8b5cf6",
    Kakao: "#f59e0b",
    TikTok: "#111827",
    Criteo: "#ef4444",
    Display: "#06b6d4",
    Search: "#6366f1",
    기타: "#6b7280",
    Unknown: "#6b7280",
  };
  return map[channel] || "#6b7280";
}

function deviceColor(device: string) {
  const map: Record<string, string> = {
    Mobile: "#2563eb",
    PC: "#0f766e",
    Tablet: "#7c3aed",
    Unknown: "#6b7280",
  };
  return map[device] || "#6b7280";
}

function rgbaFromHex(hex: string, alpha: number) {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildFlowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
) {
  const top1 = y1 - width / 2;
  const bottom1 = y1 + width / 2;
  const top2 = y2 - width / 2;
  const bottom2 = y2 + width / 2;

  const c1 = x1 + (x2 - x1) * 0.42;
  const c2 = x1 + (x2 - x1) * 0.58;

  return [
    `M ${x1} ${top1}`,
    `C ${c1} ${top1}, ${c2} ${top2}, ${x2} ${top2}`,
    `L ${x2} ${bottom2}`,
    `C ${c2} ${bottom2}, ${c1} ${bottom1}, ${x1} ${bottom1}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart = polarToCartesian(cx, cy, rOuter, endAngle);
  const outerEnd = polarToCartesian(cx, cy, rOuter, startAngle);
  const innerStart = polarToCartesian(cx, cy, rInner, startAngle);
  const innerEnd = polarToCartesian(cx, cy, rInner, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

function buildCommerceChannelInsights(
  items: readonly ChannelMetricAgg[],
): ChannelInsightNarrative[] {
  const activeItems = items.filter(
    (item) =>
      toSafeNumber(item.revenue) > 0 ||
      toSafeNumber(item.conversions) > 0 ||
      toSafeNumber(item.cost) > 0,
  );

  if (!activeItems.length) {
    return [
      {
        key: "empty",
        text: "채널별 목표 기여와 운영 방향을 판단할 유효한 데이터가 없습니다.",
      },
    ];
  }

  const totalRevenue = activeItems.reduce(
    (sum, item) => sum + toSafeNumber(item.revenue),
    0,
  );
  const totalConversions = activeItems.reduce(
    (sum, item) => sum + toSafeNumber(item.conversions),
    0,
  );
  const totalCost = activeItems.reduce(
    (sum, item) => sum + toSafeNumber(item.cost),
    0,
  );
  const blendedRoas = totalCost > 0 ? totalRevenue / totalCost : 0;

  const revenueRows = [...activeItems]
    .filter((item) => item.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const conversionRows = [...activeItems]
    .filter((item) => item.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions);
  const roasRows = [...activeItems]
    .filter((item) => item.cost > 0 && item.roas > 0)
    .sort((a, b) => b.roas - a.roas);

  const primary = revenueRows[0] ?? conversionRows[0] ?? roasRows[0] ?? null;
  const topConversion = conversionRows[0] ?? null;
  const topRoas = roasRows[0] ?? null;

  const narratives: ChannelInsightNarrative[] = [];

  if (primary) {
    const revenueShare = totalRevenue > 0 ? primary.revenue / totalRevenue : 0;
    const conversionShare =
      totalConversions > 0 ? primary.conversions / totalConversions : 0;
    const primaryRoas = toSafeNumber(primary.roas);
    const sameConversionLeader = topConversion?.channel === primary.channel;
    const sameEfficiencyLeader = topRoas?.channel === primary.channel;

    const roleText =
      sameConversionLeader && sameEfficiencyLeader
        ? "매출 규모와 전환 기여, 효율이 동시에 확인돼 현재 목표 달성의 핵심 동력으로 평가됩니다."
        : sameConversionLeader
          ? "매출과 전환 기여가 함께 집중돼 현재 목표 달성의 중심 매체로 평가됩니다."
          : sameEfficiencyLeader
            ? "매출 기여와 효율이 함께 우수해 목표 달성에 가장 직접적으로 기여한 매체로 평가됩니다."
            : "가장 큰 매출 규모를 만들며 현재 목표 달성을 견인한 핵심 매체로 평가됩니다.";

    const scaleDirection =
      primaryRoas > 0 && blendedRoas > 0 && primaryRoas >= blendedRoas
        ? "현재 효율을 훼손하지 않는 범위에서 예산을 단계적으로 확대하면 추가 매출 확보와 목표 초과 달성을 기대할 수 있습니다."
        : "규모 기여는 크지만 전체 평균 대비 효율을 함께 점검해야 하므로, 핵심 캠페인은 유지하되 증액은 소재·상품·타깃 단위로 나눠 검증하는 것이 안전합니다.";

    narratives.push({
      key: "primary",
      text: `${primary.channel}는 전체 매출의 ${formatPercentFromRate(
        revenueShare,
        1,
      )}, 전환의 ${formatPercentFromRate(
        conversionShare,
        1,
      )}를 담당했습니다. ${roleText} ${scaleDirection}`,
    });
  }

  if (topRoas && primary && topRoas.channel !== primary.channel) {
    const topRoasRevenueShare =
      totalRevenue > 0 ? topRoas.revenue / totalRevenue : 0;
    const topRoasConversionShare =
      totalConversions > 0 ? topRoas.conversions / totalConversions : 0;

    narratives.push({
      key: "opportunity",
      text: `${topRoas.channel}는 ROAS ${formatPercentFromRoas(
        topRoas.roas,
        1,
      )}로 효율은 가장 우수하지만 매출 비중 ${formatPercentFromRate(
        topRoasRevenueShare,
        1,
      )}, 전환 비중 ${formatPercentFromRate(
        topRoasConversionShare,
        1,
      )}로 규모 기여는 제한적입니다. 고효율 캠페인과 상품군을 중심으로 소폭 증액 테스트를 진행하면 전체 효율을 방어하면서 매출 기여를 넓힐 가능성이 있습니다.`,
    });
  }

  const secondaryRows = activeItems
    .filter((item) => !primary || item.channel !== primary.channel)
    .map((item) => ({
      item,
      revenueShare: totalRevenue > 0 ? item.revenue / totalRevenue : 0,
      conversionShare:
        totalConversions > 0 ? item.conversions / totalConversions : 0,
    }));

  const weakRows = secondaryRows
    .filter(({ item, revenueShare }) => {
      const lowScale = revenueShare < 0.15;
      const lowEfficiency =
        item.cost > 0 &&
        blendedRoas > 0 &&
        (item.roas <= 0 || item.roas < blendedRoas * 0.8);
      return lowScale && lowEfficiency;
    })
    .sort((a, b) => b.item.cost - a.item.cost)
    .slice(0, 2);

  if (weakRows.length > 0) {
    const names = weakRows.map(({ item }) => item.channel).join("·");
    narratives.push({
      key: "weak",
      text: `${names}는 비용이 집행됐지만 매출 기여와 효율이 모두 상대적으로 낮아 현재 방식의 단순 예산 확대 효과는 제한적입니다. 광범위 집행은 축소하고 전환 가능성이 높은 검색어·리타게팅·상품군만 남긴 뒤 소재와 랜딩을 재검증해야 합니다. 개선 기준을 충족하지 못하면 예산을 핵심 매체와 고효율 확장 후보로 재배분해 목표 달성 안정성을 높이는 방향이 적절합니다.`,
    });
  } else {
    const efficientSmallRows = secondaryRows
      .filter(({ item, revenueShare }) => {
        return (
          revenueShare < 0.2 &&
          item.cost > 0 &&
          blendedRoas > 0 &&
          item.roas >= blendedRoas
        );
      })
      .sort((a, b) => b.item.roas - a.item.roas)
      .slice(0, 2);

    if (efficientSmallRows.length > 0) {
      const names = efficientSmallRows
        .map(({ item }) => item.channel)
        .join("·");
      narratives.push({
        key: "efficient-small",
        text: `${names}는 현재 매출 비중은 작지만 전체 평균 이상 효율을 보여 보조 성장 채널로 활용할 가치가 있습니다. 즉시 대폭 확대하기보다 제한된 증액 구간을 설정해 추가 전환과 매출이 같은 비율로 증가하는지 확인하면 핵심 매체 의존도를 낮추면서 새로운 성장 여력을 확보할 수 있습니다.`,
      });
    }
  }

  if (primary && revenueRows.length > 1) {
    const primaryShare = totalRevenue > 0 ? primary.revenue / totalRevenue : 0;

    if (primaryShare >= 0.6) {
      narratives.push({
        key: "concentration",
        text: `${primary.channel} 의존도가 높아 단기 목표 달성에는 유리하지만 해당 매체의 입찰 경쟁, 정책 변화, 소재 피로가 전체 성과에 직접 영향을 줄 수 있습니다. 핵심 매체의 성과를 유지하면서 효율이 검증된 보조 매체를 단계적으로 육성하면 매출 변동 위험을 낮추고 다음 기간의 목표 달성 기반을 넓힐 수 있습니다.`,
      });
    }
  }

  return narratives.slice(0, 4);
}

const FunnelCard = memo(function FunnelCard({
  items,
  isPlaying,
  onTogglePlay,
  currentDateLabel,
  totalDates,
  playIndex,
  maxIndex,
  onScrubChange,
  transitionBadges,
  badge,
  title,
  description,
}: {
  items: FunnelItem[];
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentDateLabel: string;
  totalDates: number;
  playIndex: number;
  maxIndex: number;
  onScrubChange: (next: number) => void;
  transitionBadges: string[];
  badge: string;
  title: string;
  description: string;
}) {
  const barH = 54;
  const gapH = 32;

  const connectorPaths = useMemo(() => {
    if (items.length < 2) return [];

    const paths: Array<{ d: string; stroke: string }> = [];

    for (let i = 0; i < items.length - 1; i += 1) {
      const current = items[i];
      const next = items[i + 1];

      const currentW = current.widthPct;
      const nextW = next.widthPct;

      const currentLeft = 0;
      const currentRight = currentW;
      const nextLeft = 0;
      const nextRight = nextW;

      const currentTop = i * (barH + gapH);
      const currentBottomY = currentTop + barH;
      const nextTopY = currentTop + barH + gapH;

      const leftPath = [
        `M ${currentLeft} ${currentBottomY}`,
        `C ${currentLeft} ${currentBottomY + 10}, ${nextLeft} ${
          nextTopY - 10
        }, ${nextLeft} ${nextTopY}`,
      ].join(" ");

      const rightPath = [
        `M ${currentRight} ${currentBottomY}`,
        `C ${currentRight} ${currentBottomY + 10}, ${nextRight} ${
          nextTopY - 10
        }, ${nextRight} ${nextTopY}`,
      ].join(" ");

      const stroke =
        i === 0 ? "rgba(127,166,196,0.42)" : "rgba(207,194,177,0.48)";

      paths.push({ d: leftPath, stroke }, { d: rightPath, stroke });
    }

    return paths;
  }, [items]);

  const svgHeight =
    items.length > 0 ? items.length * barH + (items.length - 1) * gapH : 0;

  return (
    <div className="rounded-[20px] border border-[var(--nature-border-blue)] bg-white shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
      <div className="border-b border-[var(--nature-border)] px-6 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-3">
              <span className="inline-flex items-center rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/18 px-2.5 py-1 text-[10px] font-semibold tracking-[0.10em] text-[#4F7F9E]">
                {badge}
              </span>
            </div>

            <h3 className="text-base font-semibold text-[#27364A] whitespace-nowrap overflow-hidden text-ellipsis">
              {title}
            </h3>

            <p className="mt-1 text-sm text-[#7A8794] whitespace-nowrap overflow-hidden text-ellipsis">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 pb-3">
        {items.length > 0 ? (
          <div>
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[#6F7B86]">
                  기준일:{" "}
                  <span className="font-semibold text-[#27364A]">
                    {totalDates > 0 ? currentDateLabel : "-"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onTogglePlay}
                  className={[
                    "rounded-[10px] border px-3 py-2 text-sm font-semibold",
                    isPlaying
                      ? "border-[#7FA6C4] bg-[#7FA6C4] text-white"
                      : "border-[var(--nature-border-blue)] bg-white text-[#27364A] hover:bg-[var(--nature-blue-light)]/12",
                  ].join(" ")}
                >
                  {isPlaying ? "일시정지" : "재생"}
                </button>
              </div>

              <div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, maxIndex)}
                  step={1}
                  value={Math.min(playIndex, Math.max(0, maxIndex))}
                  onChange={(e) => onScrubChange(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer rounded-full accent-[#7FA6C4]"
                />
              </div>
            </div>

            <div className="relative">
              <svg
                viewBox={`0 0 100 ${svgHeight}`}
                className="pointer-events-none absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {connectorPaths.map((item, idx) => (
                  <path
                    key={`funnel-connector-${idx}`}
                    d={item.d}
                    fill="none"
                    stroke={item.stroke}
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeDasharray="2 5"
                    className=""
                  />
                ))}
              </svg>

              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#27364A]">
                        {item.label}
                      </span>
                      <span className="text-xs font-medium text-[#7A8794]">
                        {item.sharePctText}
                      </span>
                    </div>

                    <div className="relative">
                      <div className="rounded-[14px] border border-[var(--nature-border)] bg-slate-50/65 p-2">
                        <div
                          className="flex h-[54px] items-center justify-center rounded-[12px] px-3 text-center"
                          style={{
                            width: `${item.widthPct}%`,
                            maxWidth: "100%",
                            backgroundColor: item.color,
                            boxShadow: `0 3px 10px ${rgbaFromHex(
                              item.color,
                              0.16,
                            )}`,
                          }}
                          title={[
                            item.label,
                            `값: ${item.displayValue}`,
                            item.sharePctText,
                            item.peakPctText,
                            item.dayDiffText,
                          ].join("\n")}
                        >
                          <div className="text-base font-bold tracking-tight text-[#27364A]">
                            {item.displayValue}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-1 text-center sm:grid-cols-3">
                      <div className="text-[11px] text-[#7A8794]">
                        {item.sharePctText}
                      </div>
                      <div className="text-[11px] text-[#7A8794]">
                        {item.peakPctText}
                      </div>
                      <div className="text-[11px] text-[#7A8794]">
                        {item.dayDiffText}
                      </div>
                    </div>

                    {idx < items.length - 1 ? (
                      <div className="flex h-8 items-center justify-center">
                        <span className="rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/12 px-3 py-1 text-[10px] font-semibold tracking-[0.04em] text-[#5F7180]">
                          {transitionBadges[idx] ?? "-"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-[var(--nature-border)] bg-slate-50/65 px-6 py-10 text-sm text-[#7A8794]">
            표시할 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
});

const DonutCard = memo(function DonutCard({
  title,
  description,
  totalLabel,
  totalValue,
  items,
  valueFormatter,
  badge,
  overview,
}: {
  title: string;
  description: string;
  totalLabel: string;
  totalValue: number;
  items: Array<{
    key: string;
    label: string;
    value: number;
    color: string;
    pct: number;
    startAngle: number;
    endAngle: number;
  }>;
  valueFormatter: (v: number) => string;
  badge: string;
  overview: string;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <div className="rounded-[20px] border border-[var(--nature-border-blue)] bg-white shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
      <div className="border-b border-[var(--nature-border)] px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3">
              <span className="inline-flex items-center rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/18 px-2.5 py-1 text-[10px] font-semibold tracking-[0.10em] text-[#4F7F9E]">
                {badge}
              </span>
            </div>

            <h3 className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold text-[#27364A]">
              {title}
            </h3>

            <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#7A8794]">
              {description}
            </p>
          </div>

          <div className="min-w-[190px] rounded-[14px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-slate-500">
              Overview
            </div>
            <div className="mt-1 text-sm font-semibold text-[#27364A]">
              {overview}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {items.length > 0 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <svg
                viewBox="0 0 260 260"
                className="h-[220px] w-[220px] max-w-full"
              >
                {items.map((item, index) => {
                  const isActive = activeKey === item.key;
                  const isDimmed = activeKey !== null && activeKey !== item.key;

                  return (
                    <path
                      key={item.key}
                      d={describeArc(
                        130,
                        130,
                        100,
                        60,
                        item.startAngle,
                        item.endAngle,
                      )}
                      fill={item.color}
                      onMouseEnter={() => setActiveKey(item.key)}
                      onMouseLeave={() => setActiveKey(null)}
                      className="cursor-pointer"
                      style={{
                        opacity: isDimmed ? 0.68 : 1,
                        filter: isActive
                          ? "drop-shadow(0 2px 4px rgba(127, 166, 196, 0.22))"
                          : "none",
                      }}
                    >
                      <title>
                        {`${item.label}\n값: ${valueFormatter(
                          item.value,
                        )}\n비중: ${formatPercentFromRate(item.pct, 1)}`}
                      </title>
                    </path>
                  );
                })}

                <circle cx="130" cy="130" r="46" fill="white" stroke="rgba(217,205,188,0.72)" strokeWidth="1" />

                <text
                  x="130"
                  y="118"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748B"
                  fontWeight="600"
                >
                  {totalLabel}
                </text>

                <text
                  x="130"
                  y="142"
                  textAnchor="middle"
                  fontSize="16"
                  fill="#27364A"
                  fontWeight="700"
                >
                  {valueFormatter(totalValue)}
                </text>
              </svg>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const isActive = activeKey === item.key;
                const isDimmed = activeKey !== null && activeKey !== item.key;

                return (
                  <div
                    key={item.key}
                    onMouseEnter={() => setActiveKey(item.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    className={[
                      "cursor-pointer rounded-[16px] border px-4 py-4",
                      isActive
                        ? "border-[var(--nature-blue)] bg-[var(--nature-blue-light)]/12"
                        : "border-[var(--nature-border)] bg-slate-50/55",
                      isDimmed ? "opacity-75" : "opacity-100",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate text-sm font-semibold text-[#27364A]">
                          {item.label}
                        </span>
                      </div>

                      <div className="shrink-0 text-sm font-semibold text-[#27364A]">
                        {formatPercentFromRate(item.pct, 1)}
                      </div>
                    </div>

                    <div className="mt-3 break-all border-t border-[var(--nature-border)] pt-3 text-center text-lg font-semibold tracking-[-0.02em] text-[#27364A]">
                      {valueFormatter(item.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-[16px] border border-[var(--nature-border)] bg-slate-50/55 px-6 py-10 text-sm text-[#7A8794]">
            표시할 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
});

const EfficiencyBarCard = memo(function EfficiencyBarCard({
  items,
  badge,
  overview,
  title,
  description,
  primaryMetricLabel,
  primaryMetricFormatter,
  primaryMetricValue,
  sortValue,
  secondaryLabel,
  secondaryValue,
  secondaryFormatter,
  tertiaryLabel,
  tertiaryValue,
  tertiaryFormatter,
  emptyMessage,
}: {
  items: ChannelMetricAgg[];
  badge: string;
  overview: string;
  title: string;
  description: string;
  primaryMetricLabel: string;
  primaryMetricFormatter: (v: number) => string;
  primaryMetricValue: (item: ChannelMetricAgg) => number;
  sortValue: (item: ChannelMetricAgg) => number;
  secondaryLabel: string;
  secondaryValue: (item: ChannelMetricAgg) => number;
  secondaryFormatter: (v: number) => string;
  tertiaryLabel: string;
  tertiaryValue: (item: ChannelMetricAgg) => number;
  tertiaryFormatter: (v: number) => string;
  emptyMessage: string;
}) {
  const maxMetric = Math.max(0, ...items.map((x) => sortValue(x)));

  return (
    <div className="rounded-[20px] border border-[var(--nature-border-blue)] bg-white shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
      <div className="border-b border-[var(--nature-border)] px-6 py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2">
              <span className="inline-flex items-center rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/18 px-2.5 py-1 text-[10px] font-semibold tracking-[0.10em] text-[#4F7F9E]">
                {badge}
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#27364A]">{title}</h3>
            <p className="mt-1 text-sm text-[#7A8794]">{description}</p>
          </div>

          <div className="min-w-[220px] rounded-[14px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-slate-500">
              Overview
            </div>
            <div className="mt-1 text-sm font-semibold text-[#27364A]">
              {overview}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {items.length > 0 ? (
          <div className="space-y-4">
            {items.map((item, index) => {
              const current = sortValue(item);
              const pct = maxMetric > 0 ? (current / maxMetric) * 100 : 0;

              return (
                <div
                  key={item.channel}
                  className={[
                    "rounded-[16px] border px-4 py-4",
                    index === 0
                      ? "border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10"
                      : "border-[var(--nature-border)] bg-slate-50/55",
                  ].join(" ")}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: channelColor(item.channel) }}
                      />
                      <span className="text-sm font-semibold text-[#27364A]">
                        {item.channel}
                      </span>
                    </div>
                    <span
                      className={[
                        "text-sm font-semibold",
                        index === 0 ? "text-[#4F7F9E]" : "text-[#27364A]",
                      ].join(" ")}
                    >
                      {primaryMetricFormatter(primaryMetricValue(item))}
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--nature-blue)]"
                      style={{
                        width: `${Math.max(0, Math.min(100, pct))}%`,
                        opacity: index === 0 ? 1 : 0.72,
                      }}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-[#7A8794]">
                    <div>
                      <div>{primaryMetricLabel}</div>
                      <div className="mt-1 font-semibold text-[#27364A]">
                        {primaryMetricFormatter(primaryMetricValue(item))}
                      </div>
                    </div>
                    <div>
                      <div>{secondaryLabel}</div>
                      <div className="mt-1 font-semibold text-[#27364A]">
                        {secondaryFormatter(secondaryValue(item))}
                      </div>
                    </div>
                    <div>
                      <div>{tertiaryLabel}</div>
                      <div className="mt-1 font-semibold text-[#27364A]">
                        {tertiaryFormatter(tertiaryValue(item))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[var(--nature-border)] bg-slate-50/55 px-6 py-10 text-sm text-[#7A8794]">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
});

const ChannelInsightPanel = memo(function ChannelInsightPanel({
  items,
}: {
  items: readonly ChannelInsightNarrative[];
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-[20px] border border-[var(--nature-border-blue)] bg-white shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
      <div className="border-b border-[var(--nature-border)] px-6 py-5">
        <div className="inline-flex items-center rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/18 px-2.5 py-1 text-[10px] font-semibold tracking-[0.10em] text-[#4F7F9E]">
          AI INSIGHT
        </div>
        <h3 className="mt-3 text-base font-semibold text-[#27364A]">
          채널 운영 인사이트
        </h3>
        <p className="mt-1 text-sm text-[#7A8794]">
          목표 기여도가 높은 매체와 보완이 필요한 매체를 함께 평가해 다음 운영
          방향을 제안합니다.
        </p>
      </div>

      <div className="space-y-3 px-6 py-5">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={[
              "flex gap-3 rounded-[16px] border px-5 py-4",
              index === 0
                ? "border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/12"
                : "border-[var(--nature-border)] bg-slate-50/50",
            ].join(" ")}
          >
            <span
              className={[
                "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                index === 0
                  ? "bg-[var(--nature-blue)] text-white"
                  : "border border-[var(--nature-border-blue)] bg-white text-[#4F7F9E]",
              ].join(" ")}
            >
              {index + 1}
            </span>
            <p className="text-sm font-medium leading-7 text-[#27364A]">
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
});

const HeatmapCell = memo(function HeatmapCell({
  cellKey,
  dateKey,
  agg,
  value,
  level,
  isHovered,
  isDimmed,
  metric,
  mode,
  selectedMetricLabel,
  onHoverStart,
  onHoverEnd,
}: {
  cellKey: string;
  dateKey: string;
  agg: DayAgg | null;
  value: number;
  level: number;
  isHovered: boolean;
  isDimmed: boolean;
  metric: HeatmapMetricKey;
  mode: ReportType;
  selectedMetricLabel: string;
  onHoverStart: (key: string, hasAgg: boolean) => void;
  onHoverEnd: () => void;
}) {
  const title = useMemo(() => {
    if (!agg) return dateKey;

    const lines =
      mode === "traffic"
        ? [
            `광고비: ${formatMetricValue("cost", agg.cost)}`,
            `클릭수: ${formatMetricValue("clicks", agg.clicks)}`,
            `노출수: ${formatMetricValue("impressions", agg.impressions)}`,
          ]
        : mode === "db_acquisition"
          ? [
              `전환수: ${formatMetricValue("conversions", agg.conversions)}`,
              `CPA: ${formatMetricValue("cpa", agg.cpa)}`,
              `CVR: ${formatMetricValue("cvr", agg.cvr)}`,
              `광고비: ${formatMetricValue("cost", agg.cost)}`,
              `클릭수: ${formatMetricValue("clicks", agg.clicks)}`,
              `노출수: ${formatMetricValue("impressions", agg.impressions)}`,
            ]
          : [
              `매출: ${formatMetricValue("revenue", agg.revenue)}`,
              `ROAS: ${formatMetricValue("roas", agg.roas)}`,
              `전환수: ${formatMetricValue("conversions", agg.conversions)}`,
              `광고비: ${formatMetricValue("cost", agg.cost)}`,
              `클릭수: ${formatMetricValue("clicks", agg.clicks)}`,
              `노출수: ${formatMetricValue("impressions", agg.impressions)}`,
            ];

    return [`${agg.dateKey}`, ...lines].join("\n");
  }, [agg, dateKey, mode]);

  return (
    <div
      onMouseEnter={() => onHoverStart(cellKey, Boolean(agg))}
      onMouseLeave={onHoverEnd}
      className={[
        "group relative h-10 rounded-[10px] border",
        agg ? heatColorClass(level) : "border-transparent bg-white",
        agg ? "cursor-pointer" : "",
        isHovered ? "ring-2 ring-[var(--nature-blue)]/28 ring-offset-1" : "",
        isDimmed ? "opacity-65" : "opacity-100",
      ].join(" ")}
      title={title}
    >
      {agg ? (
        <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-max -translate-x-1/2 pt-2 group-hover:block">
          <div className="rounded-[10px] border border-[var(--nature-border-blue)] bg-white px-3 py-2 text-xs shadow-[0_5px_14px_rgba(127,166,196,0.10)]">
            <div className="font-bold text-[#27364A]">{agg.dateKey}</div>
            <div className="mt-1 text-[#6F7B86]">
              {selectedMetricLabel}:{" "}
              <span className="font-semibold text-[#27364A]">
                {formatMetricValue(metric, value)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default function Summary2Section({
  reportType,
  rows,
  activeSlide,
}: Props) {
  const mode: ReportType =
    reportType === "traffic"
      ? "traffic"
      : reportType === "db_acquisition"
        ? "db_acquisition"
        : "commerce";

  const isTraffic = mode === "traffic";
  const isDbAcquisition = mode === "db_acquisition";
  const isCommerce = mode === "commerce";

  const showAllSlides = activeSlide == null;
  const isHeatmapSlideActive = showAllSlides || activeSlide === 0;
  const isFlowSlideActive = showAllSlides || activeSlide === 1;
  const isChannelSlideActive = showAllSlides || activeSlide === 2;

  /**
   * 일반 웹에서는 현재 슬라이드만 최초 계산·mount하고,
   * 한 번 방문한 슬라이드는 이후 hidden 상태로 유지한다.
   * export(activeSlide 미지정)에서는 기존처럼 세 슬라이드를 모두 계산한다.
   */
  const visitedSlidesRef = useRef({
    heatmap: isHeatmapSlideActive,
    flow: isFlowSlideActive,
    channel: isChannelSlideActive,
  });

  if (isHeatmapSlideActive) visitedSlidesRef.current.heatmap = true;
  if (isFlowSlideActive) visitedSlidesRef.current.flow = true;
  if (isChannelSlideActive) visitedSlidesRef.current.channel = true;

  const shouldBuildHeatmapData =
    showAllSlides || visitedSlidesRef.current.heatmap;
  const shouldBuildFlowData =
    showAllSlides || visitedSlidesRef.current.flow;
  const shouldBuildChannelData =
    showAllSlides || visitedSlidesRef.current.channel;

  const shouldRenderHeatmapSlide = shouldBuildHeatmapData;
  const shouldRenderFlowSlide = shouldBuildFlowData;
  const shouldRenderChannelSlide = shouldBuildChannelData;

  const [metric, setMetric] = useState<HeatmapMetricKey>("cost");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [heatHoverKey, setHeatHoverKey] = useState<string | null>(null);

  const dailyMap = useMemo(() => {
    if (!shouldBuildHeatmapData) return new Map<string, DayAgg>();
    const map = new Map<string, DayAgg>();

    for (const r of rows ?? []) {
      const d = parseDateLooseAny(
        r?.date ??
          r?.report_date ??
          r?.day ??
          r?.ymd ??
          r?.dt ??
          r?.segment_date ??
          r?.stat_date,
      );
      if (!d) continue;

      const key = ymd(d);
      const prev = map.get(key);

      const nextBase =
        prev ??
        ({
          dateKey: key,
          date: d,
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
          ctr: 0,
          cvr: 0,
          cpa: 0,
          roas: 0,
        } as DayAgg);

      nextBase.impressions += toSafeNumber(r?.impressions ?? r?.impr);
      nextBase.clicks += toSafeNumber(r?.clicks ?? r?.click ?? r?.clk);
      nextBase.cost += toSafeNumber(r?.cost ?? r?.spend ?? r?.ad_cost);
      nextBase.conversions += toSafeNumber(r?.conversions ?? r?.conv ?? r?.cv);
      nextBase.revenue += toSafeNumber(
        r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv,
      );

      map.set(key, nextBase);
    }

    for (const [, v] of map) {
      v.ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
      v.cvr = v.clicks > 0 ? v.conversions / v.clicks : 0;
      v.cpa = v.conversions > 0 ? v.cost / v.conversions : 0;
      v.roas = v.cost > 0 ? v.revenue / v.cost : 0;
    }

    return map;
  }, [rows, shouldBuildHeatmapData]);

  const dayList = useMemo(() => {
    if (!shouldBuildHeatmapData) return [] as DayAgg[];
    return Array.from(dailyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    );
  }, [dailyMap, shouldBuildHeatmapData]);

  const metricValues = useMemo(() => {
    if (!shouldBuildHeatmapData) return [] as number[];
    return dayList.map((d) => Number(d[metric] ?? 0));
  }, [dayList, metric, shouldBuildHeatmapData]);

  const metricButtons = useMemo(() => {
    if (isTraffic) return TRAFFIC_METRIC_BUTTONS;
    if (isDbAcquisition) return DB_ACQUISITION_METRIC_BUTTONS;
    return COMMERCE_METRIC_BUTTONS;
  }, [isTraffic, isDbAcquisition]);

  useEffect(() => {
    if (!metricButtons.some((item) => item.key === metric)) {
      setMetric(
        isTraffic ? "cost" : isDbAcquisition ? "conversions" : "revenue",
      );
    }
  }, [metric, metricButtons, isTraffic, isDbAcquisition]);

  const calendar = useMemo(() => {
    if (!shouldBuildHeatmapData) {
          return {
            weeks: [] as Date[][],
            monthLabels: [] as { label: string; column: number }[],
            monthRow: [] as string[],
          };
        }
    if (!dayList.length) {
      return {
        weeks: [] as Date[][],
        monthLabels: [] as { label: string; column: number }[],
        monthRow: [] as string[],
      };
    }

    const firstDay = dayList[0].date;
    const lastDay = dayList[dayList.length - 1].date;

    const start = startOfWeekMonday(firstDay);
    const endWeekStart = startOfWeekMonday(lastDay);

    const weeks: Date[][] = [];
    let cursor = new Date(start);

    while (cursor <= endWeekStart) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i += 1) {
        week.push(addDays(cursor, i));
      }
      weeks.push(week);
      cursor = addDays(cursor, 7);
    }

    const monthLabels: { label: string; column: number }[] = [];
    const monthRow: string[] = [];
    let lastLabel = "";

    weeks.forEach((week, idx) => {
      const label = monthLabel(week[0]);

      if (label !== lastLabel) {
        monthLabels.push({ label, column: idx });
        monthRow.push(label);
        lastLabel = label;
      } else {
        monthRow.push("");
      }
    });

    return { weeks, monthLabels, monthRow };
  }, [dayList, shouldBuildHeatmapData]);

  const heatmapSummary = useMemo(() => {
    if (!shouldBuildHeatmapData) {
          return { activeDays: 0, maxValue: 0, avgValue: 0, bestDay: null as DayAgg | null };
        }
    const activeDays = metricValues.filter((v) => v > 0).length;
    const maxValue = metricValues.length ? Math.max(...metricValues) : 0;
    const avgValue =
      metricValues.length > 0
        ? metricValues.reduce((acc, cur) => acc + cur, 0) / metricValues.length
        : 0;

    const bestDay =
      dayList.length > 0
        ? [...dayList].sort(
            (a, b) => Number(b[metric] ?? 0) - Number(a[metric] ?? 0),
          )[0]
        : null;

    return {
      activeDays,
      maxValue,
      avgValue,
      bestDay,
    };
  }, [dayList, metricValues, metric, shouldBuildHeatmapData]);

  const channelDeviceAgg = useMemo(() => {
    if (!shouldBuildFlowData) return [] as ChannelDeviceAgg[];
    const map = new Map<string, ChannelDeviceAgg>();

    for (const r of rows ?? []) {
      const channel = normalizeChannel(r?.channel ?? r?.source ?? r?.platform);
      const device = normalizeDevice(r?.device);

      const value = isDbAcquisition
        ? toSafeNumber(r?.conversions ?? r?.conv ?? r?.cv)
        : toSafeNumber(r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv);

      if (value <= 0) continue;

      const key = `${channel}__${device}`;
      const prev = map.get(key);

      if (prev) {
        prev.value += value;
      } else {
        map.set(key, {
          channel,
          device,
          value,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [rows, isDbAcquisition, shouldBuildFlowData]);

  const channelOutcome = useMemo(() => {
    if (!shouldBuildFlowData) return [] as Array<{ channel: string; value: number }>;
    const map = new Map<string, number>();
    for (const item of channelDeviceAgg) {
      map.set(item.channel, (map.get(item.channel) ?? 0) + item.value);
    }
    return Array.from(map.entries())
      .map(([channel, value]) => ({ channel, value }))
      .sort((a, b) => b.value - a.value);
  }, [channelDeviceAgg, shouldBuildFlowData]);

  const deviceOutcome = useMemo(() => {
    if (!shouldBuildFlowData) return [] as Array<{ device: string; value: number }>;
    const map = new Map<string, number>();
    for (const item of channelDeviceAgg) {
      map.set(item.device, (map.get(item.device) ?? 0) + item.value);
    }
    return Array.from(map.entries())
      .map(([device, value]) => ({ device, value }))
      .sort((a, b) => b.value - a.value);
  }, [channelDeviceAgg, shouldBuildFlowData]);

  const channelMetricAgg = useMemo(() => {
    if (!shouldBuildChannelData) return [] as ChannelMetricAgg[];
    const map = new Map<string, ChannelMetricAgg>();

    for (const r of rows ?? []) {
      const channel = normalizeChannel(r?.channel ?? r?.source ?? r?.platform);
      const revenue = toSafeNumber(
        r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv,
      );
      const conversions = toSafeNumber(r?.conversions ?? r?.conv ?? r?.cv);
      const cost = toSafeNumber(r?.cost ?? r?.spend ?? r?.ad_cost);
      const clicks = toSafeNumber(r?.clicks ?? r?.click ?? r?.clk);

      const prev = map.get(channel);

      if (prev) {
        prev.revenue += revenue;
        prev.conversions += conversions;
        prev.cost += cost;
        prev.clicks += clicks;
      } else {
        map.set(channel, {
          channel,
          revenue,
          conversions,
          cost,
          clicks,
          roas: 0,
          cvr: 0,
          cpa: 0,
        });
      }
    }

    const list = Array.from(map.values());
    for (const item of list) {
      item.roas = item.cost > 0 ? item.revenue / item.cost : 0;
      item.cvr = item.clicks > 0 ? item.conversions / item.clicks : 0;
      item.cpa = item.conversions > 0 ? item.cost / item.conversions : 0;
    }

    return list.sort((a, b) => {
      if (isCommerce) return b.revenue - a.revenue;
      if (isDbAcquisition) return b.conversions - a.conversions;
      return b.cost - a.cost;
    });
  }, [rows, isCommerce, isDbAcquisition, shouldBuildChannelData]);

  const funnelTimeline = useMemo(() => {
    if (!shouldBuildFlowData) {
          return [] as Array<{
            dateKey: string;
            impressions: number;
            clicks: number;
            cost: number;
            conversions: number;
          }>;
        }
    const map = new Map<
      string,
      {
        dateKey: string;
        impressions: number;
        clicks: number;
        cost: number;
        conversions: number;
      }
    >();

    for (const r of rows ?? []) {
      const d = parseDateLooseAny(
        r?.date ??
          r?.report_date ??
          r?.day ??
          r?.ymd ??
          r?.dt ??
          r?.segment_date ??
          r?.stat_date,
      );
      if (!d) continue;

      const key = ymd(d);
      const prev = map.get(key) ?? {
        dateKey: key,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
      };

      prev.impressions += toSafeNumber(r?.impressions ?? r?.impr);
      prev.clicks += toSafeNumber(r?.clicks ?? r?.click ?? r?.clk);
      prev.cost += toSafeNumber(r?.cost ?? r?.spend ?? r?.ad_cost);
      prev.conversions += toSafeNumber(r?.conversions ?? r?.conv ?? r?.cv);

      map.set(key, prev);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    );
  }, [rows, shouldBuildFlowData]);

  useEffect(() => {
    if (isFlowSlideActive) return;
    setIsPlaying(false);
  }, [isFlowSlideActive]);

  useEffect(() => {
    if (!funnelTimeline.length) {
      setPlayIndex(0);
      setIsPlaying(false);
      return;
    }

    if (playIndex > funnelTimeline.length - 1) {
      setPlayIndex(funnelTimeline.length - 1);
    }
  }, [funnelTimeline.length, playIndex, shouldBuildFlowData]);

  useEffect(() => {
    if (!isPlaying) return;
    if (funnelTimeline.length <= 1) return;

    const timer = window.setInterval(() => {
      setPlayIndex((prev) => {
        const next = prev + 7;
        if (next >= funnelTimeline.length) return 0;
        return next;
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPlaying, funnelTimeline.length]);

  const currentFunnelPoint = useMemo(() => {
    if (!shouldBuildFlowData) return null;
    if (!funnelTimeline.length) return null;
    const safeIndex = Math.max(
      0,
      Math.min(playIndex, funnelTimeline.length - 1),
    );
    return funnelTimeline[safeIndex];
  }, [funnelTimeline, playIndex, shouldBuildFlowData]);

  const funnelData = useMemo(() => {
    if (!shouldBuildFlowData) return [] as FunnelItem[];
    const point = currentFunnelPoint ?? {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    };

    const safeIndex = Math.max(
      0,
      Math.min(playIndex, Math.max(0, funnelTimeline.length - 1)),
    );
    const prevPoint =
      safeIndex > 0
        ? funnelTimeline[safeIndex - 1]
        : { impressions: 0, clicks: 0, cost: 0, conversions: 0 };

    const maxImpressions = Math.max(
      ...funnelTimeline.map((x) => x.impressions),
      1,
    );
    const maxClicks = Math.max(...funnelTimeline.map((x) => x.clicks), 1);
    const maxCost = Math.max(...funnelTimeline.map((x) => x.cost), 1);
    const maxConversions = Math.max(
      ...funnelTimeline.map((x) => x.conversions),
      1,
    );

    const currentDayMax = Math.max(
      point.impressions,
      point.clicks,
      point.cost,
      point.conversions,
      1,
    );

    const diffText = (current: number, prev: number) => {
      if (prev <= 0) {
        if (current > 0) return "전일 대비 신규";
        return "전일 대비 -";
      }
      return `전일 대비 ${formatDeltaPercentFromRatio(
        diffRatio(current, prev),
        1,
      )}`;
    };

    const baseItems: FunnelItem[] = [
      {
        key: "impressions",
        label: "노출",
        value: point.impressions,
        displayValue: formatCount(point.impressions),
        color: "#3b82f6",
        widthPct: Math.max(10, (point.impressions / currentDayMax) * 100),
        sharePctText: formatPercentFromRate(
          point.impressions / maxImpressions,
          1,
        ),
        peakPctText: `최고일 ${formatCount(maxImpressions)}`,
        dayDiffText: diffText(point.impressions, prevPoint.impressions),
      },
      {
        key: "clicks",
        label: "클릭",
        value: point.clicks,
        displayValue: formatCount(point.clicks),
        color: "#4b9fad",
        widthPct: Math.max(10, (point.clicks / currentDayMax) * 100),
        sharePctText: formatPercentFromRate(point.clicks / maxClicks, 1),
        peakPctText: `최고일 ${formatCount(maxClicks)}`,
        dayDiffText: diffText(point.clicks, prevPoint.clicks),
      }];

    if (isTraffic) {
      baseItems.push({
        key: "cost",
        label: "광고비",
        value: point.cost,
        displayValue: KRW(point.cost),
        color: "#f59e0b",
        widthPct: Math.max(10, (point.cost / currentDayMax) * 100),
        sharePctText: formatPercentFromRate(point.cost / maxCost, 1),
        peakPctText: `최고일 ${KRW(maxCost)}`,
        dayDiffText: diffText(point.cost, prevPoint.cost),
      });
      return baseItems;
    }

    baseItems.push({
      key: "conversions",
      label: "전환",
      value: point.conversions,
      displayValue: formatCount(point.conversions),
      color: "#f2995a",
      widthPct: Math.max(10, (point.conversions / currentDayMax) * 100),
      sharePctText: formatPercentFromRate(
        point.conversions / maxConversions,
        1,
      ),
      peakPctText: `최고일 ${formatCount(maxConversions)}`,
      dayDiffText: diffText(point.conversions, prevPoint.conversions),
    });

    return baseItems;
  }, [currentFunnelPoint, funnelTimeline, playIndex, isTraffic, shouldBuildFlowData]);

  const funnelTransitionBadges = useMemo(() => {
    if (!shouldBuildFlowData) return [] as string[];
    const point = currentFunnelPoint ?? {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    };

    const ctr = point.impressions > 0 ? point.clicks / point.impressions : 0;
    const cpc = point.clicks > 0 ? point.cost / point.clicks : 0;
    const cvr = point.clicks > 0 ? point.conversions / point.clicks : 0;

    if (isTraffic) {
      return [`CTR ${formatPercentFromRate(ctr, 2)}`, `CPC ${KRW(cpc)}`];
    }

    if (isDbAcquisition) {
      return [
        `CTR ${formatPercentFromRate(ctr, 2)}`,
        `CVR ${formatPercentFromRate(cvr, 2)}`,
      ];
    }

    return [
      `CTR ${formatPercentFromRate(ctr, 2)}`,
      `CVR ${formatPercentFromRate(cvr, 2)}`,
    ];
  }, [currentFunnelPoint, isTraffic, isDbAcquisition, shouldBuildFlowData]);

  const sankeyData = useMemo(() => {
    if (!shouldBuildFlowData) {
          return { totalValue: 0, links: [] as SankeyLink[] };
        }
    const totalValue = channelDeviceAgg.reduce(
      (acc, cur) => acc + cur.value,
      0,
    );

    const linksA: SankeyLink[] = channelDeviceAgg.map((item) => ({
      source: item.channel,
      target: item.device,
      value: item.value,
      sourceType: "channel",
      targetType: "device",
    }));

    const linksB: SankeyLink[] = deviceOutcome.map((item) => ({
      source: item.device,
      target: isDbAcquisition ? "Conversions" : "Revenue",
      value: item.value,
      sourceType: "device",
      targetType: "outcome",
    }));

    return {
      totalValue,
      links: [...linksA, ...linksB],
    };
  }, [channelDeviceAgg, deviceOutcome, isDbAcquisition, shouldBuildFlowData]);

  const sankeyLayout = useMemo(() => {
    if (!shouldBuildFlowData) {
          return {
            width: 800,
            height: 270,
            channels: [] as any[],
            devices: [] as any[],
            outcomeNode: [] as any[],
            links: [] as Array<SankeyLink & { widthPx: number; path: string; fill: string }>,
          };
        }
    const width = 800;
    const height = 270;
    const nodeWidth = 18;
    const topPad = 20;
    const bottomPad = 16;
    const usableHeight = height - topPad - bottomPad;
    const gap = 12;
    const minNodeH = 20;
    const totalValue = Math.max(sankeyData.totalValue, 1);

    const buildColumn = (
      items: { key: string; label: string; value: number; color: string }[],
    ) => {
      const valueSum = Math.max(
        items.reduce((acc, cur) => acc + cur.value, 0),
        1,
      );

      const rawHeights = items.map((item) =>
        Math.max(
          minNodeH,
          (item.value / valueSum) *
            (usableHeight - gap * Math.max(items.length - 1, 0)),
        ),
      );
      const heightSum = rawHeights.reduce((acc, cur) => acc + cur, 0);
      const totalGap = gap * Math.max(items.length - 1, 0);
      const scale =
        heightSum + totalGap > usableHeight
          ? (usableHeight - totalGap) / Math.max(heightSum, 1)
          : 1;

      let cursorY = topPad;

      return items.map((item, idx) => {
        const h = rawHeights[idx] * scale;
        const y = cursorY;
        cursorY += h + gap;
        return {
          ...item,
          x: 0,
          y,
          width: nodeWidth,
          height: h,
          centerY: y + h / 2,
        };
      });
    };

    const channels = buildColumn(
      channelOutcome.map((item) => ({
        key: item.channel,
        label: item.channel,
        value: item.value,
        color: channelColor(item.channel),
      })),
    ).map((n) => ({ ...n, x: 80 }));

    const devices = buildColumn(
      deviceOutcome.map((item) => ({
        key: item.device,
        label: item.device,
        value: item.value,
        color: "#CFC2B1",
      })),
    ).map((n) => ({ ...n, x: 355 }));

    const outcomeNode = [
      {
        key: isDbAcquisition ? "Conversions" : "Revenue",
        label: isDbAcquisition ? "Conversions" : "Revenue",
        value: totalValue,
        color: "#7FA6C4",
        x: 690,
        y: topPad + 22,
        width: nodeWidth,
        height: Math.max(usableHeight - 44, 90),
        centerY: topPad + 22 + Math.max(usableHeight - 44, 90) / 2,
      },
    ];

    const channelMap = new Map(channels.map((n) => [n.key, n]));
    const deviceMap = new Map(devices.map((n) => [n.key, n]));
    const outcomeMap = new Map(outcomeNode.map((n) => [n.key, n]));

    const sourceOffsets = new Map<string, number>();
    const targetOffsets = new Map<string, number>();

    const thickness = (value: number) => {
      const t = (value / totalValue) * (usableHeight - 24);
      return Math.max(10, t);
    };

    const links = sankeyData.links.map((link) => {
      const sourceNode =
        link.sourceType === "channel"
          ? channelMap.get(link.source)
          : deviceMap.get(link.source);

      const targetNode =
        link.targetType === "device"
          ? deviceMap.get(link.target)
          : outcomeMap.get(link.target);

      if (!sourceNode || !targetNode) return null;

      const widthPx = thickness(link.value);

      const sourceKey = `${link.sourceType}:${link.source}`;
      const targetKey = `${link.targetType}:${link.target}`;

      const sourceUsed = sourceOffsets.get(sourceKey) ?? 0;
      const targetUsed = targetOffsets.get(targetKey) ?? 0;

      const sy = sourceNode.y + sourceUsed + widthPx / 2;
      const ty = targetNode.y + targetUsed + widthPx / 2;

      sourceOffsets.set(sourceKey, sourceUsed + widthPx);
      targetOffsets.set(targetKey, targetUsed + widthPx);

      const sourceColor =
        link.sourceType === "channel"
          ? channelColor(link.source)
          : deviceColor(link.source);

      return {
        ...link,
        widthPx,
        path: buildFlowPath(
          sourceNode.x + sourceNode.width,
          sy,
          targetNode.x,
          ty,
          widthPx,
        ),
        fill:
          link.sourceType === "channel"
            ? rgbaFromHex(sourceColor, 0.20)
            : "rgba(127, 166, 196, 0.18)",
      };
    });

    return {
      width,
      height,
      channels,
      devices,
      outcomeNode,
      links: links.filter(Boolean) as Array<
        SankeyLink & { widthPx: number; path: string; fill: string }
      >,
    };
  }, [channelOutcome, deviceOutcome, sankeyData, isDbAcquisition, shouldBuildFlowData]);

  const revenueDonutData = useMemo(() => {
    if (!shouldBuildChannelData) return [];
    const total = channelMetricAgg.reduce((acc, cur) => acc + cur.revenue, 0);
    let start = 0;

    return channelMetricAgg
      .filter((item) => item.revenue > 0)
      .map((item) => {
        const pct = total > 0 ? item.revenue / total : 0;
        const angle = pct * 360;
        const segment = {
          key: `revenue-${item.channel}`,
          label: item.channel,
          value: item.revenue,
          pct,
          startAngle: start,
          endAngle: start + angle,
          color: channelColor(item.channel),
        };
        start += angle;
        return segment;
      });
  }, [channelMetricAgg, shouldBuildChannelData]);

  const conversionDonutData = useMemo(() => {
    if (!shouldBuildChannelData) return [];
    const total = channelMetricAgg.reduce(
      (acc, cur) => acc + cur.conversions,
      0,
    );
    let start = 0;

    return channelMetricAgg
      .filter((item) => item.conversions > 0)
      .map((item) => {
        const pct = total > 0 ? item.conversions / total : 0;
        const angle = pct * 360;
        const segment = {
          key: `conv-${item.channel}`,
          label: item.channel,
          value: item.conversions,
          pct,
          startAngle: start,
          endAngle: start + angle,
          color: channelColor(item.channel),
        };
        start += angle;
        return segment;
      });
  }, [channelMetricAgg, shouldBuildChannelData]);

  const costDonutData = useMemo(() => {
    if (!shouldBuildChannelData) return [];
    const total = channelMetricAgg.reduce((acc, cur) => acc + cur.cost, 0);
    let start = 0;

    return channelMetricAgg
      .filter((item) => item.cost > 0)
      .map((item) => {
        const pct = total > 0 ? item.cost / total : 0;
        const angle = pct * 360;
        const segment = {
          key: `cost-${item.channel}`,
          label: item.channel,
          value: item.cost,
          pct,
          startAngle: start,
          endAngle: start + angle,
          color: channelColor(item.channel),
        };
        start += angle;
        return segment;
      });
  }, [channelMetricAgg, shouldBuildChannelData]);

  const roasBarData = useMemo(() => {
    if (!shouldBuildChannelData) return [] as ChannelMetricAgg[];
    return [...channelMetricAgg]
      .filter((item) => item.cost > 0 || item.revenue > 0)
      .sort((a, b) => b.roas - a.roas);
  }, [channelMetricAgg, shouldBuildChannelData]);

  const cpaBarData = useMemo(() => {
    if (!shouldBuildChannelData) return [] as ChannelMetricAgg[];
    return [...channelMetricAgg]
      .filter((item) => item.cost > 0 || item.conversions > 0)
      .sort((a, b) => {
        const aScore = a.cpa > 0 ? a.cpa : Number.POSITIVE_INFINITY;
        const bScore = b.cpa > 0 ? b.cpa : Number.POSITIVE_INFINITY;
        return aScore - bScore;
      });
  }, [channelMetricAgg, shouldBuildChannelData]);

  const commerceChannelInsights = useMemo(() => {
    if (!shouldBuildChannelData) return [] as ChannelInsightNarrative[];
    if (!isCommerce) return [];
    return buildCommerceChannelInsights(channelMetricAgg);
  }, [channelMetricAgg, isCommerce, shouldBuildChannelData]);

  if (!rows?.length) {
    return (
      <section className="mt-0 pt-8">
        <div className="rounded-2xl border border-gray-200 bg-white px-2 py-10 text-sm text-[#7A8794] shadow-sm">
          표시할 데이터가 없습니다.
        </div>
      </section>
    );
  }

  const uniqueDevices = Array.from(
    new Set(channelDeviceAgg.map((x) => x.device)),
  );
  const sankeyCollapsed = uniqueDevices.length <= 1;
  const totalConversions = channelMetricAgg.reduce(
    (acc, cur) => acc + cur.conversions,
    0,
  );
  const totalRevenue = channelMetricAgg.reduce(
    (acc, cur) => acc + cur.revenue,
    0,
  );
  const totalCost = channelMetricAgg.reduce((acc, cur) => acc + cur.cost, 0);

  const selectedMetricLabel =
    metricButtons.find((m) => m.key === metric)?.label ?? "-";

  const heatmapOverview = heatmapSummary.bestDay
    ? `${selectedMetricLabel} 최고일 ${heatmapSummary.bestDay.dateKey}`
    : `${selectedMetricLabel} 데이터 없음`;

  const funnelOverview = currentFunnelPoint
    ? `기준일 ${currentFunnelPoint.dateKey} · 단계 ${funnelData.length}개`
    : "기준일 데이터 없음";

  const sankeyOutcomeLabel = isDbAcquisition ? "전환" : "매출";
  const sankeyOutcomeFormatter = isDbAcquisition
    ? (v: number) => formatCount(v)
    : (v: number) => KRW(v);

  const sankeyOverview =
    sankeyData.totalValue > 0
      ? `채널 ${channelOutcome.length}개 · 기기 ${deviceOutcome.length}개`
      : "흐름 데이터 없음";

  const topRevenueChannel =
    revenueDonutData.length > 0 ? (revenueDonutData[0]?.label ?? "-") : "-";

  const topConversionChannel =
    conversionDonutData.length > 0
      ? (conversionDonutData[0]?.label ?? "-")
      : "-";

  const topCostChannel =
    costDonutData.length > 0 ? (costDonutData[0]?.label ?? "-") : "-";

  const topRoasChannel =
    roasBarData.length > 0 ? (roasBarData[0]?.channel ?? "-") : "-";

  const bestCpaChannel =
    cpaBarData.length > 0 ? (cpaBarData[0]?.channel ?? "-") : "-";

  const heatThresholds = useMemo(() => {
    if (!shouldBuildHeatmapData) {
          return buildHeatThresholds([]);
        }
    return buildHeatThresholds(metricValues);
  }, [metricValues, shouldBuildHeatmapData]);

  const heatmapRows = useMemo<HeatmapRenderCell[][]>(() => {
    if (!shouldBuildHeatmapData) return [];
    return Array.from({ length: 7 }).map((_, dayIdx) =>
      calendar.weeks.map((week, weekIdx) => {
        const date = week[dayIdx];
        const cellKey = ymd(date);
        const agg = dailyMap.get(cellKey) ?? null;
        const value = agg ? Number(agg[metric] ?? 0) : 0;
        const level = quantizeWithThresholds(value, heatThresholds);

        return {
          id: `${cellKey}-${weekIdx}`,
          cellKey,
          dateKey: cellKey,
          agg,
          value,
          level,
        };
      }),
    );
  }, [calendar.weeks, dailyMap, metric, heatThresholds, shouldBuildHeatmapData]);

  const handleHeatHoverStart = useCallback((key: string, hasAgg: boolean) => {
    if (!hasAgg) return;
    setHeatHoverKey((prev) => (prev === key ? prev : key));
  }, []);

  const handleHeatHoverEnd = useCallback(() => {
    setHeatHoverKey((prev) => (prev === null ? prev : null));
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!funnelTimeline.length) return;
    setIsPlaying((prev) => !prev);
  }, [funnelTimeline.length]);

  const handleScrubChange = useCallback((next: number) => {
    setIsPlaying(false);
    setPlayIndex(next);
  }, []);

  const handleMetricChange = useCallback((next: HeatmapMetricKey) => {
    setMetric((prev) => (prev === next ? prev : next));
  }, []);

  const heatmapBadge = isTraffic
    ? "TRAFFIC HEATMAP"
    : isDbAcquisition
      ? "ACQUISITION HEATMAP"
      : "HEATMAP";

  const heatmapDescription = isTraffic
    ? "현재 필터가 적용된 데이터 기준으로 유입 성과 강도를 일자별로 확인합니다."
    : isDbAcquisition
      ? "현재 필터가 적용된 데이터 기준으로 리드 확보 효율을 일자별로 확인합니다."
      : "현재 필터가 적용된 데이터 기준으로 일자별 성과 강도를 확인합니다.";

  const funnelBadge = isDbAcquisition ? "ACQUISITION FUNNEL" : "FUNNEL";
  const funnelTitle = isDbAcquisition ? "리드 확보 퍼널" : "성과 퍼널";
  const funnelDescription = isDbAcquisition
    ? "노출부터 클릭, 전환까지의 흐름을 기준일 단위로 확인합니다."
    : "현재 필터가 적용된 데이터 기준으로 요약합니다.";

  return (
    <section className="mt-2">
      <div className="space-y-10 pt-4">
        {shouldRenderHeatmapSlide ? (
          <div
            className={isHeatmapSlideActive ? "block" : "hidden"}
            aria-hidden={!isHeatmapSlideActive}
          >
          <div className="overflow-hidden rounded-[20px] border border-[var(--nature-border-blue)] bg-white shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
            <div className="border-b border-[var(--nature-border)] px-6 py-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="mb-2">
                    <span className="inline-flex items-center rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/20 px-2.5 py-1 text-[10px] font-semibold tracking-[0.10em] text-[#5F87A3]">
                      {heatmapBadge}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-[#27364A]">
                    일자별 성과 히트맵
                  </h3>
                  <p className="mt-1 text-sm text-[#7A8794]">
                    {heatmapDescription}
                  </p>
                </div>

                <div className="flex min-w-[240px] flex-col gap-3 xl:items-end">
                  <div className="rounded-[14px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A8F81]">
                      Overview
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#27364A]">
                      {heatmapOverview}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {metricButtons.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleMetricChange(item.key)}
                        className={[
                          "rounded-[10px] border px-4 py-2 text-sm font-semibold",
                          metric === item.key
                            ? "border-[var(--nature-blue)] bg-[var(--nature-blue)] text-white"
                            : "border-[var(--nature-border-blue)] bg-white text-slate-700 hover:bg-[var(--nature-blue-light)]/12",
                        ].join(" ")}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[14px] border border-slate-200/85 bg-slate-50/55 px-4 py-4">
                  <div className="text-xs text-[#7A8794]">활성 일수</div>
                  <div className="mt-2 text-2xl font-semibold text-[#27364A]">
                    {heatmapSummary.activeDays}일
                  </div>
                </div>

                <div className="rounded-[14px] border border-slate-200/85 bg-slate-50/55 px-4 py-4">
                  <div className="text-xs text-[#7A8794]">평균</div>
                  <div className="mt-2 text-2xl font-semibold text-[#27364A]">
                    {formatMetricValue(metric, heatmapSummary.avgValue)}
                  </div>
                </div>

                <div className="rounded-[14px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 px-4 py-4">
                  <div className="text-xs text-[#7A8794]">최대</div>
                  <div className="mt-2 text-2xl font-semibold text-[#27364A]">
                    {formatMetricValue(metric, heatmapSummary.maxValue)}
                  </div>
                </div>

                <div className="rounded-[14px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/10 px-4 py-4">
                  <div className="text-xs text-[#7A8794]">최고 성과 일자</div>
                  <div className="mt-2 text-lg font-semibold text-[#27364A]">
                    {heatmapSummary.bestDay?.dateKey ?? "-"}
                  </div>
                  <div className="mt-1 text-sm text-[#7A8794]">
                    {heatmapSummary.bestDay
                      ? formatMetricValue(
                          metric,
                          Number(heatmapSummary.bestDay[metric] ?? 0),
                        )
                      : "-"}
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-3">
                  <div className="shrink-0">
                    <div className="h-6" />
                    <div className="h-6" />
                    <div className="space-y-[6px]">
                      {Array.from({ length: 7 }).map((_, dayIdx) => (
                        <div
                          key={`weekday-${dayIdx}`}
                          className="flex h-10 items-center justify-start pr-2 text-sm font-semibold text-[#7A8794]"
                        >
                          {dayLabelKor(dayIdx)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 overflow-hidden">
                    <div
                      className="grid gap-[6px]"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(
                          calendar.weeks.length,
                          1,
                        )}, minmax(0, 1fr))`,
                      }}
                    >
                      {calendar.monthRow.map((label, idx) => (
                        <div
                          key={`month-row-${idx}`}
                          className="flex h-6 items-center text-xs font-semibold tracking-[0.02em] text-[#7A8794]"
                        >
                          {label}
                        </div>
                      ))}

                      {calendar.weeks.map((week, weekIdx) => (
                        <div
                          key={`week-header-${weekIdx}`}
                          className="flex h-6 items-center justify-center text-center text-[11px] font-medium text-[#9A8F81]"
                        >
                          {week[0].getMonth() + 1}/{week[0].getDate()}
                        </div>
                      ))}

                      {heatmapRows.map((row, dayIdx) => (
                        <Fragment key={`row-${dayIdx}`}>
                          {row.map((cell: HeatmapRenderCell) => {
                            const isHovered = heatHoverKey === cell.cellKey;
                            const isDimmed =
                              heatHoverKey !== null &&
                              heatHoverKey !== cell.cellKey;

                            return (
                              <HeatmapCell
                                key={cell.id}
                                cellKey={cell.cellKey}
                                dateKey={cell.dateKey}
                                agg={cell.agg}
                                value={cell.value}
                                level={cell.level}
                                isHovered={isHovered}
                                isDimmed={isDimmed}
                                metric={metric}
                                mode={mode}
                                selectedMetricLabel={selectedMetricLabel}
                                onHoverStart={handleHeatHoverStart}
                                onHoverEnd={handleHeatHoverEnd}
                              />
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[var(--nature-border-blue)] bg-slate-50/45 px-4 py-3">
                <div className="text-sm text-[#6F7B86]">
                  선택 지표:{" "}
                  <span className="rounded-full border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/22 px-2.5 py-1 text-xs font-semibold text-[#4F7F9E]">
                    {selectedMetricLabel}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-[#7A8794]">
                    <span>낮음</span>
                    {HEAT_LEGEND_PALETTE.map((klass, idx) => (
                      <span
                        key={`heat-legend-${idx}`}
                        className={`h-5 w-5 rounded-md border ${klass}`}
                      />
                    ))}
                    <span>높음</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        ) : null}

        {shouldRenderFlowSlide ? (
          <div
            className={isFlowSlideActive ? "block" : "hidden"}
            aria-hidden={!isFlowSlideActive}
          >
          {!isTraffic ? (
            <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
              <FunnelCard
                items={funnelData}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                currentDateLabel={currentFunnelPoint?.dateKey ?? "-"}
                totalDates={funnelTimeline.length}
                playIndex={playIndex}
                maxIndex={Math.max(0, funnelTimeline.length - 1)}
                onScrubChange={handleScrubChange}
                transitionBadges={funnelTransitionBadges}
                badge={funnelBadge}
                title={funnelTitle}
                description={funnelDescription}
              />

              <div className="flex min-w-0 flex-col rounded-[20px] border border-[var(--nature-border-blue)] bg-white shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
                <div className="border-b border-[var(--nature-border)] px-6 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="mb-2">
                        <span className="inline-flex items-center rounded-full border border-[#B7D7E3]/70 bg-[#B7D7E3]/22 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-[#5F87A3]">
                          {isDbAcquisition ? "ACQUISITION FLOW" : "SANKEY"}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-[#27364A]">
                        {isDbAcquisition
                          ? "채널 → 기기 → 전환 흐름"
                          : "채널 → 기기 → 매출 흐름"}
                      </h3>
                      <p className="mt-1 text-sm text-[#7A8794]">
                        {isDbAcquisition
                          ? "현재 필터가 적용된 데이터 기준으로, 어떤 채널의 전환이 어떤 기기에서 발생했는지 흐름으로 보여줍니다."
                          : "현재 필터가 적용된 데이터 기준으로, 어떤 채널의 매출이 어떤 기기에서 발생했는지 흐름으로 보여줍니다."}
                      </p>
                    </div>

                    <div className="min-w-[220px] rounded-[16px] border border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/12 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Overview
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#27364A]">
                        {sankeyOverview}
                      </div>
                    </div>
                  </div>

                  {sankeyCollapsed ? (
                    <div className="mt-3 rounded-[14px] border border-[var(--nature-border)] bg-[var(--nature-cream)]/28 px-4 py-3 text-sm text-stone-700">
                      현재 데이터는 기기 값이 1개만 보여 중간 기기 구간이
                      단순하게 보일 수 있습니다.
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col justify-between px-6 py-4">
                  {sankeyData.totalValue > 0 ? (
                    <div className="flex justify-center pb-5 pt-8">
                      <div className="w-full max-w-[800px]">
                        <svg
                          viewBox="0 0 800 270"
                          className="h-auto w-full"
                          role="img"
                          aria-label={
                            isDbAcquisition
                              ? "채널에서 기기를 거쳐 전환으로 이어지는 흐름 차트"
                              : "채널에서 기기를 거쳐 매출로 이어지는 흐름 차트"
                          }
                        >
                          {sankeyLayout.links.map((link, idx) => (
                            <path
                              key={`link-${idx}`}
                              d={link.path}
                              fill={link.fill}
                              stroke="rgba(255,255,255,0.55)"
                              strokeWidth="0.6"
                              className="opacity-90 hover:opacity-100"
                            >
                              <title>
                                {`${link.source} → ${link.target}\n${sankeyOutcomeLabel}: ${sankeyOutcomeFormatter(
                                  link.value,
                                )}`}
                              </title>
                            </path>
                          ))}

                          {sankeyLayout.channels.map((node) => (
                            <g key={`channel-${node.key}`}>
                              <rect
                                x={node.x}
                                y={node.y}
                                width={node.width}
                                height={node.height}
                                rx="5"
                                fill={node.color}
                                stroke="#FFFFFF"
                                strokeWidth="1"
                              />
                              <text
                                x={node.x - 8}
                                y={node.centerY}
                                textAnchor="end"
                                dominantBaseline="middle"
                                fontSize="12"
                                fontWeight="600"
                                fill="#475569"
                              >
                                {node.label}
                              </text>
                            </g>
                          ))}

                          {sankeyLayout.devices.map((node) => (
                            <g key={`device-${node.key}`}>
                              <rect
                                x={node.x}
                                y={node.y}
                                width={node.width}
                                height={node.height}
                                rx="5"
                                fill={node.color}
                                fillOpacity="0.72"
                                stroke="#FFFFFF"
                                strokeWidth="1"
                              />
                              <text
                                x={node.x + node.width + 8}
                                y={node.centerY}
                                textAnchor="start"
                                dominantBaseline="middle"
                                fontSize="12"
                                fontWeight="600"
                                fill="#475569"
                              >
                                {node.label}
                              </text>
                            </g>
                          ))}

                          {sankeyLayout.outcomeNode.map((node) => (
                            <g key={`outcome-${node.key}`}>
                              <rect
                                x={node.x}
                                y={node.y}
                                width={node.width}
                                height={node.height}
                                rx="5"
                                fill={node.color}
                                stroke="#FFFFFF"
                                strokeWidth="1"
                              />
                              <text
                                x={node.x + node.width + 8}
                                y={node.centerY}
                                textAnchor="start"
                                dominantBaseline="middle"
                                fontSize="12"
                                fontWeight="700"
                                fill="#334155"
                              >
                                {sankeyOutcomeFormatter(node.value)}
                              </text>
                            </g>
                          ))}
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-[var(--nature-border)] bg-[var(--nature-cream)]/18 px-6 py-10 text-sm text-[#7A8794]">
                      {isDbAcquisition
                        ? "흐름 차트를 표시할 전환 데이터가 없습니다."
                        : "Sankey 차트를 표시할 매출 데이터가 없습니다."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          </div>
        ) : null}

        {shouldRenderChannelSlide ? (
          <div
            className={isChannelSlideActive ? "block" : "hidden"}
            aria-hidden={!isChannelSlideActive}
          >
          {!isTraffic ? (
            isDbAcquisition ? (
              <div className="grid gap-6 xl:grid-cols-3">
                <DonutCard
                  title="채널별 리드 비중"
                  description="전체 전환 중 각 채널이 차지하는 비중입니다."
                  totalLabel="총 전환"
                  totalValue={totalConversions}
                  items={conversionDonutData}
                  valueFormatter={(v) => formatCount(v)}
                  badge="LEAD MIX"
                  overview={`Top channel ${topConversionChannel}`}
                />

                <DonutCard
                  title="채널별 광고비 비중"
                  description="전체 광고비 중 각 채널이 차지하는 비중입니다."
                  totalLabel="총 광고비"
                  totalValue={totalCost}
                  items={costDonutData}
                  valueFormatter={(v) => KRW(v)}
                  badge="COST MIX"
                  overview={`Top channel ${topCostChannel}`}
                />

                <EfficiencyBarCard
                  items={cpaBarData}
                  badge="CPA COMPARE"
                  overview={`Best CPA ${bestCpaChannel}`}
                  title="채널별 CPA 비교"
                  description="채널별 광고비 ÷ 전환수 기준으로 계산한 CPA입니다."
                  primaryMetricLabel="CPA"
                  primaryMetricFormatter={(v) => KRW(v)}
                  primaryMetricValue={(item) => item.cpa}
                  sortValue={(item) =>
                    item.cpa > 0 ? Math.max(1, 1 / item.cpa) : 0
                  }
                  secondaryLabel="광고비"
                  secondaryValue={(item) => item.cost}
                  secondaryFormatter={(v) => KRW(v)}
                  tertiaryLabel="CVR"
                  tertiaryValue={(item) => item.cvr}
                  tertiaryFormatter={(v) => formatPercentFromRate(v, 1)}
                  emptyMessage="CPA 비교용 데이터가 없습니다."
                />
              </div>
            ) : (
              <>
                <div className="grid gap-6 xl:grid-cols-3">
                  <DonutCard
                    title="채널별 매출 비중"
                    description="전체 매출 중 각 채널이 차지하는 비중입니다."
                    totalLabel="총 매출"
                    totalValue={totalRevenue}
                    items={revenueDonutData}
                    valueFormatter={(v) => KRW(v)}
                    badge="REVENUE MIX"
                    overview={`Top channel ${topRevenueChannel}`}
                  />

                  <DonutCard
                    title="채널별 전환 비중"
                    description="전체 전환 중 각 채널이 차지하는 비중입니다."
                    totalLabel="총 전환"
                    totalValue={totalConversions}
                    items={conversionDonutData}
                    valueFormatter={(v) => formatCount(v)}
                    badge="CONVERSION MIX"
                    overview={`Top channel ${topConversionChannel}`}
                  />

                  <EfficiencyBarCard
                    items={roasBarData}
                    badge="ROAS COMPARE"
                    overview={`Best ROAS ${topRoasChannel}`}
                    title="채널별 ROAS 비교"
                    description="채널별 총매출 ÷ 총광고비 기준으로 계산한 ROAS입니다."
                    primaryMetricLabel="ROAS"
                    primaryMetricFormatter={(v) => formatPercentFromRoas(v, 1)}
                    primaryMetricValue={(item) => item.roas}
                    sortValue={(item) => item.roas}
                    secondaryLabel="매출"
                    secondaryValue={(item) => item.revenue}
                    secondaryFormatter={(v) => KRW(v)}
                    tertiaryLabel="전환수"
                    tertiaryValue={(item) => item.conversions}
                    tertiaryFormatter={(v) => formatCount(v)}
                    emptyMessage="ROAS 비교용 데이터가 없습니다."
                  />
                </div>

                <ChannelInsightPanel items={commerceChannelInsights} />
              </>
            )
          ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

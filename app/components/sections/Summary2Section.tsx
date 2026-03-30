"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  KRW,
  toSafeNumber,
  formatPercentFromRate,
  formatPercentFromRoas,
  formatCount,
  diffRatio,
  formatDeltaPercentFromRatio,
} from "../../../src/lib/report/format";

type Props = {
  reportType?: "commerce" | "traffic";
  rows: any[];
};

type HeatmapMetricKey =
  | "revenue"
  | "roas"
  | "conversions"
  | "cost"
  | "clicks"
  | "impressions";

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
  targetType: "device" | "revenue";
};

type ChannelDeviceAgg = {
  channel: string;
  device: string;
  revenue: number;
};

type ChannelMetricAgg = {
  channel: string;
  revenue: number;
  conversions: number;
  cost: number;
  roas: number;
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
  v: number
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

function quantize(value: number, values: number[]) {
  const positives = values
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!positives.length || value <= 0) return 0;
  if (positives.length === 1) return 5;

  const p20 =
    positives[
      Math.min(
        positives.length - 1,
        Math.floor((positives.length - 1) * 0.2)
      )
    ];
  const p40 =
    positives[
      Math.min(
        positives.length - 1,
        Math.floor((positives.length - 1) * 0.4)
      )
    ];
  const p60 =
    positives[
      Math.min(
        positives.length - 1,
        Math.floor((positives.length - 1) * 0.6)
      )
    ];
  const p80 =
    positives[
      Math.min(
        positives.length - 1,
        Math.floor((positives.length - 1) * 0.8)
      )
    ];

  if (value <= p20) return 1;
  if (value <= p40) return 2;
  if (value <= p60) return 3;
  if (value <= p80) return 4;
  return 5;
}

function heatColorClass(level: number) {
  if (level <= 0) return "bg-gray-100 border-gray-200";
  if (level === 1) return "bg-orange-100 border-orange-100";
  if (level === 2) return "bg-orange-200 border-orange-200";
  if (level === 3) return "bg-orange-300 border-orange-300";
  if (level === 4) return "bg-orange-400 border-orange-400";
  return "bg-orange-600 border-orange-600";
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
    raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
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
  width: number
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

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
) {
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
  endAngle: number
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

function FunnelCard({
  items,
  isPlaying,
  onTogglePlay,
  currentDateLabel,
  totalDates,
  playIndex,
  maxIndex,
  onScrubChange,
  transitionBadges,
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
        i === 0 ? "rgba(75,159,173,0.55)" : "rgba(242,153,90,0.55)";

      paths.push({ d: leftPath, stroke }, { d: rightPath, stroke });
    }

    return paths;
  }, [items]);

  const svgHeight =
    items.length > 0 ? items.length * barH + (items.length - 1) * gapH : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-900">성과 퍼널</h3>
        <p className="mt-1 text-sm text-gray-500">
          현재 필터가 적용된 데이터 기준으로 요약합니다.
        </p>
      </div>

      <div className="px-6 py-4 pb-3">
        {items.length > 0 ? (
          <div>
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">
                  기준일:{" "}
                  <span className="font-semibold text-gray-900">
                    {totalDates > 0 ? currentDateLabel : "-"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onTogglePlay}
                  className={[
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    isPlaying
                      ? "border-black bg-black text-white"
                      : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100",
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
                  className="h-2 w-full cursor-pointer rounded-lg accent-black"
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
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeDasharray="3 4"
                    className="transition-all duration-700 ease-in-out"
                  />
                ))}
              </svg>

              <div className="space-y-4">
                {items.map((item, idx) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {item.label}
                      </span>
                      <span className="text-xs font-medium text-gray-500">
                        {item.sharePctText}
                      </span>
                    </div>

                    <div className="relative">
                      <div className="rounded-[28px] border border-gray-200 bg-gray-50 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <div
                          className="flex h-[54px] items-center justify-center rounded-2xl px-3 text-center transition-[width,transform,box-shadow] duration-700 ease-in-out"
                          style={{
                            width: `${item.widthPct}%`,
                            maxWidth: "100%",
                            background: `linear-gradient(135deg, ${
                              item.color
                            } 0%, ${item.color} 72%, ${rgbaFromHex(
                              item.color,
                              0.78
                            )} 100%)`,
                            boxShadow: `0 10px 22px ${rgbaFromHex(
                              item.color,
                              0.24
                            )}`,
                            transform: "translateZ(0)",
                          }}
                          title={[
                            item.label,
                            `값: ${item.displayValue}`,
                            item.sharePctText,
                            item.peakPctText,
                            item.dayDiffText,
                          ].join("\n")}
                        >
                          <div className="text-base font-bold tracking-tight text-gray-900">
                            {item.displayValue}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-1 text-center sm:grid-cols-3">
                      <div className="text-[11px] text-gray-500">
                        {item.sharePctText}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {item.peakPctText}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {item.dayDiffText}
                      </div>
                    </div>

                    {idx < items.length - 1 ? (
                      <div className="flex h-8 items-center justify-center">
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm">
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
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-10 text-sm text-gray-500">
            표시할 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function DonutCard({
  title,
  description,
  totalLabel,
  totalValue,
  items,
  valueFormatter,
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
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-5">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>

      <div className="px-6 py-6">
        {items.length > 0 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center">
              <svg
                viewBox="0 0 260 260"
                className="h-[220px] w-[220px] max-w-full"
              >
                {items.map((item) => {
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
                        item.endAngle
                      )}
                      fill={item.color}
                      onMouseEnter={() => setActiveKey(item.key)}
                      onMouseLeave={() => setActiveKey(null)}
                      className="cursor-pointer transition-all duration-200"
                      style={{
                        opacity: isDimmed ? 0.28 : 1,
                        filter: isActive
                          ? "drop-shadow(0 0 10px rgba(15, 23, 42, 0.18))"
                          : "none",
                        transform: isActive ? "scale(1.03)" : "scale(1)",
                        transformOrigin: "130px 130px",
                      }}
                    >
                      <title>
                        {`${item.label}\n값: ${valueFormatter(
                          item.value
                        )}\n비중: ${formatPercentFromRate(item.pct, 1)}`}
                      </title>
                    </path>
                  );
                })}

                <circle cx="130" cy="130" r="44" fill="white" />

                <text
                  x="130"
                  y="118"
                  textAnchor="middle"
                  fontSize="12"
                  fill="#6b7280"
                  fontWeight="600"
                >
                  {totalLabel}
                </text>

                <text
                  x="130"
                  y="142"
                  textAnchor="middle"
                  fontSize="16"
                  fill="#111827"
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
                      "cursor-pointer rounded-2xl border px-4 py-4 transition-all duration-200",
                      isActive
                        ? "border-gray-400 bg-white shadow-md ring-2 ring-gray-200"
                        : "border-gray-200 bg-gray-50",
                      isDimmed ? "opacity-50" : "opacity-100",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {item.label}
                        </span>
                      </div>

                      <div className="shrink-0 text-sm font-semibold text-gray-900">
                        {formatPercentFromRate(item.pct, 1)}
                      </div>
                    </div>

                    <div className="mt-2 break-all text-center text-xl font-semibold text-gray-900">
                      {valueFormatter(item.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-10 text-sm text-gray-500">
            표시할 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function RoasBarCard({
  items,
}: {
  items: Array<{
    channel: string;
    revenue: number;
    conversions: number;
    cost: number;
    roas: number;
  }>;
}) {
  const maxRoas = Math.max(0, ...items.map((x) => x.roas));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-5">
        <h3 className="text-base font-semibold text-gray-900">채널별 ROAS 비교</h3>
        <p className="mt-1 text-sm text-gray-500">
          채널별 총매출 ÷ 총광고비 기준으로 계산한 ROAS입니다.
        </p>
      </div>

      <div className="px-6 py-6">
        {items.length > 0 ? (
          <div className="space-y-4">
            {items.map((item) => {
              const pct = maxRoas > 0 ? (item.roas / maxRoas) * 100 : 0;
              return (
                <div
                  key={item.channel}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: channelColor(item.channel) }}
                      />
                      <span className="text-sm font-semibold text-gray-900">
                        {item.channel}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatPercentFromRoas(item.roas, 1)}
                    </span>
                  </div>

                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, pct))}%`,
                        backgroundColor: channelColor(item.channel),
                      }}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-gray-500">
                    <div>
                      <div>매출</div>
                      <div className="mt-1 font-semibold text-gray-900">
                        {KRW(item.revenue)}
                      </div>
                    </div>
                    <div>
                      <div>광고비</div>
                      <div className="mt-1 font-semibold text-gray-900">
                        {KRW(item.cost)}
                      </div>
                    </div>
                    <div>
                      <div>전환수</div>
                      <div className="mt-1 font-semibold text-gray-900">
                        {formatCount(item.conversions)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-10 text-sm text-gray-500">
            ROAS 비교용 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Summary2Section({ reportType, rows }: Props) {
  const isTraffic = reportType === "traffic";
  const [metric, setMetric] = useState<HeatmapMetricKey>("cost");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState(0);
  const [heatHoverKey, setHeatHoverKey] = useState<string | null>(null);

  const dailyMap = useMemo(() => {
    const map = new Map<string, DayAgg>();

    for (const r of rows ?? []) {
      const d = parseDateLooseAny(
        r?.date ??
          r?.report_date ??
          r?.day ??
          r?.ymd ??
          r?.dt ??
          r?.segment_date ??
          r?.stat_date
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
        r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv
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
  }, [rows]);

  const dayList = useMemo(() => {
      return Array.from(dailyMap.values()).sort((a, b) =>
        a.dateKey.localeCompare(b.dateKey)
      );
    }, [dailyMap]);

    const metricValues = useMemo(() => {
      return dayList.map((d) => Number(d[metric] ?? 0));
    }, [dayList, metric]);

    const metricButtons: { key: HeatmapMetricKey; label: string }[] = isTraffic
      ? [
          { key: "cost", label: "광고비" },
          { key: "clicks", label: "클릭수" },
          { key: "impressions", label: "노출수" },
        ]
      : [
          { key: "revenue", label: "매출" },
          { key: "roas", label: "ROAS" },
          { key: "conversions", label: "전환수" },
          { key: "cost", label: "광고비" },
          { key: "clicks", label: "클릭수" },
          { key: "impressions", label: "노출수" },
        ];

    useEffect(() => {
      if (!metricButtons.some((item) => item.key === metric)) {
        setMetric(isTraffic ? "cost" : "revenue");
      }
    }, [metric, metricButtons, isTraffic]);

    const calendar = useMemo(() => {
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
  }, [dayList]);

  const heatmapSummary = useMemo(() => {
    const activeDays = metricValues.filter((v) => v > 0).length;
    const maxValue = metricValues.length ? Math.max(...metricValues) : 0;
    const avgValue =
      metricValues.length > 0
        ? metricValues.reduce((acc, cur) => acc + cur, 0) / metricValues.length
        : 0;

    const bestDay =
      dayList.length > 0
        ? [...dayList].sort(
            (a, b) => Number(b[metric] ?? 0) - Number(a[metric] ?? 0)
          )[0]
        : null;

    return {
      activeDays,
      maxValue,
      avgValue,
      bestDay,
    };
  }, [dayList, metricValues, metric]);

  const channelDeviceAgg = useMemo(() => {
    const map = new Map<string, ChannelDeviceAgg>();

    for (const r of rows ?? []) {
      const channel = normalizeChannel(r?.channel ?? r?.source ?? r?.platform);
      const device = normalizeDevice(r?.device);
      const revenue = toSafeNumber(
        r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv
      );

      if (revenue <= 0) continue;

      const key = `${channel}__${device}`;
      const prev = map.get(key);

      if (prev) {
        prev.revenue += revenue;
      } else {
        map.set(key, {
          channel,
          device,
          revenue,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  const channelRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of channelDeviceAgg) {
      map.set(item.channel, (map.get(item.channel) ?? 0) + item.revenue);
    }
    return Array.from(map.entries())
      .map(([channel, revenue]) => ({ channel, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [channelDeviceAgg]);

  const deviceRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of channelDeviceAgg) {
      map.set(item.device, (map.get(item.device) ?? 0) + item.revenue);
    }
    return Array.from(map.entries())
      .map(([device, revenue]) => ({ device, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [channelDeviceAgg]);

  const channelMetricAgg = useMemo(() => {
    const map = new Map<string, ChannelMetricAgg>();

    for (const r of rows ?? []) {
      const channel = normalizeChannel(r?.channel ?? r?.source ?? r?.platform);
      const revenue = toSafeNumber(
        r?.revenue ?? r?.sales ?? r?.purchase_amount ?? r?.gmv
      );
      const conversions = toSafeNumber(r?.conversions ?? r?.conv ?? r?.cv);
      const cost = toSafeNumber(r?.cost ?? r?.spend ?? r?.ad_cost);

      const prev = map.get(channel);

      if (prev) {
        prev.revenue += revenue;
        prev.conversions += conversions;
        prev.cost += cost;
      } else {
        map.set(channel, {
          channel,
          revenue,
          conversions,
          cost,
          roas: 0,
        });
      }
    }

    const list = Array.from(map.values());
    for (const item of list) {
      item.roas = item.cost > 0 ? item.revenue / item.cost : 0;
    }

    return list.sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  const funnelTimeline = useMemo(() => {
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
          r?.stat_date
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
      a.dateKey.localeCompare(b.dateKey)
    );
  }, [rows]);

  useEffect(() => {
    if (!funnelTimeline.length) {
      setPlayIndex(0);
      setIsPlaying(false);
      return;
    }

    if (playIndex > funnelTimeline.length - 1) {
      setPlayIndex(funnelTimeline.length - 1);
    }
  }, [funnelTimeline.length, playIndex]);

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
    if (!funnelTimeline.length) return null;
    const safeIndex = Math.max(
      0,
      Math.min(playIndex, funnelTimeline.length - 1)
    );
    return funnelTimeline[safeIndex];
  }, [funnelTimeline, playIndex]);

  const funnelData = useMemo(() => {
    const point = currentFunnelPoint ?? {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    };

    const safeIndex = Math.max(
      0,
      Math.min(playIndex, Math.max(0, funnelTimeline.length - 1))
    );
    const prevPoint =
      safeIndex > 0
        ? funnelTimeline[safeIndex - 1]
        : { impressions: 0, clicks: 0, cost: 0, conversions: 0 };

    const maxImpressions = Math.max(
      ...funnelTimeline.map((x) => x.impressions),
      1
    );
    const maxClicks = Math.max(...funnelTimeline.map((x) => x.clicks), 1);
    const maxCost = Math.max(...funnelTimeline.map((x) => x.cost), 1);
    const maxConversions = Math.max(
      ...funnelTimeline.map((x) => x.conversions),
      1
    );

    const currentDayMax = Math.max(
      point.impressions,
      point.clicks,
      point.cost,
      point.conversions,
      1
    );

    const diffText = (current: number, prev: number) => {
      if (prev <= 0) {
        if (current > 0) return "전일 대비 신규";
        return "전일 대비 -";
      }
      return `전일 대비 ${formatDeltaPercentFromRatio(
        diffRatio(current, prev),
        1
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
          1
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
      },
    ];

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
        1
      ),
      peakPctText: `최고일 ${formatCount(maxConversions)}`,
      dayDiffText: diffText(point.conversions, prevPoint.conversions),
    });

    return baseItems;
  }, [currentFunnelPoint, funnelTimeline, playIndex, isTraffic]);

  const funnelTransitionBadges = useMemo(() => {
    const point = currentFunnelPoint ?? {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    };

    const ctr = point.impressions > 0 ? point.clicks / point.impressions : 0;
    const cpc = point.clicks > 0 ? point.cost / point.clicks : 0;
    const cvr = point.clicks > 0 ? point.conversions / point.clicks : 0;

    return isTraffic
      ? [`CTR ${formatPercentFromRate(ctr, 2)}`, `CPC ${KRW(cpc)}`]
      : [
          `CTR ${formatPercentFromRate(ctr, 2)}`,
          `CVR ${formatPercentFromRate(cvr, 2)}`,
        ];
  }, [currentFunnelPoint, isTraffic]);

  const sankeyData = useMemo(() => {
    const totalRevenue = channelDeviceAgg.reduce(
      (acc, cur) => acc + cur.revenue,
      0
    );

    const linksA: SankeyLink[] = channelDeviceAgg.map((item) => ({
      source: item.channel,
      target: item.device,
      value: item.revenue,
      sourceType: "channel",
      targetType: "device",
    }));

    const linksB: SankeyLink[] = deviceRevenue.map((item) => ({
      source: item.device,
      target: "Revenue",
      value: item.revenue,
      sourceType: "device",
      targetType: "revenue",
    }));

    return {
      totalRevenue,
      links: [...linksA, ...linksB],
    };
  }, [channelDeviceAgg, deviceRevenue]);

  const sankeyLayout = useMemo(() => {
    const width = 800;
    const height = 270;
    const nodeWidth = 18;
    const topPad = 20;
    const bottomPad = 16;
    const usableHeight = height - topPad - bottomPad;
    const gap = 12;
    const minNodeH = 20;
    const totalRevenue = Math.max(sankeyData.totalRevenue, 1);

    const buildColumn = (
      items: { key: string; label: string; value: number; color: string }[]
    ) => {
      const valueSum = Math.max(
        items.reduce((acc, cur) => acc + cur.value, 0),
        1
      );

      const rawHeights = items.map((item) =>
        Math.max(
          minNodeH,
          (item.value / valueSum) *
            (usableHeight - gap * Math.max(items.length - 1, 0))
        )
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
      channelRevenue.map((item) => ({
        key: item.channel,
        label: item.channel,
        value: item.revenue,
        color: channelColor(item.channel),
      }))
    ).map((n) => ({ ...n, x: 80 }));

    const devices = buildColumn(
      deviceRevenue.map((item) => ({
        key: item.device,
        label: item.device,
        value: item.revenue,
        color: deviceColor(item.device),
      }))
    ).map((n) => ({ ...n, x: 355 }));

    const revenueNode = [
      {
        key: "Revenue",
        label: "Revenue",
        value: totalRevenue,
        color: "#111827",
        x: 690,
        y: topPad + 22,
        width: nodeWidth,
        height: Math.max(usableHeight - 44, 90),
        centerY: topPad + 22 + Math.max(usableHeight - 44, 90) / 2,
      },
    ];

    const channelMap = new Map(channels.map((n) => [n.key, n]));
    const deviceMap = new Map(devices.map((n) => [n.key, n]));
    const revenueMap = new Map(revenueNode.map((n) => [n.key, n]));

    const sourceOffsets = new Map<string, number>();
    const targetOffsets = new Map<string, number>();

    const thickness = (value: number) => {
      const t = (value / totalRevenue) * (usableHeight - 24);
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
          : revenueMap.get(link.target);

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
          widthPx
        ),
        fill:
          link.sourceType === "channel"
            ? rgbaFromHex(sourceColor, 0.35)
            : rgbaFromHex(deviceColor(link.source), 0.35),
      };
    });

    return {
      width,
      height,
      channels,
      devices,
      revenueNode,
      links: links.filter(Boolean) as Array<
        SankeyLink & { widthPx: number; path: string; fill: string }
      >,
    };
  }, [channelRevenue, deviceRevenue, sankeyData]);

  const revenueDonutData = useMemo(() => {
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
  }, [channelMetricAgg]);

  const conversionDonutData = useMemo(() => {
    const total = channelMetricAgg.reduce(
      (acc, cur) => acc + cur.conversions,
      0
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
  }, [channelMetricAgg]);

  const roasBarData = useMemo(() => {
    return [...channelMetricAgg]
      .filter((item) => item.cost > 0 || item.revenue > 0)
      .sort((a, b) => b.roas - a.roas);
  }, [channelMetricAgg]);

  if (!rows?.length) {
    return (
      <section className="mt-0 pt-8">
        <div className="rounded-2xl border border-gray-200 bg-white px-2 py-10 text-sm text-gray-500 shadow-sm">
          표시할 데이터가 없습니다.
        </div>
      </section>
    );
  }

  const uniqueDevices = Array.from(
    new Set(channelDeviceAgg.map((x) => x.device))
  );
  const sankeyCollapsed = uniqueDevices.length <= 1;
  const totalConversions = channelMetricAgg.reduce(
    (acc, cur) => acc + cur.conversions,
    0
  );

  return (
    <section className="mt-2">
      <div className="space-y-10 pt-4">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  일자별 성과 히트맵
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  현재 필터가 적용된 데이터 기준으로 일자별 성과 강도를 확인합니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {metricButtons.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMetric(item.key)}
                    className={[
                      "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                      metric === item.key
                        ? "border-black bg-black text-white shadow-sm"
                        : "border-gray-300 bg-white text-black hover:bg-gray-100",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4">
                <div className="text-xs text-gray-500">활성 일수</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {heatmapSummary.activeDays}일
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4">
                <div className="text-xs text-gray-500">평균</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {formatMetricValue(metric, heatmapSummary.avgValue)}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4">
                <div className="text-xs text-gray-500">최대</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">
                  {formatMetricValue(metric, heatmapSummary.maxValue)}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4">
                <div className="text-xs text-gray-500">최고 성과 일자</div>
                <div className="mt-2 text-lg font-semibold text-gray-900">
                  {heatmapSummary.bestDay?.dateKey ?? "-"}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {heatmapSummary.bestDay
                    ? formatMetricValue(
                        metric,
                        Number(heatmapSummary.bestDay[metric] ?? 0)
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
                  <div className="space-y-2">
                    {Array.from({ length: 7 }).map((_, dayIdx) => (
                      <div
                        key={`weekday-${dayIdx}`}
                        className="flex h-10 items-center justify-start pr-2 text-sm font-medium text-gray-500"
                      >
                        {dayLabelKor(dayIdx)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden">
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(
                        calendar.weeks.length,
                        1
                      )}, minmax(0, 1fr))`,
                    }}
                  >
                    {calendar.monthRow.map((label, idx) => (
                      <div
                        key={`month-row-${idx}`}
                        className="flex h-6 items-center text-xs font-semibold text-gray-500"
                      >
                        {label}
                      </div>
                    ))}

                    {calendar.weeks.map((week, weekIdx) => (
                      <div
                        key={`week-header-${weekIdx}`}
                        className="flex h-6 items-center justify-center text-center text-[11px] font-medium text-gray-400"
                      >
                        {week[0].getMonth() + 1}/{week[0].getDate()}
                      </div>
                    ))}

                    {Array.from({ length: 7 }).map((_, dayIdx) => (
                      <Fragment key={`row-${dayIdx}`}>
                        {calendar.weeks.map((week, weekIdx) => {
                          const date = week[dayIdx];
                          const key = ymd(date);
                          const agg = dailyMap.get(key) ?? null;
                          const value = agg ? Number(agg[metric] ?? 0) : 0;
                          const level = quantize(value, metricValues);
                          const isHovered = heatHoverKey === key;
                          const isDimmed =
                            heatHoverKey !== null && heatHoverKey !== key;

                          return (
                            <div
                              key={`${key}-${weekIdx}`}
                              onMouseEnter={() => {
                                if (agg) setHeatHoverKey(key);
                              }}
                              onMouseLeave={() => setHeatHoverKey(null)}
                              className={[
                                "group relative h-10 rounded-xl border transition-all duration-150",
                                agg
                                  ? heatColorClass(level)
                                  : "border-transparent bg-white",
                                agg ? "cursor-pointer" : "",
                                isHovered
                                  ? "ring-2 ring-gray-400/40 scale-[1.03]"
                                  : "",
                                isDimmed ? "opacity-55" : "opacity-100",
                              ].join(" ")}
                              title={
                                agg
                                  ? [
                                      `${agg.dateKey}`,
                                      ...(isTraffic
                                        ? [
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
                                          ]),
                                    ].join("\n")
                                  : key
                              }
                            >
                              {agg ? (
                                <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-max -translate-x-1/2 pt-2 group-hover:block">
                                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
                                    <div className="font-semibold text-gray-900">
                                      {agg.dateKey}
                                    </div>
                                    <div className="mt-1 text-gray-600">
                                      {metricButtons.find((m) => m.key === metric)?.label}:{" "}
                                      <span className="font-semibold text-gray-900">
                                        {formatMetricValue(metric, value)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
              <div className="text-sm text-gray-600">
                선택 지표:{" "}
                <span className="font-semibold text-gray-900">
                  {metricButtons.find((m) => m.key === metric)?.label}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>낮음</span>
                <span className="h-5 w-5 rounded-md border border-gray-200 bg-gray-100" />
                <span className="h-5 w-5 rounded-md border border-orange-100 bg-orange-100" />
                <span className="h-5 w-5 rounded-md border border-orange-200 bg-orange-200" />
                <span className="h-5 w-5 rounded-md border border-orange-300 bg-orange-300" />
                <span className="h-5 w-5 rounded-md border border-orange-400 bg-orange-400" />
                <span className="h-5 w-5 rounded-md border border-orange-600 bg-orange-600" />
                <span>높음</span>
              </div>
            </div>
          </div>
        </div>

        {!isTraffic ? (
          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <FunnelCard
              items={funnelData}
              isPlaying={isPlaying}
              onTogglePlay={() => {
                if (!funnelTimeline.length) return;
                setIsPlaying((prev) => !prev);
              }}
              currentDateLabel={currentFunnelPoint?.dateKey ?? "-"}
              totalDates={funnelTimeline.length}
              playIndex={playIndex}
              maxIndex={Math.max(0, funnelTimeline.length - 1)}
              onScrubChange={(next) => {
                setIsPlaying(false);
                setPlayIndex(next);
              }}
              transitionBadges={funnelTransitionBadges}
            />

            <div className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h3 className="text-base font-semibold text-gray-900">
                  채널 → 기기 → 매출 흐름
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  현재 필터가 적용된 데이터 기준으로, 어떤 채널의 매출이 어떤 기기에서
                  발생했는지 흐름으로 보여줍니다.
                </p>
                {sankeyCollapsed ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    현재 데이터는 기기 값이 1개만 보여 Sankey의 중간 기기 구간이 단순하게
                    보일 수 있습니다.
                  </div>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col justify-between px-6 py-4">
                {sankeyData.totalRevenue > 0 ? (
                  <div className="flex justify-center pt-22 pb-6">
                    <div className="w-full max-w-[800px]">
                      <svg
                        viewBox="0 0 800 270"
                        className="h-auto w-full"
                        role="img"
                        aria-label="채널에서 기기로 이어지는 매출 Sankey 차트"
                      >
                        <text
                          x="80"
                          y="18"
                          fontSize="13"
                          fontWeight="700"
                          fill="#374151"
                        >
                          Channel
                        </text>
                        <text
                          x="355"
                          y="18"
                          fontSize="13"
                          fontWeight="700"
                          fill="#374151"
                        >
                          Device
                        </text>
                        <text
                          x="690"
                          y="18"
                          fontSize="13"
                          fontWeight="700"
                          fill="#374151"
                        >
                          Revenue
                        </text>

                        {sankeyLayout.links.map((link, idx) => (
                          <path
                            key={`${link.source}-${link.target}-${idx}`}
                            d={link.path}
                            fill={link.fill}
                          >
                            <title>
                              {`${link.source} → ${link.target}\n매출: ${KRW(
                                link.value
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
                              rx="8"
                              fill={node.color}
                            />
                            <text
                              x={node.x - 8}
                              y={node.centerY}
                              textAnchor="end"
                              dominantBaseline="middle"
                              fontSize="12"
                              fontWeight="600"
                              fill="#374151"
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
                              rx="8"
                              fill={node.color}
                            />
                            <text
                              x={node.x + node.width + 8}
                              y={node.centerY}
                              textAnchor="start"
                              dominantBaseline="middle"
                              fontSize="12"
                              fontWeight="600"
                              fill="#374151"
                            >
                              {node.label}
                            </text>
                          </g>
                        ))}

                        {sankeyLayout.revenueNode.map((node) => (
                          <g key={`revenue-${node.key}`}>
                            <rect
                              x={node.x}
                              y={node.y}
                              width={node.width}
                              height={node.height}
                              rx="8"
                              fill={node.color}
                            />
                            <text
                              x={node.x + node.width + 8}
                              y={node.centerY}
                              textAnchor="start"
                              dominantBaseline="middle"
                              fontSize="12"
                              fontWeight="700"
                              fill="#111827"
                            >
                              {KRW(node.value)}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-10 text-sm text-gray-500">
                    Sankey 차트를 표시할 매출 데이터가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {!isTraffic ? (
          <div className="grid gap-6 xl:grid-cols-3">
            <DonutCard
              title="채널별 매출 비중"
              description="전체 매출 중 각 채널이 차지하는 비중입니다."
              totalLabel="총 매출"
              totalValue={channelMetricAgg.reduce(
                (acc, cur) => acc + cur.revenue,
                0
              )}
              items={revenueDonutData}
              valueFormatter={(v) => KRW(v)}
            />

            <DonutCard
              title="채널별 전환 비중"
              description="전체 전환 중 각 채널이 차지하는 비중입니다."
              totalLabel="총 전환"
              totalValue={totalConversions}
              items={conversionDonutData}
              valueFormatter={(v) => formatCount(v)}
            />

            <RoasBarCard items={roasBarData} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
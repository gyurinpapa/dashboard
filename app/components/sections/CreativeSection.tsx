"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";

import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
  formatPercentFromRoas,
  formatCount,
  formatCurrencyAxisCompact,
  formatPercentAxisFromRoas,
} from "../../../src/lib/report/format";
import DataBarCell from "../ui/DataBarCell";
import { groupByCreative } from "../../../src/lib/report/creative";

type Props = {
  reportType?: "commerce" | "traffic";
  rows: any[];
};

const short = (s: any, n = 7) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

type CreativeAgg = {
  creative: string;
  imagePath?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  conversions: number;
  cvr: number;
  cpa: number;
  revenue: number;
  roas: number;
};

type SortDir = "asc" | "desc";
type SortKey =
  | "creative"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cost"
  | "conversions"
  | "cvr"
  | "cpa"
  | "revenue"
  | "roas";

const SORT_LABEL: Record<SortKey, string> = {
  creative: "Creative",
  impressions: "Impr",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  cost: "Cost",
  conversions: "Conv",
  cvr: "CVR",
  cpa: "CPA",
  revenue: "Revenue",
  roas: "ROAS",
};

const PREVIEW_CARD_WIDTH = 288;
const PREVIEW_OPEN_DELAY = 40;
const PREVIEW_CLOSE_DELAY = 140;

function creativePreviewKey(item: CreativeAgg | null | undefined) {
  if (!item) return "";
  return `${String(item.creative ?? "")}__${String(item.imagePath ?? "")}`;
}

function computePreviewPosition(anchorEl: HTMLElement | null) {
  if (!anchorEl || typeof window === "undefined") {
    return {
      top: 0,
      left: 0,
      placement: "right" as "right" | "left",
    };
  }

  const rect = anchorEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gap = 12;
  const cardWidth = PREVIEW_CARD_WIDTH;
  const estimatedCardHeight = 280;

  const enoughRight = rect.right + gap + cardWidth <= viewportWidth - 12;
  const enoughLeft = rect.left - gap - cardWidth >= 12;

  const placement: "right" | "left" = enoughRight || !enoughLeft ? "right" : "left";

  let left =
    placement === "right"
      ? rect.right + gap
      : rect.left - gap - cardWidth;

  let top = rect.top + rect.height / 2 - estimatedCardHeight / 2;

  const minTop = 12;
  const maxTop = Math.max(12, viewportHeight - estimatedCardHeight - 12);
  top = Math.min(Math.max(top, minTop), maxTop);

  left = Math.max(12, Math.min(left, viewportWidth - cardWidth - 12));

  return { top, left, placement };
}

function SectionHeader({
  badge,
  title,
  description,
  right,
}: {
  badge: string;
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-orange-700">
            {badge}
          </span>
        </div>
        <div className="text-[17px] font-semibold tracking-[-0.02em] text-gray-900">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-gray-500">{description}</div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function ChartCard({
  badge,
  title,
  description,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <SectionHeader badge={badge} title={title} description={description} />
      {children}
    </div>
  );
}

export default function CreativeSection({ reportType, rows }: Props) {
  const isTraffic = reportType === "traffic";

  const creativeAgg: CreativeAgg[] = useMemo(() => {
    const rawAgg = groupByCreative(rows ?? []);

    return (rawAgg ?? []).map((r: any) => {
      const impressions = toSafeNumber(r.impressions ?? r.impr);
      const clicks = toSafeNumber(r.clicks);
      const cost = toSafeNumber(r.cost);
      const conversions = toSafeNumber(r.conversions ?? r.conv);
      const revenue = toSafeNumber(r.revenue);

      const ctr = normalizeRate01(
        r.ctr ?? (impressions > 0 ? clicks / impressions : 0)
      );
      const cvr = normalizeRate01(
        r.cvr ?? (clicks > 0 ? conversions / clicks : 0)
      );
      const cpc = toSafeNumber(r.cpc ?? (clicks > 0 ? cost / clicks : 0));
      const cpa = toSafeNumber(
        r.cpa ?? (conversions > 0 ? cost / conversions : 0)
      );
      const roas = normalizeRoas01(r.roas ?? (cost > 0 ? revenue / cost : 0));

      return {
        creative: String(r.creative ?? ""),
        imagePath: r.imagePath ? String(r.imagePath) : "",
        impressions,
        clicks,
        ctr,
        cpc,
        cost,
        conversions,
        cvr,
        cpa,
        revenue,
        roas,
      };
    });
  }, [rows]);

  const topImpressions = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topClicks = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topCost = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topConv = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topRoas = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCreative, setSelectedCreative] = useState<CreativeAgg | null>(null);

  const [hoveredCreative, setHoveredCreative] = useState<CreativeAgg | null>(null);
  const [previewAnchorEl, setPreviewAnchorEl] = useState<HTMLElement | null>(null);
  const [previewPos, setPreviewPos] = useState(() =>
    computePreviewPosition(null)
  );
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClickHeader = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(k);
    setSortDir(k === "creative" ? "asc" : "desc");
  };

  const clearPreviewTimers = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openPreview = (item: CreativeAgg, anchorEl: HTMLElement) => {
    clearPreviewTimers();
    openTimerRef.current = setTimeout(() => {
      setHoveredCreative(item);
      setPreviewAnchorEl(anchorEl);
      setPreviewPos(computePreviewPosition(anchorEl));
    }, PREVIEW_OPEN_DELAY);
  };

  const closePreview = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setHoveredCreative(null);
      setPreviewAnchorEl(null);
    }, PREVIEW_CLOSE_DELAY);
  };

  const keepPreviewOpen = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const SortArrow = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return (
      <span className="ml-1 inline-block align-middle text-[10px] text-orange-500">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const Th = ({
    k,
    align = "right",
  }: {
    k: SortKey;
    align?: "left" | "right";
  }) => (
    <th
      className={[
        "select-none whitespace-nowrap px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        align === "left" ? "text-left" : "text-right",
        "cursor-pointer border-b border-gray-200 text-gray-500 transition hover:bg-gray-100/80 hover:text-gray-700",
      ].join(" ")}
      onClick={() => onClickHeader(k)}
      title={`정렬: ${SORT_LABEL[k]}`}
    >
      {SORT_LABEL[k]}
      <SortArrow k={k} />
    </th>
  );

  const tableRows = useMemo(() => {
    const sorted = [...creativeAgg].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "creative") {
        return dir * a.creative.localeCompare(b.creative, "ko");
      }
      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;
      return dir * (toSafeNumber(av) - toSafeNumber(bv));
    });

    return sorted.slice(0, 50);
  }, [creativeAgg, sortKey, sortDir]);

  const maxImpr = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.impressions))),
    [tableRows]
  );

  const maxClicks = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.clicks))),
    [tableRows]
  );

  const maxCost = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.cost))),
    [tableRows]
  );

  const maxConv = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.conversions))),
    [tableRows]
  );

  const maxRev = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.revenue))),
    [tableRows]
  );

  useEffect(() => {
    if (!selectedCreative) return;

    const exists = creativeAgg.some(
      (item) =>
        item.creative === selectedCreative.creative &&
        String(item.imagePath ?? "") === String(selectedCreative.imagePath ?? "")
    );

    if (!exists) {
      setSelectedCreative(null);
    }
  }, [creativeAgg, selectedCreative]);

  useEffect(() => {
    if (!hoveredCreative) return;

    const exists = creativeAgg.some(
      (item) =>
        item.creative === hoveredCreative.creative &&
        String(item.imagePath ?? "") === String(hoveredCreative.imagePath ?? "")
    );

    if (!exists) {
      setHoveredCreative(null);
      setPreviewAnchorEl(null);
    }
  }, [creativeAgg, hoveredCreative]);

  useEffect(() => {
    if (!hoveredCreative || !previewAnchorEl) return;

    const updatePosition = () => {
      setPreviewPos(computePreviewPosition(previewAnchorEl));
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [hoveredCreative, previewAnchorEl]);

  useEffect(() => {
    return () => {
      clearPreviewTimers();
    };
  }, []);

  const previewKey = creativePreviewKey(hoveredCreative);
  const hasPreviewImage =
    !!hoveredCreative?.imagePath && !imageErrorMap[previewKey];

  const tableBadge = useMemo(() => {
    if (!selectedCreative) return "전체";
    return selectedCreative.creative || "선택됨";
  }, [selectedCreative]);

  return (
    <section className="mt-2 space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {isTraffic ? (
          <>
            <ChartCard
              badge="Creative Ranking"
              title="노출수 TOP20 소재"
              description="노출 기여도가 높은 소재를 빠르게 비교할 수 있도록 정리했습니다."
            >
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topImpressions}
                    layout="vertical"
                    margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="impressions"
                      onClick={(_: any, idx: number) => {
                        const item = topImpressions?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="impressions"
                        position="right"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              badge="Creative Ranking"
              title="클릭수 TOP20 소재"
              description="실제 유입 반응이 많이 발생한 소재를 중심으로 확인할 수 있습니다."
            >
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topClicks}
                    layout="vertical"
                    margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="clicks"
                      onClick={(_: any, idx: number) => {
                        const item = topClicks?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="clicks"
                        position="right"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              badge="Creative Ranking"
              title="비용 TOP20 소재"
              description="예산이 많이 집행된 소재를 기준으로 운영 집중도를 살펴봅니다."
            >
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topCost}
                    layout="vertical"
                    margin={{ top: 6, right: 82, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => KRW(v)}
                    />
                    <Bar
                      dataKey="cost"
                      onClick={(_: any, idx: number) => {
                        const item = topCost?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="cost"
                        position="right"
                        formatter={(v: any) => KRW(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </>
        ) : (
          <>
            <ChartCard
              badge="Creative Ranking"
              title="클릭수 TOP20 소재"
              description="유입을 가장 많이 만든 소재를 우선순위 기준으로 정리했습니다."
            >
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topClicks}
                    layout="vertical"
                    margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="clicks"
                      onClick={(_: any, idx: number) => {
                        const item = topClicks?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="clicks"
                        position="right"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              badge="Creative Ranking"
              title="전환수 TOP20 소재"
              description="전환 기여도가 높은 소재를 중심으로 효율 우선순위를 파악합니다."
            >
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topConv}
                    layout="vertical"
                    margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="conversions"
                      onClick={(_: any, idx: number) => {
                        const item = topConv?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="conversions"
                        position="right"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              badge="Creative Ranking"
              title="ROAS TOP20 소재"
              description="매출 효율이 좋은 소재를 빠르게 식별할 수 있도록 정리했습니다."
            >
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topRoas}
                    layout="vertical"
                    margin={{ top: 6, right: 82, left: 0, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatPercentAxisFromRoas(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={100}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatPercentFromRoas(v, 1)}
                    />
                    <Bar
                      dataKey="roas"
                      onClick={(_: any, idx: number) => {
                        const item = topRoas?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="roas"
                        position="right"
                        formatter={(v: any) => formatPercentFromRoas(v, 1)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </>
        )}
      </div>

      <section>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader
            badge="Creative Table"
            title="소재 상세 성과"
            description="정렬 기준에 따라 주요 소재 성과를 비교하고, 마우스를 올리면 미리보기를 확인할 수 있습니다."
            right={
              <span className="inline-flex max-w-[280px] items-center truncate rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-600">
                {tableBadge}
              </span>
            }
          />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-400">
              선택한 정렬 기준으로 Top50 소재가 표시됩니다.
            </div>
            <div className="text-xs text-gray-400">
              소재명에 마우스를 올리면 이미지 미리보기가 나타납니다.
            </div>
          </div>

          <div className="overflow-auto rounded-2xl border border-gray-200/90 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur">
                <tr>
                  <Th k="creative" align="left" />
                  <Th k="impressions" />
                  <Th k="clicks" />
                  <Th k="ctr" />
                  <Th k="cpc" />
                  <Th k="cost" />
                  {!isTraffic && <Th k="conversions" />}
                  {!isTraffic && <Th k="cvr" />}
                  {!isTraffic && <Th k="cpa" />}
                  {!isTraffic && <Th k="revenue" />}
                  {!isTraffic && <Th k="roas" />}
                </tr>
              </thead>

              <tbody>
                {tableRows.length === 0 ? (
                  <tr className="border-t border-gray-200">
                    <td
                      className="px-4 py-8 text-center text-sm text-gray-500"
                      colSpan={isTraffic ? 6 : 11}
                    >
                      표시할 소재 데이터가 없습니다. (creative 컬럼을 확인해 주세요)
                    </td>
                  </tr>
                ) : (
                  tableRows.map((r, idx) => {
                    const rowKey = creativePreviewKey(r);

                    return (
                      <tr
                        key={`${r.creative}-${idx}`}
                        className="cursor-pointer border-t border-gray-200 transition hover:bg-orange-50/40"
                        onClick={() => setSelectedCreative(r)}
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 text-left font-medium text-gray-900">
                          <div
                            className="inline-flex max-w-[260px] items-center gap-2"
                            onMouseEnter={(e) =>
                              openPreview(r, e.currentTarget as HTMLElement)
                            }
                            onMouseLeave={closePreview}
                          >
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2 text-[11px] font-semibold text-gray-500">
                              AD
                            </span>

                            <span
                              className="cursor-default truncate underline decoration-dotted underline-offset-4"
                              title={r.creative || "(empty)"}
                            >
                              {r.creative || "(empty)"}
                            </span>

                            {!!r.imagePath ? (
                              <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                                Preview
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                No image
                              </span>
                            )}
                          </div>

                          {hoveredCreative &&
                            rowKey === previewKey &&
                            previewAnchorEl && (
                              <div
                                className="fixed z-[120]"
                                style={{
                                  top: previewPos.top,
                                  left: previewPos.left,
                                  width: PREVIEW_CARD_WIDTH,
                                }}
                                onMouseEnter={keepPreviewOpen}
                                onMouseLeave={closePreview}
                              >
                                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                                  <div className="border-b border-gray-100 px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                                      Creative Preview
                                    </div>
                                    <div
                                      className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900"
                                      title={hoveredCreative.creative || "(empty)"}
                                    >
                                      {hoveredCreative.creative || "(empty)"}
                                    </div>
                                  </div>

                                  <div className="bg-gray-50 p-3">
                                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                                      {hasPreviewImage ? (
                                        <img
                                          src={hoveredCreative.imagePath}
                                          alt={hoveredCreative.creative || "creative preview"}
                                          className="block h-52 w-full object-contain bg-white"
                                          loading="lazy"
                                          onError={() => {
                                            setImageErrorMap((prev) => ({
                                              ...prev,
                                              [previewKey]: true,
                                            }));
                                          }}
                                        />
                                      ) : (
                                        <div className="flex h-52 items-center justify-center bg-gray-50 px-4 text-center">
                                          <div>
                                            <div className="text-sm font-semibold text-gray-500">
                                              미리보기 없음
                                            </div>
                                            <div className="mt-1 text-xs text-gray-400">
                                              이미지 URL이 없거나 로딩에 실패했습니다.
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between px-4 py-3 text-[11px] text-gray-500">
                                    <span className="truncate">
                                      {hoveredCreative.imagePath
                                        ? "이미지 미리보기"
                                        : "Fallback preview"}
                                    </span>
                                    <span
                                      className={[
                                        "rounded-full px-2 py-0.5 font-semibold",
                                        hoveredCreative.imagePath
                                          ? "bg-orange-50 text-orange-600"
                                          : "bg-gray-100 text-gray-500",
                                      ].join(" ")}
                                    >
                                      {hoveredCreative.imagePath ? "IMAGE" : "EMPTY"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                        </td>

                        <td className="px-4 py-3.5">
                          <DataBarCell
                            value={toSafeNumber(r.impressions)}
                            max={maxImpr}
                            label={formatCount(r.impressions)}
                          />
                        </td>

                        <td className="px-4 py-3.5">
                          <DataBarCell
                            value={toSafeNumber(r.clicks)}
                            max={maxClicks}
                            label={formatCount(r.clicks)}
                          />
                        </td>

                        <td className="px-4 py-3.5 text-right text-gray-700">
                          {formatPercentFromRate(r.ctr, 2)}
                        </td>

                        <td className="px-4 py-3.5 text-right text-gray-700">
                          {KRW(r.cpc)}
                        </td>

                        <td className="px-4 py-3.5">
                          <DataBarCell
                            value={toSafeNumber(r.cost)}
                            max={maxCost}
                            label={KRW(r.cost)}
                          />
                        </td>

                        {!isTraffic && (
                          <td className="px-4 py-3.5">
                            <DataBarCell
                              value={toSafeNumber(r.conversions)}
                              max={maxConv}
                              label={formatCount(r.conversions)}
                            />
                          </td>
                        )}

                        {!isTraffic && (
                          <td className="px-4 py-3.5 text-right text-gray-700">
                            {formatPercentFromRate(r.cvr, 2)}
                          </td>
                        )}

                        {!isTraffic && (
                          <td className="px-4 py-3.5 text-right text-gray-700">
                            {KRW(r.cpa)}
                          </td>
                        )}

                        {!isTraffic && (
                          <td className="px-4 py-3.5">
                            <DataBarCell
                              value={toSafeNumber(r.revenue)}
                              max={maxRev}
                              label={KRW(r.revenue)}
                            />
                          </td>
                        )}

                        {!isTraffic && (
                          <td className="px-4 py-3.5 text-right text-gray-700">
                            {formatPercentFromRoas(r.roas, 1)}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            * 표는 선택한 정렬 기준으로 Top50 소재입니다. (월/주/기기/채널 필터 조건에 따라 자동 변경)
          </div>
        </div>
      </section>
    </section>
  );
}
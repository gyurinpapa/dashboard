"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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

type ReportMode = "commerce" | "traffic" | "db_acquisition";

type CreativeSlideIndex = 0 | 1;

type Props = {
  reportType?: ReportMode;
  rows: any[];
  /**
   * 일반 웹 소재 탭 슬라이드 전환용.
   * 전달하지 않으면 기존 전체 콘텐츠를 연속 렌더해 export 경로를 보존한다.
   */
  activeSlide?: CreativeSlideIndex;
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

const EMPTY_CREATIVE_AGG: CreativeAgg[] = [];

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

function resolveReportMode(reportType?: ReportMode): ReportMode {
  if (reportType === "traffic") return "traffic";
  if (reportType === "db_acquisition") return "db_acquisition";
  return "commerce";
}

function getCreativeTableMeta(reportMode: ReportMode) {
  const isTraffic = reportMode === "traffic";
  const isCommerce = reportMode === "commerce";
  const isDbAcquisition = reportMode === "db_acquisition";

  return {
    isTraffic,
    isCommerce,
    isDbAcquisition,
    showConv: !isTraffic,
    showCvr: !isTraffic,
    showCpa: !isTraffic,
    showRevenue: isCommerce,
    showRoas: isCommerce,
    colSpan: isTraffic ? 6 : isDbAcquisition ? 9 : 11,
  };
}

function buildCreativeSummaryInsight(
  reportMode: ReportMode,
  creativeAgg: CreativeAgg[],
) {
  if (!creativeAgg.length) return "";

  const total = creativeAgg.reduce(
    (acc, row) => {
      acc.impressions += toSafeNumber(row.impressions);
      acc.clicks += toSafeNumber(row.clicks);
      acc.cost += toSafeNumber(row.cost);
      acc.conversions += toSafeNumber(row.conversions);
      acc.revenue += toSafeNumber(row.revenue);
      return acc;
    },
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      revenue: 0,
    },
  );

  const byClicks = [...creativeAgg].sort(
    (a, b) => toSafeNumber(b.clicks) - toSafeNumber(a.clicks),
  );
  const byCost = [...creativeAgg].sort(
    (a, b) => toSafeNumber(b.cost) - toSafeNumber(a.cost),
  );
  const byConversions = [...creativeAgg].sort(
    (a, b) => toSafeNumber(b.conversions) - toSafeNumber(a.conversions),
  );
  const byRoas = [...creativeAgg]
    .filter((row) => toSafeNumber(row.cost) > 0)
    .sort((a, b) => toSafeNumber(b.roas) - toSafeNumber(a.roas));
  const byCpa = [...creativeAgg]
    .filter((row) => toSafeNumber(row.conversions) > 0)
    .sort((a, b) => toSafeNumber(a.cpa) - toSafeNumber(b.cpa));
  const byCtr = [...creativeAgg]
    .filter((row) => toSafeNumber(row.impressions) > 0)
    .sort((a, b) => toSafeNumber(b.ctr) - toSafeNumber(a.ctr));

  const topClick = byClicks[0] ?? null;
  const topCost = byCost[0] ?? null;
  const topConversion = byConversions[0] ?? null;
  const topRoas = byRoas[0] ?? null;
  const topCpa = byCpa[0] ?? null;
  const topCtr = byCtr[0] ?? null;

  const costShare =
    topCost && total.cost > 0
      ? toSafeNumber(topCost.cost) / total.cost
      : 0;
  const clickShare =
    topClick && total.clicks > 0
      ? toSafeNumber(topClick.clicks) / total.clicks
      : 0;
  const conversionShare =
    topConversion && total.conversions > 0
      ? toSafeNumber(topConversion.conversions) / total.conversions
      : 0;

  if (reportMode === "traffic") {
    return [
      topClick
        ? `클릭 기여 1위 소재는 “${topClick.creative || "(empty)"}”이며 전체 클릭의 ${formatPercentFromRate(clickShare, 1)}를 차지했습니다.`
        : "클릭 기여를 판단할 소재 데이터가 없습니다.",
      topCtr
        ? `CTR 우수 소재는 “${topCtr.creative || "(empty)"}”로 ${formatPercentFromRate(topCtr.ctr, 2)}를 기록했습니다. 노출량과 함께 확인해 확장 여부를 판단해야 합니다.`
        : "CTR 비교가 가능한 소재 데이터가 없습니다.",
      topCost
        ? `비용 집행 1위 소재는 “${topCost.creative || "(empty)"}”이며 전체 비용의 ${formatPercentFromRate(costShare, 1)}가 집중됐습니다.`
        : "비용 집중도를 판단할 소재 데이터가 없습니다.",
      "운영 우선순위는 클릭 기여가 높은 소재의 메시지·포맷을 확장하되, 비용 집중 소재의 CTR과 CPC를 함께 점검하는 것입니다.",
    ].join("\n");
  }

  if (reportMode === "db_acquisition") {
    return [
      topConversion
        ? `전환 기여 1위 소재는 “${topConversion.creative || "(empty)"}”이며 전체 전환의 ${formatPercentFromRate(conversionShare, 1)}를 만들었습니다.`
        : "전환 기여를 판단할 소재 데이터가 없습니다.",
      topCpa
        ? `CPA 우수 소재는 “${topCpa.creative || "(empty)"}”로 ${KRW(topCpa.cpa)}를 기록했습니다. 전환량이 충분한지 함께 확인해야 합니다.`
        : "CPA 비교가 가능한 전환 소재가 없습니다.",
      topCtr
        ? `클릭 반응이 가장 높은 소재는 “${topCtr.creative || "(empty)"}”이며 CTR은 ${formatPercentFromRate(topCtr.ctr, 2)}입니다.`
        : "CTR 비교가 가능한 소재 데이터가 없습니다.",
      "운영 우선순위는 전환 기여와 CPA가 함께 우수한 소재를 확대하고, 클릭은 높지만 전환이 약한 소재의 메시지·랜딩 정합성을 점검하는 것입니다.",
    ].join("\n");
  }

  return [
    topConversion
      ? `전환 기여 1위 소재는 “${topConversion.creative || "(empty)"}”이며 전체 전환의 ${formatPercentFromRate(conversionShare, 1)}를 만들었습니다.`
      : "전환 기여를 판단할 소재 데이터가 없습니다.",
    topRoas
      ? `ROAS 우수 소재는 “${topRoas.creative || "(empty)"}”로 ${formatPercentFromRoas(topRoas.roas, 1)}를 기록했습니다. 비용 규모와 함께 확장 가능성을 판단해야 합니다.`
      : "ROAS 비교가 가능한 소재 데이터가 없습니다.",
    topCost
      ? `비용 집행 1위 소재는 “${topCost.creative || "(empty)"}”이며 전체 비용의 ${formatPercentFromRate(costShare, 1)}가 집중됐습니다.`
      : "비용 집중도를 판단할 소재 데이터가 없습니다.",
    "운영 우선순위는 ROAS와 전환 기여가 함께 높은 소재를 확장하고, 비용 비중이 크지만 매출 효율이 낮은 소재를 우선 교체하는 것입니다.",
  ].join("\n");
}

function creativePreviewKey(item: CreativeAgg | null | undefined) {
  if (!item) return "";
  return `${String(item.creative ?? "")}__${String(item.imagePath ?? "")}`;
}

function normalizeCreativeMatchKey(v: any, options?: { stripExtension?: boolean }) {
  let s = String(v ?? "").trim();

  if (!s) return "";

  s = s.replace(/\\/g, "/");
  s = s.split("?")[0].split("#")[0];
  s = s.split("/").pop() || s;
  s = s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  if (options?.stripExtension) {
    s = s.replace(/\.[a-z0-9]{1,10}$/i, "");
  }

  try {
    return s.normalize("NFC").toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function isUsableCreativeImageUrl(v: any) {
  const s = String(v ?? "").trim();

  if (!s) return false;

  const lower = s.toLowerCase();

  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:image/")
  );
}

function pickCreativeImageUrl(...values: any[]) {
  for (const v of values) {
    const s = String(v ?? "").trim();

    if (isUsableCreativeImageUrl(s)) {
      return s;
    }
  }

  return "";
}

function getCreativeNameCandidate(row: any) {
  return (
    row?.creative ??
    row?.creative_name ??
    row?.creativeName ??
    row?.ad_name ??
    row?.adName ??
    row?.name ??
    ""
  );
}

function getCreativeImageUrlCandidate(row: any) {
  return pickCreativeImageUrl(
    row?.imagePath,
    row?.image_path,
    row?.imageUrl,
    row?.image_url,
    row?.creativeImagePath,
    row?.creative_image_path,
    row?.creativeImageUrl,
    row?.creative_image_url,
    row?.thumbnailUrl,
    row?.thumbnail_url,
    row?.thumbnail
  );
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

const SectionHeader = memo(function SectionHeader({
  badge,
  title,
  description,
  right,
}: {
  badge: string;
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2">
          <span className="inline-flex items-center rounded-full border border-[#B7D7E3]/70 bg-[#B7D7E3]/14 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-[#5F87A3]">
            {badge}
          </span>
        </div>
        <div className="text-[17px] font-semibold tracking-[-0.02em] text-[#27364A]">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-[#7A8794]">{description}</div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
});

const ChartCard = memo(function ChartCard({
  badge,
  title,
  description,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--nature-border-blue)] bg-white p-5 shadow-[0_4px_14px_rgba(127,166,196,0.07)]">
      <SectionHeader badge={badge} title={title} description={description} />
      {children}
    </div>
  );
});

const SortArrow = memo(function SortArrow({
  sortKey,
  sortDir,
  k,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  k: SortKey;
}) {
  if (sortKey !== k) return null;
  return (
    <span className="ml-1 inline-block align-middle text-[10px] text-[#7FA6C4]">
      {sortDir === "asc" ? "▲" : "▼"}
    </span>
  );
});

const Th = memo(function Th({
  k,
  sortKey,
  sortDir,
  onClickHeader,
  align = "right",
}: {
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClickHeader: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={[
        "select-none whitespace-nowrap px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        align === "left" ? "text-left" : "text-right",
        "cursor-pointer border-b border-[#CFC2B1]/55 text-[#7A8794] hover:bg-[#F3E4D2]/24 hover:text-[#5F87A3]",
      ].join(" ")}
      onClick={() => onClickHeader(k)}
      title={`정렬: ${SORT_LABEL[k]}`}
    >
      {SORT_LABEL[k]}
      <SortArrow sortKey={sortKey} sortDir={sortDir} k={k} />
    </th>
  );
});

const CreativeTableRow = memo(function CreativeTableRow({
  row,
  reportMode,
  maxImpr,
  maxClicks,
  maxCost,
  maxConv,
  maxRev,
  onSelectCreative,
  onPreviewEnter,
  onPreviewLeave,
}: {
  row: CreativeAgg;
  reportMode: ReportMode;
  maxImpr: number;
  maxClicks: number;
  maxCost: number;
  maxConv: number;
  maxRev: number;
  onSelectCreative: (item: CreativeAgg) => void;
  onPreviewEnter: (item: CreativeAgg, anchorEl: HTMLElement) => void;
  onPreviewLeave: () => void;
}) {
  const tableMeta = getCreativeTableMeta(reportMode);

  return (
    <tr
      className="cursor-pointer border-t border-[#CFC2B1]/45 even:bg-[#F3E4D2]/10 hover:bg-[#B7D7E3]/12"
      onClick={() => onSelectCreative(row)}
    >
      <td className="whitespace-nowrap px-4 py-3.5 text-left font-medium text-[#27364A]">
        <div
          className="inline-flex max-w-[260px] items-center gap-2"
          onMouseEnter={(e) => onPreviewEnter(row, e.currentTarget as HTMLElement)}
          onMouseLeave={onPreviewLeave}
        >
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] border border-[#CFC2B1]/45 bg-[#F3E4D2]/20 px-2 text-[11px] font-semibold text-[#7A8794]">
            AD
          </span>

          <span
            className="cursor-default truncate underline decoration-dotted underline-offset-4"
            title={row.creative || "(empty)"}
          >
            {row.creative || "(empty)"}
          </span>

          {!!row.imagePath ? (
            <span className="shrink-0 rounded-full bg-[#B7D7E3]/14 px-2 py-0.5 text-[10px] font-semibold text-[#5F87A3]">
              Preview
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-[#F3E4D2]/22 px-2 py-0.5 text-[10px] font-semibold text-[#7A8794]">
              No image
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3.5">
        <DataBarCell
          value={toSafeNumber(row.impressions)}
          max={maxImpr}
          label={formatCount(row.impressions)}
        />
      </td>

      <td className="px-4 py-3.5">
        <DataBarCell
          value={toSafeNumber(row.clicks)}
          max={maxClicks}
          label={formatCount(row.clicks)}
        />
      </td>

      <td className="px-4 py-3.5 text-right text-[#52606D]">
        {formatPercentFromRate(row.ctr, 2)}
      </td>

      <td className="px-4 py-3.5 text-right text-[#52606D]">{KRW(row.cpc)}</td>

      <td className="px-4 py-3.5">
        <DataBarCell
          value={toSafeNumber(row.cost)}
          max={maxCost}
          label={KRW(row.cost)}
        />
      </td>

      {tableMeta.showConv && (
        <td className="px-4 py-3.5">
          <DataBarCell
            value={toSafeNumber(row.conversions)}
            max={maxConv}
            label={formatCount(row.conversions)}
          />
        </td>
      )}

      {tableMeta.showCvr && (
        <td className="px-4 py-3.5 text-right text-[#52606D]">
          {formatPercentFromRate(row.cvr, 2)}
        </td>
      )}

      {tableMeta.showCpa && (
        <td className="px-4 py-3.5 text-right text-[#52606D]">{KRW(row.cpa)}</td>
      )}

      {tableMeta.showRevenue && (
        <td className="px-4 py-3.5">
          <DataBarCell
            value={toSafeNumber(row.revenue)}
            max={maxRev}
            label={KRW(row.revenue)}
          />
        </td>
      )}

      {tableMeta.showRoas && (
        <td className="px-4 py-3.5 text-right text-[#52606D]">
          {formatPercentFromRoas(row.roas, 1)}
        </td>
      )}
    </tr>
  );
});

const CreativePreviewOverlay = memo(function CreativePreviewOverlay({
  hoveredCreative,
  previewPos,
  previewKey,
  hasPreviewImage,
  keepPreviewOpen,
  closePreview,
  onImageError,
}: {
  hoveredCreative: CreativeAgg | null;
  previewPos: { top: number; left: number; placement: "right" | "left" };
  previewKey: string;
  hasPreviewImage: boolean;
  keepPreviewOpen: () => void;
  closePreview: () => void;
  onImageError: (key: string) => void;
}) {
  if (!hoveredCreative) return null;

  return (
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
      <div className="overflow-hidden rounded-[18px] border border-[var(--nature-border-blue)] bg-white shadow-[0_6px_18px_rgba(127,166,196,0.10)]">
        <div className="border-b border-[#CFC2B1]/40 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8F81]">
            Creative Preview
          </div>
          <div
            className="mt-1 line-clamp-2 text-sm font-semibold text-[#27364A]"
            title={hoveredCreative.creative || "(empty)"}
          >
            {hoveredCreative.creative || "(empty)"}
          </div>
        </div>

        <div className="bg-[#F3E4D2]/25 p-3">
          <div className="overflow-hidden rounded-[12px] border border-[#CFC2B1]/45 bg-white">
            {hasPreviewImage ? (
              <img
                src={hoveredCreative.imagePath}
                alt={hoveredCreative.creative || "creative preview"}
                className="block h-52 w-full object-contain bg-white"
                loading="lazy"
                onError={() => onImageError(previewKey)}
              />
            ) : (
              <div className="flex h-52 items-center justify-center bg-[#F3E4D2]/25 px-4 text-center">
                <div>
                  <div className="text-sm font-semibold text-[#7A8794]">
                    미리보기 없음
                  </div>
                  <div className="mt-1 text-xs text-[#9A8F81]">
                    이미지 URL이 없거나 로딩에 실패했습니다.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 text-[11px] text-[#7A8794]">
          <span className="truncate">
            {hasPreviewImage ? "이미지 미리보기" : "Fallback preview"}
          </span>
          <span
            className={[
              "rounded-full px-2 py-0.5 font-semibold",
              hasPreviewImage
                ? "bg-[#B7D7E3]/14 text-[#5F87A3]"
                : "bg-[#F3E4D2]/22 text-[#7A8794]",
            ].join(" ")}
          >
            {hasPreviewImage ? "IMAGE" : "EMPTY"}
          </span>
        </div>
      </div>
    </div>
  );
});

export default function CreativeSection({
  reportType,
  rows,
  activeSlide,
}: Props) {
  const reportMode = resolveReportMode(reportType);
  const tableMeta = getCreativeTableMeta(reportMode);

  const showAllSlides = activeSlide == null;
  const isRankingSlideActive = showAllSlides || activeSlide === 0;
  const isTableSlideActive = showAllSlides || activeSlide === 1;

  /**
   * 일반 웹에서는 현재 슬라이드만 최초 계산·mount하고,
   * 한 번 방문한 슬라이드는 이후 hidden 상태로 유지한다.
   * export(activeSlide 미지정)에서는 기존처럼 두 슬라이드를 모두 계산·렌더링한다.
   */
  const visitedSlidesRef = useRef({
    ranking: isRankingSlideActive,
    table: isTableSlideActive,
  });

  if (isRankingSlideActive) {
    visitedSlidesRef.current.ranking = true;
  }
  if (isTableSlideActive) {
    visitedSlidesRef.current.table = true;
  }

  const shouldBuildRankingData =
    showAllSlides || visitedSlidesRef.current.ranking;
  const shouldBuildTableData =
    showAllSlides || visitedSlidesRef.current.table;
  const shouldRenderRankingSlide =
    showAllSlides || visitedSlidesRef.current.ranking;
  const shouldRenderTableSlide =
    showAllSlides || visitedSlidesRef.current.table;

  const imagePathByCreativeKey = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of rows ?? []) {
      const imageUrl = getCreativeImageUrlCandidate(row);
      if (!imageUrl) continue;

      const creativeName = getCreativeNameCandidate(row);

      const keys = [
        normalizeCreativeMatchKey(creativeName),
        normalizeCreativeMatchKey(creativeName, { stripExtension: true }),
      ].filter(Boolean);

      for (const key of keys) {
        if (!map.has(key)) {
          map.set(key, imageUrl);
        }
      }
    }

    return map;
  }, [rows]);

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

      const creative = String(r.creative ?? "");
      const directImageUrl = getCreativeImageUrlCandidate(r);
      const imagePath =
        directImageUrl ||
        imagePathByCreativeKey.get(normalizeCreativeMatchKey(creative)) ||
        imagePathByCreativeKey.get(
          normalizeCreativeMatchKey(creative, { stripExtension: true })
        ) ||
        "";

      return {
        creative,
        imagePath,
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
  }, [rows, imagePathByCreativeKey]);

  const topImpressions = useMemo(() => {
    if (!shouldBuildRankingData || reportMode !== "traffic") {
      return EMPTY_CREATIVE_AGG;
    }

    return [...creativeAgg]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20)
      .reverse();
  }, [creativeAgg, reportMode, shouldBuildRankingData]);

  const topClicks = useMemo(() => {
    if (!shouldBuildRankingData) {
      return EMPTY_CREATIVE_AGG;
    }

    return [...creativeAgg]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20)
      .reverse();
  }, [creativeAgg, shouldBuildRankingData]);

  const topCost = useMemo(() => {
    if (!shouldBuildRankingData || reportMode !== "traffic") {
      return EMPTY_CREATIVE_AGG;
    }

    return [...creativeAgg]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20)
      .reverse();
  }, [creativeAgg, reportMode, shouldBuildRankingData]);

  const topConv = useMemo(() => {
    if (!shouldBuildRankingData || reportMode === "traffic") {
      return EMPTY_CREATIVE_AGG;
    }

    return [...creativeAgg]
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 20)
      .reverse();
  }, [creativeAgg, reportMode, shouldBuildRankingData]);

  const topRoas = useMemo(() => {
    if (!shouldBuildRankingData || reportMode !== "commerce") {
      return EMPTY_CREATIVE_AGG;
    }

    return [...creativeAgg]
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 20)
      .reverse();
  }, [creativeAgg, reportMode, shouldBuildRankingData]);

  const topCpa = useMemo(() => {
    if (!shouldBuildRankingData || reportMode !== "db_acquisition") {
      return EMPTY_CREATIVE_AGG;
    }

    return [...creativeAgg]
      .filter((a) => toSafeNumber(a.conversions) > 0)
      .sort((a, b) => a.cpa - b.cpa)
      .slice(0, 20)
      .reverse();
  }, [creativeAgg, reportMode, shouldBuildRankingData]);

  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCreative, setSelectedCreative] = useState<CreativeAgg | null>(null);

  const [hoveredCreative, setHoveredCreative] = useState<CreativeAgg | null>(null);
  const [previewAnchorEl, setPreviewAnchorEl] = useState<HTMLElement | null>(null);
  const [previewPos, setPreviewPos] = useState(() => computePreviewPosition(null));
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClickHeader = useCallback((k: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === k) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(k === "creative" ? "asc" : "desc");
      return k;
    });
  }, []);

  const clearPreviewTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openPreview = useCallback(
    (item: CreativeAgg, anchorEl: HTMLElement) => {
      clearPreviewTimers();
      openTimerRef.current = setTimeout(() => {
        setHoveredCreative(item);
        setPreviewAnchorEl(anchorEl);
        setPreviewPos(computePreviewPosition(anchorEl));
      }, PREVIEW_OPEN_DELAY);
    },
    [clearPreviewTimers]
  );

  const closePreview = useCallback(() => {
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
  }, []);

  const keepPreviewOpen = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const onSelectCreative = useCallback((item: CreativeAgg) => {
    setSelectedCreative(item);
  }, []);

  const tableRows = useMemo(() => {
    if (!shouldBuildTableData) {
      return EMPTY_CREATIVE_AGG;
    }

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
  }, [creativeAgg, sortKey, sortDir, shouldBuildTableData]);

  const tableMaxes = useMemo(() => {
    let maxImpr = 0;
    let maxClicks = 0;
    let maxCost = 0;
    let maxConv = 0;
    let maxRev = 0;

    for (const row of tableRows) {
      const impressions = toSafeNumber(row.impressions);
      const clicks = toSafeNumber(row.clicks);
      const cost = toSafeNumber(row.cost);
      const conversions = toSafeNumber(row.conversions);
      const revenue = toSafeNumber(row.revenue);

      if (impressions > maxImpr) maxImpr = impressions;
      if (clicks > maxClicks) maxClicks = clicks;
      if (cost > maxCost) maxCost = cost;
      if (conversions > maxConv) maxConv = conversions;
      if (revenue > maxRev) maxRev = revenue;
    }

    return {
      maxImpr,
      maxClicks,
      maxCost,
      maxConv,
      maxRev,
    };
  }, [tableRows]);

  const {
    maxImpr,
    maxClicks,
    maxCost,
    maxConv,
    maxRev,
  } = tableMaxes;

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
  }, [clearPreviewTimers]);

  const previewKey = creativePreviewKey(hoveredCreative);
  const hasPreviewImage =
    !!hoveredCreative?.imagePath && !imageErrorMap[previewKey];

  const tableBadge = useMemo(() => {
    if (!selectedCreative) return "전체";
    return selectedCreative.creative || "선택됨";
  }, [selectedCreative]);

  const handlePreviewImageError = useCallback((key: string) => {
    setImageErrorMap((prev) => {
      if (prev[key]) return prev;
      return {
        ...prev,
        [key]: true,
      };
    });
  }, []);

  const creativeInsight = useMemo(() => {
    if (!shouldBuildRankingData) return "";
    return buildCreativeSummaryInsight(reportMode, creativeAgg);
  }, [reportMode, creativeAgg, shouldBuildRankingData]);

  const creativeInsightDescription =
    reportMode === "traffic"
      ? "현재 소재 성과를 바탕으로 유입 중심의 중요한 흐름과 운영 포인트를 정리했습니다."
      : reportMode === "db_acquisition"
        ? "현재 소재 성과를 바탕으로 DB 확보와 전환 효율 중심의 중요한 흐름을 정리했습니다."
        : "현재 소재 성과를 바탕으로 전환과 매출 효율 중심의 중요한 흐름을 정리했습니다.";

  useEffect(() => {
    if (isTableSlideActive) return;
    clearPreviewTimers();
    setHoveredCreative(null);
    setPreviewAnchorEl(null);
  }, [isTableSlideActive, clearPreviewTimers]);

  const rankingCharts = useMemo(() => {
    if (!shouldBuildRankingData) return null;

    if (reportMode === "traffic") {
      return (
        <>
          <ChartCard
            badge="Creative Ranking"
            title="노출수 TOP20 소재"
            description="노출 기여도가 높은 소재를 빠르게 비교할 수 있도록 정리했습니다."
          >
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
                <BarChart
                  data={topImpressions}
                  layout="vertical"
                  margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                    fill="#B7D7E3"
                    isAnimationActive={false}
                    radius={[0, 6, 6, 0]}
                    onClick={(_: any, idx: number) => {
                      const item = topImpressions?.[idx];
                      if (item) setSelectedCreative(item);
                    }}
                  >
                    <LabelList
                      dataKey="impressions"
                      position="right"
                      formatter={(v: any) => formatCount(v)}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
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
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
                <BarChart
                  data={topClicks}
                  layout="vertical"
                  margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                    fill="#7FA6C4"
                    isAnimationActive={false}
                    radius={[0, 6, 6, 0]}
                    onClick={(_: any, idx: number) => {
                      const item = topClicks?.[idx];
                      if (item) setSelectedCreative(item);
                    }}
                  >
                    <LabelList
                      dataKey="clicks"
                      position="right"
                      formatter={(v: any) => formatCount(v)}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
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
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
                <BarChart
                  data={topCost}
                  layout="vertical"
                  margin={{ top: 6, right: 82, left: 0, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                    fill="#CFC2B1"
                    isAnimationActive={false}
                    radius={[0, 6, 6, 0]}
                    onClick={(_: any, idx: number) => {
                      const item = topCost?.[idx];
                      if (item) setSelectedCreative(item);
                    }}
                  >
                    <LabelList
                      dataKey="cost"
                      position="right"
                      formatter={(v: any) => KRW(v)}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </>
      );
    }

    if (reportMode === "db_acquisition") {
      return (
        <>
          <ChartCard
            badge="Creative Ranking"
            title="클릭수 TOP20 소재"
            description="유입을 가장 많이 만든 소재를 우선순위 기준으로 정리했습니다."
          >
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
                <BarChart
                  data={topClicks}
                  layout="vertical"
                  margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                    fill="#7FA6C4"
                    isAnimationActive={false}
                    radius={[0, 6, 6, 0]}
                    onClick={(_: any, idx: number) => {
                      const item = topClicks?.[idx];
                      if (item) setSelectedCreative(item);
                    }}
                  >
                    <LabelList
                      dataKey="clicks"
                      position="right"
                      formatter={(v: any) => formatCount(v)}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            badge="Creative Ranking"
            title="전환수 TOP20 소재"
            description="리드/전환 기여도가 높은 소재를 중심으로 효율 우선순위를 파악합니다."
          >
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
                <BarChart
                  data={topConv}
                  layout="vertical"
                  margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                    fill="#8FB9B0"
                    isAnimationActive={false}
                    radius={[0, 6, 6, 0]}
                    onClick={(_: any, idx: number) => {
                      const item = topConv?.[idx];
                      if (item) setSelectedCreative(item);
                    }}
                  >
                    <LabelList
                      dataKey="conversions"
                      position="right"
                      formatter={(v: any) => formatCount(v)}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            badge="Creative Ranking"
            title="CPA 우수 TOP20 소재"
            description="전환이 발생한 소재만 기준으로 CPA가 낮은 순서대로 정리했습니다."
          >
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
                <BarChart
                  data={topCpa}
                  layout="vertical"
                  margin={{ top: 6, right: 82, left: 0, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                    dataKey="cpa"
                    fill="#D8B77C"
                    isAnimationActive={false}
                    radius={[0, 6, 6, 0]}
                    onClick={(_: any, idx: number) => {
                      const item = topCpa?.[idx];
                      if (item) setSelectedCreative(item);
                    }}
                  >
                    <LabelList
                      dataKey="cpa"
                      position="right"
                      formatter={(v: any) => KRW(v)}
                      style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </>
      );
    }

    return (
      <>
        <ChartCard
          badge="Creative Ranking"
          title="클릭수 TOP20 소재"
          description="유입을 가장 많이 만든 소재를 우선순위 기준으로 정리했습니다."
        >
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
              <BarChart
                data={topClicks}
                layout="vertical"
                margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                  fill="#7FA6C4"
                    isAnimationActive={false}
                  radius={[0, 6, 6, 0]}
                  onClick={(_: any, idx: number) => {
                    const item = topClicks?.[idx];
                    if (item) setSelectedCreative(item);
                  }}
                >
                  <LabelList
                    dataKey="clicks"
                    position="right"
                    formatter={(v: any) => formatCount(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
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
            <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
              <BarChart
                data={topConv}
                layout="vertical"
                margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                  fill="#8FB9B0"
                    isAnimationActive={false}
                  radius={[0, 6, 6, 0]}
                  onClick={(_: any, idx: number) => {
                    const item = topConv?.[idx];
                    if (item) setSelectedCreative(item);
                  }}
                >
                  <LabelList
                    dataKey="conversions"
                    position="right"
                    formatter={(v: any) => formatCount(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
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
            <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={80}
              >
              <BarChart
                data={topRoas}
                layout="vertical"
                margin={{ top: 6, right: 82, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="2 5" strokeOpacity={0.62} />
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
                  fill="#9B9AC7"
                    isAnimationActive={false}
                  radius={[0, 6, 6, 0]}
                  onClick={(_: any, idx: number) => {
                    const item = topRoas?.[idx];
                    if (item) setSelectedCreative(item);
                  }}
                >
                  <LabelList
                    dataKey="roas"
                    position="right"
                    formatter={(v: any) => formatPercentFromRoas(v, 1)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#7FA6C4" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </>
    );
  }, [
    reportMode,
    topImpressions,
    topClicks,
    topCost,
    topConv,
    topRoas,
    topCpa,
    shouldBuildRankingData,
  ]);

  const tableBody = useMemo(() => {
    if (tableRows.length === 0) {
      return (
        <tr className="border-t border-[#CFC2B1]/45">
          <td
            className="px-4 py-8 text-center text-sm text-[#7A8794]"
            colSpan={tableMeta.colSpan}
          >
            표시할 소재 데이터가 없습니다. (creative 컬럼을 확인해 주세요)
          </td>
        </tr>
      );
    }

    return tableRows.map((row, idx) => (
      <CreativeTableRow
        key={`${row.creative}-${idx}`}
        row={row}
        reportMode={reportMode}
        maxImpr={maxImpr}
        maxClicks={maxClicks}
        maxCost={maxCost}
        maxConv={maxConv}
        maxRev={maxRev}
        onSelectCreative={onSelectCreative}
        onPreviewEnter={openPreview}
        onPreviewLeave={closePreview}
      />
    ));
  }, [
    tableRows,
    tableMeta.colSpan,
    reportMode,
    maxImpr,
    maxClicks,
    maxCost,
    maxConv,
    maxRev,
    onSelectCreative,
    openPreview,
    closePreview,
  ]);

  return (
    <section className="mt-2 space-y-6">
      {shouldRenderRankingSlide ? (
        <div
          className={isRankingSlideActive ? "space-y-4" : "hidden"}
          aria-hidden={!isRankingSlideActive}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {rankingCharts}
          </div>

          <section>
            <div className="rounded-[20px] border border-[var(--nature-border-blue)] bg-white p-5 shadow-[0_4px_14px_rgba(127,166,196,0.07)] sm:p-6">
              <SectionHeader
                badge="AI Insight"
                title="소재 요약 인사이트"
                description={creativeInsightDescription}
              />

              {creativeInsight ? (
                <div className="whitespace-pre-wrap text-sm leading-7 text-[#334155]">
                  {creativeInsight}
                </div>
              ) : (
                <div className="text-sm text-[#7A8794]">
                  소재 데이터가 없어 인사이트를 생성할 수 없습니다.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {shouldRenderTableSlide ? (
        <section
          className={isTableSlideActive ? "" : "hidden"}
          aria-hidden={!isTableSlideActive}
        >
        <div className="rounded-[20px] border border-[var(--nature-border-blue)] bg-white p-5 shadow-[0_4px_14px_rgba(127,166,196,0.07)] sm:p-6">
          <SectionHeader
            badge="Creative Table"
            title="소재 상세 성과"
            description={
              reportMode === "traffic"
                ? "정렬 기준에 따라 주요 소재의 유입 성과를 비교하고, 마우스를 올리면 미리보기를 확인할 수 있습니다."
                : reportMode === "db_acquisition"
                ? "정렬 기준에 따라 주요 소재의 전환/CPA 성과를 비교하고, 마우스를 올리면 미리보기를 확인할 수 있습니다."
                : "정렬 기준에 따라 주요 소재 성과를 비교하고, 마우스를 올리면 미리보기를 확인할 수 있습니다."
            }
            right={
              <span className="inline-flex max-w-[280px] items-center truncate rounded-full border border-[#CFC2B1] bg-[#F3E4D2]/25 px-3 py-1 text-[11px] font-medium text-[#6F7B86]">
                {tableBadge}
              </span>
            }
          />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#9A8F81]">
              선택한 정렬 기준으로 Top50 소재가 표시됩니다.
            </div>
            <div className="text-xs text-[#9A8F81]">
              소재명에 마우스를 올리면 이미지 미리보기가 나타납니다.
            </div>
          </div>

          <div className="overflow-auto rounded-[18px] border border-[var(--nature-border-blue)] bg-white shadow-[0_3px_12px_rgba(127,166,196,0.06)]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[#F3E4D2]/52">
                <tr>
                  <Th
                    k="creative"
                    align="left"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClickHeader={onClickHeader}
                  />
                  <Th
                    k="impressions"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClickHeader={onClickHeader}
                  />
                  <Th
                    k="clicks"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClickHeader={onClickHeader}
                  />
                  <Th
                    k="ctr"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClickHeader={onClickHeader}
                  />
                  <Th
                    k="cpc"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClickHeader={onClickHeader}
                  />
                  <Th
                    k="cost"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClickHeader={onClickHeader}
                  />
                  {tableMeta.showConv && (
                    <Th
                      k="conversions"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClickHeader={onClickHeader}
                    />
                  )}
                  {tableMeta.showCvr && (
                    <Th
                      k="cvr"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClickHeader={onClickHeader}
                    />
                  )}
                  {tableMeta.showCpa && (
                    <Th
                      k="cpa"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClickHeader={onClickHeader}
                    />
                  )}
                  {tableMeta.showRevenue && (
                    <Th
                      k="revenue"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClickHeader={onClickHeader}
                    />
                  )}
                  {tableMeta.showRoas && (
                    <Th
                      k="roas"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClickHeader={onClickHeader}
                    />
                  )}
                </tr>
              </thead>

              <tbody>{tableBody}</tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-[#9A8F81]">
            * 표는 선택한 정렬 기준으로 Top50 소재입니다. (월/주/기기/채널 필터 조건에 따라 자동 변경)
          </div>
        </div>
      </section>
      ) : null}

      {isTableSlideActive ? (
        <CreativePreviewOverlay
          hoveredCreative={hoveredCreative}
          previewPos={previewPos}
          previewKey={previewKey}
          hasPreviewImage={hasPreviewImage}
          keepPreviewOpen={keepPreviewOpen}
          closePreview={closePreview}
          onImageError={handlePreviewImageError}
        />
      ) : null}
    </section>
  );
}
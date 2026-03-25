"use client";

import CreativeTopCardGridView, {
  type CreativeTopCardGridDensity,
  type CreativeTopCardItem,
} from "@/app/components/sections/summary/CreativeTopCardGridView";
import type {
  ExportCreativeTop8Data,
  ExportSectionMeta,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type CreativeCard = {
  name: string;
  channel: string;
  cost: string;
  revenue: string;
  roas: string;
};

type LayoutMode = "full" | "wide" | "compact" | "side-compact";

type Props = {
  /**
   * Step 17 이전 호환용
   */
  title?: string;
  subtitle?: string;
  items?: CreativeCard[];

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportCreativeTop8Data>;

  /**
   * 안전한 density 확장
   */
  layoutMode?: LayoutMode;
};

const DEFAULT_ITEMS: CreativeCard[] = [
  {
    name: "세럼 메인 비주얼 A",
    channel: "Naver SA",
    cost: "₩820,000",
    revenue: "₩2,940,000",
    roas: "358%",
  },
  {
    name: "크림 프로모션 썸네일",
    channel: "Google Ads",
    cost: "₩760,000",
    revenue: "₩2,610,000",
    roas: "343%",
  },
  {
    name: "민감성 케어 배너",
    channel: "Meta Ads",
    cost: "₩690,000",
    revenue: "₩2,220,000",
    roas: "322%",
  },
  {
    name: "수분 크림 카드뉴스",
    channel: "Naver SA",
    cost: "₩650,000",
    revenue: "₩2,040,000",
    roas: "314%",
  },
  {
    name: "브랜드 검색 소재 A",
    channel: "Google Ads",
    cost: "₩610,000",
    revenue: "₩1,960,000",
    roas: "321%",
  },
  {
    name: "프로모션 정사각 썸네일",
    channel: "Meta Ads",
    cost: "₩560,000",
    revenue: "₩1,760,000",
    roas: "314%",
  },
  {
    name: "세럼 상세 이미지형",
    channel: "Naver SA",
    cost: "₩510,000",
    revenue: "₩1,580,000",
    roas: "310%",
  },
  {
    name: "신규 런칭 키비주얼",
    channel: "Google Ads",
    cost: "₩480,000",
    revenue: "₩1,460,000",
    roas: "304%",
  },
];

function parseLooseNumber(value?: string) {
  if (!value) return Number.NaN;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatCurrency(value?: number) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return "-";
  return `₩${Math.round(safe).toLocaleString("ko-KR")}`;
}

function formatPercent(value?: number) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return "-";
  const percent = safe <= 10 ? safe * 100 : safe;
  return `${Math.round(percent)}%`;
}

function normalizeLegacyItems(
  items: CreativeCard[]
): ExportCreativeTop8Data["rows"] {
  return items.map((item, index) => ({
    rank: index + 1,
    name: item.name,
    imageUrl: null,
    cost: parseLooseNumber(item.cost),
    revenue: parseLooseNumber(item.revenue),
    roas: parseLooseNumber(item.roas),
  }));
}

function getLegacyChannel(items: CreativeCard[] | undefined, index: number) {
  if (!items || !items[index]) return "";
  return items[index]?.channel || "";
}

function toGridDensity(layoutMode: LayoutMode): CreativeTopCardGridDensity {
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  if (layoutMode === "side-compact") return "export-side-compact";
  return "export-full";
}

function getVisibleItemCount(layoutMode: LayoutMode) {
  if (layoutMode === "full") return 8;
  if (layoutMode === "wide") return 6;
  if (layoutMode === "compact") return 4;
  return 2;
}

function getBestCreativeLabel(
  rows: Array<{ name?: string; revenue?: number; roas?: number }>
) {
  if (!rows.length) return "-";

  const sorted = [...rows].sort((a, b) => {
    const revenueDiff = Number(b.revenue || 0) - Number(a.revenue || 0);
    if (revenueDiff !== 0) return revenueDiff;
    return Number(b.roas || 0) - Number(a.roas || 0);
  });

  return sorted[0]?.name || "-";
}

export default function ExportCreativeTop8({
  title,
  subtitle,
  items,
  meta,
  data,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("creative-top8", {
    ...(items ? { rows: normalizeLegacyItems(items) } : {}),
    ...(data ?? {}),
    ...(!items && !data ? { rows: normalizeLegacyItems(DEFAULT_ITEMS) } : {}),
  });

  const visibleCount = getVisibleItemCount(layoutMode);
  const safeRows = (resolvedData.rows ?? []).slice(0, visibleCount);

  const totalCost = safeRows.reduce((sum, row) => sum + Number(row.cost || 0), 0);
  const totalRevenue = safeRows.reduce(
    (sum, row) => sum + Number(row.revenue || 0),
    0
  );

  const avgRoas =
    safeRows.length > 0
      ? safeRows.reduce((sum, row) => sum + Number(row.roas || 0), 0) /
        safeRows.length
      : undefined;

  const metaText = [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
    .filter(Boolean)
    .join(" · ");

  const displayTitle = title || "소재 TOP8";
  const displaySubtitle =
    subtitle ||
    (metaText
      ? `현재 필터가 적용된 데이터 기준 성과 상위 소재 · ${metaText}`
      : "현재 필터가 적용된 데이터 기준 성과 상위 소재");

  const cardItems: CreativeTopCardItem[] = safeRows.map((item, index) => ({
    key: `${item.name}-${index}`,
    rank: item.rank || index + 1,
    name: item.name,
    channel: getLegacyChannel(items, index) || "-",
    imageUrl: item.imageUrl || null,
    cost: formatCurrency(item.cost),
    revenue: formatCurrency(item.revenue),
    roas: formatPercent(item.roas),
  }));

  const bestCreativeLabel = getBestCreativeLabel(safeRows);

  return (
    <CreativeTopCardGridView
      title={displayTitle}
      subtitle={displaySubtitle}
      items={cardItems}
      density={toGridDensity(layoutMode)}
      summary={{
        totalCostLabel: totalCost > 0 ? formatCurrency(totalCost) : "-",
        totalRevenueLabel: totalRevenue > 0 ? formatCurrency(totalRevenue) : "-",
        avgRoasLabel:
          Number.isFinite(Number(avgRoas)) ? formatPercent(Number(avgRoas)) : "-",
        bestCreativeLabel,
      }}
    />
  );
}
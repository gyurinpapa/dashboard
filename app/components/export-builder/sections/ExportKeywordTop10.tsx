"use client";

import KeywordTopTableView, {
  type KeywordTopTableDensity,
  type KeywordTopTableRow,
} from "@/app/components/sections/summary/KeywordTopTableView";
import type {
  ExportKeywordTop10Data,
  ExportSectionMeta,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type KeywordRow = {
  keyword: string;
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
  rows?: KeywordRow[];

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportKeywordTop10Data>;

  /**
   * 안전한 density 확장
   */
  layoutMode?: LayoutMode;
};

const DEFAULT_ROWS: KeywordRow[] = [
  { keyword: "네이처컬렉션", cost: "₩1,820,000", revenue: "₩6,240,000", roas: "343%" },
  { keyword: "네이처컬렉션 세럼", cost: "₩1,430,000", revenue: "₩5,180,000", roas: "362%" },
  { keyword: "네이처컬렉션 크림", cost: "₩1,280,000", revenue: "₩4,110,000", roas: "321%" },
  { keyword: "보습 크림 추천", cost: "₩1,040,000", revenue: "₩3,290,000", roas: "316%" },
  { keyword: "진정 세럼", cost: "₩920,000", revenue: "₩2,860,000", roas: "311%" },
  { keyword: "민감성 화장품", cost: "₩810,000", revenue: "₩2,520,000", roas: "311%" },
  { keyword: "수분 크림", cost: "₩760,000", revenue: "₩2,180,000", roas: "287%" },
  { keyword: "스킨케어 추천", cost: "₩690,000", revenue: "₩2,020,000", roas: "293%" },
  { keyword: "피부 진정", cost: "₩650,000", revenue: "₩1,880,000", roas: "289%" },
  { keyword: "데일리 세럼", cost: "₩590,000", revenue: "₩1,720,000", roas: "292%" },
];

function parseLooseNumber(value?: string) {
  if (!value) return NaN;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
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

function normalizeLegacyRows(
  rows: KeywordRow[]
): ExportKeywordTop10Data["rows"] {
  return rows.map((row, index) => ({
    rank: index + 1,
    keyword: row.keyword,
    cost: parseLooseNumber(row.cost),
    revenue: parseLooseNumber(row.revenue),
    roas: parseLooseNumber(row.roas),
  }));
}

function toTableDensity(layoutMode: LayoutMode): KeywordTopTableDensity {
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  if (layoutMode === "side-compact") return "export-side-compact";
  return "export-full";
}

export default function ExportKeywordTop10({
  title = "키워드 TOP10",
  subtitle = "성과 상위 키워드 요약",
  rows,
  meta,
  data,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("keyword-top10", {
    ...(rows ? { rows: normalizeLegacyRows(rows) } : {}),
    ...(data ?? {}),
    ...(!rows && !data ? { rows: normalizeLegacyRows(DEFAULT_ROWS) } : {}),
  });

  const safeRows = (resolvedData.rows ?? []).slice(0, 10);

  const totalCost = safeRows.reduce((sum, row) => sum + (row.cost || 0), 0);
  const totalRevenue = safeRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const avgRoas =
    safeRows.length > 0
      ? safeRows.reduce((sum, row) => sum + (row.roas || 0), 0) / safeRows.length
      : undefined;

  const displayTitle = title || "키워드 TOP10";
  const displaySubtitle =
    subtitle ||
    [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
      .filter(Boolean)
      .join(" · ") ||
    "성과 상위 키워드 요약";

  const tableRows: KeywordTopTableRow[] = safeRows.map((row, index) => ({
    key: `${row.keyword}-${index}`,
    rank: row.rank || index + 1,
    keyword: row.keyword,
    cost: formatCurrency(row.cost),
    revenue: formatCurrency(row.revenue),
    roas: formatPercent(row.roas),
  }));

  return (
    <KeywordTopTableView
      title={displayTitle}
      subtitle={displaySubtitle}
      rows={tableRows}
      density={toTableDensity(layoutMode)}
      summary={{
        totalCostLabel: totalCost > 0 ? formatCurrency(totalCost) : "₩9.99M",
        totalRevenueLabel: totalRevenue > 0 ? formatCurrency(totalRevenue) : "₩31.99M",
        avgRoasLabel:
          Number.isFinite(Number(avgRoas)) ? formatPercent(Number(avgRoas)) : "320%",
      }}
    />
  );
}
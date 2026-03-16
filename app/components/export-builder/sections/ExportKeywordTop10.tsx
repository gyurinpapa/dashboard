"use client";

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

export default function ExportKeywordTop10({
  title = "키워드 TOP10",
  subtitle = "성과 상위 키워드 요약",
  rows,
  meta,
  data,
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

  return (
    <section className="flex h-full min-h-[360px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Keyword
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {displayTitle}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{displaySubtitle}</p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
          Top 10
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50">
        <div className="grid grid-cols-[56px_minmax(0,1.8fr)_1fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-white px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <div>순위</div>
          <div>키워드</div>
          <div>광고비</div>
          <div>매출</div>
          <div>ROAS</div>
        </div>

        <div className="divide-y divide-slate-200">
          {safeRows.map((row, index) => (
            <div
              key={`${row.keyword}-${index}`}
              className="grid grid-cols-[56px_minmax(0,1.8fr)_1fr_1fr_0.8fr] gap-3 px-4 py-3 text-sm text-slate-700"
            >
              <div>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                  {row.rank || index + 1}
                </span>
              </div>

              <div className="truncate font-medium text-slate-900">
                {row.keyword}
              </div>
              <div className="truncate">{formatCurrency(row.cost)}</div>
              <div className="truncate">{formatCurrency(row.revenue)}</div>
              <div className="truncate font-semibold text-slate-900">
                {formatPercent(row.roas)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">상위 키워드 광고비</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {totalCost > 0 ? formatCurrency(totalCost) : "₩9.99M"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">상위 키워드 매출</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {totalRevenue > 0 ? formatCurrency(totalRevenue) : "₩31.99M"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">평균 ROAS</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Number.isFinite(Number(avgRoas)) ? formatPercent(Number(avgRoas)) : "320%"}
          </div>
        </div>
      </div>
    </section>
  );
}
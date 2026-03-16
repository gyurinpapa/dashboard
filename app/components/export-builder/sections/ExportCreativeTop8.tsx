"use client";

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
};

const DEFAULT_ITEMS: CreativeCard[] = [
  { name: "세럼 메인 비주얼 A", channel: "Naver SA", cost: "₩820,000", revenue: "₩2,940,000", roas: "358%" },
  { name: "크림 프로모션 썸네일", channel: "Google Ads", cost: "₩760,000", revenue: "₩2,610,000", roas: "343%" },
  { name: "민감성 케어 배너", channel: "Meta Ads", cost: "₩690,000", revenue: "₩2,220,000", roas: "322%" },
  { name: "수분 크림 카드뉴스", channel: "Naver SA", cost: "₩650,000", revenue: "₩2,040,000", roas: "314%" },
  { name: "브랜드 검색 소재 A", channel: "Google Ads", cost: "₩610,000", revenue: "₩1,960,000", roas: "321%" },
  { name: "프로모션 정사각 썸네일", channel: "Meta Ads", cost: "₩560,000", revenue: "₩1,760,000", roas: "314%" },
  { name: "세럼 상세 이미지형", channel: "Naver SA", cost: "₩510,000", revenue: "₩1,580,000", roas: "310%" },
  { name: "신규 런칭 키비주얼", channel: "Google Ads", cost: "₩480,000", revenue: "₩1,460,000", roas: "304%" },
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

export default function ExportCreativeTop8({
  title = "소재 TOP8",
  subtitle = "성과 상위 소재 요약",
  items,
  meta,
  data,
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("creative-top8", {
    ...(items ? { rows: normalizeLegacyItems(items) } : {}),
    ...(data ?? {}),
    ...(!items && !data ? { rows: normalizeLegacyItems(DEFAULT_ITEMS) } : {}),
  });

  const safeRows = (resolvedData.rows ?? []).slice(0, 8);

  const totalCost = safeRows.reduce((sum, row) => sum + (row.cost || 0), 0);
  const totalRevenue = safeRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const avgRoas =
    safeRows.length > 0
      ? safeRows.reduce((sum, row) => sum + (row.roas || 0), 0) / safeRows.length
      : undefined;

  const displayTitle = title || "소재 TOP8";
  const displaySubtitle =
    subtitle ||
    [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
      .filter(Boolean)
      .join(" · ") ||
    "성과 상위 소재 요약";

  return (
    <section className="flex h-full min-h-[360px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Creative
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {displayTitle}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{displaySubtitle}</p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
          Top 8
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 xl:grid-cols-2">
        {safeRows.map((item, index) => {
          const legacyChannel = getLegacyChannel(items, index);

          return (
            <div
              key={`${item.name}-${index}`}
              className="flex min-h-[120px] gap-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "IMG"
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacyChannel || "-"}
                    </div>
                  </div>

                  <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    #{item.rank || index + 1}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">광고비</div>
                    <div className="mt-1 truncate text-xs font-semibold text-slate-900">
                      {formatCurrency(item.cost)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">매출</div>
                    <div className="mt-1 truncate text-xs font-semibold text-slate-900">
                      {formatCurrency(item.revenue)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">ROAS</div>
                    <div className="mt-1 truncate text-xs font-semibold text-slate-900">
                      {formatPercent(item.roas)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">상위 소재 광고비</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {totalCost > 0 ? formatCurrency(totalCost) : "₩5.08M"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">상위 소재 매출</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {totalRevenue > 0 ? formatCurrency(totalRevenue) : "₩16.57M"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">평균 ROAS</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Number.isFinite(Number(avgRoas)) ? formatPercent(Number(avgRoas)) : "326%"}
          </div>
        </div>
      </div>
    </section>
  );
}
"use client";

import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
  formatPercentFromRoas,
  formatCount,
} from "../../../../src/lib/report/format";

type Props = {
  totals: any;
};

const TOKENS = {
  metric: {
    cost: "#F59E0B",
    revenue: "#0EA5E9",
    roas: "#EF4444",
    neutral: "#94A3B8",
  },
  text: {
    strong: "#111827",
    base: "#374151",
    muted: "#6B7280",
    faint: "#9CA3AF",
  },
  surface: {
    card: "#FFFFFF",
    subtle: "#F8FAFC",
    border: "#E5E7EB",
    hover: "#DBEAFE",
  },
};

export default function SummaryKPI({ totals }: Props) {
  const impressions = toSafeNumber(totals?.impressions ?? totals?.impr);
  const clicks = toSafeNumber(totals?.clicks ?? totals?.click);
  const ctr = normalizeRate01(totals?.ctr);
  const cpc = toSafeNumber(totals?.cpc);
  const cost = toSafeNumber(totals?.cost);

  const conversions = toSafeNumber(totals?.conversions ?? totals?.conv);
  const cvr = normalizeRate01(totals?.cvr);
  const revenue = toSafeNumber(totals?.revenue ?? totals?.sales);
  const cpa = toSafeNumber(totals?.cpa);

  // summarize() 단일 소스 기준
  const roas = normalizeRoas01(totals?.roas);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4 sm:px-6 sm:py-5">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900 sm:text-[16px]">
          기간 성과 요약
        </div>
        <div className="mt-1 text-xs font-medium text-gray-500 sm:text-[12px]">
          현재 조회 조건 기준 핵심 지표
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KPI
            title="노출"
            value={formatCount(impressions)}
            tone="neutral"
          />
          <KPI
            title="클릭"
            value={formatCount(clicks)}
            tone="neutral"
          />
          <KPI
            title="CTR"
            value={formatPercentFromRate(ctr, 2)}
            tone="neutral"
          />
          <KPI
            title="CPC"
            value={KRW(cpc)}
            tone="cost"
          />
          <KPI
            title="비용"
            value={KRW(cost)}
            tone="cost"
          />

          <KPI
            title="전환수"
            value={formatCount(conversions)}
            tone="neutral"
          />
          <KPI
            title="CVR"
            value={formatPercentFromRate(cvr, 2)}
            tone="neutral"
          />
          <KPI
            title="전환매출"
            value={KRW(revenue)}
            tone="revenue"
          />
          <KPI
            title="CPA"
            value={KRW(cpa)}
            tone="neutral"
          />
          <KPI
            title="ROAS"
            value={formatPercentFromRoas(roas, 1)}
            tone="roas"
          />
        </div>
      </div>
    </section>
  );
}

function KPI({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: "neutral" | "cost" | "revenue" | "roas";
}) {
  const accent =
    tone === "cost"
      ? TOKENS.metric.cost
      : tone === "revenue"
      ? TOKENS.metric.revenue
      : tone === "roas"
      ? TOKENS.metric.roas
      : TOKENS.metric.neutral;

  const valueClass =
    tone === "revenue"
      ? "text-sky-600"
      : tone === "roas"
      ? "text-rose-600"
      : tone === "cost"
      ? "text-amber-600"
      : "text-gray-900";

  const badgeClass =
    tone === "revenue"
      ? "bg-sky-50 text-sky-700 border-sky-100"
      : tone === "roas"
      ? "bg-rose-50 text-rose-700 border-rose-100"
      : tone === "cost"
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div
      className="
        group relative overflow-hidden rounded-2xl border border-gray-200
        bg-white px-4 py-4 shadow-sm transition-all duration-200
        hover:-translate-y-[1px] hover:border-gray-300 hover:shadow-md
      "
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-start justify-between gap-3">
        <div
          className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${badgeClass}`}
        >
          {title}
        </div>

        <span
          className="mt-0.5 inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accent }}
        />
      </div>

      <div className={`mt-4 text-[24px] font-semibold leading-none tracking-[-0.02em] ${valueClass}`}>
        {value}
      </div>

      <div className="mt-2 text-[11px] font-medium text-gray-400">
        {title} metric
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, rgba(248,250,252,0.9) 0%, rgba(255,255,255,0) 65%)",
        }}
      />
    </div>
  );
}
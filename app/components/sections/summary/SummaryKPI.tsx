"use client";

import { KRW } from "../../../../src/lib/report/format";

type Props = {
  totals: any;
};

function toNum(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).replace(/[,%₩\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toRate01(v: any) {
  const n = toNum(v);
  return n > 1 ? n / 100 : n;
}

export default function SummaryKPI({ totals }: Props) {
  const impressions = toNum(totals?.impressions ?? totals?.impr);
  const clicks = toNum(totals?.clicks ?? totals?.click);
  const ctr = toRate01(totals?.ctr);
  const cpc = toNum(totals?.cpc);
  const cost = toNum(totals?.cost);

  const conversions = toNum(totals?.conversions ?? totals?.conv);
  const cvr = toRate01(totals?.cvr);
  const revenue = toNum(totals?.revenue ?? totals?.sales);
  const cpa = toNum(totals?.cpa);
  const roas = toRate01(totals?.roas);

  return (
    <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KPI title="노출" value={impressions.toLocaleString()} />
      <KPI title="클릭" value={clicks.toLocaleString()} />
      <KPI title="CTR" value={(ctr * 100).toFixed(2) + "%"} />
      <KPI title="CPC" value={KRW(cpc)} />
      <KPI title="비용" value={KRW(cost)} />

      <KPI title="전환수" value={conversions.toLocaleString()} />
      <KPI title="CVR" value={(cvr * 100).toFixed(2) + "%"} />
      <KPI
        title="전환매출"
        value={KRW(revenue)}
        valueClass="text-emerald-600"
      />
      <KPI title="CPA" value={KRW(cpa)} />
      <KPI
        title="ROAS"
        value={(roas * 100).toFixed(1) + "%"}
        valueClass="text-emerald-600"
      />
    </div>
  );
}

/** SaaS KPI 카드 */
function KPI({
  title,
  value,
  valueClass,
}: {
  title: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div
      className="
        group
        relative
        min-h-[88px]
        rounded-2xl
        border border-gray-200
        bg-white
        px-5 py-4
        shadow-sm
        transition-all
        duration-200
        hover:-translate-y-[2px]
        hover:border-blue-200
        hover:shadow-md
        hover:ring-1 hover:ring-blue-100
      "
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2">
        <div className="text-[12px] font-semibold tracking-[0.02em] text-gray-500">
          {title}
        </div>
      </div>

      <div
        className={`mt-3 text-[24px] font-semibold leading-none tracking-[-0.02em] ${
          valueClass ?? "text-gray-900"
        }`}
      >
        {value}
      </div>

      <div
        className="
          pointer-events-none
          absolute inset-0
          rounded-2xl
          bg-gradient-to-br
          from-blue-50
          to-transparent
          opacity-0
          transition
          group-hover:opacity-100
        "
      />
    </div>
  );
}
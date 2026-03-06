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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      <KPI title="노출" value={impressions.toLocaleString()} />
      <KPI title="클릭" value={clicks.toLocaleString()} />
      <KPI title="CTR" value={(ctr * 100).toFixed(2) + "%"} />
      <KPI title="CPC" value={KRW(cpc)} />
      <KPI title="비용" value={KRW(cost)} />

      <KPI title="전환수" value={conversions.toLocaleString()} />
      <KPI title="CVR" value={(cvr * 100).toFixed(2) + "%"} />
      <KPI title="전환매출" value={KRW(revenue)} />
      <KPI title="CPA" value={KRW(cpa)} />
      <KPI title="ROAS" value={(roas * 100).toFixed(1) + "%"} />
    </div>
  );
}

/** 같은 모양 KPI 카드 */
function KPI({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
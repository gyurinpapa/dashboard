"use client";

import { progressRate, formatNumber, KRW, parseNumberInput } from "../../../../src/lib/report/format";


type Props = {
  totals: any;
};

export default function SummaryKPI({ totals }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      <KPI title="노출" value={totals.impressions.toLocaleString()} />
      <KPI title="클릭" value={totals.clicks.toLocaleString()} />
      <KPI title="CTR" value={(totals.ctr * 100).toFixed(2) + "%"} />
      <KPI title="CPC" value={KRW(totals.cpc)} />
      <KPI title="비용" value={KRW(totals.cost)} />

      <KPI title="전환수" value={totals.conversions.toLocaleString()} />
      <KPI title="CVR" value={(totals.cvr * 100).toFixed(2) + "%"} />
      <KPI title="전환매출" value={KRW(totals.revenue)} />
      <KPI title="CPA" value={KRW(totals.cpa)} />
      <KPI title="ROAS" value={(totals.roas * 100).toFixed(1) + "%"} />
    </div>
  );
}

/** 같은 모양 KPI 카드 (기존 SummarySection에 있던 KPI 컴포넌트 유지/복사해도 됨)
 *  만약 이미 SummarySection.tsx 안에 KPI 컴포넌트가 따로 정의돼있다면
 *  아래 KPI는 삭제하고, import로 빼거나 공용 컴포넌트로 옮기면 됨.
 */
function KPI({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

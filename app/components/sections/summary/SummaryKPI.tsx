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
import SummaryKPICardView, {
  type SummaryKPICardTone,
} from "./SummaryKPICardView";

type Props = {
  totals: any;
};

type SummaryCardItem = {
  key: string;
  title: string;
  value: string;
  tone?: SummaryKPICardTone;
  footerText?: string;
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

  const cards: SummaryCardItem[] = [
    {
      key: "impressions",
      title: "노출",
      value: formatCount(impressions),
      tone: "neutral",
      footerText: "노출 metric",
    },
    {
      key: "clicks",
      title: "클릭",
      value: formatCount(clicks),
      tone: "neutral",
      footerText: "클릭 metric",
    },
    {
      key: "ctr",
      title: "CTR",
      value: formatPercentFromRate(ctr, 2),
      tone: "neutral",
      footerText: "CTR metric",
    },
    {
      key: "cpc",
      title: "CPC",
      value: KRW(cpc),
      tone: "cost",
      footerText: "CPC metric",
    },
    {
      key: "cost",
      title: "비용",
      value: KRW(cost),
      tone: "cost",
      footerText: "비용 metric",
    },
    {
      key: "conversions",
      title: "전환수",
      value: formatCount(conversions),
      tone: "neutral",
      footerText: "전환수 metric",
    },
    {
      key: "cvr",
      title: "CVR",
      value: formatPercentFromRate(cvr, 2),
      tone: "neutral",
      footerText: "CVR metric",
    },
    {
      key: "revenue",
      title: "전환매출",
      value: KRW(revenue),
      tone: "revenue",
      footerText: "전환매출 metric",
    },
    {
      key: "cpa",
      title: "CPA",
      value: KRW(cpa),
      tone: "neutral",
      footerText: "CPA metric",
    },
    {
      key: "roas",
      title: "ROAS",
      value: formatPercentFromRoas(roas, 1),
      tone: "roas",
      footerText: "ROAS metric",
    },
  ];

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
          {cards.map((card) => (
            <SummaryKPICardView
              key={card.key}
              title={card.title}
              value={card.value}
              tone={card.tone ?? "neutral"}
              density="report"
              footerText={card.footerText}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
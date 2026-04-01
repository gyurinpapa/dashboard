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
  reportType?: "commerce" | "traffic";
  totals: any;
};

type SummaryCardItem = {
  key: string;
  title: string;
  value: string;
  tone?: SummaryKPICardTone;
  footerText?: string;
};

export default function SummaryKPI({ reportType, totals }: Props) {
  const isTraffic = reportType === "traffic";

  const impressions = toSafeNumber(totals?.impressions ?? totals?.impr);
  const clicks = toSafeNumber(totals?.clicks ?? totals?.click);
  const ctr = normalizeRate01(totals?.ctr);
  const cpc = toSafeNumber(totals?.cpc);
  const cost = toSafeNumber(totals?.cost);

  const conversions = toSafeNumber(totals?.conversions ?? totals?.conv);
  const cvr = normalizeRate01(totals?.cvr);
  const revenue = toSafeNumber(totals?.revenue ?? totals?.sales);
  const cpa = toSafeNumber(totals?.cpa);
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
    ...(!isTraffic
      ? [
          {
            key: "conversions",
            title: "전환수",
            value: formatCount(conversions),
            tone: "neutral" as SummaryKPICardTone,
            footerText: "전환수 metric",
          },
          {
            key: "cvr",
            title: "CVR",
            value: formatPercentFromRate(cvr, 2),
            tone: "neutral" as SummaryKPICardTone,
            footerText: "CVR metric",
          },
          {
            key: "revenue",
            title: "전환매출",
            value: KRW(revenue),
            tone: "revenue" as SummaryKPICardTone,
            footerText: "전환매출 metric",
          },
          {
            key: "cpa",
            title: "CPA",
            value: KRW(cpa),
            tone: "neutral" as SummaryKPICardTone,
            footerText: "CPA metric",
          },
          {
            key: "roas",
            title: "ROAS",
            value: formatPercentFromRoas(roas, 1),
            tone: "roas" as SummaryKPICardTone,
            footerText: "ROAS metric",
          },
        ]
      : []),
  ];

  return (
    <div className="px-0 py-0">
      <div
        className={[
          "grid gap-3 sm:gap-3.5",
          isTraffic
            ? "grid-cols-2 lg:grid-cols-5"
            : "grid-cols-2 lg:grid-cols-5",
        ].join(" ")}
      >
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
  );
}
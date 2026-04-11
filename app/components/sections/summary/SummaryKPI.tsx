"use client";

import { memo, useMemo } from "react";
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

const GRID_CLASS = "grid gap-3 sm:gap-3.5 grid-cols-2 lg:grid-cols-5";

function SummaryKPIComponent({ reportType, totals }: Props) {
  const isTraffic = reportType === "traffic";

  // 성능 최적화:
  // - totals에서 파생되는 숫자 계산을 useMemo로 고정
  // - 동일 totals reference에서는 불필요한 formatter 재실행을 줄임
  const metricValues = useMemo(() => {
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

    return {
      impressions,
      clicks,
      ctr,
      cpc,
      cost,
      conversions,
      cvr,
      revenue,
      cpa,
      roas,
    };
  }, [totals]);

  // 성능 최적화:
  // - 카드 배열 자체를 stable reference로 유지
  // - 하위 SummaryKPICardView에 내려가는 문자열/톤 생성 최소화
  const cards = useMemo<SummaryCardItem[]>(() => {
    const {
      impressions,
      clicks,
      ctr,
      cpc,
      cost,
      conversions,
      cvr,
      revenue,
      cpa,
      roas,
    } = metricValues;

    const baseCards: SummaryCardItem[] = [
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
    ];

    if (isTraffic) return baseCards;

    return [
      ...baseCards,
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
  }, [isTraffic, metricValues]);

  return (
    <div className="px-0 py-0">
      <div className={GRID_CLASS}>
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

const SummaryKPI = memo(SummaryKPIComponent);

export default SummaryKPI;
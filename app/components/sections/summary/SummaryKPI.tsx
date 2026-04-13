"use client";

import { memo, useMemo } from "react";
import type { ReportType } from "../../../../src/lib/report/types";
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
  reportType?: ReportType;
  totals: any;
};

type SummaryCardItem = {
  key: string;
  title: string;
  value: string;
  tone?: SummaryKPICardTone;
  footerText?: string;
};

function getGridClass(reportType?: ReportType) {
  if (reportType === "traffic") {
    return "grid gap-3 sm:gap-3.5 grid-cols-2 lg:grid-cols-5";
  }

  if (reportType === "db_acquisition") {
    return "grid gap-3 sm:gap-3.5 grid-cols-2 lg:grid-cols-5";
  }

  return "grid gap-3 sm:gap-3.5 grid-cols-2 lg:grid-cols-5 xl:grid-cols-5";
}

function SummaryKPIComponent({ reportType = "commerce", totals }: Props) {
  const gridClass = useMemo(() => getGridClass(reportType), [reportType]);

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

    if (reportType === "traffic") {
      return [
        {
          key: "impressions",
          title: "노출",
          value: formatCount(impressions),
          tone: "neutral",
          footerText: "유입 도달 규모",
        },
        {
          key: "clicks",
          title: "클릭",
          value: formatCount(clicks),
          tone: "neutral",
          footerText: "유입 발생 수",
        },
        {
          key: "ctr",
          title: "CTR",
          value: formatPercentFromRate(ctr, 2),
          tone: "neutral",
          footerText: "노출 대비 클릭률",
        },
        {
          key: "cpc",
          title: "CPC",
          value: KRW(cpc),
          tone: "cost",
          footerText: "클릭당 유입 비용",
        },
        {
          key: "cost",
          title: "비용",
          value: KRW(cost),
          tone: "cost",
          footerText: "총 집행 광고비",
        },
      ];
    }

    if (reportType === "db_acquisition") {
      return [
        {
          key: "conversions",
          title: "전환수",
          value: formatCount(conversions),
          tone: "neutral",
          footerText: "확보된 리드·DB 수",
        },
        {
          key: "cpa",
          title: "CPA",
          value: KRW(cpa),
          tone: "cost",
          footerText: "리드 1건 확보 비용",
        },
        {
          key: "cvr",
          title: "CVR",
          value: formatPercentFromRate(cvr, 2),
          tone: "neutral",
          footerText: "클릭 대비 전환율",
        },
        {
          key: "clicks",
          title: "클릭",
          value: formatCount(clicks),
          tone: "neutral",
          footerText: "전환 유입 모수",
        },
        {
          key: "cost",
          title: "비용",
          value: KRW(cost),
          tone: "cost",
          footerText: "DB 확보 집행 비용",
        },
      ];
    }

    return [
      {
        key: "impressions",
        title: "노출",
        value: formatCount(impressions),
        tone: "neutral",
        footerText: "광고 노출 규모",
      },
      {
        key: "clicks",
        title: "클릭",
        value: formatCount(clicks),
        tone: "neutral",
        footerText: "유입 발생 수",
      },
      {
        key: "ctr",
        title: "CTR",
        value: formatPercentFromRate(ctr, 2),
        tone: "neutral",
        footerText: "노출 대비 클릭률",
      },
      {
        key: "cpc",
        title: "CPC",
        value: KRW(cpc),
        tone: "cost",
        footerText: "클릭당 광고비",
      },
      {
        key: "cost",
        title: "비용",
        value: KRW(cost),
        tone: "cost",
        footerText: "총 집행 광고비",
      },
      {
        key: "conversions",
        title: "전환수",
        value: formatCount(conversions),
        tone: "neutral",
        footerText: "구매·전환 발생 수",
      },
      {
        key: "cvr",
        title: "CVR",
        value: formatPercentFromRate(cvr, 2),
        tone: "neutral",
        footerText: "클릭 대비 전환율",
      },
      {
        key: "revenue",
        title: "전환매출",
        value: KRW(revenue),
        tone: "revenue",
        footerText: "전환 기반 매출액",
      },
      {
        key: "cpa",
        title: "CPA",
        value: KRW(cpa),
        tone: "neutral",
        footerText: "전환 1건당 비용",
      },
      {
        key: "roas",
        title: "ROAS",
        value: formatPercentFromRoas(roas, 1),
        tone: "roas",
        footerText: "광고비 대비 매출 효율",
      },
    ];
  }, [reportType, metricValues]);

  return (
    <div className="px-0 py-0">
      <div className={gridClass}>
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
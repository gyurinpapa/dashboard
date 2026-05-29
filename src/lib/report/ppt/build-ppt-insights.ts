// src/lib/report/ppt/build-ppt-insights.ts

import type { PptReportDeck, PptSlide } from "./build-ppt-data";

export type PptSlideInsightText = {
  analysis: string[];
  insights: string[];
};

export type PptDeckInsightText = {
  slides: Record<string, PptSlideInsightText>;
};

export type BuildPptInsightsParams = {
  deck: PptReportDeck;
};

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function compactText(v: any) {
  return asStr(v).replace(/\s+/g, " ").trim();
}

function uniqueNonEmpty(values: any[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const text = compactText(value);
    if (!text) continue;
    if (seen.has(text)) continue;

    seen.add(text);
    out.push(text);
  }

  return out;
}

function ensureThreeLines(values: any[], fallback: string[]) {
  const merged = uniqueNonEmpty([...values, ...fallback]);
  const picked = merged.slice(0, 3);

  while (picked.length < 3) {
    picked.push("추가 데이터 확인 후 세부 원인을 보완합니다.");
  }

  return picked;
}

function limitLineLength(line: string, maxLength = 86) {
  const text = compactText(line);
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function normalizeThreeLines(values: string[]) {
  return values.slice(0, 3).map((line) => limitLineLength(line));
}

function getSlideFallbackAnalysis(slide: PptSlide, deck: PptReportDeck) {
  const title = asStr(slide.title);
  const reportTypeName = asStr(deck.reportTypeName) || "성과 보고서";

  if (slide.key === "executive-summary") {
    return [
      `${reportTypeName}의 전체 성과를 비용, 매출, ROAS, 전환 기준으로 요약했습니다.`,
      "핵심 KPI는 비용 효율과 전환 규모를 함께 확인하는 방식으로 해석합니다.",
      "이후 슬라이드에서 구조, 키워드, 소재 단위로 성과 원인을 분해합니다.",
    ];
  }

  if (slide.key === "goal-status") {
    return [
      "월 목표 달성 여부는 매출 규모와 비용 효율을 함께 기준으로 판단합니다.",
      "ROAS와 CPA는 효율을, 전환과 매출은 성과 규모를 설명합니다.",
      "목표 대비 부족한 구간은 이후 구조 분석에서 원인을 확인합니다.",
    ];
  }

  if (slide.key === "kpi-trend") {
    return [
      "월별 KPI 흐름을 통해 성과의 방향성과 지속성을 확인합니다.",
      "비용 증가와 매출 증가가 함께 움직이는지 우선 점검합니다.",
      "ROAS 변동이 큰 월은 캠페인, 키워드, 소재 변화와 함께 해석해야 합니다.",
    ];
  }

  if (slide.key === "weekly-performance") {
    return [
      "주차별 흐름은 최근 운영 조정의 단기 영향을 확인하는 기준입니다.",
      "성과가 급변한 주차는 예산, 입찰, 소재, 캠페인 변경 이력을 함께 봐야 합니다.",
      "최근 주차의 성과가 유지되는지 확인한 뒤 확대 여부를 판단합니다.",
    ];
  }

  if (slide.key === "source-structure") {
    return [
      "소스와 채널별 성과는 예산 배분의 효율성을 판단하는 기준입니다.",
      "비용이 큰 소스와 ROAS가 높은 소스가 일치하는지 확인해야 합니다.",
      "고비용 저효율 소스는 다음 예산 재배분 검토 대상입니다.",
    ];
  }

  if (slide.key === "campaign-structure") {
    return [
      "캠페인별 성과는 비용 집중도와 매출 기여도를 함께 비교합니다.",
      "일부 캠페인에 비용이 집중되어 있다면 전체 성과 변동성이 커질 수 있습니다.",
      "효율이 낮은 캠페인은 구조 조정 또는 예산 축소 후보입니다.",
    ];
  }

  if (slide.key === "keyword-performance") {
    return [
      "키워드 성과는 전환 기여도와 비용 효율을 함께 기준으로 봅니다.",
      "전환을 만든 키워드와 클릭만 만든 키워드를 분리해 해석해야 합니다.",
      "전환 규모와 CPA가 동시에 좋은 키워드는 확장 후보입니다.",
    ];
  }

  if (slide.key === "keyword-insight") {
    return [
      "저효율 키워드는 비용, 전환, ROAS를 함께 기준으로 점검합니다.",
      "비용은 쓰지만 전환이 낮은 키워드는 입찰 또는 제외 후보입니다.",
      "검색 의도와 랜딩 적합성을 확인한 뒤 조정 강도를 결정합니다.",
    ];
  }

  if (slide.key === "creative-performance") {
    return [
      "소재 성과는 클릭 유도력과 전환 설득력을 함께 기준으로 봅니다.",
      "전환과 ROAS가 함께 높은 소재는 확장 가능성이 높습니다.",
      "클릭은 높지만 전환이 낮은 소재는 메시지와 랜딩 연결을 점검해야 합니다.",
    ];
  }

  if (slide.key === "creative-insight") {
    return [
      "저효율 소재는 비용 대비 전환 기여가 낮은 구간을 중심으로 확인합니다.",
      "성과가 낮은 소재는 노출 축소, 교체, 메시지 테스트 후보입니다.",
      "성과 소재의 메시지 구조를 다음 제작 기준으로 재활용합니다.",
    ];
  }

  if (slide.key === "decision-hypothesis") {
    return [
      "Decision 단계에서는 비용 효율, 전환 규모, 확장 가능성을 함께 판단합니다.",
      "성과가 좋은 구조는 확대하고 저효율 구조는 축소하는 방향이 우선입니다.",
      "가설은 다음 실행과 리뷰 기준으로 연결되어야 합니다.",
    ];
  }

  if (slide.key === "action-plan") {
    return [
      "다음 액션은 고효율 확대, 저효율 축소, 신규 테스트 순서로 정리합니다.",
      "각 액션은 실행 후 KPI 변화로 검증할 수 있어야 합니다.",
      "다음 보고서에서는 실행 결과가 실제 성과에 미친 영향을 확인합니다.",
    ];
  }

  if (slide.key === "appendix") {
    return [
      "Appendix는 보고서 산출 기준과 전체 데이터 규모를 확인하는 보조 자료입니다.",
      "상세 검증이 필요할 경우 원본 CSV와 리포트 화면을 함께 확인합니다.",
      "본문 의사결정은 앞선 핵심 슬라이드의 분석 결과를 기준으로 합니다.",
    ];
  }

  return [
    `${title || "해당 페이지"}의 핵심 데이터를 기준으로 성과를 요약했습니다.`,
    "주요 지표의 규모와 효율을 함께 비교해 해석합니다.",
    "다음 운영 판단에 필요한 변화 구간을 확인합니다.",
  ];
}

function getSlideFallbackInsights(slide: PptSlide) {
  if (slide.key === "executive-summary") {
    return [
      "전체 성과는 단일 KPI보다 비용, 매출, ROAS, 전환의 균형으로 판단해야 합니다.",
      "성과가 좋은 구간은 이후 구조 분석에서 확장 후보로 분리합니다.",
      "저효율 구간은 비용 누수 여부를 확인한 뒤 조정 우선순위를 정합니다.",
    ];
  }

  if (slide.key === "goal-status") {
    return [
      "목표 대비 부족분은 단순 증액보다 효율 유지 가능성을 먼저 확인해야 합니다.",
      "ROAS가 높아도 전환 규모가 작으면 확장 여지가 제한됩니다.",
      "CPA와 ROAS가 동시에 안정적인 구간을 다음 운영 기준으로 삼습니다.",
    ];
  }

  if (slide.key === "kpi-trend") {
    return [
      "성과 흐름이 안정적이면 확대 테스트를 검토할 수 있습니다.",
      "효율이 하락한 구간은 캠페인/키워드/소재 변경 이력을 확인해야 합니다.",
      "추세가 불안정하면 예산 확대보다 원인 분해가 우선입니다.",
    ];
  }

  if (slide.key === "weekly-performance") {
    return [
      "최근 주차 성과가 개선 중이면 단기 확대 테스트가 가능합니다.",
      "주차별 변동이 크면 운영 변경 이력을 기준으로 원인을 구분해야 합니다.",
      "성과가 좋은 주차의 조건을 다음 운영 기준으로 복제합니다.",
    ];
  }

  if (slide.key === "source-structure") {
    return [
      "고효율 소스는 예산 확대 후보입니다.",
      "고비용 저효율 소스는 예산 축소 또는 운영 구조 점검이 필요합니다.",
      "소스별 역할을 분리해 유입, 전환, 매출 기여를 따로 해석합니다.",
    ];
  }

  if (slide.key === "campaign-structure") {
    return [
      "성과를 견인하는 캠페인은 예산과 소재 확장 후보입니다.",
      "비용 집중도가 높고 효율이 낮은 캠페인은 우선 조정 대상입니다.",
      "캠페인 구조는 목표 KPI 기준으로 재배분하는 것이 안전합니다.",
    ];
  }

  if (slide.key === "keyword-performance") {
    return [
      "전환과 CPA가 모두 좋은 키워드는 입찰 확대 후보입니다.",
      "클릭은 많지만 전환이 낮은 키워드는 검색 의도와 랜딩을 점검해야 합니다.",
      "성과 키워드의 공통 패턴을 신규 키워드 확장 기준으로 사용합니다.",
    ];
  }

  if (slide.key === "keyword-insight") {
    return [
      "저효율 키워드는 즉시 제외보다 입찰, 매칭, 랜딩 적합성을 먼저 확인합니다.",
      "비용이 크고 전환이 없는 키워드는 빠른 조정이 필요합니다.",
      "성과 키워드와 저효율 키워드의 예산 배분을 다음 운영에 반영합니다.",
    ];
  }

  if (slide.key === "creative-performance") {
    return [
      "전환 소재의 메시지 구조를 다음 소재 제작 기준으로 삼습니다.",
      "클릭 효율과 전환 효율이 모두 좋은 소재는 확장 후보입니다.",
      "클릭만 높은 소재는 후속 설득 요소를 보완해야 합니다.",
    ];
  }

  if (slide.key === "creative-insight") {
    return [
      "저효율 소재는 노출 축소 또는 교체 테스트 후보입니다.",
      "성과가 낮은 소재는 메시지, 혜택, 이미지 구조를 분리해 점검합니다.",
      "성과 소재의 패턴을 기준으로 다음 A/B 테스트를 설계합니다.",
    ];
  }

  if (slide.key === "decision-hypothesis") {
    return [
      "다음 운영은 고효율 확대와 저효율 축소를 동시에 진행해야 합니다.",
      "가설은 반드시 측정 가능한 KPI와 연결되어야 합니다.",
      "실행 후 리뷰 결과를 다음 우선순위에 반영하는 구조가 필요합니다.",
    ];
  }

  if (slide.key === "action-plan") {
    return [
      "우선순위 1번 액션부터 실행하고, 결과를 다음 리포트에서 검증합니다.",
      "예산 재배분은 성과가 확인된 구간부터 작게 시작하는 것이 안전합니다.",
      "각 액션은 실행일, 변경 내용, 결과 KPI를 함께 기록해야 합니다.",
    ];
  }

  if (slide.key === "appendix") {
    return [
      "Appendix는 의사결정보다 검증과 추적 용도로 사용합니다.",
      "수치 차이가 발견되면 원본 CSV와 집계 기준을 함께 확인합니다.",
      "다음 리포트에서는 실행 결과와 KPI 변화를 연결해 검토합니다.",
    ];
  }

  return [
    "핵심 성과가 발생한 구간을 다음 운영 후보로 분리합니다.",
    "비용 대비 성과가 낮은 구간은 조정 우선순위로 검토합니다.",
    "다음 액션은 측정 가능한 KPI와 연결해 실행합니다.",
  ];
}

function buildSlideInsightText(slide: PptSlide, deck: PptReportDeck): PptSlideInsightText {
  const analysis = ensureThreeLines(
    slide.analysisInputs,
    getSlideFallbackAnalysis(slide, deck),
  );

  const insights = ensureThreeLines(
    slide.insightInputs,
    getSlideFallbackInsights(slide),
  );

  return {
    analysis: normalizeThreeLines(analysis),
    insights: normalizeThreeLines(insights),
  };
}

export function buildPptInsights({
  deck,
}: BuildPptInsightsParams): PptDeckInsightText {
  const slides: Record<string, PptSlideInsightText> = {};

  for (const slide of deck.slides ?? []) {
    if (!slide?.key) continue;

    slides[slide.key] = buildSlideInsightText(slide, deck);
  }

  return {
    slides,
  };
}

export function getPptSlideInsightText(args: {
  insights: PptDeckInsightText;
  slideKey: string;
}): PptSlideInsightText {
  const { insights, slideKey } = args;

  return (
    insights.slides[slideKey] ?? {
      analysis: [
        "핵심 데이터를 기준으로 현재 성과를 요약합니다.",
        "성과 규모와 효율을 함께 비교해 해석합니다.",
        "다음 운영 판단에 필요한 변화 구간을 확인합니다.",
      ],
      insights: [
        "성과가 좋은 구간은 확장 후보입니다.",
        "저효율 구간은 조정 또는 재점검 후보입니다.",
        "다음 액션은 측정 가능한 KPI와 연결해야 합니다.",
      ],
    }
  );
}
// src/lib/export-builder/insights.ts

import type {
  ExportChartPoint,
  ExportCreativeRow,
  ExportFunnelStep,
  ExportGoalItem,
  ExportHeatmapDay,
  ExportKeywordRow,
  ExportSectionDataMap,
  ExportSectionMeta,
} from "./section-props";
import type { ExportSectionKey } from "./types";

type BuildAutoInsightInput<K extends ExportSectionKey = ExportSectionKey> = {
  sectionKey: K;
  data?: Partial<ExportSectionDataMap[K]>;
  meta?: Partial<ExportSectionMeta>;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatPercent01(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatSignedPercentDiff(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return "";
  }

  const diff = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(diff);

  if (rounded > 0) return `전 단계 대비 ${rounded}% 증가`;
  if (rounded < 0) return `전 단계 대비 ${Math.abs(rounded)}% 감소`;
  return "전 단계와 유사";
}

function getTopKeyword(rows: ExportKeywordRow[]): ExportKeywordRow | null {
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    const revenueDiff = toNumber(b.revenue) - toNumber(a.revenue);
    if (revenueDiff !== 0) return revenueDiff;

    const convDiff = toNumber(b.conversions) - toNumber(a.conversions);
    if (convDiff !== 0) return convDiff;

    return toNumber(b.clicks) - toNumber(a.clicks);
  });

  return sorted[0] ?? null;
}

function getTopCreative(rows: ExportCreativeRow[]): ExportCreativeRow | null {
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    const revenueDiff = toNumber(b.revenue) - toNumber(a.revenue);
    if (revenueDiff !== 0) return revenueDiff;

    const convDiff = toNumber(b.conversions) - toNumber(a.conversions);
    if (convDiff !== 0) return convDiff;

    return toNumber(b.clicks) - toNumber(a.clicks);
  });

  return sorted[0] ?? null;
}

function buildSummaryKpiInsight(
  data?: Partial<ExportSectionDataMap["summary-kpi"]>
): string {
  const cards = data?.cards ?? [];
  if (!cards.length) return "";

  const roasCard =
    cards.find((card) => card.key === "roas") ??
    cards.find((card) => /roas/i.test(card.label));

  const revenueCard =
    cards.find((card) => card.key === "revenue") ??
    cards.find((card) => /매출/.test(card.label));

  const costCard =
    cards.find((card) => card.key === "cost") ??
    cards.find((card) => /광고비|비용/.test(card.label));

  const conversionCard =
    cards.find((card) => card.key === "conversions") ??
    cards.find((card) => /전환/.test(card.label));

  const parts: string[] = [];

  if (roasCard?.value) {
    parts.push(`ROAS는 ${roasCard.value}`);
  }

  if (revenueCard?.value && costCard?.value) {
    parts.push(`매출 ${revenueCard.value}, 광고비 ${costCard.value}`);
  }

  if (conversionCard?.value) {
    parts.push(`전환은 ${conversionCard.value}`);
  }

  const headline = parts.length > 0 ? `${parts.join(", ")} 수준이야.` : "";

  const changeSource =
    roasCard?.changeLabel ||
    revenueCard?.changeLabel ||
    costCard?.changeLabel ||
    conversionCard?.changeLabel ||
    "";

  if (headline && changeSource) {
    return `${headline} ${changeSource} 흐름을 함께 확인할 수 있어.`;
  }

  if (headline) {
    return `${headline} 핵심 KPI 전반을 한 장에서 요약한 장표야.`;
  }

  return "";
}

function buildSummaryChartInsight(
  data?: Partial<ExportSectionDataMap["summary-chart"]>
): string {
  const points = data?.points ?? [];
  if (points.length < 2) return "";

  const first = points[0] as ExportChartPoint;
  const last = points[points.length - 1] as ExportChartPoint;

  const leftMetric = data?.leftMetric ?? "cost";
  const rightMetric = data?.rightMetric ?? "revenue";

  const leftFirst = toNumber(first[leftMetric]);
  const leftLast = toNumber(last[leftMetric]);
  const rightFirst = toNumber(first[rightMetric]);
  const rightLast = toNumber(last[rightMetric]);

  const leftTrend =
    leftLast > leftFirst ? "확대" : leftLast < leftFirst ? "축소" : "유지";
  const rightTrend =
    rightLast > rightFirst ? "상승" : rightLast < rightFirst ? "하락" : "유지";

  return `${String(leftMetric).toUpperCase()} 흐름은 ${leftTrend}, ${String(
    rightMetric
  ).toUpperCase()} 흐름은 ${rightTrend} 추세야. 시작 구간 대비 마지막 구간 변화를 함께 보면서 집행 확대가 성과 상승으로 이어졌는지 확인할 수 있어.`;
}

function buildSummaryGoalInsight(
  data?: Partial<ExportSectionDataMap["summary-goal"]>
): string {
  const goals = data?.goals ?? [];
  if (!goals.length) return "";

  const ranked = [...goals].sort((a, b) => {
    const aProgress =
      typeof a.progress === "number" ? a.progress : toNumber(a.actual) / Math.max(1, toNumber(a.goal));
    const bProgress =
      typeof b.progress === "number" ? b.progress : toNumber(b.actual) / Math.max(1, toNumber(b.goal));
    return bProgress - aProgress;
  });

  const top = ranked[0] as ExportGoalItem;
  const progress =
    typeof top.progress === "number"
      ? top.progress
      : toNumber(top.actual) / Math.max(1, toNumber(top.goal));

  const progressLabel = formatPercent01(progress);

  return `${top.label} 기준 달성률은 ${progressLabel}야. 목표 대비 현재 실적 간격을 확인하면서 남은 기간 운영 강도를 조정할 수 있어.`;
}

function buildHeatmapInsight(
  data?: Partial<ExportSectionDataMap["summary2-heatmap"]>
): string {
  const days = data?.days ?? [];
  if (!days.length) return "";

  const topDay = [...days].sort((a, b) => toNumber(b.value) - toNumber(a.value))[0] as
    | ExportHeatmapDay
    | undefined;

  const weakDay = [...days].sort((a, b) => toNumber(a.value) - toNumber(b.value))[0] as
    | ExportHeatmapDay
    | undefined;

  if (!topDay) return "";

  if (weakDay && weakDay.dayLabel !== topDay.dayLabel) {
    return `${topDay.dayLabel} 구간 성과가 가장 강했고, ${weakDay.dayLabel} 구간은 상대적으로 약했어. 일자별 편차를 기준으로 예산 배분과 운영 강약 조절 포인트를 잡을 수 있어.`;
  }

  return `${topDay.dayLabel} 구간 성과가 가장 강하게 나타났어. 일자별 성과 집중 구간을 확인하는 데 적합한 장표야.`;
}

function buildFunnelInsight(
  data?: Partial<ExportSectionDataMap["summary2-funnel"]>
): string {
  const steps = data?.steps ?? [];
  if (steps.length < 2) return "";

  let weakestIndex = -1;
  let weakestRatio = Number.POSITIVE_INFINITY;

  steps.forEach((step, index) => {
    if (index === 0) return;

    const ratio =
      typeof step.ratioFromPrev === "number"
        ? step.ratioFromPrev
        : NaN;

    if (Number.isFinite(ratio) && ratio < weakestRatio) {
      weakestRatio = ratio;
      weakestIndex = index;
    }
  });

  if (weakestIndex > 0) {
    const current = steps[weakestIndex] as ExportFunnelStep;
    const previous = steps[weakestIndex - 1] as ExportFunnelStep;

    return `${previous.label} → ${current.label} 구간의 유지율이 가장 낮아 보여. 병목 구간을 중심으로 클릭 이후 전환 최적화 또는 랜딩 개선 우선순위를 잡을 수 있어.`;
  }

  const first = steps[0] as ExportFunnelStep;
  const last = steps[steps.length - 1] as ExportFunnelStep;

  return `${first.label}부터 ${last.label}까지 단계별 전환 흐름을 한 번에 보여주는 장표야. 구간별 이탈 폭을 기준으로 개선 우선순위를 정하기 좋아.`;
}

function buildKeywordInsight(
  data?: Partial<ExportSectionDataMap["keyword-top10"]>
): string {
  const rows = data?.rows ?? [];
  if (!rows.length) return "";

  const top = getTopKeyword(rows);
  if (!top) return "";

  const topRevenue = toNumber(top.revenue);
  const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const share =
    totalRevenue > 0 ? topRevenue / totalRevenue : 0;

  const roas = toNumber(top.roas);

  if (share > 0) {
    return `상위 키워드 "${top.keyword}"가 전체 상위 키워드 매출의 ${formatPercent01(
      share
    )}를 차지하고 있어. ${
      roas > 0
        ? `해당 키워드 ROAS는 ${formatPercentValue(roas)} 수준이야. `
        : ""
    }성과 집중 키워드와 확장 후보를 함께 점검하기 좋아.`;
  }

  return `상위 키워드 "${top.keyword}" 중심으로 성과가 형성되고 있어. 키워드별 광고비·매출·ROAS 비교에 적합한 장표야.`;
}

function buildCreativeInsight(
  data?: Partial<ExportSectionDataMap["creative-top8"]>
): string {
  const rows = data?.rows ?? [];
  if (!rows.length) return "";

  const top = getTopCreative(rows);
  if (!top) return "";

  const topRevenue = toNumber(top.revenue);
  const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const share =
    totalRevenue > 0 ? topRevenue / totalRevenue : 0;

  const label = top.name?.trim() || `소재 ${top.rank}`;

  if (share > 0) {
    return `상위 소재 "${label}"가 상위 소재 매출의 ${formatPercent01(
      share
    )}를 차지하고 있어. 성과 집중 소재와 교체 후보 소재를 구분해서 운영 판단에 활용할 수 있어.`;
  }

  return `상위 소재 "${label}"가 상대적으로 강한 성과를 보이고 있어. 소재별 성과 편차와 주력 크리에이티브를 확인하기 좋은 장표야.`;
}

export function buildAutoInsight<K extends ExportSectionKey>(
  input: BuildAutoInsightInput<K>
): string {
  switch (input.sectionKey) {
    case "summary-kpi":
      return buildSummaryKpiInsight(
        input.data as Partial<ExportSectionDataMap["summary-kpi"]> | undefined
      );

    case "summary-chart":
      return buildSummaryChartInsight(
        input.data as Partial<ExportSectionDataMap["summary-chart"]> | undefined
      );

    case "summary-goal":
      return buildSummaryGoalInsight(
        input.data as Partial<ExportSectionDataMap["summary-goal"]> | undefined
      );

    case "summary2-heatmap":
      return buildHeatmapInsight(
        input.data as Partial<ExportSectionDataMap["summary2-heatmap"]> | undefined
      );

    case "summary2-funnel":
      return buildFunnelInsight(
        input.data as Partial<ExportSectionDataMap["summary2-funnel"]> | undefined
      );

    case "keyword-top10":
      return buildKeywordInsight(
        input.data as Partial<ExportSectionDataMap["keyword-top10"]> | undefined
      );

    case "creative-top8":
      return buildCreativeInsight(
        input.data as Partial<ExportSectionDataMap["creative-top8"]> | undefined
      );

    default:
      return "";
  }
}
import type { DecisionHypothesis } from "./hypothesis";
import type {
  DecisionEngineInput,
  GoalMetric,
  GoalSnapshot,
} from "./types";

export type HypothesisSimulationResult = {
  hypothesisId: string;
  scenarioLabel: string;
  expectedAttainmentRateDelta: number; // +0.032 => +3.2%p
  expectedForecastAttainmentRate: number;
  expectedForecastValue: number;
  summary: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function safeDivide(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function toSafeNumber(value: any): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/[%₩,\s]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function metricLabel(metric: GoalMetric): string {
  switch (metric) {
    case "impressions":
      return "노출";
    case "clicks":
      return "클릭";
    case "conversions":
      return "전환";
    case "revenue":
      return "매출";
    case "spend":
      return "비용";
    case "ctr":
      return "CTR";
    case "cvr":
      return "CVR";
    case "cpc":
      return "CPC";
    case "cpa":
      return "CPA";
    case "roas":
      return "ROAS";
    default:
      return metric;
  }
}

function formatMetricValue(metric: GoalMetric, value: number): string {
  const safe = Number.isFinite(value) ? value : 0;

  switch (metric) {
    case "ctr":
    case "cvr":
    case "roas":
      return `${(safe * 100).toFixed(1)}%`;
    case "spend":
    case "revenue":
    case "cpc":
    case "cpa":
      return `${Math.round(safe).toLocaleString()}`;
    case "impressions":
    case "clicks":
    case "conversions":
    default:
      return `${Math.round(safe).toLocaleString()}`;
  }
}

function formatPercentPoint(rate: number): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  const signed = safe >= 0 ? "+" : "";
  return `${signed}${(safe * 100).toFixed(1)}%p`;
}

function isLowerBetterMetric(metric: GoalMetric): boolean {
  return metric === "cpa" || metric === "cpc";
}

function pickFirstNumber(obj: any, keys: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  for (const key of keys) {
    if (!(key in obj)) continue;
    const n = toSafeNumber(obj[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function resolveRowMetricValue(row: any, metric: GoalMetric): number {
  switch (metric) {
    case "impressions":
      return pickFirstNumber(row, ["impressions", "impr"]);
    case "clicks":
      return pickFirstNumber(row, ["clicks", "click", "clk"]);
    case "conversions":
      return pickFirstNumber(row, ["conversions", "conversion", "conv", "cv"]);
    case "revenue":
      return pickFirstNumber(row, ["revenue", "sales", "purchase", "purchase_amount", "gmv"]);
    case "spend":
      return pickFirstNumber(row, ["spend", "cost", "ad_cost"]);
    case "ctr": {
      const raw = pickFirstNumber(row, ["ctr"]);
      if (raw > 0) return raw > 1 ? raw / 100 : raw;
      const clicks = resolveRowMetricValue(row, "clicks");
      const impressions = resolveRowMetricValue(row, "impressions");
      return safeDivide(clicks, impressions);
    }
    case "cvr": {
      const raw = pickFirstNumber(row, ["cvr"]);
      if (raw > 0) return raw > 1 ? raw / 100 : raw;
      const conversions = resolveRowMetricValue(row, "conversions");
      const clicks = resolveRowMetricValue(row, "clicks");
      return safeDivide(conversions, clicks);
    }
    case "cpc": {
      const raw = pickFirstNumber(row, ["cpc"]);
      if (raw > 0) return raw;
      const spend = resolveRowMetricValue(row, "spend");
      const clicks = resolveRowMetricValue(row, "clicks");
      return safeDivide(spend, clicks);
    }
    case "cpa": {
      const raw = pickFirstNumber(row, ["cpa"]);
      if (raw > 0) return raw;
      const spend = resolveRowMetricValue(row, "spend");
      const conversions = resolveRowMetricValue(row, "conversions");
      return safeDivide(spend, conversions);
    }
    case "roas": {
      const raw = pickFirstNumber(row, ["roas"]);
      if (raw > 0) return raw > 1 ? raw / 100 : raw;
      const revenue = resolveRowMetricValue(row, "revenue");
      const spend = resolveRowMetricValue(row, "spend");
      return safeDivide(revenue, spend);
    }
    default:
      return 0;
  }
}

function getTopSpendRows(rows?: any[]): any[] {
  if (!Array.isArray(rows)) return [];
  return [...rows]
    .filter((row) => resolveRowMetricValue(row, "spend") > 0)
    .sort(
      (a, b) =>
        resolveRowMetricValue(b, "spend") - resolveRowMetricValue(a, "spend"),
    );
}

function calculateExpectedForecastValue(
  snapshot: GoalSnapshot,
  improvementFactor: number,
): number {
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);

  if (snapshot.primaryMetric === "ctr" || snapshot.primaryMetric === "cvr" || snapshot.primaryMetric === "roas") {
    if (lowerBetter) {
      return Math.max(0, snapshot.forecastValue * (1 - improvementFactor));
    }
    return snapshot.forecastValue * (1 + improvementFactor);
  }

  if (lowerBetter) {
    return Math.max(0, snapshot.forecastValue * (1 - improvementFactor));
  }

  return snapshot.forecastValue * (1 + improvementFactor);
}

function calculateExpectedForecastAttainmentRate(
  snapshot: GoalSnapshot,
  expectedForecastValue: number,
): number {
  if (snapshot.goalValue <= 0) return 0;

  if (isLowerBetterMetric(snapshot.primaryMetric)) {
    return safeDivide(snapshot.goalValue, Math.max(expectedForecastValue, 1e-9));
  }

  return safeDivide(expectedForecastValue, snapshot.goalValue);
}

function resolveImprovementFactor(
  hypothesis: DecisionHypothesis,
  input: DecisionEngineInput,
  snapshot: GoalSnapshot,
): number {
  const lowerBetter = isLowerBetterMetric(snapshot.primaryMetric);

  if (hypothesis.id === "pace-gap") {
    if (snapshot.pacingStatus === "behind") {
      return lowerBetter ? 0.06 : 0.08;
    }
    if (snapshot.pacingStatus === "on_track") {
      return lowerBetter ? 0.03 : 0.04;
    }
    return lowerBetter ? 0.02 : 0.025;
  }

  if (hypothesis.id === "campaign-reallocation") {
    const candidates = getTopSpendRows(input.grouped.byCampaign);
    if (candidates.length < 2) return lowerBetter ? 0.03 : 0.04;

    const topRows = candidates.slice(0, Math.min(5, candidates.length));
    const ranked = [...topRows].sort((a, b) => {
      const av = resolveRowMetricValue(a, snapshot.primaryMetric);
      const bv = resolveRowMetricValue(b, snapshot.primaryMetric);
      return lowerBetter ? av - bv : bv - av;
    });

    const best = ranked[0];
    const worst = ranked[ranked.length - 1];

    const bestMetric = resolveRowMetricValue(best, snapshot.primaryMetric);
    const worstMetric = resolveRowMetricValue(worst, snapshot.primaryMetric);

    if (lowerBetter) {
      if (bestMetric <= 0 || worstMetric <= 0) return 0.04;
      const efficiencyGap = safeDivide(worstMetric - bestMetric, worstMetric);
      return clamp01(0.03 + efficiencyGap * 0.25);
    }

    if (bestMetric <= 0) return 0.04;
    const liftGap = safeDivide(bestMetric - worstMetric, Math.max(bestMetric, 1e-9));
    return clamp01(0.04 + Math.max(0, liftGap) * 0.28);
  }

  if (
    hypothesis.id === "weekly-deterioration" ||
    hypothesis.id === "weekly-expansion" ||
    hypothesis.id === "weekly-stability"
  ) {
    const weeks = Array.isArray(input.grouped.byWeek) ? input.grouped.byWeek : [];
    if (weeks.length < 2) return lowerBetter ? 0.025 : 0.03;

    const latest = weeks[weeks.length - 1];
    const previous = weeks[weeks.length - 2];

    const latestMetric = resolveRowMetricValue(latest, snapshot.primaryMetric);
    const previousMetric = resolveRowMetricValue(previous, snapshot.primaryMetric);

    if (previousMetric <= 0 && latestMetric <= 0) return lowerBetter ? 0.025 : 0.03;

    const trendGap = Math.abs(safeDivide(latestMetric - previousMetric, Math.max(previousMetric, 1e-9)));

    if (hypothesis.id === "weekly-deterioration") {
      return clamp01((lowerBetter ? 0.03 : 0.04) + trendGap * 0.15);
    }

    if (hypothesis.id === "weekly-expansion") {
      return clamp01((lowerBetter ? 0.02 : 0.03) + trendGap * 0.12);
    }

    return lowerBetter ? 0.02 : 0.025;
  }

  return lowerBetter ? 0.02 : 0.03;
}

function buildScenarioLabel(hypothesisId: string): string {
  switch (hypothesisId) {
    case "pace-gap":
      return "예산 재배치";
    case "campaign-reallocation":
      return "효율 개선";
    case "weekly-deterioration":
    case "weekly-expansion":
    case "weekly-stability":
      return "주차 회복";
    default:
      return "운영 보정";
  }
}

function buildSummary(args: {
  snapshot: GoalSnapshot;
  hypothesis: DecisionHypothesis;
  expectedForecastValue: number;
  expectedAttainmentRateDelta: number;
}): string {
  const { snapshot, hypothesis, expectedForecastValue, expectedAttainmentRateDelta } = args;
  const metricName = metricLabel(snapshot.primaryMetric);

  return `${buildScenarioLabel(hypothesis.id)} 가정 시 월말 예상 ${metricName}는 ${formatMetricValue(
    snapshot.primaryMetric,
    expectedForecastValue,
  )} 수준으로 재계산되며, 예상 달성률은 ${formatPercentPoint(
    expectedAttainmentRateDelta,
  )} 개선되는 시나리오입니다.`;
}

export function buildSimulationResults(
  input: DecisionEngineInput,
  snapshot: GoalSnapshot,
  hypotheses: DecisionHypothesis[],
): HypothesisSimulationResult[] {
  return hypotheses.map((hypothesis) => {
    const improvementFactor = resolveImprovementFactor(hypothesis, input, snapshot);
    const expectedForecastValue = calculateExpectedForecastValue(snapshot, improvementFactor);
    const expectedForecastAttainmentRate = calculateExpectedForecastAttainmentRate(
      snapshot,
      expectedForecastValue,
    );
    const expectedAttainmentRateDelta =
      expectedForecastAttainmentRate - snapshot.forecastAttainmentRate;

    return {
      hypothesisId: hypothesis.id,
      scenarioLabel: buildScenarioLabel(hypothesis.id),
      expectedAttainmentRateDelta,
      expectedForecastAttainmentRate,
      expectedForecastValue,
      summary: buildSummary({
        snapshot,
        hypothesis,
        expectedForecastValue,
        expectedAttainmentRateDelta,
      }),
    };
  });
}
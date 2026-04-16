// src/lib/decision/goal.ts

import type {
  DecisionEngineInput,
  DecisionObjective,
  GoalMetric,
  GoalSnapshot,
  GoalTarget,
  MetricSnapshot,
} from "./types";
import { getPrimaryMetricCandidatesByObjective } from "./input";

function safeDivide(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function roundMetricValue(metric: GoalMetric, value: number): number {
  if (!Number.isFinite(value)) return 0;

  switch (metric) {
    case "ctr":
    case "cvr":
    case "roas":
      return value;
    case "cpc":
    case "cpa":
    case "spend":
    case "revenue":
      return Math.round(value);
    case "impressions":
    case "clicks":
    case "conversions":
    default:
      return Math.round(value);
  }
}

function isRateMetric(metric: GoalMetric): boolean {
  return (
    metric === "ctr" ||
    metric === "cvr" ||
    metric === "cpc" ||
    metric === "cpa" ||
    metric === "roas"
  );
}

function resolvePrimaryGoalMetric(
  objective: DecisionObjective,
  goal: GoalTarget,
  actual: MetricSnapshot,
): GoalMetric {
  const candidates = getPrimaryMetricCandidatesByObjective(objective);

  for (const metric of candidates) {
    const goalValue = goal[metric] ?? 0;
    if (goalValue > 0) return metric;
  }

  for (const metric of candidates) {
    const actualValue = actual[metric];
    if (actualValue > 0) return metric;
  }

  return candidates[0];
}

function resolveGoalValue(primaryMetric: GoalMetric, goal: GoalTarget): number {
  const value = goal[primaryMetric] ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function resolveActualValue(primaryMetric: GoalMetric, actual: MetricSnapshot): number {
  const value = actual[primaryMetric];
  return Number.isFinite(value) ? value : 0;
}

function calculateForecastValue(
  primaryMetric: GoalMetric,
  actualValue: number,
  elapsedDays: number,
  totalDays: number,
): number {
  if (!Number.isFinite(actualValue)) return 0;
  if (actualValue <= 0) return 0;

  if (elapsedDays <= 0 || totalDays <= 0) {
    return roundMetricValue(primaryMetric, actualValue);
  }

  if (isRateMetric(primaryMetric)) {
    return roundMetricValue(primaryMetric, actualValue);
  }

  const projected = (actualValue / elapsedDays) * totalDays;
  return roundMetricValue(primaryMetric, projected);
}

function calculateAttainmentRate(actualValue: number, goalValue: number): number {
  if (!Number.isFinite(actualValue) || !Number.isFinite(goalValue) || goalValue <= 0) return 0;
  return safeDivide(actualValue, goalValue);
}

function calculateForecastAttainmentRate(forecastValue: number, goalValue: number): number {
  if (!Number.isFinite(forecastValue) || !Number.isFinite(goalValue) || goalValue <= 0) return 0;
  return safeDivide(forecastValue, goalValue);
}

function calculateGapValue(
  primaryMetric: GoalMetric,
  goalValue: number,
  forecastValue: number,
): number {
  if (!Number.isFinite(goalValue) || goalValue <= 0) return 0;
  if (!Number.isFinite(forecastValue)) return goalValue;

  if (primaryMetric === "cpa" || primaryMetric === "cpc") {
    return Math.max(0, forecastValue - goalValue);
  }

  return Math.max(0, goalValue - forecastValue);
}

function calculatePaceRatio(attainmentRate: number, timeProgressRate: number): number {
  if (!Number.isFinite(attainmentRate) || !Number.isFinite(timeProgressRate) || timeProgressRate <= 0) {
    return 0;
  }
  return safeDivide(attainmentRate, timeProgressRate);
}

function resolvePacingStatus(paceRatio: number): "ahead" | "on_track" | "behind" {
  if (!Number.isFinite(paceRatio)) return "behind";
  if (paceRatio >= 1.05) return "ahead";
  if (paceRatio >= 0.95) return "on_track";
  return "behind";
}

function formatMetricValue(metric: GoalMetric, value: number): string {
  if (!Number.isFinite(value)) return "0";

  switch (metric) {
    case "ctr":
    case "cvr":
    case "roas":
      return `${(value * 100).toFixed(1)}%`;
    case "spend":
    case "revenue":
    case "cpc":
    case "cpa":
      return `${Math.round(value).toLocaleString()}`;
    case "impressions":
    case "clicks":
    case "conversions":
    default:
      return `${Math.round(value).toLocaleString()}`;
  }
}

function buildGoalMessage(args: {
  primaryMetric: GoalMetric;
  goalValue: number;
  forecastValue: number;
  gapValue: number;
  pacingStatus: "ahead" | "on_track" | "behind";
}): string {
  const { primaryMetric, gapValue, pacingStatus } = args;

  if (gapValue <= 0) {
    if (pacingStatus === "ahead") {
      return "현재 추세로는 목표 달성이 가능하며, 시간 경과 대비 앞서고 있습니다.";
    }
    return "현재 추세로는 목표 달성이 가능합니다.";
  }

  const gapText = formatMetricValue(primaryMetric, gapValue);

  if (primaryMetric === "cpa" || primaryMetric === "cpc") {
    return `현재 추세로는 월말 기준 ${primaryMetric.toUpperCase()}가 목표보다 ${gapText} 높을 것으로 예상됩니다.`;
  }

  return `현재 추세로는 월말 기준 목표 대비 ${gapText} 부족이 예상됩니다.`;
}

export function buildGoalSnapshot(input: DecisionEngineInput): GoalSnapshot {
  const objective = input.objective;
  const primaryMetric = resolvePrimaryGoalMetric(objective, input.goal, input.actual);

  const goalValue = resolveGoalValue(primaryMetric, input.goal);
  const actualValue = resolveActualValue(primaryMetric, input.actual);

  const elapsedDays = input.period.elapsedDays;
  const totalDays = input.period.totalDays;
  const remainingDays = input.period.remainingDays;
  const timeProgressRate = input.period.progressRate;

  const forecastValue = calculateForecastValue(
    primaryMetric,
    actualValue,
    elapsedDays,
    totalDays,
  );

  const attainmentRate = calculateAttainmentRate(actualValue, goalValue);
  const forecastAttainmentRate = calculateForecastAttainmentRate(forecastValue, goalValue);
  const gapValue = calculateGapValue(primaryMetric, goalValue, forecastValue);
  const paceRatio = calculatePaceRatio(attainmentRate, timeProgressRate);
  const pacingStatus = resolvePacingStatus(paceRatio);

  const message = buildGoalMessage({
    primaryMetric,
    goalValue,
    forecastValue,
    gapValue,
    pacingStatus,
  });

  return {
    objective,
    primaryMetric,

    goalValue,
    actualValue,
    attainmentRate,

    forecastValue,
    forecastAttainmentRate,
    gapValue,

    elapsedDays,
    totalDays,
    remainingDays,
    timeProgressRate,

    paceRatio,
    pacingStatus,

    message,
  };
}
// src/lib/decision/input.ts

import type {
  BuildDecisionEngineInputArgs,
  DecisionEngineInput,
  DecisionGroupedCollections,
  DecisionObjective,
  DecisionPeriodContext,
  GoalMetric,
  GoalTarget,
  MetricSnapshot,
} from "./types";

function toSafeNumber(value: any): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/[%₩,\s]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function parseLooseYmd(value: any): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/\./g, "-").replace(/\//g, "-");

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const d = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toYmd(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDaysInMonthByKey(monthKey: string): number {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return 30;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return 30;
  return new Date(year, month, 0).getDate();
}

function getMonthStartYmd(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  return `${monthKey}-01`;
}

function getMonthEndYmd(monthKey: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  return `${monthKey}-${String(getDaysInMonthByKey(monthKey)).padStart(2, "0")}`;
}

function diffDaysInclusive(startYmd: string | null, endYmd: string | null): number {
  const start = parseLooseYmd(startYmd);
  const end = parseLooseYmd(endYmd);
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  return days > 0 ? days : 0;
}

function resolveDecisionObjective(reportType?: string): DecisionObjective {
  const raw = String(reportType ?? "").trim().toLowerCase();

  if (
    raw.includes("traffic") ||
    raw.includes("트래픽")
  ) {
    return "traffic_growth";
  }

  if (
    raw.includes("db") ||
    raw.includes("acquisition") ||
    raw.includes("lead") ||
    raw.includes("획득")
  ) {
    return "lead_acquisition";
  }

  if (
    raw.includes("commerce") ||
    raw.includes("e-commerce") ||
    raw.includes("ecommerce") ||
    raw.includes("커머스") ||
    raw.includes("매출")
  ) {
    return "commerce_revenue";
  }

  return "lead_acquisition";
}

function normalizeRateMaybePercent(raw: any): number {
  const n = toSafeNumber(raw);
  if (n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

function safeDivide(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function pickFirstNumber(obj: any, keys: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  for (const key of keys) {
    if (key in obj) {
      const n = toSafeNumber(obj[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function pickFirstRate(obj: any, keys: string[]): number {
  if (!obj || typeof obj !== "object") return 0;
  for (const key of keys) {
    if (key in obj) {
      const n = normalizeRateMaybePercent(obj[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function normalizeActualMetrics(currentMonthActual: any): MetricSnapshot {
  const impressions = pickFirstNumber(currentMonthActual, [
    "impressions",
    "impr",
  ]);

  const clicks = pickFirstNumber(currentMonthActual, [
    "clicks",
    "click",
    "clk",
  ]);

  const conversions = pickFirstNumber(currentMonthActual, [
    "conversions",
    "conversion",
    "conv",
    "cv",
  ]);

  const revenue = pickFirstNumber(currentMonthActual, [
    "revenue",
    "sales",
    "purchase",
    "purchase_amount",
    "gmv",
  ]);

  const spend = pickFirstNumber(currentMonthActual, [
    "spend",
    "cost",
    "ad_cost",
  ]);

  const rawCtr = pickFirstRate(currentMonthActual, ["ctr"]);
  const rawCvr = pickFirstRate(currentMonthActual, ["cvr"]);
  const rawCpc = pickFirstNumber(currentMonthActual, ["cpc"]);
  const rawCpa = pickFirstNumber(currentMonthActual, ["cpa"]);
  const rawRoas = pickFirstRate(currentMonthActual, ["roas"]);

  const ctr = rawCtr > 0 ? rawCtr : safeDivide(clicks, impressions);
  const cvr = rawCvr > 0 ? rawCvr : safeDivide(conversions, clicks);
  const cpc = rawCpc > 0 ? rawCpc : safeDivide(spend, clicks);
  const cpa = rawCpa > 0 ? rawCpa : safeDivide(spend, conversions);
  const roas = rawRoas > 0 ? rawRoas : safeDivide(revenue, spend);

  return {
    impressions,
    clicks,
    conversions,
    revenue,
    spend,
    ctr,
    cvr,
    cpc,
    cpa,
    roas,
  };
}

function normalizeGoalTarget(
  monthGoal: any,
  currentMonthGoalComputed: any,
): GoalTarget {
  const sourcePrimary =
    currentMonthGoalComputed && typeof currentMonthGoalComputed === "object"
      ? currentMonthGoalComputed
      : null;

  const sourceSecondary =
    monthGoal && typeof monthGoal === "object"
      ? monthGoal
      : null;

  const pickNumber = (keys: string[]) => {
    const primary = pickFirstNumber(sourcePrimary, keys);
    if (primary > 0) return primary;
    const secondary = pickFirstNumber(sourceSecondary, keys);
    if (secondary > 0) return secondary;
    return 0;
  };

  const pickRate = (keys: string[]) => {
    const primary = pickFirstRate(sourcePrimary, keys);
    if (primary > 0) return primary;
    const secondary = pickFirstRate(sourceSecondary, keys);
    if (secondary > 0) return secondary;
    return 0;
  };

  const goal: GoalTarget = {};

  const impressions = pickNumber(["impressions", "impr"]);
  const clicks = pickNumber(["clicks", "click", "clk"]);
  const conversions = pickNumber(["conversions", "conversion", "conv", "cv"]);
  const revenue = pickNumber(["revenue", "sales", "purchase", "purchase_amount", "gmv"]);
  const spend = pickNumber(["spend", "cost", "ad_cost"]);
  const ctr = pickRate(["ctr"]);
  const cvr = pickRate(["cvr"]);
  const cpc = pickNumber(["cpc"]);
  const cpa = pickNumber(["cpa"]);
  const roas = pickRate(["roas"]);

  if (impressions > 0) goal.impressions = impressions;
  if (clicks > 0) goal.clicks = clicks;
  if (conversions > 0) goal.conversions = conversions;
  if (revenue > 0) goal.revenue = revenue;
  if (spend > 0) goal.spend = spend;
  if (ctr > 0) goal.ctr = ctr;
  if (cvr > 0) goal.cvr = cvr;
  if (cpc > 0) goal.cpc = cpc;
  if (cpa > 0) goal.cpa = cpa;
  if (roas > 0) goal.roas = roas;

  return goal;
}

function buildDecisionPeriodContext(args: {
  currentMonthKey: string;
  reportPeriod?: {
    startDate?: string | null;
    endDate?: string | null;
  };
  lastDataDate?: string | null;
}): DecisionPeriodContext {
  const { currentMonthKey, reportPeriod, lastDataDate } = args;

  const todayYmd = toYmd(new Date());
  const monthStart = getMonthStartYmd(currentMonthKey);
  const monthEnd = getMonthEndYmd(currentMonthKey);

  const fallbackLastDataDate = todayYmd;
  const rawLastDataDate = lastDataDate ?? fallbackLastDataDate;
  const parsedLastDataDate = parseLooseYmd(rawLastDataDate);
  const normalizedLastDataDate = toYmd(parsedLastDataDate);

  const lastDataMonthKey =
    normalizedLastDataDate && normalizedLastDataDate.length >= 7
      ? normalizedLastDataDate.slice(0, 7)
      : null;

  const effectiveLastDataDate =
    lastDataMonthKey === currentMonthKey
      ? normalizedLastDataDate
      : monthEnd;

  const startDate = reportPeriod?.startDate ?? monthStart;
  const endDate = reportPeriod?.endDate ?? monthEnd;

  const elapsedDays = diffDaysInclusive(monthStart, effectiveLastDataDate);
  const totalDays = getDaysInMonthByKey(currentMonthKey);
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const progressRate = totalDays > 0 ? clamp01(elapsedDays / totalDays) : 0;

  return {
    currentMonthKey,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    todayYmd,
    lastDataDate: effectiveLastDataDate ?? null,
    elapsedDays,
    totalDays,
    remainingDays,
    progressRate,
  };
}

function buildGroupedCollections(args: BuildDecisionEngineInputArgs): DecisionGroupedCollections {
  return {
    byCampaign: args.byCampaign,
    byAdGroup: args.byAdGroup,
    byKeyword: args.byKeyword,
    byCreative: args.byCreative,
    byDevice: args.byDevice,
    byChannel: args.byChannel,
    byRegion: args.byRegion,
    byWeekday: args.byWeekday,
    byHour: args.byHour,
    byDate: args.byDate,
    byWeek: args.byWeek,
    byMonth: args.byMonth,
  };
}

export function getPrimaryMetricCandidatesByObjective(
  objective: DecisionObjective,
): GoalMetric[] {
  switch (objective) {
    case "traffic_growth":
      return ["clicks", "impressions", "ctr"];
    case "commerce_revenue":
      return ["revenue", "roas", "conversions"];
    case "lead_acquisition":
    default:
      return ["conversions", "cpa", "spend"];
  }
}

export function buildDecisionEngineInput(
  args: BuildDecisionEngineInputArgs,
): DecisionEngineInput {
  const objective = resolveDecisionObjective(args.reportType);
  const actual = normalizeActualMetrics(args.currentMonthActual);
  const goal = normalizeGoalTarget(args.monthGoal, args.currentMonthGoalComputed);
  const period = buildDecisionPeriodContext({
    currentMonthKey: args.currentMonthKey,
    reportPeriod: args.reportPeriod,
    lastDataDate: args.lastDataDate,
  });
  const grouped = buildGroupedCollections(args);

  return {
    objective,
    reportType: args.reportType,
    period,
    goal,
    actual,
    grouped,
    raw: {
      rows: args.rows,
      currentMonthActual: args.currentMonthActual,
      currentMonthGoalComputed: args.currentMonthGoalComputed,
      monthGoal: args.monthGoal,
    },
  };
}
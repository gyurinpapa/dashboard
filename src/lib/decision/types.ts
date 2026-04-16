// src/lib/decision/types.ts

export type DecisionAxis =
  | "campaign"
  | "adGroup"
  | "keyword"
  | "creative"
  | "device"
  | "channel"
  | "region"
  | "weekday"
  | "hour"
  | "date"
  | "week";

export type GoalMetric =
  | "impressions"
  | "clicks"
  | "conversions"
  | "revenue"
  | "spend"
  | "ctr"
  | "cvr"
  | "cpc"
  | "cpa"
  | "roas";

export type DecisionObjective =
  | "traffic_growth"
  | "lead_acquisition"
  | "commerce_revenue";

export type MetricSnapshot = {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  spend: number;
  ctr: number;
  cvr: number;
  cpc: number;
  cpa: number;
  roas: number;
};

export type GoalTarget = Partial<Record<GoalMetric, number>>;

export type DecisionPeriodContext = {
  currentMonthKey: string;
  startDate: string | null;
  endDate: string | null;
  todayYmd: string | null;
  lastDataDate: string | null;
  elapsedDays: number;
  totalDays: number;
  remainingDays: number;
  progressRate: number;
};

export type DecisionGroupedCollections = {
  byCampaign?: any[];
  byAdGroup?: any[];
  byKeyword?: any[];
  byCreative?: any[];
  byDevice?: any[];
  byChannel?: any[];
  byRegion?: any[];
  byWeekday?: any[];
  byHour?: any[];
  byDate?: any[];
  byWeek?: any[];
  byMonth?: any[];
};

export type DecisionEngineInput = {
  objective: DecisionObjective;
  reportType?: string;
  period: DecisionPeriodContext;
  goal: GoalTarget;
  actual: MetricSnapshot;
  grouped: DecisionGroupedCollections;
  raw?: {
    rows?: any[];
    currentMonthActual?: any;
    currentMonthGoalComputed?: any;
    monthGoal?: any;
  };
};

export type GoalSnapshot = {
  objective: DecisionObjective;
  primaryMetric: GoalMetric;

  goalValue: number;
  actualValue: number;
  attainmentRate: number;

  forecastValue: number;
  forecastAttainmentRate: number;
  gapValue: number;

  elapsedDays: number;
  totalDays: number;
  remainingDays: number;
  timeProgressRate: number;

  paceRatio: number;
  pacingStatus: "ahead" | "on_track" | "behind";

  message: string;
};

export type BuildDecisionEngineInputArgs = {
  reportType?: string;

  currentMonthKey: string;
  currentMonthActual: any;
  currentMonthGoalComputed?: any;
  monthGoal?: any;
  lastDataDate?: string | null;

  rows?: any[];

  byCampaign?: any[];
  byAdGroup?: any[];
  byKeyword?: any[];
  byCreative?: any[];
  byDevice?: any[];
  byChannel?: any[];
  byRegion?: any[];
  byWeekday?: any[];
  byHour?: any[];
  byDate?: any[];
  byWeek?: any[];
  byMonth?: any[];

  reportPeriod?: {
    startDate?: string | null;
    endDate?: string | null;
  };
};
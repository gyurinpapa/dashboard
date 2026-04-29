// app/lib/report/types.ts

// ===== Report Types =====
export type ReportType = "commerce" | "traffic" | "db_acquisition";

// ===== Tabs =====
export type TabKey =
  | "summary"
  | "decision"
  | "hypothesis1"
  | "hypothesis2"
  | "hypothesis3"
  | "hypothesis4"
  | "hypothesis5"
  | "summary2"
  | "structure"
  | "keyword"
  | "keywordDetail"
  | "creative"
  | "creativeDetail";

// ===== FilterKey (HeaderBar에서 쓰는 상단 버튼: 월/주차/기기/채널/소스/상품) =====
export type FilterKey =
  | "month"
  | "week"
  | "device"
  | "channel"
  | "source"
  | "product"
  | null;

// ===== Period keys =====
export type MonthKey = "all" | string;
export type WeekKey = "all" | string;

// ===== Dimension keys =====
export type DeviceKey = "all" | string;
export type ChannelKey = "all" | string;
export type SourceKey = "all" | string;
export type ProductKey = "all" | string;

// ===== Goals =====
export type GoalState = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

// ===== Aggregate Metrics =====
export type AggregateMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;

  ctr: number;
  cpc: number;
  cvr: number;
  cpa: number;
  roas: number;
};

// ===== Aggregate Row helpers =====
export type AggregateRow = AggregateMetrics & {
  label?: string;
  key?: string;
  month?: string;
  week?: string;
  device?: string;
  channel?: string;
  source?: string;
  product?: string;
};

// ===== Row (CSV 한 줄의 최소 요구 스키마) =====
export type Row = {
  date: string;

  impressions?: number | string;
  clicks?: number | string;
  cost?: number | string;
  conversions?: number | string;
  revenue?: number | string;
  avgRank?: number | string;

  month?: string;
  week?: string;

  device?: string;
  channel?: string;
  source?: string;
  product?: string;
  platform?: string;

  campaign?: string;
  group?: string;
  keyword?: string;
  creative?: string;
  creativeName?: string;
  creativeFile?: string;
  imageUrl?: string;
  imagePath?: string;

  [key: string]: any;
};
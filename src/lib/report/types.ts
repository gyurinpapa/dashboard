// app/lib/report/types.ts

// ===== Report Types =====
export type ReportType = "commerce" | "traffic" | "db_acquisition";

// ===== Tabs =====
export type TabKey =
  | "summary"
  | "decision"
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
export type MonthKey = "all" | string; // 예: "2022.07"
export type WeekKey = "all" | string; // 예: "2022.07 1주차" | "2022-07-W1"

// ===== Dimension keys =====
export type DeviceKey = "all" | string; // 예: "pc" | "mobile"
export type ChannelKey = "all" | string; // 예: "search" | "display"
export type SourceKey = "all" | string; // 예: "naver" | "google" | "kakao" | "meta"
export type ProductKey = "all" | string; // 예: platform / product / 상품명 등

// ===== Goals =====
export type GoalState = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

// ===== Aggregate Metrics =====
// ctr / cvr / roas 는 모두 0~1 ratio 기준
// 예: 215% => 2.15
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
// 필수만 고정하고, 나머지는 확장 가능하게 둔다.
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
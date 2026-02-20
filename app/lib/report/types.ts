// app/lib/report/types.ts

// ===== Tabs =====
export type TabKey =
  | "summary"
  | "structure"
  | "keyword"
  | "keywordDetail"
  | "creative"
  | "creativeDetail";


// ===== FilterKey (HeaderBar에서 쓰는 상단 4버튼: 월/주차/기기/채널) =====
// 지금 page.tsx에서 초기값을 null로 쓰고 있으니 null 포함
export type FilterKey = "month" | "week" | "device" | "channel" | null;

// ===== Period keys =====
export type MonthKey = "all" | string; // 예: "2022.07"
export type WeekKey = "all" | string;  // 예: "2022.07 1주차" 또는 "2022-07-W1" 등(프로젝트 데이터 포맷에 따라 string)

// ===== Dimension keys =====
export type DeviceKey = "all" | string;  // 예: "pc" | "mobile" | ...
export type ChannelKey = "all" | string; // 예: "naver" | "google" | ...

// ===== Goals =====
export type GoalState = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

// ===== Row (CSV 한 줄의 최소 요구 스키마) =====
// aggregate/normalize/filter에서 실제로 더 많은 컬럼을 쓸 수 있으니
// "필수만 타입으로 고정 + 나머지는 확장 가능" 형태로 안전하게 설계
export type Row = {
  date: string;

  impressions?: number | string;
  clicks?: number | string;
  cost?: number | string;
  conversions?: number | string;
  revenue?: number | string;
  avgRank?: number | string;

  // 필터링/그룹핑에 쓰일 수 있는 후보 키들
  month?: string;
  week?: string;

  device?: string;
  channel?: string;

  source?: string;
  campaign?: string;
  group?: string;
  keyword?: string;

  // 데이터마다 컬럼명이 다를 수 있으니 확장 허용
  [key: string]: any;
};

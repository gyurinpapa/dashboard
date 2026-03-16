// src/lib/export-builder/section-fallbacks.ts

import type {
  ExportSectionDataMap,
  ExportSectionMeta,
  ExportSectionPayloadMap,
} from "./section-props";
import type { ExportSectionKey } from "./types";

export const EXPORT_SECTION_META_FALLBACK: ExportSectionMeta = {
  advertiserName: "Nature Collection",
  reportTitle: "광고 성과 리포트",
  reportTypeName: "월간 리포트",
  periodLabel: "2026.03",
  generatedAtLabel: "2026-03-16",
  preset: "starter",
};

export const EXPORT_SECTION_FALLBACKS: {
  [K in ExportSectionKey]: ExportSectionDataMap[K];
} = {
  "summary-kpi": {
    cards: [
      {
        key: "cost",
        label: "광고비",
        value: "₩12,450,000",
        changeLabel: "+8.4%",
        tone: "accent",
      },
      {
        key: "revenue",
        label: "매출",
        value: "₩58,300,000",
        changeLabel: "+12.7%",
        tone: "good",
      },
      {
        key: "roas",
        label: "ROAS",
        value: "468%",
        changeLabel: "+15.2%",
        tone: "good",
      },
      {
        key: "conversions",
        label: "전환수",
        value: "1,248",
        changeLabel: "+6.3%",
        tone: "neutral",
      },
    ],
  },

  "summary-chart": {
    title: "일자별 광고비 / 매출 / ROAS",
    leftMetric: "cost",
    rightMetric: "roas",
    points: [
      { label: "03-01", cost: 320000, revenue: 1320000, roas: 4.1 },
      { label: "03-02", cost: 410000, revenue: 1680000, roas: 4.1 },
      { label: "03-03", cost: 360000, revenue: 1490000, roas: 4.14 },
      { label: "03-04", cost: 440000, revenue: 2010000, roas: 4.56 },
      { label: "03-05", cost: 390000, revenue: 1750000, roas: 4.49 },
      { label: "03-06", cost: 470000, revenue: 2210000, roas: 4.70 },
      { label: "03-07", cost: 520000, revenue: 2450000, roas: 4.71 },
    ],
  },

  "summary-goal": {
    goals: [
      {
        key: "revenue",
        label: "매출 목표",
        actual: 58300000,
        goal: 70000000,
        unit: "KRW",
        progress: 0.83,
        actualLabel: "₩58,300,000",
        goalLabel: "₩70,000,000",
      },
      {
        key: "roas",
        label: "ROAS 목표",
        actual: 4.68,
        goal: 5.0,
        unit: "ratio",
        progress: 0.936,
        actualLabel: "468%",
        goalLabel: "500%",
      },
      {
        key: "conversions",
        label: "전환 목표",
        actual: 1248,
        goal: 1500,
        unit: "count",
        progress: 0.832,
        actualLabel: "1,248",
        goalLabel: "1,500",
      },
    ],
  },

  "summary2-heatmap": {
    metricKey: "revenue",
    days: [
      { dayLabel: "1", value: 1200000, intensity: 0.42 },
      { dayLabel: "2", value: 900000, intensity: 0.31 },
      { dayLabel: "3", value: 1500000, intensity: 0.54 },
      { dayLabel: "4", value: 1800000, intensity: 0.66 },
      { dayLabel: "5", value: 2100000, intensity: 0.77 },
      { dayLabel: "6", value: 2400000, intensity: 0.88 },
      { dayLabel: "7", value: 2700000, intensity: 1.0 },
    ],
  },

  "summary2-funnel": {
    steps: [
      { key: "impressions", label: "노출", value: 1450000, displayValue: "1,450,000" },
      { key: "clicks", label: "클릭", value: 48200, displayValue: "48,200", ratioFromPrev: 0.0332 },
      { key: "sessions", label: "유입", value: 31700, displayValue: "31,700", ratioFromPrev: 0.6577 },
      { key: "conversions", label: "전환", value: 1248, displayValue: "1,248", ratioFromPrev: 0.0394 },
    ],
  },

  "keyword-top10": {
    rows: [
      { rank: 1, keyword: "네이처컬렉션", clicks: 4200, conversions: 210, cost: 940000, revenue: 6200000, roas: 6.6 },
      { rank: 2, keyword: "스킨케어 추천", clicks: 3900, conversions: 175, cost: 880000, revenue: 5100000, roas: 5.8 },
      { rank: 3, keyword: "기초화장품", clicks: 3450, conversions: 160, cost: 790000, revenue: 4520000, roas: 5.72 },
      { rank: 4, keyword: "보습크림", clicks: 3100, conversions: 142, cost: 730000, revenue: 4010000, roas: 5.49 },
      { rank: 5, keyword: "수분크림 추천", clicks: 2800, conversions: 121, cost: 690000, revenue: 3520000, roas: 5.10 },
      { rank: 6, keyword: "마스크팩", clicks: 2600, conversions: 109, cost: 610000, revenue: 2980000, roas: 4.89 },
      { rank: 7, keyword: "탄력크림", clicks: 2400, conversions: 96, cost: 560000, revenue: 2700000, roas: 4.82 },
      { rank: 8, keyword: "앰플 추천", clicks: 2200, conversions: 84, cost: 510000, revenue: 2330000, roas: 4.57 },
      { rank: 9, keyword: "세럼 추천", clicks: 2050, conversions: 77, cost: 470000, revenue: 2090000, roas: 4.45 },
      { rank: 10, keyword: "클렌징폼", clicks: 1900, conversions: 69, cost: 430000, revenue: 1840000, roas: 4.28 },
    ],
  },

  "creative-top8": {
    rows: [
      { rank: 1, name: "봄 프로모션 배너 A", imageUrl: null, clicks: 4100, conversions: 204, cost: 870000, revenue: 5900000, roas: 6.78 },
      { rank: 2, name: "신제품 런칭 배너", imageUrl: null, clicks: 3650, conversions: 188, cost: 820000, revenue: 5250000, roas: 6.40 },
      { rank: 3, name: "베스트셀러 모음", imageUrl: null, clicks: 3300, conversions: 166, cost: 760000, revenue: 4710000, roas: 6.19 },
      { rank: 4, name: "수분라인 소재", imageUrl: null, clicks: 2920, conversions: 149, cost: 700000, revenue: 4180000, roas: 5.97 },
      { rank: 5, name: "민감피부 케어", imageUrl: null, clicks: 2710, conversions: 136, cost: 650000, revenue: 3720000, roas: 5.72 },
      { rank: 6, name: "주말특가 소재", imageUrl: null, clicks: 2480, conversions: 122, cost: 600000, revenue: 3310000, roas: 5.52 },
      { rank: 7, name: "브랜드 신뢰형 배너", imageUrl: null, clicks: 2210, conversions: 104, cost: 540000, revenue: 2860000, roas: 5.30 },
      { rank: 8, name: "구매후기 강조형", imageUrl: null, clicks: 1980, conversions: 91, cost: 490000, revenue: 2490000, roas: 5.08 },
    ],
  },
};

export function getFallbackSectionData<K extends ExportSectionKey>(
  sectionKey: K
): ExportSectionDataMap[K] {
  return EXPORT_SECTION_FALLBACKS[sectionKey];
}

export function getAllFallbackSectionPayloads(): ExportSectionPayloadMap {
  return { ...EXPORT_SECTION_FALLBACKS };
}
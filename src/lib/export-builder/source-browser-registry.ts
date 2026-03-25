// src/lib/export-builder/source-browser-registry.ts

import type { ExportSectionKey } from "@/src/lib/export-builder/types";
import type {
  SourceBrowserBlockItem,
  SourceBrowserTabItem,
  SourceBrowserTabKey,
} from "./source-browser-types";

export const SOURCE_BROWSER_TABS: SourceBrowserTabItem[] = [
  {
    key: "summary",
    label: "요약",
    enabled: true,
    description: "KPI / 차트 / 목표 달성",
  },
  {
    key: "summary2",
    label: "요약2",
    enabled: true,
    description: "히트맵 / 퍼널",
  },
  {
    key: "structure",
    label: "구조",
    enabled: false,
    description: "다음 단계에서 연결 예정",
  },
  {
    key: "keyword",
    label: "키워드",
    enabled: true,
    description: "키워드 TOP10",
  },
  {
    key: "keyword-detail",
    label: "키워드상세",
    enabled: false,
    description: "다음 단계에서 연결 예정",
  },
  {
    key: "creative",
    label: "소재",
    enabled: true,
    description: "소재 TOP8",
  },
  {
    key: "creative-detail",
    label: "소재상세",
    enabled: false,
    description: "다음 단계에서 연결 예정",
  },
];

export const SOURCE_BROWSER_BLOCKS: SourceBrowserBlockItem[] = [
  {
    key: "summary-kpi",
    tab: "summary",
    label: "요약 KPI",
    description: "광고비, 매출, 전환, ROAS 등 핵심 KPI를 요약해 배치",
    sectionKey: "summary-kpi",
    enabled: true,
    badge: "핵심 지표",
  },
  {
    key: "summary-chart",
    tab: "summary",
    label: "요약 차트",
    description: "기간 성과 흐름을 차트 중심으로 배치",
    sectionKey: "summary-chart",
    enabled: true,
    badge: "추이 분석",
  },
  {
    key: "summary-goal",
    tab: "summary",
    label: "목표 / 달성현황",
    description: "목표 대비 실적과 달성률을 요약해 배치",
    sectionKey: "summary-goal",
    enabled: true,
    badge: "목표 관리",
  },
  {
    key: "summary2-heatmap",
    tab: "summary2",
    label: "일자별 성과 히트맵",
    description: "날짜별 성과 집중 구간을 히트맵으로 배치",
    sectionKey: "summary2-heatmap",
    enabled: true,
    badge: "패턴 확인",
  },
  {
    key: "summary2-funnel",
    tab: "summary2",
    label: "성과 퍼널",
    description: "노출 → 클릭 → 전환 흐름을 퍼널 형태로 배치",
    sectionKey: "summary2-funnel",
    enabled: true,
    badge: "전환 구조",
  },
  {
    key: "keyword-top10",
    tab: "keyword",
    label: "키워드 TOP10",
    description: "상위 키워드 성과를 랭킹형으로 배치",
    sectionKey: "keyword-top10",
    enabled: true,
    badge: "상위 키워드",
  },
  {
    key: "creative-top8",
    tab: "creative",
    label: "소재 TOP8",
    description: "상위 소재 성과를 카드/리스트형으로 배치",
    sectionKey: "creative-top8",
    enabled: true,
    badge: "상위 소재",
  },
];

export function getSourceBrowserTab(
  tabKey: SourceBrowserTabKey
): SourceBrowserTabItem | undefined {
  return SOURCE_BROWSER_TABS.find((tab) => tab.key === tabKey);
}

export function getSourceBrowserBlocksByTab(
  tabKey: SourceBrowserTabKey
): SourceBrowserBlockItem[] {
  return SOURCE_BROWSER_BLOCKS.filter((item) => item.tab === tabKey);
}

export function getSourceBrowserBlock(
  blockKey: string
): SourceBrowserBlockItem | undefined {
  return SOURCE_BROWSER_BLOCKS.find((item) => item.key === blockKey);
}

export function getSourceBrowserSectionKeysByTab(
  tabKey: SourceBrowserTabKey
): ExportSectionKey[] {
  return getSourceBrowserBlocksByTab(tabKey)
    .map((item) => item.sectionKey)
    .filter(Boolean) as ExportSectionKey[];
}
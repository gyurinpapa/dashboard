// src/lib/report/ppt/export-config.ts

export const PPT_EXPORT_CONFIG_VERSION = 1 as const;

export const MAX_PPT_EXPORT_PAGES = 16;
export const MAX_PPT_EXPORT_LIMIT = 100;

export type PptExportPageType =
  | "executive-summary"
  | "source-overview"
  | "source-detail"
  | "campaign-review"
  | "keyword-review"
  | "creative-analysis"
  | "creative-review"
  | "action-plan"
  | "priority-closing"
  | "thank-you";

export type PptExportSortDirection = "asc" | "desc";

export type PptExportFilterValues = {
  dateFrom?: string;
  dateTo?: string;
  month?: string[];
  source?: string[];
  channel?: string[];
  device?: string[];
  campaign?: string[];
  group?: string[];
  keyword?: string[];
  creative?: string[];
};

export type PptExportPageOptions = {
  title?: string;
  subtitle?: string;
  metric?: string;
  sortBy?: string;
  sortDirection?: PptExportSortDirection;
  limit?: number;
  includeChart?: boolean;
  includeTable?: boolean;
  includeInsight?: boolean;
};

export type PptExportPage = {
  id: string;
  type: PptExportPageType;
  enabled: boolean;
  filters?: Partial<PptExportFilterValues>;
  options?: PptExportPageOptions;
};

export type PptExportConfig = {
  version: typeof PPT_EXPORT_CONFIG_VERSION;
  globalFilters: PptExportFilterValues;
  pages: PptExportPage[];
};

export type PptExportPageCategory =
  | "summary"
  | "performance"
  | "detail"
  | "insight"
  | "closing";

export type PptExportPageDefinition = {
  type: PptExportPageType;
  category: PptExportPageCategory;
  label: string;
  description: string;
  defaultTitle: string;
  defaultSubtitle?: string;
  supports: {
    title: boolean;
    subtitle: boolean;
    dateRange: boolean;
    month: boolean;
    source: boolean;
    channel: boolean;
    device: boolean;
    campaign: boolean;
    group: boolean;
    keyword: boolean;
    creative: boolean;
    metric: boolean;
    sort: boolean;
    limit: boolean;
    chart: boolean;
    table: boolean;
    insight: boolean;
  };
};

const COMMON_SUPPORT = {
  title: true,
  subtitle: true,
  dateRange: true,
  month: true,
  source: false,
  channel: false,
  device: false,
  campaign: false,
  group: false,
  keyword: false,
  creative: false,
  metric: false,
  sort: false,
  limit: false,
  chart: false,
  table: false,
  insight: true,
};

export const PPT_EXPORT_PAGE_DEFINITIONS: readonly PptExportPageDefinition[] = [
  {
    type: "executive-summary",
    category: "summary",
    label: "Executive Summary",
    description: "전체 성과와 핵심 KPI를 요약합니다.",
    defaultTitle: "Executive Summary",
    defaultSubtitle: "핵심 성과와 다음 운영 방향 요약",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      chart: true,
      table: true,
    },
  },
  {
    type: "source-overview",
    category: "performance",
    label: "매체별 성과 요약",
    description: "매체별 비용과 성과 기여도를 비교합니다.",
    defaultTitle: "매체별 성과 요약",
    defaultSubtitle: "매체별 비용 효율과 기여도 비교",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      metric: true,
      sort: true,
      limit: true,
      chart: true,
      table: true,
    },
  },
  {
    type: "source-detail",
    category: "detail",
    label: "매체별 상세",
    description: "선택한 매체의 캠페인·그룹·성과를 상세 분석합니다.",
    defaultTitle: "매체별 상세 성과",
    defaultSubtitle: "선택 매체의 운영 구조와 성과 분석",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      campaign: true,
      group: true,
      metric: true,
      sort: true,
      limit: true,
      chart: true,
      table: true,
    },
  },
  {
    type: "campaign-review",
    category: "performance",
    label: "캠페인 리뷰",
    description: "캠페인별 성과와 조정 대상을 비교합니다.",
    defaultTitle: "캠페인 성과 리뷰",
    defaultSubtitle: "캠페인별 비용·전환·효율 비교",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      campaign: true,
      group: true,
      metric: true,
      sort: true,
      limit: true,
      chart: true,
      table: true,
    },
  },
  {
    type: "keyword-review",
    category: "detail",
    label: "키워드 리뷰",
    description: "키워드별 성과와 확장·축소 후보를 분석합니다.",
    defaultTitle: "키워드 성과 리뷰",
    defaultSubtitle: "성과 키워드와 저효율 키워드 비교",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      campaign: true,
      group: true,
      keyword: true,
      metric: true,
      sort: true,
      limit: true,
      chart: false,
      table: true,
    },
  },
  {
    type: "creative-analysis",
    category: "detail",
    label: "소재 분석",
    description: "소재별 클릭·전환·매출 기여도를 분석합니다.",
    defaultTitle: "소재 성과 분석",
    defaultSubtitle: "소재별 반응과 전환 기여도 비교",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      campaign: true,
      group: true,
      creative: true,
      metric: true,
      sort: true,
      limit: true,
      chart: true,
      table: true,
    },
  },
  {
    type: "creative-review",
    category: "detail",
    label: "소재 리뷰",
    description: "성과 소재와 개선 대상 소재를 정리합니다.",
    defaultTitle: "소재 운영 리뷰",
    defaultSubtitle: "확대·교체·테스트 대상 소재 정리",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      campaign: true,
      group: true,
      creative: true,
      metric: true,
      sort: true,
      limit: true,
      chart: false,
      table: true,
    },
  },
  {
    type: "action-plan",
    category: "insight",
    label: "액션 플랜",
    description: "다음 운영에서 실행할 우선 액션을 정리합니다.",
    defaultTitle: "다음 운영 액션 플랜",
    defaultSubtitle: "성과 확대와 저효율 개선을 위한 실행 항목",
    supports: {
      ...COMMON_SUPPORT,
      source: true,
      channel: true,
      device: true,
      campaign: true,
      group: true,
    },
  },
  {
    type: "priority-closing",
    category: "closing",
    label: "우선순위 정리",
    description: "다음 운영의 핵심 우선순위를 정리합니다.",
    defaultTitle: "다음 운영 우선순위",
    defaultSubtitle: "우선 실행할 핵심 과제 정리",
    supports: {
      ...COMMON_SUPPORT,
      dateRange: false,
      month: false,
    },
  },
  {
    type: "thank-you",
    category: "closing",
    label: "Thank You",
    description: "보고서 마지막 페이지입니다.",
    defaultTitle: "Thank You",
    defaultSubtitle: "Etrylue Performance",
    supports: {
      ...COMMON_SUPPORT,
      dateRange: false,
      month: false,
      insight: false,
    },
  },
] as const;

export const DEFAULT_PPT_EXPORT_PAGE_TYPES: readonly PptExportPageType[] = [
  "executive-summary",
  "source-overview",
  "campaign-review",
  "keyword-review",
  "creative-analysis",
  "creative-review",
  "action-plan",
  "priority-closing",
  "thank-you",
] as const;

export function getPptExportPageDefinition(
  type: PptExportPageType,
): PptExportPageDefinition {
  return (
    PPT_EXPORT_PAGE_DEFINITIONS.find((item) => item.type === type) ??
    PPT_EXPORT_PAGE_DEFINITIONS[0]
  );
}

export function isPptExportPageType(
  value: unknown,
): value is PptExportPageType {
  return PPT_EXPORT_PAGE_DEFINITIONS.some((item) => item.type === value);
}

export function normalizePptExportStringArray(
  values?: string[] | null,
): string[] | undefined {
  if (!Array.isArray(values)) return undefined;

  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = String(value ?? "").trim();

    if (!text) continue;
    if (text.toLowerCase() === "all") continue;
    if (seen.has(text)) continue;

    seen.add(text);
    out.push(text);
  }

  return out.length ? out : undefined;
}

export function normalizePptExportFilters(
  filters?: Partial<PptExportFilterValues> | null,
): PptExportFilterValues {
  const dateFrom = String(filters?.dateFrom ?? "").slice(0, 10).trim();
  const dateTo = String(filters?.dateTo ?? "").slice(0, 10).trim();

  return {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(normalizePptExportStringArray(filters?.month)
      ? { month: normalizePptExportStringArray(filters?.month) }
      : {}),
    ...(normalizePptExportStringArray(filters?.source)
      ? { source: normalizePptExportStringArray(filters?.source) }
      : {}),
    ...(normalizePptExportStringArray(filters?.channel)
      ? { channel: normalizePptExportStringArray(filters?.channel) }
      : {}),
    ...(normalizePptExportStringArray(filters?.device)
      ? { device: normalizePptExportStringArray(filters?.device) }
      : {}),
    ...(normalizePptExportStringArray(filters?.campaign)
      ? { campaign: normalizePptExportStringArray(filters?.campaign) }
      : {}),
    ...(normalizePptExportStringArray(filters?.group)
      ? { group: normalizePptExportStringArray(filters?.group) }
      : {}),
    ...(normalizePptExportStringArray(filters?.keyword)
      ? { keyword: normalizePptExportStringArray(filters?.keyword) }
      : {}),
    ...(normalizePptExportStringArray(filters?.creative)
      ? { creative: normalizePptExportStringArray(filters?.creative) }
      : {}),
  };
}

export function resolvePptExportFilters(args: {
  globalFilters?: PptExportFilterValues | null;
  pageFilters?: Partial<PptExportFilterValues> | null;
}): PptExportFilterValues {
  const globalFilters = normalizePptExportFilters(args.globalFilters);
  const pageFilters = normalizePptExportFilters(args.pageFilters);

  return normalizePptExportFilters({
    ...globalFilters,
    ...pageFilters,
  });
}
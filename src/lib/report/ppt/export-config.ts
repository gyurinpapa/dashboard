// src/lib/report/ppt/export-config.ts

export const PPT_EXPORT_CONFIG_VERSION = 1 as const;

export const MAX_PPT_EXPORT_PAGES = 16;
export const MAX_PPT_EXPORT_LIMIT = 100;
export const MAX_PPT_EXPORT_REQUEST_BYTES = 256 * 1024;

export const MAX_PPT_EXPORT_PAGE_ID_LENGTH = 100;
export const MAX_PPT_EXPORT_TITLE_LENGTH = 120;
export const MAX_PPT_EXPORT_SUBTITLE_LENGTH = 240;
export const MAX_PPT_EXPORT_FILTER_ITEMS = 100;
export const MAX_PPT_EXPORT_FILTER_VALUE_LENGTH = 200;

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

export type PptExportSortMetric =
  | "cost"
  | "revenue"
  | "conversions"
  | "clicks"
  | "impressions"
  | "roas"
  | "ctr"
  | "cvr"
  | "cpc"
  | "cpa";

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

  /**
   * 현재 데이터 기반 PPT renderer에는 공통 metric 전환 기능이 없다.
   * 기존 payload 타입 호환성을 위해 필드는 유지하지만 서버 검증 결과에서는
   * 현재 사용하지 않는다.
   */
  metric?: string;

  sortBy?: PptExportSortMetric | string;
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

export type PptExportValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type PptExportValidationResult =
  | {
      ok: true;
      config: PptExportConfig;
      issues: [];
    }
  | {
      ok: false;
      config: null;
      issues: PptExportValidationIssue[];
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

      /**
       * 현재 executive-summary 전용 renderer는 chart/table 필드를
       * 직접 출력하지 않는다.
       */
      chart: false,
      table: false,
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
      sort: true,
      limit: true,

      /**
       * source-overview는 매체 카드 전용 renderer를 사용한다.
       */
      chart: false,
      table: false,
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
      sort: true,
      limit: true,

      /**
       * source-detail은 sourceSummary/signals 기반 전용 renderer다.
       */
      chart: false,
      table: false,
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
      sort: true,
      limit: true,

      /**
       * creative-analysis는 reviewCards 기반 전용 renderer다.
       */
      chart: false,
      table: false,
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
      sort: true,
      limit: true,

      /**
       * creative-review도 reviewCards 기반 전용 renderer다.
       */
      chart: false,
      table: false,
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
      limit: true,
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

export const PPT_EXPORT_SORT_METRICS: readonly PptExportSortMetric[] = [
  "cost",
  "revenue",
  "conversions",
  "clicks",
  "impressions",
  "roas",
  "ctr",
  "cvr",
  "cpc",
  "cpa",
] as const;

export const PPT_EXPORT_FILTER_KEYS = [
  "dateFrom",
  "dateTo",
  "month",
  "source",
  "channel",
  "device",
  "campaign",
  "group",
  "keyword",
  "creative",
] as const;

export const PPT_EXPORT_PAGE_OPTION_KEYS = [
  "title",
  "subtitle",
  "metric",
  "sortBy",
  "sortDirection",
  "limit",
  "includeChart",
  "includeTable",
  "includeInsight",
] as const;

const PPT_EXPORT_PAGE_KEYS = [
  "id",
  "type",
  "enabled",
  "filters",
  "options",
] as const;

const PPT_EXPORT_CONFIG_KEYS = [
  "version",
  "globalFilters",
  "pages",
] as const;

const PPT_EXPORT_REQUEST_BODY_KEYS = ["config"] as const;

type PptExportFilterKey = (typeof PPT_EXPORT_FILTER_KEYS)[number];
type PptExportPageOptionKey =
  (typeof PPT_EXPORT_PAGE_OPTION_KEYS)[number];

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function asTrimmedString(value: unknown) {
  if (value == null) return "";

  const text = String(value).trim();

  if (!text) return "";
  if (text.toLowerCase() === "null") return "";
  if (text.toLowerCase() === "undefined") return "";

  return text;
}

function hasOwn(
  value: Record<string, unknown>,
  key: string,
) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function getUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function addIssue(
  issues: PptExportValidationIssue[],
  code: string,
  path: string,
  message: string,
) {
  issues.push({
    code,
    path,
    message,
  });
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (year < 1900 || year > 2200) {
    return false;
  }

  const parsed = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidMonthString(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 1900 &&
    year <= 2200 &&
    month >= 1 &&
    month <= 12
  );
}

function isPptExportSortMetric(
  value: unknown,
): value is PptExportSortMetric {
  return PPT_EXPORT_SORT_METRICS.some(
    (metric) => metric === value,
  );
}

function isPptExportSortDirection(
  value: unknown,
): value is PptExportSortDirection {
  return value === "asc" || value === "desc";
}

function validateTextValue(args: {
  value: unknown;
  path: string;
  maxLength: number;
  issues: PptExportValidationIssue[];
}) {
  const { value, path, maxLength, issues } = args;

  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    addIssue(
      issues,
      "INVALID_STRING",
      path,
      "문자열 값이어야 합니다.",
    );
    return undefined;
  }

  const text = value.trim();

  if (!text) {
    return undefined;
  }

  if (text.length > maxLength) {
    addIssue(
      issues,
      "STRING_TOO_LONG",
      path,
      `최대 ${maxLength}자까지 입력할 수 있습니다.`,
    );
    return undefined;
  }

  return text;
}

function validateStringArray(args: {
  value: unknown;
  path: string;
  issues: PptExportValidationIssue[];
  validator?: (value: string) => boolean;
  invalidMessage?: string;
}) {
  const {
    value,
    path,
    issues,
    validator,
    invalidMessage,
  } = args;

  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    addIssue(
      issues,
      "INVALID_FILTER_ARRAY",
      path,
      "필터 값은 문자열 배열이어야 합니다.",
    );
    return undefined;
  }

  if (value.length > MAX_PPT_EXPORT_FILTER_ITEMS) {
    addIssue(
      issues,
      "FILTER_ITEMS_EXCEEDED",
      path,
      `필터 항목은 최대 ${MAX_PPT_EXPORT_FILTER_ITEMS}개까지 사용할 수 있습니다.`,
    );
    return undefined;
  }

  const out: string[] = [];
  const seen = new Set<string>();

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;

    if (typeof item !== "string") {
      addIssue(
        issues,
        "INVALID_FILTER_VALUE",
        itemPath,
        "필터 항목은 문자열이어야 합니다.",
      );
      return;
    }

    const text = item.trim();

    if (!text) {
      return;
    }

    if (text.toLowerCase() === "all") {
      return;
    }

    if (text.length > MAX_PPT_EXPORT_FILTER_VALUE_LENGTH) {
      addIssue(
        issues,
        "FILTER_VALUE_TOO_LONG",
        itemPath,
        `필터 항목은 최대 ${MAX_PPT_EXPORT_FILTER_VALUE_LENGTH}자까지 사용할 수 있습니다.`,
      );
      return;
    }

    if (validator && !validator(text)) {
      addIssue(
        issues,
        "INVALID_FILTER_VALUE_FORMAT",
        itemPath,
        invalidMessage || "필터 값 형식이 올바르지 않습니다.",
      );
      return;
    }

    if (seen.has(text)) {
      return;
    }

    seen.add(text);
    out.push(text);
  });

  return out.length ? out : undefined;
}

function validateFilterObject(args: {
  value: unknown;
  path: string;
  issues: PptExportValidationIssue[];
  definition?: PptExportPageDefinition;
}) {
  const {
    value,
    path,
    issues,
    definition,
  } = args;

  if (value == null) {
    return {} as PptExportFilterValues;
  }

  if (!isPlainObject(value)) {
    addIssue(
      issues,
      "INVALID_FILTER_OBJECT",
      path,
      "필터 설정은 객체여야 합니다.",
    );
    return {} as PptExportFilterValues;
  }

  const unknownKeys = getUnknownKeys(
    value,
    PPT_EXPORT_FILTER_KEYS,
  );

  for (const key of unknownKeys) {
    addIssue(
      issues,
      "UNKNOWN_FILTER_KEY",
      `${path}.${key}`,
      `허용되지 않은 필터 key입니다: ${key}`,
    );
  }

  const allow = (key: PptExportFilterKey) => {
    if (!definition) {
      return true;
    }

    if (key === "dateFrom" || key === "dateTo") {
      return definition.supports.dateRange;
    }

    return definition.supports[key];
  };

  const result: PptExportFilterValues = {};

  if (allow("dateFrom") && hasOwn(value, "dateFrom")) {
    const dateFrom = validateTextValue({
      value: value.dateFrom,
      path: `${path}.dateFrom`,
      maxLength: 10,
      issues,
    });

    if (dateFrom) {
      if (!isValidDateString(dateFrom)) {
        addIssue(
          issues,
          "INVALID_DATE",
          `${path}.dateFrom`,
          "날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.",
        );
      } else {
        result.dateFrom = dateFrom;
      }
    }
  }

  if (allow("dateTo") && hasOwn(value, "dateTo")) {
    const dateTo = validateTextValue({
      value: value.dateTo,
      path: `${path}.dateTo`,
      maxLength: 10,
      issues,
    });

    if (dateTo) {
      if (!isValidDateString(dateTo)) {
        addIssue(
          issues,
          "INVALID_DATE",
          `${path}.dateTo`,
          "날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.",
        );
      } else {
        result.dateTo = dateTo;
      }
    }
  }

  if (
    result.dateFrom &&
    result.dateTo &&
    result.dateFrom > result.dateTo
  ) {
    addIssue(
      issues,
      "INVALID_DATE_RANGE",
      path,
      "시작일은 종료일보다 늦을 수 없습니다.",
    );
  }

  if (allow("month") && hasOwn(value, "month")) {
    result.month = validateStringArray({
      value: value.month,
      path: `${path}.month`,
      issues,
      validator: isValidMonthString,
      invalidMessage: "월은 YYYY-MM 형식이어야 합니다.",
    });
  }

  if (allow("source") && hasOwn(value, "source")) {
    result.source = validateStringArray({
      value: value.source,
      path: `${path}.source`,
      issues,
    });
  }

  if (allow("channel") && hasOwn(value, "channel")) {
    result.channel = validateStringArray({
      value: value.channel,
      path: `${path}.channel`,
      issues,
    });
  }

  if (allow("device") && hasOwn(value, "device")) {
    result.device = validateStringArray({
      value: value.device,
      path: `${path}.device`,
      issues,
    });
  }

  if (allow("campaign") && hasOwn(value, "campaign")) {
    result.campaign = validateStringArray({
      value: value.campaign,
      path: `${path}.campaign`,
      issues,
    });
  }

  if (allow("group") && hasOwn(value, "group")) {
    result.group = validateStringArray({
      value: value.group,
      path: `${path}.group`,
      issues,
    });
  }

  if (allow("keyword") && hasOwn(value, "keyword")) {
    result.keyword = validateStringArray({
      value: value.keyword,
      path: `${path}.keyword`,
      issues,
    });
  }

  if (allow("creative") && hasOwn(value, "creative")) {
    result.creative = validateStringArray({
      value: value.creative,
      path: `${path}.creative`,
      issues,
    });
  }

  return normalizePptExportFilters(result);
}

function validatePageOptions(args: {
  value: unknown;
  path: string;
  definition: PptExportPageDefinition;
  issues: PptExportValidationIssue[];
}) {
  const {
    value,
    path,
    definition,
    issues,
  } = args;

  if (value == null) {
    return {} as PptExportPageOptions;
  }

  if (!isPlainObject(value)) {
    addIssue(
      issues,
      "INVALID_PAGE_OPTIONS",
      path,
      "페이지 옵션은 객체여야 합니다.",
    );
    return {} as PptExportPageOptions;
  }

  const unknownKeys = getUnknownKeys(
    value,
    PPT_EXPORT_PAGE_OPTION_KEYS,
  );

  for (const key of unknownKeys) {
    addIssue(
      issues,
      "UNKNOWN_OPTION_KEY",
      `${path}.${key}`,
      `허용되지 않은 option key입니다: ${key}`,
    );
  }

  const result: PptExportPageOptions = {};

  if (definition.supports.title && hasOwn(value, "title")) {
    result.title = validateTextValue({
      value: value.title,
      path: `${path}.title`,
      maxLength: MAX_PPT_EXPORT_TITLE_LENGTH,
      issues,
    });
  }

  if (
    definition.supports.subtitle &&
    hasOwn(value, "subtitle")
  ) {
    result.subtitle = validateTextValue({
      value: value.subtitle,
      path: `${path}.subtitle`,
      maxLength: MAX_PPT_EXPORT_SUBTITLE_LENGTH,
      issues,
    });
  }

  /**
   * metric은 현재 renderer에서 실제 반영하지 않으므로
   * known key로만 인정하고 검증 결과에서는 제거한다.
   */
  if (
    hasOwn(value, "metric") &&
    value.metric != null &&
    value.metric !== "" &&
    typeof value.metric !== "string"
  ) {
    addIssue(
      issues,
      "INVALID_METRIC",
      `${path}.metric`,
      "metric 값은 문자열이어야 합니다.",
    );
  }

  if (definition.supports.sort && hasOwn(value, "sortBy")) {
    const sortBy = asTrimmedString(value.sortBy);

    if (sortBy) {
      if (!isPptExportSortMetric(sortBy)) {
        addIssue(
          issues,
          "INVALID_SORT_METRIC",
          `${path}.sortBy`,
          "허용되지 않은 정렬 기준입니다.",
        );
      } else {
        result.sortBy = sortBy;
      }
    }
  }

  /**
   * 현재 Builder 초기 payload는 sort 지원 여부와 관계없이
   * sortDirection을 포함할 수 있다.
   * known key는 허용하되 실제 sort 지원 페이지에서만 결과에 반영한다.
   */
  if (
    definition.supports.sort &&
    hasOwn(value, "sortDirection")
  ) {
    if (!isPptExportSortDirection(value.sortDirection)) {
      addIssue(
        issues,
        "INVALID_SORT_DIRECTION",
        `${path}.sortDirection`,
        "정렬 방향은 asc 또는 desc만 사용할 수 있습니다.",
      );
    } else {
      result.sortDirection = value.sortDirection;
    }
  }

  if (definition.supports.limit && hasOwn(value, "limit")) {
    if (
      typeof value.limit !== "number" ||
      !Number.isFinite(value.limit) ||
      !Number.isInteger(value.limit)
    ) {
      addIssue(
        issues,
        "INVALID_LIMIT",
        `${path}.limit`,
        "출력 개수는 정수여야 합니다.",
      );
    } else if (
      value.limit < 1 ||
      value.limit > MAX_PPT_EXPORT_LIMIT
    ) {
      addIssue(
        issues,
        "LIMIT_OUT_OF_RANGE",
        `${path}.limit`,
        `출력 개수는 1~${MAX_PPT_EXPORT_LIMIT} 범위여야 합니다.`,
      );
    } else {
      result.limit = value.limit;
    }
  }

  if (
    definition.supports.chart &&
    hasOwn(value, "includeChart")
  ) {
    if (typeof value.includeChart !== "boolean") {
      addIssue(
        issues,
        "INVALID_BOOLEAN",
        `${path}.includeChart`,
        "includeChart는 boolean이어야 합니다.",
      );
    } else {
      result.includeChart = value.includeChart;
    }
  }

  if (
    definition.supports.table &&
    hasOwn(value, "includeTable")
  ) {
    if (typeof value.includeTable !== "boolean") {
      addIssue(
        issues,
        "INVALID_BOOLEAN",
        `${path}.includeTable`,
        "includeTable은 boolean이어야 합니다.",
      );
    } else {
      result.includeTable = value.includeTable;
    }
  }

  if (
    definition.supports.insight &&
    hasOwn(value, "includeInsight")
  ) {
    if (typeof value.includeInsight !== "boolean") {
      addIssue(
        issues,
        "INVALID_BOOLEAN",
        `${path}.includeInsight`,
        "includeInsight는 boolean이어야 합니다.",
      );
    } else {
      result.includeInsight = value.includeInsight;
    }
  }

  return result;
}

export function getPptExportPageDefinition(
  type: PptExportPageType,
): PptExportPageDefinition {
  return (
    PPT_EXPORT_PAGE_DEFINITIONS.find(
      (item) => item.type === type,
    ) ?? PPT_EXPORT_PAGE_DEFINITIONS[0]
  );
}

export function isPptExportPageType(
  value: unknown,
): value is PptExportPageType {
  return PPT_EXPORT_PAGE_DEFINITIONS.some(
    (item) => item.type === value,
  );
}

export function normalizePptExportStringArray(
  values?: string[] | null,
): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

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
  const dateFrom = String(
    filters?.dateFrom ?? "",
  )
    .slice(0, 10)
    .trim();

  const dateTo = String(
    filters?.dateTo ?? "",
  )
    .slice(0, 10)
    .trim();

  const month = normalizePptExportStringArray(
    filters?.month,
  );

  const source = normalizePptExportStringArray(
    filters?.source,
  );

  const channel = normalizePptExportStringArray(
    filters?.channel,
  );

  const device = normalizePptExportStringArray(
    filters?.device,
  );

  const campaign = normalizePptExportStringArray(
    filters?.campaign,
  );

  const group = normalizePptExportStringArray(
    filters?.group,
  );

  const keyword = normalizePptExportStringArray(
    filters?.keyword,
  );

  const creative = normalizePptExportStringArray(
    filters?.creative,
  );

  return {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(month ? { month } : {}),
    ...(source ? { source } : {}),
    ...(channel ? { channel } : {}),
    ...(device ? { device } : {}),
    ...(campaign ? { campaign } : {}),
    ...(group ? { group } : {}),
    ...(keyword ? { keyword } : {}),
    ...(creative ? { creative } : {}),
  };
}

export function resolvePptExportFilters(args: {
  globalFilters?: PptExportFilterValues | null;
  pageFilters?: Partial<PptExportFilterValues> | null;
}): PptExportFilterValues {
  const globalFilters = normalizePptExportFilters(
    args.globalFilters,
  );

  const pageFilters = normalizePptExportFilters(
    args.pageFilters,
  );

  return normalizePptExportFilters({
    ...globalFilters,
    ...pageFilters,
  });
}

export function validatePptExportConfig(
  input: unknown,
): PptExportValidationResult {
  const issues: PptExportValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      config: null,
      issues: [
        {
          code: "INVALID_CONFIG",
          path: "config",
          message: "config는 객체여야 합니다.",
        },
      ],
    };
  }

  const unknownConfigKeys = getUnknownKeys(
    input,
    PPT_EXPORT_CONFIG_KEYS,
  );

  for (const key of unknownConfigKeys) {
    addIssue(
      issues,
      "UNKNOWN_CONFIG_KEY",
      `config.${key}`,
      `허용되지 않은 config key입니다: ${key}`,
    );
  }

  if (input.version !== PPT_EXPORT_CONFIG_VERSION) {
    addIssue(
      issues,
      "UNSUPPORTED_CONFIG_VERSION",
      "config.version",
      `config.version은 ${PPT_EXPORT_CONFIG_VERSION}이어야 합니다.`,
    );
  }

  const globalFilters = validateFilterObject({
    value: input.globalFilters,
    path: "config.globalFilters",
    issues,
  });

  if (!Array.isArray(input.pages)) {
    addIssue(
      issues,
      "INVALID_PAGES",
      "config.pages",
      "pages는 배열이어야 합니다.",
    );

    return {
      ok: false,
      config: null,
      issues,
    };
  }

  if (input.pages.length > MAX_PPT_EXPORT_PAGES) {
    addIssue(
      issues,
      "PAGE_COUNT_EXCEEDED",
      "config.pages",
      `본문 페이지는 최대 ${MAX_PPT_EXPORT_PAGES}장까지 구성할 수 있습니다.`,
    );
  }

  const pages: PptExportPage[] = [];
  const seenPageIds = new Set<string>();

  input.pages.forEach((rawPage, index) => {
    const path = `config.pages[${index}]`;

    if (!isPlainObject(rawPage)) {
      addIssue(
        issues,
        "INVALID_PAGE",
        path,
        "페이지 설정은 객체여야 합니다.",
      );
      return;
    }

    const unknownPageKeys = getUnknownKeys(
      rawPage,
      PPT_EXPORT_PAGE_KEYS,
    );

    for (const key of unknownPageKeys) {
      addIssue(
        issues,
        "UNKNOWN_PAGE_KEY",
        `${path}.${key}`,
        `허용되지 않은 페이지 key입니다: ${key}`,
      );
    }

    if (typeof rawPage.id !== "string") {
      addIssue(
        issues,
        "INVALID_PAGE_ID",
        `${path}.id`,
        "페이지 ID는 문자열이어야 합니다.",
      );
      return;
    }

    const id = rawPage.id.trim();

    if (!id) {
      addIssue(
        issues,
        "PAGE_ID_REQUIRED",
        `${path}.id`,
        "페이지 ID가 필요합니다.",
      );
      return;
    }

    if (id.length > MAX_PPT_EXPORT_PAGE_ID_LENGTH) {
      addIssue(
        issues,
        "PAGE_ID_TOO_LONG",
        `${path}.id`,
        `페이지 ID는 최대 ${MAX_PPT_EXPORT_PAGE_ID_LENGTH}자까지 사용할 수 있습니다.`,
      );
      return;
    }

    if (seenPageIds.has(id)) {
      addIssue(
        issues,
        "DUPLICATE_PAGE_ID",
        `${path}.id`,
        `요청 내 페이지 ID가 중복되었습니다: ${id}`,
      );
      return;
    }

    seenPageIds.add(id);

    if (!isPptExportPageType(rawPage.type)) {
      addIssue(
        issues,
        "INVALID_PAGE_TYPE",
        `${path}.type`,
        "허용되지 않은 페이지 유형입니다.",
      );
      return;
    }

    if (
      rawPage.enabled != null &&
      typeof rawPage.enabled !== "boolean"
    ) {
      addIssue(
        issues,
        "INVALID_BOOLEAN",
        `${path}.enabled`,
        "enabled는 boolean이어야 합니다.",
      );
      return;
    }

    const enabled = rawPage.enabled !== false;
    const definition = getPptExportPageDefinition(
      rawPage.type,
    );

    const filters = validateFilterObject({
      value: rawPage.filters,
      path: `${path}.filters`,
      definition,
      issues,
    });

    const options = validatePageOptions({
      value: rawPage.options,
      path: `${path}.options`,
      definition,
      issues,
    });

    pages.push({
      id,
      type: rawPage.type,
      enabled,
      filters,
      options,
    });
  });

  const enabledPages = pages.filter(
    (page) => page.enabled,
  );

  if (!enabledPages.length) {
    addIssue(
      issues,
      "NO_ENABLED_PAGE",
      "config.pages",
      "PPT에 포함할 활성 페이지가 최소 1장 필요합니다.",
    );
  }

  if (enabledPages.length > MAX_PPT_EXPORT_PAGES) {
    addIssue(
      issues,
      "ENABLED_PAGE_COUNT_EXCEEDED",
      "config.pages",
      `활성 본문 페이지는 최대 ${MAX_PPT_EXPORT_PAGES}장까지 사용할 수 있습니다.`,
    );
  }

  if (issues.length) {
    return {
      ok: false,
      config: null,
      issues,
    };
  }

  return {
    ok: true,
    config: {
      version: PPT_EXPORT_CONFIG_VERSION,
      globalFilters,
      pages,
    },
    issues: [],
  };
}

export function validatePptExportRequestBody(
  input: unknown,
): PptExportValidationResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      config: null,
      issues: [
        {
          code: "INVALID_REQUEST_BODY",
          path: "body",
          message: "요청 body는 객체여야 합니다.",
        },
      ],
    };
  }

  const issues: PptExportValidationIssue[] = [];

  const unknownBodyKeys = getUnknownKeys(
    input,
    PPT_EXPORT_REQUEST_BODY_KEYS,
  );

  for (const key of unknownBodyKeys) {
    addIssue(
      issues,
      "UNKNOWN_REQUEST_BODY_KEY",
      `body.${key}`,
      `허용되지 않은 요청 body key입니다: ${key}`,
    );
  }

  if (!hasOwn(input, "config")) {
    addIssue(
      issues,
      "CONFIG_REQUIRED",
      "body.config",
      "config가 필요합니다.",
    );
  }

  if (issues.length) {
    return {
      ok: false,
      config: null,
      issues,
    };
  }

  return validatePptExportConfig(input.config);
}

export function buildPptExportFilterCacheKey(
  filters: PptExportFilterValues,
) {
  const normalized = normalizePptExportFilters(filters);

  return JSON.stringify({
    dateFrom: normalized.dateFrom ?? "",
    dateTo: normalized.dateTo ?? "",
    month: normalized.month ?? [],
    source: normalized.source ?? [],
    channel: normalized.channel ?? [],
    device: normalized.device ?? [],
    campaign: normalized.campaign ?? [],
    group: normalized.group ?? [],
    keyword: normalized.keyword ?? [],
    creative: normalized.creative ?? [],
  });
}
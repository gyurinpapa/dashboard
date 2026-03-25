// src/lib/export-builder/payloads.ts
import type { ExportSectionKey } from "@/src/lib/export-builder/types";
import type { ExportSectionPayloadMap } from "@/src/lib/export-builder/section-props";

export type BuildExportSectionPayloadsInput = {
  reportTitle?: string | null;
  advertiserName?: string | null;
  periodLabel?: string | null;
  currentMonthKey?: string | null;

  // ===== Nature Report aggregate / prepared data =====
  summaryKpi?: any | null;
  summaryChart?: any[] | null;

  summaryGoal?: {
    actual?: any | null;
    goal?: any | null;
    insight?: string | null;
  } | null;

  summary2Heatmap?: {
    data?: any[] | null;
    metricKey?: string | null;
  } | null;

  summary2Funnel?: {
    data?: any[] | null;
  } | null;

  keywordTop10?: {
    data?: any[] | null;
  } | null;

  creativeTop8?: {
    data?: any[] | null;
  } | null;
};

const asString = (v: unknown, fallback = ""): string => {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
};

const asNumber = (v: unknown, fallback = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

const asArray = <T = any>(v: unknown): T[] => {
  return Array.isArray(v) ? (v as T[]) : [];
};

const pickFirstString = (obj: any, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
};

const pickFirstNumber = (obj: any, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const value = obj?.[key];
    const n = asNumber(value, Number.NaN);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const topN = <T>(arr: T[], n: number): T[] => {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, n);
};

function buildSectionHeader(input: BuildExportSectionPayloadsInput, title: string, subtitleFallback = "") {
  const advertiserName = asString(input.advertiserName);
  const periodLabel = asString(input.periodLabel);

  const subtitle =
    [advertiserName, periodLabel].filter(Boolean).join(" · ") || subtitleFallback;

  return {
    title,
    subtitle,
  };
}

function buildSummaryKpiPayload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const kpi = input.summaryKpi;
  if (!kpi) return null;

  return {
    ...buildSectionHeader(input, "핵심 KPI"),
    currentMonthKey: asString(input.currentMonthKey),
    data: {
      impressions: pickFirstNumber(kpi, ["impressions"]),
      clicks: pickFirstNumber(kpi, ["clicks"]),
      cost: pickFirstNumber(kpi, ["cost", "spend"]),
      conversions: pickFirstNumber(kpi, ["conversions", "conv"]),
      revenue: pickFirstNumber(kpi, ["revenue", "sales"]),
      ctr: pickFirstNumber(kpi, ["ctr"]),
      cpc: pickFirstNumber(kpi, ["cpc"]),
      cvr: pickFirstNumber(kpi, ["cvr"]),
      cpa: pickFirstNumber(kpi, ["cpa"]),
      roas: pickFirstNumber(kpi, ["roas"]),
    },
    raw: kpi,
  };
}

function buildSummaryChartPayload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const data = asArray(input.summaryChart);
  if (data.length === 0) return null;

  return {
    ...buildSectionHeader(input, "월간 성과 추이"),
    currentMonthKey: asString(input.currentMonthKey),
    data,
  };
}

function buildSummaryGoalPayload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const actual = input.summaryGoal?.actual;
  const goal = input.summaryGoal?.goal;
  const insight = asString(input.summaryGoal?.insight);

  if (!actual && !goal && !insight) return null;

  return {
    ...buildSectionHeader(input, "목표 달성 현황"),
    currentMonthKey: asString(input.currentMonthKey),
    actual: actual ?? null,
    goal: goal ?? null,
    insight,
  };
}

function buildSummary2HeatmapPayload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const data = asArray(input.summary2Heatmap?.data);
  if (data.length === 0) return null;

  return {
    ...buildSectionHeader(input, "일자별 성과 히트맵"),
    metricKey: asString(input.summary2Heatmap?.metricKey, "revenue"),
    data,
  };
}

function normalizeFunnelStep(row: any, index: number) {
  const label = pickFirstString(row, ["label", "name", "step", "stage"], `STEP ${index + 1}`);
  const value = pickFirstNumber(row, ["value", "count", "total"]);
  const ratio = pickFirstNumber(row, ["ratio", "rate", "share"], 0);

  return {
    label,
    value,
    ratio,
    raw: row,
  };
}

function buildSummary2FunnelPayload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const rows = asArray(input.summary2Funnel?.data);
  if (rows.length === 0) return null;

  return {
    ...buildSectionHeader(input, "성과 퍼널"),
    data: rows.map(normalizeFunnelStep),
  };
}

function normalizeKeywordRow(row: any, index: number) {
  const keyword = pickFirstString(row, ["keyword", "name", "label"], `키워드 ${index + 1}`);

  return {
    keyword,
    impressions: pickFirstNumber(row, ["impressions"]),
    clicks: pickFirstNumber(row, ["clicks"]),
    cost: pickFirstNumber(row, ["cost", "spend"]),
    conversions: pickFirstNumber(row, ["conversions", "conv"]),
    revenue: pickFirstNumber(row, ["revenue", "sales"]),
    ctr: pickFirstNumber(row, ["ctr"]),
    cpc: pickFirstNumber(row, ["cpc"]),
    cvr: pickFirstNumber(row, ["cvr"]),
    cpa: pickFirstNumber(row, ["cpa"]),
    roas: pickFirstNumber(row, ["roas"]),
    raw: row,
  };
}

function buildKeywordTop10Payload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const rows = topN(asArray(input.keywordTop10?.data), 10);
  if (rows.length === 0) return null;

  return {
    ...buildSectionHeader(input, "상위 키워드 TOP10"),
    data: rows.map(normalizeKeywordRow),
  };
}

function normalizeCreativeRow(row: any, index: number) {
  const title = pickFirstString(
    row,
    ["creative_name", "creativeTitle", "title", "name", "label"],
    `소재 ${index + 1}`
  );

  const imageUrl = pickFirstString(row, [
    "image_url",
    "imageUrl",
    "thumb_url",
    "thumbnail",
    "imagePath",
    "image_path",
  ]);

  return {
    title,
    imageUrl,
    impressions: pickFirstNumber(row, ["impressions"]),
    clicks: pickFirstNumber(row, ["clicks"]),
    cost: pickFirstNumber(row, ["cost", "spend"]),
    conversions: pickFirstNumber(row, ["conversions", "conv"]),
    revenue: pickFirstNumber(row, ["revenue", "sales"]),
    ctr: pickFirstNumber(row, ["ctr"]),
    cpc: pickFirstNumber(row, ["cpc"]),
    cvr: pickFirstNumber(row, ["cvr"]),
    cpa: pickFirstNumber(row, ["cpa"]),
    roas: pickFirstNumber(row, ["roas"]),
    raw: row,
  };
}

function buildCreativeTop8Payload(
  input: BuildExportSectionPayloadsInput
): Record<string, any> | null {
  const rows = topN(asArray(input.creativeTop8?.data), 8);
  if (rows.length === 0) return null;

  return {
    ...buildSectionHeader(input, "상위 소재 TOP8"),
    data: rows.map(normalizeCreativeRow),
  };
}

export function buildExportSectionPayloads(
  input: BuildExportSectionPayloadsInput
): ExportSectionPayloadMap {
  const payloads: Partial<Record<ExportSectionKey, any>> = {};

  const summaryKpi = buildSummaryKpiPayload(input);
  if (summaryKpi) {
    payloads["summary-kpi"] = summaryKpi;
  }

  const summaryChart = buildSummaryChartPayload(input);
  if (summaryChart) {
    payloads["summary-chart"] = summaryChart;
  }

  const summaryGoal = buildSummaryGoalPayload(input);
  if (summaryGoal) {
    payloads["summary-goal"] = summaryGoal;
  }

  const heatmap = buildSummary2HeatmapPayload(input);
  if (heatmap) {
    payloads["summary2-heatmap"] = heatmap;
  }

  const funnel = buildSummary2FunnelPayload(input);
  if (funnel) {
    payloads["summary2-funnel"] = funnel;
  }

  const keywordTop10 = buildKeywordTop10Payload(input);
  if (keywordTop10) {
    payloads["keyword-top10"] = keywordTop10;
  }

  const creativeTop8 = buildCreativeTop8Payload(input);
  if (creativeTop8) {
    payloads["creative-top8"] = creativeTop8;
  }

  return payloads as ExportSectionPayloadMap;
}
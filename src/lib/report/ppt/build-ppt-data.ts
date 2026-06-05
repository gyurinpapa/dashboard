// src/lib/report/ppt/build-ppt-data.ts

export type PptReportType = "commerce" | "traffic" | "db_acquisition";

export type PptSlideType =
  | "executive-summary"
  | "source-overview"
  | "source-detail"
  | "campaign-review"
  | "keyword-review"
  | "creative-analysis"
  | "creative-review"
  | "action-plan"
  | "priority-closing"
  | "thank-you"
  | "legacy";

export type PptKpi = {
  label: string;
  value: string;
  helper?: string;
};

export type PptChartSeries = {
  key: string;
  label: string;
};

export type PptChartData = {
  type: "bar" | "line" | "pie";
  title: string;
  description?: string;
  xKey: string;
  series: PptChartSeries[];
  rows: Array<Record<string, string | number>>;
};

export type PptTableColumn = {
  key: string;
  label: string;
};

export type PptTableData = {
  title: string;
  columns: PptTableColumn[];
  rows: Array<Record<string, string | number>>;
};

export type PptSignal = {
  label: string;
  title: string;
  value?: string;
  body: string;
};

export type PptSourceSummary = {
  source: string;
  displayName: string;
  headline: string;
  oneLineSummary: string;
  nextDirection: string;
  nextActions: string[];
  kpis: PptKpi[];
  tableRow: Record<string, string | number>;
  coreInsightTitle: string;
  coreInsightBody: string[];
  signals: PptSignal[];
  oneLineInsight: string;
  summary: MetricSummary;
};

export type PptReviewCard = {
  title: string;
  badge?: string;
  mainValue?: string;
  helper?: string;
  metrics: PptKpi[];
  action?: string;
};

export type PptActionPlanItem = {
  no: string;
  source: string;
  current: string;
  next: string;
};

export type PptPriorityItem = {
  no: string;
  title: string;
  actions: string[];
  goal: string;
};

export type PptSlide = {
  key: string;
  type?: PptSlideType;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  kpis?: PptKpi[];
  chart?: PptChartData;
  table?: PptTableData;
  sourceSummary?: PptSourceSummary;
  sourceSummaries?: PptSourceSummary[];
  signals?: PptSignal[];
  reviewCards?: PptReviewCard[];
  actionItems?: PptActionPlanItem[];
  priorityItems?: PptPriorityItem[];
  oneLineInsight?: string;
  keyMessage?: string;
  analysisInputs: string[];
  insightInputs: string[];
};

export type PptReportDeck = {
  title: string;
  advertiserName: string;
  reportTypeName: string;
  reportType: PptReportType;
  generatedAt: string;
  reportingPeriodLabel?: string;
  keyMessage?: string;
  sources?: PptSourceSummary[];
  slides: PptSlide[];
};

export type BuildPptReportDataParams = {
  rows: any[];
  advertiserName?: string | null;
  reportTypeName?: string | null;
  reportTypeKey?: string | null;
  reportTitle?: string | null;
};

type MetricSummary = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cvr: number;
  cpc: number;
  cpa: number;
  roas: number;
};

type GroupedMetricRows = {
  key: string;
  rows: any[];
  summary: MetricSummary;
};

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function asNum(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const n = Number(
    String(v)
      .replace(/[₩,%\s]/g, "")
      .replace(/,/g, "")
      .trim(),
  );

  return Number.isFinite(n) ? n : 0;
}

function pickRowCost(row: any) {
  const finalCost = Math.max(
    asNum(row?.cost_with_brand_search),
    asNum(row?.costWithBrandSearch),
    asNum(row?.total_cost),
    asNum(row?.totalCost),
    asNum(row?.final_cost),
    asNum(row?.finalCost),
    asNum(row?.adjusted_cost),
    asNum(row?.adjustedCost),
    asNum(row?.cost_with_contract),
    asNum(row?.costWithContract),
    asNum(row?.브랜드검색포함비용),
    asNum(row?.최종비용),
    0,
  );

  if (finalCost > 0) {
    return finalCost;
  }

  const baseCost = Math.max(
    asNum(row?.cost),
    asNum(row?.spend),
    asNum(row?.ad_cost),
    asNum(row?.adCost),
    asNum(row?.비용),
    0,
  );

  const brandSearchCost = Math.max(
    asNum(row?.brand_search_cost),
    asNum(row?.brandSearchCost),
    asNum(row?.brand_search_allocated_cost),
    asNum(row?.brandSearchAllocatedCost),
    asNum(row?.allocated_brand_search_cost),
    asNum(row?.allocatedBrandSearchCost),
    asNum(row?.brand_contract_cost),
    asNum(row?.brandContractCost),
    asNum(row?.brandSearchContractCost),
    asNum(row?.브랜드검색비용),
    asNum(row?.브랜드검색_비용),
    asNum(row?.브랜드검색분배비용),
    0,
  );

  return baseCost + brandSearchCost;
}

function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

function fmtInt(v: number) {
  return Math.round(v || 0).toLocaleString("ko-KR");
}

function fmtWon(v: number) {
  return `₩${Math.round(v || 0).toLocaleString("ko-KR")}`;
}

function fmtRate(v: number, digits = 2) {
  return `${((v || 0) * 100).toFixed(digits)}%`;
}

function fmtRoas(v: number, digits = 1) {
  return `${((v || 0) * 100).toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function fmtCompactWon(v: number) {
  const n = Math.round(v || 0);
  const abs = Math.abs(n);

  if (abs >= 100000000) {
    return `₩${(n / 100000000).toFixed(abs >= 1000000000 ? 1 : 2)}억`;
  }

  if (abs >= 10000) {
    return `₩${(n / 10000).toFixed(abs >= 100000 ? 0 : 1)}만`;
  }

  return fmtWon(n);
}

function toSlug(v: any) {
  const raw = asStr(v) || "unknown";
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "unknown";
}

function pickDate(row: any) {
  return (
    asStr(row?.date) ||
    asStr(row?.report_date) ||
    asStr(row?.day) ||
    asStr(row?.ymd) ||
    asStr(row?.dt) ||
    asStr(row?.segment_date) ||
    asStr(row?.stat_date)
  ).slice(0, 10);
}

function pickMonth(row: any) {
  const d = pickDate(row);
  return d ? d.slice(0, 7) : "";
}

function pickWeekKey(row: any) {
  const d = pickDate(row);
  if (!d) return "미분류";

  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d.slice(0, 7) || "미분류";

  const day = date.getDate();
  const week = Math.ceil(day / 7);
  return `${d.slice(0, 7)} ${week}주차`;
}

function pickSource(row: any) {
  return (
    asStr(row?.source) ||
    asStr(row?.platform) ||
    asStr(row?.media_source) ||
    asStr(row?.media) ||
    asStr(row?.publisher) ||
    asStr(row?.channel) ||
    "미분류"
  );
}

function pickCampaign(row: any) {
  return (
    asStr(row?.campaign_name) ||
    asStr(row?.campaignName) ||
    asStr(row?.campaign) ||
    asStr(row?.group_name) ||
    asStr(row?.adgroup_name) ||
    "미분류"
  );
}

function pickKeyword(row: any) {
  return (
    asStr(row?.keyword) ||
    asStr(row?.keyword_name) ||
    asStr(row?.search_term) ||
    asStr(row?.query) ||
    asStr(row?.term) ||
    "미분류"
  );
}

function pickCreative(row: any) {
  return (
    asStr(row?.creative) ||
    asStr(row?.creative_name) ||
    asStr(row?.creativeName) ||
    asStr(row?.creative_file) ||
    asStr(row?.creativeFile) ||
    asStr(row?.imagepath_raw) ||
    asStr(row?.imagepath) ||
    asStr(row?.imagePath) ||
    "미분류"
  );
}

function pickGroup(row: any) {
  return (
    asStr(row?.group_name) ||
    asStr(row?.adgroup_name) ||
    asStr(row?.ad_group_name) ||
    asStr(row?.groupName) ||
    asStr(row?.adgroupName) ||
    asStr(row?.group) ||
    asStr(row?.ad_group) ||
    asStr(row?.광고그룹) ||
    asStr(row?.그룹) ||
    "미분류"
  );
}

function pickDevice(row: any) {
  return (
    asStr(row?.device) ||
    asStr(row?.device_type) ||
    asStr(row?.deviceType) ||
    asStr(row?.platform_device) ||
    asStr(row?.기기) ||
    "미분류"
  );
}

function pickDayOfWeek(row: any) {
  const d = pickDate(row);
  if (!d) return "미분류";

  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "미분류";

  const names = ["일", "월", "화", "수", "목", "금", "토"];
  return names[date.getDay()] || "미분류";
}

function uniqueNonEmpty(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const text = asStr(value).replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (seen.has(text)) continue;

    seen.add(text);
    out.push(text);
  }

  return out;
}

function cleanActionText(value: string) {
  let text = asStr(value).replace(/\s+/g, " ").trim();
  if (!text) return "";

  text = text
    .replace(/합니다\.?$/g, "검토.")
    .replace(/필요합니다\.?$/g, "필요.")
    .replace(/점검합니다\.?$/g, "점검.")
    .replace(/유지합니다\.?$/g, "유지.")
    .replace(/강화합니다\.?$/g, "강화.")
    .replace(/확대합니다\.?$/g, "확대 검토.")
    .replace(/축소합니다\.?$/g, "축소 검토.")
    .replace(/운영합니다\.?$/g, "운영 검토.")
    .replace(/개선합니다\.?$/g, "개선 검토.");

  if (!/[.!?]$/.test(text)) {
    text = `${text}.`;
  }

  return text;
}

function hasEnoughSignal(group: GroupedMetricRows | undefined | null) {
  if (!group) return false;

  return (
    group.summary.cost > 0 ||
    group.summary.clicks > 0 ||
    group.summary.conversions > 0 ||
    group.summary.revenue > 0
  );
}

function rankHighGroup(
  groups: GroupedMetricRows[],
  reportType: PptReportType,
): GroupedMetricRows | undefined {
  const usable = groups.filter((g) => g.key !== "미분류").filter(hasEnoughSignal);

  if (!usable.length) return undefined;

  if (reportType === "traffic") {
    return topBy(
      usable,
      (g) => g.summary.clicks * 1000000 + g.summary.ctr * 100000 + g.summary.cost,
      1,
    )[0];
  }

  if (reportType === "db_acquisition") {
    return topBy(
      usable,
      (g) =>
        g.summary.conversions * 100000000 +
        g.summary.cvr * 1000000 -
        g.summary.cpa,
      1,
    )[0];
  }

  return topBy(
    usable,
    (g) =>
      g.summary.revenue * 10 +
      g.summary.conversions * 1000000 +
      g.summary.roas * 100000,
    1,
  )[0];
}

function rankLowGroup(
  groups: GroupedMetricRows[],
  reportType: PptReportType,
): GroupedMetricRows | undefined {
  const usable = groups
    .filter((g) => g.key !== "미분류")
    .filter((g) => g.summary.cost > 0 || g.summary.clicks > 0);

  if (!usable.length) return undefined;

  if (reportType === "traffic") {
    return bottomBy(
      usable,
      (g) => {
        if (g.summary.clicks <= 0 && g.summary.cost > 0) return -999999;
        return g.summary.ctr || 999;
      },
      1,
    )[0];
  }

  if (reportType === "db_acquisition") {
    return bottomBy(
      usable,
      (g) => {
        if (g.summary.conversions <= 0 && g.summary.cost > 0) return -999999;
        return g.summary.cpa || 999999999;
      },
      1,
    )[0];
  }

  return bottomBy(
    usable,
    (g) => {
      if (g.summary.revenue <= 0 && g.summary.cost > 0) return -999999;
      return g.summary.roas || 0;
    },
    1,
  )[0];
}

function buildSourceNextActions(args: {
  source: string;
  rows: any[];
  reportType: PptReportType;
  summary: MetricSummary;
}) {
  const { source, rows, reportType, summary } = args;

  const campaignGroups = groupRows(rows, pickCampaign);
  const groupGroups = groupRows(rows, pickGroup);
  const keywordGroups = groupRows(rows, pickKeyword);
  const creativeGroups = groupRows(rows, pickCreative);
  const deviceGroups = groupRows(rows, pickDevice);
  const dayGroups = groupRows(rows, pickDayOfWeek);
  const weekGroups = groupRows(rows, pickWeekKey);

  const topCampaign = rankHighGroup(campaignGroups, reportType);
  const lowCampaign = rankLowGroup(campaignGroups, reportType);

  const topGroup = rankHighGroup(groupGroups, reportType);
  const lowGroup = rankLowGroup(groupGroups, reportType);

  const topKeyword = rankHighGroup(keywordGroups, reportType);
  const lowKeyword = rankLowGroup(keywordGroups, reportType);

  const topCreative = rankHighGroup(creativeGroups, reportType);
  const lowCreative = rankLowGroup(creativeGroups, reportType);

  const topDevice = rankHighGroup(deviceGroups, reportType);
  const lowDevice = rankLowGroup(deviceGroups, reportType);

  const topDay = rankHighGroup(dayGroups, reportType);
  const lowDay = rankLowGroup(dayGroups, reportType);

  const recentWeek = weekGroups
    .filter((g) => g.key !== "미분류")
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-1)[0];

  const actions: string[] = [];

  if (reportType === "traffic") {
    if (topCreative && topCreative.key !== "미분류") {
      actions.push(
        `${topCreative.key} 소재 CTR ${fmtRate(
          topCreative.summary.ctr,
        )} 반응축 재활용.`,
      );
    }

    if (lowCreative && lowCreative.key !== topCreative?.key) {
      actions.push(`${lowCreative.key} 저CTR 소재 교체 테스트.`);
    }

    if (topCampaign && topCampaign.key !== "미분류") {
      actions.push(`${topCampaign.key} 클릭 우위 캠페인 유입 확대 검토.`);
    }

    if (topDevice && topDevice.key !== "미분류") {
      actions.push(`${topDevice.key} 기기 클릭 우위 기준 비중 조정.`);
    }

    if (topKeyword && topKeyword.key !== "미분류") {
      actions.push(`${topKeyword.key} 클릭 신호 키워드 입찰 강화.`);
    }

    if (summary.cpc > 0) {
      actions.push(`CPC ${fmtWon(summary.cpc)} 구간 타겟·소재 조합 재점검.`);
    }
  } else if (reportType === "db_acquisition") {
    if (topKeyword && topKeyword.key !== "미분류") {
      actions.push(
        `${topKeyword.key} 전환 ${fmtInt(
          topKeyword.summary.conversions,
        )}건 기준 입찰 강화.`,
      );
    }

    if (lowKeyword && lowKeyword.key !== topKeyword?.key) {
      actions.push(`${lowKeyword.key} 무전환·고비용 키워드 정리.`);
    }

    if (topGroup && topGroup.key !== "미분류") {
      actions.push(`${topGroup.key} 전환 발생 그룹 예산 재배분.`);
    }

    if (topCreative && topCreative.key !== "미분류") {
      actions.push(`${topCreative.key} 전환 소재 메시지 구조 재활용.`);
    }

    if (topDevice && topDevice.key !== "미분류") {
      actions.push(`${topDevice.key} 기기 전환 우위 구간 집중.`);
    }

    if (summary.cpa > 0) {
      actions.push(`CPA ${fmtWon(summary.cpa)} 기준 고단가 구간 축소 검토.`);
    }
  } else {
    if (topCampaign && topCampaign.key !== "미분류") {
      actions.push(
        `${topCampaign.key} 매출 ${fmtCompactWon(
          topCampaign.summary.revenue,
        )} 성과축 예산 유지.`,
      );
    }

    if (lowCampaign && lowCampaign.key !== topCampaign?.key) {
      actions.push(`${lowCampaign.key} 저ROAS 캠페인 비용 축소 검토.`);
    }

    if (topKeyword && topKeyword.key !== "미분류") {
      actions.push(`${topKeyword.key} 전환 키워드 입찰 우선 강화.`);
    }

    if (topCreative && topCreative.key !== "미분류") {
      actions.push(
        `${topCreative.key} ROAS ${fmtRoas(
          topCreative.summary.roas,
        )} 소재 메시지 재활용.`,
      );
    }

    if (topGroup && topGroup.key !== "미분류") {
      actions.push(`${topGroup.key} 그룹 매출 기여 기준 운영 비중 확대.`);
    }

    if (topDevice && topDevice.key !== "미분류") {
      actions.push(`${topDevice.key} 기기 매출 우위 구간 중심 배분.`);
    }
  }

  if (lowGroup && lowGroup.key !== topGroup?.key && lowGroup.key !== "미분류") {
    actions.push(`${lowGroup.key} 저효율 그룹 입찰·예산 축소 검토.`);
  }

  if (lowDevice && lowDevice.key !== topDevice?.key && lowDevice.key !== "미분류") {
    actions.push(`${lowDevice.key} 기기 저효율 구간 선별 축소.`);
  }

  if (topDay && topDay.key !== "미분류") {
    actions.push(`${topDay.key}요일 성과 우위 시간대 집중 검토.`);
  }

  if (lowDay && lowDay.key !== topDay?.key && lowDay.key !== "미분류") {
    actions.push(`${lowDay.key}요일 저효율 구간 예산 억제.`);
  }

  if (recentWeek && recentWeek.key !== "미분류") {
    actions.push(`${recentWeek.key} 최근 흐름 기준 증액·감액 재점검.`);
  }

  const fallback =
    reportType === "traffic"
      ? [
          `${source} CTR 낮은 소재 교체, CPC 상승 구간 타겟 재정비.`,
          `${source} 클릭 우위 캠페인 중심 유입 확대 검토.`,
          `${source} 기기·요일별 저효율 구간 선별 축소.`,
        ]
      : reportType === "db_acquisition"
        ? [
            `${source} 전환 발생 키워드 입찰 강화.`,
            `${source} 무전환 고비용 그룹 우선 정리.`,
            `${source} 기기·요일별 CPA 저효율 구간 축소.`,
          ]
        : [
            `${source} ROAS 우위 캠페인 예산 유지.`,
            `${source} 저ROAS 비용 구간 우선 축소.`,
            `${source} 전환 키워드·소재 메시지 재활용.`,
          ];

  return uniqueNonEmpty([...actions, ...fallback])
    .map(cleanActionText)
    .filter(Boolean)
    .slice(0, 3);
}

function summarize(rows: any[]): MetricSummary {
  let impressions = 0;
  let clicks = 0;
  let cost = 0;
  let conversions = 0;
  let revenue = 0;

  for (const row of rows ?? []) {
    impressions += Math.max(
      asNum(row?.impressions),
      asNum(row?.impr),
      asNum(row?.노출),
      0,
    );

    clicks += Math.max(
      asNum(row?.clicks),
      asNum(row?.click),
      asNum(row?.clk),
      asNum(row?.클릭),
      0,
    );

    cost += pickRowCost(row);

    conversions += Math.max(
      asNum(row?.conversions),
      asNum(row?.conversion),
      asNum(row?.conv),
      asNum(row?.전환),
      0,
    );

    revenue += Math.max(
      asNum(row?.revenue),
      asNum(row?.sales),
      asNum(row?.purchase_amount),
      asNum(row?.매출),
      0,
    );
  }

  const ctr = safeDiv(clicks, impressions);
  const cvr = safeDiv(conversions, clicks);
  const cpc = safeDiv(cost, clicks);
  const cpa = safeDiv(cost, conversions);
  const roas = safeDiv(revenue, cost);

  return {
    impressions,
    clicks,
    cost,
    conversions,
    revenue,
    ctr,
    cvr,
    cpc,
    cpa,
    roas,
  };
}

function groupRows(rows: any[], keyFn: (row: any) => string): GroupedMetricRows[] {
  const map = new Map<string, any[]>();

  for (const row of rows ?? []) {
    const key = keyFn(row) || "미분류";
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  return Array.from(map.entries()).map(([key, groupedRows]) => ({
    key,
    rows: groupedRows,
    summary: summarize(groupedRows),
  }));
}

function topBy<T>(items: T[], pick: (item: T) => number, limit: number) {
  return [...items].sort((a, b) => pick(b) - pick(a)).slice(0, limit);
}

function bottomBy<T>(items: T[], pick: (item: T) => number, limit: number) {
  return [...items].sort((a, b) => pick(a) - pick(b)).slice(0, limit);
}

function resolveReportType(input: {
  reportTypeKey?: string | null;
  reportTypeName?: string | null;
}): PptReportType {
  const source = `${asStr(input.reportTypeKey)} ${asStr(
    input.reportTypeName,
  )}`.toLowerCase();

  if (source.includes("traffic") || source.includes("트래픽")) {
    return "traffic";
  }

  if (
    source.includes("db") ||
    source.includes("acquisition") ||
    source.includes("전환") ||
    source.includes("획득")
  ) {
    return "db_acquisition";
  }

  return "commerce";
}

function getMonthlyGroups(rows: any[]) {
  return groupRows(rows, pickMonth)
    .filter((g) => g.key !== "미분류")
    .sort((a, b) => a.key.localeCompare(b.key));
}

function getLatestMonthKey(rows: any[]) {
  const months = getMonthlyGroups(rows);
  return months.length ? months[months.length - 1].key : "";
}

function getRowsByMonth(rows: any[], month: string) {
  if (!month) return rows ?? [];
  return (rows ?? []).filter((row) => pickMonth(row) === month);
}

function getRecentMonthGroups(rows: any[], limit = 3) {
  const months = getMonthlyGroups(rows);
  return months.slice(-limit);
}

function averageSummary(groups: Array<{ summary: MetricSummary }>): MetricSummary {
  if (!groups.length) {
    return summarize([]);
  }

  const impressions = groups.reduce((sum, g) => sum + g.summary.impressions, 0);
  const clicks = groups.reduce((sum, g) => sum + g.summary.clicks, 0);
  const cost = groups.reduce((sum, g) => sum + g.summary.cost, 0);
  const conversions = groups.reduce((sum, g) => sum + g.summary.conversions, 0);
  const revenue = groups.reduce((sum, g) => sum + g.summary.revenue, 0);

  const divisor = groups.length || 1;

  const avgImpressions = impressions / divisor;
  const avgClicks = clicks / divisor;
  const avgCost = cost / divisor;
  const avgConversions = conversions / divisor;
  const avgRevenue = revenue / divisor;

  return {
    impressions: avgImpressions,
    clicks: avgClicks,
    cost: avgCost,
    conversions: avgConversions,
    revenue: avgRevenue,
    ctr: safeDiv(avgClicks, avgImpressions),
    cvr: safeDiv(avgConversions, avgClicks),
    cpc: safeDiv(avgCost, avgClicks),
    cpa: safeDiv(avgCost, avgConversions),
    roas: safeDiv(avgRevenue, avgCost),
  };
}

function compareRate(current: number, baseline: number) {
  if (!baseline) {
    if (!current) return 0;
    return 1;
  }

  return (current - baseline) / Math.abs(baseline);
}

function trendWord(delta: number) {
  if (delta >= 0.08) return "상승";
  if (delta <= -0.08) return "하락";
  return "유지";
}

function directionWordForHigherBetter(delta: number) {
  if (delta >= 0.08) return "개선";
  if (delta <= -0.08) return "하락";
  return "유지";
}

function directionWordForLowerBetter(delta: number) {
  if (delta <= -0.08) return "개선";
  if (delta >= 0.08) return "부담 증가";
  return "유지";
}

function buildTypeKpis(reportType: PptReportType, total: MetricSummary): PptKpi[] {
  if (reportType === "db_acquisition") {
    return [
      {
        label: "CPA",
        value: total.cpa ? fmtWon(total.cpa) : "-",
        helper: "획득 단가",
      },
      {
        label: "CVR",
        value: fmtRate(total.cvr),
        helper: "전환 품질",
      },
      {
        label: "CTR",
        value: fmtRate(total.ctr),
        helper: "클릭 반응",
      },
      {
        label: "COST",
        value: fmtWon(total.cost),
        helper: "광고비",
      },
    ];
  }

  if (reportType === "traffic") {
    return [
      {
        label: "CLICK",
        value: fmtInt(total.clicks),
        helper: "유입 규모",
      },
      {
        label: "CPC",
        value: total.cpc ? fmtWon(total.cpc) : "-",
        helper: "클릭 단가",
      },
      {
        label: "CTR",
        value: fmtRate(total.ctr),
        helper: "클릭 반응",
      },
      {
        label: "COST",
        value: fmtWon(total.cost),
        helper: "광고비",
      },
    ];
  }

  return [
    {
      label: "ROAS",
      value: fmtRoas(total.roas),
      helper: "매출 효율",
    },
    {
      label: "CVR",
      value: fmtRate(total.cvr),
      helper: "전환 품질",
    },
    {
      label: "CTR",
      value: fmtRate(total.ctr),
      helper: "클릭 반응",
    },
    {
      label: "COST",
      value: fmtWon(total.cost),
      helper: "광고비",
    },
  ];
}

function buildSourceKpis(reportType: PptReportType, summary: MetricSummary): PptKpi[] {
  if (reportType === "traffic") {
    return [
      { label: "노출", value: fmtInt(summary.impressions) },
      { label: "클릭", value: fmtInt(summary.clicks) },
      { label: "CTR", value: fmtRate(summary.ctr) },
      { label: "CPC", value: summary.cpc ? fmtWon(summary.cpc) : "-" },
      { label: "광고비", value: fmtWon(summary.cost) },
      { label: "전환수", value: fmtInt(summary.conversions) },
    ];
  }

  if (reportType === "db_acquisition") {
    return [
      { label: "노출", value: fmtInt(summary.impressions) },
      { label: "클릭", value: fmtInt(summary.clicks) },
      { label: "CTR", value: fmtRate(summary.ctr) },
      { label: "CPC", value: summary.cpc ? fmtWon(summary.cpc) : "-" },
      { label: "광고비", value: fmtWon(summary.cost) },
      { label: "전환수", value: fmtInt(summary.conversions) },
      { label: "CVR", value: fmtRate(summary.cvr) },
      { label: "CPA", value: summary.cpa ? fmtWon(summary.cpa) : "-" },
    ];
  }

  return [
    { label: "노출", value: fmtInt(summary.impressions) },
    { label: "클릭", value: fmtInt(summary.clicks) },
    { label: "CTR", value: fmtRate(summary.ctr) },
    { label: "CPC", value: summary.cpc ? fmtWon(summary.cpc) : "-" },
    { label: "광고비", value: fmtWon(summary.cost) },
    { label: "전환수", value: fmtInt(summary.conversions) },
    { label: "전환매출", value: fmtWon(summary.revenue) },
    { label: "ROAS", value: fmtRoas(summary.roas) },
  ];
}

function buildSourceTableRow(args: {
  source: string;
  reportType: PptReportType;
  summary: MetricSummary;
}): Record<string, string | number> {
  const { source, reportType, summary } = args;

  if (reportType === "traffic") {
    return {
      source,
      impressions: fmtInt(summary.impressions),
      clicks: fmtInt(summary.clicks),
      ctr: fmtRate(summary.ctr),
      cpc: summary.cpc ? fmtWon(summary.cpc) : "-",
      cost: fmtWon(summary.cost),
      conversions: "",
      revenue: "",
      roas: "",
      cpa: "",
      oneLine:
      summary.ctr >= 0.02
        ? "유입 반응 유지 + 단가 관리 필요"
        : "클릭 품질 점검 + 고단가 구간 정리",
    };
  }

  if (reportType === "db_acquisition") {
    return {
      source,
      impressions: fmtInt(summary.impressions),
      clicks: fmtInt(summary.clicks),
      ctr: fmtRate(summary.ctr),
      cpc: summary.cpc ? fmtWon(summary.cpc) : "-",
      cost: fmtWon(summary.cost),
      conversions: fmtInt(summary.conversions),
      revenue: "",
      roas: "",
      cpa: summary.cpa ? fmtWon(summary.cpa) : "-",
      oneLine:
      summary.conversions > 0
        ? "전환 발생 구간 중심 CPA 방어"
        : "무전환 고비용 구간 우선 정리",
    };
  }

  return {
    source,
    impressions: fmtInt(summary.impressions),
    clicks: fmtInt(summary.clicks),
    ctr: fmtRate(summary.ctr),
    cpc: summary.cpc ? fmtWon(summary.cpc) : "-",
    cost: fmtWon(summary.cost),
    conversions: fmtInt(summary.conversions),
    revenue: fmtWon(summary.revenue),
    roas: fmtRoas(summary.roas),
    cpa: summary.cpa ? fmtWon(summary.cpa) : "-",
    oneLine:
    summary.roas >= 5
      ? "매출 기여 우수 + 확장 후보"
      : summary.roas >= 2
        ? "매출 볼륨 유지 + 효율 관리 필요"
        : "저효율 비용 구간 우선 정리",
  };
}

function buildSourceTableColumns(reportType: PptReportType): PptTableColumn[] {
  if (reportType === "traffic") {
    return [
      { key: "source", label: "매체" },
      { key: "impressions", label: "노출" },
      { key: "clicks", label: "클릭" },
      { key: "ctr", label: "CTR" },
      { key: "cpc", label: "CPC" },
      { key: "cost", label: "광고비" },
      { key: "oneLine", label: "한 줄 요약" },
    ];
  }

  if (reportType === "db_acquisition") {
    return [
      { key: "source", label: "매체" },
      { key: "impressions", label: "노출" },
      { key: "clicks", label: "클릭" },
      { key: "ctr", label: "CTR" },
      { key: "cpc", label: "CPC" },
      { key: "cost", label: "광고비" },
      { key: "conversions", label: "전환수" },
      { key: "cpa", label: "CPA" },
      { key: "oneLine", label: "한 줄 요약" },
    ];
  }

  return [
    { key: "source", label: "매체" },
    { key: "impressions", label: "노출" },
    { key: "clicks", label: "클릭" },
    { key: "ctr", label: "CTR" },
    { key: "cpc", label: "CPC" },
    { key: "cost", label: "광고비" },
    { key: "conversions", label: "전환수" },
    { key: "revenue", label: "전환매출" },
    { key: "roas", label: "ROAS" },
    { key: "oneLine", label: "한 줄 요약" },
  ];
}

function buildSourceHeadline(reportType: PptReportType, summary: MetricSummary) {
  if (reportType === "traffic") {
    if (summary.ctr >= 0.02 && summary.cpc > 0) {
      return "유입 반응 유지 + CPC 관리 필요";
    }

    if (summary.clicks > 0 && summary.ctr < 0.015) {
      return "클릭 볼륨 대비 반응 품질 점검";
    }

    return "유효 클릭 확보 중심 운영 필요";
  }

  if (reportType === "db_acquisition") {
    if (summary.conversions > 0 && summary.cpa > 0) {
      return "전환 발생 구간 중심 CPA 방어";
    }

    if (summary.cost > 0 && summary.conversions <= 0) {
      return "고비용 무전환 구간 우선 정리";
    }

    return "획득 구조 확인 및 전환 품질 점검";
  }

  if (summary.roas >= 5) {
    return "매출 기여 우수 + 확장 후보";
  }

  if (summary.roas >= 2) {
    return "매출 볼륨 유지 + 효율 관리 필요";
  }

  if (summary.cost > 0 && summary.revenue <= 0) {
    return "비용 집행 대비 매출 기여 점검";
  }

  return "매출 기여 구간 선별 운영 필요";
}

function buildSourceOneLineSummary(reportType: PptReportType, summary: MetricSummary) {
  if (reportType === "traffic") {
    if (summary.ctr >= 0.02) {
      return "클릭 반응이 확인된 구간을 중심으로 유입 품질을 유지합니다.";
    }

    return "유입 규모보다 클릭 반응과 단가 안정성을 우선 점검합니다.";
  }

  if (reportType === "db_acquisition") {
    if (summary.conversions > 0) {
      return "전환이 발생한 구간을 중심으로 획득 효율을 방어합니다.";
    }

    return "전환 발생 구조를 먼저 확인하고 고비용 구간을 정리합니다.";
  }

  if (summary.roas >= 5) {
    return "매출 기여가 확인된 구간을 중심으로 확대 가능성을 검토합니다.";
  }

  if (summary.roas >= 2) {
    return "매출 볼륨은 유지하되 효율 개선 여지를 함께 점검합니다.";
  }

  return "비용 대비 매출 기여가 낮은 구간을 우선 정리합니다.";
}

function buildSourceNextDirection(reportType: PptReportType, summary: MetricSummary) {
  if (reportType === "traffic") {
    if (summary.ctr >= 0.02 && summary.cpc > 0) {
      return "반응이 확인된 소재·캠페인을 유지하고 CPC 상승 구간을 선별 관리.";
    }

    return "CTR 낮은 소재와 고단가 유입 구간을 분리해 운영 구조 재점검.";
  }

  if (reportType === "db_acquisition") {
    if (summary.conversions > 0) {
      return "전환 발생 키워드·그룹 중심으로 예산을 재배분하고 CPA 방어.";
    }

    return "무전환 고비용 키워드·그룹을 우선 정리하고 전환 경로 재점검.";
  }

  if (summary.roas >= 5) {
    return "매출 기여 캠페인·키워드·소재는 유지하고 확장 가능성 검토.";
  }

  if (summary.roas >= 2) {
    return "볼륨은 유지하되 저효율 비용 구간을 선별 축소.";
  }

  return "매출 기여가 낮은 구간을 줄이고 검증된 성과 축 중심으로 재배분.";
}

function buildSourceSignals(args: {
  reportType: PptReportType;
  source: string;
  rows?: any[];
  summary: MetricSummary;
  total: MetricSummary;
}): PptSignal[] {
  const { reportType, source, rows = [], summary, total } = args;

  const costShare = safeDiv(summary.cost, total.cost);
  const clickShare = safeDiv(summary.clicks, total.clicks);
  const conversionShare = safeDiv(summary.conversions, total.conversions);
  const revenueShare = safeDiv(summary.revenue, total.revenue);

  const campaignGroups = groupRows(rows, pickCampaign);
  const groupGroups = groupRows(rows, pickGroup);
  const keywordGroups = groupRows(rows, pickKeyword);
  const creativeGroups = groupRows(rows, pickCreative);
  const deviceGroups = groupRows(rows, pickDevice);
  const dayGroups = groupRows(rows, pickDayOfWeek);
  const weekGroups = groupRows(rows, pickWeekKey);

  const topCampaign = rankHighGroup(campaignGroups, reportType);
  const lowCampaign = rankLowGroup(campaignGroups, reportType);
  const topGroup = rankHighGroup(groupGroups, reportType);
  const lowGroup = rankLowGroup(groupGroups, reportType);
  const topKeyword = rankHighGroup(keywordGroups, reportType);
  const lowKeyword = rankLowGroup(keywordGroups, reportType);
  const topCreative = rankHighGroup(creativeGroups, reportType);
  const lowCreative = rankLowGroup(creativeGroups, reportType);
  const topDevice = rankHighGroup(deviceGroups, reportType);
  const lowDevice = rankLowGroup(deviceGroups, reportType);
  const topDay = rankHighGroup(dayGroups, reportType);
  const lowDay = rankLowGroup(dayGroups, reportType);

  const recentWeek = weekGroups
    .filter((g) => g.key !== "미분류")
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-1)[0];

  const signals: PptSignal[] = [];

  const pushSignal = (signal: PptSignal) => {
    const title = asStr(signal.title);
    const body = asStr(signal.body);
    if (!title || !body) return;
    if (signals.some((item) => item.title === title || item.body === body)) return;

    signals.push({
      label: `SIGNAL ${String(signals.length + 1).padStart(2, "0")}`,
      title,
      value: asStr(signal.value),
      body,
    });
  };

  if (reportType === "traffic") {
    if (topCampaign) {
      pushSignal({
        label: "",
        title: `${topCampaign.key} 유입 우위`,
        value: `클릭 ${fmtInt(topCampaign.summary.clicks)}건`,
        body: "클릭이 확인된 캠페인 축을 유지하고, 저반응 캠페인은 소재·타겟 조합을 재검토합니다.",
      });
    }

    if (topCreative) {
      pushSignal({
        label: "",
        title: `${topCreative.key} 소재 반응`,
        value: `CTR ${fmtRate(topCreative.summary.ctr)}`,
        body: "CTR 우위 소재의 메시지 구조를 재활용하고, 저CTR 소재는 교체 테스트로 정리합니다.",
      });
    }

    if (lowDevice && lowDevice.key !== topDevice?.key) {
      pushSignal({
        label: "",
        title: `${lowDevice.key} 기기 점검`,
        value: `CPC ${lowDevice.summary.cpc ? fmtWon(lowDevice.summary.cpc) : "-"}`,
        body: "기기별 클릭 단가와 반응률 차이를 기준으로 저효율 유입 구간을 선별 축소합니다.",
      });
    }

    if (topDay) {
      pushSignal({
        label: "",
        title: `${topDay.key}요일 집중`,
        value: `클릭 ${fmtInt(topDay.summary.clicks)}건`,
        body: "요일별 반응 편차를 반영해 클릭 발생 구간의 예산 집중과 저효율 요일 억제를 병행합니다.",
      });
    }

    pushSignal({
      label: "",
      title: `클릭 ${fmtInt(summary.clicks)}건`,
      value: `전체 클릭 기여 ${fmtRate(clickShare, 1)}`,
      body: `${source}의 유입 규모는 전체 트래픽 기여도와 CPC 부담을 함께 기준으로 관리합니다.`,
    });
  } else if (reportType === "db_acquisition") {
    if (topKeyword) {
      pushSignal({
        label: "",
        title: `${topKeyword.key} 전환 키워드`,
        value: `전환 ${fmtInt(topKeyword.summary.conversions)}건`,
        body: "전환이 확인된 키워드는 입찰과 노출을 유지하고, 유사 검색 의도까지 확장 후보로 분리합니다.",
      });
    }

    if (lowKeyword && lowKeyword.key !== topKeyword?.key) {
      pushSignal({
        label: "",
        title: `${lowKeyword.key} 정리 후보`,
        value: `CPA ${lowKeyword.summary.cpa ? fmtWon(lowKeyword.summary.cpa) : "-"}`,
        body: "비용은 쓰였지만 전환 기여가 약한 키워드는 제외·입찰 하향·매칭 정리 대상으로 검토합니다.",
      });
    }

    if (topGroup) {
      pushSignal({
        label: "",
        title: `${topGroup.key} 그룹 전환축`,
        value: `CVR ${fmtRate(topGroup.summary.cvr)}`,
        body: "전환 발생 그룹은 예산 재배분 우선 후보로 두고, 랜딩·소재 메시지 일관성을 강화합니다.",
      });
    }

    if (topDevice) {
      pushSignal({
        label: "",
        title: `${topDevice.key} 기기 우위`,
        value: `전환 ${fmtInt(topDevice.summary.conversions)}건`,
        body: "기기별 전환 편차를 반영해 CPA 방어가 가능한 구간 중심으로 운영 비중을 조정합니다.",
      });
    }

    pushSignal({
      label: "",
      title: `전환 ${fmtInt(summary.conversions)}건`,
      value: `전체 전환 기여 ${fmtRate(conversionShare, 1)}`,
      body: `${source}는 전환 발생 구조와 CPA 흔들림을 함께 기준으로 역할을 재정의합니다.`,
    });
  } else {
    if (topCampaign) {
      pushSignal({
        label: "",
        title: `${topCampaign.key} 매출 기여축`,
        value: `매출 ${fmtCompactWon(topCampaign.summary.revenue)}`,
        body: "매출이 확인된 캠페인은 유지·확장 후보로 두고, 동일 메시지 구조의 소재·키워드 연결을 강화합니다.",
      });
    }

    if (lowCampaign && lowCampaign.key !== topCampaign?.key) {
      pushSignal({
        label: "",
        title: `${lowCampaign.key} 비용 정리`,
        value: `ROAS ${fmtRoas(lowCampaign.summary.roas)}`,
        body: "저ROAS 캠페인은 예산 축소, 입찰 하향, 소재 교체 우선순위로 분리해 비용 누수를 줄입니다.",
      });
    }

    if (topKeyword) {
      pushSignal({
        label: "",
        title: `${topKeyword.key} 전환 키워드`,
        value: `전환 ${fmtInt(topKeyword.summary.conversions)}건`,
        body: "전환 신호가 확인된 키워드는 입찰 유지·강화 후보로 두고, 저효율 검색어는 정리합니다.",
      });
    }

    if (topCreative) {
      pushSignal({
        label: "",
        title: `${topCreative.key} 소재 메시지`,
        value: `ROAS ${fmtRoas(topCreative.summary.roas)}`,
        body: "성과 소재의 메시지 구조를 다음 운영의 기준안으로 재활용하고, 저성과 소재는 교체합니다.",
      });
    }

    if (topDevice) {
      pushSignal({
        label: "",
        title: `${topDevice.key} 기기 배분`,
        value: `매출 ${fmtCompactWon(topDevice.summary.revenue)}`,
        body: "기기별 매출 기여 차이를 반영해 예산과 입찰 비중을 재배분합니다.",
      });
    }

    pushSignal({
      label: "",
      title: `ROAS ${fmtRoas(summary.roas)}`,
      value: `매출 기여 ${fmtRate(revenueShare, 1)}`,
      body: `${source}는 매출 기여와 비용 비중을 함께 기준으로 유지·확대·축소 역할을 구분합니다.`,
    });
  }

  if (lowGroup && lowGroup.key !== topGroup?.key) {
    pushSignal({
      label: "",
      title: `${lowGroup.key} 그룹 정리`,
      value: `비용 ${fmtCompactWon(lowGroup.summary.cost)}`,
      body: "그룹 단위 저효율 구간은 입찰·예산 축소 또는 소재 교체 후보로 우선 검토합니다.",
    });
  }

  if (recentWeek) {
    pushSignal({
      label: "",
      title: `${recentWeek.key} 최근 흐름`,
      value:
        reportType === "traffic"
          ? `클릭 ${fmtInt(recentWeek.summary.clicks)}건`
          : reportType === "db_acquisition"
            ? `전환 ${fmtInt(recentWeek.summary.conversions)}건`
            : `매출 ${fmtCompactWon(recentWeek.summary.revenue)}`,
      body: "최근 주차 흐름을 기준으로 증액·감액 판단을 재점검하고 다음 주 운영 속도를 조정합니다.",
    });
  }

  const fallback =
    reportType === "traffic"
      ? [
          {
            label: "",
            title: `CTR ${fmtRate(summary.ctr)}`,
            value: `CPC ${summary.cpc ? fmtWon(summary.cpc) : "-"}`,
            body: "클릭 반응과 클릭 단가를 함께 확인해 유입 품질과 비용 부담을 동시에 점검합니다.",
          },
          {
            label: "",
            title: `광고비 ${fmtCompactWon(summary.cost)}`,
            value: `전체 비용 비중 ${fmtRate(costShare, 1)}`,
            body: "비용 비중이 큰 매체는 작은 효율 변화도 전체 성과에 영향을 줄 수 있습니다.",
          },
        ]
      : reportType === "db_acquisition"
        ? [
            {
              label: "",
              title: `CPA ${summary.cpa ? fmtWon(summary.cpa) : "-"}`,
              value: `CVR ${fmtRate(summary.cvr)}`,
              body: "전환 단가와 전환율을 함께 보면서 단순 볼륨이 아닌 획득 품질을 점검합니다.",
            },
            {
              label: "",
              title: `광고비 ${fmtCompactWon(summary.cost)}`,
              value: `전체 비용 비중 ${fmtRate(costShare, 1)}`,
              body: "비용이 큰 매체는 전환 효율이 흔들릴 경우 전체 CPA에 직접 영향을 줍니다.",
            },
          ]
        : [
            {
              label: "",
              title: `전환 ${fmtInt(summary.conversions)}건`,
              value: `CVR ${fmtRate(summary.cvr)}`,
              body: "구매 전환 규모와 전환율을 함께 보면서 매출 발생 구조를 점검합니다.",
            },
            {
              label: "",
              title: `광고비 ${fmtCompactWon(summary.cost)}`,
              value: `전체 비용 비중 ${fmtRate(costShare, 1)}`,
              body: "비용 비중이 큰 매체는 ROAS 개선 또는 비용 통제가 다음 운영의 핵심입니다.",
            },
          ];

  fallback.forEach(pushSignal);

  return signals.slice(0, 3).map((signal, index) => ({
    ...signal,
    label: `SIGNAL ${String(index + 1).padStart(2, "0")}`,
  }));
}

function buildSourceCoreInsight(args: {
  reportType: PptReportType;
  source: string;
  summary: MetricSummary;
}) {
  const { reportType, source, summary } = args;

  if (reportType === "traffic") {
    return {
      title:
        summary.ctr >= 0.02
          ? "반응 구간 유지, 단가 관리 병행"
          : "유입 반응 재점검, 저효율 축 정리",
      body: [
        `${source}는 유입 규모와 클릭 반응을 함께 보며 역할을 판단해야 합니다.`,
        "다음 운영은 클릭 확대보다 CTR이 확인된 소재·캠페인·기기 조합을 우선 강화합니다.",
        "CPC 부담이 큰 구간은 타겟, 소재, 요일 기준으로 선별 축소합니다.",
      ],
    };
  }

  if (reportType === "db_acquisition") {
    return {
      title:
        summary.conversions > 0
          ? "전환 발생축 유지, CPA 방어 우선"
          : "무전환 비용 구간 우선 정리",
      body: [
        `${source}는 획득 볼륨보다 전환 발생 구조와 CPA 안정성이 핵심입니다.`,
        "전환이 확인된 키워드·그룹·기기 조합은 유지하고 예산 재배분 후보로 분리합니다.",
        "비용은 쓰였지만 전환 기여가 약한 구간은 입찰 하향과 제외 검토가 필요합니다.",
      ],
    };
  }

  return {
    title:
      summary.roas >= 5
        ? "매출 기여축 유지, 확장 후보 분리"
        : summary.roas >= 2
          ? "볼륨 유지, 효율 관리 병행"
          : "저효율 비용 구간 우선 정리",
    body: [
      `${source}는 매출 볼륨과 비용 효율을 동시에 기준으로 역할을 구분해야 합니다.`,
      "매출 기여가 확인된 캠페인·키워드·소재는 유지하고 유사 구간 확장을 검토합니다.",
      "ROAS가 낮은 비용 구간은 축소, 교체, 재배분 후보로 별도 관리합니다.",
    ],
  };
}

function buildSourceOneLineInsight(args: {
  reportType: PptReportType;
  source: string;
  summary: MetricSummary;
}) {
  const { reportType, source, summary } = args;

  if (reportType === "traffic") {
    return summary.ctr >= 0.02
      ? `${source}는 반응이 확인된 유입축을 유지하되, CPC 부담 구간은 기기·요일·소재 기준으로 정리해야 합니다.`
      : `${source}는 유입 확대보다 저반응 소재와 고단가 클릭 구간을 먼저 축소해야 합니다.`;
  }

  if (reportType === "db_acquisition") {
    return summary.conversions > 0
      ? `${source}는 전환 발생 구조를 유지하고, 무전환 비용 구간을 줄여 CPA 방어 중심으로 운영해야 합니다.`
      : `${source}는 전환 신호가 약하므로 키워드·그룹·기기 단위의 비용 정리가 우선입니다.`;
  }

  if (summary.roas >= 5) {
    return `${source}는 매출 기여가 확인된 확장 후보이며, 성과 캠페인·키워드·소재 조합을 유지 강화해야 합니다.`;
  }

  if (summary.roas >= 2) {
    return `${source}는 매출 볼륨은 유지하되, 저효율 비용 구간을 분리해 효율 관리가 필요합니다.`;
  }

  return `${source}는 비용 대비 매출 기여가 약한 구간을 우선 정리하고, 성과가 확인된 축으로 예산을 재배분해야 합니다.`;
}

function buildSourceSummaries(args: {
  rows: any[];
  total: MetricSummary;
  reportType: PptReportType;
}) {
  const { rows, total, reportType } = args;

  const groups = groupRows(rows, pickSource)
    .filter((g) => g.key !== "미분류")
    .filter((g) => g.summary.cost > 0 || g.summary.clicks > 0 || g.summary.conversions > 0);

  const selected = topBy(
    groups,
    (g) => {
      if (reportType === "traffic") return g.summary.clicks;
      if (reportType === "db_acquisition") return g.summary.conversions * 100000000 + g.summary.cost;
      return g.summary.revenue * 10 + g.summary.conversions * 1000000 + g.summary.cost;
    },
    5,
  );

  return selected.map((g): PptSourceSummary => {
    const coreInsight = buildSourceCoreInsight({
      reportType,
      source: g.key,
      summary: g.summary,
    });

    return {
      source: g.key,
      displayName: g.key,
      headline: buildSourceHeadline(reportType, g.summary),
      oneLineSummary: buildSourceOneLineSummary(reportType, g.summary),
      nextDirection: buildSourceNextDirection(reportType, g.summary),
      nextActions: buildSourceNextActions({
        source: g.key,
        rows: g.rows,
        reportType,
        summary: g.summary,
      }),
      kpis: buildSourceKpis(reportType, g.summary),
      tableRow: buildSourceTableRow({
        source: g.key,
        reportType,
        summary: g.summary,
      }),
      coreInsightTitle: coreInsight.title,
      coreInsightBody: coreInsight.body,
      signals: buildSourceSignals({
        reportType,
        source: g.key,
        rows: g.rows,
        summary: g.summary,
        total,
      }),
      oneLineInsight: buildSourceOneLineInsight({
        reportType,
        source: g.key,
        summary: g.summary,
      }),
      summary: g.summary,
    };
  });
}

function buildExecutiveKeyMessage(args: {
  reportType: PptReportType;
  latestMonth: string;
  latestSummary: MetricSummary;
}) {
  const { reportType, latestMonth, latestSummary } = args;
  const month = latestMonth ? `${Number(latestMonth.slice(5, 7))}월` : "최근 월";

  if (reportType === "traffic") {
    const trafficQuality =
      latestSummary.ctr >= 0.02
        ? "유입 반응은 유지되고 있으나"
        : "유입 반응이 충분히 강하지 않아";

    return `${month} 운영은 ${trafficQuality} 클릭 품질과 유입 단가를 함께 관리해야 하는 구간입니다. 다음달은 단순 유입 확대보다 반응이 확인된 캠페인·소재·기기 조합을 선별해 CPC 부담을 낮추고 유효 클릭 중심으로 운영을 재정렬해야 합니다.`;
  }

  if (reportType === "db_acquisition") {
    const acquisitionQuality =
      latestSummary.conversions > 0
        ? "전환 발생 구조는 확인되었으나"
        : "전환 발생 구조가 아직 충분히 확인되지 않아";

    return `${month} 운영은 ${acquisitionQuality} 획득 단가와 전환 품질을 동시에 관리해야 하는 구간입니다. 다음달은 무전환 고비용 키워드·그룹을 줄이고, 실제 전환이 발생한 캠페인·소재·기기 구간에 예산을 재배분해야 합니다.`;
  }

  const commerceQuality =
    latestSummary.roas >= 3
      ? "매출 기여 축은 확인되었으나"
      : "매출 기여 대비 비용 부담이 남아 있어";

  return `${month} 운영은 ${commerceQuality} 매체별 성과 편차와 비용 누수 구간을 함께 점검해야 하는 구간입니다. 다음달은 매출 기여가 확인된 캠페인·키워드·소재는 유지하고, 효율이 낮은 비용 구간은 과감하게 줄이는 방향으로 운영을 정교화해야 합니다.`;
}

function buildExecutiveInsightLines(args: {
  reportType: PptReportType;
  latestMonth: string;
  latestSummary: MetricSummary;
  recentGroups: Array<{ key: string; summary: MetricSummary }>;
}) {
  const { reportType, latestMonth, latestSummary, recentGroups } = args;

  const previousGroups = recentGroups.filter((g) => g.key !== latestMonth);
  const previousAverage = averageSummary(previousGroups);

  const recentRange =
    recentGroups.length > 1
      ? `${recentGroups[0].key}~${recentGroups[recentGroups.length - 1].key}`
      : latestMonth || "전체 기간";

  if (reportType === "db_acquisition") {
    const cpaDelta = compareRate(latestSummary.cpa, previousAverage.cpa);
    const cvrDelta = compareRate(latestSummary.cvr, previousAverage.cvr);
    const cpaTrend = directionWordForLowerBetter(cpaDelta);
    const cvrTrend = directionWordForHigherBetter(cvrDelta);

    return [
      `${latestMonth || "최근 월"} 전체 기준 비용 ${fmtWon(
        latestSummary.cost,
      )}, 전환 ${fmtInt(latestSummary.conversions)}건, CPA ${
        latestSummary.cpa ? fmtWon(latestSummary.cpa) : "-"
      }로 집계됩니다.`,
      `최근 3개월(${recentRange}) 관점에서는 CPA가 ${cpaTrend}되고 CVR은 ${cvrTrend} 흐름을 보여, 전환 단가와 전환 품질을 함께 점검해야 합니다.`,
      "핵심 인사이트: 전환 수 확대보다 CPA 방어와 CVR 개선이 우선이며, 고전환 구조 중심으로 예산을 재배분해야 합니다.",
    ];
  }

  if (reportType === "traffic") {
    const clickDelta = compareRate(latestSummary.clicks, previousAverage.clicks);
    const cpcDelta = compareRate(latestSummary.cpc, previousAverage.cpc);
    const clickTrend = trendWord(clickDelta);
    const cpcTrend = directionWordForLowerBetter(cpcDelta);

    return [
      `${latestMonth || "최근 월"} 전체 기준 비용 ${fmtWon(
        latestSummary.cost,
      )}, 클릭 ${fmtInt(latestSummary.clicks)}건, CPC ${
        latestSummary.cpc ? fmtWon(latestSummary.cpc) : "-"
      }로 집계됩니다.`,
      `최근 3개월(${recentRange}) 관점에서는 클릭 규모가 ${clickTrend}하고 CPC는 ${cpcTrend} 흐름을 보여, 유입량과 유입 단가의 균형을 함께 봐야 합니다.`,
      "핵심 인사이트: 단순 클릭 확대보다 낮은 CPC로 유효 클릭을 확보하는 구조가 다음 운영의 우선순위입니다.",
    ];
  }

  const roasDelta = compareRate(latestSummary.roas, previousAverage.roas);
  const revenueDelta = compareRate(latestSummary.revenue, previousAverage.revenue);
  const roasTrend = trendWord(roasDelta);
  const revenueTrend = trendWord(revenueDelta);

  return [
    `${latestMonth || "최근 월"} 전체 기준 비용 ${fmtWon(
      latestSummary.cost,
    )}, 매출 ${fmtWon(latestSummary.revenue)}, ROAS ${fmtRoas(
      latestSummary.roas,
    )}로 집계됩니다.`,
    `최근 3개월(${recentRange}) 관점에서는 매출이 ${revenueTrend}하고 ROAS는 ${roasTrend} 흐름을 보여, 성장 규모와 효율을 함께 판단해야 합니다.`,
    "핵심 인사이트: ROAS 방어가 가능한 구간은 확장하고, 비용 대비 매출 기여가 낮은 구간은 우선 조정해야 합니다.",
  ];
}

function buildExecutiveWeeklyTrendChart(args: {
  rows: any[];
  reportType: PptReportType;
  latestMonth: string;
}): PptChartData {
  const { rows, reportType, latestMonth } = args;
  const baseRows = latestMonth ? getRowsByMonth(rows, latestMonth) : rows;
  const groups = groupRows(baseRows, pickWeekKey)
    .filter((g) => g.key !== "미분류")
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);

  if (reportType === "db_acquisition") {
    return {
      type: "bar",
      title: "최근 데이터 월 주차별 DB 획득 성과",
      xKey: "week",
      series: [
        { key: "cost", label: "비용" },
        { key: "conversions", label: "전환" },
        { key: "cpa", label: "CPA" },
      ],
      rows: groups.map((g) => ({
        week: g.key.replace(`${latestMonth} `, ""),
        cost: Math.round(g.summary.cost),
        conversions: Math.round(g.summary.conversions),
        cpa: Math.round(g.summary.cpa),
      })),
    };
  }

  if (reportType === "traffic") {
    return {
      type: "bar",
      title: "최근 데이터 월 주차별 트래픽 성과",
      xKey: "week",
      series: [
        { key: "clicks", label: "클릭" },
        { key: "cost", label: "비용" },
        { key: "cpc", label: "CPC" },
      ],
      rows: groups.map((g) => ({
        week: g.key.replace(`${latestMonth} `, ""),
        clicks: Math.round(g.summary.clicks),
        cost: Math.round(g.summary.cost),
        cpc: Math.round(g.summary.cpc),
      })),
    };
  }

  return {
    type: "bar",
    title: "최근 데이터 월 주차별 커머스 성과",
    xKey: "week",
    series: [
      { key: "cost", label: "비용" },
      { key: "revenue", label: "매출" },
      { key: "conversions", label: "전환" },
    ],
    rows: groups.map((g) => ({
      week: g.key.replace(`${latestMonth} `, ""),
      cost: Math.round(g.summary.cost),
      revenue: Math.round(g.summary.revenue),
      conversions: Math.round(g.summary.conversions),
    })),
  };
}

function buildExecutiveSummarySlide(args: {
  rows: any[];
  total: MetricSummary;
  reportType: PptReportType;
  sourceSummaries: PptSourceSummary[];
}): PptSlide {
  const { rows, total, reportType, sourceSummaries } = args;

  const latestMonth = getLatestMonthKey(rows);
  const latestRows = latestMonth ? getRowsByMonth(rows, latestMonth) : rows;
  const latestSummary = summarize(latestRows);
  const recentGroups = getRecentMonthGroups(rows, 3);

  const insightLines = buildExecutiveInsightLines({
    reportType,
    latestMonth,
    latestSummary,
    recentGroups,
  });

  const keyMessage = buildExecutiveKeyMessage({
    reportType,
    latestMonth,
    latestSummary,
  });

  return {
    key: "executive-summary",
    type: "executive-summary",
    eyebrow: "EXECUTIVE SUMMARY",
    title: "Executive Summary",
    subtitle: "매체별 구조를 점검하고 다음 운영 방향을 정교화합니다.",
    keyMessage,
    sourceSummaries,
    kpis: buildTypeKpis(reportType, latestSummary || total),
    chart: buildExecutiveWeeklyTrendChart({
      rows,
      reportType,
      latestMonth,
    }),
    table: {
      title: "매체별 한 줄 요약",
      columns: [
      { key: "source", label: "매체" },
      { key: "headline", label: "핵심 운영 인사이트" },
      { key: "next", label: "다음 운영 방향" },
    ],
      rows: sourceSummaries.map((item) => ({
        source: item.displayName,
        headline: item.headline,
        next: item.nextDirection,
      })),
    },
    analysisInputs: [
      keyMessage,
      `${latestMonth || "전체 기간"} 기준 비용은 ${fmtWon(
        latestSummary.cost,
      )}입니다.`,
      reportType === "traffic"
        ? `클릭 ${fmtInt(latestSummary.clicks)}건, CPC ${
            latestSummary.cpc ? fmtWon(latestSummary.cpc) : "-"
          }, CTR ${fmtRate(latestSummary.ctr)}입니다.`
        : reportType === "db_acquisition"
          ? `전환 ${fmtInt(latestSummary.conversions)}건, CPA ${
              latestSummary.cpa ? fmtWon(latestSummary.cpa) : "-"
            }, CVR ${fmtRate(latestSummary.cvr)}입니다.`
          : `매출 ${fmtWon(latestSummary.revenue)}, ROAS ${fmtRoas(
              latestSummary.roas,
            )}, CVR ${fmtRate(latestSummary.cvr)}입니다.`,
    ],
    insightInputs: insightLines,
  };
}

function buildSourceOverviewSlide(args: {
  sourceSummaries: PptSourceSummary[];
  reportType: PptReportType;
}): PptSlide {
  const { sourceSummaries, reportType } = args;

  return {
    key: "source-overview",
    type: "source-overview",
    eyebrow: "SOURCE OVERVIEW",
    title: "매체별 성과 요약",
    subtitle: "매체별 역할, 운영 판단, 다음 정리 방향을 리뷰형 카드로 정리합니다.",
    sourceSummaries,
    table: {
      title: "매체별 성과 요약",
      columns: buildSourceTableColumns(reportType),
      rows: sourceSummaries.map((item) => item.tableRow),
    },
    analysisInputs: sourceSummaries.map(
      (item) => `${item.displayName}: ${item.headline}`,
    ),
    insightInputs: [
      "매체별 결과는 단순 순위가 아니라 유지·강화·축소 역할로 구분해야 합니다.",
      "성과가 확인된 매체는 확장 후보로, 비용 부담이 큰 매체는 정리 후보로 분리합니다.",
      "다음 운영은 매체별 핵심 신호를 기준으로 예산 재배분과 저효율 축소를 동시에 검토합니다.",
    ],
  };
}

function buildSourceDetailSlides(sourceSummaries: PptSourceSummary[]): PptSlide[] {
  return sourceSummaries.map((item, index): PptSlide => {
    return {
      key: `source-detail-${toSlug(item.displayName)}-${index + 1}`,
      type: "source-detail",
      eyebrow: item.displayName,
      title: `${item.displayName} 성과 요약`,
      subtitle: item.oneLineSummary,
      sourceSummary: item,
      signals: item.signals,
      kpis: item.kpis,
      table: {
        title: `${item.displayName} 핵심 성과`,
        columns: [
          { key: "metric", label: "구분" },
          { key: "value", label: "값" },
        ],
        rows: item.kpis.map((kpi) => ({
          metric: kpi.label,
          value: kpi.value,
        })),
      },
      oneLineInsight: item.oneLineInsight,
      analysisInputs: [
        ...item.coreInsightBody,
        ...item.signals.map((signal) => `${signal.title}: ${signal.body}`),
      ],
      insightInputs: [
        item.oneLineInsight,
        item.nextDirection,
        "다음 운영에서는 해당 매체의 역할을 명확히 두고 성과가 확인된 구간부터 점진 조정합니다.",
      ],
    };
  });
}

function buildCampaignReviewSlide(rows: any[], reportType: PptReportType): PptSlide | null {
  const groups = groupRows(rows, pickCampaign).filter((g) => g.key !== "미분류");
  if (!groups.length) return null;

  const selected = topBy(
    groups,
    (g) => {
      if (reportType === "traffic") return g.summary.clicks;
      if (reportType === "db_acquisition") return g.summary.conversions;
      return g.summary.revenue;
    },
    8,
  );

  return {
    key: "campaign-review",
    type: "campaign-review",
    eyebrow: "CAMPAIGN REVIEW",
    title: "캠페인 성과 리뷰",
    subtitle: "캠페인/그룹 단위의 비용 집중과 핵심 성과를 확인합니다.",
    chart: {
      type: "bar",
      title:
        reportType === "traffic"
          ? "캠페인별 클릭 Top 8"
          : reportType === "db_acquisition"
            ? "캠페인별 전환 Top 8"
            : "캠페인별 매출 Top 8",
      xKey: "campaign",
      series: [
        {
          key:
            reportType === "traffic"
              ? "clicks"
              : reportType === "db_acquisition"
                ? "conversions"
                : "revenue",
          label:
            reportType === "traffic"
              ? "클릭"
              : reportType === "db_acquisition"
                ? "전환"
                : "매출",
        },
      ],
      rows: selected.map((g) => ({
        campaign: g.key,
        clicks: Math.round(g.summary.clicks),
        conversions: Math.round(g.summary.conversions),
        revenue: Math.round(g.summary.revenue),
      })),
    },
    table: {
      title: "캠페인별 성과",
      columns: [
        { key: "campaign", label: "캠페인" },
        { key: "cost", label: "비용" },
        { key: "clicks", label: "클릭" },
        { key: "conversions", label: "전환" },
        { key: "revenue", label: "매출" },
        { key: "roas", label: "ROAS" },
        { key: "cpa", label: "CPA" },
      ],
      rows: selected.map((g) => ({
        campaign: g.key,
        cost: fmtCompactWon(g.summary.cost),
        clicks: fmtInt(g.summary.clicks),
        conversions: fmtInt(g.summary.conversions),
        revenue: fmtCompactWon(g.summary.revenue),
        roas: fmtRoas(g.summary.roas),
        cpa: g.summary.cpa ? fmtCompactWon(g.summary.cpa) : "-",
      })),
    },
    analysisInputs: selected.map(
      (g) =>
        `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 클릭 ${fmtInt(
          g.summary.clicks,
        )}, 전환 ${fmtInt(g.summary.conversions)}, 매출 ${fmtWon(
          g.summary.revenue,
        )}`,
    ),
    insightInputs: [
      "캠페인별 비용 집중도가 높을수록 일부 캠페인의 성과가 전체 결과를 좌우합니다.",
      "성과가 확인된 캠페인은 유지 또는 점진 확대 후보입니다.",
      "비용은 크지만 목표 KPI 기여가 낮은 캠페인은 구조 조정 후보입니다.",
    ],
  };
}

function buildKeywordReviewSlide(rows: any[], reportType: PptReportType): PptSlide | null {
  const groups = groupRows(rows, pickKeyword).filter((g) => g.key !== "미분류");
  if (!groups.length) return null;

  const selected = topBy(
    groups,
    (g) => {
      if (reportType === "traffic") return g.summary.clicks;
      if (reportType === "db_acquisition") return g.summary.conversions;
      return g.summary.conversions * 100000000 + g.summary.revenue;
    },
    10,
  );

  return {
    key: "keyword-review",
    type: "keyword-review",
    eyebrow: "KEYWORD REVIEW",
    title: "키워드 성과 리뷰",
    subtitle: "전환, 클릭, 비용 효율 기준으로 주요 키워드를 점검합니다.",
    table: {
      title: "주요 키워드 Top 10",
      columns: [
        { key: "keyword", label: "키워드" },
        { key: "cost", label: "비용" },
        { key: "clicks", label: "클릭" },
        { key: "conversions", label: "전환" },
        { key: "cpa", label: "CPA" },
        { key: "roas", label: "ROAS" },
      ],
      rows: selected.map((g) => ({
        keyword: g.key,
        cost: fmtCompactWon(g.summary.cost),
        clicks: fmtInt(g.summary.clicks),
        conversions: fmtInt(g.summary.conversions),
        cpa: g.summary.cpa ? fmtCompactWon(g.summary.cpa) : "-",
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: selected.map(
      (g) =>
        `${g.key}: 클릭 ${fmtInt(g.summary.clicks)}, 전환 ${fmtInt(
          g.summary.conversions,
        )}, CPA ${g.summary.cpa ? fmtWon(g.summary.cpa) : "-"}, ROAS ${fmtRoas(
          g.summary.roas,
        )}`,
    ),
    insightInputs: [
      "전환을 만든 키워드와 클릭만 만든 키워드는 분리해서 판단해야 합니다.",
      "전환 규모와 CPA가 동시에 좋은 키워드는 확장 후보입니다.",
      "클릭은 많지만 전환이 낮은 키워드는 입찰, 매칭, 랜딩 적합성을 점검해야 합니다.",
    ],
  };
}

function buildCreativeCards(args: {
  rows: any[];
  reportType: PptReportType;
  mode: "top" | "low";
}) {
  const { rows, reportType, mode } = args;

  const groups = groupRows(rows, pickCreative)
    .filter((g) => g.key !== "미분류")
    .filter((g) => g.summary.cost > 0 || g.summary.clicks > 0 || g.summary.conversions > 0);

  const filtered =
    mode === "top"
      ? groups.filter((g) => g.summary.conversions > 0 || g.summary.clicks > 0)
      : groups.filter((g) => g.summary.cost > 0);

  const selected =
    mode === "top"
      ? topBy(
          filtered,
          (g) => {
            if (reportType === "traffic") return g.summary.clicks;
            if (reportType === "db_acquisition") return g.summary.conversions;
            return g.summary.roas * 100000000 + g.summary.revenue;
          },
          5,
        )
      : bottomBy(
          filtered,
          (g) => {
            if (reportType === "traffic") return g.summary.ctr || 999;
            if (reportType === "db_acquisition") return g.summary.conversions > 0 ? g.summary.cpa : 999999999;
            return g.summary.roas || 0;
          },
          5,
        );

  return selected.map((g): PptReviewCard => {
    const mainValue =
      reportType === "traffic"
        ? `${fmtInt(g.summary.clicks)} 클릭`
        : reportType === "db_acquisition"
          ? `${fmtInt(g.summary.conversions)} 전환`
          : `${fmtRoas(g.summary.roas)} ROAS`;

    const action =
      mode === "top"
        ? "반응이 확인된 메시지와 형식을 다음 운영 기준으로 재활용합니다."
        : "비용 대비 기여가 낮은 원인을 확인하고 노출 축소·교체·메시지 테스트 후보로 분리합니다.";

    return {
      title: g.key,
      badge: mode === "top" ? "성과 확인" : "점검 필요",
      mainValue,
      helper:
        reportType === "traffic"
          ? `CTR ${fmtRate(g.summary.ctr)} · CPC ${
              g.summary.cpc ? fmtWon(g.summary.cpc) : "-"
            }`
          : reportType === "db_acquisition"
            ? `CPA ${g.summary.cpa ? fmtWon(g.summary.cpa) : "-"} · CVR ${fmtRate(
                g.summary.cvr,
              )}`
            : `매출 ${fmtCompactWon(g.summary.revenue)} · 전환 ${fmtInt(
                g.summary.conversions,
              )}건`,
      metrics: [
        { label: "광고비", value: fmtCompactWon(g.summary.cost) },
        { label: "클릭", value: fmtInt(g.summary.clicks) },
        { label: "전환", value: fmtInt(g.summary.conversions) },
        { label: "ROAS", value: fmtRoas(g.summary.roas) },
      ],
      action,
    };
  });
}

function buildCreativeAnalysisSlide(
  rows: any[],
  reportType: PptReportType,
): PptSlide | null {
  const cards = buildCreativeCards({
    rows,
    reportType,
    mode: "top",
  });

  if (!cards.length) return null;

  return {
    key: "creative-analysis",
    type: "creative-analysis",
    eyebrow: "CREATIVE ANALYSIS",
    title: "소재 효율 분석 — TOP 소재",
    subtitle: "성과가 확인된 소재를 기준으로 다음 운영에 활용할 메시지 축을 정리합니다.",
    reviewCards: cards,
    oneLineInsight:
      reportType === "traffic"
        ? "클릭 반응이 확인된 소재는 유효 유입 확대의 기준으로 활용하고, 낮은 CPC 유지 가능성을 함께 점검합니다."
        : reportType === "db_acquisition"
          ? "전환이 확인된 소재는 획득 효율 개선의 기준으로 활용하고, CPA 방어 가능성을 함께 점검합니다."
          : "ROAS와 전환이 확인된 소재는  다음 운영에서 우선 적용 비중을 높일 후보입니다.",
    analysisInputs: cards.map(
      (card) => `${card.title}: ${card.mainValue || ""} · ${card.helper || ""}`,
    ),
    insightInputs: [
      "성과 소재의 메시지 구조를 다음 소재 제작 기준으로 삼습니다.",
      "클릭 효율과 전환 효율이 함께 좋은 소재는 확장 후보입니다.",
      "소재 운영은 단순 교체보다 확인된 반응 축을 재활용하는 방식이 안전합니다.",
    ],
  };
}

function buildCreativeReviewSlide(
  rows: any[],
  reportType: PptReportType,
): PptSlide | null {
  const cards = buildCreativeCards({
    rows,
    reportType,
    mode: "low",
  });

  if (!cards.length) return null;

  return {
    key: "creative-review",
    type: "creative-review",
    eyebrow: "CREATIVE REVIEW",
    title: "소재 효율 분석 — 개선 필요 소재",
    subtitle: "비용 대비 기여가 낮은 소재를 우선 점검합니다.",
    reviewCards: cards,
    oneLineInsight:
      "일부 소재는 클릭 반응과 전환 기여가 다르게 나타날 수 있으므로, 다음 운영에서는 소재별 역할을 분리해 유지·축소·교체 기준을 명확히 가져가야 합니다.",
    analysisInputs: cards.map(
      (card) => `${card.title}: ${card.mainValue || ""} · ${card.helper || ""}`,
    ),
    insightInputs: [
      "저효율 소재는 노출 축소 또는 교체 테스트 후보입니다.",
      "성과가 낮은 소재는 메시지, 혜택, 이미지 구조를 분리해 점검합니다.",
      "성과 소재의 패턴을 기준으로 다음 A/B 테스트를 설계합니다.",
    ],
  };
}

function buildActionPlanSlide(sourceSummaries: PptSourceSummary[]): PptSlide {
  const actionItems = sourceSummaries.map((item, index): PptActionPlanItem => {
    return {
      no: String(index + 1).padStart(2, "0"),
      source: item.displayName,
      current: item.headline,
      next: item.nextActions?.[0] || item.nextDirection,
    };
  });

  return {
    key: "action-plan",
    type: "action-plan",
    eyebrow: "ACTION PLAN",
    title: "다음 달 액션 플랜 요약",
    subtitle: "이번 기간에 확인된 축을 기준으로 다음 운영 방향을 정리합니다.",
    actionItems,
    table: {
      title: "매체별 액션 플랜",
      columns: [
        { key: "no", label: "#" },
        { key: "source", label: "매체" },
        { key: "current", label: "이번 기간 정리" },
        { key: "next", label: "다음 핵심 방향" },
      ],
      rows: actionItems,
    },
    analysisInputs: actionItems.map(
      (item) => `${item.source}: ${item.current} → ${item.next}`,
    ),
    insightInputs: [
      "확인된 축을 우선 유지하고, 성과가 낮은 구간은 점진적으로 조정합니다.",
      "한 번에 큰 폭으로 움직이기보다 1~2주 단위 모니터링으로 안정성을 확인합니다.",
      "매체 간 역할을 분리해 유입, 전환, 매출 기여 구조의 균형을 함께 봅니다.",
    ],
  };
}

function buildPriorityClosingSlide(args: {
  reportType: PptReportType;
  sourceSummaries: PptSourceSummary[];
}): PptSlide {
  const { reportType, sourceSummaries } = args;

  const primary = sourceSummaries[0];
  const secondary = sourceSummaries[1];
  const tertiary = sourceSummaries[2];

  const priorityItems: PptPriorityItem[] = [
    {
      no: "PRIORITY 01",
      title:
        reportType === "traffic"
          ? "유효 클릭 확대 + CPC 안정화"
          : reportType === "db_acquisition"
            ? "전환 발생 구조 유지 + CPA 방어"
            : "매출 기여 축 확대 + ROAS 방어",
      actions: [
        primary
      ? `${primary.displayName}: ${
          primary.nextActions?.[0] || primary.nextDirection
        }`
      : "성과가 확인된 매체 중심으로 운영 비중 우선 유지",
        "핵심 KPI가 흔들리는 구간은 주 단위로 조정",
        "성과가 확인된 메시지·키워드·캠페인 구조를 재활용",
      ],
      goal:
        reportType === "traffic"
          ? "클릭 품질 개선과 CPC 안정화"
          : reportType === "db_acquisition"
            ? "전환 규모 유지와 CPA 안정화"
            : "매출 볼륨 유지와 ROAS 개선",
    },
    {
      no: "PRIORITY 02",
      title: secondary
        ? `${secondary.displayName} 정교화`
        : "캠페인/키워드 구조 정교화",
      actions: [
        secondary
      ? `${secondary.displayName}: ${
          secondary.nextActions?.[1] ||
          secondary.nextActions?.[0] ||
          `${secondary.headline} 기준 운영 구조 점검`
        }`
      : "캠페인별 비용 집중과 전환 기여 구조 점검",
        "성과 캠페인은 유지하고 저효율 캠페인은 점진 축소",
        "키워드·그룹 단위로 확장 후보와 제외 후보를 분리",
      ],
      goal: "성과가 확인된 구조의 재현성 확보",
    },
    {
      no: "PRIORITY 03",
      title: tertiary
        ? `${tertiary.displayName} 모니터링`
        : "소재/신규 테스트 모니터링",
      actions: [
        tertiary
      ? `${tertiary.displayName}: ${
          tertiary.nextActions?.[2] ||
          tertiary.nextActions?.[0] ||
          tertiary.nextDirection
        }`
      : "소재별 클릭 반응과 전환 기여 구조 분리",
        "성과 소재의 메시지 구조를 다음 제작 기준으로 활용",
        "신규 테스트는 작은 예산으로 시작해 결과를 확인",
      ],
      goal: "긍정 신호 유지와 저효율 누수 방지",
    },
  ];

  return {
    key: "priority-closing",
    type: "priority-closing",
    eyebrow: "PRIORITY & CLOSING",
    title: "Priority & Closing",
    subtitle: "다음 운영에서 집중할 우선순위를 정리합니다.",
    priorityItems,
    analysisInputs: priorityItems.map(
      (item) => `${item.no}: ${item.title} / 목표: ${item.goal}`,
    ),
    insightInputs: [
      "이번 기간의 데이터는 확인된 축을 정교화하고 저효율 구간을 줄이는 방향을 제시합니다.",
      "다음 운영은 새로운 시도보다 성과가 확인된 구간의 집중도를 높이는 것이 안전합니다.",
      "실행 후에는 KPI 변화를 기록해 다음 리포트의 우선순위에 반영해야 합니다.",
    ],
  };
}

function buildThankYouSlide(): PptSlide {
  return {
    key: "thank-you",
    type: "thank-you",
    eyebrow: "THANK YOU",
    title: "감사합니다.",
    subtitle: "Etrylue Performance",
    analysisInputs: [
      "이번 보고서는 업로드된 광고 성과 데이터를 기준으로 자동 구성되었습니다.",
      "다음 운영에서는 확인된 성과 축을 중심으로 개선 방향을 실행합니다.",
      "실행 결과는 다음 리포트에서 다시 측정하고 우선순위에 반영합니다.",
    ],
    insightInputs: [
      "성과 리뷰는 단순 보고가 아니라 다음 운영을 더 정확하게 만드는 기준입니다.",
      "확인된 축을 정교화하고 저효율 구간을 줄이는 방식으로 운영합니다.",
      "다음 보고서에서는 실행 결과와 KPI 변화를 연결해 검토합니다.",
    ],
  };
}

function buildReportingPeriodLabel(rows: any[]) {
  const dates = (rows ?? [])
    .map(pickDate)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (!dates.length) return "REPORTING PERIOD | 전체 기간";

  const latestMonth = dates[dates.length - 1].slice(0, 7);
  const latestMonthDates = dates.filter((date) => date.slice(0, 7) === latestMonth);

  const start = `${latestMonth}-01`;
  const end = latestMonthDates[latestMonthDates.length - 1] || dates[dates.length - 1];

  return `REPORTING PERIOD | ${start} ─ ${end}`;
}

function buildDeckTitle(args: {
  advertiserName: string;
  reportTitle?: string | null;
  rows?: any[];
}) {
  const dates = (args.rows ?? [])
    .map(pickDate)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const latestDate = dates[dates.length - 1] || "";
  const latestMonthText = latestDate ? `${Number(latestDate.slice(5, 7))}월` : "";

  if (latestMonthText) {
    return `${latestMonthText} 광고 성과 리뷰`;
  }

  const explicitTitle = asStr(args.reportTitle);
  if (explicitTitle) return explicitTitle;

  const advertiserName = asStr(args.advertiserName) || "광고주";
  return `${advertiserName} 광고 성과 리뷰`;
}

export function buildPptReportData({
  rows,
  advertiserName,
  reportTypeName,
  reportTypeKey,
  reportTitle,
}: BuildPptReportDataParams): PptReportDeck {
  const safeRows = Array.isArray(rows) ? rows : [];
  const reportType = resolveReportType({ reportTypeKey, reportTypeName });
  const total = summarize(safeRows);
  const safeAdvertiserName = asStr(advertiserName) || "광고주";
  const title = buildDeckTitle({
    advertiserName: safeAdvertiserName,
    reportTitle,
    rows: safeRows,
  });

  const latestMonth = getLatestMonthKey(safeRows);
  const latestRows = latestMonth ? getRowsByMonth(safeRows, latestMonth) : safeRows;
  const latestSummary = summarize(latestRows);

  const sourceSummaries = buildSourceSummaries({
    rows: latestRows,
    total: latestSummary,
    reportType,
  });

  const keyMessage = buildExecutiveKeyMessage({
    reportType,
    latestMonth,
    latestSummary,
  });

  const slides: PptSlide[] = [
    buildExecutiveSummarySlide({
      rows: safeRows,
      total,
      reportType,
      sourceSummaries,
    }),
    buildSourceOverviewSlide({
      sourceSummaries,
      reportType,
    }),
    ...buildSourceDetailSlides(sourceSummaries),
  ];

  const campaignReviewSlide = buildCampaignReviewSlide(safeRows, reportType);
  if (campaignReviewSlide) {
    slides.push(campaignReviewSlide);
  }

  const keywordReviewSlide = buildKeywordReviewSlide(safeRows, reportType);
  if (keywordReviewSlide) {
    slides.push(keywordReviewSlide);
  }

  const creativeAnalysisSlide = buildCreativeAnalysisSlide(safeRows, reportType);
  if (creativeAnalysisSlide) {
    slides.push(creativeAnalysisSlide);
  }

  const creativeReviewSlide = buildCreativeReviewSlide(safeRows, reportType);
  if (creativeReviewSlide) {
    slides.push(creativeReviewSlide);
  }

  slides.push(buildActionPlanSlide(sourceSummaries));
  slides.push(
    buildPriorityClosingSlide({
      reportType,
      sourceSummaries,
    }),
  );
  slides.push(buildThankYouSlide());

  return {
    title,
    advertiserName: safeAdvertiserName,
    reportTypeName: asStr(reportTypeName) || "성과 보고서",
    reportType,
    generatedAt: new Date().toISOString(),
    reportingPeriodLabel: buildReportingPeriodLabel(safeRows),
    keyMessage,
    sources: sourceSummaries,
    slides,
  };
}
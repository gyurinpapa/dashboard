// src/lib/report/ppt/build-ppt-data.ts

export type PptReportType = "commerce" | "traffic" | "db_acquisition";

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

export type PptSlide = {
  key: string;
  title: string;
  subtitle?: string;
  kpis?: PptKpi[];
  chart?: PptChartData;
  table?: PptTableData;
  analysisInputs: string[];
  insightInputs: string[];
};

export type PptReportDeck = {
  title: string;
  advertiserName: string;
  reportTypeName: string;
  reportType: PptReportType;
  generatedAt: string;
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

    cost += Math.max(
      asNum(row?.cost),
      asNum(row?.spend),
      asNum(row?.ad_cost),
      asNum(row?.비용),
      0,
    );

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

function groupRows(rows: any[], keyFn: (row: any) => string) {
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

  if (
    source.includes("traffic") ||
    source.includes("트래픽")
  ) {
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

function buildExecutiveSummarySlide(total: MetricSummary): PptSlide {
  return {
    key: "executive-summary",
    title: "Executive Summary",
    subtitle: "전체 성과를 한 장으로 요약합니다.",
    kpis: [
      { label: "비용", value: fmtWon(total.cost) },
      { label: "매출", value: fmtWon(total.revenue) },
      { label: "ROAS", value: fmtRoas(total.roas) },
      { label: "전환", value: fmtInt(total.conversions) },
      { label: "CTR", value: fmtRate(total.ctr) },
      { label: "CVR", value: fmtRate(total.cvr) },
    ],
    analysisInputs: [
      `전체 비용은 ${fmtWon(total.cost)}입니다.`,
      `전체 매출은 ${fmtWon(total.revenue)}이며 ROAS는 ${fmtRoas(total.roas)}입니다.`,
      `클릭 ${fmtInt(total.clicks)}건, 전환 ${fmtInt(total.conversions)}건, CVR ${fmtRate(total.cvr)}입니다.`,
    ],
    insightInputs: [
      "비용 대비 매출 효율을 최우선으로 해석합니다.",
      "클릭 규모와 전환 효율이 함께 개선되어야 다음 운영 성과가 안정적입니다.",
      "이후 페이지에서 구조, 키워드, 소재 기준으로 원인을 분해합니다.",
    ],
  };
}

function buildGoalStatusSlide(total: MetricSummary): PptSlide {
  return {
    key: "goal-status",
    title: "목표 달성 현황",
    subtitle: "월 목표 대비 현재 성과 수준을 점검합니다.",
    kpis: [
      { label: "비용", value: fmtWon(total.cost) },
      { label: "매출", value: fmtWon(total.revenue) },
      { label: "ROAS", value: fmtRoas(total.roas) },
      { label: "CPA", value: total.cpa ? fmtWon(total.cpa) : "-" },
    ],
    chart: {
      type: "bar",
      title: "핵심 KPI 요약",
      xKey: "metric",
      series: [{ key: "value", label: "Value" }],
      rows: [
        { metric: "비용", value: Math.round(total.cost) },
        { metric: "매출", value: Math.round(total.revenue) },
        { metric: "전환", value: Math.round(total.conversions) },
      ],
    },
    analysisInputs: [
      `현재 비용은 ${fmtWon(total.cost)}입니다.`,
      `현재 매출은 ${fmtWon(total.revenue)}입니다.`,
      `ROAS는 ${fmtRoas(total.roas)}, CPA는 ${total.cpa ? fmtWon(total.cpa) : "-"}입니다.`,
    ],
    insightInputs: [
      "목표 달성 여부는 매출 규모와 비용 효율을 함께 봐야 합니다.",
      "ROAS가 높아도 전환 규모가 작으면 확장 여지가 제한됩니다.",
      "다음 페이지에서 기간별 흐름을 확인해 지속성을 판단합니다.",
    ],
  };
}

function buildMonthlyTrendSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickMonth).filter((g) => g.key !== "미분류");
  const sorted = [...groups].sort((a, b) => a.key.localeCompare(b.key));
  const selected = sorted.slice(-6);

  return {
    key: "kpi-trend",
    title: "KPI Trend",
    subtitle: "월별 비용, 매출, ROAS 흐름을 확인합니다.",
    chart: {
      type: "line",
      title: "월별 성과 추이",
      xKey: "month",
      series: [
        { key: "cost", label: "비용" },
        { key: "revenue", label: "매출" },
        { key: "roasPercent", label: "ROAS(%)" },
      ],
      rows: selected.map((g) => ({
        month: g.key,
        cost: Math.round(g.summary.cost),
        revenue: Math.round(g.summary.revenue),
        roasPercent: Math.round(g.summary.roas * 100),
      })),
    },
    table: {
      title: "월별 핵심 지표",
      columns: [
        { key: "month", label: "월" },
        { key: "cost", label: "비용" },
        { key: "revenue", label: "매출" },
        { key: "roas", label: "ROAS" },
      ],
      rows: selected.map((g) => ({
        month: g.key,
        cost: fmtCompactWon(g.summary.cost),
        revenue: fmtCompactWon(g.summary.revenue),
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: selected.map((g) => {
      return `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 매출 ${fmtWon(
        g.summary.revenue,
      )}, ROAS ${fmtRoas(g.summary.roas)}`;
    }),
    insightInputs: [
      "월별 추이는 단기 변동보다 방향성을 중심으로 해석합니다.",
      "비용 증가와 매출 증가가 함께 움직이면 확장 가능성이 높습니다.",
      "ROAS 하락 월은 캠페인/소재/키워드 단계에서 원인을 분해해야 합니다.",
    ],
  };
}

function buildWeeklySlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickWeekKey);
  const selected = groups
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6);

  return {
    key: "weekly-performance",
    title: "주차별 성과 변화",
    subtitle: "최근 주차별 성과 흐름을 비교합니다.",
    chart: {
      type: "bar",
      title: "주차별 매출과 비용",
      xKey: "week",
      series: [
        { key: "cost", label: "비용" },
        { key: "revenue", label: "매출" },
      ],
      rows: selected.map((g) => ({
        week: g.key,
        cost: Math.round(g.summary.cost),
        revenue: Math.round(g.summary.revenue),
      })),
    },
    table: {
      title: "주차별 성과표",
      columns: [
        { key: "week", label: "주차" },
        { key: "cost", label: "비용" },
        { key: "revenue", label: "매출" },
        { key: "roas", label: "ROAS" },
      ],
      rows: selected.map((g) => ({
        week: g.key,
        cost: fmtCompactWon(g.summary.cost),
        revenue: fmtCompactWon(g.summary.revenue),
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: selected.map(
      (g) =>
        `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 매출 ${fmtWon(
          g.summary.revenue,
        )}, ROAS ${fmtRoas(g.summary.roas)}`,
    ),
    insightInputs: [
      "주차별 변화는 캠페인 운영 조정의 즉시 효과를 확인하는 기준입니다.",
      "특정 주차에 효율이 급변했다면 예산, 소재, 키워드 변경 이력을 함께 봐야 합니다.",
      "최근 주차의 성과가 유지되는지 확인한 뒤 확장 여부를 판단합니다.",
    ],
  };
}

function buildSourceSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickSource);
  const selected = topBy(groups, (g) => g.summary.cost, 8);

  return {
    key: "source-structure",
    title: "Source / Channel Structure",
    subtitle: "소스와 채널 기준으로 성과 구조를 비교합니다.",
    chart: {
      type: "bar",
      title: "소스별 비용",
      xKey: "source",
      series: [{ key: "cost", label: "비용" }],
      rows: selected.map((g) => ({
        source: g.key,
        cost: Math.round(g.summary.cost),
      })),
    },
    table: {
      title: "소스별 성과",
      columns: [
        { key: "source", label: "소스" },
        { key: "cost", label: "비용" },
        { key: "revenue", label: "매출" },
        { key: "roas", label: "ROAS" },
      ],
      rows: selected.map((g) => ({
        source: g.key,
        cost: fmtCompactWon(g.summary.cost),
        revenue: fmtCompactWon(g.summary.revenue),
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: selected.map(
      (g) =>
        `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 매출 ${fmtWon(
          g.summary.revenue,
        )}, ROAS ${fmtRoas(g.summary.roas)}`,
    ),
    insightInputs: [
      "비용이 큰 소스와 ROAS가 높은 소스를 분리해서 봐야 합니다.",
      "고비용 저효율 소스는 예산 재배분 후보입니다.",
      "고효율 소스는 확장 가능성과 재현 가능성을 우선 검토합니다.",
    ],
  };
}

function buildCampaignSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickCampaign).filter((g) => g.key !== "미분류");
  const selected = topBy(groups, (g) => g.summary.cost, 10);

  return {
    key: "campaign-structure",
    title: "Campaign Structure",
    subtitle: "캠페인/그룹 단위의 비용 집중과 효율을 확인합니다.",
    chart: {
      type: "bar",
      title: "캠페인별 비용 Top 10",
      xKey: "campaign",
      series: [{ key: "cost", label: "비용" }],
      rows: selected.map((g) => ({
        campaign: g.key,
        cost: Math.round(g.summary.cost),
      })),
    },
    table: {
      title: "캠페인별 성과",
      columns: [
        { key: "campaign", label: "캠페인" },
        { key: "cost", label: "비용" },
        { key: "revenue", label: "매출" },
        { key: "roas", label: "ROAS" },
      ],
      rows: selected.map((g) => ({
        campaign: g.key,
        cost: fmtCompactWon(g.summary.cost),
        revenue: fmtCompactWon(g.summary.revenue),
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: selected.map(
      (g) =>
        `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 매출 ${fmtWon(
          g.summary.revenue,
        )}, ROAS ${fmtRoas(g.summary.roas)}`,
    ),
    insightInputs: [
      "캠페인별 비용 집중도가 높을수록 일부 캠페인의 성과가 전체 결과를 좌우합니다.",
      "비용은 크지만 ROAS가 낮은 캠페인은 구조 조정 후보입니다.",
      "ROAS가 높고 전환 규모가 있는 캠페인은 확장 후보입니다.",
    ],
  };
}

function buildKeywordSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickKeyword).filter((g) => g.key !== "미분류");
  const selected = topBy(groups, (g) => g.summary.conversions, 10);

  return {
    key: "keyword-performance",
    title: "Keyword Performance",
    subtitle: "전환 기준 상위 키워드의 성과를 확인합니다.",
    table: {
      title: "전환 기준 키워드 Top 10",
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
      "클릭은 많지만 전환이 낮은 키워드는 입찰/소재/랜딩 점검이 필요합니다.",
    ],
  };
}

function buildKeywordInsightSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickKeyword).filter((g) => g.key !== "미분류");
  const highCostLowRoas = bottomBy(
    groups.filter((g) => g.summary.cost > 0),
    (g) => g.summary.roas,
    8,
  );

  return {
    key: "keyword-insight",
    title: "Keyword Insight",
    subtitle: "키워드 운영에서 조정이 필요한 구간을 정리합니다.",
    table: {
      title: "저효율 키워드 점검 후보",
      columns: [
        { key: "keyword", label: "키워드" },
        { key: "cost", label: "비용" },
        { key: "conversions", label: "전환" },
        { key: "cpa", label: "CPA" },
        { key: "roas", label: "ROAS" },
      ],
      rows: highCostLowRoas.map((g) => ({
        keyword: g.key,
        cost: fmtCompactWon(g.summary.cost),
        conversions: fmtInt(g.summary.conversions),
        cpa: g.summary.cpa ? fmtCompactWon(g.summary.cpa) : "-",
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: highCostLowRoas.map(
      (g) =>
        `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 전환 ${fmtInt(
          g.summary.conversions,
        )}, ROAS ${fmtRoas(g.summary.roas)}`,
    ),
    insightInputs: [
      "저효율 키워드는 제외보다 먼저 검색 의도와 랜딩 적합성을 확인해야 합니다.",
      "비용이 크고 전환이 없는 키워드는 우선 조정 대상입니다.",
      "성과 키워드와 저효율 키워드의 예산 배분 차이를 다음 운영에 반영합니다.",
    ],
  };
}

function buildCreativeSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickCreative).filter((g) => g.key !== "미분류");
  const selected = topBy(groups, (g) => g.summary.conversions, 10);

  return {
    key: "creative-performance",
    title: "Creative Performance",
    subtitle: "소재별 전환 기여와 효율을 비교합니다.",
    table: {
      title: "전환 기준 소재 Top 10",
      columns: [
        { key: "creative", label: "소재" },
        { key: "cost", label: "비용" },
        { key: "clicks", label: "클릭" },
        { key: "conversions", label: "전환" },
        { key: "roas", label: "ROAS" },
      ],
      rows: selected.map((g) => ({
        creative: g.key,
        cost: fmtCompactWon(g.summary.cost),
        clicks: fmtInt(g.summary.clicks),
        conversions: fmtInt(g.summary.conversions),
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: selected.map(
      (g) =>
        `${g.key}: 클릭 ${fmtInt(g.summary.clicks)}, 전환 ${fmtInt(
          g.summary.conversions,
        )}, ROAS ${fmtRoas(g.summary.roas)}`,
    ),
    insightInputs: [
      "전환 기여 소재는 메시지, 혜택, 이미지 구조를 분해해 재활용해야 합니다.",
      "클릭은 높지만 전환이 낮은 소재는 후속 랜딩/상품 적합성을 점검해야 합니다.",
      "전환과 ROAS가 함께 높은 소재는 확장 후보입니다.",
    ],
  };
}

function buildCreativeInsightSlide(rows: any[]): PptSlide {
  const groups = groupRows(rows, pickCreative).filter((g) => g.key !== "미분류");
  const lowEfficiency = bottomBy(
    groups.filter((g) => g.summary.cost > 0),
    (g) => g.summary.roas,
    8,
  );

  return {
    key: "creative-insight",
    title: "Creative Insight",
    subtitle: "소재 운영에서 개선이 필요한 구간을 정리합니다.",
    table: {
      title: "저효율 소재 점검 후보",
      columns: [
        { key: "creative", label: "소재" },
        { key: "cost", label: "비용" },
        { key: "clicks", label: "클릭" },
        { key: "conversions", label: "전환" },
        { key: "roas", label: "ROAS" },
      ],
      rows: lowEfficiency.map((g) => ({
        creative: g.key,
        cost: fmtCompactWon(g.summary.cost),
        clicks: fmtInt(g.summary.clicks),
        conversions: fmtInt(g.summary.conversions),
        roas: fmtRoas(g.summary.roas),
      })),
    },
    analysisInputs: lowEfficiency.map(
      (g) =>
        `${g.key}: 비용 ${fmtWon(g.summary.cost)}, 클릭 ${fmtInt(
          g.summary.clicks,
        )}, 전환 ${fmtInt(g.summary.conversions)}, ROAS ${fmtRoas(
          g.summary.roas,
        )}`,
    ),
    insightInputs: [
      "저효율 소재는 클릭 유도와 전환 설득 중 어느 단계가 약한지 분리해 봐야 합니다.",
      "비용은 쓰지만 전환이 없는 소재는 교체 또는 노출 축소 후보입니다.",
      "성과 소재의 메시지 구조를 기준으로 다음 소재 테스트를 설계합니다.",
    ],
  };
}

function buildDecisionSlide(total: MetricSummary): PptSlide {
  return {
    key: "decision-hypothesis",
    title: "Decision & Hypothesis",
    subtitle: "데이터 기준으로 다음 운영 가설을 정리합니다.",
    kpis: [
      { label: "ROAS", value: fmtRoas(total.roas) },
      { label: "CPA", value: total.cpa ? fmtWon(total.cpa) : "-" },
      { label: "CTR", value: fmtRate(total.ctr) },
      { label: "CVR", value: fmtRate(total.cvr) },
    ],
    analysisInputs: [
      `현재 ROAS는 ${fmtRoas(total.roas)}입니다.`,
      `현재 CPA는 ${total.cpa ? fmtWon(total.cpa) : "-"}입니다.`,
      `CTR ${fmtRate(total.ctr)}, CVR ${fmtRate(total.cvr)}입니다.`,
    ],
    insightInputs: [
      "다음 가설은 비용 효율, 전환 규모, 확장 가능성을 함께 고려해야 합니다.",
      "성과가 좋은 구조는 확장하고, 저효율 구조는 축소하는 방향이 우선입니다.",
      "가설은 반드시 다음 실행과 리뷰 기준으로 연결되어야 합니다.",
    ],
  };
}

function buildActionPlanSlide(total: MetricSummary): PptSlide {
  return {
    key: "action-plan",
    title: "Action Plan",
    subtitle: "다음 운영 액션을 우선순위로 정리합니다.",
    table: {
      title: "다음 액션 우선순위",
      columns: [
        { key: "priority", label: "우선순위" },
        { key: "action", label: "액션" },
        { key: "reason", label: "근거" },
      ],
      rows: [
        {
          priority: "1",
          action: "고효율 구조 확대",
          reason: `ROAS ${fmtRoas(total.roas)} 기준으로 확장 가능 구간을 우선 검토`,
        },
        {
          priority: "2",
          action: "저효율 비용 축소",
          reason: "비용은 쓰지만 전환/매출 기여가 낮은 구간을 조정",
        },
        {
          priority: "3",
          action: "소재/키워드 테스트",
          reason: "성과 상위 구조를 기준으로 다음 테스트 가설 설계",
        },
      ],
    },
    analysisInputs: [
      "다음 액션은 고효율 확대, 저효율 축소, 신규 테스트 순서로 정리합니다.",
      `현재 ROAS는 ${fmtRoas(total.roas)}이며 CPA는 ${
        total.cpa ? fmtWon(total.cpa) : "-"
      }입니다.`,
      "운영 액션은 반드시 다음 리뷰 기준과 연결되어야 합니다.",
    ],
    insightInputs: [
      "성과가 확인된 영역은 확대 후보입니다.",
      "비용 누수가 있는 영역은 축소 또는 재점검 후보입니다.",
      "다음 보고서는 실행 결과가 실제 KPI에 미친 영향을 기준으로 평가합니다.",
    ],
  };
}

function buildAppendixSlide(rows: any[]): PptSlide {
  const total = summarize(rows);

  return {
    key: "appendix",
    title: "Appendix",
    subtitle: "보고서 산출 기준과 전체 데이터 요약입니다.",
    kpis: [
      { label: "Rows", value: fmtInt(rows.length) },
      { label: "노출", value: fmtInt(total.impressions) },
      { label: "클릭", value: fmtInt(total.clicks) },
      { label: "전환", value: fmtInt(total.conversions) },
    ],
    analysisInputs: [
      `분석 대상 rows는 ${fmtInt(rows.length)}개입니다.`,
      `총 노출 ${fmtInt(total.impressions)}, 클릭 ${fmtInt(total.clicks)}, 전환 ${fmtInt(total.conversions)}입니다.`,
      "PPT 수치는 업로드된 리포트 rows 기준으로 계산됩니다.",
    ],
    insightInputs: [
      "Appendix는 주요 의사결정 보조 자료로 활용합니다.",
      "상세 데이터 검증이 필요할 경우 CSV와 원본 리포트를 함께 확인합니다.",
      "운영 액션은 본문 슬라이드의 우선순위를 기준으로 진행합니다.",
    ],
  };
}

export function buildPptReportData({
  rows,
  advertiserName,
  reportTypeName,
  reportTypeKey,
  reportTitle,
}: BuildPptReportDataParams): PptReportDeck {
  const safeRows = Array.isArray(rows) ? rows : [];
  const total = summarize(safeRows);
  const reportType = resolveReportType({
    reportTypeKey,
    reportTypeName,
  });

  const title =
    asStr(reportTitle) ||
    `${asStr(advertiserName) || "광고주"} ${asStr(reportTypeName) || "성과 보고서"}`;

  const slides: PptSlide[] = [
    buildExecutiveSummarySlide(total),
    buildGoalStatusSlide(total),
    buildMonthlyTrendSlide(safeRows),
    buildWeeklySlide(safeRows),
    buildSourceSlide(safeRows),
    buildCampaignSlide(safeRows),
    buildKeywordSlide(safeRows),
    buildKeywordInsightSlide(safeRows),
    buildCreativeSlide(safeRows),
    buildCreativeInsightSlide(safeRows),
    buildDecisionSlide(total),
    buildActionPlanSlide(total),
    buildAppendixSlide(safeRows),
  ];

  return {
    title,
    advertiserName: asStr(advertiserName) || "광고주",
    reportTypeName: asStr(reportTypeName) || "성과 보고서",
    reportType,
    generatedAt: new Date().toISOString(),
    slides,
  };
}
// src/lib/export-builder/buildExportPayloadsFromRows.ts

import type { ExportSectionPayloadMap } from "./section-props";

type AnyRow = Record<string, any>;

function asString(v: any) {
  if (v == null) return "";
  return String(v).trim();
}

function toNumber(v: any) {
  if (v == null || v === "") return 0;

  if (typeof v === "number") {
    return Number.isFinite(v) ? v : 0;
  }

  const cleaned = String(v).replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickString(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function pickNumber(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && value !== "") {
      const parsed = toNumber(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("ko-KR");
}

function formatPercent(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "-";

  const percent = value <= 10 ? value * 100 : value;
  return `${percent.toFixed(digits)}%`;
}

function formatCompactCurrency(value: number) {
  if (!Number.isFinite(value)) return "-";

  if (value >= 100000000) {
    return `₩${(value / 100000000).toFixed(1)}억`;
  }
  if (value >= 1000000) {
    return `₩${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `₩${Math.round(value / 1000)}K`;
  }

  return `₩${Math.round(value)}`;
}

function normalizeDateValue(value: any) {
  const raw = asString(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDateKey(row: AnyRow) {
  return normalizeDateValue(
    pickString(row, ["date", "report_date", "day"])
  );
}

function getDateLabel(dateKey: string) {
  if (!dateKey) return "-";

  const parts = dateKey.split("-");
  if (parts.length === 3) {
    return `${parts[1]}.${parts[2]}`;
  }

  return dateKey;
}

function getDayLabel(dateKey: string) {
  if (!dateKey) return "-";

  const parts = dateKey.split("-");
  if (parts.length === 3) {
    return String(Number(parts[2]));
  }

  return dateKey;
}

function getImageUrlCandidate(row: AnyRow) {
  const value = pickString(row, ["imageUrl", "image_url", "imagePath", "imagepath"]);
  if (!value) return null;

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return value;
  }

  return null;
}

function basename(value: string) {
  const safe = asString(value);
  if (!safe) return "";

  const normalized = safe.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || safe;
}

function getCreativeName(row: AnyRow) {
  const direct = pickString(row, [
    "creative_name",
    "creative",
    "creativeFile",
    "creative_file",
    "imagePath",
    "imagepath",
  ]);

  if (!direct) return "";

  return basename(direct);
}

function getKeyword(row: AnyRow) {
  return pickString(row, [
    "keyword",
    "search_term",
    "searchTerm",
    "term",
    "query",
  ]);
}

function getRowMetrics(row: AnyRow) {
  const impressions = pickNumber(row, ["impressions"]);
  const clicks = pickNumber(row, ["clicks"]);
  const cost = pickNumber(row, ["cost"]);
  const conversions = pickNumber(row, ["conversions"]);
  const revenue = pickNumber(row, ["revenue"]);

  return {
    impressions,
    clicks,
    cost,
    conversions,
    revenue,
  };
}

function aggregateRows(rows: AnyRow[]) {
  return rows.reduce(
    (acc, row) => {
      const m = getRowMetrics(row);
      acc.impressions += m.impressions;
      acc.clicks += m.clicks;
      acc.cost += m.cost;
      acc.conversions += m.conversions;
      acc.revenue += m.revenue;
      return acc;
    },
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      revenue: 0,
    }
  );
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function buildSummaryKpiPayload(rows: AnyRow[]) {
  const totals = aggregateRows(rows);

  const roas = totals.cost > 0 ? totals.revenue / totals.cost : 0;
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const cvr = totals.clicks > 0 ? totals.conversions / totals.clicks : 0;
  const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;

  return {
    cards: [
      {
        key: "cost",
        label: "광고비",
        value: formatCurrency(totals.cost),
        subValue: `클릭 ${formatNumber(totals.clicks)}`,
        tone: "neutral" as const,
      },
      {
        key: "revenue",
        label: "매출",
        value: formatCurrency(totals.revenue),
        subValue: `전환 ${formatNumber(totals.conversions)}`,
        tone: "accent" as const,
      },
      {
        key: "conversions",
        label: "전환",
        value: formatNumber(totals.conversions),
        subValue: `CVR ${formatPercent(cvr, 2)}`,
        tone: "good" as const,
      },
      {
        key: "roas",
        label: "ROAS",
        value: formatPercent(roas, 0),
        subValue: `CTR ${formatPercent(ctr, 2)}`,
        tone: "accent" as const,
      },
      {
        key: "clicks",
        label: "클릭",
        value: formatNumber(totals.clicks),
        subValue: `CPC ${formatCurrency(cpc)}`,
        tone: "neutral" as const,
      },
      {
        key: "impressions",
        label: "노출",
        value: formatNumber(totals.impressions),
        subValue: `CTR ${formatPercent(ctr, 2)}`,
        tone: "neutral" as const,
      },
    ],
  };
}

function buildSummaryChartPayload(rows: AnyRow[]) {
  const grouped = groupBy(rows, (row) => getDateKey(row));
  const dateKeys = Object.keys(grouped).sort();

  if (!dateKeys.length) return undefined;

  return {
    title: "기간 성과 추이",
    points: dateKeys.map((dateKey) => {
      const totals = aggregateRows(grouped[dateKey]);
      const roas = totals.cost > 0 ? totals.revenue / totals.cost : 0;

      return {
        label: getDateLabel(dateKey),
        cost: totals.cost,
        revenue: totals.revenue,
        roas,
        clicks: totals.clicks,
        impressions: totals.impressions,
        conversions: totals.conversions,
      };
    }),
  };
}

function buildHeatmapPayload(rows: AnyRow[]) {
  const grouped = groupBy(rows, (row) => getDateKey(row));
  const dateKeys = Object.keys(grouped).sort();

  if (!dateKeys.length) return undefined;

  const daily = dateKeys.map((dateKey) => {
    const totals = aggregateRows(grouped[dateKey]);
    return {
      dateKey,
      value: totals.revenue,
    };
  });

  const maxValue = Math.max(1, ...daily.map((d) => d.value));

  return {
    metricKey: "revenue" as const,
    days: daily.slice(0, 35).map((item) => ({
      dayLabel: getDayLabel(item.dateKey),
      value: item.value,
      intensity: item.value > 0 ? item.value / maxValue : 0,
    })),
  };
}

function buildFunnelPayload(rows: AnyRow[]) {
  const totals = aggregateRows(rows);

  const ratioClickFromImpression =
    totals.impressions > 0 ? totals.clicks / totals.impressions : 0;

  const ratioConversionFromClick =
    totals.clicks > 0 ? totals.conversions / totals.clicks : 0;

  return {
    steps: [
      {
        key: "impressions",
        label: "노출",
        value: totals.impressions,
        displayValue: formatNumber(totals.impressions),
      },
      {
        key: "clicks",
        label: "클릭",
        value: totals.clicks,
        displayValue: formatNumber(totals.clicks),
        ratioFromPrev: ratioClickFromImpression,
      },
      {
        key: "conversions",
        label: "전환",
        value: totals.conversions,
        displayValue: formatNumber(totals.conversions),
        ratioFromPrev: ratioConversionFromClick,
      },
    ],
  };
}

function buildKeywordPayload(rows: AnyRow[]) {
  const keywordRows = rows
    .map((row) => {
      const keyword = getKeyword(row);
      if (!keyword) return null;

      const m = getRowMetrics(row);
      return {
        keyword,
        ...m,
      };
    })
    .filter(Boolean) as Array<{
    keyword: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
  }>;

  if (!keywordRows.length) return undefined;

  const grouped = groupBy(keywordRows, (row) => row.keyword);

  const rowsOut = Object.entries(grouped)
    .map(([keyword, group]) => {
      const totals = group.reduce(
        (acc, row) => {
          acc.impressions += row.impressions;
          acc.clicks += row.clicks;
          acc.cost += row.cost;
          acc.conversions += row.conversions;
          acc.revenue += row.revenue;
          return acc;
        },
        {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
        }
      );

      const roas = totals.cost > 0 ? (totals.revenue / totals.cost) * 100 : 0;

      return {
        keyword,
        ...totals,
        roas,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      keyword: item.keyword,
      impressions: item.impressions,
      clicks: item.clicks,
      conversions: item.conversions,
      cost: item.cost,
      revenue: item.revenue,
      roas: item.roas,
    }));

  if (!rowsOut.length) return undefined;

  return {
    rows: rowsOut,
  };
}

function buildCreativePayload(rows: AnyRow[]) {
  const creativeRows = rows
    .map((row) => {
      const name = getCreativeName(row);
      if (!name) return null;

      const m = getRowMetrics(row);
      return {
        name,
        imageUrl: getImageUrlCandidate(row),
        ...m,
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    imageUrl: string | null;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
  }>;

  if (!creativeRows.length) return undefined;

  const grouped = groupBy(creativeRows, (row) => row.name);

  const rowsOut = Object.entries(grouped)
    .map(([name, group]) => {
      const totals = group.reduce(
        (acc, row) => {
          acc.impressions += row.impressions;
          acc.clicks += row.clicks;
          acc.cost += row.cost;
          acc.conversions += row.conversions;
          acc.revenue += row.revenue;
          if (!acc.imageUrl && row.imageUrl) acc.imageUrl = row.imageUrl;
          return acc;
        },
        {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          revenue: 0,
          imageUrl: null as string | null,
        }
      );

      const roas = totals.cost > 0 ? (totals.revenue / totals.cost) * 100 : 0;

      return {
        name,
        ...totals,
        roas,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((item, index) => ({
      rank: index + 1,
      name: item.name,
      imageUrl: item.imageUrl,
      impressions: item.impressions,
      clicks: item.clicks,
      conversions: item.conversions,
      cost: item.cost,
      revenue: item.revenue,
      roas: item.roas,
    }));

  if (!rowsOut.length) return undefined;

  return {
    rows: rowsOut,
  };
}

export function buildExportPayloadsFromRows(
  inputRows?: AnyRow[] | null
): ExportSectionPayloadMap {
  const rows = Array.isArray(inputRows) ? inputRows : [];
  if (!rows.length) return {};

  const payloads: ExportSectionPayloadMap = {};

  payloads["summary-kpi"] = buildSummaryKpiPayload(rows);

  const summaryChart = buildSummaryChartPayload(rows);
  if (summaryChart) {
    payloads["summary-chart"] = summaryChart;
  }

  const heatmap = buildHeatmapPayload(rows);
  if (heatmap) {
    payloads["summary2-heatmap"] = heatmap;
  }

  payloads["summary2-funnel"] = buildFunnelPayload(rows);

  const keywordPayload = buildKeywordPayload(rows);
  if (keywordPayload) {
    payloads["keyword-top10"] = keywordPayload;
  }

  const creativePayload = buildCreativePayload(rows);
  if (creativePayload) {
    payloads["creative-top8"] = creativePayload;
  }

  /**
   * summary-goal 은 현재 대화에서
   * "검증된 goal 데이터 소스"를 아직 확인하지 못했다.
   * 억지 목표값을 만들지 않고 fallback 유지가 가장 안전하다.
   */
  return payloads;
}

/**
 * Step18 preview 보조 요약
 * - 현재 summary-goal fallback 유지 여부 판단 등에 활용 가능
 * - 아직 외부에서 쓰지 않아도 안전하게 둔다.
 */
export function summarizeRowsForExport(inputRows?: AnyRow[] | null) {
  const rows = Array.isArray(inputRows) ? inputRows : [];
  const totals = aggregateRows(rows);

  const roas = totals.cost > 0 ? totals.revenue / totals.cost : 0;
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const cvr = totals.clicks > 0 ? totals.conversions / totals.clicks : 0;

  return {
    ...totals,
    roas,
    ctr,
    cvr,
    costLabel: formatCompactCurrency(totals.cost),
    revenueLabel: formatCompactCurrency(totals.revenue),
  };
}
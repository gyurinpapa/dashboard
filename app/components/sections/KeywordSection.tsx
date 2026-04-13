// app/components/sections/KeywordSection.tsx
"use client";

import {
  memo,
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import {
  KRW,
  toSafeNumber,
  normalizeRate01,
  normalizeRoas01,
  formatPercentFromRate,
  formatPercentFromRoas,
  formatCount,
  formatCurrencyAxisCompact,
  formatPercentAxisFromRoas,
} from "../../../src/lib/report/format";
import DataBarCell from "../ui/DataBarCell";

type ReportMode = "commerce" | "traffic" | "db_acquisition";

type Props = {
  reportType?: ReportMode;
  keywordAgg: any[];
  keywordInsight: string;
};

function resolveReportMode(reportType?: ReportMode): ReportMode {
  if (reportType === "traffic") return "traffic";
  if (reportType === "db_acquisition") return "db_acquisition";
  return "commerce";
}

function getKeywordTableMeta(reportMode: ReportMode) {
  const isTraffic = reportMode === "traffic";
  const isCommerce = reportMode === "commerce";
  const isDbAcquisition = reportMode === "db_acquisition";

  return {
    isTraffic,
    isCommerce,
    isDbAcquisition,
    showConv: !isTraffic,
    showCvr: !isTraffic,
    showCpa: !isTraffic,
    showRevenue: isCommerce,
    showRoas: isCommerce,
    colSpan: isTraffic ? 6 : isDbAcquisition ? 9 : 11,
  };
}

function getKeywordCopy(reportMode: ReportMode) {
  if (reportMode === "traffic") {
    return {
      insightDescription:
        "현재 키워드 성과를 바탕으로 유입 중심의 중요한 흐름과 해석 포인트를 정리했습니다.",
      tableDescription:
        "정렬 기준과 필터 조건에 따라 주요 유입 키워드 성과를 비교할 수 있습니다.",
      tableGuideMerged:
        "통합 보기: 선택한 캠페인/그룹 범위 안에서 중복 키워드를 합산한 뒤 정렬 기준으로 Top50 키워드가 표시됩니다.",
      tableGuideRaw:
        "원본 보기: 선택한 캠페인/그룹 범위 안에서 기존 raw 기준으로 정렬된 Top50 키워드가 표시됩니다.",
      tableFootnote:
        "* 표는 선택한 정렬 기준으로 Top50 키워드입니다. (좌측 필터 조건에 따라 자동 변경)",
    };
  }

  if (reportMode === "db_acquisition") {
    return {
      insightDescription:
        "현재 키워드 성과를 바탕으로 DB 확보/리드 확보 중심의 중요한 흐름과 해석 포인트를 정리했습니다.",
      tableDescription:
        "정렬 기준과 필터 조건에 따라 주요 전환 키워드 성과를 비교할 수 있습니다.",
      tableGuideMerged:
        "통합 보기: 선택한 캠페인/그룹 범위 안에서 중복 키워드를 합산한 뒤 전환 효율 기준으로 Top50 키워드가 표시됩니다.",
      tableGuideRaw:
        "원본 보기: 선택한 캠페인/그룹 범위 안에서 기존 raw 기준으로 정렬된 Top50 키워드가 표시됩니다.",
      tableFootnote:
        "* 표는 선택한 정렬 기준으로 Top50 키워드입니다. (좌측 필터 조건에 따라 자동 변경)",
    };
  }

  return {
    insightDescription:
      "현재 키워드 성과를 바탕으로 중요한 흐름과 해석 포인트를 정리했습니다.",
    tableDescription:
      "정렬 기준과 필터 조건에 따라 주요 키워드 성과를 비교할 수 있습니다.",
    tableGuideMerged:
      "통합 보기: 선택한 캠페인/그룹 범위 안에서 중복 키워드를 합산한 뒤 정렬 기준으로 Top50 키워드가 표시됩니다.",
    tableGuideRaw:
      "원본 보기: 선택한 캠페인/그룹 범위 안에서 기존 raw 기준으로 정렬된 Top50 키워드가 표시됩니다.",
    tableFootnote:
      "* 표는 선택한 정렬 기준으로 Top50 키워드입니다. (좌측 필터 조건에 따라 자동 변경)",
  };
}

function cleanName(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function extractDisplayName(v: any, depth = 0): string | null {
  if (v == null) return null;

  if (typeof v === "string" || typeof v === "number") return cleanName(v);

  if (Array.isArray(v)) {
    for (const it of v) {
      const got = extractDisplayName(it, depth + 1);
      if (got) return got;
    }
    return null;
  }

  if (typeof v === "object") {
    const preferKeys = [
      "name",
      "title",
      "label",
      "value",
      "text",
      "nm",
      "campaignName",
      "campaign_name",
      "groupName",
      "group_name",
      "adgroupName",
      "adgroup_name",
    ];

    for (const k of preferKeys) {
      const got = extractDisplayName((v as any)[k], depth + 1);
      if (got) return got;
    }

    for (const k of Object.keys(v)) {
      const val = (v as any)[k];
      if (typeof val === "string") {
        const s = cleanName(val);
        if (s) return s;
      }
    }

    if (depth < 2) {
      for (const k of Object.keys(v)) {
        const got = extractDisplayName((v as any)[k], depth + 1);
        if (got) return got;
      }
    }
  }

  return null;
}

function pickFirstByPaths(obj: any, paths: string[]): string | null {
  if (!obj) return null;

  for (const p of paths) {
    const parts = p.split(".");
    let cur: any = obj;
    for (const part of parts) {
      if (cur == null) break;
      cur = cur?.[part];
    }
    const got = extractDisplayName(cur);
    if (got) return got;
  }
  return null;
}

function extractCampaignName(r: any): string | null {
  return pickFirstByPaths(r, [
    "campaign_name",
    "campaign",
    "campaignName",
    "campaign_nm",
    "campaignNm",
    "campaign_title",
    "cmp_name",
    "cmp_nm",
    "campaign.name",
    "campaign.title",
    "campaign.label",
    "campaign.value",
  ]);
}

function extractGroupName(r: any): string | null {
  return pickFirstByPaths(r, [
    "group_name",
    "group",
    "groupName",
    "group_nm",
    "groupNm",
    "adgroup_name",
    "adgroup",
    "adgroupName",
    "grp_name",
    "grp_nm",
    "group.name",
    "group.title",
    "group.label",
    "group.value",
    "adgroup.name",
    "adgroup.title",
  ]);
}

function normalizeKeywordKey(v: any): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function pickDisplayKeyword(rawKeyword: any, normalizedKey: string) {
  const raw = String(rawKeyword ?? "").trim().replace(/\s+/g, " ");
  if (raw) return raw;
  return normalizedKey || "(empty)";
}

const FilterDropdown = memo(function FilterDropdown({
  label,
  options,
  value,
  onChange,
  disabled,
  placeholder,
  maxButtonWidthClass = "max-w-[220px]",
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  maxButtonWidthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const buttonText = value ?? placeholder ?? label;

  const sortedOptions = useMemo(() => {
    const arr = (options ?? [])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, "ko"));
  }, [options]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!!disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        title={disabled ? `${label} (캠페인을 먼저 선택하세요)` : buttonText}
        className={[
          "inline-flex items-center gap-1.5",
          "rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition",
          "focus:outline-none",
          maxButtonWidthClass,
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            : "border-orange-200 bg-white text-gray-800 hover:border-orange-300 hover:bg-orange-50/70",
        ].join(" ")}
      >
        <span className="truncate">{buttonText}</span>
        <span className={disabled ? "text-gray-300" : "text-orange-500"}>▼</span>
      </button>

      {open && !disabled && (
        <div
          className={[
            "absolute left-0 mt-2",
            "z-50 max-h-72 min-w-full w-80 max-w-[70vw] overflow-auto",
            "rounded-2xl border border-gray-200 bg-white shadow-xl",
          ].join(" ")}
        >
          <button
            type="button"
            className={[
              "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm",
              !value ? "bg-orange-50" : "hover:bg-orange-50",
            ].join(" ")}
            title={`전체 ${label}`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="truncate whitespace-nowrap">{`전체 ${label}`}</span>
            {!value ? (
              <span className="font-bold text-orange-600">✓</span>
            ) : (
              <span />
            )}
          </button>

          {sortedOptions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">옵션이 없습니다.</div>
          ) : (
            sortedOptions.map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  className={[
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm",
                    active ? "bg-orange-50" : "hover:bg-orange-50",
                  ].join(" ")}
                  title={opt}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <span className="truncate whitespace-nowrap">{opt}</span>
                  {active ? (
                    <span className="font-bold text-orange-600">✓</span>
                  ) : (
                    <span />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

type Row = {
  keyword: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cost: number;
  conversions: number;
  cvr: number;
  cpa: number;
  revenue: number;
  roas: number;
  campaign?: string | null;
  group?: string | null;
};

type SortDir = "asc" | "desc";
type SortKey =
  | "keyword"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cost"
  | "conversions"
  | "cvr"
  | "cpa"
  | "revenue"
  | "roas";

const SORT_LABEL: Record<SortKey, string> = {
  keyword: "Keyword",
  impressions: "Impr",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
  cost: "Cost",
  conversions: "Conv",
  cvr: "CVR",
  cpa: "CPA",
  revenue: "Revenue",
  roas: "ROAS",
};

const SectionHeader = memo(function SectionHeader({
  badge,
  title,
  description,
  right,
}: {
  badge: string;
  title: string;
  description: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-orange-700">
            {badge}
          </span>
        </div>
        <div className="text-[17px] font-semibold tracking-[-0.02em] text-gray-900">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-gray-500">{description}</div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
});

const ChartCard = memo(function ChartCard({
  badge,
  title,
  description,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <SectionHeader badge={badge} title={title} description={description} />
      {children}
    </div>
  );
});

const KeywordRankingChart = memo(function KeywordRankingChart({
  badge,
  title,
  description,
  data,
  dataKey,
  xTickFormatter,
  tooltipFormatter,
  labelFormatter,
  rightMargin = 70,
}: {
  badge: string;
  title: string;
  description: string;
  data: Row[];
  dataKey: keyof Row;
  xTickFormatter: (v: any) => string;
  tooltipFormatter: (v: any) => string;
  labelFormatter: (v: any) => string;
  rightMargin?: number;
}) {
  return (
    <ChartCard badge={badge} title={title} description={description}>
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 6, right: rightMargin, left: 0, bottom: 6 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={xTickFormatter}
            />
            <YAxis
              type="category"
              dataKey="keyword"
              width={100}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v: any) => tooltipFormatter(v)}
            />
            <Bar dataKey={String(dataKey)}>
              <LabelList
                dataKey={String(dataKey)}
                position="right"
                formatter={(v: any) => labelFormatter(v)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fill: "#F97316",
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
});

const SortHeaderCell = memo(function SortHeaderCell({
  k,
  align = "left",
  activeSortKey,
  sortDir,
  onClick,
}: {
  k: SortKey;
  align?: "left" | "right";
  activeSortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  return (
    <th
      className={[
        "select-none whitespace-nowrap px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        align === "left" ? "text-left" : "text-right",
        "cursor-pointer border-b border-gray-200 text-gray-500 transition hover:bg-gray-100/80 hover:text-gray-700",
      ].join(" ")}
      onClick={() => onClick(k)}
      title={`정렬: ${SORT_LABEL[k]}`}
    >
      {SORT_LABEL[k]}
      {activeSortKey === k ? (
        <span className="ml-1 inline-block align-middle text-[10px] text-orange-500">
          {sortDir === "asc" ? "▲" : "▼"}
        </span>
      ) : null}
    </th>
  );
});

type TableRowModel = {
  key: string;
  keyword: string;
  impressionsValue: number;
  impressionsLabel: string;
  clicksValue: number;
  clicksLabel: string;
  ctrLabel: string;
  cpcLabel: string;
  costValue: number;
  costLabel: string;
  conversionsValue: number;
  conversionsLabel: string;
  cvrLabel: string;
  cpaLabel: string;
  revenueValue: number;
  revenueLabel: string;
  roasLabel: string;
};

const KeywordTableRow = memo(function KeywordTableRow({
  row,
  reportMode,
  kwMaxImpr,
  kwMaxClicks,
  kwMaxCost,
  kwMaxConv,
  kwMaxRev,
}: {
  row: TableRowModel;
  reportMode: ReportMode;
  kwMaxImpr: number;
  kwMaxClicks: number;
  kwMaxCost: number;
  kwMaxConv: number;
  kwMaxRev: number;
}) {
  const tableMeta = getKeywordTableMeta(reportMode);

  return (
    <tr className="border-t border-gray-200 transition hover:bg-orange-50/40">
      <td className="whitespace-nowrap px-4 py-3.5 text-left font-medium text-gray-900">
        {row.keyword || "(empty)"}
      </td>

      <td className="px-4 py-3.5">
        <DataBarCell
          value={row.impressionsValue}
          max={kwMaxImpr}
          label={row.impressionsLabel}
        />
      </td>

      <td className="px-4 py-3.5">
        <DataBarCell
          value={row.clicksValue}
          max={kwMaxClicks}
          label={row.clicksLabel}
        />
      </td>

      <td className="px-4 py-3.5 text-right text-gray-700">{row.ctrLabel}</td>

      <td className="px-4 py-3.5 text-right text-gray-700">{row.cpcLabel}</td>

      <td className="px-4 py-3.5">
        <DataBarCell
          value={row.costValue}
          max={kwMaxCost}
          label={row.costLabel}
        />
      </td>

      {tableMeta.showConv && (
        <td className="px-4 py-3.5">
          <DataBarCell
            value={row.conversionsValue}
            max={kwMaxConv}
            label={row.conversionsLabel}
          />
        </td>
      )}

      {tableMeta.showCvr && (
        <td className="px-4 py-3.5 text-right text-gray-700">{row.cvrLabel}</td>
      )}

      {tableMeta.showCpa && (
        <td className="px-4 py-3.5 text-right text-gray-700">{row.cpaLabel}</td>
      )}

      {tableMeta.showRevenue && (
        <td className="px-4 py-3.5">
          <DataBarCell
            value={row.revenueValue}
            max={kwMaxRev}
            label={row.revenueLabel}
          />
        </td>
      )}

      {tableMeta.showRoas && (
        <td className="px-4 py-3.5 text-right text-gray-700">{row.roasLabel}</td>
      )}
    </tr>
  );
});

function mergeKeywordRows(sourceRows: Row[]): Row[] {
  const map = new Map<string, Row>();

  for (const r of sourceRows) {
    const key = normalizeKeywordKey(r.keyword);
    if (!key) continue;

    const displayKeyword = pickDisplayKeyword(r.keyword, key);
    const prev = map.get(key);

    if (!prev) {
      map.set(key, {
        keyword: displayKeyword,
        impressions: toSafeNumber(r.impressions),
        clicks: toSafeNumber(r.clicks),
        ctr: 0,
        cpc: 0,
        cost: toSafeNumber(r.cost),
        conversions: toSafeNumber(r.conversions),
        cvr: 0,
        cpa: 0,
        revenue: toSafeNumber(r.revenue),
        roas: 0,
        campaign: null,
        group: null,
      });
      continue;
    }

    prev.impressions += toSafeNumber(r.impressions);
    prev.clicks += toSafeNumber(r.clicks);
    prev.cost += toSafeNumber(r.cost);
    prev.conversions += toSafeNumber(r.conversions);
    prev.revenue += toSafeNumber(r.revenue);
  }

  return Array.from(map.values()).map((r) => {
    const impressions = toSafeNumber(r.impressions);
    const clicks = toSafeNumber(r.clicks);
    const cost = toSafeNumber(r.cost);
    const conversions = toSafeNumber(r.conversions);
    const revenue = toSafeNumber(r.revenue);

    return {
      ...r,
      ctr: normalizeRate01(impressions > 0 ? clicks / impressions : 0),
      cpc: toSafeNumber(clicks > 0 ? cost / clicks : 0),
      cvr: normalizeRate01(clicks > 0 ? conversions / clicks : 0),
      cpa: toSafeNumber(conversions > 0 ? cost / conversions : 0),
      roas: normalizeRoas01(cost > 0 ? revenue / cost : 0),
    };
  });
}

export default function KeywordSection({
  reportType,
  keywordAgg,
  keywordInsight,
}: Props) {
  const reportMode = resolveReportMode(reportType);
  const tableMeta = getKeywordTableMeta(reportMode);
  const copy = getKeywordCopy(reportMode);

  const rows: Row[] = useMemo(() => {
    return (Array.isArray(keywordAgg) ? keywordAgg : []).map((r: any) => {
      const keyword = String(r.keyword ?? r.label ?? r.name ?? "");

      const impressions = toSafeNumber(r.impressions ?? r.impr);
      const clicks = toSafeNumber(r.clicks);
      const cost = toSafeNumber(r.cost);
      const conversions = toSafeNumber(r.conversions ?? r.conv);
      const revenue = toSafeNumber(r.revenue);

      const ctr = normalizeRate01(
        r.ctr ?? (impressions > 0 ? clicks / impressions : 0)
      );
      const cvr = normalizeRate01(
        r.cvr ?? (clicks > 0 ? conversions / clicks : 0)
      );
      const cpc = toSafeNumber(r.cpc ?? (clicks > 0 ? cost / clicks : 0));
      const cpa = toSafeNumber(
        r.cpa ?? (conversions > 0 ? cost / conversions : 0)
      );
      const roas = normalizeRoas01(r.roas ?? (cost > 0 ? revenue / cost : 0));

      const campaign = extractCampaignName(r);
      const group = extractGroupName(r);

      return {
        keyword,
        impressions,
        clicks,
        ctr,
        cpc,
        cost,
        conversions,
        cvr,
        cpa,
        revenue,
        roas,
        campaign,
        group,
      };
    });
  }, [keywordAgg]);

  const chartRows: Row[] = useMemo(() => {
    return mergeKeywordRows(rows);
  }, [rows]);

  const {
    topImpressions,
    topClicks,
    topCost,
    topConv,
    topRoas,
    topCpa,
  }: {
    topImpressions: Row[];
    topClicks: Row[];
    topCost: Row[];
    topConv: Row[];
    topRoas: Row[];
    topCpa: Row[];
  } = useMemo(() => {
    const top20 = (arr: Row[], sorter: (a: Row, b: Row) => number) =>
      [...arr].sort(sorter).slice(0, 20).reverse();

    return {
      topImpressions: top20(chartRows, (a, b) => b.impressions - a.impressions),
      topClicks: top20(chartRows, (a, b) => b.clicks - a.clicks),
      topCost: top20(chartRows, (a, b) => b.cost - a.cost),
      topConv: top20(chartRows, (a, b) => b.conversions - a.conversions),
      topRoas: top20(chartRows, (a, b) => b.roas - a.roas),
      topCpa: top20(
        chartRows.filter((r) => toSafeNumber(r.conversions) > 0),
        (a, b) => a.cpa - b.cpa
      ),
    };
  }, [chartRows]);

  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"merged" | "raw">("merged");

  const onClickHeader = useCallback((k: SortKey) => {
    setSortKey((prevSortKey) => {
      if (prevSortKey === k) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevSortKey;
      }
      setSortDir(k === "keyword" ? "asc" : "desc");
      return k;
    });
  }, []);

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = (r.campaign ?? "").toString().trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const groupOptions = useMemo(() => {
    if (!campaignFilter) return [];
    const set = new Set<string>();
    rows
      .filter((r) => (r.campaign ?? "") === campaignFilter)
      .forEach((r) => {
        const g = (r.group ?? "").toString().trim();
        if (g) set.add(g);
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows, campaignFilter]);

  const filteredRawRows = useMemo(() => {
    return rows.filter((r) => {
      if (campaignFilter && (r.campaign ?? "") !== campaignFilter) return false;
      if (groupFilter && (r.group ?? "") !== groupFilter) return false;
      return true;
    });
  }, [rows, campaignFilter, groupFilter]);

  const tableSourceRows = useMemo(() => {
    if (viewMode === "merged") {
      return mergeKeywordRows(filteredRawRows);
    }
    return filteredRawRows;
  }, [viewMode, filteredRawRows]);

  const tableRows = useMemo(() => {
    const sorted = [...tableSourceRows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "keyword") {
        return dir * a.keyword.localeCompare(b.keyword, "ko");
      }

      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;

      return dir * (toSafeNumber(av) - toSafeNumber(bv));
    });

    return sorted.slice(0, 50);
  }, [tableSourceRows, sortKey, sortDir]);

  const {
    kwMaxImpr,
    kwMaxClicks,
    kwMaxCost,
    kwMaxConv,
    kwMaxRev,
  } = useMemo(() => {
    let maxImpr = 0;
    let maxClicks = 0;
    let maxCost = 0;
    let maxConv = 0;
    let maxRev = 0;

    for (const r of tableRows) {
      maxImpr = Math.max(maxImpr, toSafeNumber(r.impressions));
      maxClicks = Math.max(maxClicks, toSafeNumber(r.clicks));
      maxCost = Math.max(maxCost, toSafeNumber(r.cost));
      maxConv = Math.max(maxConv, toSafeNumber(r.conversions));
      maxRev = Math.max(maxRev, toSafeNumber(r.revenue));
    }

    return {
      kwMaxImpr: maxImpr,
      kwMaxClicks: maxClicks,
      kwMaxCost: maxCost,
      kwMaxConv: maxConv,
      kwMaxRev: maxRev,
    };
  }, [tableRows]);

  const tableRowModels = useMemo<TableRowModel[]>(() => {
    return tableRows.map((r, idx) => ({
      key: `${viewMode}-${campaignFilter ?? "all"}-${groupFilter ?? "all"}-${r.keyword}-${idx}`,
      keyword: r.keyword || "(empty)",
      impressionsValue: toSafeNumber(r.impressions),
      impressionsLabel: formatCount(r.impressions),
      clicksValue: toSafeNumber(r.clicks),
      clicksLabel: formatCount(r.clicks),
      ctrLabel: formatPercentFromRate(r.ctr, 2),
      cpcLabel: KRW(r.cpc),
      costValue: toSafeNumber(r.cost),
      costLabel: KRW(r.cost),
      conversionsValue: toSafeNumber(r.conversions),
      conversionsLabel: formatCount(r.conversions),
      cvrLabel: formatPercentFromRate(r.cvr, 2),
      cpaLabel: KRW(r.cpa),
      revenueValue: toSafeNumber(r.revenue),
      revenueLabel: KRW(r.revenue),
      roasLabel: formatPercentFromRoas(r.roas, 1),
    }));
  }, [tableRows, viewMode, campaignFilter, groupFilter]);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingRestoreScrollTop = useRef<number | null>(null);

  const rememberScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    pendingRestoreScrollTop.current = el.scrollTop;
  }, []);

  useLayoutEffect(() => {
    const v = pendingRestoreScrollTop.current;
    if (v == null) return;
    const el = tableScrollRef.current;
    if (el) el.scrollTop = v;
    pendingRestoreScrollTop.current = null;
  });

  useEffect(() => {
    setCampaignFilter(null);
    setGroupFilter(null);
  }, [viewMode]);

  useEffect(() => {
    if (!campaignFilter) {
      if (groupFilter !== null) setGroupFilter(null);
      return;
    }

    if (groupFilter && !groupOptions.includes(groupFilter)) {
      setGroupFilter(null);
    }
  }, [campaignFilter, groupFilter, groupOptions]);

  const filterBadge = useMemo(() => {
    const modeLabel = viewMode === "merged" ? "통합 보기" : "원본 보기";
    const parts: string[] = [modeLabel];
    if (campaignFilter) parts.push(`캠페인: ${campaignFilter}`);
    if (groupFilter) parts.push(`그룹: ${groupFilter}`);
    return parts.join(" / ");
  }, [campaignFilter, groupFilter, viewMode]);

  const handleSetMerged = useCallback(() => {
    rememberScroll();
    setViewMode("merged");
  }, [rememberScroll]);

  const handleSetRaw = useCallback(() => {
    rememberScroll();
    setViewMode("raw");
  }, [rememberScroll]);

  const handleChangeCampaign = useCallback(
    (v: string | null) => {
      rememberScroll();
      setCampaignFilter(v);
      setGroupFilter(null);
    },
    [rememberScroll]
  );

  const handleChangeGroup = useCallback(
    (v: string | null) => {
      rememberScroll();
      setGroupFilter(v);
    },
    [rememberScroll]
  );

  return (
    <section className="mt-2 space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {reportMode === "traffic" ? (
          <>
            <KeywordRankingChart
              badge="Keyword Ranking"
              title="노출수 TOP20 키워드"
              description="중복 키워드를 통합 집계한 뒤 노출 기여도가 높은 순으로 정리했습니다."
              data={topImpressions}
              dataKey="impressions"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={formatCount}
              labelFormatter={formatCount}
              rightMargin={70}
            />

            <KeywordRankingChart
              badge="Keyword Ranking"
              title="클릭수 TOP20 키워드"
              description="중복 키워드를 통합한 뒤 실제 유입 반응이 많은 키워드 순으로 정리했습니다."
              data={topClicks}
              dataKey="clicks"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={formatCount}
              labelFormatter={formatCount}
              rightMargin={70}
            />

            <KeywordRankingChart
              badge="Keyword Ranking"
              title="비용 TOP20 키워드"
              description="중복 키워드를 통합 집계한 뒤 예산이 많이 집행된 순으로 정리했습니다."
              data={topCost}
              dataKey="cost"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={KRW}
              labelFormatter={KRW}
              rightMargin={82}
            />
          </>
        ) : reportMode === "db_acquisition" ? (
          <>
            <KeywordRankingChart
              badge="Keyword Ranking"
              title="클릭수 TOP20 키워드"
              description="중복 키워드를 통합 집계한 뒤 유입을 가장 많이 만든 키워드 순으로 정리했습니다."
              data={topClicks}
              dataKey="clicks"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={formatCount}
              labelFormatter={formatCount}
              rightMargin={70}
            />

            <KeywordRankingChart
              badge="Keyword Ranking"
              title="전환수 TOP20 키워드"
              description="중복 키워드를 통합한 뒤 리드/전환 기여도가 높은 키워드 순으로 정리했습니다."
              data={topConv}
              dataKey="conversions"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={formatCount}
              labelFormatter={formatCount}
              rightMargin={70}
            />

            <KeywordRankingChart
              badge="Keyword Ranking"
              title="CPA 우수 TOP20 키워드"
              description="중복 키워드를 통합한 뒤 전환이 발생한 키워드만 대상으로 CPA가 낮은 순으로 정리했습니다."
              data={topCpa}
              dataKey="cpa"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={KRW}
              labelFormatter={KRW}
              rightMargin={82}
            />
          </>
        ) : (
          <>
            <KeywordRankingChart
              badge="Keyword Ranking"
              title="클릭수 TOP20 키워드"
              description="중복 키워드를 통합 집계한 뒤 유입을 가장 많이 만든 키워드 순으로 정리했습니다."
              data={topClicks}
              dataKey="clicks"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={formatCount}
              labelFormatter={formatCount}
              rightMargin={70}
            />

            <KeywordRankingChart
              badge="Keyword Ranking"
              title="전환수 TOP20 키워드"
              description="중복 키워드를 통합한 뒤 전환 기여도가 높은 키워드 순으로 정리했습니다."
              data={topConv}
              dataKey="conversions"
              xTickFormatter={formatCurrencyAxisCompact}
              tooltipFormatter={formatCount}
              labelFormatter={formatCount}
              rightMargin={70}
            />

            <KeywordRankingChart
              badge="Keyword Ranking"
              title="ROAS TOP20 키워드"
              description="중복 키워드를 통합한 뒤 합산 매출/비용 기준으로 ROAS를 재계산해 정리했습니다."
              data={topRoas}
              dataKey="roas"
              xTickFormatter={formatPercentAxisFromRoas}
              tooltipFormatter={(v) => formatPercentFromRoas(v, 1)}
              labelFormatter={(v) => formatPercentFromRoas(v, 1)}
              rightMargin={82}
            />
          </>
        )}
      </div>

      <section>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader
            badge="AI Insight"
            title="키워드 요약 인사이트"
            description={copy.insightDescription}
          />
          {keywordInsight ? (
            <div className="whitespace-pre-wrap text-sm leading-7 text-gray-800">
              {keywordInsight}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              키워드 데이터가 없어 인사이트를 생성할 수 없습니다.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader
            badge="Keyword Table"
            title="키워드 상세 성과"
            description={copy.tableDescription}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSetMerged}
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                    viewMode === "merged"
                      ? "border-orange-300 bg-orange-500 text-white"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100",
                  ].join(" ")}
                >
                  통합 보기
                </button>

                <button
                  type="button"
                  onClick={handleSetRaw}
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                    viewMode === "raw"
                      ? "border-orange-300 bg-orange-500 text-white"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100",
                  ].join(" ")}
                >
                  원본 보기
                </button>

                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-600">
                  {filterBadge}
                </span>
              </div>
            }
          />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-400">
              {viewMode === "merged" ? copy.tableGuideMerged : copy.tableGuideRaw}
            </div>

            <div className="flex flex-wrap gap-3">
              <FilterDropdown
                label="캠페인명"
                placeholder="캠페인명"
                options={campaignOptions}
                value={campaignFilter}
                onChange={handleChangeCampaign}
              />
              <FilterDropdown
                label="그룹명"
                placeholder="그룹명"
                options={groupOptions}
                value={groupFilter}
                disabled={!campaignFilter}
                onChange={handleChangeGroup}
              />
            </div>
          </div>

          <div
            ref={tableScrollRef}
            className="overflow-auto rounded-2xl border border-gray-200/90 bg-white shadow-sm"
          >
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur">
                <tr>
                  <SortHeaderCell
                    k="keyword"
                    align="left"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onClickHeader}
                  />
                  <SortHeaderCell
                    k="impressions"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onClickHeader}
                  />
                  <SortHeaderCell
                    k="clicks"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onClickHeader}
                  />
                  <SortHeaderCell
                    k="ctr"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onClickHeader}
                  />
                  <SortHeaderCell
                    k="cpc"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onClickHeader}
                  />
                  <SortHeaderCell
                    k="cost"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onClickHeader}
                  />
                  {tableMeta.showConv && (
                    <SortHeaderCell
                      k="conversions"
                      activeSortKey={sortKey}
                      sortDir={sortDir}
                      onClick={onClickHeader}
                    />
                  )}
                  {tableMeta.showCvr && (
                    <SortHeaderCell
                      k="cvr"
                      activeSortKey={sortKey}
                      sortDir={sortDir}
                      onClick={onClickHeader}
                    />
                  )}
                  {tableMeta.showCpa && (
                    <SortHeaderCell
                      k="cpa"
                      activeSortKey={sortKey}
                      sortDir={sortDir}
                      onClick={onClickHeader}
                    />
                  )}
                  {tableMeta.showRevenue && (
                    <SortHeaderCell
                      k="revenue"
                      activeSortKey={sortKey}
                      sortDir={sortDir}
                      onClick={onClickHeader}
                    />
                  )}
                  {tableMeta.showRoas && (
                    <SortHeaderCell
                      k="roas"
                      activeSortKey={sortKey}
                      sortDir={sortDir}
                      onClick={onClickHeader}
                    />
                  )}
                </tr>
              </thead>

              <tbody>
                {tableRowModels.length === 0 ? (
                  <tr className="border-t border-gray-200">
                    <td
                      className="px-4 py-8 text-center text-sm text-gray-500"
                      colSpan={tableMeta.colSpan}
                    >
                      표시할 키워드 데이터가 없습니다. (필터 조건/컬럼명을 확인해 주세요)
                    </td>
                  </tr>
                ) : (
                  tableRowModels.map((row) => (
                    <KeywordTableRow
                      key={row.key}
                      row={row}
                      reportMode={reportMode}
                      kwMaxImpr={kwMaxImpr}
                      kwMaxClicks={kwMaxClicks}
                      kwMaxCost={kwMaxCost}
                      kwMaxConv={kwMaxConv}
                      kwMaxRev={kwMaxRev}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-400">{copy.tableFootnote}</div>
        </div>
      </section>
    </section>
  );
}
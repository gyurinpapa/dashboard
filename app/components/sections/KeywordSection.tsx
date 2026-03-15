"use client";

import {
  useMemo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
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

type Props = {
  keywordAgg: any[];
  keywordInsight: string;
};

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

function FilterDropdown({
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
          "inline-flex items-center gap-1",
          "px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition border",
          maxButtonWidthClass,
          disabled
            ? "bg-gray-200 text-gray-500 border-gray-200 cursor-not-allowed"
            : "bg-orange-600 text-white border-orange-600 hover:bg-orange-700",
        ].join(" ")}
      >
        <span className="truncate">{buttonText}</span>
        <span className={disabled ? "text-gray-400" : "text-white/90"}>▼</span>
      </button>

      {open && !disabled && (
        <div
          className={[
            "absolute left-0 mt-2",
            "min-w-full w-80 max-w-[70vw]",
            "bg-white border rounded-xl shadow-lg z-50",
            "max-h-72 overflow-auto",
          ].join(" ")}
        >
          <button
            type="button"
            className={[
              "w-full px-4 py-2 text-sm text-left flex items-center justify-between gap-2",
              !value ? "bg-orange-50" : "hover:bg-orange-50",
            ].join(" ")}
            title={`전체 ${label}`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="truncate whitespace-nowrap">{`전체 ${label}`}</span>
            {!value ? <span className="text-orange-600 font-bold">✓</span> : <span />}
          </button>

          {sortedOptions.length === 0 ? (
            <div className="px-4 py-2 text-sm text-gray-500">옵션이 없습니다.</div>
          ) : (
            sortedOptions.map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  className={[
                    "w-full px-4 py-2 text-sm text-left flex items-center justify-between gap-2",
                    active ? "bg-orange-50" : "hover:bg-orange-50",
                  ].join(" ")}
                  title={opt}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <span className="truncate whitespace-nowrap">{opt}</span>
                  {active ? <span className="text-orange-600 font-bold">✓</span> : <span />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

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

export default function KeywordSection({ keywordAgg, keywordInsight }: Props) {
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
      const cpa = toSafeNumber(r.cpa ?? (conversions > 0 ? cost / conversions : 0));
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

  useEffect(() => {
    console.log("campaign raw", keywordAgg?.[0]);
    console.log(
      "[KeywordSection] keywordAgg length:",
      Array.isArray(keywordAgg) ? keywordAgg.length : "not array"
    );
    console.log(
      "[KeywordSection] keywordAgg[0] keys:",
      keywordAgg?.[0] ? Object.keys(keywordAgg[0]) : null
    );
    console.log("[KeywordSection] sample campaign/group from keywordAgg[0]:", {
      campaign_name: keywordAgg?.[0]?.campaign_name,
      campaign: keywordAgg?.[0]?.campaign,
      group_name: keywordAgg?.[0]?.group_name,
      group: keywordAgg?.[0]?.group,
      campaignObj: keywordAgg?.[0]?.campaign,
      groupObj: keywordAgg?.[0]?.group,
    });
  }, [keywordAgg]);

  const topClicks = useMemo(
    () => [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 20).reverse(),
    [rows]
  );
  const topConv = useMemo(
    () =>
      [...rows].sort((a, b) => b.conversions - a.conversions).slice(0, 20).reverse(),
    [rows]
  );
  const topRoas = useMemo(
    () => [...rows].sort((a, b) => b.roas - a.roas).slice(0, 20).reverse(),
    [rows]
  );

  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onClickHeader = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(k);
    setSortDir(k === "keyword" ? "asc" : "desc");
  };

  const SortArrow = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return <span className="ml-1 inline-block align-middle">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const Th = ({ k, align = "right" }: { k: SortKey; align?: "left" | "right" }) => (
    <th
      className={[
        "p-3 select-none whitespace-nowrap",
        align === "left" ? "text-left" : "text-right",
        "cursor-pointer hover:bg-gray-100",
      ].join(" ")}
      onClick={() => onClickHeader(k)}
      title={`정렬: ${SORT_LABEL[k]}`}
    >
      {SORT_LABEL[k]}
      <SortArrow k={k} />
    </th>
  );

  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

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

  const tableScopeRows = useMemo(() => {
    return rows.filter((r) => {
      if (campaignFilter && (r.campaign ?? "") !== campaignFilter) return false;
      if (groupFilter && (r.group ?? "") !== groupFilter) return false;
      return true;
    });
  }, [rows, campaignFilter, groupFilter]);

  const tableRows = useMemo(() => {
    const sorted = [...tableScopeRows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "keyword") {
        return dir * a.keyword.localeCompare(b.keyword, "ko");
      }

      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;

      return dir * (toSafeNumber(av) - toSafeNumber(bv));
    });

    return sorted.slice(0, 50);
  }, [tableScopeRows, sortKey, sortDir]);

  const kwMaxImpr = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.impressions))),
    [tableRows]
  );
  const kwMaxClicks = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.clicks))),
    [tableRows]
  );
  const kwMaxCost = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.cost))),
    [tableRows]
  );
  const kwMaxConv = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.conversions))),
    [tableRows]
  );
  const kwMaxRev = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.revenue))),
    [tableRows]
  );

  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingRestoreScrollTop = useRef<number | null>(null);

  const rememberScroll = () => {
    const el = tableScrollRef.current;
    if (!el) return;
    pendingRestoreScrollTop.current = el.scrollTop;
  };

  useLayoutEffect(() => {
    const v = pendingRestoreScrollTop.current;
    if (v == null) return;
    const el = tableScrollRef.current;
    if (el) el.scrollTop = v;
    pendingRestoreScrollTop.current = null;
  });

  const filterBadge = useMemo(() => {
    if (!campaignFilter && !groupFilter) return "전체";
    const parts: string[] = [];
    if (campaignFilter) parts.push(`캠페인: ${campaignFilter}`);
    if (groupFilter) parts.push(`그룹: ${groupFilter}`);
    return parts.join(" / ");
  }, [campaignFilter, groupFilter]);

  return (
    <section className="mt-1">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold">클릭수 TOP20 키워드</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart
                data={topClicks}
                layout="vertical"
                margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                />
                <YAxis type="category" dataKey="keyword" width={100} tick={{ fontSize: 11 }} />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => formatCount(v)} />
                <Bar dataKey="clicks">
                  <LabelList
                    dataKey="clicks"
                    position="right"
                    formatter={(v: any) => formatCount(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold">전환수 TOP20 키워드</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart
                data={topConv}
                layout="vertical"
                margin={{ top: 6, right: 70, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                />
                <YAxis type="category" dataKey="keyword" width={100} tick={{ fontSize: 11 }} />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => formatCount(v)} />
                <Bar dataKey="conversions">
                  <LabelList
                    dataKey="conversions"
                    position="right"
                    formatter={(v: any) => formatCount(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold">ROAS TOP20 키워드</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart
                data={topRoas}
                layout="vertical"
                margin={{ top: 6, right: 82, left: 0, bottom: 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatPercentAxisFromRoas(v)}
                />
                <YAxis type="category" dataKey="keyword" width={100} tick={{ fontSize: 11 }} />
                <Tooltip
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v: any) => formatPercentFromRoas(v, 1)}
                />
                <Bar dataKey="roas">
                  <LabelList
                    dataKey="roas"
                    position="right"
                    formatter={(v: any) => formatPercentFromRoas(v, 1)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <section className="mt-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 font-semibold">요약 인사이트</div>
          {keywordInsight ? (
            <div className="whitespace-pre-wrap text-sm text-gray-800">{keywordInsight}</div>
          ) : (
            <div className="text-sm text-gray-500">
              키워드 데이터가 없어 인사이트를 생성할 수 없습니다.
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px]">
              {filterBadge}
            </span>
          </div>

          <div className="flex gap-3">
            <FilterDropdown
              label="캠페인명"
              placeholder="캠페인명"
              options={campaignOptions}
              value={campaignFilter}
              onChange={(v) => {
                rememberScroll();
                setCampaignFilter(v);
                setGroupFilter(null);
              }}
            />
            <FilterDropdown
              label="그룹명"
              placeholder="그룹명"
              options={groupOptions}
              value={groupFilter}
              disabled={!campaignFilter}
              onChange={(v) => {
                rememberScroll();
                setGroupFilter(v);
              }}
            />
          </div>
        </div>

        <div
          ref={tableScrollRef}
          className="overflow-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm"
        >
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50/95 text-gray-600">
              <tr>
                <Th k="keyword" align="left" />
                <Th k="impressions" />
                <Th k="clicks" />
                <Th k="ctr" />
                <Th k="cpc" />
                <Th k="cost" />
                <Th k="conversions" />
                <Th k="cvr" />
                <Th k="cpa" />
                <Th k="revenue" />
                <Th k="roas" />
              </tr>
            </thead>

            <tbody>
              {tableRows.length === 0 ? (
                <tr className="border-t border-gray-200">
                  <td className="p-3 text-gray-500" colSpan={11}>
                    표시할 키워드 데이터가 없습니다. (필터 조건/컬럼명을 확인해 주세요)
                  </td>
                </tr>
              ) : (
                tableRows.map((r, idx) => (
                  <tr key={`${r.keyword}-${idx}`} className="border-t border-gray-200">
                    <td className="whitespace-nowrap p-3 text-left font-medium">
                      {r.keyword || "(empty)"}
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.impressions)}
                        max={kwMaxImpr}
                        label={formatCount(r.impressions)}
                      />
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.clicks)}
                        max={kwMaxClicks}
                        label={formatCount(r.clicks)}
                      />
                    </td>

                    <td className="p-3 text-right">{formatPercentFromRate(r.ctr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpc)}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.cost)}
                        max={kwMaxCost}
                        label={KRW(r.cost)}
                      />
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.conversions)}
                        max={kwMaxConv}
                        label={formatCount(r.conversions)}
                      />
                    </td>

                    <td className="p-3 text-right">{formatPercentFromRate(r.cvr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpa)}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.revenue)}
                        max={kwMaxRev}
                        label={KRW(r.revenue)}
                      />
                    </td>

                    <td className="p-3 text-right">{formatPercentFromRoas(r.roas, 1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          * 표는 선택한 정렬 기준으로 Top50 키워드입니다. (좌측 필터 조건에 따라 자동 변경)
        </div>
      </section>
    </section>
  );
}
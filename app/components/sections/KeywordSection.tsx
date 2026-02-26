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
import { KRW, formatNumber } from "../../../src/lib/report/format";
import DataBarCell from "../ui/DataBarCell";

type Props = {
  keywordAgg: any[];
  keywordInsight: string;
};

// ===== 숫자/비율 안전 유틸 (StructureSection 톤과 동일 계열) =====
const toNum = (v: any) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const toRate01 = (v: any) => {
  const n = toNum(v);
  return n > 1 ? n / 100 : n; // 12.3 -> 0.123
};

const toRoas01 = (v: any) => {
  const n = toNum(v);
  return n > 10 ? n / 100 : n; // 115 -> 1.15
};

const pctText = (rate01: number, digits = 1) =>
  `${(rate01 * 100).toFixed(digits)}%`;

function fmtComma(n: any) {
  const v = toNum(n);
  return Math.round(v).toLocaleString();
}
function fmtRoasPct(roas01: any) {
  const v = toRoas01(roas01);
  return `${(v * 100).toFixed(1)}%`;
}

/* =========================
   ✅ 캠페인/그룹명 추출 강화 유틸
   - keywordAgg가 어떤 키/중첩 형태로 오든 최대한 이름을 뽑아냄
========================= */
function cleanName(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// ✅ 객체/배열까지 커버해서 "표시용 이름"을 뽑아내는 범용 extractor
function extractDisplayName(v: any, depth = 0): string | null {
  if (v == null) return null;

  // string/number
  if (typeof v === "string" || typeof v === "number") return cleanName(v);

  // array: 첫 요소부터 탐색
  if (Array.isArray(v)) {
    for (const it of v) {
      const got = extractDisplayName(it, depth + 1);
      if (got) return got;
    }
    return null;
  }

  // object
  if (typeof v === "object") {
    // 1) 우선순위 키들
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

    // 2) 흔한 id-only 객체를 위해: key 전체 훑어서 "문자열" 먼저 찾기
    for (const k of Object.keys(v)) {
      const val = (v as any)[k];
      if (typeof val === "string") {
        const s = cleanName(val);
        if (s) return s;
      }
    }

    // 3) (마지막) depth 제한 내에서 재귀 탐색
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
    // 문자열 케이스
    "campaign_name",
    "campaign",
    "campaignName",
    "campaign_nm",
    "campaignNm",
    "campaign_title",
    "cmp_name",
    "cmp_nm",
    // 객체/중첩 케이스
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
    // 객체/중첩 케이스
    "group.name",
    "group.title",
    "group.label",
    "group.value",
    "adgroup.name",
    "adgroup.title",
  ]);
}
/* =========================
   ✅ 주황 둥근사각 드롭다운 (캠페인/그룹) - UX 보완 반영
   - 버튼 바로 아래(left-0) + 오름차순 목록
   - 현재 선택 체크/강조
   - ellipsis + title
   - 그룹: 캠페인 선택 전 disabled
========================= */
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
            {!value ? (
              <span className="text-orange-600 font-bold">✓</span>
            ) : (
              <span />
            )}
          </button>

          {sortedOptions.length === 0 ? (
            <div className="px-4 py-2 text-sm text-gray-500">
              옵션이 없습니다.
            </div>
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
                  {active ? (
                    <span className="text-orange-600 font-bold">✓</span>
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
}

type Row = {
  keyword: string;
  impressions: number;
  clicks: number;
  ctr: number; // 0~1
  cpc: number;
  cost: number;
  conversions: number;
  cvr: number; // 0~1
  cpa: number;
  revenue: number;
  roas: number; // 0~1

  // ✅ 필터용
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
  // ===== keywordAgg normalize (표/차트 공용) =====
  // ✅ FIX: campaign/group 추출 강화
  const rows: Row[] = useMemo(() => {
    return (Array.isArray(keywordAgg) ? keywordAgg : []).map((r: any) => {
      const keyword = String(r.keyword ?? r.label ?? r.name ?? "");

      const impressions = toNum(r.impressions ?? r.impr);
      const clicks = toNum(r.clicks);
      const cost = toNum(r.cost);
      const conversions = toNum(r.conversions ?? r.conv);
      const revenue = toNum(r.revenue);

      const ctr = toRate01(
        r.ctr ?? (impressions > 0 ? clicks / impressions : 0)
      );
      const cvr = toRate01(r.cvr ?? (clicks > 0 ? conversions / clicks : 0));
      const cpc = toNum(r.cpc ?? (clicks > 0 ? cost / clicks : 0));
      const cpa = toNum(r.cpa ?? (conversions > 0 ? cost / conversions : 0));
      const roas = toRoas01(r.roas ?? (cost > 0 ? revenue / cost : 0));

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
  console.log("[KeywordSection] keywordAgg length:", Array.isArray(keywordAgg) ? keywordAgg.length : "not array");
  console.log("[KeywordSection] keywordAgg[0] keys:", keywordAgg?.[0] ? Object.keys(keywordAgg[0]) : null);
  console.log("[KeywordSection] sample campaign/group from keywordAgg[0]:", {

    campaign_name: keywordAgg?.[0]?.campaign_name,
    campaign: keywordAgg?.[0]?.campaign,
    group_name: keywordAgg?.[0]?.group_name,
    group: keywordAgg?.[0]?.group,
    campaignObj: keywordAgg?.[0]?.campaign,
    groupObj: keywordAgg?.[0]?.group,
  });
}, [keywordAgg]);

  // ===== 차트 Top20 ===== (원본 rows 기준 그대로 유지)
  const topClicks = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 20)
        .reverse(),
    [rows]
  );
  const topConv = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 20)
        .reverse(),
    [rows]
  );
  const topRoas = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 20)
        .reverse(),
    [rows]
  );

  // ==========================
  // ✅ 표 정렬(오름/내림) 상태 (기존 그대로)
  // ==========================
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
    return (
      <span className="ml-1 inline-block align-middle">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
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

  /* =========================
     ✅ 캠페인/그룹 필터 (표에만 적용)
     - 그래프/인사이트는 기존 rows 그대로 유지
  ========================= */
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  // ✅ rows에 campaign이 이제 들어오므로 캠페인 옵션이 반드시 나와야 함
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

  // ✅ 표용 rows만 필터 (중요)
  const tableScopeRows = useMemo(() => {
    return rows.filter((r) => {
      if (campaignFilter && (r.campaign ?? "") !== campaignFilter) return false;
      if (groupFilter && (r.group ?? "") !== groupFilter) return false;
      return true;
    });
  }, [rows, campaignFilter, groupFilter]);

  // ===== 표: 선택한 컬럼 정렬 → Top50 =====
  const tableRows = useMemo(() => {
    const sorted = [...tableScopeRows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "keyword") {
        return dir * a.keyword.localeCompare(b.keyword, "ko");
      }

      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;

      return dir * (toNum(av) - toNum(bv));
    });

    return sorted.slice(0, 50);
  }, [tableScopeRows, sortKey, sortDir]);

  // ✅ (키워드 표 막대그래프용) max 계산: "표에 보여주는 50개 기준" (기존 그대로)
  const kwMaxImpr = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toNum(r.impressions))),
    [tableRows]
  );
  const kwMaxClicks = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toNum(r.clicks))),
    [tableRows]
  );
  const kwMaxCost = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toNum(r.cost))),
    [tableRows]
  );
  const kwMaxConv = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toNum(r.conversions))),
    [tableRows]
  );
  const kwMaxRev = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toNum(r.revenue))),
    [tableRows]
  );

  // ==========================
  // ✅ 캠페인 변경 시: 그룹 자동 초기화 + 표 스크롤 위치 유지
  // ==========================
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

  // ✅ 배지 텍스트: “전체” 또는 “캠페인: X / 그룹: Y”
  const filterBadge = useMemo(() => {
    if (!campaignFilter && !groupFilter) return "전체";
    const parts: string[] = [];
    if (campaignFilter) parts.push(`캠페인: ${campaignFilter}`);
    if (groupFilter) parts.push(`그룹: ${groupFilter}`);
    return parts.join(" / ");
  }, [campaignFilter, groupFilter]);

  return (
    <section className="mt-1">
      {/* 타이틀 */}
      <div className="mb-0.5">
        <h2 className="text-xl font-semibold">키워드 현황</h2>
      </div>

      {/* 3개 차트: 한 줄 3개 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 클릭수 */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-2">클릭수 TOP20 키워드</div>
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
                  tickFormatter={(v) => formatNumber(toNum(v))}
                />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v: any) => fmtComma(v)}
                />
                <Bar dataKey="clicks">
                  <LabelList
                    dataKey="clicks"
                    position="right"
                    formatter={(v: any) => fmtComma(v)}
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
        </div>

        {/* 전환수 */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-2">전환수 TOP20 키워드</div>
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
                  tickFormatter={(v) => formatNumber(toNum(v))}
                />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v: any) => fmtComma(v)}
                />
                <Bar dataKey="conversions">
                  <LabelList
                    dataKey="conversions"
                    position="right"
                    formatter={(v: any) => fmtComma(v)}
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
        </div>

        {/* ROAS */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-2">ROAS TOP20 키워드</div>
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
                  tickFormatter={(v) => fmtRoasPct(v)}
                />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v: any) => fmtRoasPct(v)}
                />
                <Bar dataKey="roas">
                  <LabelList
                    dataKey="roas"
                    position="right"
                    formatter={(v: any) => fmtRoasPct(v)}
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
        </div>
      </div>

      {/* ✅ 인사이트 요약 */}
      <section className="mt-6">
        <div className="border rounded-xl p-6 bg-white">
          <div className="font-semibold mb-3">요약 인사이트</div>
          {keywordInsight ? (
            <div className="text-sm text-gray-800 whitespace-pre-wrap">
              {keywordInsight}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              키워드 데이터가 없어 인사이트를 생성할 수 없습니다.
            </div>
          )}
        </div>
      </section>

      {/* ✅ 키워드 요약표 */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold">키워드 요약</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full border bg-white shrink-0">
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

        <div ref={tableScrollRef} className="overflow-auto rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 text-gray-600">
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
                <tr className="border-t">
                  <td className="p-3 text-gray-500" colSpan={11}>
                    표시할 키워드 데이터가 없습니다. (필터 조건/컬럼명을 확인해 주세요)
                  </td>
                </tr>
              ) : (
                tableRows.map((r, idx) => (
                  <tr key={`${r.keyword}-${idx}`} className="border-t">
                    <td className="p-3 font-medium whitespace-nowrap text-left">
                      {r.keyword || "(empty)"}
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.impressions)}
                        max={kwMaxImpr}
                        label={fmtComma(r.impressions)}
                      />
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.clicks)}
                        max={kwMaxClicks}
                        label={fmtComma(r.clicks)}
                      />
                    </td>

                    <td className="p-3 text-right">{pctText(r.ctr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpc)}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.cost)}
                        max={kwMaxCost}
                        label={KRW(r.cost)}
                      />
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.conversions)}
                        max={kwMaxConv}
                        label={fmtComma(r.conversions)}
                      />
                    </td>

                    <td className="p-3 text-right">{pctText(r.cvr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpa)}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toNum(r.revenue)}
                        max={kwMaxRev}
                        label={KRW(r.revenue)}
                      />
                    </td>

                    <td className="p-3 text-right">{pctText(r.roas, 1)}</td>
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
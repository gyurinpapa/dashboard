"use client";

import { useEffect, useMemo, useState } from "react";
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
import { groupByCreative } from "../../../src/lib/report/creative";

type Props = {
  reportType?: "commerce" | "traffic";
  rows: any[];
};

const short = (s: any, n = 7) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

type CreativeAgg = {
  creative: string;
  imagePath?: string;
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
};

type SortDir = "asc" | "desc";
type SortKey =
  | "creative"
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
  creative: "Creative",
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

export default function CreativeSection({ reportType, rows }: Props) {
  const isTraffic = reportType === "traffic";

  const creativeAgg: CreativeAgg[] = useMemo(() => {
    const rawAgg = groupByCreative(rows ?? []);

    return (rawAgg ?? []).map((r: any) => {
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

      return {
        creative: String(r.creative ?? ""),
        imagePath: r.imagePath ? String(r.imagePath) : "",
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
      };
    });
  }, [rows]);

  const topImpressions = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topClicks = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topCost = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topConv = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const topRoas = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.roas - a.roas)
        .slice(0, 20)
        .reverse(),
    [creativeAgg]
  );

  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCreative, setSelectedCreative] = useState<CreativeAgg | null>(null);

  const onClickHeader = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(k);
    setSortDir(k === "creative" ? "asc" : "desc");
  };

  const SortArrow = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return (
      <span className="ml-1 inline-block align-middle">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const Th = ({
    k,
    align = "right",
  }: {
    k: SortKey;
    align?: "left" | "right";
  }) => (
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

  const tableRows = useMemo(() => {
    const sorted = [...creativeAgg].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "creative") {
        return dir * a.creative.localeCompare(b.creative, "ko");
      }
      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;
      return dir * (toSafeNumber(av) - toSafeNumber(bv));
    });

    return sorted.slice(0, 50);
  }, [creativeAgg, sortKey, sortDir]);

  const maxImpr = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.impressions))),
    [tableRows]
  );

  const maxClicks = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.clicks))),
    [tableRows]
  );

  const maxCost = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.cost))),
    [tableRows]
  );

  const maxConv = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.conversions))),
    [tableRows]
  );

  const maxRev = useMemo(
    () => Math.max(0, ...tableRows.map((r) => toSafeNumber(r.revenue))),
    [tableRows]
  );

  useEffect(() => {
    if (!selectedCreative) return;

    const exists = creativeAgg.some(
      (item) =>
        item.creative === selectedCreative.creative &&
        String(item.imagePath ?? "") === String(selectedCreative.imagePath ?? "")
    );

    if (!exists) {
      setSelectedCreative(null);
    }
  }, [creativeAgg, selectedCreative]);

  return (
    <section className="mt-1">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {isTraffic ? (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold">노출수 TOP20 소재</div>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topImpressions}
                    layout="vertical"
                    margin={{ top: 6, right: 18, left: 6, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={78}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="impressions"
                      onClick={(_: any, idx: number) => {
                        const item = topImpressions?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="impressions"
                        position="insideRight"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold">클릭수 TOP20 소재</div>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topClicks}
                    layout="vertical"
                    margin={{ top: 6, right: 18, left: 6, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={78}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="clicks"
                      onClick={(_: any, idx: number) => {
                        const item = topClicks?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="clicks"
                        position="insideRight"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold">비용 TOP20 소재</div>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topCost}
                    layout="vertical"
                    margin={{ top: 6, right: 18, left: 6, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={78}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => KRW(v)}
                    />
                    <Bar
                      dataKey="cost"
                      onClick={(_: any, idx: number) => {
                        const item = topCost?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="cost"
                        position="insideRight"
                        formatter={(v: any) => KRW(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold">클릭수 TOP20 소재</div>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topClicks}
                    layout="vertical"
                    margin={{ top: 6, right: 18, left: 6, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={78}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="clicks"
                      onClick={(_: any, idx: number) => {
                        const item = topClicks?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="clicks"
                        position="insideRight"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold">전환수 TOP20 소재</div>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topConv}
                    layout="vertical"
                    margin={{ top: 6, right: 18, left: 6, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatCurrencyAxisCompact(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={78}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatCount(v)}
                    />
                    <Bar
                      dataKey="conversions"
                      onClick={(_: any, idx: number) => {
                        const item = topConv?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="conversions"
                        position="insideRight"
                        formatter={(v: any) => formatCount(v)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold">ROAS TOP20 소재</div>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topRoas}
                    layout="vertical"
                    margin={{ top: 6, right: 18, left: 6, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatPercentAxisFromRoas(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="creative"
                      width={78}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => short(v, 7)}
                    />
                    <Tooltip
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(v: any) => formatPercentFromRoas(v, 1)}
                    />
                    <Bar
                      dataKey="roas"
                      onClick={(_: any, idx: number) => {
                        const item = topRoas?.[idx];
                        if (item) setSelectedCreative(item);
                      }}
                    >
                      <LabelList
                        dataKey="roas"
                        position="insideRight"
                        formatter={(v: any) => formatPercentFromRoas(v, 1)}
                        style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      <section className="mt-10">
        <div className="overflow-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50/95 text-gray-600">
              <tr>
                <Th k="creative" align="left" />
                <Th k="impressions" />
                <Th k="clicks" />
                <Th k="ctr" />
                <Th k="cpc" />
                <Th k="cost" />
                {!isTraffic && <Th k="conversions" />}
                {!isTraffic && <Th k="cvr" />}
                {!isTraffic && <Th k="cpa" />}
                {!isTraffic && <Th k="revenue" />}
                {!isTraffic && <Th k="roas" />}
              </tr>
            </thead>

            <tbody>
              {tableRows.length === 0 ? (
                <tr className="border-t border-gray-200">
                  <td className="p-3 text-gray-500" colSpan={isTraffic ? 6 : 11}>
                    표시할 소재 데이터가 없습니다. (creative 컬럼을 확인해 주세요)
                  </td>
                </tr>
              ) : (
                tableRows.map((r, idx) => (
                  <tr
                    key={`${r.creative}-${idx}`}
                    className="cursor-pointer border-t border-gray-200 hover:bg-orange-50"
                    onClick={() => setSelectedCreative(r)}
                  >
                    <td className="whitespace-nowrap p-3 text-left font-medium">
                      {r.creative || "(empty)"}
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.impressions)}
                        max={maxImpr}
                        label={formatCount(r.impressions)}
                      />
                    </td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.clicks)}
                        max={maxClicks}
                        label={formatCount(r.clicks)}
                      />
                    </td>

                    <td className="p-3 text-right">
                      {formatPercentFromRate(r.ctr, 2)}
                    </td>
                    <td className="p-3 text-right">{KRW(r.cpc)}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.cost)}
                        max={maxCost}
                        label={KRW(r.cost)}
                      />
                    </td>

                    {!isTraffic && (
                      <td className="p-3">
                        <DataBarCell
                          value={toSafeNumber(r.conversions)}
                          max={maxConv}
                          label={formatCount(r.conversions)}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className="p-3 text-right">
                        {formatPercentFromRate(r.cvr, 2)}
                      </td>
                    )}

                    {!isTraffic && (
                      <td className="p-3 text-right">{KRW(r.cpa)}</td>
                    )}

                    {!isTraffic && (
                      <td className="p-3">
                        <DataBarCell
                          value={toSafeNumber(r.revenue)}
                          max={maxRev}
                          label={KRW(r.revenue)}
                        />
                      </td>
                    )}

                    {!isTraffic && (
                      <td className="p-3 text-right">
                        {formatPercentFromRoas(r.roas, 1)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          * 표는 선택한 정렬 기준으로 Top50 소재입니다. (월/주/기기/채널 필터 조건에 따라 변경)
        </div>
      </section>
    </section>
  );
}
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

export default function CreativeSection({ rows }: Props) {
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

  const topClicks = useMemo(
    () =>
      [...creativeAgg]
        .sort((a, b) => b.clicks - a.clicks)
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

  const [selectedCreative, setSelectedCreative] = useState<CreativeAgg | null>(
    null
  );

  const creativeInsightText = useMemo(() => {
    if (!rows?.length) return "";

    const totalImpr = rows.reduce(
      (a, r) => a + toSafeNumber(r.impressions),
      0
    );
    const totalClicks = rows.reduce((a, r) => a + toSafeNumber(r.clicks), 0);
    const totalCost = rows.reduce((a, r) => a + toSafeNumber(r.cost), 0);
    const totalConv = rows.reduce(
      (a, r) => a + toSafeNumber(r.conversions),
      0
    );
    const totalRev = rows.reduce((a, r) => a + toSafeNumber(r.revenue), 0);

    if (totalImpr <= 0) return "";
    if (!creativeAgg?.length) return "";

    const totalCtr = totalClicks > 0 ? totalClicks / totalImpr : 0;
    const totalCvr = totalClicks > 0 ? totalConv / totalClicks : 0;
    const totalCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const revPerClick = totalClicks > 0 ? totalRev / totalClicks : 0;

    const sortedByCtr = [...creativeAgg].sort((a, b) => b.ctr - a.ctr);
    const topN = sortedByCtr.slice(0, Math.min(10, sortedByCtr.length));
    const bottomN = sortedByCtr.slice(-Math.min(10, sortedByCtr.length));

    const sum = (arr: CreativeAgg[], key: keyof CreativeAgg) =>
      arr.reduce((acc, cur) => acc + toSafeNumber(cur[key] as any), 0);

    const topImpr = sum(topN, "impressions");
    const topClicksSum = sum(topN, "clicks");
    const bottomImpr = sum(bottomN, "impressions");
    const bottomClicksSum = sum(bottomN, "clicks");

    const topCtr = topImpr > 0 ? topClicksSum / topImpr : 0;
    const bottomCtr = bottomImpr > 0 ? bottomClicksSum / bottomImpr : 0;

    const expectedBottomClicks = bottomImpr * totalCtr;
    const deltaClicks = Math.max(0, expectedBottomClicks - bottomClicksSum);

    const expectedDeltaConv = deltaClicks * totalCvr;
    const expectedDeltaRev = deltaClicks * revPerClick;
    const expectedDeltaCost = deltaClicks * totalCpc;

    const topClickShare = totalClicks > 0 ? topClicksSum / totalClicks : 0;

    return [
      `- 현재 CTR은 ${formatPercentFromRate(
        totalCtr,
        2
      )}입니다. CTR 상위 소재(Top10)의 CTR은 ${formatPercentFromRate(
        topCtr,
        2
      )}이며, 전체 클릭의 ${formatPercentFromRate(
        topClickShare,
        1
      )}를 만들고 있습니다.`,
      `- CTR 하위 소재(하위10)의 CTR은 ${formatPercentFromRate(
        bottomCtr,
        2
      )}입니다. 하위10의 노출을 유지한 채 CTR이 평균(${formatPercentFromRate(
        totalCtr,
        2
      )}) 수준만 회복해도 클릭이 약 ${formatCount(deltaClicks)} 증가할 수 있습니다.`,
      `- 동일 CVR·매출/클릭이 유지된다고 가정하면, 추가 전환 약 ${formatCount(
        expectedDeltaConv
      )}건 / 추가 매출 약 ${KRW(expectedDeltaRev)} 기대(추가비용 약 ${KRW(
        expectedDeltaCost
      )})입니다.`,
      `- 실행 제안: (1) 첫 프레임/썸네일 대비 강화 (2) 헤드라인 1문장 명확화 (3) CTA 버튼/문구 선명화 3가지를 우선 A/B 테스트하세요.`,
    ].join("\n");
  }, [rows, creativeAgg]);

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
                margin={{ top: 6, right: 22, left: 6, bottom: 6 }}
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
      </div>

      <section className="mt-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 font-semibold">요약 인사이트</div>

          {creativeInsightText ? (
            <div className="whitespace-pre-wrap text-sm text-gray-800">
              {creativeInsightText}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              소재 데이터가 없어 인사이트를 생성할 수 없습니다.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 font-semibold">선택 소재</div>

          {!selectedCreative ? (
            <div className="text-sm text-gray-500">
              차트/표에서 소재를 클릭하면 이미지가 표시됩니다.
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="text-center text-sm font-semibold">
                {selectedCreative.creative}
              </div>

              {selectedCreative.imagePath ? (
                <div className="flex w-full justify-center">
                  <img
                    src={selectedCreative.imagePath}
                    alt={selectedCreative.creative}
                    className="max-h-[360px] w-full max-w-[680px] rounded-xl bg-white object-contain"
                  />
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  imagePath가 없어 이미지를 표시할 수 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

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

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.conversions)}
                        max={maxConv}
                        label={formatCount(r.conversions)}
                      />
                    </td>

                    <td className="p-3 text-right">
                      {formatPercentFromRate(r.cvr, 2)}
                    </td>
                    <td className="p-3 text-right">{KRW(r.cpa)}</td>

                    <td className="p-3">
                      <DataBarCell
                        value={toSafeNumber(r.revenue)}
                        max={maxRev}
                        label={KRW(r.revenue)}
                      />
                    </td>

                    <td className="p-3 text-right">
                      {formatPercentFromRoas(r.roas, 1)}
                    </td>
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
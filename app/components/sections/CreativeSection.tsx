"use client";

import { useMemo, useState } from "react";
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

import { KRW, formatNumber } from "../../lib/report/format";
import DataBarCell from "../DataBarCell";

// ✅ 소재 집계 유틸 (너가 만든 것)
// - groupByCreative(rows): creative별 합계(+ imagePath 포함)
// ⚠️ buildCreativeFilters / filterByCampaignGroup 는 이제 안 씀
import { groupByCreative } from "../../lib/report/creative";

type Props = {
  rows: any[]; // ✅ (월/주/기기/채널)까지 적용된 rows를 page.tsx에서 넘겨주기
};

// ===== 숫자/비율 안전 유틸 =====
const toNum = (v: any) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const toRate01 = (v: any) => {
  const n = toNum(v);
  return n > 1 ? n / 100 : n;
};

const toRoas01 = (v: any) => {
  const n = toNum(v);
  return n > 10 ? n / 100 : n;
};

const pctText = (rate01: number, digits = 1) => `${(rate01 * 100).toFixed(digits)}%`;

function fmtComma(n: any) {
  const v = toNum(n);
  return Math.round(v).toLocaleString();
}

function fmtRoasPct(roas01: any) {
  const v = toRoas01(roas01);
  return `${(v * 100).toFixed(1)}%`;
}

const short = (s: any, n = 7) => {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

type CreativeAgg = {
  creative: string;
  imagePath?: string;
  impressions: number;
  clicks: number;
  ctr: number; // 0~1
  cpc: number;
  cost: number;
  conversions: number;
  cvr: number; // 0~1
  cpa: number;
  revenue: number;
  roas: number; // 0~1 (1.15 = 115%)
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
  // =========================
  // ✅ 소스 필터 옵션 만들기
  // =========================
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) {
      const s = String(r.source ?? r.platform ?? "").trim();
      if (s) set.add(s);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "ko"))];
  }, [rows]);

  const [selectedSource, setSelectedSource] = useState<string | "all">("all");

  // =========================
  // ✅ 소스 필터 적용
  // =========================
  const scopedRows = useMemo(() => {
    if (selectedSource === "all") return rows ?? [];
    return (rows ?? []).filter((r) => {
      const s = String(r.source ?? r.platform ?? "").trim();
      return s === selectedSource;
    });
  }, [rows, selectedSource]);

  // =========================
  // ✅ creativeAgg 만들기
  // =========================
  const creativeAgg: CreativeAgg[] = useMemo(() => {
    const rawAgg = groupByCreative(scopedRows);

    return (rawAgg ?? []).map((r: any) => {
      const impressions = toNum(r.impressions ?? r.impr);
      const clicks = toNum(r.clicks);
      const cost = toNum(r.cost);
      const conversions = toNum(r.conversions ?? r.conv);
      const revenue = toNum(r.revenue);

      const ctr = toRate01(r.ctr ?? (impressions > 0 ? clicks / impressions : 0));
      const cvr = toRate01(r.cvr ?? (clicks > 0 ? conversions / clicks : 0));
      const cpc = toNum(r.cpc ?? (clicks > 0 ? cost / clicks : 0));
      const cpa = toNum(r.cpa ?? (conversions > 0 ? cost / conversions : 0));
      const roas = toRoas01(r.roas ?? (cost > 0 ? revenue / cost : 0));

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
  }, [scopedRows]);

  // =========================
  // ✅ Top20 차트 데이터
  // =========================
  const topClicks = useMemo(
    () => [...creativeAgg].sort((a, b) => b.clicks - a.clicks).slice(0, 20).reverse(),
    [creativeAgg]
  );
  const topConv = useMemo(
    () => [...creativeAgg].sort((a, b) => b.conversions - a.conversions).slice(0, 20).reverse(),
    [creativeAgg]
  );
  const topRoas = useMemo(
    () => [...creativeAgg].sort((a, b) => b.roas - a.roas).slice(0, 20).reverse(),
    [creativeAgg]
  );

  // =========================
  // ✅ 표 정렬
  // =========================
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

  const tableRows = useMemo(() => {
    const sorted = [...creativeAgg].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "creative") return dir * a.creative.localeCompare(b.creative, "ko");
      const av = (a as any)[sortKey] as number;
      const bv = (b as any)[sortKey] as number;
      return dir * (toNum(av) - toNum(bv));
    });

    return sorted.slice(0, 50);
  }, [creativeAgg, sortKey, sortDir]);

  // =========================
  // ✅ 막대 max (표 50개 기준)
  // =========================
  const maxImpr = useMemo(() => Math.max(0, ...tableRows.map((r) => toNum(r.impressions))), [tableRows]);
  const maxClicks = useMemo(() => Math.max(0, ...tableRows.map((r) => toNum(r.clicks))), [tableRows]);
  const maxCost = useMemo(() => Math.max(0, ...tableRows.map((r) => toNum(r.cost))), [tableRows]);
  const maxConv = useMemo(() => Math.max(0, ...tableRows.map((r) => toNum(r.conversions))), [tableRows]);
  const maxRev = useMemo(() => Math.max(0, ...tableRows.map((r) => toNum(r.revenue))), [tableRows]);

  // =========================
  // ✅ 선택 소재 프리뷰
  // =========================
  const [selectedCreative, setSelectedCreative] = useState<CreativeAgg | null>(null);

  // =========================
  // ✅ CTR 중심 요약 인사이트 자동 생성
  // =========================
  const creativeInsightText = useMemo(() => {
    if (!scopedRows?.length) return "";

    const totalImpr = scopedRows.reduce((a, r) => a + toNum(r.impressions), 0);
    const totalClicks = scopedRows.reduce((a, r) => a + toNum(r.clicks), 0);
    const totalCost = scopedRows.reduce((a, r) => a + toNum(r.cost), 0);
    const totalConv = scopedRows.reduce((a, r) => a + toNum(r.conversions), 0);
    const totalRev = scopedRows.reduce((a, r) => a + toNum(r.revenue), 0);

    if (totalImpr <= 0) return "";

    const totalCtr = totalClicks > 0 ? totalClicks / totalImpr : 0;
    const totalCvr = totalClicks > 0 ? totalConv / totalClicks : 0;
    const totalCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const revPerClick = totalClicks > 0 ? totalRev / totalClicks : 0;

    if (!creativeAgg?.length) return "";

    const sortedByCtr = [...creativeAgg].sort((a, b) => b.ctr - a.ctr);
    const topN = sortedByCtr.slice(0, Math.min(10, sortedByCtr.length));
    const bottomN = sortedByCtr.slice(-Math.min(10, sortedByCtr.length));

    const sum = (arr: CreativeAgg[], key: keyof CreativeAgg) =>
      arr.reduce((acc, cur) => acc + toNum(cur[key] as any), 0);

    const topImpr = sum(topN, "impressions");
    const topClicks = sum(topN, "clicks");
    const bottomImpr = sum(bottomN, "impressions");
    const bottomClicks = sum(bottomN, "clicks");

    const topCtr = topImpr > 0 ? topClicks / topImpr : 0;
    const bottomCtr = bottomImpr > 0 ? bottomClicks / bottomImpr : 0;

    // 하위가 “전체 평균 CTR”까지 회복 가정
    const expectedBottomClicks = bottomImpr * totalCtr;
    const deltaClicks = Math.max(0, expectedBottomClicks - bottomClicks);

    const expectedDeltaConv = deltaClicks * totalCvr;
    const expectedDeltaRev = deltaClicks * revPerClick;
    const expectedDeltaCost = deltaClicks * totalCpc;

    const topClickShare = totalClicks > 0 ? topClicks / totalClicks : 0;

    return [
      `- 현재(선택 소스: ${selectedSource === "all" ? "전체" : selectedSource}) CTR은 ${pctText(
        totalCtr,
        2
      )}입니다. CTR 상위 소재(Top10)의 CTR은 ${pctText(topCtr, 2)}이며, 전체 클릭의 ${(
        topClickShare * 100
      ).toFixed(1)}%를 만들고 있습니다.`,
      `- CTR 하위 소재(하위10)의 CTR은 ${pctText(bottomCtr, 2)}입니다. 하위10의 노출을 유지한 채 CTR이 평균(${pctText(
        totalCtr,
        2
      )}) 수준만 회복해도 클릭이 약 ${fmtComma(deltaClicks)} 증가할 수 있습니다.`,
      `- 동일 CVR·매출/클릭이 유지된다고 가정하면, 추가 전환 약 ${fmtComma(
        expectedDeltaConv
      )}건 / 추가 매출 약 ${KRW(expectedDeltaRev)} 기대(추가비용 약 ${KRW(expectedDeltaCost)})입니다.`,
      `- 실행 제안: (1) 첫 프레임/썸네일 대비 강화 (2) 헤드라인 1문장 명확화 (3) CTA 버튼/문구 선명화 3가지를 우선 A/B 테스트하세요.`,
    ].join("\n");
  }, [scopedRows, creativeAgg, selectedSource]);

  return (
    <section className="mt-1">
      <div className="mb-0.5">
        <h2 className="text-xl font-semibold">소재 현황</h2>
      </div>

      {/* ✅ 소스 필터만 */}
      <div className="flex flex-wrap gap-2 items-center my-4">
        <div className="text-sm text-gray-600 mr-2">소스</div>
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-white"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value as any)}
        >
          {sourceOptions.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "전체" : s}
            </option>
          ))}
        </select>
      </div>

      {/* ✅ 3개 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 클릭수 */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-2">클릭수 TOP20 소재</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={topClicks} layout="vertical" margin={{ top: 6, right: 18, left: 6, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(toNum(v))} />
                <YAxis
                  type="category"
                  dataKey="creative"
                  width={78}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => short(v, 7)}
                />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => fmtComma(v)} />
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
                    formatter={(v: any) => fmtComma(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 전환수 */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-2">전환수 TOP20 소재</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={topConv} layout="vertical" margin={{ top: 6, right: 18, left: 6, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(toNum(v))} />
                <YAxis
                  type="category"
                  dataKey="creative"
                  width={78}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => short(v, 7)}
                />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => fmtComma(v)} />
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
                    formatter={(v: any) => fmtComma(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ROAS */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-2">ROAS TOP20 소재</div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={topRoas} layout="vertical" margin={{ top: 6, right: 22, left: 6, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtRoasPct(v)} />
                <YAxis
                  type="category"
                  dataKey="creative"
                  width={78}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => short(v, 7)}
                />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => fmtRoasPct(v)} />
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
                    formatter={(v: any) => fmtRoasPct(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }}
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

          {creativeInsightText ? (
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{creativeInsightText}</div>
          ) : (
            <div className="text-sm text-gray-500">소재 데이터가 없어 인사이트를 생성할 수 없습니다.</div>
          )}
        </div>
      </section>

      {/* ✅ 선택 소재 프리뷰 */}
      <section className="mt-6">
        <div className="border rounded-xl p-4 bg-white">
          <div className="font-semibold mb-3">선택 소재</div>

          {!selectedCreative ? (
            <div className="text-sm text-gray-500">차트/표에서 소재를 클릭하면 이미지가 표시됩니다.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div>
                <div className="text-sm font-semibold mb-2">{selectedCreative.creative}</div>

                {selectedCreative.imagePath ? (
                  <img
                    src={selectedCreative.imagePath}
                    alt={selectedCreative.creative}
                    className="w-full rounded-xl border"
                  />
                ) : (
                  <div className="text-sm text-gray-500">imagePath가 없어 이미지를 표시할 수 없습니다.</div>
                )}
              </div>

              <div className="text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-gray-500">Impr</div>
                  <div className="text-right">{fmtComma(selectedCreative.impressions)}</div>

                  <div className="text-gray-500">Clicks</div>
                  <div className="text-right">{fmtComma(selectedCreative.clicks)}</div>

                  <div className="text-gray-500">CTR</div>
                  <div className="text-right">{pctText(selectedCreative.ctr, 2)}</div>

                  <div className="text-gray-500">Cost</div>
                  <div className="text-right">{KRW(selectedCreative.cost)}</div>

                  <div className="text-gray-500">Conv</div>
                  <div className="text-right">{fmtComma(selectedCreative.conversions)}</div>

                  <div className="text-gray-500">CPA</div>
                  <div className="text-right">{KRW(selectedCreative.cpa)}</div>

                  <div className="text-gray-500">Revenue</div>
                  <div className="text-right">{KRW(selectedCreative.revenue)}</div>

                  <div className="text-gray-500">ROAS</div>
                  <div className="text-right">{pctText(selectedCreative.roas, 1)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ✅ 소재 요약표 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">소재 요약</h2>

        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 text-gray-600">
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
                <tr className="border-t">
                  <td className="p-3 text-gray-500" colSpan={11}>
                    표시할 소재 데이터가 없습니다. (creative 컬럼을 확인해 주세요)
                  </td>
                </tr>
              ) : (
                tableRows.map((r, idx) => (
                  <tr
                    key={`${r.creative}-${idx}`}
                    className="border-t hover:bg-orange-50 cursor-pointer"
                    onClick={() => setSelectedCreative(r)}
                  >
                    <td className="p-3 font-medium whitespace-nowrap text-left">{r.creative || "(empty)"}</td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.impressions)} max={maxImpr} label={fmtComma(r.impressions)} />
                    </td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.clicks)} max={maxClicks} label={fmtComma(r.clicks)} />
                    </td>

                    <td className="p-3 text-right">{pctText(r.ctr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpc)}</td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.cost)} max={maxCost} label={KRW(r.cost)} />
                    </td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.conversions)} max={maxConv} label={fmtComma(r.conversions)} />
                    </td>

                    <td className="p-3 text-right">{pctText(r.cvr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpa)}</td>

                    <td className="p-3">
                      <DataBarCell value={toNum(r.revenue)} max={maxRev} label={KRW(r.revenue)} />
                    </td>

                    <td className="p-3 text-right">{pctText(r.roas, 1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          * 표는 선택한 정렬 기준으로 Top50 소재입니다. (월/주/기기/채널 + 소스 필터 조건에 따라 변경)
        </div>
      </section>
    </section>
  );
}
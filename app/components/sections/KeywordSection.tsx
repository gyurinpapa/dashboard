"use client";

import { useMemo } from "react";
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

const pctText = (rate01: number, digits = 1) => `${(rate01 * 100).toFixed(digits)}%`;

function fmtComma(n: any) {
  const v = toNum(n);
  return Math.round(v).toLocaleString();
}
function fmtRoasPct(roas01: any) {
  const v = toRoas01(roas01);
  return `${(v * 100).toFixed(1)}%`;
}

export default function KeywordSection({ keywordAgg, keywordInsight }: Props) {
  // ===== keywordAgg normalize (표/차트 공용) =====
  const rows = useMemo(() => {
    return (Array.isArray(keywordAgg) ? keywordAgg : []).map((r: any) => {
      const keyword = String(r.keyword ?? r.label ?? r.name ?? "");

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
      };
    });
  }, [keywordAgg]);

  // ===== 차트 Top20 =====
  const topClicks = useMemo(
    () => [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 20).reverse(),
    [rows]
  );
  const topConv = useMemo(
    () => [...rows].sort((a, b) => b.conversions - a.conversions).slice(0, 20).reverse(),
    [rows]
  );
  const topRoas = useMemo(
    () => [...rows].sort((a, b) => b.roas - a.roas).slice(0, 20).reverse(),
    [rows]
  );

  // ===== 표(Structure 탭 캠페인 요약표 느낌): 클릭순 Top50 =====
  const tableRows = useMemo(() => {
    return [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 50);
  }, [rows]);

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
                <YAxis type="category" dataKey="keyword" width={100} tick={{ fontSize: 11 }} />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => fmtComma(v)} />
                <Bar dataKey="clicks">
                  {/* ✅ 검은 배경 라벨 제거: LabelList만 사용(숫자만) */}
                  <LabelList
                    dataKey="clicks"
                    position="right"
                    formatter={(v: any) => fmtComma(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }} // ✅ 주황
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
                <YAxis type="category" dataKey="keyword" width={100} tick={{ fontSize: 11 }} />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => fmtComma(v)} />
                <Bar dataKey="conversions">
                  <LabelList
                    dataKey="conversions"
                    position="right"
                    formatter={(v: any) => fmtComma(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }} // ✅ 주황
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
                <YAxis type="category" dataKey="keyword" width={100} tick={{ fontSize: 11 }} />
                <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v: any) => fmtRoasPct(v)} />
                <Bar dataKey="roas">
                  <LabelList
                    dataKey="roas"
                    position="right"
                    formatter={(v: any) => fmtRoasPct(v)}
                    style={{ fontSize: 11, fontWeight: 700, fill: "#F97316" }} // ✅ 주황
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ✅ 인사이트 요약 (Structure 탭 스타일로) */}
      <section className="mt-6">
        <div className="border rounded-xl p-6 bg-white">
          <div className="font-semibold mb-3">요약 인사이트</div>
          {keywordInsight ? (
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{keywordInsight}</div>
          ) : (
            <div className="text-sm text-gray-500">키워드 데이터가 없어 인사이트를 생성할 수 없습니다.</div>
          )}
        </div>
      </section>

      {/* ✅ 키워드 요약표 (Structure 탭 ‘캠페인 요약’ 표 스타일과 동일 톤) */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3">키워드 요약</h2>

        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-3">Keyword</th>
                <th className="text-right p-3">Impr</th>
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">CTR</th>
                <th className="text-right p-3">CPC</th>
                <th className="text-right p-3">Cost</th>
                <th className="text-right p-3">Conv</th>
                <th className="text-right p-3">CVR</th>
                <th className="text-right p-3">CPA</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-right p-3">ROAS</th>
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
                    <td className="p-3 font-medium whitespace-nowrap">{r.keyword || "(empty)"}</td>
                    <td className="p-3 text-right">{fmtComma(r.impressions)}</td>
                    <td className="p-3 text-right">{fmtComma(r.clicks)}</td>
                    <td className="p-3 text-right">{pctText(r.ctr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpc)}</td>
                    <td className="p-3 text-right">{KRW(r.cost)}</td>
                    <td className="p-3 text-right">{fmtComma(r.conversions)}</td>
                    <td className="p-3 text-right">{pctText(r.cvr, 2)}</td>
                    <td className="p-3 text-right">{KRW(r.cpa)}</td>
                    <td className="p-3 text-right">{KRW(r.revenue)}</td>
                    <td className="p-3 text-right">{pctText(r.roas, 1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          * 표는 클릭수 기준 Top50 키워드입니다. (좌측 필터 조건에 따라 자동 변경)
        </div>
      </section>
    </section>
  );
}

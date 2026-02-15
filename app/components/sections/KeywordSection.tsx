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
import { formatNumber } from "../../lib/report/format";

type Props = {
  // ✅ 필터 prop 없음 (요청사항)
  keywordAgg: any[];

  // ✅ 새로 추가: 인사이트 텍스트
  keywordInsight?: string;
};

// ---------- format helpers ----------
function fmtComma(n: any) {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString();
}
function fmtRoasPct(roas01: any) {
  const v = Number(roas01) || 0; // 1.15 -> 115%
  return `${(v * 100).toFixed(1)}%`;
}

export default function KeywordSection({ keywordAgg, keywordInsight }: Props) {
  // ===== keywordAgg normalize =====
  const rows = useMemo(() => {
    return (keywordAgg || []).map((r: any) => ({
      keyword: String(r.keyword ?? r.label ?? r.name ?? ""),
      clicks: Number(r.clicks ?? 0),
      conversions: Number(r.conversions ?? r.conv ?? 0),
      roas: Number(r.roas ?? 0),
    }));
  }, [keywordAgg]);

  // Top 20 + 가로차트는 아래→위가 보기 좋아서 reverse()
  const topClicks = useMemo(
    () => [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, 20).reverse(),
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
    () => [...rows].sort((a, b) => b.roas - a.roas).slice(0, 20).reverse(),
    [rows]
  );

  return (
    <section className="mt-1">
      {/* 타이틀 */}
      <div className="mb-0.5">
        <h2 className="text-xl font-semibold">키워드 현황</h2>
        <div className="text-sm text-gray-500 mt-1">
          좌측(월/주차/기기/채널) 필터가 적용된 키워드 TOP20입니다.
        </div>
      </div>

      {/* 3개 차트: 한 줄 3개 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 클릭수 */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-3">클릭수 TOP20 키워드</div>
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
                  tickFormatter={(v) => formatNumber(Number(v) || 0)}
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
                    style={{ fill: "#ff8a00", fontSize: 11, fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 전환수 */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-3">전환수 TOP20 키워드</div>
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
                  tickFormatter={(v) => formatNumber(Number(v) || 0)}
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
                    style={{ fill: "#ff8a00", fontSize: 11, fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ROAS */}
        <div className="border rounded-2xl p-3 bg-white">
          <div className="text-xs font-semibold mb-3">ROAS TOP20 키워드</div>
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
                  tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
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
                    style={{ fill: "#ff8a00", fontSize: 11, fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ✅ 인사이트 (구조탭 “요약 인사이트”와 동일 마크업/스타일로 맞춤) */}
      {keywordInsight ? (
        <div className="mt-8 rounded-2xl border border-neutral-300 bg-neutral-50 p-6">
          <div className="border rounded-xl p-4 bg-white">
             <h3 className="text-base font-semibold text-neutral-800">요약 인사이트 </h3>
             <div className="mt-3 whitespace-pre-line text-sm text-neutral-700 leading-relaxed">
              {keywordInsight}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

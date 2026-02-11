"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type TabKey = "summary" | "structure" | "keyword";

type Row = {
  date: string;
  source: string;
  impression: number;
  click: number;
  cost: number;
  conversion: number;
  revenue: number;
  campaign?: string;
};

function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

function KRW(n: number) {
  return Math.round(n).toLocaleString() + "원";
}

const TrendCell = ({ v, digits = 1 }: { v: number | null; digits?: number }) => {
  if (v === null || !isFinite(v)) return <span className="text-gray-400">-</span>;

  const up = v > 0;
  const down = v < 0;

  const arrow = up ? "▲" : down ? "▼" : "•";
  const color = up ? "text-red-600" : down ? "text-blue-600" : "text-gray-500";

  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${color}`}>
      <span className="text-xs">{arrow}</span>
      <span>{(v * 100).toFixed(digits)}%</span>
    </span>
  );
};

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<TabKey>("summary");

  useEffect(() => {
    fetch("/data/acc_001.csv")
      .then((res) => res.text())
      .then((csv) => {
        const parsed = Papa.parse<Row>(csv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        setRows(parsed.data);
      });
  }, []);

  const totals = useMemo(() => {
    const sum = (key: keyof Row) =>
      rows.reduce((acc, cur) => acc + (Number(cur[key]) || 0), 0);

    const impressions = sum("impressions");
    const clicks = sum("clicks");
    const cost = sum("cost");
    const conversions = sum("conversions");
    const revenue = sum("revenue");

    return {
      impressions,
      clicks,
      cost,
      conversions,
      revenue,
      ctr: safeDiv(clicks, impressions),
      cpc: safeDiv(cost, clicks),
      cvr: safeDiv(conversions, clicks),
      cpa: safeDiv(cost, conversions),
      roas: safeDiv(revenue, cost),
    };
  }, [rows]);

  const bySource = useMemo(() => {
  // group key: platform 우선, 없으면 soucrce/source도 fallback
  const keyOf = (r: any) =>
    String(r.platform ?? r.soucrce ?? r.source ?? "unknown").toLowerCase();

  const map = new Map<
    string,
    {
      source: string;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      revenue: number;
    }
  >();

  for (const r of rows as any[]) {
    const k = keyOf(r);

    const impressions = Number(r.impressions ?? r.impression ?? 0) || 0;
    const clicks = Number(r.clicks ?? r.click ?? 0) || 0;
    const cost = Number(r.cost ?? 0) || 0;
    const conversions = Number(r.conversions ?? r.conversion ?? 0) || 0;
    const revenue = Number(r.revenue ?? 0) || 0;

    const cur =
      map.get(k) ??
      { source: k, impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 };

    cur.impressions += impressions;
    cur.clicks += clicks;
    cur.cost += cost;
    cur.conversions += conversions;
    cur.revenue += revenue;

    map.set(k, cur);
  }

  const arr = Array.from(map.values());
  // 비용 큰 순으로 정렬(원하면 바꿔도 됨)
  arr.sort((a, b) => b.cost - a.cost);

  return arr.filter((r) => r.source !== "unknown").map((r) => ({
    ...r,
    ctr: safeDiv(r.clicks, r.impressions),
    cpc: safeDiv(r.cost, r.clicks),
    cvr: safeDiv(r.conversions, r.clicks),
    cpa: safeDiv(r.cost, r.conversions),
    roas: safeDiv(r.revenue, r.cost),
  }));
}, [rows]);

function parseDateLoose(s: any): Date | null {
  if (!s) return null;
  // "2022.4.26" 같은 포맷 대응
  const str = String(s).trim();
  const normalized = str.replace(/\./g, "-"); // 2022-4-26
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun ... 6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday 기준
  x.setDate(x.getDate() + diff);
  return x;
}

function fmtMMDD(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${m}.${dd}`;
}
function week1StartOfMonth(year: number, monthIndex0: number) {
  const firstDay = new Date(year, monthIndex0, 1);
  firstDay.setHours(0, 0, 0, 0);

  const dow = firstDay.getDay(); // 0=일 ... 6=토
  const includeFirstWeek = dow >= 1 && dow <= 4; // 월~목
  const firstWeekStart = startOfWeekMonday(firstDay);

  const ws = new Date(firstWeekStart);
  if (!includeFirstWeek) ws.setDate(ws.getDate() + 7);
  return ws;
}

function monthWeekLabelRule(ws: Date) {
  const y = ws.getFullYear();
  const m = ws.getMonth();

  const candidates = [
    { year: y, month: m },
    { year: m === 0 ? y - 1 : y, month: m === 0 ? 11 : m - 1 },
  ];

  for (const c of candidates) {
    const start = week1StartOfMonth(c.year, c.month);
    const nextMonthYear = c.month === 11 ? c.year + 1 : c.year;
    const nextMonth = c.month === 11 ? 0 : c.month + 1;
    const end = week1StartOfMonth(nextMonthYear, nextMonth);

    if (ws >= start && ws < end) {
      const diffDays = Math.floor((ws.getTime() - start.getTime()) / 86400000);
      const weekNo = Math.floor(diffDays / 7) + 1;
      return `${c.month + 1}월 ${weekNo}주차`;
    }
  }

  return `${m + 1}월`;
}


const byWeek = useMemo(() => {
  // 1) rows에서 날짜 파싱 가능한 것만
  const valid = (rows as any[])
    .map((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return null;
      return { ...r, __date: d };
    })
    .filter(Boolean) as any[];

  if (valid.length === 0) return [];

  // 2) 가장 최신 날짜 기준으로 "최근 5주" 범위 잡기
  const maxTime = Math.max(...valid.map((r) => r.__date.getTime()));
  const maxDate = new Date(maxTime);
  const latestWeekStart = startOfWeekMonday(maxDate);

  const weekStarts: Date[] = [];
  for (let i = 4; i >= 0; i--) {
    const ws = new Date(latestWeekStart);
    ws.setDate(ws.getDate() - i * 7);
    weekStarts.push(ws);
  }

  const key = (d: Date) => startOfWeekMonday(d).toISOString().slice(0, 10);

  const map = new Map<
    string,
    { weekKey: string; label: string; cost: number; revenue: number; roas: number }
  >();

  // 3) 5주 바스켓 미리 만들어 두기(누락 주도 0으로 표시)
  for (const ws of weekStarts) {
    const k = ws.toISOString().slice(0, 10);
    map.set(k, {
  weekKey: k,
  label: monthWeekLabelRule(ws),
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
});

  }

  // 4) 집계
  for (const r of valid) {
    const k = key(r.__date);
    if (!map.has(k)) continue; // 최근 5주 밖이면 무시

    const cur = map.get(k)!;
    cur.impressions += Number(r.impressions ?? 0) || 0;
    cur.clicks += Number(r.clicks ?? 0) || 0;
    cur.cost += Number(r.cost ?? 0) || 0;
    cur.conversions += Number(r.conversions ?? 0) || 0;
    cur.revenue += Number(r.revenue ?? 0) || 0;
    map.set(k, cur);
  }

  // 5) ROAS 계산 + 배열로 정렬
  const arr = Array.from(map.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey)); // 내림차순(최근 먼저)

return arr.map((w) => ({
  ...w,
  ctr: safeDiv(w.clicks, w.impressions),
  cpc: safeDiv(w.cost, w.clicks),
  cvr: safeDiv(w.conversions, w.clicks),
  cpa: safeDiv(w.cost, w.conversions),
  roas: safeDiv(w.revenue, w.cost),
}));


}, [rows]);
const lastWeek = byWeek[0];
const prevWeek = byWeek[1];

function diffPct(a: number, b: number) {
  if (!b) return 0;
  return (a - b) / b;
}


const byMonth = useMemo(() => {
  const map = new Map<
    string,
    {
      month: string; // YYYY-MM
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      revenue: number;
    }
  >();

  for (const r of rows as any[]) {
    const d = parseDateLoose(r.date);
    if (!d) continue;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    if (!map.has(key)) {
      map.set(key, {
        month: key,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        revenue: 0,
      });
    }

    const cur = map.get(key)!;
    const imp = Number((r.impressions ?? r.impression ?? 0));
    const clk = Number((r.clicks ?? r.click ?? 0));
    const cst = Number((r.cost ?? 0));
    const cv  = Number((r.conversions ?? r.conversion ?? 0));
    const rev = Number((r.revenue ?? 0));

    cur.impressions += isFinite(imp) ? imp : 0;
    cur.clicks += isFinite(clk) ? clk : 0;
    cur.cost += isFinite(cst) ? cst : 0;
    cur.conversions += isFinite(cv) ? cv : 0;
    cur.revenue += isFinite(rev) ? rev : 0;

  }

  // 최신 월이 위로 오게 정렬 후 최근 3개월만
  const arr = Array.from(map.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);

  return arr.map((m) => ({
    ...m,
    ctr: safeDiv(m.clicks, m.impressions),
    cpc: safeDiv(m.cost, m.clicks),
    cvr: safeDiv(m.conversions, m.clicks),
    cpa: safeDiv(m.cost, m.conversions),
    roas: safeDiv(m.revenue, m.cost),
  }));
}, [rows]);


  return (
  <main className="p-8">
    <div className="mx-auto w-full max-w-[1400px]">
      {/* 제목 */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          네이처컬렉션 온라인광고 보고서
        </h1>

        {/* 밑줄: 이 wrapper 폭을 100%로 먹음 */}
        <div className="mt-4 border-t border-gray-400"></div>
        <div className="mt-1 border-t border-gray-300"></div>
      </div>

<div className="mt-6 flex gap-2">
  <button
    onClick={() => setTab("summary")}
    className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
      tab === "summary" ? "bg-black text-white" : "bg-white"
    }`}
  >
    요약
  </button>
  <button
    onClick={() => setTab("structure")}
    className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
      tab === "structure" ? "bg-black text-white" : "bg-white"
    }`}
  >
    구조
  </button>
  <button
    onClick={() => setTab("keyword")}
    className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
      tab === "keyword" ? "bg-black text-white" : "bg-white"
    }`}
  >
    키워드
  </button>
</div>
{tab === "summary" && (
<>
 {/* KPI 그리드 */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      <KPI title="노출" value={totals.impressions.toLocaleString()} />
      <KPI title="클릭" value={totals.clicks.toLocaleString()} />
      <KPI title="CTR" value={(totals.ctr * 100).toFixed(2) + "%"} />
      <KPI title="CPC" value={KRW(totals.cpc)} />
      <KPI title="비용" value={KRW(totals.cost)} />

      <KPI title="전환수" value={totals.conversions.toLocaleString()} />
      <KPI title="CVR" value={(totals.cvr * 100).toFixed(2) + "%"} />
      <KPI title="전환매출" value={KRW(totals.revenue)} />
      <KPI title="CPA" value={KRW(totals.cpa)} />
      <KPI title="ROAS" value={(totals.roas * 100).toFixed(1) + "%"} />
    </div>

 {/* 월별 표 */}
    <section className="mt-10">
  <h2 className="text-lg font-semibold mb-3">월별 성과 (최근 3개월)</h2>

  <div className="overflow-auto border rounded-xl">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-3">Month</th>
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
        {/* ✅ 1행: 증감 (최근월 vs 전월) */}
        {byMonth.length >= 2 && (() => {
          const last = byMonth[0];   // 최근월
          const prev = byMonth[1];   // 전월

          const diff = (a: number, b: number) => a - b;
          const diffPct = (a: number, b: number) => (b === 0 ? null : (a - b) / b);

          const fmtPct = (x: number | null, digits = 1) =>
            x === null ? "-" : `${(x * 100).toFixed(digits)}%`;

          const fmtNum = (x: number) => Math.round(x).toLocaleString();
          const fmtKRW = (x: number) => `${Math.round(x).toLocaleString()}원`;

          return (
            <tr className="border-t bg-gray-100 font-semibold">
              <td className="p-3">증감 (최근월-전월)</td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.impressions, prev.impressions)} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.clicks, prev.clicks)} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.ctr, prev.ctr)} digits={2} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.cpc, prev.cpc)} digits={2} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.cost, prev.cost)} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.conversions, prev.conversions)} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.cvr, prev.cvr)} digits={2} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.cpa, prev.cpa)} digits={2} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.revenue, prev.revenue)} /></td>
          <td className="p-3 text-right"><TrendCell v={diffPct(last.roas, prev.roas)} digits={2} /></td>

            </tr>
          );
        })()}

        {/* ✅ 2~4행: 최근 3개월 */}
        {byMonth.map((m) => (
          <tr key={m.month} className="border-t">
            <td className="p-3 font-medium">{m.month}</td>

            <td className="p-3 text-right">{m.impressions.toLocaleString()}</td>
            <td className="p-3 text-right">{m.clicks.toLocaleString()}</td>

            <td className="p-3 text-right">{(m.ctr * 100).toFixed(2)}%</td>
            <td className="p-3 text-right">{KRW(m.cpc)}</td>

            <td className="p-3 text-right">{KRW(m.cost)}</td>
            <td className="p-3 text-right">{m.conversions.toLocaleString()}</td>

            <td className="p-3 text-right">{(m.cvr * 100).toFixed(2)}%</td>
            <td className="p-3 text-right">{KRW(m.cpa)}</td>

            <td className="p-3 text-right">{KRW(m.revenue)}</td>
            <td className="p-3 text-right">{(m.roas * 100).toFixed(1)}%</td>
  </tr>
))}

      </tbody>
    </table>
  </div>
</section>

 {/* 주간 표 */}
<section className="mt-10">
  <h2 className="text-lg font-semibold mb-3">
    주차별 성과 (최근 5주)
  </h2>

  <div className="overflow-auto border rounded-xl">
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left p-3">Week</th>
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
        {/* 🔥 증감 행 */}
        {lastWeek && prevWeek && (
          <tr className="bg-gray-100 font-medium">
            <td className="p-3">증감(최근주-전주)</td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.impressions, prevWeek.impressions)} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.clicks, prevWeek.clicks)} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.ctr, prevWeek.ctr)} digits={2} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.cpc, prevWeek.cpc)} digits={2} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.cost, prevWeek.cost)} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.conversions, prevWeek.conversions)} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.cvr, prevWeek.cvr)} digits={2} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.cpa, prevWeek.cpa)} digits={2} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.revenue, prevWeek.revenue)} />
            </td>
            <td className="p-3 text-right">
              <TrendCell v={diffPct(lastWeek.roas, prevWeek.roas)} digits={2} />
            </td>
          </tr>
        )}

        {/* 🔥 최근 5주 */}
        {byWeek.map((w) => (
          <tr key={w.weekKey} className="border-t">
            <td className="p-3 font-medium">{w.label}</td>
            <td className="p-3 text-right">{w.impressions.toLocaleString()}</td>
            <td className="p-3 text-right">{w.clicks.toLocaleString()}</td>
            <td className="p-3 text-right">{(w.ctr * 100).toFixed(2)}%</td>
            <td className="p-3 text-right">{KRW(w.cpc)}</td>
            <td className="p-3 text-right">{KRW(w.cost)}</td>
            <td className="p-3 text-right">{w.conversions.toLocaleString()}</td>
            <td className="p-3 text-right">{(w.cvr * 100).toFixed(2)}%</td>
            <td className="p-3 text-right">{KRW(w.cpa)}</td>
            <td className="p-3 text-right">{KRW(w.revenue)}</td>
            <td className="p-3 text-right">{(w.roas * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>

  {/* 주간 차트 */}
    <section className="mt-10">
  <h2 className="text-lg font-semibold mb-3">최근 5주 주간 성과</h2>

  {/* 가로 꽉 + 높이 (표의 1.5배 느낌으로 일단 420px 추천) */}
  <div className="w-full h-[420px] border rounded-xl p-4">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={byWeek} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis
  yAxisId="left"
  tick={{ fontSize: 10 }}   // ← 글씨 2단계 축소
  width={60}                // ← 숫자 여백 확보 (선택이지만 추천)
  tickFormatter={(v) => v.toLocaleString()} // ← 천단위 쉼표
/>

        <YAxis
  yAxisId="right"
  orientation="right"
  tick={{ fontSize: 10 }}                 // 글씨 2단계 ↓ 느낌 (기존 대비 작게)
  width={50}                               // 오른쪽 숫자 영역 확보(잘림 방지)
  tickFormatter={(v) => `${(Number(v) * 100).toFixed(1)}%`}  // ROAS를 %로
/>

        <Tooltip
  formatter={(value: any, name: any) => {
    if (name === "roas") return [`${(Number(value) * 100).toFixed(1)}%`, "ROAS"];
    if (name === "cost") return [KRW(Number(value)), "비용"];        // KRW가 이미 쉼표 처리중
    if (name === "revenue") return [KRW(Number(value)), "전환매출"]; // KRW가 이미 쉼표 처리중
    return [value, name];
  }}
/>

        <Legend />

        {/* 누적 세로형 막대(비용+전환매출) */}
        {/* 누적 막대: 비용(주황) + 전환매출(하늘) */}
<Bar
  yAxisId="left"
  dataKey="cost"
  stackId="a"
  name="비용"
  fill="#F59E0B"   // 주황
/>
<Bar
  yAxisId="left"
  dataKey="revenue"
  stackId="a"
  name="전환매출"
  fill="#38BDF8"   // 하늘색
/>

{/* ROAS 라인: 굵은 빨강 + 화살표 */}
<Line
  yAxisId="right"
  type="monotone"
  dataKey="roas"
  name="ROAS"
  stroke="#EF4444"     // 빨간색
  strokeWidth={3}      // 굵게
  dot={{
    stroke: "#EF4444",
    strokeWidth: 2,
    fill: "#EF4444",
    r: 5,
    // ▼ 화살표 느낌 (삼각형)
    // Recharts는 기본 dot shape를 SVG path로 대체 가능
    // 삼각형 포인트
    className: "roas-arrow-dot",
  }}
  activeDot={{
    r: 7,
  }}
/>

      </ComposedChart>
    </ResponsiveContainer>
  </div>
</section>

  {/* 소스별 표 */}
    <section className="mt-10">
  <h2 className="text-lg font-semibold mb-3">소스별 요약</h2>

  <div className="overflow-auto border rounded-xl">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="text-left p-3">Source</th>
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
        {bySource.map((r) => (
          <tr key={r.source} className="border-t">
            <td className="p-3 font-medium">{r.source}</td>
            <td className="p-3 text-right">{r.impressions.toLocaleString()}</td>
            <td className="p-3 text-right">{r.clicks.toLocaleString()}</td>
            <td className="p-3 text-right">{(r.ctr * 100).toFixed(2)}%</td>
            <td className="p-3 text-right">{KRW(r.cpc)}</td>
            <td className="p-3 text-right">{KRW(r.cost)}</td>
            <td className="p-3 text-right">{r.conversions.toLocaleString()}</td>
            <td className="p-3 text-right">{(r.cvr * 100).toFixed(2)}%</td>
            <td className="p-3 text-right">{KRW(r.cpa)}</td>
            <td className="p-3 text-right">{KRW(r.revenue)}</td>
            <td className="p-3 text-right">{(r.roas * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>
</>
)}

</div>
  </main>
);
}

function KPI({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl p-4 min-w-[160px]">
      <div className="text-sm text-gray-500 whitespace-nowrap">{title}</div>
      <div className="text-2xl font-bold mt-1 whitespace-nowrap">{value}</div>
    </div>
  );
}

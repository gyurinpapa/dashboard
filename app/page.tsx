"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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

/**
 * ✅ page.tsx (완성본)
 * - 월/주차/기기/채널 필터: 옵션 생성 + filteredRows 반영 + 월별표(byMonth) 기기/채널 반영
 * - 월/주차 드롭다운: dim(회색 느낌)만, 클릭은 항상 가능
 * - 기간 표시: 월 선택 시 월 범위, 주차 선택 시 해당 주(월~일) 범위
 * - 우측 상단 탭 아래에 [+VAT] 고정 표기
 */

type TabKey = "summary" | "structure" | "keyword";
type FilterKey = "month" | "week" | "device" | "channel" | null;
type MonthKey = "all" | string; // "YYYY-MM" or "all"
type WeekKey = "all" | string; // "YYYY-MM-DD"(weekStart Monday) or "all"
type DeviceKey = "all" | string;
type ChannelKey = "all" | string;

type Row = {
  date: string;
  platform?: string; // google/naver 등
  source?: string; // fallback
  soucrce?: string; // 오타 fallback
  device?: string;
  channel?: string;

  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;

  campaign_name?: string;
  group_name?: string;
  keyword?: string;
};

function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

function KRW(n: number) {
  return `₩${Math.round(n).toLocaleString()}`;
}

// =========================
// 숫자 포맷 유틸
// =========================
function formatNumber(n: number) {
  if (!n) return "";
  return n.toLocaleString();
}

function parseNumberInput(v: string) {
  if (!v) return 0;
  return Number(v.replace(/[^\d]/g, "")) || 0;
}

// =========================
// 목표 대비 진도율 계산
// =========================
function progressRate(actual: number, goal: number) {
  if (!goal) return 0;
  return actual / goal;
}

function parseDateLoose(s: any): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  const normalized = str.replace(/\./g, "-");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun ... 6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday 기준
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function monthKeyOfDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelOf(m: string) {
  return `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
}

// ✅ 네 룰 반영: "1일이 월~목이면 그 달 1주차 / 금~일이면 전월 마지막 주"
function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun, 1 Mon ...
  const diff = (day + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthWeekLabelRule(ws: Date) {
  const we = addDays(ws, 6);

  // 기본은 ws의 달
  let baseY = ws.getFullYear();
  let baseM = ws.getMonth();

  // 다음달 1일이 이번 주에 포함되고, 그 요일이 월~목이면 기준달을 다음달로
  const nextMonthFirst = new Date(ws.getFullYear(), ws.getMonth() + 1, 1);
  if (nextMonthFirst >= ws && nextMonthFirst <= we) {
    const dow = nextMonthFirst.getDay(); // 1~4 => Mon~Thu
    if (dow >= 1 && dow <= 4) {
      baseY = nextMonthFirst.getFullYear();
      baseM = nextMonthFirst.getMonth();
    }
  }

  // 기준달의 1일
  const monthFirst = new Date(baseY, baseM, 1);
  const monthFirstDow = monthFirst.getDay(); // 0 Sun

  const week1Start = startOfWeekMon(monthFirst);

  // 1일이 금/토/일이면 그 주는 전월 마지막 주 취급 => 1주차 시작은 다음주(다음 월요일)
  const effectiveWeek1Start =
    monthFirstDow === 5 || monthFirstDow === 6 || monthFirstDow === 0
      ? addDays(week1Start, 7)
      : week1Start;

  const diffWeeks = Math.floor(
    (startOfWeekMon(ws).getTime() - effectiveWeek1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  const weekNo = diffWeeks + 1;
  const safeWeekNo = weekNo < 1 ? 1 : weekNo;

  return `${baseY}년 ${baseM + 1}월 ${safeWeekNo}주차`;
}

function monthKeyFromWeekObj(w: any) {
  const m = String(w?.label || "").match(/(\d{4})년\s*(\d{1,2})월/);
  if (m) {
    const yy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    return `${yy}-${mm}`;
  }
  if (w?.weekKey && /^\d{4}-\d{2}-\d{2}/.test(w.weekKey)) return w.weekKey.slice(0, 7);
  return "";
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

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2 rounded-xl border text-sm font-semibold transition",
        "border-orange-900/40",
        active ? "bg-orange-700 text-white shadow" : "bg-orange-600 text-white/90 hover:bg-orange-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ✅ 선 그래프 마지막 점 → 화살표
const ArrowDot = (props: any) => {
  const { cx, cy, index, data } = props;
  if (!data || !Array.isArray(data)) return null;
  if (index !== data.length - 1) return null;

  return (
    <text x={cx} y={cy} dy={4} dx={8} fill="#ef4444" fontSize={20}>
      →
    </text>
  );
};

function KPI({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl p-4 min-w-[160px]">
      <div className="text-sm text-gray-500 whitespace-nowrap">{title}</div>
      <div className="text-2xl font-bold mt-1 whitespace-nowrap">{value}</div>
    </div>
  );
}

export default function Page() {
  // =========================
  // 1) STATE
  // =========================
  // =========================

  // 당월 목표 입력 (필터와 무관)
  // =========================
  const [monthlyGoal, setMonthlyGoal] = useState({
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<TabKey>("summary");

  const [filterKey, setFilterKey] = useState<FilterKey>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>("all");
  const [selectedWeek, setSelectedWeek] = useState<WeekKey>("all");
  const [selectedDevice, setSelectedDevice] = useState<DeviceKey>("all");
    // =========================
    // 1-1) 당월 목표(수기 입력) - 필터 영향 없음
    // =========================
    const [monthGoal, setMonthGoal] = useState<{
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      revenue: number;
    }>({
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      revenue: 0,
    });

  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>("all");

  const toggleFilter = (k: Exclude<FilterKey, null>) => {
    setFilterKey((prev) => (prev === k ? null : k));
  };

  // =========================
  // 2) LOAD CSV
  // =========================
  // CSV 키 정규화용 헬퍼
function getField(r: any, want: string) {
  const entries = Object.entries(r ?? {});
  const wantKey = want.toLowerCase();

  for (const [k, v] of entries) {
    const nk = String(k)
      .replace(/^\uFEFF/, "") // BOM 제거
      .trim()
      .toLowerCase();

    if (nk === wantKey) return v;
  }

  return undefined;
}

  useEffect(() => {
    fetch(`/data/acc_001.csv?ts=${Date.now()}`)
      .then((res) => res.text())
      .then((csv) => {
        const parsed = Papa.parse<Row>(csv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        console.log("CSV headers:", Object.keys((parsed.data?.[0] as any) ?? {}));


        // 안전 정규화 (필수 숫자 필드 보정 + source/device/channel 문자열 정규화)
        // ✅ LOAD CSV: 숫자 필드 정규화 + source 키 확정(soucrce 오타 흡수)
        const cleaned = (parsed.data || []).map((r: any) => {
          const sourceFixed = (r.source ?? r.soucrce ?? r.platform ?? "").toString().trim();

          return {
            ...r,
            // source 키를 확실히 만들어 둠 (표/집계는 무조건 r.source만 봄)
            source: sourceFixed,

            impressions: Number(r.impressions ?? r.impression ?? 0) || 0,
            clicks: Number(r.clicks ?? r.click ?? 0) || 0,
            cost: Number(r.cost ?? 0) || 0,
            conversions: Number(r.conversions ?? r.conversion ?? 0) || 0,
            revenue: Number(r.revenue ?? 0) || 0,
          };
        });

        setRows(cleaned);
      });
  }, []);

  // =========================
  // 3) OPTIONS (MONTH / WEEK / DEVICE / CHANNEL)
  // =========================
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const d = parseDateLoose(r.date);
      if (!d) continue;
      set.add(monthKeyOfDate(d));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const deviceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows as any[]) {
      const v = String(r.device ?? "").trim();
      if (!v) continue;
      set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const channelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows as any[]) {
      const v = String(r.channel ?? "").trim();
      if (!v) continue;
      set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const weekOptions = useMemo(() => {
    const scope =
      selectedMonth === "all"
        ? rows
        : rows.filter((r) => {
            const d = parseDateLoose(r.date);
            return d ? monthKeyOfDate(d) === selectedMonth : false;
          });

    const valid = (scope as any[])
      .map((r) => {
        const d = parseDateLoose(r.date);
        if (!d) return null;
        return { ...r, __date: d };
      })
      .filter(Boolean) as any[];

    if (!valid.length) return [];

    const weekKeySet = new Set<string>();
    for (const r of valid) {
      const wk = startOfWeekMonday(r.__date).toISOString().slice(0, 10);
      weekKeySet.add(wk);
    }

    let weekKeys = Array.from(weekKeySet).sort((a, b) => b.localeCompare(a));

    if (selectedMonth === "all") {
      weekKeys = weekKeys.slice(0, 5);
    }

    return weekKeys
      .map((wk) => {
        const ws = new Date(wk);
        return { weekKey: wk, label: monthWeekLabelRule(ws) };
      })
      .reverse();
  }, [rows, selectedMonth]);

  // =========================
  // 4) ENABLE SETS (dim logic) - "표시용"
  // =========================
  const selectedWeekMonthKey = useMemo(() => {
    if (selectedWeek === "all") return "";
    const w = weekOptions.find((x) => x.weekKey === selectedWeek);
    return w ? monthKeyFromWeekObj(w) : "";
  }, [selectedWeek, weekOptions]);

  const enabledWeekKeySet = useMemo(() => {
    const set = new Set<string>();

    weekOptions.forEach((w) => {
      const wk = w.weekKey;
      if (!wk) return;

      if (selectedMonth !== "all") {
        if (monthKeyFromWeekObj(w) === selectedMonth) set.add(wk);
        return;
      }

      if (selectedWeek !== "all") {
        if (monthKeyFromWeekObj(w) === selectedWeekMonthKey) set.add(wk);
        return;
      }

      set.add(wk);
    });

    return set;
  }, [weekOptions, selectedMonth, selectedWeek, selectedWeekMonthKey]);

  useEffect(() => {
    if (selectedWeek === "all") return;
    const exists = weekOptions.some((w) => w.weekKey === selectedWeek);
    if (!exists) setSelectedWeek("all");
  }, [selectedMonth, weekOptions, selectedWeek]);

  const enabledMonthKeySet = useMemo(() => {
    const set = new Set<string>();

    if (selectedMonth !== "all") {
      set.add(selectedMonth);
      return set;
    }

    if (selectedWeek !== "all" && selectedWeekMonthKey) {
      set.add(selectedWeekMonthKey);
      return set;
    }

    monthOptions.forEach((m) => set.add(m));
    return set;
  }, [monthOptions, selectedMonth, selectedWeek, selectedWeekMonthKey]);

  // =========================
  // 5) FILTERED ROWS (월/주차/기기/채널 실제 반영)
  // =========================
  const filteredRows = useMemo(() => {
    return (rows as any[]).filter((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return false;

      // 1) 월
      if (selectedMonth !== "all") {
        if (monthKeyOfDate(d) !== selectedMonth) return false;
      }

      // 2) 주차
      if (selectedWeek !== "all") {
        const wk = startOfWeekMonday(d).toISOString().slice(0, 10);
        if (wk !== selectedWeek) return false;
      }

      // 3) 기기
      if (selectedDevice !== "all") {
        if (String(r.device ?? "").trim() !== selectedDevice) return false;
      }

      // 4) 채널
      if (selectedChannel !== "all") {
        if (String(r.channel ?? "").trim() !== selectedChannel) return false;
      }

      return true;
    });
  }, [rows, selectedMonth, selectedWeek, selectedDevice, selectedChannel]);

  // =========================
  // 6) PERIOD TEXT (월 or 주)
  // =========================
  const periodText = useMemo(() => {
    if (!rows.length) return "";

    const fmt = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

    if (selectedWeek !== "all") {
      const ws = new Date(selectedWeek);
      if (!Number.isNaN(ws.getTime())) {
        const we = addDays(ws, 6);
        return `${fmt(ws)} ~ ${fmt(we)}`;
      }
    }

    if (selectedMonth !== "all") {
      const [yy, mm] = selectedMonth.split("-").map(Number);
      if (!yy || !mm) return "";
      const start = new Date(yy, mm - 1, 1);
      const end = new Date(yy, mm, 0);
      return `${fmt(start)} ~ ${fmt(end)}`;
    }

    const ds = rows.map((r) => parseDateLoose(r.date)).filter(Boolean) as Date[];
    if (!ds.length) return "";
    const min = new Date(Math.min(...ds.map((d) => d.getTime())));
    const max = new Date(Math.max(...ds.map((d) => d.getTime())));
    return `${fmt(min)} ~ ${fmt(max)}`;
  }, [rows, selectedMonth, selectedWeek]);

    // =========================
    // 6-1) 당월(데이터 기준 최신 월) 결과 - 필터 영향 없음
    // =========================
    const currentMonthKey = useMemo(() => {
      const ds = rows
        .map((r) => parseDateLoose(r.date))
        .filter(Boolean) as Date[];
      if (!ds.length) return "all";

      const max = new Date(Math.max(...ds.map((d) => d.getTime())));
      return monthKeyOfDate(max);
    }, [rows]);

    const currentMonthActual = useMemo(() => {
      const scope = (rows as any[]).filter((r) => {
        const d = parseDateLoose(r.date);
        if (!d) return false;
        return monthKeyOfDate(d) === currentMonthKey;
      });

      const sum = (key: keyof Row) =>
        scope.reduce((acc, cur) => acc + (Number((cur as any)[key]) || 0), 0);

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
    }, [rows, currentMonthKey]);

    const currentMonthGoalComputed = useMemo(() => {
      const impressions = Number(monthGoal.impressions) || 0;
      const clicks = Number(monthGoal.clicks) || 0;
      const cost = Number(monthGoal.cost) || 0;
      const conversions = Number(monthGoal.conversions) || 0;
      const revenue = Number(monthGoal.revenue) || 0;

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
    }, [monthGoal]);

  // =========================
  // 당월 실제 결과 (필터 무시)
  // =========================
  const currentMonthResult = useMemo(() => {
    if (!rows.length) return null;

    const now = new Date();
    const monthKey = monthKeyOfDate(now);

    const monthRows = rows.filter((r) => {
      const d = parseDateLoose(r.date);
      return d ? monthKeyOfDate(d) === monthKey : false;
    });

    const sum = (key: keyof Row) =>
      monthRows.reduce((acc, cur) => acc + (Number(cur[key]) || 0), 0);

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
    };
  }, [rows]);


  // =========================
  // 7) TOTALS (KPI)
  // =========================
  const totals = useMemo(() => {
    const sum = (key: keyof Row) => filteredRows.reduce((acc, cur) => acc + (Number(cur[key]) || 0), 0);

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
  }, [filteredRows]);

  // =========================
  // 8) BY SOURCE (표)
  // =========================
  const bySource = useMemo(() => {
    // ✅ source를 최우선으로 사용 (없으면 platform -> soucrce(오타) -> unknown)
    const keyOf = (r: any) =>
  (
    String(r.source ?? "").trim() ||
    String(r.platform ?? "").trim() ||
    "unknown"
  ).toLowerCase();

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

    for (const r of filteredRows as any[]) {
      const k = keyOf(r);

      const cur =
        map.get(k) ??
        ({ source: k, impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 } as const);

      cur.impressions += Number(r.impressions ?? 0) || 0;
      cur.clicks += Number(r.clicks ?? 0) || 0;
      cur.cost += Number(r.cost ?? 0) || 0;
      cur.conversions += Number(r.conversions ?? 0) || 0;
      cur.revenue += Number(r.revenue ?? 0) || 0;

      map.set(k, { ...cur });
    }

    const arr = Array.from(map.values())
      .sort((a, b) => b.cost - a.cost);

    return arr.map((r) => ({
      ...r,
      ctr: safeDiv(r.clicks, r.impressions),
      cpc: safeDiv(r.cost, r.clicks),
      cvr: safeDiv(r.conversions, r.clicks),
      cpa: safeDiv(r.cost, r.conversions),
      roas: safeDiv(r.revenue, r.cost),
    }));
  }, [filteredRows]);


  // =========================
  // 9) BY WEEK (표 + 차트) - "필터 반영" 기준
  // =========================
  const byWeek = useMemo(() => {
    const valid = (filteredRows as any[])
      .map((r) => {
        const d = parseDateLoose(r.date);
        if (!d) return null;
        return { ...r, __date: d };
      })
      .filter(Boolean) as any[];

    if (!valid.length) return [];

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
      { weekKey: string; label: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number }
    >();

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

    for (const r of valid) {
      const k = key(r.__date);
      if (!map.has(k)) continue;

      const cur = map.get(k)!;
      cur.impressions += Number(r.impressions ?? 0) || 0;
      cur.clicks += Number(r.clicks ?? 0) || 0;
      cur.cost += Number(r.cost ?? 0) || 0;
      cur.conversions += Number(r.conversions ?? 0) || 0;
      cur.revenue += Number(r.revenue ?? 0) || 0;
      map.set(k, cur);
    }

    const arr = Array.from(map.values()).sort((a, b) => b.weekKey.localeCompare(a.weekKey));

    return arr.map((w) => ({
      ...w,
      ctr: safeDiv(w.clicks, w.impressions),
      cpc: safeDiv(w.cost, w.clicks),
      cvr: safeDiv(w.conversions, w.clicks),
      cpa: safeDiv(w.cost, w.conversions),
      roas: safeDiv(w.revenue, w.cost),
    }));
  }, [filteredRows]);

  const byWeekOnly = useMemo(() => byWeek.filter((w: any) => String(w.label).includes("주차")), [byWeek]);
  const byWeekChart = useMemo(() => [...byWeekOnly].reverse(), [byWeekOnly]);

  const lastWeek = byWeekOnly[0];
  const prevWeek = byWeekOnly[1];

  function diffPct(a: number, b: number) {
    if (!b) return 0;
    return (a - b) / b;
  }

  // =========================
  // 10) BY MONTH (최근 3개월 + 증감)
  //    ✅ 월별 표는 "기기/채널" 필터는 반영
  //    ✅ 월/주차 필터는 월별표 의미가 깨지므로 제외(집계 모수로만)
  // =========================
  const monthScopeRows = useMemo(() => {
    const base = (rows as any[]).filter((r) => {
      if (selectedDevice !== "all") {
        if (String(r.device ?? "").trim() !== selectedDevice) return false;
      }
      if (selectedChannel !== "all") {
        if (String(r.channel ?? "").trim() !== selectedChannel) return false;
      }
      return true;
    });

    if (selectedMonth === "all") return base;

    const [yy, mm] = selectedMonth.split("-").map(Number);
    const start = new Date(yy, mm - 1 - 2, 1);
    const end = new Date(yy, mm, 1);

    return base.filter((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return false;
      return d >= start && d < end;
    });
  }, [rows, selectedMonth, selectedDevice, selectedChannel]);

  const byMonth = useMemo(() => {
    const map = new Map<
      string,
      { month: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number }
    >();

    for (const r of monthScopeRows as any[]) {
      const d = parseDateLoose(r.date);
      if (!d) continue;

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      if (!map.has(key)) {
        map.set(key, { month: key, impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
      }

      const cur = map.get(key)!;
      cur.impressions += Number(r.impressions ?? 0) || 0;
      cur.clicks += Number(r.clicks ?? 0) || 0;
      cur.cost += Number(r.cost ?? 0) || 0;
      cur.conversions += Number(r.conversions ?? 0) || 0;
      cur.revenue += Number(r.revenue ?? 0) || 0;
    }

    const arr = Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);

    return arr.map((m) => ({
      ...m,
      ctr: safeDiv(m.clicks, m.impressions),
      cpc: safeDiv(m.cost, m.clicks),
      cvr: safeDiv(m.conversions, m.clicks),
      cpa: safeDiv(m.cost, m.conversions),
      roas: safeDiv(m.revenue, m.cost),
    }));
  }, [monthScopeRows]);

  // =========================
  // UI
  // =========================
  return (
    <main className="p-8">
      <div className="mx-auto w-full max-w-[1400px]">
        {/* 제목 */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">네이처컬렉션 온라인광고 보고서</h1>
          <div className="mt-4 border-t border-gray-400" />
          <div className="mt-1 border-t border-gray-300" />
        </div>

        {/* 상단: 필터 + 탭 */}
        <div className="flex items-start justify-between mb-8">
          {/* LEFT: Filters */}
          <div className="relative inline-block">
            <div className="flex gap-2">
              <FilterBtn active={filterKey === "month"} onClick={() => toggleFilter("month")}>
                월
              </FilterBtn>
              <FilterBtn active={filterKey === "week"} onClick={() => toggleFilter("week")}>
                주차
              </FilterBtn>
              <FilterBtn active={filterKey === "device"} onClick={() => toggleFilter("device")}>
                기기
              </FilterBtn>
              <FilterBtn active={filterKey === "channel"} onClick={() => toggleFilter("channel")}>
                채널
              </FilterBtn>
            </div>

            {/* 기간 */}
            {periodText && (
              <div className="mt-3 mb-2 text-sm text-gray-600">
                기간: <span className="font-semibold text-gray-900">{periodText}</span>
              </div>
            )}

            {/* 월 패널 */}
            {filterKey === "month" && (
              <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth("all");
                      setFilterKey(null);
                    }}
                    className={[
                      "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                      selectedMonth === "all"
                        ? "bg-orange-700 text-white border-orange-700"
                        : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                    ].join(" ")}
                  >
                    전체
                  </button>

                  {monthOptions.map((m) => {
                    const dim = !enabledMonthKeySet.has(m);

                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setSelectedMonth(m);
                          setFilterKey(null);
                        }}
                        className={[
                          "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                          selectedMonth === m
                            ? "bg-orange-700 text-white border-orange-700"
                            : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                          dim ? "opacity-40" : "",
                        ].join(" ")}
                      >
                        {monthLabelOf(m)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 주차 패널 */}
            {filterKey === "week" && (
              <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWeek("all");
                      setFilterKey(null);
                    }}
                    className={[
                      "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                      selectedWeek === "all"
                        ? "bg-orange-700 text-white border-orange-700"
                        : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                    ].join(" ")}
                  >
                    전체
                  </button>

                  {weekOptions.map((w) => {
                    const wk = w.weekKey;
                    const dim = !enabledWeekKeySet.has(wk);

                    return (
                      <button
                        key={wk}
                        type="button"
                        onClick={() => {
                          setSelectedWeek(wk);
                          setFilterKey(null);
                        }}
                        className={[
                          "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                          selectedWeek === wk
                            ? "bg-orange-700 text-white border-orange-700"
                            : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                          dim ? "opacity-40" : "",
                        ].join(" ")}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 기기 패널 */}
            {filterKey === "device" && (
              <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDevice("all");
                      setFilterKey(null);
                    }}
                    className={[
                      "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                      selectedDevice === "all"
                        ? "bg-orange-700 text-white border-orange-700"
                        : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                    ].join(" ")}
                  >
                    전체
                  </button>

                  {deviceOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setSelectedDevice(d);
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedDevice === d
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 채널 패널 */}
            {filterKey === "channel" && (
              <div className="absolute left-0 top-full mt-2 z-50 w-[520px] rounded-xl border bg-white shadow-lg p-3">
                <div className="flex flex-wrap gap-2 max-h-[220px] overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChannel("all");
                      setFilterKey(null);
                    }}
                    className={[
                      "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                      selectedChannel === "all"
                        ? "bg-orange-700 text-white border-orange-700"
                        : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                    ].join(" ")}
                  >
                    전체
                  </button>

                  {channelOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedChannel(c);
                        setFilterKey(null);
                      }}
                      className={[
                        "px-3 py-1 rounded-lg border text-sm font-semibold transition",
                        selectedChannel === c
                          ? "bg-orange-700 text-white border-orange-700"
                          : "bg-white text-orange-700 border-orange-300 hover:bg-orange-50",
                      ].join(" ")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Tabs + VAT */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTab("summary")}
                className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                  tab === "summary"
                    ? "bg-black text-white border-black"
                    : "bg-white text-black border-gray-300 hover:bg-gray-100"
                }`}
              >
                요약
              </button>

              <button
                type="button"
                onClick={() => setTab("structure")}
                className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                  tab === "structure"
                    ? "bg-black text-white border-black"
                    : "bg-white text-black border-gray-300 hover:bg-gray-100"
                }`}
              >
                구조
              </button>

              <button
                type="button"
                onClick={() => setTab("keyword")}
                className={`px-5 py-2 rounded-xl border text-sm font-semibold transition ${
                  tab === "keyword"
                    ? "bg-black text-white border-black"
                    : "bg-white text-black border-gray-300 hover:bg-gray-100"
                }`}
              >
                키워드
              </button>
            </div>

            <div className="text-sm text-gray-600">[+VAT]</div>
          </div>
        </div>

        {/* TAB: SUMMARY */}
        {tab === "summary" && (
          <>
              {/* =========================
                당월 목표/결과/진도율 (필터 영향 없음)
               ========================= */}
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">당월 목표/결과/진도율</h2>

              <div className="text-sm text-gray-600 mb-2">
                기준 월: <span className="font-semibold text-gray-900">{currentMonthKey}</span>
              </div>

              <div className="overflow-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left p-3">KPI</th>
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
                    {/* 1) 목표(수기입력) */}
                    <tr className="border-t">
                      <td className="p-3 font-medium">목표(수기입력)</td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[140px] text-right border rounded-md px-2 py-1"
                          value={formatNumber(monthGoal.impressions)}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              impressions: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[140px] text-right border rounded-md px-2 py-1"
                          value={formatNumber(monthGoal.clicks)}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              clicks: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">{(currentMonthGoalComputed.ctr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthGoalComputed.cpc)}</td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[160px] text-right border rounded-md px-2 py-1"
                          value={monthGoal.cost ? KRW(monthGoal.cost) : ""}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              cost: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[140px] text-right border rounded-md px-2 py-1"
                          value={formatNumber(monthGoal.conversions)}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              conversions: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">{(currentMonthGoalComputed.cvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthGoalComputed.cpa)}</td>

                      <td className="p-3 text-right">
                        <input
                          type="text"
                          className="w-[160px] text-right border rounded-md px-2 py-1"
                          value={monthGoal.revenue ? KRW(monthGoal.revenue) : ""}
                          onChange={(e) =>
                            setMonthGoal((p) => ({
                              ...p,
                              revenue: parseNumberInput(e.target.value),
                            }))
                          }
                        />
                      </td>

                      <td className="p-3 text-right">{(currentMonthGoalComputed.roas * 100).toFixed(1)}%</td>
                    </tr>

                    {/* 2) 결과 */}
                    <tr className="border-t">
                      <td className="p-3 font-medium">결과</td>
                      <td className="p-3 text-right">{currentMonthActual.impressions.toLocaleString()}</td>
                      <td className="p-3 text-right">{currentMonthActual.clicks.toLocaleString()}</td>
                      <td className="p-3 text-right">{(currentMonthActual.ctr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.cpc)}</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.cost)}</td>
                      <td className="p-3 text-right">{currentMonthActual.conversions.toLocaleString()}</td>
                      <td className="p-3 text-right">{(currentMonthActual.cvr * 100).toFixed(2)}%</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.cpa)}</td>
                      <td className="p-3 text-right">{KRW(currentMonthActual.revenue)}</td>
                      <td className="p-3 text-right">{(currentMonthActual.roas * 100).toFixed(1)}%</td>
                    </tr>

                    {/* 3) 달성율 */}
                    <tr className="border-t bg-gray-100 font-semibold">
                      <td className="p-3">달성율</td>

                      <td className="p-3 text-right">{(progressRate(currentMonthActual.impressions, currentMonthGoalComputed.impressions) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.clicks, currentMonthGoalComputed.clicks) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.ctr, currentMonthGoalComputed.ctr) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.cpc, currentMonthGoalComputed.cpc) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.cost, currentMonthGoalComputed.cost) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.conversions, currentMonthGoalComputed.conversions) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.cvr, currentMonthGoalComputed.cvr) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.cpa, currentMonthGoalComputed.cpa) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.revenue, currentMonthGoalComputed.revenue) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-right">{(progressRate(currentMonthActual.roas, currentMonthGoalComputed.roas) * 100).toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 🔥 기간 성과 제목 */}
            <div className="mt-10 mb-3">
              <h2 className="text-lg font-semibold">기간 성과</h2>
            </div>

            {/* KPI */}
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
                    {byMonth.length >= 2 &&
                      (() => {
                        const last = byMonth[0];
                        const prev = byMonth[1];

                        return (
                          <tr className="border-t bg-gray-100 font-semibold">
                            <td className="p-3">증감 (최근월-전월)</td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.impressions, prev.impressions)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.clicks, prev.clicks)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.ctr, prev.ctr)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cpc, prev.cpc)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cost, prev.cost)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.conversions, prev.conversions)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cvr, prev.cvr)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.cpa, prev.cpa)} digits={2} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.revenue, prev.revenue)} />
                            </td>
                            <td className="p-3 text-right">
                              <TrendCell v={diffPct(last.roas, prev.roas)} digits={2} />
                            </td>
                          </tr>
                        );
                      })()}

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
              <h2 className="text-lg font-semibold mb-3">주차별 성과 (최근 5주)</h2>

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

                    {byWeekOnly.map((w: any) => (
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

              <div className="w-full h-[420px] border rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={byWeekChart} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10 }}
                      width={70}
                      tickFormatter={(v: any) => Number(v).toLocaleString()}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10 }}
                      width={60}
                      tickFormatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`}
                    />

                    <Tooltip
                      formatter={(value: any, name: any, item: any) => {
                        const key = item?.dataKey ?? name;
                        if (key === "roas") return [`${(Number(value) * 100).toFixed(1)}%`, "ROAS"];
                        if (key === "cost") return [`${KRW(Number(value))}`, "비용"];
                        if (key === "revenue") return [`${KRW(Number(value))}`, "전환매출"];
                        return [value, name];
                      }}
                    />
                    <Legend />

                    <Bar yAxisId="left" dataKey="cost" stackId="a" name="비용" fill="#F59E0B" />
                    <Bar yAxisId="left" dataKey="revenue" stackId="a" name="전환매출" fill="#38BDF8" />

                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="roas"
                      name="ROAS"
                      stroke="#EF4444"
                      strokeWidth={3}
                      dot={(props) => <ArrowDot {...props} data={byWeekChart} />}
                      activeDot={{ r: 7 }}
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
                    {bySource.map((r: any) => (
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

        {/* TAB: STRUCTURE / KEYWORD (placeholder) */}
        {tab === "structure" && <div className="mt-10 border rounded-xl p-6 text-gray-600">구조 탭(준비중)</div>}
        {tab === "keyword" && <div className="mt-10 border rounded-xl p-6 text-gray-600">키워드 탭(준비중)</div>}
      </div>
    </main>
  );
}

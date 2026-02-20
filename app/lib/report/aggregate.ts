import type { Row } from "./types";
import { safeDiv } from "./format";
import {
  parseDateLoose,
  monthKeyOfDate,
  startOfWeekMonday,
  toYMDLocal,
  addDays,
  monthWeekLabelRule,
} from "./date";

export function normalizeCsvRows(raw: any[]): Row[] {
  return (raw || []).map((r: any) => {
    const sourceFixed = (r.source ?? r.soucrce ?? r.platform ?? "").toString().trim();

    const avgRankRaw = r.rank ?? r.avgRank ?? r["avg.rank"] ?? null;
    const avgRank =
      avgRankRaw == null || avgRankRaw === ""
        ? undefined
        : Number(String(avgRankRaw).replace(/[^\d.\-]/g, ""));

    return {
      ...r,
      source: sourceFixed,
      impressions: Number(r.impressions ?? r.impression ?? 0) || 0,
      clicks: Number(r.clicks ?? r.click ?? 0) || 0,
      cost: Number(r.cost ?? 0) || 0,
      conversions: Number(r.conversions ?? r.conversion ?? 0) || 0,
      revenue: Number(r.revenue ?? 0) || 0,

      // ✅ CSV의 rank를 KeywordDetail에서 쓰는 avgRank로 통일
      avgRank: Number.isFinite(avgRank as any) ? (avgRank as number) : undefined,
    } as Row;
  });
}

export function summarize(rows: Row[]) {
  const sum = (key: keyof Row) => rows.reduce((acc, cur) => acc + (Number(cur[key]) || 0), 0);

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
}

export function buildOptions(rows: Row[]) {
  const monthSet = new Set<string>();
  const deviceSet = new Set<string>();
  const channelSet = new Set<string>();

  for (const r of rows) {
    const d = parseDateLoose(r.date);
    if (d) monthSet.add(monthKeyOfDate(d));

    const dv = String(r.device ?? "").trim();
    if (dv) deviceSet.add(dv);

    const cv = String(r.channel ?? "").trim();
    if (cv) channelSet.add(cv);
  }

  return {
    monthOptions: Array.from(monthSet).sort((a, b) => b.localeCompare(a)),
    deviceOptions: Array.from(deviceSet).sort((a, b) => a.localeCompare(b)),
    channelOptions: Array.from(channelSet).sort((a, b) => a.localeCompare(b)),
  };
}

export function buildWeekOptions(rows: Row[], selectedMonth: string | "all") {
  const scope =
    selectedMonth === "all"
      ? rows
      : rows.filter((r) => {
          const d = parseDateLoose(r.date);
          return d ? monthKeyOfDate(d) === selectedMonth : false;
        });

  const valid = scope
    .map((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return null;
      return { r, d };
    })
    .filter(Boolean) as { r: Row; d: Date }[];

  if (!valid.length) return [];

  const weekKeySet = new Set<string>();
  for (const x of valid) weekKeySet.add(toYMDLocal(startOfWeekMonday(x.d)));

  let weekKeys = Array.from(weekKeySet).sort((a, b) => b.localeCompare(a));
  if (selectedMonth === "all") weekKeys = weekKeys.slice(0, 5);

  return weekKeys
    .map((wk) => {
      const ws = new Date(wk + "T00:00:00");
      return { weekKey: wk, label: monthWeekLabelRule(ws) };
    })
    .reverse();
}

export function filterRows(args: {
  rows: Row[];
  selectedMonth: string | "all";
  selectedWeek: string | "all";
  selectedDevice: string | "all";
  selectedChannel: string | "all";
}) {
  const { rows, selectedMonth, selectedWeek, selectedDevice, selectedChannel } = args;

  return rows.filter((r) => {
    const d = parseDateLoose(r.date);
    if (!d) return false;

    if (selectedMonth !== "all" && monthKeyOfDate(d) !== selectedMonth) return false;

    if (selectedWeek !== "all") {
      const wk = toYMDLocal(startOfWeekMonday(d));
      if (wk !== selectedWeek) return false;
    }

    if (selectedDevice !== "all") {
      if (String(r.device ?? "").trim() !== selectedDevice) return false;
    }

    if (selectedChannel !== "all") {
      if (String(r.channel ?? "").trim() !== selectedChannel) return false;
    }

    return true;
  });
}

export function groupBySource(rows: Row[]) {
  const keyOf = (r: Row) =>
    (String(r.source ?? "").trim() || String(r.platform ?? "").trim() || "unknown").toLowerCase();

  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = map.get(k) ?? [];
    cur.push(r);
    map.set(k, cur);
  }

  return Array.from(map.entries())
    .map(([source, list]) => ({ source, ...summarize(list) }))
    .sort((a, b) => b.cost - a.cost);
}

export function groupByDevice(rows: Row[]) {
  const keyOf = (r: Row) => (String(r.device ?? "").trim() || "unknown").toLowerCase();

  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = map.get(k) ?? [];
    cur.push(r);
    map.set(k, cur);
  }

  return Array.from(map.entries())
    .map(([device, list]) => ({ device, ...summarize(list) }))
    .sort((a, b) => b.cost - a.cost);
}

export function groupByWeekRecent5(filteredRows: Row[]) {
  const valid = filteredRows
    .map((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return null;
      return { r, d };
    })
    .filter(Boolean) as { r: Row; d: Date }[];

  if (!valid.length) return [];

  const maxTime = Math.max(...valid.map((x) => x.d.getTime()));
  const maxDate = new Date(maxTime);
  const latestWeekStart = startOfWeekMonday(maxDate);

  const weekStarts: Date[] = [];
  for (let i = 4; i >= 0; i--) {
    const ws = new Date(latestWeekStart);
    ws.setDate(ws.getDate() - i * 7);
    ws.setHours(0, 0, 0, 0);
    weekStarts.push(ws);
  }

  const map = new Map<string, { weekKey: string; label: string; rows: Row[] }>();

  for (const ws of weekStarts) {
    const k = toYMDLocal(ws);
    map.set(k, { weekKey: k, label: monthWeekLabelRule(ws), rows: [] });
  }

  for (const x of valid) {
    const k = toYMDLocal(startOfWeekMonday(x.d));
    const bucket = map.get(k);
    if (!bucket) continue;
    bucket.rows.push(x.r);
  }

  return Array.from(map.values())
    .map((w) => ({ weekKey: w.weekKey, label: w.label, ...summarize(w.rows) }))
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

export function groupByMonthRecent3(args: {
  rows: Row[];
  selectedMonth: string | "all";
  selectedDevice: string | "all";
  selectedChannel: string | "all";
}) {
  const { rows, selectedMonth, selectedDevice, selectedChannel } = args;

  const base = rows.filter((r) => {
    if (selectedDevice !== "all" && String(r.device ?? "").trim() !== selectedDevice) return false;
    if (selectedChannel !== "all" && String(r.channel ?? "").trim() !== selectedChannel) return false;
    return true;
  });

  let scope = base;

  if (selectedMonth !== "all") {
    const [yy, mm] = selectedMonth.split("-").map(Number);
    const start = new Date(yy, mm - 1 - 2, 1);
    const end = new Date(yy, mm, 1);
    scope = base.filter((r) => {
      const d = parseDateLoose(r.date);
      if (!d) return false;
      return d >= start && d < end;
    });
  }

  const map = new Map<string, Row[]>();
  for (const r of scope) {
    const d = parseDateLoose(r.date);
    if (!d) continue;
    const mk = monthKeyOfDate(d);
    const cur = map.get(mk) ?? [];
    cur.push(r);
    map.set(mk, cur);
  }

  return Array.from(map.entries())
    .map(([month, list]) => ({ month, ...summarize(list) }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);
}

export function getCurrentMonthKeyByData(rows: Row[]) {
  const ds = rows.map((r) => parseDateLoose(r.date)).filter(Boolean) as Date[];
  if (!ds.length) return "all";
  const max = new Date(Math.max(...ds.map((d) => d.getTime())));
  return monthKeyOfDate(max);
}

export function diffPct(a: number, b: number) {
  if (!b) return 0;
  return (a - b) / b;
}

export function periodText(args: { rows: Row[]; selectedMonth: string | "all"; selectedWeek: string | "all" }) {
  const { rows, selectedMonth, selectedWeek } = args;
  if (!rows.length) return "";

  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  if (selectedWeek !== "all") {
    const ws = new Date(selectedWeek + "T00:00:00");
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
}

export function groupByCampaign(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const r of rows ?? []) {
    const key = String((r as any).campaign_name ?? "").trim();
    if (!key) continue;

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const out = Array.from(map.entries()).map(([campaign, items]) => ({
    campaign,
    ...summarize(items),
  }));

  out.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  return out;
}

export function groupByGroup(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const r of rows ?? []) {
    const key = String((r as any).group_name ?? "").trim() || "미지정";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const result = Array.from(map.entries()).map(([group, items]) => ({
    group,
    ...summarize(items),
  }));

  return result.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}

// ✅ groupByKeyword는 이제 app/lib/report/keyword.ts 로 분리해서 관리
// (중복 export/라우팅 빌드 꼬임 방지)

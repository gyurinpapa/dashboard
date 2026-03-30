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

function toNum(v: any): number {
  if (v == null) return 0;

  if (typeof v === "number") {
    return Number.isFinite(v) ? v : 0;
  }

  const cleaned = String(v)
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return 0;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function asStr(v: any) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  if (s.toLowerCase() === "undefined") return "";
  return s;
}

function firstStr(...values: any[]) {
  for (const v of values) {
    const s = asStr(v);
    if (s) return s;
  }
  return "";
}

function firstNum(...values: any[]) {
  for (const v of values) {
    const n = toNum(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return toNum(values[0]);
}

export type DailySummaryRow = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cvr: number;
  cpa: number;
  roas: number;
};

export function normalizeSource(v: any): string {
  const s = asStr(v).toLowerCase();
  if (!s) return "";

  if (s.includes("naver") || s.includes("네이버") || s.includes("nvr")) {
    return "naver";
  }

  if (
    s.includes("google") ||
    s.includes("gdn") ||
    s.includes("adwords") ||
    s.includes("youtube")
  ) {
    return "google";
  }

  if (s.includes("kakao") || s.includes("카카오") || s.includes("daum")) {
    return "kakao";
  }

  if (
    s.includes("facebook") ||
    s.includes("meta") ||
    s.includes("instagram") ||
    s.includes("fb")
  ) {
    return "meta";
  }

  return s;
}

export function getRowSource(row: any): string {
  const candidates = [
    row?.source,
    row?.media_source,
    row?.platform,
    row?.publisher,
    row?.site_source,
    row?.inventory_source,
  ];

  for (const v of candidates) {
    const s = String(v ?? "").trim();
    if (s) return normalizeSource(s);
  }

  return "";
}

function getImagePathAny(r: any) {
  return (
    asStr(r?.imagePath) ||
    asStr(r?.imagepath) ||
    asStr(r?.image_path) ||
    asStr(r?.image_url) ||
    asStr(r?.imageUrl) ||
    ""
  );
}

function getImageRawAny(r: any) {
  return asStr(r?.imagepath_raw) || asStr(r?.image_raw) || "";
}

function getCreativeFileAny(r: any) {
  return (
    asStr(r?.creative_file) ||
    asStr(r?.creativeFile) ||
    asStr(r?.creative_file_path) ||
    ""
  );
}

function hasCreativeInfo(r: any) {
  return (
    !!asStr(r?.creative) ||
    !!getImagePathAny(r) ||
    !!getImageRawAny(r) ||
    !!getCreativeFileAny(r)
  );
}

function pickRepresentativeRow(list: any[]) {
  if (!list?.length) return null;
  const found = list.find((r) => hasCreativeInfo(r));
  return found ?? list[0];
}

function attachRepresentativeFields(out: any, rep: any) {
  if (!rep) return out;

  const repId = rep?.__row_id ?? rep?.id ?? undefined;

  const imagePath = getImagePathAny(rep);
  const imageRaw = getImageRawAny(rep);
  const creativeFile = getCreativeFileAny(rep);
  const creative = asStr(rep?.creative);

  return {
    ...out,

    id: out?.id ?? repId,
    __row_id: out?.__row_id ?? repId,

    creative: asStr(out?.creative) ? out.creative : creative,
    creative_file: asStr(out?.creative_file) ? out.creative_file : creativeFile,
    creativeFile: asStr(out?.creativeFile) ? out.creativeFile : creativeFile,

    imagePath: asStr(out?.imagePath) ? out.imagePath : imagePath,
    imagepath: asStr(out?.imagepath) ? out.imagepath : imagePath,
    image_path: asStr(out?.image_path) ? out.image_path : imagePath,
    imagepath_raw: asStr(out?.imagepath_raw) ? out.imagepath_raw : imageRaw,
  };
}

export function normalizeCsvRows(rawRows: any[]) {
  return (rawRows ?? []).map((row) => {
    const base: any = { ...(row ?? {}) };

    const date = firstStr(
      base.date,
      base.report_date,
      base.day,
      base.ymd,
      base.dt,
      base.segment_date,
      base.stat_date,
      base.period_start,
      base.start_date,
      base.date_start,
      base["날짜"],
      base["일자"],
      base["집계일"]
    );

    const channel = firstStr(
      base.channel,
      base.ad_channel,
      base.media,
      base.media_type
    );

    const source = normalizeSource(
      firstStr(
        base.source,
        base.site_source,
        base.publisher,
        base.inventory_source
      )
    );

    const platform = firstStr(
      base.platform,
      base.media_source,
      base.ad_platform,
      base.account_type
    );

    const campaign_name = firstStr(
      base.campaign_name,
      base.campaignName,
      base.campaign,
      base.campaign_nm
    );

    const group_name = firstStr(
      base.group_name,
      base.groupName,
      base.adgroup_name,
      base.ad_group,
      base.group,
      base.group_nm
    );

    const keyword = firstStr(
      base.keyword,
      base.keyword_name,
      base.search_term,
      base.term
    );

    const creative = firstStr(base.creative, base.creative_name, base.asset_name);

    const imagepath = firstStr(
      base.imagepath,
      base.imagePath,
      base.image_path,
      base.image_url,
      base.imageUrl
    );

    const imagepath_raw = firstStr(base.imagepath_raw, base.image_raw, imagepath);

    const creative_file = firstStr(
      base.creative_file,
      base.creativeFile,
      base.creative_file_path,
      base.file_name,
      base.filename
    );

    const device = firstStr(base.device, base.device_type);

    return {
      ...base,

      id: base.id ?? base.__row_id ?? undefined,
      __row_id: base.__row_id ?? base.id ?? undefined,

      account_id: firstStr(base.account_id, base.accountId),
      channel,
      source,
      platform,
      campaign_name,
      group_name,
      keyword,
      creative,
      imagePath: firstStr(base.imagePath, imagepath),
      imagepath,
      image_path: firstStr(base.image_path, imagepath),
      imagepath_raw,
      creative_file,
      creativeFile: firstStr(base.creativeFile, creative_file),
      device,

      date,
      report_date: firstStr(base.report_date, date),
      day: firstStr(base.day, date),
      ymd: firstStr(base.ymd, date),

      impressions: firstNum(base.impressions, base.impr, base.views),
      clicks: firstNum(base.clicks, base.click, base.clk),
      cost: firstNum(base.cost, base.spend, base.ad_cost, base.amount),
      conversions: firstNum(base.conversions, base.conv, base.cv),
      revenue: firstNum(base.revenue, base.sales, base.purchase_amount, base.gmv),

      rank: toNum(base.rank),
    };
  });
}

export function summarize(rows: Row[]) {
  const sum = (key: keyof Row) =>
    (rows ?? []).reduce((acc, cur) => acc + (Number((cur as any)[key]) || 0), 0);

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

export function buildDailySummaryRows(rows: Row[]): DailySummaryRow[] {
  const map = new Map<string, Row[]>();

  for (const r of rows ?? []) {
    const d = parseDateLoose(
      (r as any)?.date ??
        (r as any)?.report_date ??
        (r as any)?.day ??
        (r as any)?.ymd ??
        (r as any)?.dt ??
        (r as any)?.segment_date ??
        (r as any)?.stat_date
    );
    if (!d) continue;

    const date = toYMDLocal(d);
    const cur = map.get(date) ?? [];
    cur.push(r);
    map.set(date, cur);
  }

  return Array.from(map.entries())
    .map(([date, list]) => ({
      date,
      ...summarize(list),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildOptions(rows: Row[]) {
  const monthSet = new Set<string>();
  const deviceSet = new Set<string>();
  const channelSet = new Set<string>();
  const sourceSet = new Set<string>();

  for (const raw of rows ?? []) {
    const r: any = raw ?? {};
    const d = parseDateLoose(
      r.date ??
        r.report_date ??
        r.day ??
        r.ymd ??
        r.dt ??
        r.segment_date ??
        r.stat_date
    );
    if (d) monthSet.add(monthKeyOfDate(d));

    const dv = asStr(r.device ?? r.device_type);
    if (dv) deviceSet.add(dv);

    const cv = asStr(r.channel ?? r.media ?? r.ad_channel);
    if (cv) channelSet.add(cv);

    const sv = getRowSource(r);
    if (sv) sourceSet.add(sv);
  }

  return {
    monthOptions: Array.from(monthSet).sort((a, b) => b.localeCompare(a)),
    deviceOptions: Array.from(deviceSet).sort((a, b) => a.localeCompare(b)),
    channelOptions: Array.from(channelSet).sort((a, b) => a.localeCompare(b)),
    sourceOptions: Array.from(sourceSet).sort((a, b) => a.localeCompare(b)),
  };
}

export function buildWeekOptions(rows: Row[], selectedMonth: string | "all") {
  const scope =
    selectedMonth === "all"
      ? rows
      : (rows ?? []).filter((r) => {
          const d = parseDateLoose(
            (r as any)?.date ??
              (r as any)?.report_date ??
              (r as any)?.day ??
              (r as any)?.ymd ??
              (r as any)?.dt
          );
          return d ? monthKeyOfDate(d) === selectedMonth : false;
        });

  const valid = (scope ?? [])
    .map((r) => {
      const d = parseDateLoose(
        (r as any)?.date ??
          (r as any)?.report_date ??
          (r as any)?.day ??
          (r as any)?.ymd ??
          (r as any)?.dt
      );
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
  selectedSource?: string | "all";
}) {
  const {
    rows,
    selectedMonth,
    selectedWeek,
    selectedDevice,
    selectedChannel,
    selectedSource = "all",
  } = args;

  return (rows ?? []).filter((r: any) => {
    const d = parseDateLoose(
      r?.date ??
        r?.report_date ??
        r?.day ??
        r?.ymd ??
        r?.dt ??
        r?.segment_date ??
        r?.stat_date
    );
    if (!d) return false;

    if (selectedMonth !== "all" && monthKeyOfDate(d) !== selectedMonth)
      return false;

    if (selectedWeek !== "all") {
      const wk = toYMDLocal(startOfWeekMonday(d));
      if (wk !== selectedWeek) return false;
    }

    if (selectedDevice !== "all") {
      if (asStr(r?.device ?? r?.device_type) !== selectedDevice) return false;
    }

    if (selectedChannel !== "all") {
      if (asStr(r?.channel ?? r?.media ?? r?.ad_channel) !== selectedChannel)
        return false;
    }

    if (selectedSource !== "all") {
      if (getRowSource(r) !== selectedSource) return false;
    }

    return true;
  });
}

export function groupBySource(rows: Row[]) {
  const keyOf = (r: Row) =>
    getRowSource(r) || normalizeSource(asStr((r as any)?.platform) || "unknown");

  const map = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    const k = keyOf(r);
    const cur = map.get(k) ?? [];
    cur.push(r);
    map.set(k, cur);
  }

  return Array.from(map.entries())
    .map(([source, list]) => {
      const base = { source, ...summarize(list) };
      const rep = pickRepresentativeRow(list as any[]);
      return attachRepresentativeFields(base, rep);
    })
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}

export function groupByDevice(rows: Row[]) {
  const keyOf = (r: Row) =>
    (asStr((r as any)?.device) || "unknown").toLowerCase();

  const map = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    const k = keyOf(r);
    const cur = map.get(k) ?? [];
    cur.push(r);
    map.set(k, cur);
  }

  return Array.from(map.entries())
    .map(([device, list]) => {
      const base = { device, ...summarize(list) };
      const rep = pickRepresentativeRow(list as any[]);
      return attachRepresentativeFields(base, rep);
    })
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}

export function groupByWeekRecent5(filteredRows: Row[]) {
  const valid = (filteredRows ?? [])
    .map((r) => {
      const d = parseDateLoose(
        (r as any)?.date ??
          (r as any)?.report_date ??
          (r as any)?.day ??
          (r as any)?.ymd ??
          (r as any)?.dt
      );
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

  const map = new Map<
    string,
    { weekKey: string; label: string; rows: Row[] }
  >();

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
    .map((w) => {
      const base = { weekKey: w.weekKey, label: w.label, ...summarize(w.rows) };
      const rep = pickRepresentativeRow(w.rows as any[]);
      return attachRepresentativeFields(base, rep);
    })
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

export function groupByMonthRecent3(args: {
  rows: Row[];
  selectedMonth: string | "all";
  selectedDevice: string | "all";
  selectedChannel: string | "all";
}) {
  const { rows, selectedMonth, selectedDevice, selectedChannel } = args;

  const baseRows = (rows ?? []).filter((r: any) => {
    if (selectedDevice !== "all" && asStr(r?.device) !== selectedDevice)
      return false;
    if (selectedChannel !== "all" && asStr(r?.channel) !== selectedChannel)
      return false;
    return true;
  });

  let scope = baseRows;

  if (selectedMonth !== "all") {
    const [yy, mm] = selectedMonth.split("-").map(Number);
    const start = new Date(yy, mm - 1 - 2, 1);
    const end = new Date(yy, mm, 1);
    scope = baseRows.filter((r: any) => {
      const d = parseDateLoose(
        r?.date ?? r?.report_date ?? r?.day ?? r?.ymd ?? r?.dt
      );
      if (!d) return false;
      return d >= start && d < end;
    });
  }

  const map = new Map<string, Row[]>();
  for (const r of scope) {
    const d = parseDateLoose(
      (r as any)?.date ??
        (r as any)?.report_date ??
        (r as any)?.day ??
        (r as any)?.ymd ??
        (r as any)?.dt
    );
    if (!d) continue;
    const mk = monthKeyOfDate(d);
    const cur = map.get(mk) ?? [];
    cur.push(r);
    map.set(mk, cur);
  }

  return Array.from(map.entries())
    .map(([month, list]) => {
      const base = { month, ...summarize(list) };
      const rep = pickRepresentativeRow(list as any[]);
      return attachRepresentativeFields(base, rep);
    })
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);
}

export function getCurrentMonthKeyByData(rows: Row[]) {
  const ds = (rows ?? [])
    .map((r) =>
      parseDateLoose(
        (r as any)?.date ??
          (r as any)?.report_date ??
          (r as any)?.day ??
          (r as any)?.ymd ??
          (r as any)?.dt
      )
    )
    .filter(Boolean) as Date[];
  if (!ds.length) return "all";
  const max = new Date(Math.max(...ds.map((d) => d.getTime())));
  return monthKeyOfDate(max);
}

export function diffPct(a: number, b: number) {
  if (!b) return 0;
  return (a - b) / b;
}

export function periodText(args: {
  rows: Row[];
  selectedMonth: string | "all";
  selectedWeek: string | "all";
}) {
  const { rows, selectedMonth, selectedWeek } = args;
  if (!rows.length) return "";

  const fmt = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")}`;

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

  const ds = (rows ?? [])
    .map((r) =>
      parseDateLoose(
        (r as any)?.date ??
          (r as any)?.report_date ??
          (r as any)?.day ??
          (r as any)?.ymd ??
          (r as any)?.dt
      )
    )
    .filter(Boolean) as Date[];
  if (!ds.length) return "";
  const min = new Date(Math.min(...ds.map((d) => d.getTime())));
  const max = new Date(Math.max(...ds.map((d) => d.getTime())));
  return `${fmt(min)} ~ ${fmt(max)}`;
}

export function groupByCampaign(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const r of rows ?? []) {
    const key = asStr(
      (r as any)?.campaign_name ??
        (r as any)?.campaignName ??
        (r as any)?.campaign
    );
    if (!key) continue;

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const out = Array.from(map.entries()).map(([campaign, items]) => {
    const base = { campaign, ...summarize(items) };
    const rep = pickRepresentativeRow(items as any[]);
    return attachRepresentativeFields(base, rep);
  });

  out.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  return out;
}

export function groupByGroup(rows: Row[]) {
  const map = new Map<string, Row[]>();

  for (const r of rows ?? []) {
    const key =
      asStr(
        (r as any)?.group_name ??
          (r as any)?.groupName ??
          (r as any)?.adgroup_name ??
          (r as any)?.ad_group ??
          (r as any)?.group
      ) || "미지정";

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const result = Array.from(map.entries()).map(([group, items]) => {
    const base = { group, ...summarize(items) };
    const rep = pickRepresentativeRow(items as any[]);
    return attachRepresentativeFields(base, rep);
  });

  return result.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}
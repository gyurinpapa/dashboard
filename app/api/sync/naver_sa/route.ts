import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { naverSaFetch } from "@/lib/sync/naverSa";

const NAVER_SA_BASE_URL = "https://api.searchad.naver.com";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ------------------ utils ------------------ */

function kstYmd(offsetDays: number) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  kst.setUTCDate(kst.getUTCDate() + offsetDays);

  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseRange(url: URL) {
  const range = url.searchParams.get("range");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  if (since && until) return { since, until };
  if (range === "yesterday_today") return { since: kstYmd(-1), until: kstYmd(0) };
  return { since: kstYmd(-1), until: kstYmd(-1) };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toNum(v: any) {
  if (v == null) return 0;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function yyyymmddToYmd(s: string) {
  const t = String(s).trim();
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return t;
}

function parseTSV(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return lines
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 2 && /^\d{8}$/.test((cols[0] ?? "").trim()));
}

function nowIso() {
  return new Date().toISOString();
}

/* ------------------ 네이버 리포트 실행 ------------------ */

async function runReport({
  apiKey,
  secretKey,
  customerId,
  reportTp,
  since,
  until,
  maxTry,
  intervalMs,
}: any) {
  const created = await naverSaFetch<any>({
    method: "POST",
    resource: "/stat-reports",
    apiKey,
    secretKey,
    customerId,
    body: { reportTp, statDt: since, statDtTo: until },
  });

  if (!created?.reportJobId) {
    throw new Error(`No reportJobId for ${reportTp}`);
  }

  let job: any = null;

  for (let i = 0; i < maxTry; i++) {
    job = await naverSaFetch<any>({
      method: "GET",
      resource: `/stat-reports/${created.reportJobId}`,
      apiKey,
      secretKey,
      customerId,
    });

    const st = String(job?.status ?? "").toUpperCase();
    if (st === "BUILT" || st === "DONE" || st === "COMPLETED") break;
    if (st === "ERROR" || st === "FAILED") break;

    await sleep(intervalMs);
  }

  return {
    reportTp,
    reportJobId: created.reportJobId,
    status: job?.status ?? "UNKNOWN",
    downloadUrl: job?.downloadUrl ?? "",
  };
}

async function downloadText({ apiKey, secretKey, customerId, downloadUrl }: any) {
  let resource = downloadUrl;

  if (resource.startsWith("http")) {
    const u = new URL(resource);
    resource = `${u.pathname}${u.search}`;
  }

  const u2 = new URL(`${NAVER_SA_BASE_URL}${resource}`);

  return await naverSaFetch<string>({
    method: "GET",
    resource: `${u2.pathname}${u2.search}`,
    signatureResource: u2.pathname,
    apiKey,
    secretKey,
    customerId,
  });
}

/* ------------------ metrics_daily helpers ------------------ */

const SOURCE = "naver_sa";
const ENTITY_TYPE = "account";
const ON_CONFLICT = "workspace_id,source,channel,date,entity_type,entity_id";

type MetricsRow = {
  workspace_id: string;
  source: string;
  channel: string;
  date: string; // YYYY-MM-DD
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  imp: number;
  clk: number;
  cost: number;
  conv: number;
  revenue: number;
  extra: any; // jsonb
  created_at: string; // timestamptz
};

function baseRow(params: {
  workspace_id: string;
  channel: string;
  date: string;
  entity_id: string;
  entity_name?: string | null;
  extra?: any;
}): MetricsRow {
  return {
    workspace_id: params.workspace_id,
    source: SOURCE,
    channel: params.channel,
    date: params.date,
    entity_type: ENTITY_TYPE,
    entity_id: params.entity_id,
    entity_name: params.entity_name ?? null,
    imp: 0,
    clk: 0,
    cost: 0,
    conv: 0,
    revenue: 0,
    extra: params.extra ?? {},
    created_at: nowIso(),
  };
}

async function fetchExistingByDates(args: {
  workspace_id: string;
  channel: string;
  entity_id: string;
  dates: string[];
}) {
  if (args.dates.length === 0) return new Map<string, any>();

  const { data, error } = await supabase
    .from("metrics_daily")
    .select("date,imp,clk,cost,conv,revenue,extra,entity_name")
    .eq("workspace_id", args.workspace_id)
    .eq("source", SOURCE)
    .eq("channel", args.channel)
    .eq("entity_type", ENTITY_TYPE)
    .eq("entity_id", args.entity_id)
    .in("date", args.dates);

  if (error) throw error;

  const map = new Map<string, any>();
  for (const r of data ?? []) map.set(r.date, r);
  return map;
}

function mergeRow(base: MetricsRow, existing: any | undefined, patch: Partial<MetricsRow>) {
  const merged: MetricsRow = {
    ...base,
    imp: existing?.imp ?? base.imp,
    clk: existing?.clk ?? base.clk,
    cost: existing?.cost ?? base.cost,
    conv: existing?.conv ?? base.conv,
    revenue: existing?.revenue ?? base.revenue,
    entity_name: existing?.entity_name ?? base.entity_name,
    extra: existing?.extra ?? base.extra,
    ...patch,
  };

  merged.extra = {
    ...(existing?.extra ?? {}),
    ...(base.extra ?? {}),
    ...(patch.extra ?? {}),
  };

  return merged;
}

async function upsertMetrics(rows: MetricsRow[]) {
  if (!rows.length) return { upserted: 0 };

  // ✅ select()를 붙이면 반환 row를 받아 "반영된 row 수"를 확정적으로 셀 수 있음
  const { data, error } = await supabase
    .from("metrics_daily")
    .upsert(rows, { onConflict: ON_CONFLICT })
    .select("id");

  if (error) throw error;
  return { upserted: data?.length ?? 0 };
}

/* ------------------ sync_runs helpers ------------------ */

async function startRun(args: {
  workspace_id: string;
  channel: string;
  since: string;
  until: string;
  meta?: any;
}) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      workspace_id: args.workspace_id,
      source: SOURCE,
      channel: args.channel,
      since: args.since,
      until: args.until,
      status: "running",
      meta: args.meta ?? {},
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function finishRun(args: {
  runId: string;
  status: "success" | "fail";
  upserted: number;
  inserted?: number;
  updated?: number;
  error_message?: string;
  meta?: any;
}) {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      status: args.status,
      upserted: args.upserted,
      inserted: args.inserted ?? 0,
      updated: args.updated ?? 0,
      error_message: args.error_message ?? null,
      meta: args.meta ?? {},
      finished_at: nowIso(),
    })
    .eq("id", args.runId);

  if (error) throw error;
}

/* ------------------ per-channel sync runner ------------------ */

async function runOneChannel(args: {
  workspace_id: string;
  channel: "search" | "display";
  apiKey: string;
  secretKey: string;
  customerId: string;
  since: string;
  until: string;
  maxTry: number;
  intervalMs: number;
}) {
  const { workspace_id, channel, apiKey, secretKey, customerId, since, until, maxTry, intervalMs } = args;

  // 1) AD
  const adJob = await runReport({
    apiKey,
    secretKey,
    customerId,
    reportTp: "AD",
    since,
    until,
    maxTry,
    intervalMs,
  });

  if (!adJob.downloadUrl) throw new Error(`[${channel}] AD report not built`);

  const adText = await downloadText({ apiKey, secretKey, customerId, downloadUrl: adJob.downloadUrl });
  const adRows = parseTSV(adText);

  const byDate: Record<string, { imp: number; clk: number; cost: number }> = {};
  for (const cols of adRows) {
    const date = yyyymmddToYmd(cols[0]);
    const imp = toNum(cols[7]);
    const clk = toNum(cols[9]);
    const cost = toNum(cols[12]);

    if (!byDate[date]) byDate[date] = { imp: 0, clk: 0, cost: 0 };
    byDate[date].imp += imp;
    byDate[date].clk += clk;
    byDate[date].cost += cost;
  }

  const adDates = Object.keys(byDate);
  const existingForAd = await fetchExistingByDates({
    workspace_id,
    channel,
    entity_id: customerId,
    dates: adDates,
  });

  const adUpserts: MetricsRow[] = adDates.map((d) => {
    const base = baseRow({ workspace_id, channel, date: d, entity_id: customerId, extra: {} });
    return mergeRow(base, existingForAd.get(d), {
      imp: byDate[d].imp,
      clk: byDate[d].clk,
      cost: byDate[d].cost,
      extra: { reportTp: "AD", channel },
    });
  });

  const adRes = await upsertMetrics(adUpserts);

  // 2) CONVERSION (fallback chain)
  const reportTypes = ["CRITERION_CONVERSION", "AD_CONVERSION", "AD_CONVERSION_DETAIL"] as const;
  const attempts: any[] = [];
  let conversionSuccess: any = null;
  let convUpserted = 0;

  for (const reportTp of reportTypes) {
    const job = await runReport({
      apiKey,
      secretKey,
      customerId,
      reportTp,
      since,
      until,
      maxTry,
      intervalMs,
    });

    attempts.push(job);
    if (!job.downloadUrl) continue;

    const text = await downloadText({ apiKey, secretKey, customerId, downloadUrl: job.downloadUrl });
    const rows = parseTSV(text);

    const convByDate: Record<string, { conv: number; revenue: number }> = {};
    let convSum = 0;
    let revenueSum = 0;

    for (const cols of rows) {
      const date = yyyymmddToYmd(cols[0]);

      const conv = reportTp === "CRITERION_CONVERSION" ? toNum(cols[6]) : toNum(cols[5]);
      const revenue = reportTp === "CRITERION_CONVERSION" ? toNum(cols[7]) : toNum(cols[6]);

      convSum += conv;
      revenueSum += revenue;

      if (!convByDate[date]) convByDate[date] = { conv: 0, revenue: 0 };
      convByDate[date].conv += conv;
      convByDate[date].revenue += revenue;
    }

    const convDates = Object.keys(convByDate);
    const existingForConv = await fetchExistingByDates({
      workspace_id,
      channel,
      entity_id: customerId,
      dates: convDates,
    });

    const convUpserts: MetricsRow[] = convDates.map((d) => {
      const base = baseRow({ workspace_id, channel, date: d, entity_id: customerId, extra: {} });
      return mergeRow(base, existingForConv.get(d), {
        conv: convByDate[d].conv,
        revenue: convByDate[d].revenue,
        extra: { reportTp, channel },
      });
    });

    const convRes = await upsertMetrics(convUpserts);
    convUpserted = convRes.upserted;

    conversionSuccess = {
      ok: true,
      reportTpUsed: reportTp,
      parsedRows: rows.length,
      upsertedDays: convDates.length,
      debugSums: { convSum, revenueSum },
    };
    break;
  }

  return {
    channel,
    ad: {
      reportJobId: adJob.reportJobId,
      status: adJob.status,
      upsertedDays: adUpserts.length,
      upsertedRows: adRes.upserted,
    },
    conversion:
      conversionSuccess ??
      {
        ok: false,
        skipped: true,
        attempts,
        reason: "All reportTp returned NONE",
      },
    stats: {
      upserted_total: adRes.upserted + convUpserted,
    },
  };
}

/* ------------------ MAIN ------------------ */

export async function GET(req: Request) {
  const url = new URL(req.url);

  const workspace_id = url.searchParams.get("workspace_id");
  if (!workspace_id) {
    return NextResponse.json({ ok: false, error: "workspace_id required" }, { status: 400 });
  }

  const channelParam = (url.searchParams.get("channel") ?? "search").toLowerCase();
  const { since, until } = parseRange(url);
  const maxTry = Number(url.searchParams.get("maxTry") ?? 60);
  const intervalMs = Number(url.searchParams.get("intervalMs") ?? 3000);

  const { data: conn } = await supabase
    .from("connections")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("source", SOURCE)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ ok: false, error: "No naver_sa connection" }, { status: 400 });
  }

  const apiKey = conn.access_token;
  const secretKey = conn.refresh_token;
  const customerId = conn.external_account_id;

  const channelsToRun: ("search" | "display")[] =
    channelParam === "all"
      ? ["search", "display"]
      : channelParam === "display"
      ? ["display"]
      : ["search"];

  const runId = await startRun({
    workspace_id,
    channel: channelParam,
    since,
    until,
    meta: { channelsToRun, maxTry, intervalMs, customerId },
  });

  try {
    let upsertedTotal = 0;
    const results = [];

    for (const ch of channelsToRun) {
      const one = await runOneChannel({
        workspace_id,
        channel: ch,
        apiKey,
        secretKey,
        customerId,
        since,
        until,
        maxTry,
        intervalMs,
      });
      upsertedTotal += one.stats?.upserted_total ?? 0;
      results.push(one);
    }

    await finishRun({
      runId,
      status: "success",
      upserted: upsertedTotal,
      meta: { results },
    });

    return NextResponse.json({
      ok: true,
      step: "naver_stat_sync_full_ok",
      run_id: runId,
      workspace_id,
      customer_id: customerId,
      since,
      until,
      channel: channelParam,
      upserted: upsertedTotal,
      results,
    });
  } catch (e: any) {
    await finishRun({
      runId,
      status: "fail",
      upserted: 0,
      error_message: e?.message ?? "Unknown error",
      meta: { channel: channelParam, since, until },
    });

    return NextResponse.json(
      { ok: false, step: "naver_call_failed", run_id: runId, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
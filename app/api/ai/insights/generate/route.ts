// app/api/ai/insights/generate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChannelKey = "search" | "display";

/** ------------------ utils: env ------------------ */
function getEnv(name: string): string | null {
  const v = process.env[name];
  if (!v || !String(v).trim()) return null;
  return v;
}

/**
 * ✅ 핵심: env 없으면 null (절대 throw 금지)
 * - 빌드/collect 단계에서 import만으로 죽는 걸 방지
 */
function getSupabaseAdmin(): SupabaseClient | null {
  // server-side 권장 키 (NEXT_PUBLIC_도 fallback으로 허용)
  const url = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_KEY") ||
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // 여기서 서비스 롤을 강제하고 싶으면 key 후보를 SERVICE_ROLE만 남기면 됨
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonFail(status: number, error: string, hint?: string) {
  return NextResponse.json({ ok: false, error, hint }, { status });
}

/** ------------------ utils: parsing/format ------------------ */
/** 숫자 안전 파싱 */
function toNum(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[%₩,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** row에서 "가능한 컬럼명 후보" 중 먼저 있는 값을 가져오기 */
function pickNum(row: any, keys: string[]) {
  for (const k of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, k)) return toNum(row[k]);
  }
  return 0;
}

function pickStr(row: any, keys: string[]) {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

function fmtKRW(n: number) {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function fmtPct01(x01: number, digits = 1) {
  return `${(x01 * 100).toFixed(digits)}%`;
}

function fmtRatio(x: number, digits = 2) {
  return x.toFixed(digits);
}

/**
 * channels 필터를 "후처리"로 걸기 (컬럼 존재 여부 불명이라 DB where에 안 거는 게 안전)
 * - 우선 row.channel (또는 media/source) 값을 보고 매핑
 * - 프로젝트별로 값이 다를 수 있어서 매우 보수적으로 처리
 */
function inferChannel(row: any): ChannelKey | "unknown" {
  const channelRaw = pickStr(row, ["channel", "channels", "media_type", "type"]);
  const mediaRaw = pickStr(row, ["media", "source", "platform", "network"]);

  const s = `${channelRaw} ${mediaRaw}`.toLowerCase();

  // 검색 계열 힌트
  if (s.includes("search") || s.includes("sa") || s.includes("keyword")) return "search";

  // 디스플레이 계열 힌트
  if (s.includes("display") || s.includes("gfa") || s.includes("banner") || s.includes("da"))
    return "display";

  return "unknown";
}

/** metrics_daily 집계 */
function aggregateMetrics(rows: any[], channelsWanted: ChannelKey[] | null) {
  // 컬럼명 후보들(프로젝트마다 달라질 수 있으니 넉넉히)
  const KEYS = {
    impressions: ["impressions", "imp", "impCnt", "impr", "view", "views"],
    clicks: ["clicks", "clk", "clkCnt", "click"],
    cost: ["cost", "spend", "ad_spend", "amount", "cost_krw", "charge"],
    conversions: ["conversions", "conv", "convCnt", "orders", "purchases", "purchase", "cv"],
    revenue: ["revenue", "sales", "gmv", "conv_value", "conversion_value", "value", "price"],
  };

  // 채널 필터 (없으면 전체)
  const filtered =
    Array.isArray(channelsWanted) && channelsWanted.length
      ? rows.filter((r) => {
          const inferred = inferChannel(r);
          if (inferred === "unknown") return true; // 모르겠으면 버리지 말자(데이터 누락 방지)
          return channelsWanted.includes(inferred);
        })
      : rows;

  const sum = filtered.reduce(
    (acc, r) => {
      acc.impressions += pickNum(r, KEYS.impressions);
      acc.clicks += pickNum(r, KEYS.clicks);
      acc.cost += pickNum(r, KEYS.cost);
      acc.conversions += pickNum(r, KEYS.conversions);
      acc.revenue += pickNum(r, KEYS.revenue);
      return acc;
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 }
  );

  const ctr = safeDiv(sum.clicks, sum.impressions); // clicks / impressions
  const cpc = safeDiv(sum.cost, sum.clicks); // cost / clicks
  const cvr = safeDiv(sum.conversions, sum.clicks); // conv / clicks
  const cpa = safeDiv(sum.cost, sum.conversions); // cost / conv
  const roas = safeDiv(sum.revenue, sum.cost); // revenue / cost

  return {
    rowCount: filtered.length,
    sum,
    kpi: { ctr, cpc, cvr, cpa, roas },
  };
}

/** ------------------ handler ------------------ */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const reportId = String(body?.reportId ?? "").trim();

    if (!reportId) {
      return jsonFail(400, "reportId is required");
    }

    // ✅ OpenAI key 없을 때도 throw 말고 응답으로 처리
    const openaiKey = getEnv("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonFail(503, "OPENAI_API_KEY missing", "Set OPENAI_API_KEY in Vercel env.");
    }

    // ✅ Supabase env 없을 때도 throw 말고 응답으로 처리 (빌드 안전)
    const sb = getSupabaseAdmin();
    if (!sb) {
      return jsonFail(
        503,
        "Supabase environment variables are missing.",
        "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recommended) in Vercel env."
      );
    }

    // 1) report 읽기
    const { data: report, error: rErr } = await sb
      .from("reports")
      .select("id,title,status,created_at,workspace_id,report_type_id,meta")
      .eq("id", reportId)
      .single();

    if (rErr || !report) {
      return NextResponse.json(
        { ok: false, error: `report not found: ${rErr?.message ?? ""}` },
        { status: 404 }
      );
    }

    // 2) report type 읽기
    const { data: rt } = await sb
      .from("report_types")
      .select("id,key,name")
      .eq("id", report.report_type_id)
      .maybeSingle();

    const meta = (report.meta ?? {}) as any;

    const periodFrom = meta?.period?.from as string | undefined;
    const periodTo = meta?.period?.to as string | undefined;
    const channels = (meta?.channels ?? []) as ChannelKey[];
    const note = (meta?.note ?? "") as string;

    // 3) metrics_daily 읽기 (실데이터)
    let metricsRows: any[] = [];
    if (periodFrom && periodTo) {
      const { data: rows, error: mErr } = await sb
        .from("metrics_daily")
        .select("*")
        .eq("workspace_id", report.workspace_id)
        .gte("date", periodFrom)
        .lte("date", periodTo);

      if (mErr) {
        metricsRows = [];
        meta.__metrics_error = mErr.message;
      } else {
        metricsRows = rows ?? [];
      }
    } else {
      metricsRows = [];
    }

    const agg = aggregateMetrics(metricsRows, Array.isArray(channels) ? channels : null);

    // 4) OpenAI 호출
    const client = new OpenAI({ apiKey: openaiKey });

    const dataBlock =
      periodFrom && periodTo
        ? `
[실데이터 요약 (metrics_daily 집계)]
- 데이터 행수: ${agg.rowCount.toLocaleString("ko-KR")} rows
- 노출: ${fmtInt(agg.sum.impressions)}
- 클릭: ${fmtInt(agg.sum.clicks)}
- 광고비: ${fmtKRW(agg.sum.cost)}
- 전환: ${fmtInt(agg.sum.conversions)}
- 매출: ${fmtKRW(agg.sum.revenue)}
- CTR: ${fmtPct01(agg.kpi.ctr)}
- CPC: ${fmtKRW(agg.kpi.cpc)}
- CVR: ${fmtPct01(agg.kpi.cvr)}
- CPA: ${fmtKRW(agg.kpi.cpa)}
- ROAS: ${fmtRatio(agg.kpi.roas)}x
`.trim()
        : `
[실데이터 요약]
- 기간이 설정되지 않아 metrics_daily 집계를 생략했어.
`.trim();

    const prompt = `
너는 퍼포먼스 마케팅/커머스 분석가야.
아래 "보고서 설정"과 "실데이터 요약"을 기반으로, 광고주가 바로 실행할 수 있는 인사이트를 한국어로 작성해줘.

[보고서 정보]
- 제목: ${report.title}
- 타입: ${rt?.name ?? "unknown"} (key=${rt?.key ?? "unknown"})
- 기간: ${periodFrom ?? "-"} ~ ${periodTo ?? "-"}
- 채널: ${Array.isArray(channels) && channels.length ? channels.join(",") : "(미설정)"}
- 메모: ${note?.trim() ? note : "(없음)"}

${dataBlock}

[출력 형식]
1) 총평 (2~3문장) — 위 실데이터 숫자를 직접 인용해서 요약해.
2) 핵심 인사이트 5개 — 각 항목은 (관찰 → 원인 가설 → 액션) 3단 구조로.
3) 다음 7일 액션 플랜 5개 — 우선순위/난이도/예상효과를 짧게 표기.
4) 리스크/주의 3개 — 데이터가 부족하거나 설정이 빠진 경우를 포함.
5) 추가로 꼭 필요한 데이터 5가지 — "없으면 판단 불가" 수준의 항목들.

주의:
- 숫자는 위에 제공된 것만 사용해. 없으면 "데이터 미확인"으로 표기.
- 채널이 미설정이면, 채널 설정/분리 집계가 왜 중요한지 먼저 짚어.
`.trim();

    const model = getEnv("OPENAI_MODEL") || "gpt-5.2";

    const resp = await client.responses.create({
      model,
      input: prompt,
    });

    const text = resp.output_text?.trim() ?? "";
    if (!text) {
      return jsonFail(500, "Empty model output");
    }

    // 5) reports.meta에 저장
    const nextMeta = {
      ...meta,
      ai_insight: {
        text,
        model,
        created_at: new Date().toISOString(),
      },
      ai_input_metrics: {
        period: { from: periodFrom ?? null, to: periodTo ?? null },
        channels: Array.isArray(channels) ? channels : [],
        rowCount: agg.rowCount,
        sum: agg.sum,
        kpi: agg.kpi,
        generated_at: new Date().toISOString(),
      },
    };

    const { error: uErr } = await sb.from("reports").update({ meta: nextMeta }).eq("id", reportId);

    if (uErr) {
      return jsonFail(500, `meta update failed: ${uErr.message}`);
    }

    return NextResponse.json({ ok: true, insight: text, meta: nextMeta });
  } catch (e: any) {
    return jsonFail(500, e?.message ?? "unknown error");
  }
}

export async function GET() {
  return jsonFail(405, "Method Not Allowed");
}
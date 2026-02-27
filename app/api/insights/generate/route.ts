// app/api/insights/generate/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sbAuth } from "@/src/lib/supabase/auth-server";

/**
 * ✅ 옵션 B: 빌드가 절대 깨지지 않도록
 * - OpenAI 클라이언트를 "모듈 top-level"에서 만들지 않는다.
 * - 요청 처리 시점(POST)에서만 env 체크 후 생성한다.
 * - 기존 로직(프롬프트/샘플링/업서트)은 그대로 유지한다.
 */

function jsonError(status: number, message: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asNonEmptyString(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function clampText(v: any, maxLen = 1200) {
  if (v == null) return null;
  if (typeof v === "string") return v.length > maxLen ? v.slice(0, maxLen) + "…" : v;
  try {
    const s = JSON.stringify(v);
    if (s.length > maxLen) return JSON.parse(s.slice(0, maxLen)) as any;
    return v;
  } catch {
    return null;
  }
}

/**
 * ✅ date / ISO / "2026. 02. 20." 같은 문자열을 "YYYY-MM-DD"로 최대한 안전하게 정규화
 * - metrics_daily.date가 date 타입인 경우 이 형태가 가장 안전
 */
function normalizeToYMD(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;

  // 1) ISO 형태면 앞 10자리 사용 (YYYY-MM-DD)
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch?.[1]) return isoMatch[1];

  // 2) "2026. 02. 20." / "2026.02.20" / "2026 02 20" 등 → 숫자만 추출
  const digits = s.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if (digits) {
    const yyyy = digits[1];
    const mm = String(digits[2]).padStart(2, "0");
    const dd = String(digits[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // 3) 마지막 fallback: Date 파싱 시도
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

type ChannelKey = "search" | "display";

/**
 * ✅ report에서 기간을 "UI와 동일한 규칙"으로 결정
 * meta.period.from/to 우선, 없으면 period_start/end
 */
function getEffectivePeriod(report: any): { from: string | null; to: string | null; source: string } {
  const metaFrom = report?.meta?.period?.from;
  const metaTo = report?.meta?.period?.to;

  const from = normalizeToYMD(metaFrom) ?? normalizeToYMD(report?.period_start);
  const to = normalizeToYMD(metaTo) ?? normalizeToYMD(report?.period_end);

  const source =
    normalizeToYMD(metaFrom) && normalizeToYMD(metaTo)
      ? "meta.period"
      : normalizeToYMD(report?.period_start) && normalizeToYMD(report?.period_end)
        ? "reports.period_start/end"
        : "none";

  return { from, to, source };
}

function getOpenAIClientOrNull() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  // ✅ 여기서만 생성 (빌드 시점 평가 방지)
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const report_id = asNonEmptyString(body?.report_id);

    if (!report_id) return jsonError(400, "report_id is required");

    // ✅ (옵션B 핵심) 키가 없어도 "빌드 실패"가 아니라 "요청 실패"로만 처리
    const openai = getOpenAIClientOrNull();
    if (!openai) {
      return jsonError(501, "AI insight is not configured. Missing OPENAI_API_KEY in environment.");
    }

    // ✅ 1) 서버 쿠키 세션으로 user 확인 (단일 방식)
    const sb = await sbAuth();
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    const user = userRes?.user ?? null;
    if (userErr || !user) return jsonError(401, "Unauthorized (no session). Please sign in.");

    // ✅ 2) report 가져오기
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, title, status, period_start, period_end, meta, workspace_id, report_type_id, created_at")
      .eq("id", report_id)
      .maybeSingle();

    if (rErr) return jsonError(400, rErr.message);
    if (!report) return jsonError(404, "report not found");

    // ✅ 3) 멤버십 체크
    const { data: wm, error: wmErr } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", report.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (wmErr) return jsonError(500, wmErr.message);
    if (!wm) return jsonError(403, "Forbidden: you are not a member of this workspace");

    // ✅ 4) metrics_daily 샘플링 (진단 모드)
    let metricsSample: any[] = [];
    let metricsInfo: any = { rows: 0, reason: "", debug: {} };

    // ✅ 기간: meta.period(from/to) → reports.period_start/end fallback
    const metaFrom = report?.meta?.period?.from;
    const metaTo = report?.meta?.period?.to;

    // ✅ 무조건 YYYY-MM-DD로 정규화(10자리)
    const fromYMD = String(metaFrom ?? report.period_start ?? "").slice(0, 10) || null;
    const toYMD = String(metaTo ?? report.period_end ?? "").slice(0, 10) || null;

    // ✅ 4-A) workspace에 데이터 자체가 있는지 먼저 카운트
    const { count: wsCount, error: wsCountErr } = await supabaseAdmin
      .from("metrics_daily")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", report.workspace_id);

    // ✅ 4-B) 기간으로 카운트 (이게 0이면 “기간 값/형식” 문제 확정)
    let rangeCount: number | null = null;
    let rangeCountErr: string | null = null;

    if (fromYMD && toYMD) {
      const { count, error } = await supabaseAdmin
        .from("metrics_daily")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", report.workspace_id)
        .gte("date", fromYMD)
        .lte("date", toYMD);

      rangeCount = count ?? 0;
      rangeCountErr = error ? error.message : null;
    }

    // ✅ 4-C) 실제 샘플 로드
    if (fromYMD && toYMD) {
      const { data: m, error: mErr } = await supabaseAdmin
        .from("metrics_daily")
        .select("date, source, entity_type, entity_id, entity_name, imp, clk, cost, conv, revenue, extra")
        .eq("workspace_id", report.workspace_id)
        .gte("date", fromYMD)
        .lte("date", toYMD)
        .order("date", { ascending: true })
        .limit(200);

      if (mErr) {
        metricsInfo = {
          rows: 0,
          reason: `metrics query error: ${mErr.message}`,
          debug: {
            report_workspace_id: report.workspace_id,
            fromYMD,
            toYMD,
            wsCount: wsCountErr ? `err:${wsCountErr.message}` : wsCount ?? null,
            rangeCount,
            rangeCountErr,
          },
        };
      } else {
        const rows = (m ?? []).map((row: any) => ({
          date: row.date,
          source: row.source,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          entity_name: row.entity_name,
          imp: row.imp,
          clk: row.clk,
          cost: row.cost,
          conv: row.conv,
          revenue: row.revenue,
          extra: clampText(row.extra, 800),
        }));

        metricsSample = rows;
        metricsInfo = {
          rows: rows.length,
          reason: rows.length ? "" : "0 rows after date filter",
          debug: {
            report_workspace_id: report.workspace_id,
            fromYMD,
            toYMD,
            wsCount: wsCountErr ? `err:${wsCountErr.message}` : wsCount ?? null,
            rangeCount,
            rangeCountErr,
          },
        };
      }
    } else {
      metricsInfo = {
        rows: 0,
        reason: "period missing or invalid",
        debug: {
          report_workspace_id: report.workspace_id,
          meta_period: report?.meta?.period ?? null,
          report_period_start: report.period_start ?? null,
          report_period_end: report.period_end ?? null,
          fromYMD,
          toYMD,
          wsCount: wsCountErr ? `err:${wsCountErr.message}` : wsCount ?? null,
          rangeCount,
          rangeCountErr,
        },
      };
    }

    // ✅ 5) OpenAI 프롬프트 (기존 그대로)
    const prompt = `
너는 퍼포먼스 마케팅 리포트 분석가야.
아래 "리포트 메타"와 "지표 샘플"을 보고, 한국어로 인사이트를 JSON으로 만들어.

요구 JSON 스키마:
{
  "summary": "3~5문장 요약",
  "anomalies": [{"title":"", "why":"", "impact":"", "checklist":["",""]}],
  "actions": [{"title":"", "rationale":"", "next_steps":["",""]}],
  "kpi": [{"name":"", "value":"", "delta":"", "note":""}]
}

반드시 지켜:
- 출력은 JSON만 (설명 텍스트 금지)
- 샘플이 0 rows면, 그 사실을 summary 첫 문장에 명확히 적고,
  actions에 '기간/채널/소스 매핑 확인'을 포함해줘.
- 숫자는 가능한 한 보기 좋게(천단위 콤마, 원 단위는 "원") 표현해도 좋아.

리포트 메타:
${JSON.stringify(
  {
    title: report.title,
    status: report.status,
    period_start: report.period_start,
    period_end: report.period_end,
    meta: report.meta ?? {},
    metrics_info: metricsInfo,
    metrics_schema_hint: {
      date: "일자",
      source: "매체/소스 (예: naver_sa, mobon 등)",
      entity_type: "집계 단위 (campaign/adgroup/creative 등)",
      entity_name: "집계 대상 이름",
      imp: "노출",
      clk: "클릭",
      cost: "비용",
      conv: "전환",
      revenue: "매출",
    },
  },
  null,
  2
)}

지표 샘플(최대 200행, 없을 수도 있음):
${JSON.stringify(metricsSample, null, 2)}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You output strictly valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    // ✅ 6) JSON 파싱 (깨질 수 있어서 안전 처리)
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { summary: raw, anomalies: [], actions: [], kpi: [] };
    }

    // ✅ (디버깅/추적용) 최소 메타
    parsed._debug = {
      report_id,
      workspace_id: report.workspace_id,
      metrics_rows: metricsInfo.rows,
      effective_period: metricsInfo.period ?? null,
      generated_at: new Date().toISOString(),
    };

    // ✅ 7) insights upsert (기존 그대로)
    const kind = "summary";
    const { data: saved, error: sErr } = await supabaseAdmin
      .from("insights")
      .upsert({ report_id, kind, content: parsed }, { onConflict: "report_id,kind" } as any)
      .select("id, report_id, kind, content, updated_at")
      .maybeSingle();

    if (sErr) return jsonError(400, sErr.message, { raw });

    return NextResponse.json({ ok: true, insight: saved });
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e));
  }
}
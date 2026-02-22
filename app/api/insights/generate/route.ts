import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const report_id = body.report_id as string | undefined;

    if (!report_id) {
      return NextResponse.json({ error: "report_id is required" }, { status: 400 });
    }

    // 1) report 가져오기 (기간/메타/제목)
    const { data: report, error: rErr } = await supabaseAdmin
      .from("reports")
      .select("id, title, status, period_start, period_end, meta, workspace_id, report_type_id, created_at")
      .eq("id", report_id)
      .maybeSingle();

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });
    if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

    // 2) (옵션) 기간 있으면 metrics_daily 일부 샘플링
    let metricsSample: any[] = [];
    if (report.period_start && report.period_end) {
      const { data: m, error: mErr } = await supabaseAdmin
        .from("metrics_daily")
        .select("*")
        .eq("workspace_id", report.workspace_id)
        .gte("date", report.period_start)
        .lte("date", report.period_end)
        .order("date", { ascending: true })
        .limit(200);

      if (!mErr && m) metricsSample = m;
    }

    // 3) OpenAI 프롬프트
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

리포트 메타:
${JSON.stringify(
      {
        title: report.title,
        status: report.status,
        period_start: report.period_start,
        period_end: report.period_end,
        meta: report.meta ?? {},
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

    // 4) JSON 파싱 (깨질 수 있어서 안전 처리)
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { summary: raw, anomalies: [], actions: [], kpi: [] };
    }

    // 5) insights upsert (report_id+kind=summary 고정)
    const kind = "summary";

    const { data: saved, error: sErr } = await supabaseAdmin
      .from("insights")
      .upsert(
        { report_id, kind, content: parsed },
        { onConflict: "report_id,kind" } as any // supabase 타입 이슈 회피
      )
      .select("id, report_id, kind, content, updated_at")
      .maybeSingle();

    // onConflict 쓰려면 유니크가 필요 -> 아래에서 유니크 생성 안내함 (아래 4번)
    if (sErr) {
      return NextResponse.json({ error: sErr.message, raw }, { status: 400 });
    }

    return NextResponse.json({ ok: true, insight: saved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
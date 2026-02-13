console.log("ENV KEY:", process.env.OPENAI_API_KEY);

import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // (중요) edge 말고 node에서 돌아야 openai 사용 안정적

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // body 형태:
    // 1) { type: "monthly", data: [...] }
    // 2) { type: "monthGoal", monthKey, goal, actual, progress, note }
    const type = body?.type;

    let prompt = "";

    if (type === "monthly") {
      const data = body?.data ?? [];
      prompt = `
너는 퍼포먼스 마케팅 분석가야.
아래 "최근 3개월 월별 요약 데이터"를 보고, 한국어로 3문장만 작성해.
규칙:
- 3문장 고정
- 1문장: 전체 추세 요약(증가/감소/변동)
- 2문장: 효율(CTR/CPC/CPA/ROAS) 관점 핵심 1~2개
- 3문장: 다음 액션 1개(구체적으로)
- 과장/추측 금지, 데이터 기반으로만.

최근 3개월 월별 요약 데이터(JSON):
${safeJson(data)}
`.trim();
    } else if (type === "monthGoal") {
      const monthKey = body?.monthKey;
      const goal = body?.goal;
      const actual = body?.actual;
      const progress = body?.progress;
      const note = body?.note || "";

      prompt = `
너는 퍼포먼스 마케팅 리포트 작성자야.
"당월 목표/결과/진도율"을 보고 한국어 3문장만 작성해.

규칙:
- 3문장 고정
- 1문장: 목표 대비 현재 진도 핵심(좋은/나쁜 KPI 1~2개)
- 2문장: 원인/해석(CTR/CPC/CPA/ROAS 관점에서 연결)
- 3문장: 다음 액션 1개(오늘/이번주 할 수 있는 수준)

주의:
- 목표값이 0이면 note를 고려해서 '현황 중심'으로 작성해.
- 과장/추측 금지.

기준월: ${monthKey}

목표(goal):
${safeJson(goal)}

결과(actual):
${safeJson(actual)}

진도(progress: 0~1):
${safeJson(progress)}

추가 노트:
${note}
`.trim();
    } else {
      // 혹시 기존 코드에서 배열만 보내도 최소 동작하도록 백업
      // (예전: body가 배열일 때)
      if (Array.isArray(body)) {
        prompt = `
너는 퍼포먼스 마케팅 분석가야.
아래 데이터는 "월별 요약(최근 3개월)"이야.
한국어로 3문장만 작성해(추세/효율/다음액션).
데이터(JSON):
${safeJson(body)}
`.trim();
      } else {
        return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
      }
    }

    // ✅ SDK 버전에 따라 chat.completions이 가장 호환이 넓음
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You write concise performance marketing insights." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const result = completion.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
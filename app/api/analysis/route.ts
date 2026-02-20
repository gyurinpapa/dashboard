import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 환경변수 안전 체크
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 키가 있을 때만 클라이언트 생성
const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

export async function POST(req: Request) {
  try {
    // ✅ 키가 없으면 500이 아니라 "기능 비활성"으로 정상 응답(200)
    if (!openai) {
      return NextResponse.json({
        ok: true,
        disabled: true,
        result: "인사이트 기능이 아직 비활성화되어 있어요. (OPENAI_API_KEY 미설정)",
      });
    }

    const body = await req.json();
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
      if (Array.isArray(body)) {
        prompt = `
너는 퍼포먼스 마케팅 분석가야.
아래 데이터는 "월별 요약(최근 3개월)"이야.
한국어로 3문장만 작성해(추세/효율/다음액션).
데이터(JSON):
${safeJson(body)}
`.trim();
      } else {
        return NextResponse.json(
          { ok: false, error: "Invalid request body" },
          { status: 400 }
        );
      }
    }

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
    // ✅ 에러를 그대로 HTML로 만들지 말고 JSON으로만 반환
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
"use client";

import InsightBox from "../../InsightBox";

type InsightItem =
  | string
  | {
      id?: string | number;
      title?: string;
      headline?: string;
      description?: string;
      detail?: string;
      lines?: string[];
      level?: "good" | "warning" | "bad" | "info";
      severity?: "good" | "warning" | "bad" | "info";
    };

type Props = {
  monthGoalInsight: InsightItem[] | { items?: InsightItem[] } | null | undefined;
  monthlyInsight?: any; // 있어도 무시
};

function normalizeItems(input: Props["monthGoalInsight"]): InsightItem[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === "object" && Array.isArray((input as any).items)) return (input as any).items;
  return [];
}

function flattenToSentences(items: InsightItem[]): string[] {
  const out: string[] = [];

  for (const it of items) {
    if (typeof it === "string") {
      const s = it.trim();
      if (s) out.push(s);
      continue;
    }

    const lines = Array.isArray(it.lines) ? it.lines : [];
    if (lines.length) {
      lines.forEach((l) => {
        const s = String(l ?? "").trim();
        if (s) out.push(s);
      });
      continue;
    }

    const title = String(it.title ?? it.headline ?? "").trim();
    const desc = String(it.description ?? it.detail ?? "").trim();
    const merged = [title, desc].filter(Boolean).join(" - ");
    if (merged) out.push(merged);
  }

  return out;
}

export default function SummaryInsight({ monthGoalInsight }: Props) {
  const items = normalizeItems(monthGoalInsight);
  const sentences = flattenToSentences(items).slice(0, 5);

  return (
  <InsightBox title="목표 인사이트">
    {items.length === 0 ? (
      <div className="text-gray-500">목표 인사이트가 아직 없습니다. 목표 수치를 입력해보세요.</div>
    ) : (
      <div className="space-y-2">
        {items.map((it, idx) => {
          if (typeof it === "string") {
            return (
              <div key={idx} className="rounded-xl border p-3">
                {/* ✅ 여기서 text-sm 같은 폰트 지정하지 말기 */}
                <div className="text-gray-800">{it}</div>
              </div>
            );
          }

          const key = (it.id ?? idx) as any;
          const title = it.title ?? it.headline ?? "인사이트";
          const desc = it.description ?? it.detail ?? "";
          const lines = Array.isArray(it.lines) ? it.lines : [];

          return (
            <div key={key} className="rounded-xl border p-3">
              {/* ✅ 제목/본문도 폰트 지정 최소화 */}
              <div className="font-semibold text-gray-900">{title}</div>
              {desc ? <div className="mt-1 text-gray-700">{desc}</div> : null}

              {lines.length ? (
                <ul className="mt-2 list-disc pl-5 text-gray-700">
                  {lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    )}
  </InsightBox>
);

}

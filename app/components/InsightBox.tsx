"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;

  // ✅ (호환) 예전 구현에서 sentences prop을 쓰는 경우가 있어도 죽지 않게
  sentences?: string[];

  // ✅ (현행) children 방식도 지원
  children?: ReactNode;

  className?: string;
};

export default function InsightBox({ title, sentences, children, className }: Props) {
  const hasSentences = Array.isArray(sentences) && sentences.length > 0;

  return (
    <div className={["border rounded-xl p-5 bg-white", className].filter(Boolean).join(" ")}>
      {/* ✅ 제목 폰트 고정 */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-base font-semibold text-gray-900">{title}</div>

        {/* 🔎 테스트용: 이게 안 보이면 InsightBox가 아예 이 파일이 아님 */}
        <div className="text-[11px] text-gray-400 select-none">InsightBox:v2</div>
      </div>

      {/* ✅ 본문 폰트 고정 */}
      <div className="text-sm leading-6 text-gray-800">
        {hasSentences ? (
          <ol className="list-decimal pl-5 space-y-1">
            {sentences!.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : children ? (
          children
        ) : (
          <div className="text-gray-500">인사이트가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

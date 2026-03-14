import type { ReactNode } from "react";

export default function TrendCell({
  v,
  digits = 1,
}: {
  v: number | null;
  digits?: number;
}) {
  if (v === null || !isFinite(v))
    return (
      <span className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em] text-gray-400">
        -
      </span>
    );

  const up = v > 0;
  const down = v < 0;

  const arrow = up ? "▲" : down ? "▼" : "•";

  const color = up
    ? "text-red-600 bg-red-50 border-red-100"
    : down
    ? "text-blue-600 bg-blue-50 border-blue-100"
    : "text-gray-500 bg-gray-100 border-gray-200";

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1
        rounded-xl
        border
        px-2.5
        py-1
        text-[11px]
        font-semibold
        tracking-[-0.01em]
        leading-none
        transition
        hover:shadow-sm
        ${color}
      `}
    >
      <span className="inline-flex w-3 items-center justify-center text-[10px] leading-none">
        {arrow}
      </span>
      <span className="leading-none">{(v * 100).toFixed(digits)}%</span>
    </span>
  );
}
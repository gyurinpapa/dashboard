import type { ReactNode } from "react";

export default function TrendCell({ v, digits = 1 }: { v: number | null; digits?: number }) {
  if (v === null || !isFinite(v)) return <span className="text-gray-400">-</span>;

  const up = v > 0;
  const down = v < 0;
  const arrow = up ? "▲" : down ? "▼" : "•";
  const color = up ? "text-red-600" : down ? "text-blue-600" : "text-gray-500";

  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${color}`}>
      <span className="text-xs">{arrow}</span>
      <span>{(v * 100).toFixed(digits)}%</span>
    </span>
  );
}

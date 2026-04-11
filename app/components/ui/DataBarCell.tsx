"use client";

import { memo, useMemo } from "react";
import { formatCount } from "../../../src/lib/report/format";

type Props = {
  value: number;
  max: number;
  label?: string;
  height?: number;
};

/**
 * 성능 최적화 포인트
 * - React.memo로 동일 props 재렌더 방지
 * - formatCount 결과를 useMemo로 고정
 * - width / height / 배경 style object를 useMemo로 안정화
 * - pct 계산 시 clamp 처리로 불필요한 비정상 width 방지
 */
function DataBarCellComponent({
  value,
  max,
  label,
  height = 18,
}: Props) {
  const pct = useMemo(() => {
    if (!(max > 0)) return 0;
    const raw = (value / max) * 100;
    if (!isFinite(raw)) return 0;
    return Math.max(0, Math.min(raw, 100));
  }, [value, max]);

  const text = useMemo(
    () => label ?? formatCount(value),
    [label, value]
  );

  const isSmall = pct < 18;

  const barStyle = useMemo(
    () => ({
      width: `${pct}%`,
      height: `${height}px`,
      background:
        "linear-gradient(90deg,#fb923c 0%,#f97316 60%,#ea580c 100%)",
      boxShadow:
        "inset 0 0 0 1px rgba(255,255,255,0.18), 0 1px 2px rgba(15,23,42,0.08)",
    }),
    [pct, height]
  );

  const insideLabelStyle = useMemo(
    () => ({ pointerEvents: "none" as const }),
    []
  );

  return (
    <div className="group flex w-full items-center gap-2.5">
      <div className="relative w-full overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50/80">
        <div
          className="rounded-xl transition-all duration-700 ease-out group-hover:brightness-[1.03]"
          style={barStyle}
        />

        {!isSmall && (
          <div
            className="absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold tracking-[-0.01em] text-slate-900"
            style={insideLabelStyle}
          >
            {text}
          </div>
        )}
      </div>

      {isSmall && (
        <div className="whitespace-nowrap text-[11px] font-semibold tracking-[-0.01em] text-gray-700">
          {text}
        </div>
      )}
    </div>
  );
}

const DataBarCell = memo(DataBarCellComponent);
export default DataBarCell;
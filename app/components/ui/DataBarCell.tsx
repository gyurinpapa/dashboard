"use client";

import { memo, useMemo } from "react";
import { formatCount } from "../../../src/lib/report/format";

type Props = {
  value: number;
  max: number;
  label?: string;
  height?: number;
  emphasized?: boolean;
};

/**
 * 성능 최적화 포인트
 * - React.memo로 동일 props 재렌더 방지
 * - formatCount 결과를 useMemo로 고정
 * - width / height / 배경 style object를 useMemo로 안정화
 * - pct 계산 시 clamp 처리로 불필요한 비정상 width 방지
 * - 애니메이션과 hover 기반 효과를 제거해 일반 웹/PPT 캡처 결과를 동일하게 유지
 */
function DataBarCellComponent({
  value,
  max,
  label,
  height,
  emphasized = false,
}: Props) {
  const resolvedHeight = height ?? (emphasized ? 24 : 18);
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
      height: `${resolvedHeight}px`,
      background:
        "linear-gradient(90deg, rgba(183,215,227,0.92) 0%, rgba(127,166,196,0.96) 100%)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    }),
    [pct, resolvedHeight]
  );

  const insideLabelStyle = useMemo(
    () => ({ pointerEvents: "none" as const }),
    []
  );

  const labelTextClass = emphasized ? "text-[13px]" : "text-[11px]";

  return (
    <div className="flex w-full items-center gap-2.5">
      <div className="relative w-full overflow-hidden rounded-lg border border-[#CFC2B1]/50 bg-[#F3E4D2]/28">
        <div
          className="rounded-lg"
          style={barStyle}
        />

        {!isSmall && (
          <div
            className={`absolute inset-y-0 right-2.5 flex items-center ${labelTextClass} font-semibold tracking-[-0.01em] text-[#27364A]`}
            style={insideLabelStyle}
          >
            {text}
          </div>
        )}
      </div>

      {isSmall && (
        <div className={`whitespace-nowrap ${labelTextClass} font-semibold tracking-[-0.01em] text-[#52606D]`}>
          {text}
        </div>
      )}
    </div>
  );
}

const DataBarCell = memo(DataBarCellComponent);
export default DataBarCell;

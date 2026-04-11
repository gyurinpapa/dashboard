"use client";

import { memo, useMemo } from "react";
import { formatDeltaPercentFromRatio } from "../../../src/lib/report/format";

type Props = {
  v: number | null;
  digits?: number;
};

const EMPTY_CLASS_NAME =
  "inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em] text-gray-400";

const ROOT_BASE_CLASS_NAME = [
  "inline-flex",
  "items-center",
  "gap-1",
  "rounded-xl",
  "border",
  "px-2.5",
  "py-1",
  "text-[11px]",
  "font-semibold",
  "tracking-[-0.01em]",
  "leading-none",
  "transition",
  "hover:shadow-sm",
].join(" ");

const COLOR_CLASS_BY_STATE = {
  up: "text-red-600 bg-red-50 border-red-100",
  down: "text-blue-600 bg-blue-50 border-blue-100",
  flat: "text-gray-500 bg-gray-100 border-gray-200",
} as const;

/**
 * 성능 최적화 포인트
 * - React.memo로 셀 단위 재렌더 억제
 * - 상태별 color class를 정적 상수로 고정
 * - formatter 결과를 useMemo로 고정
 */
function TrendCellComponent({ v, digits = 1 }: Props) {
  // ✅ 수정: early return 전에 invalid 여부를 먼저 고정
  const isInvalid = v === null || !isFinite(v);

  // ✅ 수정: hook 호출 순서를 항상 동일하게 유지
  const state = isInvalid ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat";
  const arrow = state === "up" ? "▲" : state === "down" ? "▼" : "•";

  const valueText = useMemo(() => {
    if (isInvalid) return "-";
    return formatDeltaPercentFromRatio(v, digits);
  }, [isInvalid, v, digits]);

  const rootClassName = useMemo(
    () => `${ROOT_BASE_CLASS_NAME} ${COLOR_CLASS_BY_STATE[state]}`,
    [state]
  );

  // ✅ 수정: hook 호출 이후에 early return
  if (isInvalid) {
    return <span className={EMPTY_CLASS_NAME}>-</span>;
  }

  return (
    <span className={rootClassName}>
      <span className="inline-flex w-3 items-center justify-center text-[10px] leading-none">
        {arrow}
      </span>
      <span className="leading-none">{valueText}</span>
    </span>
  );
}

const TrendCell = memo(TrendCellComponent);
export default TrendCell;
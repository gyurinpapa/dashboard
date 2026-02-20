"use client";

type Props = {
  value: number;
  max: number;
  label?: string;
  height?: number;
};

const format = (n: number) => n.toLocaleString("ko-KR");

export default function DataBarCell({
  value,
  max,
  label,
  height = 18,
}: Props) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const text = label ?? format(value);

  // ⭐ 기준값 (이보다 작으면 밖으로)
  const isSmall = pct < 18;

  return (
    <div className="flex items-center gap-2 w-full">
      {/* bar container */}
      <div className="relative w-full bg-gray-100 rounded overflow-hidden">
        {/* bar */}
        <div
          className="rounded"
          style={{
            width: `${pct}%`,
            height: `${height}px`,
            backgroundColor: "#f97316",
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* label inside (큰 막대일 때만) */}
        {!isSmall && (
          <div
            className="absolute inset-y-0 right-2 flex items-center text-xs font-normal"
            style={{
             color: "#111",   // ⭐ 검정색
             pointerEvents: "none",
            }}
          >
            {text}
          </div>
        )}
      </div>

      {/* label outside (작은 막대일 때) */}
      {isSmall && (
        <div className="text-xs font-semibold whitespace-nowrap text-gray-800">
          {text}
        </div>
      )}
    </div>
  );
}

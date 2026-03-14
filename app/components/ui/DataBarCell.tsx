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

  const isSmall = pct < 18;

  return (
    <div className="group flex w-full items-center gap-2.5">
      <div className="relative w-full overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50/80">
        <div
          className="rounded-xl transition-all duration-700 ease-out group-hover:brightness-[1.03]"
          style={{
            width: `${pct}%`,
            height: `${height}px`,
            background:
              "linear-gradient(90deg,#fb923c 0%,#f97316 60%,#ea580c 100%)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18), 0 1px 2px rgba(15,23,42,0.08)",
          }}
        />

        {!isSmall && (
          <div
            className="absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold tracking-[-0.01em] text-slate-900"
            style={{
              pointerEvents: "none",
            }}
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
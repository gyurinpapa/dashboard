"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

const FilterDropdown = memo(function FilterDropdown({
  label,
  options,
  value,
  onChange,
  disabled,
  placeholder,
  maxButtonWidthClass = "max-w-[220px]",
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  maxButtonWidthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const buttonText = value ?? placeholder ?? label;

  const sortedOptions = useMemo(() => {
    const arr = (options ?? [])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, "ko"));
  }, [options]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!!disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        title={disabled ? `${label} (캠페인을 먼저 선택하세요)` : buttonText}
        className={[
          "inline-flex items-center gap-1.5",
          "rounded-[12px] border px-4 py-2.5 text-sm font-semibold",
          "focus:outline-none",
          maxButtonWidthClass,
          disabled
            ? "cursor-not-allowed border-[#CFC2B1]/50 bg-[#F3E4D2]/45 text-[#9A8F81]"
            : "border-[#B7D7E3]/80 bg-white text-[#334155] hover:border-[#7FA6C4]/70 hover:bg-[#B7D7E3]/12",
        ].join(" ")}
      >
        <span className="truncate">{buttonText}</span>
        <span className={disabled ? "text-[#CFC2B1]" : "text-[#7FA6C4]"}>▼</span>
      </button>

      {open && !disabled && (
        <div
          className={[
            "absolute left-0 mt-2",
            "z-50 max-h-72 min-w-full w-80 max-w-[70vw] overflow-auto",
            "rounded-[16px] border border-[#CFC2B1]/60 bg-white shadow-[0_6px_18px_rgba(127,166,196,0.10)]"
          ].join(" ")}
        >
          <button
            type="button"
            className={[
              "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm",
              !value ? "bg-[#B7D7E3]/20" : "hover:bg-[#B7D7E3]/16",
            ].join(" ")}
            title={`전체 ${label}`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="truncate whitespace-nowrap">{`전체 ${label}`}</span>
            {!value ? (
              <span className="font-bold text-[#7FA6C4]">✓</span>
            ) : (
              <span />
            )}
          </button>

          {sortedOptions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#7A8794]">옵션이 없습니다.</div>
          ) : (
            sortedOptions.map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  className={[
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm",
                    active ? "bg-[#B7D7E3]/20" : "hover:bg-[#B7D7E3]/16",
                  ].join(" ")}
                  title={opt}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <span className="truncate whitespace-nowrap">{opt}</span>
                  {active ? (
                    <span className="font-bold text-[#7FA6C4]">✓</span>
                  ) : (
                    <span />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

export default FilterDropdown;

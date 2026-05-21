// app/components/ui/FilterBtn.tsx
"use client";

import type { ReactNode } from "react";

type Props = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

export default function FilterBtn({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-11 items-center justify-center rounded-full border px-4 text-center text-sm font-semibold tracking-tight",
        "select-none whitespace-nowrap",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nature-blue)]/20",
        active
          ? "border-[var(--nature-blue)] bg-[var(--nature-blue)] text-white shadow-sm ring-2 ring-[var(--nature-blue)]/15"
          : "border-[var(--nature-border)] bg-[var(--nature-surface)] text-slate-700 hover:-translate-y-[1px] hover:border-[var(--nature-blue-light)] hover:bg-[var(--nature-cream)]/70 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15",
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10"
          : "border-slate-200 bg-white text-slate-700 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
import type { ReactNode } from "react";

export default function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-11 items-center justify-center text-center rounded-full border px-4 text-sm font-semibold tracking-tight transition-all duration-200",
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10"
          : "border-slate-200 bg-white text-slate-700 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
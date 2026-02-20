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
        "px-4 py-2 rounded-xl border text-sm font-semibold transition",
        "border-orange-900/40",
        active ? "bg-orange-700 text-white shadow" : "bg-orange-600 text-white/90 hover:bg-orange-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

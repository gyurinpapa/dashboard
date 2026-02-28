"use client";

import * as React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
  loading?: boolean;
};

export default function PressButton({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold " +
    "transition-all duration-150 select-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 " +
    "active:translate-y-[1px] active:scale-[0.98]";

  const styles =
    variant === "primary"
      ? "bg-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.18)] hover:bg-black/90 " +
        "active:shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
      : "bg-white text-black border border-black/10 shadow-sm hover:bg-black/5 " +
        "active:shadow-none";

  const disabledStyle =
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:scale-100";

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${styles} ${disabledStyle} ${className}`}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          처리중...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
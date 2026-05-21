"use client";

import type { TabKey } from "@/src/lib/report/types";

type Props = {
  tab: TabKey;
  setTab: (value: TabKey) => void;
  className?: string;
  readOnly?: boolean;
};

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "요약" },
  { key: "summary2", label: "요약2" },
  { key: "structure", label: "구조" },
  { key: "keyword", label: "키워드" },
  { key: "keywordDetail", label: "키워드 상세" },
  { key: "creative", label: "소재" },
  { key: "creativeDetail", label: "소재 상세" },
];

export default function FloatingTabRail({
  tab,
  setTab,
  className = "",
  readOnly = false,
}: Props) {
  return (
    <aside className={className}>
      <div
        className={[
          "flex w-[132px] flex-col gap-3 overflow-hidden rounded-[24px] border border-[var(--nature-border)] bg-[var(--nature-surface)]/95",
          "p-3 shadow-[0_8px_28px_rgba(127,166,196,0.16)] backdrop-blur-sm",
        ].join(" ")}
      >
        <div className="px-1 pt-0.5 text-[11px] font-semibold tracking-[-0.01em] text-slate-500">
          TABS
        </div>

        <div className="flex flex-col gap-2">
          {TAB_ITEMS.map((item) => {
            const active = tab === item.key;

            return (
              <button
                key={item.key}
                type="button"
                disabled={readOnly}
                onClick={() => setTab(item.key)}
                className={[
                  "w-full rounded-full border px-3 py-2 text-center text-[12px] font-semibold tracking-[-0.01em] transition-all duration-200",
                  "flex min-h-[36px] items-center justify-center",
                  "whitespace-nowrap overflow-hidden text-ellipsis",
                  active
                    ? "border-[var(--nature-blue)] bg-[var(--nature-blue)] text-white shadow-[0_6px_18px_rgba(127,166,196,0.34)]"
                    : "border-[var(--nature-border)] bg-[var(--nature-shell)] text-slate-700 hover:-translate-y-[1px] hover:border-[var(--nature-blue-light)] hover:bg-[var(--nature-cream)]/70 hover:text-slate-900",
                  readOnly
                    ? "cursor-not-allowed opacity-50 hover:translate-y-0 hover:border-[var(--nature-border)] hover:bg-[var(--nature-shell)] hover:text-slate-700"
                    : "cursor-pointer",
                ].join(" ")}
                title={item.label}
              >
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
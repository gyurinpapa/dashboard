"use client";

import type { TabKey } from "@/src/lib/report/types";

type Props = {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  readOnlyHeader?: boolean;
};

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "summary", label: "요약" },
  { key: "summary2", label: "요약2" },
  { key: "structure", label: "구조" },
  { key: "keyword", label: "키워드" },
  { key: "keywordDetail", label: "키워드(상세)" },
  { key: "creative", label: "소재" },
  { key: "creativeDetail", label: "소재(상세)" },
];

function shellClass() {
  return [
    "hidden xl:flex",
    "fixed right-3 2xl:right-4 top-1/2 -translate-y-1/2 z-20",
    "w-[148px] 2xl:w-[160px] flex-col gap-2.5",
    "pointer-events-auto",
  ].join(" ");
}

function cardClass() {
  return [
    "rounded-2xl border border-slate-200/80 bg-white/88",
    "backdrop-blur-md shadow-lg shadow-slate-900/8",
    "p-2.5",
  ].join(" ");
}

function tabButtonClass(active: boolean) {
  return [
    "w-full rounded-xl border px-2.5 py-2 text-left text-[13px] font-semibold transition-all duration-200",
    active
      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
  ].join(" ");
}

export default function FloatingTabRail({
  tab,
  setTab,
  readOnlyHeader = false,
}: Props) {
  if (readOnlyHeader) return null;

  return (
    <aside className={shellClass()} aria-label="보조 탭 패널">
      <div className={cardClass()}>
        <div className="mb-2 px-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Tabs
          </div>
        </div>

        <div className="space-y-2">
          {TAB_ITEMS.map((item) => {
            const active = tab === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={tabButtonClass(active)}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
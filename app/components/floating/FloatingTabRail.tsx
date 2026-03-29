"use client";

type TabKey =
  | "summary"
  | "summary2"
  | "structure"
  | "keyword"
  | "keywordDetail"
  | "creative"
  | "creativeDetail";

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
      <div className="flex w-[116px] flex-col gap-2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-sm backdrop-blur">
        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          TABS
        </div>

        {TAB_ITEMS.map((item) => {
          const active = tab === item.key;

          return (
            <button
              key={item.key}
              type="button"
              disabled={readOnly}
              onClick={() => setTab(item.key)}
              className={[
                "rounded-xl px-2 py-2 text-center text-[11px] font-medium leading-none transition",
                "whitespace-nowrap",
                active
                  ? "border border-gray-900 bg-gray-900 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                readOnly ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
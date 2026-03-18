"use client";

export type KeywordTopTableDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

export type KeywordTopTableRow = {
  key: string;
  rank: number;
  keyword: string;
  cost: string;
  revenue: string;
  roas: string;
};

type SummaryStats = {
  totalCostLabel?: string;
  totalRevenueLabel?: string;
  avgRoasLabel?: string;
};

type Props = {
  title: string;
  subtitle: string;
  rows: KeywordTopTableRow[];
  density?: KeywordTopTableDensity;
  summary?: SummaryStats;
  className?: string;
};

function getDensityClasses(density: KeywordTopTableDensity) {
  if (density === "export-wide") {
    return {
      section: "flex h-full min-h-[340px] flex-col rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm",
      headerGap: "mb-3",
      eyebrow: "text-[10px]",
      title: "mt-1 text-[15px]",
      subtitle: "mt-1 text-[11px]",
      badge: "px-2.5 py-1 text-[10px]",
      tableWrap: "flex-1 overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50",
      thead: "px-3 py-2.5 text-[10px]",
      row: "px-3 py-2.5 text-[13px]",
      rankBadge: "min-w-[26px] px-2 py-1 text-[10px]",
      stats: "mt-3 grid grid-cols-3 gap-2.5",
      statCard: "rounded-[18px] px-3 py-2.5",
      statLabel: "text-[10px]",
      statValue: "mt-1 text-[13px]",
      cols: "grid-cols-[50px_minmax(0,1.7fr)_1fr_1fr_0.8fr]",
    };
  }

  if (density === "export-compact") {
    return {
      section: "flex h-full min-h-[300px] flex-col rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm",
      headerGap: "mb-3",
      eyebrow: "text-[9px]",
      title: "mt-1 text-[14px]",
      subtitle: "mt-1 text-[10px]",
      badge: "px-2 py-0.5 text-[9px]",
      tableWrap: "flex-1 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50",
      thead: "px-3 py-2 text-[9px]",
      row: "px-3 py-2 text-[12px]",
      rankBadge: "min-w-[24px] px-2 py-0.5 text-[9px]",
      stats: "mt-3 grid grid-cols-3 gap-2",
      statCard: "rounded-[16px] px-3 py-2",
      statLabel: "text-[9px]",
      statValue: "mt-1 text-[12px]",
      cols: "grid-cols-[46px_minmax(0,1.6fr)_1fr_1fr_0.8fr]",
    };
  }

  if (density === "export-side-compact") {
    return {
      section: "flex h-full min-h-[260px] flex-col rounded-[18px] border border-slate-200 bg-white p-2.5 shadow-sm",
      headerGap: "mb-2",
      eyebrow: "text-[8px]",
      title: "mt-1 text-[12px]",
      subtitle: "mt-1 text-[9px]",
      badge: "px-2 py-0.5 text-[8px]",
      tableWrap: "flex-1 overflow-hidden rounded-[14px] border border-slate-200 bg-slate-50",
      thead: "px-2.5 py-1.5 text-[8px]",
      row: "px-2.5 py-1.5 text-[10px]",
      rankBadge: "min-w-[22px] px-1.5 py-0.5 text-[8px]",
      stats: "mt-2 grid grid-cols-1 gap-1.5",
      statCard: "rounded-[14px] px-2.5 py-1.5",
      statLabel: "text-[8px]",
      statValue: "mt-0.5 text-[10px]",
      cols: "grid-cols-[40px_minmax(0,1.4fr)_1fr_1fr_0.8fr]",
    };
  }

  return {
    section: "flex h-full min-h-[360px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm",
    headerGap: "mb-4",
    eyebrow: "text-[11px]",
    title: "mt-1 text-base",
    subtitle: "mt-1 text-xs",
    badge: "px-3 py-1 text-[11px]",
    tableWrap: "flex-1 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50",
    thead: "px-4 py-3 text-[11px]",
    row: "px-4 py-3 text-sm",
    rankBadge: "min-w-[28px] px-2 py-1 text-[11px]",
    stats: "mt-4 grid grid-cols-3 gap-3",
    statCard: "rounded-2xl px-4 py-3",
    statLabel: "text-[11px]",
    statValue: "mt-1 text-sm",
    cols: "grid-cols-[56px_minmax(0,1.8fr)_1fr_1fr_0.8fr]",
  };
}

export default function KeywordTopTableView({
  title,
  subtitle,
  rows,
  density = "export-full",
  summary,
  className,
}: Props) {
  const densityClasses = getDensityClasses(density);
  const safeRows = Array.isArray(rows) ? rows.slice(0, 10) : [];

  return (
    <section className={[densityClasses.section, className ?? ""].join(" ")}>
      <div className={`mb-4 flex items-start justify-between gap-3 ${densityClasses.headerGap}`}>
        <div>
          <div
            className={`font-semibold uppercase tracking-[0.16em] text-slate-400 ${densityClasses.eyebrow}`}
          >
            Keyword
          </div>
          <h3 className={`font-semibold tracking-tight text-slate-900 ${densityClasses.title}`}>
            {title}
          </h3>
          <p className={`text-slate-500 ${densityClasses.subtitle}`}>{subtitle}</p>
        </div>

        <div
          className={`rounded-full border border-slate-200 bg-slate-50 font-medium text-slate-500 ${densityClasses.badge}`}
        >
          Top 10
        </div>
      </div>

      <div className={densityClasses.tableWrap}>
        <div
          className={[
            "grid gap-3 border-b border-slate-200 bg-white font-semibold uppercase tracking-[0.12em] text-slate-500",
            densityClasses.cols,
            densityClasses.thead,
          ].join(" ")}
        >
          <div>순위</div>
          <div>키워드</div>
          <div>광고비</div>
          <div>매출</div>
          <div>ROAS</div>
        </div>

        <div className="divide-y divide-slate-200">
          {safeRows.map((row) => (
            <div
              key={row.key}
              className={[
                "grid gap-3 text-slate-700",
                densityClasses.cols,
                densityClasses.row,
              ].join(" ")}
            >
              <div>
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white font-semibold text-slate-600",
                    densityClasses.rankBadge,
                  ].join(" ")}
                >
                  {row.rank}
                </span>
              </div>

              <div className="truncate font-medium text-slate-900">{row.keyword}</div>
              <div className="truncate">{row.cost}</div>
              <div className="truncate">{row.revenue}</div>
              <div className="truncate font-semibold text-slate-900">{row.roas}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={densityClasses.stats}>
        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>상위 키워드 광고비</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.totalCostLabel || "₩9.99M"}
          </div>
        </div>

        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>상위 키워드 매출</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.totalRevenueLabel || "₩31.99M"}
          </div>
        </div>

        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>평균 ROAS</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.avgRoasLabel || "320%"}
          </div>
        </div>
      </div>
    </section>
  );
}
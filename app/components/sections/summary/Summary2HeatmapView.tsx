"use client";

export type Summary2HeatmapDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

export type Summary2HeatmapCell = {
  key: string;
  label: string;
  level: 0 | 1 | 2 | 3 | 4;
};

type Summary2HeatmapSummary = {
  bestDayLabel?: string;
  stableRangeLabel?: string;
  lowRangeLabel?: string;
};

type Props = {
  title: string;
  subtitle: string;
  cells: Summary2HeatmapCell[];
  density?: Summary2HeatmapDensity;
  summary?: Summary2HeatmapSummary;
  className?: string;
};

function getLevelClass(level: 0 | 1 | 2 | 3 | 4) {
  switch (level) {
    case 4:
      return "bg-slate-700 text-white border-slate-700";
    case 3:
      return "bg-slate-500 text-white border-slate-500";
    case 2:
      return "bg-slate-300 text-slate-800 border-slate-300";
    case 1:
      return "bg-slate-200 text-slate-700 border-slate-200";
    case 0:
    default:
      return "bg-slate-100 text-slate-400 border-slate-200";
  }
}

function getDensityClasses(density: Summary2HeatmapDensity) {
  if (density === "export-wide") {
    return {
      section: "flex h-full min-h-[300px] flex-col rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm",
      headerGap: "mb-3",
      eyebrow: "text-[10px]",
      title: "mt-1 text-[15px]",
      subtitle: "mt-1 text-[11px]",
      legend: "text-[10px]",
      board: "flex-1 rounded-[18px] border border-slate-200 bg-slate-50 p-3.5",
      weekday: "text-[9px]",
      gridGap: "gap-1.5",
      cell: "rounded-lg text-[11px]",
      stats: "mt-3 grid grid-cols-3 gap-2.5",
      statCard: "rounded-[18px] px-3 py-2.5",
      statLabel: "text-[10px]",
      statValue: "mt-1 text-[13px]",
    };
  }

  if (density === "export-compact") {
    return {
      section: "flex h-full min-h-[260px] flex-col rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm",
      headerGap: "mb-3",
      eyebrow: "text-[9px]",
      title: "mt-1 text-[14px]",
      subtitle: "mt-1 text-[10px]",
      legend: "text-[9px]",
      board: "flex-1 rounded-[16px] border border-slate-200 bg-slate-50 p-3",
      weekday: "text-[8px]",
      gridGap: "gap-1.5",
      cell: "rounded-lg text-[10px]",
      stats: "mt-3 grid grid-cols-3 gap-2",
      statCard: "rounded-[16px] px-3 py-2",
      statLabel: "text-[9px]",
      statValue: "mt-1 text-[12px]",
    };
  }

  if (density === "export-side-compact") {
    return {
      section: "flex h-full min-h-[220px] flex-col rounded-[18px] border border-slate-200 bg-white p-2.5 shadow-sm",
      headerGap: "mb-2",
      eyebrow: "text-[8px]",
      title: "mt-1 text-[12px]",
      subtitle: "mt-1 text-[9px]",
      legend: "text-[8px]",
      board: "flex-1 rounded-[14px] border border-slate-200 bg-slate-50 p-2.5",
      weekday: "text-[8px]",
      gridGap: "gap-1",
      cell: "rounded-md text-[9px]",
      stats: "mt-2 grid grid-cols-1 gap-1.5",
      statCard: "rounded-[14px] px-2.5 py-1.5",
      statLabel: "text-[8px]",
      statValue: "mt-0.5 text-[10px]",
    };
  }

  return {
    section: "flex h-full min-h-[320px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm",
    headerGap: "mb-4",
    eyebrow: "text-[11px]",
    title: "mt-1 text-base",
    subtitle: "mt-1 text-xs",
    legend: "text-[11px]",
    board: "flex-1 rounded-[20px] border border-slate-200 bg-slate-50 p-4",
    weekday: "text-[10px]",
    gridGap: "gap-2",
    cell: "rounded-xl text-xs",
    stats: "mt-4 grid grid-cols-3 gap-3",
    statCard: "rounded-2xl px-4 py-3",
    statLabel: "text-[11px]",
    statValue: "mt-1 text-sm",
  };
}

export default function Summary2HeatmapView({
  title,
  subtitle,
  cells,
  density = "export-full",
  summary,
  className,
}: Props) {
  const densityClasses = getDensityClasses(density);

  const safeCells = Array.isArray(cells) ? cells.slice(0, 35) : [];
  const weekdayLabels =
    density === "export-side-compact"
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <section className={[densityClasses.section, className ?? ""].join(" ")}>
      <div className={`flex items-start justify-between gap-3 ${densityClasses.headerGap}`}>
        <div>
          <div
            className={`font-semibold uppercase tracking-[0.16em] text-slate-400 ${densityClasses.eyebrow}`}
          >
            Summary 2
          </div>
          <h3 className={`font-semibold tracking-tight text-slate-900 ${densityClasses.title}`}>
            {title}
          </h3>
          <p className={`text-slate-500 ${densityClasses.subtitle}`}>{subtitle}</p>
        </div>

        <div className={`flex items-center gap-2 text-slate-500 ${densityClasses.legend}`}>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-slate-200 bg-slate-100" />
            낮음
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-slate-400 bg-slate-500" />
            높음
          </div>
        </div>
      </div>

      <div className={densityClasses.board}>
        <div
          className={`mb-3 grid grid-cols-7 text-center font-semibold uppercase tracking-[0.12em] text-slate-400 ${densityClasses.gridGap} ${densityClasses.weekday}`}
        >
          {weekdayLabels.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>

        <div className={`grid grid-cols-7 ${densityClasses.gridGap}`}>
          {safeCells.map((item) => (
            <div
              key={item.key}
              className={[
                "flex aspect-square items-center justify-center border font-semibold transition",
                densityClasses.cell,
                getLevelClass(item.level),
              ].join(" ")}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className={densityClasses.stats}>
        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>최고 성과일</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.bestDayLabel || "24일"}
          </div>
        </div>

        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>안정 구간</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.stableRangeLabel || "17~26일"}
          </div>
        </div>

        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>집중 관리 필요</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.lowRangeLabel || "6~7일"}
          </div>
        </div>
      </div>
    </section>
  );
}
"use client";

export type CreativeTopCardGridDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

export type CreativeTopCardItem = {
  key: string;
  rank: number;
  name: string;
  channel: string;
  imageUrl?: string | null;
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
  items: CreativeTopCardItem[];
  density?: CreativeTopCardGridDensity;
  summary?: SummaryStats;
  className?: string;
};

function getDensityClasses(density: CreativeTopCardGridDensity) {
  if (density === "export-wide") {
    return {
      section: "flex h-full min-h-[340px] flex-col rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm",
      headerGap: "mb-3",
      eyebrow: "text-[10px]",
      title: "mt-1 text-[15px]",
      subtitle: "mt-1 text-[11px]",
      badge: "px-2.5 py-1 text-[10px]",
      grid: "grid flex-1 grid-cols-1 gap-2.5 xl:grid-cols-2",
      card: "min-h-[112px] gap-3 rounded-[18px] p-3.5",
      thumb: "h-[78px] w-[78px] rounded-[16px] text-[10px]",
      rank: "px-2 py-1 text-[9px]",
      name: "text-[13px]",
      channel: "mt-1 text-[10px]",
      metricGrid: "mt-2.5 grid grid-cols-3 gap-2",
      metricCard: "rounded-xl px-2.5 py-2",
      metricLabel: "text-[9px]",
      metricValue: "mt-1 text-[11px]",
      stats: "mt-3 grid grid-cols-3 gap-2.5",
      statCard: "rounded-[18px] px-3 py-2.5",
      statLabel: "text-[10px]",
      statValue: "mt-1 text-[13px]",
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
      grid: "grid flex-1 grid-cols-1 gap-2 xl:grid-cols-2",
      card: "min-h-[104px] gap-3 rounded-[16px] p-3",
      thumb: "h-[70px] w-[70px] rounded-[14px] text-[9px]",
      rank: "px-2 py-0.5 text-[8px]",
      name: "text-[12px]",
      channel: "mt-1 text-[9px]",
      metricGrid: "mt-2.5 grid grid-cols-3 gap-1.5",
      metricCard: "rounded-[10px] px-2 py-1.5",
      metricLabel: "text-[8px]",
      metricValue: "mt-1 text-[10px]",
      stats: "mt-3 grid grid-cols-3 gap-2",
      statCard: "rounded-[16px] px-3 py-2",
      statLabel: "text-[9px]",
      statValue: "mt-1 text-[12px]",
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
      grid: "grid flex-1 grid-cols-1 gap-1.5",
      card: "min-h-[92px] gap-2.5 rounded-[14px] p-2.5",
      thumb: "h-[60px] w-[60px] rounded-[12px] text-[8px]",
      rank: "px-1.5 py-0.5 text-[8px]",
      name: "text-[11px]",
      channel: "mt-1 text-[8px]",
      metricGrid: "mt-2 grid grid-cols-3 gap-1.5",
      metricCard: "rounded-[10px] px-2 py-1.5",
      metricLabel: "text-[8px]",
      metricValue: "mt-0.5 text-[9px]",
      stats: "mt-2 grid grid-cols-1 gap-1.5",
      statCard: "rounded-[14px] px-2.5 py-1.5",
      statLabel: "text-[8px]",
      statValue: "mt-0.5 text-[10px]",
    };
  }

  return {
    section: "flex h-full min-h-[360px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm",
    headerGap: "mb-4",
    eyebrow: "text-[11px]",
    title: "mt-1 text-base",
    subtitle: "mt-1 text-xs",
    badge: "px-3 py-1 text-[11px]",
    grid: "grid flex-1 grid-cols-1 gap-3 xl:grid-cols-2",
    card: "min-h-[120px] gap-4 rounded-[20px] p-4",
    thumb: "h-[88px] w-[88px] rounded-[18px] text-[11px]",
    rank: "px-2.5 py-1 text-[10px]",
    name: "text-sm",
    channel: "mt-1 text-xs",
    metricGrid: "mt-3 grid grid-cols-3 gap-2",
    metricCard: "rounded-xl px-2.5 py-2",
    metricLabel: "text-[10px]",
    metricValue: "mt-1 text-xs",
    stats: "mt-4 grid grid-cols-3 gap-3",
    statCard: "rounded-2xl px-4 py-3",
    statLabel: "text-[11px]",
    statValue: "mt-1 text-sm",
  };
}

export default function CreativeTopCardGridView({
  title,
  subtitle,
  items,
  density = "export-full",
  summary,
  className,
}: Props) {
  const densityClasses = getDensityClasses(density);
  const safeItems = Array.isArray(items) ? items.slice(0, 8) : [];

  return (
    <section className={[densityClasses.section, className ?? ""].join(" ")}>
      <div className={`mb-4 flex items-start justify-between gap-3 ${densityClasses.headerGap}`}>
        <div>
          <div
            className={`font-semibold uppercase tracking-[0.16em] text-slate-400 ${densityClasses.eyebrow}`}
          >
            Creative
          </div>
          <h3 className={`font-semibold tracking-tight text-slate-900 ${densityClasses.title}`}>
            {title}
          </h3>
          <p className={`text-slate-500 ${densityClasses.subtitle}`}>{subtitle}</p>
        </div>

        <div
          className={`rounded-full border border-slate-200 bg-slate-50 font-medium text-slate-500 ${densityClasses.badge}`}
        >
          Top 8
        </div>
      </div>

      <div className={densityClasses.grid}>
        {safeItems.map((item) => (
          <div
            key={item.key}
            className={`flex border border-slate-200 bg-slate-50 ${densityClasses.card}`}
          >
            <div
              className={[
                "flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white font-semibold uppercase tracking-[0.12em] text-slate-400",
                densityClasses.thumb,
              ].join(" ")}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                "IMG"
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`truncate font-semibold text-slate-900 ${densityClasses.name}`}>
                    {item.name}
                  </div>
                  <div className={`text-slate-500 ${densityClasses.channel}`}>{item.channel || "-"}</div>
                </div>

                <div
                  className={`rounded-full border border-slate-200 bg-white font-semibold text-slate-600 ${densityClasses.rank}`}
                >
                  #{item.rank}
                </div>
              </div>

              <div className={densityClasses.metricGrid}>
                <div className={`border border-slate-200 bg-white ${densityClasses.metricCard}`}>
                  <div className={`text-slate-500 ${densityClasses.metricLabel}`}>광고비</div>
                  <div className={`truncate font-semibold text-slate-900 ${densityClasses.metricValue}`}>
                    {item.cost}
                  </div>
                </div>

                <div className={`border border-slate-200 bg-white ${densityClasses.metricCard}`}>
                  <div className={`text-slate-500 ${densityClasses.metricLabel}`}>매출</div>
                  <div className={`truncate font-semibold text-slate-900 ${densityClasses.metricValue}`}>
                    {item.revenue}
                  </div>
                </div>

                <div className={`border border-slate-200 bg-white ${densityClasses.metricCard}`}>
                  <div className={`text-slate-500 ${densityClasses.metricLabel}`}>ROAS</div>
                  <div className={`truncate font-semibold text-slate-900 ${densityClasses.metricValue}`}>
                    {item.roas}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={densityClasses.stats}>
        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>상위 소재 광고비</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.totalCostLabel || "₩5.08M"}
          </div>
        </div>

        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>상위 소재 매출</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.totalRevenueLabel || "₩16.57M"}
          </div>
        </div>

        <div className={`border border-slate-200 bg-slate-50 ${densityClasses.statCard}`}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>평균 ROAS</div>
          <div className={`font-semibold text-slate-900 ${densityClasses.statValue}`}>
            {summary?.avgRoasLabel || "326%"}
          </div>
        </div>
      </div>
    </section>
  );
}
"use client";

export type SummaryGoalMetricCardDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

type Props = {
  label: string;
  goalLabel: string;
  actualLabel: string;
  rate: number;
  density?: SummaryGoalMetricCardDensity;
  className?: string;
};

function clampRate(rate: number) {
  if (!Number.isFinite(rate)) return 0;
  return Math.max(0, Math.min(100, rate));
}

function getDensityClasses(density: SummaryGoalMetricCardDensity) {
  if (density === "export-full") {
    return {
      root: "rounded-[20px] p-4",
      title: "text-sm",
      badge: "px-2.5 py-1 text-[11px]",
      statGrid: "grid-cols-2 gap-3",
      statCard: "rounded-2xl px-3 py-3",
      statLabel: "text-[11px]",
      statValue: "mt-1 text-sm",
      progressWrap: "mt-3",
      progressMeta: "mb-1 text-[11px]",
      progressBar: "h-3 rounded-full",
    };
  }

  if (density === "export-wide") {
    return {
      root: "rounded-[18px] p-3.5",
      title: "text-[13px]",
      badge: "px-2.5 py-1 text-[10px]",
      statGrid: "grid-cols-2 gap-2.5",
      statCard: "rounded-2xl px-3 py-2.5",
      statLabel: "text-[10px]",
      statValue: "mt-1 text-[13px]",
      progressWrap: "mt-2.5",
      progressMeta: "mb-1 text-[10px]",
      progressBar: "h-3 rounded-full",
    };
  }

  if (density === "export-compact") {
    return {
      root: "rounded-[16px] p-3",
      title: "text-[12px]",
      badge: "px-2 py-0.5 text-[9px]",
      statGrid: "grid-cols-2 gap-2",
      statCard: "rounded-[16px] px-2.5 py-2",
      statLabel: "text-[9px]",
      statValue: "mt-1 text-[12px]",
      progressWrap: "mt-2",
      progressMeta: "mb-1 text-[9px]",
      progressBar: "h-2.5 rounded-full",
    };
  }

  if (density === "export-side-compact") {
    return {
      root: "rounded-[14px] p-2.5",
      title: "text-[11px]",
      badge: "px-1.5 py-0.5 text-[8px]",
      statGrid: "grid-cols-1 gap-1.5",
      statCard: "rounded-[14px] px-2 py-1.5",
      statLabel: "text-[8px]",
      statValue: "mt-0.5 text-[10px]",
      progressWrap: "mt-1.5",
      progressMeta: "mb-1 text-[8px]",
      progressBar: "h-2 rounded-full",
    };
  }

  return {
    root: "rounded-[20px] p-4",
    title: "text-sm",
    badge: "px-2.5 py-1 text-[11px]",
    statGrid: "grid-cols-2 gap-3",
    statCard: "rounded-2xl px-3 py-3",
    statLabel: "text-[11px]",
    statValue: "mt-1 text-sm",
    progressWrap: "mt-3",
    progressMeta: "mb-1 text-[11px]",
    progressBar: "h-3 rounded-full",
  };
}

export default function SummaryGoalMetricCardView({
  label,
  goalLabel,
  actualLabel,
  rate,
  density = "export-full",
  className,
}: Props) {
  const safeRate = clampRate(rate);
  const densityClasses = getDensityClasses(density);

  return (
    <div
      className={[
        "border border-slate-200 bg-slate-50",
        densityClasses.root,
        className ?? "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`font-semibold text-slate-900 ${densityClasses.title}`}>
          {label}
        </div>

        <div
          className={[
            "rounded-full border border-slate-200 bg-white font-semibold text-slate-600",
            densityClasses.badge,
          ].join(" ")}
        >
          {Math.round(safeRate)}%
        </div>
      </div>

      <div className={`grid ${densityClasses.statGrid}`}>
        <div
          className={[
            "border border-slate-200 bg-white",
            densityClasses.statCard,
          ].join(" ")}
        >
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>목표</div>
          <div
            className={`truncate font-semibold text-slate-900 ${densityClasses.statValue}`}
          >
            {goalLabel}
          </div>
        </div>

        <div
          className={[
            "border border-slate-200 bg-white",
            densityClasses.statCard,
          ].join(" ")}
        >
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>실적</div>
          <div
            className={`truncate font-semibold text-slate-900 ${densityClasses.statValue}`}
          >
            {actualLabel}
          </div>
        </div>
      </div>

      <div className={densityClasses.progressWrap}>
        <div
          className={`mb-1 flex items-center justify-between text-slate-500 ${densityClasses.progressMeta}`}
        >
          <span>달성률</span>
          <span>{Math.round(safeRate)}%</span>
        </div>

        <div className={`overflow-hidden bg-slate-200 ${densityClasses.progressBar}`}>
          <div
            className={`h-full bg-slate-500 ${densityClasses.progressBar}`}
            style={{ width: `${safeRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
"use client";

export type Summary2FunnelDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

export type Summary2FunnelStepViewItem = {
  key: string;
  label: string;
  value: string;
  widthPercent: number;
  subLabel?: string;
};

type Summary2FunnelStats = {
  ctrLabel?: string;
  cvrLabel?: string;
  cpaLabel?: string;
};

type Props = {
  title: string;
  subtitle: string;
  steps: Summary2FunnelStepViewItem[];
  density?: Summary2FunnelDensity;
  stats?: Summary2FunnelStats;
  className?: string;
};

function clampWidth(value: number) {
  if (!Number.isFinite(value)) return 40;
  return Math.max(24, Math.min(100, value));
}

function getDensityClasses(density: Summary2FunnelDensity) {
  if (density === "export-wide") {
    return {
      section:
        "flex h-full min-h-[240px] flex-col rounded-[22px] border border-slate-200/90 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)]",
      header: "mb-3",
      eyebrow: "text-[10px]",
      title: "mt-1 text-[15px]",
      subtitle: "mt-1 text-[11px]",
      badge:
        "px-2.5 py-1 text-[10px] rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm",
      body:
        "gap-3 rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-3.5",
      step:
        "min-h-[64px] rounded-[18px] px-4 py-3 border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md",
      stepLabel: "text-[13px]",
      stepSub: "mt-1 text-[10px]",
      stepValue: "text-[15px]",
      stats: "mt-3 grid grid-cols-3 gap-2.5",
      statCard:
        "rounded-[18px] px-3 py-2.5 border border-slate-200 bg-white shadow-sm",
      statLabel: "text-[10px]",
      statValue: "mt-1 text-[13px]",
    };
  }

  if (density === "export-compact") {
    return {
      section:
        "flex h-full min-h-[220px] flex-col rounded-[20px] border border-slate-200/90 bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.06)]",
      header: "mb-3",
      eyebrow: "text-[9px]",
      title: "mt-1 text-[14px]",
      subtitle: "mt-1 text-[10px]",
      badge:
        "px-2 py-0.5 text-[9px] rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm",
      body:
        "gap-2.5 rounded-[16px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-3",
      step:
        "min-h-[56px] rounded-[16px] px-3 py-2.5 border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md",
      stepLabel: "text-[12px]",
      stepSub: "mt-1 text-[9px]",
      stepValue: "text-[14px]",
      stats: "mt-3 grid grid-cols-3 gap-2",
      statCard:
        "rounded-[16px] px-3 py-2 border border-slate-200 bg-white shadow-sm",
      statLabel: "text-[9px]",
      statValue: "mt-1 text-[12px]",
    };
  }

  if (density === "export-side-compact") {
    return {
      section:
        "flex h-full min-h-[200px] flex-col rounded-[18px] border border-slate-200/90 bg-white p-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]",
      header: "mb-2",
      eyebrow: "text-[8px]",
      title: "mt-1 text-[12px]",
      subtitle: "mt-1 text-[9px]",
      badge:
        "px-2 py-0.5 text-[8px] rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm",
      body:
        "gap-2 rounded-[14px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-2.5",
      step:
        "min-h-[48px] rounded-[14px] px-3 py-2 border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md",
      stepLabel: "text-[11px]",
      stepSub: "mt-1 text-[8px]",
      stepValue: "text-[12px]",
      stats: "mt-2 grid grid-cols-1 gap-1.5",
      statCard:
        "rounded-[14px] px-2.5 py-1.5 border border-slate-200 bg-white shadow-sm",
      statLabel: "text-[8px]",
      statValue: "mt-0.5 text-[10px]",
    };
  }

  return {
    section:
      "flex h-full min-h-[260px] flex-col rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
    header: "mb-4",
    eyebrow: "text-[11px]",
    title: "mt-1 text-base",
    subtitle: "mt-1 text-xs",
    badge:
      "px-3 py-1 text-[11px] rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm",
    body:
      "gap-4 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4",
    step:
      "min-h-[72px] rounded-[20px] px-5 py-4 border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md",
    stepLabel: "text-sm",
    stepSub: "mt-1 text-xs",
    stepValue: "text-base",
    stats: "mt-4 grid grid-cols-3 gap-3",
    statCard:
      "rounded-2xl px-4 py-3 border border-slate-200 bg-white shadow-sm",
    statLabel: "text-[11px]",
    statValue: "mt-1 text-sm",
  };
}

export default function Summary2FunnelView({
  title,
  subtitle,
  steps,
  density = "export-full",
  stats,
  className,
}: Props) {
  const densityClasses = getDensityClasses(density);
  const safeSteps = Array.isArray(steps) ? steps.slice(0, 4) : [];

  return (
    <section className={[densityClasses.section, className ?? ""].join(" ")}>
      <div
        className={`flex items-start justify-between gap-3 ${densityClasses.header}`}
      >
        <div>
          <div
            className={`font-semibold uppercase tracking-[0.16em] text-slate-400 ${densityClasses.eyebrow}`}
          >
            Summary 2
          </div>
          <h3
            className={`font-semibold tracking-tight text-slate-900 ${densityClasses.title}`}
          >
            {title}
          </h3>
          <p className={`text-slate-500 ${densityClasses.subtitle}`}>
            {subtitle}
          </p>
        </div>

        <div className={densityClasses.badge}>Funnel</div>
      </div>

      <div
        className={`flex flex-1 flex-col items-center justify-center border border-slate-200 ${densityClasses.body}`}
      >
        {safeSteps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center justify-between ${densityClasses.step}`}
            style={{ width: `${clampWidth(step.widthPercent)}%` }}
          >
            <div className="min-w-0">
              <div
                className={`font-semibold text-slate-900 ${densityClasses.stepLabel}`}
              >
                {step.label}
              </div>
              {step.subLabel ? (
                <div className={`text-slate-500 ${densityClasses.stepSub}`}>
                  {step.subLabel}
                </div>
              ) : null}
            </div>

            <div className="pl-4 text-right">
              <div
                className={`font-semibold tracking-tight text-slate-900 ${densityClasses.stepValue}`}
              >
                {step.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={densityClasses.stats}>
        <div className={densityClasses.statCard}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>CTR</div>
          <div
            className={`font-semibold text-slate-900 ${densityClasses.statValue}`}
          >
            {stats?.ctrLabel || "2.74%"}
          </div>
        </div>

        <div className={densityClasses.statCard}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>CVR</div>
          <div
            className={`font-semibold text-slate-900 ${densityClasses.statValue}`}
          >
            {stats?.cvrLabel || "3.75%"}
          </div>
        </div>

        <div className={densityClasses.statCard}>
          <div className={`text-slate-500 ${densityClasses.statLabel}`}>CPA</div>
          <div
            className={`font-semibold text-slate-900 ${densityClasses.statValue}`}
          >
            {stats?.cpaLabel || "₩9,720"}
          </div>
        </div>
      </div>
    </section>
  );
}
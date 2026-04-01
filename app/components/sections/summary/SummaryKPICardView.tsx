"use client";

export type SummaryKPICardTone =
  | "neutral"
  | "cost"
  | "revenue"
  | "roas";

export type SummaryKPICardDensity =
  | "report"
  | "export-full"
  | "export-wide"
  | "export-compact"
  | "export-side-compact";

type Props = {
  title: string;
  value: string;
  subValue?: string;
  tone?: SummaryKPICardTone;
  density?: SummaryKPICardDensity;
  footerText?: string;
  className?: string;
};

const TOKENS = {
  metric: {
    cost: "#F59E0B",
    revenue: "#0EA5E9",
    roas: "#EF4444",
    neutral: "#94A3B8",
  },
};

function getAccentColor(tone: SummaryKPICardTone): string {
  if (tone === "cost") return TOKENS.metric.cost;
  if (tone === "revenue") return TOKENS.metric.revenue;
  if (tone === "roas") return TOKENS.metric.roas;
  return TOKENS.metric.neutral;
}

function getValueClass(tone: SummaryKPICardTone): string {
  if (tone === "revenue") return "text-sky-600";
  if (tone === "roas") return "text-rose-600";
  if (tone === "cost") return "text-amber-600";
  return "text-slate-900";
}

function getBadgeClass(tone: SummaryKPICardTone): string {
  if (tone === "revenue") {
    return "border-sky-100 bg-sky-50 text-sky-700";
  }
  if (tone === "roas") {
    return "border-rose-100 bg-rose-50 text-rose-700";
  }
  if (tone === "cost") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getToneSurfaceClass(tone: SummaryKPICardTone): string {
  if (tone === "revenue") {
    return "bg-[linear-gradient(180deg,rgba(240,249,255,0.95),rgba(255,255,255,1))]";
  }
  if (tone === "roas") {
    return "bg-[linear-gradient(180deg,rgba(255,241,242,0.9),rgba(255,255,255,1))]";
  }
  if (tone === "cost") {
    return "bg-[linear-gradient(180deg,rgba(255,251,235,0.95),rgba(255,255,255,1))]";
  }
  return "bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,1))]";
}

function getFooterClass(tone: SummaryKPICardTone): string {
  if (tone === "revenue") return "text-sky-500";
  if (tone === "roas") return "text-rose-500";
  if (tone === "cost") return "text-amber-500";
  return "text-slate-400";
}

function getGlowStyle(tone: SummaryKPICardTone) {
  if (tone === "revenue") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(14,165,233,0.14), rgba(14,165,233,0) 58%)",
    };
  }
  if (tone === "roas") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(239,68,68,0.12), rgba(239,68,68,0) 58%)",
    };
  }
  if (tone === "cost") {
    return {
      background:
        "radial-gradient(circle at top right, rgba(245,158,11,0.14), rgba(245,158,11,0) 58%)",
    };
  }
  return {
    background:
      "radial-gradient(circle at top right, rgba(148,163,184,0.12), rgba(148,163,184,0) 58%)",
  };
}

function getDensityClasses(density: SummaryKPICardDensity) {
  if (density === "export-full") {
    return {
      root: "rounded-[22px] px-4 py-3.5",
      badge: "h-6 px-2.5 text-[10px]",
      dot: "mt-0.5 h-2.5 w-2.5",
      value: "mt-4 text-[24px] leading-none",
      sub: "mt-2 text-[11px]",
      footer: "mt-3 pt-3 text-[10px]",
    };
  }

  if (density === "export-wide") {
    return {
      root: "rounded-[20px] px-4 py-3",
      badge: "h-6 px-2.5 text-[10px]",
      dot: "mt-0.5 h-2.5 w-2.5",
      value: "mt-3.5 text-[22px] leading-none",
      sub: "mt-1.5 text-[11px]",
      footer: "mt-3 pt-3 text-[10px]",
    };
  }

  if (density === "export-compact") {
    return {
      root: "rounded-[16px] px-2.5 py-2",
      badge: "h-5 px-2 text-[9px]",
      dot: "mt-0.5 h-2 w-2",
      value: "mt-3 text-[16px] leading-tight",
      sub: "mt-1 text-[9px]",
      footer: "mt-2.5 pt-2 text-[8px]",
    };
  }

  if (density === "export-side-compact") {
    return {
      root: "rounded-[14px] px-2 py-1.5",
      badge: "h-4.5 px-1.5 text-[8px]",
      dot: "mt-0.5 h-1.5 w-1.5",
      value: "mt-2.5 text-[13px] leading-tight",
      sub: "mt-1 text-[8px]",
      footer: "mt-2 pt-1.5 text-[7px]",
    };
  }

  return {
    root: "rounded-[24px] px-4 py-3",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2.5 w-2.5",
    value: "mt-3 text-[24px] leading-none",
    sub: "mt-0 text-[11px]",
    footer: "mt-0 pt-0 text-[10px]",
  };
}

export default function SummaryKPICardView({
  title,
  value,
  subValue,
  tone = "neutral",
  density = "report",
  footerText,
  className,
}: Props) {
  const accent = getAccentColor(tone);
  const valueClass = getValueClass(tone);
  const badgeClass = getBadgeClass(tone);
  const toneSurfaceClass = getToneSurfaceClass(tone);
  const footerClass = getFooterClass(tone);
  const densityClasses = getDensityClasses(density);

  const helperText = subValue ?? footerText ?? "";
  const isReportDensity = density === "report";

  return (
    <div
      className={[
        "group relative overflow-hidden border border-slate-200/90 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]",
        toneSurfaceClass,
        densityClasses.root,
        className ?? "",
      ].join(" ")}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-100"
        style={getGlowStyle(tone)}
      />

      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      <div className="relative flex items-start justify-between gap-3">
        <div
          className={[
            "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.08em] shadow-sm",
            badgeClass,
            densityClasses.badge,
          ].join(" ")}
        >
          {title}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={[
              "inline-block rounded-full",
              densityClasses.dot,
            ].join(" ")}
            style={{ backgroundColor: accent }}
          />
        </div>
      </div>

      <div
        className={[
          "relative font-semibold tracking-[-0.03em]",
          valueClass,
          densityClasses.value,
        ].join(" ")}
      >
        {value}
      </div>

      {!isReportDensity && helperText ? (
        <div
          className={[
            "relative font-medium",
            footerClass,
            densityClasses.sub,
          ].join(" ")}
        >
          {helperText}
        </div>
      ) : null}

      {!isReportDensity && footerText ? (
        <div
          className={[
            "relative border-t border-slate-200/70 font-semibold uppercase tracking-[0.08em]",
            footerClass,
            densityClasses.footer,
          ].join(" ")}
        >
          {footerText}
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 62%)",
        }}
      />
    </div>
  );
}
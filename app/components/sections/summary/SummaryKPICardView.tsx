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
  return "text-gray-900";
}

function getBadgeClass(tone: SummaryKPICardTone): string {
  if (tone === "revenue") {
    return "bg-sky-50 text-sky-700 border-sky-100";
  }
  if (tone === "roas") {
    return "bg-rose-50 text-rose-700 border-rose-100";
  }
  if (tone === "cost") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function getDensityClasses(density: SummaryKPICardDensity) {
  if (density === "export-full") {
    return {
      root: "rounded-2xl px-4 py-3.5",
      badge: "h-6 px-2.5 text-[10px]",
      dot: "mt-0.5 h-2.5 w-2.5",
      value: "mt-4 text-[24px] leading-none",
      sub: "mt-2 text-[11px]",
    };
  }

  if (density === "export-wide") {
    return {
      root: "rounded-[18px] px-4 py-3",
      badge: "h-6 px-2.5 text-[10px]",
      dot: "mt-0.5 h-2.5 w-2.5",
      value: "mt-3.5 text-[22px] leading-none",
      sub: "mt-1.5 text-[11px]",
    };
  }

  if (density === "export-compact") {
    return {
      root: "rounded-[16px] px-2.5 py-2",
      badge: "h-5 px-2 text-[9px]",
      dot: "mt-0.5 h-2 w-2",
      value: "mt-3 text-[16px] leading-tight",
      sub: "mt-1 text-[9px]",
    };
  }

  if (density === "export-side-compact") {
    return {
      root: "rounded-[14px] px-2 py-1.5",
      badge: "h-4.5 px-1.5 text-[8px]",
      dot: "mt-0.5 h-1.5 w-1.5",
      value: "mt-2.5 text-[13px] leading-tight",
      sub: "mt-1 text-[8px]",
    };
  }

  return {
    root: "rounded-2xl px-4 py-4",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2.5 w-2.5",
    value: "mt-4 text-[24px] leading-none",
    sub: "mt-2 text-[11px]",
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
  const densityClasses = getDensityClasses(density);

  const helperText = subValue ?? footerText ?? "";

  return (
    <div
      className={[
        "group relative overflow-hidden border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-gray-300 hover:shadow-md",
        densityClasses.root,
        className ?? "",
      ].join(" ")}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-start justify-between gap-3">
        <div
          className={[
            "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.06em]",
            badgeClass,
            densityClasses.badge,
          ].join(" ")}
        >
          {title}
        </div>

        <span
          className={[
            "inline-block shrink-0 rounded-full",
            densityClasses.dot,
          ].join(" ")}
          style={{ backgroundColor: accent }}
        />
      </div>

      <div
        className={[
          "font-semibold tracking-[-0.02em]",
          valueClass,
          densityClasses.value,
        ].join(" ")}
      >
        {value}
      </div>

      {helperText ? (
        <div
          className={[
            "font-medium text-gray-400",
            densityClasses.sub,
          ].join(" ")}
        >
          {helperText}
        </div>
      ) : (
        <div
          className={[
            "font-medium",
            densityClasses.sub,
          ].join(" ")}
          style={{ color: "transparent" }}
        >
          .
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, rgba(248,250,252,0.9) 0%, rgba(255,255,255,0) 65%)",
        }}
      />
    </div>
  );
}
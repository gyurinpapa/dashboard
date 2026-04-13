"use client";

import { memo, useMemo } from "react";

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
} as const;

/**
 * 성능 최적화 포인트
 * - tone별 class/style lookup을 정적 상수로 고정
 * - density별 class bundle도 정적 상수화
 * - React.memo로 동일 props 재렌더 방지
 * - glow overlay style은 tone 기준으로만 바뀌므로 useMemo로 안정화
 */

const ACCENT_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: TOKENS.metric.neutral,
  cost: TOKENS.metric.cost,
  revenue: TOKENS.metric.revenue,
  roas: TOKENS.metric.roas,
};

const VALUE_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: "text-slate-900",
  cost: "text-amber-600",
  revenue: "text-sky-600",
  roas: "text-rose-600",
};

const BADGE_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  cost: "border-amber-100 bg-amber-50 text-amber-700",
  revenue: "border-sky-100 bg-sky-50 text-sky-700",
  roas: "border-rose-100 bg-rose-50 text-rose-700",
};

const TONE_SURFACE_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral:
    "bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,1))]",
  cost:
    "bg-[linear-gradient(180deg,rgba(255,251,235,0.95),rgba(255,255,255,1))]",
  revenue:
    "bg-[linear-gradient(180deg,rgba(240,249,255,0.95),rgba(255,255,255,1))]",
  roas:
    "bg-[linear-gradient(180deg,rgba(255,241,242,0.9),rgba(255,255,255,1))]",
};

const FOOTER_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: "text-slate-400",
  cost: "text-amber-500",
  revenue: "text-sky-500",
  roas: "text-rose-500",
};

const GLOW_STYLE_BY_TONE: Record<SummaryKPICardTone, { background: string }> = {
  neutral: {
    background:
      "radial-gradient(circle at top right, rgba(148,163,184,0.12), rgba(148,163,184,0) 58%)",
  },
  cost: {
    background:
      "radial-gradient(circle at top right, rgba(245,158,11,0.14), rgba(245,158,11,0) 58%)",
  },
  revenue: {
    background:
      "radial-gradient(circle at top right, rgba(14,165,233,0.14), rgba(14,165,233,0) 58%)",
  },
  roas: {
    background:
      "radial-gradient(circle at top right, rgba(239,68,68,0.12), rgba(239,68,68,0) 58%)",
  },
};

const HOVER_OVERLAY_STYLE = {
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 62%)",
} as const;

const DENSITY_CLASSES: Record<
  SummaryKPICardDensity,
  {
    root: string;
    badge: string;
    dot: string;
    value: string;
    sub: string;
    footer: string;
  }
> = {
  report: {
    root: "rounded-[24px] px-4 py-3",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2.5 w-2.5",
    value: "mt-3 text-[24px] leading-none",
    sub: "mt-2 text-[11px]",
    footer: "mt-3 pt-3 text-[10px]",
  },
  "export-full": {
    root: "rounded-[22px] px-4 py-3.5",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2.5 w-2.5",
    value: "mt-4 text-[24px] leading-none",
    sub: "mt-2 text-[11px]",
    footer: "mt-3 pt-3 text-[10px]",
  },
  "export-wide": {
    root: "rounded-[20px] px-4 py-3",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2.5 w-2.5",
    value: "mt-3.5 text-[22px] leading-none",
    sub: "mt-1.5 text-[11px]",
    footer: "mt-3 pt-3 text-[10px]",
  },
  "export-compact": {
    root: "rounded-[16px] px-2.5 py-2",
    badge: "h-5 px-2 text-[9px]",
    dot: "mt-0.5 h-2 w-2",
    value: "mt-3 text-[16px] leading-tight",
    sub: "mt-1 text-[9px]",
    footer: "mt-2.5 pt-2 text-[8px]",
  },
  "export-side-compact": {
    root: "rounded-[14px] px-2 py-1.5",
    badge: "h-4.5 px-1.5 text-[8px]",
    dot: "mt-0.5 h-1.5 w-1.5",
    value: "mt-2.5 text-[13px] leading-tight",
    sub: "mt-1 text-[8px]",
    footer: "mt-2 pt-1.5 text-[7px]",
  },
};

function SummaryKPICardViewComponent({
  title,
  value,
  subValue,
  tone = "neutral",
  density = "report",
  footerText,
  className,
}: Props) {
  const accent = ACCENT_BY_TONE[tone];
  const valueClass = VALUE_CLASS_BY_TONE[tone];
  const badgeClass = BADGE_CLASS_BY_TONE[tone];
  const toneSurfaceClass = TONE_SURFACE_CLASS_BY_TONE[tone];
  const footerClass = FOOTER_CLASS_BY_TONE[tone];
  const densityClasses = DENSITY_CLASSES[density];

  const helperText = subValue ?? footerText ?? "";
  const hasHelperText = Boolean(helperText);
  const hasFooterRow = Boolean(subValue && footerText);

  const accentBarStyle = useMemo(() => ({ backgroundColor: accent }), [accent]);
  const dotStyle = useMemo(() => ({ backgroundColor: accent }), [accent]);
  const glowStyle = useMemo(() => GLOW_STYLE_BY_TONE[tone], [tone]);

  const rootClassName = useMemo(
    () =>
      [
        "group relative overflow-hidden border border-slate-200/90 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]",
        toneSurfaceClass,
        densityClasses.root,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" "),
    [toneSurfaceClass, densityClasses.root, className]
  );

  const badgeClassName = useMemo(
    () =>
      [
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.08em] shadow-sm",
        badgeClass,
        densityClasses.badge,
      ].join(" "),
    [badgeClass, densityClasses.badge]
  );

  const dotClassName = useMemo(
    () => ["inline-block rounded-full", densityClasses.dot].join(" "),
    [densityClasses.dot]
  );

  const valueClassName = useMemo(
    () =>
      [
        "relative font-semibold tracking-[-0.03em]",
        valueClass,
        densityClasses.value,
      ].join(" "),
    [valueClass, densityClasses.value]
  );

  const helperClassName = useMemo(
    () =>
      [
        "relative font-medium",
        footerClass,
        densityClasses.sub,
      ].join(" "),
    [footerClass, densityClasses.sub]
  );

  const footerClassName = useMemo(
    () =>
      [
        "relative border-t border-slate-200/70 font-semibold uppercase tracking-[0.08em]",
        footerClass,
        densityClasses.footer,
      ].join(" "),
    [footerClass, densityClasses.footer]
  );

  return (
    <div className={rootClassName}>
      <div className="absolute inset-x-0 top-0 h-[3px]" style={accentBarStyle} />

      <div
        className="pointer-events-none absolute inset-0 opacity-100"
        style={glowStyle}
      />

      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      <div className="relative flex items-start justify-between gap-3">
        <div className={badgeClassName}>{title}</div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={dotClassName} style={dotStyle} />
        </div>
      </div>

      <div className={valueClassName}>{value}</div>

      {hasHelperText ? <div className={helperClassName}>{helperText}</div> : null}

      {hasFooterRow ? <div className={footerClassName}>{footerText}</div> : null}

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={HOVER_OVERLAY_STYLE}
      />
    </div>
  );
}

const SummaryKPICardView = memo(SummaryKPICardViewComponent);
export default SummaryKPICardView;
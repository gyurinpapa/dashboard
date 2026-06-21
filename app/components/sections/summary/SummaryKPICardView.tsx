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
  featured?: boolean;
};

const TOKENS = {
  metric: {
    cost: "#CFC2B1",
    revenue: "#7FA6C4",
    roas: "#B7D7E3",
    neutral: "#7FA6C4",
  },
} as const;

/**
 * 성능 최적화 포인트
 * - tone별 class/style lookup을 정적 상수로 고정
 * - density별 class bundle도 정적 상수화
 * - React.memo로 동일 props 재렌더 방지
 * - style object는 tone/featured 기준으로만 바뀌므로 useMemo로 안정화
 * - hover 이동과 glow overlay를 제거해 일반 웹/PPT 캡처 결과를 동일하게 유지
 */

const ACCENT_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: TOKENS.metric.neutral,
  cost: TOKENS.metric.cost,
  revenue: TOKENS.metric.revenue,
  roas: TOKENS.metric.roas,
};

const VALUE_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: "text-slate-900",
  cost: "text-stone-700",
  revenue: "text-sky-700",
  roas: "text-cyan-700",
};

const BADGE_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral:
    "border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/22 text-slate-600",
  cost:
    "border-[var(--nature-border)] bg-[var(--nature-cream)]/52 text-stone-700",
  revenue:
    "border-[var(--nature-border-blue)] bg-[var(--nature-blue)]/10 text-sky-700",
  roas:
    "border-[var(--nature-border-blue)] bg-[var(--nature-blue-light)]/30 text-cyan-700",
};

const TONE_SURFACE_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: "bg-[var(--nature-surface)]",
  cost: "bg-[rgba(243,228,210,0.42)]",
  revenue: "bg-[rgba(183,215,227,0.20)]",
  roas: "bg-[rgba(183,215,227,0.18)]",
};

const FOOTER_CLASS_BY_TONE: Record<SummaryKPICardTone, string> = {
  neutral: "text-slate-500",
  cost: "text-stone-500",
  revenue: "text-sky-600",
  roas: "text-cyan-600",
};

const DENSITY_CLASSES: Record<
  SummaryKPICardDensity,
  {
    root: string;
    badge: string;
    dot: string;
    value: string;
    featuredValue: string;
    sub: string;
    footer: string;
  }
> = {
  report: {
    root: "rounded-[20px] px-4 py-3",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2 w-2",
    value: "mt-3 text-[24px] leading-none",
    featuredValue: "text-[26px]",
    sub: "mt-2 text-[11px]",
    footer: "mt-3 pt-3 text-[10px]",
  },
  "export-full": {
    root: "rounded-[20px] px-4 py-3.5",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2 w-2",
    value: "mt-4 text-[24px] leading-none",
    featuredValue: "text-[26px]",
    sub: "mt-2 text-[11px]",
    footer: "mt-3 pt-3 text-[10px]",
  },
  "export-wide": {
    root: "rounded-[18px] px-4 py-3",
    badge: "h-6 px-2.5 text-[10px]",
    dot: "mt-0.5 h-2 w-2",
    value: "mt-3.5 text-[22px] leading-none",
    featuredValue: "text-[24px]",
    sub: "mt-1.5 text-[11px]",
    footer: "mt-3 pt-3 text-[10px]",
  },
  "export-compact": {
    root: "rounded-[14px] px-2.5 py-2",
    badge: "h-5 px-2 text-[9px]",
    dot: "mt-0.5 h-1.5 w-1.5",
    value: "mt-3 text-[16px] leading-tight",
    featuredValue: "text-[17px]",
    sub: "mt-1 text-[9px]",
    footer: "mt-2.5 pt-2 text-[8px]",
  },
  "export-side-compact": {
    root: "rounded-[12px] px-2 py-1.5",
    badge: "h-4.5 px-1.5 text-[8px]",
    dot: "mt-0.5 h-1.5 w-1.5",
    value: "mt-2.5 text-[13px] leading-tight",
    featuredValue: "text-[14px]",
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
  featured = false,
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

  const accentBarStyle = useMemo(
    () => ({
      backgroundColor: accent,
      opacity: featured ? 1 : 0.58,
    }),
    [accent, featured]
  );

  const dotStyle = useMemo(
    () => ({
      backgroundColor: accent,
      opacity: featured ? 1 : 0.68,
    }),
    [accent, featured]
  );

  const rootClassName = useMemo(
    () =>
      [
        "relative overflow-hidden border",
        featured
          ? "border-[var(--nature-blue)] shadow-[0_6px_18px_rgba(127,166,196,0.10)]"
          : "border-[var(--nature-border-blue)] shadow-[0_3px_12px_rgba(127,166,196,0.06)]",
        toneSurfaceClass,
        densityClasses.root,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" "),
    [featured, toneSurfaceClass, densityClasses.root, className]
  );

  const badgeClassName = useMemo(
    () =>
      [
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.08em]",
        badgeClass,
        densityClasses.badge,
        featured ? "ring-1 ring-[var(--nature-blue-light)]/45" : "",
      ]
        .filter(Boolean)
        .join(" "),
    [badgeClass, densityClasses.badge, featured]
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
        featured ? densityClasses.featuredValue : "",
      ]
        .filter(Boolean)
        .join(" "),
    [
      valueClass,
      densityClasses.value,
      densityClasses.featuredValue,
      featured,
    ]
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
        "relative border-t border-[var(--nature-border)] font-semibold uppercase tracking-[0.08em]",
        footerClass,
        densityClasses.footer,
      ].join(" "),
    [footerClass, densityClasses.footer]
  );

  return (
    <div className={rootClassName}>
      <div
        className={featured ? "absolute inset-x-0 top-0 h-[3px]" : "absolute inset-x-0 top-0 h-[2px]"}
        style={accentBarStyle}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className={badgeClassName}>{title}</div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={dotClassName} style={dotStyle} />
        </div>
      </div>

      <div className={valueClassName}>{value}</div>

      {hasHelperText ? <div className={helperClassName}>{helperText}</div> : null}

      {hasFooterRow ? <div className={footerClassName}>{footerText}</div> : null}
    </div>
  );
}

const SummaryKPICardView = memo(SummaryKPICardViewComponent);
export default SummaryKPICardView;

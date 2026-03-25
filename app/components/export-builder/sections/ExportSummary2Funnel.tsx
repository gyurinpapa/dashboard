"use client";

import Summary2FunnelView, {
  type Summary2FunnelDensity,
  type Summary2FunnelStepViewItem,
} from "@/app/components/sections/summary/Summary2FunnelView";
import type {
  ExportSectionMeta,
  ExportSummary2FunnelData,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type FunnelStep = {
  label: string;
  value: string;
  widthPercent: number;
  subLabel?: string;
};

type LayoutMode = "full" | "wide" | "compact" | "side-compact";

type Props = {
  /**
   * Step 17 이전 호환용
   */
  title?: string;
  subtitle?: string;
  steps?: FunnelStep[];

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;
  data?: Partial<ExportSummary2FunnelData>;

  /**
   * 안전한 density 확장
   */
  layoutMode?: LayoutMode;
};

const DEFAULT_STEPS: FunnelStep[] = [
  {
    label: "노출",
    value: "1,248,320",
    widthPercent: 100,
    subLabel: "도달 규모",
  },
  {
    label: "클릭",
    value: "34,210",
    widthPercent: 72,
    subLabel: "CTR 2.74%",
  },
  {
    label: "전환",
    value: "1,284",
    widthPercent: 48,
    subLabel: "CVR 3.75%",
  },
];

function clampWidth(value: number) {
  if (!Number.isFinite(value)) return 40;
  return Math.max(24, Math.min(100, value));
}

function formatNumber(value?: number) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return "-";
  return safe.toLocaleString("ko-KR");
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatCurrency(value?: number) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return "-";
  return `₩${Math.round(safe).toLocaleString("ko-KR")}`;
}

function parseLooseNumber(value?: string) {
  if (!value) return NaN;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeLegacySteps(
  steps: FunnelStep[]
): ExportSummary2FunnelData["steps"] {
  return steps.map((step, index) => ({
    key: `legacy-funnel-${index}-${step.label}`,
    label: step.label,
    value: parseLooseNumber(step.value),
    displayValue: step.value,
    ratioFromPrev:
      index === 0 ? undefined : Math.max(0, Math.min(1, step.widthPercent / 100)),
  }));
}

function toFunnelDensity(layoutMode: LayoutMode): Summary2FunnelDensity {
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  if (layoutMode === "side-compact") return "export-side-compact";
  return "export-full";
}

function safeRatioToPercent(ratio?: number) {
  const safe = Number(ratio);
  if (!Number.isFinite(safe)) return NaN;
  if (safe <= 1) return safe * 100;
  return safe;
}

export default function ExportSummary2Funnel({
  title,
  subtitle,
  steps,
  meta,
  data,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary2-funnel", {
    ...(steps ? { steps: normalizeLegacySteps(steps) } : {}),
    ...(data ?? {}),
    ...(!steps && !data ? { steps: normalizeLegacySteps(DEFAULT_STEPS) } : {}),
  });

  const safeSteps = (resolvedData.steps ?? []).slice(0, 4);

  const stepValues = safeSteps.map((step) => Number(step.value || 0));
  const maxValue = Math.max(1, ...stepValues);

  const stepItems: Summary2FunnelStepViewItem[] = safeSteps.map((step, index) => {
    const numericValue = Number(step.value || 0);

    const widthPercent =
      safeSteps.length <= 1
        ? 100
        : clampWidth((numericValue / maxValue) * 100);

    let subLabel = step.ratioFromPrev != null
      ? `전단계 대비 ${safeRatioToPercent(step.ratioFromPrev).toFixed(2)}%`
      : undefined;

    if (!subLabel && step.displayValue) {
      subLabel = undefined;
    }

    return {
      key: step.key || `${step.label}-${index}`,
      label: step.label,
      value: step.displayValue || formatNumber(numericValue),
      widthPercent,
      subLabel,
    };
  });

  const impressionValue = Number(safeSteps[0]?.value ?? 0);
  const clickValue = Number(safeSteps[1]?.value ?? 0);
  const conversionValue = Number(safeSteps[2]?.value ?? 0);

  const ctr =
    safeSteps.length >= 2 && impressionValue > 0
      ? (clickValue / impressionValue) * 100
      : NaN;

  const cvr =
    safeSteps.length >= 3 && clickValue > 0
      ? (conversionValue / clickValue) * 100
      : NaN;

  /**
   * 현재 section payload에는 cost가 없으므로
   * CPA는 계산 불가.
   * share 기준으로는 stats 위치를 유지하되 값은 fallback 처리.
   */
  const cpa: number | undefined = undefined;

  const metaText = [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
    .filter(Boolean)
    .join(" · ");

  const displayTitle = title || "성과 퍼널";
  const displaySubtitle =
    subtitle ||
    (metaText
      ? `현재 필터가 적용된 데이터 기준 노출 → 클릭 → 전환 흐름 · ${metaText}`
      : "현재 필터가 적용된 데이터 기준 노출 → 클릭 → 전환 흐름");

  return (
    <Summary2FunnelView
      title={displayTitle}
      subtitle={displaySubtitle}
      steps={stepItems}
      density={toFunnelDensity(layoutMode)}
      stats={{
        ctrLabel: Number.isFinite(ctr) ? formatPercent(ctr) : "-",
        cvrLabel: Number.isFinite(cvr) ? formatPercent(cvr) : "-",
        cpaLabel: Number.isFinite(Number(cpa))
          ? formatCurrency(Number(cpa))
          : "-",
      }}
    />
  );
}
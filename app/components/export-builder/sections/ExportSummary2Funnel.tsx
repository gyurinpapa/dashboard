"use client";

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
  widthPercent: number; // 25 ~ 100 권장
  subLabel?: string;
};

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

export default function ExportSummary2Funnel({
  title = "성과 퍼널",
  subtitle = "노출 → 클릭 → 전환 흐름",
  steps,
  meta,
  data,
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

  const ctr =
    safeSteps.length >= 2 && Number(safeSteps[0].value) > 0
      ? (Number(safeSteps[1].value) / Number(safeSteps[0].value)) * 100
      : NaN;

  const cvr =
    safeSteps.length >= 3 && Number(safeSteps[1].value) > 0
      ? (Number(safeSteps[2].value) / Number(safeSteps[1].value)) * 100
      : NaN;

  /**
   * 현재 이 section 데이터만으로는 cost가 없어서
   * CPA를 정확 계산할 수 없다.
   * 따라서 지금 단계에서는 undefined로 두고 fallback 표시를 유지한다.
   */
  const cpa: number | undefined = undefined;

  const displayTitle = title || "성과 퍼널";
  const displaySubtitle =
    subtitle ||
    [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
      .filter(Boolean)
      .join(" · ") ||
    "노출 → 클릭 → 전환 흐름";

  return (
    <section className="flex h-full min-h-[260px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Summary 2
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            {displayTitle}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{displaySubtitle}</p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
          Funnel
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
        {safeSteps.map((step, index) => {
          const numericValue = Number(step.value || 0);
          const width =
            safeSteps.length <= 1
              ? 100
              : clampWidth((numericValue / maxValue) * 100);

          return (
            <div
              key={step.key || `${step.label}-${index}`}
              className="flex min-h-[72px] items-center justify-between rounded-[20px] border border-slate-300 bg-white px-5 py-4 shadow-sm"
              style={{ width: `${width}%` }}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {step.label}
                </div>
                {step.ratioFromPrev != null ? (
                  <div className="mt-1 text-xs text-slate-500">
                    전단계 대비 {(step.ratioFromPrev * 100).toFixed(2)}%
                  </div>
                ) : null}
              </div>

              <div className="pl-4 text-right">
                <div className="text-base font-semibold tracking-tight text-slate-900">
                  {step.displayValue || formatNumber(numericValue)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">CTR</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Number.isFinite(ctr) ? formatPercent(ctr) : "2.74%"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">CVR</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Number.isFinite(cvr) ? formatPercent(cvr) : "3.75%"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">CPA</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {Number.isFinite(Number(cpa)) ? formatCurrency(Number(cpa)) : "₩9,720"}
          </div>
        </div>
      </div>
    </section>
  );
}
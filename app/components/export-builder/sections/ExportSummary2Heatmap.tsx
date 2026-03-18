"use client";

import Summary2HeatmapView, {
  type Summary2HeatmapCell,
  type Summary2HeatmapDensity,
} from "@/app/components/sections/summary/Summary2HeatmapView";
import type {
  ExportSectionMeta,
  ExportSummary2HeatmapData,
} from "@/src/lib/export-builder/section-props";
import {
  buildSectionData,
  buildSectionMeta,
} from "@/src/lib/export-builder/section-resolver";

type HeatCell = {
  day: string;
  level: 0 | 1 | 2 | 3 | 4;
};

type LayoutMode = "full" | "wide" | "compact" | "side-compact";

type Props = {
  /**
   * Step 17 이전 호환용
   */
  title?: string;
  subtitle?: string;
  data?: HeatCell[] | Partial<ExportSummary2HeatmapData>;

  /**
   * Step 17-9 표준 props
   */
  meta?: Partial<ExportSectionMeta>;

  /**
   * 안전한 density 확장
   */
  layoutMode?: LayoutMode;
};

const DEFAULT_DATA: HeatCell[] = [
  { day: "1", level: 1 },
  { day: "2", level: 2 },
  { day: "3", level: 2 },
  { day: "4", level: 3 },
  { day: "5", level: 1 },
  { day: "6", level: 0 },
  { day: "7", level: 1 },

  { day: "8", level: 2 },
  { day: "9", level: 3 },
  { day: "10", level: 4 },
  { day: "11", level: 3 },
  { day: "12", level: 2 },
  { day: "13", level: 1 },
  { day: "14", level: 0 },

  { day: "15", level: 1 },
  { day: "16", level: 2 },
  { day: "17", level: 3 },
  { day: "18", level: 4 },
  { day: "19", level: 3 },
  { day: "20", level: 2 },
  { day: "21", level: 1 },

  { day: "22", level: 2 },
  { day: "23", level: 3 },
  { day: "24", level: 4 },
  { day: "25", level: 4 },
  { day: "26", level: 3 },
  { day: "27", level: 2 },
  { day: "28", level: 1 },

  { day: "29", level: 2 },
  { day: "30", level: 3 },
  { day: "31", level: 2 },
];

function isLegacyHeatCellArray(
  value: Props["data"]
): value is HeatCell[] {
  return Array.isArray(value);
}

function clampLevel(level: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(level)) return 0;
  const safe = Math.max(0, Math.min(4, Math.round(level)));
  return safe as 0 | 1 | 2 | 3 | 4;
}

function normalizeLegacyData(data: HeatCell[]): ExportSummary2HeatmapData["days"] {
  return data.map((item) => ({
    dayLabel: item.day,
    value: item.level,
    intensity: item.level / 4,
  }));
}

function normalizeIntensityToLevel(intensity?: number, value?: number): 0 | 1 | 2 | 3 | 4 {
  const safeIntensity = Number(intensity);
  if (Number.isFinite(safeIntensity)) {
    return clampLevel(safeIntensity * 4);
  }

  const safeValue = Number(value);
  if (Number.isFinite(safeValue)) {
    if (safeValue <= 4) return clampLevel(safeValue);
    return safeValue > 0 ? 3 : 0;
  }

  return 0;
}

function toHeatmapDensity(layoutMode: LayoutMode): Summary2HeatmapDensity {
  if (layoutMode === "wide") return "export-wide";
  if (layoutMode === "compact") return "export-compact";
  if (layoutMode === "side-compact") return "export-side-compact";
  return "export-full";
}

export default function ExportSummary2Heatmap({
  title = "일자별 성과 히트맵",
  subtitle = "일 단위 성과 강도 요약",
  data,
  meta,
  layoutMode = "full",
}: Props) {
  const resolvedMeta = buildSectionMeta(meta);

  const resolvedData = buildSectionData("summary2-heatmap", {
    ...(isLegacyHeatCellArray(data)
      ? { days: normalizeLegacyData(data) }
      : (data ?? {})),
    ...(!data ? { days: normalizeLegacyData(DEFAULT_DATA) } : {}),
  });

  const safeDays = (resolvedData.days ?? []).slice(0, 35);

  const bestDay =
    safeDays.reduce<{
      dayLabel: string;
      score: number;
    } | null>((best, item) => {
      const safeIntensity = Number(item.intensity);
      const score = Number.isFinite(safeIntensity)
        ? safeIntensity
        : Number(item.value || 0);

      if (!best || score > best.score) {
        return {
          dayLabel: item.dayLabel,
          score,
        };
      }
      return best;
    }, null) ?? null;

  const highDays = safeDays
    .filter((item) => normalizeIntensityToLevel(item.intensity, item.value) >= 3)
    .map((item) => item.dayLabel);

  const lowDays = safeDays
    .filter((item) => normalizeIntensityToLevel(item.intensity, item.value) <= 1)
    .map((item) => item.dayLabel);

  const displayTitle = title || "일자별 성과 히트맵";
  const displaySubtitle =
    subtitle ||
    [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
      .filter(Boolean)
      .join(" · ") ||
    "일 단위 성과 강도 요약";

  const cells: Summary2HeatmapCell[] = safeDays.map((item, index) => ({
    key: `${item.dayLabel}-${index}`,
    label: item.dayLabel,
    level: normalizeIntensityToLevel(item.intensity, item.value),
  }));

  return (
    <Summary2HeatmapView
      title={displayTitle}
      subtitle={displaySubtitle}
      cells={cells}
      density={toHeatmapDensity(layoutMode)}
      summary={{
        bestDayLabel: bestDay?.dayLabel ? `${bestDay.dayLabel}일` : "24일",
        stableRangeLabel:
          highDays.length > 0
            ? `${highDays[0]}~${highDays[highDays.length - 1]}일`
            : "17~26일",
        lowRangeLabel:
          lowDays.length > 0
            ? `${lowDays[0]}~${lowDays[lowDays.length - 1]}일`
            : "6~7일",
      }}
    />
  );
}
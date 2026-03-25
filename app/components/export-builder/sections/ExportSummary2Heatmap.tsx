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

function isLegacyHeatCellArray(value: Props["data"]): value is HeatCell[] {
  return Array.isArray(value);
}

function clampLevel(level: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(level)) return 0;
  const safe = Math.max(0, Math.min(4, Math.round(level)));
  return safe as 0 | 1 | 2 | 3 | 4;
}

function normalizeLegacyData(
  data: HeatCell[]
): ExportSummary2HeatmapData["days"] {
  return data.map((item) => ({
    dayLabel: item.day,
    value: item.level,
    intensity: item.level / 4,
  }));
}

function normalizeIntensityToLevel(
  intensity?: number,
  value?: number
): 0 | 1 | 2 | 3 | 4 {
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

function toDayNumber(label?: string) {
  const raw = String(label ?? "").trim();
  const matched = raw.match(/\d+/);
  if (!matched) return Number.NaN;
  return Number(matched[0]);
}

function toSortedDayLabels(dayLabels: string[]) {
  return [...dayLabels].sort((a, b) => {
    const na = toDayNumber(a);
    const nb = toDayNumber(b);

    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return na - nb;
    }
    return String(a).localeCompare(String(b), "ko");
  });
}

function toRangeLabel(dayLabels: string[], fallback: string) {
  const sorted = toSortedDayLabels(dayLabels);
  if (!sorted.length) return fallback;
  if (sorted.length === 1) return `${sorted[0]}일`;
  return `${sorted[0]}~${sorted[sorted.length - 1]}일`;
}

export default function ExportSummary2Heatmap({
  title,
  subtitle,
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

  const cells: Summary2HeatmapCell[] = safeDays.map((item, index) => ({
    key: `${item.dayLabel}-${index}`,
    label: item.dayLabel,
    level: normalizeIntensityToLevel(item.intensity, item.value),
  }));

  const sortedByScore = [...safeDays].sort((a, b) => {
    const aScore = Number.isFinite(Number(a.intensity))
      ? Number(a.intensity)
      : Number(a.value || 0);
    const bScore = Number.isFinite(Number(b.intensity))
      ? Number(b.intensity)
      : Number(b.value || 0);
    return bScore - aScore;
  });

  const bestDay = sortedByScore[0] ?? null;

  const highDays = safeDays
    .filter((item) => normalizeIntensityToLevel(item.intensity, item.value) >= 3)
    .map((item) => item.dayLabel);

  const lowDays = safeDays
    .filter((item) => normalizeIntensityToLevel(item.intensity, item.value) <= 1)
    .map((item) => item.dayLabel);

  const activeDays = safeDays.filter(
    (item) => normalizeIntensityToLevel(item.intensity, item.value) > 0
  ).length;

  const metaText = [resolvedMeta.reportTypeName, resolvedMeta.periodLabel]
    .filter(Boolean)
    .join(" · ");

  const displayTitle = title || "일자별 성과 히트맵";
  const displaySubtitle =
    subtitle ||
    (metaText
      ? `현재 필터가 적용된 데이터 기준 일자별 성과 강도 · ${metaText}`
      : "현재 필터가 적용된 데이터 기준 일자별 성과 강도");

  return (
    <Summary2HeatmapView
      title={displayTitle}
      subtitle={displaySubtitle}
      cells={cells}
      density={toHeatmapDensity(layoutMode)}
      summary={{
        bestDayLabel: bestDay?.dayLabel ? `${bestDay.dayLabel}일` : "-",
        stableRangeLabel: toRangeLabel(
          highDays,
          activeDays > 0 ? `${activeDays}일 활성` : "-"
        ),
        lowRangeLabel: toRangeLabel(lowDays, "낮은 구간 없음"),
      }}
    />
  );
}
"use client";

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

function getLevelClass(level: 0 | 1 | 2 | 3 | 4) {
  switch (level) {
    case 4:
      return "bg-slate-700 text-white border-slate-700";
    case 3:
      return "bg-slate-500 text-white border-slate-500";
    case 2:
      return "bg-slate-300 text-slate-800 border-slate-300";
    case 1:
      return "bg-slate-200 text-slate-700 border-slate-200";
    case 0:
    default:
      return "bg-slate-100 text-slate-400 border-slate-200";
  }
}

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

export default function ExportSummary2Heatmap({
  title = "일자별 성과 히트맵",
  subtitle = "일 단위 성과 강도 요약",
  data,
  meta,
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

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
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

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-slate-200 bg-slate-100" />
            낮음
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-slate-400 bg-slate-500" />
            높음
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
          <div>Sun</div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {safeDays.map((item, index) => {
            const level = normalizeIntensityToLevel(item.intensity, item.value);

            return (
              <div
                key={`${item.dayLabel}-${index}`}
                className={[
                  "flex aspect-square items-center justify-center rounded-xl border text-xs font-semibold transition",
                  getLevelClass(level),
                ].join(" ")}
              >
                {item.dayLabel}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">최고 성과일</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {bestDay?.dayLabel ? `${bestDay.dayLabel}일` : "24일"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">안정 구간</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {highDays.length > 0
              ? `${highDays[0]}~${highDays[highDays.length - 1]}일`
              : "17~26일"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] text-slate-500">집중 관리 필요</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {lowDays.length > 0
              ? `${lowDays[0]}~${lowDays[lowDays.length - 1]}일`
              : "6~7일"}
          </div>
        </div>
      </div>
    </section>
  );
}
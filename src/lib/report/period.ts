// src/lib/report/period.ts
import { addDays, parseDateLoose, toYMDLocal } from "./date";

export type ReportPeriodPreset =
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days"
  | "custom";

export type ReportPeriod = {
  preset: ReportPeriodPreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

export type ReportPeriodRangeMode =
  | "report-range"
  | "report-month"
  | "trailing-3-months-from-report-end";

export type PeriodFilterableRow = {
  date?: any;
  report_date?: any;
  day?: any;
  segment_date?: any;
  stat_date?: any;
  period_start?: any;
  [key: string]: any;
};

export const REPORT_PERIOD_PRESETS: ReportPeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
  "custom",
];

export const DEFAULT_REPORT_PERIOD_PRESET: ReportPeriodPreset = "this_month";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function clampPeriodOrder(startDate: string, endDate: string): {
  startDate: string;
  endDate: string;
} {
  if (!startDate || !endDate) return { startDate, endDate };
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: endDate, endDate: startDate };
}

function formatYmdToDots(ymd: string): string {
  if (!ymd) return "";
  return String(ymd).replaceAll("-", ".");
}

export function getRowDateValue(row: PeriodFilterableRow): unknown {
  return (
    row?.date ??
    row?.report_date ??
    row?.day ??
    row?.segment_date ??
    row?.stat_date ??
    row?.period_start ??
    null
  );
}

export function getRowDate(row: PeriodFilterableRow): Date | null {
  return parseDateLoose(getRowDateValue(row));
}

function getRowDateYmd(row: PeriodFilterableRow): string {
  return normalizeYmd(getRowDateValue(row));
}

export function normalizeYmd(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : toYMDLocal(value);
  }

  const parsed = parseDateLoose(value);
  return parsed ? toYMDLocal(parsed) : "";
}

export function isValidReportPeriod(
  period: Partial<ReportPeriod> | null | undefined
): boolean {
  const startDate = normalizeYmd(period?.startDate);
  const endDate = normalizeYmd(period?.endDate);
  if (!startDate || !endDate) return false;
  return startDate <= endDate;
}

export function resolvePresetPeriod(args?: {
  preset?: ReportPeriodPreset;
  today?: Date;
  startDate?: string;
  endDate?: string;
}): ReportPeriod {
  const preset = args?.preset ?? DEFAULT_REPORT_PERIOD_PRESET;

  const todayRaw = args?.today instanceof Date ? args.today : new Date();
  const today = Number.isNaN(todayRaw.getTime()) ? new Date() : todayRaw;
  const todayYmd = toYMDLocal(today);

  if (preset === "custom") {
    const startDate = normalizeYmd(args?.startDate);
    const endDate = normalizeYmd(args?.endDate);

    if (startDate && endDate) {
      const ordered = clampPeriodOrder(startDate, endDate);
      return {
        preset: "custom",
        startDate: ordered.startDate,
        endDate: ordered.endDate,
      };
    }

    const fallbackStart = toYMDLocal(startOfMonth(today));
    return {
      preset: "custom",
      startDate: fallbackStart,
      endDate: todayYmd,
    };
  }

  if (preset === "this_month") {
    return {
      preset,
      startDate: toYMDLocal(startOfMonth(today)),
      endDate: todayYmd,
    };
  }

  if (preset === "last_month") {
    const base = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return {
      preset,
      startDate: toYMDLocal(startOfMonth(base)),
      endDate: toYMDLocal(endOfMonth(base)),
    };
  }

  if (preset === "last_7_days") {
    return {
      preset,
      startDate: toYMDLocal(addDays(today, -6)),
      endDate: todayYmd,
    };
  }

  if (preset === "last_30_days") {
    return {
      preset,
      startDate: toYMDLocal(addDays(today, -29)),
      endDate: todayYmd,
    };
  }

  return {
    preset: DEFAULT_REPORT_PERIOD_PRESET,
    startDate: toYMDLocal(startOfMonth(today)),
    endDate: todayYmd,
  };
}

export function makeReportPeriod(
  input?: Partial<ReportPeriod>
): ReportPeriod {
  const preset = input?.preset ?? DEFAULT_REPORT_PERIOD_PRESET;

  if (preset === "custom") {
    return resolvePresetPeriod({
      preset: "custom",
      startDate: input?.startDate,
      endDate: input?.endDate,
    });
  }

  const startDate = normalizeYmd(input?.startDate);
  const endDate = normalizeYmd(input?.endDate);

  if (startDate && endDate) {
    const ordered = clampPeriodOrder(startDate, endDate);
    return {
      preset,
      startDate: ordered.startDate,
      endDate: ordered.endDate,
    };
  }

  return resolvePresetPeriod({ preset });
}

export function getRowsDateRange<T extends PeriodFilterableRow>(rows: T[]): {
  startDate: string;
  endDate: string;
} | null {
  let min = "";
  let max = "";

  for (const row of rows ?? []) {
    const ymd = getRowDateYmd(row);
    if (!ymd) continue;

    if (!min || ymd < min) min = ymd;
    if (!max || ymd > max) max = ymd;
  }

  if (!min || !max) return null;

  return {
    startDate: min,
    endDate: max,
  };
}

export function filterRowsByReportPeriod<T extends PeriodFilterableRow>(
  rows: T[],
  period: ReportPeriod
): T[] {
  const safeRows = rows ?? [];
  if (safeRows.length === 0) return [];

  const safePeriod = makeReportPeriod(period);
  const startDate = safePeriod.startDate;
  const endDate = safePeriod.endDate;

  const result: T[] = [];

  for (let i = 0; i < safeRows.length; i += 1) {
    const row = safeRows[i];
    const ymd = getRowDateYmd(row);
    if (!ymd) continue;
    if (ymd < startDate || ymd > endDate) continue;
    result.push(row);
  }

  return result;
}

export function getPeriodLabel(period: ReportPeriod): string {
  const safePeriod = makeReportPeriod(period);
  if (!safePeriod.startDate || !safePeriod.endDate) return "";
  return `${formatYmdToDots(safePeriod.startDate)} ~ ${formatYmdToDots(
    safePeriod.endDate
  )}`;
}

export function getReportMonthRange(period: ReportPeriod): {
  startDate: string;
  endDate: string;
} {
  const safePeriod = makeReportPeriod(period);
  const base =
    parseDateLoose(safePeriod.endDate) ||
    parseDateLoose(safePeriod.startDate) ||
    new Date();

  return {
    startDate: toYMDLocal(startOfMonth(base)),
    endDate: toYMDLocal(endOfMonth(base)),
  };
}

export function getTrailing3MonthRangeFromPeriodEnd(period: ReportPeriod): {
  startDate: string;
  endDate: string;
} {
  const safePeriod = makeReportPeriod(period);
  const endBase =
    parseDateLoose(safePeriod.endDate) ||
    parseDateLoose(safePeriod.startDate) ||
    new Date();

  const startBase = new Date(endBase.getFullYear(), endBase.getMonth() - 2, 1);

  return {
    startDate: toYMDLocal(startBase),
    endDate: toYMDLocal(endOfMonth(endBase)),
  };
}

export function filterRowsByRangeMode<T extends PeriodFilterableRow>(
  rows: T[],
  period: ReportPeriod,
  rangeMode: ReportPeriodRangeMode
): T[] {
  if (rangeMode === "report-month") {
    const monthRange = getReportMonthRange(period);
    return filterRowsByReportPeriod(rows, {
      preset: "custom",
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
    });
  }

  if (rangeMode === "trailing-3-months-from-report-end") {
    const range = getTrailing3MonthRangeFromPeriodEnd(period);
    return filterRowsByReportPeriod(rows, {
      preset: "custom",
      startDate: range.startDate,
      endDate: range.endDate,
    });
  }

  return filterRowsByReportPeriod(rows, period);
}
export type ExportPeriodPreset =
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "custom";

export type ExportPeriod = {
  preset: ExportPeriodPreset;
  start: string | null; // YYYY-MM-DD
  end: string | null;   // YYYY-MM-DD
  label: string | null;
};

type AnyRow = Record<string, any>;

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

export function parseYmd(value?: string | null): Date | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function buildExportPeriodLabel(
  start?: string | null,
  end?: string | null
): string {
  const s = start ? String(start).slice(0, 10) : "";
  const e = end ? String(end).slice(0, 10) : "";

  if (s && e) return `${s} ~ ${e}`;
  if (s) return `${s} ~`;
  if (e) return `~ ${e}`;
  return "기간 미설정";
}

export function resolveExportPeriodPreset(
  preset: ExportPeriodPreset,
  baseDate = new Date()
): ExportPeriod {
  const today = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  );

  if (preset === "this_month") {
    const start = toYmd(startOfMonth(today));
    const end = toYmd(endOfMonth(today));
    return {
      preset,
      start,
      end,
      label: buildExportPeriodLabel(start, end),
    };
  }

  if (preset === "last_month") {
    const lastMonthBase = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const start = toYmd(startOfMonth(lastMonthBase));
    const end = toYmd(endOfMonth(lastMonthBase));
    return {
      preset,
      start,
      end,
      label: buildExportPeriodLabel(start, end),
    };
  }

  if (preset === "last_7_days") {
    const end = toYmd(today);
    const start = toYmd(addDays(today, -6));
    return {
      preset,
      start,
      end,
      label: buildExportPeriodLabel(start, end),
    };
  }

  if (preset === "last_14_days") {
    const end = toYmd(today);
    const start = toYmd(addDays(today, -13));
    return {
      preset,
      start,
      end,
      label: buildExportPeriodLabel(start, end),
    };
  }

  if (preset === "last_30_days") {
    const end = toYmd(today);
    const start = toYmd(addDays(today, -29));
    return {
      preset,
      start,
      end,
      label: buildExportPeriodLabel(start, end),
    };
  }

  return {
    preset: "custom",
    start: null,
    end: null,
    label: "기간 미설정",
  };
}

export function getRowDateValue(row: AnyRow): string | null {
  const candidates = [
    row?.date,
    row?.day,
    row?.report_date,
    row?.stat_date,
    row?.segment_date,
  ];

  for (const v of candidates) {
    if (!v) continue;
    const s = String(v).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }

  return null;
}

export function getExportRowsDateRange(rows: AnyRow[]): {
  start: string | null;
  end: string | null;
} {
  let min: string | null = null;
  let max: string | null = null;

  for (const row of rows || []) {
    const d = getRowDateValue(row);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }

  return { start: min, end: max };
}

export function normalizeExportPeriod(period: Partial<ExportPeriod>): ExportPeriod {
  const start = period.start ?? null;
  const end = period.end ?? null;
  const preset = (period.preset ?? "custom") as ExportPeriodPreset;

  return {
    preset,
    start,
    end,
    label: buildExportPeriodLabel(start, end),
  };
}

export function createInitialExportPeriod(
  rows: AnyRow[],
  fallbackPreset: ExportPeriodPreset = "last_30_days"
): ExportPeriod {
  const range = getExportRowsDateRange(rows);

  if (range.start && range.end) {
    return {
      preset: "custom",
      start: range.start,
      end: range.end,
      label: buildExportPeriodLabel(range.start, range.end),
    };
  }

  return resolveExportPeriodPreset(fallbackPreset);
}

export function filterRowsByExportPeriod<T extends AnyRow>(
  rows: T[],
  period?: Partial<ExportPeriod> | null
): T[] {
  if (!rows?.length) return [];

  const start = period?.start ? String(period.start).slice(0, 10) : null;
  const end = period?.end ? String(period.end).slice(0, 10) : null;

  if (!start && !end) return rows;

  return rows.filter((row) => {
    const d = getRowDateValue(row);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}
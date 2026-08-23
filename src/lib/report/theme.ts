export const REPORT_THEME_VALUES = ["light", "studio"] as const;

export type ReportTheme = (typeof REPORT_THEME_VALUES)[number];

export const DEFAULT_REPORT_THEME: ReportTheme = "light";

export function normalizeReportTheme(value: unknown): ReportTheme {
  const normalized = String(value ?? "").trim().toLowerCase();

  return normalized === "studio" ? "studio" : DEFAULT_REPORT_THEME;
}

export function pickReportThemeFromMeta(meta: unknown): ReportTheme {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return DEFAULT_REPORT_THEME;
  }

  return normalizeReportTheme(
    (meta as Record<string, unknown>).report_theme,
  );
}

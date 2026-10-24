/** Public schedule metadata; credentials and run leases never enter this object. */
export const META_ADS_DAILY_CONTRACT = "meta_daily_v1" as const;
export type MetaAdsDailyPolicy = { contract: typeof META_ADS_DAILY_CONTRACT; enabled: true;
  start_date: string; time_zone: "Asia/Seoul"; schedule: "0 20 * * *"; lookback_days: 7 };
export function readMetaAdsDailyPolicy(value: unknown): MetaAdsDailyPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (p.contract !== META_ADS_DAILY_CONTRACT || p.enabled !== true || p.time_zone !== "Asia/Seoul" ||
    p.schedule !== "0 20 * * *" || p.lookback_days !== 7 || typeof p.start_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.start_date) || !Number.isFinite(Date.parse(p.start_date)) ||
    new Date(p.start_date).toISOString().slice(0, 10) !== p.start_date) return null;
  return { contract: META_ADS_DAILY_CONTRACT, enabled: true, start_date: p.start_date,
    time_zone: "Asia/Seoul", schedule: "0 20 * * *", lookback_days: 7 };
}

export function metaAdsDailyStatusText(meta: Record<string, unknown>): string | null {
  if (!readMetaAdsDailyPolicy(meta.meta_ads_daily)) return null;
  const value = meta.meta_ads_daily_status;
  const status = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const through = typeof status.through_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(status.through_date) ? status.through_date : null;
  const prefix = "매일 새벽 5시(한국시간) 자동 수집";
  if (status.status === "pending") return `${prefix} · ${status.last_success_at ? "수집 대기" : "첫 수집 대기"}`;
  if (status.status === "processing") return `${prefix} · ${status.last_success_at ? "갱신 중" : "첫 수집 중"}`;
  if (status.status === "failed") return `${prefix} · 최근 수집 실패${through ? ` · ${through}까지 데이터 보관` : ""}`;
  if (status.status === "partial") return `${prefix} · 과거 데이터 수집 중${through ? ` · ${through}까지 완료` : ""}`;
  return `${prefix}${status.status === "done" && through ? ` · ${through}까지 수집 완료` : " · 첫 수집 대기"}`;
}

export function metaAdsSetupDates(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const offset = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
  return { maxDate: offset(1), minDate: offset(366), defaultStart: offset(30) };
}

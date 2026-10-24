import { isMetaAdsContactConnection, readMetaAdsContactPolicy } from "./meta-ads-contact-policy";

export const NAVER_META_REPORT_CONTRACT = "naver_meta_contact_v1" as const;
export const MANUAL_REPORT_CONNECTIONS_TABLE = "manual_report_media_connections" as const;

export function isNaverMetaReportMeta(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = (value as Record<string, unknown>).data_source;
  return !!source && typeof source === "object" && !Array.isArray(source) &&
    (source as Record<string, unknown>).aggregation_contract === NAVER_META_REPORT_CONTRACT;
}

type Connection = Parameters<typeof isMetaAdsContactConnection>[0] & { id: string };
export function isNaverMetaSelection(connections: readonly Connection[]): boolean {
  const meta = connections.filter(c => c.provider === "meta_ads");
  const policy = meta.length === 1 ? readMetaAdsContactPolicy(meta[0].meta.meta_ads_reporting, meta[0].external_account_id) : null;
  return policy?.currency === "KRW" && policy.time_zone === "Asia/Seoul" && connections.length >= 2 && connections.length <= 16 && meta.length === 1 &&
    isMetaAdsContactConnection(meta[0]) &&
    connections.every(c => c.provider === "meta_ads" ||
      (c.provider === "naver_searchad" && c.status === "active" && c.has_credentials)) &&
    new Set(connections.map(c => `${c.provider}:${c.external_account_id}`)).size === connections.length;
}

/** Checkbox toggles only the chosen item; selecting another medium never clears existing choices. */
export function toggleReportConnectionSelection(current: readonly string[], connectionId: string): string[] {
  return current.includes(connectionId) ? current.filter(id => id !== connectionId)
    : current.length < 16 ? [...current, connectionId] : [...current];
}

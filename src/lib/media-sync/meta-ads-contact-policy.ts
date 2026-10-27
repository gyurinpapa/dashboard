/** Public configuration only. Enabling this policy is an explicit server-side account decision.
 * It enables bounded manual DB-acquisition snapshots, never the shared worker/scheduler.
 */
export const META_ADS_CONTACT_CONTRACT = "meta_contact_snapshot_v1" as const;
export type MetaAdsContactPolicy = Readonly<{
  contract: typeof META_ADS_CONTACT_CONTRACT;
  enabled: true;
  external_account_id: string;
  currency: string;
  time_zone: string;
  conversion_field: "conversions";
  conversion_action_type: "contact_website";
  missing_conversion: "zero_after_complete_reconciliation";
  revenue: "not_provided";
  attribution: "platform_default";
  report_type: "db";
  instant_form?: Readonly<{ field: "actions"; action_type: "onsite_conversion.lead_grouped" }>;
}>;
export function readMetaAdsContactPolicy(value: unknown, accountId: string): MetaAdsContactPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const instant = p.instant_form as Record<string, unknown> | undefined;
  if (Object.hasOwn(p, "instant_form") && (!instant || typeof instant !== "object" || Array.isArray(instant) ||
    instant.field !== "actions" || instant.action_type !== "onsite_conversion.lead_grouped" || Object.keys(instant).length !== 2)) return null;
  if (p.contract !== META_ADS_CONTACT_CONTRACT || p.enabled !== true || p.external_account_id !== accountId ||
      !/^[1-9][0-9]{0,29}$/.test(accountId) || typeof p.currency !== "string" || !/^[A-Z]{3}$/.test(p.currency) ||
      typeof p.time_zone !== "string" || p.time_zone.length > 100 ||
      p.conversion_field !== "conversions" || p.conversion_action_type !== "contact_website" ||
      p.missing_conversion !== "zero_after_complete_reconciliation" || p.revenue !== "not_provided" ||
      p.attribution !== "platform_default" || p.report_type !== "db" || Object.keys(p).length !== (instant ? 12 : 11)) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: p.time_zone }); } catch { return null; }
  return { contract: META_ADS_CONTACT_CONTRACT, enabled: true, external_account_id: accountId,
    currency: p.currency, time_zone: p.time_zone, conversion_field: "conversions", conversion_action_type: "contact_website",
    missing_conversion: "zero_after_complete_reconciliation", revenue: "not_provided", attribution: "platform_default", report_type: "db",
    ...(instant ? { instant_form: { field: "actions", action_type: "onsite_conversion.lead_grouped" } as const } : {}) };
}
export function isMetaAdsContactConnection(value: { provider: string; status: string; has_credentials: boolean;
  last_verified_at: string | null; external_account_id: string; meta: Record<string, unknown> }): boolean {
  return value.provider === "meta_ads" && value.status === "active" && value.has_credentials &&
    Boolean(value.last_verified_at && Number.isFinite(Date.parse(value.last_verified_at))) &&
    readMetaAdsContactPolicy(value.meta.meta_ads_reporting, value.external_account_id) !== null;
}

export function metaAdsContactSyncErrorMessage(code: string): string | null {
  const messages: Record<string, string> = {
    META_CONTACT_POLICY_REQUIRED: "이 Meta 계정의 웹사이트 문의 집계 기준을 먼저 확인해야 합니다.",
    META_CONTACT_REPORT_REQUIRED: "Meta 웹사이트 문의는 Meta 단독 또는 네이버·Meta 통합 DB획득 보고서에서 수집할 수 있습니다.",
    META_CONTACT_RECONCILIATION_FAILED: "Meta 계정 합계와 소재·일별 합계가 확인되지 않아 저장하지 않았습니다. 별도 점검 페이지에서 확인해 주세요.",
    META_CONTACT_CHANGED: "수집 중 보고서 또는 연결 설정이 변경됐습니다. 새로고침 후 다시 실행해 주세요.",
    META_CONTACT_SYNC_FAILED: "Meta 동기화 결과를 확인하지 못했습니다. 새로고침하여 최신 동기화 상태를 확인해 주세요.",
    NAVER_META_COVERAGE_INCOMPLETE: "선택 기간에 네이버 수집이 완료되지 않은 날짜가 있습니다. 네이버 수집 완료 기간을 확인한 뒤 다시 실행해 주세요.",
    NAVER_META_FACTS_CHANGED: "네이버 데이터가 갱신 중입니다. 잠시 후 다시 실행해 주세요.",
    NAVER_META_TOO_MANY_ROWS: "통합 데이터가 한 번에 반영할 수 있는 범위를 초과했습니다. 기간을 줄여 주세요.",
    META_CONTACT_INVALID_RANGE: "Meta 수집 기간은 어제까지, 최대 31일로 설정해 주세요.",
  };
  return messages[code] ?? null;
}

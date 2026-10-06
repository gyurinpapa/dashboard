/** Versioned server quote. A price change requires a new catalog version. */
export const CATALOG_VERSION = "etrylue-preview-20261006";
export const plans = {
  advertiser: { name: "광고주", limit: 1, once: 39000, monthly: 29000, description: "선택한 광고주 1개" },
  workspace: { name: "워크스페이스", limit: 5, once: 129000, monthly: 99000, description: "선택한 워크스페이스 · 광고주 최대 5개" },
  company: { name: "회사", limit: 20, once: 349000, monthly: 279000, description: "선택한 회사의 워크스페이스 · 광고주 총 20개" },
} as const;
export type Scope = keyof typeof plans;
export type BillingMode = "once" | "monthly";
export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && Object.hasOwn(plans, value);
}
export function isMode(value: unknown): value is BillingMode {
  return value === "once" || value === "monthly";
}
export function quote(scope: Scope, mode: BillingMode) {
  return { version: CATALOG_VERSION, amount: plans[scope][mode], currency: "KRW" as const,
    name: `Etrylue ${plans[scope].name} ${mode === "once" ? "1개월 이용권" : "월 구독"}` };
}
export function won(amount: number) { return `${amount.toLocaleString("ko-KR")}원`; }

/** Calendar-month anniversary in Korea; preserve anchor day (Jan 31 -> Feb 28 -> Mar 31). */
export function periodEnd(anchor: string, cycle: number): string {
  if (!Number.isInteger(cycle) || cycle < 1) throw new Error("INVALID_CYCLE");
  const kst = new Date(new Date(anchor).getTime() + 9 * 3600000);
  if (!Number.isFinite(kst.getTime())) throw new Error("INVALID_ANCHOR");
  const month = kst.getUTCMonth() + cycle;
  const lastDay = new Date(Date.UTC(kst.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(kst.getUTCFullYear(), month, Math.min(kst.getUTCDate(), lastDay),
    kst.getUTCHours() - 9, kst.getUTCMinutes(), kst.getUTCSeconds(), kst.getUTCMilliseconds())).toISOString();
}

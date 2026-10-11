/** Approved 2026-10-11. Server-rendered estimate; the DB fixes the final request time/amount. */
export const REFUND_POLICY_VERSION = "2026-10-11";
export function refundAmount(amount: number, start: string | null, end: string | null, requestedAt: number): number {
  const from = Date.parse(start || ""), until = Date.parse(end || "");
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isFinite(from) || !Number.isFinite(until) ||
      !Number.isFinite(requestedAt) || until <= from || requestedAt < from || requestedAt >= until) return 0;
  if (requestedAt <= from + 7 * 24 * 60 * 60 * 1000) return amount;
  return Math.min(amount, Math.ceil(amount * (until - requestedAt) / (until - from)));
}

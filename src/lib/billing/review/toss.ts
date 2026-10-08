import { BillingError, providerKeys } from "./config";
import type { BillingMode } from "../catalog";

export type Payment = {
  paymentKey: string; orderId: string; totalAmount: number; balanceAmount: number;
  currency: string; status: string; approvedAt: string; type: string;
};
export function verifiedPayment(value: unknown, order: { id: string; amount: number }, paymentKey?: string): Payment {
  const p = value as Partial<Payment> | null;
  if (!p || p.orderId !== order.id || p.totalAmount !== order.amount || p.currency !== "KRW" ||
      typeof p.paymentKey !== "string" || !p.paymentKey || (paymentKey && p.paymentKey !== paymentKey) ||
      !["DONE", "CANCELED", "PARTIAL_CANCELED"].includes(p.status || "") ||
      typeof p.balanceAmount !== "number" || !Number.isSafeInteger(p.balanceAmount) || p.balanceAmount < 0 || p.balanceAmount > order.amount ||
      !Number.isFinite(Date.parse(p.approvedAt || "")) ||
      (p.status === "DONE" && p.balanceAmount !== order.amount) ||
      (p.status === "CANCELED" && p.balanceAmount !== 0))
    throw new BillingError("PAYMENT_VERIFICATION_FAILED", 409);
  return p as Payment;
}

/** No raw provider errors or payloads are logged or returned to the browser. */
export async function toss(mode: BillingMode, path: string, body?: object, idempotency?: string) {
  const { secret } = providerKeys(mode);
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      "Content-Type": "application/json", ...(idempotency ? { "Idempotency-Key": idempotency } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new BillingError("PAYMENT_PROVIDER_RETRY_REQUIRED", 502);
  return response.json() as Promise<unknown>;
}

import { timingSafeEqual } from "node:crypto";
import { reconcile } from "@/lib/billing/server";
import { BillingError, hash, testConfig, uuid } from "@/lib/billing/config";
import { body, failure, json } from "@/lib/billing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    testConfig();
    // Configure this secret URL only in the TEST merchant webhook dashboard. Never render it.
    const expected = process.env.BILLING_TEST_WEBHOOK_TOKEN || "";
    const supplied = new URL(request.url).searchParams.get("token") || "";
    if (expected.length < 32 || !timingSafeEqual(Buffer.from(hash(expected)), Buffer.from(hash(supplied))))
      throw new BillingError("INVALID_WEBHOOK", 403);
    const input = await body(request);
    if (input.eventType !== "PAYMENT_STATUS_CHANGED") return json({ ok: true });
    const data = input.data as Record<string, unknown> | undefined;
    if (!data || !uuid(data.orderId)) return json({ ok: true });
    // The notification is only a hint: never use its status, amount, purchaser, or paymentKey.
    await reconcile(data.orderId);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof BillingError && error.code === "CHARGE_NOT_FOUND") return json({ ok: true });
    return failure(error); // A failure remains retryable; never acknowledge before persisting.
  }
}

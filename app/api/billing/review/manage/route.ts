import { actor, manage } from "@/lib/billing/review/server";
import { BillingError, uuid } from "@/lib/billing/review/config";
import { body, failure, json } from "@/lib/billing/review/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const userId = await actor(request), input = await body(request);
    if (!uuid(input.orderId) || !["reconcile", "refund"].includes(String(input.action))) throw new BillingError("INVALID_ACTION");
    await manage(userId, input.orderId, String(input.action));
    return json({ ok: true });
  } catch (error) { return failure(error); }
}

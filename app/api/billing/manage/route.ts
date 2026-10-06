import { actor, manage } from "@/lib/billing/server";
import { BillingError, uuid } from "@/lib/billing/config";
import { body, failure, json } from "@/lib/billing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const userId = await actor(request), input = await body(request);
    if (!uuid(input.orderId) || typeof input.action !== "string") throw new BillingError("INVALID_ACTION");
    await manage(userId, input.orderId, input.action);
    return json({ ok: true });
  } catch (error) { return failure(error); }
}

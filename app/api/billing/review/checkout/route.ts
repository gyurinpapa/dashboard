import { actor, checkout } from "@/lib/billing/review/server";
import { isScope } from "@/lib/billing/catalog";
import { BillingError, uuid } from "@/lib/billing/review/config";
import { body, failure, json } from "@/lib/billing/review/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const userId = await actor(request), input = await body(request);
    if (!uuid(input.id) || !uuid(input.targetId) || !isScope(input.scope) || input.mode !== "once" || input.consent !== true)
      throw new BillingError("INVALID_CHECKOUT");
    // Reject user-supplied prices instead of silently appearing to honor them.
    if ("amount" in input || "price" in input || "userId" in input) throw new BillingError("INVALID_CHECKOUT");
    return json(await checkout(userId, input.id, input.scope, input.mode, input.targetId));
  } catch (error) { return failure(error); }
}

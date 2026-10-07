import { actor, targets } from "@/lib/billing/server";
import { failure, json } from "@/lib/billing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json(await targets(await actor())); }
  catch (error) { return failure(error); }
}

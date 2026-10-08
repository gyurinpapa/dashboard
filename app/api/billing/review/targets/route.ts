import { actor, targets } from "@/lib/billing/review/server";
import { failure, json } from "@/lib/billing/review/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json(await targets(await actor())); }
  catch (error) { return failure(error); }
}

import { NextResponse } from "next/server";
import { actor, callback } from "@/lib/billing/review/server";
import { reviewConfig, uuid } from "@/lib/billing/review/config";
import { failure, privateHeaders } from "@/lib/billing/review/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  // API callback has no HTML/GTM/analytics. Never forward provider keys to a rendered page.
  let origin: string;
  try { origin = reviewConfig().origin; } catch (error) { return failure(error); }
  const params = new URL(request.url).searchParams;
  let result = "review";
  try { await callback(await actor(), params); result = params.get("failed") ? "interrupted" : "checked"; }
  catch { /* Sanitized result; reconciliation remains available to the authorized purchaser. */ }
  const url = new URL("/billing/review/result", origin);
  if (uuid(params.get("order"))) url.searchParams.set("order", params.get("order")!);
  url.searchParams.set("result", result);
  return NextResponse.redirect(url, { status: 303, headers: privateHeaders });
}

import { NextResponse } from "next/server";
import { BillingError } from "./config";
export const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: privateHeaders });
}
export function failure(error: unknown) {
  return json({ ok: false, error: error instanceof BillingError ? error.code : "BILLING_UNAVAILABLE" },
    error instanceof BillingError ? error.status : 503);
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BillingError("JSON_REQUIRED", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new BillingError("BODY_REQUIRED");
  let bytes = 0, content = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) { await reader.cancel(); throw new BillingError("BODY_TOO_LARGE", 413); }
    content += decoder.decode(value, { stream: true });
  }
  try {
    const data = JSON.parse(content + decoder.decode());
    if (!data || Array.isArray(data) || typeof data !== "object") throw new Error();
    return data;
  } catch { throw new BillingError("INVALID_JSON"); }
}

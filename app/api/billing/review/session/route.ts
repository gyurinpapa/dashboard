import type { NextRequest } from "next/server";
import { BillingError, reviewConfig } from "@/lib/billing/review/config";
import { REVIEW_COOKIE, reviewAuthClient, type ReviewCookie } from "@/lib/billing/review/auth";
import { body, failure, json } from "@/lib/billing/review/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const config = reviewConfig();
    if (request.headers.get("origin") !== config.origin) throw new BillingError("INVALID_ORIGIN", 403);
    const input = await body(request);
    const updates: ReviewCookie[] = [];
    const client = reviewAuthClient(request.cookies.getAll(), values => updates.push(...values));
    if (input.action === "logout") {
      await client.auth.signOut({ scope: "local" });
      const response = json({ ok: true });
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name === REVIEW_COOKIE || cookie.name.startsWith(`${REVIEW_COOKIE}.`))
          response.cookies.set(cookie.name, "", { path: "/", httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", maxAge: 0 });
      }
      return response;
    }
    if (typeof input.email !== "string" || input.email.length > 254 || typeof input.password !== "string" || input.password.length > 1024)
      throw new BillingError("LOGIN_FAILED", 401);
    const { data, error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.user || !config.testers.includes(data.user.id)) {
      if (data.session) await client.auth.signOut({ scope: "local" });
      throw new BillingError("LOGIN_FAILED", 401);
    }
    const response = json({ ok: true });
    for (const cookie of updates) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) { return failure(error); }
}

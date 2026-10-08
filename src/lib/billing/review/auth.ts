import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { reviewConfig } from "./config";

export const REVIEW_COOKIE = "etrylue-review-auth";
export type ReviewCookie = { name: string; value: string; options: CookieOptions };
export function reviewAuthClient(all: { name: string; value: string }[], write?: (values: ReviewCookie[]) => void) {
  const config = reviewConfig();
  return createServerClient(config.dbUrl, config.anonKey, {
    cookieOptions: { name: REVIEW_COOKIE, path: "/", httpOnly: true, sameSite: "lax", secure: config.origin.startsWith("https:") },
    cookies: {
      getAll: () => all.filter(c => c.name === REVIEW_COOKIE || c.name.startsWith(`${REVIEW_COOKIE}.`)),
      setAll: values => write?.(values),
    },
  });
}
export async function reviewAuth() {
  const store = await cookies();
  const client = reviewAuthClient(store.getAll(), values => {
    // Route handlers persist refreshed review sessions; server components are read-only.
    try { for (const cookie of values) store.set(cookie.name, cookie.value, cookie.options); }
    catch { /* The next authenticated API request can refresh the review cookie. */ }
  });
  const { data, error } = await client.auth.getUser();
  return { user: data.user, error };
}

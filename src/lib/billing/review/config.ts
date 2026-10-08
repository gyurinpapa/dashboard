import { createHash } from "node:crypto";

export class BillingError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
type Env = Record<string, string | undefined>;
export const REVIEW_PROJECT = "kbqyszbuxojofugqfjbh";
export function reviewConfig(env: Env = process.env) {
  if (env.BILLING_REVIEW_ENABLED !== "true") throw new BillingError("REVIEW_NOT_AVAILABLE", 503);
  // No fallback to app credentials. A production-hosted review still uses only the isolated DB.
  const dbUrl = env.BILLING_REVIEW_SUPABASE_URL || "";
  const dbKey = env.BILLING_REVIEW_SERVICE_ROLE_KEY || "";
  const anonKey = env.BILLING_REVIEW_ANON_KEY || "";
  if (dbUrl !== `https://${REVIEW_PROJECT}.supabase.co` || !dbKey || !anonKey)
    throw new BillingError("ISOLATED_REVIEW_DATABASE_REQUIRED", 503);
  let origin: URL;
  try { origin = new URL(env.BILLING_REVIEW_ORIGIN || ""); }
  catch { throw new BillingError("REVIEW_ORIGIN_REQUIRED", 503); }
  const publicSite = origin.origin === "https://www.etrylue.com";
  const preview = env.VERCEL_ENV !== "production" && origin.protocol === "https:" && origin.hostname.endsWith(".vercel.app");
  const local = env.VERCEL_ENV !== "production" && origin.origin === "http://localhost:3000";
  if (origin.origin !== env.BILLING_REVIEW_ORIGIN || origin.username || origin.password || !(publicSite || preview || local))
    throw new BillingError("UNSAFE_REVIEW_ORIGIN", 503);
  const testers = (env.BILLING_REVIEW_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!testers.length || !testers.every(uuid)) throw new BillingError("REVIEW_USERS_REQUIRED", 503);
  if ((env.BILLING_REVIEW_STATE_SECRET || "").length < 32) throw new BillingError("REVIEW_STATE_SECRET_REQUIRED", 503);
  return { dbUrl, dbKey, anonKey, origin: origin.origin, testers };
}
export function providerKeys(mode: "once" | "monthly", env: Env = process.env) {
  reviewConfig(env);
  if (mode !== "once") throw new BillingError("MONTHLY_NOT_AVAILABLE", 400);
  const client = env.BILLING_REVIEW_TOSS_CLIENT_KEY || "";
  const secret = env.BILLING_REVIEW_TOSS_SECRET_KEY || "";
  if (!client.startsWith("test_ck_") || !secret.startsWith("test_sk_"))
    throw new BillingError("REVIEW_TEST_KEYS_REQUIRED", 503);
  return { client, secret };
}
export function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

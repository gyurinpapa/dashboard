import { createHash } from "node:crypto";

export class BillingError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
type Env = Record<string, string | undefined>;
export function testConfig(env: Env = process.env) {
  // Hard stop, independent of feature flags. Live billing is not implemented/authorized.
  if (env.VERCEL_ENV === "production" || env.BILLING_TEST_ENABLED !== "true")
    throw new BillingError("BILLING_NOT_AVAILABLE", 503);
  const dbUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
  const projectRef = env.BILLING_TEST_PROJECT_REF || "";
  if (!/^[a-z]{20}$/.test(projectRef) || projectRef === "rulcvpgvmmckacshkmfy" ||
      dbUrl !== `https://${projectRef}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new BillingError("ISOLATED_TEST_DATABASE_REQUIRED", 503);
  let origin: URL;
  try { origin = new URL(env.BILLING_TEST_ORIGIN || ""); }
  catch { throw new BillingError("TEST_ORIGIN_REQUIRED", 503); }
  if (origin.origin !== env.BILLING_TEST_ORIGIN || origin.username || origin.password ||
      /(^|\.)etrylue\.com$/.test(origin.hostname) ||
      !(origin.protocol === "https:" || (origin.protocol === "http:" && origin.hostname === "localhost")))
    throw new BillingError("UNSAFE_TEST_ORIGIN", 503);
  const testers = (env.BILLING_TEST_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!testers.length) throw new BillingError("TEST_USERS_REQUIRED", 503);
  return { dbUrl, dbKey: env.SUPABASE_SERVICE_ROLE_KEY, origin: origin.origin, testers };
}
export function providerKeys(mode: "once" | "monthly", env: Env = process.env) {
  testConfig(env);
  const prefix = mode === "once" ? "TOSS_TEST" : "TOSS_BILLING_TEST";
  const client = env[`${prefix}_CLIENT_KEY`] || "";
  const secret = env[`${prefix}_SECRET_KEY`] || "";
  if (!client.startsWith("test_ck_") || !secret.startsWith("test_sk_"))
    throw new BillingError("TOSS_TEST_KEYS_REQUIRED", 503);
  return { client, secret };
}
export function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

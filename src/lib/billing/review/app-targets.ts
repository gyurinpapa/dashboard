import { createClient } from "@supabase/supabase-js";
import { resolveTrueMasterStatus } from "@/lib/media-sync/media-connection-access-policy";
import { BillingError } from "./config";

export const APP_PROJECT = "rulcvpgvmmckacshkmfy";
const ONBOARDING_TEST_PROJECT = "lpwmxtnzpgyrhphwufsd";
const ONBOARDING_PREVIEW = "https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app";
const readTables = new Set(["profiles", "workspace_members", "tenant_members", "workspaces", "tenants", "advertisers"]);
export function assertAppDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isolatedPreview = process.env.VERCEL_ENV === "preview" &&
    process.env.CUSTOMER_ONBOARDING_ENABLED === "true" &&
    process.env.CUSTOMER_ONBOARDING_ORIGIN === ONBOARDING_PREVIEW &&
    process.env.BILLING_REVIEW_ORIGIN === ONBOARDING_PREVIEW &&
    process.env.CUSTOMER_ONBOARDING_DATABASE_URL === url &&
    url === `https://${ONBOARDING_TEST_PROJECT}.supabase.co`;
  if ((url !== `https://${APP_PROJECT}.supabase.co` && !isolatedPreview) ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new BillingError("APP_DATABASE_REQUIRED", 503);
  return url!;
}
/** Hard transport boundary: this client cannot write or call RPCs in the real app DB. */
export function appReadDb() {
  const origin = assertAppDatabase();
  return createClient(origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const table = url.pathname.replace(/^\/rest\/v1\//, "");
      if (url.origin !== origin || !["GET", "HEAD"].includes(method) ||
          !url.pathname.startsWith("/rest/v1/") || !readTables.has(table))
        throw new BillingError("APP_DATABASE_READ_ONLY", 503);
      return fetch(input, { ...init, redirect: "error" });
    } },
  });
}
export async function appTargets(userId: string) {
  const client = appReadDb();
  const [profile, members, tenantMembers] = await Promise.all([
    client.from("profiles").select("email").eq("id", userId).maybeSingle(),
    client.from("workspace_members").select("workspace_id,role").eq("user_id", userId),
    client.from("tenant_members").select("tenant_id").eq("user_id", userId).eq("role", "owner"),
  ]);
  if (profile.error || members.error || tenantMembers.error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  const memberships = members.data || [];
  // Same shared pure master rule: the designated email AND an actual master membership.
  const master = resolveTrueMasterStatus({ email: profile.data?.email || "",
    hasMasterMembership: memberships.some(m => m.role === "master") });
  const adminIds = memberships.filter(m => ["admin", "director"].includes(m.role)).map(m => m.workspace_id as string);
  const staffIds = memberships.filter(m => m.role === "staff").map(m => m.workspace_id as string);
  const ids = [...new Set([...adminIds, ...staffIds])];
  const tenantIds = (tenantMembers.data || []).map(t => t.tenant_id as string);
  const [workspaces, companies] = await Promise.all([
    master ? client.from("workspaces").select("id,name,tenant_id") : ids.length
      ? client.from("workspaces").select("id,name,tenant_id").in("id", ids) : { data: [], error: null },
    master ? client.from("tenants").select("id,name").eq("status", "active") : tenantIds.length
      ? client.from("tenants").select("id,name").in("id", tenantIds).eq("status", "active") : { data: [], error: null },
  ]);
  if (workspaces.error || companies.error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  const workspaceRows = workspaces.data || [];
  const allowedIds = workspaceRows.map(w => w.id as string);
  const ads = allowedIds.length ? await client.from("advertisers").select("id,name,workspace_id,created_by").in("workspace_id", allowedIds)
    : { data: [], error: null };
  if (ads.error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  const advertiser = (ads.data || []).filter(a => master || adminIds.includes(a.workspace_id) ||
    (staffIds.includes(a.workspace_id) && a.created_by === userId))
    .map(a => ({ id: a.id, name: a.name, workspace_id: a.workspace_id }));
  return { advertiser, workspace: workspaceRows.filter(w => master || adminIds.includes(w.id)), company: companies.data || [] };
}

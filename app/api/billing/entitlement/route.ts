import { actor, db, targets } from "@/lib/billing/server";
import { BillingError, uuid } from "@/lib/billing/config";
import { assessEntitlement, type Grant } from "@/lib/billing/entitlement";
import { failure, json } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Isolated assessment only; provisional tester target ACL, not report authorization. */
export async function GET(request: Request) {
  try {
    const userId = await actor(); // Includes independent production/database/tester guards.
    const id = new URL(request.url).searchParams.get("advertiser");
    if (!uuid(id)) throw new BillingError("INVALID_TARGET");
    const options = await targets(userId);
    const ad = options.advertiser.find(item => item.id === id);
    const workspace = options.workspace.find(item => item.id === ad?.workspace_id);
    if (!ad || !workspace) throw new BillingError("TARGET_NOT_ALLOWED", 403);
    const wid = workspace.id as string, tid = workspace.tenant_id as string | null;
    if (!uuid(wid) || (tid !== null && !uuid(tid))) throw new BillingError("INVALID_TARGET");
    const client = db();
    const company = tid ? await client.from("workspaces").select("id").eq("tenant_id", tid) : { data: [], error: null };
    if (company.error) throw new BillingError("BILLING_STORAGE_UNAVAILABLE", 503);
    const ids = (company.data || []).map(item => item.id as string);
    const now = Date.now();
    const [grants, workspaceCount, companyCount] = await Promise.all([
      client.from("billing_test_orders").select("scope,target_id,workspace_id,tenant_id,status,paid_until")
        .eq("status", "active").gt("paid_until", new Date(now).toISOString())
        .or(`target_id.eq.${id},target_id.eq.${wid}${tid ? `,target_id.eq.${tid}` : ""}`),
      client.from("advertisers").select("id", { count: "exact", head: true }).eq("workspace_id", wid),
      ids.length ? client.from("advertisers").select("id", { count: "exact", head: true }).in("workspace_id", ids)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (grants.error || workspaceCount.error || companyCount.error || workspaceCount.count === null || companyCount.count === null)
      throw new BillingError("BILLING_STORAGE_UNAVAILABLE", 503);
    return json({ assessmentOnly: true, enforced: false,
      ...assessEntitlement((grants.data || []) as Grant[], { advertiserId: id, workspaceId: wid, tenantId: tid,
        workspaceAdvertisers: workspaceCount.count, companyAdvertisers: companyCount.count }, now) });
  } catch (error) { return failure(error); }
}

import { plans, type Scope } from "./catalog";

export type Grant = {
  scope: Scope; target_id: string; workspace_id: string | null;
  tenant_id: string | null; status: string; paid_until: string | null;
};
export type Target = {
  advertiserId: string; workspaceId: string; tenantId: string | null;
  workspaceAdvertisers: number; companyAdvertisers: number;
};

/** Billing eligibility only. Never replaces report ACL or authorizes a mutation. */
export function assessEntitlement(grants: Grant[], target: Target, now: number) {
  if (!Number.isFinite(now)) return { eligible: false, paidUntil: null };
  let end = 0;
  for (const grant of grants) {
    const until = Date.parse(grant.paid_until || "");
    if (grant.status !== "active" || !Number.isFinite(until) || until <= now) continue;
    const sameCompany = grant.tenant_id === target.tenantId;
    const sameWorkspace = grant.workspace_id === target.workspaceId;
    const capacity = (count: number, limit: number) => Number.isInteger(count) && count >= 1 && count <= limit;
    const covered = sameCompany && (
      (grant.scope === "advertiser" && sameWorkspace && grant.target_id === target.advertiserId) ||
      (grant.scope === "workspace" && sameWorkspace && grant.target_id === target.workspaceId &&
        capacity(target.workspaceAdvertisers, plans.workspace.limit)) ||
      (grant.scope === "company" && !!target.tenantId && grant.target_id === target.tenantId &&
        grant.workspace_id === null && capacity(target.companyAdvertisers, plans.company.limit))
    );
    if (covered) end = Math.max(end, until);
  }
  return { eligible: end > now, paidUntil: end ? new Date(end).toISOString() : null };
}

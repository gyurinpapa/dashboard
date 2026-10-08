import assert from "node:assert/strict";
import { test } from "node:test";
import { assessEntitlement, type Grant, type Target } from "../src/lib/billing/entitlement";
import { GET } from "../app/api/billing/entitlement/route";

const now = Date.parse("2026-10-08T11:18:56Z");
const target: Target = { advertiserId: "ad-a", workspaceId: "workspace-a", tenantId: "company-a", workspaceAdvertisers: 5, companyAdvertisers: 20 };
const grant: Grant = { scope: "advertiser", target_id: "ad-a", workspace_id: "workspace-a", tenant_id: "company-a", status: "active", paid_until: "2026-11-08T11:18:56Z" };
test("active paid target qualifies; absent, pending, refunded and exact expiry do not", () => {
  assert.equal(assessEntitlement([grant], target, now).eligible, true);
  for (const grants of [[], [{ ...grant, status: "pending" }], [{ ...grant, status: "refunded" }],
    [{ ...grant, paid_until: new Date(now).toISOString() }], [{ ...grant, paid_until: "invalid" }]])
    assert.equal(assessEntitlement(grants, target, now).eligible, false);
});
test("same advertiser cannot carry eligibility across workspace or company moves", () => {
  for (const change of [{ advertiserId: "ad-b" }, { workspaceId: "workspace-b" }, { tenantId: "company-b" }])
    assert.equal(assessEntitlement([grant], { ...target, ...change }, now).eligible, false);
});
test("workspace and company coverage respects target identity and current capacity", () => {
  const workspace: Grant = { ...grant, scope: "workspace", target_id: target.workspaceId };
  const company: Grant = { ...grant, scope: "company", target_id: target.tenantId!, workspace_id: null };
  assert.equal(assessEntitlement([workspace], target, now).eligible, true);
  assert.equal(assessEntitlement([company], target, now).eligible, true);
  assert.equal(assessEntitlement([workspace], { ...target, workspaceAdvertisers: 6 }, now).eligible, false);
  assert.equal(assessEntitlement([company], { ...target, companyAdvertisers: 21 }, now).eligible, false);
  assert.equal(assessEntitlement([company], { ...target, tenantId: null }, now).eligible, false);
  assert.equal(assessEntitlement([workspace], { ...target, workspaceAdvertisers: -1 }, now).eligible, false);
});
test("overlapping grants take latest expiry without adding periods; independent valid grant survives refund", () => {
  const earlier = { ...grant, paid_until: "2026-10-09T11:18:56Z" };
  const before = JSON.stringify([grant, earlier]);
  assert.equal(assessEntitlement([grant, earlier, grant], target, now).paidUntil, "2026-11-08T11:18:56.000Z");
  assert.equal(assessEntitlement([{ ...grant, status: "refunded" }, earlier], target, now).paidUntil, "2026-10-09T11:18:56.000Z");
  assert.equal(JSON.stringify([grant, earlier]), before);
});
test("assessment endpoint rejects disabled mode before any network", async () => {
  const enabled = process.env.BILLING_TEST_ENABLED, fetch = global.fetch;
  process.env.BILLING_TEST_ENABLED = "false";
  global.fetch = async () => { throw new Error("UNEXPECTED_NETWORK"); };
  try { assert.equal((await GET(new Request("http://localhost/api/billing/entitlement"))).status, 503); }
  finally {
    global.fetch = fetch;
    if (enabled === undefined) delete process.env.BILLING_TEST_ENABLED; else process.env.BILLING_TEST_ENABLED = enabled;
  }
});

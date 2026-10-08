import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { reviewAuth } from "./auth";
import { BillingError, hash, providerKeys, reviewConfig, uuid } from "./config";
import { periodEnd, plans, quote, type BillingMode, type Scope } from "../catalog";
import { toss, verifiedPayment } from "./toss";

export type Order = {
  id: string; user_id: string; scope: Scope; target_id: string; workspace_id: string | null;
  tenant_id: string | null; mode: BillingMode; amount: number; name: string; customer_key: string;
  nonce_hash: string; status: string; billing_key_cipher: string | null; anchor_at: string | null;
  paid_until: string | null; last_cycle: number; cancel_at_period_end: boolean;
};
type Charge = { id: string; order_id: string; amount: number; cycle: number; status: string; payment_key: string | null; created_at: string };
export function db() {
  const c = reviewConfig();
  return createClient(c.dbUrl, c.dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function actor(request?: Request) {
  const c = reviewConfig();
  if (request && request.method !== "GET" && request.headers.get("origin") !== c.origin)
    throw new BillingError("INVALID_ORIGIN", 403);
  const { user, error } = await reviewAuth();
  if (error || !user) throw new BillingError("LOGIN_REQUIRED", 401);
  if (!c.testers.includes(user.id)) throw new BillingError("TEST_ACCESS_REQUIRED", 403);
  return user.id;
}
export async function loadOrder(id: unknown, userId?: string): Promise<Order> {
  if (!uuid(id)) throw new BillingError("INVALID_ORDER");
  const { data, error } = await db().from("billing_test_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new BillingError("BILLING_STORAGE_UNAVAILABLE", 503);
  if (!data || (userId && data.user_id !== userId)) throw new BillingError("ORDER_NOT_FOUND", 404);
  return data as Order;
}
async function loadCharge(id: string): Promise<Charge> {
  if (!uuid(id)) throw new BillingError("INVALID_CHARGE");
  const { data, error } = await db().from("billing_test_charges").select("*").eq("id", id).maybeSingle();
  if (error) throw new BillingError("BILLING_STORAGE_UNAVAILABLE", 503);
  if (!data) throw new BillingError("CHARGE_NOT_FOUND", 404);
  return data as Charge;
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new BillingError("BILLING_CONFLICT_REVIEW_REQUIRED", 409);
  return data;
}

// Provisional TEST permissions: workspace admin/director or company owner. No role mutation.
export async function targets(userId: string) {
  const client = db();
  const [members, tenants] = await Promise.all([
    client.from("workspace_members").select("workspace_id").eq("user_id", userId).in("role", ["admin", "director"]),
    client.from("tenant_members").select("tenant_id").eq("user_id", userId).eq("role", "owner"),
  ]);
  if (members.error || tenants.error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  const ids = (members.data || []).map(m => m.workspace_id as string);
  const tids = (tenants.data || []).map(m => m.tenant_id as string);
  const [workspaces, companies] = await Promise.all([
    ids.length ? client.from("workspaces").select("id,name,tenant_id").in("id", ids) : { data: [], error: null },
    tids.length ? client.from("tenants").select("id,name").in("id", tids).eq("status", "active") : { data: [], error: null },
  ]);
  if (workspaces.error || companies.error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  const advertisers = ids.length ? await client.from("advertisers").select("id,name,workspace_id").in("workspace_id", ids) : { data: [], error: null };
  if (advertisers.error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  return { advertiser: advertisers.data || [], workspace: workspaces.data || [], company: companies.data || [] };
}
async function targetContext(userId: string, scope: Scope, targetId: string) {
  const options = await targets(userId);
  if (!options[scope].some(t => t.id === targetId)) throw new BillingError("TARGET_NOT_ALLOWED", 403);
  const ad = scope === "advertiser" ? options.advertiser.find(t => t.id === targetId) : null;
  const workspace = scope === "company" ? null : options.workspace.find(t => t.id === (ad?.workspace_id || targetId));
  const tenantId = scope === "company" ? targetId : workspace?.tenant_id || null;
  let workspaceIds: string[] = workspace ? [workspace.id] : [];
  if (scope === "company") {
    const { data, error } = await db().from("workspaces").select("id").eq("tenant_id", targetId);
    if (error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
    workspaceIds = (data || []).map(w => w.id);
  }
  if (scope !== "advertiser" && workspaceIds.length) {
    const { count, error } = await db().from("advertisers").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds);
    if (error || count === null) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
    if (count > plans[scope].limit) throw new BillingError("PLAN_CAPACITY_EXCEEDED", 409);
  }
  return { workspace_id: workspace?.id || null, tenant_id: tenantId };
}
function stateFor(id: string, userId: string) {
  const secret = process.env.BILLING_REVIEW_STATE_SECRET || "";
  if (secret.length < 32) throw new BillingError("STATE_SECRET_REQUIRED", 503);
  return createHmac("sha256", secret).update(`${id}:${userId}`).digest("hex");
}
export async function checkout(userId: string, id: string, scope: Scope, mode: BillingMode, targetId: string) {
  const config = reviewConfig(), keys = providerKeys(mode);
  if (mode !== "once") throw new BillingError("MONTHLY_NOT_AVAILABLE", 400);
  const context = await targetContext(userId, scope, targetId), q = quote(scope, mode);
  const state = stateFor(id, userId), customerKey = `etrylue_${id.replaceAll("-", "")}`;
  await rpc("billing_test_create", { p: { id, user_id: userId, scope, target_id: targetId, ...context,
    mode, catalog_version: q.version, amount: q.amount, name: q.name, customer_key: customerKey, nonce_hash: hash(state) } });
  const order = await loadOrder(id, userId);
  if (order.status !== "pending") throw new BillingError("ORDER_ALREADY_PROCESSED", 409);
  return { orderId: id, orderName: order.name, amount: order.amount, mode, customerKey, clientKey: keys.client,
    successUrl: `${config.origin}/api/billing/review/callback?order=${id}&state=${state}`,
    failUrl: `${config.origin}/api/billing/review/callback?order=${id}&state=${state}&failed=1` };
}
async function settle(charge: Charge, order: Order, value: unknown, expectedKey?: string) {
  const payment = verifiedPayment(value, charge, expectedKey);
  if ((value as { mId?: string }).mId !== "tetryluei6e") throw new BillingError("REVIEW_MERCHANT_MISMATCH", 409);
  const end = periodEnd(order.anchor_at || payment.approvedAt, charge.cycle);
  await rpc("billing_test_settle", { p: { charge_id: charge.id, amount: payment.totalAmount,
    payment_key: payment.paymentKey, status: payment.status, approved_at: payment.approvedAt, paid_until: end } });
}
export async function reconcile(chargeId: string) {
  const charge = await loadCharge(chargeId), order = await loadOrder(charge.order_id);
  if (order.mode !== "once") throw new BillingError("MONTHLY_NOT_AVAILABLE");
  const payment = await toss(order.mode, `/v1/payments/orders/${charge.id}`);
  await settle(charge, order, payment, charge.payment_key || undefined);
}
export async function callback(userId: string, params: URLSearchParams) {
  const order = await loadOrder(params.get("order"), userId);
  if (order.mode !== "once") throw new BillingError("MONTHLY_NOT_AVAILABLE");
  if (hash(params.get("state") || "") !== order.nonce_hash) throw new BillingError("INVALID_STATE", 403);
  if (params.get("failed")) return order.id;
  const charge = await loadCharge(order.id);
  if (charge.status !== "pending") return order.id;
  if (order.mode === "once") {
    const paymentKey = params.get("paymentKey") || "";
    if (!paymentKey || paymentKey.length > 300 || params.get("orderId") !== order.id ||
        params.get("amount") !== String(order.amount)) throw new BillingError("PAYMENT_MISMATCH", 409);
    // Persist the immutable key before external approval, for recovery after timeout/crash.
    const { data, error } = await db().from("billing_test_charges").update({ payment_key: paymentKey })
      .eq("id", charge.id).is("payment_key", null).select("id");
    if (error) throw new BillingError("BILLING_STORAGE_UNAVAILABLE", 503);
    if (!data?.length && (await loadCharge(charge.id)).payment_key !== paymentKey)
      throw new BillingError("PAYMENT_MISMATCH", 409);
    try {
      const payment = await toss("once", "/v1/payments/confirm", { paymentKey, orderId: charge.id, amount: order.amount }, `confirm-${charge.id}`);
      await settle(charge, order, payment, paymentKey);
    } catch {
      await reconcile(charge.id); // Only provider-confirmed state may be persisted.
    }
  } else { throw new BillingError("MONTHLY_NOT_AVAILABLE"); }
  return order.id;
}
export async function manage(userId: string, orderId: string, action: string) {
  const order = await loadOrder(orderId, userId);
  if (order.mode !== "once") throw new BillingError("MONTHLY_NOT_AVAILABLE");
  if (action === "reconcile") {
    const { data, error } = await db().from("billing_test_charges").select("id").eq("order_id", order.id).order("cycle", { ascending: false }).limit(1).single();
    if (error) throw new BillingError("CHARGE_NOT_FOUND", 404);
    await reconcile(data.id);
  } else if (action === "refund") {
    // Test-only full refund. Production refund eligibility is not yet an approved policy.
    const { data, error } = await db().from("billing_test_charges").select("*").eq("order_id", order.id)
      .eq("status", "done").order("cycle", { ascending: false }).limit(1).single();
    if (error || !data?.payment_key) throw new BillingError("REFUND_REQUIRES_REVIEW", 409);
    const charge = data as Charge;
    // Stop renewal first under the same order lock used by the renewal reservation.
    await rpc("billing_test_cancel", { p_order: order.id });
    try {
      const value = await toss(order.mode, `/v1/payments/${encodeURIComponent(charge.payment_key!)}/cancel`,
        { cancelReason: "Etrylue 테스트 전액 취소" }, `refund-${charge.id}`);
      await settle(charge, order, value, charge.payment_key!);
    } catch { await reconcile(charge.id); }
  } else throw new BillingError("INVALID_ACTION");
}

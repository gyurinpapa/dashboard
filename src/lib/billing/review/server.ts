import { creationGateEnabled } from "./creation-gate";
import { advertiserName, draftTarget, newAdvertiserContext, createVerifiedTestAdvertiser } from './new-advertiser';
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sbAuth } from "@/lib/supabase/auth-server";
import { appReadDb, assertAppDatabase, appTargets } from "./app-targets";
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
  assertAppDatabase();
  const { user, error } = await sbAuth();
  if (error || !user) throw new BillingError("LOGIN_REQUIRED", 401);
  const onboardingTest = process.env.VERCEL_ENV === "preview" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://lpwmxtnzpgyrhphwufsd.supabase.co" &&
    process.env.CUSTOMER_ONBOARDING_ENABLED === "true" && !!user.email_confirmed_at &&
    user.app_metadata?.etrylue_customer_version === "1";
  if (!c.testers.includes(user.id) && !onboardingTest) throw new BillingError("TEST_ACCESS_REQUIRED", 403);
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

// Existing app hierarchy is read-only; payment storage remains isolated.
export async function targets(userId: string) {
  const options = await appTargets(userId);
  const ids = [...new Set([...options.advertiser.map(a => a.id), ...options.newAdvertiserWorkspaces.map(w => w.id), ...options.newAdvertiserWorkspaces.map(w => w.tenant_id).filter(Boolean), ...options.company.map(c => c.id)])];
  const coverage = creationGateEnabled() && ids.length ? await db().from("billing_test_orders")
    .select("scope,target_id,workspace_id,tenant_id,paid_until").eq("status", "active")
    .gt("paid_until", new Date().toISOString()).in("target_id", ids) : { data: [], error: null };
  if(coverage.error)throw new BillingError("ENTITLEMENT_LOOKUP_FAILED",503);
  function paidUntil(scope: Scope, id: string, workspaceId: string | null, tenantId: string | null) {
    return (coverage.data || []).filter(o =>
      (o.scope === scope && o.target_id === id && (scope === "company" ? o.tenant_id === tenantId : o.workspace_id === workspaceId)) ||
      (scope === "advertiser" && o.scope === "workspace" && o.target_id === workspaceId && o.workspace_id === workspaceId) ||
      (o.scope === "company" && !!tenantId && o.target_id === tenantId && o.tenant_id === tenantId)
    ).reduce<string | null>((end,o) => !end || Date.parse(o.paid_until)>Date.parse(end) ? o.paid_until : end,null);
  }
  return { ...options,
    advertiser: options.advertiser.map(a => ({ ...a, paidUntil: paidUntil("advertiser",a.id,a.workspace_id,options.newAdvertiserWorkspaces.find(w=>w.id===a.workspace_id)?.tenant_id || null) })),
    workspace: options.workspace.map(w => ({ ...w, paidUntil: paidUntil("workspace",w.id,w.id,w.tenant_id) })),
    company: options.company.map(c => ({ ...c, paidUntil: paidUntil("company",c.id,null,c.id) })),
  };
}
async function targetContext(userId: string, scope: Scope, targetId: string) {
  const options = await targets(userId);
  if (!options[scope].some(t => t.id === targetId)) throw new BillingError("TARGET_NOT_ALLOWED", 403);
  if (options[scope].find(t => t.id === targetId)?.paidUntil) throw new BillingError("ACTIVE_ENTITLEMENT_EXISTS", 409);
  const ad = scope === "advertiser" ? options.advertiser.find(t => t.id === targetId) : null;
  const workspaceId = scope === "company" ? null : (ad?.workspace_id || targetId);
  const context = workspaceId ? await appReadDb().from("workspaces").select("id,tenant_id").eq("id", workspaceId).maybeSingle() : { data: null, error: null };
  if (context.error || (workspaceId && !context.data)) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
  const workspace = context.data;
  const tenantId = scope === "company" ? targetId : workspace?.tenant_id || null;
  let workspaceIds: string[] = workspace ? [workspace.id] : [];
  if (scope === "company") {
    const { data, error } = await appReadDb().from("workspaces").select("id").eq("tenant_id", targetId);
    if (error) throw new BillingError("TARGET_LOOKUP_FAILED", 503);
    workspaceIds = (data || []).map(w => w.id);
  }
  if (scope !== "advertiser" && workspaceIds.length) {
    const { count, error } = await appReadDb().from("advertisers").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds);
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
export async function checkout(userId: string, id: string, scope: Scope, mode: BillingMode, targetId: string, draft?: {name: string; workspaceId: string}) {
  const config = reviewConfig(), keys = providerKeys(mode);
  if (mode !== "once") throw new BillingError("MONTHLY_NOT_AVAILABLE", 400);
  let context;
  if(draft) {
    if(scope!=="advertiser")throw new BillingError("INVALID_CHECKOUT");
    context=await newAdvertiserContext(userId,draft.workspaceId);
    targetId=draftTarget(userId,id,process.env.BILLING_REVIEW_STATE_SECRET||"");
    const proposed={order_id:id,user_id:userId,target_id:targetId,...context,name:advertiserName(draft.name)};
    const inserted=await db().from("billing_test_purchase_drafts").insert(proposed);
    if(inserted.error&&inserted.error.code!=="23505")throw new BillingError("BILLING_STORAGE_UNAVAILABLE",503);
    const saved=await db().from("billing_test_purchase_drafts").select("user_id,target_id,workspace_id,name").eq("order_id",id).single();
    if(saved.error||saved.data.user_id!==userId||saved.data.target_id!==targetId||saved.data.workspace_id!==draft.workspaceId||saved.data.name!==proposed.name)
      throw new BillingError("ORDER_DRAFT_CONFLICT",409);
  } else {context=await targetContext(userId,scope,targetId);}
  const q=quote(scope,mode);
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
  if (action === "prepare") {
    if(order.status!=="active"||!order.paid_until||Date.parse(order.paid_until)<=Date.now())throw new BillingError("PAYMENT_NOT_VERIFIED",409);
    // Fresh provider reconciliation prevents a stale local DONE after a provider cancellation.
    await reconcile(order.id);
    const current=await loadOrder(order.id,userId);
    if(current.status!=="active")throw new BillingError("PAYMENT_NOT_VERIFIED",409);
    const draft=await db().from("billing_test_purchase_drafts").select("target_id,user_id,workspace_id,name").eq("order_id",order.id).eq("user_id",userId).single();
    if(draft.error||draft.data.target_id!==order.target_id)throw new BillingError("ORDER_DRAFT_NOT_FOUND",404);
    await createVerifiedTestAdvertiser(draft.data);
  } else if (action === "reconcile") {
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

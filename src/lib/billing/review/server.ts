import { creationGateEnabled } from "./creation-gate";
import { isolatedReviewEnabled, productionReviewRequested, reviewAppContext } from './app-rollout';
import { advertiserName, draftTarget, newAdvertiserContext, createVerifiedTestAdvertiser } from './new-advertiser';
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sbAuth } from "@/lib/supabase/auth-server";
import { appReadDb, assertAppDatabase, appTargets } from "./app-targets";
import { BillingError, hash, providerKeys, reviewConfig, uuid } from "./config";
import { periodEnd, plans, quote, type BillingMode, type Scope } from "../catalog";
import { toss, verifiedPayment } from "./toss";
import { registrationEnabled, REGISTRATION_CATALOG } from './registration-config';
import { createRegistrationDraft, isRegistrationOrder, syncRegistration } from './registration-service';
import { registrationAccess, registrationGet, registrationRpc } from './registration-store';

export type Order = {
  id: string; user_id: string; scope: Scope; target_id: string; workspace_id: string | null;
  tenant_id: string | null; mode: BillingMode; amount: number; name: string; customer_key: string;
  nonce_hash: string; status: string; billing_key_cipher: string | null; anchor_at: string | null;
  paid_until: string | null; last_cycle: number; cancel_at_period_end: boolean; catalog_version:string;
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
  if (productionReviewRequested()) reviewAppContext();
  const onboardingTest = (isolatedReviewEnabled() || productionReviewRequested()) && !!user.email_confirmed_at &&
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
  const now=new Date().toISOString();
  let coverageQuery=db().from("billing_test_orders").select("id,catalog_version,scope,target_id,workspace_id,tenant_id,paid_until").eq("status","active");
  coverageQuery=registrationEnabled()?coverageQuery.or(`catalog_version.eq.${REGISTRATION_CATALOG},paid_until.gt.${now}`):coverageQuery.gt("paid_until",now);
  const coverage = creationGateEnabled() && ids.length ? await coverageQuery.in("target_id", ids) : { data: [], error: null };
  if(coverage.error)throw new BillingError("ENTITLEMENT_LOOKUP_FAILED",503);
  const registrations=registrationEnabled()&&options.advertiser.length?await registrationAccess(options.advertiser.map(a=>a.id)):[];
  const registrationByOrder=new Map(registrations.map(r=>[r.order_id,r]));
  const coverageRows=(coverage.data||[]).map(o=>{
    if(o.catalog_version!==REGISTRATION_CATALOG)return o;
    const r=registrationByOrder.get(o.id);
    return r&&r.advertiser_id===o.target_id&&r.payment_status==='verified'?{...o,workspace_id:r.workspace_id,tenant_id:r.tenant_id,paid_until:r.paid_until}:{...o,paid_until:null};
  }).filter(o=>o.paid_until&&Date.parse(o.paid_until)>Date.parse(now));
  function paidUntil(scope: Scope, id: string, workspaceId: string | null, tenantId: string | null) {
    return coverageRows.filter(o =>
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
  const registration=!!draft&&registrationEnabled();
  if(registration&&draft){
    if(scope!=='advertiser'||draft.workspaceId)throw new BillingError('INVALID_CHECKOUT');
    const pending=await createRegistrationDraft(db(),userId,id,draft.name);
    context=pending.context;targetId=pending.targetId;
  }else if(draft) {
    if(scope!=="advertiser")throw new BillingError("INVALID_CHECKOUT");
    context=await newAdvertiserContext(userId,draft.workspaceId);
    targetId=draftTarget(userId,id,process.env.BILLING_REVIEW_STATE_SECRET||"");
    const appContext=reviewAppContext();
    const proposed={order_id:id,user_id:userId,target_id:targetId,...context,name:advertiserName(draft.name),...(appContext.production?{app_project:appContext.project}:{})};
    const inserted=await db().from("billing_test_purchase_drafts").insert(proposed);
    if(inserted.error&&inserted.error.code!=="23505")throw new BillingError("BILLING_STORAGE_UNAVAILABLE",503);
    let savedQuery=db().from("billing_test_purchase_drafts").select("user_id,target_id,workspace_id,name").eq("order_id",id);
    if(appContext.production)savedQuery=savedQuery.eq("app_project",appContext.project);
    const saved=await savedQuery.single();
    if(saved.error||saved.data.user_id!==userId||saved.data.target_id!==targetId||saved.data.workspace_id!==draft.workspaceId||saved.data.name!==proposed.name)
      throw new BillingError("ORDER_DRAFT_CONFLICT",409);
  } else {context=await targetContext(userId,scope,targetId);}
  const q=quote(scope,mode);
  const state = stateFor(id, userId), customerKey = `etrylue_${id.replaceAll("-", "")}`;
  await rpc("billing_test_create", { p: { id, user_id: userId, scope, target_id: targetId, ...context,
    mode, catalog_version: registration?REGISTRATION_CATALOG:q.version, amount: q.amount, name: q.name, customer_key: customerKey, nonce_hash: hash(state) } });
  const order = await loadOrder(id, userId);
  if(registration&&(order.catalog_version!==REGISTRATION_CATALOG||order.target_id!==targetId||order.scope!==scope||
    order.mode!==mode||order.amount!==q.amount||order.workspace_id!==null||order.tenant_id!==context.tenant_id))throw new BillingError('ORDER_DRAFT_CONFLICT',409);
  if (order.status !== "pending") throw new BillingError("ORDER_ALREADY_PROCESSED", 409);
  return { orderId: id, orderName: order.name, amount: order.amount, mode, customerKey, clientKey: keys.client,
    successUrl: `${config.origin}/api/billing/review/callback?order=${id}&state=${state}`,
    failUrl: `${config.origin}/api/billing/review/callback?order=${id}&state=${state}&failed=1` };
}
async function settle(charge: Charge, order: Order, value: unknown, expectedKey?: string) {
  const payment = verifiedPayment(value, charge, expectedKey);
  if ((value as { mId?: string }).mId !== "tetryluei6e") throw new BillingError("REVIEW_MERCHANT_MISMATCH", 409);
  const end = periodEnd(order.anchor_at || payment.approvedAt, charge.cycle);
  await rpc("billing_test_settle_refund", { p: { charge_id: charge.id, amount: payment.totalAmount,
    payment_key: payment.paymentKey, balance_amount: payment.balanceAmount, status: payment.status, approved_at: payment.approvedAt, paid_until: end } });
  if(isRegistrationOrder(order))await syncRegistration(db(),await loadOrder(order.id),value,expectedKey);
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
  if (charge.status !== "pending") {if(isRegistrationOrder(order))await reconcile(charge.id);return order.id;}
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
  if(isRegistrationOrder(order)){
    if(!registrationEnabled())throw new BillingError('REGISTRATION_TEST_ONLY',503);
    if(action==='reconcile'||action==='prepare'){await reconcile(order.id);return;}
    if(action!=='refund')throw new BillingError('INVALID_ACTION');
    const reserved=await registrationRpc<import('./registration-store').RegistrationRow>('etrylue_registration_reserve_refund',{p_order:order.id,p_actor:userId});
    if(reserved.payment_status==='refunded')return;
    await reconcile(order.id);
    if((await registrationGet(order.id,userId)).payment_status==='refunded')return;
    const charge=await loadCharge(order.id), amount=reserved.refund_amount;
    if(!charge.payment_key||!amount||!Number.isSafeInteger(amount)||amount<=0||amount>charge.amount||charge.status!=='done')
      throw new BillingError('REFUND_REQUIRES_REVIEW',409);
    try{
      const value=await toss('once',`/v1/payments/${encodeURIComponent(charge.payment_key)}/cancel`,
        {cancelReason:'미등록 광고주 테스트 이용권 환불',cancelAmount:amount},`registration-refund-${charge.id}`);
      await settle(charge,order,value,charge.payment_key);
    }catch{await reconcile(charge.id);}
    if((await registrationGet(order.id,userId)).payment_status!=='refunded')throw new BillingError('REFUND_PENDING_RECONCILIATION',409);
    return;
  }
  if (action === "prepare") {
    if(order.status!=="active"||!order.paid_until||Date.parse(order.paid_until)<=Date.now())throw new BillingError("PAYMENT_NOT_VERIFIED",409);
    // Fresh provider reconciliation prevents a stale local DONE after a provider cancellation.
    await reconcile(order.id);
    const current=await loadOrder(order.id,userId);
    if(current.status!=="active")throw new BillingError("PAYMENT_NOT_VERIFIED",409);
    const appContext=reviewAppContext();
    let draftQuery=db().from("billing_test_purchase_drafts").select("target_id,user_id,workspace_id,name").eq("order_id",order.id).eq("user_id",userId);
    if(appContext.production)draftQuery=draftQuery.eq("app_project",appContext.project);
    const draft=await draftQuery.single();
    if(draft.error||draft.data.target_id!==order.target_id)throw new BillingError("ORDER_DRAFT_NOT_FOUND",404);
    await createVerifiedTestAdvertiser(draft.data);
  } else if (action === "reconcile") {
    const { data, error } = await db().from("billing_test_charges").select("id").eq("order_id", order.id).order("cycle", { ascending: false }).limit(1).single();
    if (error) throw new BillingError("CHARGE_NOT_FOUND", 404);
    await reconcile(data.id);
  } else if (action === "refund") {
    // A service-only DB reservation fixes the amount/time across retries and concurrent requests.
    const reserved = await rpc("billing_test_request_refund", { p_order: order.id, p_user: userId }) as { charge_id: string; amount: number; status: string };
    if (reserved.status === "completed") return;
    const charge = await loadCharge(reserved.charge_id);
    if (!charge.payment_key || !Number.isSafeInteger(reserved.amount) || reserved.amount <= 0 || reserved.amount > charge.amount)
      throw new BillingError("REFUND_REQUIRES_REVIEW", 409);
    // Reconcile before cancellation, including recovery after provider success / storage timeout.
    await reconcile(charge.id);
    const request = await refundRequest(order.id, userId);
    if (request?.status === "completed") return;
    const current = await loadCharge(charge.id);
    if (current.status !== "done") throw new BillingError("REFUND_REQUIRES_REVIEW", 409);
    try {
      const value = await toss(order.mode, `/v1/payments/${encodeURIComponent(charge.payment_key)}/cancel`,
        { cancelReason: "Etrylue 이용권 환불정책에 따른 테스트 취소", cancelAmount: reserved.amount }, `policy-refund-${charge.id}`);
      await settle(charge, order, value, charge.payment_key);
    } catch { await reconcile(charge.id); }
    if ((await refundRequest(order.id, userId))?.status !== "completed")
      throw new BillingError("REFUND_PENDING_RECONCILIATION", 409);
  } else throw new BillingError("INVALID_ACTION");
}

export type RefundRequest = { amount: number; requested_at: string; period_start: string; period_end: string; status: string };
export async function refundRequest(orderId: string, userId: string): Promise<RefundRequest | null> {
  const { data, error } = await db().from("billing_test_refund_requests")
    .select("amount,requested_at,period_start,period_end,status").eq("order_id",orderId).eq("user_id",userId).maybeSingle();
  if (error) throw new BillingError("BILLING_STORAGE_UNAVAILABLE",503);
  return data;
}

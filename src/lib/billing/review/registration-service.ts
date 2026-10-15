import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appReadDb } from './app-targets';
import { advertiserName, draftTarget } from './new-advertiser';
import { BillingError, uuid } from './config';
import { quote } from '../catalog';
import { verifiedPayment } from './toss';
import { assertRegistration, REGISTRATION_APP_PROJECT, REGISTRATION_CATALOG } from './registration-config';
import { registrationGet, registrationRpc, type RegistrationRow } from './registration-store';

export type RegistrationOrder = { id:string;user_id:string;target_id:string;tenant_id:string|null;workspace_id:string|null;
  scope:string;mode:string;amount:number;status:string;catalog_version:string };
export function isRegistrationOrder(order:{catalog_version?:string}) { return order.catalog_version===REGISTRATION_CATALOG; }

/** No workspace input: company identity is resolved from trusted server rows. */
async function companyContext(userId:string) {
  assertRegistration();
  const client=appReadDb();
  const identity=()=>Promise.all([
    client.from('profiles').select('company_id').eq('id',userId).maybeSingle(),
    client.from('tenant_members').select('tenant_id').eq('user_id',userId),
  ]);
  let [profile,members]=await identity();
  if(profile.error||members.error)throw new BillingError('REGISTRATION_UNAVAILABLE',503);
  // New email-confirmed customers need no separate "prepare company" action.
  // The existing locked RPC owns identity creation and rejects legacy/partial identities.
  // Never provision during a lookup, for an existing identity, or outside this isolated flow.
  if(!profile.data&&!members.data?.length) {
    await registrationRpc('provision_etrylue_customer',{p_user_id:userId});
    [profile,members]=await identity();
    if(profile.error||members.error)throw new BillingError('REGISTRATION_UNAVAILABLE',503);
  }
  if(!profile.data?.company_id||!members.data?.length)throw new BillingError('REGISTRATION_ACCOUNT_REQUIRED',409);
  const links=await client.from('workspaces').select('tenant_id').eq('company_id',profile.data.company_id)
    .in('tenant_id',members.data.map(m=>m.tenant_id));
  if(links.error)throw new BillingError('REGISTRATION_UNAVAILABLE',503);
  const ids=[...new Set((links.data||[]).map(w=>w.tenant_id).filter(Boolean))];
  if(ids.length!==1)throw new BillingError('REGISTRATION_ACCOUNT_REQUIRED',409);
  return {company_id:profile.data.company_id as string,tenant_id:ids[0] as string};
}
export async function createRegistrationDraft(paymentDb:SupabaseClient,userId:string,id:string,name:string) {
  const validatedName=advertiserName(name);
  const context=await companyContext(userId);
  const targetId=draftTarget(userId,id,process.env.BILLING_REVIEW_STATE_SECRET||'');
  const proposed={order_id:id,user_id:userId,target_id:targetId,...context,name:validatedName,app_project:REGISTRATION_APP_PROJECT};
  const insert=await paymentDb.from('billing_test_registration_drafts').insert(proposed);
  if(insert.error&&insert.error.code!=='23505')throw new BillingError('BILLING_STORAGE_UNAVAILABLE',503);
  const saved=await paymentDb.from('billing_test_registration_drafts').select('*').eq('order_id',id).eq('app_project',REGISTRATION_APP_PROJECT).single();
  if(saved.error||!saved.data||Object.entries(proposed).some(([key,value])=>saved.data[key]!==value))throw new BillingError('ORDER_DRAFT_CONFLICT',409);
  return {targetId,context:{workspace_id:null,tenant_id:context.tenant_id}};
}
export async function syncRegistration(paymentDb:SupabaseClient,order:RegistrationOrder,value:unknown,expectedKey?:string) {
  assertRegistration();
  if(!isRegistrationOrder(order)||order.mode!=='once'||order.scope!=='advertiser'||order.workspace_id!==null||
    order.amount!==quote('advertiser','once').amount)throw new BillingError('REGISTRATION_ORDER_MISMATCH',409);
  const payment=verifiedPayment(value,{id:order.id,amount:order.amount},expectedKey);
  if((value as {mId?:string}).mId!=='tetryluei6e'||payment.type!=='NORMAL')throw new BillingError('REVIEW_MERCHANT_MISMATCH',409);
  const draft=await paymentDb.from('billing_test_registration_drafts').select('*').eq('order_id',order.id)
    .eq('user_id',order.user_id).eq('app_project',REGISTRATION_APP_PROJECT).single();
  if(draft.error||!draft.data||draft.data.target_id!==order.target_id||draft.data.tenant_id!==order.tenant_id||!uuid(draft.data.company_id))
    throw new BillingError('ORDER_DRAFT_CONFLICT',409);
  if(payment.status==='DONE'){
    // The old payment ledger is monotonic too: a stale DONE must not create a first registration after a refund.
    if(order.status!=='active')return;
    await registrationRpc<RegistrationRow>('etrylue_registration_record',{p:{order_id:order.id,advertiser_id:order.target_id,
      buyer_id:order.user_id,company_id:draft.data.company_id,tenant_id:draft.data.tenant_id,name:draft.data.name,
      amount:order.amount,approved_at:payment.approvedAt}});
    return;
  }
  let registered:RegistrationRow;
  try {registered=await registrationGet(order.id,order.user_id);}catch(error){
    if(error instanceof BillingError&&error.code==='REGISTRATION_NOT_FOUND')return;throw error;
  }
  if(registered.refund_requested_at&&registered.refund_amount===payment.totalAmount-payment.balanceAmount){
    await registrationRpc('etrylue_registration_confirm_refund',{p_order:order.id,p_confirmed_amount:registered.refund_amount});
  }else{
    await registrationRpc('etrylue_registration_provider_state',{p_order:order.id,p_status:payment.status});
    if(registered.payment_status==='refund_pending'&&payment.status==='PARTIAL_CANCELED')throw new BillingError('REFUND_REQUIRES_REVIEW',409);
  }
}

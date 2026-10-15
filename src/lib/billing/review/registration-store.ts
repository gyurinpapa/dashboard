import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { BillingError } from './config';
import { assertRegistration, REGISTRATION_APP_PROJECT } from './registration-config';

export type RegistrationRow = {
  order_id:string; advertiser_id:string; buyer_id:string; company_id:string; tenant_id:string;
  name:string; amount:number; approved_at:string; payment_status:'verified'|'refund_pending'|'refunded'|'review';
  workspace_id:string|null; assigned_by:string|null; started_at:string|null; paid_until:string|null; created_at:string;
  refund_requested_at:string|null; refund_amount:number|null;
};
const calls = new Set(['provision_etrylue_customer','etrylue_registration_record','etrylue_registration_assign','etrylue_registration_reserve_refund',
  'etrylue_registration_confirm_refund','etrylue_registration_provider_state','etrylue_registration_get','etrylue_registration_list','etrylue_registration_access_many']);
/** Separate from appReadDb: only reviewed registration RPCs and existing account provisioning. */
export async function registrationRpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
  assertRegistration();
  if (!calls.has(name) || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new BillingError('REGISTRATION_UNAVAILABLE',503);
  const origin=`https://${REGISTRATION_APP_PROJECT}.supabase.co`;
  const client=createClient(origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      const method=(init?.method || (input instanceof Request?input.method:'GET')).toUpperCase();
      if (url.origin!==origin || method!=='POST' || url.pathname!==`/rest/v1/rpc/${name}` || url.search)
        throw new BillingError('REGISTRATION_TRANSPORT_DENIED',503);
      return fetch(input,{...init,redirect:'error'});
    }}});
  const {data,error}=await client.rpc(name,args);
  if(error){
    if(name==='provision_etrylue_customer') {
      const identityError=['CUSTOMER_ACCOUNT_REQUIRED','CUSTOMER_EMAIL_UNVERIFIED','CUSTOMER_EXISTING_IDENTITY'].includes(error.message);
      throw new BillingError(identityError?'REGISTRATION_ACCOUNT_REQUIRED':'REGISTRATION_UNAVAILABLE',identityError?409:503);
    }
    const allowed=['REGISTRATION_NOT_FOUND','ASSIGNMENT_SCOPE_DENIED','ASSIGNMENT_ROLE_DENIED','BUYER_DESTINATION_ACCESS_REQUIRED',
      'VERIFIED_PAYMENT_REQUIRED','ALREADY_ASSIGNED','REGISTRATION_CONFLICT','REFUND_AMOUNT_MISMATCH','REFUND_REQUIRES_REVIEW'];
    const code=allowed.find(c=>error.message===c);
    throw new BillingError(code || 'REGISTRATION_UNAVAILABLE',code==='REGISTRATION_NOT_FOUND'?404:
      code==='ASSIGNMENT_SCOPE_DENIED'||code==='ASSIGNMENT_ROLE_DENIED'?403:code?409:503);
  }
  return data as T;
}
export function registrationGet(orderId:string,actorId:string) {
  return registrationRpc<RegistrationRow>('etrylue_registration_get',{p_order:orderId,p_actor:actorId});
}
export function registrationAccess(ids:string[]) {
  return registrationRpc<RegistrationRow[]>('etrylue_registration_access_many',{p_advertisers:ids});
}

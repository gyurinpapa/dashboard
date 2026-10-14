import { actor,loadOrder,reconcile } from '@/lib/billing/review/server';
import { assertRegistration } from '@/lib/billing/review/registration-config';
import { isRegistrationOrder } from '@/lib/billing/review/registration-service';
import { registrationGet,registrationRpc,type RegistrationRow } from '@/lib/billing/review/registration-store';
import { BillingError,uuid } from '@/lib/billing/review/config';
import { body,failure,json } from '@/lib/billing/review/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    assertRegistration();const userId=await actor(request),params=new URL(request.url).searchParams;
    const before=params.get('before'),cursor=params.get('cursor'),limit=Number(params.get('limit')||30);
    if((before===null)!==(cursor===null)||(before!==null&&!Number.isFinite(Date.parse(before)))||(cursor!==null&&!uuid(cursor))||!Number.isInteger(limit)||limit<1||limit>100)
      throw new BillingError('INVALID_REGISTRATION_PAGE');
    const rows=await registrationRpc<RegistrationRow[]>('etrylue_registration_list',{p_actor:userId,p_before:before,p_cursor:cursor,p_limit:limit});
    return json({ok:true,registrations:rows});
  }catch(error){return failure(error);}
}
export async function POST(request:Request){
  try{
    assertRegistration();const userId=await actor(request),input=await body(request);
    if(Object.keys(input).some(k=>!['orderId','workspaceId'].includes(k))||!uuid(input.orderId)||!uuid(input.workspaceId))throw new BillingError('INVALID_ASSIGNMENT');
    // Authorize the reader BEFORE performing provider work or loading another buyer's ledger.
    const registered=await registrationGet(input.orderId,userId);
    const order=await loadOrder(input.orderId);
    if(!isRegistrationOrder(order)||order.user_id!==registered.buyer_id||order.target_id!==registered.advertiser_id)
      throw new BillingError('REGISTRATION_ORDER_MISMATCH',409);
    await reconcile(order.id);
    const value=await registrationRpc<RegistrationRow>('etrylue_registration_assign',{p_order:order.id,p_actor:userId,p_workspace:input.workspaceId});
    return json({ok:true,advertiserId:value.advertiser_id,workspaceId:value.workspace_id,startedAt:value.started_at,paidUntil:value.paid_until});
  }catch(error){return failure(error);}
}

import { CustomerError } from '@/lib/customer-onboarding/contract';
import { checkOrigin, customerClient, customerFailure, customerJson } from '@/lib/customer-onboarding/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  try {
    checkOrigin(req);
    const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if(!token) throw new CustomerError('LOGIN_REQUIRED',401);
    const db=customerClient();
    const {data,error}=await db.auth.getUser(token);
    if(error || !data.user) throw new CustomerError('LOGIN_REQUIRED',401);
    if(!data.user.email_confirmed_at) throw new CustomerError('EMAIL_UNVERIFIED',403);
    const result=await db.rpc('provision_etrylue_customer',{p_user_id:data.user.id});
    if(result.error) {
      if(result.error.message.includes('CUSTOMER_ACCOUNT_REQUIRED')) throw new CustomerError('EXISTING_ACCOUNT',409);
      throw new CustomerError('PROVISIONING_FAILED',503);
    }
    return customerJson({ok:true});
  } catch(error) {return customerFailure(error);}
}

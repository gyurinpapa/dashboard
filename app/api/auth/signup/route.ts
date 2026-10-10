import { createClient } from '@supabase/supabase-js';
import { CustomerError, registrationAttributes, registrationInput } from '@/lib/customer-onboarding/contract';
import { checkOrigin, clientHash, customerClient, customerFailure, customerJson, requestBody } from '@/lib/customer-onboarding/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  try {
    const origin=checkOrigin(req);
    const input=registrationInput(await requestBody(req));
    const db=customerClient();
    const {data:state,error}=await db.rpc('reserve_etrylue_customer_signup',{p_email:input.email,p_client_hash:clientHash(req)});
    if(error || !['new','pending','existing','limited'].includes(state)) throw new CustomerError('ONBOARDING_UNAVAILABLE',503);
    if(state==='limited') throw new CustomerError('TOO_MANY_ATTEMPTS',429);
    if(state==='new') {
      const created=await db.auth.admin.createUser(registrationAttributes(input));
      // Never overwrite or reclassify an existing account, including concurrent requests.
      if(created.error || !created.data.user || created.data.user.email_confirmed_at)
        throw new CustomerError('ONBOARDING_UNAVAILABLE',503);
    }
    if(state!=='existing') {
      const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const sent=await auth.auth.resend({type:'signup',email:input.email,options:{emailRedirectTo:`${origin}/onboarding`}});
      if(sent.error) throw new CustomerError('EMAIL_SEND_FAILED',503);
    }
    return customerJson({ok:true,message:'신규 가입 대상이면 인증 메일을 발송했습니다. 기존 계정은 기존 비밀번호로 로그인해주세요.'});
  } catch(error) {return customerFailure(error);}
}

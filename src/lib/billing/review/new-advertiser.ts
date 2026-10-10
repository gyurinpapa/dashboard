import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { BillingError } from './config';
import { appTargets, assertAppDatabase } from './app-targets';
// Provisioning is deliberately restricted to the isolated onboarding database.
export function assertNewAdvertiserTest() {
 const url=assertAppDatabase();
 if(process.env.VERCEL_ENV!=='preview'||url!=='https://lpwmxtnzpgyrhphwufsd.supabase.co'||process.env.CUSTOMER_ONBOARDING_ENABLED!=='true')
  throw new BillingError('NEW_ADVERTISER_TEST_ONLY',503);
 return url;
}
export function draftTarget(userId:string,orderId:string,secret:string) {
 if(secret.length<32)throw new BillingError('STATE_SECRET_REQUIRED',503);
 const h=createHmac('sha256',secret).update(`new-advertiser:${userId}:${orderId}`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function advertiserName(value:unknown) {
 const name=typeof value==='string'?value.trim():'';
 if(!name||name.length>100||/[\u0000-\u001f\u007f]/u.test(name))throw new BillingError('INVALID_ADVERTISER_NAME');
 return name;
}
export async function newAdvertiserContext(userId:string,workspaceId:string) {
 assertNewAdvertiserTest();
 const options=await appTargets(userId);
 const workspace=options.newAdvertiserWorkspaces.find(w=>w.id===workspaceId);
 if(!workspace)throw new BillingError('TARGET_NOT_ALLOWED',403);
 return {workspace_id:workspace.id as string,tenant_id:workspace.tenant_id as string|null};
}
export async function createVerifiedTestAdvertiser(draft:{target_id:string;user_id:string;workspace_id:string;name:string}) {
 const context=await newAdvertiserContext(draft.user_id,draft.workspace_id);
 const client=createClient(assertNewAdvertiserTest(),process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 // Server-derived stable ID: retries cannot create a second advertiser.
 const record={id:draft.target_id,workspace_id:context.workspace_id,tenant_id:context.tenant_id,created_by:draft.user_id,name:draft.name};
 const result=await client.from('advertisers').insert(record);
 if(result.error&&result.error.code!=='23505')throw new BillingError('ADVERTISER_PREPARATION_FAILED',503);
 const check=await client.from('advertisers').select('id,workspace_id,created_by,name').eq('id',draft.target_id).single();
 if(check.error||check.data.workspace_id!==draft.workspace_id||check.data.created_by!==draft.user_id||check.data.name!==draft.name)throw new BillingError('ADVERTISER_PREPARATION_FAILED',409);
}

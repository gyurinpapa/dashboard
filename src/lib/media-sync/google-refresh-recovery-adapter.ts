import type {SupabaseClient} from '@supabase/supabase-js';
import type {RequestAuthority} from './google-refresh-request-continuation';
import type {ReplaceGoogleAdsDailyV2FactDateInput,GoogleAdsDailyV2FactReplacementResult} from './google-ads-daily-v2-fact-authority-repository';
import {replaceGoogleAdsDailyV2FactDate} from './google-ads-daily-v2-fact-authority-repository';
import {routeGoogleRefreshFactReplacement,type FactScope,type FactReservation} from './google-refresh-fact-routing';
type Client=Pick<SupabaseClient,'from'|'rpc'>;
const object=(x:unknown):Record<string,any>|null=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,any>:null;
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function fail():never{throw new Error('GOOGLE_RECOVERY_UNCONFIRMED');}
async function lookup(client:Client,jobId:string){
 const {data,error}=await client.from('google_ads_refresh_reservations').select('request_id,job_id,report_id,workspace_id,advertiser_id,state,payload').eq('job_id',jobId).maybeSingle();
 if(error)fail();if(data===null)return null;
 const q=object(data),p=object(q?.payload);if(!q||!p||!uuid(p.actor_user_id))fail();
 const scope={requestId:q.request_id,jobId:q.job_id,reportId:q.report_id,workspaceId:q.workspace_id,advertiserId:q.advertiser_id,connectionId:p.connection_id,accountId:p.external_account_id,date:p.date,state:q.state};
 if(![scope.requestId,scope.jobId,scope.reportId,scope.workspaceId,scope.advertiserId,scope.connectionId].every(uuid)||scope.jobId!==jobId)fail();
 return {scope:scope as FactReservation,actorId:p.actor_user_id};
}
async function invoke(client:Client,q:FactReservation,actor:string,action:'replace'|'restore'|'release'){
 const p={request_id:q.requestId,report_id:q.reportId,job_id:q.jobId,actor_user_id:actor,action};
 let response;try{response=await client.rpc('manage_google_refresh_fact_recovery',{p_payload:p});}catch{fail();}
 const r=object(response.data);if(response.error||!r||r.request_id!==q.requestId||r.report_id!==q.reportId||r.job_id!==q.jobId||r.action!==action||!object(r.result))fail();
 return r.result as Record<string,any>;
}
/** Factory is never called when disabled; original daily callback retains all behavior. */
export async function replaceGoogleRefreshFactWithAccess(input:Readonly<{
 enabled?:boolean;executionApproved?:boolean;replacement:ReplaceGoogleAdsDailyV2FactDateInput;
 daily:()=>Promise<GoogleAdsDailyV2FactReplacementResult>;createClient:()=>Client;
}>){
 if(input.enabled!==true)return input.daily();
 if(input.executionApproved!==true)fail();
 const j=input.replacement.job;
 const scope:FactScope={jobId:j.id,reportId:j.report_id,workspaceId:j.workspace_id,advertiserId:j.advertiser_id,connectionId:j.connection_id,accountId:j.external_account_id,date:input.replacement.date};
 const client=input.createClient();let actor:string|null=null;
 return routeGoogleRefreshFactReplacement({enabled:true,executionApproved:true,scope,daily:input.daily,recovery:{
 find:async s=>{const q=await lookup(client,s.jobId);actor=q?.actorId??null;return q?.scope??null;},
 replaceWithBackup:async q=>{
  if(!actor)fail();let called=false;
  // Reuse existing validation/result parsing; sanitized failures cannot trigger its transient retries.
  return replaceGoogleAdsDailyV2FactDate(input.replacement,{invokeRpc:async(name,args)=>{
   if(called||name!=='replace_google_ads_daily_v2_fact_date'||args.p_payload.job_id!==q.jobId||args.p_payload.date!==q.date)fail();called=true;
   const r=await invoke(client,q,actor!,'replace');const {replayed,...raw}=r;
   if(typeof replayed!=='boolean')fail();return {data:[raw],error:null};
  }});
 }
 }});
}
/** Only the live authenticated requester may request restoration/release; SQL rechecks under locks. */
export async function manageGoogleRefreshRecoveryRequest(input:Readonly<{
 enabled?:boolean;executionApproved?:boolean;request:Request;reportId:string;jobId:string;requestId:string;action:'restore'|'release';
 createClient:()=>Client;resolveAccess:RequestAuthority;
}>){
 if(input.enabled!==true)return {action:'disabled'} as const;
 if(input.executionApproved!==true||![input.reportId,input.jobId,input.requestId].every(uuid)||!['restore','release'].includes(input.action))fail();
 const a=await input.resolveAccess(input.request,input.reportId);
 if(!a||!a.canRunSync||!['true_master','workspace','own_created'].includes(a.accessScope)||a.reportId!==input.reportId||!uuid(a.userId))fail();
 const client=input.createClient(),q=await lookup(client,input.jobId);
 if(!q||q.scope.requestId!==input.requestId||q.scope.reportId!==a.reportId||q.scope.workspaceId!==a.workspaceId||q.scope.advertiserId!==a.advertiserId||q.actorId!==a.userId)fail();
 const r=await invoke(client,q.scope,a.userId,input.action);
 if(r.state!==(input.action==='restore'?'restored':'released')||typeof r.replayed!=='boolean'||r.reservation_released!==(input.action==='release'))fail();
 return {action:input.action,replayed:r.replayed as boolean};
}

import type {Scope,Identity,Observation} from '../contract';
import {record,makeIdentity} from '../contract';
import {normalizeGoogle} from '../google';
import {adMetadataQuery,assetMetadataQuery,linkedAssets} from '../collector';
import type {ReadTransport,ReadRequest,Target} from '../collector';
import {Failure,fail,requestJson} from './http';
import type {Session,FetchPort,ServerProblem} from './http';

export type Binding=Scope&Readonly<{connectionId:string;credentialRevision:string}>;
export type Secrets=Readonly<{binding:Binding}> & (
 Readonly<{provider:'naver_searchad';customerId:string;accessLicense:string;secretKey:string}>|
 Readonly<{provider:'google_ads';refreshToken:string;clientId:string;clientSecret:string;developerToken:string;loginCustomerId:string|null}>
);
function sameScope(a:Scope,b:Scope):boolean{return a.workspaceId===b.workspaceId&&a.advertiserId===b.advertiserId&&a.provider===b.provider&&a.externalAccountId===b.externalAccountId;}
function secret(value:unknown):string{
 if(typeof value!=='string'||value.length<1||value.length>20000||value.trim()!==value||/[^\x21-\x7e]/.test(value))fail('INVALID_CREDENTIALS');return value;
}
/** Snapshot trusted decoder output; do not accept credentials/binding from HTTP clients. */
export function validateSecrets(value:Secrets,binding:Binding):Secrets{
 if(!value||!value.binding||!sameScope(value.binding,binding)||value.provider!==binding.provider||
  value.binding.connectionId!==binding.connectionId||value.binding.credentialRevision!==binding.credentialRevision)fail('INVALID_CREDENTIALS');
 if(value.provider==='naver_searchad'){
  if(value.customerId!==binding.externalAccountId)fail('INVALID_CREDENTIALS');
  return Object.freeze({binding,provider:value.provider,customerId:value.customerId,accessLicense:secret(value.accessLicense),secretKey:secret(value.secretKey)});
 }
 if(value.loginCustomerId!==null&&!/^\d{10}$/.test(value.loginCustomerId))fail('INVALID_CREDENTIALS');
 return Object.freeze({binding,provider:value.provider,refreshToken:secret(value.refreshToken),clientId:secret(value.clientId),
  clientSecret:secret(value.clientSecret),developerToken:secret(value.developerToken),loginCustomerId:value.loginCustomerId});
}
function statusProblem(status:number):ServerProblem{
 return status===401||status===403?'AUTH_ERROR':status===429?'RATE_LIMITED':'PROVIDER_ERROR';
}
function statusFailure(status:number):never{fail(statusProblem(status));}
async function token(session:Session,fetchPort:FetchPort,s:Extract<Secrets,{provider:'google_ads'}>):Promise<{value:string;expires:number}>{
 const start=performance.now();
 const body=new URLSearchParams({grant_type:'refresh_token',client_id:s.clientId,client_secret:s.clientSecret,refresh_token:s.refreshToken}).toString();
 const r=await requestJson(session,fetchPort,'oauth','https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body});
 if(r.status!==200)statusFailure(r.status);
 const b=record(r.body),expires=b.expires_in;
 if(b.token_type!=='Bearer'||typeof expires!=='number'||!Number.isSafeInteger(expires)||expires<=0||expires>86400)fail('INVALID_CREDENTIALS');
 const value=secret(b.access_token);
 if(b.scope!==undefined&&b.scope!==null&&b.scope!==''){
  if(typeof b.scope!=='string'||!b.scope.split(/\s+/).includes('https://www.googleapis.com/auth/adwords'))fail('INVALID_CREDENTIALS');
 }
 return {value,expires:start+expires*1000};
}
/** Equivalent to existing timestamp.method.uri HMAC. Does not use or download media URLs. */
export async function signNaver(timestamp:string,uri:string,secretKey:string):Promise<string>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secretKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.GET.${uri}`));
 return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
export type BoundTransport=Readonly<{read:ReadTransport;problem:()=>ServerProblem|null;dispose:()=>void}>;
/** Private per-invocation port. Must not be published as a generic credentialed HTTP proxy. */
export async function createBoundTransport(input:{binding:Binding;secrets:Secrets;targets:readonly Target[];observation:Observation;session:Session;fetchPort:FetchPort}):Promise<BoundTransport>{
 if(typeof window!=='undefined')fail('REQUEST_NOT_ALLOWED');
 const {session,fetchPort,observation}=input;
 const binding=Object.freeze({...input.binding});const s=validateSecrets(input.secrets,binding);
 const ids=new Map<string,Identity>(),queries=new Map<string,Identity>();
 for(const t of input.targets){
  const i=makeIdentity(t.identity);
  if(!sameScope(i,binding)||i.entityType!=='ad')fail('REQUEST_NOT_ALLOWED');
  if(i.provider==='naver_searchad'&&!/^nad-[a-zA-Z0-9-]{1,100}$/.test(i.entityId))fail('REQUEST_NOT_ALLOWED');
  ids.set(i.entityId,i);if(i.provider==='google_ads')queries.set(adMetadataQuery(i.entityId),i);
 }
 if(!ids.size||ids.size>20)fail('INVALID_INPUT');
 if(binding.provider==='google_ads'&&!/^\d{10}$/.test(binding.externalAccountId))fail('INVALID_INPUT');
 if(binding.provider==='google_ads'&&session.maxRequests-session.counts().totalHttpRequests<2)fail('BUDGET_EXHAUSTED');
 let access:string|null=null,expiry=0;
 if(s.provider==='google_ads'){const t=await token(session,fetchPort,s);access=t.value;expiry=t.expires;}
 let problem:ServerProblem|null=null,disposed=false,busy=false,pendingAssetQuery:string|null=null;
 const usedAds=new Set<string>();
 const read:ReadTransport=async(request:ReadRequest,signal:AbortSignal)=>{
  if(busy||disposed||problem)fail('CLOSED');busy=true;
  try{
   session.assertLive();if(signal.aborted)fail('ABORTED');
   if(!sameScope(request.scope,binding)||request.purpose!=='creative_metadata')fail('REQUEST_NOT_ALLOWED');
   if(s.provider==='naver_searchad'){
    const match=/^\/ncc\/ads\/(nad-[a-zA-Z0-9-]{1,100})$/.exec(request.path);
    if(request.origin!=='https://api.searchad.naver.com'||request.method!=='GET'||request.body!==null||!match||!ids.has(match[1]!)||usedAds.has(match[1]!))fail('REQUEST_NOT_ALLOWED');
    usedAds.add(match[1]!);
    const timestamp=String(Date.now());const signature=await session.run(()=>signNaver(timestamp,request.path,s.secretKey),session.remaining(),signal);
    const response=await requestJson(session,fetchPort,'metadata',request.origin+request.path,{method:'GET',headers:{
     Accept:'application/json','X-Timestamp':timestamp,'X-API-KEY':s.accessLicense,'X-Customer':s.customerId,'X-Signature':signature}},signal);
    if(response.status!==200&&response.status!==404)problem=statusProblem(response.status);
    return response;
   }
   if(request.origin!=='https://googleads.googleapis.com'||request.method!=='POST'||
    request.path!==`/v25/customers/${binding.externalAccountId}/googleAds:search`||!request.body||Object.keys(request.body).length!==1)fail('REQUEST_NOT_ALLOWED');
   const query=request.body.query;const ad=queries.get(query);
   if(ad){if(usedAds.has(ad.entityId))fail('REQUEST_NOT_ALLOWED');usedAds.add(ad.entityId);pendingAssetQuery=null;}
   else if(pendingAssetQuery===null||pendingAssetQuery!==query)fail('REQUEST_NOT_ALLOWED');
   else pendingAssetQuery=null;
   if(access===null||performance.now()+5000>=expiry)fail('TOKEN_EXPIRED');
   const headers:Record<string,string>={Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${access}`,'developer-token':s.developerToken};
   if(s.loginCustomerId)headers['login-customer-id']=s.loginCustomerId;
   const response=await requestJson(session,fetchPort,'metadata',request.origin+request.path,{method:'POST',headers,body:JSON.stringify({query})},signal);
   if(response.status!==200)problem=statusProblem(response.status);
   if(ad&&response.status===200){
    const b=record(response.body);
    if(Array.isArray(b.results)&&b.results.length===1&&!b.nextPageToken){
     const check=normalizeGoogle({identity:ad,observation,adResult:b.results[0],assetResults:[]});
     if(!check.ok)fail(check.reason);
     if(check.metadata.status!=='unsupported'){
      const names=linkedAssets(b.results[0],ad);
      if(names.length)pendingAssetQuery=assetMetadataQuery(binding.externalAccountId,names);
     }
    }
   }
   return response;
  }catch(e){problem=e instanceof Failure?e.code:'TRANSPORT_ERROR';throw new Failure(problem);}
  finally{busy=false;}
 };
 return Object.freeze({read,problem:()=>problem,dispose:()=>{disposed=true;access=null;pendingAssetQuery=null;}});
}

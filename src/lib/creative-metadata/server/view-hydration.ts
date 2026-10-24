import {identityKey} from '../contract';
import type {Metadata} from '../contract';
import type {Target} from '../collector';
import {normalizeNaver} from '../naver';
import {META_CREATIVE_FIELDS,normalizeMetaCreative} from '../meta';
import {cacheKeys,digest,readyMetadata} from '../cache/contract';
import type {CacheStore} from '../cache/contract';
import type {ViewPorts,ViewState} from './view-service';
import type {ViewRequest} from '../view';
import {Session,fail,requestJson} from './http';
import type {FetchPort} from './http';
import {signNaver} from './transport';

export type HydrationViewPorts=ViewPorts&{
  targets:(state:ViewState,input:ViewRequest,signal:AbortSignal)=>Promise<readonly Target[]>;
};
export type PreviewSecrets={provider:'naver_searchad';customerId:string;accessLicense:string;secretKey:string}|
  {provider:'meta_ads';accessToken:string};
export type HydrationDependencies={
  cache:CacheStore;
  secrets:(state:ViewState,signal:AbortSignal)=>Promise<PreviewSecrets>;
  fetch:FetchPort;
};

/** Public shares authorize only metadata for ads proved inside their published snapshot.
 * No fake user session, arbitrary URL, performance query or scheduler port exists here.
 * The existing account lease, hourly quota and cooldown remain authoritative.
 */
export async function hydrateViewMetadata(input:ViewRequest,ports:HydrationViewPorts,deps:HydrationDependencies,signal?:AbortSignal){
  if(input.provider!=='naver_searchad'&&input.provider!=='meta_ads')return {retryAt:null};
  const session=new Session(20,4000,28000,signal);
  let token:string|null=null,accountKey='',finished=false;
  try{
    const state=await session.run(s=>ports.snapshot(s));
    if(state.binding.provider!==input.provider||state.binding.externalAccountId!==input.externalAccountId)fail('SCOPE_MISMATCH');
    const targets=await session.run(s=>ports.targets(state,input,s));
    if(targets.length!==input.entityIds.length||new Set(targets.map(t=>identityKey(t.identity))).size!==targets.length)fail('ACCESS_DENIED');
    for(const {identity:i,campaignType} of targets){
      if(i.workspaceId!==state.binding.workspaceId||i.advertiserId!==state.binding.advertiserId||i.provider!==input.provider||
        i.externalAccountId!==input.externalAccountId||i.entityType!=='ad'||!input.entityIds.includes(i.entityId)||
        i.provider==='naver_searchad'&&!['WEB_SITE','SHOPPING'].includes(campaignType??''))fail('ACCESS_DENIED');
    }
    const keys=await cacheKeys(state.binding,targets.map(t=>t.identity));accountKey=keys.accountKey;
    if((await session.run(s=>ports.snapshot(s))).stamp!==state.stamp)fail('STALE_CONTEXT');
    const claim=await session.run(s=>deps.cache.claim({...keys,maxRequests:targets.length},s));
    if(!['hit','leader','busy','cooldown','budget'].includes(claim.status)||!Array.isArray(claim.entries))fail('INVALID_CONTEXT');
    const cached=new Set<string>();
    for(const e of claim.entries){
      const index=keys.keys.indexOf(e.key);
      if(index<0||cached.has(e.key)||!Number.isFinite(e.expiresAt)||e.expiresAt<=Date.now()||
        !readyMetadata(e.metadata,targets[index].identity,Date.now()))fail('INVALID_CONTEXT');
      cached.add(e.key);
    }
    if(claim.status!=='leader')return {retryAt:Number.isFinite(claim.retryAt)&&claim.retryAt>Date.now()?claim.retryAt:null};
    if(!claim.token||!/^[a-f0-9-]{36}$/.test(claim.token)||claim.leaseUntil<Date.now()+30000)fail('INVALID_CONTEXT');
    token=claim.token;
    const secrets=await session.run(s=>deps.secrets(state,s));
    if(secrets.provider!==input.provider||(secrets.provider==='naver_searchad'&&secrets.customerId!==input.externalAccountId))fail('INVALID_CREDENTIALS');
    if((await session.run(s=>ports.snapshot(s))).stamp!==state.stamp)fail('STALE_CONTEXT');
    const missing=targets.map((t,i)=>({target:t,key:keys.keys[i]})).filter(x=>!cached.has(x.key));
    const accepted:{key:string;metadata:Metadata}[]=[];
    let rateLimited=false;
    for(let start=0;start<missing.length;start+=4){
      const wave=await Promise.allSettled(missing.slice(start,start+4).map(async({target,key})=>{
        const observation={revision:crypto.randomUUID(),fetchedAt:new Date().toISOString()};
        let response;
        if(secrets.provider==='naver_searchad'){
          const path=`/ncc/ads/${target.identity.entityId}`,now=String(Date.now());
          response=await requestJson(session,deps.fetch,'metadata',`https://api.searchad.naver.com${path}`,{method:'GET',headers:{
            Accept:'application/json','X-Timestamp':now,'X-API-KEY':secrets.accessLicense,'X-Customer':secrets.customerId,
            'X-Signature':await signNaver(now,path,secrets.secretKey)}});
        }else{
          response=await requestJson(session,deps.fetch,'metadata',
            `https://graph.facebook.com/v26.0/${target.identity.entityId}?fields=${encodeURIComponent(META_CREATIVE_FIELDS)}`,
            {method:'GET',headers:{Accept:'application/json',Authorization:`Bearer ${secrets.accessToken}`}});
        }
        if(response.status===429){rateLimited=true;return null;}
        if(response.status!==200)return null;
        const normalized=secrets.provider==='naver_searchad'
          ? normalizeNaver({identity:target.identity,observation,campaignType:target.campaignType!,ad:response.body})
          : normalizeMetaCreative({identity:target.identity,observation,ad:response.body});
        const metadata=normalized.ok?readyMetadata(normalized.metadata,target.identity,Date.now()):null;
        return metadata?{key,metadata}:null;
      }));
      for(const result of wave)if(result.status==='fulfilled'&&result.value)accepted.push(result.value);
      if(rateLimited)break;
    }
    if((await session.run(s=>ports.snapshot(s))).stamp!==state.stamp)fail('STALE_CONTEXT');
    const complete=accepted.length===missing.length;
    finished=await session.run(s=>deps.cache.finish({accountKey,token:token!,entries:accepted,
      outcome:rateLimited?'rate_limited':complete?'success':'failure'},s));
    if(!finished)fail('STALE_CONTEXT');
    return {retryAt:complete?null:Date.now()+(rateLimited?900000:300000)};
  }finally{
    // On cancellation/staleness the bounded lease expires naturally; never publish stale data.
    session.close();
  }
}

/** Credential handling is server-only and only reached after snapshot/identity proof + lease. */
export async function createHydrationDependencies(client:import('@supabase/supabase-js').SupabaseClient):Promise<HydrationDependencies>{
  const {createSupabaseCacheStore}=await import('./cache-store');
  return {cache:createSupabaseCacheStore(client),fetch:(url,init)=>fetch(url,init),async secrets(state,signal){
    const b=state.binding;
    const {data,error}=await client.from('media_connections').select('credential_ciphertext,credential_version')
      .eq('id',b.connectionId).eq('workspace_id',b.workspaceId).eq('advertiser_id',b.advertiserId)
      .eq('provider',b.provider).eq('external_account_id',b.externalAccountId).eq('status','active').abortSignal(signal).single();
    if(error||!data||data.credential_version!==1||typeof data.credential_ciphertext!=='string')fail('INVALID_CREDENTIALS');
    if(await digest([b.connectionId,b.workspaceId,b.advertiserId,b.provider,b.externalAccountId,1,data.credential_ciphertext,null])!==b.credentialRevision)fail('STALE_CONTEXT');
    const context={connectionId:b.connectionId,workspaceId:b.workspaceId,advertiserId:b.advertiserId,externalAccountId:b.externalAccountId};
    if(b.provider==='naver_searchad'){
      const {decryptNaverSearchAdsCredentials}=await import('../../media-sync/connection-credentials');
      return {provider:'naver_searchad',...decryptNaverSearchAdsCredentials(data.credential_ciphertext,{...context,provider:'naver_searchad'})};
    }
    if(b.provider!=='meta_ads')fail('REQUEST_NOT_ALLOWED');
    const {decryptMetaAdsCredentials}=await import('../../media-sync/meta-ads-credentials');
    const secret=decryptMetaAdsCredentials(data.credential_ciphertext,{...context,provider:'meta_ads'});
    return {provider:'meta_ads',accessToken:secret.access_token};
  }};
}

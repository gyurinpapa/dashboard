import {record,identityKey} from '../contract';
import type {Metadata} from '../contract';
import type {Target} from '../collector';
import {normalizeNaver} from '../naver';
import {META_CREATIVE_FIELDS,META_CREATIVE_DETAIL_QUERY,normalizeMetaCreative} from '../meta';
import {cacheKeys,digest,readyMetadata} from '../cache/contract';
import type {CacheStore} from '../cache/contract';
import type {ViewPorts,ViewState} from './view-service';
import type {ViewRequest} from '../view';
import {Session,Failure,fail,requestJson} from './http';
import type {FetchPort} from './http';
import {signNaver} from './transport';
import {NAVER_HISTORY_REQUESTS,readNaverHistory} from './naver-history';

export type HydrationTarget=Target&{historySince?:string};
export type HydrationViewPorts=ViewPorts&{
  targets:(state:ViewState,input:ViewRequest,signal:AbortSignal)=>Promise<readonly HydrationTarget[]>;
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
  const session=new Session(40,4000,28000,signal);
  const diagnostics:Record<string,number>={};
  const count=(key:string)=>{diagnostics[key]=(diagnostics[key]??0)+1;};
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
    const claim=await session.run(s=>deps.cache.claim({...keys,maxRequests:input.provider==='meta_ads'?targets.length*2:targets.length+NAVER_HISTORY_REQUESTS},s));
    if(!['hit','leader','busy','cooldown','budget'].includes(claim.status)||!Array.isArray(claim.entries))fail('INVALID_CONTEXT');
    const cached=new Set<string>();
    for(const e of claim.entries){
      const index=keys.keys.indexOf(e.key);
      if(index<0||cached.has(e.key)||!Number.isFinite(e.expiresAt)||e.expiresAt<=Date.now()||
        !readyMetadata(e.metadata,targets[index].identity,Date.now()))fail('INVALID_CONTEXT');
      cached.add(e.key);
    }
    if(claim.status!=='leader')return {diagnostics:{[claim.status]:1},retryAt:Number.isFinite(claim.retryAt)&&claim.retryAt>Date.now()?claim.retryAt:null};
    if(!claim.token||!/^[a-f0-9-]{36}$/.test(claim.token)||claim.leaseUntil<Date.now()+30000)fail('INVALID_CONTEXT');
    token=claim.token;
    const secrets=await session.run(s=>deps.secrets(state,s));
    if(secrets.provider!==input.provider||(secrets.provider==='naver_searchad'&&secrets.customerId!==input.externalAccountId))fail('INVALID_CREDENTIALS');
    if((await session.run(s=>ports.snapshot(s))).stamp!==state.stamp)fail('STALE_CONTEXT');
    const missing=targets.map((t,i)=>({target:t,key:keys.keys[i]})).filter(x=>!cached.has(x.key));
    const accepted:{key:string;metadata:Metadata}[]=[];
    const notFound:typeof missing=[];
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
        count(`http_${response.status}`);
        if(response.status===200&&secrets.provider==='naver_searchad'){
          const raw=record(response.body),ad=record(raw.ad),basic=record(ad.basic);
          count(raw.type==='TEXT_45'?'naver_text45':raw.type==='RSA_AD'?'naver_rsa':'naver_other');
          count(`flat_headline_${typeof ad.headline}`);count(`flat_description_${typeof ad.description}`);
          count(`basic_headline_${typeof basic.headline}`);count(`basic_description_${typeof basic.description}`);
        }
        if(response.status===429){rateLimited=true;return null;}
        if(response.status===404&&secrets.provider==='naver_searchad'){notFound.push({target,key});return null;}
        if(response.status!==200)return null;
        // Only follow the creative ID returned by the account-validated ad; request a useful preview size.
        if(secrets.provider==='meta_ads'){
          const original=record(response.body),creativeId=record(original.creative).id;
          if(!normalizeMetaCreative({identity:target.identity,observation,ad:original}).ok||
            typeof creativeId!=='string'||!/^\d{1,20}$/.test(creativeId))return null;
          try{
            const detail=await requestJson(session,deps.fetch,'metadata',
              `https://graph.facebook.com/v26.0/${creativeId}?${META_CREATIVE_DETAIL_QUERY}`,
              {method:'GET',headers:{Accept:'application/json',Authorization:`Bearer ${secrets.accessToken}`}});
            if(detail.status===429)rateLimited=true;
            if(detail.status===200){
              const creative=record(detail.body);
              if(creative.id!==creativeId||creative.account_id!==input.externalAccountId)return null;
              response={status:200,body:{...original,creative}};
            }
          }catch{ /* Retain the verified original preview if the optional larger image is unavailable. */ }
        }
        const normalized=secrets.provider==='naver_searchad'
          ? normalizeNaver({identity:target.identity,observation,campaignType:target.campaignType!,ad:response.body})
          : normalizeMetaCreative({identity:target.identity,observation,ad:response.body});
        const metadata=normalized.ok?readyMetadata(normalized.metadata,target.identity,Date.now()):null;
        if(!normalized.ok)count(normalized.reason);
        else if(!metadata){count(`metadata_${normalized.metadata.status}`);for(const issue of normalized.metadata.issues)if(['NO_DISPLAY_CONTENT','IMAGE_URL_UNSUPPORTED','HEADLINE_INVALID','DESCRIPTION_INVALID'].includes(issue))count(issue);}

        return metadata?{key,metadata}:null;
      }));
      for(const result of wave){if(result.status==='fulfilled'&&result.value)accepted.push(result.value);else if(result.status==='rejected')count(result.reason instanceof Failure?result.reason.code:'UNAVAILABLE');}
      if(rateLimited)break;
    }
    let historyPending=false;
    const unavailableEntityIds:string[]=[];
    if(notFound.length&&!rateLimited&&secrets.provider==='naver_searchad'){
      const searchable=notFound.filter(x=>x.target.campaignType==='WEB_SITE'&&x.target.historySince);
      unavailableEntityIds.push(...notFound.filter(x=>!searchable.includes(x)).map(x=>x.target.identity.entityId));
      if(searchable.length)try{
        const history=await readNaverHistory(session,deps.fetch,secrets,searchable.map(x=>x.target),count);
        for(const metadata of history.entries){const found=searchable.find(x=>x.target.identity.entityId===metadata.identity.entityId)!;accepted.push({key:found.key,metadata});}
        rateLimited=history.status==='rate_limited';historyPending=history.status==='pending';
        if(history.status==='ready')unavailableEntityIds.push(...searchable.filter(x=>!history.entries.some(m=>m.identity.entityId===x.target.identity.entityId)).map(x=>x.target.identity.entityId));
      }catch(error){count(error instanceof Failure?`history_${error.code}`:'history_UNAVAILABLE');}
    }
    if((await session.run(s=>ports.snapshot(s))).stamp!==state.stamp)fail('STALE_CONTEXT');
    const complete=accepted.length===missing.length;
    const resolved=accepted.length+unavailableEntityIds.length+(historyPending?notFound.length-unavailableEntityIds.length:0)===missing.length;
    finished=await session.run(s=>deps.cache.finish({accountKey,token:token!,entries:accepted,
      outcome:rateLimited?'rate_limited':resolved?'success':'failure'},s));
    if(!finished)fail('STALE_CONTEXT');
    return {diagnostics,unavailableEntityIds,retryAt:complete||resolved&&!historyPending?null:Date.now()+(rateLimited?900000:resolved?60000:300000)};
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

/** Isolated orchestration. No default transport, credentials, DB, worker, cache, or UI imports. */
import {makeIdentity,identityKey,record,id,timestamp,unavailable} from './contract';
import type {Identity,Scope,Observation,Metadata,NormalizeResult} from './contract';
import {normalizeGoogle} from './google';
import {normalizeNaver} from './naver';

export type Target=Readonly<{identity:Identity; campaignType?:string}>;
export type ReadRequest=Readonly<{
  scope:Scope; purpose:'creative_metadata'; method:'GET'|'POST';
  origin:'https://api.searchad.naver.com'|'https://googleads.googleapis.com';
  path:string; body:Readonly<{query:string}>|null;
}>;
/** Must use the server-authorized connection, enforce a byte cap before JSON parsing,
 * honor AbortSignal, reject redirects, and issue exactly ONE request without retries.
 * Credentials must never be included in returned errors/results. No implementation bundled. */
export type ReadTransport=(request:ReadRequest,signal:AbortSignal)=>Promise<Readonly<{status:number;body:unknown}>>;
export type Problem='INVALID_INPUT'|'SCOPE_MISMATCH'|'BUDGET_EXHAUSTED'|'TIMEOUT'|'ABORTED'|
 'TRANSPORT_ERROR'|'AUTH_ERROR'|'RATE_LIMITED'|'PROVIDER_ERROR'|'INVALID_RESPONSE'|
 'RESPONSE_TOO_LARGE'|'INCOMPLETE_RESPONSE'|'AMBIGUOUS_AD'|'ASSET_SCOPE_MISMATCH';
export type Entry=Readonly<{identity:Identity;metadata:Metadata;publishable:boolean}>;
export type Collection=Readonly<{
 status:'disabled'|'rejected'|'stopped'|'completed';problem:Problem|null;
 requestCount:number;targetCount:number;processedCount:number;entries:readonly Entry[];
}>;
export type CollectInput=Readonly<{
 enabled:boolean; authorizedScope:Scope; targets:readonly Target[]; observation:Observation;
 maxRequests:number; requestTimeoutMs:number; totalTimeoutMs:number; signal?:AbortSignal;
}>;
class Stop extends Error { constructor(readonly code:Problem){super(code);} }
function fail(code:Problem):never{throw new Stop(code);}
const numeric=(s:string)=>/^\d{1,20}$/.test(s);

// Fixed attribute-only fields; no performance metrics, date segments, or mutation endpoints.
const fieldSets=Object.freeze({
 responsive_search_ad:['headlines','descriptions'],
 responsive_display_ad:['headlines','long_headline','descriptions','marketing_images','square_marketing_images','logo_images','square_logo_images','youtube_videos'],
 demand_gen_multi_asset_ad:['headlines','descriptions','marketing_images','square_marketing_images','portrait_marketing_images','tall_portrait_marketing_images','classic_display_images','logo_images'],
 demand_gen_video_responsive_ad:['headlines','long_headlines','descriptions','companion_banners','logo_images','videos'],
});
const adFields=['customer.id','ad_group_ad.ad.id','ad_group_ad.ad.resource_name','ad_group_ad.ad.type','ad_group_ad.ad.name',
 ...Object.entries(fieldSets).flatMap(([type,fields])=>fields.map(f=>`ad_group_ad.ad.${type}.${f}`))];
const assetPaths:Readonly<Record<string,readonly [string,readonly string[]]>>={
 RESPONSIVE_SEARCH_AD:['responsiveSearchAd',[]],
 RESPONSIVE_DISPLAY_AD:['responsiveDisplayAd',['marketingImages','squareMarketingImages','logoImages','squareLogoImages','youtubeVideos']],
 DEMAND_GEN_MULTI_ASSET_AD:['demandGenMultiAssetAd',['marketingImages','squareMarketingImages','portraitMarketingImages','tallPortraitMarketingImages','classicDisplayImages','logoImages']],
 DEMAND_GEN_VIDEO_RESPONSIVE_AD:['demandGenVideoResponsiveAd',['companionBanners','logoImages','videos']],
};
export function linkedAssets(value:unknown,identity:Identity):string[]{
 const ad=record(record(record(value).adGroupAd).ad);
 const spec=typeof ad.type==='string'&&Object.hasOwn(assetPaths,ad.type)?assetPaths[ad.type]:undefined;
 if(!spec)return [];
 const info=record(ad[spec[0]]),names=new Set<string>();
 for(const field of spec[1]){
  const list=info[field];if(list===undefined)continue;
  if(!Array.isArray(list)||list.length>100)return fail('INVALID_RESPONSE');
  for(const entry of list){
   const resource=record(entry).asset;
   const match=typeof resource==='string'?/^customers\/(\d{1,20})\/assets\/(\d{1,20})$/.exec(resource):null;
   if(!match||match[1]!==identity.externalAccountId)return fail('ASSET_SCOPE_MISMATCH');
   names.add(resource as string);
  }
 }
 if(names.size>500)return fail('RESPONSE_TOO_LARGE');
 return [...names].sort();
}
/** Fixed query builders shared with the server transport's exact request allowlist. */
export function adMetadataQuery(entityId:string):string{
 if(!numeric(entityId))return fail('INVALID_INPUT');
 return `SELECT ${adFields.join(', ')} FROM ad_group_ad WHERE ad_group_ad.ad.id = ${entityId} LIMIT 2`;
}
export function assetMetadataQuery(account:string,names:readonly string[]):string{
 if(!numeric(account)||!names.length||names.length>500||new Set(names).size!==names.length||
  names.some(n=>!new RegExp(`^customers/${account}/assets/[0-9]{1,20}$`).test(n)))return fail('INVALID_INPUT');
 return `SELECT asset.id, asset.resource_name, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.resource_name IN (${names.map(n=>`'${n}'`).join(', ')}) LIMIT ${names.length+1}`;
}
function searchRows(body:unknown,max:number):readonly unknown[]{
 const r=record(body);
 if(r.error!==undefined)return fail('PROVIDER_ERROR');
 // Queries are exact-ID bounded. Pagination is deliberately rejected, never silently truncated.
 if(r.nextPageToken!==undefined&&r.nextPageToken!=='')return fail('INCOMPLETE_RESPONSE');
 if(r.results===undefined){
  // A valid empty Search response can omit results. Only accept known envelope fields.
  if(Object.keys(r).some(k=>!['fieldMask','queryResourceConsumption','totalResultsCount','nextPageToken'].includes(k)))return fail('INVALID_RESPONSE');
  if(r.totalResultsCount!==undefined&&String(r.totalResultsCount)!=='0')return fail('INCOMPLETE_RESPONSE');
  return [];
 }
 if(!Array.isArray(r.results))return fail('INVALID_RESPONSE');
 if(r.results.length>max)return fail('RESPONSE_TOO_LARGE');
 return r.results;
}
function accept(result:NormalizeResult):Metadata{
 if(!result.ok)return fail(result.reason);
 return result.metadata;
}
/** Caller must derive scope/targets from server-authorized canonical ad rows.
 * This module is not an authorization boundary. It never changes performance rows. */
export async function collectCreativeMetadata(input:CollectInput,transport:ReadTransport):Promise<Collection>{
 let requestCount=0,targetCount=0;const entries:Entry[]=[];
 const result=(status:Collection['status'],problem:Problem|null=null):Collection=>Object.freeze({
  status,problem,requestCount,targetCount,processedCount:entries.length,entries:Object.freeze([...entries])});
 if(input.enabled!==true)return result('disabled');
 let targets:Target[],scope:Scope,observation:Observation;
 const maxRequests=input.maxRequests,requestTimeoutMs=input.requestTimeoutMs,totalTimeoutMs=input.totalTimeoutMs;
 try{
  if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>40||
   !Number.isInteger(requestTimeoutMs)||requestTimeoutMs<10||requestTimeoutMs>5000||
   !Number.isInteger(totalTimeoutMs)||totalTimeoutMs<requestTimeoutMs||totalTimeoutMs>30000||
   !Array.isArray(input.targets)||input.targets.length>20||!timestamp(input.observation.fetchedAt)||!id(input.observation.revision))fail('INVALID_INPUT');
  const a=makeIdentity({...input.authorizedScope,entityId:'scope-check',entityType:'ad'});
  if(!numeric(a.externalAccountId))fail('INVALID_INPUT');
  scope=Object.freeze({workspaceId:a.workspaceId,advertiserId:a.advertiserId,provider:a.provider,externalAccountId:a.externalAccountId});
  observation=Object.freeze({...input.observation});
  const map=new Map<string,Target>();
  for(const target of input.targets){
   const i=makeIdentity(target.identity);
   if(i.workspaceId!==scope.workspaceId||i.advertiserId!==scope.advertiserId||
    i.provider!==scope.provider||i.externalAccountId!==scope.externalAccountId)fail('SCOPE_MISMATCH');
   if(i.entityType!=='ad'||(i.provider==='google_ads'?!numeric(i.entityId):!/^nad-[a-zA-Z0-9-]{1,100}$/.test(i.entityId)))fail('INVALID_INPUT');
   if(i.provider==='naver_searchad'&&target.campaignType!=='WEB_SITE'&&target.campaignType!=='SHOPPING')fail('INVALID_INPUT');
   const key=identityKey(i);
   map.set(key,Object.freeze(i.provider==='naver_searchad'?{identity:i,campaignType:target.campaignType}:{identity:i}));
  }
  targets=[...map.values()];targetCount=targets.length;
 }catch(e){return result('rejected',e instanceof Stop?e.code:'INVALID_INPUT');}
 const deadline=Date.now()+totalTimeoutMs;
 async function send(request:ReadRequest):Promise<Readonly<{status:number;body:unknown}>>{
  if(input.signal?.aborted)fail('ABORTED');
  if(requestCount>=maxRequests)fail('BUDGET_EXHAUSTED');
  const remaining=deadline-Date.now();if(remaining<=0)fail('TIMEOUT');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let onAbort:()=>void=()=>{};
  const guard=new Promise<never>((_,reject)=>{
   onAbort=()=>{controller.abort();reject(new Stop('ABORTED'));};
   input.signal?.addEventListener('abort',onAbort,{once:true});
   timer=setTimeout(()=>{controller.abort();reject(new Stop('TIMEOUT'));},Math.min(requestTimeoutMs,remaining));
  });
  try{
   requestCount++;
   const response=await Promise.race([Promise.resolve().then(()=>{
    if(controller.signal.aborted)fail(input.signal?.aborted?'ABORTED':'TIMEOUT');
    return transport(Object.freeze(request),controller.signal);
   }),guard]);
   if(input.signal?.aborted)fail('ABORTED');
   if(Date.now()>deadline)fail('TIMEOUT');
   if(!response||!Number.isInteger(response.status)||response.status<100||response.status>599)fail('INVALID_RESPONSE');
   if(response.status===401||response.status===403)fail('AUTH_ERROR');
   if(response.status===429)fail('RATE_LIMITED');
   // Naver GET 404 is an explicit missing ad, not a reason to re-create performance data.
   if(response.status===404&&request.method==='GET')return {status:404,body:null};
   if(response.status!==200)fail('PROVIDER_ERROR');
   const body=record(response.body);
   if(response.body===null||typeof response.body!=='object'||Array.isArray(response.body))fail('INVALID_RESPONSE');
   const serialized=JSON.stringify(body);
   if(new TextEncoder().encode(serialized).byteLength>1048576)fail('RESPONSE_TOO_LARGE');
   return {status:200,body:JSON.parse(serialized) as unknown};
  }catch(e){throw e instanceof Stop?e:new Stop('TRANSPORT_ERROR');}
  finally{if(timer!==undefined)clearTimeout(timer);input.signal?.removeEventListener('abort',onAbort);}
 }
 const googleSearch=(query:string)=>send({scope,purpose:'creative_metadata',method:'POST',
  origin:'https://googleads.googleapis.com',path:`/v25/customers/${scope.externalAccountId}/googleAds:search`,body:Object.freeze({query})});
 try{
  for(const target of targets){
   const identity=target.identity;let metadata:Metadata;
   if(scope.provider==='naver_searchad'){
    const response=await send({scope,purpose:'creative_metadata',method:'GET',origin:'https://api.searchad.naver.com',
     path:`/ncc/ads/${identity.entityId}`,body:null});
    metadata=accept(response.status===404?unavailable(identity,observation,'not_found'):
     normalizeNaver({identity,observation,campaignType:target.campaignType ?? '',ad:response.body}));
   }else{
    const response=await googleSearch(adMetadataQuery(identity.entityId));
    const rows=searchRows(response.body,2);
    if(rows.length>1)fail('AMBIGUOUS_AD');
    if(!rows.length)metadata=accept(unavailable(identity,observation,'not_found'));
    else{
     // Validate the ad's account and identity before following any linked asset references.
     const initial=accept(normalizeGoogle({identity,observation,adResult:rows[0],assetResults:[]}));
     const names=linkedAssets(rows[0],identity);let assets:readonly unknown[]=[];
     if(initial.status!=='unsupported'&&names.length){
      const a=await googleSearch(assetMetadataQuery(scope.externalAccountId,names));
      assets=searchRows(a.body,names.length);
      const seen=new Set<string>();
      for(const item of assets){const name=record(record(item).asset).resourceName;
       if(typeof name!=='string'||!names.includes(name)||seen.has(name))fail('ASSET_SCOPE_MISMATCH');seen.add(name);
      }
     }
     metadata=accept(normalizeGoogle({identity,observation,adResult:rows[0],assetResults:assets}));
    }
   }
   entries.push(Object.freeze({identity,metadata,publishable:metadata.status==='ready'}));
  }
  return result('completed');
 }catch(e){return result('stopped',e instanceof Stop?e.code:'INVALID_RESPONSE');}
}

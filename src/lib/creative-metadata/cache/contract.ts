import {id,identityKey,record,safeImageUrl,timestamp} from '../contract';
import type {Identity,Metadata,Asset} from '../contract';
import type {Binding} from '../server/transport';

export const TTL_MS=6*60*60*1000;
export type Stored=Readonly<{key:string;metadata:unknown;expiresAt:number}>;
export type Claim=Readonly<{status:'hit'|'leader'|'busy'|'cooldown'|'budget';token:string|null;leaseUntil:number;
 now:number;retryAt:number;entries:readonly Stored[]}>;
export type CacheStore=Readonly<{
 claim:(input:{accountKey:string;keys:readonly string[];maxRequests:number},signal:AbortSignal)=>Promise<Claim>;
 finish:(input:{accountKey:string;token:string;entries:readonly {key:string;metadata:Metadata}[];
  outcome:'success'|'failure'|'rate_limited'},signal:AbortSignal)=>Promise<boolean>;
}>;
export async function digest(parts:readonly unknown[]):Promise<string>{
 const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parts)));
 return new Uint8Array(d).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
}
/** Account lock spans connections/credential generations; metadata keys do not. */
export async function cacheKeys(binding:Binding,identities:readonly Identity[]){
 const accountKey=await digest(['creative-account-v1',binding.workspaceId,binding.advertiserId,binding.provider,binding.externalAccountId]);
 const keys=await Promise.all(identities.map(i=>digest(['creative-metadata-v1',accountKey,binding.connectionId,binding.credentialRevision,identityKey(i)])));
 return {accountKey,keys};
}
function exact(r:Record<string,unknown>,keys:readonly string[]):boolean{return Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k));}
function strings(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=100&&value.every(x=>typeof x==='string'&&x.length>0&&x.length<=4000);}
/** Treat persisted data as untrusted. Reject extra keys (including metrics/secrets), foreign scope and unsafe URLs. */
export function readyMetadata(value:unknown,identity:Identity,now:number):Metadata|null{
 try{
  if(new TextEncoder().encode(JSON.stringify(value)).length>16384)return null;
  const r=record(value),i=record(r.identity);
  if(!exact(r,['identity','revision','fetchedAt','sourceUpdatedAt','temporalBasis','status','displayName','headlines','descriptions','assets','issues'])||
   !exact(i,['workspaceId','advertiserId','provider','externalAccountId','entityType','entityId'])||identityKey(i as Identity)!==identityKey(identity)||
   r.status!=='ready'||r.temporalBasis!=='observed_at_fetch'||r.sourceUpdatedAt!==null||!id(r.revision)||typeof r.revision!=='string'||
   !timestamp(r.fetchedAt)||Date.parse(r.fetchedAt as string)>now+60000||Date.parse(r.fetchedAt as string)+TTL_MS<=now||
   !(r.displayName===null||typeof r.displayName==='string'&&r.displayName.length<=4000)||!strings(r.headlines)||!strings(r.descriptions)||
   !Array.isArray(r.issues)||r.issues.length!==0||!Array.isArray(r.assets)||r.assets.length>100)return null;
  for(const raw of r.assets){const a=record(raw);
   if(!exact(a,['assetId','kind','role','imageUrl','videoId','watchUrl','expiresAt'])||!id(a.assetId)||typeof a.assetId!=='string'||
    !['main','logo','thumbnail','other'].includes(String(a.role))||!(a.expiresAt===null||timestamp(a.expiresAt)&&Date.parse(a.expiresAt as string)>now))return null;
   if(a.imageUrl!==null&&safeImageUrl(a.imageUrl,identity.provider)!==a.imageUrl)return null;
   if(a.kind==='image'){if(a.imageUrl===null||a.videoId!==null||a.watchUrl!==null)return null;}
   else if(a.kind==='youtube'){
    if(identity.provider!=='google_ads'||typeof a.videoId!=='string'||!/^[a-zA-Z0-9_-]{11}$/.test(a.videoId)||a.watchUrl!==`https://www.youtube.com/watch?v=${a.videoId}`)return null;
   }else return null;
  }
  return Object.freeze({identity:Object.freeze({...identity}),revision:r.revision,fetchedAt:r.fetchedAt as string,sourceUpdatedAt:null,
   temporalBasis:'observed_at_fetch',status:'ready',displayName:r.displayName,headlines:Object.freeze([...r.headlines]),descriptions:Object.freeze([...r.descriptions]),
   assets:Object.freeze(r.assets.map(a=>Object.freeze({...a as Asset}))),issues:Object.freeze([])});
 }catch{return null;}
}

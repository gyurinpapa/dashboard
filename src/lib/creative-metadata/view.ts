import {identityForRow,record,safeImageUrl} from './contract';
import type {Asset,Metadata,Provider} from './contract';
export type Ref=Readonly<{provider:Provider;externalAccountId:string;entityId:string}>;
export type ViewEntry=Readonly<{ref:Ref;displayName:string|null;headlines:readonly string[];descriptions:readonly string[];assets:readonly Asset[];fetchedAt:string;expiresAt:number}>;
export type ViewRequest=Readonly<{provider:Provider;externalAccountId:string;entityIds:readonly string[]}>;
export function refKey(r:Ref):string{return JSON.stringify([r.provider,r.externalAccountId,r.entityId]);}
export function parseViewRequest(v:unknown):ViewRequest{
 const x=record(v);
 if(Object.keys(x).sort().join(',')!=='entityIds,externalAccountId,provider'||!['naver_searchad','google_ads'].includes(String(x.provider))||
  typeof x.externalAccountId!=='string'||!(x.provider==='google_ads'?/^\d{10}$/:/^\d{1,20}$/).test(x.externalAccountId)||
  !Array.isArray(x.entityIds)||x.entityIds.length<1||x.entityIds.length>20||new Set(x.entityIds).size!==x.entityIds.length||
  !x.entityIds.every(id=>typeof id==='string'&&(x.provider==='naver_searchad'?/^nad-[a-zA-Z0-9-]{1,100}$/:/^\d{1,20}$/).test(id)))throw Error('INVALID_REQUEST');
 return {provider:x.provider as Provider,externalAccountId:x.externalAccountId,entityIds:x.entityIds};
}
/** UI hints only. The server independently proves each ID belongs to the authorized snapshot. */
export function refForRow(value:unknown):Ref|null{
 const r=record(value);if(r.provider!=='naver_searchad'&&r.provider!=='google_ads'||typeof r.external_account_id!=='string')return null;
 const i=identityForRow({workspaceId:typeof r.workspace_id==='string'?r.workspace_id:'display-only',advertiserId:typeof r.advertiser_id==='string'?r.advertiser_id:'display-only',provider:r.provider,externalAccountId:r.external_account_id},r);
 return i?{provider:i.provider,externalAccountId:i.externalAccountId,entityId:i.entityId}:null;
}
export function publicEntry(m:Metadata,expiresAt:number):ViewEntry{
 return {ref:{provider:m.identity.provider,externalAccountId:m.identity.externalAccountId,entityId:m.identity.entityId},displayName:m.displayName,headlines:m.headlines,descriptions:m.descriptions,assets:m.assets,fetchedAt:m.fetchedAt,expiresAt};
}
export function validateViewEntry(value:unknown,expected:readonly Ref[],now:number):ViewEntry|null{
 const x=record(value),ref=record(x.ref);
 if(Object.keys(x).sort().join(',')!=='assets,descriptions,displayName,expiresAt,fetchedAt,headlines,ref'||
  Object.keys(ref).sort().join(',')!=='entityId,externalAccountId,provider')return null;
 const match=expected.find(r=>r.provider===ref.provider&&r.externalAccountId===ref.externalAccountId&&r.entityId===ref.entityId);
 if(!match||typeof x.expiresAt!=='number'||x.expiresAt<=now||x.expiresAt>now+21600000||typeof x.fetchedAt!=='string'||
  !Number.isFinite(Date.parse(x.fetchedAt))||Date.parse(x.fetchedAt)>now+60000||Date.parse(x.fetchedAt)+21600000<x.expiresAt||
  !(x.displayName===null||typeof x.displayName==='string'&&x.displayName.length<=4000)||
  ![x.headlines,x.descriptions].every(a=>Array.isArray(a)&&a.length<=100&&a.every(s=>typeof s==='string'&&s.length<=4000))||
  !Array.isArray(x.assets)||x.assets.length>100)return null;
 for(const value of x.assets){const a=record(value);
  if(Object.keys(a).sort().join(',')!=='assetId,expiresAt,imageUrl,kind,role,videoId,watchUrl'||typeof a.assetId!=='string'||a.assetId.length>256||
   !['main','logo','thumbnail','other'].includes(String(a.role))||!(a.expiresAt===null||typeof a.expiresAt==='string'&&Date.parse(a.expiresAt)>=x.expiresAt)||
   a.imageUrl!==null&&safeImageUrl(a.imageUrl,match.provider)!==a.imageUrl)return null;
  if(a.kind==='image'){if(!a.imageUrl||a.videoId!==null||a.watchUrl!==null)return null;}
  else if(a.kind==='youtube'){if(match.provider!=='google_ads'||typeof a.videoId!=='string'||!/^[\w-]{11}$/.test(a.videoId)||a.watchUrl!==`https://www.youtube.com/watch?v=${a.videoId}`)return null;}
  else return null;
 }
 return x as unknown as ViewEntry;
}
export type DisplayGroup=Readonly<{refs:readonly Ref[];unresolved:boolean}>;
export function groupReferences(rows:readonly unknown[],kind:'creative'|'detail'):Map<string,DisplayGroup>{
 const groups=new Map<string,{refs:Map<string,Ref>;unresolved:boolean}>();
 for(const value of rows){const r=record(value),name=String(kind==='creative'?(r.creative??''):(r.creativeName||r.creative||r.adCreative||r.material||r.asset||r.adName||r.creativeId||r.adId||'')).trim();
  if(!name)continue;const g=groups.get(name)??{refs:new Map<string,Ref>(),unresolved:false};const ref=refForRow(r);
  if(ref)g.refs.set(refKey(ref),ref);else g.unresolved=true;groups.set(name,g);
 }
 return new Map([...groups].map(([name,g])=>[name,{refs:[...g.refs.values()],unresolved:g.unresolved}]));
}

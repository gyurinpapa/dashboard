import {identityKey} from '../contract';
import type {Identity} from '../contract';
import {cacheKeys,readyMetadata} from '../cache/contract';
import {parseViewRequest,publicEntry} from '../view';
import type {ViewRequest,ViewEntry} from '../view';
import type {Binding} from './transport';
import {Session,fail} from './http';
export type ViewState=Readonly<{binding:Binding;ingestionId:string;stamp:string}>;
export type ViewPorts=Readonly<{
 snapshot:(signal:AbortSignal)=>Promise<ViewState>;
 identities:(state:ViewState,input:ViewRequest,signal:AbortSignal)=>Promise<readonly Identity[]>;
 read:(account:string,keys:readonly string[],signal:AbortSignal)=>Promise<unknown>;
}>;
/** Separate cache-only surface: no claim, finish, decrypt, OAuth or provider port exists. */
export async function readViewMetadata(raw:unknown,ports:ViewPorts,signal?:AbortSignal):Promise<{entries:readonly ViewEntry[];missing:number}>{
 const input=parseViewRequest(raw),session=new Session(1,5000,15000,signal);
 try{
  const state=await session.run(s=>ports.snapshot(s));
  if(state.binding.provider!==input.provider||state.binding.externalAccountId!==input.externalAccountId)fail('SCOPE_MISMATCH');
  const identities=await session.run(s=>ports.identities(state,input,s));
  if(identities.length>20||new Set(identities.map(identityKey)).size!==identities.length)fail('INVALID_CONTEXT');
  for(const i of identities)if(i.workspaceId!==state.binding.workspaceId||i.advertiserId!==state.binding.advertiserId||i.provider!==input.provider||i.externalAccountId!==input.externalAccountId||i.entityType!=='ad'||!input.entityIds.includes(i.entityId))fail('SCOPE_MISMATCH');
  const entries:ViewEntry[]=[];
  if(identities.length){
   const keys=await cacheKeys(state.binding,identities),rawEntries=await session.run(s=>ports.read(keys.accountKey,keys.keys,s));
   if(!Array.isArray(rawEntries)||rawEntries.length>identities.length)fail('INVALID_CONTEXT');
   const seen=new Set<string>();
   for(const e of rawEntries){const index=keys.keys.indexOf(e?.key);if(index<0||seen.has(e.key)||!Number.isFinite(e.expiresAt)||e.expiresAt<=Date.now()||e.expiresAt>Date.now()+21600000)fail('INVALID_CONTEXT');
    const m=readyMetadata(e.metadata,identities[index]!,Date.now());if(!m)fail('INVALID_CONTEXT');seen.add(e.key);
    const until=Math.min(e.expiresAt,Date.parse(m.fetchedAt)+21600000,...m.assets.map(a=>a.expiresAt?Date.parse(a.expiresAt):Infinity));
    if(until>Date.now())entries.push(publicEntry(m,until));
   }
  }
  const after=await session.run(s=>ports.snapshot(s));
  if(after.stamp!==state.stamp)fail('STALE_CONTEXT');
  const live=entries.filter(e=>e.expiresAt>Date.now());return {entries:live,missing:input.entityIds.length-live.length};
 }finally{session.close();}
}

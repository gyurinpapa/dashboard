import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createReadOnlyDatabasePorts} from './database';
import type {DatabaseDependencies,ReadQuery} from './database';
import {runServerMetadata} from './service';
import type {Ports,ServerInput,ServerResult} from './service';
import {fail} from './http';

/** Server-only binding. Optional IDs restrict an explicit metadata refresh. */
export function createSupabaseReader(client:Pick<SupabaseClient,'from'>,entityIds?:readonly string[]):DatabaseDependencies['read']{
 if(entityIds&&(!entityIds.length||entityIds.length>20||new Set(entityIds).size!==entityIds.length))fail('INVALID_INPUT');
 return async(query:ReadQuery,signal:AbortSignal)=>{
  if(signal.aborted)fail('ABORTED');
  if(query.table==='report_rows'&&entityIds){
   const rows:Record<string,unknown>[]=[];
   // One representative per requested ad prevents dated duplicates consuming the batch.
   for(const id of entityIds){
    let q=client.from(query.table).select(query.columns);
    for(const [key,value] of Object.entries(query.equals))q=q.eq(key,value);
    q=q.eq('row->>external_creative_id',id);
    if(query.order)q=q.order(query.order,{ascending:true});
    const {data,error}=await q.limit(1).abortSignal(signal);
    if(signal.aborted)fail('ABORTED');
    if(error||!Array.isArray(data))fail('DEPENDENCY_ERROR');
    rows.push(...data as unknown as Record<string,unknown>[]);
   }
   return rows.sort((a,b)=>Number(a.row_index)-Number(b.row_index));
  }
  let builder=client.from(query.table).select(query.columns);
  for(const [key,value] of Object.entries(query.equals))builder=builder.eq(key,value);
  if(query.order)builder=builder.order(query.order,{ascending:true});
  const {data,error}=await builder.limit(query.limit).abortSignal(signal);
  if(signal.aborted)fail('ABORTED');
  if(error||!Array.isArray(data))fail('DEPENDENCY_ERROR');
  return data;
 };
}

export function createExistingServerPorts(request:Request,entityIds?:readonly string[]):Ports{
 let loaded:Ports|undefined;
 async function ports(signal:AbortSignal):Promise<Ports>{
  if(signal.aborted)fail('ABORTED');
  if(loaded)return loaded;
  const [auth,db,naver,google,config,version]=await Promise.all([
   import('../../media-sync/media-connection-access'),import('../../supabase/admin'),
   import('../../media-sync/connection-credentials'),import('../../media-sync/google-ads-credentials'),
   import('../../media-sync/google-ads-oauth-config'),import('../../media-sync/google-ads-account-verification'),
  ]);
  if(signal.aborted)fail('ABORTED');
  if(version.GOOGLE_ADS_API_VERSION!=='v25')fail('INVALID_CONTEXT');
  loaded=createReadOnlyDatabasePorts(request,{
   authorize:auth.resolveReportMediaConnectionAccess,
   read:createSupabaseReader(db.supabaseAdmin,entityIds),
   googleConfig:()=>config.readGoogleAdsOAuthConfig(),
   decryptNaver:naver.decryptNaverSearchAdsCredentials,
   decryptGoogle:google.decryptGoogleAdsCredentials,
   fetch:(url,init)=>fetch(url,init),
  });
  return loaded;
 }
 // All dynamic imports, env-dependent clients and queries occur inside service deadline.
 return {
  authorize:async(id,signal)=>(await ports(signal)).authorize(id,signal),
  loadContext:async(access,id,signal)=>(await ports(signal)).loadContext(access,id,signal),
  revalidate:async(stamp,signal)=>(await ports(signal)).revalidate(stamp,signal),
  decrypt:async(binding,signal)=>(await ports(signal)).decrypt(binding,signal),
  fetch:(url,init)=>{if(!loaded)fail('ACCESS_DENIED');return loaded.fetch(url,init);},
 };
}

/** Kept for prior isolated tests. Future entrypoints must use the cached server wrapper. */
export async function runExistingServerMetadata(request:Request,input:ServerInput):Promise<ServerResult>{
 const enabled=typeof window==='undefined'&&input.enabled===true&&process.env.CREATIVE_METADATA_READ_ENABLED==='1';
 const signal=input.signal?AbortSignal.any([request.signal,input.signal]):request.signal;
 return runServerMetadata({...input,enabled,signal},createExistingServerPorts(request));
}

import 'server-only';
import {createExistingServerPorts} from './existing-server';
import {createSupabaseCacheStore} from './cache-store';
import {runCachedServerMetadata} from '../cache/coordinator';
import type {CachedResult} from '../cache/coordinator';
import type {CacheStore} from '../cache/contract';
import type {ServerInput} from './service';
import {fail} from './http';

/** Cached server entrypoint; both server flags default OFF. */
export async function runExistingCachedMetadata(request:Request,input:ServerInput,entityIds?:readonly string[]):Promise<CachedResult>{
 const enabled=typeof window==='undefined'&&input.enabled===true&&
  process.env.CREATIVE_METADATA_READ_ENABLED==='1'&&process.env.CREATIVE_METADATA_CACHE_ENABLED==='1';
 let loaded:CacheStore|undefined;
 async function cache(signal:AbortSignal){
  if(signal.aborted)fail('ABORTED');
  if(!loaded){const {supabaseAdmin}=await import('../../supabase/admin');if(signal.aborted)fail('ABORTED');loaded=createSupabaseCacheStore(supabaseAdmin);}
  return loaded;
 }
 const signal=input.signal?AbortSignal.any([request.signal,input.signal]):request.signal;
 return runCachedServerMetadata({...input,enabled,signal},createExistingServerPorts(request,entityIds),{
  claim:async(value,s)=>(await cache(s)).claim(value,s),
  finish:async(value,s)=>(await cache(s)).finish(value,s),
 });
}

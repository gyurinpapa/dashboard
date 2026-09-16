import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {CacheStore,Claim} from '../cache/contract';
import {fail} from './http';

/** Pass a trusted server client explicitly. Never imported by a route in this package. */
export function createSupabaseCacheStore(client:Pick<SupabaseClient,'rpc'>):CacheStore{
 return {
  async claim(input,signal){
   if(signal.aborted)fail('ABORTED');
   const {data,error}=await client.rpc('claim_creative_metadata_cache_v1',{
    p_account_key:input.accountKey,p_keys:[...input.keys],p_max_requests:input.maxRequests,
   }).abortSignal(signal);
   if(signal.aborted)fail('ABORTED');if(error||!data)fail('DEPENDENCY_ERROR');
   return data as Claim; // The coordinator validates every returned field and metadata envelope.
  },
  async finish(input,signal){
   if(signal.aborted)fail('ABORTED');
   const {data,error}=await client.rpc('finish_creative_metadata_cache_v1',{
    p_account_key:input.accountKey,p_token:input.token,p_entries:input.entries,p_outcome:input.outcome,
   }).abortSignal(signal);
   if(signal.aborted)fail('ABORTED');if(error||typeof data!=='boolean')fail('DEPENDENCY_ERROR');return data;
  },
 };
}

import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {fail,Session} from './http';

export type RetentionResult=Readonly<{
 scannedAccounts:number;skippedLockedAccounts:number;activeLeaseAccounts:number;
 deletedEntries:number;deletedAccounts:number;nextCursor:string|null;sweepComplete:boolean;
}>;
type Input=Readonly<{enabled?:boolean;afterAccountKey?:string|null;accountLimit?:number;entryLimit?:number;signal?:AbortSignal}>;
const key=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
/** Backend maintenance only. No route, cron or browser calls this candidate. One RPC, no automatic loop/retry. */
export async function runCreativeCacheMaintenance(input:Input,loadClient:()=>Promise<Pick<SupabaseClient,'rpc'>>):Promise<RetentionResult|{status:'disabled'}>{
 if(typeof window!=='undefined'||input.enabled!==true||process.env.CREATIVE_METADATA_CLEANUP_ENABLED!=='1')return {status:'disabled'};
 const after=input.afterAccountKey??null,accounts=input.accountLimit??50,entries=input.entryLimit??500;
 if(after!==null&&!key(after)||!integer(accounts,1,100)||!integer(entries,1,1000))fail('INVALID_INPUT');
 const session=new Session(1,5000,5000,input.signal);
 try{
  const client=await session.run(()=>loadClient());
  const {data,error}=await session.run(signal=>Promise.resolve(client.rpc('prune_creative_metadata_cache_v1',{
   p_after_account_key:after,p_account_limit:accounts,p_entry_limit:entries,
  }).abortSignal(signal)));
  if(error||!data||typeof data!=='object'||Array.isArray(data))fail('DEPENDENCY_ERROR');
  const d=data as Record<string,unknown>;
  const names=['scannedAccounts','skippedLockedAccounts','activeLeaseAccounts','deletedEntries','deletedAccounts','nextCursor','sweepComplete'];
  if(Object.keys(d).length!==names.length||!names.every(n=>Object.hasOwn(d,n))||
   !integer(d.scannedAccounts,0,accounts)||!integer(d.skippedLockedAccounts,0,accounts)||!integer(d.activeLeaseAccounts,0,accounts)||
   !integer(d.deletedEntries,0,entries)||!integer(d.deletedAccounts,0,accounts)||typeof d.sweepComplete!=='boolean'||
   d.skippedLockedAccounts+d.activeLeaseAccounts>d.scannedAccounts||d.deletedAccounts>d.scannedAccounts-d.skippedLockedAccounts-d.activeLeaseAccounts||
   d.deletedEntries>100*(d.scannedAccounts-d.skippedLockedAccounts-d.activeLeaseAccounts)||
   (d.sweepComplete?d.nextCursor!==null:!key(d.nextCursor)||d.scannedAccounts===0||(after!==null&&d.nextCursor<=after)))fail('DEPENDENCY_ERROR');
  return Object.freeze({...d}) as RetentionResult;
 }finally{session.close();}
}

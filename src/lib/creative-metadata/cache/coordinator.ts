import {id,identityForRow,identityKey} from '../contract';
import type {Metadata} from '../contract';
import {Session,Failure,fail} from '../server/http';
import type {Counts,ServerProblem} from '../server/http';
import {accessSnapshot,select,runServerMetadata} from '../server/service';
import type {Ports,ServerInput} from '../server/service';
import {cacheKeys,readyMetadata,TTL_MS} from './contract';
import type {CacheStore,Claim} from './contract';

export type CachedResult=Readonly<{status:'disabled'|'ready'|'partial'|'busy'|'cooldown'|'budget'|'rejected'|'no_targets';
 problem:ServerProblem|null;entries:readonly Metadata[];counts:Counts;cacheHits:number;pendingTargets:number;hasMore:boolean;retryAt:number|null;
 publication:Readonly<{ready:number;partial:number;notFound:number;unsupported:number;unavailable:number;invalidReady:number;noDisplayContent:number;imageUrlUnsupported:number;headlineInvalid:number;descriptionInvalid:number}>}>;
const zero:Counts={totalHttpRequests:0,oauthRequests:0,metadataRequests:0};
/** No waiting followers, polling loop, automatic retry, direct-provider fallback or performance writes. */
export async function runCachedServerMetadata(input:ServerInput,ports:Ports,store:CacheStore):Promise<CachedResult>{
 let session:Session|undefined,counts=zero,hasMore=false,cacheHits=0,pendingTargets=0;
 const publication={ready:0,partial:0,notFound:0,unsupported:0,unavailable:0,invalidReady:0,noDisplayContent:0,imageUrlUnsupported:0,headlineInvalid:0,descriptionInvalid:0};
 const validUntil=new Map<string,number>();
 const result=(status:CachedResult['status'],entries:readonly Metadata[]=[],problem:ServerProblem|null=null,retryAt:number|null=null):CachedResult=>{
  const now=Date.now();const valid=entries.filter(e=>(validUntil.get(identityKey(e.identity))??Infinity)>now&&readyMetadata(e,e.identity,now));
  const expired=entries.length-valid.length;
  return Object.freeze({status:status==='ready'&&expired?'partial':status,problem,entries:Object.freeze(valid),counts,cacheHits,
   pendingTargets:pendingTargets+expired,hasMore,retryAt,publication:Object.freeze({...publication})});
 };
 if(input.enabled!==true)return result('disabled');
 try{
  if(typeof window!=='undefined'||typeof input.reportId!=='string'||id(input.reportId)!==input.reportId||
   typeof input.connectionId!=='string'||id(input.connectionId)!==input.connectionId)fail('INVALID_INPUT');
  session=new Session(input.maxHttpRequests,input.requestTimeoutMs,input.totalTimeoutMs,input.signal);
  const access=accessSnapshot(await session.run(s=>ports.authorize(input.reportId,s)),input.reportId);
  const ctx=await session.run(s=>ports.loadContext(access,input.connectionId,s));
  const chosen=select(access,input.connectionId,ctx);hasMore=chosen.hasMore;
  if(!chosen.targets.length)return result('no_targets');
  const identities=chosen.targets.map(t=>t.identity),keyset=await session.run(()=>cacheKeys(chosen.binding,identities));
  // No cache data is returned on access failure, including cache hits and followers.
  if(!await session.run(s=>ports.revalidate(chosen.stamp,s)))fail('STALE_CONTEXT');
  const claim:Claim=await session.run(s=>store.claim({...keyset,maxRequests:input.maxHttpRequests},s));
  if(!claim||!['hit','leader','busy','cooldown','budget'].includes(claim.status)||!Number.isFinite(claim.now)||
   !Number.isFinite(claim.retryAt)||!Number.isFinite(claim.leaseUntil)||!Array.isArray(claim.entries)||claim.entries.length>20)fail('INVALID_CONTEXT');
  const expected=new Map(keyset.keys.map((k,n)=>[k,identities[n]!])),cached=new Map<string,Metadata>();
  for(const e of claim.entries){const identity=expected.get(e.key);
   if(!identity||cached.has(e.key)||!Number.isFinite(e.expiresAt)||e.expiresAt<=claim.now||e.expiresAt>claim.now+TTL_MS)fail('INVALID_CONTEXT');
   const metadata=readyMetadata(e.metadata,identity,Math.max(claim.now,Date.now()));if(!metadata)fail('INVALID_CONTEXT');cached.set(e.key,metadata);
   validUntil.set(identityKey(identity),e.expiresAt);
  }
  cacheHits=cached.size;const missing=keyset.keys.filter(k=>!cached.has(k));pendingTargets=missing.length;
  if((claim.status==='hit')!==(missing.length===0))fail('INVALID_CONTEXT');
  if(claim.status!=='leader'){
   if(claim.token!==null)fail('INVALID_CONTEXT');
   if(!await session.run(s=>ports.revalidate(chosen.stamp,s)))fail('STALE_CONTEXT');
   return result(claim.status==='hit'?'ready':claim.status,[...cached.values()],null,claim.retryAt||null);
  }
  if(typeof claim.token!=='string'||!/^[0-9a-f-]{36}$/.test(claim.token)||claim.leaseUntil-claim.now<45000)fail('INVALID_CONTEXT');
  const missingIdentities=new Set(missing.map(k=>identityKey(expected.get(k)!)));
  const rows=ctx.rows.filter(e=>{const identity=identityForRow(chosen.binding,e.row);return identity&&missingIdentities.has(identityKey(identity));});
  const remaining=session.remaining();if(remaining<10)fail('TIMEOUT');
  const fetched=await runServerMetadata({...input,signal:session.signal,totalTimeoutMs:remaining,requestTimeoutMs:Math.min(input.requestTimeoutMs,remaining)},
   {...ports,authorize:async()=>access,loadContext:async()=>({...ctx,rows})});
  counts=fetched.counts;
  session.assertLive();
  if(!await session.run(s=>ports.revalidate(chosen.stamp,s)))fail('STALE_CONTEXT');
  const accepted:{key:string;metadata:Metadata}[]=[];
  for(const entry of fetched.collection?.entries??[]){
   switch(entry.metadata.status){
    case 'ready':publication.ready++;break;
    case 'partial':publication.partial++;break;
    case 'not_found':publication.notFound++;break;
    case 'unsupported':publication.unsupported++;break;
    case 'unavailable':publication.unavailable++;break;
   }
   if(entry.metadata.issues.includes('NO_DISPLAY_CONTENT'))publication.noDisplayContent++;
   if(entry.metadata.issues.includes('IMAGE_URL_UNSUPPORTED'))publication.imageUrlUnsupported++;
   if(entry.metadata.issues.includes('HEADLINE_INVALID'))publication.headlineInvalid++;
   if(entry.metadata.issues.includes('DESCRIPTION_INVALID'))publication.descriptionInvalid++;
   const index=identities.findIndex(i=>identityKey(i)===identityKey(entry.identity));const key=keyset.keys[index];
   if(!key||!missing.includes(key)||accepted.some(e=>e.key===key))fail('INVALID_CONTEXT');
   if(entry.publishable){const metadata=readyMetadata(entry.metadata,expected.get(key)!,Date.now());if(metadata)accepted.push({key,metadata});else publication.invalidReady++;}
  }
  const complete=fetched.status==='completed'&&accepted.length===missing.length;
  const outcome=fetched.problem==='RATE_LIMITED'?'rate_limited':complete?'success':'failure';
  // A timeout/ambiguous finish leaves the bounded lease/reserved quota in place. Never release another owner.
  if(!await session.run(s=>store.finish({accountKey:keyset.accountKey,token:claim.token!,entries:accepted,outcome},s)))fail('STALE_CONTEXT');
  if(!await session.run(s=>ports.revalidate(chosen.stamp,s)))fail('STALE_CONTEXT');
  for(const e of accepted)cached.set(e.key,e.metadata);pendingTargets=identities.length-cached.size;
  return result(pendingTargets?'partial':'ready',keyset.keys.flatMap(k=>cached.has(k)?[cached.get(k)!]:[]),fetched.problem);
 }catch(e){return result('rejected',[],e instanceof Failure?e.code:'DEPENDENCY_ERROR');}
 finally{session?.close();}
}

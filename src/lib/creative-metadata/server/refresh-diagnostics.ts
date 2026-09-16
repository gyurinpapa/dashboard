import type {CachedResult} from '../cache/coordinator';

const statuses=new Set(['disabled','ready','partial','busy','cooldown','budget','rejected','no_targets']);
const problems=new Set(['INVALID_INPUT','SCOPE_MISMATCH','BUDGET_EXHAUSTED','TIMEOUT','ABORTED',
 'TRANSPORT_ERROR','AUTH_ERROR','RATE_LIMITED','PROVIDER_ERROR','INVALID_RESPONSE','RESPONSE_TOO_LARGE',
 'INCOMPLETE_RESPONSE','AMBIGUOUS_AD','ASSET_SCOPE_MISMATCH','ACCESS_DENIED','INVALID_CONTEXT',
 'STALE_CONTEXT','INVALID_CREDENTIALS','DEPENDENCY_ERROR','CLOSED','TOKEN_EXPIRED','REQUEST_NOT_ALLOWED']);
const stages=new Set(['input','authorize','context','keys','pre_claim_revalidation','cache_claim','provider_collection','post_fetch_revalidation','publication','cache_finish','final_revalidation']);
const count=(n:unknown,max:number):number|null=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=max?n:null;

/** Counts and fixed codes only. Never log identity, credentials, URLs, provider bodies or metadata text.
 * Counts are HTTP attempts in this invocation, not provider success counts or cache reservations. */
export function refreshDiagnostic(result:CachedResult){
 return {
  event:'creative_metadata_refresh_result_v1',
  status:statuses.has(result.status)?result.status:'unknown',
  problem:result.problem===null?null:problems.has(result.problem)?result.problem:'UNKNOWN',
  failureStage:result.failureStage==null?null:stages.has(result.failureStage)?result.failureStage:'unknown',
  httpAttempts:{total:count(result.counts?.totalHttpRequests,40),oauth:count(result.counts?.oauthRequests,40),metadata:count(result.counts?.metadataRequests,40)},
  cacheHits:count(result.cacheHits,20),pendingTargets:count(result.pendingTargets,40),
  publication:{ready:count(result.publication?.ready,20),partial:count(result.publication?.partial,20),
   notFound:count(result.publication?.notFound,20),unsupported:count(result.publication?.unsupported,20),
   unavailable:count(result.publication?.unavailable,20),invalidReady:count(result.publication?.invalidReady,20),
   noDisplayContent:count(result.publication?.noDisplayContent,20),imageUrlUnsupported:count(result.publication?.imageUrlUnsupported,20),
   headlineInvalid:count(result.publication?.headlineInvalid,20),descriptionInvalid:count(result.publication?.descriptionInvalid,20)},
 };
}

/** A diagnostic sink failure must not change the existing response or retry behavior. */
export function recordRefreshDiagnostic(result:CachedResult,sink:(line:string)=>void):void{
 try{sink(JSON.stringify(refreshDiagnostic(result)));}catch{/* best effort only */}
}

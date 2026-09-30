import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaConnectionReportAccessContext } from './media-connection-access';
import type { Scope } from './google-refresh-completion-controller';
import { createGoogleRefreshCompletionDependencies } from './google-refresh-completion-repository';
import type { CompletedJob, ContinuationDependencies } from './google-refresh-worker-continuation';

type Access = Pick<MediaConnectionReportAccessContext,'userId'|'reportId'|'workspaceId'|'advertiserId'|'canRunSync'|'accessScope'>;
export type RequestAuthority = (request: Request, reportId: string) => Promise<Access>;
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=()=>{throw new Error('GOOGLE_REFRESH_REQUEST_ACCESS_REJECTED');};
const record=(v:unknown):Record<string,unknown>=>{
  if(!v || typeof v!=='object' || Array.isArray(v))return fail();
  return v as Record<string,unknown>;
};

/** One request-scoped instance. No stored user ID is used as authenticated identity. */
export function createGoogleRefreshRequestContinuationDependencies(input: Readonly<{
  request: Request; job: CompletedJob; client: Pick<SupabaseClient,'from'|'rpc'>;
  resolveAccess: RequestAuthority;
}>): ContinuationDependencies {
  let initial:Access|null=null, scope:Scope|null=null, lookedUp=false;
  const checkedAccess=async()=>{
    const a=await input.resolveAccess(input.request,input.job.reportId);
    if(!a || a.canRunSync!==true || !['true_master','workspace','own_created'].includes(a.accessScope) ||
      a.reportId!==input.job.reportId || ![a.userId,a.reportId,a.workspaceId,a.advertiserId].every(uuid))return fail();
    return a;
  };
  const completion=createGoogleRefreshCompletionDependencies(async()=>{
    if(!initial || !scope)return fail();
    return {canRunSync:initial.canRunSync,actorId:initial.userId,reportId:initial.reportId,
      workspaceId:initial.workspaceId,advertiserId:initial.advertiserId};
  },async(name,args)=>{
    if(!initial || !scope)return fail();
    if(name==='step_google_refresh_revision'){
      // Recheck current authority just before mutation; never cache across events.
      const now=await checkedAccess();
      if(now.userId!==scope.actorId || now.workspaceId!==scope.workspaceId || now.advertiserId!==scope.advertiserId)return fail();
      const p=record(args.p_payload);
      if(p.request_id!==scope.requestId || p.report_id!==scope.reportId || p.workspace_id!==scope.workspaceId ||
        p.advertiser_id!==scope.advertiserId || p.actor_user_id!==scope.actorId ||
        !['prepare','batch','complete'].includes(String(p.action)))return fail();
    }else if(name==='read_google_refresh_completion'){
      const p=record(args.p_payload);
      if(Object.entries(scope).some(([key,value])=>p[key]!==value))return fail();
    }else return fail();
    const {data,error}=await input.client.rpc(name,args);
    return {data,error};
  });
  return {
    completion,
    findReservation:async job=>{
      if(lookedUp || !uuid(job.jobId) || !uuid(job.reportId) || job.jobId!==input.job.jobId || job.reportId!==input.job.reportId)return fail();
      lookedUp=true;
      initial=await checkedAccess();
      // Query by globally unique job_id. Do not filter away a conflicting report.
      const {data,error}=await input.client.from('google_ads_refresh_reservations')
        .select('request_id,job_id,report_id,workspace_id,advertiser_id,payload')
        .eq('job_id',job.jobId).maybeSingle();
      if(error)throw new Error('GOOGLE_REFRESH_RESERVATION_LOOKUP_FAILED');
      if(data===null)return null;
      const q=record(data),p=record(q.payload);
      const candidate={requestId:q.request_id,jobId:q.job_id,reportId:q.report_id,workspaceId:q.workspace_id,
        advertiserId:q.advertiser_id,connectionId:p.connection_id,accountId:p.external_account_id,date:p.date,actorId:p.actor_user_id};
      if(![candidate.requestId,candidate.jobId,candidate.reportId,candidate.workspaceId,candidate.advertiserId,candidate.connectionId,candidate.actorId].every(uuid) ||
        typeof candidate.accountId!=='string' || !/^\d{10}$/.test(candidate.accountId) || typeof candidate.date!=='string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date) || !Number.isFinite(Date.parse(candidate.date)) ||
        new Date(candidate.date).toISOString().slice(0,10)!==candidate.date ||
        candidate.jobId!==job.jobId || candidate.reportId!==initial.reportId || candidate.workspaceId!==initial.workspaceId ||
        candidate.advertiserId!==initial.advertiserId || candidate.actorId!==initial.userId)return fail();
      scope=candidate as Scope;
      return scope;
    },
  };
}

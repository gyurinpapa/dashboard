/** Offline controller only: no DB client, network, timer, queue, or daemon imports. */
export const GOOGLE_REFRESH_COMPLETION_RUNTIME_ENABLED = false;
export type Scope = Readonly<{
  requestId: string; jobId: string; reportId: string; workspaceId: string;
  advertiserId: string; connectionId: string; accountId: string; date: string; actorId: string;
}>;
export type Witness = Readonly<{
  scope: Scope;
  provider: string; executionContract: string; automationContract: string;
  jobStatus: 'pending' | 'processing' | 'done' | 'failed';
  reservation: 'reserved' | 'collected' | 'ready' | 'activated' | 'abandoned';
  baselineCurrent: string; baselinePublished: string | null;
  current: string; published: string | null;
  baselineMatches: boolean; participantsMatch: boolean; factsMatch: boolean;
  revision: null | Readonly<{
    id: string; ingestionId: string; status: 'prepared' | 'materializing' | 'ready' | 'activated';
    expectedRows: number; nextRow: number; fingerprint: string;
  }>;
}>;
export type Access = Readonly<{
  canRunSync: boolean; actorId: string; reportId: string; workspaceId: string; advertiserId: string;
}>;
export type Approval = Readonly<{
  scope: Scope; revisionId: string; fingerprint: string;
}>;
export type Step = Readonly<{
  request_id: string; report_id: string; workspace_id: string; advertiser_id: string;
  actor_user_id: string; action: 'prepare' | 'batch' | 'complete' | 'activate';
  batch_start?: number; batch_size?: number;
}>;
export type Dependencies = Readonly<{
  authorize(): Promise<Access>;
  // Must return one consistent server-side witness, never a client payload.
  read(scope: Scope): Promise<Witness | null>;
  // Production adapter must use the existing locked step_google_refresh_revision RPC.
  step(payload: Step): Promise<unknown>;
}>;
export type Result = Readonly<{
  action: 'disabled' | 'not_refresh' | 'wait_collection' | 'needs_review' | 'stopped' |
    'await_activation' | 'already_activated' | 'advanced';
  reason?: string; step?: Step['action']; responseLost?: boolean;
}>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const keys = ['requestId','jobId','reportId','workspaceId','advertiserId','connectionId','accountId','date','actorId'] as const;
function validScope(s: Scope): boolean {
  return !!s && keys.every(k => typeof s[k] === 'string') &&
    keys.filter(k => k !== 'accountId' && k !== 'date').every(k => uuid(s[k])) &&
    /^\d{10}$/.test(s.accountId) && /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    Number.isFinite(Date.parse(s.date)) && new Date(s.date).toISOString().slice(0,10) === s.date;
}
const sameScope = (a: Scope, b: Scope) => !!a && !!b && keys.every(k => a[k] === b[k]);
const review = (reason: string): Result => ({action:'needs_review',reason});
function validate(s: Scope, w: Witness): string | null {
  if (!sameScope(s,w.scope) || w.provider !== 'google_ads' || w.executionContract !== 'google_all_data_v1' || w.automationContract !== 'daily_report_v2') return 'scope_conflict';
  if (!['pending','processing','done','failed'].includes(w.jobStatus) || !['reserved','collected','ready','activated','abandoned'].includes(w.reservation)) return 'invalid_state';
  if (!uuid(w.baselineCurrent) || !uuid(w.current) || (w.published !== null && !uuid(w.published)) || (w.baselinePublished !== null && !uuid(w.baselinePublished))) return 'invalid_pointer';
  const r=w.revision;
  if (r && (!uuid(r.id) || !uuid(r.ingestionId) || !/^[a-f0-9]{64}$/.test(r.fingerprint) ||
    !Number.isSafeInteger(r.expectedRows) || !Number.isSafeInteger(r.nextRow) || r.nextRow<0 || r.expectedRows<r.nextRow ||
    !['prepared','materializing','ready','activated'].includes(r.status))) return 'invalid_checkpoint';
  if (w.reservation === 'abandoned') return null;
  if (w.published !== w.baselinePublished) return 'published_changed';
  if (w.reservation === 'activated') return w.jobStatus==='done' && r?.status==='activated' && r.nextRow===r.expectedRows && w.current===r.ingestionId ? null : 'activation_conflict';
  if (w.current !== w.baselineCurrent || w.baselineMatches !== true || w.participantsMatch !== true) return 'baseline_changed';
  if (w.jobStatus !== 'done') return null;
  if (w.factsMatch !== true) return 'facts_unconfirmed';
  if (w.reservation==='reserved' && r===null) return null;
  if (w.reservation==='collected' && r && ['prepared','materializing'].includes(r.status)) {
    return r.status==='prepared' && r.nextRow!==0 ? 'invalid_checkpoint' : null;
  }
  if (w.reservation==='ready' && r?.status==='ready' && r.nextRow===r.expectedRows) return null;
  return 'inconsistent_revision';
}

/** One mutation maximum; never requeues a job, retries collection, abandons or publishes. */
export async function runGoogleRefreshCompletion(input: Readonly<{
  enabled?: boolean; executionApproved?: boolean; scope: Scope;
  intent: 'advance' | 'activate'; activationApproval?: Approval;
  dependencies: Dependencies;
}>): Promise<Result> {
  if (input.enabled!==true || input.executionApproved!==true) return {action:'disabled'};
  const {scope:s,dependencies:d}=input;
  if (!validScope(s) || !['advance','activate'].includes(input.intent)) return review('invalid_input');
  let a: Access;
  try { a=await d.authorize(); } catch { return review('access_unavailable'); }
  if (!a || a.canRunSync!==true || a.actorId!==s.actorId || a.reportId!==s.reportId || a.workspaceId!==s.workspaceId || a.advertiserId!==s.advertiserId) return review('access_denied');
  let w: Witness | null;
  try { w=await d.read(s); } catch { return review('state_unavailable'); }
  if (w===null) return {action:'not_refresh'};
  let conflict: string | null;
  try { conflict=validate(s,w); } catch { return review('invalid_witness'); }
  if (conflict) return review(conflict);
  if (w.reservation==='abandoned') return {action:'stopped'};
  if (w.reservation==='activated') return {action:'already_activated'};
  if (w.jobStatus==='failed') return review('failed_job_requires_review');
  if (w.jobStatus!=='done') return {action:'wait_collection'};
  const r=w.revision;
  let action: Step['action'];
  if (input.intent==='activate') {
    if (w.reservation!=='ready' || !r) return review('not_ready');
    const approval=input.activationApproval;
    if (!approval || !sameScope(approval.scope,s) || approval.revisionId!==r.id || approval.fingerprint!==r.fingerprint) return {action:'await_activation'};
    if (r.expectedRows===0) return review('empty_snapshot_requires_review');
    action='activate';
  } else {
    if (w.reservation==='ready') return {action:'await_activation'};
    action=r===null?'prepare':r.nextRow===r.expectedRows?'complete':'batch';
  }
  const payload: Step={request_id:s.requestId,report_id:s.reportId,workspace_id:s.workspaceId,
    advertiser_id:s.advertiserId,actor_user_id:s.actorId,action,
    ...(action==='batch'?{batch_start:r!.nextRow,batch_size:2000}:{})};
  let responseLost=false;
  try { await d.step(payload); } catch { responseLost=true; }
  // An RPC return value or exception alone never proves whether a commit happened.
  let after: Witness | null;
  try { after=await d.read(s); } catch { return review('outcome_unknown'); }
  if (!after) return review('reservation_disappeared');
  try { conflict=validate(s,after); } catch { return review('invalid_witness'); }
  if (conflict) return review(conflict);
  if (after.jobStatus!=='done' || after.baselineCurrent!==w.baselineCurrent || after.baselinePublished!==w.baselinePublished) return review('concurrent_state_change');
  const next=after.revision;
  if (r && (!next || next.id!==r.id || next.ingestionId!==r.ingestionId || next.expectedRows!==r.expectedRows || next.fingerprint!==r.fingerprint)) return review('revision_changed');
  const confirmed=action==='prepare'?after.reservation==='collected' && next!==null:
    action==='batch'?after.reservation==='collected' && next!==null && next.nextRow===Math.min(r!.nextRow+2000,r!.expectedRows):
    action==='complete'?after.reservation==='ready':after.reservation==='activated';
  if (!confirmed) return review('step_not_confirmed');
  return {action:'advanced',step:action,responseLost};
}

/** No production caller is wired; this entry remains disabled regardless of supplied flags. */
export function runDisabledGoogleRefreshCompletion(input: Parameters<typeof runGoogleRefreshCompletion>[0]) {
  return runGoogleRefreshCompletion({...input,enabled:GOOGLE_REFRESH_COMPLETION_RUNTIME_ENABLED});
}

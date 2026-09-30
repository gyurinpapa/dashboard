import { runGoogleRefreshCompletion, type Dependencies, type Result, type Scope } from './google-refresh-completion-controller';

// No environment variable can enable this branch. Completion lookup is read-only.
export const GOOGLE_REFRESH_WORKER_CONTINUATION_ENABLED = false;
export const GOOGLE_REFRESH_WORKER_CONTINUATION_APPROVED = false;
export type CompletedJob = Readonly<{ jobId: string; reportId: string }>;
export type ContinuationDependencies = Readonly<{
  // Server-owned lookup by jobId. Errors must throw; null means confirmed absence.
  findReservation(job: CompletedJob): Promise<Scope | null>;
  completion: Dependencies;
}>;
export type ContinuationDecision =
  | Readonly<{ route: 'daily' }>
  | Readonly<{ route: 'refresh'; result: Result }>;

/** One bounded advance only. No activation, loop, retry, requeue or permission impersonation. */
export async function routeGoogleRefreshWorkerContinuation(input: Readonly<{
  enabled?: boolean; executionApproved?: boolean; job: CompletedJob; dependencies?: ContinuationDependencies;
}>): Promise<ContinuationDecision> {
  if (input.enabled !== true) return { route: 'daily' };
  const blocked = (reason: string): ContinuationDecision => ({route:'refresh',result:{action:'needs_review',reason}});
  if (input.executionApproved !== true) return blocked('execution_not_approved');
  const d=input.dependencies;
  if (!d) return blocked('runtime_dependencies_unavailable');
  let scope: Scope | null;
  try { scope=await d.findReservation(input.job); }
  catch { return blocked('reservation_lookup_failed'); }
  if (scope === null) return {route:'daily'};
  if (!scope || scope.jobId!==input.job.jobId || scope.reportId!==input.job.reportId) return blocked('reservation_scope_conflict');
  try {
    const result=await runGoogleRefreshCompletion({enabled:true,executionApproved:true,
      scope,intent:'advance',dependencies:d.completion});
    // A reservation seen by the lookup must never disappear into the daily branch.
    if (result.action==='not_refresh' || result.action==='disabled') return blocked('reservation_state_changed');
    return {route:'refresh',result};
  } catch { return blocked('completion_unavailable'); }
}

/** Used by the daemon; forced off and no live adapters instantiated. */
export async function routeDisabledGoogleRefreshWorkerContinuation(job: CompletedJob) {
  if (!GOOGLE_REFRESH_WORKER_CONTINUATION_ENABLED) return { route: 'daily' } as const;
  const { routeCompletedGoogleRefreshJob } = await import('./google-refresh-completed-job-routing');
  if (!GOOGLE_REFRESH_WORKER_CONTINUATION_APPROVED) return { route: 'refresh', result: { action: 'needs_review', reason: 'execution_not_approved' } } as const;
  const { getSupabaseAdmin } = await import('../supabase/admin');
  return routeCompletedGoogleRefreshJob({ enabled: true, executionApproved: true, job, createClient: getSupabaseAdmin });
}

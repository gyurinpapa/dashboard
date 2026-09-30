import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompletedJob } from './google-refresh-worker-continuation';

export type CompletedRefreshDecision =
  | { route: 'daily' }
  | { route: 'refresh'; result: { action: 'await_delegated_resume' | 'await_activation' | 'already_activated' | 'stopped' | 'needs_review'; reason?: string } };
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/** Read-only completion boundary. Delegated resume owns all revision writes.
 * Never turn the stored actor into a login, issue a grant or activate/publish here.
 */
export async function routeCompletedGoogleRefreshJob(input: {
  enabled: boolean; executionApproved: boolean; job: CompletedJob;
  createClient: () => Pick<SupabaseClient, 'from'>;
}): Promise<CompletedRefreshDecision> {
  if (!input.enabled) return { route: 'daily' };
  const review = (reason: string): CompletedRefreshDecision => ({ route: 'refresh', result: { action: 'needs_review', reason } });
  if (!input.executionApproved) return review('execution_not_approved');
  if (!uuid(input.job.jobId) || !uuid(input.job.reportId)) return review('invalid_completed_job');
  try {
    const { data: q, error } = await input.createClient().from('google_ads_refresh_reservations')
      .select('request_id,job_id,report_id,state').eq('job_id', input.job.jobId).maybeSingle();
    if (error) return review('reservation_lookup_failed');
    // Query by job ID only: a conflicting report must not look like an absent reservation.
    if (q === null) return { route: 'daily' };
    if (!q || !uuid(q.request_id) || q.job_id !== input.job.jobId || q.report_id !== input.job.reportId)
      return review('reservation_scope_conflict');
    switch (q.state) {
      case 'reserved':
      case 'collected': return { route: 'refresh', result: { action: 'await_delegated_resume' } };
      case 'ready': return { route: 'refresh', result: { action: 'await_activation' } };
      case 'activated': return { route: 'refresh', result: { action: 'already_activated' } };
      case 'abandoned': return { route: 'refresh', result: { action: 'stopped' } };
      default: return review('reservation_state_invalid');
    }
  } catch { return review('reservation_lookup_failed'); }
}

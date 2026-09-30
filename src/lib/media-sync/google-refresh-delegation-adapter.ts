import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestAuthority } from './google-refresh-request-continuation';
import { createGoogleRefreshRequestContinuationDependencies } from './google-refresh-request-continuation';
import type { CompletedJob } from './google-refresh-worker-continuation';

type Client = Pick<SupabaseClient, 'from' | 'rpc'>;
export type DelegationCommand = Readonly<{
  job: CompletedJob; requestId: string; generation: string;
}>;
export type DelegationEvent = DelegationCommand & Readonly<{ stepIndex: number }>;
type State = 'ready' | 'paused' | 'expired' | 'revoked';
export type DelegationResult =
  | Readonly<{ action: 'disabled' }>
  | Readonly<{ action: 'needs_review'; reason: string }>
  | Readonly<{ action: 'issued'; generation: string; replayed: boolean }>
  | Readonly<{ action: 'revocation_checked'; generation: string; state: State }>
  | Readonly<{ action: 'stopped'; generation: string; state: State }>
  | Readonly<{ action: 'await_activation'; generation: string }>
  | Readonly<{ action: 'advanced'; generation: string; step: 'prepare' | 'batch' | 'complete'; nextStepIndex: number; replayed: boolean }>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const review = (reason: string): DelegationResult => ({ action: 'needs_review', reason });
function valid(c: DelegationCommand) {
  return !!c && !!c.job && [c.job.jobId, c.job.reportId, c.requestId, c.generation].every(uuid);
}
async function lookup(c: DelegationCommand, client: Client) {
  const { data, error } = await client.from('google_ads_refresh_reservations')
    .select('request_id,job_id,report_id,workspace_id,advertiser_id,payload').eq('job_id', c.job.jobId).maybeSingle();
  if (error) throw new Error('lookup_failed');
  const q = object(data), p = object(q?.payload);
  if (!q || !p || q.request_id !== c.requestId || q.job_id !== c.job.jobId || q.report_id !== c.job.reportId ||
      ![q.workspace_id, q.advertiser_id, p.actor_user_id].every(uuid)) throw new Error('scope_rejected');
  return p.actor_user_id as string;
}
async function manage(client: Client, c: DelegationCommand, actor: string, action: 'issue' | 'revoke' | 'step', stepIndex?: number): Promise<DelegationResult> {
  const payload = { action, request_id: c.requestId, report_id: c.job.reportId, generation: c.generation, actor_user_id: actor,
    ...(action === 'step' ? { step_index: stepIndex } : {}) };
  // A failed/lost response is ambiguous. Never issue another generation, advance an index,
  // fall back to daily, or retry here. The exact command can be reviewed/replayed later.
  const { data, error } = await client.rpc('manage_google_refresh_worker_delegation', { p_payload: payload });
  if (error) return review('rpc_outcome_unconfirmed');
  const r = object(data);
  if (!r || r.generation !== c.generation) return review('invalid_rpc_result');
  if (r.action === 'stopped' && action !== 'revoke' && ['ready', 'paused', 'expired', 'revoked'].includes(String(r.state)))
    return { action: 'stopped', generation: c.generation, state: r.state as State };
  if (action === 'issue' && r.action === 'issued' && typeof r.replayed === 'boolean')
    return { action: 'issued', generation: c.generation, replayed: r.replayed };
  if (action === 'revoke' && r.action === 'revocation_checked' && ['ready', 'paused', 'expired', 'revoked'].includes(String(r.state)))
    return { action: 'revocation_checked', generation: c.generation, state: r.state as State };
  if (action === 'step' && r.action === 'await_activation') return { action: 'await_activation', generation: c.generation };
  if (action === 'step' && r.action === 'advanced' && ['prepare', 'batch', 'complete'].includes(String(r.step)) &&
      r.step_index === stepIndex && r.next_step_index === stepIndex! + 1 && typeof r.replayed === 'boolean')
    return { action: 'advanced', generation: c.generation, step: r.step as 'prepare' | 'batch' | 'complete', nextStepIndex: r.next_step_index as number, replayed: r.replayed };
  return review('invalid_rpc_result');
}

/** Internal server adapter. Authentication callbacks must validate the actual request. */
export async function manageGoogleRefreshDelegationRequest(input: Readonly<{
  enabled: boolean; executionApproved: boolean; action: 'issue' | 'revoke'; command: DelegationCommand;
  request: Request; client: Client; resolveAccess: RequestAuthority;
  authenticate: (request: Request) => Promise<{ id: string; is_anonymous?: boolean }>;
}>): Promise<DelegationResult> {
  if (!input.enabled) return { action: 'disabled' };
  if (!input.executionApproved) return review('execution_not_approved');
  if (!valid(input.command) || !['issue', 'revoke'].includes(input.action)) return review('invalid_command');
  try {
    let actor: string;
    if (input.action === 'issue') {
      const d = createGoogleRefreshRequestContinuationDependencies({ request: input.request, job: input.command.job,
        client: input.client, resolveAccess: input.resolveAccess });
      const scope = await d.findReservation(input.command.job);
      if (!scope || scope.requestId !== input.command.requestId) return review('scope_rejected');
      actor = scope.actorId;
    } else {
      // Losing run_sync must not prevent the original, still authenticated actor revoking.
      const user = await input.authenticate(input.request);
      if (!user || !uuid(user.id) || user.is_anonymous === true) return review('identity_rejected');
      actor = await lookup(input.command, input.client);
      if (actor !== user.id) return review('identity_rejected');
    }
    return await manage(input.client, input.command, actor, input.action);
  } catch { return review('request_outcome_unconfirmed'); }
}

/** Trusted worker event only. Stored actor identifies the SQL grant; it is NOT a login. */
export async function advanceGoogleRefreshDelegation(input: Readonly<{
  enabled: boolean; executionApproved: boolean; event: DelegationEvent; client: Client;
}>): Promise<DelegationResult> {
  if (!input.enabled) return { action: 'disabled' };
  if (!input.executionApproved) return review('execution_not_approved');
  if (!valid(input.event) || !Number.isSafeInteger(input.event.stepIndex) || input.event.stepIndex < 0 || input.event.stepIndex >= Number.MAX_SAFE_INTEGER)
    return review('invalid_event');
  try {
    const actor = await lookup(input.event, input.client);
    return await manage(input.client, input.event, actor, 'step', input.event.stepIndex);
  } catch { return review('worker_outcome_unconfirmed'); }
}

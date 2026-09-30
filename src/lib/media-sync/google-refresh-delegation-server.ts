import { advanceGoogleRefreshDelegation, manageGoogleRefreshDelegationRequest,
  type DelegationCommand, type DelegationEvent, type DelegationResult } from './google-refresh-delegation-adapter';

// No environment toggle. The HTTP entry remains disabled by these literal gates.
export const GOOGLE_REFRESH_DELEGATION_RUNTIME_ENABLED = false;
export const GOOGLE_REFRESH_DELEGATION_EXECUTION_APPROVED = false;

export async function manageGoogleRefreshDelegationForRequest(input: Readonly<{
  request: Request; action: 'issue' | 'revoke'; command: DelegationCommand;
}>): Promise<DelegationResult> {
  if (!GOOGLE_REFRESH_DELEGATION_RUNTIME_ENABLED || !GOOGLE_REFRESH_DELEGATION_EXECUTION_APPROVED) return { action: 'disabled' };
  const { resolveReportMediaConnectionAccess, authenticateMediaConnectionRequest } = await import('./media-connection-access');
  const { getSupabaseAdmin } = await import('../supabase/admin');
  return manageGoogleRefreshDelegationRequest({ ...input, enabled: true, executionApproved: true, client: getSupabaseAdmin(),
    resolveAccess: (request, reportId) => resolveReportMediaConnectionAccess({ request, reportId, action: 'run_sync' }),
    authenticate: authenticateMediaConnectionRequest });
}

export async function advanceGoogleRefreshDelegationForWorker(event: DelegationEvent): Promise<DelegationResult> {
  if (!GOOGLE_REFRESH_DELEGATION_RUNTIME_ENABLED || !GOOGLE_REFRESH_DELEGATION_EXECUTION_APPROVED) return { action: 'disabled' };
  const { getSupabaseAdmin } = await import('../supabase/admin');
  return advanceGoogleRefreshDelegation({ enabled: true, executionApproved: true, event, client: getSupabaseAdmin() });
}

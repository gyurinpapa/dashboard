import { handleGoogleRefreshDelegationHttp } from '@/src/lib/media-sync/google-refresh-delegation-http';
import {
  GOOGLE_REFRESH_DELEGATION_RUNTIME_ENABLED,
  GOOGLE_REFRESH_DELEGATION_EXECUTION_APPROVED,
  manageGoogleRefreshDelegationForRequest,
} from '@/src/lib/media-sync/google-refresh-delegation-server';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleGoogleRefreshDelegationHttp({ request, reportId: (await context.params).id,
    enabled: GOOGLE_REFRESH_DELEGATION_RUNTIME_ENABLED && GOOGLE_REFRESH_DELEGATION_EXECUTION_APPROVED,
    manage: manageGoogleRefreshDelegationForRequest });
}

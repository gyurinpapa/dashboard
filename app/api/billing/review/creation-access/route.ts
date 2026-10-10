import { actor } from '@/lib/billing/review/server';
import { appTargets } from '@/lib/billing/review/app-targets';
import { BillingError, uuid } from '@/lib/billing/review/config';
import { failure, json } from '@/lib/billing/review/http';
import { creationGateEnabled, reportCreationAccess } from '@/lib/billing/review/creation-gate';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    if (!creationGateEnabled()) throw new BillingError('NOT_AVAILABLE', 404);
    const userId = await actor();
    const params = new URL(request.url).searchParams;
    const advertiserId = params.get('advertiser');
    const workspaceId = params.get('workspace');
    if (!uuid(advertiserId) || !uuid(workspaceId)) throw new BillingError('INVALID_TARGET');
    const targets = await appTargets(userId);
    if (!targets.advertiser.some(a => a.id === advertiserId && a.workspace_id === workspaceId))
      throw new BillingError('TARGET_NOT_ALLOWED', 403);
    return json(await reportCreationAccess(advertiserId, workspaceId));
  } catch (error) { return failure(error); }
}

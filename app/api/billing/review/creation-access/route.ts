import { actor } from '@/lib/billing/review/server';
import { appTargets } from '@/lib/billing/review/app-targets';
import { BillingError, uuid } from '@/lib/billing/review/config';
import { failure, json } from '@/lib/billing/review/http';
import { creationGateEnabled, reportCreationAccess } from '@/lib/billing/review/creation-gate';
import { productionReviewRequested } from '@/lib/billing/review/app-rollout';
import { sbAuth } from '@/lib/supabase/auth-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    if (!creationGateEnabled()) throw new BillingError('NOT_AVAILABLE', 404);
    let userId: string;
    if (productionReviewRequested()) {
      const { user, error } = await sbAuth();
      if (error || !user) throw new BillingError('LOGIN_REQUIRED', 401);
      userId = user.id;
    } else userId = await actor();
    const params = new URL(request.url).searchParams;
    const advertiserId = params.get('advertiser');
    const workspaceId = params.get('workspace');
    if (!uuid(advertiserId) || !uuid(workspaceId)) throw new BillingError('INVALID_TARGET');
    const targets = await appTargets(userId);
    if (!targets.advertiser.some(a => a.id === advertiserId && a.workspace_id === workspaceId))
      throw new BillingError('TARGET_NOT_ALLOWED', 403);
    return json(await reportCreationAccess(advertiserId, workspaceId,
      targets.advertiser.find(a => a.id === advertiserId)?.billing_review_managed));
  } catch (error) { return failure(error); }
}

import { createClient } from '@supabase/supabase-js';
import { BillingError, reviewConfig } from './config';

// This rollout cannot enforce payment in the production app or another Preview.
export function creationGateEnabled(env: Record<string, string | undefined> = process.env) {
  const origin = 'https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';
  return env.VERCEL_ENV === 'preview' &&
    env.NEXT_PUBLIC_SUPABASE_URL === 'https://lpwmxtnzpgyrhphwufsd.supabase.co' &&
    env.CUSTOMER_ONBOARDING_DATABASE_URL === env.NEXT_PUBLIC_SUPABASE_URL &&
    env.CUSTOMER_ONBOARDING_ENABLED === 'true' &&
    env.CUSTOMER_ONBOARDING_ORIGIN === origin && env.BILLING_REVIEW_ORIGIN === origin;
}
export type CreationAccess = { managed: boolean; eligible: boolean; paidUntil: string | null };
const unrestricted: CreationAccess = { managed: false, eligible: true, paidUntil: null };

// Call only after the caller has verified advertiser/workspace access.
export async function reportCreationAccess(advertiserId: string | null, workspaceId: string): Promise<CreationAccess> {
  if (!creationGateEnabled() || !advertiserId) return unrestricted;
  const config = reviewConfig();
  const client = createClient(config.dbUrl, config.dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const draft = await client.from('billing_test_purchase_drafts')
    .select('tenant_id').eq('target_id', advertiserId).eq('workspace_id', workspaceId).maybeSingle();
  if (draft.error) throw new BillingError('ENTITLEMENT_LOOKUP_FAILED', 503);
  // Existing/manual advertisers retain their previous behavior.
  if (!draft.data) return unrestricted;
  const scopes = [
    `and(scope.eq.advertiser,target_id.eq.${advertiserId},workspace_id.eq.${workspaceId})`,
    `and(scope.eq.workspace,target_id.eq.${workspaceId},workspace_id.eq.${workspaceId})`,
  ];
  if (draft.data.tenant_id) scopes.push(`and(scope.eq.company,target_id.eq.${draft.data.tenant_id},tenant_id.eq.${draft.data.tenant_id})`);
  const order = await client.from('billing_test_orders').select('paid_until')
    .eq('status', 'active').gt('paid_until', new Date().toISOString()).or(scopes.join(','))
    .order('paid_until', { ascending: false }).limit(1).maybeSingle();
  if (order.error) throw new BillingError('ENTITLEMENT_LOOKUP_FAILED', 503);
  return { managed: true, eligible: !!order.data, paidUntil: order.data?.paid_until ?? null };
}

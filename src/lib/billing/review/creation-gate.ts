import { createClient } from '@supabase/supabase-js';
import { BillingError, reviewConfig } from './config';
import { appReadDb } from './app-targets';
import { isolatedReviewEnabled, productionReviewRequested, reviewAppContext } from './app-rollout';
import { registrationEnabled, REGISTRATION_CATALOG } from './registration-config';
import { registrationAccess } from './registration-store';

// Production remains disabled until the explicit, reviewed rollout opt-in.
export function creationGateEnabled(env: Record<string, string | undefined> = process.env) {
  return isolatedReviewEnabled(env) || productionReviewRequested(env);
}
export type CreationAccess = { managed: boolean; eligible: boolean; paidUntil: string | null };
const unrestricted: CreationAccess = { managed: false, eligible: true, paidUntil: null };

// Call only after the caller has verified advertiser/workspace access.
export async function reportCreationAccess(advertiserId: string | null, workspaceId: string, verifiedManaged?: boolean): Promise<CreationAccess> {
  if (!creationGateEnabled()) return unrestricted;
  if (!advertiserId) return { managed: true, eligible: false, paidUntil: null };
  if(registrationEnabled()){
    const rows=await registrationAccess([advertiserId]), row=rows[0];
    if(row){
      if(row.workspace_id!==workspaceId)return {managed:true,eligible:false,paidUntil:null};
      const config=reviewConfig(), client=createClient(config.dbUrl,config.dbKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const scopes=[`and(scope.eq.advertiser,target_id.eq.${advertiserId},workspace_id.eq.${workspaceId})`,
        `and(scope.eq.workspace,target_id.eq.${workspaceId},workspace_id.eq.${workspaceId})`,
        `and(scope.eq.company,target_id.eq.${row.tenant_id},tenant_id.eq.${row.tenant_id})`,
        `and(id.eq.${row.order_id},catalog_version.eq.${REGISTRATION_CATALOG},target_id.eq.${advertiserId})`];
      const orders=await client.from('billing_test_orders').select('id,catalog_version,paid_until').eq('status','active').or(scopes.join(','));
      if(orders.error)throw new BillingError('ENTITLEMENT_LOOKUP_FAILED',503);
      const now=Date.now();
      const ends=(orders.data||[]).map(o=>o.catalog_version===REGISTRATION_CATALOG
        ? o.id===row.order_id&&row.payment_status==='verified'&&row.started_at&&Date.parse(row.started_at)<=now?row.paid_until:null
        :o.paid_until).filter((end):end is string=>!!end&&Date.parse(end)>now);
      const paidUntil=ends.reduce<string|null>((end,value)=>!end||Date.parse(value)>Date.parse(end)?value:end,null);
      return {managed:true,eligible:!!paidUntil,paidUntil};
    }
  }
  // New-version advertisers must not fall into the legacy Preview "manual" path
  // if the test feature is later switched off. Missing legacy marker columns are
  // tolerated only in old isolated fixtures, where new materialization is impossible.
  if(!registrationEnabled()&&isolatedReviewEnabled()){
    const marker=await appReadDb().from('advertisers').select('billing_review_managed').eq('id',advertiserId).eq('workspace_id',workspaceId).maybeSingle();
    if(marker.error&&marker.error.code!=='42703')throw new BillingError('ENTITLEMENT_LOOKUP_FAILED',503);
    if(marker.data?.billing_review_managed===true)return {managed:true,eligible:false,paidUntil:null};
  }
  const production = productionReviewRequested();
  if (production) {
    // Only accept this optional hint from an already-authorized server DB row.
    let managed = verifiedManaged;
    if (managed === undefined) {
      const ad = await appReadDb().from('advertisers').select('billing_review_managed')
        .eq('id', advertiserId).eq('workspace_id', workspaceId).maybeSingle();
      if (ad.error || !ad.data) throw new BillingError('ENTITLEMENT_LOOKUP_FAILED', 503);
      managed = ad.data.billing_review_managed === true;
    }
    // Existing/manual advertisers never depend on payment database availability.
    if (!managed) return unrestricted;
  }
  const context = reviewAppContext();
  const config = reviewConfig();
  const client = createClient(config.dbUrl, config.dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let draftQuery = client.from('billing_test_purchase_drafts')
    .select('tenant_id').eq('target_id', advertiserId).eq('workspace_id', workspaceId);
  if (production) draftQuery = draftQuery.eq('app_project', context.project);
  const draft = await draftQuery.maybeSingle();
  if (draft.error) throw new BillingError('ENTITLEMENT_LOOKUP_FAILED', 503);
  // Existing/manual advertisers retain their previous behavior.
  if (!draft.data) return production ? { managed: true, eligible: false, paidUntil: null } : unrestricted;
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

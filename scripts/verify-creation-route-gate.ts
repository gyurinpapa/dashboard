import assert from 'node:assert/strict';

// Execute the actual POST handler; intercept every outbound request before import.
// No credentials, live Auth calls, database writes, or provider requests are used.
const production = process.argv.includes('--production');
const origin = production ? 'https://app.etrylue.com' : 'https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';
const appDb = production ? 'https://rulcvpgvmmckacshkmfy.supabase.co' : 'https://lpwmxtnzpgyrhphwufsd.supabase.co';
const paymentDb = 'https://kbqyszbuxojofugqfjbh.supabase.co';
const ad = '11111111-1111-4111-a111-111111111111';
const ws = '22222222-2222-4222-a222-222222222222';
const tenant = '33333333-3333-4333-a333-333333333333';
const user = '44444444-4444-4444-a444-444444444444';
Object.assign(process.env, {
  VERCEL_ENV: production ? 'production' : 'preview', BILLING_REVIEW_APP_ROLLOUT: production ? 'production-test-v1' : '', NEXT_PUBLIC_SUPABASE_URL: appDb,
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
  CUSTOMER_ONBOARDING_DATABASE_URL: appDb, CUSTOMER_ONBOARDING_ENABLED: 'true',
  CUSTOMER_ONBOARDING_ORIGIN: origin, BILLING_REVIEW_ORIGIN: origin,
  BILLING_REVIEW_ENABLED: 'true', BILLING_REVIEW_SUPABASE_URL: paymentDb,
  BILLING_REVIEW_SERVICE_ROLE_KEY: 'synthetic-key', BILLING_REVIEW_USER_IDS: user,
  BILLING_REVIEW_STATE_SECRET: 'x'.repeat(32),
});
type Scenario = 'refunded' | 'expired' | 'active' | 'lookup-failed' | 'foreign-workspace' | 'client' | 'legacy';
let scenario: Scenario = 'refunded';
let simulatedWrites = 0;
let billingReads = 0;
const unexpected: string[] = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const method = init?.method ?? 'GET';
  if (url.origin === appDb && url.pathname === '/auth/v1/user') {
    return Response.json({ id: user, email: 'synthetic@example.invalid' });
  }
  if (url.origin === appDb && url.pathname === '/rest/v1/advertisers' && method === 'GET') {
    return Response.json({ id: ad, workspace_id: ws, created_by: user, public_slug: null, billing_review_managed: scenario !== 'legacy' });
  }
  if (url.origin === appDb && url.pathname === '/rest/v1/workspace_members' && method === 'GET') {
    return Response.json(scenario === 'foreign-workspace' ? null : { workspace_id: ws, role: scenario === 'client' ? 'client' : 'admin' });
  }
  if (url.origin === paymentDb && method === 'GET') {
    billingReads++;
    if (scenario === 'lookup-failed') return Response.json({ message: 'synthetic failure' }, { status: 400 });
    if (url.pathname === '/rest/v1/billing_test_purchase_drafts') {
      assert.equal(url.searchParams.get('target_id'), `eq.${ad}`);
      assert.equal(url.searchParams.get('workspace_id'), `eq.${ws}`);
      if(production) assert.equal(url.searchParams.get('app_project'), 'eq.rulcvpgvmmckacshkmfy');
      return Response.json(scenario === 'legacy' ? null : { tenant_id: tenant });
    }
    if (url.pathname === '/rest/v1/billing_test_orders') {
      assert.equal(url.searchParams.get('status'), 'eq.active');
      const cutoff = url.searchParams.get('paid_until')!;
      assert.ok(cutoff.startsWith('gt.'));
      const row = { status: scenario === 'refunded' ? 'refunded' : 'active', paid_until: scenario === 'expired' ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z' };
      return Response.json(row.status === 'active' && Date.parse(row.paid_until) > Date.parse(cutoff.slice(3)) ? { paid_until: row.paid_until } : null);
    }
  }
  if (url.origin === appDb && url.pathname === '/rest/v1/reports' && method === 'POST') {
    simulatedWrites++;
    return Response.json({ id: 'synthetic-report' });
  }
  unexpected.push(`${method} ${url.origin}${url.pathname}`);
  throw new Error('Unexpected outbound request blocked');
};

async function main() {
  const { POST } = await import('../app/api/reports/create/route');
  for (const value of ['refunded', 'expired', 'lookup-failed', 'foreign-workspace', 'client', 'active', 'legacy'] as const) {
    scenario = value;
    simulatedWrites = 0;
    billingReads = 0;
    const response = await POST(new Request(`${origin}/api/reports/create`, {
      method: 'POST', headers: { authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: ws, advertiser_id: ad, billing_review_managed: false, report_type_id: 'synthetic-type', period_start: '2026-10-01', period_end: '2026-10-02', meta: { data_source: { kind: 'csv' } } }),
    }));
    const result = await response.json();
    const allowed = value === 'active' || value === 'legacy';
    assert.equal(response.status, allowed ? 200 : value === 'lookup-failed' ? 503 : 403, JSON.stringify(result));
    assert.equal(simulatedWrites, allowed ? 1 : 0, value);
    if (value === 'refunded' || value === 'expired') assert.equal(result.error, 'ENTITLEMENT_REQUIRED');
    if (value === 'lookup-failed') assert.equal(result.error, 'ENTITLEMENT_LOOKUP_FAILED');
    if (value === 'foreign-workspace' || value === 'client' || (production && value === 'legacy')) assert.equal(billingReads, 0);
    assert.deepEqual(unexpected, []);
    console.log(`PASS ${value}: HTTP ${response.status}, simulated writes=${simulatedWrites}`);
  }
  for (const value of ['refunded', 'expired', 'lookup-failed'] as const) {
    scenario = value;
    simulatedWrites = 0;
    const response = await POST(new Request(`${origin}/api/reports/create`, {
      method: 'POST', headers: { authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: ws, advertiser_id: ad, billing_review_managed: false, report_type_id: 'synthetic-type', connection_id: '55555555-5555-4555-a555-555555555555', meta: { data_source: { kind: 'api' } } }),
    }));
    const result = await response.json();
    assert.equal(response.status, value === 'lookup-failed' ? 503 : 403, JSON.stringify(result));
    assert.equal(result.error, value === 'lookup-failed' ? 'ENTITLEMENT_LOOKUP_FAILED' : 'ENTITLEMENT_REQUIRED');
    assert.equal(simulatedWrites, 0);
    assert.deepEqual(unexpected, []); // Includes any unexpected synchronization RPC.
    console.log(`PASS API ${value}: HTTP ${response.status}, no write/synchronization request`);
  }
  console.log('Actual POST handler tested; all network requests intercepted; live calls/writes=0. Deployed authenticated request remains a separate verification.');
}
void main();

import assert from 'node:assert/strict';
import { productionReviewRequested, reviewAppContext } from '../src/lib/billing/review/app-rollout';
import { creationGateEnabled, reportCreationAccess } from '../src/lib/billing/review/creation-gate';
import { providerKeys } from '../src/lib/billing/review/config';

const base = {
  VERCEL_ENV: 'production', BILLING_REVIEW_APP_ROLLOUT: 'production-test-v1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://rulcvpgvmmckacshkmfy.supabase.co',
  CUSTOMER_ONBOARDING_DATABASE_URL: 'https://rulcvpgvmmckacshkmfy.supabase.co',
  CUSTOMER_ONBOARDING_ENABLED: 'true', CUSTOMER_ONBOARDING_ORIGIN: 'https://app.etrylue.com',
  BILLING_REVIEW_ORIGIN: 'https://app.etrylue.com', BILLING_REVIEW_ENABLED: 'true',
  BILLING_REVIEW_SUPABASE_URL: 'https://kbqyszbuxojofugqfjbh.supabase.co',
  BILLING_REVIEW_SERVICE_ROLE_KEY: 'synthetic', BILLING_REVIEW_STATE_SECRET: 'x'.repeat(32),
  BILLING_REVIEW_USER_IDS: '11111111-1111-4111-a111-111111111111',
};
assert.equal(creationGateEnabled({ ...base, BILLING_REVIEW_APP_ROLLOUT: '' }), false);
assert.equal(productionReviewRequested({ ...base, VERCEL_ENV: 'preview' }), false);
assert.equal(reviewAppContext(base).production, true);
for (const override of [{NEXT_PUBLIC_SUPABASE_URL:'https://lpwmxtnzpgyrhphwufsd.supabase.co'},
  {CUSTOMER_ONBOARDING_DATABASE_URL:'https://other.supabase.co'}, {BILLING_REVIEW_ORIGIN:'https://evil.example'},
  {CUSTOMER_ONBOARDING_ORIGIN:'https://www.etrylue.com'}, {BILLING_REVIEW_ENABLED:'false'}]) {
  assert.throws(() => reviewAppContext({...base,...override}), /APP_ROLLOUT_UNAVAILABLE/);
}
assert.throws(() => providerKeys('once', {...base,BILLING_REVIEW_TOSS_CLIENT_KEY:'live_ck_synthetic',BILLING_REVIEW_TOSS_SECRET_KEY:'live_sk_synthetic'}), /REVIEW_TEST_KEYS_REQUIRED/);
assert.throws(() => providerKeys('monthly', base), /MONTHLY_NOT_AVAILABLE/);

async function main() {
  Object.assign(process.env,base);
  let calls=0, missingDraft=false;
  globalThis.fetch=async(input,init)=>{
    calls++;
    const url=new URL(String(input));
    assert.equal(init?.method,'GET');
    assert.equal(url.origin,base.BILLING_REVIEW_SUPABASE_URL);
    if(missingDraft) {
      assert.ok(url.pathname.endsWith('/billing_test_purchase_drafts'));
      assert.equal(url.searchParams.get('app_project'),'eq.rulcvpgvmmckacshkmfy');
      return Response.json(null);
    }
    throw new Error('Simulated payment database outage');
  };
  assert.equal((await reportCreationAccess('ad','workspace',false)).eligible,true);
  assert.equal(calls,0,'Legacy creation must not touch payment storage');
  await assert.rejects(()=>reportCreationAccess('ad','workspace',true),/ENTITLEMENT_LOOKUP_FAILED/);
  missingDraft=true;
  assert.deepEqual(await reportCreationAccess('ad','workspace',true),{managed:true,eligible:false,paidUntil:null});
  // Pausing signups must not remove enforcement from already-managed advertisers.
  process.env.CUSTOMER_ONBOARDING_ENABLED='false';
  assert.equal(creationGateEnabled(),true);
  assert.equal((await reportCreationAccess('ad','workspace',true)).eligible,false);
  console.log('PASS production opt-in, exact DB/origin, no live keys/monthly, legacy outage isolation, managed fail-closed, source-bound drafts, signup pause preserves gate; live calls=0');
}
void main();

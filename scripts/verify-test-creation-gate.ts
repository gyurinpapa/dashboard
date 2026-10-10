import assert from 'node:assert/strict';
import { creationGateEnabled, reportCreationAccess } from '../src/lib/billing/review/creation-gate';
const origin='https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';
const env={VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://lpwmxtnzpgyrhphwufsd.supabase.co',CUSTOMER_ONBOARDING_DATABASE_URL:'https://lpwmxtnzpgyrhphwufsd.supabase.co',CUSTOMER_ONBOARDING_ENABLED:'true',CUSTOMER_ONBOARDING_ORIGIN:origin,BILLING_REVIEW_ORIGIN:origin};
Object.assign(process.env,env,{BILLING_REVIEW_ENABLED:'true',BILLING_REVIEW_SUPABASE_URL:'https://kbqyszbuxojofugqfjbh.supabase.co',BILLING_REVIEW_SERVICE_ROLE_KEY:'synthetic-test-key',BILLING_REVIEW_USER_IDS:'11111111-1111-4111-a111-111111111111',BILLING_REVIEW_STATE_SECRET:'x'.repeat(32)});
const ad='11111111-1111-4111-a111-111111111111',ws='22222222-2222-4222-a222-222222222222',tenant='33333333-3333-4333-a333-333333333333';
let managed=true,active=false,fail=false,calls=0;
globalThis.fetch=async(input,init)=>{
 calls++; const url=new URL(String(input));
 assert.equal(url.origin,'https://kbqyszbuxojofugqfjbh.supabase.co');
 assert.equal(init?.method,'GET');
 if(fail)return new Response(JSON.stringify({message:'synthetic storage failure'}),{status:500});
 if(url.pathname.endsWith('/billing_test_purchase_drafts')){
  assert.equal(url.searchParams.get('target_id'),`eq.${ad}`);assert.equal(url.searchParams.get('workspace_id'),`eq.${ws}`);
  return Response.json(managed?{tenant_id:tenant}:null);
 }
 assert.ok(url.pathname.endsWith('/billing_test_orders'));
 assert.equal(url.searchParams.get('status'),'eq.active');
 assert.ok(url.searchParams.get('paid_until')?.startsWith('gt.'));
 assert.equal(url.searchParams.get('limit'),'1');
 const scopes=url.searchParams.get('or')!;
 assert.ok(scopes.includes(`scope.eq.advertiser,target_id.eq.${ad},workspace_id.eq.${ws}`));
 assert.ok(scopes.includes(`scope.eq.workspace,target_id.eq.${ws},workspace_id.eq.${ws}`));
 assert.ok(scopes.includes(`scope.eq.company,target_id.eq.${tenant},tenant_id.eq.${tenant}`));
 return Response.json(active?{paid_until:'2099-01-01T00:00:00Z'}:null);
};
async function main(){
 assert.equal(creationGateEnabled(),true);
 for(const overrides of [{VERCEL_ENV:'production'},{NEXT_PUBLIC_SUPABASE_URL:'https://rulcvpgvmmckacshkmfy.supabase.co'},{CUSTOMER_ONBOARDING_ORIGIN:'https://other.vercel.app'},{CUSTOMER_ONBOARDING_ENABLED:'false'}])assert.equal(creationGateEnabled({...env,...overrides}),false);
 process.env.VERCEL_ENV='production';assert.equal((await reportCreationAccess(ad,ws)).eligible,true);assert.equal(calls,0);process.env.VERCEL_ENV='preview';
 assert.equal((await reportCreationAccess(null,ws)).eligible,true);assert.equal(calls,0);
 managed=false;assert.deepEqual(await reportCreationAccess(ad,ws),{managed:false,eligible:true,paidUntil:null});assert.equal(calls,1);
 managed=true;assert.deepEqual(await reportCreationAccess(ad,ws),{managed:true,eligible:false,paidUntil:null});
 active=true;assert.equal((await reportCreationAccess(ad,ws)).eligible,true);
 fail=true;await assert.rejects(()=>reportCreationAccess(ad,ws),/ENTITLEMENT_LOOKUP_FAILED/);
 console.log('PASS: production isolation, existing advertisers, refunded/expired denial, scoped alternative coverage, storage failure, read-only requests; live calls=0');
}
void main();

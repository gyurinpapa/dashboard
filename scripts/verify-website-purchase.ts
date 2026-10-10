import assert from 'node:assert/strict';
import {safeNext,purchaseNext} from '../src/lib/customer-journey';
import {registrationInput,registrationAttributes} from '../src/lib/customer-onboarding/contract';
import {draftTarget,advertiserName,assertNewAdvertiserTest} from '../src/lib/billing/review/new-advertiser';
for(const bad of ['https://evil.test','//evil.test','/\\evil.test','/%2fexample.test','/%5cevil.test','/\n/evil.test','/api/billing/review/manage','/%zz'])assert.equal(safeNext(bad),'/account',bad);
assert.equal(safeNext('/invite/example?token=abc'),'/invite/example?token=abc');
assert.equal(purchaseNext('/billing/checkout?scope=advertiser&mode=monthly&amount=1'),'/billing/checkout?scope=advertiser&mode=once');
assert.equal(purchaseNext('/reports/foo'),'/account');
const input=registrationInput({email:'TEST@example.test',password:'test-only-password',companyName:'company',contactName:'test',tenantType:'agency',next:'/billing/checkout?scope=workspace&mode=once'});
assert.equal(registrationAttributes(input).app_metadata.purchase_next,'/billing/checkout?scope=workspace&mode=once');
assert.equal(draftTarget('user','order','x'.repeat(32)),draftTarget('user','order','x'.repeat(32)));
assert.notEqual(draftTarget('user','order','x'.repeat(32)),draftTarget('other','order','x'.repeat(32)));
assert.match(draftTarget('user','order','x'.repeat(32)),/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/);
assert.throws(()=>advertiserName(''));assert.throws(()=>advertiserName('x'.repeat(101)));assert.equal(advertiserName(' Company '),'Company');
Object.assign(process.env,{VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://rulcvpgvmmckacshkmfy.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic',CUSTOMER_ONBOARDING_ENABLED:'true'});
assert.throws(()=>assertNewAdvertiserTest(),/NEW_ADVERTISER_TEST_ONLY/);
console.log('PASS: redirect attacks blocked; invite return preserved; purchase retained; draft IDs stable and user-bound; invalid names denied; production provisioning blocked; live calls=0');
async function verifyProvisionBoundary(){
 const {newAdvertiserContext,createVerifiedTestAdvertiser}=await import('../src/lib/billing/review/new-advertiser');
 const origin='https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';
 Object.assign(process.env,{VERCEL_ENV:'preview',CUSTOMER_ONBOARDING_ORIGIN:origin,BILLING_REVIEW_ORIGIN:origin,CUSTOMER_ONBOARDING_DATABASE_URL:'https://lpwmxtnzpgyrhphwufsd.supabase.co',NEXT_PUBLIC_SUPABASE_URL:'https://lpwmxtnzpgyrhphwufsd.supabase.co'});
 let inserts=0,role='admin';const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assert.equal(url.origin,'https://lpwmxtnzpgyrhphwufsd.supabase.co');
  const table=url.pathname.split('/').at(-1);let data:unknown=[];
  if(init?.method==='POST'){assert.equal(table,'advertisers');inserts++;data=null;}
  else if(table==='profiles')data={email:'synthetic@example.test'};
  else if(table==='workspace_members')data=[{workspace_id:'own',role}];
  else if(table==='workspaces')data=[{id:'own',name:'own workspace',tenant_id:'tenant'}];
  else if(table==='advertisers'&&url.searchParams.has('id'))data={id:'derived',workspace_id:'own',created_by:'user',name:'New'};
  return new Response(data===null?'':JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try {
  await assert.rejects(()=>newAdvertiserContext('user','other'),/TARGET_NOT_ALLOWED/);assert.equal(inserts,0);
  role='client';await assert.rejects(()=>newAdvertiserContext('user','own'),/TARGET_NOT_ALLOWED/);assert.equal(inserts,0);
  role='admin';await createVerifiedTestAdvertiser({target_id:'derived',user_id:'user',workspace_id:'own',name:'New'});assert.equal(inserts,1);
 }finally{globalThis.fetch=original;}
 console.log('PASS: cross-workspace and client-role creation denied before writes; permitted test creation verified; network mocked');
}
verifyProvisionBoundary().catch(e=>{console.error(e);process.exitCode=1;});

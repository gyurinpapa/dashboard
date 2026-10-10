import assert from 'node:assert/strict';
import { assertAppDatabase, appReadDb } from '../src/lib/billing/review/app-targets';
const origin='https://dashboard-git-feat-customer-onboard-9ef6cd-gyurinpapas-projects.vercel.app';
const testUrl='https://lpwmxtnzpgyrhphwufsd.supabase.co';
const base={VERCEL_ENV:'preview',CUSTOMER_ONBOARDING_ENABLED:'true',CUSTOMER_ONBOARDING_ORIGIN:origin,BILLING_REVIEW_ORIGIN:origin,CUSTOMER_ONBOARDING_DATABASE_URL:testUrl,NEXT_PUBLIC_SUPABASE_URL:testUrl,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
async function main(){
 Object.assign(process.env,base);
 assert.equal(assertAppDatabase(),testUrl);
 for(const change of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{CUSTOMER_ONBOARDING_ENABLED:'false'},{CUSTOMER_ONBOARDING_ORIGIN:'https://other.vercel.app'},{BILLING_REVIEW_ORIGIN:'https://app.etrylue.com'},{CUSTOMER_ONBOARDING_DATABASE_URL:'https://other.supabase.co'},{NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'}]){
  Object.assign(process.env,base,change);assert.throws(()=>assertAppDatabase(),/APP_DATABASE_REQUIRED/);
 }
 Object.assign(process.env,base,{VERCEL_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://rulcvpgvmmckacshkmfy.supabase.co'});
 assert.equal(assertAppDatabase(),'https://rulcvpgvmmckacshkmfy.supabase.co');
 Object.assign(process.env,base);
 let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{calls++;assert.equal(new URL(String(input)).origin,testUrl);return new Response('[]',{headers:{'Content-Type':'application/json'}});};
 try {
  assert.equal((await appReadDb().from('advertisers').select('id')).error,null);
  assert.equal(calls,1);
  for(const q of [appReadDb().from('advertisers').insert({name:'blocked'}),appReadDb().from('advertisers').update({name:'blocked'}).eq('id','synthetic'),appReadDb().rpc('blocked'),appReadDb().from('reports').select('*')]){
   const result=await q;assert.ok(result.error);assert.equal(calls,1);
  }
 }finally{globalThis.fetch=original;}
 console.log('PASS: exact Preview allowed; 7 unsafe configurations denied; production unchanged; test reads routed correctly; writes/RPC/report reads blocked; live network=0');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
